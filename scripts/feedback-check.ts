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
import {
    STAR_VALUES, afterSend, defaultTestimonialName, feedbackHeadline, feedbackLinkMessage, feedbackRequestMessage, feedbackStats, filterFeedback,
    jobFeedbackLabel, nextStarValue, publicLookFor, ratingAria, shownStars, starShare, suggestedQuote, tabbableStar, testimonialDraftFor,
    testimonialPatch, validateTestimonialDraft,
} from '../lib/feedback/feedbackUi.ts';
import {
    EMPTY_PROFILE_FORM, addServiceChip, canAddService, lightboxStep, monthYear, previewExtras, profileFillCount, profileFormFrom, profilePatchFrom,
    profileSections, ratingLine, removeServiceChip, sameProfileForm, type ProfileForm,
} from '../lib/profile/profileUi.ts';
import { isMarketingPath } from '../pages/routes.ts';
import { parseView } from '../lib/routes.ts';

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
eq('nudge rule: no review gating (every valid rating)', [0, 1, 2, 3, 4, 5, 6].map(shouldNudgeReview), [false, true, true, true, true, true, false]);
eq('nudge url: any rating, https only', [reviewNudgeUrl(5, 'https://g.page/r/x/review'), reviewNudgeUrl(3, 'https://g.page/r/x/review'), reviewNudgeUrl(5, 'http://g.page'), reviewNudgeUrl(4, 'javascript:alert(1)'), reviewNudgeUrl(4, null)],
    ['https://g.page/r/x/review', 'https://g.page/r/x/review', null, null, null]);
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
eq('submit result: review link for every rating', [parseFeedbackSubmitResult({ ok: true, rating: 5, review_url: 'https://g.page/r' }), parseFeedbackSubmitResult({ ok: true, rating: 2, review_url: 'https://g.page/r' }), parseFeedbackSubmitResult({ ok: false })],
    [{ ok: true, rating: 5, reviewUrl: 'https://g.page/r' }, { ok: true, rating: 2, reviewUrl: 'https://g.page/r' }, null]);
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

// ============================================================================================ PHASE B: client page + owner screens (pure rules)
// -- star picker
eq('stars: arrows', [nextStarValue(null, 'ArrowRight'), nextStarValue(3, 'ArrowRight'), nextStarValue(5, 'ArrowRight'), nextStarValue(3, 'ArrowLeft'), nextStarValue(1, 'ArrowLeft'), nextStarValue(null, 'ArrowLeft')], [1, 4, 5, 2, 1, 1]);
eq('stars: up / down follow right / left', [nextStarValue(2, 'ArrowUp'), nextStarValue(2, 'ArrowDown')], [3, 1]);
eq('stars: Home / End / digits', [nextStarValue(3, 'Home'), nextStarValue(3, 'End'), nextStarValue(null, '4'), nextStarValue(null, '1')], [1, 5, 4, 1]);
eq('stars: other keys do nothing', [nextStarValue(3, 'Tab'), nextStarValue(3, 'Enter'), nextStarValue(3, '6'), nextStarValue(3, 'a')], [null, null, null, null]);
eq('stars: shown = hover over selected', [shownStars(null, null), shownStars(3, null), shownStars(3, 5), shownStars(null, 2), shownStars(9 as number, 0)], [0, 3, 5, 2, 0]);
eq('stars: roving tab stop', [tabbableStar(null), tabbableStar(4), tabbableStar(0)], [1, 4, 1]);
eq('stars: five values', STAR_VALUES, [1, 2, 3, 4, 5]);

// -- after sending: the 1-3 vs 4-5 star paths
const G = 'https://g.page/r/abc/review';
eq('after: 4-5 stars + https link -> Google', [afterSend(4, G), afterSend(5, G)], [{ kind: 'google', url: G, low: false }, { kind: 'google', url: G, low: false }]);
eq('after: 4-5 stars without a link -> thanks only', [afterSend(5, null), afterSend(4, ''), afterSend(5, undefined)], [{ kind: 'thanks' }, { kind: 'thanks' }, { kind: 'thanks' }]);
eq('after: 1-3 stars get the SAME Google link (no review gating) plus the gentle message', [afterSend(1, G), afterSend(2, G), afterSend(3, G)], [{ kind: 'google', url: G, low: true }, { kind: 'google', url: G, low: true }, { kind: 'google', url: G, low: true }]);
eq('after: 1-3 stars without a link -> sorry only', [afterSend(1, null), afterSend(3, '')], [{ kind: 'sorry' }, { kind: 'sorry' }]);
eq('after: only https links are opened', [afterSend(5, 'http://g.page/x'), afterSend(5, 'javascript:alert(1)'), afterSend(5, 'https://x y')], [{ kind: 'thanks' }, { kind: 'thanks' }, { kind: 'thanks' }]);

// -- testimonial draft: name + quote rules in the owner's editor
const long = `${'Great crew and a clean site. '.repeat(30)}Last sentence here.`;
ok('quote: short comment kept as written', suggestedQuote('  Great job, on time.  ') === 'Great job, on time.' && suggestedQuote(null) === '');
const cut = suggestedQuote(long);
ok('quote: long comment cut at a sentence, within the limit, still a part of the comment, no ellipsis', cut.length <= FEEDBACK_LIMITS.testimonialText && cut.endsWith('.') && !cut.includes('…') && isExcerptOf(cut, long));
ok('quote: no sentence break -> cut at a word', (() => { const q = suggestedQuote('word '.repeat(300)); return q.length <= FEEDBACK_LIMITS.testimonialText && isExcerptOf(q, 'word '.repeat(300)); })());
eq('draft: name defaults to first name + initial, quote to the comment', testimonialDraftFor(rows[0]), { name: 'Jane S.', text: 'Great job, on time.' });
eq('draft: owner choices win', testimonialDraftFor(rows[1]), { name: 'The Lees', text: 'on time' });
eq('draft: no client name falls back to the job client first name', testimonialDraftFor(row({ client_name: null, client_first_name: 'Maria' })).name, 'Maria');
eq('draft: nothing known -> empty (the page shows "A client")', testimonialDraftFor(row({ client_name: null, client_first_name: null })).name, '');
eq('draft: an email typed as the name never becomes the default', defaultTestimonialName({ clientName: 'jane@x.com', clientFirstName: null }), '');
eq('validate: good draft', validateTestimonialDraft({ name: 'Jane S.', text: 'on time' }, rows[0]).ok, true);
eq('validate: email / phone as a name refused', [validateTestimonialDraft({ name: 'jane@x.com', text: '' }, rows[0]).nameError !== null, validateTestimonialDraft({ name: '555 123 4567', text: '' }, rows[0]).nameError !== null], [true, true]);
eq('validate: quote must be a part of the client words', [validateTestimonialDraft({ name: '', text: 'the best contractor ever' }, rows[0]).textError !== null, validateTestimonialDraft({ name: '', text: 'GREAT  job' }, rows[0]).ok], [true, true]);
eq('validate: no comment -> any quote refused, empty quote fine', [validateTestimonialDraft({ name: '', text: 'x' }, row({ comment: null })).ok, validateTestimonialDraft({ name: '', text: '' }, row({ comment: null })).ok], [false, true]);
eq('validate: quote over 600 refused', validateTestimonialDraft({ name: '', text: long }, row({ comment: long })).ok, false);
eq('patch: trimmed, empty -> null', [testimonialPatch({ name: ' Jane S. ', text: ' on time ' }), testimonialPatch({ name: '  ', text: '' })], [{ name: 'Jane S.', text: 'on time' }, { name: null, text: null }]);
eq('public look: what the page shows', [publicLookFor(rows[0])?.name, publicLookFor(rows[2]), publicLookFor(rows[3]), publicLookFor(rows[4])], ['Jane S.', null, null, null]);

// -- the owner's list
eq('filter: all / answered / waiting / page', [filterFeedback(rows, 'all').length, filterFeedback(rows, 'answered').length, filterFeedback(rows, 'waiting').map(r => r.id), filterFeedback(rows, 'page').map(r => r.id)], [5, 4, ['e'], ['a', 'b']]);
const st = feedbackStats(rows);
eq('stats: counts and averages', [st.answered, st.waiting, st.onPage, st.hidden, st.average, st.pageAverage, st.byStar], [4, 1, 2, 1, 4.8, 4.5, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 3 }]);
eq('headline', [feedbackHeadline(st), feedbackHeadline(feedbackStats([]))], ['4.8 from 4 · 1 waiting · 2 on your page', 'No feedback yet']);
eq('bars: share per star', [starShare(st, 5), starShare(st, 4), starShare(st, 1), starShare(feedbackStats([]), 5)], [75, 25, 0, 0]);
eq('job button text', [jobFeedbackLabel([], J), jobFeedbackLabel([rows[4]], J), jobFeedbackLabel([rows[0], rows[1]], J), jobFeedbackLabel([rows[0]], 'other')],
    [{ long: 'Ask for feedback', short: 'Feedback' }, { long: 'Feedback: waiting', short: 'Feedback…' }, { long: 'Feedback: 4.5 of 5', short: 'Feedback 4.5' }, { long: 'Ask for feedback', short: 'Feedback' }]);
eq('aria', [ratingAria(4), ratingAria(null)], ['4 out of 5 stars', 'Not rated yet']);

// -- the message to the client
const fm = feedbackRequestMessage({ clientName: 'Jane Smith', company: 'Acme Roofing', senderName: 'Sam', jobName: 'Kitchen', link: `https://x/feedback/${TOKEN}` });
ok('message: greeting, job, link, sign-off', fm.body.startsWith('Hi Jane,') && fm.body.includes('the Kitchen job') && fm.body.includes(`https://x/feedback/${TOKEN}`) && fm.body.endsWith('Sam\nAcme Roofing') && fm.subject === 'How did we do on Kitchen?');
ok('message: no word about Google or reviews to the client', !/google|review/i.test(`${fm.subject}\n${fm.body}\n${fm.text}`));
eq('message: no names -> still a sentence', feedbackRequestMessage({ link: 'L' }).body.startsWith('Hi,\n\nThank you for choosing us.'), true);
ok('message: text version is one line with the link', !fm.text.includes('\n') && fm.text.endsWith(`https://x/feedback/${TOKEN}`));
ok('link message', feedbackLinkMessage({ clientName: 'Jane Smith', company: 'Acme', link: 'L' }) === 'Hi Jane, how did we do at Acme? It takes under a minute: L');

// -- public profile: sections, preview, editor rules
const noneYet = { ...EMPTY_PROFILE_EXTRAS };
eq('profile: an empty profile shows no section at all', profileSections(noneYet), { about: false, services: false, facts: false, gallery: false, reviews: false, any: false });
eq('profile: null / undefined extras -> nothing', [profileSections(null).any, profileSections(undefined).any], [false, false]);
eq('profile: blank text counts as empty', profileSections({ ...noneYet, about: '   ', serviceArea: ' ' }).any, false);
eq('profile: each field alone', [profileSections({ ...noneYet, about: 'Hi' }), profileSections({ ...noneYet, services: ['Roofing'] }), profileSections({ ...noneYet, yearsLine: '15 years' }),
    profileSections({ ...noneYet, gallery: [{ path: P1, caption: null, url: 'u' }] }), profileSections({ ...noneYet, testimonials: [{ rating: 5, name: 'A', text: null, date: '2026-11-03' }] })].map(s => Object.entries(s).filter(([, v]) => v).map(([k]) => k).join('+')),
    ['about+any', 'services+any', 'facts+any', 'gallery+any', 'reviews+any']);
eq('month and year', [monthYear('2026-11-05'), monthYear('2026-01-31'), monthYear(''), monthYear('x'), monthYear('2026-13-01')], ['November 2026', 'January 2026', '', '', '']);
eq('rating line', [ratingLine(4.8, 12), ratingLine(5, 1), ratingLine(null, 3), ratingLine(4.5, 0)], ['4.8 from 12 reviews', '5.0 from 1 review', '', '']);
eq('lightbox keys wrap', [lightboxStep(0, 5, 'ArrowLeft'), lightboxStep(4, 5, 'ArrowRight'), lightboxStep(2, 5, 'Home'), lightboxStep(2, 5, 'End'), lightboxStep(2, 5, 'x'), lightboxStep(0, 0, 'ArrowRight')], [4, 0, 0, 4, null, null]);
eq('chips: add, dedupe, trim, split', addServiceChip(['Roofing'], ' roofing, Gutters;  Siding\n'), ['Roofing', 'Gutters', 'Siding']);
eq('chips: at most 20', [addServiceChip(Array.from({ length: 19 }, (_, i) => `s${i}`), 'a, b, c').length, canAddService(Array.from({ length: 20 }, (_, i) => `s${i}`)), canAddService(['a'])], [20, false, true]);
eq('chips: remove', removeServiceChip(['a', 'b', 'c'], 1), ['a', 'c']);
const sv: ProfileForm = { about: 'Hi', services: ['Roofing'], serviceArea: 'Austin', licenseLine: '', yearsLine: '' };
eq('form: unchanged -> no patch, changed -> only that field', [profilePatchFrom(sv, sv), profilePatchFrom({ ...sv, about: ' Hello ' }, sv), profilePatchFrom({ ...sv, serviceArea: '' }, sv), profilePatchFrom({ ...sv, services: ['Roofing', 'Gutters'] }, sv)],
    [{}, { about: 'Hello' }, { serviceArea: '' }, { services: ['Roofing', 'Gutters'] }]);
eq('form: same / different', [sameProfileForm(sv, { ...sv, about: ' Hi ' }), sameProfileForm(sv, { ...sv, services: [] })], [true, false]);
eq('form from the saved profile', profileFormFrom(parseMyRequestProfile({ slug: 'a-b', about: 'Hi', services: ['x'], service_area: null, license_line: 'L', years_line: null, gallery: [] })), { about: 'Hi', services: ['x'], serviceArea: '', licenseLine: 'L', yearsLine: '' });
eq('fill count', [profileFillCount(EMPTY_PROFILE_FORM, 0), profileFillCount(sv, 3)], [{ filled: 0, total: 6 }, { filled: 4, total: 6 }]);
const pv = previewExtras({ ...sv, services: ['Roofing', 'roofing'] }, [{ path: P1, caption: 'Deck' }], p => `https://cdn/${p}`, approvedTestimonials(rows), 4.5);
eq('preview: as the page will draw it', [pv.about, pv.services, pv.gallery[0].url, pv.testimonials.length, pv.ratingCount, profileSections(pv).any], ['Hi', ['Roofing'], `https://cdn/${P1}`, 2, 2, true]);
eq('preview: empty form -> nothing to draw', profileSections(previewExtras(EMPTY_PROFILE_FORM, [], p => p, [], null)).any, false);

// -- wiring (source lint): routes, pages, mounts
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const indexSrc = src('index.tsx');
ok('route: /feedback/<token> parsed in index.tsx with its own lazy chunk, after the request and crew branches, before the app', (() => {
    const a = indexSrc.indexOf('requestSlugFromPath(location.pathname)');
    const b = indexSrc.indexOf('crewTokenFromPath(location.pathname)');
    const c = indexSrc.indexOf('feedbackTokenFromPath(location.pathname)');
    const d = indexSrc.indexOf('return <AppBranch />;');
    return a > 0 && b > a && c > b && d > c && indexSrc.includes("import('./components/feedback/FeedbackPage.tsx')") && indexSrc.includes('<FeedbackBranch token={feedbackToken} />');
})());
ok('route: marketing / app routes do not take /feedback/', !isMarketingPath(`/feedback/${TOKEN}`) && parseView(`/feedback/${TOKEN}`, '', null).screen === 'notFound');
ok('route: a feedback link is not a request or crew link', requestSlugFromPath(`/feedback/${TOKEN}`) === null && crewTokenFromPath(`/feedback/${TOKEN}`) === null);
const pageSrc = src('components/feedback/FeedbackPage.tsx');
ok('client page: no third-party scripts, no external imports', !/<script/.test(pageSrc) && !/createElement\('script'\)/.test(pageSrc) && !/from '(https?:|\/\/)/.test(pageSrc) && !/import\('(https?:|\/\/)/.test(pageSrc));
ok('client page: Google opens in a new tab without a referrer, only for the "google" path', pageSrc.includes('target="_blank" rel="noopener noreferrer"') && pageSrc.includes("sent.after.kind === 'google'") && pageSrc.includes('afterSend('));
ok('client page: not indexed, logo without referrer, both languages', pageSrc.includes('noindex, nofollow') && pageSrc.includes('referrerPolicy="no-referrer"') && pageSrc.includes("lang: 'Español'") && pageSrc.includes('const ES: Words'));
ok('client page: kind states for invalid / already / missing / offline', ['invalidTitle', 'alreadyTitle', 'missingTitle', 'offlineTitle'].every(k => pageSrc.includes(k)));
const reqSrc = src('components/requests/RequestQuotePage.tsx');
ok('public page: extras drawn only when loaded and non-empty; the old page code is untouched', reqSrc.includes('loadPublicProfileExtras(slug)') && reqSrc.includes('hasProfileContent(res.data)') && reqSrc.includes('{extras && <PublicProfileView') && reqSrc.includes('Send request') && reqSrc.includes('Prefer to talk first?'));
const viewSrc = src('components/profile/PublicProfileView.tsx');
ok('public profile view: nothing for an empty profile, no JSON-LD (the page emits no structured data)', viewSrc.includes('if (!sections.any) return null;') && !/ld\+json|aggregateRating/.test(viewSrc + reqSrc));
ok('settings: profile editor + feedback section mounted in the request-link area', src('components/Settings.tsx').includes('<FeedbackSection') && src('components/Settings.tsx').includes('withProfile') && src('components/requests/RequestLinkSettings.tsx').includes('<PublicProfileEditor'));
ok('job page: button only when the feature is ready, Free account -> upgrade prompt', src('App.tsx').includes("feedbackFeature === 'ready' && session") && src('components/feedback/JobFeedbackButton.tsx').includes('isPlanLimitError(e)') && src('components/feedback/JobFeedbackButton.tsx').includes('FEEDBACK_PREMIUM_REASON'));
ok('settings feature hooks: both screens stay hidden until the database has them', src('components/feedback/FeedbackSection.tsx').includes("feature === 'ready'") && src('components/profile/PublicProfileEditor.tsx').includes("feature === 'ready'"));
ok('gallery: says plainly that photos and captions are public', /These photos are public/.test(src('components/profile/GalleryManager.tsx')) && /captions are public|and so are the captions/.test(src('components/profile/GalleryManager.tsx')));
ok('testimonial editor: warns the quote must be the client words', /word for word/.test(src('components/feedback/FeedbackRow.tsx')));
ok('help: both guides listed once, open Settings, no Kelviq', ['client-feedback', 'public-profile'].every(id => src('components/help/helpContent.ts').split(`id: '${id}',`).length === 2)
    && !/kelviq|merchant of record/i.test(['components/feedback/FeedbackPage.tsx', 'components/feedback/FeedbackRow.tsx', 'components/feedback/FeedbackSection.tsx', 'components/feedback/JobFeedbackButton.tsx', 'components/profile/PublicProfileEditor.tsx', 'components/profile/GalleryManager.tsx', 'components/profile/PublicProfileView.tsx', 'lib/feedback/feedbackUi.ts', 'lib/profile/profileUi.ts'].map(src).join('\n')));

// ============================================================================================ offline audit
ok('public reads are read-only RPCs', ['get_feedback_request', 'get_public_profile_extras', 'get_my_request_profile'].every(r => READ_ONLY_RPCS.has(r)));
ok('submit is NOT read-only', !READ_ONLY_RPCS.has('submit_feedback'));
ok('submit audited as public', WRITE_PATHS.some(r => r.file === 'lib/feedback/feedbackApi.ts' && r.match.includes('submit_feedback') && r.offline === 'public'));
ok('owner writes need a connection', WRITE_PATHS.filter(r => /lib\/(feedback|profile)\//.test(r.file) && !r.match.includes('submit_feedback')).every(r => r.offline === 'needs_connection'));

// ============================================================================================ SQL lint
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261116001000_feedback_profile.sql'), 'utf8').replace(/\r\n/g, '\n');
const code = SQL.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const lower = code.toLowerCase();

ok('header: applied with the owner OK', /^-- Applied 2026-11-15 with the owner's OK/.test(SQL));
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
ok('submit (first version): review link is https only', /select p\.google_review_link into v_review/.test(submit) && submit.includes("v_review !~* '^https://"));
{
    // no review gating: the follow-up migration replaces submit_feedback so EVERY rating gets the same link
    const FIX = readFileSync(join(ROOT, 'supabase/migrations/20261116001100_feedback_review_link_all.sql'), 'utf8').replace(/\r\n/g, '\n');
    const fixFn = FIX.slice(FIX.indexOf('create or replace function public.submit_feedback('));
    ok('no review gating: the replacement has no rating condition', !/if p_rating >= 4/.test(fixFn) && /select p\.google_review_link into v_review/.test(fixFn) && fixFn.includes("v_review !~* '^https://"));
    ok('no review gating: same signature, once-per-link rule and return shape', fixFn.includes('p_token text, p_rating integer, p_comment text default null, p_name text default null') && fixFn.includes("if v_f.status <> 'requested' then") && fixFn.includes("jsonb_build_object('ok', true, 'rating', p_rating, 'review_url', v_review)"));
    ok('no review gating: security definer, empty search_path, body opens with as $$, grants unchanged', /security definer\s+set search_path = ''\s+as \$\$/.test(fixFn) && FIX.includes('grant execute on function public.submit_feedback(text, integer, text, text) to anon, authenticated;'));
    ok('no review gating: only submit_feedback is replaced', (FIX.match(/create or replace function/g) || []).length === 1 && !/\b(create table|alter table|drop )/i.test(FIX));
}
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
