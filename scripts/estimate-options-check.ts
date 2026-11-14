/**
 * Good / better / best estimate options (competitor gap #6) — pure checks, no browser, no network:
 *   npx tsx scripts/estimate-options-check.ts
 *
 *  1. option engine (lib/estimateOptions.ts): reading, option totals with tax / discount / shared lines, editing
 *  2. THE RULE: applied → client's (or recorded) choice → Recommended → lowest total, and the client's pick from the
 *     database (draft SQL) or from the signer's name (today)
 *  3. storage: option lines saved client-safe, private fields in estimateOptionsInternal, lineItems mirror
 *  4. apply chosen option, undo, turn off, AI lines, revision / duplicate copies, signed-estimate guard
 *  5. money everywhere: invoice-from-estimate, contract value, job costing budget, pipeline value, Insights, Job financials
 *  6. client pages: the signing call (new SQL function first, else the existing one with the pick in the signer name)
 *  7. PDF / preview model + every design renders the options; old estimates unchanged
 *  8. draft SQL is functions-only and matches the app's calls; wiring
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    OPTION_SELECT_PATHS, PRIVATE_LINE_KEYS, SIGNER_NAME_MAX, addOption, adoptLineItemsIntoOption, applyChosenOption, canUndoApply, choiceOf,
    clientChoiceOf, copyLineTo, copyOptionLines, createOptionSet, effectiveEstimateLines, effectiveOption, optionRange, optionTotals,
    optionsActive, optionsForCopy, packOptionsForSave, parseSignerChoice, planChoiceSigning, plainSignerName, readOptionSet,
    recordContractorChoice, removeOption, removeOptions, setRecommended, signerNameWithChoice, summarizeOptions, syncMirror, undoApply,
    unpackOptionsForEdit, updateOption, withEffectiveLines, type OptionSet,
} from '../lib/estimateOptions.ts';
import { computeDocumentTotals, roundMoney } from '../utils/money.ts';
import { buildInvoiceSeedFromEstimate, buildRevisionSeed, signedChangeProblem, signedContent, unsignedPatch } from '../components/forms/signedLock.ts';
import { computeContractValue } from '../components/forms/contractValue.ts';
import { summarizeJobCosting, type CostingDoc } from '../lib/costing.ts';
import { summarizeJobMoney, type FinanceDoc } from '../lib/finance.ts';
import { docTotal, mapPipelineRow, placeJob } from '../lib/pipeline.ts';
import { computeAnalytics, type AnalyticsDoc } from '../utils/analyticsMath.ts';
import { buildDuplicateDocumentData } from '../lib/documents.ts';
import { buildDocumentModel } from '../utils/templates/model.ts';
import { renderDocument } from '../utils/templates/render.ts';
import { ALL_TEMPLATE_IDS } from '../utils/templates/registry.ts';
import { normalizeLineItems } from '../components/forms/formUtils.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: unknown, detail?: unknown) => {
    if (ok) passed++;
    else failures.push(`${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
};
const eq = (name: string, actual: unknown, expected: unknown) => check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------------------------------------------
// fixtures: a roof estimate with Good / Better / Best + 2 shared lines, tax 8.25 %, $100 off
// ---------------------------------------------------------------------------------------------------------------
const L = (id: string, description: string, quantity: number, rate: number, unitCost?: number, extra: Record<string, unknown> = {}) =>
    ({ id, description, quantity, rate, ...(unitCost !== undefined ? { unitCost } : {}), ...extra });

const SET: OptionSet = {
    version: 1,
    kind: 'estimate',
    options: [
        { id: 'opt-good', name: 'Good', description: '25-year shingles', lineItems: [L('g1', 'Architectural shingles (25 yr)', 20, 300, 180), L('g2', 'Labor', 1, 2000, 1200)] },
        { id: 'opt-better', name: 'Better', description: '50-year shingles + ice shield', lineItems: [L('b1', 'Designer shingles (50 yr)', 20, 420, 260, { inventoryItemId: 'inv-1', itemSource: 'inventory', track_inventory: true }), L('b2', 'Ice & water shield', 4, 150, 90), L('b3', 'Labor', 1, 2400, 1400)] },
        { id: 'opt-best', name: 'Best', lineItems: [L('x1', 'Standing-seam metal', 20, 900, 600), L('x2', 'Labor', 1, 4000, 2500)] },
    ],
    sharedLineItems: [L('s1', 'Tear-off & disposal', 1, 900, 500), L('s2', 'Permit', 1, 250, 250)],
    recommendedId: 'opt-better',
};
const BASE = {
    estimateNumber: 'EST-2026-11-050', issueDate: '2026-11-10', expiryDate: '2026-12-10', status: 'Sent', clientName: 'Jane Doe',
    taxRate: 8.25, discount: 100, terms: 'Net 30', notes: '', templateId: 'standard',
};
// the form keeps lineItems = the option that counts
const EST = syncMirror({ ...BASE, lineItems: [] as any[], estimateOptions: clone(SET) });

const totalOf = (lines: Array<{ quantity: number; rate: number }>) => computeDocumentTotals({ lineItems: lines, taxRate: 8.25, discount: 100 });
const SHARED = [L('s1', 'Tear-off & disposal', 1, 900), L('s2', 'Permit', 1, 250)];
const GOOD = totalOf([...SET.options[0].lineItems, ...SHARED]);
const BETTER = totalOf([...SET.options[1].lineItems, ...SHARED]);
const BEST = totalOf([...SET.options[2].lineItems, ...SHARED]);

// ---------------------------------------------------------------------------------------------------------------
// 1. engine: reading + totals
// ---------------------------------------------------------------------------------------------------------------
{
    const set = readOptionSet(EST)!;
    check('reads 3 options', set && set.options.length === 3);
    check('reads a JSON-string set (JSON-path selects)', readOptionSet({ estimateOptions: JSON.stringify(SET) })?.options.length === 3);
    check('fewer than 2 options = no options', readOptionSet({ estimateOptions: { ...SET, options: [SET.options[0]] } }) === null);
    check('duplicate option ids are dropped', readOptionSet({ estimateOptions: { ...SET, options: [SET.options[0], SET.options[0], SET.options[1]] } })?.options.length === 2);
    check('unknown recommended id ignored', readOptionSet({ estimateOptions: { ...SET, recommendedId: 'nope' } })?.recommendedId === undefined);
    check('no options on a plain estimate', readOptionSet({ lineItems: [] }) === null && !optionsActive({ lineItems: [] }));
    check('options active', optionsActive(EST));

    // Good: 20×300 + 2000 + 900 + 250 = 9150 − 100 = 9050 × 1.0825
    eq('Good subtotal includes shared lines', optionTotals(EST, set, 'opt-good').subtotal, 9150);
    eq('Good total (discount then tax)', optionTotals(EST, set, 'opt-good').total, roundMoney(9050 * 1.0825));
    eq('Better total', optionTotals(EST, set, 'opt-better').total, BETTER.total);
    eq('Best total', optionTotals(EST, set, 'opt-best').total, BEST.total);
    eq('tax per option', optionTotals(EST, set, 'opt-best').tax, roundMoney((23150 - 100) * 0.0825));
    const capped = optionTotals({ ...EST, discount: 999999 }, set, 'opt-good');
    eq('discount never more than an option subtotal', [capped.discount, capped.total], [9150, 0]);
    eq('no tax / no discount', optionTotals({ ...EST, taxRate: 0, discount: 0 }, set, 'opt-good').total, 9150);
    const range = optionRange(EST)!;
    eq('range (lists, portal)', [range.count, range.min, range.max], [3, GOOD.total, BEST.total]);
    const sums = summarizeOptions(EST, set);
    eq('summaries: letters + flags', sums.map(s => [s.letter, s.recommended, s.chosen, s.effective]), [['A', false, false, false], ['B', true, false, true], ['C', false, false, false]]);
}

// ---------------------------------------------------------------------------------------------------------------
// 2. THE RULE + the client's pick
// ---------------------------------------------------------------------------------------------------------------
{
    eq('no choice → Recommended', effectiveOption(EST), { id: 'opt-better', reason: 'recommended' });
    const noRec = syncMirror({ ...EST, estimateOptions: setRecommended(readOptionSet(EST)!, null) });
    eq('no Recommended → lowest total', effectiveOption(noRec), { id: 'opt-good', reason: 'lowest' });
    const tie = { ...BASE, estimateOptions: { ...SET, recommendedId: undefined, options: [SET.options[2], { ...SET.options[0], id: 'a' }, { ...SET.options[0], id: 'b' }] } };
    eq('lowest: first one on a tie', effectiveOption(tie)?.id, 'a');

    const recorded = { ...EST, estimateOptions: recordContractorChoice(readOptionSet(EST)!, 'opt-best', '2026-11-12T10:00:00.000Z') };
    eq('contractor-recorded choice counts', effectiveOption(recorded), { id: 'opt-best', reason: 'chosen' });
    eq('recorded choice keeps the name', choiceOf(recorded)?.optionName, 'Best');
    check('recorded choice is not the client’s', clientChoiceOf(recorded) === null);
    check('clear the recorded choice', choiceOf({ ...EST, estimateOptions: recordContractorChoice(readOptionSet(recorded)!, null) }) === null);

    // today: the pick is in the signer's name
    const signerName = signerNameWithChoice('Jane Doe', readOptionSet(EST)!, 'opt-good');
    eq('signer name carries the pick', signerName, 'Jane Doe (chose A: Good)');
    const signedFallback = { ...EST, status: 'Accepted', clientSignatureUrl: 'data:image/png;base64,AAA', clientSignedAt: '2026-11-13T15:00:00.000Z', clientSignedBy: signerName, clientSignerName: signerName };
    eq('pick read from the signer name', effectiveOption(signedFallback), { id: 'opt-good', reason: 'chosen' });
    eq('client choice details', [clientChoiceOf(signedFallback)?.by, clientChoiceOf(signedFallback)?.name, clientChoiceOf(signedFallback)?.at], ['client', 'Jane Doe', '2026-11-13T15:00:00.000Z']);
    check('client pick wins over a recorded one', choiceOf({ ...signedFallback, estimateOptions: recordContractorChoice(readOptionSet(EST)!, 'opt-best') })?.optionId === 'opt-good');
    eq('parse tag', parseSignerChoice('Jane Doe (chose B: Better)'), { letter: 'B', name: 'Better', signer: 'Jane Doe' });
    check('names without a tag', parseSignerChoice('Jane (Doe)') === null && parseSignerChoice('') === null);
    eq('plain signer name', plainSignerName('Jane Doe (chose B: Better)'), 'Jane Doe');
    const renamed = { ...signedFallback, estimateOptions: updateOption(readOptionSet(EST)!, 'opt-good', { name: 'Basic' }) };
    eq('renamed option → matched by letter', effectiveOption(renamed)?.id, 'opt-good');
    const reordered = { ...signedFallback, estimateOptions: { ...SET, options: [SET.options[1], SET.options[0], SET.options[2]] } };
    eq('reordered options → matched by name', effectiveOption(reordered)?.id, 'opt-good');
    const long = signerNameWithChoice('X'.repeat(300), readOptionSet(EST)!, 'opt-better');
    check('signer name ≤ 200 (database limit) and keeps the tag', long.length <= SIGNER_NAME_MAX && long.endsWith('(chose B: Better)'), long.length);
    eq('name with brackets in the option name', signerNameWithChoice('Al', { ...SET, options: [{ ...SET.options[0], name: 'Good (basic)' }, SET.options[1]] }, 'opt-good'), 'Al (chose A: Good basic)');
    check('unsigned: a tag is not a choice', clientChoiceOf({ ...EST, clientSignedBy: signerName }) === null);
    check('declined name (no signature) is not a choice', choiceOf({ ...EST, clientSignerName: signerName, clientDeclinedAt: '2026-11-13' }) === null);

    // after the draft SQL: the database stores the pick
    const stored = { ...EST, status: 'Accepted', clientSignedAt: '2026-11-13T15:00:00.000Z', clientSignedBy: 'Jane Doe', clientOptionChoice: { optionId: 'opt-best', optionName: 'Best', by: 'client', at: '2026-11-13T15:00:00.000Z', name: 'Jane Doe' } };
    eq('database pick counts', effectiveOption(stored), { id: 'opt-best', reason: 'chosen' });
    check('database pick wins over a signer tag', effectiveOption({ ...stored, clientSignedBy: signerName })?.id === 'opt-best');
    check('database pick as a JSON string', effectiveOption({ ...stored, clientOptionChoice: JSON.stringify(stored.clientOptionChoice) })?.id === 'opt-best');
    check('pick of an unknown option ignored', effectiveOption({ ...stored, clientOptionChoice: { optionId: 'gone', by: 'client' } })?.reason === 'recommended');
    check('unsigned: a stored pick is ignored (signature removed)', effectiveOption({ ...stored, ...unsignedPatch() })?.reason === 'recommended');
    check('after unlock the signer tag is gone too', effectiveOption({ ...signedFallback, ...unsignedPatch() })?.reason === 'recommended');

    const applied = applyChosenOption(signedFallback, '2026-11-14T09:00:00.000Z')!;
    eq('applied option wins', effectiveOption(applied), { id: 'opt-good', reason: 'applied' });
}

// ---------------------------------------------------------------------------------------------------------------
// 3. storage: client-safe option lines, private fields kept apart, mirror
// ---------------------------------------------------------------------------------------------------------------
const PACKED = packOptionsForSave(EST) as any;
{
    const stored = JSON.stringify(PACKED.estimateOptions);
    for (const k of PRIVATE_LINE_KEYS) check(`stored option lines have no ${k}`, !stored.includes(`"${k}"`));
    eq('private fields kept by line id', PACKED.estimateOptionsInternal.b1, { unitCost: 260, inventoryItemId: 'inv-1', itemSource: 'inventory', track_inventory: true });
    eq('shared line costs kept', PACKED.estimateOptionsInternal.s1, { unitCost: 500 });
    eq('lineItems mirror the option that counts (with costs)', PACKED.lineItems.map((l: any) => [l.id, l.unitCost ?? null]), [['b1', 260], ['b2', 90], ['b3', 1400], ['s1', 500], ['s2', 250]]);
    eq('mirror keeps inventory links (stock of an accepted estimate)', PACKED.lineItems[0].inventoryItemId, 'inv-1');
    eq('saved total = Better', computeDocumentTotals(PACKED).total, BETTER.total);
    // what a client page receives (public._client_safe_doc_data drops top-level keys matching this pattern)
    const SQL_STRIP = /(internal|private|profit|margin|markup|unitcost|costprice)/i;
    check('estimateOptionsInternal is dropped by the database for client pages', SQL_STRIP.test('estimateOptionsInternal'));
    check('estimateOptions / clientOptionChoice reach client pages', !SQL_STRIP.test('estimateOptions') && !SQL_STRIP.test('clientOptionChoice'));
    const clientView = Object.fromEntries(Object.entries(PACKED).filter(([k]) => !SQL_STRIP.test(k)));
    check('client view: no unit cost anywhere in the options', !JSON.stringify((clientView as any).estimateOptions).includes('unitCost'));

    const opened = unpackOptionsForEdit(clone(PACKED), lines => normalizeLineItems(lines, false)) as any;
    check('reopened: internal map folded back into the lines', opened.estimateOptionsInternal === undefined);
    eq('reopened: costs back on option lines', readOptionSet(opened)!.options[1].lineItems.map(l => l.unitCost), [260, 90, 1400]);
    eq('reopened: inventory link back', readOptionSet(opened)!.options[1].lineItems[0].inventoryItemId, 'inv-1');
    eq('save → open → save is stable', JSON.stringify(packOptionsForSave(opened)), JSON.stringify(PACKED));
    const plain = { ...BASE, lineItems: [L('p1', 'Work', 1, 500, 300)] };
    check('plain estimate: pack returns the same object', packOptionsForSave(plain) === plain);
    check('plain estimate: unpack returns the same object', unpackOptionsForEdit(plain) === plain);
    const one = packOptionsForSave({ ...plain, estimateOptions: { ...SET, options: [SET.options[0]] }, estimateOptionsInternal: {} }) as any;
    check('a set with one option is saved as a plain estimate', !('estimateOptions' in one) && !('estimateOptionsInternal' in one));
    eq('JSON-path select paths', [...OPTION_SELECT_PATHS], ['estimateOptions:data->estimateOptions', 'clientOptionChoice:data->clientOptionChoice', 'clientSignedBy:data->>clientSignedBy']);
}

// ---------------------------------------------------------------------------------------------------------------
// 4. editing, apply, undo, off, AI lines, copies, signed guard
// ---------------------------------------------------------------------------------------------------------------
{
    const created = createOptionSet([L('a', 'Repair', 2, 100, 40), L('b', '', 1, 0)]);
    eq('turn on: Good / Better / Best, Better recommended', [created.options.map(o => o.name), created.recommendedId === created.options[1].id], [['Good', 'Better', 'Best'], true]);
    check('turn on: every option starts with the current (non-empty) lines', created.options.every(o => o.lineItems.length === 1 && o.lineItems[0].description === 'Repair' && o.lineItems[0].unitCost === 40));
    const ids = created.options.flatMap(o => o.lineItems.map(l => l.id));
    check('turn on: copied lines get unique ids', new Set(ids).size === ids.length && !ids.includes('a'));
    check('turn on with no lines: one empty line per option', createOptionSet([]).options.every(o => o.lineItems.length === 1));
    const four = addOption(created, created.options[2].id);
    eq('add option: 4th starts from the selected one', [four.options.length, four.options[3].name, four.options[3].lineItems[0].description], [4, 'Premium', 'Repair']);
    check('max 4 options', addOption(four).options.length === 4);
    const rem = removeOption({ ...four, choice: { optionId: four.options[1].id, by: 'contractor' } }, four.options[1].id);
    check('remove: recommended / choice of the removed option cleared', rem.options.length === 3 && !rem.recommendedId && !rem.choice);
    check('min 2 options', removeOption(removeOption(rem, rem.options[0].id), rem.options[1].id).options.length === 2);
    const set = readOptionSet(EST)!;
    const replaced = copyOptionLines(set, 'opt-best', 'opt-good', 'replace');
    eq('start from another option (replace)', replaced.options[0].lineItems.map(l => l.description), set.options[2].lineItems.map(l => l.description));
    check('start from: new line ids', replaced.options[0].lineItems.every(l => !['x1', 'x2'].includes(l.id)));
    eq('copy lines to (append)', copyOptionLines(set, 'opt-best', 'opt-good', 'append').options[0].lineItems.length, 4);
    eq('copy one line to shared + an option', [copyLineTo(set, set.options[0].lineItems[0], ['shared', 'opt-best']).sharedLineItems.length, copyLineTo(set, set.options[0].lineItems[0], ['shared', 'opt-best']).options[2].lineItems.length], [3, 3]);
    eq('name ≤ 40, description ≤ 240', [updateOption(set, 'opt-good', { name: 'N'.repeat(80) }).options[0].name.length, updateOption(set, 'opt-good', { description: 'D'.repeat(500) }).options[0].description!.length], [40, 240]);
    const edited = syncMirror({ ...EST, estimateOptions: updateOption(set, 'opt-better', { lineItems: [L('b1', 'Designer shingles', 10, 420)] }) });
    eq('mirror follows edits of the option that counts', computeDocumentTotals(edited).subtotal, 4200 + 1150);
    // typing in the form: names / descriptions are kept as typed, cleaned when saved
    const typing = { ...EST, estimateOptions: updateOption(updateOption(set, 'opt-good', { name: 'Good plus ' }), 'opt-good', { description: 'Two words ' }) };
    eq('typing: spaces kept while editing', [readOptionSet(typing)!.options[0].name, readOptionSet(typing)!.options[0].description], ['Good plus ', 'Two words ']);
    const emptied = { ...EST, estimateOptions: updateOption(set, 'opt-good', { name: '' }) };
    eq('typing: an emptied name stays empty in the form', readOptionSet(emptied)!.options[0].name, '');
    const savedTyping = (packOptionsForSave(typing) as any).estimateOptions.options[0];
    eq('saved: names / descriptions trimmed, empty name → default', [savedTyping.name, savedTyping.description, (packOptionsForSave(emptied) as any).estimateOptions.options[0].name], ['Good plus', 'Two words', 'Good']);
    eq('shown: an empty name reads as its default', buildDocumentModel('Estimate', emptied).choices!.cards[0].name, 'Good');

    check('apply needs a choice', applyChosenOption(EST) === null);
    const chosen = { ...EST, estimateOptions: recordContractorChoice(set, 'opt-best') };
    const applied = applyChosenOption(chosen, '2026-11-14T09:00:00.000Z')!;
    eq('apply: lineItems = chosen + shared', applied.lineItems.map((l: any) => l.id), ['x1', 'x2', 's1', 's2']);
    eq('apply: totals = chosen option', computeDocumentTotals(applied).total, BEST.total);
    eq('apply: costs kept', applied.lineItems.map((l: any) => l.unitCost), [600, 2500, 500, 250]);
    check('apply: options kept as the record, not active', readOptionSet(applied)?.appliedId === 'opt-best' && !optionsActive(applied));
    check('apply twice = nothing', applyChosenOption(applied) === null);
    check('applied: money = own lines', JSON.stringify(effectiveEstimateLines(applied)) === JSON.stringify(applied.lineItems) && withEffectiveLines(applied) === applied);
    check('undo allowed while untouched', canUndoApply(applied));
    check('undo not allowed after an edit', !canUndoApply({ ...applied, lineItems: [...applied.lineItems, L('n', 'Extra', 1, 10)] }));
    const undone = undoApply(applied);
    check('undo: options active again with the choice', optionsActive(undone) && effectiveOption(undone)?.id === 'opt-best');
    const off = removeOptions(EST) as any;
    eq('turn off: keeps the option that counts + shared', [off.lineItems.map((l: any) => l.id), 'estimateOptions' in off], [['b1', 'b2', 'b3', 's1', 's2'], false]);

    // AI "Fill" on an estimate with options: lines go into the option that counts
    const ai = adoptLineItemsIntoOption({ ...EST, lineItems: [L('ai1', 'AI line', 2, 50)] }, EST.lineItems);
    eq('AI lines → the option that counts, shared kept', [readOptionSet(ai)!.options[1].lineItems.map(l => l.id), ai.lineItems.map((l: any) => l.id)], [['ai1'], ['ai1', 's1', 's2']]);
    check('unchanged lines: same object', adoptLineItemsIntoOption(EST, EST.lineItems) === EST);

    // revision of a signed options estimate / duplicate
    const signed = { ...PACKED, status: 'Accepted', clientSignatureUrl: 'data:image/png;base64,AAA', clientSignedAt: '2026-11-13T15:00:00.000Z', clientSignedBy: 'Jane Doe (chose C: Best)' };
    const rev = buildRevisionSeed(signed, 'estimate', 'doc-1', '2026-11-14') as any;
    check('revision: options offered again, no choice', readOptionSet(rev)?.options.length === 3 && !readOptionSet(rev)?.choice && !rev.clientSignedBy);
    eq('revision: private fields copied', rev.estimateOptionsInternal.b1.unitCost, 260);
    const revApplied = buildRevisionSeed({ ...applyChosenOption(signed)!, clientSignedBy: 'Jane Doe (chose C: Best)' }, 'estimate', 'doc-1', '2026-11-14') as any;
    check('revision of an applied estimate = the chosen option as a plain estimate', !revApplied.estimateOptions && revApplied.lineItems.length === 4);
    const dup = buildDuplicateDocumentData({ ...signed, clientOptionChoice: { optionId: 'opt-best', by: 'client' }, estimateOptions: recordContractorChoice(readOptionSet(signed)!, 'opt-good') });
    check('duplicate: no client pick, no recorded choice, options kept', !('clientOptionChoice' in dup) && !readOptionSet(dup)?.choice && readOptionSet(dup)?.options.length === 3);

    // signed estimate guard (components/forms/signedLock.ts)
    const signedTag = { ...EST, status: 'Accepted', clientSignatureUrl: 'data:image/png;base64,AAA', clientSignedAt: '2026-11-13T15:00:00.000Z', clientSignedBy: 'Jane Doe (chose A: Good)' };
    check('signed content = the chosen option', JSON.stringify(signedContent(signedTag, 'estimate').lines) === JSON.stringify(signedContent(withEffectiveLines(signedTag), 'estimate').lines) && signedContent(signedTag, 'estimate').total === GOOD.total);
    check('signed: "Apply chosen option" is allowed', signedChangeProblem(signedTag, applyChosenOption(signedTag)!, 'estimate') === null);
    check('signed: saving the packed form is allowed', signedChangeProblem(signedTag, packOptionsForSave(signedTag), 'estimate') === null);
    check('signed: changing an option price is refused', Boolean(signedChangeProblem(signedTag, { ...signedTag, estimateOptions: updateOption(readOptionSet(signedTag)!, 'opt-best', { lineItems: [L('x1', 'Metal', 20, 1)] }) }, 'estimate')));
    check('signed: renaming an option is refused', Boolean(signedChangeProblem(signedTag, { ...signedTag, estimateOptions: updateOption(readOptionSet(signedTag)!, 'opt-best', { name: 'Premium' }) }, 'estimate')));
    check('signed: recording another choice is refused (client already chose)', signedChangeProblem(signedTag, { ...signedTag, estimateOptions: recordContractorChoice(readOptionSet(signedTag)!, 'opt-best') }, 'estimate') === null
        && effectiveOption({ ...signedTag, estimateOptions: recordContractorChoice(readOptionSet(signedTag)!, 'opt-best') })?.id === 'opt-good');
}

// ---------------------------------------------------------------------------------------------------------------
// 5. money everywhere
// ---------------------------------------------------------------------------------------------------------------
{
    // invoice-from-estimate
    const inv = buildInvoiceSeedFromEstimate(PACKED, 'est-1', { deposit: 500 }) as any;
    eq('invoice from estimate: Recommended before a choice', computeDocumentTotals(inv).total, BETTER.total);
    eq('invoice from estimate: costs + inventory links kept', [inv.lineItems[0].unitCost, inv.lineItems[0].inventoryItemId], [260, 'inv-1']);
    check('invoice has no option keys', !('estimateOptions' in inv) && !('estimateOptionsInternal' in inv));
    const signedBest = { ...PACKED, status: 'Accepted', clientSignedAt: '2026-11-13T15:00:00.000Z', clientSignedBy: 'Jane Doe (chose C: Best)' };
    eq('invoice from estimate: the client’s choice (even before Apply)', computeDocumentTotals(buildInvoiceSeedFromEstimate(signedBest, 'est-1')).total, BEST.total);
    eq('invoice from estimate: chosen lines carry their costs', (buildInvoiceSeedFromEstimate(signedBest, 'est-1') as any).lineItems.map((l: any) => l.unitCost), [600, 2500, 500, 250]);
    eq('invoice from an applied estimate', computeDocumentTotals(buildInvoiceSeedFromEstimate(applyChosenOption(signedBest)!, 'est-1')).total, BEST.total);
    const plainEst = { ...BASE, lineItems: [L('p1', 'Work', 2, 500, 300)], status: 'Accepted' };
    eq('invoice from a plain estimate unchanged', (buildInvoiceSeedFromEstimate(plainEst, 'e') as any).lineItems, plainEst.lineItems);

    // contract value (Change Order form)
    const rows = [{ id: 'e1', type: 'Estimate', data: signedBest }, { id: 'co', type: 'Change Order', data: { status: 'Approved', lineItems: [L('c', 'Extra', 1, 1000)] } }];
    eq('contract value: chosen option + change order', computeContractValue(rows).total, roundMoney(BEST.total + 1000));
    eq('contract value: accepted without a choice = Recommended', computeContractValue([{ id: 'e1', type: 'Estimate', data: { ...PACKED, status: 'Accepted' } }]).estimateTotal, BETTER.total);

    // a light JSON-path row (stale mirror: the client chose Best, the stored lineItems are still Better's)
    const light = {
        id: 'e1', type: 'Estimate', jobId: 'j1', status: 'Accepted', clientSignedAt: '2026-11-13T15:00:00.000Z',
        lineItems: PACKED.lineItems, taxRate: '8.25', discount: '100',
        estimateOptions: PACKED.estimateOptions, estimateOptionsInternal: PACKED.estimateOptionsInternal, clientOptionChoice: null, clientSignedBy: 'Jane Doe (chose C: Best)',
    };
    // job costing budget
    const costing = summarizeJobCosting([light as unknown as CostingDoc], { laborRate: 50 });
    eq('job costing budget = chosen option', costing.budget, BEST.total);
    const costingRec = summarizeJobCosting([{ ...light, clientSignedBy: 'Jane Doe' } as unknown as CostingDoc], { laborRate: 50 });
    eq('job costing budget = Recommended when accepted without a choice', costingRec.budget, BETTER.total);
    check('job costing splits the chosen option’s lines', costing.rows.some(r => r.budget !== null) || costing.unsplitBudget > 0);
    // Job financials
    eq('Job financials contract value = chosen option', summarizeJobMoney([light as unknown as FinanceDoc], { laborRate: 50 }).contractValue, BEST.total);
    // pipeline
    const pd = mapPipelineRow({ id: 'e1', type: 'Estimate', job_id: 'j1', created_at: '2026-11-10T10:00:00Z', ...light, issueDate: '2026-11-10' });
    eq('pipeline: value of an accepted options estimate = chosen', docTotal(pd), BEST.total);
    const sentRow = mapPipelineRow({ id: 'e2', type: 'Estimate', job_id: 'j1', created_at: '2026-11-10T10:00:00Z', status: 'Sent', issueDate: '2026-11-10', lineItems: PACKED.lineItems, taxRate: 8.25, discount: 100, estimateOptions: JSON.stringify(PACKED.estimateOptions) });
    const card = placeJob({ id: 'j1', name: 'Roof', status: 'active' }, [sentRow], '2026-11-14');
    eq('pipeline: "Estimate sent" value = Recommended', (card as any).card?.value, BETTER.total);
    const fullRow = mapPipelineRow({ id: 'e3', type: 'Estimate', job_id: 'j1', created_at: '2026-11-10T10:00:00Z', data: { ...PACKED, status: 'Sent', estimateOptions: { ...PACKED.estimateOptions, recommendedId: undefined } } });
    eq('pipeline (full row fallback): lowest when nothing is Recommended', docTotal(fullRow), GOOD.total);
    // Insights
    const docs = [
        { id: 'a1', type: 'Estimate', jobId: 'j1', createdAt: '2026-11-10T10:00:00Z', issueDate: '2026-11-10', status: 'Sent', lineItems: PACKED.lineItems, taxRate: 8.25, discount: 100, estimateOptions: PACKED.estimateOptions, clientOptionChoice: null, clientSignedBy: null },
    ] as unknown as AnalyticsDoc[];
    eq('Insights: open estimates pipeline = Recommended', computeAnalytics(docs, '2026-11-01', '2026-11-30', { todayYMD: '2026-11-14' }).pipeline, BETTER.total);
    const plainRow = mapPipelineRow({ id: 'p', type: 'Estimate', status: 'Sent', lineItems: [{ quantity: 2, rate: 50 }], taxRate: 10 });
    eq('pipeline: plain estimate unchanged', docTotal(plainRow), 110);
}

// ---------------------------------------------------------------------------------------------------------------
// 6. client pages: the signing call
// ---------------------------------------------------------------------------------------------------------------
{
    const set = readOptionSet(PACKED)!;
    const portal = planChoiceSigning({ portalKey: 'k'.repeat(40), documentId: 'doc-1' }, set, 'opt-best', '  Jane Doe ', 'data:image/png;base64,AAA');
    eq('portal: new SQL function + args', [portal.rpc.name, Object.keys(portal.rpc.args).sort()], ['sign_document_option_via_portal', ['p_doc_id', 'p_key', 'p_option_id', 'p_signature', 'p_signer_name']]);
    eq('portal: option id + clean name', [portal.rpc.args.p_option_id, portal.rpc.args.p_signer_name], ['opt-best', 'Jane Doe']);
    eq('portal fallback: existing function with the pick in the name', [portal.fallback.name, portal.fallback.signerName, Object.keys(portal.fallback.args).sort()], ['sign_document_via_portal', 'Jane Doe (chose C: Best)', ['p_doc_id', 'p_key', 'p_signature']]);
    const link = planChoiceSigning({ token: 'tok' }, set, 'opt-good', 'Jane', 'sig');
    eq('approval link: new SQL function + fallback', [link.rpc.name, link.rpc.args.doc_token, link.fallback.name, link.fallback.signerName], ['approve_document_option_by_token', 'tok', 'approve_document_by_token', 'Jane (chose A: Good)']);
    let threw = false;
    try { planChoiceSigning({ token: 't' }, set, 'nope', 'Jane', 'sig'); } catch { threw = true; }
    check('unknown option refused before calling', threw);
    // what the contractor's app reads back after the fallback signing
    const after = { ...PACKED, status: 'Accepted', clientSignedAt: '2026-11-13T15:00:00Z', clientSignedBy: portal.fallback.signerName, clientSignerName: portal.fallback.signerName };
    eq('fallback round trip → Best is the choice', [choiceOf(after)?.optionId, choiceOf(after)?.by], ['opt-best', 'client']);
}

// ---------------------------------------------------------------------------------------------------------------
// 7. PDF / preview model + every design; old estimates unchanged
// ---------------------------------------------------------------------------------------------------------------
{
    const profile = { companyName: 'Acme Roofing', address: '1 Main St', phone: '555-0100', email: 'a@acme.test' };
    const job = { name: 'Roof', clientName: 'Jane Doe' };
    const m = buildDocumentModel('Estimate', PACKED, profile, job);
    check('model: options instead of one table', m.choices !== null && m.items === null && m.totals.length === 0);
    eq('model: cards', m.choices!.cards.map(c => [c.letter, c.name, c.recommended, c.chosen]), [['A', 'Good', false, false], ['B', 'Better', true, false], ['C', 'Best', false, false]]);
    eq('model: card totals', m.choices!.cards.map(c => c.totals.find(t => t.kind === 'grand')?.value), [GOOD, BETTER, BEST].map(t => `$${t.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`));
    eq('model: option lines only (shared printed once)', [m.choices!.cards[1].items.rows.length, m.choices!.shared?.rows.length], [3, 2]);
    eq('model: "Choose one option" + note', [m.choices!.title, /Tick one option/.test(m.choices!.note)], ['Choose one option', true]);
    eq('model: highlight = options from', [m.highlight?.label, m.highlight?.value], ['Options from', `$${GOOD.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]);
    const mc = buildDocumentModel('Estimate', { ...PACKED, status: 'Accepted', clientSignedAt: '2026-11-13T15:00:00Z', clientSignedBy: 'Jane Doe (chose C: Best)' }, profile, job);
    eq('model: chosen card + note', [mc.choices!.cards.map(c => c.chosen), mc.choices!.title, /Chosen by Jane Doe/.test(mc.choices!.note), mc.highlight?.label], [[false, false, true], 'Your options', true, 'Chosen option']);
    const ma = buildDocumentModel('Estimate', applyChosenOption({ ...PACKED, estimateOptions: recordContractorChoice(readOptionSet(PACKED)!, 'opt-best') })!, profile, job);
    check('model: applied estimate is a normal estimate + "Option" meta', ma.choices === null && ma.items!.rows.length === 4 && ma.meta.some(x => x.label === 'Option' && x.value.includes('Best')));
    const xss = buildDocumentModel('Estimate', { ...PACKED, estimateOptions: updateOption(readOptionSet(PACKED)!, 'opt-good', { name: '<img src=x onerror=1>', description: '<b>x</b>' }) }, profile, job);
    check('model: option names / descriptions escaped', !JSON.stringify(xss.choices).includes('<img') && !JSON.stringify(xss.choices).includes('<b>'));

    let rendered = 0;
    for (const id of ALL_TEMPLATE_IDS) {
        const html = renderDocument('Estimate', { ...PACKED, templateId: id }, profile, job, { templateId: id, noFontLink: true }).html;
        const ok = html.includes('class="cd-opts-list"') && (html.match(/<section class="[^"]*\bcd-items cd-opt[ "]/g) || []).length === 4
            && (html.match(/<section class="[^"]*\bcd-opt-sum\b/g) || []).length === 3 && html.includes('Choose one option') && html.includes('Included in every option')
            && html.includes('Recommended') && !html.includes('class="cd-row cd-row-filler"');
        check(`design ${id}: renders the options`, ok);
        if (ok) rendered++;
    }
    check('every design renders options', rendered === ALL_TEMPLATE_IDS.length && rendered >= 26, rendered);

    // old estimates: identical model and HTML
    const old = { ...BASE, lineItems: [L('p1', 'Work', 2, 500, 300), L('p2', 'Material', 3, 40)], status: 'Sent' };
    const mo = buildDocumentModel('Estimate', old, profile, job);
    check('old estimate: no options in the model', mo.choices === null && mo.items!.rows.length === 2 && mo.totals.some(t => t.kind === 'grand'));
    eq('old estimate: money helpers untouched', [effectiveEstimateLines(old), withEffectiveLines(old) === old, packOptionsForSave(old) === old], [old.lineItems, true, true]);
    const legacySigned = (d: any) => {
        const items = Array.isArray(d.lineItems) ? d.lineItems : [];
        const t = computeDocumentTotals(d);
        return { lines: items.map((li: any) => [String(li.description).trim(), li.quantity, roundMoney(li.rate), 0]), subtotal: t.subtotal, discount: t.discount, taxRate: t.taxRate, tax: t.tax, total: t.total, terms: d.terms, notes: '' };
    };
    eq('old estimate: signed content same as before', signedContent(old, 'estimate'), legacySigned(old));
    const htmlOld = renderDocument('Estimate', old, profile, job, { templateId: 'standard', noFontLink: true }).html;
    check('old estimate HTML has no option blocks', !htmlOld.includes('class="cd-opts-list"') && !/<section class="[^"]*\bcd-items cd-opt[ "]/.test(htmlOld));
}

// ---------------------------------------------------------------------------------------------------------------
// 8. draft SQL + wiring
// ---------------------------------------------------------------------------------------------------------------
{
    const sql = read('supabase/migrations/20261114000100_estimate_options_choice.sql');
    check('draft SQL: functions only (no table change)', !/\b(create|alter|drop)\s+table\b/i.test(sql) && !/\bupdate\s+public\.documents\s+set\b(?![^;]*where id = v_doc\.id)/i.test(sql));
    check('draft SQL: both signing functions', sql.includes('function public.sign_document_option_via_portal(\n  p_key text, p_doc_id uuid, p_option_id text, p_signature text, p_signer_name text default null)')
        && sql.includes('function public.approve_document_option_by_token(\n  doc_token uuid, p_option_id text, p_signature text, p_signer_name text default null)'));
    check('draft SQL: guard keeps / clears clientOptionChoice', sql.includes("'clientSignedBy', 'clientOptionChoice']") && sql.includes("new.data := new.data - 'clientOptionChoice';"));
    check('draft SQL: private fields restored from estimateOptionsInternal', sql.includes("p_doc.data -> 'estimateOptionsInternal' -> (l.value ->> 'id')"));
    check('draft SQL: public grants for the two functions', sql.includes('grant execute on function public.sign_document_option_via_portal(text, uuid, text, text, text) to anon, authenticated;')
        && sql.includes('grant execute on function public.approve_document_option_by_token(uuid, text, text, text)      to anon, authenticated;'));
    // Applied 2026-11-14 with the owner's OK: exactly one migration holds it.
    check('options SQL is one applied migration', readdirSync(join(root, 'supabase/migrations')).filter((f: string) => /estimate_options_choice/.test(f)).length === 1);

    const form = read('components/EstimateForm.tsx');
    check('form: saves client-safe options', form.includes('prepare: d => packOptionsForSave(d)') && form.includes('hydrate: d => unpackOptionsForEdit(backfillCompany({'));
    check('form: Good / better / best button, editor, choice bar, applied strip', ['Good / better / best', '<EstimateOptionsEditor', '<OptionChoiceBar', '<AppliedOptionStrip'].every(x => form.includes(x)));
    check('form: AI lines go into the option that counts', form.includes('onApply={applyAiDraft}'));
    const portal = read('components/PortalView.tsx');
    const approval = read('components/DocumentApprovalView.tsx');
    check('portal + link: pick then sign', portal.includes('signWithOption({ portalKey: key, documentId: current.id }') && approval.includes('signWithOption({ token }'));
    check('signing waits for a pick', approval.includes("needsOption ? 'Choose an option'") && approval.includes('!needsOption'));
    check('fallback only when the function is missing', approval.includes('if (!isMissingFunctionError(res.error)) throw'));
    for (const [f, needle] of [['components/pipeline/pipelineApi.ts', '...OPTION_SELECT_PATHS'], ['lib/costingApi.ts', '...OPTION_SELECT_PATHS'], ['components/AnalyticsView.tsx', '...OPTION_SELECT_PATHS'], ['components/forms/jobDocuments.ts', '...OPTION_SELECT_PATHS']] as const) {
        check(`${f} selects the option fields`, read(f).includes(needle));
    }
    check('blocks: every design gets the options from defaultParts', read('utils/templates/blocks.ts').includes('items: m.choices ? choicesBlocks(ctx) : itemsBlock(ctx, theme.fillRows || 0)'));
    check('engine is pure (no supabase / react)', !/from '\.\/supabase|from 'react'/.test(read('lib/estimateOptions.ts')));
    check('offline: the client pick is server-owned', read('lib/offline/outboxModel.ts').includes("'clientOptionChoice'"));
    check('AI drafts never set the client pick', read('hooks/useDocumentDraftPrefill.ts').includes("'clientOptionChoice'"));
    check('emails / texts / lists say "3 options from $…" before a choice', read('components/ShareModal.tsx').includes("'[Total Amount]': totalText") && read('components/DocumentCard.tsx').includes('documentTotalTextOf(d)'));
    check('help guide + AI knowledge (sync-knowledge)', read('components/help/helpContent.ts').includes("id: 'estimate-options'") && read('components/help/helpContent.ts').includes('[[Apply chosen option]]')
        && read('supabase/functions/ai-assistant/shared/helpGuides.generated.ts').includes('"id": "estimate-options"'));
    check('pagination keeps an option with its totals', read('utils/templates/paginate.ts').includes("block.classList.contains('cd-opt-sum') ? keepWithRows(block, 'cd-opt', true)"));
}

// ---------------------------------------------------------------------------------------------------------------
const total = passed + failures.length;
for (const f of failures.slice(0, 80)) console.log(`FAIL  ${f}`);
console.log(failures.length ? `estimate-options-check: ${failures.length} of ${total} checks failed` : `estimate-options-check: all ${total} checks passed`);
process.exit(failures.length ? 1 : 0);
