/**
 * Client portal / approval links / temporary clients: pure-logic checks (utils/clientPortalRules.ts) and a lint of
 * supabase/migrations/20261113000600_portal_approval_fixes.sql (functions only, same signatures, privileges, no
 * data change). No database needed:
 *   npx tsx scripts/portal-approval-check.ts
 * The database behaviour itself is covered by supabase/tests/db-tests.mjs (local Supabase stack).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CLIENT_FACING_TYPES, EXPIRY_RULE_START, computeDocState, expiryBlocksSigning, groupPortalDocuments, isClientCreatedWithJob,
    isDeclinedData, isSignedData, isTemporaryNotes, isUnpaidInvoice, needsNewApprovalToken, parseDocState, shareLinkKind,
    stateOfDoc, stripTempTag, withTempTag, ymdOf,
} from '../utils/clientPortalRules.ts';

let passes = 0;
let failures = 0;
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

const NOW = new Date('2026-12-01T15:00:00Z');
const NEW = '2026-11-20T10:00:00Z';
const OLD = '2026-09-01T10:00:00Z';

// ---------------------------------------------------------------- signing state
eq('legacy estimate past its date stays open', computeDocState('Estimate', { status: 'Sent', expiryDate: '2026-09-08' }, OLD, NOW), 'open');
eq('legacy Draft estimate past its date stays open', computeDocState('Estimate', { status: 'Draft', expiryDate: '2026-09-08' }, OLD, NOW), 'open');
eq('new estimate past its date is expired', computeDocState('Estimate', { status: 'Sent', expiryDate: '2026-11-28' }, NEW, NOW), 'expired');
eq('valid-until yesterday (UTC) still signable: one day of grace', computeDocState('Estimate', { status: 'Sent', expiryDate: '2026-11-30' }, NEW, NOW), 'open');
eq('valid-until today open', computeDocState('Estimate', { expiryDate: '2026-12-01' }, NEW, NOW), 'open');
eq('unreadable date never blocks', computeDocState('Estimate', { expiryDate: '2026-02-31' }, NEW, NOW), 'open');
eq('unknown creation date counts as new', expiryBlocksSigning('', '2020-01-01', NOW), true);
eq('Accepted = signed', computeDocState('Estimate', { status: 'Accepted' }, NEW, NOW), 'signed');
eq('change order Approved by the contractor = signed (no sign button)', computeDocState('Change Order', { status: 'Approved' }, NEW, NOW), 'signed');
eq('client signature = signed whatever the status', computeDocState('Change Order', { status: 'Sent', clientSignedAt: '2026-11-21T10:00:00Z' }, NEW, NOW), 'signed');
eq('Rejected = declined', computeDocState('Estimate', { status: 'Rejected', clientDeclinedAt: '2026-11-21T10:00:00Z' }, NEW, NOW), 'declined');
eq('re-sent after a decline (database cleared it) = open', computeDocState('Estimate', { status: 'Sent', clientDeclinedAt: '', clientDeclineReason: '' }, NEW, NOW), 'open');
eq('declined wins over expiry', computeDocState('Estimate', { status: 'Rejected', expiryDate: '2020-01-01' }, NEW, NOW), 'declined');
eq('unlocked signature ("Revise", keys = "") = open', computeDocState('Estimate', { status: 'Draft', clientSignatureUrl: '', clientSignedAt: '' }, NEW, NOW), 'open');
for (const t of ['Invoice', 'Receipt', 'Work Order', 'Daily Job Report', 'Warranty']) eq(`${t} is view only`, computeDocState(t, { status: 'Sent' }, NEW, NOW), 'readonly');
eq('server state wins', stateOfDoc({ type: 'Estimate', data: { expiryDate: '2020-01-01' }, createdAt: NEW, state: 'open' }, NOW), 'open');
eq('fallback without server state', stateOfDoc({ type: 'Estimate', data: { expiryDate: '2020-01-01' }, createdAt: NEW, state: null }, NOW), 'expired');
eq('parseDocState accepts the 5 states only', ['open', 'signed', 'declined', 'expired', 'readonly', 'used', '', null].map(parseDocState), ['open', 'signed', 'declined', 'expired', 'readonly', null, null, null]);
ok('isSignedData ignores empty keys', !isSignedData({ status: 'Sent', clientSignatureUrl: '', clientSignedAt: '' }));
ok('isDeclinedData ignores an empty decline', !isDeclinedData({ status: 'Sent', clientDeclinedAt: '' }));
eq('ymdOf', [ymdOf('2026-11-13T00:00:00Z'), ymdOf('2026-13-01'), ymdOf('next week')], ['2026-11-13', '', '']);

// ---------------------------------------------------------------- portal grouping + outstanding balance
{
    const inv = (status: string | undefined, total: number, extra: Record<string, unknown> = {}) => ({
        type: 'Invoice', createdAt: NEW, data: { ...(status === undefined ? {} : { status }), lineItems: [{ quantity: 1, rate: total }], ...extra },
    });
    const docs = [
        inv('Sent', 100),
        inv('Overdue', 50),
        inv(undefined, 25), // no status (old invoices): unpaid
        inv('Paid', 1000),
        inv('Cancelled', 70),
        inv('Sent', 200, { amountPaid: 150 }), // partly paid: 50 due
        { type: 'Estimate', createdAt: OLD, data: { status: 'Sent', expiryDate: '2026-09-08' } }, // legacy, past date: to sign
        { type: 'Estimate', createdAt: NEW, data: { status: 'Sent', expiryDate: '2026-11-25' } }, // new, expired
        { type: 'Change Order', createdAt: NEW, data: { status: 'Accepted' } },
        { type: 'Change Order', createdAt: NEW, data: { status: 'Sent' }, state: 'declined' as const }, // server verdict
        { type: 'Receipt', createdAt: NEW, data: { amount: 120 } },
        { type: 'Daily Job Report', createdAt: NEW, data: {} },
        { type: 'Work Order', createdAt: NEW, data: { status: 'Scheduled' } },
        { type: 'Warranty', createdAt: NEW, data: {} },
    ];
    const g = groupPortalDocuments(docs, NOW);
    eq('tabs: invoices / estimates & change orders / reports & other', [g.invoices.length, g.approvals.length, g.other.length], [6, 4, 4]);
    eq('to sign = open estimates / change orders', g.awaiting.length, 1);
    eq('outstanding = every unpaid invoice balance (old rule; Paid / Cancelled excluded)', g.outstanding, 225);
    eq('unpaid invoice count', g.unpaid.length, 4);
    eq('empty portal', groupPortalDocuments([], NOW).outstanding, 0);
    ok('Draft invoice never counts', !isUnpaidInvoice({ status: 'Draft' }));
    ok('invoice without status counts', isUnpaidInvoice({}));
}

// ---------------------------------------------------------------- links
eq('share link: client-facing types get the document link', CLIENT_FACING_TYPES.map(shareLinkKind), CLIENT_FACING_TYPES.map(() => 'document'));
eq('share link: internal paperwork gets none', ['Purchase Order', 'Time Sheet', 'Material Log', 'Expense Log', 'Note', 'Profit Report'].map(shareLinkKind), ['none', 'none', 'none', 'none', 'none', 'none']);
{
    const now = Date.parse('2026-12-01T00:00:00Z');
    eq('no token -> new', needsNewApprovalToken({ public_token: null }, now), true);
    eq('no end date -> keep (old links never expire)', needsNewApprovalToken({ public_token: 't', approval_expires_at: null }, now), false);
    eq('expired unused -> new', needsNewApprovalToken({ public_token: 't', approval_expires_at: '2026-11-01T00:00:00Z' }, now), true);
    eq('expired but used (signed) -> keep (view link)', needsNewApprovalToken({ public_token: 't', approval_expires_at: '2026-11-01T00:00:00Z', approval_used_at: '2026-10-01T00:00:00Z', type: 'Estimate', status: 'Accepted', has_client_signature: true }, now), false);
    eq('used + signed -> keep', needsNewApprovalToken({ public_token: 't', approval_used_at: '2026-11-20T00:00:00Z', type: 'Estimate', status: 'Accepted', clientSignedAt: 'x', has_client_signature: true }, now), false);
    eq('used + declined -> keep', needsNewApprovalToken({ public_token: 't', approval_used_at: '2026-11-20T00:00:00Z', type: 'Change Order', status: 'Rejected', clientDeclinedAt: 'x' }, now), false);
    eq('used but open again (reopened / unlocked) -> new, never re-copied as fresh', needsNewApprovalToken({ public_token: 't', approval_used_at: '2026-11-20T00:00:00Z', type: 'Estimate', status: 'Sent', clientDeclinedAt: '' }, now), true);
    eq('invoice link is never "used up"', needsNewApprovalToken({ public_token: 't', approval_used_at: '2026-11-20T00:00:00Z', type: 'Invoice', status: 'Sent' }, now), false);
}

// ---------------------------------------------------------------- temporary clients ([TEMPORARY] in notes, like the old app)
eq('mark temporary', withTempTag('Gate code 1234', true), '[TEMPORARY] Gate code 1234');
eq('mark temporary twice = once', withTempTag(withTempTag('x', true), true), '[TEMPORARY] x');
eq('convert to regular (old: replace + trim)', withTempTag('[TEMPORARY] Walk-in', false), 'Walk-in');
eq('empty notes', [withTempTag('', true), withTempTag(null, false)], ['[TEMPORARY]', '']);
ok('old app notes are temporary', isTemporaryNotes('[TEMPORARY]') && isTemporaryNotes('Walk-in [TEMPORARY]'));
ok('regular notes', !isTemporaryNotes('temporary fence') && !isTemporaryNotes(null));
eq('stripTempTag', stripTempTag('[TEMPORARY] a'), 'a');
ok('quote request: client created in the same transaction as the job', isClientCreatedWithJob({ created_at: '2026-11-20T10:00:00.123+00:00' }, { created_at: '2026-11-20T10:00:00.123+00:00' }));
ok('quote request: matched an existing client', !isClientCreatedWithJob({ created_at: '2026-01-02T10:00:00+00:00' }, { created_at: '2026-11-20T10:00:00+00:00' }));
ok('quote request: no client', !isClientCreatedWithJob(null, { created_at: NEW }));

// ---------------------------------------------------------------- migration lint
{
    const here = dirname(fileURLToPath(import.meta.url));
    const read = (f: string) => readFileSync(join(here, '..', 'supabase', 'migrations', f), 'utf8');
    const sql = read('20261113000600_portal_approval_fixes.sql');
    const code = sql.replace(/--[^\n]*/g, '');
    const outside = code.replace(/\$\$[\s\S]*?\$\$/g, '$$$$');
    const signatures = (text: string) => {
        const out = new Map<string, string>();
        for (const m of text.replace(/--[^\n]*/g, '').matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/gi)) {
            out.set(m[1], m[2].replace(/\s+/g, ' ').trim());
        }
        return out;
    };
    const mine = signatures(sql);
    const before = new Map<string, string>([
        ...signatures(read('20261112000100_accounts_billing_limits.sql')),
        ...signatures(read('20261112000200_portal_forum_inventory.sql')),
    ]);
    const NEW_FUNCTIONS = ['_expiry_rule_start', '_signing_blocked_by_expiry', '_client_doc_state'];

    ok('migration: only functions + privileges (no table/column change, no drop)', !/\b(drop|alter|create)\s+(table|column|index|policy|trigger|view|schema)\b/i.test(outside) && !/\bdrop\s+function\b/i.test(outside));
    ok('migration: no data change (no update/insert/delete/truncate outside function bodies)', !/^\s*(update|insert|delete|truncate)\b/im.test(outside));
    eq('migration: replaced functions keep their exact signatures',
        [...mine].filter(([name]) => !NEW_FUNCTIONS.includes(name)).filter(([name, args]) => before.get(name) !== args).map(([n]) => n), []);
    eq('migration: replaces exactly these existing functions', [...mine.keys()].filter((n) => !NEW_FUNCTIONS.includes(n)).sort(),
        ['_assert_document_open', '_client_document_ids', '_client_visible_type', 'get_document_by_token', 'get_portal_data', 'guard_document_write']);
    ok('migration: new helpers did not exist before', NEW_FUNCTIONS.every((n) => mine.has(n) && !before.has(n)));
    const bodies = [...code.matchAll(/create or replace function public\.(\w+)\([^)]*\)([\s\S]*?)\$\$/gi)];
    eq('migration: every function pins search_path', bodies.filter(([, , head]) => !/set search_path = ''/.test(head)).map(([, n]) => n), []);
    const definer = bodies.filter(([, , head]) => /security definer/i.test(head)).map(([, n]) => n).sort();
    eq('migration: SECURITY DEFINER exactly where it was', definer, ['_client_document_ids', 'get_document_by_token', 'get_portal_data']);
    ok('migration: new helpers are not callable from the API', NEW_FUNCTIONS.every((n) => new RegExp(`revoke all on function public\\.${n}\\([^)]*\\)\\s+from public, anon, authenticated`, 'i').test(code)));
    eq('migration: anon grants only for the two public pages', (code.match(/grant execute on function public\.(\w+)/gi) || []).map((s) => s.split('.').pop()).sort(), ['get_document_by_token', 'get_portal_data']);
    ok('migration: drafts stay hidden in the portal', /get_portal_data[\s\S]*?coalesce\(d\.data->>'status', ''\) <> 'Draft'/.test(code));
    ok('migration: portal lists up to 1000 documents', /limit 1000/.test(code));
    ok('migration: no automatic 60-day link expiry any more', !/interval '60 days'/.test(code));
    ok('migration: Receipt is client-facing', /'Receipt'\);/.test(code));
    ok('migration: name match trimmed + case-insensitive, document OR job name', /lower\(btrim\(c\.name\)\) in \(lower\(btrim\(coalesce\(d\.data->>'clientName', ''\)\)\),\s*lower\(btrim\(coalesce\(j\.client_name, ''\)\)\)\)/.test(code));
    ok('migration: same expiry cut-off as the app', code.includes(`timestamptz '${EXPIRY_RULE_START.replace('T', ' ').replace('Z', '+00')}'`));
    const visible = /_client_visible_type[\s\S]*?select p_type in \(([^)]*)\)/.exec(code)?.[1].split(',').map((s) => s.trim().replace(/'/g, '')) || [];
    eq('migration: client-facing types = app list', visible.sort(), [...CLIENT_FACING_TYPES].sort());
    ok('migration: the browser still cannot set the link columns', /if v_browser then\s+new\.approval_expires_at := null;\s+new\.approval_used_at := null;/.test(code)
        && /new\.approval_expires_at := old\.approval_expires_at;\s+new\.approval_used_at := old\.approval_used_at;/.test(code));
    ok('migration: list stubs are still refused', /new\.data \? '__lightweight'/.test(code));
}

if (failures) {
    console.error(`\n${failures} failed, ${passes} passed`);
    process.exit(1);
}
console.log(`portal-approval-check: all ${passes} checks passed`);
