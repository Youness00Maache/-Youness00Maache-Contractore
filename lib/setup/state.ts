/**
 * What the setup assistant remembers (public.user_settings 'setup.state', synced like the other small settings): which
 * steps were skipped, whether the person turned it off, the step they were on and the trades they chose. Pure: every
 * change returns a new value. It never says a step is DONE; that comes from the account's data (lib/setup/steps.ts).
 */
import { isStepId, type SetupStepId } from './steps.ts';

export const SETUP_STATE_SETTING = 'setup.state';
const MAX_TRADES = 12;

export interface SetupState {
    v: 1;
    /** "Don't show this again": the hint and the automatic sheet stay away (Settings can still start it) */
    dismissed: boolean;
    /** steps the person chose to skip: they stop counting as open */
    skipped: SetupStepId[];
    /** the step they were on when they left */
    last: SetupStepId | null;
    /** trades chosen in "What you do" (ids of lib/setup/trades.ts) */
    trades: string[];
    /** the first-login sheet was shown once */
    sheetShown: boolean;
    updatedAt: string | null;
}

export const emptySetupState = (): SetupState => ({ v: 1, dismissed: false, skipped: [], last: null, trades: [], sheetShown: false, updatedAt: null });

const uniq = <T,>(xs: T[]): T[] => Array.from(new Set(xs));

/** Anything read from storage becomes a valid state (bad or missing parts fall back to the empty value). */
export function normalizeSetupState(raw: unknown): SetupState {
    const base = emptySetupState();
    if (!raw || typeof raw !== 'object') return base;
    const r = raw as Record<string, unknown>;
    const tradeIds = Array.isArray(r.trades) ? r.trades.filter((t): t is string => typeof t === 'string' && /^[a-z0-9_-]{1,24}$/i.test(t)) : [];
    return {
        v: 1,
        dismissed: r.dismissed === true,
        skipped: Array.isArray(r.skipped) ? uniq(r.skipped.filter(isStepId)) : [],
        last: isStepId(r.last) ? r.last : null,
        trades: uniq(tradeIds).slice(0, MAX_TRADES),
        sheetShown: r.sheetShown === true,
        updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
    };
}

const touch = (s: SetupState, patch: Partial<SetupState>, now: string): SetupState => ({ ...s, ...patch, v: 1, updatedAt: now });
const nowIso = () => new Date().toISOString();

/** "Skip this step": it stops counting as open (and remembers where the person was). */
export const skipStep = (s: SetupState, id: SetupStepId, now = nowIso()): SetupState =>
    touch(s, { skipped: uniq([...s.skipped, id]), last: id }, now);

/** Puts a skipped step back (the person opened it again to fill it in). */
export const unskipStep = (s: SetupState, id: SetupStepId, now = nowIso()): SetupState =>
    s.skipped.includes(id) ? touch(s, { skipped: s.skipped.filter(x => x !== id) }, now) : s;

/** Remembers the step the person is on (Resume opens it again). */
export const rememberStep = (s: SetupState, id: SetupStepId | null, now = nowIso()): SetupState =>
    s.last === id ? s : touch(s, { last: id }, now);

/** "Hide this": the hint and the automatic sheet stay away. */
export const dismissSetup = (s: SetupState, now = nowIso()): SetupState => (s.dismissed ? s : touch(s, { dismissed: true }, now));

/** "Resume setup" from Settings: the hint comes back. Skipped steps stay skipped. */
export const resumeSetup = (s: SetupState, now = nowIso()): SetupState => (s.dismissed ? touch(s, { dismissed: false }, now) : s);

/** "Start again": nothing is skipped or hidden; the chosen trades stay. */
export const restartSetup = (s: SetupState, now = nowIso()): SetupState => touch(s, { dismissed: false, skipped: [], last: null }, now);

/** The automatic sheet was shown (it never opens by itself a second time). */
export const markSheetShown = (s: SetupState, now = nowIso()): SetupState => (s.sheetShown ? s : touch(s, { sheetShown: true }, now));

export const setTrades = (s: SetupState, trades: readonly string[], now = nowIso()): SetupState => {
    const next = uniq(trades.filter(t => typeof t === 'string' && /^[a-z0-9_-]{1,24}$/i.test(t))).slice(0, MAX_TRADES);
    return next.length === s.trades.length && next.every((t, i) => t === s.trades[i]) ? s : touch(s, { trades: next }, now);
};
