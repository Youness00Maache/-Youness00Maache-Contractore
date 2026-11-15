/**
 * Setup assistant (roadmap N8) checks. Pure logic, no browser, no database:
 *   npx tsx scripts/setup-check.ts
 *  1. steps: order, ids, what is required, what applies to which plan / database
 *  2. completion detection from an account's REAL data: empty, partly set up, full (old account), unknown values
 *  3. progress invariants over thousands of random account shapes
 *  4. skip / resume / dismiss / restart state transitions, start screen, hint and first-login rules
 *  5. trades -> starter kits (the existing importer: duplicates skipped, labor rate)
 *  6. tax + terms defaults: applied only to new estimates / invoices, only what was set
 *  7. example project: tracking, Free-plan room, what "Remove example data" removes (exactly its own ids)
 *  8. plan gating of the design and crew steps
 *  9. wiring: storage keys, mounts, offline audit rows, help text, translations, owner rules (no new database, no AI calls)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    SETUP_STEPS, STEP_IDS, computeProgress, crewAvailable, screenAfter, screenBefore, shouldAutoOpen, shouldShowHint, startScreen, stepApplies, stepDone,
    type SetupFacts, type SetupStepId,
} from '../lib/setup/steps.ts';
import {
    SETUP_STATE_SETTING, dismissSetup, emptySetupState, markSheetShown, normalizeSetupState, rememberStep, restartSetup, resumeSetup, setTrades, skipStep, unskipStep,
} from '../lib/setup/state.ts';
import { OTHER_TRADE_ID, SETUP_TRADES, kitIdsForTrades, normalizeTradeIds, toggleTrade, tradesWithKits } from '../lib/setup/trades.ts';
import {
    DUE_DAY_CHOICES, MONEY_DEFAULTS_SETTING, applyMoneyDefaults, emptyMoneyDefaults, hasMoneyDefaults, moneyEntryProblem, normalizeMoneyDefaults,
} from '../lib/setup/moneyDefaults.ts';
import {
    EXAMPLE_CLIENT_NAME, EXAMPLE_ESTIMATE_TITLE, EXAMPLE_JOB_NAME, EXAMPLE_LIMIT_MESSAGE, SETUP_EXAMPLE_SETTING, buildExampleEstimate, emptyExample, exampleRoom, hasExample,
    normalizeExample, planExampleRemoval,
} from '../lib/setup/example.ts';
import { STARTER_KITS, STARTER_TRADES } from '../lib/assemblies/starterKits.ts';
import { planStarterImport } from '../lib/assemblies/starterImport.ts';
import { canUseDesign, canUsePremiumDesigns } from '../lib/designAccess.ts';
import { computeDocumentTotals } from '../utils/money.ts';
import { getGuide } from '../components/help/helpContent.ts';
import { translations } from '../utils/translations.ts';
import { WRITE_PATHS } from '../lib/offline/writePathAudit.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: unknown, detail?: unknown) => { if (ok) passed++; else failures.push(`${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`); };
const eq = (name: string, a: unknown, b: unknown) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });

let seed = 20261116;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const chance = (p = 0.5) => rnd() < p;

// ---------------------------------------------------------------------------------------------------------------
// account shapes
// ---------------------------------------------------------------------------------------------------------------
const emptyFacts = (over: Partial<SetupFacts> = {}): SetupFacts => ({
    profile: { name: 'Sam', email: 'sam@example.com', companyName: '', logoUrl: '', phone: '', address: '', website: '', defaultLaborRate: null, payLinkDefault: '', googleReviewLink: '', paymentSettingsUnavailable: false },
    priceBookCount: 0, designChosen: false, moneySaved: false, crewCount: 0, jobsCount: 0, clientsCount: 0, documentsCount: 0, plan: 'free', crewFeature: 'ready',
    ...over,
});
const fullFacts = (over: Partial<SetupFacts> = {}): SetupFacts => ({
    profile: {
        name: 'Sam Rivera', email: 'sam@example.com', companyName: 'Rivera Home Repair', logoUrl: 'https://x/logo.png', phone: '555-0100', address: '1 Main St', website: 'https://r.example',
        defaultLaborRate: 65, payLinkDefault: 'https://paypal.me/rivera', googleReviewLink: 'https://g.page/r/x/review', paymentSettingsUnavailable: false,
    },
    priceBookCount: 12, designChosen: true, moneySaved: true, crewCount: 2, jobsCount: 8, clientsCount: 6, documentsCount: 40, plan: 'premium', crewFeature: 'ready',
    ...over,
});
const none = { skipped: [] as SetupStepId[] };

// ---------------------------------------------------------------------------------------------------------------
// 1. steps
// ---------------------------------------------------------------------------------------------------------------
eq('eight steps in the contractor order', STEP_IDS, ['business', 'contact', 'money', 'trade', 'pricebook', 'look', 'getpaid', 'team']);
check('step ids are unique', new Set(STEP_IDS).size === STEP_IDS.length);
check('only the team step is optional', SETUP_STEPS.filter(s => !s.required).map(s => s.id).join() === 'team');
check('every step has a title and a plain one-line blurb', SETUP_STEPS.every(s => s.title.length > 2 && s.blurb.length > 10 && !/\bAPI\b|\bJSON\b|\bSQL\b/.test(s.blurb)));

// ---------------------------------------------------------------------------------------------------------------
// 2. completion detection
// ---------------------------------------------------------------------------------------------------------------
{
    const p = computeProgress(emptyFacts(), none);
    eq('empty free account: 7 steps, none resolved', [p.steps.length, p.resolved, p.total, p.complete], [7, 0, 7, false]);
    check('empty account: the first open step is the business', p.firstOpen === 'business');
    check('empty free account has no team step', !p.steps.some(s => s.id === 'team'));
}
{
    const p = computeProgress(fullFacts(), none);
    check('full existing account: complete', p.complete && p.resolved === p.total, p);
    check('full account: no hint, no automatic sheet', !shouldShowHint(p, emptySetupState()) && !shouldAutoOpen(p, emptySetupState(), { jobsCount: 0, clientsCount: 0, documentsCount: 0 }));
    const old = computeProgress(fullFacts({ crewCount: 0 }), none);
    check('full account with no crew yet is still complete (the team step is optional)', old.complete && old.steps.find(s => s.id === 'team')?.status === 'todo');
    const startNow = startScreen(p, emptySetupState());
    eq('a complete account opens the summary if asked', startNow, 'finish');
}
{
    // partly set up: business + contact done, rest open
    const facts = emptyFacts({ profile: { ...emptyFacts().profile, companyName: 'Acme', logoUrl: 'u', phone: '1', address: 'a' } });
    const p = computeProgress(facts, none);
    eq('partly set up: only the open steps are todo', p.steps.filter(s => s.status === 'todo').map(s => s.id), ['money', 'trade', 'pricebook', 'look', 'getpaid']);
    eq('partly set up: done steps', p.doneIds, ['business', 'contact']);
    eq('partly set up: 2 of 7', [p.resolved, p.total], [2, 7]);
    check('partly set up: shows the hint', shouldShowHint(p, emptySetupState()));
    check('first open step is the money one', p.firstOpen === 'money');
}
{
    // each piece of real data flips exactly its step
    const base = emptyFacts();
    const flips: Array<[SetupStepId, Partial<SetupFacts>]> = [
        ['business', { profile: { ...base.profile, companyName: 'A', logoUrl: 'x' } }],
        ['contact', { profile: { ...base.profile, phone: '1', address: 'a' } }],
        ['money', { moneySaved: true }],
        ['trade', { profile: { ...base.profile, defaultLaborRate: 55 } }],
        ['pricebook', { priceBookCount: 3 }],
        ['look', { designChosen: true }],
        ['getpaid', { profile: { ...base.profile, payLinkDefault: 'https://paypal.me/a' } }],
    ];
    for (const [id, over] of flips) {
        const before = stepDone(id, base);
        const after = stepDone(id, { ...base, ...over });
        check(`${id}: not done, then done by its own data`, before === false && after === true, { before, after });
        const others = STEP_IDS.filter(o => o !== id && o !== 'team').filter(o => stepDone(o, { ...base, ...over }) === true);
        check(`${id}: only that step changes`, others.length === 0, others);
    }
    check('name without a logo is not "business done"', stepDone('business', emptyFacts({ profile: { ...base.profile, companyName: 'A' } })) === false);
    check('phone without an address is not "contact done"', stepDone('contact', emptyFacts({ profile: { ...base.profile, phone: '1' } })) === false);
    check('labor rate 0 / negative is not set', stepDone('trade', emptyFacts({ profile: { ...base.profile, defaultLaborRate: 0 } })) === false && stepDone('trade', emptyFacts({ profile: { ...base.profile, defaultLaborRate: -5 } })) === false);
    check('whitespace is not a company name', stepDone('business', emptyFacts({ profile: { ...base.profile, companyName: '   ', logoUrl: 'x' } })) === false);
    check('an account that already made documents counts tax/terms and look as done', stepDone('money', emptyFacts({ documentsCount: 3 })) === true && stepDone('look', emptyFacts({ documentsCount: 3 })) === true);
    check('...but never the price book, labor rate, logo or payment link', stepDone('pricebook', emptyFacts({ documentsCount: 3 })) === false && stepDone('trade', emptyFacts({ documentsCount: 3 })) === false
        && stepDone('business', emptyFacts({ documentsCount: 3 })) === false && stepDone('getpaid', emptyFacts({ documentsCount: 3 })) === false);
}
{
    // unknown (offline, nothing cached): never guessed, never nagged
    const p = computeProgress(emptyFacts({ priceBookCount: null }), none);
    const pb = p.steps.find(s => s.id === 'pricebook')!;
    check('unknown price book: status unknown, counts as resolved (no nagging)', pb.status === 'unknown' && pb.resolved);
    const q = computeProgress(fullFacts({ priceBookCount: null, crewCount: null }), none);
    check('full account with unreadable counts is complete', q.complete);
    check('unknown is not "done" in the summary list', !q.doneIds.includes('pricebook'));
}
{
    // database without payment columns: the step is left out; an old account without them can still complete
    const facts = fullFacts({ profile: { ...fullFacts().profile, payLinkDefault: '', paymentSettingsUnavailable: true } });
    const p = computeProgress(facts, none);
    check('payment columns missing: the Get paid step is hidden and setup can complete', !p.steps.some(s => s.id === 'getpaid') && p.complete);
}

// ---------------------------------------------------------------------------------------------------------------
// 3. progress invariants over random accounts
// ---------------------------------------------------------------------------------------------------------------
{
    const plans = ['free', 'premium', 'ai', 'premium-ai', 'pro', '', null, undefined, 'FREE'];
    const crew: SetupFacts['crewFeature'][] = ['ready', 'missing', 'unknown'];
    let bad = 0;
    for (let n = 0; n < 4000; n++) {
        const facts: SetupFacts = {
            profile: {
                companyName: chance() ? 'Co' : chance(0.3) ? '  ' : '', logoUrl: chance() ? 'u' : '', phone: chance() ? '1' : '', address: chance() ? 'a' : '', name: 'n',
                defaultLaborRate: chance() ? Math.round(rnd() * 200) - 10 : null, payLinkDefault: chance() ? 'https://p' : '', googleReviewLink: chance(0.2) ? 'g' : '',
                paymentSettingsUnavailable: chance(0.1),
            },
            priceBookCount: chance(0.15) ? null : Math.floor(rnd() * 5), designChosen: chance(), moneySaved: chance(), crewCount: chance(0.2) ? null : Math.floor(rnd() * 3),
            jobsCount: Math.floor(rnd() * 4), clientsCount: Math.floor(rnd() * 4), documentsCount: Math.floor(rnd() * 4),
            plan: plans[Math.floor(rnd() * plans.length)], crewFeature: crew[Math.floor(rnd() * crew.length)],
        };
        const skipped = STEP_IDS.filter(() => chance(0.25));
        const p = computeProgress(facts, { skipped });
        const req = p.steps.filter(s => s.required);
        const okShape = p.resolved === req.filter(s => s.resolved).length && p.total === req.length && p.complete === (p.resolved === p.total)
            && p.steps.every(s => stepApplies(s.id, facts))
            && p.steps.every(s => (s.status === 'done') === (stepDone(s.id, facts) === true))
            && p.steps.every(s => s.status !== 'todo' ? s.resolved : !s.resolved)
            && p.steps.every(s => s.status !== 'skipped' || (skipped.includes(s.id) && stepDone(s.id, facts) !== true))
            && (p.firstOpen === null ? p.steps.every(s => s.resolved) : p.steps.find(s => s.id === p.firstOpen)?.status === 'todo')
            && p.doneIds.every(id => p.steps.find(s => s.id === id)?.status === 'done')
            && (!p.steps.some(s => s.id === 'team') || crewAvailable(facts))
            && (shouldShowHint(p, { dismissed: false }) === !p.complete)
            && !shouldShowHint(p, { dismissed: true });
        // a step that is really done never needs skipping: skipping does not undo data
        const none2 = computeProgress(facts, none);
        const skipNeverAddsOpen = none2.steps.every(s => (skipped.includes(s.id) ? true : s.status === p.steps.find(x => x.id === s.id)?.status));
        if (!okShape || !skipNeverAddsOpen) { bad++; if (bad < 3) failures.push(`progress invariant broke for ${JSON.stringify({ facts, skipped })}`); }
    }
    passed += bad === 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// 4. state transitions, start screen, hint and first-login rules
// ---------------------------------------------------------------------------------------------------------------
{
    const t0 = '2026-11-16T10:00:00.000Z';
    let s = emptySetupState();
    check('a fresh state is empty', !s.dismissed && !s.sheetShown && s.skipped.length === 0 && s.last === null && s.trades.length === 0);
    s = skipStep(s, 'money', t0);
    eq('skip a step: it is listed and remembered as the last one', [s.skipped, s.last], [['money'], 'money']);
    eq('skipping the same step twice changes nothing', skipStep(s, 'money', t0).skipped, ['money']);
    s = skipStep(s, 'look', t0);
    s = unskipStep(s, 'money', t0);
    eq('unskip puts one back', s.skipped, ['look']);
    check('unskip of a step that is not skipped returns the same object', unskipStep(s, 'money', t0) === s);
    s = rememberStep(s, 'pricebook', t0);
    eq('remember the step the person is on', s.last, 'pricebook');
    check('remembering the same step returns the same object', rememberStep(s, 'pricebook', t0) === s);
    s = dismissSetup(s, t0);
    check('dismiss', s.dismissed);
    check('dismiss twice returns the same object', dismissSetup(s, t0) === s);
    s = resumeSetup(s, t0);
    check('resume brings the reminder back and keeps skipped steps', !s.dismissed && s.skipped.includes('look'));
    check('resume when not dismissed returns the same object', resumeSetup(s, t0) === s);
    s = markSheetShown(s, t0);
    check('first-login sheet is marked shown once', s.sheetShown && markSheetShown(s, t0) === s);
    s = setTrades(s, ['kitchen', 'bathroom', 'kitchen', 'nope!'], t0);
    eq('trades: unique, valid ids only', s.trades, ['kitchen', 'bathroom']);
    check('same trades return the same object', setTrades(s, ['kitchen', 'bathroom'], t0) === s);
    const restarted = restartSetup(s, t0);
    check('restart clears skipped, last and dismissed, keeps trades and "shown"', restarted.skipped.length === 0 && restarted.last === null && !restarted.dismissed && restarted.trades.length === 2 && restarted.sheetShown);
    check('every change stamps updatedAt', skipStep(emptySetupState(), 'trade', t0).updatedAt === t0);
    // storage round trip
    eq('state survives JSON', normalizeSetupState(JSON.parse(JSON.stringify(s))), s);
    check('garbage becomes an empty state', JSON.stringify(normalizeSetupState('x')) === JSON.stringify(emptySetupState()) && JSON.stringify(normalizeSetupState(null)) === JSON.stringify(emptySetupState())
        && JSON.stringify(normalizeSetupState([1, 2])) === JSON.stringify(emptySetupState()));
    const dirty = normalizeSetupState({ dismissed: 'yes', skipped: ['money', 'bogus', 'money', 5], last: 'nope', trades: ['x y', 'roofing', 7], sheetShown: 1 });
    eq('bad parts fall back one by one', [dirty.dismissed, dirty.skipped, dirty.last, dirty.trades, dirty.sheetShown], [false, ['money'], null, ['roofing'], false]);
    check('trade list is bounded', normalizeSetupState({ trades: Array.from({ length: 50 }, (_, i) => `t${i}`) }).trades.length <= 12);
}
{
    // resume: where the sheet opens
    const facts = emptyFacts({ profile: { ...emptyFacts().profile, companyName: 'Acme', logoUrl: 'u' } });
    let p = computeProgress(facts, none);
    eq('opens at the first open step', startScreen(p, emptySetupState()), 'contact');
    const left = { ...emptySetupState(), last: 'pricebook' as SetupStepId };
    eq('resume opens the step the person left, if still open', startScreen(p, left), 'pricebook');
    const leftDone = { ...emptySetupState(), last: 'business' as SetupStepId };
    eq('...but not a step that is done meanwhile', startScreen(p, leftDone), 'contact');
    p = computeProgress(facts, { skipped: ['contact'] });
    eq('a skipped step is not reopened by itself', startScreen(p, { ...emptySetupState(), last: 'contact' }), 'money');
    const allSkipped = computeProgress(emptyFacts(), { skipped: [...STEP_IDS] });
    check('everything skipped: complete, summary screen', allSkipped.complete && startScreen(allSkipped, emptySetupState()) === 'finish');
    const full = computeProgress(emptyFacts({ crewFeature: 'ready', plan: 'premium' }), none);
    eq('navigation walks the list then the summary', [screenAfter(full, 'business'), screenAfter(full, 'team'), screenAfter(full, 'finish')], ['contact', 'finish', 'finish']);
    eq('Back from the first step has nowhere to go; from the summary it is the last step', [screenBefore(full, 'business'), screenBefore(full, 'finish'), screenBefore(full, 'contact')], [null, 'team', 'business']);
}
{
    // hint + first login
    const empty = computeProgress(emptyFacts(), none);
    const fresh = emptySetupState();
    const brandNew = { jobsCount: 0, clientsCount: 0, documentsCount: 0 };
    check('brand-new account sees the sheet once', shouldAutoOpen(empty, fresh, brandNew));
    check('...not again after it was shown', !shouldAutoOpen(empty, { ...fresh, sheetShown: true }, brandNew));
    check('...not when the person turned it off', !shouldAutoOpen(empty, { ...fresh, dismissed: true }, brandNew));
    check('...not for an account that already has jobs, clients or documents (it only gets the hint)', !shouldAutoOpen(empty, fresh, { ...brandNew, jobsCount: 1 }) && !shouldAutoOpen(empty, fresh, { ...brandNew, clientsCount: 2 }) && !shouldAutoOpen(empty, fresh, { ...brandNew, documentsCount: 1 }));
    check('...and an old account with gaps still gets the hint', shouldShowHint(computeProgress(emptyFacts({ jobsCount: 3, documentsCount: 5 }), none), fresh));
    check('nothing is shown before the account is read', !shouldShowHint(null, fresh) && !shouldAutoOpen(null, fresh, brandNew));
    check('the hint goes away when dismissed', !shouldShowHint(empty, { dismissed: true }));
    check('the hint goes away when every step is done or skipped', !shouldShowHint(computeProgress(emptyFacts(), { skipped: [...STEP_IDS] }), fresh));
}

// ---------------------------------------------------------------------------------------------------------------
// 5. trades -> starter kits
// ---------------------------------------------------------------------------------------------------------------
{
    eq('seven trades + Other, in the kit library order', SETUP_TRADES.map(t => t.id), [...STARTER_TRADES.map(t => t.id), OTHER_TRADE_ID]);
    check('the seven trades are the ones with starter kits', STARTER_TRADES.length === 7 && STARTER_TRADES.every(t => STARTER_KITS.some(k => k.trade === t.id)));
    eq('no trade, no kits', kitIdsForTrades([]), []);
    eq('Other brings no kits', kitIdsForTrades([OTHER_TRADE_ID]), []);
    eq('unknown trades are ignored', kitIdsForTrades(['space travel']), []);
    for (const t of STARTER_TRADES) {
        const ids = kitIdsForTrades([t.id]);
        check(`${t.id}: its kits, all of them, only theirs`, ids.length > 0 && ids.length === STARTER_KITS.filter(k => k.trade === t.id).length && ids.every(id => STARTER_KITS.find(k => k.id === id)?.trade === t.id));
    }
    eq('all trades together = every kit', kitIdsForTrades(STARTER_TRADES.map(t => t.id)).sort(), STARTER_KITS.map(k => k.id).sort());
    eq('Other next to a trade changes nothing', kitIdsForTrades(['kitchen', OTHER_TRADE_ID]), kitIdsForTrades(['kitchen']));
    eq('toggle adds then removes, keeping list order', [toggleTrade([], 'roofing'), toggleTrade(['roofing'], 'bathroom'), toggleTrade(['bathroom', 'roofing'], 'bathroom')], [['roofing'], ['bathroom', 'roofing'], ['roofing']]);
    eq('normalize drops junk and duplicates', normalizeTradeIds(['kitchen', 'kitchen', 7, 'x']), ['kitchen']);
    eq('trades with kits leave out Other', tradesWithKits(['plumbing', OTHER_TRADE_ID]), ['plumbing']);
    // the existing importer: duplicates skipped, labor takes the user's rate
    const ids = kitIdsForTrades(['kitchen', 'painting']);
    let n = 0;
    const plan = planStarterImport(ids, [], { laborRate: 80, newId: () => `id${n++}` });
    check('importer: every chosen kit becomes a price-book row', plan.rows.length === ids.length && plan.skipped.length === 0);
    const second = planStarterImport(ids, plan.rows.map(r => r.name), { laborRate: 80, newId: () => 'x' });
    check('importer: running it again imports nothing and skips all (no duplicates)', second.rows.length === 0 && second.skipped.length === ids.length);
    const partial = planStarterImport(ids, [plan.rows[0].name.toUpperCase()], { laborRate: 80, newId: () => 'x' });
    check('importer: one name already there (any case) is skipped, the rest still import', partial.rows.length === ids.length - 1 && partial.skipped.length === 1);
}

// ---------------------------------------------------------------------------------------------------------------
// 6. tax + terms defaults
// ---------------------------------------------------------------------------------------------------------------
{
    const estimate = { taxRate: 0, terms: 'old terms', notes: '', issueDate: '2026-11-16', title: 'x' };
    const invoice = { taxRate: 0, notes: 'Thank you for your business.', issueDate: '2026-11-16', dueDate: '2026-12-16', title: 'x' };
    check('nothing set: documents start exactly as before', applyMoneyDefaults('Estimate', estimate, null) === estimate && applyMoneyDefaults('Invoice', invoice, emptyMoneyDefaults()) === invoice);
    const d = normalizeMoneyDefaults({ taxRate: 8.25, dueDays: 14, estimateTerms: 'A 50% deposit starts the work.', invoiceNote: 'Pay within 14 days.' });
    eq('estimate: tax and terms only', applyMoneyDefaults('Estimate', estimate, d), { ...estimate, taxRate: 8.25, terms: 'A 50% deposit starts the work.' });
    eq('invoice: tax, due date and note', applyMoneyDefaults('Invoice', invoice, d), { ...invoice, taxRate: 8.25, dueDate: '2026-11-30', notes: 'Pay within 14 days.' });
    const taxOnly = normalizeMoneyDefaults({ taxRate: 7 });
    eq('only the fields set change (tax only)', applyMoneyDefaults('Invoice', invoice, taxOnly), { ...invoice, taxRate: 7 });
    const receipt = { taxRate: 0, notes: 'n' };
    check('other document types are never touched', applyMoneyDefaults('Receipt', receipt, d) === receipt && applyMoneyDefaults('Work Order', receipt, d) === receipt);
    check('the base object is not changed in place', estimate.taxRate === 0 && estimate.terms === 'old terms' && invoice.dueDate === '2026-12-16');
    eq('due on receipt = the issue date', applyMoneyDefaults('Invoice', invoice, normalizeMoneyDefaults({ dueDays: 0 })).dueDate, '2026-11-16');
    eq('due days cross a year end', applyMoneyDefaults('Invoice', { ...invoice, issueDate: '2026-12-20' }, normalizeMoneyDefaults({ dueDays: 30 })).dueDate, '2027-01-19');
    eq('out-of-range numbers become "not set"', [normalizeMoneyDefaults({ taxRate: 99 }).taxRate, normalizeMoneyDefaults({ taxRate: -1 }).taxRate, normalizeMoneyDefaults({ dueDays: 9999 }).dueDays, normalizeMoneyDefaults({ taxRate: 'abc' }).taxRate], [null, null, null, null]);
    eq('a comma decimal is understood', normalizeMoneyDefaults({ taxRate: '8,25' }).taxRate, 8.25);
    check('0% tax is a real choice (not "not set")', normalizeMoneyDefaults({ taxRate: 0 }).taxRate === 0 && hasMoneyDefaults(normalizeMoneyDefaults({ taxRate: 0 })));
    check('empty record = none', !hasMoneyDefaults(normalizeMoneyDefaults({})) && !hasMoneyDefaults(normalizeMoneyDefaults(null)) && !hasMoneyDefaults(null));
    check('text is trimmed and bounded', normalizeMoneyDefaults({ estimateTerms: '  hi  ' }).estimateTerms === 'hi' && normalizeMoneyDefaults({ invoiceNote: 'x'.repeat(5000) }).invoiceNote.length === 1500);
    check('entry problems read plainly', moneyEntryProblem({ taxRate: '8.25', dueDays: '30' }) === null && moneyEntryProblem({ taxRate: '', dueDays: '' }) === null
        && /percent/.test(moneyEntryProblem({ taxRate: '300', dueDays: '' }) || '') && /days/i.test(moneyEntryProblem({ taxRate: '', dueDays: '-3' }) || ''));
    check('due choices are sane', DUE_DAY_CHOICES.length >= 5 && DUE_DAY_CHOICES[0].days === 0 && DUE_DAY_CHOICES.some(c => c.days === 30));
    // the totals still follow the app's money math
    const totals = computeDocumentTotals({ lineItems: [{ quantity: 2, rate: 100 }], taxRate: applyMoneyDefaults('Estimate', { taxRate: 0 }, d).taxRate });
    check('a default tax rate flows through the shared money math', totals.tax === 16.5 && totals.total === 216.5, totals);
}

// ---------------------------------------------------------------------------------------------------------------
// 7. example project
// ---------------------------------------------------------------------------------------------------------------
{
    const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333', D = '44444444-4444-4444-8444-444444444444';
    check('example names all say Example', [EXAMPLE_CLIENT_NAME, EXAMPLE_JOB_NAME, EXAMPLE_ESTIMATE_TITLE].every(n => /^Example\b/.test(n)));
    const est = buildExampleEstimate({
        profile: { companyName: 'Rivera', address: '1 Main St', phone: '555', website: '', logoUrl: '' }, estimateNumber: 'EST-2026-11-001', today: '2026-11-16',
        design: { templateId: 'classic', themeColors: { primary: '#000', secondary: '#666' } }, money: normalizeMoneyDefaults({ taxRate: 10, estimateTerms: 'Deposit 50%.' }),
        newId: (() => { let i = 0; return () => `l${i++}`; })(), addDays: (iso, days) => (days === 30 ? '2026-12-16' : iso),
    });
    check('example estimate: draft, labelled, a few lines', est.status === 'Draft' && String(est.title).startsWith('Example') && (est.lineItems as unknown[]).length >= 3 && (est.lineItems as unknown[]).length <= 6);
    check('example estimate: client is the example client, never a real one', est.clientName === EXAMPLE_CLIENT_NAME && /example/i.test(String(est.clientAddress)));
    check('example estimate: carries the company details and the default design', est.companyName === 'Rivera' && est.templateId === 'classic');
    check('example estimate: the tax and terms defaults apply', est.taxRate === 10 && est.terms === 'Deposit 50%.');
    check('example estimate: totals are computed by the shared math', computeDocumentTotals({ lineItems: est.lineItems as never, taxRate: est.taxRate as number }).total > 0);
    check('example estimate says it is an example', /example/i.test(String(est.notes)));
    const t = { v: 1 as const, clientId: A, jobId: B, documentIds: [C], createdAt: 'x' };
    eq('tracking survives JSON', normalizeExample(JSON.parse(JSON.stringify(t))), t);
    check('garbage tracking is empty', !hasExample(normalizeExample('x')) && !hasExample(normalizeExample({ clientId: 'not-an-id', jobId: 5, documentIds: ['x'] })) && !hasExample(null));
    check('tracking with only a client counts (a failure halfway is removable)', hasExample({ ...emptyExample(), clientId: A }));
    check('tracking is bounded and unique', normalizeExample({ documentIds: Array.from({ length: 30 }, () => C) }).documentIds.length === 1);
    // removal: exactly its own rows
    eq('everything the example made is removed when nothing else is there', planExampleRemoval(t, { documentsInJob: [C], jobsOfClient: [B] }), { deleteDocumentIds: [C], deleteJobId: B, deleteClientId: A, kept: '' });
    const own = planExampleRemoval(t, { documentsInJob: [C, D], jobsOfClient: [B] });
    check('a document the person added to the example job keeps the job (and the client) and says so', own.deleteDocumentIds.join() === C && own.deleteJobId === null && own.deleteClientId === null && /job was kept/.test(own.kept), own);
    const otherJob = planExampleRemoval(t, { documentsInJob: [C], jobsOfClient: [B, D] });
    check('another job on the example client keeps the client', otherJob.deleteJobId === B && otherJob.deleteClientId === null && /client was kept/.test(otherJob.kept), otherJob);
    const alreadyGone = planExampleRemoval(t, { documentsInJob: [], jobsOfClient: [] });
    check('already deleted by hand: still cleans the rest', alreadyGone.deleteJobId === B && alreadyGone.deleteClientId === A);
    const ids = new Set([A, B, C, D]);
    const onlyOwn = planExampleRemoval(t, { documentsInJob: [C, D], jobsOfClient: [B, D] });
    check('never deletes an id it did not create', [...onlyOwn.deleteDocumentIds, onlyOwn.deleteJobId, onlyOwn.deleteClientId].filter(Boolean).every(id => [A, B, C].includes(id as string)) && !onlyOwn.deleteDocumentIds.includes(D) && ids.size === 4);
    check('empty tracking removes nothing', (() => { const r = planExampleRemoval(emptyExample(), { documentsInJob: [A], jobsOfClient: [B] }); return r.deleteDocumentIds.length === 0 && r.deleteJobId === null && r.deleteClientId === null; })());
    // Free-plan room
    const limits = { jobs: 6, clients: 15, docs: 12 };
    const u = (over: object) => ({ paid: false, fromServer: true, jobsThisMonth: 0, clientsThisMonth: 0, limits, ...over });
    check('Free with room: ok', exampleRoom(u({ jobsThisMonth: 5, clientsThisMonth: 14 })).ok);
    check('Free at the job limit: skipped with a friendly sentence', !exampleRoom(u({ jobsThisMonth: 6 })).ok && exampleRoom(u({ jobsThisMonth: 6 })).reason === EXAMPLE_LIMIT_MESSAGE);
    check('Free at the client limit: skipped', !exampleRoom(u({ clientsThisMonth: 15 })).ok);
    check('jobs / clients waiting offline take a slot', !exampleRoom(u({ jobsThisMonth: 5, pendingJobs: 1 })).ok && !exampleRoom(u({ clientsThisMonth: 14, pendingClients: 1 })).ok);
    check('paid plans have no limit', exampleRoom(u({ paid: true, jobsThisMonth: 99, clientsThisMonth: 99, limits: { jobs: null, clients: null, docs: null } })).ok);
    check('numbers that are only a local count never block (the database decides)', exampleRoom(u({ fromServer: false, jobsThisMonth: 99 })).ok);
    check('the limit sentence is friendly: no jargon, says nothing changed', /Nothing was changed/.test(EXAMPLE_LIMIT_MESSAGE) && !/PLAN_LIMIT|error/i.test(EXAMPLE_LIMIT_MESSAGE));
}

// ---------------------------------------------------------------------------------------------------------------
// 8. plan gating of the design and crew steps
// ---------------------------------------------------------------------------------------------------------------
{
    check('Free: Basic designs only (Classic yes, a Premium design no)', canUseDesign('free', 'classic') && !canUseDesign('free', 'executive') && !canUsePremiumDesigns('free'));
    check('Premium and Premium + AI: all designs', canUseDesign('premium', 'executive') && canUseDesign('ai', 'executive') && canUsePremiumDesigns('premium-ai'));
    check('the design step is shown to every plan (Premium ones carry the upgrade prompt)', ['free', 'premium', 'ai'].every(plan => stepApplies('look', emptyFacts({ plan }))));
    const crew = (plan: string | null | undefined, feature: SetupFacts['crewFeature']) => stepApplies('team', emptyFacts({ plan, crewFeature: feature }));
    check('Free never sees the Team step', !crew('free', 'ready') && !crew(null, 'ready') && !crew(undefined, 'ready') && !crew('', 'ready'));
    check('Premium and Premium + AI see it when crew links exist in the database', crew('premium', 'ready') && crew('ai', 'ready') && crew('premium-ai', 'ready') && crew('pro', 'ready'));
    check('...and not before the crew tables exist or while that is unknown', !crew('premium', 'missing') && !crew('ai', 'unknown'));
    check('the Free step list never changes the required count because of Team', computeProgress(emptyFacts({ plan: 'premium' }), none).total === computeProgress(emptyFacts({ plan: 'free' }), none).total);
    const prem = computeProgress(emptyFacts({ plan: 'premium', crewCount: 0 }), none);
    check('Team shows as an open optional step on Premium but never blocks finishing', prem.steps.some(s => s.id === 'team' && s.status === 'todo' && !s.required)
        && computeProgress(fullFacts({ plan: 'premium', crewCount: 0 }), none).complete);
    check('a skipped Team step is skipped, a worker makes it done', computeProgress(emptyFacts({ plan: 'premium' }), { skipped: ['team'] }).steps.find(s => s.id === 'team')?.status === 'skipped'
        && computeProgress(emptyFacts({ plan: 'premium', crewCount: 1 }), none).steps.find(s => s.id === 'team')?.status === 'done');
}

// ---------------------------------------------------------------------------------------------------------------
// 9. wiring
// ---------------------------------------------------------------------------------------------------------------
{
    const userData = read('lib/userData.ts');
    check('storage keys match lib/userData.ts', userData.includes(`'${SETUP_STATE_SETTING}'`) && userData.includes(`'${MONEY_DEFAULTS_SETTING}'`) && userData.includes(`'${SETUP_EXAMPLE_SETTING}'`));
    check('the user-data header documents the three keys', ['setup.state', 'documents.money', 'setup.example'].every(k => userData.split('\n').slice(0, 40).join('\n').includes(`'${k}'`)));
    const app = read('App.tsx');
    check('App mounts the host once, behind lazy loading, with the real save paths', app.includes("import('./components/setup/SetupHost.tsx')") && app.includes('<SetupHost') && app.includes('saveProfile={handleSaveProfile}') && app.includes('createJob={(values) => handleSaveJob(values, true)}'));
    check('App passes the hint to the dashboard and the section to Settings', app.includes('setupSlot=') && (app.match(/setupSlot=/g) || []).length === 2 && app.includes('variant="dashboard"') && app.includes('variant="settings"'));
    check('the dashboard renders the slot', read('components/DashboardScreen.tsx').includes('{setupSlot}'));
    check('Settings renders the slot', read('components/Settings.tsx').includes('{setupSlot}'));
    check('new documents start with the money defaults (one line, Estimate and Invoice only)', read('components/forms/useDocumentForm.ts').includes('applyMoneyDefaults(formType'));
    const tour = read('components/help/TourHost.tsx');
    check('the tour tells the assistant when it is finished, and is otherwise unchanged', tour.includes("'cd:tour-closed'") && tour.includes('saveAppTourSeen(userId)') && read('lib/setup/store.ts').includes("'cd:tour-closed'"));
    const host = read('components/setup/SetupHost.tsx');
    check('the host waits for the tour and for other dialogs', host.includes('loadAppTourSeen') && host.includes('TOUR_CLOSED_EVENT') && host.includes('otherDialogOpen'));
    check('offline: the wizard memory goes up to the account when the connection returns', host.includes('loadSetupStateRaw().catch') && host.includes('isOnline && stateLoaded'));
    check('a name saved without a logo counts as a finished step (the logo part is skipped, and the rail says so)', read('components/setup/SetupSteps.tsx').includes("ctx.markSkipped('business')") && read('components/setup/SetupSheet.tsx').includes('Name saved, no logo'));
    check('the design step follows the picker without waiting for Continue', read('components/setup/SetupStepsMore.tsx').includes('currentDesignDefault()') && read('components/setup/SetupStepsMore.tsx').includes('DocumentDesignSettings'));
    const sheet = read('components/setup/SetupSheet.tsx');
    check('the sheet is a dismissible dialog, never a route', sheet.includes('role="dialog"') && sheet.includes('Skip for now') && !/navigate\(['"]\/setup/.test(sheet + host));
    const api = read('components/setup/setupApi.ts');
    check('the example project uses the app paths (client, job, document) and needs a connection', api.includes('insertClient') && api.includes('upsertDocumentRecord') && api.includes('createJob') && api.includes('NEEDS_CONNECTION') && api.includes('isBrowserOffline'));
    check('no new database objects and no AI calls in the setup code', ![api, host, sheet, read('components/setup/SetupSteps.tsx'), read('components/setup/SetupStepsMore.tsx'), ...readdirSync(join(root, 'lib/setup')).map(f => read(`lib/setup/${f}`))]
        .some(s => /create table|alter table|supabase\.functions|invokeFunction|ai-assistant|src\/ai\//i.test(s)));
    check('no migration was added for this batch', !readdirSync(join(root, 'supabase/migrations')).some(f => /setup|onboard/i.test(f)));
    const written = [...api.matchAll(/supabase\s*\.from\('([a-z_]+)'\)\s*\.(insert|update|upsert|delete)/g)].map(m => `${m[1]}.${m[2]}`);
    check('the only direct writes are the price-book insert and the three example deletes', written.sort().join() === ['clients.delete', 'documents.delete', 'jobs.delete', 'saved_items.insert'].sort().join(), written);
    const audit = WRITE_PATHS.filter(r => r.file === 'components/setup/setupApi.ts');
    check('every one of them is in the offline audit (kits queue, deletes need a connection)', audit.length === 4 && audit.filter(r => r.offline === 'queue').length === 1 && audit.filter(r => r.offline === 'needs_connection').length === 3);
    // owner rules
    const all = [host, sheet, api, read('components/setup/SetupSteps.tsx'), read('components/setup/SetupStepsMore.tsx'), read('components/setup/SetupHint.tsx'), read('components/setup/StepFrame.tsx'), ...readdirSync(join(root, 'lib/setup')).map(f => read(`lib/setup/${f}`))].join('\n');
    check('never mentions the billing provider or merchant of record', !/kelviq|merchant of record/i.test(all + JSON.stringify(getGuide('setup-assistant'))));
    check('the starter-price warning is shown with the kits', read('components/setup/SetupStepsMore.tsx').includes('STARTER_PRICES_NOTE') && /Starter prices: set your own/.test(read('lib/assemblies/starterKits.ts')));
    // help text
    const g = getGuide('setup-assistant');
    check('help guide is listed once, in Start here, with steps and tips', !!g && g.group === 'Start here' && g.steps.length >= 8 && (g.tips || []).length >= 3);
    const src = [all, read('components/Settings.tsx')].join('\n');
    const labels = (JSON.stringify(g).match(/\[\[([^\]]+)\]\]/g) || []).map(l => l.slice(2, -2));
    const missing = labels.filter(l => !src.includes(`'${l}'`) && !src.includes(`>${l}<`) && !src.includes(`>${l}`) && !src.includes(`${l}{`));
    eq('every [[label]] of the guide is on screen', missing, []);
    check('the guide uses chips', labels.length >= 6);
    // translations: every language has every chrome key, in its own words
    const keys = ['setupLabel', 'setupOf', 'setupContinue', 'setupHide', 'setupSkipForNow', 'setupTitle', 'setupSave', 'setupBack', 'setupSkipStep', 'setupAllSteps', 'setupDone', 'setupResume'];
    const langs = Object.keys(translations);
    check('every language has all the setup strings', langs.every(l => keys.every(k => typeof translations[l][k] === 'string' && translations[l][k].length > 0)), langs.filter(l => keys.some(k => !translations[l][k])));
    check('the other languages are translated (not copies of English)', langs.filter(l => l !== 'English').every(l => translations[l].setupContinue !== translations.English.setupContinue && translations[l].setupTitle !== translations.English.setupTitle));
    check('chrome strings are used through the translation table', read('components/setup/SetupHint.tsx').includes('t.setupLabel') && sheet.includes('t.setupTitle') && read('components/setup/StepFrame.tsx').includes('ctx.t.setupSave'));
    check('files of this batch exist', ['lib/setup/steps.ts', 'lib/setup/state.ts', 'lib/setup/trades.ts', 'lib/setup/moneyDefaults.ts', 'lib/setup/example.ts', 'lib/setup/store.ts', 'components/setup/SetupSheet.tsx'].every(f => existsSync(join(root, f))));
}

console.log(`setup-check: ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  FAIL ${f}`); process.exit(1); }
