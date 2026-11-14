/**
 * Request-a-quote: pure helpers (no React, no Supabase), shared by the public page (/r/<slug>), the dashboard
 * inbox and the link settings. Tested by scripts/requests-photos-check.ts.
 * The server rules live in supabase/migrations/20261113000400_requests_and_job_photos.sql; keep both in sync.
 */

/** Same pattern as request_pages.slug (3-48 chars, lowercase letters, digits and inner dashes). */
export const REQUEST_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;
export const REQUEST_PATH_PREFIX = '/r/';
export const MAX_REQUEST_PHOTOS = 5;
/** request-photos bucket file_size_limit */
export const MAX_REQUEST_PHOTO_BYTES = 4 * 1024 * 1024;
/** Faster than this is not a person filling the form (the server applies the same rule). */
export const MIN_FILL_MS = 2500;

export const REQUEST_LIMITS = {
    name: 120,
    phone: 40,
    email: 254,
    address: 300,
    details: 3000,
    intro: 400,
} as const;

/**
 * `/r/<slug>` → the slug (lowercased, may be '' or invalid: the page then says "not found");
 * any other path → null (not a request page).
 */
export const requestSlugFromPath = (pathname: string): string | null => {
    let p = pathname || '';
    try { p = decodeURIComponent(p); } catch { /* keep raw */ }
    if (!p.toLowerCase().startsWith(REQUEST_PATH_PREFIX)) return null;
    const rest = p.slice(REQUEST_PATH_PREFIX.length).replace(/\/+$/, '');
    if (rest.includes('/')) return '';
    return rest.trim().toLowerCase();
};

export const isValidSlug = (slug: string | null | undefined): slug is string => !!slug && REQUEST_SLUG_RE.test(slug);

/** Public link. `source` is added as ?src= so the inbox can tell QR scans from link clicks. */
export const requestPageUrl = (origin: string, slug: string, source?: 'qr' | 'link'): string => {
    const base = String(origin || '').replace(/\/+$/, '');
    return `${base}${REQUEST_PATH_PREFIX}${encodeURIComponent(slug)}${source ? `?src=${source}` : ''}`;
};

/** ?src=qr|link|google… → a short tag stored with the request ('' when absent). */
export const sourceFromSearch = (search: string): string => {
    try {
        const raw = new URLSearchParams(search || '').get('src') || '';
        return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
    } catch {
        return '';
    }
};

// ---------------------------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------------------------
export interface RequestFormValues {
    name: string;
    phone: string;
    email: string;
    address: string;
    details: string;
    /** Honeypot: hidden from people, filled by bots. Must stay empty. */
    website: string;
}

export type RequestFormErrors = Partial<Record<'name' | 'contact' | 'email' | 'phone' | 'details' | 'photos', string>>;

export const EMPTY_REQUEST_FORM: RequestFormValues = { name: '', phone: '', email: '', address: '', details: '', website: '' };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const phoneDigits = (phone: string): string => String(phone || '').replace(/\D/g, '');

/** Client-side check with the same rules as submit_quote_request (the server checks again). */
export const validateRequestForm = (v: RequestFormValues, photoCount = 0): RequestFormErrors => {
    const errors: RequestFormErrors = {};
    const name = v.name.trim();
    const phone = v.phone.trim();
    const email = v.email.trim();
    if (!name) errors.name = 'Please enter your name.';
    else if (name.length > REQUEST_LIMITS.name) errors.name = `Please keep the name under ${REQUEST_LIMITS.name} characters.`;
    if (!phone && !email) errors.contact = 'Please enter a phone number or an email address so we can reach you.';
    if (email && (!EMAIL_RE.test(email) || email.length > REQUEST_LIMITS.email)) errors.email = 'Please check the email address.';
    if (phone) {
        const digits = phoneDigits(phone).length;
        if (digits < 6 || digits > 20 || phone.length > REQUEST_LIMITS.phone || /[a-z]/i.test(phone.replace(/\b(ext|x)\b\.?/gi, ''))) {
            errors.phone = 'Please check the phone number.';
        }
    }
    const details = v.details.trim();
    if (details.length < 3) errors.details = 'Please tell us what you need.';
    else if (details.length > REQUEST_LIMITS.details) errors.details = `Please keep this under ${REQUEST_LIMITS.details} characters.`;
    if (photoCount > MAX_REQUEST_PHOTOS) errors.photos = `You can add up to ${MAX_REQUEST_PHOTOS} photos.`;
    return errors;
};

export const hasErrors = (e: RequestFormErrors): boolean => Object.values(e).some(Boolean);

/** Honeypot filled, or the form was sent faster than a person can type it. */
export const isLikelyBot = (v: Pick<RequestFormValues, 'website'>, elapsedMs: number): boolean =>
    v.website.trim() !== '' || (Number.isFinite(elapsedMs) && elapsedMs < MIN_FILL_MS);

/** File extension the server accepts for a photo type, or null. */
export const photoExtension = (mime: string): 'jpg' | 'png' | 'webp' | null => {
    const m = String(mime || '').toLowerCase();
    if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
    if (m === 'image/png') return 'png';
    if (m === 'image/webp') return 'webp';
    return null;
};

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------
type ErrLike = { message?: string; code?: string; hint?: string; details?: string } | string | null | undefined;

const errText = (e: ErrLike): string => (typeof e === 'string' ? e : String(e?.message || ''));
const errCode = (e: ErrLike): string => (typeof e === 'string' ? '' : String(e?.code || ''));

/**
 * The database objects of this feature don't exist yet (migration not applied): table / function / bucket missing.
 * The UI then hides the feature or says it's coming, instead of showing a raw error.
 */
export const isMissingBackendError = (e: ErrLike): boolean => {
    if (!e) return false;
    if (typeof e === 'object' && (e as { name?: string }).name === 'FeatureUnavailableError') return true;
    const code = errCode(e);
    if (['42P01', '42883', 'PGRST202', 'PGRST205', 'PGRST200', 'PGRST106'].includes(code)) return true;
    return /does not exist|could not find the (function|table)|schema cache|bucket not found/i.test(errText(e));
};

export type RequestErrorKind = 'rate_limit' | 'disabled' | 'not_found' | 'invalid' | 'network' | 'unavailable' | 'unknown';

export const classifyRequestError = (e: ErrLike): { kind: RequestErrorKind; message: string } => {
    const msg = errText(e);
    const code = errCode(e);
    if (isMissingBackendError(e)) return { kind: 'unavailable', message: 'This page is not available yet. Please try again later.' };
    if (/RATE_LIMIT/i.test(msg)) return { kind: 'rate_limit', message: msg.replace(/^.*?RATE_LIMIT:?\s*/i, '') || 'Too many requests. Please try again later.' };
    if (/not taking online requests/i.test(msg) || (typeof e === 'object' && e?.hint === 'disabled')) {
        return { kind: 'disabled', message: 'This business is not taking online requests right now.' };
    }
    if (code === 'P0002' || /request page not found/i.test(msg)) return { kind: 'not_found', message: 'This request page does not exist. Check the link and try again.' };
    if (code === '22023') return { kind: 'invalid', message: msg || 'Please check the form and try again.' };
    if (/failed to fetch|networkerror|load failed|network|you'?re offline|needs a connection/i.test(msg)) return { kind: 'network', message: 'No connection. Check your internet and try again; nothing you typed was lost.' };
    return { kind: 'unknown', message: 'Something went wrong. Please try again in a moment.' };
};

// ---------------------------------------------------------------------------------------------
// Inbox helpers
// ---------------------------------------------------------------------------------------------
export type QuoteRequestStatus = 'new' | 'seen' | 'converted' | 'archived';

export interface QuoteRequest {
    id: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    details: string;
    photoPaths: string[];
    source: string;
    status: QuoteRequestStatus;
    clientId: string | null;
    jobId: string | null;
    convertedAt: string | null;
    createdAt: string;
}

const STATUSES: QuoteRequestStatus[] = ['new', 'seen', 'converted', 'archived'];

export const mapQuoteRequestRow = (r: any): QuoteRequest => ({
    id: String(r?.id || ''),
    name: String(r?.name || '').trim() || 'Unnamed',
    phone: String(r?.phone || ''),
    email: String(r?.email || ''),
    address: String(r?.address || ''),
    details: String(r?.details || ''),
    photoPaths: Array.isArray(r?.photo_paths) ? r.photo_paths.filter((p: unknown) => typeof p === 'string' && p) : [],
    source: String(r?.source || ''),
    status: STATUSES.includes(r?.status) ? r.status : 'new',
    clientId: r?.client_id ?? null,
    jobId: r?.job_id ?? null,
    convertedAt: r?.converted_at ?? null,
    createdAt: String(r?.created_at || ''),
});

/** First line of the details, cut at a word boundary. */
export const requestSnippet = (details: string, max = 80): string => {
    const line = String(details || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
    if (line.length <= max) return line;
    const cut = line.slice(0, max);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:-]+$/, '')}…`;
};

/** Default name of the job created from a request: what they need (short), else "Quote request - <name>". */
export const jobNameFromRequest = (req: Pick<QuoteRequest, 'name' | 'details'>): string => {
    const snippet = requestSnippet(req.details, 48).replace(/…$/, '').trim();
    const what = snippet ? snippet.charAt(0).toUpperCase() + snippet.slice(1) : '';
    return (what || `Quote request - ${req.name}`).slice(0, 120);
};

export const sourceLabel = (source: string): string => {
    switch ((source || '').toLowerCase()) {
        case 'qr': return 'QR code';
        case 'link': return 'Request link';
        case 'google': return 'Google profile';
        case 'facebook': return 'Facebook';
        case 'website': return 'Website';
        case '': return '';
        default: return source;
    }
};

/** Message handed to the AI assistant ("Draft an estimate"): only what the client wrote, plus the instruction. */
export const buildEstimatePrompt = (req: Pick<QuoteRequest, 'name' | 'phone' | 'email' | 'address' | 'details' | 'photoPaths'>, photosAttached = 0): string => {
    const contact = [
        `Client: ${req.name}`,
        req.phone ? `Phone: ${req.phone}` : '',
        req.email ? `Email: ${req.email}` : '',
        req.address ? `Job address: ${req.address.replace(/\s*\n\s*/g, ', ')}` : '',
    ].filter(Boolean).join('\n');
    const parts = [
        'Draft an estimate for this quote request from my request page. Use my price book where it fits, keep it as a draft for me to review, and list anything I should check on site.',
        contact,
        `What they need:\n${req.details.trim() || '(not described)'}`,
    ];
    if (photosAttached > 0) parts.push(`(${photosAttached} of their photos are attached.)`);
    return parts.join('\n\n');
};

// ---------------------------------------------------------------------------------------------
// Contact links (only safe schemes)
// ---------------------------------------------------------------------------------------------
export const telHref = (phone: string): string => {
    const cleaned = String(phone || '').replace(/[^\d+]/g, '');
    return cleaned.replace(/\D/g, '').length >= 6 ? `tel:${cleaned}` : '';
};

export const smsHref = (phone: string): string => {
    const tel = telHref(phone);
    return tel ? tel.replace(/^tel:/, 'sms:') : '';
};

export const mailHref = (email: string, subject?: string): string => {
    const e = String(email || '').trim();
    if (!EMAIL_RE.test(e)) return '';
    return `mailto:${e}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
};

export const mapsHref = (address: string): string => {
    const a = String(address || '').replace(/\s+/g, ' ').trim();
    return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : '';
};

/** "just now", "5 min ago", "3 h ago", "2 days ago", else a short date. */
export const relativeTime = (iso: string, now = Date.now()): string => {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d} ${d === 1 ? 'day' : 'days'} ago`;
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
};
