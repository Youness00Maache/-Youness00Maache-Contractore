import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormType, UserProfile } from '../../types.ts';
import { supabase } from '../../lib/supabase.ts';
import { DOC_NUMBER_CONFIG, errorMessage, newId, nextDocumentNumber } from './formUtils.ts';
import { isDraftConsumed, markDraftConsumed, mergeDraftIntoForm, useDocumentDraftPrefill, type DraftPrefillState } from '../../hooks/useDocumentDraftPrefill.ts';

/**
 * What a form's `onSave` may return:
 * - throw / reject           → save failed (the message is shown to the user)
 * - `false`                  → save failed (generic message)
 * - anything else            → saved
 * The parent may navigate away after a successful save; the form handles being unmounted.
 */
export type SaveOutcome = void | boolean | { id?: string; public_token?: string | null } | null | undefined;
export type SaveHandler<T> = (data: T) => Promise<SaveOutcome> | SaveOutcome;

/**
 * A NEW document opened already filled from another document ("Convert to invoice", "Revise" of a signed
 * estimate): `prefillData = makeSeedPrefill(data)`. The seed is used as-is (normalized by the form's `hydrate`),
 * never merged as an AI draft (no "AI draft" badge, no field filtering).
 */
export const SEED_KEY = '__seedData';
export const makeSeedPrefill = (data: Record<string, unknown>): Record<string, unknown> => ({ __draftId: `seed-${newId()}`, [SEED_KEY]: data });
export const seedOf = (prefill: unknown): Record<string, unknown> | null => {
    if (!prefill || typeof prefill !== 'object' || Array.isArray(prefill)) return null;
    const seed = (prefill as Record<string, unknown>)[SEED_KEY];
    return seed && typeof seed === 'object' && !Array.isArray(seed) ? (seed as Record<string, unknown>) : null;
};

export interface FormFeedback {
    tone: 'success' | 'error' | 'info';
    message: string;
}

export interface UseDocumentFormOptions<T extends object> {
    formType: FormType;
    /** saved document data (existing document) */
    initial?: T | null;
    /** defaults for a brand-new document (called lazily; dates must be computed inside) */
    makeDefaults: () => T;
    /** normalizes a saved document (legacy field names, numbers, missing arrays, profile backfill) */
    hydrate?: (saved: T) => T;
    prefillData?: unknown;
    onSave: SaveHandler<T>;
    download: (data: T) => Promise<unknown>;
    /** returns an error message to block saving, or null */
    validate?: (data: T) => string | null;
    /** last-moment transform before save/download (e.g. flush a rich-text editor) */
    prepare?: (data: T) => T;
    /**
     * Refuses a save by comparing it with the last saved version (null for a document never saved), e.g. the totals
     * of an estimate the client already signed. Returns an error message or null.
     */
    guard?: (next: T, lastSaved: T | null) => string | null;
    /** async check right before the save is sent (e.g. "did the client sign while this was open?"); message blocks it */
    beforeSave?: (next: T, lastSaved: T | null) => Promise<string | null>;
    /** document numbers the parent already knows about (merged with a database lookup) */
    existingNumbers?: string[];
    autoSaveDelayMs?: number;
}

export interface DocumentFormApi<T extends object> {
    data: T;
    isNew: boolean;
    isDirty: boolean;
    saving: boolean;
    downloading: boolean;
    busy: boolean;
    /** true for a moment after a successful save (the Save button shows a check) */
    justSaved: boolean;
    feedback: FormFeedback | null;
    draft: DraftPrefillState;
    /** user edit: merges a patch (or applies an updater) and marks the form dirty */
    update: (patch: Partial<T> | ((prev: T) => T)) => void;
    setField: <K extends keyof T>(key: K, value: T[K]) => void;
    /** replace data without marking dirty (system changes); an updater reads the latest data */
    replaceSilently: (next: T | ((prev: T) => T)) => void;
    save: () => Promise<boolean>;
    /**
     * Saves first when needed (new document or unsaved edits), e.g. before sharing, like the original app.
     * 'saved': the document is saved and up to date; 'invalid': a required field is missing (the message is shown);
     * 'failed': the save did not go through (offline, plan limit, ...; the reason is shown).
     */
    ensureSaved: () => Promise<'saved' | 'invalid' | 'failed'>;
    download: () => Promise<boolean>;
    saveAndDownload: () => Promise<void>;
    setFeedback: (f: FormFeedback | null) => void;
    /** merges an AI result (same rules as prefill) into the current data; returns the number of fields filled */
    applyDraft: (payload: unknown) => number;
    /** last successful save result from the parent (id / public_token when provided) */
    lastSaveResult: { id?: string; public_token?: string | null } | null;
    /** the data as last saved (the opened document until the first save; null for a new document) */
    lastSaved: T | null;
}

/** Existing numbers of this document type for the current user (RLS scopes the query to the owner). */
const fetchExistingNumbers = async (formType: FormType, field: string): Promise<string[]> => {
    try {
        const { data, error } = await (supabase as any)
            .from('documents')
            .select(`num:data->>${field}`)
            .eq('type', formType)
            .order('created_at', { ascending: false })
            .limit(1000);
        if (error || !Array.isArray(data)) return [];
        return data.map((r: any) => r?.num).filter((n: unknown): n is string => typeof n === 'string' && !!n);
    } catch {
        return [];
    }
};

export function useDocumentForm<T extends object>(options: UseDocumentFormOptions<T>): DocumentFormApi<T> {
    const optsRef = useRef(options);
    optsRef.current = options;
    const { formType } = options;
    const isNew = !options.initial;
    const numberCfg = isNew ? DOC_NUMBER_CONFIG[formType] : undefined;
    const autoNumberRef = useRef<string | null>(null);

    const buildNew = useCallback((): T => {
        const base = optsRef.current.makeDefaults();
        if (numberCfg) {
            if (!autoNumberRef.current) autoNumberRef.current = nextDocumentNumber(numberCfg.prefix, optsRef.current.existingNumbers || []);
            (base as Record<string, unknown>)[numberCfg.field] = autoNumberRef.current;
        }
        return base;
    }, [numberCfg]);

    const seed = isNew ? seedOf(options.prefillData) : null;
    const [data, setDataState] = useState<T>(() => {
        if (options.initial) return options.hydrate ? options.hydrate(options.initial) : options.initial;
        const base = buildNew();
        if (!seed) return base;
        const seeded = { ...base, ...seed } as T;
        return options.hydrate ? options.hydrate(seeded) : seeded;
    });
    const dataRef = useRef<T>(data);
    dataRef.current = data;
    const [lastSaved, setLastSaved] = useState<T | null>(() => (options.initial ? data : null));
    const lastSavedRef = useRef<T | null>(lastSaved);

    // a seeded document has not been saved yet: leaving it asks first
    const [isDirty, setDirty] = useState(Boolean(seed));
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [feedback, setFeedback] = useState<FormFeedback | null>(null);
    const [justSaved, setJustSaved] = useState(false);
    const [lastSaveResult, setLastSaveResult] = useState<DocumentFormApi<T>['lastSaveResult']>(null);
    const savingRef = useRef(false);
    const savePromiseRef = useRef<Promise<boolean> | null>(null);
    const dirtyRef = useRef(false);
    dirtyRef.current = isDirty;
    const savedOnceRef = useRef(false);
    const downloadingRef = useRef(false);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const commit = useCallback((next: T, dirty: boolean) => {
        dataRef.current = next;
        setDataState(next);
        if (dirty) {
            dirtyRef.current = true;
            setDirty(true);
        }
    }, []);

    const update = useCallback((patch: Partial<T> | ((prev: T) => T)) => {
        const prev = dataRef.current;
        const next = typeof patch === 'function' ? (patch as (p: T) => T)(prev) : { ...prev, ...patch };
        if (next !== prev) commit(next, true);
    }, [commit]);

    const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
        update(prev => (prev[key] === value ? prev : { ...prev, [key]: value }));
    }, [update]);

    const replaceSilently = useCallback((next: T | ((prev: T) => T)) => {
        const value = typeof next === 'function' ? (next as (p: T) => T)(dataRef.current) : next;
        if (value !== dataRef.current) commit(value, false);
    }, [commit]);

    // ---- AI prefill (applied exactly once per draft) ----
    const draft = useDocumentDraftPrefill<T>({
        formType,
        prefillData: seed ? undefined : options.prefillData,
        getData: () => dataRef.current,
        setData: next => commit(next, true),
        makeBase: buildNew,
    });
    const draftKeyRef = useRef<string | null>(null);
    draftKeyRef.current = draft.draftKey;

    useEffect(() => {
        if (!draft.version) return;
        if (draft.alreadySaved) {
            setFeedback({ tone: 'info', message: 'This AI draft was already saved once. Check your documents before saving it again.' });
        } else if (!draft.autoSave && draft.appliedKeys.length) {
            setFeedback({ tone: 'info', message: `AI filled ${draft.appliedKeys.length} field${draft.appliedKeys.length === 1 ? '' : 's'}. Review them, then save.` });
        }
    }, [draft.version]); // eslint-disable-line react-hooks/exhaustive-deps

    const applyDraft = useCallback((payload: unknown): number => {
        const result = mergeDraftIntoForm(formType, dataRef.current, payload);
        if (result.appliedKeys.length) {
            commit(result.data, true);
            setFeedback({ tone: 'info', message: `AI filled ${result.appliedKeys.length} field${result.appliedKeys.length === 1 ? '' : 's'}. Review them, then save.` });
        } else {
            setFeedback({ tone: 'error', message: 'The AI response did not contain any fields for this document.' });
        }
        return result.appliedKeys.length;
    }, [formType, commit]);

    // ---- unique document number (database lookup refines the local guess) ----
    useEffect(() => {
        if (!numberCfg) return;
        let cancelled = false;
        void (async () => {
            const fromDb = await fetchExistingNumbers(formType, numberCfg.field);
            if (cancelled || !mountedRef.current) return;
            const next = nextDocumentNumber(numberCfg.prefix, [...(optsRef.current.existingNumbers || []), ...fromDb]);
            const current = (dataRef.current as Record<string, unknown>)[numberCfg.field];
            if (current === autoNumberRef.current && next !== current) {
                autoNumberRef.current = next;
                commit({ ...dataRef.current, [numberCfg.field]: next } as T, false);
            }
        })();
        return () => { cancelled = true; };
    }, [formType, numberCfg, commit]);

    // ---- save / download ----
    const prepared = () => {
        const p = optsRef.current.prepare;
        return p ? p(dataRef.current) : dataRef.current;
    };

    const save = useCallback(async (): Promise<boolean> => {
        // a save already running (auto-save, double click) is shared instead of being dropped
        if (savingRef.current && savePromiseRef.current) return savePromiseRef.current;
        const before = dataRef.current;
        const payload = prepared();
        const problem = optsRef.current.validate?.(payload) || optsRef.current.guard?.(payload, lastSavedRef.current) || null;
        if (problem) {
            setFeedback({ tone: 'error', message: problem });
            return false;
        }
        savingRef.current = true;
        setSaving(true);
        setFeedback(null);
        const run = async (): Promise<boolean> => {
            try {
                const blocked = optsRef.current.beforeSave ? await optsRef.current.beforeSave(payload, lastSavedRef.current) : null;
                if (blocked) throw new Error(blocked);
                const result = await optsRef.current.onSave(payload);
                if (result === false) throw new Error('Your changes were not saved. Please try again.');
                markDraftConsumed(draftKeyRef.current);
                savedOnceRef.current = true;
                lastSavedRef.current = payload;
                const stillDirty = dataRef.current !== before; // edits typed while the save was running stay "unsaved"
                dirtyRef.current = stillDirty;
                if (mountedRef.current) {
                    if (result && typeof result === 'object') setLastSaveResult(result);
                    setLastSaved(payload);
                    setDirty(stillDirty);
                    setJustSaved(true);
                }
                return true;
            } catch (e) {
                if (mountedRef.current) setFeedback({ tone: 'error', message: errorMessage(e, 'Could not save. Please try again.') });
                return false;
            } finally {
                savingRef.current = false;
                savePromiseRef.current = null;
                if (mountedRef.current) setSaving(false);
            }
        };
        const pending = run();
        savePromiseRef.current = pending;
        return pending;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const ensureSaved = useCallback(async (): Promise<'saved' | 'invalid' | 'failed'> => {
        if (savingRef.current && savePromiseRef.current) await savePromiseRef.current;
        const persisted = !isNew || savedOnceRef.current;
        if (persisted && !dirtyRef.current) return 'saved';
        if (optsRef.current.validate?.(prepared()) || optsRef.current.guard?.(prepared(), lastSavedRef.current)) {
            await save(); // shows the validation message
            return 'invalid';
        }
        return (await save()) ? 'saved' : 'failed';
    }, [isNew, save]); // eslint-disable-line react-hooks/exhaustive-deps

    const download = useCallback(async (): Promise<boolean> => {
        if (downloadingRef.current) return false;
        downloadingRef.current = true;
        setDownloading(true);
        try {
            await optsRef.current.download(prepared());
            return true;
        } catch (e) {
            if (mountedRef.current) setFeedback({ tone: 'error', message: `Could not create the PDF. ${errorMessage(e, '')}`.trim() });
            return false;
        } finally {
            downloadingRef.current = false;
            if (mountedRef.current) setDownloading(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /** Download first (the save may navigate away), then save. */
    const saveAndDownload = useCallback(async () => {
        if (savingRef.current || downloadingRef.current) return;
        const problem = optsRef.current.validate?.(prepared()) || optsRef.current.guard?.(prepared(), lastSavedRef.current) || null;
        if (problem) {
            setFeedback({ tone: 'error', message: problem });
            return;
        }
        if (await download()) await save();
    }, [download, save]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---- auto-save for AI drafts (once per draft, survives StrictMode double effects) ----
    const autoSavedRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        const key = draft.draftKey;
        if (!draft.autoSave || !key || autoSavedRef.current.has(key)) return;
        const timer = setTimeout(() => {
            if (autoSavedRef.current.has(key) || isDraftConsumed(key)) return;
            autoSavedRef.current.add(key);
            markDraftConsumed(key); // before saving: Back/refresh can never replay this auto-save
            void save();
        }, optsRef.current.autoSaveDelayMs ?? 900);
        return () => clearTimeout(timer);
    }, [draft.version, draft.autoSave, draft.draftKey, save]);

    // ---- feedback auto-dismiss + leave-page guard ----
    useEffect(() => {
        if (!justSaved) return;
        const t = setTimeout(() => mountedRef.current && setJustSaved(false), 2500);
        return () => clearTimeout(t);
    }, [justSaved]);

    useEffect(() => {
        if (feedback?.tone !== 'success') return;
        const t = setTimeout(() => mountedRef.current && setFeedback(f => (f === feedback ? null : f)), 3500);
        return () => clearTimeout(t);
    }, [feedback]);

    useEffect(() => {
        if (!isDirty) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    return {
        data,
        isNew,
        isDirty,
        saving,
        downloading,
        busy: saving || downloading,
        justSaved,
        feedback,
        draft,
        update,
        setField,
        replaceSilently,
        save,
        ensureSaved,
        download,
        saveAndDownload,
        setFeedback,
        applyDraft,
        lastSaveResult,
        lastSaved,
    };
}

/**
 * A new, unsigned document follows the profile logo when it arrives or changes while the form is open (as the
 * original Daily Report did). A logo the user picked for this document is never replaced.
 */
export function useProfileLogoSync<T extends { logoUrl?: string; signatureUrl?: string }>(form: DocumentFormApi<T>, profileLogo: string | null | undefined) {
    const lastProfileLogo = useRef(profileLogo || '');
    useEffect(() => {
        const next = profileLogo || '';
        const prev = lastProfileLogo.current;
        lastProfileLogo.current = next;
        if (!form.isNew || !next || next === prev || form.data.signatureUrl) return;
        const current = form.data.logoUrl || '';
        if (current && current !== prev) return;
        form.replaceSilently({ ...form.data, logoUrl: next });
    }, [profileLogo]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Fills empty company/branding fields of a saved document from the profile (never overwrites). */
export const backfillCompany = <T extends Record<string, any>>(d: T, profile: UserProfile, withContact = true): T => ({
    ...d,
    companyName: d.companyName || profile.companyName || '',
    companyAddress: d.companyAddress || profile.address || '',
    ...(withContact ? { companyPhone: d.companyPhone || profile.phone || '', companyWebsite: d.companyWebsite || profile.website || '' } : {}),
    logoUrl: d.logoUrl || profile.logoUrl || '',
});

/** '#000000' / '#666666' mean "use the template's own colors" in the renderer. */
export const DEFAULT_THEME = { primary: '#000000', secondary: '#666666' };

export { DEFAULT_TEMPLATE_ID } from '../../utils/templates/registry.ts';
