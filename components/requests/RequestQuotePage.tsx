/**
 * Public "Request a quote" page: /r/<slug> (no login). Rendered straight from index.tsx in its own small chunk
 * (the app itself is not loaded), mobile-first, branded with the contractor's logo and company name.
 * Spam protection: hidden honeypot field + fill-time check + server rate limit (submit_quote_request); photos
 * are compressed here (≤1600 px) and uploaded only to the paths the server hands out.
 * Free plan pages show "Powered by ContractorDocs"; paid plans don't.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { compressImage, describeImageError } from '../../utils/imageCompression.ts';
import { CameraIcon, CheckCircleIcon, GlobeIcon, MailIcon, PhoneIcon } from '../Icons.tsx';
import {
    EMPTY_REQUEST_FORM, MAX_REQUEST_PHOTOS, MAX_REQUEST_PHOTO_BYTES, MIN_FILL_MS, REQUEST_LIMITS, classifyRequestError, hasErrors,
    isLikelyBot, isValidSlug, mailHref, photoExtension, sourceFromSearch, telHref, validateRequestForm,
    type RequestFormErrors, type RequestFormValues,
} from './requestLogic.ts';
import { fetchRequestPage, submitQuoteRequest, uploadRequestPhotos, type PublicRequestPage } from './requestsApi.ts';
import { blobToCanvas } from '../photos/photosApi.ts';

interface PickedPhoto { id: string; file: File; url: string }

type LoadState =
    | { status: 'loading' }
    | { status: 'ready'; page: PublicRequestPage }
    | { status: 'error'; kind: 'not_found' | 'unavailable' | 'network' | 'unknown'; message: string };

const companyOf = (p: PublicRequestPage) => p.contractor.companyName || p.contractor.name || 'Your contractor';

const websiteHref = (w: string): string => {
    const v = (w || '').trim();
    if (!v) return '';
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try { return new URL(url).protocol.startsWith('http') ? url : ''; } catch { return ''; }
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const Brand: React.FC<{ page: PublicRequestPage | null }> = ({ page }) => {
    const name = page ? companyOf(page) : '';
    const logo = page?.contractor.logoUrl && /^https:\/\//i.test(page.contractor.logoUrl) ? page.contractor.logoUrl : '';
    return (
        <header className="border-b border-border bg-card">
            <div className="mx-auto flex min-h-[64px] w-full max-w-xl items-center gap-3 px-4 py-3">
                {logo ? (
                    <img src={logo} alt={`${name} logo`} referrerPolicy="no-referrer" className="h-11 w-auto max-w-[140px] shrink-0 rounded-md bg-white object-contain" />
                ) : name ? (
                    <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">{initials(name)}</span>
                ) : null}
                <p className="min-w-0 truncate text-base font-bold text-foreground">{name}</p>
            </div>
        </header>
    );
};

const Footer: React.FC<{ branded: boolean }> = ({ branded }) => (
    <footer className="px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 text-center text-xs text-muted-foreground">
        {branded ? (
            <a href="/?ref=request-page" className="inline-flex min-h-[44px] items-center gap-1 hover:text-foreground">
                Powered by <span className="font-semibold text-foreground">ContractorDocs</span>
            </a>
        ) : null}
    </footer>
);

const ContactLinks: React.FC<{ page: PublicRequestPage }> = ({ page }) => {
    const tel = telHref(page.contractor.phone);
    const mail = mailHref(page.contractor.email);
    const web = websiteHref(page.contractor.website);
    if (!tel && !mail && !web) return null;
    return (
        <div className="flex flex-wrap gap-2">
            {tel && <a href={tel} className="btn btn-outline min-h-[44px]"><PhoneIcon className="h-4 w-4" /> {page.contractor.phone}</a>}
            {mail && <a href={mail} className="btn btn-outline min-h-[44px] max-w-full"><MailIcon className="h-4 w-4 shrink-0" /> <span className="truncate">{page.contractor.email}</span></a>}
            {web && <a href={web} target="_blank" rel="noopener noreferrer" className="btn btn-outline min-h-[44px]"><GlobeIcon className="h-4 w-4" /> Website</a>}
        </div>
    );
};

const FieldError: React.FC<{ id: string; children?: React.ReactNode }> = ({ id, children }) =>
    children ? <p id={id} className="mt-1.5 text-sm font-medium text-destructive">{children}</p> : null;

/** Compress a picked photo; the result is always JPG / PNG / WebP under the bucket limit. */
const preparePickedPhoto = async (file: File): Promise<File> => {
    let out = await compressImage(file);
    if (!photoExtension(out.type)) {
        const { canvas } = await blobToCanvas(out, 1600);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process the photo.'))), 'image/jpeg', 0.85));
        out = new File([blob], 'photo.jpg', { type: 'image/jpeg', lastModified: Date.now() });
    }
    if (out.size > MAX_REQUEST_PHOTO_BYTES) throw new Error('That photo is too large. Please choose a smaller one.');
    return out;
};

const RequestQuotePage: React.FC<{ slug: string }> = ({ slug }) => {
    const [load, setLoad] = useState<LoadState>({ status: 'loading' });
    const [values, setValues] = useState<RequestFormValues>(EMPTY_REQUEST_FORM);
    const [errors, setErrors] = useState<RequestFormErrors>({});
    const [touched, setTouched] = useState(false);
    const [photos, setPhotos] = useState<PickedPhoto[]>([]);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [photoError, setPhotoError] = useState('');
    const [phase, setPhase] = useState<'form' | 'sending' | 'uploading' | 'done'>('form');
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [submitError, setSubmitError] = useState('');
    const [result, setResult] = useState<{ photosFailed: number; firstName: string } | null>(null);
    const startedAt = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());
    const fileRef = useRef<HTMLInputElement>(null);
    const photosRef = useRef(photos);
    photosRef.current = photos;
    const source = useMemo(() => sourceFromSearch(typeof window !== 'undefined' ? window.location.search : '') || 'link', []);

    useEffect(() => () => photosRef.current.forEach(p => URL.revokeObjectURL(p.url)), []);

    const loadPage = async () => {
        if (!isValidSlug(slug)) {
            setLoad({ status: 'error', kind: 'not_found', message: 'This request link does not exist. Check the link and try again.' });
            return;
        }
        setLoad({ status: 'loading' });
        try {
            const page = await fetchRequestPage(slug);
            setLoad({ status: 'ready', page });
        } catch (error) {
            const c = classifyRequestError(error as any);
            const kind = c.kind === 'not_found' || c.kind === 'unavailable' || c.kind === 'network' ? c.kind : 'unknown';
            setLoad({ status: 'error', kind, message: c.message });
        }
    };

    useEffect(() => { void loadPage(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

    useEffect(() => {
        if (load.status !== 'ready') return;
        const prev = document.title;
        document.title = `Request a quote · ${companyOf(load.page)}`;
        return () => { document.title = prev; };
    }, [load]);

    const set = (key: keyof RequestFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const next = { ...values, [key]: e.target.value };
        setValues(next);
        if (touched) setErrors(validateRequestForm(next, photos.length));
    };

    const addPhotos = async (list: FileList | null) => {
        if (!list || !list.length) return;
        setPhotoError('');
        const room = MAX_REQUEST_PHOTOS - photos.length;
        const files = Array.from(list).slice(0, Math.max(0, room));
        if (list.length > room) setPhotoError(`You can add up to ${MAX_REQUEST_PHOTOS} photos.`);
        setPhotoBusy(true);
        const added: PickedPhoto[] = [];
        for (const f of files) {
            try {
                const prepared = await preparePickedPhoto(f);
                added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: prepared, url: URL.createObjectURL(prepared) });
            } catch (error) {
                setPhotoError(describeImageError(error));
            }
        }
        setPhotos(prev => [...prev, ...added].slice(0, MAX_REQUEST_PHOTOS));
        setPhotoBusy(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    const removePhoto = (id: string) => {
        setPhotos(prev => {
            const p = prev.find(x => x.id === id);
            if (p) URL.revokeObjectURL(p.url);
            return prev.filter(x => x.id !== id);
        });
        setPhotoError('');
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (load.status !== 'ready' || phase === 'sending' || phase === 'uploading') return;
        setTouched(true);
        setSubmitError('');
        const v = validateRequestForm(values, photos.length);
        setErrors(v);
        if (hasErrors(v)) {
            const first = ['name', 'contact', 'email', 'phone', 'details'].find(k => (v as any)[k]);
            const el = document.getElementById(first === 'contact' ? 'rq-phone' : `rq-${first}`);
            el?.focus();
            return;
        }
        const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const firstName = values.name.trim().split(/\s+/)[0] || '';
        setPhase('sending');
        // A person who fills the form very fast (autofill + paste) is never mistaken for a bot: wait out the minimum.
        if (!values.website && clock() - startedAt.current < MIN_FILL_MS) {
            await new Promise(r => setTimeout(r, MIN_FILL_MS - (clock() - startedAt.current) + 150));
        }
        const elapsedMs = clock() - startedAt.current;
        try {
            const { uploadPaths } = await submitQuoteRequest({ slug, values, photos: photos.map(p => p.file), source, elapsedMs });
            let photosFailed = 0;
            if (uploadPaths.length && !isLikelyBot(values, elapsedMs)) {
                setPhase('uploading');
                setProgress({ done: 0, total: uploadPaths.length });
                const up = await uploadRequestPhotos(uploadPaths, photos.map(p => p.file), (done, total) => setProgress({ done, total }));
                photosFailed = up.failed;
            }
            setResult({ photosFailed, firstName });
            setPhase('done');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            const c = classifyRequestError(error as any);
            setSubmitError(c.message);
            setPhase('form');
        }
    };

    const resetForm = () => {
        photos.forEach(p => URL.revokeObjectURL(p.url));
        setPhotos([]);
        setValues(EMPTY_REQUEST_FORM);
        setErrors({});
        setTouched(false);
        setResult(null);
        setSubmitError('');
        startedAt.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
        setPhase('form');
    };

    // ---------------------------------------------------------------------------------- states
    if (load.status === 'loading') {
        return (
            <div className="flex min-h-screen flex-col bg-background" aria-busy="true">
                <div className="border-b border-border bg-card"><div className="mx-auto flex h-16 max-w-xl items-center gap-3 px-4"><div className="skeleton h-11 w-11 rounded-full" /><div className="skeleton h-4 w-40" /></div></div>
                <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-8">
                    <div className="skeleton h-8 w-2/3" />
                    <div className="skeleton h-4 w-full" />
                    <div className="skeleton h-12 w-full" />
                    <div className="skeleton h-12 w-full" />
                    <div className="skeleton h-28 w-full" />
                </main>
            </div>
        );
    }

    if (load.status === 'error') {
        return (
            <div className="flex min-h-screen flex-col bg-background text-foreground">
                <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
                    <h1 className="text-2xl font-bold tracking-tight">{load.kind === 'network' ? 'No connection' : 'This link doesn’t work'}</h1>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{load.message}</p>
                    {(load.kind === 'network' || load.kind === 'unknown') && (
                        <button type="button" className="btn btn-primary mt-6 min-h-[48px] w-full" onClick={() => void loadPage()}>Try again</button>
                    )}
                </main>
                <Footer branded />
            </div>
        );
    }

    const page = load.page;
    const company = companyOf(page);

    if (!page.enabled) {
        return (
            <div className="flex min-h-screen flex-col bg-background text-foreground">
                <Brand page={page} />
                <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
                    <h1 className="text-2xl font-bold tracking-tight">Online requests are paused</h1>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{company} isn’t taking requests through this page right now. You can still reach them directly:</p>
                    <div className="mt-5"><ContactLinks page={page} /></div>
                </main>
                <Footer branded={page.branded} />
            </div>
        );
    }

    if (phase === 'done' && result) {
        return (
            <div className="flex min-h-screen flex-col bg-background text-foreground">
                <Brand page={page} />
                <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10" aria-live="polite">
                    <CheckCircleIcon className="h-10 w-10 text-success" aria-hidden />
                    <h1 className="mt-3 text-2xl font-bold tracking-tight">Request sent</h1>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                        {result.firstName ? `Thanks, ${result.firstName}. ` : 'Thank you. '}{company} received your request and will get back to you soon.
                    </p>
                    {result.photosFailed > 0 && (
                        <p className="mt-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                            {result.photosFailed === 1 ? 'One photo' : `${result.photosFailed} photos`} didn’t upload. Your request was still sent; you can share the photos when {company} contacts you.
                        </p>
                    )}
                    <div className="mt-6"><ContactLinks page={page} /></div>
                    <button type="button" className="btn btn-ghost mt-6 min-h-[44px] px-0 text-primary" onClick={resetForm}>Send another request</button>
                </main>
                <Footer branded={page.branded} />
            </div>
        );
    }

    const busy = phase === 'sending' || phase === 'uploading';
    const detailsLeft = REQUEST_LIMITS.details - values.details.length;

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
            <Brand page={page} />
            <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-6 pt-6 sm:pt-10">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Request a quote</h1>
                <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                    {page.intro || `Tell ${company} what you need. Photos help them give you a better price.`}
                </p>

                <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
                    <div>
                        <label htmlFor="rq-name" className="label">Your name</label>
                        <input id="rq-name" className="input min-h-[48px] text-base" autoComplete="name" value={values.name} onChange={set('name')}
                            maxLength={REQUEST_LIMITS.name} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'rq-name-err' : undefined} disabled={busy} />
                        <FieldError id="rq-name-err">{errors.name}</FieldError>
                    </div>

                    <fieldset>
                        <legend className="label">How can we reach you?</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label htmlFor="rq-phone" className="sr-only">Phone</label>
                                <input id="rq-phone" type="tel" inputMode="tel" className="input min-h-[48px] text-base" placeholder="Phone" autoComplete="tel"
                                    value={values.phone} onChange={set('phone')} maxLength={REQUEST_LIMITS.phone} disabled={busy}
                                    aria-invalid={!!(errors.phone || errors.contact)} aria-describedby={errors.phone ? 'rq-phone-err' : errors.contact ? 'rq-contact-err' : undefined} />
                                <FieldError id="rq-phone-err">{errors.phone}</FieldError>
                            </div>
                            <div>
                                <label htmlFor="rq-email" className="sr-only">Email</label>
                                <input id="rq-email" type="email" inputMode="email" className="input min-h-[48px] text-base" placeholder="Email" autoComplete="email"
                                    value={values.email} onChange={set('email')} maxLength={REQUEST_LIMITS.email} disabled={busy}
                                    aria-invalid={!!(errors.email || errors.contact)} aria-describedby={errors.email ? 'rq-email-err' : errors.contact ? 'rq-contact-err' : undefined} />
                                <FieldError id="rq-email-err">{errors.email}</FieldError>
                            </div>
                        </div>
                        {errors.contact ? <FieldError id="rq-contact-err">{errors.contact}</FieldError> : <p className="mt-1.5 text-xs text-muted-foreground">Phone or email, whichever you prefer.</p>}
                    </fieldset>

                    <div>
                        <label htmlFor="rq-address" className="label">Job address <span className="font-normal normal-case tracking-normal">(optional)</span></label>
                        <textarea id="rq-address" rows={2} className="input text-base" autoComplete="street-address" value={values.address} onChange={set('address')}
                            maxLength={REQUEST_LIMITS.address} disabled={busy} />
                    </div>

                    <div>
                        <label htmlFor="rq-details" className="label">What do you need?</label>
                        <textarea id="rq-details" rows={5} className="input text-base" value={values.details} onChange={set('details')}
                            placeholder="For example: replace the kitchen faucet and fix a leak under the sink. Best days: weekday mornings."
                            maxLength={REQUEST_LIMITS.details} disabled={busy} aria-invalid={!!errors.details} aria-describedby={errors.details ? 'rq-details-err' : undefined} />
                        <div className="flex items-start justify-between gap-3">
                            <FieldError id="rq-details-err">{errors.details}</FieldError>
                            {detailsLeft < 300 && <p className="ml-auto mt-1.5 text-xs tabular-nums text-muted-foreground">{detailsLeft} left</p>}
                        </div>
                    </div>

                    <div>
                        <p className="label">Photos <span className="font-normal normal-case tracking-normal">(optional, up to {MAX_REQUEST_PHOTOS})</span></p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {photos.map((p, i) => (
                                <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                                    <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                                    <button type="button" onClick={() => removePhoto(p.id)} disabled={busy}
                                        className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-lg leading-none text-white"
                                        aria-label={`Remove photo ${i + 1}`}>×</button>
                                </div>
                            ))}
                            {photos.length < MAX_REQUEST_PHOTOS && (
                                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || photoBusy}
                                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary">
                                    {photoBusy ? <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <CameraIcon className="h-6 w-6" />}
                                    <span>{photoBusy ? 'Adding…' : 'Add photos'}</span>
                                </button>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void addPhotos(e.target.files)} />
                        {(photoError || errors.photos) && <p className="mt-1.5 text-sm font-medium text-destructive">{photoError || errors.photos}</p>}
                    </div>

                    {/* Honeypot: people never see or fill this field; bots that fill every input are ignored. */}
                    <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
                        <label htmlFor="rq-website">Website</label>
                        <input id="rq-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
                    </div>

                    {submitError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">{submitError}</p>}

                    <button type="submit" className="btn btn-primary btn-lg min-h-[52px] w-full" disabled={busy || photoBusy}>
                        {busy && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
                        {phase === 'sending' ? 'Sending…' : phase === 'uploading' ? `Uploading photos ${progress.done}/${progress.total}…` : 'Send request'}
                    </button>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Your details go only to {company}, who will use them to answer this request.
                    </p>
                </form>

                {(page.contractor.phone || page.contractor.email || page.contractor.website) && (
                    <section className="mt-10 border-t border-border pt-6" aria-label={`Contact ${company}`}>
                        <p className="mb-3 text-sm font-semibold">Prefer to talk first?</p>
                        <ContactLinks page={page} />
                    </section>
                )}
            </main>
            <Footer branded={page.branded} />
        </div>
    );
};

export default RequestQuotePage;
