/**
 * Runs the setup assistant (roadmap N8). Mounted once by App.tsx for a signed-in user. It reads the account's real data
 * (profile, price book, saved design and tax defaults, crew), works out the progress (lib/setup/steps.ts), publishes it
 * for the dashboard hint and the Settings row (lib/setup/store.ts), and opens the sheet:
 *   - once, by itself, for a brand-new account on the dashboard (after the first-run tour, never on top of another dialog),
 *   - whenever asked (Resume setup).
 * It never blocks anything: closing the sheet or ignoring it changes nothing.
 */
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile } from '../../types.ts';
import type { PaymentSettings } from '../../lib/payments.ts';
import { crewAvailable, computeProgress, shouldAutoOpen, startScreen, type SetupFacts, type WizardScreen } from '../../lib/setup/steps.ts';
import {
    dismissSetup, emptySetupState, markSheetShown, normalizeSetupState, restartSetup, resumeSetup, type SetupState,
} from '../../lib/setup/state.ts';
import { emptyExample, exampleRoom, hasExample, type ExampleTracking, type ExampleUsage } from '../../lib/setup/example.ts';
import { SETUP_HIDE_EVENT, SETUP_OPEN_EVENT, SETUP_REMOVE_EVENT, TOUR_CLOSED_EVENT, publishSetup, resetSetupSnapshot } from '../../lib/setup/store.ts';
import { loadSetupStateRaw, saveSetupStateRaw, loadAppTourSeen } from '../../lib/userData.ts';
import { loadMoneyDefaults } from '../../lib/setup/moneyStore.ts';
import { currentDesignDefault, loadDesignDefault } from '../../lib/designDefaults.ts';
import { countCrewMembers, countPriceBook, createExampleProject, loadExample, removeExampleProject, type ExampleDeps } from './setupApi.ts';
import { toast } from '../Toast.tsx';
import { errorText } from '../../lib/offline/connection.ts';

const SetupSheet = lazy(() => import('./SetupSheet.tsx'));

const otherDialogOpen = () => !!document.querySelector('[role="dialog"][aria-modal="true"]');

export interface SetupHostProps {
    userId: string;
    onDashboard: boolean;
    profile: UserProfile | null;
    plan: string;
    isOnline: boolean;
    crewFeature: 'ready' | 'missing' | 'unknown';
    /** jobs and documents have been loaded (the account is not judged "new" before that) */
    dataReady: boolean;
    counts: { jobs: number; clients: number; documents: number };
    usage: ExampleUsage;
    t: Record<string, string>;
    saveProfile: (updated: UserProfile, logoFile?: File | null, profilePicFile?: File | null, extras?: { paymentSettings?: PaymentSettings | null }) => Promise<unknown> | void;
    patchProfile: (patch: Partial<UserProfile>) => void;
    navigate: (path: string) => void;
    createJob: ExampleDeps['createJob'];
    /** reload jobs / clients / documents / usage after the example was added or removed (removed documents are dropped from the lists at once) */
    onDataChanged: (change?: { removedDocumentIds?: string[] }) => void;
    openUpgrade: (reason?: string) => void;
}

interface Extras { priceBookCount: number | null; designChosen: boolean; moneySaved: boolean; crewCount: number | null }

const SetupHost: React.FC<SetupHostProps> = (props) => {
    const { userId, profile, plan, isOnline, crewFeature } = props;
    const [state, setState] = useState<SetupState>(emptySetupState());
    const [stateLoaded, setStateLoaded] = useState(false);
    const [example, setExample] = useState<ExampleTracking>(emptyExample());
    const [extras, setExtras] = useState<Extras | null>(null);
    const [open, setOpen] = useState<{ start: WizardScreen; key: number } | null>(null);
    const [tourClear, setTourClear] = useState(false);
    const stateRef = useRef(state);
    stateRef.current = state;
    const propsRef = useRef(props);
    propsRef.current = props;
    const autoDone = useRef<string | null>(null);

    // what the wizard remembers + the example's ids: once per user
    useEffect(() => {
        let live = true;
        setStateLoaded(false);
        (async () => {
            const [raw, ex] = await Promise.all([loadSetupStateRaw().catch(() => null), loadExample()]);
            if (!live) return;
            const loaded = normalizeSetupState(raw);
            stateRef.current = loaded;
            setState(loaded);
            setExample(ex);
            setStateLoaded(true);
        })();
        return () => { live = false; };
    }, [userId]);
    useEffect(() => () => resetSetupSnapshot(), []);

    // the account's own data behind each step
    const crewOk = crewAvailable({ plan, crewFeature });
    const loadExtras = useCallback(async () => {
        const [priceBookCount, designChosen, money, crewCount] = await Promise.all([
            countPriceBook(),
            loadDesignDefault().then(d => !!d).catch(() => !!currentDesignDefault()),
            loadMoneyDefaults().then(d => !!d).catch(() => false),
            crewOk ? countCrewMembers() : Promise.resolve(null),
        ]);
        setExtras(prev => ({
            priceBookCount: priceBookCount ?? prev?.priceBookCount ?? null,
            designChosen, moneySaved: money,
            crewCount: crewCount ?? prev?.crewCount ?? null,
        }));
    }, [crewOk]);
    useEffect(() => { void loadExtras(); }, [loadExtras, userId]);
    useEffect(() => { if (isOnline) void loadExtras(); }, [isOnline, loadExtras]);
    // back online: what was kept on this device while offline (the wizard's memory) goes up to the account
    useEffect(() => { if (isOnline && stateLoaded) void loadSetupStateRaw().catch(() => null); }, [isOnline, stateLoaded]);

    const facts: SetupFacts | null = useMemo(() => (profile && extras && props.dataReady ? {
        profile: {
            name: profile.name, companyName: profile.companyName, logoUrl: profile.logoUrl, phone: profile.phone, email: profile.email,
            address: profile.address, website: profile.website, defaultLaborRate: profile.defaultLaborRate ?? null,
            payLinkDefault: profile.payLinkDefault, googleReviewLink: profile.googleReviewLink, paymentSettingsUnavailable: profile.paymentSettingsUnavailable,
        },
        priceBookCount: extras.priceBookCount, designChosen: extras.designChosen, moneySaved: extras.moneySaved, crewCount: extras.crewCount,
        jobsCount: props.counts.jobs, clientsCount: props.counts.clients, documentsCount: props.counts.documents,
        plan, crewFeature,
    } : null), [profile, extras, props.dataReady, props.counts.jobs, props.counts.clients, props.counts.documents, plan, crewFeature]);

    const progress = useMemo(() => (facts && stateLoaded ? computeProgress(facts, state) : null), [facts, state, stateLoaded]);
    useEffect(() => { publishSetup({ loaded: !!progress, progress, state, example }); }, [progress, state, example]);

    const updateState = useCallback((change: (s: SetupState) => SetupState) => {
        const next = change(stateRef.current);
        if (next === stateRef.current) return;
        stateRef.current = next;
        setState(next);
        void saveSetupStateRaw(next); // device copy now; the account when reachable (kept and retried offline)
    }, []);

    const openSheet = useCallback((restart: boolean) => {
        if (!progress || !facts) return;
        updateState(s => (restart ? restartSetup(s) : resumeSetup(s)));
        setOpen({ start: startScreen(computeProgress(facts, stateRef.current), stateRef.current), key: Date.now() });
    }, [progress, facts, updateState]);

    // "Resume setup" from the dashboard hint / Settings
    useEffect(() => {
        const onOpen = (e: Event) => openSheet(!!(e as CustomEvent<{ restart?: boolean }>).detail?.restart);
        window.addEventListener(SETUP_OPEN_EVENT, onOpen);
        return () => window.removeEventListener(SETUP_OPEN_EVENT, onOpen);
    }, [openSheet]);

    useEffect(() => {
        const onHide = () => updateState(s => dismissSetup(s));
        window.addEventListener(SETUP_HIDE_EVENT, onHide);
        return () => window.removeEventListener(SETUP_HIDE_EVENT, onHide);
    }, [updateState]);

    // the first-run tour goes first on a new account: the sheet waits for it to finish
    useEffect(() => {
        let live = true;
        let off: (() => void) | null = null;
        loadAppTourSeen(userId).then((seen) => {
            if (!live) return;
            if (seen === false) {
                const onClosed = () => setTourClear(true);
                window.addEventListener(TOUR_CLOSED_EVENT, onClosed, { once: true });
                off = () => window.removeEventListener(TOUR_CLOSED_EVENT, onClosed);
            } else setTourClear(true);
        }).catch(() => { if (live) setTourClear(true); });
        return () => { live = false; off?.(); };
    }, [userId]);

    // a brand-new account sees the sheet once, on the dashboard, when nothing else is open
    useEffect(() => {
        if (!progress || !tourClear || open || !props.onDashboard || autoDone.current === userId) return;
        if (!shouldAutoOpen(progress, state, { jobsCount: props.counts.jobs, clientsCount: props.counts.clients, documentsCount: props.counts.documents })) return;
        let tries = 0;
        let timer = 0;
        const attempt = () => {
            if (!otherDialogOpen()) {
                autoDone.current = userId;
                updateState(markSheetShown);
                setOpen({ start: startScreen(progress, stateRef.current), key: Date.now() });
                return;
            }
            if (++tries < 40) timer = window.setTimeout(attempt, 750);
        };
        timer = window.setTimeout(attempt, 900);
        return () => window.clearTimeout(timer);
    }, [progress, tourClear, open, props.onDashboard, props.counts.jobs, props.counts.clients, props.counts.documents, state, userId, updateState]);

    const closeSheet = useCallback(() => { updateState(markSheetShown); setOpen(null); void loadExtras(); }, [updateState, loadExtras]);

    // ---- example project
    const addExample = async (): Promise<string> => {
        const p = propsRef.current;
        if (!p.profile) throw new Error('Your profile is still loading. Try again in a moment.');
        const room = exampleRoom(p.usage);
        if (!room.ok) throw new Error(room.reason);
        const tracked = await createExampleProject({ userId, profile: p.profile, createJob: p.createJob });
        setExample(tracked);
        p.onDataChanged();
        return 'Example project added: a sample client, job and draft estimate. Remove them any time with one tap.';
    };
    const removeExample = async (): Promise<string> => {
        const r = await removeExampleProject(example, userId);
        setExample(emptyExample());
        propsRef.current.onDataChanged({ removedDocumentIds: example.documentIds });
        return r.removed ? `Example data removed.${r.kept ? ` ${r.kept}` : ''}` : 'There was no example data to remove.';
    };
    const exampleRef = useRef(example);
    exampleRef.current = example;
    useEffect(() => {
        const onRemove = () => {
            if (!hasExample(exampleRef.current)) return;
            const tracked = exampleRef.current;
            removeExampleProject(tracked, userId)
                .then(r => { setExample(emptyExample()); propsRef.current.onDataChanged({ removedDocumentIds: tracked.documentIds }); toast.success(`Example data removed.${r.kept ? ` ${r.kept}` : ''}`); })
                .catch(err => toast.error(errorText(err, 'The example data could not be removed.')));
        };
        window.addEventListener(SETUP_REMOVE_EVENT, onRemove);
        return () => window.removeEventListener(SETUP_REMOVE_EVENT, onRemove);
    }, [userId]);

    if (!open || !progress || !profile) return null;
    return (
        <Suspense fallback={null}>
            <SetupSheet
                key={open.key}
                userId={userId}
                profile={profile}
                plan={plan}
                isOnline={isOnline}
                progress={progress}
                state={state}
                example={example}
                t={props.t}
                start={open.start}
                updateState={updateState}
                saveProfile={async (updated, logoFile, extra) => { await props.saveProfile(updated, logoFile ?? null, null, extra); }}
                patchProfile={props.patchProfile}
                refresh={loadExtras}
                upgrade={props.openUpgrade}
                navigate={props.navigate}
                addExample={addExample}
                removeExample={removeExample}
                onClose={closeSheet}
            />
        </Suspense>
    );
};

export default SetupHost;
