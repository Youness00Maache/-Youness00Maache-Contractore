/**
 * The client's feedback page: /feedback/<token> (no login, no app shell, its own small chunk; index.tsx).
 * Phone-first: the contractor's name and logo, the job, a big 1-5 star picker (tap, or arrow keys), an optional comment
 * and name, Send. No third-party scripts; the page asks the database for the contractor's name and logo only, never an
 * id, email, phone or note (lib/feedback/feedbackApi.ts loadFeedbackRequest / submitFeedback).
 *
 * After sending:
 *   4-5 stars + the contractor's Google review link  -> thank-you and "Would you share this on Google?" (opens in a new tab)
 *   4-5 stars without a link                        -> thank-you only
 *   1-3 stars                                       -> a gentle "we'll make it right", never a Google prompt
 * Kind messages for a link that does not work, a link that was already answered, a function that is not in the database
 * yet and a lost connection. English / Spanish by the phone's language (switch at the bottom), like the crew page.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadFeedbackRequest, submitFeedback } from '../../lib/feedback/feedbackApi.ts';
import { FEEDBACK_LIMITS, type PublicFeedbackRequest } from '../../lib/feedback/feedbackTypes.ts';
import { isFeedbackToken } from '../../lib/feedback/feedbackPath.ts';
import { afterSend, type AfterSend } from '../../lib/feedback/feedbackUi.ts';
import { copyToClipboard } from '../../utils/clientLinks.ts';
import { StarPicker, StarsDisplay } from './Stars.tsx';

type Lang = 'en' | 'es';
const EN = {
    eyebrow: 'Your feedback',
    title: 'How did we do?',
    hi: (n: string) => `Hi ${n}.`,
    intro: (c: string) => `A quick rating helps ${c} do better.`,
    pick: 'Tap a star to rate',
    ratingLabel: 'Your rating',
    star: (n: number) => (n === 1 ? '1 star' : `${n} stars`),
    words: ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'] as readonly string[],
    commentHigh: 'What did we do well?', commentLow: 'What could we have done better?',
    commentPhHigh: 'Anything you would like to add', commentPhLow: 'Tell us what went wrong so we can fix it',
    optional: '(optional)',
    nameLabel: 'Your name', namePh: 'First and last name',
    shareNote: (c: string) => `${c} may share your comment on their website, with only your first name and last initial.`,
    send: 'Send feedback', sending: 'Sending…', left: (n: number) => `${n} left`,
    thanks: 'Thank you!', thanksBody: (c: string) => `${c} got your feedback.`,
    googleTitle: 'Would you share this on Google?', googleBody: (c: string) => `It takes a minute and helps neighbours find ${c}.`,
    googleBtn: 'Review on Google', copyComment: 'Copy my comment first', copied: 'Copied. Paste it into your Google review.', copyFail: 'Could not copy. Press and hold your comment to copy it.',
    sorryTitle: 'Thank you for telling us.', sorryBody: (c: string) => `We are sorry this was not a great experience. ${c} will read what you wrote and work to make it right.`,
    alreadyTitle: 'Feedback already sent', alreadyBody: (c: string) => `Thank you. ${c} already has your answer for this job.`,
    alreadyAny: 'Thank you. We already have your answer for this job.',
    invalidTitle: 'This link does not work', invalidBody: 'Check the link, or ask the business for a new one.',
    missingTitle: 'This page is not available yet', missingBody: 'Please try again a little later, or contact the business directly.',
    errorTitle: 'Something went wrong', offlineTitle: 'No connection', retry: 'Try again',
    sendError: 'Your feedback could not be sent. Please try again.',
    lang: 'Español', businessFallback: 'the business',
};
type Words = typeof EN;
const ES: Words = {
    eyebrow: 'Tu opinión',
    title: '¿Cómo lo hicimos?',
    hi: (n: string) => `Hola ${n}.`,
    intro: (c: string) => `Una calificación rápida ayuda a ${c} a mejorar.`,
    pick: 'Toca una estrella para calificar',
    ratingLabel: 'Tu calificación',
    star: (n: number) => (n === 1 ? '1 estrella' : `${n} estrellas`),
    words: ['Mala', 'Regular', 'Buena', 'Muy buena', 'Excelente'] as readonly string[],
    commentHigh: '¿Qué hicimos bien?', commentLow: '¿Qué pudimos hacer mejor?',
    commentPhHigh: 'Lo que quieras agregar', commentPhLow: 'Cuéntanos qué salió mal para arreglarlo',
    optional: '(opcional)',
    nameLabel: 'Tu nombre', namePh: 'Nombre y apellido',
    shareNote: (c: string) => `${c} puede compartir tu comentario en su sitio web, solo con tu nombre y la inicial de tu apellido.`,
    send: 'Enviar opinión', sending: 'Enviando…', left: (n: number) => `${n} restantes`,
    thanks: '¡Gracias!', thanksBody: (c: string) => `${c} recibió tu opinión.`,
    googleTitle: '¿Quieres compartirla en Google?', googleBody: (c: string) => `Toma un minuto y ayuda a los vecinos a encontrar a ${c}.`,
    googleBtn: 'Opinar en Google', copyComment: 'Copiar mi comentario primero', copied: 'Copiado. Pégalo en tu reseña de Google.', copyFail: 'No se pudo copiar. Mantén presionado tu comentario para copiarlo.',
    sorryTitle: 'Gracias por contárnoslo.', sorryBody: (c: string) => `Lamentamos que no fuera una gran experiencia. ${c} leerá lo que escribiste y trabajará para corregirlo.`,
    alreadyTitle: 'Opinión ya enviada', alreadyBody: (c: string) => `Gracias. ${c} ya tiene tu respuesta para este trabajo.`,
    alreadyAny: 'Gracias. Ya tenemos tu respuesta para este trabajo.',
    invalidTitle: 'Este enlace no funciona', invalidBody: 'Revisa el enlace o pide uno nuevo al negocio.',
    missingTitle: 'Esta página aún no está disponible', missingBody: 'Inténtalo un poco más tarde o contacta directamente al negocio.',
    errorTitle: 'Algo salió mal', offlineTitle: 'Sin conexión', retry: 'Reintentar',
    sendError: 'No se pudo enviar tu opinión. Inténtalo de nuevo.',
    lang: 'English', businessFallback: 'el negocio',
};
const WORDS: Record<Lang, Words> = { en: EN, es: ES };
const LANG_KEY = 'cd.feedback.lang';
const safeGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

type Load =
    | { s: 'loading' }
    | { s: 'ready'; data: PublicFeedbackRequest }
    | { s: 'invalid' }
    | { s: 'already' }
    | { s: 'missing' }
    | { s: 'error'; message: string };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const isOfflineMessage = (m: string) => /network|connection|fetch|offline/i.test(m);

const Brand: React.FC<{ name: string; logoUrl: string }> = ({ name, logoUrl }) => {
    const logo = logoUrl && /^https:\/\//i.test(logoUrl) ? logoUrl : '';
    return (
        <header className="border-b border-border bg-card">
            <div className="mx-auto flex min-h-[64px] w-full max-w-md items-center gap-3 px-4 py-3">
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

const Shell: React.FC<{ brand?: { name: string; logoUrl: string } | null; lang: Lang; w: Words; onLang: () => void; children: React.ReactNode }> = ({ brand, w, onLang, children }) => (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
        {brand ? <Brand name={brand.name} logoUrl={brand.logoUrl} /> : null}
        <main className="mx-auto w-full max-w-md flex-1 px-4 pb-6 pt-8 sm:pt-12" aria-live="polite">{children}</main>
        <footer className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
            <button type="button" onClick={onLang} className="min-h-[44px] px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">{w.lang}</button>
        </footer>
    </div>
);

const FeedbackPage: React.FC<{ token: string }> = ({ token }) => {
    const [lang, setLang] = useState<Lang>(() => {
        const saved = safeGet(LANG_KEY);
        if (saved === 'es' || saved === 'en') return saved;
        return typeof navigator !== 'undefined' && /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
    });
    const w = WORDS[lang];
    const [load, setLoad] = useState<Load>({ s: 'loading' });
    const [rating, setRating] = useState<number | null>(null);
    const [comment, setComment] = useState('');
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState<{ rating: number; after: AfterSend; comment: string } | null>(null);
    const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
    const followRef = useRef<HTMLDivElement>(null);

    const open = async () => {
        if (!isFeedbackToken(token)) { setLoad({ s: 'invalid' }); return; }
        setLoad({ s: 'loading' });
        const res = await loadFeedbackRequest(token);
        if (res.status === 'ready') setLoad({ s: 'ready', data: res.data });
        else if (res.status === 'invalid') setLoad({ s: 'invalid' });
        else if (res.status === 'already') setLoad({ s: 'already' });
        else if (res.status === 'missing') setLoad({ s: 'missing' });
        else setLoad({ s: 'error', message: res.message });
    };
    useEffect(() => { void open(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

    // the page is private to the person who got the link: no indexing, and the logo request carries no referrer
    useEffect(() => {
        const robots = document.createElement('meta');
        robots.name = 'robots';
        robots.content = 'noindex, nofollow';
        document.head.appendChild(robots);
        return () => { robots.remove(); };
    }, []);

    const company = load.s === 'ready' ? (load.data.contractor.companyName || load.data.contractor.name || w.businessFallback) : '';
    useEffect(() => {
        const prev = document.title;
        document.title = company ? `${w.eyebrow} · ${company}` : w.eyebrow;
        return () => { document.title = prev; };
    }, [company, w.eyebrow]);

    const toggleLang = () => { const next: Lang = lang === 'en' ? 'es' : 'en'; setLang(next); safeSet(LANG_KEY, next); };
    const brand = load.s === 'ready' ? { name: company, logoUrl: load.data.contractor.logoUrl } : null;
    const shell = (children: React.ReactNode) => <Shell brand={brand} lang={lang} w={w} onLang={toggleLang}>{children}</Shell>;

    const high = (rating ?? 0) >= 4;
    const left = FEEDBACK_LIMITS.comment - comment.length;
    const first = useMemo(() => (load.s === 'ready' ? (load.data.clientFirstName || '') : ''), [load]);

    const choose = (n: number) => {
        setRating(n);
        setError('');
        window.setTimeout(() => followRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), 60);
    };

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || rating === null || load.s !== 'ready') return;
        setBusy(true);
        setError('');
        const res = await submitFeedback(token, { rating, comment: comment.trim() || null, name: name.trim() || null });
        setBusy(false);
        if (res.status === 'ready') {
            setSent({ rating: res.data.rating, after: afterSend(res.data.rating, res.data.reviewUrl), comment: comment.trim() });
            window.scrollTo?.({ top: 0, behavior: 'smooth' });
        } else if (res.status === 'already') {
            setLoad({ s: 'ready', data: { ...load.data, submitted: true, status: 'submitted', rating } });
        } else if (res.status === 'invalid') {
            setLoad({ s: 'invalid' });
        } else if (res.status === 'missing') {
            setLoad({ s: 'missing' });
        } else {
            setError(isOfflineMessage(res.message) ? w.offlineTitle : (res.message || w.sendError));
        }
    };

    const copyComment = async () => setCopied((await copyToClipboard(sent?.comment || '')) ? 'ok' : 'fail');

    // ---------------------------------------------------------------------------------- states
    if (load.s === 'loading') {
        return (
            <div className="flex min-h-screen flex-col bg-background" aria-busy="true">
                <div className="border-b border-border bg-card"><div className="mx-auto flex h-16 max-w-md items-center gap-3 px-4"><div className="skeleton h-11 w-11 rounded-full" /><div className="skeleton h-4 w-40" /></div></div>
                <main className="mx-auto w-full max-w-md space-y-4 px-4 py-10">
                    <div className="skeleton h-9 w-3/4" />
                    <div className="skeleton h-4 w-1/2" />
                    <div className="skeleton h-14 w-full" />
                </main>
            </div>
        );
    }

    if (load.s === 'invalid') {
        return shell(<><h1 className="text-2xl font-bold tracking-tight">{w.invalidTitle}</h1><p className="mt-2 text-base leading-relaxed text-muted-foreground">{w.invalidBody}</p></>);
    }
    if (load.s === 'already') {
        return shell(<><h1 className="text-2xl font-bold tracking-tight">{w.alreadyTitle}</h1><p className="mt-2 text-base leading-relaxed text-muted-foreground">{w.alreadyAny}</p></>);
    }
    if (load.s === 'missing') {
        return shell(<><h1 className="text-2xl font-bold tracking-tight">{w.missingTitle}</h1><p className="mt-2 text-base leading-relaxed text-muted-foreground">{w.missingBody}</p></>);
    }
    if (load.s === 'error') {
        const offline = isOfflineMessage(load.message);
        return shell(
            <>
                <h1 className="text-2xl font-bold tracking-tight">{offline ? w.offlineTitle : w.errorTitle}</h1>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{offline ? w.sendError : load.message}</p>
                <button type="button" className="btn btn-primary mt-6 min-h-[48px] w-full" onClick={() => void open()}>{w.retry}</button>
            </>,
        );
    }

    const job = load.data.jobName || '';

    if (sent) {
        const sorry = sent.after.kind === 'sorry';
        return shell(
            <div className="animate-fade-in">
                <StarsDisplay value={sent.rating} size={26} />
                <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{sorry ? w.sorryTitle : w.thanks}</h1>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{sorry ? w.sorryBody(company) : w.thanksBody(company)}</p>
                {sent.after.kind === 'google' && (
                    <section className="mt-8 border-t border-border pt-6" aria-labelledby="fb-google">
                        <h2 id="fb-google" className="text-lg font-bold">{w.googleTitle}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{w.googleBody(company)}</p>
                        <a href={sent.after.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg mt-4 min-h-[52px] w-full">{w.googleBtn}</a>
                        {sent.comment && (
                            <>
                                <button type="button" className="btn btn-ghost mt-2 min-h-[44px] w-full text-muted-foreground" onClick={() => void copyComment()}>{w.copyComment}</button>
                                {copied && <p role="status" className={`mt-1 text-center text-sm font-medium ${copied === 'ok' ? 'text-success' : 'text-destructive'}`}>{copied === 'ok' ? w.copied : w.copyFail}</p>}
                            </>
                        )}
                    </section>
                )}
            </div>,
        );
    }

    if (load.data.submitted) {
        return shell(
            <div className="animate-fade-in">
                {load.data.rating ? <StarsDisplay value={load.data.rating} size={26} /> : null}
                <h1 className="mt-3 text-2xl font-bold tracking-tight">{w.alreadyTitle}</h1>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{w.alreadyBody(company)}</p>
            </div>,
        );
    }

    return shell(
        <form onSubmit={send} noValidate>
            {job && <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{job}</p>}
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{w.title}</h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{first ? `${w.hi(first)} ` : ''}{w.intro(company)}</p>

            <div className="mt-8">
                <StarPicker value={rating} onChange={choose} labels={w.words} ariaLabel={w.ratingLabel} starWord={w.star} disabled={busy} />
                <p className="mt-2 min-h-[2rem] text-xl font-bold tracking-tight" aria-live="polite">
                    {rating ? w.words[rating - 1] : <span className="text-base font-medium text-muted-foreground">{w.pick}</span>}
                </p>
            </div>

            {rating !== null && (
                <div ref={followRef} className="mt-4 space-y-5 animate-fade-in-up">
                    <div>
                        <label htmlFor="fb-comment" className="label">{high ? w.commentHigh : w.commentLow} <span className="font-normal normal-case tracking-normal">{w.optional}</span></label>
                        <textarea id="fb-comment" rows={4} className="input min-h-[112px] text-base" value={comment} onChange={e => setComment(e.target.value)}
                            maxLength={FEEDBACK_LIMITS.comment} placeholder={high ? w.commentPhHigh : w.commentPhLow} disabled={busy} />
                        {left < 300 && <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">{w.left(left)}</p>}
                    </div>
                    <div>
                        <label htmlFor="fb-name" className="label">{w.nameLabel} <span className="font-normal normal-case tracking-normal">{w.optional}</span></label>
                        <input id="fb-name" className="input min-h-[48px] text-base" autoComplete="name" value={name} onChange={e => setName(e.target.value)}
                            maxLength={FEEDBACK_LIMITS.clientName} placeholder={w.namePh} disabled={busy} />
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{w.shareNote(company)}</p>
                    </div>
                    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
                    <button type="submit" className="btn btn-primary btn-lg min-h-[52px] w-full" disabled={busy}>
                        {busy && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
                        {busy ? w.sending : w.send}
                    </button>
                </div>
            )}
        </form>,
    );
};

export default FeedbackPage;
