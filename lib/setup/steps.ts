/**
 * Setup assistant (roadmap N8), the pure part: the steps, and how far along an account really is. No network, no
 * browser. Every "done" is read from the account's REAL data (profile fields, logo, labor rate, price book rows, the
 * saved design / money defaults, crew members), never from a flag the wizard set, so it is right for old accounts and
 * after a reinstall too. What the wizard itself remembers (skipped steps, dismissed, trades) lives in lib/setup/state.ts.
 *
 * A step that cannot work for this account (payment columns missing in an old database, crew links on the Free plan)
 * is left out of the list: nobody is asked to do something they cannot do.
 */
import { isPaidTier, normalizeTier } from '../plans.ts';
import type { SetupState } from './state.ts';

export type SetupStepId = 'business' | 'contact' | 'money' | 'trade' | 'pricebook' | 'look' | 'getpaid' | 'team';

export interface SetupStepDef {
    id: SetupStepId;
    /** short title in the list and the step heading */
    title: string;
    /** one plain line: what it is for */
    blurb: string;
    /** counts toward "Setup 4 of 7" and toward finishing; optional steps never keep the hint on screen */
    required: boolean;
}

/** In the order a contractor meets them. */
export const SETUP_STEPS: readonly SetupStepDef[] = [
    { id: 'business', title: 'Your business', blurb: 'Company name and logo, printed at the top of every document.', required: true },
    { id: 'contact', title: 'Contact and address', blurb: 'The phone and address clients see on estimates and invoices.', required: true },
    { id: 'money', title: 'Tax and terms', blurb: 'Sales tax, when invoices are due, and your deposit wording.', required: true },
    { id: 'trade', title: 'What you do', blurb: 'Your trades and your hourly labor rate.', required: true },
    { id: 'pricebook', title: 'Price book', blurb: 'Start with ready-made kits for your trades, then set your own prices.', required: true },
    { id: 'look', title: 'Document look', blurb: 'The design new estimates and invoices start with.', required: true },
    { id: 'getpaid', title: 'Get paid', blurb: 'Your payment link and your Google review link.', required: true },
    { id: 'team', title: 'Your team', blurb: 'Add a worker and send them a clock-in link.', required: false },
];

export const STEP_IDS: readonly SetupStepId[] = SETUP_STEPS.map(s => s.id);
export const isStepId = (v: unknown): v is SetupStepId => typeof v === 'string' && (STEP_IDS as readonly string[]).includes(v);
export const stepDef = (id: SetupStepId): SetupStepDef => SETUP_STEPS.find(s => s.id === id)!;

/** What the account looks like right now. `null` = could not be read (offline): never guessed. */
export interface SetupFacts {
    profile: {
        name?: string | null;
        companyName?: string | null;
        logoUrl?: string | null;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
        website?: string | null;
        defaultLaborRate?: number | null;
        payLinkDefault?: string | null;
        googleReviewLink?: string | null;
        /** the database has no payment columns yet */
        paymentSettingsUnavailable?: boolean | null;
    };
    /** rows in the price book (kits included) */
    priceBookCount: number | null;
    /** a default document design was chosen and saved */
    designChosen: boolean;
    /** tax / terms defaults were saved */
    moneySaved: boolean;
    /** crew members on the account */
    crewCount: number | null;
    jobsCount: number;
    clientsCount: number;
    documentsCount: number;
    plan: string | null | undefined;
    /** crew clock-in exists in the database */
    crewFeature: 'ready' | 'missing' | 'unknown';
}

const has = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

/** Can this account use the Team step (Premium and the crew tables are there)? */
export const crewAvailable = (facts: Pick<SetupFacts, 'plan' | 'crewFeature'>): boolean =>
    isPaidTier(normalizeTier(facts.plan)) && facts.crewFeature === 'ready';

/** Does the step apply to this account at all? */
export const stepApplies = (id: SetupStepId, facts: SetupFacts): boolean => {
    if (id === 'getpaid') return !facts.profile.paymentSettingsUnavailable;
    if (id === 'team') return crewAvailable(facts);
    return true;
};

/**
 * Is the step done, from the account's data? null = cannot tell right now (offline, nothing cached): treated as fine
 * so an old account is never nagged about something that may well be set.
 * "Tax and terms" and "Document look" are options an owner may have set by hand on each document, so an account that
 * has already made documents counts them as done too.
 */
export const stepDone = (id: SetupStepId, facts: SetupFacts): boolean | null => {
    const p = facts.profile;
    switch (id) {
        case 'business': return has(p.companyName) && has(p.logoUrl);
        case 'contact': return has(p.phone) && has(p.address);
        case 'money': return facts.moneySaved || facts.documentsCount > 0;
        case 'trade': return Number(p.defaultLaborRate) > 0;
        case 'pricebook': return facts.priceBookCount === null ? null : facts.priceBookCount > 0;
        case 'look': return facts.designChosen || facts.documentsCount > 0;
        case 'getpaid': return has(p.payLinkDefault);
        case 'team': return facts.crewCount === null ? null : facts.crewCount > 0;
    }
};

export type StepStatus = 'done' | 'skipped' | 'todo' | 'unknown';

export interface StepView extends SetupStepDef {
    status: StepStatus;
    /** done, skipped or unknown: nothing left to ask */
    resolved: boolean;
}

export interface SetupProgress {
    /** the steps that apply to this account, in order */
    steps: StepView[];
    /** resolved required steps / all required steps: "Setup 4 of 7" */
    resolved: number;
    total: number;
    /** every required step is resolved: no hint, no automatic wizard */
    complete: boolean;
    /** the first step still to do (required ones first-come, then optional), null = none */
    firstOpen: SetupStepId | null;
    /** steps with real data behind them (what the summary lists) */
    doneIds: SetupStepId[];
}

export function computeProgress(facts: SetupFacts, state: Pick<SetupState, 'skipped'>): SetupProgress {
    const steps: StepView[] = [];
    for (const def of SETUP_STEPS) {
        if (!stepApplies(def.id, facts)) continue;
        const done = stepDone(def.id, facts);
        const status: StepStatus = done === true ? 'done' : state.skipped.includes(def.id) ? 'skipped' : done === null ? 'unknown' : 'todo';
        steps.push({ ...def, status, resolved: status !== 'todo' });
    }
    const required = steps.filter(s => s.required);
    const resolved = required.filter(s => s.resolved).length;
    const firstOpen = (steps.find(s => s.required && !s.resolved) || steps.find(s => !s.resolved))?.id ?? null;
    return {
        steps, resolved, total: required.length,
        complete: resolved === required.length,
        firstOpen,
        doneIds: steps.filter(s => s.status === 'done').map(s => s.id),
    };
}

/** Where the wizard opens: the step the person was on if it is still open, else the first open one, else the summary. */
export type WizardScreen = SetupStepId | 'finish';

export function startScreen(progress: SetupProgress, state: Pick<SetupState, 'last'>): WizardScreen {
    const last = state.last && progress.steps.find(s => s.id === state.last);
    if (last && !last.resolved) return last.id;
    return progress.firstOpen ?? 'finish';
}

/** The screen after `id`: the next step that applies (open or not: Back / Next walk the list), then the summary. */
export function screenAfter(progress: SetupProgress, id: WizardScreen): WizardScreen {
    if (id === 'finish') return 'finish';
    const i = progress.steps.findIndex(s => s.id === id);
    return progress.steps[i + 1]?.id ?? 'finish';
}

export function screenBefore(progress: SetupProgress, id: WizardScreen): WizardScreen | null {
    if (id === 'finish') return progress.steps[progress.steps.length - 1]?.id ?? null;
    const i = progress.steps.findIndex(s => s.id === id);
    return i > 0 ? progress.steps[i - 1].id : null;
}

/** The small "Setup 4 of 7" hint on the dashboard: only while there is something left and nobody turned it off. */
export const shouldShowHint = (progress: SetupProgress | null, state: Pick<SetupState, 'dismissed'>): boolean =>
    !!progress && !progress.complete && !state.dismissed;

/**
 * The sheet that opens by itself, once: a brand-new account (no job, client or document yet) that has not seen it,
 * has not turned it off and still has something to set up. An old account with gaps only gets the hint.
 */
export const shouldAutoOpen = (
    progress: SetupProgress | null,
    state: Pick<SetupState, 'dismissed' | 'sheetShown'>,
    counts: Pick<SetupFacts, 'jobsCount' | 'clientsCount' | 'documentsCount'>,
): boolean => {
    if (!progress || progress.complete || state.dismissed || state.sheetShown) return false;
    return counts.jobsCount === 0 && counts.clientsCount === 0 && counts.documentsCount === 0;
};
