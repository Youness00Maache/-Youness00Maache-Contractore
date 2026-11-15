/**
 * Sent-email log (roadmap D11): checks. Static scan of the migration (one table, RLS, owner select/delete only, no
 * browser writes, definer trigger with an empty search_path, no body/token columns, nothing destructive), the gmail
 * function's logging (wrapped, best effort, no body/token fields, same response), the app callers, and the pure logic
 * (row building, error text, sentences, limits, timeline events). No database, no network:
 *   npx tsx scripts/email-log-check.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEmailLogRow, logError, logKind, logRecipients, scheduleEmailLog, writeEmailLog, EMAIL_LOG_KINDS as FN_KINDS } from '../supabase/functions/gmail/emailLog.ts';
import { EMAIL_LOG_KINDS } from '../lib/emailLog/types.ts';
import { clampLimit, emailLogDate, emailLogDetail, emailLogLinksForDocs, emailLogSentence, kindLabel, EMAIL_LOG_MAX_LIMIT } from '../lib/emailLog/format.ts';
import { emailEvents } from '../lib/timeline/sources/email.ts';
import { WRITE_PATHS } from '../lib/offline/writePathAudit.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

let passes = 0;
let failures = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else { failures++; console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);

// ============================================================================================================ migration
const sqlRaw = read('supabase/migrations/20261116001200_email_log.sql');
// statements only (comments removed) for the structural checks
const sql = sqlRaw.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
const lower = sql.toLowerCase();

ok('migration: header says applied with the owner OK', /^-- Applied 2026-11-15 with the owner's OK/.test(sqlRaw));
eq('migration: exactly one table created', (lower.match(/create table/g) || []).length, 1);
ok('migration: the table is public.email_log, idempotent', /create table if not exists public\.email_log \(/.test(lower));
ok('migration: RLS on', /alter table public\.email_log enable row level security;/.test(lower));
const policies = [...lower.matchAll(/create policy (\w+) on public\.email_log for (\w+) to (\w+)/g)].map(m => `${m[2]}:${m[3]}`);
eq('migration: owner select + delete policies only (authenticated)', policies.sort(), ['delete:authenticated', 'select:authenticated']);
ok('migration: policies are owner-only', (lower.match(/using \(user_id = \(select auth\.uid\(\)\)\)/g) || []).length === 2);
ok('migration: each policy dropped before create', /drop policy if exists email_log_select_own/.test(lower) && /drop policy if exists email_log_delete_own/.test(lower));
ok('migration: no insert / update policy', !/for (insert|update|all) to/.test(lower));
ok('migration: anon revoked', /revoke all on public\.email_log from anon;/.test(lower));
ok('migration: authenticated revoked then select + delete only', /revoke all on public\.email_log from authenticated;/.test(lower) && /grant select, delete on public\.email_log to authenticated;/.test(lower));
ok('migration: no insert/update grant to authenticated', !/grant[^;]*\b(insert|update|all)\b[^;]*to[^;]*authenticated/.test(lower));
ok('migration: service role writes', /grant all on public\.email_log to service_role;/.test(lower));
ok('migration: trigger function is security definer + empty search_path + as $$', /create or replace function public\.guard_email_log\(\)\s*returns trigger\s*language plpgsql\s*security definer\s*set search_path = ''\s*as \$\$/.test(lower));
ok('migration: trigger dropped before create', /drop trigger if exists trg_email_log_guard on public\.email_log;\s*create trigger trg_email_log_guard before insert on public\.email_log/.test(lower));
ok('migration: trigger function not callable by clients', /revoke all on function public\.guard_email_log\(\) from public, anon, authenticated;/.test(lower));
eq('migration: one function only', (lower.match(/create or replace function/g) || []).length, 1);
ok('migration: keeps the newest 5000 per user', /offset 4999/.test(lower));
ok('migration: cleans subject / to_email / error', /new\.subject := left\(/.test(lower) && /new\.to_email := left\(/.test(lower) && /new\.error := nullif\(left\(/.test(lower));
ok('migration: drops links to other owners\' rows', ['jobs', 'clients', 'documents'].every(t => new RegExp(`from public\\.${t} \\w+ where \\w+\\.id = new\\.\\w+ and \\w+\\.user_id = new\\.user_id`).test(lower)));
const tableBody = (lower.match(/create table if not exists public\.email_log \(([\s\S]*?)\n\);/) || [])[1] || '';
const columns = tableBody.split('\n').map(l => l.trim().split(/\s+/)[0]).filter(c => c && /^[a-z_]+$/.test(c) && c !== 'check');
eq('migration: columns', columns, ['id', 'user_id', 'job_id', 'client_id', 'document_id', 'kind', 'to_email', 'subject', 'status', 'error', 'gmail_message_id', 'sent_at', 'created_at']);
ok('migration: no body / html / attachment / token / cc columns', !columns.some(c => /body|html|text|attach|token|secret|cc|bcc|raw/.test(c)));
ok('migration: FKs and delete rules', /user_id\s+uuid not null default auth\.uid\(\) references auth\.users\(id\) on delete cascade/.test(tableBody)
    && /job_id\s+uuid references public\.jobs\(id\) on delete set null/.test(tableBody)
    && /client_id\s+uuid references public\.clients\(id\) on delete set null/.test(tableBody)
    && /document_id\s+uuid references public\.documents\(id\) on delete set null/.test(tableBody));
ok('migration: text limits', /length\(to_email\) between 1 and 254/.test(tableBody) && /length\(subject\) <= 300/.test(tableBody) && /length\(error\) <= 300/.test(tableBody));
ok('migration: status sent / failed', /status in \('sent', 'failed'\)/.test(tableBody));
const sqlKinds = ((tableBody.match(/kind in \(([^)]*)\)/) || [])[1] || '').split(',').map(s => s.trim().replace(/'/g, ''));
eq('migration: kinds = edge function kinds = app kinds', [sqlKinds, [...FN_KINDS]], [[...EMAIL_LOG_KINDS], [...EMAIL_LOG_KINDS]]);
ok('migration: indexes', /on public\.email_log \(user_id, job_id, sent_at desc\)/.test(lower) && /on public\.email_log \(user_id, client_id, sent_at desc\)/.test(lower) && /on public\.email_log \(document_id\)/.test(lower));
ok('migration: nothing destructive', !/\bdrop (table|column|schema|function)\b|\btruncate\b|alter table [^;]* drop|\bdelete from public\.(?!email_log)/.test(lower)
    && !/alter table (?!public\.email_log enable row level security)/.test(lower));
ok('migration: touches no other table', [...lower.matchAll(/\b(?:on|table|into|update) public\.(\w+)/g)].every(m => m[1] === 'email_log'));

// ======================================================================================================= edge function
const fnIndex = read('supabase/functions/gmail/index.ts');
const fnLog = read('supabase/functions/gmail/emailLog.ts');
ok('gmail: send goes through the logged wrapper', fnIndex.includes("return json(200, await actionSendLogged(admin, body, user.id), cors);"));
const wrapper = (fnIndex.match(/async function actionSendLogged[\s\S]*?\n}\n/) || [''])[0];
ok('gmail: wrapper returns actionSend\'s result unchanged and rethrows its error', /result = await actionSend\(admin, body, userId\);/.test(wrapper) && /throw e;/.test(wrapper) && /return result;/.test(wrapper));
ok('gmail: every log call in try/catch, never awaited', (wrapper.match(/try \{ scheduleEmailLog\(/g) || []).length === 2 && !/await scheduleEmailLog/.test(wrapper));
ok('gmail: actionSend response unchanged', /return \{\n\s+success: true,\n\s+id: String\(result\?\.id \?\? ''\),\n\s+thread_id: String\(result\?\.threadId \?\? ''\),\n\s+from: account\.gmail_address,\n\s+recipients: built\.recipients\.length,\n\s+\};/.test(fnIndex));
ok('gmail: auth unchanged', fnIndex.includes('const user = await authenticate(req, admin);') && fnIndex.includes("const { data, error } = await admin.auth.getUser(jwt);"));
ok('gmail: log module reads no body / html / attachments / tokens from the request', !/body\.(text|html|attachments|cc|bcc|reply_to|account_id|from_name)/.test(fnLog));
ok('gmail: log module never stores token fields', !/(access_token|refresh_token|Authorization)/.test(fnLog.replace(/^\/\/.*$/gm, '')));
ok('gmail: insert and schedule wrapped in try/catch', /try \{\n\s+const \{ error \} = await admin\.from\('email_log'\)\.insert/.test(fnLog) && /export function scheduleEmailLog[\s\S]*?try \{[\s\S]*?\} catch \{/.test(fnLog));

// ================================================================================================ pure logic: function
const U = '11111111-2222-4333-8444-555555555555';
const J = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const sentRow = buildEmailLogRow(U, {
    to: ['jane@example.com', ' bob@example.com '], subject: 'Estimate E-1042\r\nfrom Acme', text: 'SECRET BODY', html: '<p>SECRET</p>',
    attachments: [{ data_base64: 'AAAA' }], cc: 'cc@example.com', kind: 'document', job_id: J, client_id: 'not-a-uuid', document_id: J.toUpperCase(),
}, { status: 'sent', messageId: 'msg123' });
eq('row: who / what / when only', sentRow, {
    user_id: U, job_id: J, client_id: null, document_id: J, kind: 'document', to_email: 'jane@example.com, bob@example.com',
    subject: 'Estimate E-1042 from Acme', status: 'sent', error: null, gmail_message_id: 'msg123',
});
ok('row: no body / attachments / cc leak', !JSON.stringify(sentRow).includes('SECRET') && !JSON.stringify(sentRow).includes('AAAA') && !JSON.stringify(sentRow).includes('cc@'));
eq('row: no recipient = no row', buildEmailLogRow(U, { subject: 'x' }, { status: 'sent' }), null);
eq('row: bad user id = no row', buildEmailLogRow('x', { to: 'a@b.co' }, { status: 'sent' }), null);
eq('row: unknown kind = other', logKind('spam'), 'other');
eq('row: recipients from a string list', logRecipients('a@b.co; c@d.co'), 'a@b.co, c@d.co');
eq('row: recipients capped at 254', logRecipients(Array.from({ length: 40 }, (_, i) => `person${i}@example.com`)).length, 254);
eq('row: subject capped at 300', (buildEmailLogRow(U, { to: 'a@b.co', subject: 'x'.repeat(900) }, { status: 'sent' })?.subject || '').length, 300);
const httpLike = Object.assign(new Error('Please reconnect jane@gmail.com before sending.'), { status: 409, code: 'RECONNECT_REQUIRED' });
const failedRow = buildEmailLogRow(U, { to: 'a@b.co', subject: 's' }, { status: 'failed', error: httpLike });
eq('row: failed keeps a short known reason', [failedRow?.status, failedRow?.error, failedRow?.gmail_message_id], ['failed', 'RECONNECT_REQUIRED: Please reconnect jane@gmail.com before sending.', null]);
eq('row: unknown errors stay generic', logError(new Error('ya29.secretTokenValue leaked')), 'The email could not be sent.');
ok('row: token-like text hidden even in known errors', !logError(Object.assign(new Error('bad ya29.A0ARrdaM-abc_def token'), { status: 500, code: 'X' })).includes('ya29'));
ok('row: error capped at 300', logError(Object.assign(new Error('y '.repeat(400)), { status: 400, code: 'X' })).length <= 300);

// best effort: a throwing client never throws out, a missing table is quiet
let threw = false;
await writeEmailLog({ from: () => { throw new Error('boom'); } } as any, sentRow).catch(() => { threw = true; });
await writeEmailLog({ from: () => ({ insert: () => Promise.resolve({ error: { message: 'relation "public.email_log" does not exist' } }) }) } as any, sentRow).catch(() => { threw = true; });
try { scheduleEmailLog({ from: () => { throw new Error('boom'); } } as any, U, { to: 'a@b.co' }, { status: 'sent' }); } catch { threw = true; }
await new Promise(r => setTimeout(r, 5));
ok('write: never throws (client errors, missing table, schedule)', !threw);
let inserted: Record<string, unknown> | null = null;
await writeEmailLog({ from: (t: string) => ({ insert: (row: Record<string, unknown>) => { if (t === 'email_log') inserted = row; return Promise.resolve({ error: null }); } }) } as any, sentRow);
ok('write: inserts into email_log', !!inserted && (inserted as any).to_email === 'jane@example.com, bob@example.com');

// ====================================================================================================== pure logic: app
eq('format: limits', [clampLimit(undefined), clampLimit(0), clampLimit(20), clampLimit(5000)], [50, 1, 20, EMAIL_LOG_MAX_LIMIT]);
eq('format: kind labels', [kindLabel('purchase_order'), kindLabel('weird')], ['Purchase order', 'Email']);
eq('format: sentences', [
    emailLogSentence({ to_email: 'jane@x.com', status: 'sent', kind: 'document' }, 'Estimate E-1042'),
    emailLogSentence({ to_email: 'jane@x.com', status: 'sent', kind: 'export' }),
    emailLogSentence({ to_email: 'jane@x.com', status: 'sent', kind: 'other' }),
    emailLogSentence({ to_email: 'jane@x.com', status: 'failed', kind: 'document' }, 'Estimate E-1042'),
], ['Emailed estimate E-1042 to jane@x.com', 'Emailed a bookkeeper export to jane@x.com', 'Emailed jane@x.com', 'Email to jane@x.com failed']);
eq('format: detail', [emailLogDetail({ subject: 'Hi', status: 'sent', error: 'x' }), emailLogDetail({ subject: 'Hi', status: 'failed', error: 'NO_ACCOUNT: Connect Gmail' })], ['Hi', 'Hi · NO_ACCOUNT: Connect Gmail']);
eq('format: date', [emailLogDate('nope'), emailLogDate('2026-11-15T12:00:00Z', 'en-US')], ['', 'Nov 15, 2026']);
eq('format: compose links', [
    emailLogLinksForDocs([], 'c1'),
    emailLogLinksForDocs([{ id: 'd1', jobId: 'j1', type: 'Purchase Order' }, { id: 'd2', jobId: 'j2', type: 'Invoice' }], null),
    emailLogLinksForDocs([{ id: 'd3', jobId: 'j3', type: 'Estimate' }], 'c1'),
], [
    { kind: 'other', jobId: null, clientId: 'c1', documentId: null },
    { kind: 'purchase_order', jobId: 'j1', clientId: null, documentId: 'd1' },
    { kind: 'document', jobId: 'j3', clientId: 'c1', documentId: 'd3' },
]);
const ctx = { tz: 'America/New_York', now: Date.parse('2026-11-15T12:00:00Z') };
const ev = emailEvents({ rows: [{ id: 'r1', to_email: 'jane@x.com', status: 'sent', kind: 'review_request', subject: 'How did we do?', sent_at: '2026-11-14T15:00:00Z' }] }, ctx);
eq('timeline: event', ev.map(e => [e.id, e.kind, e.source, e.group, e.actor, e.title, e.detail]), [['email:r1', 'email_sent', 'email', 'client', 'you', 'Emailed a review request to jane@x.com', 'How did we do?']]);

// ========================================================================================================= app wiring
const gmailSvc = read('services/gmailService.ts');
ok('app: request fields are optional and additive', /log\?: EmailLogLinks;/.test(gmailSvc) && /kind: params\.log\?\.kind \|\| undefined,/.test(gmailSvc) && /job_id: params\.log\?\.jobId \|\| undefined,/.test(gmailSvc));
for (const f of ['components/CommunicationView.tsx', 'services/batchEmailSender.ts', 'components/feedback/JobFeedbackButton.tsx', 'components/photos/PhotoAIModal.tsx', 'components/payments/MarkPaidDialog.tsx', 'components/papers/PapersView.tsx', 'lib/export/bookkeeperApi.ts']) {
    ok(`app: ${f} passes log links`, /log: /.test(read(f)));
}
ok('app: delete registered as needs_connection', WRITE_PATHS.some(w => w.file === 'lib/emailLog/emailLogApi.ts' && w.offline === 'needs_connection' && read(w.file).includes(w.match)));
const api = read('lib/emailLog/emailLogApi.ts');
ok('app: the only app-side write is delete', !/\.(insert|update|upsert)\(/.test(api) && (api.match(/\.delete\(\)/g) || []).length === 1);
ok('app: timeline reads email only behind the feature check', /emailLogFeatureState\(\) !== 'ready'/.test(read('lib/timeline/timelineApi.ts')));
ok('app: client list hidden until ready', /if \(feature !== 'ready'\) return null;/.test(read('components/emailLog/ClientEmailLog.tsx')));
ok('help: sent-email log guide', /id: 'sent-email-log'/.test(read('components/help/helpContent.ts')));

console.log(`email-log-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
