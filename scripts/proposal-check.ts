/**
 * Proposal builder (roadmap N4) checks. Pure logic, no browser, no database:
 *   npx tsx scripts/proposal-check.ts
 * 1. optional add-ons: the ONE money rule (utils/money.ts) and every total that uses it (forms, portal, finance,
 *    costing, export, reminders copy, invoices), old documents unchanged
 * 2. payment milestones: math, validation, cent rounding (remainder on the last), milestone invoices (deposit /
 *    progress billing) add up to the estimate total
 * 3. scope section model, 4. images limits, 5. templates (save / apply / size / plan rule)
 * 6. signed lock, 7. PDF model + every design renders the new sections (and nothing changes without them)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    computeDocumentCost, computeDocumentTotals, countedLineItems, isExcludedOptionalLine, lineItemAmount, lineItemDisplayAmount, roundMoney,
} from '../utils/money.ts';
import { computeTotals as remindersTotals } from '../supabase/functions/reminders/shared/money.ts';
import { documentTotals as portalTotals } from '../utils/clientPortalRules.ts';
import { documentTotals as financeTotals } from '../lib/finance.ts';
import { documentMoney } from '../lib/export/model.ts';
import {
    PROPOSAL_LIMITS, PROPOSAL_TEMPLATE_LIMITS, PROPOSAL_TEMPLATES_MAX_CHARS, PROPOSAL_TEMPLATES_SETTING, addImage, addMilestone, addSection,
    applyProposalTemplate, bulletItems, computeMilestones, cumulativePercent, filledSections, hasProposalContent, imageProblem, mergeLines,
    moveSection, newMilestone, optionalLines, parseProposalTemplates, readProposal, regularLines, removeSection, serializeProposalTemplates,
    setLineOptional, setLineSelected, templateFromEstimate, templateSaveProblem, updateSection, upsertTemplate, withProposal, type Milestone,
} from '../lib/proposal.ts';
import { PROPOSAL_TEMPLATES_KEY } from '../lib/userData.ts';
import { buildInvoiceSeedFromEstimate, buildMilestoneInvoiceSeed, signedChangeProblem, signedContent } from '../components/forms/signedLock.ts';
import { normalizeLineItems } from '../components/forms/formUtils.ts';
import { buildDocumentModel } from '../utils/templates/model.ts';
import { renderDocument } from '../utils/templates/render.ts';
import { ALL_TEMPLATE_IDS, PREMIUM_TEMPLATE_IDS } from '../utils/templates/registry.ts';
import { SAMPLE_DOCUMENTS, SAMPLE_JOB, SAMPLE_PROFILE } from '../utils/templates/sampleData.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8');
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: unknown, detail?: unknown) => { if (ok) passed++; else failures.push(`${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`); };
const eq = (name: string, a: unknown, b: unknown) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------------------------------------------
// 1. optional add-ons: one money rule everywhere
// ---------------------------------------------------------------------------------------------------------------
const L = (id: string, description: string, quantity: number, rate: number, extra: Record<string, unknown> = {}) => ({ id, description, quantity, rate, unitCost: rate / 2, ...extra });
const BASE = { estimateNumber: 'EST-9', taxRate: 8.25, discount: 50, lineItems: [L('a', 'Demo', 1, 800), L('b', 'Tile', 120, 9.5)] };
const WITH_OPT = { ...BASE, lineItems: [...BASE.lineItems, L('o1', 'Heated floor', 1, 1200, { optional: true }), L('o2', 'Niche', 2, 175, { optional: true, selected: false })] };
const SELECTED = { ...WITH_OPT, lineItems: WITH_OPT.lineItems.map(li => (li.id === 'o2' ? { ...li, selected: true } : li)) };
{
    const plain = computeDocumentTotals(BASE);
    eq('optional lines not taken are left out of every total', computeDocumentTotals(WITH_OPT), plain);
    eq('selected optional line counts like a normal line', computeDocumentTotals(SELECTED).subtotal, roundMoney(plain.subtotal + 350));
    eq('string "true" flags work like booleans', computeDocumentTotals({ ...BASE, lineItems: [...BASE.lineItems, { quantity: 1, rate: 99, optional: 'true' }] }).total, plain.total);
    eq('optional + selected "true" counted', computeDocumentTotals({ lineItems: [{ quantity: 1, rate: 99, optional: 'true', selected: 'true' }] }).total, 99);
    eq('not optional + selected false is still counted (flag only matters on optional lines)', computeDocumentTotals({ lineItems: [{ quantity: 1, rate: 10, selected: false }] }).total, 10);
    eq('line amount 0, display amount = its price', [lineItemAmount(WITH_OPT.lineItems[2]), lineItemDisplayAmount(WITH_OPT.lineItems[2]), lineItemDisplayAmount(BASE.lineItems[1])], [0, 1200, 1140]);
    eq('cost of optional lines not counted', computeDocumentCost(WITH_OPT), computeDocumentCost(BASE));
    check('countedLineItems returns the same array when nothing is excluded', countedLineItems(BASE.lineItems) === BASE.lineItems);
    eq('progress billing ignores unselected optional lines', computeDocumentTotals({ isProgressBilling: true, lineItems: [{ quantity: 1, rate: 100, percentComplete: 50 }, { quantity: 1, rate: 100, percentComplete: 50, optional: true }] }).total, 50);
    // every place that totals documents goes through the same helper
    eq('portal documentTotals', portalTotals(WITH_OPT).total, plain.total);
    eq('finance documentTotals (costing, analytics, pipeline)', financeTotals({ type: 'Estimate', ...WITH_OPT } as never).total, plain.total);
    eq('bookkeeper export documentMoney', documentMoney('Estimate', WITH_OPT).total, plain.total);
    eq('reminders edge copy matches', remindersTotals(WITH_OPT as never), computeDocumentTotals(WITH_OPT));
    eq('reminders edge copy: selected', remindersTotals(SELECTED as never), computeDocumentTotals(SELECTED));
    // random documents without optional lines: identical numbers whatever flags are absent
    let same = true;
    for (let i = 0; i < 300; i++) {
        const lines = Array.from({ length: 1 + (i % 6) }, (_, k) => ({ quantity: ((i * 7 + k * 3) % 13) - 2, rate: ((i * 31 + k * 17) % 997) / 7, percentComplete: (i * k) % 120, previouslyBilled: (k * 3) % 40 }));
        const d = { lineItems: lines, taxRate: (i % 11) * 0.75, discount: i % 4 ? 0 : (i % 50), shipping: i % 3, isProgressBilling: i % 5 === 0, amountPaid: i % 7 ? 0 : 25 };
        const viaOld = (() => {
            const sub = roundMoney(lines.reduce((s, li) => s + lineItemAmount(li, d.isProgressBilling), 0));
            return sub;
        })();
        if (computeDocumentTotals(d).subtotal !== viaOld || JSON.stringify(remindersTotals(d as never)) !== JSON.stringify(computeDocumentTotals(d))) { same = false; break; }
    }
    check('300 documents without optional lines: same totals (app + reminders copy)', same);

    // invoice from an estimate: unselected add-ons dropped, included ones become normal lines
    const inv = buildInvoiceSeedFromEstimate(SELECTED, 'e1') as any;
    eq('invoice lines: no unselected add-on', inv.lineItems.map((l: any) => l.id), ['a', 'b', 'o2']);
    check('invoice lines: included add-on is a normal line', !('optional' in inv.lineItems[2]) && !('selected' in inv.lineItems[2]));
    eq('invoice total = estimate total', computeDocumentTotals(inv).total, computeDocumentTotals(SELECTED).total);
    eq('invoice from an estimate without add-ons: lines unchanged', (buildInvoiceSeedFromEstimate(BASE, 'e') as any).lineItems, BASE.lineItems);

    // editor helpers
    eq('regular / optional split + merge keeps order', [regularLines(WITH_OPT.lineItems).map(l => l.id), optionalLines(WITH_OPT.lineItems).map(l => l.id)], [['a', 'b'], ['o1', 'o2']]);
    check('merge without add-ons returns the same array', mergeLines(BASE.lineItems, []) === BASE.lineItems);
    eq('set optional / back to regular', [setLineOptional(L('x', 'X', 1, 1), true), 'optional' in setLineOptional(setLineOptional(L('x', 'X', 1, 1), true), false)], [{ ...L('x', 'X', 1, 1), optional: true, selected: false }, false]);
    eq('select', (setLineSelected(WITH_OPT.lineItems[2], true) as { selected?: unknown }).selected, true);
    eq('saved lines keep the flags (normalizeLineItems)', normalizeLineItems(SELECTED.lineItems, false).map(l => [l.optional ?? null, l.selected ?? null]), [[null, null], [null, null], [true, false], [true, true]]);
    check('plain lines get no new keys', !('optional' in normalizeLineItems(BASE.lineItems, false)[0]));
}

// ---------------------------------------------------------------------------------------------------------------
// 2. payment milestones
// ---------------------------------------------------------------------------------------------------------------
const M = (kind: Milestone['kind'], value: number, mode: Milestone['mode'] = 'percent'): Milestone => ({ ...newMilestone(kind, value, mode) });
{
    const s = computeMilestones([M('deposit', 30), M('progress', 40), M('final', 30)], 1000.01);
    eq('30/40/30 of 1000.01', s.rows.map(r => r.amount), [300, 400, 300.01]);
    check('no error, amounts add up', !s.error && roundMoney(s.rows.reduce((a, r) => a + r.amount, 0)) === 1000.01);
    const half = computeMilestones([M('deposit', 50), M('final', 50)], 100.01);
    eq('50/50 of 100.01: cents remainder on the last (50.01 + 50.00)', half.rows.map(r => r.amount), [50.01, 50]);
    const thirds = computeMilestones([M('deposit', 33.33), M('progress', 33.33), M('final', 33.34)], 999.99);
    eq('33.33/33.33/33.34 add up exactly', roundMoney(thirds.rows.reduce((a, r) => a + r.amount, 0)), 999.99);
    check('over 100% → error', !!computeMilestones([M('deposit', 60), M('final', 50)], 1000).error);
    check('under 100% → error', /90%/.test(computeMilestones([M('deposit', 40), M('final', 50)], 1000).error || ''));
    check('a payment over 100% → error', !!computeMilestones([M('deposit', 120)], 1000).error);
    const mixed = computeMilestones([M('deposit', 500, 'amount'), M('final', 75)], 2000);
    eq('fixed $500 + 75% of 2000', [mixed.error, mixed.rows.map(r => r.amount), mixed.rows.map(r => r.percent)], [null, [500, 1500], [25, 75]]);
    check('fixed amounts more than the total → error', /more than the total/.test(computeMilestones([M('deposit', 2500, 'amount'), M('final', 0)], 2000).error || ''));
    check('fixed + % not adding up → error', !!computeMilestones([M('deposit', 500, 'amount'), M('final', 50)], 2000).error);
    eq('empty schedule: no rows, no error', [computeMilestones([], 100).rows.length, computeMilestones([], 100).error], [0, null]);
    eq('all-% schedule stays valid when the total changes', computeMilestones([M('deposit', 50), M('final', 50)], 0).error, null);
    eq('cumulative %', [cumulativePercent(s, -1), cumulativePercent(s, 0), cumulativePercent(s, 1), cumulativePercent(s, 2)], [0, 29.9997, 69.9993, 100]);
    eq('add payment fills the rest of 100%', addMilestone([M('deposit', 30)]).map(m => [m.kind, m.value]), [['deposit', 30], ['progress', 70]]);
    check('max milestones', Array.from({ length: 12 }).reduce<Milestone[]>(l => addMilestone(l), []).length === PROPOSAL_LIMITS.milestones);

    // milestone invoices with the existing progress billing; deposit + progress + final = the estimate total
    const est = { ...WITH_OPT, estimateNumber: 'EST-77', proposal: { milestones: [M('deposit', 30), M('progress', 40), M('final', 30)] } };
    const total = computeDocumentTotals(est).total;
    const ms = readProposal(est).milestones;
    const seeds = ms.map(m => buildMilestoneInvoiceSeed(est, 'e1', m.id) as any);
    check('a seed per milestone', seeds.every(Boolean));
    eq('deposit invoice: one line, exact amount, no tax', [seeds[0].lineItems.length, computeDocumentTotals(seeds[0]).total, seeds[0].taxRate, seeds[0].isProgressBilling], [1, computeMilestones(ms, total).rows[0].amount, 0, false]);
    check('progress invoices use progress billing', seeds[1].isProgressBilling === true && seeds[2].isProgressBilling === true);
    eq('progress invoice: % complete / previously billed', [seeds[1].lineItems[0].percentComplete, seeds[1].lineItems[0].previouslyBilled, seeds[2].lineItems[0].percentComplete], [70, 240, 100]);
    check('progress invoices never bill the add-ons not taken', seeds.every(sd => sd.lineItems.every((l: any) => !isExcludedOptionalLine(l) && !['o1', 'o2'].includes(l.id))));
    const billed = roundMoney(seeds.reduce((a, sd) => a + computeDocumentTotals(sd).total, 0));
    check(`deposit + progress + final = estimate total (${billed} vs ${total}, within 3 cents)`, Math.abs(billed - total) <= 0.03);
    eq('final invoice: discount remainder', roundMoney(seeds[1].discount + seeds[2].discount + 50 * computeMilestones(ms, total).rows[0].amount / total), 50);
    check('broken schedule → no milestone seed', buildMilestoneInvoiceSeed({ ...est, proposal: { milestones: [M('deposit', 30)] } }, 'e', readProposal({ proposal: { milestones: [M('deposit', 30)] } }).milestones[0].id) === null);
    eq('milestone seed keeps the estimate link', [seeds[1].sourceEstimateId, seeds[1].sourceEstimateNumber, seeds[1].proposalMilestone.index], ['e1', 'EST-77', 2]);
}

// ---------------------------------------------------------------------------------------------------------------
// 3. scope section model
// ---------------------------------------------------------------------------------------------------------------
{
    let list = addSection(addSection(addSection([], 'scope'), 'exclusions'), 'timeline');
    eq('kinds + default titles + styles', list.map(s => [s.kind, s.title, s.style]), [['scope', 'Scope of work', 'text'], ['exclusions', 'Exclusions', 'bullets'], ['timeline', 'Timeline / schedule', 'bullets']]);
    list = updateSection(list, list[1].id, { text: '- Permits\n* Painting\n\n• Haul-away' });
    eq('bullets: markers stripped, blanks dropped', bulletItems(list[1].text), ['Permits', 'Painting', 'Haul-away']);
    list = moveSection(list, list[2].id, -1);
    eq('reorder', list.map(s => s.kind), ['scope', 'timeline', 'exclusions']);
    check('move at the end does nothing', moveSection(list, list[0].id, -1) === list);
    eq('only filled sections print', filledSections({ sections: list }).map(s => s.kind), ['exclusions']);
    list = removeSection(list, list[0].id);
    eq('remove', list.length, 2);
    check('max sections', Array.from({ length: 15 }).reduce<any[]>(l => addSection(l, 'scope'), []).length === PROPOSAL_LIMITS.sections);
    const junk = readProposal({ proposal: { sections: [{ kind: 'nope', text: 'x'.repeat(9000), id: '<b>' }, 'bad'], milestones: [{ value: -5, kind: 'x' }], images: [{ url: 'http://x' }, { url: 'javascript:alert(1)' }, { url: 'https://cdn.example/a.jpg', caption: 'c' }] } });
    eq('cleaned: kind, text limit, safe id, milestone ≥ 0, https images only', [junk.sections[0].kind, junk.sections[0].text.length, /^[A-Za-z0-9_-]+$/.test(junk.sections[0].id), junk.milestones[0].value, junk.images.map(i => i.url)], ['scope', PROPOSAL_LIMITS.sectionText, true, 0, ['https://cdn.example/a.jpg']]);
    const blank = withProposal({ a: 1, proposal: { sections: [] } } as Record<string, unknown>, { sections: [], milestones: [], images: [] });
    check('an empty proposal removes the key (data as before)', !('proposal' in blank));
    check('hasProposalContent', !hasProposalContent(BASE) && hasProposalContent({ proposal: { milestones: [M('final', 100)] } }));
}

// ---------------------------------------------------------------------------------------------------------------
// 4. images
// ---------------------------------------------------------------------------------------------------------------
{
    eq('ok jpg', imageProblem({ type: 'image/jpeg', size: 2_000_000 }, 0), '');
    check('wrong type', /JPG, PNG or WebP/.test(imageProblem({ type: 'application/pdf', size: 10 }, 0)));
    check('too big', /larger than/.test(imageProblem({ type: 'image/png', size: PROPOSAL_LIMITS.imageBytes + 1 }, 0)));
    check('too many', /Up to 8/.test(imageProblem({ type: 'image/png', size: 1 }, PROPOSAL_LIMITS.images)));
    let imgs = addImage([], { url: 'https://x.supabase.co/storage/v1/object/public/logos/u/doc-1.jpg', caption: 'Kitchen before' });
    imgs = addImage(imgs, { url: 'http://insecure/x.jpg' });
    eq('only https images are added', imgs.length, 1);
    const many = Array.from({ length: 12 }).reduce<any[]>(l => addImage(l, { url: 'https://a.b/c.jpg' }), []);
    eq('max images', many.length, PROPOSAL_LIMITS.images);
}

// ---------------------------------------------------------------------------------------------------------------
// 5. templates
// ---------------------------------------------------------------------------------------------------------------
{
    eq('setting key matches lib/userData.ts', PROPOSAL_TEMPLATES_SETTING, PROPOSAL_TEMPLATES_KEY);
    const src = { terms: 'Net 15. Warranty 1 year.', proposal: { sections: [{ id: 's1', kind: 'exclusions', title: 'Exclusions', text: 'Permits', style: 'bullets' }], milestones: [M('deposit', 50), M('final', 50)], images: [{ id: 'i1', url: 'https://a.b/c.jpg', caption: 'x' }] } };
    const tpl = templateFromEstimate('Bathroom remodel', src, '2026-11-15T00:00:00Z')!;
    eq('template: sections + milestones + terms, no images', [tpl.name, tpl.sections.length, tpl.milestones.length, tpl.terms, 'images' in tpl], ['Bathroom remodel', 1, 2, 'Net 15. Warranty 1 year.', false]);
    const target = { terms: 'old', lineItems: BASE.lineItems, proposal: { images: [{ id: 'k', url: 'https://k.k/k.jpg', caption: '' }], sections: [{ id: 'z', kind: 'scope', title: 'Scope of work', text: 'old', style: 'text' }] } };
    const applied = applyProposalTemplate(target, tpl) as any;
    const p = readProposal(applied);
    eq('apply: template sections replace, images kept, terms replaced, lines untouched', [p.sections.map(s => s.text), p.images.length, applied.terms, applied.lineItems === BASE.lineItems], [['Permits'], 1, 'Net 15. Warranty 1 year.', true]);
    check('apply: fresh ids', p.sections[0].id !== 's1' && p.milestones[0].id !== tpl.milestones[0].id);
    eq('apply: empty template terms keep the estimate terms', (applyProposalTemplate({ terms: 'keep' }, { ...tpl, terms: '  ' }) as any).terms, 'keep');
    const ser = serializeProposalTemplates([tpl]);
    eq('serialize → parse round trip', parseProposalTemplates(ser.value).map(t => [t.name, t.sections.length, t.milestones.length]), [['Bathroom remodel', 1, 2]]);
    eq('parse junk', parseProposalTemplates('nope'), []);
    const big = { ...tpl, sections: Array.from({ length: 10 }, (_, i) => ({ ...tpl.sections[0], id: `b${i}`, text: 'x'.repeat(3000) })) };
    check('too big → plain error (user_settings value ≤ 20,000 chars)', !!serializeProposalTemplates([big, { ...big, name: 'Two' }]).error && PROPOSAL_TEMPLATES_MAX_CHARS < 20000);
    eq('free plan: first template ok', templateSaveProblem([], 'A', false), '');
    eq('free plan: a second one needs Premium', templateSaveProblem([tpl], 'Other', false), 'premium');
    eq('free plan: replacing the same name is fine', templateSaveProblem([tpl], 'bathroom REMODEL', false), '');
    eq('paid plan: up to 20', [templateSaveProblem([tpl], 'Other', true), /up to 20/.test(templateSaveProblem(Array.from({ length: PROPOSAL_TEMPLATE_LIMITS.paid }, (_, i) => ({ ...tpl, id: `t${i}`, name: `T${i}` })), 'New', true))], ['', true]);
    check('name required', /name/.test(templateSaveProblem([], '  ', true)));
    const up = upsertTemplate([tpl], { ...tpl, id: 'new', terms: 'v2' });
    eq('upsert by name keeps the id, newest first', [up.length, up[0].id, up[0].terms], [1, tpl.id, 'v2']);
}

// ---------------------------------------------------------------------------------------------------------------
// 6. signed lock
// ---------------------------------------------------------------------------------------------------------------
{
    const plainKey = signedContent(BASE, 'estimate') as any;
    check('plain estimate: signed content has no proposal key and the old line key', !('proposal' in plainKey) && plainKey.lines[0].length === 4);
    const signed = { ...WITH_OPT, clientSignedAt: '2026-11-15T10:00:00Z', clientSignatureUrl: 'data:x', status: 'Accepted', proposal: { milestones: [M('deposit', 50), M('final', 50)] } };
    check('switching an add-on on after signing is refused', !!signedChangeProblem(signed, { ...signed, lineItems: signed.lineItems.map(l => (l.id === 'o1' ? { ...l, selected: true } : l)) }, 'estimate'));
    check('changing the payment schedule after signing is refused', !!signedChangeProblem(signed, { ...signed, proposal: { milestones: [M('deposit', 40), M('final', 60)] } }, 'estimate'));
    check('a design change after signing is allowed', signedChangeProblem(signed, { ...clone(signed), templateId: 'bold' }, 'estimate') === null);
}

// ---------------------------------------------------------------------------------------------------------------
// 7. PDF model + every design
// ---------------------------------------------------------------------------------------------------------------
{
    const base = (SAMPLE_DOCUMENTS as any).estimate;
    const full = {
        ...clone(base),
        lineItems: [...clone(base.lineItems), L('opt-1', 'ADDON-SENTINEL heated floor', 1, 1234.5, { optional: true }), L('opt-2', 'INCLUDED-SENTINEL niche', 1, 300, { optional: true, selected: true })],
        proposal: {
            sections: [
                { id: 's1', kind: 'scope', title: 'Scope of work', text: 'SCOPE-SENTINEL demolish and rebuild.\n\nSecond paragraph.', style: 'text' },
                { id: 's2', kind: 'inclusions', title: 'Inclusions', text: 'INCL-SENTINEL tile\nGrout', style: 'bullets' },
                { id: 's3', kind: 'exclusions', title: 'Exclusions', text: 'EXCL-SENTINEL permits', style: 'bullets' },
                { id: 's4', kind: 'assumptions', title: 'Assumptions', text: 'ASSUME-SENTINEL access', style: 'bullets' },
                { id: 's5', kind: 'timeline', title: 'Timeline / schedule', text: 'TIME-SENTINEL week 1', style: 'bullets' },
            ],
            milestones: [{ ...M('deposit', 30), label: 'DEP-SENTINEL' }, M('progress', 40), M('final', 30)],
            images: [{ id: 'i1', url: 'https://example.com/a.jpg', caption: 'CAPTION-SENTINEL kitchen' }, { id: 'i2', url: 'https://example.com/b.jpg', caption: '<script>x</script>' }, { id: 'i3', url: 'https://example.com/c.jpg', caption: '' }],
        },
    };
    const m = buildDocumentModel('Estimate', full, SAMPLE_PROFILE as never, SAMPLE_JOB as never);
    eq('model: scope sections before the items, in order', m.before.filter(s => s.id.startsWith('proposal-')).map(s => s.id), ['proposal-scope', 'proposal-inclusions', 'proposal-exclusions', 'proposal-assumptions', 'proposal-timeline']);
    eq('model: add-ons, payments, photos before notes / terms', m.after.map(s => s.id).slice(0, 3), ['proposal-optional', 'proposal-payments', 'proposal-photos']);
    const tableText = JSON.stringify(m.items);
    check('model: the add-on not taken is not in the items table', !tableText.includes('ADDON-SENTINEL') && tableText.includes('INCLUDED-SENTINEL') && tableText.includes('optional add-on, included'));
    const plainTot = computeDocumentTotals({ ...full, lineItems: full.lineItems.filter((l: any) => l.id !== 'opt-1') });
    check('model: totals exclude the add-on not taken', m.totals.some(t => t.kind === 'grand' && t.value.includes(plainTot.total.toLocaleString('en-US', { minimumFractionDigits: 2 }))));
    check('model: escaped captions', !JSON.stringify(m.after).includes('<script>'));
    const noProposal = buildDocumentModel('Estimate', base, SAMPLE_PROFILE as never, SAMPLE_JOB as never);
    check('model: estimate without these fields has no proposal sections', ![...noProposal.before, ...noProposal.after].some(s => s.id.startsWith('proposal-')));

    let ok = 0;
    for (const id of ALL_TEMPLATE_IDS) {
        const html = renderDocument('Estimate', { ...full, templateId: id }, SAMPLE_PROFILE as never, SAMPLE_JOB as never, { templateId: id, noFontLink: true }).html;
        const need = ['SCOPE-SENTINEL', 'INCL-SENTINEL', 'EXCL-SENTINEL', 'ASSUME-SENTINEL', 'TIME-SENTINEL', 'Optional add-ons', 'ADDON-SENTINEL', 'Not included in the total', 'Payment schedule', 'DEP-SENTINEL', 'Project photos', 'CAPTION-SENTINEL', 'https://example.com/c.jpg'];
        const missing = need.filter(n => !html.includes(n));
        const sections = (html.match(/<section class="cd-block cd-section cd-sec-proposal-/g) || []).length;
        if (!missing.length && sections === 8 && !html.includes('<script>x')) ok++;
        else failures.push(`design ${id}: missing ${missing.join(', ')} (${sections} proposal sections)`);
    }
    check(`every design (${ALL_TEMPLATE_IDS.length}, ${PREMIUM_TEMPLATE_IDS.length} Premium) prints every proposal section`, ok === ALL_TEMPLATE_IDS.length);
    const premium = PREMIUM_TEMPLATE_IDS[0];
    const hidden = renderDocument('Estimate', { ...full, templateId: premium, designOptions: { hide: ['photos'] } }, SAMPLE_PROFILE as never, SAMPLE_JOB as never, { templateId: premium, noFontLink: true }).html;
    check('Premium "hide photos" leaves the photo page out', !hidden.includes('Project photos') && hidden.includes('Payment schedule'));
    check('every proposal section can split across pages (title kept with its first row)', read('utils/templates/blocks.ts').includes('data-split="children">${title}'));
}

// ---------------------------------------------------------------------------------------------------------------
// 8. wiring (source checks)
// ---------------------------------------------------------------------------------------------------------------
{
    check('estimate form: optional block + proposal section', read('components/EstimateForm.tsx').includes('<OptionalAddOns') && read('components/EstimateForm.tsx').includes('<ProposalSection'));
    check('convert dialog: milestone invoices', read('components/EstimateForm.tsx').includes('buildMilestoneInvoiceSeed('));
    check('portal shows the proposal', read('components/DocumentApprovalView.tsx').includes('<ProposalPortalView'));
    check('help guide', read('components/help/helpContent.ts').includes("id: 'proposals'"));
    check('engine is pure (no supabase / react)', !/from '\.\/supabase|from 'react'/.test(read('lib/proposal.ts')));
}

const total = passed + failures.length;
for (const f of failures.slice(0, 80)) console.log(`FAIL  ${f}`);
console.log(failures.length ? `proposal-check: ${failures.length} of ${total} checks failed` : `proposal-check: all ${total} checks passed`);
process.exit(failures.length ? 1 : 0);
