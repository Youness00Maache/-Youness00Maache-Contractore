/**
 * Estimate reviewer (roadmap N1) — deterministic checks, pure, no browser, no network:
 *   npx tsx scripts/estimate-review-check.ts
 *
 *  1. a clean estimate (and a clean options estimate) gets no finding at all
 *  2. every rule: math, decimals, discount, tax rate, zero / negative / unusual / decimal quantities, no price,
 *     below cost, margin (usual from the price book, default 10%, loss), labor / materials mix, price-book gap, tax
 *  3. good / better / best: each option on its own, shared lines once, identical options, applied option = one total
 *  4. helpers: units, usual tax, usual margin, price-book match, line kinds
 *  5. Add line: price-book suggestion = the picked item's line; nothing typed is lost; options target / shared
 *  6. AI request / answer (browser side), signature, unreviewed HIGH count; wiring in the form and the Share window
 *  7. the panel, the Share note and the hook render (server render)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    REVIEW_LIMITS, addSuggestedLine, buildAiReviewBody, lineKind, matchPriceBookItem, parseAiReviewResponse, reviewEstimate,
    reviewSignature, suggestionToLine, thingsToCheck, unitFamily, unreviewedHigh, usualMarginOf, usualTaxRateOf,
    type ReviewFinding, type ReviewPriceItem,
} from '../lib/estimateReview.ts';
import { createOptionSet, readOptionSet, syncMirror, type OptionSet } from '../lib/estimateOptions.ts';
import type { LineItem } from '../types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: unknown) => { if (cond) passed++; else failures.push(name); };
const eq = (name: string, a: unknown, b: unknown) => {
    const same = JSON.stringify(a) === JSON.stringify(b);
    if (same) passed++; else failures.push(`${name}\n      got      ${JSON.stringify(a)}\n      expected ${JSON.stringify(b)}`);
};

let n = 0;
const L = (description: string, quantity: number, rate: number, extra: Partial<LineItem> = {}): LineItem => ({ id: `l${++n}`, description, quantity, rate, ...extra });
const rules = (f: ReviewFinding[]) => f.map(x => x.rule);
const ruleOf = (f: ReviewFinding[], rule: string) => f.find(x => x.rule === rule);

const BOOK: ReviewPriceItem[] = [
    { id: 'pb-tile', name: 'Porcelain floor tile', rate: 6.5, unit: 'sq ft', unit_cost: 3.2, type: 'material' },
    { id: 'pb-grout', name: 'Grout', description: 'Sanded, 25 lb', rate: 22, unit: 'bag', unit_cost: 11, type: 'material', sku: 'GR-25' },
    { id: 'pb-thinset', name: 'Thinset adhesive', rate: 28, unit: 'bag', unit_cost: 15, type: 'material' },
    { id: 'pb-labor', name: 'Tile installation labor', rate: 75, unit: 'hr', unit_cost: 35, type: 'labor' },
    { id: 'pb-disposal', name: 'Debris disposal', rate: 150, type: 'service' },
];
const HISTORY = { usualTaxRate: 8.25 };
const cleanLines = () => [
    L('Porcelain floor tile', 120, 6.5, { unit: 'sq ft', unitCost: 3.2, itemSource: 'pricebook' }),
    L('Tile installation labor', 16, 75, { unit: 'hr', unitCost: 35 }),
    L('Thinset adhesive', 4, 28, { unit: 'bag', unitCost: 15 }),
    L('Grout - Sanded, 25 lb', 3, 22, { unit: 'bag', unitCost: 11 }),
    L('Debris disposal', 1, 150),
];
const est = (lineItems: LineItem[], extra: Record<string, unknown> = {}) => ({ estimateNumber: 'EST-1', lineItems, taxRate: 8.25, discount: 0, notes: '', ...extra });
const review = (data: unknown, opts: Parameters<typeof reviewEstimate>[1] = { priceBook: BOOK, history: HISTORY }) => reviewEstimate(data, opts);

// ── 1. clean estimates: no false alarms ──
{
    eq('clean estimate: nothing to flag', review(est(cleanLines())), []);
    eq('clean estimate without price book / history: nothing to flag', reviewEstimate(est(cleanLines())), []);
    eq('clean estimate with a blank last line (new line not typed yet)', review(est([...cleanLines(), L('', 1, 0)])), []);
    eq('lump-sum estimate: nothing to flag', review(est([L('Bathroom remodel, complete per scope', 1, 18500)])), []);
    eq('labor + materials in one line: nothing to flag', review(est([L('Supply and install 3 ceiling fans', 3, 240)])), []);
    eq('heading and included lines are not "no price"', rules(review(est([...cleanLines(), L('DEMOLITION:', 1, 0), L('Haul away old vanity (included)', 1, 0)]))), []);
    eq('a credit line is not "negative"', rules(review(est([...cleanLines(), L('Credit for returned tile', 1, -60)]))), []);
    const set = createOptionSet(cleanLines());
    set.options[1].lineItems.push(L('Heated floor mat', 1, 450, { unit: 'each' }), L('Thermostat installation', 1, 120));
    set.options[2].lineItems = set.options[2].lineItems.map(li => ({ ...li }));
    set.options[2].lineItems.push(L('Premium grout sealer', 1, 60, { unitCost: 25 }), L('Heated floor mat', 1, 450), L('Thermostat installation', 1, 120));
    eq('clean options estimate: nothing to flag', review(syncMirror({ ...est([]), estimateOptions: set })), []);
}

// ── 2. every rule ──
{
    const empty = review(est([L('', 1, 0)]));
    eq('empty estimate → one HIGH "no lines"', [rules(empty), empty[0]?.severity], [['empty'], 'high']);

    const typo = review(est(cleanLines(), { taxRate: 82.5 }));
    ok('tax 82.5% → HIGH, suggests 8.25%', ruleOf(typo, 'tax_rate')?.severity === 'high' && /did you mean 8\.25%/.test(ruleOf(typo, 'tax_rate')!.message));
    const tiny = review(est(cleanLines(), { taxRate: 0.08 }));
    ok('tax 0.08% → medium, suggests 8%', ruleOf(tiny, 'tax_rate')?.severity === 'medium' && /8%/.test(ruleOf(tiny, 'tax_rate')!.message));

    const disc = review(est([L('Porcelain floor tile', 10, 6.5, { unit: 'sq ft' }), L('Tile installation labor', 2, 75, { unit: 'hr' })], { discount: 500 }));
    ok('discount larger than the subtotal → HIGH', ruleOf(disc, 'discount')?.severity === 'high' && /\$215\.00/.test(ruleOf(disc, 'discount')!.message));

    const storedDoc = review({ ...est(cleanLines()), total: 999 });
    ok('a saved total that is not the lines → HIGH math', ruleOf(storedDoc, 'math')?.severity === 'high' && /saved total/.test(ruleOf(storedDoc, 'math')!.message));
    const storedLine = review(est([...cleanLines(), { ...L('Thinset adhesive', 2, 28, { unit: 'bag' }), total: 60 } as LineItem]));
    ok('a line total that is not qty × price → HIGH math', storedLine.some(f => f.rule === 'math' && /is not 2 × \$28\.00/.test(f.message)));
    eq('a matching saved total is fine', rules(review({ ...est(cleanLines()), subtotal: 2308, total: 2498.41 })), []);

    const dec = review(est([...cleanLines(), L('Edge trim', 3, 12.345, { unit: 'lf' })]));
    ok('price with 3 decimals → low', ruleOf(dec, 'decimals')?.severity === 'low');

    const zero = review(est([...cleanLines(), L('Shower niche', 0, 180)]));
    ok('quantity 0 with a price → HIGH', ruleOf(zero, 'zero_qty')?.severity === 'high' && /“Shower niche”/.test(ruleOf(zero, 'zero_qty')!.message));
    const neg = review(est([...cleanLines(), L('Baseboard', -10, 4, { unit: 'lf' })]));
    ok('negative quantity (not a credit) → medium', ruleOf(neg, 'negative')?.severity === 'medium');

    const noPrice = review(est([...cleanLines(), L('Shower valve', 1, 0)]));
    const np = ruleOf(noPrice, 'no_price');
    ok('line without a price → HIGH, names the line', np?.severity === 'high' && /“Shower valve” has no price/.test(np.message) && np.lineId === noPrice.find(f => f.rule === 'no_price')!.lineId);
    eq('"Fixture allowance" at $0 is still flagged', rules(review(est([...cleanLines(), L('Fixture allowance', 1, 0)]))), ['no_price']);

    const big = review(est([...cleanLines(), L('Outlet cover', 400, 3, { unit: 'each' })]));
    ok('400 each → unusual quantity (medium)', ruleOf(big, 'qty_unusual')?.severity === 'medium' && /400 each/.test(ruleOf(big, 'qty_unusual')!.message));
    eq('1,200 sq ft is a normal quantity', rules(review(est(cleanLines().map(li => (li.unit === 'sq ft' ? { ...li, quantity: 1200 } : li))))), []);
    const lump = review(est([...cleanLines(), L('Mobilization', 12, 100, { unit: 'lump sum' })]));
    ok('12 × lump sum → unusual quantity', ruleOf(lump, 'qty_unusual') !== undefined);
    const peers = review(est([L('Wall tile', 40, 8, { unit: 'sq ft' }), L('Floor tile', 60, 7, { unit: 'sq ft' }), L('Backsplash tile', 30, 12, { unit: 'sq ft' }), L('Accent tile', 1400, 15, { unit: 'sq ft' }), L('Tile installation labor', 20, 75, { unit: 'hr' })]));
    eq('a quantity under 10 × typical for the unit is not flagged even if peers are small', rules(peers).includes('qty_unusual'), false);

    const half = review(est([...cleanLines(), L('Toilet flange', 2.5, 14, { unit: 'ea' })]));
    ok('2.5 each → medium (whole numbers for pieces)', ruleOf(half, 'qty_decimal')?.severity === 'medium');
    eq('2.5 hours is fine', rules(review(est(cleanLines().map(li => (li.unit === 'hr' ? { ...li, quantity: 16.5 } : li))))), []);

    const below = review(est([...cleanLines(), L('Heated floor mat', 1, 300, { unitCost: 380 })]));
    ok('priced below cost → HIGH', ruleOf(below, 'below_cost')?.severity === 'high' && /below your cost of \$380\.00/.test(ruleOf(below, 'below_cost')!.message));

    // margin: the usual 50% comes from the price book (median of price vs cost); default 10% without one
    eq('usual margin from the price book (median of price vs cost)', usualMarginOf(BOOK), 50.4);
    const thin = review(est(cleanLines().map(li => ({ ...li, unitCost: li.unitCost ? li.rate * 0.7 : undefined }))));
    ok('margin 30% vs usual 50.4% → medium "below your usual"', ruleOf(thin, 'margin_low')?.severity === 'medium' && /below your usual 50\.4%/.test(ruleOf(thin, 'margin_low')!.message));
    const thinNoBook = reviewEstimate(est(cleanLines().map(li => ({ ...li, unitCost: li.rate * 0.95 }))));
    ok('margin 5% without a usual margin → medium "below 10%"', ruleOf(thinNoBook, 'margin_low')?.severity === 'medium' && new RegExp(`below ${REVIEW_LIMITS.minMargin}%`).test(ruleOf(thinNoBook, 'margin_low')!.message));
    eq('margin 30% without a usual margin is fine', rules(reviewEstimate(est(cleanLines().map(li => ({ ...li, unitCost: li.rate * 0.7 }))))), []);
    const loss = reviewEstimate(est([L('Kitchen cabinets', 1, 4000, { unitCost: 4300 }), L('Cabinet installation labor', 10, 70, { unit: 'hr', unitCost: 45 })], { discount: 400 }));
    ok('costs above the price (after the discount) → HIGH loss', loss.some(f => f.rule === 'margin_low' && f.severity === 'high' && /loses/.test(f.message)));

    const matOnly = review(est([L('Porcelain floor tile', 120, 6.5, { unit: 'sq ft' }), L('Thinset adhesive', 4, 28, { unit: 'bag' }), L('Grout', 3, 22, { unit: 'bag' })]));
    eq('materials only → medium "no labor"', [rules(matOnly), ruleOf(matOnly, 'no_labor')?.severity], [['no_labor'], 'medium']);
    eq('materials only, notes say labor is not included → fine', rules(review(est(matOnly.length ? [L('Porcelain floor tile', 120, 6.5, { unit: 'sq ft' }), L('Grout', 3, 22, { unit: 'bag' })] : [], { notes: 'Supply only. Labor not included.' }))), []);
    const laborOnly = review(est([L('Tile installation labor', 16, 75, { unit: 'hr' }), L('Debris disposal', 1, 150)]));
    eq('labor only → low "no materials"', [rules(laborOnly), ruleOf(laborOnly, 'no_materials')?.severity], [['no_materials'], 'low']);
    eq('labor only, client supplies materials → fine', rules(review(est([L('Tile installation labor', 16, 75, { unit: 'hr' })], { notes: 'Materials supplied by the client.' }))), []);

    const cheap = review(est(cleanLines().map(li => (li.description.startsWith('Grout') ? { ...li, rate: 15 } : li))));
    ok('32% below the price book → medium, names the book price', ruleOf(cheap, 'price_book')?.severity === 'medium' && /32% below your price book \(\$22\.00 \/ bag\)/.test(ruleOf(cheap, 'price_book')!.message));
    const dear = review(est(cleanLines().map(li => (li.description.startsWith('Grout') ? { ...li, rate: 30 } : li))));
    ok('36% above the price book → low', ruleOf(dear, 'price_book')?.severity === 'low' && /above/.test(ruleOf(dear, 'price_book')!.message));
    eq('within ±25% of the price book is fine', rules(review(est(cleanLines().map(li => (li.description.startsWith('Grout') ? { ...li, rate: 26 } : li))))), []);
    eq('another unit than the price book is not compared', rules(review(est(cleanLines().map(li => (li.description.startsWith('Grout') ? { ...li, rate: 5, unit: 'lb', unitCost: 2 } : li))))), []);
    const bySku = review(est([...cleanLines().filter(li => !li.description.startsWith('Grout')), L('Sanded grout GR-25', 3, 12, { unit: 'bag' })]));
    ok('matched by SKU', ruleOf(bySku, 'price_book') !== undefined);

    const noTax = review(est(cleanLines(), { taxRate: 0 }));
    ok('no tax when the user usually charges 8.25% → medium', ruleOf(noTax, 'tax_missing')?.severity === 'medium' && /8\.25%/.test(ruleOf(noTax, 'tax_missing')!.message));
    eq('no tax and no tax history → nothing', rules(review(est(cleanLines(), { taxRate: 0 }), { priceBook: BOOK, history: { usualTaxRate: null } })), []);

    // sorted: high first
    const mixed = review(est([...cleanLines(), L('Shower valve', 1, 0), L('Toilet flange', 2.5, 14, { unit: 'ea' })], { taxRate: 0 }));
    eq('highest severity first', mixed.map(f => f.severity), ['high', 'medium', 'medium']);
    eq('ids are stable across re-checks', review(est([...cleanLines(), L('Shower valve', 1, 0)])).map(f => f.id).length, 1);
}

// ── 3. good / better / best ──
{
    const good = [L('Porcelain floor tile', 120, 6.5, { unit: 'sq ft' }), L('Tile installation labor', 16, 75, { unit: 'hr' })];
    const better = [...good.map(li => ({ ...li, id: `${li.id}b` })), L('Shower valve', 1, 0)];
    const best = [...good.map(li => ({ ...li, id: `${li.id}c` }))];
    const set: OptionSet = {
        version: 1, kind: 'estimate',
        options: [{ id: 'o1', name: 'Good', lineItems: good }, { id: 'o2', name: 'Better', lineItems: better }, { id: 'o3', name: 'Best', lineItems: best }],
        sharedLineItems: [L('Thinset adhesive', 4, 28, { unit: 'bag' }), L('Grout', 3, 22, { unit: 'bag' }), L('Debris disposal', 1, 0)],
        recommendedId: 'o2',
    };
    const f = review(syncMirror({ ...est([]), estimateOptions: set }));
    const valve = f.filter(x => x.rule === 'no_price' && /Shower valve/.test(x.message));
    eq('a line of one option is flagged once, on that option', valve.map(x => [x.optionId, x.optionName]), [['o2', 'Better']]);
    const shared = f.filter(x => x.rule === 'no_price' && /Debris disposal/.test(x.message));
    eq('a shared line is flagged once, "In every option"', shared.map(x => [x.optionId, x.optionName]), [['shared', 'In every option']]);
    const same = f.filter(x => x.rule === 'options_same');
    eq('Best has the same lines as Good → medium', same.map(x => [x.optionName, x.severity, /same lines as Good/.test(x.message)]), [['Best', 'medium', true]]);

    // per-option margin and labor/material mix
    const set2: OptionSet = {
        ...set,
        options: [
            { id: 'o1', name: 'Good', lineItems: [L('Porcelain floor tile', 120, 6.5, { unit: 'sq ft', unitCost: 6.4 })] },
            { id: 'o2', name: 'Better', lineItems: [L('Porcelain floor tile', 120, 9, { unit: 'sq ft', unitCost: 4 }), L('Tile installation labor', 16, 75, { unit: 'hr', unitCost: 35 })] },
        ],
        sharedLineItems: [],
    };
    const f2 = reviewEstimate(syncMirror({ ...est([]), estimateOptions: set2 }));
    eq('margin and labor mix checked per option', f2.filter(x => x.rule === 'margin_low' || x.rule === 'no_labor').map(x => [x.rule, x.optionName]), [['no_labor', 'Good'], ['margin_low', 'Good']]);

    const applied = syncMirror({ ...est(cleanLines()), estimateOptions: { ...createOptionSet(cleanLines()), appliedId: undefined } });
    const appliedSet = readOptionSet(applied)!;
    const appliedData = { ...est(cleanLines()), estimateOptions: { ...appliedSet, appliedId: appliedSet.options[0].id } };
    eq('an applied option is a normal one-total estimate (identical options not flagged)', review(appliedData), []);
}

// ── 4. helpers ──
{
    eq('unit families', ['ea', 'Each', 'hrs', 'sq ft', 'SF', 'lf', 'bag', 'lump sum', '', 'visit'].map(unitFamily), ['each', 'each', 'hour', 'sqft', 'sqft', 'lf', 'bag', 'lump', 'none', 'other']);
    eq('usual tax: most common rate of the recent documents', usualTaxRateOf([8.25, '8.25', 0, 8.25, 7]), 8.25);
    eq('usual tax: newest wins a tie', usualTaxRateOf([7, 8.25, 7, 8.25]), 7);
    eq('usual tax: mostly untaxed → null', usualTaxRateOf([0, 0, 8, 0]), null);
    eq('usual tax: fewer than 3 documents → null', usualTaxRateOf([8, 8]), null);
    eq('usual margin from markups (100% markup = 50% margin)', usualMarginOf([{ id: 'a', name: 'a', markup: 100 }, { id: 'b', name: 'b', markup: 100 }, { id: 'c', name: 'c', markup: 100 }]), 50);
    eq('usual margin unknown', usualMarginOf([{ id: 'a', name: 'a', rate: 10 }]), null);
    eq('price-book match: exact name / "name - description" / none', [
        matchPriceBookItem({ description: 'grout' }, BOOK)?.id, matchPriceBookItem({ description: 'Grout - Sanded, 25 lb' }, BOOK)?.id, matchPriceBookItem({ description: 'Groutless tile' }, BOOK)?.id,
    ], ['pb-grout', 'pb-grout', undefined]);
    eq('line kinds', [
        lineKind({ description: 'Install vanity' }), lineKind({ description: 'Labor', unit: 'hr' }), lineKind({ description: 'Drywall sheets', unit: 'sheet' }),
        lineKind({ description: 'Permit fee' }), lineKind({ description: 'Kitchen remodel' }), lineKind({ description: 'Grout' }, BOOK),
        lineKind({ description: 'Debris disposal' }, BOOK), lineKind({ description: 'Interior painting' }), lineKind({ description: 'Paint, 2 gal' }),
    ], ['both', 'labor', 'material', 'expense', 'other', 'material', 'labor', 'labor', 'material']);
}

// ── 5. Add line ──
{
    const saved = BOOK.map(b => ({ ...b, user_id: 'u' })) as any[];
    const fromBook = suggestionToLine({ description: 'Grout', quantity: 3, unit: 'bag', rate: 22, priceBookItemId: 'pb-grout', needsPrice: false }, saved);
    eq('price-book suggestion = the picked item\'s line', [fromBook.description, fromBook.quantity, fromBook.rate, fromBook.unit, fromBook.unitCost, fromBook.itemSource, 'priceBookItemId' in fromBook],
        ['Grout - Sanded, 25 lb', 3, 22, 'bag', 11, 'pricebook', false]);
    const unpriced = suggestionToLine({ description: 'Permit fee', quantity: null, rate: null, needsPrice: true }, saved);
    eq('other suggestion: no price, quantity 1', [unpriced.description, unpriced.quantity, unpriced.rate, unpriced.itemSource], ['Permit fee', 1, 0, undefined]);
    ok('suggested lines get their own id', fromBook.id && unpriced.id && fromBook.id !== unpriced.id);

    const typed = est([L('Porcelain floor tile', 120, 6.5), L('', 1, 0)]);
    const next = addSuggestedLine(typed, unpriced);
    eq('one total: added at the end, the empty last line reused, typed lines untouched', next.lineItems.map((l: LineItem) => l.description), ['Porcelain floor tile', 'Permit fee']);
    ok('the original lines are the same objects (nothing retyped)', next.lineItems[0] === typed.lineItems[0]);
    const typing = est([L('Porcelain floor tile', 120, 6.5), L('Half-typed', 1, 0)]);
    eq('a last line with text is kept', addSuggestedLine(typing, unpriced).lineItems.length, 3);

    const set = createOptionSet([L('Porcelain floor tile', 120, 6.5)]);
    const withOpts = syncMirror({ ...est([]), estimateOptions: set });
    const toBetter = syncMirror(addSuggestedLine(withOpts, fromBook, set.options[1].id));
    const s2 = readOptionSet(toBetter)!;
    eq('options: added to the finding\'s option only', s2.options.map(o => o.lineItems.length), [1, 2, 1]);
    const toAll = syncMirror(addSuggestedLine(withOpts, unpriced, 'shared'));
    eq('options: no option (or "shared") → the lines in every option', [readOptionSet(toAll)!.sharedLineItems.map(l => l.description), toAll.lineItems.map((l: LineItem) => l.description)], [['Permit fee'], ['Porcelain floor tile', 'Permit fee']]);
}

// ── 6. AI request / answer, signature, unreviewed HIGH; wiring ──
{
    const data = est([...cleanLines(), L('Shower valve', 1, 0)], { title: 'Bathroom floor', notes: 'Hidden damage not included.' });
    const checks = review(data);
    const body = buildAiReviewBody({ data, savedItems: BOOK as any, jobName: 'Smith bathroom', clientName: 'Jane Smith', language: 'en', today: '2026-11-14', checks });
    const e = body.estimate as any;
    eq('AI body: task + compact lines with cost', [body.task, e.lines.length, e.lines[0]], ['estimate_review', 6, { desc: 'Porcelain floor tile', qty: 120, unit: 'sq ft', price: 6.5, cost: 3.2 }]);
    eq('AI body: title, notes, tax', [e.title, e.notes, e.tax_rate], ['Bathroom floor', 'Hidden damage not included.', 8.25]);
    const ctx = body.context as any;
    eq('AI body: context + the checks already shown', [ctx.job_name, ctx.client_name, ctx.today, ctx.checks.length, /Shower valve/.test(ctx.checks[0])], ['Smith bathroom', 'Jane Smith', '2026-11-14', 1, true]);
    const pb = body.price_book as any[];
    ok('AI body: sell-side price-book slice (no costs)', pb.length === BOOK.length && pb.every(i => !('unit_cost' in i) && !('cost' in i) && typeof i.price === 'number'));
    const set = createOptionSet(cleanLines());
    const optBody = buildAiReviewBody({ data: syncMirror({ ...est([]), estimateOptions: set }), today: '2026-11-14' }).estimate as any;
    eq('AI body: options with names, recommended, shared', [optBody.options.map((o: any) => o.name), optBody.options[1].recommended, optBody.shared, 'lines' in optBody], [['Good', 'Better', 'Best'], true, [], false]);

    const answer = { ok: true, task: 'estimate_review', review: { findings: [
        { severity: 'high', kind: 'missing_item', message: 'Tile work but no grout.', option: 'Better', line: { description: 'Grout', quantity: 3, unit: 'bag', rate: 22, price_book_item_id: 'pb-grout', needs_price: false } },
        { severity: 'medium', kind: 'missing_expense', message: 'No permit.', line: { description: 'Permit fee', quantity: null, rate: 99, needs_price: true } },
        { severity: 'weird', kind: 'nope', message: 'Hidden rot.' },
        { severity: 'low', message: '' },
    ] } };
    const parsed = parseAiReviewResponse(answer, syncMirror({ ...est([]), estimateOptions: set }));
    eq('AI answer: findings kept, empty dropped', parsed.map(f => [f.source, f.rule, f.severity, f.kind]), [['ai', 'ai', 'high', 'missing_item'], ['ai', 'ai', 'medium', 'missing_expense'], ['ai', 'ai', 'medium', 'other']]);
    eq('AI answer: option name → option id', [parsed[0].optionId, parsed[0].optionName], [set.options[1].id, 'Better']);
    eq('AI answer: price only with a price-book item', [parsed[0].suggested?.rate, parsed[0].suggested?.priceBookItemId, parsed[1].suggested?.rate, parsed[1].suggested?.needsPrice], [22, 'pb-grout', null, true]);
    ok('AI answer: stable ids', parseAiReviewResponse(answer, {}).map(f => f.id).join() === parseAiReviewResponse(answer, {}).map(f => f.id).join());
    let threw = false;
    try { parseAiReviewResponse({ ok: true, proposal: {} }, {}); } catch { threw = true; }
    ok('AI answer: not a review → error', threw);

    const sig = reviewSignature(data);
    eq('signature: same estimate, same signature', reviewSignature({ ...data }), sig);
    ok('signature: a quantity change → new signature', reviewSignature(est([...cleanLines(), L('Shower valve', 2, 0)], { title: 'Bathroom floor', notes: 'Hidden damage not included.' })) !== sig);

    const hi = unreviewedHigh(checks, new Set());
    eq('unreviewed HIGH findings', hi.map(f => f.rule), ['no_price']);
    eq('seen / ignored findings are reviewed', unreviewedHigh(checks, new Set([checks[0].id])).length, 0);
    eq('"N things to check"', [thingsToCheck(1), thingsToCheck(3)], ['1 thing to check', '3 things to check']);

    const form = read('components/EstimateForm.tsx');
    ok('form: Add line goes through update(prev => …) (nothing typed is lost)', /update\(prev => syncMirror\(addSuggestedLine\(prev, line, f\.optionId\)\)\)/.test(form));
    ok('form: review panel under the totals, hidden on a signed estimate', /\{!locked && <EstimateReviewPanel review=\{review\}/.test(form));
    ok('form: Share window gets the non-blocking notice', /topNotice=\{!locked \? <ReviewShareNotice/.test(form) && /<ShareButton ensureSaved=\{form\.ensureSaved\} onOpen=\{\(\) => setShareOpen\(true\)\} \/>/.test(form));
    const share = read('components/ShareModal.tsx');
    ok('Share window renders the notice and never disables sending for it', /\{topNotice\}/.test(share) && !/disabled=\{[^}]*topNotice/.test(share));
    const panel = read('components/review/EstimateReview.tsx');
    ok('panel: AI only on Premium + AI, upgrade otherwise', /ESTIMATE_REVIEW_TIER/.test(panel) && /dispatchUpgradeEvent\(ESTIMATE_REVIEW_UPGRADE_MESSAGE\)/.test(panel));
    ok('panel: AI failure keeps the checks + short note', /AI review unavailable, try again\./.test(panel));
    ok('panel: no icon-in-a-tinted-square cards', !/bg-primary\/10[^"]*rounded[^"]*p-2/.test(panel) && !/Icon className/.test(panel));
    ok('API module is loaded on demand', /await import\('\.\.\/\.\.\/lib\/estimateReviewApi\.ts'\)/.test(panel) && !/from '\.\.\/\.\.\/lib\/estimateReviewApi\.ts'/.test(panel));
    ok('offline audit lists the AI call', /lib\/estimateReviewApi\.ts', match: "functions\.invoke\('ai-assistant'/.test(read('lib/offline/writePathAudit.ts')));
}

// ── 7. the panel and the Share note render (server render, no browser / login) ──
{
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { EstimateReviewPanel, ReviewShareNotice, useEstimateReview } = await import('../components/review/EstimateReview.tsx');
    const data = est([...cleanLines(), L('Shower valve', 1, 0), L('Toilet flange', 2.5, 14, { unit: 'ea' })]);
    const checks = review(data);
    const aiFinding: ReviewFinding = {
        id: 'ai:grout', rule: 'ai', severity: 'high', source: 'ai', kind: 'missing_item', message: 'Tile work but no grout.',
        suggested: { description: 'Grout', quantity: 3, unit: 'bag', rate: 22, priceBookItemId: 'pb-grout', needsPrice: false },
    };
    const fake = (over: Record<string, unknown> = {}) => ({
        open: true, setOpen: () => undefined, openReview: () => undefined, panelRef: { current: null },
        checks, all: [...checks, aiFinding], visible: [...checks, aiFinding], ignoredCount: 1, pendingHigh: unreviewedHigh([...checks, aiFinding], new Set()),
        ai: { status: 'done', findings: [aiFinding], signature: 'x' }, aiAllowed: true, runAi: async () => undefined, cancelAi: () => undefined, aiStale: false,
        ignore: () => undefined, restoreIgnored: () => undefined, markAdded: () => undefined, ...over,
    }) as any;
    const html = renderToStaticMarkup(createElement(EstimateReviewPanel, { review: fake(), canEdit: true, onAddLine: () => undefined }));
    ok('panel: rows with severity tags, messages and actions', /Second look/.test(html) && /Shower valve/.test(html) && /AI · High/.test(html) && /Add line/.test(html) && /Ignore/.test(html) && /show 1 ignored/.test(html));
    ok('panel: the suggested line with its price-book price', /\+ Grout/.test(html) && /\$22\.00/.test(html) && /price book/.test(html));
    eq('panel: Add line only on AI suggestions', (html.match(/>Add line</g) || []).length, 1);
    ok('panel: no Add line on a signed estimate', !/>Add line</.test(renderToStaticMarkup(createElement(EstimateReviewPanel, { review: fake(), canEdit: false, onAddLine: () => undefined }))));
    ok('panel: AI busy → checks stay + short note', /AI review unavailable, try again\./.test(renderToStaticMarkup(createElement(EstimateReviewPanel, { review: fake({ ai: { status: 'error', message: 'AI review unavailable, try again.' } }), canEdit: true, onAddLine: () => undefined }))));
    ok('panel: Free / Premium → upgrade line, no AI call', /Premium \+ AI/.test(renderToStaticMarkup(createElement(EstimateReviewPanel, { review: fake({ aiAllowed: false, ai: { status: 'idle' } }), canEdit: true, onAddLine: () => undefined }))));
    ok('panel: closed → only the bar with the live count', (() => { const h = renderToStaticMarkup(createElement(EstimateReviewPanel, { review: fake({ open: false }), canEdit: true, onAddLine: () => undefined })); return /Review estimate/.test(h) && /3 to check · 2 high/.test(h) && !/Second look/.test(h); })());
    const note = renderToStaticMarkup(createElement(ReviewShareNotice, { review: fake(), onReview: () => undefined }));
    ok('Share note: "2 things to check" + Review', /2 things to check/.test(note) && />Review</.test(note));
    eq('Share note: nothing when all HIGH findings were reviewed', renderToStaticMarkup(createElement(ReviewShareNotice, { review: fake({ pendingHigh: [] }), onReview: () => undefined })), '');
    const Probe = () => {
        const r = useEstimateReview({ data, savedItems: BOOK as any, documentId: undefined });
        return createElement('span', null, `${r.checks.length}/${r.pendingHigh.length}/${r.open}`);
    };
    eq('hook: checks at once, closed, HIGH pending until looked at', renderToStaticMarkup(createElement(Probe)), '<span>2/1/false</span>');
}

const total = passed + failures.length;
for (const f of failures.slice(0, 80)) console.log(`FAIL  ${f}`);
console.log(failures.length ? `estimate-review-check: ${failures.length} of ${total} checks failed` : `estimate-review-check: all ${total} checks passed`);
process.exit(failures.length ? 1 : 0);
