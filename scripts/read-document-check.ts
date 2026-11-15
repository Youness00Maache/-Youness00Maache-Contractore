/**
 * "Read with AI" review-screen logic (roadmap N6): src/ai/readDocumentReview.ts.
 *   npx tsx scripts/read-document-check.ts
 * Covers: draft from the AI answer (nothing invented), the live "adds up" line, low-confidence highlighting, mapping to
 * the EXISTING expense shape (extra facts in the notes), Save blockers, the job hint (never assigned).
 */
import assert from 'node:assert/strict';
import { EXPENSE_CATEGORIES } from '../components/forms/documentFields.ts';
import { computeDocumentTotals } from '../utils/money.ts';
import {
    draftFromReading, fieldConfidence, lineAmount, readingNotes, reviewProblem, suggestJob, toExpensePatch, totalsCheck, type ReviewDraft,
} from '../src/ai/readDocumentReview.ts';
import { mockReadDocumentOutput, normalizeReadDocument, sanitizeReadDocumentRequest, type ReadDocumentResult } from '../supabase/functions/ai-assistant/shared/documentReading.ts';

let checks = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); checks++; };
const eq = <T,>(a: T, b: T, m: string) => { assert.deepEqual(a, b, m); checks++; };

const CATS = [...EXPENSE_CATEGORIES];
const TODAY = '2026-11-15';
const photoReq = sanitizeReadDocumentRequest({ task: 'read_document', images: [{ mime_type: 'image/jpeg', data: 'AAAA' }], context: { today: TODAY, categories: CATS } });
const pdfReq = sanitizeReadDocumentRequest({ task: 'read_document', pdf: { mime_type: 'application/pdf', data: Buffer.from('%PDF-1.4 /Type /Page /Type /Page').toString('base64') }, context: { today: TODAY, categories: CATS } });
const clean: ReadDocumentResult = normalizeReadDocument(mockReadDocumentOutput(photoReq), photoReq);
const invoice: ReadDocumentResult = normalizeReadDocument(mockReadDocumentOutput(pdfReq), pdfReq);

// 1. Draft: values copied, nothing invented, category from the list (fallback Other)
{
    const d = draftFromReading(clean, CATS);
    eq([d.vendor, d.documentDate, d.category, d.lines.length, d.total], ['Mock Hardware', TODAY, 'Material', 2, 37.71], 'clean receipt draft');
    const blurry = draftFromReading({ ...clean, vendor: null, documentDate: null, suggestedCategory: null, total: null, lineItems: [] }, CATS);
    eq([blurry.vendor, blurry.documentDate, blurry.category, blurry.total], ['', '', 'Other', null], 'missing values stay empty; category falls back to Other');
    eq(draftFromReading({ ...clean, suggestedCategory: 'Admin' }, CATS).category, 'Other', 'a category not in the list is never used');
    ok(new Set(d.lines.map(l => l.key)).size === d.lines.length, 'line keys unique');
}

// 2. Totals indicator
{
    const base = draftFromReading(clean, CATS);
    eq(totalsCheck(base).status, 'ok', 'clean receipt adds up');
    ok(/^Adds up: subtotal 34\.92 \+ tax 2\.79 = 37\.71\.$/.test(totalsCheck(base).message), 'adds-up message');
    const wrong = { ...base, total: 40 };
    const t = totalsCheck(wrong);
    eq([t.status, t.difference], ['off', 2.29], 'total off by 2.29');
    ok(/Doesn't add up/.test(t.message), 'doesn\'t-add-up message');
    eq(totalsCheck({ ...base, subtotal: 30 }).status, 'off', 'lines vs subtotal mismatch');
    eq(totalsCheck({ ...base, total: null }).status, 'incomplete', 'no total → incomplete');
    eq(totalsCheck({ lines: [], subtotal: null, tax: 1, total: 10 }).status, 'incomplete', 'nothing to compare → incomplete');
    eq(totalsCheck({ ...base, subtotal: null }).status, 'ok', 'no subtotal: lines + tax checked against total');
    eq(totalsCheck({ ...base, total: 37.72 }).status, 'ok', '1 cent rounding tolerated');
    eq(lineAmount({ quantity: 3, unitPrice: 2.5, amount: null }), 7.5, 'line amount from qty × price when not printed');
    const unpriced = totalsCheck({ ...base, lines: [...base.lines, { key: 'x', description: 'Misc', quantity: 1, unit: '', unitPrice: null, amount: null }] });
    eq(unpriced.unpricedLines, 1, 'unpriced lines counted');
}

// 3. Confidence highlighting
{
    eq(fieldConfidence({ vendor: 'high', dates: 'high', amounts: 'high', lineItems: 'high' }), {}, 'all high → nothing highlighted');
    eq(fieldConfidence({ vendor: 'low', dates: 'medium', amounts: 'high', lineItems: 'low' }),
        { vendor: 'low', documentNumber: 'low', documentDate: 'medium', dueDate: 'medium', lines: 'low' }, 'groups map to their fields');
}

// 4. Save blockers
{
    const d = draftFromReading(clean, CATS);
    eq(reviewProblem(d), null, 'clean receipt can be saved');
    ok(/date/.test(reviewProblem({ ...d, documentDate: '' }) || ''), 'no date → blocked');
    ok(/Nothing to save/.test(reviewProblem({ ...d, vendor: '', total: null, lines: [] }) || ''), 'empty → blocked');
}

// 5. Mapping to the existing expense shape
{
    const d = draftFromReading(clean, CATS);
    const { patch, autoTotal } = toExpensePatch(d, { existingNotes: 'For the hallway' });
    eq(Object.keys(patch).sort(), ['amount', 'category', 'date', 'lineItems', 'notes', 'tax', 'title', 'vendor'], 'only ExpenseLogData fields');
    eq([patch.vendor, patch.date, patch.category, patch.tax, patch.amount, autoTotal], ['Mock Hardware', TODAY, 'Material', 2.79, 37.71, true], 'expense values');
    eq(patch.lineItems!.map(l => [l.description, l.quantity, l.rate]), [['Drywall screws 1lb', 2, 8.97], ['Joint compound 4.5 gal', 1, 16.98]], 'lines keep qty × price');
    eq(computeDocumentTotals({ lineItems: patch.lineItems! }).subtotal, 34.92, 'expense lines add up like the receipt');
    ok(patch.notes.startsWith('For the hallway\n\nRead with AI from a receipt.'), 'existing notes kept, reading added below');
    ok(/Paid by: Visa ending 4242/.test(patch.notes) && /Receipt no\.: 0042-7781/.test(patch.notes) && /Summary: /.test(patch.notes), 'extra facts readable in the notes');
    ok(!/\d{5,}.*4242/.test(patch.notes.split('\n').find(l => l.startsWith('Paid by')) || ''), 'only last 4 card digits in the notes');
    eq(patch.title, 'Mock Hardware receipt', 'title from vendor + kind');
    eq(toExpensePatch(d, { existingTitle: 'Week 12' }).patch.title, 'Week 12', 'an existing title is kept');

    // printed total that doesn't match the lines: kept, auto total off
    const off = toExpensePatch({ ...d, total: 40 });
    eq([off.patch.amount, off.autoTotal], [40, false], 'printed total kept when it does not add up');
    // line total ≠ qty × price: the printed line total wins, qty folded into the description
    const odd = toExpensePatch({ ...d, lines: [{ key: 'a', description: 'Paint', quantity: 2, unit: 'gal', unitPrice: 30, amount: 55 }], subtotal: 55, tax: 0, total: 55 });
    eq(odd.patch.lineItems!.map(l => [l.description, l.quantity, l.rate]), [['2 gal × Paint', 1, 55]], 'printed line total wins');
    // credit note: negative lines stay negative (quantity is never negative in the form)
    const cn = toExpensePatch({ ...d, isCreditNote: true, lines: [{ key: 'r', description: 'Returned door', quantity: -1, unit: '', unitPrice: 120, amount: -120 }], subtotal: -120, tax: 0, total: -120 });
    eq([cn.patch.lineItems![0].quantity, cn.patch.lineItems![0].rate, cn.patch.amount], [1, -120, -120], 'credit note mapped with a positive quantity');
    // no lines: lineItems not touched, total alone
    const none = toExpensePatch({ ...d, lines: [], subtotal: null, total: 12.5, tax: null });
    eq(['lineItems' in none.patch, none.patch.amount, none.patch.tax], [false, 12.5, 0], 'no lines → the form keeps its own line, total saved');
    // a missing total is never invented as a printed value: it is the lines + tax the form would compute anyway
    eq(toExpensePatch({ ...d, total: null }).autoTotal, true, 'no printed total → computed from items');
}

// 6. Multi-page supplier invoice: summary + pages in the notes
{
    const d = draftFromReading(invoice, CATS);
    eq([d.kind, d.pageCount, d.lines.length], ['supplier_invoice', 2, 3], 'invoice draft');
    const notes = readingNotes(d, { photoUrl: 'https://x.test/p.jpg' });
    ok(/^Read with AI from a supplier invoice \(2 pages\)\./.test(notes) && /Supplier invoice no\.: INV-20418/.test(notes) && /Subtotal on the supplier invoice: 389\.00/.test(notes), 'invoice notes');
    ok(/Photo: https:\/\/x\.test\/p\.jpg/.test(notes), 'kept photo linked in the notes');
}

// 7. Job hint: only an unambiguous mention, never the current job
{
    const jobs = [{ id: 'j1', name: 'Smith Kitchen', clientName: 'Ann Smith' }, { id: 'j2', name: 'Oak Street Deck', clientName: 'Bo Lee' }, { id: 'j3', name: 'Kitchen', clientName: '' }];
    const d: ReviewDraft = { ...draftFromReading(invoice, CATS), jobReference: 'Job: Oak Street Deck' };
    eq(suggestJob(d, jobs, 'j1')?.job.id, 'j2', 'job reference → that job suggested');
    eq(suggestJob(d, jobs, 'j2'), null, 'already the current job → no hint');
    eq(suggestJob({ ...d, jobReference: 'Kitchen' }, jobs, 'j2'), null, 'generic names never match');
    eq(suggestJob({ ...d, jobReference: 'Deliver to Ann Smith' }, jobs, 'j2')?.job.id, 'j1', 'client full name matches');
    eq(suggestJob({ ...d, jobReference: 'Smith Kitchen and Oak Street Deck' }, jobs, null), null, 'two matches → no hint');
    eq(suggestJob({ ...d, jobReference: '' }, [], null), null, 'no jobs → no hint');
}

console.log(`Read-document review checks passed: ${checks} checks.`);
