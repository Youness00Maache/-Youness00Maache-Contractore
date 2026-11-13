/**
 * Checks for the request-a-quote link (#5) and the job photo timeline (#11): pure logic, markup geometry,
 * the photo report HTML (through the PDF sanitizer), and a lint of the migration (privileges, additive-only,
 * numbers in sync with the TypeScript constants).
 *   npx tsx scripts/requests-photos-check.ts
 *   TZ=Pacific/Auckland npx tsx scripts/requests-photos-check.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    MAX_REQUEST_PHOTOS, MAX_REQUEST_PHOTO_BYTES, MIN_FILL_MS, REQUEST_LIMITS, REQUEST_SLUG_RE, EMPTY_REQUEST_FORM,
    buildEstimatePrompt, classifyRequestError, hasErrors, isLikelyBot, isMissingBackendError, isValidSlug, jobNameFromRequest,
    mailHref, mapQuoteRequestRow, mapsHref, photoExtension, relativeTime, requestPageUrl, requestSlugFromPath, requestSnippet,
    smsHref, sourceFromSearch, sourceLabel, telHref, validateRequestForm,
} from '../components/requests/requestLogic.ts';
import {
    PHOTO_LIMITS, buildPhotoReportHtml, checkPhotoQuota, countByFilter, defaultTagForNewPhotos, filterPhotos, formatBytes, groupByDay,
    localDay, mapPhotoRow, mapPhotoUsage, pairBeforeAfter, photoStoragePaths, photoTier, portalPhotoPath, sortPhotos, tagLabel,
    type JobPhoto,
} from '../components/photos/photoLogic.ts';
import {
    arrowHead, clamp01, drawShapes, ellipseFromBox, fitSize, fontSizeFor, isTinyShape, outlineFor, simplifyStroke, strokeWidthFor,
    toNormalized, type MarkupShape,
} from '../components/photos/markupGeometry.ts';
import { displayUrl, qrSignHtml } from '../components/requests/qrSign.ts';
import { sanitizeRichText } from '../utils/escapeHtml.ts';

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
const near = (label: string, a: number, b: number, eps = 1e-6) => ok(`${label} (${a} ≈ ${b})`, Math.abs(a - b) <= eps);

// ============================================================================ request-a-quote: routing
eq('slug from /r/acme-roofing-7k2mq', requestSlugFromPath('/r/acme-roofing-7k2mq'), 'acme-roofing-7k2mq');
eq('slug lowercased + trailing slash', requestSlugFromPath('/r/Acme-Roofing-7K2MQ/'), 'acme-roofing-7k2mq');
eq('slug url-decoded', requestSlugFromPath('/r/acme%2Droofing'), 'acme-roofing');
eq('/r/ alone → empty (not found page)', requestSlugFromPath('/r/'), '');
eq('/r/a/b → empty (not found page)', requestSlugFromPath('/r/a/b'), '');
eq('/r without slash → not a request page', requestSlugFromPath('/r'), null);
eq('/dashboard → null', requestSlugFromPath('/dashboard'), null);
eq('/pricing → null', requestSlugFromPath('/pricing'), null);
eq('/rates → null', requestSlugFromPath('/rates'), null);
ok('valid slug', isValidSlug('acme-roofing-7k2mq'));
ok('3-char slug valid', isValidSlug('abc'));
ok('2-char slug invalid', !isValidSlug('ab'));
ok('leading dash invalid', !isValidSlug('-abc'));
ok('trailing dash invalid', !isValidSlug('abc-'));
ok('uppercase invalid', !isValidSlug('Abc'));
ok('49 chars invalid', !isValidSlug('a'.repeat(49)));
ok('48 chars valid', isValidSlug('a'.repeat(48)));
ok('spaces invalid', !isValidSlug('a b c'));
ok('empty invalid', !isValidSlug(''));
eq('page url', requestPageUrl('https://www.contractordocs.app/', 'acme-7k2mq'), 'https://www.contractordocs.app/r/acme-7k2mq');
eq('page url with source', requestPageUrl('http://localhost:3010', 'acme-7k2mq', 'qr'), 'http://localhost:3010/r/acme-7k2mq?src=qr');
eq('source from ?src=QR', sourceFromSearch('?src=QR'), 'qr');
eq('source strips junk', sourceFromSearch('?src=goo<gle>!'), 'google');
eq('source capped at 20', sourceFromSearch(`?src=${'x'.repeat(40)}`).length, 20);
eq('no source', sourceFromSearch(''), '');
eq('display url', displayUrl('https://www.contractordocs.app/r/acme-7k2mq?src=qr'), 'contractordocs.app/r/acme-7k2mq');

// ============================================================================ form validation
const good = { ...EMPTY_REQUEST_FORM, name: 'Jane Doe', phone: '(555) 123-4567', details: 'Replace kitchen faucet' };
eq('valid form → no errors', validateRequestForm(good), {});
ok('missing name', !!validateRequestForm({ ...good, name: '  ' }).name);
ok('no phone and no email', !!validateRequestForm({ ...good, phone: '', email: '' }).contact);
eq('email only is fine', validateRequestForm({ ...good, phone: '', email: 'jane@example.com' }), {});
ok('bad email', !!validateRequestForm({ ...good, email: 'jane@' }).email);
ok('phone with letters', !!validateRequestForm({ ...good, phone: 'call me maybe' }).phone);
ok('phone too short', !!validateRequestForm({ ...good, phone: '12345' }).phone);
eq('phone with extension ok', validateRequestForm({ ...good, phone: '+1 555 123 4567 ext 12' }).phone, undefined);
ok('details required', !!validateRequestForm({ ...good, details: 'a' }).details);
ok('details too long', !!validateRequestForm({ ...good, details: 'x'.repeat(REQUEST_LIMITS.details + 1) }).details);
ok('too many photos', !!validateRequestForm(good, MAX_REQUEST_PHOTOS + 1).photos);
ok('5 photos fine', !hasErrors(validateRequestForm(good, MAX_REQUEST_PHOTOS)));
ok('hasErrors true', hasErrors({ name: 'x' }));
ok('hasErrors false', !hasErrors({}));
ok('honeypot → bot', isLikelyBot({ website: 'http://spam' }, 10000));
ok('too fast → bot', isLikelyBot({ website: '' }, MIN_FILL_MS - 1));
ok('person → not bot', !isLikelyBot({ website: '' }, MIN_FILL_MS + 1));
eq('jpeg ext', photoExtension('image/jpeg'), 'jpg');
eq('png ext', photoExtension('image/png'), 'png');
eq('webp ext', photoExtension('image/webp'), 'webp');
eq('gif refused', photoExtension('image/gif'), null);
eq('heic refused', photoExtension('image/heic'), null);

// ============================================================================ errors
ok('missing table → unavailable', isMissingBackendError({ code: '42P01', message: 'relation "public.quote_requests" does not exist' }));
ok('missing rpc → unavailable', isMissingBackendError({ code: 'PGRST202', message: 'Could not find the function public.get_request_page' }));
ok('schema cache table', isMissingBackendError({ code: 'PGRST205', message: "Could not find the table 'public.job_photos' in the schema cache" }));
ok('bucket missing', isMissingBackendError({ message: 'Bucket not found' }));
{
    const wrapped = Object.assign(new Error('This feature is not available yet.'), { name: 'FeatureUnavailableError' });
    ok('wrapped FeatureUnavailableError → missing', isMissingBackendError(wrapped as any));
    eq('wrapped FeatureUnavailableError → unavailable page', classifyRequestError(wrapped as any).kind, 'unavailable');
}
ok('RLS error is not "missing"', !isMissingBackendError({ code: '42501', message: 'new row violates row-level security policy' }));
ok('plan limit is not "missing"', !isMissingBackendError({ code: 'P0001', message: 'PLAN_LIMIT: The Free plan keeps up to 30 photos per job.' }));
eq('rate limit', classifyRequestError({ code: 'P0001', message: 'RATE_LIMIT: Too many requests were sent from this device. Please try again later.' }),
    { kind: 'rate_limit', message: 'Too many requests were sent from this device. Please try again later.' });
eq('disabled', classifyRequestError({ code: 'P0001', message: 'This business is not taking online requests right now.', hint: 'disabled' }).kind, 'disabled');
eq('not found', classifyRequestError({ code: 'P0002', message: 'Request page not found' }).kind, 'not_found');
eq('invalid keeps server sentence', classifyRequestError({ code: '22023', message: 'Please check the phone number.' }), { kind: 'invalid', message: 'Please check the phone number.' });
eq('network', classifyRequestError(new TypeError('Failed to fetch') as any).kind, 'network');
eq('unknown hides details', classifyRequestError({ code: 'XX000', message: 'internal' }).kind, 'unknown');

// ============================================================================ inbox helpers
const row = mapQuoteRequestRow({ id: 'r1', name: ' ', phone: null, email: 'a@b.co', photo_paths: ['u/r1/1.jpg', null, 7], status: 'weird', created_at: '2026-11-13T10:00:00Z' });
eq('row name fallback', row.name, 'Unnamed');
eq('row bad status → new', row.status, 'new');
eq('row photo paths filtered', row.photoPaths, ['u/r1/1.jpg']);
eq('row null phone → empty', row.phone, '');
eq('snippet first line', requestSnippet('\n  Fix the deck  \nmore'), 'Fix the deck');
eq('snippet cut at word', requestSnippet('Replace the old cedar deck boards and railings on the back porch', 30), 'Replace the old cedar deck…');
eq('job name from details', jobNameFromRequest({ name: 'Jane', details: 'replace kitchen faucet\nand more' }), 'Replace kitchen faucet');
eq('job name fallback', jobNameFromRequest({ name: 'Jane', details: '   ' }), 'Quote request - Jane');
ok('job name ≤ 120', jobNameFromRequest({ name: 'J', details: 'x'.repeat(500) }).length <= 120);
{
    const prompt = buildEstimatePrompt({ name: 'Jane', phone: '555 1234567', email: '', address: '12 Main St\nSpringfield', details: 'New fence, 40 ft', photoPaths: [] }, 2);
    ok('prompt asks for an estimate', /^Draft an estimate/.test(prompt));
    ok('prompt has client', prompt.includes('Client: Jane'));
    ok('prompt joins address lines', prompt.includes('Job address: 12 Main St, Springfield'));
    ok('prompt skips empty email', !prompt.includes('Email:'));
    ok('prompt has details', prompt.includes('What they need:\nNew fence, 40 ft'));
    ok('prompt mentions photos', prompt.includes('2 of their photos are attached'));
    ok('no triple blank lines', !/\n\n\n/.test(prompt));
}
eq('tel href', telHref('(555) 123-4567'), 'tel:5551234567');
eq('tel keeps +', telHref('+44 20 7946 0958'), 'tel:+442079460958');
eq('tel too short', telHref('12'), '');
eq('sms href', smsHref('555-123-4567'), 'sms:5551234567');
eq('mail href', mailHref('jane@example.com', 'Your quote'), 'mailto:jane@example.com?subject=Your%20quote');
eq('mail href rejects junk', mailHref('javascript:alert(1)'), '');
eq('maps href', mapsHref('12 Main St\nSpringfield'), 'https://www.google.com/maps/search/?api=1&query=12%20Main%20St%20Springfield');
eq('maps empty', mapsHref(' '), '');
eq('source label qr', sourceLabel('qr'), 'QR code');
eq('source label empty', sourceLabel(''), '');
{
    const now = Date.parse('2026-11-13T12:00:00Z');
    eq('just now', relativeTime('2026-11-13T11:59:30Z', now), 'just now');
    eq('minutes', relativeTime('2026-11-13T11:55:00Z', now), '5 min ago');
    eq('hours', relativeTime('2026-11-13T09:00:00Z', now), '3 h ago');
    eq('days', relativeTime('2026-11-11T12:00:00Z', now), '2 days ago');
    eq('bad date', relativeTime('nope', now), '');
}

// ============================================================================ photos: rows, limits, quota
const P = (id: string, tag: JobPhoto['tag'], takenAt: string, extra: Partial<JobPhoto> = {}): JobPhoto => ({
    id, jobId: 'j', storagePath: `u/j/${id}.jpg`, thumbPath: `u/j/${id}_t.jpg`, tag, caption: '', takenAt, width: 100, height: 80,
    sizeBytes: 300_000, sharedInPortal: false, portalPath: null, sourcePhotoId: null, requestId: null, createdAt: takenAt, ...extra,
});
{
    const m = mapPhotoRow({ id: 'p', job_id: 'j', storage_path: 'a', tag: 'nope', size_bytes: '123', shared_in_portal: 1, taken_at: null, created_at: '2026-01-01T00:00:00Z' });
    eq('bad tag → during', m.tag, 'during');
    eq('size parsed', m.sizeBytes, 123);
    eq('shared coerced', m.sharedInPortal, true);
    eq('takenAt falls back to created_at', m.takenAt, '2026-01-01T00:00:00Z');
    eq('missing width → null', m.width, null);
}
eq('tier mapping', [photoTier('premium'), photoTier('ai'), photoTier('free'), photoTier(null), photoTier('pro')], ['premium', 'ai', 'free', 'free', 'free']);
{
    const u = mapPhotoUsage({ tier: 'free', limits: { per_job: 30, total_bytes: 262144000 }, total_bytes: 1000, total_count: 3, job_count: 2 }, 'free');
    eq('usage mapped', [u.perJob, u.totalBytes, u.usedBytes, u.usedCount, u.jobCount], [30, 262144000, 1000, 3, 2]);
    const paid = mapPhotoUsage({ tier: 'premium', limits: { per_job: null, total_bytes: 5368709120 } }, 'free');
    eq('premium per job unlimited', paid.perJob, null);
    const fallback = mapPhotoUsage(null, 'ai');
    eq('fallback from plan table', [fallback.tier, fallback.perJob, fallback.totalBytes], ['ai', null, PHOTO_LIMITS.ai.totalBytes]);

    const free = { tier: 'free' as const, perJob: 30, totalBytes: 250 * 1024 * 1024, usedBytes: 0, usedCount: 0, jobCount: 28 };
    eq('quota: 2 of 5 fit per job', [checkPhotoQuota(free, 5, 5 * 300_000).ok, checkPhotoQuota(free, 5, 5 * 300_000).allowed], [false, 2]);
    ok('quota: per job reason', /30 photos per job/.test(checkPhotoQuota(free, 5, 1).reason));
    eq('quota: fits', checkPhotoQuota({ ...free, jobCount: 0 }, 5, 5 * 300_000), { ok: true, allowed: 5, reason: '' });
    const full = { ...free, jobCount: 0, usedBytes: free.totalBytes - 500_000 };
    eq('quota: bytes allow 1', checkPhotoQuota(full, 3, 3 * 300_000).allowed, 1);
    ok('quota: bytes reason mentions MB', /250 MB/.test(checkPhotoQuota(full, 3, 3 * 300_000).reason));
    const prem = { tier: 'premium' as const, perJob: null, totalBytes: PHOTO_LIMITS.premium.totalBytes, usedBytes: PHOTO_LIMITS.premium.totalBytes, usedCount: 1, jobCount: 1 };
    ok('quota: premium full → mentions Premium + AI', /Premium \+ AI/.test(checkPhotoQuota(prem, 1, 300_000).reason));
    eq('quota: premium full allowed 0', checkPhotoQuota(prem, 1, 300_000).allowed, 0);
}
eq('bytes', [formatBytes(0), formatBytes(2048), formatBytes(5 * 1024 * 1024), formatBytes(250 * 1024 * 1024), formatBytes(5 * 1024 ** 3)], ['0 B', '2 KB', '5.0 MB', '250 MB', '5.0 GB']);

// ============================================================================ photos: timeline
{
    const iso = (y: number, mo: number, d: number, h: number) => new Date(y, mo - 1, d, h).toISOString();
    const photos = [
        P('a', 'before', iso(2026, 11, 10, 9)),
        P('b', 'during', iso(2026, 11, 12, 14)),
        P('c', 'after', iso(2026, 11, 13, 16), { sharedInPortal: true, portalPath: 'u/x.jpg' }),
        P('d', 'issue', iso(2026, 11, 13, 8)),
        P('e', 'before', iso(2026, 11, 10, 10)),
    ];
    eq('filter before', filterPhotos(photos, 'before').map(p => p.id), ['a', 'e']);
    eq('filter shared', filterPhotos(photos, 'shared').map(p => p.id), ['c']);
    eq('filter all', filterPhotos(photos, 'all').length, 5);
    eq('counts', countByFilter(photos), { all: 5, before: 2, during: 1, after: 1, issue: 1, shared: 1 });
    eq('sorted newest first', sortPhotos(photos).map(p => p.id), ['c', 'd', 'b', 'e', 'a']);
    const groups = groupByDay(photos, new Date(2026, 10, 13, 18));
    eq('groups by local day', groups.map(g => [g.day, g.photos.map(p => p.id)]), [['2026-11-13', ['c', 'd']], ['2026-11-12', ['b']], ['2026-11-10', ['e', 'a']]]);
    eq('today / yesterday labels', groups.slice(0, 2).map(g => g.label), ['Today', 'Yesterday']);
    eq('local day of a local evening', localDay(new Date(2026, 2, 10, 23, 30).toISOString()), '2026-03-10');
    eq('default tag on empty job', defaultTagForNewPhotos([]), 'before');
    eq('default tag afterwards', defaultTagForNewPhotos(photos), 'during');
    eq('tag label', [tagLabel('after'), tagLabel('x')], ['After', 'During']);

    const pairs = pairBeforeAfter(photos);
    eq('pairs: oldest before with oldest after', pairs.map(p => [p.before?.id ?? null, p.after?.id ?? null]), [['a', 'c'], ['e', null]]);
    const withMarkup = [...photos, P('a2', 'before', iso(2026, 11, 10, 9), { sourcePhotoId: 'a' })];
    eq('pairs: marked-up copy replaces its original', pairBeforeAfter(withMarkup).map(p => p.before?.id), ['a2', 'e']);
    eq('pairs: none', pairBeforeAfter([P('x', 'during', iso(2026, 1, 1, 1))]), []);
}
{
    const uid = '0b3f6c1e-1d2a-4b4c-9d8e-7f6a5b4c3d2e';
    const job = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    const id = '11111111-2222-4333-8444-555555555555';
    const paths = photoStoragePaths(uid, job, id, 'jpg');
    const guard = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$/;
    ok('main path matches guard_job_photo pattern', guard.test(paths.main));
    ok('thumb path matches guard_job_photo pattern', guard.test(paths.thumb));
    ok('paths inside <user>/<job>/', paths.main.startsWith(`${uid}/${job}/`) && paths.thumb.startsWith(`${uid}/${job}/`));
    const portal = portalPhotoPath(uid, 'abc-DEF_123456', 'x/y/z.png');
    eq('portal path keeps ext + user folder', portal, `${uid}/abc-DEF_123456.png`);
    ok('portal path matches guard pattern', /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$/.test(portal));
    eq('portal path strips unsafe id chars', portalPhotoPath(uid, 'a/b..c<d>eeeee', 'x.jpg'), `${uid}/abcdeeeee.jpg`);
}

// ============================================================================ photo report HTML (through the PDF sanitizer)
{
    const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
    const html = buildPhotoReportHtml({
        pairs: [
            { before: { src: img, caption: '<script>alert(1)</script> wall', takenAt: '2026-11-10T09:00:00Z', tag: 'before' }, after: { src: img, caption: 'done', takenAt: '2026-11-13T09:00:00Z', tag: 'after' } },
            { before: { src: img, caption: '', takenAt: '', tag: 'before' }, after: null },
        ],
        extra: [{ src: img, caption: 'crack', takenAt: '', tag: 'issue' }],
    });
    const clean = sanitizeRichText(html);
    eq('every image survives the sanitizer', (clean.match(/<img /g) || []).length, 4);
    ok('caption escaped (no script tag)', !/<script/i.test(clean) && /&lt;script&gt;/.test(clean));
    ok('one table per pair / row', (clean.match(/<table/g) || []).length === 3);
    ok('empty side says so', /No after photo/.test(clean));
    ok('issues heading', /<h3>Issues<\/h3>/.test(clean));
    ok('table layout style kept', /table-layout: fixed/.test(clean));
    ok('https image allowed', /<img src="https:\/\/x\.supabase\.co\/a\.jpg"/.test(sanitizeRichText(buildPhotoReportHtml({ pairs: [{ before: { src: 'https://x.supabase.co/a.jpg', caption: '', takenAt: '', tag: 'before' }, after: null }] }))));
    ok('javascript: src dropped', !/javascript/i.test(sanitizeRichText(buildPhotoReportHtml({ pairs: [{ before: { src: 'javascript:alert(1)', caption: '', takenAt: '', tag: 'before' }, after: null }] }))));
    ok('empty report message', /No photos selected/.test(buildPhotoReportHtml({ pairs: [] })));
}
{
    const sign = qrSignHtml({ svg: '<svg></svg>', url: 'https://www.contractordocs.app/r/a-b-c?src=qr', company: '<b>Acme</b>', logoUrl: 'javascript:alert(1)', phone: '555' });
    ok('QR sign escapes company', sign.includes('&lt;b&gt;Acme&lt;/b&gt;') && !sign.includes('<b>Acme'));
    ok('QR sign drops unsafe logo', !/javascript:/i.test(sign));
    ok('QR sign shows short url', sign.includes('contractordocs.app/r/a-b-c<'));
}

// ============================================================================ markup geometry
eq('toNormalized center', toNormalized(150, 100, { left: 100, top: 50, width: 100, height: 100 }), [0.5, 0.5]);
eq('toNormalized clamps', toNormalized(-50, 999, { left: 0, top: 0, width: 100, height: 100 }), [0, 1]);
eq('clamp NaN', clamp01(NaN), 0);
eq('stroke width floor', strokeWidthFor(100, 100), 3);
eq('stroke width scales', strokeWidthFor(1600, 1200), 10);
eq('font size floor', fontSizeFor(100, 100), 16);
{
    const [a, b] = arrowHead(0, 0, 100, 0, 10);
    near('arrow head left x', a[0], 100 - 10 * Math.cos(Math.PI / 7));
    near('arrow head symmetric', a[1], -b[1]);
    ok('arrow head behind the tip', a[0] < 100 && b[0] < 100);
}
eq('ellipse from reversed drag', ellipseFromBox(10, 40, 0, 0), { cx: 5, cy: 20, rx: 5, ry: 20 });
ok('tap is not an arrow', isTinyShape({ kind: 'arrow', x1: 0.5, y1: 0.5, x2: 0.501, y2: 0.5, color: '#f00' }));
ok('drag is an arrow', !isTinyShape({ kind: 'arrow', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4, color: '#f00' }));
ok('one point is no stroke', isTinyShape({ kind: 'pen', points: [[0.1, 0.1]], color: '#f00' }));
ok('blank text is nothing', isTinyShape({ kind: 'text', x: 0.1, y: 0.1, text: '  ', color: '#f00' }));
eq('fit landscape', fitSize(4000, 3000, 1600), { width: 1600, height: 1200 });
eq('fit portrait', fitSize(3000, 4000, 1600), { width: 1200, height: 1600 });
eq('fit never upscales', fitSize(800, 600, 1600), { width: 800, height: 600 });
{
    const pts: Array<[number, number]> = [[0, 0], [0.001, 0], [0.002, 0], [0.01, 0], [0.0105, 0]];
    eq('simplify keeps first, far points and the end', simplifyStroke(pts), [[0, 0], [0.01, 0], [0.0105, 0]]);
}
eq('outline for black', outlineFor('#111827'), 'rgba(255,255,255,0.85)');
{
    const calls: string[] = [];
    const ctx: any = new Proxy({}, {
        get: (target: any, prop: string) => (prop in target ? target[prop] : (...args: unknown[]) => { calls.push(`${prop}(${args.map(a => (typeof a === 'number' ? Math.round(a) : a)).join(',')})`); }),
        set: (target: any, prop: string, value: unknown) => { target[prop] = value; return true; },
    });
    const shapes: MarkupShape[] = [
        { kind: 'arrow', x1: 0, y1: 0, x2: 0.5, y2: 0.5, color: '#ef4444' },
        { kind: 'circle', x1: 0.2, y1: 0.2, x2: 0.4, y2: 0.6, color: '#facc15' },
        { kind: 'text', x: 0.1, y: 0.9, text: 'Crack', color: '#ffffff' },
        { kind: 'pen', points: [[0, 0], [1, 1]], color: '#111827' },
    ];
    drawShapes(ctx, shapes, 1000, 500);
    ok('arrow line drawn in pixels', calls.includes('lineTo(500,250)'));
    ok('arrow head filled', calls.filter(c => c === 'fill()').length === 1);
    ok('circle drawn at its center', calls.some(c => c.startsWith('ellipse(300,200,100,100')));
    ok('label drawn with outline', calls.includes('strokeText(Crack,100,450)') && calls.includes('fillText(Crack,100,450)'));
    ok('stroke drawn', calls.includes('lineTo(1000,500)'));
    eq('save/restore balanced', calls.filter(c => c === 'save()').length, calls.filter(c => c === 'restore()').length);
}

// ============================================================================ migration lint
{
    const here = dirname(fileURLToPath(import.meta.url));
    const sql = readFileSync(join(here, '..', 'supabase', 'migrations', '20261113000400_requests_and_job_photos.sql'), 'utf8');
    const noComments = sql.replace(/--[^\n]*/g, '');
    const created = Array.from(noComments.matchAll(/create or replace function public\.(\w+)\s*\(/g)).map(m => m[1]);
    const loop = /p\.proname = any \(array\[([\s\S]*?)\]\)/.exec(noComments)?.[1] || '';
    const revoked = Array.from(loop.matchAll(/'(\w+)'/g)).map(m => m[1]);
    eq('every new function is in the revoke list', created.filter(f => !revoked.includes(f)), []);
    eq('revoke list has no unknown names', revoked.filter(f => !created.includes(f)), []);
    const granted = Array.from(noComments.matchAll(/grant execute on function public\.(\w+)\(/g)).map(m => m[1]);
    eq('grants only for functions of this migration', granted.filter(f => !created.includes(f)), []);
    ok('trigger / helper functions are not granted', !granted.some(f => ['guard_job_photo', 'enqueue_storage_cleanup', '_new_request_slug', '_clean_multiline'].includes(f)));
    for (const f of ['get_request_page', 'submit_quote_request', 'can_upload_request_photo', 'get_portal_photos']) {
        ok(`${f} callable by anon`, new RegExp(`grant execute on function public\\.${f}\\([^;]*to anon, authenticated;`).test(noComments));
    }
    for (const f of ['convert_quote_request', 'get_my_request_page', 'update_request_page', 'regenerate_request_slug', 'get_photo_usage']) {
        ok(`${f} only for signed-in users`, new RegExp(`grant execute on function public\\.${f}\\([^;]*to authenticated;`).test(noComments)
            && !new RegExp(`grant execute on function public\\.${f}\\([^;]*anon`).test(noComments));
    }
    const definers = Array.from(noComments.matchAll(/create or replace function public\.(\w+)[\s\S]*?\$\$;/g));
    ok('every function pins search_path', definers.every(m => /set search_path = ''/.test(m[0])));

    // additive only: nothing dropped, no existing table altered or rewritten
    const newTables = Array.from(noComments.matchAll(/create table if not exists public\.(\w+)/g)).map(m => m[1]);
    eq('new tables', newTables.sort(), ['job_photos', 'quote_requests', 'request_pages', 'request_rate_events', 'storage_cleanup_queue']);
    ok('no drop table / column / function', !/\bdrop\s+(table|column|function|schema|view)\b/i.test(noComments));
    const altered = Array.from(noComments.matchAll(/alter table (?:if exists )?public\.(\w+)/g)).map(m => m[1]);
    eq('only new tables altered', altered.filter(t => !newTables.includes(t)), []);
    const written = Array.from(noComments.matchAll(/\b(?:update|delete from|insert into|truncate)\s+public\.(\w+)/g)).map(m => m[1]);
    eq('existing tables written only by conversion (clients, jobs)', Array.from(new Set(written.filter(t => !newTables.includes(t)))).sort(), ['clients', 'jobs']);
    ok('clients/jobs are only inserted (never updated or deleted)', !/\b(update|delete from)\s+public\.(clients|jobs|documents|profiles)\b/.test(noComments));
    ok('every new table has RLS', newTables.every(t => new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(noComments)));
    ok('anon has no table privileges', /revoke all on public\.request_pages, public\.quote_requests, public\.request_rate_events, public\.job_photos,\s*public\.storage_cleanup_queue from anon;/.test(noComments));
    ok('rate events are server only', /revoke all on public\.request_rate_events from authenticated;/.test(noComments));
    ok('existing buckets untouched', !/\('(logos|forum|price-book-images|signatures|document-assets)'/.test(noComments));

    // numbers shared with TypeScript
    ok('slug regex in sync', noComments.includes(`'${REQUEST_SLUG_RE.source}'`));
    ok('photo count in sync', noComments.includes(`cardinality(photo_paths) <= ${MAX_REQUEST_PHOTOS}`));
    ok('fill time in sync', noComments.includes(`p_elapsed_ms < ${MIN_FILL_MS}`));
    ok('request photo size in sync', noComments.includes(`('request-photos', 'request-photos', false, ${MAX_REQUEST_PHOTO_BYTES}`));
    ok('free photo cap in sync', noComments.includes(`jsonb_build_object('per_job', ${PHOTO_LIMITS.free.perJob},   'total_bytes', ${PHOTO_LIMITS.free.totalBytes})`));
    ok('premium photo cap in sync', noComments.includes(`'total_bytes', ${PHOTO_LIMITS.premium.totalBytes})`));
    ok('ai photo cap in sync', noComments.includes(`'total_bytes', ${PHOTO_LIMITS.ai.totalBytes})`));
    ok('details length in sync', noComments.includes(`length(details) <= ${REQUEST_LIMITS.details}`));
    ok('intro length in sync', noComments.includes(`length(intro) <= ${REQUEST_LIMITS.intro}`));
}

console.log(`${failures ? 'FAILED' : 'OK'}: ${passes} passed, ${failures} failed (TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
if (failures) process.exit(1);
