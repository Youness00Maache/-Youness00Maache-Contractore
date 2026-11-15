/**
 * Job files + client questions / submittals (roadmap D3, phase A): pure-logic checks (lib/jobFiles/jobFileLogic.ts,
 * lib/questions/questionLogic.ts) and a lint of supabase/migrations/20261116000400_job_files_questions.sql
 * (owner-only RLS, security definer + search_path '', bodies open with `as $$`, additive only, anon grants only on the
 * portal functions, no owner-only fields in the portal JSON, the portal answer writes only the client's fields).
 * No database needed:
 *   npx tsx scripts/job-files-check.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    allTags, canShareInPortal, countByCategory, filterFiles, groupVersions, guessCategory, jobFileInsertRow, jobFilePatchRow,
    jobFileStoragePath, jobLinkInsertRow, latestVersions, mapJobFileRow, mimeFor, nextVersionNumber, normalizeTags, portalFilePath,
    sanitizeFileName, shareBlockReason, sortFiles, titleFromFileName, titleFromLink, totalBytes, validateFile, validateLink,
} from '../lib/jobFiles/jobFileLogic.ts';
import { JOB_FILE_LIMITS, type JobFile } from '../lib/jobFiles/jobFileTypes.ts';
import {
    OWNER_TRANSITIONS, QUESTION_TEMPLATES, canTransition, daysOverdue, draftFromTemplate, historyLabel, isOverdue, mapQuestionRow,
    normalizeAttachments, ownerActions, questionInsertRow, questionPatchRow, sortQuestions, statusLabel, summarizeQuestions, validateDraft,
} from '../lib/questions/questionLogic.ts';
import { QUESTION_LIMITS, type JobQuestion, type QuestionStatus } from '../lib/questions/questionTypes.ts';
import { READ_ONLY_RPCS } from '../lib/offline/writePathScan.ts';
import { WRITE_PATHS } from '../lib/offline/writePathAudit.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
const throws = (label: string, fn: () => unknown) => {
    try { fn(); ok(`${label} (should throw)`, false); } catch { passes++; }
};

const U = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';

// ============================================================================================ job files: tags, names
eq('tags: trim, lower, dedupe, # stripped', normalizeTags([' Kitchen ', 'kitchen', '#Tile', '', 'A'.repeat(40)]), ['kitchen', 'tile', 'a'.repeat(30)]);
eq('tags: from a comma string', normalizeTags('plans, Rev B; final'), ['plans', 'rev b', 'final']);
eq('tags: max 12', normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, JOB_FILE_LIMITS.tags);
eq('tags: null', normalizeTags(null), []);

eq('sanitize: accents + spaces', sanitizeFileName('Plans Révision 2.PDF'), { base: 'Plans-Revision-2', ext: 'pdf' });
eq('sanitize: path + weird chars', sanitizeFileName('C:\\x\\..\\my file (1).jpeg'), { base: 'my-file-1', ext: 'jpeg' });
eq('sanitize: empty base', sanitizeFileName('.pdf').base.length > 0, true);
eq('sanitize: long base cut to 80', sanitizeFileName(`${'a'.repeat(200)}.png`).base.length, 80);

eq('mime: browser type', mimeFor('x.bin', 'application/pdf'), 'application/pdf');
eq('mime: from extension', mimeFor('photo.JPG', ''), 'image/jpeg');
eq('mime: image/jpg alias', mimeFor('a', 'image/jpg'), 'image/jpeg');
eq('mime: unsupported', mimeFor('model.dwg', 'application/octet-stream'), null);

eq('validate: ok pdf', validateFile({ name: 'a.pdf', size: 1000, type: 'application/pdf' }), null);
ok('validate: empty', validateFile({ name: 'a.pdf', size: 0, type: 'application/pdf' }) !== null);
ok('validate: dwg refused (use a link)', /link/i.test(validateFile({ name: 'a.dwg', size: 10, type: '' }) || ''));
ok('validate: too big', validateFile({ name: 'a.pdf', size: JOB_FILE_LIMITS.maxFileBytes + 1, type: 'application/pdf' }) !== null);
eq('validate: exactly the limit', validateFile({ name: 'a.pdf', size: JOB_FILE_LIMITS.maxFileBytes, type: 'application/pdf' }), null);

eq('link: https ok', validateLink('https://drive.google.com/drive/folders/abc').ok, true);
eq('link: bare host gets https', validateLink('my.matterport.com/show/?m=x').url, 'https://my.matterport.com/show/?m=x');
eq('link: javascript refused', validateLink('javascript:alert(1)').ok, false);
eq('link: ftp refused', validateLink('ftp://x.com/a').ok, false);
eq('link: data refused', validateLink('data:text/html,hi').ok, false);
eq('link: spaces refused', validateLink('https://x.com/a b').ok, false);
eq('link: empty refused', validateLink('  ').ok, false);
eq('link: too long refused', validateLink(`https://x.com/${'a'.repeat(2000)}`).ok, false);
eq('link: no dot host refused', validateLink('https://intranet/x').ok, false);
eq('link title', titleFromLink('https://www.matterport.com/show'), 'matterport.com/show');
eq('file title', titleFromFileName('kitchen_plans_v2.pdf'), 'kitchen plans v2');

// storage path matches the SQL check
const STORAGE_RE = /^[0-9a-f-]{36}\/job-files\/[0-9a-f-]{36}\/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(pdf|jpg|jpeg|png|webp|gif)$/;
const p1 = jobFileStoragePath(U, J, 'Floor Plan (rev 2).pdf', 'application/pdf', 'abc123xyz789');
eq('storage path', p1, `${U}/job-files/${J}/abc123xyz789-Floor-Plan-rev-2.pdf`);
ok('storage path matches SQL', STORAGE_RE.test(p1));
ok('storage path: random default matches SQL', STORAGE_RE.test(jobFileStoragePath(U, J, 'x.png')));
eq('storage path: ext follows the type', jobFileStoragePath(U, J, 'scan', 'image/png', 'rrrrrrrr').endsWith('.png'), true);
eq('storage path: jpeg kept', jobFileStoragePath(U, J, 'a.jpeg', 'image/jpeg', 'rrrrrrrr').endsWith('.jpeg'), true);
eq('storage path: wrong ext replaced', jobFileStoragePath(U, J, 'a.png', 'application/pdf', 'rrrrrrrr').endsWith('-a.pdf'), true);
ok('storage path: short random padded', STORAGE_RE.test(jobFileStoragePath(U, J, 'a.pdf', 'application/pdf', 'x')));
const PORTAL_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$/;
ok('portal path matches SQL', PORTAL_RE.test(portalFilePath(U, 'abc123def456', 'image/jpeg')));
eq('portal path ext', portalFilePath(U, 'abcdefgh', 'image/webp').endsWith('.webp'), true);

eq('guess: plans', guessCategory('A101 floor plan.pdf'), 'plans');
eq('guess: permit', guessCategory('building-permit.pdf'), 'permits');
eq('guess: receipt', guessCategory('HomeDepot receipt.jpg', 'image/jpeg'), 'receipts');
eq('guess: spec', guessCategory('faucet datasheet.pdf'), 'specs');
eq('guess: image -> visuals', guessCategory('IMG_0001.jpg', 'image/jpeg'), 'visuals');
eq('guess: other', guessCategory('notes.pdf', 'application/pdf'), 'other');

// ============================================================================================ job files: rows, versions
const row = (o: Partial<Record<string, unknown>>): Record<string, unknown> => ({
    id: 'f1', user_id: U, job_id: J, kind: 'file', category: 'plans', title: 'Plans', notes: null, tags: ['kitchen'],
    storage_path: `${U}/job-files/${J}/aaaaaaaa-plans.pdf`, file_name: 'plans.pdf', mime: 'application/pdf', size_bytes: 1000,
    url: null, version: 1, version_group: 'g1', shared_in_portal: false, portal_path: null,
    created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...o,
});
const files: JobFile[] = [
    row({}),
    row({ id: 'f2', version: 2, created_at: '2026-11-05T10:00:00Z', storage_path: 'x2', size_bytes: 2000 }),
    row({ id: 'f3', version: 3, created_at: '2026-11-07T10:00:00Z', storage_path: 'x3', size_bytes: 3000, tags: ['kitchen', 'final'] }),
    row({ id: 'l1', kind: 'link', category: 'visuals', title: '3D walkthrough', url: 'https://matterport.com/x', storage_path: null, mime: null, size_bytes: null, version_group: 'g2', created_at: '2026-11-06T10:00:00Z', shared_in_portal: true, tags: ['client'] }),
    row({ id: 'p1', category: 'permits', title: 'Permit', version_group: 'g3', storage_path: 'x4', created_at: '2026-10-01T10:00:00Z', mime: 'image/jpeg', tags: [] }),
].map(mapJobFileRow);

eq('map: kind link', files[3].kind, 'link');
eq('map: bad category -> other', mapJobFileRow(row({ category: 'nope' })).category, 'other');
eq('map: bad mime -> null', mapJobFileRow(row({ mime: 'text/html' })).mime, null);
const groups = groupVersions(files);
eq('groups: count', groups.length, 3);
eq('groups: newest activity first', groups.map(g => g.versionGroup), ['g1', 'g2', 'g3']);
eq('groups: latest = highest version', groups[0].latest.id, 'f3');
eq('groups: versions newest first', groups[0].versions.map(v => v.version), [3, 2, 1]);
eq('latest versions', latestVersions(files).map(f => f.id), ['f3', 'l1', 'p1']);
eq('next version number', nextVersionNumber(files, 'g1'), 4);
eq('next version number (new group)', nextVersionNumber(files, 'zz'), 1);

eq('filter: category', filterFiles(files, { category: 'permits' }).map(f => f.id), ['p1']);
eq('filter: tag', filterFiles(files, { tag: '#Final' }).map(f => f.id), ['f3']);
eq('filter: search url', filterFiles(files, { search: 'MATTERPORT' }).map(f => f.id), ['l1']);
eq('filter: kind link', filterFiles(files, { kind: 'link' }).map(f => f.id), ['l1']);
eq('filter: shared only', filterFiles(files, { sharedOnly: true }).map(f => f.id), ['l1']);
eq('filter: all', filterFiles(files, { category: 'all', kind: 'all' }).length, 5);
eq('sort: newest', sortFiles(files).map(f => f.id), ['f3', 'l1', 'f2', 'f1', 'p1']);
eq('sort: oldest', sortFiles(files, 'oldest')[0].id, 'p1');
eq('sort: category', sortFiles(latestVersions(files), 'category').map(f => f.category), ['plans', 'permits', 'visuals']);
eq('all tags (most used first)', allTags(files), ['kitchen', 'client', 'final']);
eq('count by category (latest only)', countByCategory(files), { plans: 1, permits: 1, contracts: 0, specs: 0, receipts: 0, visuals: 1, other: 0 });
eq('total bytes', totalBytes(files), 1000 + 2000 + 3000 + 1000);

ok('share: link', canShareInPortal(files[3]));
ok('share: jpeg', canShareInPortal(files[4]));
ok('share: pdf blocked', !canShareInPortal(files[0]));
ok('share: pdf reason mentions link', /link/i.test(shareBlockReason(files[0]) || ''));
ok('share: big image blocked', !canShareInPortal({ kind: 'file', mime: 'image/png', sizeBytes: JOB_FILE_LIMITS.maxPortalImageBytes + 1 }));

const ins = jobFileInsertRow({ userId: U, jobId: J, storagePath: p1, fileName: 'C:\\docs\\Floor Plan.pdf', mime: 'application/pdf', sizeBytes: 5, tags: ['A', 'a'], versionGroup: 'g1' });
eq('insert row: file', [ins.kind, ins.category, ins.title, ins.file_name, ins.tags, ins.version_group], ['file', 'plans', 'Floor Plan', 'Floor Plan.pdf', ['a'], 'g1']);
ok('insert row: no owner-managed fields', !('version' in ins) && !('shared_in_portal' in ins) && !('portal_path' in ins));
const link = jobLinkInsertRow({ userId: U, jobId: J, url: 'https://drive.google.com/x', shared: true });
eq('insert row: link', [link.kind, link.title, link.shared_in_portal, 'storage_path' in link], ['link', 'drive.google.com/x', true, false]);
eq('patch row', jobFilePatchRow({ title: '  New ', tags: 'x, y', notes: '' } as any), { title: 'New', notes: null, tags: ['x', 'y'] });
throws('patch row: empty title', () => jobFilePatchRow({ title: '   ' }));
throws('patch row: bad url', () => jobFilePatchRow({ url: 'javascript:x' }));

// ============================================================================================ questions
const ALL: QuestionStatus[] = ['draft', 'sent', 'answered', 'approved', 'rejected', 'closed'];
ok('transition draft -> sent', canTransition('draft', 'sent'));
ok('transition sent -> answered refused (client only)', !canTransition('sent', 'answered'));
ok('transition sent -> approved refused (client only)', !canTransition('sent', 'approved'));
ok('transition answered -> sent (ask again)', canTransition('answered', 'sent'));
ok('transition sent -> draft refused', !canTransition('sent', 'draft'));
ok('transition closed -> draft (never sent)', canTransition('closed', 'draft'));
ok('transition closed -> draft refused once sent', !canTransition('closed', 'draft', { everSent: true }));
ok('no owner transition to a client status', ALL.every(s => !OWNER_TRANSITIONS[s].some(t => ['answered', 'approved', 'rejected'].includes(t))));
eq('actions: draft', ownerActions({ status: 'draft', sentAt: null }), ['send', 'edit', 'delete']);
eq('actions: approved', ownerActions({ status: 'approved', sentAt: 'x' }), ['close', 'ask_again', 'delete']);

ok('overdue: sent past due', isOverdue({ status: 'sent', dueDate: '2026-11-10' }, '2026-11-15'));
ok('overdue: due today is not', !isOverdue({ status: 'sent', dueDate: '2026-11-15' }, '2026-11-15'));
ok('overdue: answered is not', !isOverdue({ status: 'answered', dueDate: '2026-11-01' }, '2026-11-15'));
eq('days overdue', daysOverdue({ status: 'sent', dueDate: '2026-11-10' }, '2026-11-15'), 5);
eq('summary', summarizeQuestions([
    { status: 'draft', dueDate: null }, { status: 'sent', dueDate: '2026-11-01' }, { status: 'sent', dueDate: null },
    { status: 'answered', dueDate: null }, { status: 'approved', dueDate: null }, { status: 'rejected', dueDate: null }, { status: 'closed', dueDate: null },
], '2026-11-15'), { total: 7, draft: 1, waiting: 2, overdue: 1, answered: 1, approved: 1, rejected: 1, closed: 1 });

eq('labels', [statusLabel('sent', 'submittal'), statusLabel('sent'), statusLabel('rejected')], ['Waiting for approval', 'Waiting for answer', 'Rejected']);
eq('history label', historyLabel({ at: '', by: 'client', action: 'approved', note: null }), 'Client approved');

eq('templates: 4 starters', QUESTION_TEMPLATES.map(t => t.label), ['Which tile?', 'Paint colour', 'Approve the change order', 'Submittal: product data sheet']);
ok('templates: all valid', QUESTION_TEMPLATES.every(t => validateDraft(t.draft) === null));
eq('template: submittal kind', draftFromTemplate('product-data').kind, 'submittal');
eq('template: override title', draftFromTemplate('tile', { title: 'Shower tile' }).title, 'Shower tile');
eq('template: unknown -> empty question', draftFromTemplate('nope'), { kind: 'question', title: '', body: null, dueDate: null, attachments: [] });
ok('template: copies attachments array', draftFromTemplate('tile').attachments !== QUESTION_TEMPLATES[0].draft.attachments);

const F = '33333333-3333-4333-8333-333333333333';
eq('attachments: normalize', normalizeAttachments([
    { fileId: F, title: ' Spec ' }, { fileId: F, title: 'dup' }, { fileId: 'not-a-uuid', title: 'x' }, { url: 'example.com/sheet.pdf', title: '' },
]), [{ fileId: F, title: 'Spec' }, { url: 'https://example.com/sheet.pdf', title: 'https://example.com/sheet.pdf' }]);
throws('attachments: bad link', () => normalizeAttachments([{ url: 'javascript:alert(1)', title: 'x' }]));
throws('attachments: more than 10', () => normalizeAttachments(Array.from({ length: 11 }, (_, i) => ({ url: `https://x.com/${i}`, title: 't' }))));
ok('validate: empty title', validateDraft({ kind: 'question', title: ' ' }) !== null);
ok('validate: bad date', validateDraft({ kind: 'question', title: 'x', dueDate: '15/11/2026' }) !== null);

const qIns = questionInsertRow({ kind: 'submittal', title: ' Tile ', body: ' b ', dueDate: '2026-12-01', attachments: [{ fileId: F, title: 'Spec' }] }, U, J, true);
eq('question insert row', qIns, { user_id: U, job_id: J, kind: 'submittal', title: 'Tile', body: 'b', due_date: '2026-12-01', attachments: [{ file_id: F, title: 'Spec' }], status: 'sent' });
ok('question insert: no client fields', !['answer', 'answered_by', 'answered_at', 'decision', 'history', 'shared_in_portal'].some(k => k in qIns));
eq('question insert: draft by default', questionInsertRow({ kind: 'question', title: 'x' }, U, J).status, 'draft');
eq('question patch', questionPatchRow({ body: '', dueDate: null }), { body: null, due_date: null });
throws('question patch: bad date', () => questionPatchRow({ dueDate: 'tomorrow' }));
ok('question patch: no status / client fields', Object.keys(questionPatchRow({ title: 'a', kind: 'question', body: 'b', dueDate: '2026-01-01', attachments: [] }))
    .every(k => ['title', 'kind', 'body', 'due_date', 'attachments'].includes(k)));

const qRow = mapQuestionRow({
    id: 'q1', user_id: U, job_id: J, kind: 'submittal', title: 'T', body: null, due_date: '2026-12-01', status: 'rejected',
    attachments: [{ file_id: F, title: 'Spec' }, { url: 'https://x.com', title: 'X' }, 'junk'],
    answer: 'Too dark', answered_by: 'Ann', answered_at: '2026-11-10T10:00:00Z', decision: 'rejected',
    history: [{ at: '2026-11-01', by: 'owner', action: 'sent', note: null }, { at: '2026-11-10', by: 'client', action: 'rejected', note: 'Too dark' }, null],
    shared_in_portal: true, sent_at: '2026-11-01', closed_at: null, created_at: '2026-11-01', updated_at: '2026-11-10',
});
eq('map question: attachments', qRow.attachments, [{ fileId: F, title: 'Spec' }, { url: 'https://x.com', title: 'X' }]);
eq('map question: history', qRow.history.map(h => `${h.by}:${h.action}`), ['owner:sent', 'client:rejected']);
eq('map question: decision', qRow.decision, 'rejected');
eq('map question: bad status -> draft', mapQuestionRow({ id: 'x', status: 'weird' }).status, 'draft');
const mk = (id: string, status: QuestionStatus, dueDate: string | null, createdAt: string) => ({ id, status, dueDate, createdAt }) as Pick<JobQuestion, 'status' | 'dueDate' | 'createdAt'> & { id: string };
eq('sort questions', sortQuestions([
    mk('closed', 'closed', null, '3'), mk('draft', 'draft', null, '2'), mk('late', 'sent', '2026-11-01', '1'),
    mk('soon', 'sent', '2026-11-20', '5'), mk('nodue', 'sent', null, '6'), mk('ans', 'answered', null, '4'),
]).map(q => q.id), ['late', 'soon', 'nodue', 'draft', 'ans', 'closed']);
eq('limits mirror SQL', [QUESTION_LIMITS.attachments, QUESTION_LIMITS.history, QUESTION_LIMITS.perJob, JOB_FILE_LIMITS.perJob], [10, 200, 500, 500]);

// ============================================================================================ offline audit
ok('portal reads are read-only RPCs', READ_ONLY_RPCS.has('get_portal_questions') && READ_ONLY_RPCS.has('get_portal_job_files'));
ok('portal answer is NOT read-only', !READ_ONLY_RPCS.has('answer_portal_question'));
ok('portal answer audited as public', WRITE_PATHS.some(r => r.file === 'lib/portal/questionsApi.ts' && r.match.includes('answer_portal_question') && r.offline === 'public'));
ok('contractor writes need a connection', WRITE_PATHS.filter(r => /lib\/(jobFiles|questions)\//.test(r.file)).every(r => r.offline === 'needs_connection'));

// ============================================================================================ SQL lint
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261116000400_job_files_questions.sql'), 'utf8').replace(/\r\n/g, '\n');
const code = SQL.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const lower = code.toLowerCase();

ok('header: not applied yet', /^-- Applied: NOT YET \(needs owner OK\)/.test(SQL));
ok('no Kelviq / merchant of record', !/kelviq|merchant of record/i.test(SQL));

// additive only
for (const re of [/\bdrop\s+table\b/, /\bdrop\s+column\b/, /\btruncate\s+(table\s+)?public\./, /\bdelete\s+from\b/, /\balter\s+table\s+public\.(?!job_files\b|job_questions\b)/,
    /\bdrop\s+function\b/, /\bdrop\s+schema\b/, /\bupdate\s+storage\./, /\binsert\s+into\s+storage\./, /\bcreate\s+policy\b[^;]*\bon\s+storage\.objects/, /\balter\s+type\b/]) {
    ok(`no destructive / out-of-scope statement ${re}`, !re.test(lower));
}
ok('tables: create if not exists', /create table if not exists public\.job_files\b/.test(lower) && /create table if not exists public\.job_questions\b/.test(lower));
eq('tables: only the two approved', [...lower.matchAll(/create table if not exists (public\.[a-z_]+)/g)].map(m => m[1]), ['public.job_files', 'public.job_questions']);
const policies = [...lower.matchAll(/create policy (\w+) on (public\.\w+)/g)].map(m => m[1]);
ok('every policy dropped first', policies.every(p => lower.includes(`drop policy if exists ${p} on`)));
const triggers = [...lower.matchAll(/create trigger (\w+)/g)].map(m => m[1]);
ok('every trigger dropped first', triggers.length >= 5 && triggers.every(t => lower.includes(`drop trigger if exists ${t} on`)));

// RLS owner-only on both tables
for (const t of ['job_files', 'job_questions']) {
    ok(`${t}: RLS enabled`, lower.includes(`alter table public.${t} enable row level security`));
    for (const op of ['select', 'insert', 'update', 'delete']) {
        const m = new RegExp(`create policy ${t}_${op}_own on public\\.${t} for ${op} to authenticated\\s+([^;]*);`).exec(lower);
        ok(`${t}: ${op} policy exists`, !!m);
        const body = m?.[1] || '';
        ok(`${t}: ${op} policy owner-only`, body.replace(/\s+/g, ' ').split(/using|with check/).slice(1)
            .every(part => part.trim().replace(/[()]/g, '').trim().startsWith('user_id = select auth.uid')));
    }
    eq(`${t}: exactly 4 policies`, policies.filter(p => p.startsWith(`${t}_`)).length, 4);
}
ok('tables: anon has nothing', /revoke all on public\.job_files, public\.job_questions from anon/.test(lower));
ok('no grant on the tables to anon', !/grant [^;]* on public\.job_(files|questions)[^;]* to [^;]*\banon\b/.test(lower));

// functions
const fnRe = /create or replace function (public\.\w+)\(([^)]*)\)([\s\S]*?)\n\$\$;/g;
const fns = [...code.matchAll(fnRe)].map(m => ({ name: m[1], args: m[2], text: m[0] }));
eq('functions', fns.map(f => f.name).sort(), [
    'public._portal_question_json', 'public.answer_portal_question', 'public.enqueue_job_file_cleanup', 'public.get_portal_job_files',
    'public.get_portal_questions', 'public.guard_job_file', 'public.guard_job_question', 'public.guard_job_question_flow',
].sort());
const INVOKER_OK = new Set(['public.guard_job_question_flow']);
for (const f of fns) {
    const head = f.text.slice(0, f.text.indexOf('$$'));
    ok(`${f.name}: set search_path = ''`, /set search_path = ''/.test(head));
    ok(`${f.name}: body opens with "as $$"`, /\nas \$\$\n/.test(f.text));
    if (INVOKER_OK.has(f.name)) {
        // documented exception (like guard_punch_item): invoker so current_user tells the browser from the portal function
        ok(`${f.name}: invoker on purpose`, !/security definer/.test(head) && /current_user in \('authenticated', 'anon'\)/.test(f.text));
        ok(`${f.name}: reads no table`, !/\bfrom public\./.test(f.text.toLowerCase()));
    } else {
        ok(`${f.name}: security definer`, /security definer/.test(head));
    }
    ok(`${f.name}: schema-qualified tables`, ![...f.text.matchAll(/\b(from|join|update|into)\s+(?!public\.|auth\.|jsonb_|unnest|v_|new\.|old\.|x\b|p\b|\()(\w+)/gi)]
        .some(m => /^(job_files|job_questions|jobs|clients|storage_cleanup_queue|profiles)$/.test(m[2])));
    ok(`${f.name}: revoked from public / anon / authenticated`, new RegExp(`revoke all on function ${f.name.replace('.', '\\.')}\\([^)]*\\) from public, anon, authenticated`).test(lower));
}
// `as $$` everywhere (a previous file broke on a body that did not open this way)
eq('every $$ body opens with "as $$"', (code.match(/\$\$/g) || []).length, (code.match(/\nas \$\$\n/g) || []).length * 2);

const granted = [...lower.matchAll(/grant execute on function (public\.\w+)\([^)]*\)\s+to ([^;]+);/g)].map(m => ({ fn: m[1], to: m[2].trim() }));
eq('anon grants only on the portal functions', granted.filter(g => /\banon\b/.test(g.to)).map(g => g.fn).sort(),
    ['public.answer_portal_question', 'public.get_portal_job_files', 'public.get_portal_questions']);
eq('no other execute grants', granted.length, 3);

// portal functions: key check, client rule, no owner-only fields
const fnText = (n: string) => fns.find(f => f.name === n)?.text || '';
for (const n of ['public.get_portal_questions', 'public.answer_portal_question', 'public.get_portal_job_files']) {
    const t = fnText(n);
    ok(`${n}: key format checked`, t.includes("!~ '^[A-Za-z0-9_-]{32,128}$'"));
    ok(`${n}: invalid link error`, t.includes("'Invalid portal link' using errcode = '28000'"));
    ok(`${n}: client's jobs only`, t.includes('j.client_id = v_client.id') && t.includes("btrim(coalesce(v_client.name, '')) <> ''") && t.includes('user_id = v_client.user_id'));
}
ok('get_portal_questions: no drafts / closed', fnText('public.get_portal_questions').includes("q.status in ('sent', 'answered', 'approved', 'rejected')"));
ok('get_portal_questions: stable', /\nstable\n/.test(fnText('public.get_portal_questions')));
ok('get_portal_job_files: stable + shared only', /\nstable\n/.test(fnText('public.get_portal_job_files')) && fnText('public.get_portal_job_files').includes('f.shared_in_portal'));
const OWNER_ONLY = ['user_id', 'notes', 'tags', 'storage_path', 'file_name', 'size_bytes', 'version_group', 'shared_in_portal', 'portal_path', 'created_at', 'updated_at', 'closed_at', 'file_id'];
for (const n of ['public._portal_question_json', 'public.get_portal_job_files']) {
    const keys = [...fnText(n).matchAll(/'([a-z_]+)',\s*(?=[a-z_(]|\n)/g)].map(m => m[1]);
    const builtKeys = [...fnText(n).matchAll(/jsonb_build_object\(([\s\S]*?)\)(?:\s*order by|\s*\)|,\s*'\w+'\s*\)|\s*from)/g)];
    ok(`${n}: has json keys`, keys.length > 5 && builtKeys.length > 0);
    eq(`${n}: no owner-only json keys`, keys.filter(k => OWNER_ONLY.includes(k)), []);
}
// the answer function writes only the client's fields
const answer = fnText('public.answer_portal_question');
const updates = [...answer.matchAll(/update public\.(\w+)\s+set([\s\S]*?)\n\s*where/g)];
eq('answer: one update, of job_questions', updates.map(u => u[1]), ['job_questions']);
const setCols = (updates[0]?.[2] || '').split('\n').map(l => /^\s*(\w+)\s*=/.exec(l)?.[1]).filter(Boolean);
eq('answer: writes only the client fields', setCols, ['status', 'decision', 'answer', 'answered_by', 'answered_at', 'history']);
ok('answer: once per send', answer.includes("if v_q.status <> 'sent' then") && answer.includes('ALREADY_ANSWERED'));
ok('answer: texts capped', answer.includes('public._clean_multiline(p_answer, 4000)') && answer.includes('public._clean_text(p_name, 120)'));
ok('answer: locks the row', answer.includes('for update of q'));
ok('answer: no insert / delete', !/\b(insert into|delete from)\b/i.test(answer));
// the browser cannot write the client's fields
const flow = fnText('public.guard_job_question_flow');
for (const f of ['answer', 'answered_by', 'answered_at', 'decision', 'history', 'sent_at']) ok(`flow: browser keeps ${f}`, flow.includes(`new.${f} := old.${f};`));
ok('flow: browser insert clears the answer', /if v_browser then\s+if new\.status not in \('draft', 'sent'\)/.test(flow));
ok('files: Premium on insert', fnText('public.guard_job_file').includes("not in ('premium', 'ai')") && fnText('public.guard_job_question').includes("not in ('premium', 'ai')"));
ok('files: 500 per job', fnText('public.guard_job_file').includes('v_count >= 500') && fnText('public.guard_job_question').includes('v_count >= 500'));
ok('files: bucket path prefix checked', fnText('public.guard_job_file').includes("'/job-files/'"));
ok('cleanup: only the portal-photos bucket', [...code.matchAll(/insert into public\.storage_cleanup_queue[^;]*;/g)].every(m => m[0].includes("'portal-photos'")));
ok('no new bucket / storage policy', !/storage\.buckets/.test(lower) && !/on storage\.objects/.test(lower));

console.log(`job-files-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
