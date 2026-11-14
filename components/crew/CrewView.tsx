/**
 * Crew page (/crew, Tools › Crew; Premium): the people who work for you, their private clock-in links, and the
 * week's hours (components/crew/CrewHours.tsx). Workers are not app users: no login, no seat fee.
 * Free plan: an upgrade prompt (and, after a downgrade, the hours already recorded stay readable; links are paused).
 * Hidden until the database has the feature (lib/crew/crewFeature.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { buildSessions, weekStartOf, localDayOf } from '../../lib/crew/crewLogic.ts';
import type { CrewData } from '../../lib/crew/crewApi.ts';
import type { CrewFeatureState } from '../../lib/crew/crewFeature.ts';
import { EmptyState, PageHeader, Segmented } from '../viewKit.tsx';
import { PlusIcon, StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import CrewHours from './CrewHours.tsx';
import CrewMembers from './CrewMembers.tsx';
import { CrewIcon } from './CrewIcon.tsx';
import { LiveDot, openShiftLabel, useCrewData, useOvertimeRule, useWeekPunches } from './crewUi.tsx';

export interface CrewViewProps {
    userId: string;
    jobs: Array<Job & { clientId?: string | null }>;
    profile: UserProfile;
    plan: string;
    isOnline: boolean;
    feature: CrewFeatureState;
    onBack: () => void;
    onUpgrade: (reason?: string) => void;
    onOpenJob: (jobId: string) => void;
    /** time sheets created / updated from crew hours (the app adds them to its lists) */
    onTimeSheetsSaved: (docs: FormDataType[]) => void;
    onOpenTimeSheet: (jobId: string, docId: string) => void;
}

const TAB_KEY = 'cd.crew.tab';

/** What Premium adds here, for the upgrade prompt (no icon grid: three plain lines). */
const UpgradePrompt: React.FC<{ onUpgrade: () => void; hasCrew: boolean }> = ({ onUpgrade, hasCrew }) => (
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-card">
        <div className="h-1 bg-primary" aria-hidden />
        <div className="p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Premium</p>
            <h2 className="mt-1 text-xl font-bold">{hasCrew ? 'Crew links are paused on the Free plan' : 'Let your crew clock in from their phones'}</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li><span className="font-semibold text-foreground">A private link per worker.</span> No app, no login, no seat fee, for as many people as you have.</li>
                <li><span className="font-semibold text-foreground">Clock in, out and breaks</span> with one location reading at the tap (with their OK), flagged when far from the job. Works offline.</li>
                <li><span className="font-semibold text-foreground">Weekly hours in one tap:</span> approve, fix missed clock-outs, and turn them into time sheets that feed job costing.</li>
            </ul>
            <button type="button" className="btn btn-primary mt-5" onClick={onUpgrade}><StarIcon className="h-4 w-4" /> Upgrade to Premium</button>
            {hasCrew && <p className="mt-3 text-xs text-muted-foreground">Your crew and the hours already recorded are kept; links work again when you upgrade.</p>}
        </div>
    </section>
);

const CrewView: React.FC<CrewViewProps> = ({ userId, jobs, profile, plan, isOnline, feature, onBack, onUpgrade, onOpenJob, onTimeSheetsSaved, onOpenTimeSheet }) => {
    const paid = isPaidTier(plan);
    const enabled = feature !== 'missing';
    const { data, setData, loading, error, unavailable, reload } = useCrewData(enabled);
    const [tab, setTab] = useState<'hours' | 'members'>(() => {
        try { return sessionStorage.getItem(TAB_KEY) === 'members' ? 'members' : 'hours'; } catch { return 'hours'; }
    });
    const [adding, setAdding] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [weekStart, setWeekStart] = useState(() => weekStartOf(localDayOf(Date.now())));
    const [rule, setRule] = useOvertimeRule();
    const hasCrew = Boolean(data?.members.length);
    const week = useWeekPunches(weekStart, enabled && !unavailable && (paid || hasCrew));

    useEffect(() => { try { sessionStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ } }, [tab]);
    useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(t);
    }, []);
    // first visit with no crew: the members tab
    useEffect(() => { if (data && !data.members.length && paid) setTab('members'); }, [data, paid]);

    const sessions = useMemo(() => buildSessions(week.punches, { now }), [week.punches, now]);
    const onClock = useMemo(() => {
        const open = new Map<string, ReturnType<typeof openShiftLabel> & { jobId: string }>();
        for (const s of sessions) if (s.open) open.set(s.memberId, { ...openShiftLabel(s), jobId: s.jobId });
        return open;
    }, [sessions]);
    const statusMap = useMemo(() => Object.fromEntries([...onClock.entries()].map(([k, v]) => [k, { text: v.text, tone: v.tone }])), [onClock]);
    const jobName = (id: string) => jobs.find(j => j.id === id)?.name || 'a job';
    const company = profile.companyName || profile.name || '';

    const addButton = paid && enabled && !unavailable ? (
        <button type="button" className="btn btn-primary" onClick={() => { setTab('members'); setAdding(true); }} disabled={!isOnline || !data}>
            <PlusIcon className="h-4 w-4" /> <span className="hidden sm:inline">Add crew member</span><span className="sm:hidden">Add</span>
        </button>
    ) : null;

    const header = (
        <PageHeader
            title="Crew"
            icon={<CrewIcon className="h-6 w-6" />}
            subtitle="Clock-in links for your workers. No logins, no seat fees."
            onBack={onBack}
            actions={<>{addButton}<HelpButton topic="crew" /></>}
        />
    );

    if (feature === 'missing' || unavailable) {
        return (
            <div className="page">
                {header}
                <EmptyState icon={<CrewIcon />} title="Crew clock-in isn’t switched on yet" description="It will appear here as soon as it is ready for your account." />
            </div>
        );
    }

    return (
        <div className="page">
            {header}

            {!paid && <div className="mb-5"><UpgradePrompt hasCrew={hasCrew} onUpgrade={() => onUpgrade('Crew clock-in links are part of Premium.')} /></div>}

            {error && (
                <p className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                    {error}<button type="button" className="btn btn-outline btn-sm" onClick={() => void reload()}>Try again</button>
                </p>
            )}

            {loading && !data ? (
                <div className="space-y-3" aria-busy="true"><div className="skeleton h-10 w-60 rounded-xl" /><div className="skeleton h-40 w-full rounded-2xl" /></div>
            ) : data && (paid || hasCrew) ? (
                <>
                    {onClock.size > 0 && (
                        <section aria-label="On the clock now" className="mb-4 flex flex-wrap gap-2">
                            {[...onClock.entries()].map(([memberId, st]) => {
                                const m = data.members.find(x => x.id === memberId);
                                return (
                                    <button key={memberId} type="button" onClick={() => onOpenJob(st.jobId)}
                                        className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-2.5 pr-3.5 text-sm transition hover:border-primary/40">
                                        <LiveDot tone={st.tone} />
                                        <span className="shrink-0 font-semibold">{m?.name.split(' ')[0] || 'Crew'}</span>
                                        <span className="min-w-0 truncate text-muted-foreground">{st.text.replace('On the clock ', '')} · {jobName(st.jobId)}</span>
                                    </button>
                                );
                            })}
                        </section>
                    )}

                    <div className="mb-4">
                        <Segmented<'hours' | 'members'>
                            ariaLabel="Crew sections"
                            value={tab}
                            onChange={setTab}
                            options={[
                                { value: 'hours', label: 'Hours' },
                                { value: 'members', label: <>Crew members <span className="ml-0.5 tabular-nums opacity-70">{data.members.filter(m => m.active).length}</span></> },
                            ]}
                        />
                    </div>

                    {tab === 'hours' ? (
                        <CrewHours
                            data={data}
                            jobs={jobs}
                            userId={userId}
                            profile={profile}
                            isOnline={isOnline}
                            weekStart={weekStart}
                            setWeekStart={setWeekStart}
                            punches={week.punches}
                            setPunches={week.setPunches}
                            loading={week.loading}
                            error={week.error}
                            now={now}
                            rule={rule}
                            setRule={setRule}
                            onTimeSheetsSaved={onTimeSheetsSaved}
                            onOpenTimeSheet={onOpenTimeSheet}
                            onUpgrade={onUpgrade}
                        />
                    ) : (
                        <CrewMembers
                            data={data}
                            jobs={jobs}
                            userId={userId}
                            company={company}
                            isOnline={isOnline}
                            paid={paid}
                            status={statusMap}
                            onChange={(next: CrewData) => setData(next)}
                            onUpgrade={onUpgrade}
                            adding={adding}
                            setAdding={setAdding}
                        />
                    )}
                </>
            ) : null}
        </div>
    );
};

export default CrewView;
