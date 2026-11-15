/**
 * Client feedback / reviews + richer public profile (roadmap D8, phase A): pure-logic checks (lib/feedback/*,
 * lib/profile/profileLogic.ts) and a lint of supabase/migrations/20261116001000_feedback_profile.sql (additive only,
 * owner-only RLS, definer + search_path '', bodies open with `as $$`, anon grants only on the public functions, the
 * public JSON never carries owner-only / client-contact fields, the submit writes only the client's fields).
 * No database needed:
 *   npx tsx scripts/feedback-check.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    approvedTestimonials, averageRating, canBeTestimonial, clampRating, displayNameFromClientName, feedbackInsertRow, feedbackPatchRow,
    isExcerptOf, mapFeedbackRow, openRequestForJob, parseFeedbackSubmitResult, parsePublicFeedbackRequest, parseTestimonial, ratingSummary,
    reviewNudgeUrl, shouldNudgeReview, starsText, testimonialFromResponse, testimonialNameError, testimonialTextError, validateFeedbackInput,
} from '../lib/feedback/feedbackLogic.ts';
import { FEEDBACK_LIMITS, type FeedbackResponse } from '../lib/feedback/feedbackTypes.ts';
import { FEEDBACK_PATH_PREFIX, feedbackRequestUrl, feedbackTokenFromPath, isFeedbackToken } from '../lib/feedback/feedbackPath.ts';
import {
    EMPTY_PROFILE_EXTRAS, addGalleryItem, canAddToGallery, galleryCopyPath, galleryRpcPayload, hasProfileContent, isGalleryPath,
    moveGalleryItem, normalizeServices, parseMyRequestProfile, parsePublicProfileExtras, profileRpcArgs, removeGalleryItem,
    setGalleryCaption, validateProfilePatch,
} from '../lib/profile/profileLogic.ts';
import { PROFILE_LIMITS, type GalleryItem } from '../lib/profile/profileTypes.ts';
import { READ_ONLY_RPCS } from '../lib/offline/writePathScan.ts';
import { WRITE_PATHS } from '../lib/offline/writePathAudit.ts';
import { requestSlugFromPath } from '../components/requests/requestLogic.ts';
import { crewTokenFromPath } from '../lib/crew/crewPath.ts';

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

const U = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'aB3_-'.repeat(8) + 'xyz'; // 43 chars

// ============================================================================================ link path
eq('path: token', feedbackTokenFromPath(`/feedback/${TOKEN}`), TOKEN);
eq('path: trailing slash', feedbackTokenFromPath(`/feedback/${TOKEN}/`), TOKEN);
eq('path: malformed', feedbackTokenFromPath('/feedback/short'), '');
eq('path: extra segment', feedbackTokenFromPath(`/feedback/${TOKEN}/x`), '');
eq('path: not a feedback path', feedbackTokenFromPath('/r/acme-roof-7k2mq'), null);
eq('path: request page still parsed', requestSlugFromPath('/r/acme-roof-7k2mq'), 'acme-roof-7k2mq');
eq('path: crew link not taken', crewTokenFromPath(`/feedback/${TOKEN}`), null);
eq('url', feedbackRequestUrl('https://www.contractordocs.app/', TOKEN), `https://www.contractordocs.app${FEEDBACK_PATH_PREFIX}${TOKEN}`);
ok('token: 43 url-safe', isFeedbackToken(TOKEN) && !isFeedbackToken('a'.repeat(31)) && !isFeedbackToken(`${'a'.repeat(40)}+/=`));

// ============================================================================================ stars, nudge, average
eq('clamp', [clampRating(0), clampRating(1), clampRating(4.4), clampRating('5'), clampRating(6), clampRating(null), clampRating('x')], [null, 1, 4, 5, null, null, null]);
eq('nudge rule', [1, 2, 3, 4, 5].map(shouldNudgeReview), [false, false, false, true, true]);
eq('nudge url: 4+ and https only', [reviewNudgeUrl(5, 'https://g.page/r/x/review'), reviewNudgeUrl(3, 'https://g.page/r/x/review'), reviewNudgeUrl(5, 'http://g.page'), reviewNudgeUrl(4, 'javascript:alert(1)'), reviewNudgeUrl(4, null)],
    ['https://g.page/r/x/review', null, null, null, null]);
eq('average', [averageRating([5, 4, 4]), averageRating([]), averageRating([5, null, 3]), averageRating([4, 5])], [4.3, null, 4, 4.5]);
eq('summary', ratingSummary([5, 5, 4, 1, null, 9]), { average: 3.8, count: 4, byStar: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 } });
eq('stars text', [starsText(4), starsText(null)], ['★★★★☆', '☆☆☆☆☆']);

// ============================================================================================ validation
const v1 = validateFeedbackInput({ rating: 5, comment: '  Great job!\r\n\r\n\r\n\r\nThanks ', name: ' Jane  Smith ' });
eq('validate ok', [v1.ok, v1.value], [true, { rating: 5, comment: 'Great job!\n\nThanks', name: 'Jane  Smith' }]);
eq('validate rating', [validateFeedbackInput({ rating: 0 }).ok, validateFeedbackInput({ rating: 3.5 }).ok, validateFeedbackInput({ rating: 3 }).ok], [false, false, true]);
eq('validate long comment', validateFeedbackInput({ rating: 4, comment: 'x'.repeat(FEEDBACK_LIMITS.comment + 1) }).ok, false);
eq('validate long name', validateFeedbackInput({ rating: 4, name: 'x'.repeat(FEEDBACK_LIMITS.clientName + 1) }).ok, false);

// ============================================================================================ display names, testimonials
eq('display name', [displayNameFromClientName('Jane Smith'), displayNameFromClientName('jane'), displayNameFromClientName('Jean-Luc  van der berg'),
    displayNameFromClientName('jane@x.com'), displayNameFromClientName('555 1234'), displayNameFromClientName(''), displayNameFromClientName('Ana 555-1234 Lopez')],
['Jane S.', 'jane', 'Jean-Luc B.', null, null, null, 'Ana L.']);
eq('testimonial name rules', [testimonialNameError('Jane S.'), !!testimonialNameError('jane@x.com'), !!testimonialNameError('Call 555 12345'), !!testimonialNameError('x'.repeat(61)), testimonialNameError('')],
    [null, true, true, true, null]);
ok('excerpt: part of the comment (spaces / case ignored)', isExcerptOf('great  JOB', 'They did a great job\non time') && isExcerptOf('', 'x') && !isExcerptOf('best ever', 'great job'));
eq('testimonial text rules', [testimonialTextError('on time', 'Great job, on time.'), !!testimonialTextError('made up', 'Great job')], [null, true]);

const row = (over: Record<string, unknown>) => mapFeedbackRow({
    id: 'f1', job_id: J, client_id: null, job_name: 'Kitchen', client_first_name: 'Jane', token: TOKEN, status: 'submitted',
    requested_at: '2026-11-01T10:00:00Z', submitted_at: '2026-11-03T10:00:00Z', rating: 5, comment: 'Great job, on time.', client_name: 'Jane Smith',
    testimonial: true, testimonial_name: null, testimonial_text: null, owner_note: 'private', hidden: false, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
    ...over,
});
const rows: FeedbackResponse[] = [
    row({ id: 'a' }),
    row({ id: 'b', submitted_at: '2026-11-05T10:00:00Z', rating: 4, testimonial_name: 'The Lees', testimonial_text: 'on time' }),
    row({ id: 'c', hidden: true }),
    row({ id: 'd', testimonial: false }),
    row({ id: 'e', status: 'requested', rating: null, submitted_at: null, testimonial: false }),
];
eq('map row', [rows[0].status, rows[0].rating, rows[4].status, rows[4].rating], ['submitted', 5, 'requested', null]);
eq('testimonial model', testimonialFromResponse(rows[0]), { rating: 5, name: 'Jane S.', text: 'Great job, on time.', date: '2026-11-03' });
eq('testimonial: owner name + trimmed quote', testimonialFromResponse(rows[1]), { rating: 4, name: 'The Lees', text: 'on time', date: '2026-11-05' });
eq('testimonial: hidden / not approved / not answered -> none', [testimonialFromResponse(rows[2]), testimonialFromResponse(rows[3]), testimonialFromResponse(rows[4])], [null, null, null]);
eq('approved only, newest first', approvedTestimonials(rows).map(t => t.name), ['The Lees', 'Jane S.']);
ok('testimonial model never carries private fields', approvedTestimonials(rows).every(t => Object.keys(t).sort().join() === 'date,name,rating,text'));
eq('average of approved only', averageRating(approvedTestimonials(rows).map(t => t.rating)), 4.5);
eq('can be testimonial', [canBeTestimonial(rows[0]), canBeTestimonial(rows[4])], [true, false]);
eq('open request reused', openRequestForJob(rows, J)?.id, 'e');

// ============================================================================================ rows sent by the owner
eq('insert row: job request', feedbackInsertRow({ jobId: J, jobName: 'ignored' }, U), { user_id: U, job_id: J, client_id: null, job_name: null });
eq('insert row: no job', feedbackInsertRow({ jobName: '  Deck repair ' }, U), { user_id: U, job_id: null, client_id: null, job_name: 'Deck repair' });
eq('patch row: only owner columns', Object.keys(feedbackPatchRow({ testimonial: true, testimonialName: ' Jane S. ', testimonialText: '', ownerNote: 'n', hidden: false, ...({ rating: 5, comment: 'x', status: 'submitted' } as object) })).sort(),
    ['hidden', 'owner_note', 'testimonial', 'testimonial_name', 'testimonial_text']);
eq('patch row: cleaned', feedbackPatchRow({ testimonialName: ' Jane S. ', testimonialText: '' }), { testimonial_name: 'Jane S.', testimonial_text: null });

// ============================================================================================ public parsers
eq('public request parse', parsePublicFeedbackRequest({ status: 'requested', submitted: false, rating: 5, job_name: 'Kitchen', client_first_name: 'Jane', contractor: { name: 'Sam', company_name: 'Acme', logo_url: 'u', email: 'x@y', phone: '1' } }),
    { status: 'requested', submitted: false, rating: null, submittedAt: null, jobName: 'Kitchen', clientFirstName: 'Jane', contractor: { name: 'Sam', companyName: 'Acme', logoUrl: 'u' } });
eq('submit result: review link only 4+', [parseFeedbackSubmitResult({ ok: true, rating: 5, review_url: 'https://g.page/r' }), parseFeedbackSubmitResult({ ok: true, rating: 2, review_url: 'https://g.page/r' }), parseFeedbackSubmitResult({ ok: false })],
    [{ ok: true, rating: 5, reviewUrl: 'https://g.page/r' }, { ok: true, rating: 2, reviewUrl: null }, null]);
eq('testimonial parse', [parseTestimonial({ rating: 4, name: '', text: 'ok', date: '2026-11-03' }), parseTestimonial({ rating: 0 })], [{ rating: 4, name: 'A client', text: 'ok', date: '2026-11-03' }, null]);

// ============================================================================================ profile
eq('services: string', normalizeServices('Roofing, gutters; roofing\n Siding '), ['Roofing', 'gutters', 'Siding']);
eq('services: max 20 of 60', [normalizeServices(Array.from({ length: 30 }, (_, i) => `s${i}`)).length, normalizeServices(['x'.repeat(80)])[0].length], [PROFILE_LIMITS.services, PROFILE_LIMITS.serviceLength]);
eq('profile validate', [validateProfilePatch({ about: 'Hi' }).ok, validateProfilePatch({ about: 'x'.repeat(1501) }).ok, validateProfilePatch({ yearsLine: 'x'.repeat(81) }).ok,
    validateProfilePatch({ services: ['x'.repeat(61)] }).ok, validateProfilePatch({ services: Array.from({ length: 25 }, (_, i) => `s${i}`) }).ok], [true, false, false, false, false]);
eq('rpc args: keep / remove / set', profileRpcArgs({ about: '', services: [], serviceArea: ' Austin ' }),
    { p_about: '', p_services: [], p_service_area: 'Austin', p_license_line: null, p_years_line: null });
const P1 = `${U}/abcdef123.jpg`;
const P2 = `${U}/zzzzzz999.png`;
ok('gallery path rules', isGalleryPath(U, P1) && !isGalleryPath(J, P1) && !isGalleryPath(U, `${U}/${J}/x123456.jpg`) && !isGalleryPath(U, `${U}/abc.gif`));
eq('gallery copy path', [galleryCopyPath(U, 'r-a-n-d-o-m', `${U}/${J}/p.png`), galleryCopyPath(U, 'ab/c..d', 'x.jpg')], [`${U}/r-a-n-d-o-m.png`, `${U}/abcd.jpg`]);
let g: GalleryItem[] = [];
g = addGalleryItem(g, { path: P1, caption: '  Deck ', photoId: 'p1' });
g = addGalleryItem(g, { path: P1, caption: 'dup', photoId: null });
g = addGalleryItem(g, { path: P2, caption: null, photoId: null });
eq('gallery add (dedupe, captions cleaned)', g, [{ path: P1, caption: 'Deck', photoId: 'p1' }, { path: P2, caption: null, photoId: null }]);
eq('gallery move', moveGalleryItem(g, P2, -1).map(x => x.path), [P2, P1]);
eq('gallery caption', setGalleryCaption(g, P2, 'Roof')[1].caption, 'Roof');
eq('gallery remove', removeGalleryItem(g, P1).map(x => x.path), [P2]);
let full: GalleryItem[] = [];
for (let i = 0; i < 15; i++) full = addGalleryItem(full, { path: `${U}/photo${String(i).padStart(4, '0')}.jpg`, caption: null, photoId: null });
eq('gallery max 12', [full.length, canAddToGallery(full)], [PROFILE_LIMITS.gallery, false]);
eq('gallery payload', galleryRpcPayload(g), [{ path: P1, caption: 'Deck', photo_id: 'p1' }, { path: P2, caption: null, photo_id: null }]);
eq('my profile parse', parseMyRequestProfile({ slug: 's', about: 'A', services: ['x', 3], gallery: [{ path: P1, caption: 'c', photo_id: 'p' }, { path: '../evil.jpg' }] }),
    { slug: 's', about: 'A', services: ['x'], serviceArea: null, licenseLine: null, yearsLine: null, gallery: [{ path: P1, caption: 'c', photoId: 'p' }] });
const extras = parsePublicProfileExtras({
    about: 'We build', services: ['Decks'], service_area: 'Austin', license_line: 'Lic #1', years_line: '12 years', gallery: [{ path: P1, caption: 'c' }],
    testimonials: [{ rating: 5, name: 'Jane S.', text: 'Great', date: '2026-11-03' }], rating_average: '4.67', rating_count: 3,
}, p => `https://cdn/${p}`);
eq('public extras parse', [extras.gallery[0].url, extras.ratingAverage, extras.ratingCount, extras.testimonials.length], [`https://cdn/${P1}`, 4.7, 3, 1]);
eq('no content -> page as before', [hasProfileContent(EMPTY_PROFILE_EXTRAS), hasProfileContent(parsePublicProfileExtras({}, p => p)), hasProfileContent(extras)], [false, false, true]);

// ============================================================================================ offline audit
ok('public reads are read-only RPCs', ['get_feedback_request', 'get_public_profile_extras', 'get_my_request_profile'].every(r => READ_ONLY_RPCS.has(r)));
ok('submit is NOT read-only', !READ_ONLY_RPCS.has('submit_feedback'));
ok('submit audited as public', WRITE_PATHS.some(r => r.file === 'lib/feedback/feedbackApi.ts' && r.match.includes('submit_feedback') && r.offline === 'public'));
ok('owner writes need a connection', WRITE_PATHS.filter(r => /lib\/(feedback|profile)\//.test(r.file) && !r.match.includes('submit_feedback')).every(r => r.offline === 'needs_connection'));

// ============================================================================================ SQL lint
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261116001000_feedback_profile.sql'), 'utf8').replace(/\r\n/g, '\n');
const code = SQL.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const lower = code.toLowerCase();

ok('header: not applied yet', /^-- Applied: NOT YET \(needs owner OK\)/.test(SQL));
ok('no Kelviq / merchant of record', !/kelviq|merchant of record/i.test(SQL));

for (const re of [/\bdrop\s+table\b/, /\bdrop\s+column\b/, /\btruncate\b/, /\bdelete\s+from\b/, /\bdrop\s+function\b/, /\bdrop\s+schema\b/,
    /\bupdate\s+storage\./, /\binsert\s+into\s+storage\./, /\bon\s+storage\.objects/, /storage\.buckets/, /\balter\s+type\b/, /\bdrop\s+constraint\b/,
    /\balter\s+column\b/, /\brename\b/]) {
    ok(`no destructive / out-of-scope statement ${re}`, !re.test(lower));
}
const alters = [...lower.matchAll(/alter table (public\.\w+) ([^;]*);/g)].map(m => ({ t: m[1], rest: m[2] }));
ok('alter: only request_pages (add column if not exists) + RLS on the new table',
    alters.every(a => (a.t === 'public.request_pages' && /^add column if not exists /.test(a.rest)) || (a.t === 'public.feedback_responses' && a.rest === 'enable row level security')));
eq('request_pages: the six new columns', alters.filter(a => a.t === 'public.request_pages').map(a => a.rest.split(/\s+/)[5]),
    ['about', 'services', 'service_area', 'license_line', 'years_line', 'gallery']);
ok('request_pages columns are nullable with limits', alters.filter(a => a.t === 'public.request_pages').every(a => !/not null|default/.test(a.rest) && /check \(/.test(a.rest)));
eq('tables: only feedback_responses', [...lower.matchAll(/create table if not exists (public\.[a-z_]+)/g)].map(m => m[1]), ['public.feedback_responses']);
const policies = [...lower.matchAll(/create policy (\w+) on (public\.\w+)/g)].map(m => m[1]);
ok('every policy dropped first', policies.length === 4 && policies.every(p => lower.includes(`drop policy if exists ${p} on`)));
const triggers = [...lower.matchAll(/create trigger (\w+)/g)].map(m => m[1]);
ok('every trigger dropped first', triggers.length === 3 && triggers.every(t => lower.includes(`drop trigger if exists ${t} on public.feedback_responses`)));
ok('flow trigger fires before the definer guard', 'trg_feedback_responses_flow' < 'trg_feedback_responses_guard');

ok('RLS enabled', lower.includes('alter table public.feedback_responses enable row level security'));
for (const op of ['select', 'insert', 'update', 'delete']) {
    const m = new RegExp(`create policy feedback_responses_${op}_own on public\\.feedback_responses for ${op} to authenticated\\s+([^;]*);`).exec(lower);
    ok(`${op} policy exists`, !!m);
    ok(`${op} policy owner-only`, (m?.[1] || '').replace(/\s+/g, ' ').split(/using|with check/).slice(1)
        .every(part => part.trim().replace(/[()]/g, '').trim().startsWith('user_id = select auth.uid')));
}
ok('table: anon has nothing', lower.includes('revoke all on public.feedback_responses from anon;') && !/grant [^;]* on public\.feedback_responses[^;]* to [^;]*\banon\b/.test(lower));
ok('table: owner updates only the owner columns', lower.includes('grant update (testimonial, testimonial_name, testimonial_text, owner_note, hidden) on public.feedback_responses to authenticated'));
ok('table: no full update grant', !/grant [^;(]*\bupdate\b[^;(]* on public\.feedback_responses to authenticated/.test(lower) && /grant select, insert, delete on public\.feedback_responses to authenticated/.test(lower));
ok('token unique + format', lower.includes('constraint feedback_responses_token_key unique (token)') && SQL.includes("check (token ~ '^[A-Za-z0-9_-]{32,128}$')"));
ok('rating 1-5', lower.includes('check (rating is null or rating between 1 and 5)'));
ok('status check', lower.includes("check (status in ('requested', 'submitted'))"));

const fnRe = /create or replace function (public\.\w+)\(([^)]*)\)([\s\S]*?)\n\$\$;/g;
const fns = [...code.matchAll(fnRe)].map(m => ({ name: m[1], args: m[2], text: m[0] }));
eq('functions', fns.map(f => f.name).sort(), [
    'public._feedback_display_name', 'public.get_feedback_request', 'public.get_my_request_profile', 'public.get_public_profile_extras',
    'public.guard_feedback_flow', 'public.guard_feedback_response', 'public.set_request_profile_gallery', 'public.submit_feedback',
    'public.update_request_profile',
].sort());
ok('existing request page functions not replaced', !/function public\.(get_request_page|submit_quote_request|update_request_page|get_my_request_page|regenerate_request_slug|enqueue_storage_cleanup)\(/.test(lower.replace(/perform public\.get_my_request_page\(\)/g, '')));
const INVOKER_OK = new Set(['public.guard_feedback_flow']);
for (const f of fns) {
    const head = f.text.slice(0, f.text.indexOf('$$'));
    ok(`${f.name}: set search_path = ''`, /set search_path = ''/.test(head));
    ok(`${f.name}: body opens with "as $$"`, /\nas \$\$\n/.test(f.text));
    if (INVOKER_OK.has(f.name)) {
        ok(`${f.name}: invoker on purpose`, !/security definer/.test(head) && /current_user in \('authenticated', 'anon'\)/.test(f.text));
        ok(`${f.name}: reads no table`, !/\b(from|join)\s+public\./.test(f.text.toLowerCase()));
    } else {
        ok(`${f.name}: security definer`, /security definer/.test(head));
    }
    ok(`${f.name}: schema-qualified tables`, ![...f.text.matchAll(/\b(from|join|update|into)\s+(?!public\.|auth\.|jsonb_|unnest|v_|new\.|old\.|\()(\w+)/gi)]
        .some(m => /^(feedback_responses|request_pages|jobs|clients|storage_cleanup_queue|profiles|job_photos)$/.test(m[2])));
    ok(`${f.name}: revoked from public / anon / authenticated`, new RegExp(`revoke all on function ${f.name.replace('.', '\\.')}\\([^)]*\\) from public, anon, authenticated`).test(lower));
}
eq('every $$ body opens with "as $$"', (code.match(/\$\$/g) || []).length, (code.match(/\nas \$\$\n/g) || []).length * 2);

const granted = [...lower.matchAll(/grant execute on function (public\.\w+)\([^)]*\)\s+to ([^;]+);/g)].map(m => ({ fn: m[1], to: m[2].trim() }));
eq('anon grants only on the public functions', granted.filter(g2 => /\banon\b/.test(g2.to)).map(g2 => g2.fn).sort(),
    ['public.get_feedback_request', 'public.get_public_profile_extras', 'public.submit_feedback']);
eq('owner functions: authenticated only', granted.filter(g2 => !/\banon\b/.test(g2.to)).map(g2 => `${g2.fn}:${g2.to}`).sort(),
    ['public.get_my_request_profile:authenticated', 'public.set_request_profile_gallery:authenticated', 'public.update_request_profile:authenticated']);

const fnText = (n: string) => fns.find(f => f.name === n)?.text || '';
const jsonKeys = (t: string) => [...t.matchAll(/'([a-z_]+)',\s*(?=[a-z_(]|\n|case|coalesce)/g)].map(m => m[1]);
const FORBIDDEN = ['user_id', 'owner_note', 'token', 'hidden', 'email', 'phone', 'address', 'client_id', 'job_id', 'id', 'comment', 'client_name',
    'testimonial', 'testimonial_name', 'testimonial_text', 'photo_id', 'website', 'review_url'];
for (const n of ['public.get_feedback_request', 'public.get_public_profile_extras']) {
    const keys = jsonKeys(fnText(n));
    ok(`${n}: has json keys`, keys.length >= 6);
    eq(`${n}: no private json keys`, keys.filter(k => FORBIDDEN.includes(k)), []);
    ok(`${n}: stable`, /\nstable\n/.test(fnText(n)));
}
const getReq = fnText('public.get_feedback_request');
ok('get_feedback_request: token format + neutral error', getReq.includes("!~ '^[A-Za-z0-9_-]{32,128}$'") && (getReq.match(/'Feedback link not found' using errcode = 'P0002'/g) || []).length === 2);
ok('get_feedback_request: never the review link', !/google_review_link|review/.test(getReq.toLowerCase()));
ok('get_feedback_request: contractor name / company / logo only', /'contractor', jsonb_build_object\(\s*'name', v_c->>'name', 'company_name', v_c->>'company_name', 'logo_url', v_c->>'logo_url'\)\)/.test(getReq));
ok('get_feedback_request: rating only once submitted', getReq.includes("'rating', case when v_f.status = 'submitted' then v_f.rating end"));

const extrasFn = fnText('public.get_public_profile_extras');
ok('extras: approved + not hidden + submitted only', (extrasFn.match(/f\.testimonial\s+and not f\.hidden\s+and f\.status = 'submitted'/g) || []).length === 3);
ok('extras: own testimonials only', (extrasFn.match(/f\.user_id = v_page\.user_id/g) || []).length === 3);
ok('extras: page off -> nothing', (extrasFn.match(/v_on/g) || []).length >= 9);
ok('extras: gallery path in the owner folder', extrasFn.includes("split_part(g.el->>'path', '/', 1) = v_page.user_id::text"));
ok('extras: gallery returns path + caption only', extrasFn.includes("jsonb_build_object('path', g.el->>'path', 'caption', g.el->>'caption')"));
ok('extras: same not-found as get_request_page', extrasFn.includes("'Request page not found' using errcode = 'P0002'"));
ok('extras: at most 20 testimonials', extrasFn.includes('limit 20'));

const submit = fnText('public.submit_feedback');
const updates = [...submit.matchAll(/update public\.(\w+)\s+set([\s\S]*?)\n\s*where/g)];
eq('submit: one update, of feedback_responses', updates.map(u => u[1]), ['feedback_responses']);
eq('submit: writes only the client fields', (updates[0]?.[2] || '').split('\n').map(l => /^\s*(\w+)\s*=/.exec(l)?.[1]).filter(Boolean),
    ['status', 'rating', 'comment', 'client_name', 'submitted_at']);
ok('submit: once', submit.includes("if v_f.status <> 'requested' then") && submit.includes('ALREADY_SUBMITTED'));
ok('submit: locks the row', submit.includes('for update;'));
ok('submit: texts capped', submit.includes('public._clean_multiline(p_comment, 2000)') && submit.includes('public._clean_text(p_name, 80)'));
ok('submit: review link only for 4+, https only', /if p_rating >= 4 then\s+select p\.google_review_link into v_review/.test(submit) && submit.includes("v_review !~* '^https://"));
ok('submit: neutral not-found', (submit.match(/'Feedback link not found' using errcode = 'P0002'/g) || []).length === 2);
ok('submit: no insert / delete', !/\b(insert into|delete from)\b/i.test(submit));
ok('submit: returns ok / rating / review_url only', submit.includes("jsonb_build_object('ok', true, 'rating', p_rating, 'review_url', v_review)"));

const flow = fnText('public.guard_feedback_flow');
for (const f of ['status', 'requested_at', 'submitted_at', 'rating', 'comment', 'client_name', 'token', 'user_id', 'job_name', 'client_first_name']) {
    ok(`flow: browser keeps ${f}`, flow.includes(`new.${f} := old.${f};`));
}
for (const f of ['submitted_at', 'rating', 'comment', 'client_name', 'testimonial_name', 'testimonial_text']) ok(`flow: browser insert clears ${f}`, flow.includes(`new.${f} := null;`));
ok('flow: browser insert starts requested, not a testimonial', flow.includes("new.status := 'requested';") && flow.includes('new.testimonial := false;'));
const guard = fnText('public.guard_feedback_response');
ok('guard: token from 32 random bytes, set by the database', guard.includes('extensions.gen_random_bytes(32)') && guard.includes('new.token := old.token;'));
ok('guard: same-owner job + client', guard.includes('j.id = new.job_id and j.user_id = new.user_id') && guard.includes('c.id = new.client_id and c.user_id = new.user_id'));
ok('guard: Premium on insert', guard.includes("not in ('premium', 'ai')") && guard.includes('PLAN_LIMIT'));
ok('guard: caps', guard.includes('v_count >= 5000') && guard.includes('v_count >= 200'));
ok('guard: testimonial name never email / phone', guard.includes("new.testimonial_name like '%@%'"));
ok('guard: quote must come from the comment', guard.includes('position(v_norm_text in v_norm_comm) = 0'));
ok('guard: first name only', guard.includes("split_part(btrim(coalesce(v_client_name, v_job_cname, new.client_first_name, '')), ' ', 1)"));

const gallery = fnText('public.set_request_profile_gallery');
ok('gallery: owner folder + path format', gallery.includes("split_part(v_path, '/', 1) <> v_uid::text") && gallery.includes("'^[0-9a-f-]{36}/[A-Za-z0-9_-]{6,80}\\.(jpg|png|webp)$'"));
ok('gallery: max 12', gallery.includes('jsonb_array_length(p_items) > 12'));
ok('gallery: never a job photo portal copy', gallery.includes('p.portal_path = v_path'));
ok('gallery: removed copies queued in portal-photos', /insert into public\.storage_cleanup_queue \(user_id, bucket, path\)\s+select v_uid, 'portal-photos'/.test(gallery));
ok('cleanup: only the portal-photos bucket', [...code.matchAll(/insert into public\.storage_cleanup_queue[^;]*;/g)].every(m => m[0].includes("'portal-photos'")));
ok('profile writes: own page only', fnText('public.update_request_profile').includes('where user_id = v_uid;') && gallery.includes('where user_id = v_uid;'));

console.log(`feedback-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
