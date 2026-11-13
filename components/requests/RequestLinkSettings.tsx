/**
 * Settings section for the request-a-quote link: copy / share / open the link, QR code (print a sign or save a
 * PNG), turn the page on or off, an optional intro text, and "Change link" (new slug: old links and printed QR
 * codes stop working). Self-contained: loads and saves through its own RPCs.
 *
 * Mount (Settings.tsx, owned by another area):
 *   <RequestLinkSettings plan={profile.plan} companyName={profile.companyName || profile.name}
 *                        logoUrl={profile.logoUrl} phone={profile.phone} onUpgrade={onUpgradeClick} />
 * Also opened from the dashboard's quote requests card ("Link & QR").
 */
import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from '../Toast.tsx';
import { CopyIcon, ExternalLinkIcon, PrinterIcon, RefreshCwIcon, ShareIcon, DownloadIcon } from '../Icons.tsx';
import { describeError } from '../../lib/account.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { REQUEST_LIMITS, requestPageUrl } from './requestLogic.ts';
import {
    FeatureUnavailableError, getMyRequestPage, regenerateRequestSlug, updateMyRequestPage, type MyRequestPage,
} from './requestsApi.ts';
import { downloadQrPng, printHtml, qrSignHtml, svgMarkup } from './qrSign.ts';
import HelpButton from '../help/HelpButton.tsx';

export interface RequestLinkSettingsProps {
    plan: string;
    companyName?: string;
    logoUrl?: string;
    phone?: string;
    onUpgrade?: (reason: string) => void;
    /** Rendered without its own card (inside a modal). */
    embedded?: boolean;
    className?: string;
}

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }> = ({ checked, onChange, disabled, label }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${checked ? 'bg-primary' : 'bg-muted-foreground/30'} disabled:opacity-50`}
    >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

const RequestLinkSettings: React.FC<RequestLinkSettingsProps> = ({ plan, companyName, logoUrl, phone, onUpgrade, embedded, className = '' }) => {
    const [page, setPage] = useState<MyRequestPage | null>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<'' | 'toggle' | 'intro' | 'slug' | 'print' | 'png'>('');
    const [intro, setIntro] = useState('');
    const [confirmSlug, setConfirmSlug] = useState(false);
    const qrRef = useRef<HTMLDivElement>(null);

    const load = async () => {
        setState('loading');
        try {
            const p = await getMyRequestPage();
            setPage(p);
            setIntro(p.intro);
            setState('ready');
        } catch (e) {
            if (e instanceof FeatureUnavailableError) setState('unavailable');
            else { setError(describeError(e)); setState('error'); }
        }
    };
    useEffect(() => { void load(); }, []);

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.contractordocs.app';
    const link = page ? requestPageUrl(origin, page.slug) : '';
    const qrLink = page ? requestPageUrl(origin, page.slug, 'qr') : '';
    const company = (companyName || '').trim() || 'Your business';
    const paid = isPaidTier(page?.tier || plan);
    const wrap = embedded ? className : `card card-pad ${className}`;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            toast.success('Link copied.');
        } catch {
            toast.error('Could not copy. Press and hold the link to copy it.');
        }
    };

    const share = async () => {
        const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
        if (nav.share) {
            try { await nav.share({ title: `Request a quote from ${company}`, url: link }); } catch { /* cancelled */ }
        } else {
            void copy();
        }
    };

    const toggle = async (enabled: boolean) => {
        if (!page) return;
        setBusy('toggle');
        setPage({ ...page, enabled });
        try {
            setPage(await updateMyRequestPage({ enabled }));
            toast.success(enabled ? 'Your request page is on.' : 'Your request page is off. Visitors see your phone and email instead.');
        } catch (e) {
            setPage(page);
            toast.error(describeError(e));
        } finally {
            setBusy('');
        }
    };

    const saveIntro = async () => {
        if (!page) return;
        setBusy('intro');
        try {
            const next = await updateMyRequestPage({ intro: intro.trim() });
            setPage(next);
            setIntro(next.intro);
            toast.success('Intro saved.');
        } catch (e) {
            toast.error(describeError(e));
        } finally {
            setBusy('');
        }
    };

    const regenerate = async () => {
        setBusy('slug');
        try {
            const next = await regenerateRequestSlug();
            setPage(next);
            setConfirmSlug(false);
            toast.success('New link created. Print new QR codes; the old ones no longer work.');
        } catch (e) {
            toast.error(describeError(e));
        } finally {
            setBusy('');
        }
    };

    const qrSvg = () => qrRef.current?.querySelector('svg') as SVGSVGElement | null;

    const printSign = async () => {
        const svg = qrSvg();
        if (!svg) return;
        setBusy('print');
        try {
            await printHtml(qrSignHtml({ svg: svgMarkup(svg), url: qrLink, company, logoUrl, phone }));
        } catch (e) {
            toast.error(describeError(e, 'Printing is not available in this browser.'));
        } finally {
            setBusy('');
        }
    };

    const savePng = async () => {
        const svg = qrSvg();
        if (!svg || !page) return;
        setBusy('png');
        try {
            await downloadQrPng(svg, `request-a-quote-qr-${page.slug}.png`);
        } catch (e) {
            toast.error(describeError(e));
        } finally {
            setBusy('');
        }
    };

    const intro_ = (
        <p className={`${embedded ? '' : 'mt-1 '}text-sm leading-relaxed text-muted-foreground`}>
            Clients send you what they need, their address and photos; each request lands on your dashboard. Put the link on your
            Google Business Profile, website and Facebook, and the QR code on your truck, yard signs and cards.
        </p>
    );
    // Inside a modal the modal's title is the heading.
    const heading = embedded ? intro_ : (
        <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-foreground">Request-a-quote link</h2>
                <HelpButton topic="quote-link" iconOnly />
            </div>
            {intro_}
        </div>
    );

    if (state === 'loading') {
        return (
            <section className={wrap} aria-busy="true">
                {heading}
                <div className="mt-4 space-y-3"><div className="skeleton h-11 w-full" /><div className="skeleton h-40 w-40" /></div>
            </section>
        );
    }
    if (state === 'unavailable') {
        return (
            <section className={wrap}>
                {heading}
                <p className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    Your request link will be ready after the next server update.
                </p>
            </section>
        );
    }
    if (state === 'error' || !page) {
        return (
            <section className={wrap}>
                {heading}
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
                    <span>{error || 'Could not load your request link.'}</span>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => void load()}>Try again</button>
                </div>
            </section>
        );
    }

    return (
        <section className={wrap} aria-label="Request-a-quote link">
            {heading}

            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold">{page.enabled ? 'Taking requests' : 'Paused'}</p>
                    <p className="text-xs text-muted-foreground">{page.enabled ? 'Anyone with the link can send you a request.' : 'The page shows your phone and email instead of the form.'}</p>
                </div>
                <Switch checked={page.enabled} onChange={(v) => void toggle(v)} disabled={busy === 'toggle'} label="Take requests through the link" />
            </div>

            <div className="mt-4">
                <label htmlFor="request-link-url" className="label">Your link</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input id="request-link-url" readOnly value={link} className="input min-w-0 flex-1 font-mono text-[13px]" onFocus={(e) => e.currentTarget.select()} />
                    <div className="grid grid-cols-3 gap-2 sm:flex">
                        <button type="button" className="btn btn-outline" onClick={() => void copy()}><CopyIcon className="h-4 w-4" /> Copy</button>
                        <button type="button" className="btn btn-outline" onClick={() => void share()}><ShareIcon className="h-4 w-4" /> Share</button>
                        <a className="btn btn-outline" href={link} target="_blank" rel="noopener noreferrer"><ExternalLinkIcon className="h-4 w-4" /> Open</a>
                    </div>
                </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div ref={qrRef} className="w-fit rounded-xl border border-border bg-white p-3">
                    <QRCodeSVG value={qrLink} size={152} level="M" marginSize={0} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">QR code</p>
                    <p className="mt-1 text-sm text-muted-foreground">Print a letter-size sign with your name and the code, or save the code as an image for stickers and flyers. Scans are marked “QR code” in your inbox.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn btn-primary" onClick={() => void printSign()} disabled={busy === 'print'}><PrinterIcon className="h-4 w-4" /> Print sign</button>
                        <button type="button" className="btn btn-outline" onClick={() => void savePng()} disabled={busy === 'png'}><DownloadIcon className="h-4 w-4" /> Save image</button>
                    </div>
                </div>
            </div>

            <div className="mt-5">
                <label htmlFor="request-link-intro" className="label">Intro on the page <span className="font-normal normal-case tracking-normal">(optional)</span></label>
                <textarea
                    id="request-link-intro"
                    rows={2}
                    className="input"
                    maxLength={REQUEST_LIMITS.intro}
                    placeholder={`Tell ${company} what you need. Photos help us give you a better price.`}
                    value={intro}
                    onChange={(e) => setIntro(e.target.value)}
                />
                <div className="mt-2 flex justify-end">
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => void saveIntro()} disabled={busy === 'intro' || intro.trim() === page.intro.trim()}>
                        {busy === 'intro' ? 'Saving…' : 'Save intro'}
                    </button>
                </div>
            </div>

            {!paid && (
                <p className="mt-4 text-sm text-muted-foreground">
                    On the Free plan your page shows “Powered by ContractorDocs”.{' '}
                    {onUpgrade && <button type="button" className="font-semibold text-primary hover:underline" onClick={() => onUpgrade('Premium removes the ContractorDocs branding from your request page.')}>Premium removes it.</button>}
                </p>
            )}

            <div className="mt-5 border-t border-border pt-4">
                {confirmSlug ? (
                    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
                        <p className="font-semibold">Change your link?</p>
                        <p className="mt-1 text-muted-foreground">The current link and every QR code you printed stop working right away. Use this if the link gets spam.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" className="btn btn-danger" onClick={() => void regenerate()} disabled={busy === 'slug'}>{busy === 'slug' ? 'Changing…' : 'Yes, change the link'}</button>
                            <button type="button" className="btn btn-outline" onClick={() => setConfirmSlug(false)} disabled={busy === 'slug'}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <button type="button" className="btn btn-ghost -ml-3 text-muted-foreground" onClick={() => setConfirmSlug(true)}>
                        <RefreshCwIcon className="h-4 w-4" /> Change link
                    </button>
                )}
            </div>
        </section>
    );
};

export default RequestLinkSettings;
