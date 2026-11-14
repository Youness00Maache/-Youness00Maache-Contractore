/**
 * Checks for the notification bell (lib/notifications/model.ts + format.ts): event derivation per type from sample
 * data, de-duplication, read / dismissed state and its bounds, ordering and Today / Earlier grouping, per-type
 * settings, pop-up selection, nothing from other users' data, and the wiring (routes, Settings section, help,
 * AI knowledge, existing badges kept).
 *   npx tsx scripts/notifications-check.ts
 *   TZ=Pacific/Auckland npx tsx scripts/notifications-check.ts
 */
import { readFileSync } from 'node:fs';
import {
    EXPIRING_DAYS, MAX_LIST, MAX_STATE_IDS, NOTIFICATION_CATEGORIES, NOTIFICATION_PREFS_SETTING, NOTIFICATION_STATE_SETTING, POP_MAX,
    STATE_MAX_CHARS, WINDOW_DAYS, KIND_META,
    buildNotifications, clip, dedupe, defaultPrefs, deriveDocNotifications, deriveForumNotifications, deriveGmailNotifications,
    deriveLimitNotifications, deriveOutboxNotifications, deriveReminderNotifications, deriveRequestNotifications, deriveStockNotifications,
    deriveThreadReplies, dismiss, docInputOf, docLabel, docPath, emptyState, forget, isCategoryOn, markAllRead, markRead, mergeStates,
    namesText, newerPrefs, notificationKey, parsePrefs, parseSeen, parseState, pickPopups, pruneSeen, pruneState, setCategory,
    type AppNotification, type DocInput, type NotificationState, type ShownNotification,
} from '../lib/notifications/model.ts';
import { badgeText, groupByDay, timeLabel } from '../lib/notifications/format.ts';
import { parseView } from '../lib/routes.ts';
import { getGuide, HELP_GUIDES } from '../components/help/helpContent.ts';
import { KNOWLEDGE, NAV_LABELS, NAV_ROUTES } from '../supabase/functions/ai-assistant/shared/knowledge.ts';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else {
        failures++;
        console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
    }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);

// ------------------------------------------------------------------------------------------------ fixtures
const UID = 'user-me';
const OTHER = 'user-other';
/** 2026-11-14 15:00 local */
const NOW = new Date(2026, 10, 14, 15, 0, 0).getTime();
const ctx = { uid: UID, now: NOW };
/** local instant `days` days and `hours` hours before NOW, as ISO */
const ago = (days: number, hours = 0) => new Date(NOW - days * 86_400_000 - hours * 3_600_000).toISOString();
/** local YYYY-MM-DD `n` days before NOW (negative = after) */
const day = (n: number) => {
    const d = new Date(2026, 10, 14 - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const doc = (fields: Partial<DocInput> & { type: string }): DocInput => ({ id: `d-${Math.random().toString(36).slice(2, 8)}`, userId: UID, jobId: 'job1', createdAt: ago(20), ...fields });
const kinds = (list: AppNotification[]) => list.map(n => n.kind);
const texts = (list: AppNotification[]) => list.map(n => n.text);
const jobNames = new Map([['job1', 'Kitchen remodel']]);
const build = (items: AppNotification[], state: NotificationState = emptyState(), prefs = defaultPrefs(), seen = {}) =>
    buildNotifications({ now: NOW, items, state, prefs, seen });

// ------------------------------------------------------------------------------------------------ 1. documents
{
    const signed = doc({ id: 'e1', type: 'Estimate', number: 'E-1042', clientName: 'Jane Doe', status: 'Accepted', clientSignedAt: ago(0, 2), clientSignedBy: 'Jane Doe (chose B: Better)' });
    const r = deriveDocNotifications([signed], ctx, jobNames);
    eq('signed estimate → one notification', kinds(r), ['doc_signed']);
    eq('signed estimate text names the signer, the document and the option chosen', r[0].text, 'Jane Doe signed Estimate E-1042 and chose Better');
    eq('signed: id = document + signed time', r[0].id, `signed:e1:${signed.clientSignedAt}`);
    eq('signed: second line is the job', r[0].detail, 'Kitchen remodel');
    eq('signed: opens the document', r[0].target, { kind: 'path', path: '/jobs/job1/forms/Estimate/e1' });
    eq('signed: actor for the initial', r[0].actor, 'Jane Doe');
    eq('signed: not read until viewed', r[0].sourceRead, false);

    const stored = doc({ id: 'e2', type: 'Estimate', number: 'E-7', clientName: 'Sam', clientSignedAt: ago(1), clientOptionChoice: { optionId: 'o3', optionName: 'Best' } });
    eq('option from the stored choice (JSON)', deriveDocNotifications([stored], ctx)[0].text, 'Sam signed Estimate E-7 and chose Best');
    eq('option from the stored choice (string JSON)', deriveDocNotifications([{ ...stored, clientOptionChoice: '{"optionName":"Good"}' }], ctx)[0].text, 'Sam signed Estimate E-7 and chose Good');
    eq('viewed by the contractor → read by source', deriveDocNotifications([{ ...signed, viewedByProvider: 'true' }], ctx)[0].sourceRead, true);

    const co = doc({ id: 'c1', type: 'Change Order', number: 'CO-3', clientName: 'Jane Doe', status: 'Accepted', clientSignedAt: ago(0, 1) });
    eq('change order → "approved"', texts(deriveDocNotifications([co], ctx)), ['Jane Doe approved Change order CO-3']);
    eq('change order path keeps the type', docPath(co), '/jobs/job1/forms/Change%20Order/c1');
    const wo = doc({ id: 'w1', type: 'Work Order', number: 'WO-5', clientSignerName: 'Pat Lee', clientSignedAt: ago(0, 1) });
    eq('work order signed (signer name field)', texts(deriveDocNotifications([wo], ctx)), ['Pat Lee signed Work order WO-5']);

    const declined = doc({ id: 'e3', type: 'Estimate', number: 'E-9', clientName: 'Bob', status: 'Rejected', clientDeclinedAt: ago(0, 3), clientDeclineReason: 'Too expensive for us right now' });
    const d = deriveDocNotifications([declined], ctx);
    eq('declined → doc_declined', kinds(d), ['doc_declined']);
    eq('declined text', d[0].text, 'Bob declined Estimate E-9');
    eq('declined reason is the second line', d[0].detail, '“Too expensive for us right now”');
    eq('cleared signature / decline ("") → nothing', deriveDocNotifications([doc({ type: 'Estimate', clientSignedAt: '', clientDeclinedAt: '' })], ctx), []);
    eq('invalid dates → nothing', deriveDocNotifications([doc({ type: 'Estimate', clientSignedAt: 'not a date' })], ctx), []);

    const po = doc({ id: 'p1', type: 'Purchase Order', number: 'PO-12', vendorName: 'Home Depot', clientSignedAt: ago(0, 1) });
    eq('PO signed → supplier confirmed', texts(deriveDocNotifications([po], ctx)), ['Home Depot confirmed PO-12']);
    eq('PO declined → can’t fill', texts(deriveDocNotifications([{ ...po, clientSignedAt: null, clientDeclinedAt: ago(0, 1) }], ctx)), ['Home Depot can’t fill PO-12']);
    eq('PO label without prefix', docLabel({ type: 'Purchase Order', number: '1234' }), 'PO 1234');
    const received = doc({ id: 'p2', type: 'Purchase Order', number: 'PO-13', vendorName: 'ABC Supply', receiptState: 'done', receiptDoneAt: ago(0, 4), receiptItemCount: 3 });
    eq('PO received into stock', texts(deriveDocNotifications([received], ctx)), ['PO-13 from ABC Supply received: 3 items added to stock']);
    eq('PO receiving (not done) → nothing', deriveDocNotifications([{ ...received, receiptState: 'receiving' }], ctx), []);

    const reported = doc({ id: 'i1', type: 'Invoice', number: 'INV-7', clientName: 'Jane Doe', status: 'Sent', dueDate: day(5), paymentReportedAt: ago(0, 1), paymentReportAmount: '1200', paymentReportNote: 'PayPal, Nov 14' });
    const pr = deriveDocNotifications([reported], ctx);
    eq('payment reported (and no overdue line for it)', kinds(pr), ['payment_reported']);
    eq('payment reported text with amount', pr[0].text, 'Jane Doe says they paid Invoice INV-7 ($1,200.00)');
    eq('payment note is the second line', pr[0].detail, 'PayPal, Nov 14');
    eq('payment reported on a Paid invoice → nothing', deriveDocNotifications([{ ...reported, status: 'Paid' }], ctx), []);

    const overdue = doc({ id: 'i2', type: 'Invoice', number: 'INV-8', clientName: 'Acme', status: 'Sent', dueDate: day(5) });
    const o = deriveDocNotifications([overdue], ctx, jobNames);
    eq('sent invoice past due → overdue', texts(o), ['Invoice INV-8 for Acme is 5 days overdue']);
    eq('overdue id = document + due date (no new one every day)', o[0].id, `overdue:i2:${day(5)}`);
    eq('overdue time = the day after the due date', o[0].at, new Date(2026, 10, 10).getTime());
    eq('1 day overdue (singular)', texts(deriveDocNotifications([{ ...overdue, dueDate: day(1) }], ctx)), ['Invoice INV-8 for Acme is 1 day overdue']);
    eq('due today → not overdue', deriveDocNotifications([{ ...overdue, dueDate: day(0) }], ctx), []);
    eq('draft invoice past due → nothing', deriveDocNotifications([{ ...overdue, status: 'Draft' }], ctx), []);
    eq('paid invoice past due → nothing', deriveDocNotifications([{ ...overdue, status: 'Paid' }], ctx), []);
    eq('status Overdue counts', kinds(deriveDocNotifications([{ ...overdue, status: 'Overdue' }], ctx)), ['invoice_overdue']);

    const exp = (n: number) => doc({ id: `x${n}`, type: 'Estimate', number: `E-${n}`, clientName: 'Kim', status: 'Sent', expiryDate: day(-n), createdAt: ago(10) });
    eq('expires today', texts(deriveDocNotifications([exp(0)], ctx)), ['Estimate E-0 for Kim expires today']);
    eq('expires tomorrow', texts(deriveDocNotifications([exp(1)], ctx)), ['Estimate E-1 for Kim expires tomorrow']);
    eq(`expires in ${EXPIRING_DAYS} days`, texts(deriveDocNotifications([exp(EXPIRING_DAYS)], ctx)), [`Estimate E-${EXPIRING_DAYS} for Kim expires in ${EXPIRING_DAYS} days`]);
    eq('expires in 4 days → not yet', deriveDocNotifications([exp(EXPIRING_DAYS + 1)], ctx), []);
    eq('already expired → nothing', deriveDocNotifications([{ ...exp(0), expiryDate: day(1) }], ctx), []);
    eq('draft estimate → nothing', deriveDocNotifications([{ ...exp(1), status: 'Draft' }], ctx), []);
    const exp1 = deriveDocNotifications([exp(1)], ctx)[0];
    ok('expiring time is not in the future', exp1.at <= NOW);
    eq('expiring time = expiry − 3 days (after it was created)', exp1.at, new Date(2026, 10, 12).getTime());

    eq('other user’s document → nothing', deriveDocNotifications([{ ...signed, userId: OTHER }, { ...overdue, userId: OTHER }], ctx), []);

    // app list summaries and JSON-path rows map the same way
    const summary = docInputOf({ id: 'f1', jobId: 'job1', type: 'Invoice', createdAt: ago(3), data: { invoiceNumber: 'INV-1', status: 'Sent', clientName: 'Zoe', paymentReportedAt: ago(0, 1) } });
    eq('app summary → DocInput', [summary.id, summary.jobId, summary.number, summary.status, summary.clientName], ['f1', 'job1', 'INV-1', 'Sent', 'Zoe']);
    const row = docInputOf({ id: 'r1', user_id: UID, job_id: 'job2', type: 'Purchase Order', poNumber: 'PO-9', receiptState: 'done', receiptDoneAt: ago(1), receiptItems: [{ itemId: 'a' }, { itemId: 'b' }] });
    eq('JSON-path row → DocInput', [row.userId, row.jobId, row.number, row.receiptState, row.receiptItemCount], [UID, 'job2', 'PO-9', 'done', 2]);
    eq('full row with data (receipt object)', docInputOf({ id: 'r2', type: 'Purchase Order', data: { internalStockReceipt: { state: 'done', doneAt: ago(1), items: [1, 2, 3] } } }).receiptItemCount, 3);
    eq('odd rows never throw', docInputOf(null).id, '');
}

// ------------------------------------------------------------------------------------------------ 2. inventory
{
    const items = [
        { id: 'a', user_id: UID, name: 'Drywall sheet', quantity: 3, low_stock_threshold: 5, unit: 'sheets' },
        { id: 'b', user_id: UID, name: 'Screws', quantity: 0, low_stock_threshold: 10 },
        { id: 'c', user_id: UID, name: 'Paint', quantity: -2, low_stock_threshold: 1 },
        { id: 'd', user_id: UID, name: 'Tape', quantity: 50, low_stock_threshold: 5 },
        { id: 'e', user_id: UID, name: 'Bath kit', quantity: 0, low_stock_threshold: 5, is_assembly: true },
        { id: 'f', user_id: UID, name: 'Caulk', quantity: 4 },
        { id: 'g', user_id: OTHER, name: 'Their item', quantity: 0 },
    ];
    const r = deriveStockNotifications(items, ctx);
    eq('low / out / oversold / default threshold; kits and other users skipped', r.items.map(n => [n.kind, n.id]), [
        ['stock_low', 'stock:a:low'], ['stock_out', 'stock:b:out'], ['stock_out', 'stock:c:out'], ['stock_low', 'stock:f:low'],
    ]);
    eq('low stock text with unit', r.items[0].text, 'Drywall sheet is running low: 3 sheets left');
    eq('out of stock text', r.items[1].text, 'Screws is out of stock');
    eq('stock opens the item', r.items[0].target, { kind: 'inventory', itemId: 'a' });
    ok('stock items are conditions (first seen = their time)', r.items.every(n => n.condition && n.at === 0));
    ok('item back in stock: both ids resolved', r.resolvedIds.includes('stock:d:low') && r.resolvedIds.includes('stock:d:out'));
    ok('low item: the old "out" id is resolved', r.resolvedIds.includes('stock:a:out') && !r.resolvedIds.includes('stock:a:low'));

    // condition times: first seen on this device, kept between builds; resolved → forgotten
    const first = build(r.items);
    ok('first build: conditions get "now"', first.list.every(n => n.at === Math.floor(NOW / 1000) * 1000));
    ok('first build: first-seen map changed', first.seenChanged);
    const later = buildNotifications({ now: NOW + 3_600_000, items: r.items, state: emptyState(), prefs: defaultPrefs(), seen: first.seen });
    ok('later build keeps the first-seen time', later.list.every(n => n.at === Math.floor(NOW / 1000) * 1000) && !later.seenChanged);
    const read = markRead(emptyState(), ['stock:a:low'], NOW);
    eq('read low-stock item', build(r.items, read).list.find(n => n.id === 'stock:a:low')?.read, true);
    const resolved = forget(read, ['stock:a:low']);
    eq('back to normal → forgotten (next time it is new)', build(r.items, resolved).list.find(n => n.id === 'stock:a:low')?.read, false);
    eq('forget without a match returns the same state', forget(read, ['stock:zz:low']) === read, true);
    const seenPruned = pruneSeen(first.seen, NOW, ['stock:a:low']);
    ok('forgotten condition loses its first-seen time', seenPruned[notificationKey('stock:a:low')] === undefined && seenPruned[notificationKey('stock:b:out')] !== undefined);
}

// ------------------------------------------------------------------------------------------------ 3. quote requests
{
    const r = deriveRequestNotifications([
        { id: 'q1', name: 'Sam Lee', details: 'Kitchen remodel, about 200 sq ft, need a quote before December please', status: 'new', createdAt: ago(0, 1), photoCount: 2 },
        { id: 'q2', name: 'Ann', details: '', status: 'seen', createdAt: ago(2) },
        { id: 'q3', name: 'Old', status: 'archived', createdAt: ago(1) },
        { id: 'q4', name: 'No date', status: 'new', createdAt: '' },
    ]);
    eq('requests: archived and undated left out', r.map(n => n.id), ['request:q1', 'request:q2']);
    eq('request text', r[0].text, 'New quote request from Sam Lee');
    ok('request snippet + photos', !!r[0].detail && r[0].detail.endsWith('· 2 photos') && r[0].detail.length < 100);
    eq('new = unread, seen = read by source', r.map(n => !!n.sourceRead), [false, true]);
    eq('request opens the request window', r[0].target, { kind: 'request', requestId: 'q1' });
}

// ------------------------------------------------------------------------------------------------ 4. community
{
    const lookups = {
        authors: { u1: 'Alex Kim', u2: 'Sam', u3: 'Pat', [UID]: 'Me' },
        postTitles: { p1: 'Best way to price a deck in winter?', p2: 'Show: bathroom remodel' },
        comments: { c1: 'Great question, I add 10% for cold weather work.', c9: 'Thanks!' },
    };
    const rows = [
        { id: 'n1', user_id: UID, source_user_id: 'u1', type: 'like', post_id: 'p1', is_read: false, created_at: ago(0, 1) },
        { id: 'n2', user_id: UID, source_user_id: 'u2', type: 'like', post_id: 'p1', is_read: true, created_at: ago(0, 3) },
        { id: 'n3', user_id: UID, source_user_id: 'u3', type: 'like', post_id: 'p1', is_read: true, created_at: ago(1) },
        { id: 'n4', user_id: UID, source_user_id: 'u2', type: 'comment', post_id: 'p1', comment_id: 'c1', is_read: false, created_at: ago(0, 2) },
        { id: 'n5', user_id: UID, source_user_id: 'u1', type: 'comment_like', post_id: 'p2', comment_id: 'c9', is_read: true, created_at: ago(3) },
        { id: 'n6', user_id: UID, source_user_id: UID, type: 'like', post_id: 'p2', is_read: false, created_at: ago(0, 1) },
        { id: 'n7', user_id: OTHER, source_user_id: 'u1', type: 'like', post_id: 'p9', is_read: false, created_at: ago(0, 1) },
    ];
    const r = deriveForumNotifications(rows, lookups, ctx);
    const like = r.find(n => n.kind === 'forum_like')!;
    eq('likes on one post grouped (newest liker first)', like.text, 'Alex Kim and 2 others liked your post “Best way to price a deck in winter?”');
    eq('group id = post + newest like', like.id, 'forum:like:p1:n1');
    eq('group carries every row id (marked read together)', like.forumIds, ['n1', 'n2', 'n3']);
    eq('group unread while any like is unread', like.sourceRead, false);
    const comment = r.find(n => n.kind === 'forum_comment')!;
    eq('comment text + snippet', [comment.text, comment.detail], ['Sam commented on “Best way to price a deck in winter?”', '“Great question, I add 10% for cold weather work.”']);
    eq('comment opens the post', comment.target, { kind: 'path', path: '/forum/p1' });
    const cl = r.find(n => n.kind === 'forum_comment_like')!;
    eq('comment like text', cl.text, 'Alex Kim liked your comment on “Show: bathroom remodel”');
    eq('comment like read by source', cl.sourceRead, true);
    eq('own likes and other users’ rows ignored', r.length, 3);
    const newer = deriveForumNotifications([{ id: 'n8', user_id: UID, source_user_id: 'u3', type: 'like', post_id: 'p1', is_read: false, created_at: ago(0, 0.5) }, ...rows], lookups, ctx);
    eq('a new like changes the group id (unread again)', newer.find(n => n.kind === 'forum_like')!.id, 'forum:like:p1:n8');
    eq('names: one / two / many', [namesText(['A']), namesText(['A', 'B']), namesText(['A', 'B', 'C', 'A'])], ['A', 'A and B', 'A and 2 others']);

    // replies in threads the user joined
    const replies = deriveThreadReplies({
        myComments: [{ post_id: 'p7', created_at: ago(5) }, { post_id: 'p7', created_at: ago(1) }, { post_id: 'p8', created_at: ago(2) }, { post_id: 'mine', created_at: ago(2) }],
        otherComments: [
            { id: 'k1', post_id: 'p7', user_id: 'u1', content: 'Agree with you on this', created_at: ago(0, 2) },
            { id: 'k2', post_id: 'p7', user_id: 'u2', content: 'Same here', created_at: ago(3) },
            { id: 'k3', post_id: 'p7', user_id: 'u3', content: 'Before you joined', created_at: ago(6) },
            { id: 'k4', post_id: 'p8', user_id: UID, content: 'my own', created_at: ago(0, 1) },
            { id: 'k5', post_id: 'mine', user_id: 'u1', content: 'on my own post', created_at: ago(0, 1) },
        ],
        posts: { p7: { title: 'Winter concrete tips', user_id: 'u9' }, p8: { title: 'Other', user_id: 'u9' }, mine: { title: 'Mine', user_id: UID } },
    }, lookups, ctx);
    eq('replies: one line per thread, after my first comment, not mine, not my own posts', replies.map(n => [n.id, n.text]), [
        ['forum:reply:p7:k1', 'Alex Kim and Sam replied in “Winter concrete tips”'],
    ]);
    eq('reply snippet', replies[0].detail, '“Agree with you on this”');
}

// ------------------------------------------------------------------------------------------------ 5. reminders + Gmail
{
    const recs = [
        { id: 'm1', user_id: UID, kind: 'invoice', status: 'sent', to_email: 'jane@example.com', sent_at: ago(0, 6), created_at: ago(0, 6), label: 'Invoice INV-7', path: '/jobs/job1/forms/Invoice/i1' },
        { id: 'm2', user_id: UID, kind: 'estimate', status: 'sent', sent_at: ago(1, 0), created_at: ago(1, 0), label: 'Estimate E-1' },
        { id: 'm3', user_id: UID, kind: 'invoice', status: 'sent', sent_at: ago(1, 0.5), created_at: ago(1, 0.5), label: 'Invoice INV-8' },
        { id: 'm4', user_id: UID, kind: 'invoice', status: 'sent', sent_at: ago(1, 1), created_at: ago(1, 1), label: 'Invoice INV-9' },
        { id: 'm5', user_id: UID, kind: 'invoice', status: 'failed', reason: 'gmail_reconnect', created_at: ago(0, 6), label: 'Invoice INV-10' },
        { id: 'm6', user_id: UID, kind: 'invoice', status: 'skipped', reason: 'no_email', created_at: ago(0, 6), label: 'Invoice INV-11', path: '/jobs/job1/forms/Invoice/i11' },
        { id: 'm7', user_id: UID, kind: 'invoice', status: 'skipped', reason: 'skipped_by_user', created_at: ago(0, 6), label: 'Invoice INV-12' },
        { id: 'm8', user_id: OTHER, kind: 'invoice', status: 'sent', sent_at: ago(0, 1), created_at: ago(0, 1), label: 'Theirs' },
        { id: 'm9', user_id: UID, kind: 'invoice', status: 'sending', created_at: ago(0, 1), label: 'In flight' },
    ];
    const r = deriveReminderNotifications(recs, ctx);
    const sentToday = r.find(n => n.id.startsWith('reminders-sent:') && n.text.startsWith('Reminder sent'))!;
    eq('one reminder sent today', sentToday.text, 'Reminder sent for Invoice INV-7 to jane@example.com');
    eq('single sent reminder opens its document', sentToday.target, { kind: 'path', path: '/jobs/job1/forms/Invoice/i1' });
    const many = r.find(n => n.text === '3 reminders sent')!;
    ok('three reminders yesterday grouped into one line', !!many && many.detail === 'Estimate E-1, Invoice INV-8, Invoice INV-9');
    eq('group opens Messages (reminder log)', many.target, { kind: 'path', path: '/communication' });
    const failed = r.filter(n => n.kind === 'reminder_failed');
    eq('failures per reason (user skips and in-flight sends are not news)', failed.map(n => n.text).sort(), [
        'Reminder for Invoice INV-10 wasn’t sent: gmail needs to be reconnected',
        'Reminder for Invoice INV-11 wasn’t sent: client has no email address',
    ]);
    eq('Gmail failure is suppressed by the Gmail line', failed.find(n => n.text.includes('INV-10'))!.suppressedBy, 'gmail_reconnect');
    eq('no-email failure opens the document', failed.find(n => n.text.includes('INV-11'))!.target, { kind: 'path', path: '/jobs/job1/forms/Invoice/i11' });
    eq('other users’ reminders ignored', r.some(n => n.text.includes('Theirs')), false);

    const gmail = deriveGmailNotifications([
        { id: 'g1', user_id: UID, gmail_address: 'me@gmail.com', status: 'needs_reconnect', updated_at: ago(0, 7) },
        { id: 'g2', user_id: UID, gmail_address: 'ok@gmail.com', status: 'active', updated_at: ago(0, 7) },
        { id: 'g3', user_id: OTHER, gmail_address: 'x@gmail.com', status: 'needs_reconnect', updated_at: ago(0, 7) },
    ], ctx);
    eq('Gmail needs reconnecting (only mine, only that status)', texts(gmail), ['Gmail (me@gmail.com) needs to be reconnected']);

    // de-duplication across sources: the Gmail line hides the matching reminder failure
    const withGmail = build([...r, ...gmail]).list;
    ok('with the Gmail line: the gmail_reconnect failure is hidden', !withGmail.some(n => n.text.includes('INV-10')) && withGmail.some(n => n.kind === 'gmail_reconnect'));
    ok('without it: the failure shows', build(r).list.some(n => n.text.includes('INV-10')));
}

// ------------------------------------------------------------------------------------------------ 6. outbox + plan limits
{
    const items = [
        { docId: 'o1', userId: UID, jobId: 'job1', type: 'Invoice', status: 'failed', error: { kind: 'error', message: 'The server said no', at: ago(0, 1) }, data: { invoiceNumber: 'INV-20' } },
        { docId: 'o2', userId: UID, jobId: 'job1', type: 'Daily Job Report', status: 'blocked', error: { kind: 'plan_limit', message: 'This job has used its 12 documents', at: ago(0, 2) }, data: { title: 'Day 3' } },
        { docId: 'o3', userId: UID, jobId: 'job1', type: 'Note', status: 'pending', error: null, data: {} },
        { docId: 'o4', userId: OTHER, jobId: 'job1', type: 'Note', status: 'failed', error: { message: 'x', at: ago(0, 1) }, data: {} },
    ];
    const r = deriveOutboxNotifications(items, ctx);
    eq('failed + blocked only, mine only', texts(r), ['Invoice INV-20 couldn’t be saved to your account', 'Day 3 couldn’t be saved to your account']);
    eq('outbox item opens the outbox panel', r[0].target, { kind: 'outbox' });
    eq('sync id = document + error time', r[0].id, `sync:o1:${items[0].error!.at}`);

    const usage = { tier: 'free', jobsThisMonth: 6, clientsThisMonth: 3, emailsThisMonth: 10, aiThisMonth: 2, limits: { jobs: 6, clients: 15, docs: 12, emails: 10, ai: 15 }, fromServer: true, monthStart: '2026-11-01T00:00:00+00:00' };
    const l = deriveLimitNotifications(usage, { job1: 12, job2: 4 }, ctx, jobNames);
    eq('limits reached: jobs, emails and a full job', l.map(n => n.id), ['limit:jobs:2026-11', 'limit:emails:2026-11', 'limit:docs:job1:2026-11']);
    eq('job limit text', l[0].text, 'You’ve used all 6 new jobs for this month');
    eq('full job text', l[2].text, 'Kitchen remodel has used its 12 new documents for this month');
    eq('limits open Plan & billing', l[0].target, { kind: 'path', path: '/settings#billing' });
    eq('local (not server) usage → no limit notifications', deriveLimitNotifications({ ...usage, fromServer: false }, { job1: 12 }, ctx), []);
    eq('paid plan: only the AI limit can be reached', deriveLimitNotifications({ ...usage, aiThisMonth: 60, limits: { jobs: null, clients: null, docs: null, emails: null, ai: 60 } }, { job1: 99 }, ctx).map(n => n.id), ['limit:ai:2026-11']);
    eq('no usage → nothing', deriveLimitNotifications(null, null, ctx), []);
}

// ------------------------------------------------------------------------------------------------ 7. de-duplication, window, ordering, grouping
{
    const a: AppNotification = { id: 'signed:e1:t', kind: 'doc_signed', text: 'From the server', at: NOW - 3_600_000, target: { kind: 'path', path: '/x' }, sourceRead: false };
    const b: AppNotification = { ...a, text: 'From the app list', detail: 'Job', sourceRead: true };
    const d = dedupe([a, b]);
    eq('same id from two sources → one item', d.length, 1);
    eq('first copy’s text kept, missing detail filled, read-by-source from either', [d[0].text, d[0].detail, d[0].sourceRead], ['From the server', 'Job', true]);
    eq('forum ids merged', dedupe([{ ...a, forumIds: ['1'] }, { ...a, forumIds: ['2', '1'] }])[0].forumIds, ['1', '2']);

    const mk = (id: string, at: number, kind: AppNotification['kind'] = 'quote_request'): AppNotification => ({ id, kind, text: id, at, target: { kind: 'path', path: '/' } });
    const yesterday = new Date(2026, 10, 13, 23, 0).getTime();
    const todayEarly = new Date(2026, 10, 14, 0, 30).getTime();
    const items = [
        mk('old', NOW - (WINDOW_DAYS + 1) * 86_400_000),
        mk('y', yesterday),
        mk('t1', todayEarly),
        mk('t2', NOW - 60_000),
        mk('tie-info', NOW - 3_600_000, 'quote_request'),
        mk('tie-danger', NOW - 3_600_000, 'invoice_overdue'),
        mk('future', NOW + 86_400_000),
    ];
    const res = build(items);
    eq('window: older than 60 days left out; newest first; same time → most urgent first', res.list.map(n => n.id), ['future', 't2', 'tie-danger', 'tie-info', 't1', 'y']);
    eq('a future time is shown as now', res.list[0].at, NOW);
    eq('Today / Earlier', groupByDay(res.list, NOW).map(g => [g.label, g.items.map(n => n.id)]), [['Today', ['future', 't2', 'tie-danger', 'tie-info', 't1']], ['Earlier', ['y']]]);
    eq('no empty groups', groupByDay([], NOW), []);
    eq('unread count', res.unread, 6);
    const many = Array.from({ length: MAX_LIST + 30 }, (_, i) => mk(`m${i}`, NOW - i * 60_000));
    eq(`list capped at ${MAX_LIST}`, build(many).list.length, MAX_LIST);
    eq('category and tone from the kind', [res.list[2].category, res.list[2].tone], ['overdue', 'danger']);
    ok('every kind has a category that Settings lists', Object.values(KIND_META).every(m => NOTIFICATION_CATEGORIES.some(c => c.id === m.category)));

    eq('time labels', [timeLabel(NOW - 20_000, NOW), timeLabel(NOW - 5 * 60_000, NOW), timeLabel(NOW - 3 * 3_600_000, NOW), timeLabel(yesterday, NOW), timeLabel(NOW - 4 * 86_400_000, NOW), timeLabel(new Date(2026, 10, 3, 12).getTime(), NOW)],
        ['now', '5m', '3h', 'Yesterday', '4d', 'Nov 3']);
    eq('badge text', [badgeText(0, false), badgeText(3, false), badgeText(150, false), badgeText(3, true), badgeText(0, true)], ['', '3', '99+', '•', '']);
    eq('clip at a word boundary', clip('The quick brown fox jumps over the lazy dog', 20), 'The quick brown fox…');
}

// ------------------------------------------------------------------------------------------------ 8. read / dismissed state + bounds
{
    const mk = (id: string, at: number): AppNotification => ({ id, kind: 'doc_signed', text: id, at, target: { kind: 'path', path: '/' } });
    const items = [mk('a', NOW - 1000), mk('b', NOW - 2000), mk('c', NOW - 3000)];
    let s = markRead(emptyState(), ['a'], NOW);
    eq('read one', build(items, s).list.map(n => n.read), [true, false, false]);
    s = dismiss(s, ['b'], NOW);
    eq('dismissed one is gone', build(items, s).list.map(n => n.id), ['a', 'c']);
    s = markAllRead(s, ['c'], NOW);
    eq('mark all read → nothing unread', build(items, s).unread, 0);
    eq('an event after "mark all read" is unread', build([...items, mk('d', NOW + 1000)], s, defaultPrefs()).list.find(n => n.id === 'd')?.read, false);
    const cond: AppNotification = { id: 'stock:z:low', kind: 'stock_low', text: 'z', at: 0, condition: true, target: { kind: 'inventory', itemId: 'z' } };
    const afterClear = buildNotifications({ now: NOW + 60_000, items: [cond], state: s, prefs: defaultPrefs(), seen: {} });
    eq('a condition first seen after "mark all read" is unread', afterClear.list[0].read, false);
    const clearedWithIt = markAllRead(emptyState(), ['stock:z:low'], NOW);
    eq('…but not if it was on screen when "mark all read" was pressed (other device)', buildNotifications({ now: NOW + 60_000, items: [cond], state: clearedWithIt, prefs: defaultPrefs(), seen: {} }).list[0].read, true);

    // bounds: 200 ids, 60 days, size cap
    let big = emptyState();
    big = markRead(big, Array.from({ length: 260 }, (_, i) => `doc:${i}`), NOW);
    eq(`read list keeps at most ${MAX_STATE_IDS}`, Object.keys(big.read).length, MAX_STATE_IDS);
    let both = dismiss(big, Array.from({ length: 260 }, (_, i) => `dismissed:${i}`), NOW);
    both = markRead(both, Array.from({ length: 30 }, (_, i) => `newer:${i}`), NOW + 1000);
    ok(`dismissed list keeps at most ${MAX_STATE_IDS}`, Object.keys(both.dismissed).length <= MAX_STATE_IDS);
    ok(`serialized state ≤ ${STATE_MAX_CHARS} chars (user_settings check is 20,000)`, JSON.stringify(both).length <= STATE_MAX_CHARS);
    ok('newest ids are the ones kept', both.read[notificationKey('newer:29')] !== undefined);
    const old = { v: 1 as const, clearedAt: Math.floor((NOW - 90 * 86_400_000) / 1000), read: { aaa: Math.floor((NOW - 61 * 86_400_000) / 1000), bbb: Math.floor((NOW - 59 * 86_400_000) / 1000) }, dismissed: { ccc: Math.floor((NOW - 70 * 86_400_000) / 1000) } };
    eq('entries older than 60 days are dropped', pruneState(old, NOW), { v: 1, clearedAt: 0, read: { bbb: old.read.bbb }, dismissed: {} });

    // parse: anything odd is dropped
    eq('garbage → empty state', [parseState(null), parseState('nope'), parseState([1, 2]), parseState({ read: 'x' })], [emptyState(), emptyState(), emptyState(), emptyState()]);
    eq('bad keys / times dropped', parseState({ clearedAt: 'abc', read: { ok1: 1731500000, 'BAD KEY': 1731500000, neg: -5, big: 1e12 }, dismissed: { d1: '1731500000' } }), { v: 1, clearedAt: 0, read: { ok1: 1731500000 }, dismissed: { d1: 1731500000 } });
    eq('state round-trips through JSON', parseState(JSON.stringify(both)), both);

    // merge between devices: union, nothing lost
    const devA = markRead(emptyState(), ['a'], NOW);
    const devB = dismiss(markAllRead(emptyState(), ['x'], NOW + 5000), ['b'], NOW + 5000);
    const merged = mergeStates(devA, devB, NOW + 6000);
    ok('merge keeps reads of both devices', merged.read[notificationKey('a')] !== undefined && merged.read[notificationKey('x')] !== undefined);
    ok('merge keeps dismissals and the newest "mark all read"', merged.dismissed[notificationKey('b')] !== undefined && merged.clearedAt === devB.clearedAt);
    eq('merge is order independent', mergeStates(devB, devA, NOW + 6000), merged);

    // keys
    const k = notificationKey('signed:2c9d0d4e-1111-2222-3333-444455556666:2026-11-13T10:22:01.123Z');
    ok('key is short and safe for the account list', /^[a-z0-9]{1,11}$/.test(k));
    eq('key is stable', notificationKey('abc'), notificationKey('abc'));
    ok('different ids → different keys', new Set(Array.from({ length: 2000 }, (_, i) => notificationKey(`stock:${i}:low`))).size === 2000);
    eq('seen map parse', [parseSeen('{"abc":1731500000,"BAD":1}'), parseSeen('{oops')], [{ abc: 1731500000 }, {}]);
}

// ------------------------------------------------------------------------------------------------ 9. per-type settings
{
    const items: AppNotification[] = [
        { id: 'f1', kind: 'forum_like', text: 'like', at: NOW - 1000, target: { kind: 'path', path: '/forum' } },
        { id: 's1', kind: 'doc_signed', text: 'signed', at: NOW - 2000, target: { kind: 'path', path: '/' } },
    ];
    const off = setCategory(defaultPrefs(), 'community', false, NOW);
    eq('community off → hidden and not counted', [build(items, emptyState(), off).list.map(n => n.id), build(items, emptyState(), off).unread], [['s1'], 1]);
    eq('switch back on', isCategoryOn(setCategory(off, 'community', true, NOW + 1), 'community'), true);
    eq('prefs keep the Settings order and no duplicates', setCategory(setCategory(off, 'clients', false, NOW), 'community', false, NOW).off, ['clients', 'community']);
    eq('prefs parse: unknown categories dropped, quiet only when true', parsePrefs({ off: ['community', 'nonsense', 'community'], quiet: 'yes', at: 5 }), { v: 1, off: ['community'], quiet: false, at: 5 });
    eq('prefs parse garbage → defaults', parsePrefs('{bad'), defaultPrefs());
    eq('newest prefs win between devices', newerPrefs({ ...defaultPrefs(), at: 5 }, { ...defaultPrefs(), quiet: true, at: 9 }).quiet, true);
    eq('pop-ups are per device: not in the account prefs', Object.keys(defaultPrefs()).sort(), ['at', 'off', 'quiet', 'v']);
    eq('15 types in Settings (+ crew missed clock-outs, papers, service plan visits)', NOTIFICATION_CATEGORIES.length, 15);
}

// ------------------------------------------------------------------------------------------------ 10. browser pop-ups
{
    const mk = (id: string, ageMs: number, read = false): ShownNotification => ({ id, kind: 'doc_signed', text: id, at: NOW - ageMs, target: { kind: 'path', path: '/' }, category: 'clients', tone: 'success', key: notificationKey(id), read });
    const list = [mk('new1', 1000), mk('new2', 2000), mk('new3', 3000), mk('new4', 4000), mk('known', 1000), mk('old', 60 * 60_000), mk('read', 1000, true)];
    const known = new Set(['known']);
    const on = { enabled: true, permission: 'granted', quiet: false, now: NOW };
    eq(`pop-ups: new, unread, recent, at most ${POP_MAX}`, pickPopups(list, known, on).map(n => n.id), ['new1', 'new2', 'new3']);
    eq('off by default / not allowed / quiet → none', [pickPopups(list, known, { ...on, enabled: false }).length, pickPopups(list, known, { ...on, permission: 'default' }).length, pickPopups(list, known, { ...on, permission: 'denied' }).length, pickPopups(list, known, { ...on, quiet: true }).length], [0, 0, 0, 0]);
}

// ------------------------------------------------------------------------------------------------ 11. nothing from other users (all sources together)
{
    const all = [
        ...deriveDocNotifications([doc({ userId: OTHER, type: 'Estimate', clientSignedAt: ago(0, 1) })], ctx),
        ...deriveStockNotifications([{ id: 'x', user_id: OTHER, quantity: 0 }], ctx).items,
        ...deriveForumNotifications([{ id: 'y', user_id: OTHER, source_user_id: 'u1', type: 'like', post_id: 'p', created_at: ago(0, 1) }], { authors: {}, postTitles: {}, comments: {} }, ctx),
        ...deriveReminderNotifications([{ id: 'z', user_id: OTHER, status: 'sent', created_at: ago(0, 1) }], ctx),
        ...deriveGmailNotifications([{ id: 'g', user_id: OTHER, status: 'needs_reconnect' }], ctx),
        ...deriveOutboxNotifications([{ docId: 'o', userId: OTHER, type: 'Note', status: 'failed', error: { at: ago(0, 1) } }], ctx),
    ];
    eq('another user’s data never becomes a notification', all, []);
}

// ------------------------------------------------------------------------------------------------ 12. wiring
{
    eq('document link opens the form screen', parseView('/jobs/job1/forms/Change%20Order/c1', '', null), { screen: 'form', jobId: 'job1', formType: 'Change Order', formId: 'c1', prefillData: undefined });
    eq('forum link opens the post', parseView('/forum/p1', '', null), { screen: 'forum', postId: 'p1' });
    eq('inventory link', parseView('/inventory', '?item=abc', null).screen, 'inventory');
    const settings = readFileSync('components/Settings.tsx', 'utf8');
    ok('Settings lists the Notifications section', /\{ id: 'notifications', label: 'Notifications' \}/.test(settings) && settings.includes('<NotificationSettingsCard />'));
    ok('the card has the anchor the bell opens', readFileSync('components/notifications/NotificationSettingsCard.tsx', 'utf8').includes('id="settings-notifications"'));
    const nav = readFileSync('components/AppNav.tsx', 'utf8');
    ok('the bell is in the app bar', nav.includes('<NotificationBell />'));
    ok('existing badges kept (clients, tools low stock, community)', ['clientBadge > 0', 'lowStockCount > 0', 'forumBadge > 0', 'badgeCount: clientBadge', 'badgeCount: lowStockCount', 'badgeCount: forumBadge'].every(s => nav.includes(s)));
    const app = readFileSync('App.tsx', 'utf8');
    ok('App mounts the notification center once', (app.match(/<NotificationCenter\b/g) || []).length === 1);
    ok('App still passes the existing badges', ['clientBadge={clientNotificationCount}', 'forumBadge={notificationCount}', 'lowStockCount={lowStockCount}'].every(s => app.includes(s)));
    const guide = getGuide('notifications');
    ok('help guide "notifications"', !!guide && guide.appPath === '/settings#notifications' && HELP_GUIDES.includes(guide));
    ok('AI knowledge has the notifications entry and route', KNOWLEDGE.some(e => e.id === 'notifications' && e.route === '/settings#notifications') && (NAV_ROUTES as readonly string[]).includes('/settings#notifications') && !!NAV_LABELS['/settings#notifications']);
    const keyRe = /^[a-z0-9_.:-]{1,64}$/; // public.user_settings key check
    ok('user_settings keys are valid', keyRe.test(NOTIFICATION_STATE_SETTING) && keyRe.test(NOTIFICATION_PREFS_SETTING));
    ok('userData lists the keys', readFileSync('lib/userData.ts', 'utf8').includes("'notifications.state'") && readFileSync('lib/userData.ts', 'utf8').includes("'notifications.prefs'"));
    const sources = readFileSync('lib/notifications/sources.ts', 'utf8');
    ok('every document read is limited to the signed-in user', (sources.match(/from\('documents'\)\s*\.select\([A-Z_]+\)\s*\.eq\('user_id', uid\)/g) || []).length >= 3 && !/\.channel\(/.test(sources));
    ok('no database writes except marking Community notifications read', !/\.(insert|upsert|delete)\(/.test(sources) && (sources.match(/\.update\(/g) || []).length === 1);
}

console.log(`${failures ? 'FAILED' : 'Notification checks passed'}: ${passes} passed, ${failures} failed.`);
if (failures) process.exit(1);
