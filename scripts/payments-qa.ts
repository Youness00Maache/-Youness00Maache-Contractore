/**
 * "Get paid" checks (pure logic, no browser, no network):
 *   npx tsx scripts/payments-qa.ts
 *
 *  1. lib/qrcode.ts produces exactly the modules qrcode.react (the app's existing QR dependency) produces
 *  2. lib/payments.ts: amount due (deposit / progress / balance), pay links (+ amount in PayPal.me / Cash App),
 *     "I've paid" reports, Mark as paid (invoice patch + receipt) and job financials "Collected", financing, settings
 *  3. lib/messaging.ts: sms: / wa.me links, WhatsApp number rules, the neutral review request
 *  4. utils/emailTemplates.ts: the pay line, where it goes in a custom message, and the button it becomes
 *  5. lib/documents.ts: a duplicated invoice starts unpaid
 *  6. the migration is additive and its public RPCs follow the portal/approval security pattern
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { qrMatrix, qrPath, qrSvg } from '../lib/qrcode.ts';
import {
    applyPayment, buildPaymentReceipt, canMarkPaid, cleanReportNote, financingFor, httpsLink, mapPaymentSettings, normalizeHttpsUrl,
    payAmountOf, payLinkFor, paymentReportOf, paymentSettingsProblem, paymentSettingsRow, payServiceName, payUrlWithAmount,
    samePaymentSettings, suggestedPaymentAmount, suggestedPaymentMethod, withoutPaymentReport, type PaymentSettings,
} from '../lib/payments.ts';
import { portalShareMessage, reviewRequestMessage, shortShareMessage, smsHref, smsNumber, whatsappHref, whatsappNumber } from '../lib/messaging.ts';
import { PAY_LINE_RE, fillEmailPlaceholders, payNowLine, plainTextToEmailHtml, withPayLine } from '../utils/emailTemplates.ts';
import { sanitizeRichText } from '../utils/escapeHtml.ts';
import { summarizeJobMoney, type FinanceDoc } from '../lib/finance.ts';
import { buildDuplicateDocumentData } from '../lib/documents.ts';
import type { InvoiceData } from '../types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: unknown, detail?: unknown) => {
    if (ok) passed++;
    else failures.push(`${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
};
const eq = (name: string, actual: unknown, expected: unknown) => check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });

// ---------------------------------------------------------------------------------------------------------------
// 1. QR encoder = qrcode.react
// ---------------------------------------------------------------------------------------------------------------
const reactModules = (value: string, level: 'L' | 'M' | 'Q' | 'H'): boolean[][] => {
    const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value, level, marginSize: 0 }));
    const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)![1]);
    const m = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
    const d = [...svg.matchAll(/<path[^>]*d="([^"]*)"/g)][1][1];
    for (const op of d.matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v1H\d+z/g)) for (let i = 0; i < +op[3]; i++) m[+op[2]][+op[1] + i] = true;
    return m;
};
const QR_SAMPLES = [
    'https://paypal.me/acme/1250.00', 'https://buy.stripe.com/test_8wM5mH7Yk2fG', 'https://www.paypal.com/paypalme/summitridge/250',
    'https://square.link/u/AbCdEf?src=invoice&amount=10', 'https://cash.app/$acmebuilders/99.50', 'https://venmo.com/u/Acme-Builders',
    'HTTPS://EXAMPLE.COM/PAY', '0123456789', `https://pay.example.com/${'x'.repeat(260)}`, 'https://exämple.com/façade?ü=1',
];
for (const s of QR_SAMPLES) {
    for (const level of ['L', 'M', 'Q', 'H'] as const) {
        const a = reactModules(s, level);
        const b = qrMatrix(s, level);
        check(`QR modules match qrcode.react [${level}] ${s.slice(0, 40)}`, a.length === b.length && a.every((row, y) => row.every((c, x) => c === b[y][x])));
    }
}
{
    const svg = qrSvg('https://paypal.me/acme/10.00', { size: 76, margin: 2 });
    const n = qrMatrix('https://paypal.me/acme/10.00').length + 4;
    check('qrSvg: quiet zone and size', svg.includes(`viewBox="0 0 ${n} ${n}"`) && svg.includes('width="76"'));
    check('qrSvg: only generated markup (no text from the link)', !svg.includes('paypal') && !/<script|on\w+=/i.test(svg));
    check('qrSvg: a bad color falls back to black', qrSvg('x', { color: 'red;}</style>' }).includes('fill="#000000"'));
    eq('qrPath draws one run per row segment', qrPath([[true, true, false, true]]), 'M0 0h2v1h-2zM3 0h1v1h-1z');
    let threw = false;
    try { qrMatrix('x'.repeat(5000)); } catch { threw = true; }
    check('qrMatrix throws for text too long for any QR version', threw);
}

// ---------------------------------------------------------------------------------------------------------------
// 2. payments
// ---------------------------------------------------------------------------------------------------------------
const inv = (over: Partial<InvoiceData> & Record<string, any> = {}): InvoiceData => ({
    invoiceNumber: 'INV-2026-11-7', issueDate: '2026-11-01', dueDate: '2026-12-01', status: 'Sent', notes: '', taxRate: 0,
    lineItems: [{ id: 'a', description: 'Kitchen cabinets', quantity: 1, rate: 1000 }, { id: 'b', description: 'Install', quantity: 2, rate: 125 }],
    clientName: 'Jane Smith', paypalLink: 'https://paypal.me/acme', ...over,
} as InvoiceData);

eq('amount due = total', payAmountOf(inv()), { amount: 1250, kind: 'total', label: 'Amount due' });
eq('balance after a deposit', payAmountOf(inv({ amountPaid: 250 })), { amount: 1000, kind: 'balance', label: 'Balance due' });
eq('progress bill', payAmountOf(inv({ isProgressBilling: true, lineItems: [{ id: 'p', description: 'Phase 1', quantity: 1, rate: 10000, percentComplete: 40, previouslyBilled: 1000 }] })).amount, 3000);
eq('progress label', payAmountOf(inv({ isProgressBilling: true })).kind, 'progress');
eq('deposit invoice (title)', payAmountOf(inv({ title: '50% deposit – kitchen' })).label, 'Deposit due');
eq('deposit invoice (every line)', payAmountOf(inv({ lineItems: [{ id: 'd', description: 'Deposit to schedule work', quantity: 1, rate: 500 }] })).kind, 'deposit');
eq('paid invoice: nothing due', payAmountOf(inv({ status: 'Paid' })).amount, 0);

check('httpsLink accepts https', httpsLink('https://paypal.me/acme') === 'https://paypal.me/acme');
check('httpsLink refuses http / javascript / spaces / no host', !httpsLink('http://paypal.me/a') && !httpsLink('javascript:alert(1)') && !httpsLink('https://paypal.me/a b') && !httpsLink('https://localhost/x'));
eq('normalizeHttpsUrl adds https', normalizeHttpsUrl('paypal.me/acme'), 'https://paypal.me/acme');
eq('normalizeHttpsUrl upgrades http', normalizeHttpsUrl('http://square.link/u/x'), 'https://square.link/u/x');
eq('normalizeHttpsUrl refuses junk', normalizeHttpsUrl('call me'), '');
eq('service from link', ['https://paypal.me/a', 'https://www.paypal.com/paypalme/a', 'https://venmo.com/u/a', 'https://square.link/u/a', 'https://buy.stripe.com/x', 'https://cash.app/$a', 'https://mybank.example/pay'].map(u => payServiceName(u)), ['PayPal', 'PayPal', 'Venmo', 'Square', 'Stripe', 'Cash App', '']);
eq('service: the contractor\'s label wins', payServiceName('https://paypal.me/a', '  Zelle  '), 'Zelle');

eq('PayPal.me gets the amount', payUrlWithAmount('https://paypal.me/acme', 1250), 'https://paypal.me/acme/1250.00');
eq('paypal.com/paypalme gets the amount', payUrlWithAmount('https://www.paypal.com/paypalme/acme', 99.5), 'https://www.paypal.com/paypalme/acme/99.50');
eq('PayPal.me keeps an amount already there', payUrlWithAmount('https://paypal.me/acme/250', 1250), 'https://paypal.me/acme/250');
eq('PayPal.me: non-USD currency is written after the amount', payUrlWithAmount('https://paypal.me/acme', 80, 'eur'), 'https://paypal.me/acme/80.00EUR');
eq('Cash App gets the amount', payUrlWithAmount('https://cash.app/$acme', 42), 'https://cash.app/$acme/42.00');
eq('other links are unchanged', payUrlWithAmount('https://buy.stripe.com/test_123', 42), 'https://buy.stripe.com/test_123');
eq('no amount → unchanged', payUrlWithAmount('https://paypal.me/acme', 0), 'https://paypal.me/acme');

{
    const p = payLinkFor(inv({ payLinkLabel: 'PayPal', amountPaid: 250 }))!;
    check('payLinkFor: label, amount, href', p.buttonLabel === 'Pay now with PayPal' && p.amount === 1000 && p.href === 'https://paypal.me/acme/1000.00' && p.amountLabel === 'Balance due', p);
    eq('payLinkFor: generic label', payLinkFor(inv({ paypalLink: 'https://mybank.example/pay' }))?.buttonLabel, 'Pay now');
    check('payLinkFor: none when paid / cancelled / nothing due / http / missing', [
        inv({ status: 'Paid' }), inv({ status: 'Cancelled' }), inv({ amountPaid: 1250 }), inv({ paypalLink: 'http://paypal.me/acme' }), inv({ paypalLink: '' }),
    ].every(d => payLinkFor(d) === null));
}
check('Mark as paid on Draft/Sent/Overdue only', canMarkPaid('Draft') && canMarkPaid('Sent') && canMarkPaid('Overdue') && !canMarkPaid('Paid') && !canMarkPaid('Cancelled'));

// client report
{
    const reported = inv({ paymentReportedAt: '2026-11-14T10:00:00.000Z', paymentReportNote: 'PayPal, Nov 14', paymentReportAmount: 1250 });
    eq('report read', paymentReportOf(reported), { at: '2026-11-14T10:00:00.000Z', note: 'PayPal, Nov 14', amount: 1250 });
    eq('no report on a paid invoice', paymentReportOf({ ...reported, status: 'Paid' }), null);
    eq('suggested method from the client\'s note', suggestedPaymentMethod(reported), 'PayPal');
    eq('suggested method from "Cash App"', suggestedPaymentMethod(inv({ paymentReportNote: 'sent on cash app today' })), 'Cash App');
    eq('suggested method from the pay link', suggestedPaymentMethod(inv({ paypalLink: 'https://venmo.com/u/acme' })), 'Venmo');
    eq('suggested amount = balance', suggestedPaymentAmount(inv({ amountPaid: 250 })), 1000);
    eq('suggested amount = what the client says when less', suggestedPaymentAmount(inv({ paymentReportAmount: 600 })), 600);
    check('withoutPaymentReport drops the keys only', !('paymentReportedAt' in withoutPaymentReport(reported)) && withoutPaymentReport(reported).invoiceNumber === 'INV-2026-11-7');
    eq('report note cleaned', cleanReportNote(' PayPal,\n\tNov 14 \u0007 '), 'PayPal, Nov 14');
}

// Mark as paid + receipt + job financials
{
    const now = new Date('2026-11-14T12:00:00Z');
    const base = inv({ amountPaid: 250, paymentReportedAt: '2026-11-14T10:00:00Z', paymentReportNote: 'PayPal' });
    const full = applyPayment(base, { amount: 1000, date: '2026-11-14', method: 'PayPal' }, { paymentId: 'p1', receiptId: 'r1', receiptNumber: 'REC-2026-11-1', now });
    check('paid in full: status Paid, amountPaid = total, paidAt', full.paidInFull && full.data.status === 'Paid' && full.data.amountPaid === 1250 && full.data.paidAt === '2026-11-14' && full.balanceAfter === 0, full.data);
    check('paid in full: payment recorded, report cleared', full.data.payments?.length === 1 && full.data.payments[0].receiptId === 'r1' && !full.data.paymentReportedAt && !full.data.paymentReportNote);
    const part = applyPayment(inv({ status: 'Draft' }), { amount: 500, date: '2026-11-14', method: 'Check' }, { paymentId: 'p2', now });
    check('part payment: still due, Draft becomes Sent (so it counts as billed)', !part.paidInFull && part.balanceAfter === 750 && part.data.status === 'Sent' && part.data.amountPaid === 500 && !part.data.paidAt, part.data);
    const over = applyPayment(inv(), { amount: 2000, date: '2026-11-14', method: 'Cash' }, { paymentId: 'p3', now });
    check('overpayment: paid in full, amountPaid capped at the total', over.paidInFull && over.data.amountPaid === 1250);
    const twice = applyPayment(part.data, { amount: 750, date: '2026-11-20', method: 'Check' }, { paymentId: 'p4', now });
    check('second payment completes it, history kept', twice.paidInFull && twice.data.payments?.length === 2 && twice.data.status === 'Paid');
    check('the note never goes on the invoice', !JSON.stringify(applyPayment(inv(), { amount: 10, date: '2026-11-14', method: 'x', note: 'PRIVATE-NOTE' }, { paymentId: 'p5' }).data).includes('PRIVATE-NOTE'));

    const receipt = buildPaymentReceipt(base, 'inv-1', { amount: 1000, date: '2026-11-14', method: 'PayPal', note: 'Checked bank' }, 'REC-2026-11-1', { companyName: 'Acme Builders', phone: '555' }, { clientName: 'Jane Smith', clientAddress: '1 Main' }, true);
    check('receipt links the invoice by id and number', receipt.invoiceId === 'inv-1' && receipt.invoiceNumber === 'INV-2026-11-7' && receipt.amount === 1000 && receipt.receiptNumber === 'REC-2026-11-1');
    check('receipt text', receipt.description === 'Payment for invoice INV-2026-11-7\nChecked bank' && receipt.paymentMethod === 'PayPal' && receipt.paymentStatus === 'Paid in full' && receipt.companyName === 'Acme Builders' && receipt.clientName === 'Jane Smith');
    eq('part-payment receipt status', buildPaymentReceipt(base, 'inv-1', { amount: 10, date: '2026-11-14', method: '' }, 'R', null, null, false).paymentStatus, 'Partial payment');

    // job financials: Collected = the total once (receipt + Paid invoice are not counted twice); part payments count once too
    const fdoc = (id: string, type: string, d: any): FinanceDoc => ({ id, type, jobId: 'job', ...d });
    const paidDocs = [fdoc('inv-1', 'Invoice', full.data), fdoc('r1', 'Receipt', receipt)];
    const money = summarizeJobMoney(paidDocs, { laborRate: 0 });
    check('financials after Mark as paid: collected = total, nothing outstanding', money.collected === 1250 && money.outstanding === 0 && money.income === 1250, money);
    const partReceipt = buildPaymentReceipt(inv(), 'inv-2', { amount: 500, date: '2026-11-14', method: 'Check' }, 'REC-2', null, null, false);
    const partMoney = summarizeJobMoney([fdoc('inv-2', 'Invoice', part.data), fdoc('r2', 'Receipt', partReceipt)], { laborRate: 0 });
    check('financials after a part payment: collected 500 once, 750 outstanding', partMoney.collected === 500 && partMoney.outstanding === 750, partMoney);
}

// financing
{
    const est = { status: 'Sent', lineItems: [{ id: 'e', description: 'Roof', quantity: 1, rate: 12000 }], financingLink: 'https://apply.wisetack.example/acme', financingMinAmount: 5000 };
    eq('financing shown above the amount', financingFor(est), { url: 'https://apply.wisetack.example/acme', minAmount: 5000, total: 12000 });
    eq('financing hidden below the amount', financingFor({ ...est, financingMinAmount: 20000 }), null);
    eq('financing: no minimum = every estimate with a total', financingFor({ ...est, financingMinAmount: undefined })?.minAmount, 0);
    check('financing hidden: declined, http, javascript, empty estimate', [
        { ...est, status: 'Rejected' }, { ...est, financingLink: 'http://x.example/a' }, { ...est, financingLink: 'javascript:alert(1)' }, { ...est, lineItems: [] },
    ].every(d => financingFor(d) === null));
}

// settings
{
    const s: PaymentSettings = { payLinkDefault: 'paypal.me/acme', payLinkLabel: ' PayPal ', financingLink: 'https://apply.example/x', financingMinAmount: 2500, googleReviewLink: 'https://g.page/r/abc/review', reviewAutoSend: true };
    eq('settings row', paymentSettingsRow(s), { default_pay_link: 'https://paypal.me/acme', default_pay_link_label: 'PayPal', financing_link: 'https://apply.example/x', financing_min_amount: 2500, google_review_link: 'https://g.page/r/abc/review', review_auto_send: true });
    eq('empty settings row', paymentSettingsRow({ payLinkDefault: '', payLinkLabel: '', financingLink: '', financingMinAmount: 0, googleReviewLink: '', reviewAutoSend: false }), { default_pay_link: null, default_pay_link_label: null, financing_link: null, financing_min_amount: null, google_review_link: null, review_auto_send: false });
    eq('settings round trip', mapPaymentSettings(paymentSettingsRow(s)).payLinkDefault, 'https://paypal.me/acme');
    check('settings: same after normalizing', samePaymentSettings(s, mapPaymentSettings(paymentSettingsRow(s))));
    check('settings problems', paymentSettingsProblem({ ...s, googleReviewLink: 'my review page' })?.includes('Google review') && paymentSettingsProblem({ ...s, payLinkDefault: 'javascript:alert(1)' })?.includes('Pay now') && paymentSettingsProblem(s) === null);
}

// ---------------------------------------------------------------------------------------------------------------
// 3. messaging
// ---------------------------------------------------------------------------------------------------------------
eq('wa: +44 international', whatsappNumber('+44 7700 900123'), '447700900123');
eq('wa: 00 prefix', whatsappNumber('0044 7700 900123'), '447700900123');
eq('wa: North American 10 digits', whatsappNumber('(555) 201-3344'), '15552013344');
eq('wa: North American with 1', whatsappNumber('1-555-201-3344'), '15552013344');
eq('wa: national number with trunk 0 is unknown', whatsappNumber('06 12 34 56 78'), null);
eq('wa: empty', whatsappNumber(''), null);
eq('wa link with number', whatsappHref('+1 555 201 3344', 'Hi & bye'), 'https://wa.me/15552013344?text=Hi%20%26%20bye');
eq('wa link without number lets WhatsApp pick the chat', whatsappHref('', 'Hi'), 'https://wa.me/?text=Hi');
eq('sms number keeps +', smsNumber('+1 (555) 201-3344'), '+15552013344');
eq('sms 00 → +', smsNumber('0044 7700 900123'), '+447700900123');
eq('sms link (iOS + Android form)', smsHref('555-201-3344', 'Pay: https://x.y/?a=1&b=2'), 'sms:5552013344?&body=Pay%3A%20https%3A%2F%2Fx.y%2F%3Fa%3D1%26b%3D2');
eq('sms link without number', smsHref(null, 'Hi'), 'sms:?&body=Hi');
eq('short message (invoice)', shortShareMessage({ docType: 'Invoice', number: 'INV-1', total: '$1,250.00', clientName: 'Jane Smith', company: 'Acme', link: 'https://app/?portal=k', payLine: 'Pay now ($1,250.00): https://paypal.me/acme/1250.00' }),
    'Hi Jane, here is an invoice INV-1 ($1,250.00) from Acme: https://app/?portal=k\nPay now ($1,250.00): https://paypal.me/acme/1250.00');
eq('short message (estimate approval)', shortShareMessage({ docType: 'Estimate', number: 'EST-2', clientName: '', company: 'Acme', link: 'https://app/?approval_token=t' }),
    'Hi, here is an estimate EST-2 from Acme. You can review and approve it here: https://app/?approval_token=t');
eq('portal message', portalShareMessage({ clientName: 'Bob Ray', company: 'Acme', link: 'https://app/?portal=k' }), 'Hi Bob, you can view, download and sign your documents from Acme anytime here: https://app/?portal=k');
{
    const r = reviewRequestMessage({ clientName: 'Jane Smith', company: 'Acme Builders', senderName: 'Sam Lee', reviewLink: 'https://g.page/r/abc/review' });
    check('review request has the link and the greeting', r.body.includes('https://g.page/r/abc/review') && r.body.startsWith('Hi Jane,') && r.text.includes('https://g.page/r/abc/review'));
    check('review request is neutral (no gating, no incentive)', !/happy|satisf|5[- ]star|five[- ]star|discount|gift|reward|if you (liked|enjoyed)/i.test(`${r.subject} ${r.body} ${r.text}`), r);
    check('review request signs with name and company', r.body.endsWith('Thank you,\nSam Lee\nAcme Builders'));
}

// ---------------------------------------------------------------------------------------------------------------
// 4. email pay line
// ---------------------------------------------------------------------------------------------------------------
{
    const line = payNowLine({ buttonLabel: 'Pay now with PayPal', amountText: '$1,250.00', href: 'https://paypal.me/acme/1250.00' });
    eq('pay line text', line, 'Pay now with PayPal ($1,250.00): https://paypal.me/acme/1250.00');
    check('pay line matches the button pattern', PAY_LINE_RE.test(line));
    eq('no pay line for http / javascript', [payNowLine({ buttonLabel: 'Pay now', href: 'http://x.y' }), payNowLine({ buttonLabel: 'Pay now', href: 'javascript:alert(1)' }), payNowLine(null)], ['', '', '']);
    const tpl = 'Hi [Client Name],\n\nHere is invoice [Document Number].\n\n[Pay Now]\n\nThank you,\n[My Name]';
    eq('[Pay Now] filled', fillEmailPlaceholders(tpl, { '[Client Name]': 'Jane', '[Document Number]': 'INV-1', '[Pay Now]': line, '[My Name]': 'Sam' }),
        `Hi Jane,\n\nHere is invoice INV-1.\n\n${line}\n\nThank you,\nSam`);
    eq('[Pay Now] removed without a pay link', fillEmailPlaceholders(tpl, { '[Client Name]': 'Jane', '[Document Number]': 'INV-1', '[Pay Now]': '', '[My Name]': 'Sam' }),
        'Hi Jane,\n\nHere is invoice INV-1.\n\nThank you,\nSam');
    eq('custom message: pay line goes before the sign-off', withPayLine('Hi Jane,\n\nInvoice attached.\n\nThanks,\nSam', line), `Hi Jane,\n\nInvoice attached.\n\n${line}\n\nThanks,\nSam`);
    eq('custom message without a sign-off: at the end', withPayLine('Invoice attached.', line), `Invoice attached.\n\n${line}`);
    eq('pay line not added twice', withPayLine(`A\n\n${line}`, line), `A\n\n${line}`);
    eq('nothing added without a line', withPayLine('A', ''), 'A');
    const html = plainTextToEmailHtml(`Hi Jane,\n\n${line}\n\nPay now: this text is not a link`);
    check('pay line becomes a button link', html.includes('<a href="https://paypal.me/acme/1250.00" style=') && html.includes('>Pay now with PayPal ($1,250.00)</a>'), html);
    check('other text stays text', html.includes('<p>Pay now: this text is not a link</p>'));
    const clean = sanitizeRichText(html);
    check('the button survives the email sanitizer (href + inline style)', clean.includes('href="https://paypal.me/acme/1250.00"') && /display:\s*inline-block/.test(clean) && /background-color:\s*#2148ed/.test(clean), clean);
    check('a javascript pay line never becomes a link', !plainTextToEmailHtml('Pay now: javascript:alert(1)').includes('<a '));
}

// ---------------------------------------------------------------------------------------------------------------
// 5. duplicates start unpaid
// ---------------------------------------------------------------------------------------------------------------
{
    const paid = applyPayment(inv({ amountPaid: 250 }), { amount: 1000, date: '2026-11-14', method: 'PayPal' }, { paymentId: 'p' }).data;
    const copy = buildDuplicateDocumentData({ ...paid, paymentReportedAt: 'x', paymentReportNote: 'y', reviewRequestedAt: 'z' });
    check('duplicate: no payments, report, paidAt or review flag; Draft', !copy.payments && !copy.paymentReportedAt && !copy.paymentReportNote && !copy.paidAt && !copy.reviewRequestedAt && copy.status === 'Draft', copy);
    eq('duplicate keeps the original deposit only', copy.amountPaid, 250);
    check('duplicate of an invoice paid only with Mark as paid has no amount paid', buildDuplicateDocumentData(applyPayment(inv(), { amount: 1250, date: '2026-11-14', method: '' }, { paymentId: 'p' }).data).amountPaid === undefined);
}

// ---------------------------------------------------------------------------------------------------------------
// 6. migration
// ---------------------------------------------------------------------------------------------------------------
{
    const sql = readFileSync(join(root, 'supabase/migrations/20261113000200_pay_review_financing.sql'), 'utf8');
    const code = sql.replace(/--[^\n]*/g, '');
    const outsideFunctions = code.replace(/\$\$[\s\S]*?\$\$/g, '');
    check('migration: additive only (no drop table/column, no data update/delete outside functions)', !/\bdrop\s+(table|column|function|policy)\b/i.test(code) && !/^\s*(update|delete|truncate)\b/im.test(outsideFunctions));
    check('migration: does not replace existing functions', !/function\s+public\.(get_portal_data|get_document_by_token|_contractor_public_info|_client_safe_doc_data|guard_document_write|sign_document_via_portal|approve_document_by_token)\b/i.test(code));
    for (const col of ['default_pay_link', 'default_pay_link_label', 'financing_link', 'financing_min_amount', 'google_review_link', 'review_auto_send', 'payment_reported_at', 'payment_report_note', 'payment_report_amount']) {
        check(`migration: column ${col} (add if not exists)`, new RegExp(`add column if not exists ${col}\\b`, 'i').test(code));
    }
    for (const fn of ['report_payment_via_portal', 'report_payment_by_token', '_apply_payment_report', '_assert_invoice_payable']) {
        const body = new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\$\\$;`, 'i').exec(code)?.[0] || '';
        check(`migration: ${fn} pins search_path`, /set search_path = ''/.test(body));
    }
    check('migration: public RPCs are security definer', ['report_payment_via_portal', 'report_payment_by_token'].every(fn => new RegExp(`function public\\.${fn}\\([\\s\\S]*?security definer`, 'i').test(code)));
    check('migration: portal key format checked like the other portal RPCs', code.includes("p_key ~ '^[A-Za-z0-9_-]{32,128}$'"));
    check('migration: only the client\'s own documents', code.includes('public._client_document_ids(v_client.id)'));
    check('migration: grants to anon only for the two RPCs', (code.match(/grant execute[^;]*to anon/gi) || []).length === 2 && /revoke all on function public\._apply_payment_report/i.test(code));
    check('migration: trigger keeps data in sync', /create trigger trg_documents_payment_report\s+before insert or update on public\.documents/i.test(code));
}

// ---------------------------------------------------------------------------------------------------------------
const total = passed + failures.length;
for (const f of failures.slice(0, 60)) console.log(`FAIL  ${f}`);
console.log(failures.length ? `payments-qa: ${failures.length} of ${total} checks failed` : `payments-qa: all ${total} checks passed`);
process.exit(failures.length ? 1 : 0);
