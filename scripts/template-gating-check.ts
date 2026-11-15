/**
 * Checks for the document-design plan rules (owner decision 2026-11-14, lib/designAccess.ts):
 *  - Basic designs (Classic + the 10 original Standard designs) on every plan, Premium designs on paid plans only;
 *  - a document that already uses a Premium design keeps it (renders, downloads, can be kept while editing on Free),
 *    but a Free user can't switch it to another Premium design or customize it;
 *  - new documents start with the user's default design (Premium default → Classic on Free), AI drafts can't put a
 *    Premium design on a Free user's document, and the default-design setting refuses Premium designs on Free;
 *  - the picker opens the upgrade window for locked designs (source checks) and the plan copy says so.
 *   npx tsx scripts/template-gating-check.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormType } from '../types.ts';
import {
    ALL_TEMPLATE_IDS, BASIC_TEMPLATE_IDS, DEFAULT_TEMPLATE_ID, DESIGN_GROUPS, TEMPLATES, getTemplateMeta, isPremiumDesign, resolveTemplateId,
} from '../utils/templates/registry.ts';
import { renderDocument, SAMPLE_DOCUMENTS, SAMPLE_JOB, SAMPLE_PROFILE } from '../utils/templates/index.ts';
import {
    DESIGN_DEFAULT_SETTING, applyDesignDefault, basicFallbackId, canUseDesign, canUsePremiumDesigns, designAllowedFor, designDefaultFor,
    designDefaultFromDocument, designPlan, enforceDocumentDesign, isGrandfathered, normalizeDesignDefault, readUserDesignDefault,
    replacedDesignMessage, requestDesignUpgrade, saveUserDesignDefault, setDesignPlan,
} from '../lib/designAccess.ts';
import { DESIGN_DEFAULT_KEY } from '../lib/userData.ts';
import { mergeDraftIntoForm } from '../hooks/useDocumentDraftPrefill.ts';
import { PLANS } from '../lib/plans.ts';
import { defaultWithDesign, designDefaultSummary } from '../components/settings/DocumentDesignSettings.tsx';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8');

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else { failures++; console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);

const premiumIds = TEMPLATES.filter((t) => t.tier === 'premium').map((t) => t.id);
const basicIds = TEMPLATES.filter((t) => t.tier === 'basic').map((t) => t.id);
const P1 = premiumIds[0];
const P2 = premiumIds[1];
const B1 = 'standard';

// ------------------------------------------------------------------------------------------------- tiers
eq('two picker groups only: Basic, Premium', DESIGN_GROUPS.map((g) => g.id), ['basic', 'premium']);
ok('every design has a tier', TEMPLATES.every((t) => t.tier === 'basic' || t.tier === 'premium'));
eq('Basic = Classic + the 10 original Standard designs', [...basicIds].sort(), [...BASIC_TEMPLATE_IDS].sort());
eq('Basic designs come first in the picker', TEMPLATES.slice(0, basicIds.length).map((t) => t.tier), basicIds.map(() => 'basic'));
ok('Classic (the default of new documents) is Basic', !isPremiumDesign(DEFAULT_TEMPLATE_ID));
ok('there are Premium designs', premiumIds.length >= 14);
ok('every registered id has a tier and resolves to itself', ALL_TEMPLATE_IDS.every((id) => resolveTemplateId(id) === id && !!getTemplateMeta(id).tier));

// ------------------------------------------------------------------------------------------------- rules
for (const [plan, paid] of [['free', false], ['premium', true], ['ai', true], ['Premium', true], ['Basic', false], [null, false], ['', false]] as const) {
    eq(`canUsePremiumDesigns(${plan})`, canUsePremiumDesigns(plan), paid);
    ok(`${plan}: every Basic design allowed`, basicIds.every((id) => canUseDesign(plan, id)));
    eq(`${plan}: Premium designs allowed`, premiumIds.every((id) => canUseDesign(plan, id)), paid);
}
ok('free: a kept Premium design (same id) is allowed', designAllowedFor('free', P1, P1));
ok('free: another Premium design is not allowed', !designAllowedFor('free', P2, P1));
ok('free: a Basic design is always allowed, even from a Premium baseline', designAllowedFor('free', B1, P1));
ok('free: legacy/alias spellings of the kept design count as the same design', designAllowedFor('free', P1.toUpperCase(), P1));
ok('paid: anything', designAllowedFor('premium', P2, B1) && designAllowedFor('ai', P2, null));
ok('grandfathered = Premium design on Free', isGrandfathered('free', P1) && !isGrandfathered('premium', P1) && !isGrandfathered('free', B1));
ok('unknown ids fall back to Classic (Basic)', canUseDesign('free', 'no-such-design'));

// ------------------------------------------------------------------------------------------- enforce on save
{
    const opts = { header: 'centered', table: 'boxed' };
    // new document on Free with a Premium design (AI draft, tampered data): replaced by the fallback
    const r1 = enforceDocumentDesign({ templateId: P1, designOptions: opts, invoiceNumber: 'INV-1' }, 'free', { templateId: DEFAULT_TEMPLATE_ID }, B1);
    ok('free/new: Premium design replaced', r1.replaced && (r1.data as any).templateId === B1);
    ok('free/new: customization dropped with it', !('designOptions' in (r1.data as any)));
    eq('free/new: the rest of the document is untouched', (r1.data as any).invoiceNumber, 'INV-1');
    ok('free/new: message names both designs', replacedDesignMessage(r1).includes(getTemplateMeta(P1).name) && replacedDesignMessage(r1).includes(getTemplateMeta(B1).name));
    // the fallback itself can never be Premium
    const r2 = enforceDocumentDesign({ templateId: P1 }, 'free', null, P2);
    eq('free: a Premium fallback becomes Classic', (r2.data as any).templateId, DEFAULT_TEMPLATE_ID);
    // grandfathered document: kept as is
    const saved = { templateId: P1, designOptions: opts, notes: 'x' };
    const r3 = enforceDocumentDesign({ ...saved, notes: 'edited' }, 'free', { templateId: P1, designOptions: opts });
    ok('free/kept: the document keeps its Premium design and customization', !r3.replaced && (r3.data as any).templateId === P1 && JSON.stringify((r3.data as any).designOptions) === JSON.stringify(opts));
    // grandfathered, switched to another Premium design: refused
    const r4 = enforceDocumentDesign({ ...saved, templateId: P2 }, 'free', { templateId: P1, designOptions: opts }, B1);
    ok('free/kept: switching to another Premium design is refused', r4.replaced && (r4.data as any).templateId === B1);
    // grandfathered, customization changed on Free: reverted to what the document had
    const r5 = enforceDocumentDesign({ ...saved, designOptions: { header: 'band' } }, 'free', { templateId: P1, designOptions: opts });
    ok('free/kept: customization changes are reverted', !r5.replaced && JSON.stringify((r5.data as any).designOptions) === JSON.stringify(opts));
    const r6 = enforceDocumentDesign({ templateId: P1, designOptions: { header: 'band' } }, 'free', { templateId: P1 });
    ok('free/kept without customization: added customization is removed', !('designOptions' in (r6.data as any)));
    // switched back to Basic and then to the kept design again (same session): allowed
    ok('free/kept: back to the opened design is allowed', !enforceDocumentDesign({ templateId: P1 }, 'free', { templateId: P1 }).replaced);
    // paid plans: untouched (same object)
    const doc = { templateId: P2, designOptions: { header: 'band' } };
    ok('paid: untouched', enforceDocumentDesign(doc, 'premium', { templateId: B1 }).data === doc && enforceDocumentDesign(doc, 'ai', null).data === doc);
    // Basic designs and documents without a design: untouched
    const basicDoc = { templateId: B1 };
    ok('free: Basic design untouched', enforceDocumentDesign(basicDoc, 'free', null).data === basicDoc);
    const noDesign = { invoiceNumber: 'x' };
    ok('free: no design untouched', enforceDocumentDesign(noDesign, 'free', null).data === noDesign);
}

// --------------------------------------------------------------------------- existing documents still render
for (const id of premiumIds) {
    const r = renderDocument(FormType.Invoice, { ...SAMPLE_DOCUMENTS.invoice, templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB, { noFontLink: true });
    ok(`saved document with Premium design ${id} renders with it (rendering never checks the plan)`, r.templateId === id && r.html.includes(`cd-t-${id} `));
}

// ------------------------------------------------------------------------------------------- default design
{
    eq('setting key matches lib/userData.ts', DESIGN_DEFAULT_SETTING, DESIGN_DEFAULT_KEY);
    eq('garbage default → null', [normalizeDesignDefault(null), normalizeDesignDefault('x'), normalizeDesignDefault({}), normalizeDesignDefault({ templateId: '  ' })], [null, null, null, null]);
    const def = normalizeDesignDefault({
        templateId: P1, themeColors: { primary: '#123456', secondary: 'red;}', custom: true, font: 'lora', paper: 'a4' },
        designOptions: { header: 'band', bogus: 1, hide: ['notes', 'nope'] }, extra: 'x',
    });
    eq('default normalized', def, { templateId: P1, themeColors: { primary: '#123456', secondary: '', custom: true, font: 'lora', paper: 'a4' }, designOptions: { header: 'band', hide: ['notes'] } });
    eq('legacy id in a default resolves', normalizeDesignDefault({ templateId: 'Modern Blue' })?.templateId, 'modern_blue');
    eq('free: Premium default becomes Classic, colors kept, customization dropped', designDefaultFor(def, 'free'), { templateId: DEFAULT_TEMPLATE_ID, themeColors: def!.themeColors });
    eq('paid: default as is', designDefaultFor(def, 'premium'), def);
    eq('no default → Classic', designDefaultFor(null, 'premium'), { templateId: DEFAULT_TEMPLATE_ID });
    eq('fallback = Basic default, else Classic', [basicFallbackId(def), basicFallbackId({ templateId: B1 }), basicFallbackId(null)], [DEFAULT_TEMPLATE_ID, B1, DEFAULT_TEMPLATE_ID]);

    const base = { invoiceNumber: 'INV-9', templateId: DEFAULT_TEMPLATE_ID, themeColors: { primary: '#000000', secondary: '#666666' } };
    const paidNew = applyDesignDefault(base, def, 'premium') as any;
    ok('new document (paid): default design, colors, paper and customization applied', paidNew.templateId === P1 && paidNew.themeColors.primary === '#123456' && paidNew.themeColors.custom === true && paidNew.themeColors.paper === 'a4' && paidNew.designOptions.header === 'band' && paidNew.invoiceNumber === 'INV-9');
    const freeNew = applyDesignDefault(base, def, 'free') as any;
    ok('new document (free): Classic with the default colors, no customization', freeNew.templateId === DEFAULT_TEMPLATE_ID && freeNew.themeColors.primary === '#123456' && !('designOptions' in freeNew));
    const seeded = { ...base, templateId: P2 };
    ok('a design passed in by the caller (convert / revise) is never replaced', applyDesignDefault(seeded, def, 'premium') === seeded);
    ok('no default → defaults untouched', applyDesignDefault(base, null, 'premium') === base);
    const basicDefault = applyDesignDefault(base, { templateId: B1 }, 'free') as any;
    ok('Basic default on Free', basicDefault.templateId === B1 && basicDefault.themeColors.primary === '#000000');

    const fromDoc = designDefaultFromDocument({ templateId: P2, themeColors: { primary: '#abcdef', secondary: '#123123', custom: true }, designOptions: { density: 'compact' }, notes: 'x' }) as any;
    // updatedAt is "now" at call time: compare it separately so a millisecond tick between two calls can't fail the check
    ok('default from a document has a timestamp', typeof fromDoc.updatedAt === 'string' && Math.abs(Date.now() - Date.parse(fromDoc.updatedAt)) < 5000);
    eq('default from a document', { ...fromDoc, updatedAt: 'x' },
        { templateId: P2, themeColors: { primary: '#abcdef', secondary: '#123123', custom: true }, designOptions: { density: 'compact' }, updatedAt: 'x' });

    const saved: unknown[] = [];
    const store = { readLocal: () => saved[saved.length - 1] ?? null, load: async () => saved[saved.length - 1] ?? null, save: async (v: unknown) => { saved.push(v); return 'account'; } };
    void (async () => {
        eq('free: saving a Premium default is refused (upgrade window)', await saveUserDesignDefault(store, { templateId: P1 }, 'free'), 'locked');
        eq('nothing stored after a refused default', saved.length, 0);
        eq('free: Basic default saved', await saveUserDesignDefault(store, { templateId: B1 }, 'free'), 'account');
        eq('paid: Premium default saved', await saveUserDesignDefault(store, { templateId: P1, designOptions: { table: 'striped' } }, 'premium'), 'account');
        eq('stored default reads back', readUserDesignDefault(store)?.templateId, P1);
        eq('reset (null) stores Classic', [await saveUserDesignDefault(store, null, 'free'), readUserDesignDefault(store)?.templateId], ['account', DEFAULT_TEMPLATE_ID]);
        // Settings > Document design: choosing a design keeps colors/font/paper, drops layout options of the old design
        const cur = { templateId: P1, themeColors: { primary: '#123456', secondary: '#654321', custom: true, paper: 'a4' as const }, designOptions: { table: 'striped' } } as any;
        const next = defaultWithDesign(cur, B1) as any;
        ok('settings: new design keeps colors and paper, drops layout options', next.templateId === B1 && next.themeColors.primary === '#123456' && next.themeColors.paper === 'a4' && !('designOptions' in next));
        const before = saved.length;
        eq('settings: Free user choosing a Premium design is refused and nothing is stored', [await saveUserDesignDefault(store, defaultWithDesign(null, P2), 'free'), saved.length], ['locked', before]);
        ok('settings: summary lists accent, paper and layout', designDefaultSummary(cur) === 'Accent #123456 · A4 · customized layout' && designDefaultSummary(null) === 'Template colors');
        const doc = read('components/settings/DocumentDesignSettings.tsx');
        ok('settings: uses the shared store and upgrade window', doc.includes('saveDesignDefault(value, plan)') && doc.includes('requestDesignUpgrade(') && doc.includes('Reset to Classic') && doc.includes('loadDesignDefault'));
        const st = read('components/Settings.tsx');
        ok('settings: Document design section is in the nav and the page', st.includes("{ id: 'documents', label: 'Document design' }") && st.includes('<Section id="documents"'));
        const broken = { readLocal: () => { throw new Error('storage'); } };
        eq('unreadable device copy → no default', readUserDesignDefault(broken), null);
        finish();
    })();
}

// ------------------------------------------------------------------------------------------- AI drafts
{
    const base = { invoiceNumber: 'INV-1', templateId: DEFAULT_TEMPLATE_ID, lineItems: [] };
    setDesignPlan('free');
    eq('plan store', designPlan(), 'free');
    const free = mergeDraftIntoForm(FormType.Invoice, base, { templateId: P1, clientName: 'Ann' }).data as any;
    ok('free: an AI draft cannot put a Premium design on the document', free.templateId === DEFAULT_TEMPLATE_ID && free.clientName === 'Ann');
    const freeBasic = mergeDraftIntoForm(FormType.Invoice, base, { templateId: B1 }).data as any;
    eq('free: an AI draft can pick a Basic design', freeBasic.templateId, B1);
    setDesignPlan('premium');
    const paid = mergeDraftIntoForm(FormType.Invoice, base, { templateId: P1 }).data as any;
    eq('paid: an AI draft can pick a Premium design', paid.templateId, P1);
    setDesignPlan(null);
    eq('logged out → treated as Free', designPlan(), 'free');
}

// ------------------------------------------------------------------------------------------- upgrade window
{
    const seen: string[] = [];
    const g = globalThis as any;
    const prev = g.window;
    g.window = new EventTarget();
    g.window.addEventListener('contractordocs:upgrade', (e: Event) => seen.push(String((e as CustomEvent).detail?.message || '')));
    requestDesignUpgrade(getTemplateMeta(P1).name);
    g.window = prev;
    ok('locked design opens the upgrade window with a reason', seen.length === 1 && seen[0].includes(getTemplateMeta(P1).name) && /Premium/.test(seen[0]));
    const app = read('src/hooks/useAIAssistant.ts');
    ok('App listens to the upgrade event (useAIAssistant → onUpgrade)', app.includes('AI_UPGRADE_EVENT_NAME') && app.includes('onUpgrade?.(message)'));
}

// ------------------------------------------------------------------------------------------- source checks
{
    const form = read('components/forms/useDocumentForm.ts');
    ok('save enforces the design rules', /const save = useCallback[\s\S]{0,400}enforceDesign\(\)/.test(form));
    ok('download enforces the design rules', /const download = useCallback[\s\S]{0,400}enforceDesign\(\)/.test(form));
    ok('new documents use the default design', form.includes('applyDesignDefault(optsRef.current.makeDefaults(), currentDesignDefault(), designPlan())'));
    ok('baseline = the design the document opened with', form.includes('designBaselineRef.current = baselineOf(data)'));
    const picker = read('components/TemplateSelector.tsx');
    ok('picker: locked designs open the upgrade window', picker.includes("if (isLocked(id)) { requestDesignUpgrade(getTemplateMeta(id).name); return; }"));
    ok('picker: locked designs can be previewed', picker.includes("label: 'Upgrade to use'") && picker.includes('setPreviewId(t.id)'));
    ok('picker: note for a kept Premium design', picker.includes('You can keep it on the Free plan'));
    ok('picker: no Featured/New/Standard tabs', !/Featured|'new'|Standard designs/.test(picker));
    const sections = read('components/forms/Sections.tsx');
    ok('design section passes the plan and the opened design', sections.includes('plan={plan}') && sections.includes('baselineTemplateId={baseline}'));
    const app = read('App.tsx');
    ok('App sets the plan before forms render', app.includes('setDesignPlan(profile ? plan : null)'));
    const plans = PLANS.free.features.join(' ') + ' | ' + PLANS.premium.features.join(' ');
    ok('plan copy: Free has the Basic designs, Premium the Premium designs', /Basic PDF designs/i.test(PLANS.free.features.join(' ')) && /Premium PDF designs/i.test(PLANS.premium.features.join(' ')) && !/every PDF design/i.test(plans));
}

let finished = false;
function finish() {
    if (finished) return;
    finished = true;
    console.log(`template-gating-check: ${passes} passed, ${failures} failed`);
    if (failures) process.exit(1);
}
