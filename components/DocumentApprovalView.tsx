/**
 * Public, no-login pages for clients: single-document approval (`/?approval_token=<token>`).
 * This file also exports the building blocks shared with `PortalView.tsx` (branding, document
 * detail, signing panel, PDF download). Everything is rendered as React text: no HTML injection.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import SignaturePad from './SignaturePad.tsx';
import { Avatar, Notice, SkeletonRows, Spinner, StatusBadge, cx, getErrorMessage } from './commsKit.tsx';
import { documentLabel, isMissingFunctionError } from '../utils/clientLinks.ts';
import { formatMoney, isExcludedOptionalLine, isOptionalLine, lineItemAmount, toNumber } from '../utils/money.ts';
import ProposalPortalView, { type AddonsMode } from './proposal/ProposalPortalView.tsx';
import {
    applyAddonChoice, choosableAddons, cleanAddonPicks, clientAddonChoiceOf, defaultAddonPicks, isChoosableAddon, planAddonSigning,
} from '../lib/addonChoice.ts';
import {
    SIGNABLE_TYPES, documentTotals, isDeclinedData, isPastExpiryDate, isSignedData, parseDocState, stateOfDoc, type DocState,
} from '../utils/clientPortalRules.ts';
import { safeUrl } from '../utils/escapeHtml.ts';
import { generateDocumentBase64 } from '../services/pdfGenerator.ts';
import type { Job, UserProfile } from '../types.ts';
import { financingFor, payAmountOf, payLinkFor, paymentReportOf, isPayableStatus } from '../lib/payments.ts';
import { reportPaymentPublic, type ReportTarget } from '../lib/paymentsApi.ts';
import {
    choiceOf, findOption, optionLetter, optionName, optionRange, planChoiceSigning, readOptionSet, summarizeOptions, type OptionSet,
} from '../lib/estimateOptions.ts';
import {
    AlertTriangleIcon, CheckCircleIcon, ClockIcon, CreditCardIcon, DownloadIcon, ExternalLinkIcon, GlobeIcon, MailIcon,
    MapPinIcon, PenIcon, ShieldCheckIcon, SmartphoneIcon, XCircleIcon,
} from './Icons.tsx';

/* =====================================================================================
   Shared types + normalisation (RPC payloads are treated defensively)
   ===================================================================================== */

export interface PublicContractor {
    name: string;
    companyName: string;
    logoUrl: string;
    phone: string;
    email: string;
    website: string;
    address: string;
}

export interface PublicDocument {
    id: string;
    type: string;
    jobId: string;
    createdAt: string;
    data: Record<string, any>;
    /** the database's signing verdict (open / signed / declined / expired / readonly); null from an older database */
    state?: DocState | null;
}

export interface SigningOutcome {
    kind: 'signed' | 'declined';
    name: string;
    at: string;
    /** good/better/best: the option the client signed for ("B · Better") */
    option?: string;
    /** optional add-ons (D13): the ones the client added when signing (descriptions), recorded by the database */
    addons?: string[];
    /** the database can't record add-ons yet: signed without the client's ticks, at this total */
    addonsNotRecorded?: { total: number };
}

/** A state the link/document is in that replaces the normal review UI. */
export type LinkProblem = 'signed' | 'declined' | 'expired' | 'invalid';
export type { DocState };
export { SIGNABLE_TYPES, documentTotals, isDeclinedData, isSignedData };

export const str = (value: unknown): string => (value === null || value === undefined ? '' : String(value)).trim();

const parseJsonObject = (value: unknown): Record<string, any> => {
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    return value && typeof value === 'object' ? (value as Record<string, any>) : {};
};

export const normalizeContractor = (raw: unknown): PublicContractor => {
    const c = parseJsonObject(raw);
    return {
        name: str(c.name),
        companyName: str(c.company_name ?? c.companyName),
        logoUrl: str(c.logo_url ?? c.logoUrl),
        phone: str(c.phone),
        email: str(c.email),
        website: str(c.website),
        address: str(c.address),
    };
};

export const normalizeDocument = (raw: unknown): PublicDocument | null => {
    const r = parseJsonObject(raw);
    if (!r.id) return null;
    return {
        id: String(r.id),
        type: str(r.type) || 'Document',
        jobId: str(r.job_id ?? r.jobId),
        createdAt: str(r.created_at ?? r.createdAt),
        data: parseJsonObject(r.data),
        state: parseDocState(r.state),
    };
};

export const parseRpcPayload = (value: unknown): Record<string, any> => parseJsonObject(value);

export const contractorName = (c?: PublicContractor | null) => c?.companyName || c?.name || 'Your contractor';

/* =====================================================================================
   Formatting helpers
   ===================================================================================== */

export const fmtDate = (value: unknown): string => {
    const v = str(value);
    if (!v) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const fmtDateTime = (value: unknown): string => {
    const date = new Date(str(value));
    if (Number.isNaN(date.getTime())) return fmtDate(value);
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** Converts stored rich text (e.g. daily report content) to plain text. DOMParser documents never run scripts. */
export const htmlToText = (value: unknown): string => {
    const s = str(value);
    if (!s || !/[<&]/.test(s)) return s;
    const withBreaks = s
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)\s*>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ');
    if (typeof DOMParser === 'undefined') return withBreaks.replace(/<[^>]*>/g, '').trim();
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
};

/** `safeUrl()` returns an HTML-escaped string; React escapes attributes itself, so keep the raw value once it is known to be safe. */
export const safeHref = (value: unknown): string => {
    const v = str(value);
    return v && safeUrl(v) ? v : '';
};

const websiteHref = (website: string): string => {
    if (!website) return '';
    const withScheme = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    return /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}([/?#][^\s]*)?$/i.test(withScheme) ? safeHref(withScheme) : '';
};
const telHref = (phone: string): string => {
    const digits = phone.replace(/[^\d+]/g, '');
    return digits.replace(/\D/g, '').length >= 5 ? `tel:${digits}` : '';
};
const mailHref = (email: string): string => (/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(email) ? `mailto:${email}` : '');

/* =====================================================================================
   Document state + totals
   ===================================================================================== */

export const signerNameOf = (d: Record<string, any>) => str(d.clientSignerName) || str(d.clientSignedBy);

/**
 * Signing state: the database's verdict when it sent one (old-app estimates stay signable after their "valid until"
 * date, a re-sent declined estimate is open again), else the same rules computed here (utils/clientPortalRules.ts).
 */
export const getDocState = (doc: PublicDocument): DocState => stateOfDoc(doc);

export const currencyOf = (d: Record<string, any>) => str(d.currency) || 'USD';

const typeNoun = (type: string) => (type ? type.toLowerCase() : 'document');
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
/**
 * A purchase order opened by the SUPPLIER ("Send to supplier", lib/suppliersApi.ts): same link and same approve /
 * decline calls, worded as "Confirm order" / "Can't fill this order". Every other type keeps its wording.
 */
const isPurchaseOrder = (type: string) => type === 'Purchase Order';

/* =====================================================================================
   RPC helpers (COMM-029: check both the transport error and a payload {error})
   ===================================================================================== */

export const throwIfPayloadError = (data: unknown) => {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        const p = data as Record<string, any>;
        if (p.error) throw new Error(typeof p.error === 'string' ? p.error : str(p.error?.message) || 'Request failed');
        if (p.success === false) throw new Error(str(p.message) || 'Request failed');
    }
};

/** Calls a signing RPC with `p_signer_name`; retries once without it if the deployed function has the old signature. */
export async function callSigningRpc(fn: string, args: Record<string, unknown>, signerName: string): Promise<unknown> {
    let res = await supabase.rpc(fn, { ...args, p_signer_name: signerName });
    if (res.error && isMissingFunctionError(res.error)) res = await supabase.rpc(fn, args);
    if (res.error) throw new Error(res.error.message || 'Request failed');
    throwIfPayloadError(res.data);
    return res.data;
}

/** Options of an estimate the client chooses from (null when it has none, or one was applied). */
export const openOptionSet = (doc: PublicDocument): OptionSet | null => {
    if (doc.type !== 'Estimate') return null;
    const set = readOptionSet(doc.data);
    return set && !set.appliedId ? set : null;
};

/** "B · Better" */
export const optionLabelOf = (set: OptionSet, id: string | null | undefined): string => {
    const i = set.options.findIndex((o) => o.id === id);
    return i < 0 ? '' : `${optionLetter(i)} · ${optionName(set.options[i], i)}`;
};

/**
 * Signs an options estimate with the chosen option. Uses the database function that stores the choice
 * (supabase/migrations/20261114000100_estimate_options_choice.sql) when it exists; until then the existing signing function is used and
 * the choice is written in the signer's name ("Jane Doe (chose B: Better)"), which the contractor's app reads.
 */
export async function signWithOption(
    target: { portalKey: string; documentId: string } | { token: string },
    set: OptionSet,
    optionId: string,
    signerName: string,
    signature: string,
): Promise<'stored' | 'in-signer-name'> {
    const plan = planChoiceSigning(target, set, optionId, signerName, signature);
    const res = await supabase.rpc(plan.rpc.name, plan.rpc.args);
    if (!res.error) {
        throwIfPayloadError(res.data);
        return 'stored';
    }
    if (!isMissingFunctionError(res.error)) throw new Error(res.error.message || 'Request failed');
    await callSigningRpc(plan.fallback.name, plan.fallback.args, plan.fallback.signerName);
    return 'in-signer-name';
}

/**
 * Optional add-ons the client can tick on this page (D13): the add-on lines, the clean picks (null = what the
 * contractor already switched on) and the document data with those picks applied (THE data every total on the page
 * is computed from). No add-on to choose: lines [] and the data untouched.
 */
export const addonView = (doc: PublicDocument, picks: string[] | null | undefined) => {
    const lines = openOptionSet(doc) ? [] : choosableAddons(doc.type, doc.data);
    if (!lines.length) return { lines, picks: [] as string[], data: doc.data };
    const clean = cleanAddonPicks(doc.type, doc.data, picks ?? defaultAddonPicks(doc.type, doc.data));
    return { lines, picks: clean, data: applyAddonChoice(doc.data, clean) };
};

/**
 * Signs an estimate with the add-ons the client ticked. Uses the database function that records the choice
 * (supabase/migrations/20261116000700_optional_addons_choice.sql) when it exists; until then the existing signing
 * function is used, the choice is NOT recorded and the outcome says so with the total actually signed.
 */
export async function signWithAddons(
    target: { portalKey: string; documentId: string } | { token: string },
    doc: PublicDocument,
    picks: string[] | null | undefined,
    signerName: string,
    signature: string,
): Promise<Partial<SigningOutcome>> {
    const view = addonView(doc, picks);
    const plan = planAddonSigning(target, view.picks, signerName, signature);
    const res = await supabase.rpc(plan.rpc.name, plan.rpc.args);
    if (!res.error) {
        throwIfPayloadError(res.data);
        return { addons: view.lines.filter((li) => view.picks.includes(li.id)).map((li) => str(li.description) || 'Add-on') };
    }
    if (!isMissingFunctionError(res.error)) throw new Error(res.error.message || 'Request failed');
    await callSigningRpc(plan.fallback.name, plan.fallback.args, signerName);
    // nothing lost when the ticks were the contractor's own (the stored lines already say the same)
    const before = defaultAddonPicks(doc.type, doc.data);
    const same = before.length === view.picks.length && before.every((id) => view.picks.includes(id));
    return same ? {} : { addonsNotRecorded: { total: documentTotals(doc.data).total } };
}

/** Calls a decline RPC. Returns 'unsupported' when the function is not deployed. */
export async function callDeclineRpc(fn: string, args: Record<string, unknown>): Promise<'ok' | 'unsupported'> {
    const res = await supabase.rpc(fn, args);
    if (res.error && isMissingFunctionError(res.error)) return 'unsupported';
    if (res.error) throw new Error(res.error.message || 'Request failed');
    throwIfPayloadError(res.data);
    return 'ok';
}

/** Decline with the signer's name when the deployed function accepts it; falls back to the documented args. */
export async function callDeclineRpcWithName(fn: string, args: Record<string, unknown>, signerName: string): Promise<'ok' | 'unsupported'> {
    if (signerName) {
        const res = await callDeclineRpc(fn, { ...args, p_signer_name: signerName });
        if (res === 'ok') return res;
    }
    return callDeclineRpc(fn, args);
}

export const classifySigningError =(message: string): LinkProblem | 'signature' | null => {
    const m = message.toLowerCase();
    if (/invalid signature|signature image|signature is (too large|required|missing)/.test(m)) return 'signature';
    if (/already (been )?(signed|accepted|approved)/.test(m)) return 'signed';
    if (/declined|rejected/.test(m)) return 'declined';
    if (/expired/.test(m)) return 'expired';
    if (/invalid|not found|no longer|already used/.test(m)) return 'invalid';
    return null;
};

export const isNetworkMessage = (message: string) => /^network error/i.test(message);

/* =====================================================================================
   PDF download (COMM-023: correctly shaped profile/job arguments)
   ===================================================================================== */

const pdfFileName = (doc: PublicDocument) => {
    const d = doc.data;
    const num = str(d.invoiceNumber || d.estimateNumber || d.changeOrderNumber || d.workOrderNumber || d.reportNumber || d.warrantyNumber || d.poNumber || d.receiptNumber) || doc.id.slice(0, 8);
    return `${doc.type}-${num}`.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-') + '.pdf';
};

export async function downloadDocumentPdf(doc: PublicDocument, contractor: PublicContractor, clientName = ''): Promise<void> {
    const profile: UserProfile = {
        id: '',
        email: contractor.email,
        name: contractor.name || contractor.companyName,
        companyName: contractor.companyName,
        logoUrl: contractor.logoUrl,
        address: contractor.address,
        phone: contractor.phone,
        website: contractor.website,
    };
    const d = doc.data;
    const job: Job = {
        id: doc.jobId || '',
        userId: '',
        name: str(d.projectName) || str(d.title) || documentLabel(doc.type, d),
        clientName: str(d.clientName) || clientName,
        clientAddress: str(d.clientAddress) || str(d.projectAddress),
        startDate: doc.createdAt || new Date().toISOString(),
        endDate: null,
        status: 'active',
    };
    const uri = await generateDocumentBase64(doc.type, d, profile, job);
    if (!uri || typeof uri !== 'string') throw new Error('A PDF is not available for this document.');
    const idx = uri.indexOf('base64,');
    const binary = atob((idx >= 0 ? uri.slice(idx + 7) : uri).replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfFileName(doc);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const DownloadPdfButton: React.FC<{
    doc: PublicDocument;
    contractor: PublicContractor;
    clientName?: string;
    label?: string;
    iconOnly?: boolean;
    className?: string;
    onError?: (message: string) => void;
}> = ({ doc, contractor, clientName, label = 'Download PDF', iconOnly, className, onError }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const run = async () => {
        setBusy(true);
        setError('');
        try {
            await downloadDocumentPdf(doc, contractor, clientName);
        } catch (e) {
            const msg = `We couldn't create the PDF. ${getErrorMessage(e)}`;
            if (onError) onError(msg); else setError(msg);
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            <button
                type="button"
                onClick={run}
                disabled={busy}
                className={cx('btn btn-outline min-h-[40px]', iconOnly && 'w-10 px-0', className)}
                aria-label={iconOnly ? `${label}: ${documentLabel(doc.type, doc.data)}` : undefined}
                title={iconOnly ? label : undefined}
            >
                {busy ? <Spinner label={iconOnly ? undefined : 'Preparing…'} /> : (
                    <>
                        <DownloadIcon className="h-4 w-4" />
                        {!iconOnly && <span>{label}</span>}
                    </>
                )}
            </button>
            {error && <Notice tone="danger" className="mt-2 w-full" onClose={() => setError('')}>{error}</Notice>}
        </>
    );
};

/* =====================================================================================
   Branding
   ===================================================================================== */

export const BrandHeader: React.FC<{ contractor: PublicContractor | null; tagline?: string; right?: React.ReactNode }> = ({
    contractor, tagline = 'Secure client portal', right,
}) => {
    const name = contractor ? contractorName(contractor) : 'Client portal';
    const logo = contractor ? safeHref(contractor.logoUrl) : '';
    return (
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
            <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                    {logo ? (
                        <img
                            src={logo}
                            alt={`${name} logo`}
                            className="h-10 w-auto max-w-[120px] shrink-0 rounded-lg bg-white object-contain p-1 ring-1 ring-border dark:bg-white/95 sm:h-12 sm:max-w-[160px]"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <Avatar name={name} />
                    )}
                    <div className="min-w-0">
                        <p className="truncate text-base font-bold text-foreground sm:text-lg">{name}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ShieldCheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />
                            <span className="truncate">{tagline}</span>
                        </p>
                    </div>
                </div>
                {right}
            </div>
        </header>
    );
};

export const PublicFooter: React.FC = () => (
    <footer className="border-t border-border px-4 py-8 text-center text-xs text-muted-foreground">
        <p>
            Powered by <span className="font-semibold text-foreground">ContractorDocs</span>
        </p>
        <p className="mx-auto mt-1 max-w-md">This page was shared with you through a private link. Please don't forward it to anyone who shouldn't see these documents.</p>
    </footer>
);

const ContactLink: React.FC<{ href: string; icon: React.ReactNode; children: React.ReactNode; external?: boolean }> = ({ href, icon, children, external }) => (
    <a
        href={href}
        className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium text-foreground transition hover:bg-muted"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
        <span className="text-primary">{icon}</span>
        <span className="min-w-0 break-all">{children}</span>
    </a>
);

/** Phone / email / website / address of the contractor (only renders safe links). */
export const ContractorContact: React.FC<{ contractor: PublicContractor; className?: string }> = ({ contractor, className }) => {
    const tel = telHref(contractor.phone);
    const mail = mailHref(contractor.email);
    const web = websiteHref(contractor.website);
    if (!tel && !mail && !web && !contractor.address) {
        return <p className={cx('text-sm text-muted-foreground', className)}>Reply to the email or message this link came in.</p>;
    }
    return (
        <div className={cx('-mx-3 grid gap-1 sm:grid-cols-2', className)}>
            {tel && <ContactLink href={tel} icon={<SmartphoneIcon className="h-4 w-4" />}>{contractor.phone}</ContactLink>}
            {mail && <ContactLink href={mail} icon={<MailIcon className="h-4 w-4" />}>{contractor.email}</ContactLink>}
            {web && <ContactLink href={web} icon={<GlobeIcon className="h-4 w-4" />} external>{contractor.website.replace(/^https?:\/\//i, '')}</ContactLink>}
            {contractor.address && (
                <div className="flex min-h-[44px] items-start gap-3 px-3 py-2.5 text-sm text-muted-foreground">
                    <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="whitespace-pre-line">{contractor.address}</span>
                </div>
            )}
        </div>
    );
};

/* =====================================================================================
   Paying (the contractor's own pay link + "I've paid") and financing
   ===================================================================================== */

/** Reports "I've paid" for the page's credential (portal key or approval-link token). */
export type ReportPaymentFn = (note: string, amount: number) => Promise<'ok' | 'unsupported'>;

export const makeReportPayment = (target: ReportTarget): ReportPaymentFn => (note, amount) => reportPaymentPublic(target, note, amount);

const hostLabel = (href: string) => {
    try { return new URL(href).hostname.replace(/^www\./, ''); } catch { return 'the payment page'; }
};

/**
 * Invoice payment box: amount still due, "Pay now" (the contractor's own PayPal / Square / Stripe / bank page, new
 * tab) and "I've paid" with an optional note so the contractor knows to check. Nothing for paid / cancelled invoices.
 */
export const PayNowPanel: React.FC<{
    doc: PublicDocument;
    contractor: PublicContractor;
    onReport?: ReportPaymentFn;
    onReported?: () => void;
}> = ({ doc, contractor, onReport, onReported }) => {
    const d = doc.data;
    const [mode, setMode] = useState<'idle' | 'form' | 'busy' | 'done' | 'unsupported'>('idle');
    const [note, setNote] = useState('');
    const [error, setError] = useState('');
    const [reportedAt, setReportedAt] = useState('');
    if (doc.type !== 'Invoice' || !isPayableStatus(d.status) || str(d.status) === 'Draft') return null;
    const due = payAmountOf(d);
    if (!(due.amount > 0)) return null;
    const pay = payLinkFor(d);
    const company = contractorName(contractor);
    const money = (v: number) => formatMoney(v, currencyOf(d));
    const report = paymentReportOf(d);
    const shownReportAt = reportedAt || report?.at || '';

    const submit = async () => {
        if (!onReport) return;
        setMode('busy');
        setError('');
        try {
            const res = await onReport(note.trim(), due.amount);
            if (res === 'unsupported') { setMode('unsupported'); return; }
            setReportedAt(new Date().toISOString());
            setMode('done');
            onReported?.();
        } catch (e) {
            const msg = getErrorMessage(e);
            setError(/already marked as paid/i.test(msg) ? `${company} has already marked this invoice as paid.` : msg);
            setMode('form');
        }
    };

    return (
        <section className="rounded-2xl border border-border p-4 sm:p-5" aria-label="Payment">
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">{due.label}</p>
                <p className="text-2xl font-bold tabular-nums text-foreground">{money(due.amount)}</p>
            </div>
            {pay && (
                <>
                    <a href={pay.href} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg mt-3 min-h-[48px] w-full">
                        <CreditCardIcon className="h-4 w-4" /> {pay.buttonLabel}
                    </a>
                    <p className="mt-1.5 text-center text-xs text-muted-foreground">Opens {hostLabel(pay.href)} in a new tab. You pay {company} directly.</p>
                </>
            )}
            {shownReportAt ? (
                <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-sm text-foreground" role="status">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>
                        You let {company} know you paid{fmtDate(shownReportAt) ? ` on ${fmtDate(shownReportAt)}` : ''}
                        {(mode === 'done' ? note.trim() : report?.note) ? <> (“{mode === 'done' ? note.trim() : report?.note}”)</> : null}. They’ll confirm it.
                    </span>
                </p>
            ) : onReport && mode === 'idle' ? (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border pt-3 text-sm">
                    <span className="text-muted-foreground">{pay ? 'Already paid?' : 'Paid by check, cash or transfer?'}</span>
                    <button type="button" className="btn btn-ghost btn-sm min-h-[40px] font-semibold text-primary" onClick={() => setMode('form')}>
                        I’ve paid
                    </button>
                </div>
            ) : onReport && (mode === 'form' || mode === 'busy') ? (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <div>
                        <label className="label" htmlFor={`${doc.id}-paid-note`}>How and when did you pay? (optional)</label>
                        <input
                            id={`${doc.id}-paid-note`}
                            className="input min-h-[44px]"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={200}
                            placeholder="e.g. PayPal, Nov 14"
                            disabled={mode === 'busy'}
                        />
                    </div>
                    {error && <Notice tone="danger" onClose={() => setError('')}>{error}</Notice>}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" className="btn btn-outline min-h-[44px]" onClick={() => { setMode('idle'); setError(''); }} disabled={mode === 'busy'}>Cancel</button>
                        <button type="button" className="btn btn-primary min-h-[44px]" onClick={submit} disabled={mode === 'busy'}>
                            {mode === 'busy' ? <Spinner label="Sending…" /> : `Let ${company} know`}
                        </button>
                    </div>
                </div>
            ) : mode === 'unsupported' ? (
                <Notice tone="warning" className="mt-4" title={`Please tell ${company} directly`}>
                    <p>Confirming a payment online isn’t available yet. Reach out using any of these:</p>
                    <ContractorContact contractor={contractor} className="mt-2" />
                </Notice>
            ) : null}
        </section>
    );
};

/** "Financing available" on estimates at or above the contractor's amount (the lender's page shows the terms). */
export const FinancingNotice: React.FC<{ doc: PublicDocument; contractor: PublicContractor }> = ({ doc, contractor }) => {
    if (doc.type !== 'Estimate') return null;
    const fin = financingFor(doc.data);
    if (!fin) return null;
    return (
        <section className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <p className="font-semibold text-foreground">Financing available</p>
                <p className="text-sm text-muted-foreground">
                    {contractorName(contractor)} works with a financing partner, so you can pay for this project over time. The lender shows the terms before you apply.
                </p>
            </div>
            <a href={fin.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline min-h-[44px] shrink-0">
                Check your options <ExternalLinkIcon className="h-4 w-4" />
            </a>
        </section>
    );
};

/* =====================================================================================
   Good / better / best options (estimates): the client picks one, then signs
   ===================================================================================== */

/**
 * The options of an estimate as cards (one column on phones). With `onChoose` the client picks one (radio cards);
 * without it they are shown read-only, the chosen one marked.
 */
export const OptionCards: React.FC<{
    doc: PublicDocument;
    set: OptionSet;
    value?: string | null;
    onChoose?: (optionId: string) => void;
}> = ({ doc, set, value, onChoose }) => {
    const d = doc.data;
    const money = (v: number) => formatMoney(v, currencyOf(d));
    const summaries = summarizeOptions(d, set);
    const shared = set.sharedLineItems.filter((li) => str(li.description) || toNumber(li.rate));
    const picking = !!onChoose;
    const lineRow = (it: any, i: number) => (
        <li key={str(it.id) || i} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0">
                <span className="block whitespace-pre-wrap break-words text-sm text-foreground">{str(it.description) || '—'}</span>
                <span className="block text-xs tabular-nums text-muted-foreground">{toNumber(it.quantity)} × {money(toNumber(it.rate))}</span>
            </span>
            <span className="shrink-0 text-sm font-medium tabular-nums">{money(lineItemAmount(it, false))}</span>
        </li>
    );
    return (
        <section aria-label="Options">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="label mb-0">{picking ? 'Choose one option' : 'Options'}</h3>
                <p className="text-xs text-muted-foreground">{summaries.length} options{shared.length ? ' · each includes the lines in every option' : ''}</p>
            </div>
            <div role={picking ? 'radiogroup' : undefined} aria-label={picking ? 'Options' : undefined} className={cx('grid gap-3', summaries.length === 2 || summaries.length === 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
                {summaries.map((s) => {
                    const on = picking ? value === s.option.id : s.chosen;
                    const lines = s.option.lineItems.filter((li) => str(li.description) || toNumber(li.rate));
                    return (
                        <div
                            key={s.option.id}
                            className={cx(
                                'flex flex-col rounded-2xl border p-4 transition',
                                on ? 'border-primary bg-primary/5 ring-2 ring-primary/25' : 'border-border',
                            )}
                        >
                            <label className={cx('flex items-start gap-3', picking && 'cursor-pointer')}>
                                {picking && (
                                    <input
                                        type="radio"
                                        name={`options-${doc.id}`}
                                        className="mt-1 h-5 w-5 shrink-0 accent-primary"
                                        checked={value === s.option.id}
                                        onChange={() => onChoose!(s.option.id)}
                                    />
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-xs font-bold text-muted-foreground">{s.letter}</span>
                                        <span className="break-words font-semibold text-foreground">{optionName(s.option, s.index)}</span>
                                        {s.chosen ? <span className="badge badge-success">Chosen</span> : s.recommended && <span className="badge badge-primary">Recommended</span>}
                                    </span>
                                    {s.option.description && <span className="mt-1 block break-words text-sm text-muted-foreground">{s.option.description}</span>}
                                    <span className="mt-2 block text-2xl font-bold tabular-nums text-foreground">{money(s.totals.total)}</span>
                                    {s.totals.tax > 0 && <span className="block text-xs text-muted-foreground">incl. {money(s.totals.tax)} tax</span>}
                                </span>
                            </label>
                            <details className="mt-3 border-t border-border pt-1">
                                <summary className="flex min-h-[40px] cursor-pointer items-center text-sm font-medium text-primary">
                                    What’s included ({lines.length + shared.length})
                                </summary>
                                <ul className="divide-y divide-border">{lines.map(lineRow)}</ul>
                                {shared.length > 0 && (
                                    <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                                        + {shared.length} line{shared.length === 1 ? '' : 's'} included in every option ({money(shared.reduce((a, li) => a + lineItemAmount(li, false), 0))})
                                    </p>
                                )}
                                <dl className="mt-2 space-y-1 text-sm">
                                    <MoneyRow label="Subtotal" value={money(s.totals.subtotal)} />
                                    {s.totals.discount > 0 && <MoneyRow label="Discount" value={`−${money(s.totals.discount)}`} />}
                                    {s.totals.tax > 0 && <MoneyRow label={`Tax (${s.totals.taxRate}%)`} value={money(s.totals.tax)} />}
                                    <MoneyRow label="Total" value={money(s.totals.total)} strong />
                                </dl>
                            </details>
                        </div>
                    );
                })}
            </div>
            {shared.length > 0 && (
                <details className="mt-3 rounded-2xl border border-dashed border-border px-4 py-1">
                    <summary className="flex min-h-[40px] cursor-pointer items-center text-sm font-medium text-foreground">
                        Included in every option ({shared.length})
                    </summary>
                    <ul className="divide-y divide-border pb-2">{shared.map(lineRow)}</ul>
                </details>
            )}
        </section>
    );
};

/* =====================================================================================
   Document detail (parties, line items, totals, text sections, signature state)
   ===================================================================================== */

const MoneyRow: React.FC<{ label: string; value: string; strong?: boolean; accent?: boolean }> = ({ label, value, strong, accent }) => (
    <div className={cx('flex items-baseline justify-between gap-4', strong && 'border-t border-border pt-2 text-base font-bold', accent && 'text-primary')}>
        <dt className={strong ? 'text-foreground' : 'text-muted-foreground'}>{label}</dt>
        <dd className="tabular-nums">{value}</dd>
    </div>
);

const TextSection: React.FC<{ title: string; text: string }> = ({ title, text }) => (
    <section>
        <h3 className="label">{title}</h3>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{text}</p>
    </section>
);

export const SignatureBlock: React.FC<{ doc: PublicDocument }> = ({ doc }) => {
    const d = doc.data;
    const img = safeHref(d.clientSignatureUrl);
    const when = fmtDateTime(d.clientSignedAt);
    const who = signerNameOf(d) || str(d.clientName) || 'the client';
    return (
        <section className="rounded-2xl border border-success/30 bg-success/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircleIcon className="h-5 w-5 text-success" /> {isPurchaseOrder(doc.type) ? 'Confirmed' : 'Approved'} by {who}
            </p>
            {when && <p className="mt-0.5 pl-7 text-xs text-muted-foreground">Signed electronically on {when}</p>}
            {img && (
                <div className="mt-3 rounded-xl bg-white p-2 ring-1 ring-border dark:bg-white/95">
                    <img src={img} alt={`Signature of ${who}`} className="mx-auto h-24 w-full max-w-sm object-contain" />
                </div>
            )}
        </section>
    );
};

/** An optional add-on counted in the total (switched on by the contractor, or chosen by the client when signing). */
const AddonTag: React.FC = () => (
    <span className="mr-2 inline-block rounded border border-primary/40 px-1.5 align-middle text-[10px] font-bold uppercase tracking-wide text-primary">Add-on</span>
);

export const DocumentDetail: React.FC<{
    doc: PublicDocument;
    contractor: PublicContractor;
    clientName?: string;
    /** enables "I've paid" on invoices */
    onReportPayment?: ReportPaymentFn;
    onPaymentReported?: () => void;
    /** good/better/best estimate: the option picked on this page, and how to pick one (only while it can be signed) */
    chosenOptionId?: string | null;
    onChooseOption?: (optionId: string) => void;
    /** optional add-ons (D13): the ones ticked on this page (null = the contractor's), and how to tick (only while it can be signed) */
    addonPicks?: string[] | null;
    onToggleAddon?: (id: string, on: boolean) => void;
}> = ({ doc, contractor, clientName = '', onReportPayment, onPaymentReported, chosenOptionId, onChooseOption, addonPicks, onToggleAddon }) => {
    const state = getDocState(doc);
    // add-ons the client ticks: every total below comes from the data with the ticks applied (lib/addonChoice.ts)
    const addons = state === 'open' && onToggleAddon ? addonView(doc, addonPicks) : null;
    const choosing = !!addons && addons.lines.length > 0;
    const d = choosing ? addons!.data : doc.data;
    const currency = currencyOf(d);
    const money = (v: number) => formatMoney(v, currency);
    const totals = documentTotals(d);
    const optionSet = openOptionSet(doc);
    const range = optionSet ? optionRange(d) : null;
    const signedChoice = optionSet ? choiceOf(d, optionSet) : null;
    const choiceTotal = optionSet && signedChoice ? summarizeOptions(d, optionSet).find((x) => x.chosen)?.totals.total ?? 0 : 0;
    // optional add-ons not taken are listed apart (ProposalPortalView), never among the counted items; while the
    // client ticks them, every add-on is listed there (with its tick box) and none among the items
    const items: any[] = optionSet ? [] : Array.isArray(d.lineItems)
        ? d.lineItems.filter((it: unknown) => it && typeof it === 'object' && !isExcludedOptionalLine(it as never) && !(choosing && isChoosableAddon(it)))
        : [];
    const addonsMode: AddonsMode | undefined = choosing
        ? { mode: 'choose', lines: addons!.lines, picks: addons!.picks, onToggle: onToggleAddon! }
        : doc.type === 'Estimate' && clientAddonChoiceOf(d) ? { mode: 'chosen' } : undefined;
    const isProgress = !!d.isProgressBilling;
    const label = documentLabel(doc.type, d);
    const title = str(d.title);
    const po = isPurchaseOrder(doc.type);

    const dates: Array<[string, string]> = ((po ? [
        ['Ordered', fmtDate(d.date || doc.createdAt)],
        ['Required by', fmtDate(d.deliveryDate)],
    ] : [
        ['Issued', fmtDate(d.issueDate || d.date || doc.createdAt)],
        ['Due', fmtDate(d.dueDate)],
        ['Valid until', fmtDate(d.expiryDate)],
        ['Completed', fmtDate(d.completedDate)],
    ]) as Array<[string, string]>).filter(([, v]) => !!v);

    // a purchase order goes TO the supplier (vendor fields), and is delivered to the ship-to address
    const toName = po ? str(d.vendorName) : str(d.clientName) || clientName;
    const toAddress = po ? str(d.vendorAddress) : str(d.clientAddress) || str(d.projectAddress);
    const fromName = contractorName(contractor);
    const fromAddress = contractor.address || str(d.companyAddress);

    const facts: Array<[string, string]> = ([
        ['Project', str(d.projectName)],
        ['Reason', str(d.reason)],
        ['Status', doc.type === 'Work Order' ? str(d.status) : ''],
        ['Hours', toNumber(d.hours) > 0 ? String(toNumber(d.hours)) : ''],
        ['Warranty period', str(d.duration)],
        ['Paid by', doc.type === 'Receipt' ? str(d.paymentMethod) : ''],
        ['For invoice', doc.type === 'Receipt' ? str(d.invoiceNumber) : ''],
        ['Weather', [str(d.weather), str(d.temperature)].filter(Boolean).join(' · ')],
        ['Deliver to', po ? [str(d.shipToName), str(d.shipToAddress)].filter(Boolean).join(', ') : ''],
        ['Site phone', po ? str(d.shipToPhone) : ''],
    ] as Array<[string, string]>).filter(([, v]) => !!v);

    const sections: Array<[string, string]> = ([
        ['Delivery instructions', po ? htmlToText(d.deliveryInstructions) : ''],
        ['Description', htmlToText(d.description)],
        ['Coverage', htmlToText(d.coverage)],
        ['Conditions', htmlToText(d.conditions)],
        ['Report', htmlToText(d.content)],
        ['Materials used', htmlToText(d.materialsUsed)],
        ['Notes', htmlToText(d.notes)],
        ['Terms & conditions', htmlToText(d.terms)],
    ] as Array<[string, string]>).filter(([, v]) => !!v);

    const contractSum = toNumber(d.currentContractSum);
    // an old invoice with a plain http link keeps its simple button (PayNowPanel only uses https links)
    const legacyPayLink = doc.type === 'Invoice' && totals.balanceDue > 0 && str(d.status) !== 'Paid' && /^http:\/\//i.test(str(d.paypalLink))
        ? safeHref(d.paypalLink) : '';

    return (
        <article className="space-y-6">
            {/* Heading */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{doc.type}</p>
                    <h2 className="mt-1 break-words text-xl font-bold text-foreground sm:text-2xl">{label}</h2>
                    {title && title !== label && <p className="mt-0.5 break-words text-sm text-muted-foreground">{title}</p>}
                    {dates.length > 0 && (
                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            {dates.map(([k, v]) => <span key={k}>{k}: <span className="font-medium text-foreground">{v}</span></span>)}
                        </p>
                    )}
                </div>
                {optionSet && range ? (
                    <div className="shrink-0 rounded-2xl bg-muted/60 px-4 py-3 sm:text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {signedChoice ? 'Chosen option' : `${range.count} options`}
                        </p>
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                            {signedChoice ? money(choiceTotal) : range.min === range.max ? money(range.min) : `${money(range.min)}–${money(range.max)}`}
                        </p>
                    </div>
                ) : totals.hasMoney && (
                    <div className="shrink-0 rounded-2xl bg-muted/60 px-4 py-3 sm:text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {totals.amountPaid > 0 ? 'Balance due' : 'Total'}
                        </p>
                        <p className="text-2xl font-bold tabular-nums text-foreground">{money(totals.amountPaid > 0 ? totals.balanceDue : totals.total)}</p>
                    </div>
                )}
            </div>

            {/* Parties */}
            <div className="grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-2">
                <div className="min-w-0">
                    <p className="label">From</p>
                    <p className="font-semibold text-foreground">{fromName}</p>
                    {fromAddress && <p className="whitespace-pre-line text-sm text-muted-foreground">{fromAddress}</p>}
                    {(contractor.phone || contractor.email) && (
                        <p className="mt-1 break-all text-sm text-muted-foreground">{[contractor.phone, contractor.email].filter(Boolean).join(' · ')}</p>
                    )}
                </div>
                <div className="min-w-0">
                    <p className="label">{doc.type === 'Invoice' ? 'Bill to' : po ? 'Supplier' : 'Prepared for'}</p>
                    <p className="font-semibold text-foreground">{toName || '—'}</p>
                    {toAddress && <p className="whitespace-pre-line text-sm text-muted-foreground">{toAddress}</p>}
                </div>
            </div>

            {facts.length > 0 && (
                <dl className="grid gap-3 sm:grid-cols-2">
                    {facts.map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-muted/50 px-4 py-3">
                            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
                            <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{v}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {/* Line items */}
            {items.length > 0 && (
                <section>
                    <h3 className="label">Items</h3>
                    <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
                        <table className="table-clean">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th>Description</th>
                                    <th className="text-right">Qty</th>
                                    <th className="text-right">Rate</th>
                                    {isProgress && <th className="text-right">Complete</th>}
                                    <th className="text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((it, i) => (
                                    <tr key={str(it.id) || i}>
                                        <td className="whitespace-pre-wrap break-words">{isOptionalLine(it) && <AddonTag />}{str(it.description) || '—'}</td>
                                        <td className="text-right tabular-nums">{toNumber(it.quantity)}</td>
                                        <td className="text-right tabular-nums">{money(toNumber(it.rate))}</td>
                                        {isProgress && <td className="text-right tabular-nums">{toNumber(it.percentComplete)}%</td>}
                                        <td className="text-right font-medium tabular-nums">{money(lineItemAmount(it, isProgress))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <ul className="divide-y divide-border rounded-xl border border-border sm:hidden">
                        {items.map((it, i) => (
                            <li key={str(it.id) || i} className="p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="min-w-0 whitespace-pre-wrap break-words text-sm font-medium text-foreground">{isOptionalLine(it) && <AddonTag />}{str(it.description) || '—'}</p>
                                    <p className="shrink-0 text-sm font-semibold tabular-nums">{money(lineItemAmount(it, isProgress))}</p>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                                    {toNumber(it.quantity)} × {money(toNumber(it.rate))}
                                    {isProgress ? ` · ${toNumber(it.percentComplete)}% complete` : ''}
                                </p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* good/better/best options: cards (picked here while the estimate can be signed) */}
            {optionSet && (
                <OptionCards
                    doc={doc}
                    set={optionSet}
                    value={state === 'open' ? chosenOptionId ?? null : null}
                    onChoose={state === 'open' ? onChooseOption : undefined}
                />
            )}

            {/* Totals */}
            {totals.hasMoney && !optionSet && (
                <dl className="ml-auto w-full space-y-1.5 text-sm sm:max-w-xs">
                    {items.length > 0 && <MoneyRow label="Subtotal" value={money(totals.subtotal)} />}
                    {totals.discount > 0 && <MoneyRow label="Discount" value={`−${money(totals.discount)}`} />}
                    {totals.tax > 0 && <MoneyRow label={`Tax (${totals.taxRate}%)`} value={money(totals.tax)} />}
                    {totals.shipping > 0 && <MoneyRow label="Shipping" value={money(totals.shipping)} />}
                    <MoneyRow label={doc.type === 'Change Order' ? 'Change amount' : 'Total'} value={money(totals.total)} strong />
                    {totals.amountPaid > 0 && (
                        <>
                            <MoneyRow label="Paid" value={`−${money(totals.amountPaid)}`} />
                            <MoneyRow label="Balance due" value={money(totals.balanceDue)} strong accent />
                        </>
                    )}
                    {doc.type === 'Change Order' && contractSum > 0 && (
                        <>
                            <MoneyRow label="Current contract sum" value={money(contractSum)} />
                            <MoneyRow label="New contract sum" value={money(contractSum + totals.total)} strong />
                        </>
                    )}
                </dl>
            )}

            {legacyPayLink && (
                <a href={legacyPayLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary min-h-[44px] w-full sm:w-auto">
                    <CreditCardIcon className="h-4 w-4" /> Pay now
                </a>
            )}
            <PayNowPanel doc={doc} contractor={contractor} onReport={onReportPayment} onReported={onPaymentReported} />
            <FinancingNotice doc={doc} contractor={contractor} />

            {/* proposal builder: scope, optional add-ons (not in the total), payment schedule, photos */}
            {doc.type === 'Estimate' && <ProposalPortalView data={d} total={totals.total} money={money} addons={addonsMode} />}

            {sections.map(([k, v]) => <TextSection key={k} title={k} text={v} />)}

            {/* Signature / decision state */}
            {state === 'signed' && <SignatureBlock doc={doc} />}
            {state === 'declined' && (
                <Notice tone="danger" title={`${po ? 'Can’t fill this order' : 'Declined'}${signerNameOf(d) ? `${po ? ':' : ''} ${po ? '' : 'by '}${signerNameOf(d)}` : ''}${fmtDateTime(d.clientDeclinedAt) ? ` on ${fmtDateTime(d.clientDeclinedAt)}` : ''}`}>
                    {str(d.clientDeclineReason) ? <span className="whitespace-pre-wrap">Reason: {str(d.clientDeclineReason)}</span> : po ? 'The supplier said this order can’t be filled.' : `This ${typeNoun(doc.type)} was declined.`}
                </Notice>
            )}
            {state === 'expired' && (
                <Notice tone="warning" title={`This ${typeNoun(doc.type)} expired${fmtDate(d.expiryDate) ? ` on ${fmtDate(d.expiryDate)}` : ''}`}>
                    Prices and availability may have changed. Contact {contractorName(contractor)} for an updated version.
                </Notice>
            )}
            {/* estimates made before the upgrade stay signable after their date (the original app never checked it) */}
            {state === 'open' && isPastExpiryDate(d.expiryDate) && (
                <p className="text-sm text-muted-foreground">
                    The “valid until” date ({fmtDate(d.expiryDate)}) has passed. You can still sign it online; contact {contractorName(contractor)} if anything has changed.
                </p>
            )}
        </article>
    );
};

/* =====================================================================================
   Signing panel (name + signature + consent; decline with optional reason)
   ===================================================================================== */

export const SigningPanel: React.FC<{
    doc: PublicDocument;
    contractor: PublicContractor;
    defaultName?: string;
    /** may return details for the completion card (add-ons recorded / not recorded) */
    onSign: (name: string, signature: string) => Promise<void | Partial<SigningOutcome>>;
    onDecline: (reason: string, name: string) => Promise<'ok' | 'unsupported'>;
    onComplete: (outcome: SigningOutcome) => void;
    /** Called when the server says the document is already signed/declined/expired/gone. */
    onProblem?: (problem: LinkProblem) => void;
    onBusyChange?: (busy: boolean) => void;
    id?: string;
    /** good/better/best estimate: the option picked above (signing needs one) and how to go back to the cards */
    chosenOptionId?: string | null;
    onShowOptions?: () => void;
    /** optional add-ons ticked above (null = the contractor's); the total shown includes them */
    addonPicks?: string[] | null;
}> = ({ doc, contractor, defaultName = '', onSign, onDecline, onComplete, onProblem, onBusyChange, id, chosenOptionId, onShowOptions, addonPicks }) => {
    const [mode, setMode] = useState<'sign' | 'decline'>('sign');
    const [name, setName] = useState(defaultName);
    const [signature, setSignature] = useState('');
    const [padKey, setPadKey] = useState(() => Date.now());
    const [consent, setConsent] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusyState] = useState(false);
    const [error, setError] = useState('');
    const [declineUnsupported, setDeclineUnsupported] = useState(false);

    const addons = addonView(doc, addonPicks);
    const d = addons.data;
    const totals = documentTotals(d);
    const pickedAddons = addons.lines.filter((li) => addons.picks.includes(li.id));
    const label = documentLabel(doc.type, d);
    const noun = typeNoun(doc.type);
    const company = contractorName(contractor);
    const po = isPurchaseOrder(doc.type);
    const trimmedName = name.trim();
    const optionSet = openOptionSet(doc);
    const chosen = optionSet ? findOption(optionSet, chosenOptionId) : null;
    const chosenTotal = optionSet && chosen ? summarizeOptions(d, optionSet).find((x) => x.option.id === chosen.id)?.totals.total ?? 0 : 0;
    const needsOption = !!optionSet && !chosen;
    const canSign = trimmedName.length >= 2 && signature.startsWith('data:image/') && consent && !busy && !needsOption;

    const setBusy = (b: boolean) => { setBusyState(b); onBusyChange?.(b); };
    const resetPad = () => { setSignature(''); setPadKey((k) => k + 1); };

    const handleFailure = (e: unknown) => {
        const msg = getErrorMessage(e);
        const kind = classifySigningError(msg);
        if (kind === 'signature') {
            setError("We couldn't read your signature. Please clear it and sign again.");
            resetPad();
        } else if (kind && onProblem) {
            onProblem(kind);
        } else {
            setError(msg);
        }
    };

    const submitSign = async () => {
        if (!canSign) return;
        if (!/^data:image\/png;base64,/.test(signature)) { setError('Please draw your signature in the box.'); return; }
        if (signature.length > 390_000) { setError('That signature is too large to save. Please clear it and sign again.'); resetPad(); return; }
        setBusy(true);
        setError('');
        try {
            const extra = await onSign(trimmedName, signature);
            onComplete({ kind: 'signed', name: trimmedName, at: new Date().toISOString(), ...(optionSet && chosen ? { option: optionLabelOf(optionSet, chosen.id) } : {}), ...(extra || {}) });
        } catch (e) {
            handleFailure(e);
        } finally {
            setBusy(false);
        }
    };

    const submitDecline = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await onDecline(reason.trim().slice(0, 1000), trimmedName);
            if (res === 'unsupported') { setDeclineUnsupported(true); return; }
            onComplete({ kind: 'declined', name: trimmedName || 'there', at: new Date().toISOString() });
        } catch (e) {
            handleFailure(e);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section id={id} className="card overflow-hidden scroll-mt-24" aria-label={`Review and sign ${label}`}>
            <div className="border-b border-border bg-muted/40 px-4 py-4 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{mode === 'sign' ? (po ? 'Confirm order' : 'Review & sign') : (po ? 'Can’t fill this order' : 'Decline')}</p>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="min-w-0 break-words text-lg font-semibold text-foreground">{label}</h3>
                    {optionSet
                        ? chosen && <p className="text-lg font-bold tabular-nums text-foreground">{formatMoney(chosenTotal, currencyOf(d))}</p>
                        : totals.hasMoney && <p className="text-lg font-bold tabular-nums text-foreground">{formatMoney(totals.total, currencyOf(d))}</p>}
                </div>
                <p className="text-sm text-muted-foreground">From {company}</p>
                {addons.lines.length > 0 && mode === 'sign' && (
                    <p className="mt-2 text-sm text-muted-foreground">
                        {pickedAddons.length
                            ? <>Includes {pickedAddons.length === 1 ? 'the add-on' : `${pickedAddons.length} add-ons`}: <span className="font-medium text-foreground">{pickedAddons.map((li) => str(li.description) || 'Add-on').join(', ')}</span></>
                            : 'No optional add-ons added.'}
                    </p>
                )}
                {optionSet && mode === 'sign' && (
                    <div className={cx('mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm', chosen ? 'border-primary/30 bg-card' : 'border-warning/40 bg-warning/10')}>
                        <span className="min-w-0">
                            {chosen
                                ? <>You’re signing for option <span className="font-semibold text-foreground">{optionLabelOf(optionSet, chosen.id)}</span></>
                                : <span className="font-medium text-foreground">Choose one of the {optionSet.options.length} options first.</span>}
                        </span>
                        {onShowOptions && (
                            <button type="button" className="btn btn-ghost btn-sm min-h-[36px] text-primary" onClick={onShowOptions}>
                                {chosen ? 'Change' : 'See options'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {mode === 'sign' ? (
                <div className="space-y-5 px-4 py-5 sm:px-6">
                    <div>
                        <label className="label" htmlFor={`${doc.id}-signer`}>Your full name</label>
                        <input
                            id={`${doc.id}-signer`}
                            className="input min-h-[44px]"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="name"
                            maxLength={120}
                            placeholder="First and last name"
                            disabled={busy}
                            required
                        />
                    </div>
                    <div>
                        <p className="label">Signature</p>
                        <SignaturePad key={padKey} onSave={setSignature} />
                        <p className="mt-1.5 text-xs text-muted-foreground">Draw your signature with your finger or mouse.</p>
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm text-foreground">
                        <input
                            type="checkbox"
                            className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                            checked={consent}
                            onChange={(e) => setConsent(e.target.checked)}
                            disabled={busy}
                        />
                        <span>{po
                            ? `I confirm we can supply this order as listed, for delivery by the date requested or as agreed with ${company}.`
                            : `I have reviewed this ${noun} and agree to its terms. I understand this electronic signature is legally binding.`}</span>
                    </label>
                    {error && <Notice tone="danger" onClose={() => setError('')}>{error}</Notice>}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                            type="button"
                            className="btn btn-outline min-h-[44px] text-destructive"
                            onClick={() => { setMode('decline'); setError(''); }}
                            disabled={busy}
                        >
                            <XCircleIcon className="h-4 w-4" /> {po ? 'Can’t fill it' : 'Decline'}
                        </button>
                        <button type="button" className="btn btn-primary btn-lg min-h-[48px]" onClick={submitSign} disabled={!canSign}>
                            {busy ? <Spinner label={po ? 'Confirming…' : 'Signing…'} /> : (<><PenIcon className="h-4 w-4" /> {po ? 'Confirm order' : <>Approve &amp; sign</>}</>)}
                        </button>
                    </div>
                    {!canSign && !busy && (
                        <p className="text-center text-xs text-muted-foreground sm:text-right">
                            {needsOption ? 'Choose an option' : trimmedName.length < 2 ? 'Enter your full name' : !signature ? 'Add your signature' : !consent ? 'Tick the box to confirm' : ''}
                            {' '}to continue.
                        </p>
                    )}
                </div>
            ) : (
                <div className="space-y-4 px-4 py-5 sm:px-6">
                    <p className="text-sm text-muted-foreground">
                        {po
                            ? `Let ${company} know you can’t fill this order. Say what’s missing (out of stock, a later date, a price change) so they can adjust it.`
                            : `Let ${company} know you're declining this ${noun}. You can add a short reason so they can follow up.`}
                    </p>
                    <div>
                        <label className="label" htmlFor={`${doc.id}-decline-name`}>Your name</label>
                        <input
                            id={`${doc.id}-decline-name`}
                            className="input min-h-[44px]"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="name"
                            maxLength={120}
                            disabled={busy}
                        />
                    </div>
                    <div>
                        <label className="label" htmlFor={`${doc.id}-decline-reason`}>Reason (optional)</label>
                        <textarea
                            id={`${doc.id}-decline-reason`}
                            className="input min-h-[96px] resize-y"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={1000}
                            placeholder={po ? 'e.g. The 2x4s are out of stock until Dec 2.' : "e.g. We'd like to change the scope before approving."}
                            disabled={busy}
                        />
                        <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">{reason.length}/1000</p>
                    </div>
                    {declineUnsupported && (
                        <Notice tone="warning" title={`Please tell ${company} directly`}>
                            <p>Declining online isn't available for this {noun}. Reach out using any of these:</p>
                            <ContractorContact contractor={contractor} className="mt-2" />
                        </Notice>
                    )}
                    {error && <Notice tone="danger" onClose={() => setError('')}>{error}</Notice>}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                        <button
                            type="button"
                            className="btn btn-outline min-h-[44px]"
                            onClick={() => { setMode('sign'); setError(''); setDeclineUnsupported(false); }}
                            disabled={busy}
                        >
                            Back
                        </button>
                        {!declineUnsupported && (
                            <button type="button" className="btn btn-danger min-h-[44px]" onClick={submitDecline} disabled={busy}>
                                {busy ? <Spinner label="Sending…" /> : po ? 'Send reply' : `Decline ${noun}`}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
};

/* =====================================================================================
   Completion + error cards
   ===================================================================================== */

export const CompletionCard: React.FC<{
    outcome: SigningOutcome;
    doc: PublicDocument;
    contractor: PublicContractor;
    clientName?: string;
}> = ({ outcome, doc, contractor, clientName }) => {
    const signed = outcome.kind === 'signed';
    const company = contractorName(contractor);
    return (
        <section className="card card-pad text-center animate-zoom-in" role="status">
            <div className={cx('mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full', signed ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
                {signed ? <CheckCircleIcon className="h-9 w-9" /> : <XCircleIcon className="h-9 w-9" />}
            </div>
            <h2 className="text-xl font-bold text-foreground">
                {isPurchaseOrder(doc.type) ? (signed ? 'Order confirmed' : 'Reply sent') : signed ? `${doc.type} approved` : `${doc.type} declined`}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
                Thanks, {outcome.name}. {company} has been notified{signed ? '' : ' of your decision'}.
            </p>
            {signed && outcome.option && (
                <p className="mx-auto mt-1 max-w-md text-sm font-medium text-foreground">You chose option {outcome.option}.</p>
            )}
            {signed && outcome.addons && (
                <p className="mx-auto mt-1 max-w-md text-sm font-medium text-foreground">
                    {outcome.addons.length ? `Add-ons included: ${outcome.addons.join(', ')}.` : 'No optional add-ons added.'}
                </p>
            )}
            {signed && outcome.addonsNotRecorded && (
                <div className="mx-auto mt-3 max-w-md text-left">
                    <Notice tone="warning">
                        Your add-on choices couldn’t be saved online, so this {typeNoun(doc.type)} was signed at {formatMoney(outcome.addonsNotRecorded.total, currencyOf(doc.data))}, without them. Tell {company} which add-ons you want.
                    </Notice>
                </div>
            )}
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <ClockIcon className="h-4 w-4" /> {fmtDateTime(outcome.at)}
            </p>
            {signed && (
                <div className="mt-5 flex flex-col items-center">
                    <DownloadPdfButton doc={doc} contractor={contractor} clientName={clientName} label="Download a copy" />
                </div>
            )}
        </section>
    );
};

export const LinkErrorPage: React.FC<{ title: string; message: string; onRetry?: () => void; contractor?: PublicContractor | null }> = ({
    title, message, onRetry, contractor,
}) => (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
        {contractor && <BrandHeader contractor={contractor} />}
        <main className="flex flex-1 items-center justify-center px-4 py-12">
            <div className="card card-pad w-full max-w-md text-center animate-fade-in-up">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <AlertTriangleIcon className="h-7 w-7" />
                </div>
                <h1 className="text-xl font-bold">{title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{message}</p>
                {onRetry && (
                    <button type="button" className="btn btn-primary mt-6 min-h-[44px] w-full" onClick={onRetry}>Try again</button>
                )}
                {contractor && (
                    <div className="mt-6 border-t border-border pt-4 text-left">
                        <p className="mb-1 text-sm font-semibold">Contact {contractorName(contractor)}</p>
                        <ContractorContact contractor={contractor} />
                    </div>
                )}
            </div>
        </main>
        <PublicFooter />
    </div>
);

export const PublicPageSkeleton: React.FC = () => (
    <div className="flex min-h-screen flex-col bg-background">
        <div className="border-b border-border">
            <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:h-20 sm:px-6">
                <div className="skeleton h-10 w-10 rounded-full" />
                <div className="space-y-2">
                    <div className="skeleton h-4 w-40" />
                    <div className="skeleton h-3 w-28" />
                </div>
            </div>
        </div>
        <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-8 sm:px-6" aria-busy="true">
            <div className="skeleton h-8 w-2/3" />
            <div className="skeleton h-4 w-1/2" />
            <SkeletonRows rows={3} />
        </main>
    </div>
);

/* =====================================================================================
   Approval page
   ===================================================================================== */

interface DocumentApprovalViewProps {
    /** Legacy prop; the shared client from lib/supabase.ts is used. */
    supabase?: unknown;
    approvalToken: string;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

const DocumentApprovalView: React.FC<DocumentApprovalViewProps> = ({ approvalToken }) => {
    const token = str(approvalToken);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [loadError, setLoadError] = useState('');
    const [doc, setDoc] = useState<PublicDocument | null>(null);
    const [contractor, setContractor] = useState<PublicContractor | null>(null);
    const [problem, setProblem] = useState<LinkProblem | null>(null);
    const [outcome, setOutcome] = useState<SigningOutcome | null>(null);
    const [pageError, setPageError] = useState('');
    const [signInView, setSignInView] = useState(false);
    /** false when the link itself can't sign (already used by the client); null when the database didn't say */
    const [linkCanSign, setLinkCanSign] = useState<boolean | null>(null);
    /** good/better/best: the option the client picked on this page */
    const [pick, setPick] = useState<string | null>(null);
    /** optional add-ons ticked on this page (null = the contractor's own selection) */
    const [addonPicks, setAddonPicks] = useState<string[] | null>(null);
    const signRef = useRef<HTMLDivElement>(null);
    const optionsRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async (silent = false) => {
        if (!TOKEN_RE.test(token)) {
            setLoadError('This approval link is incomplete. Please open the full link from your email or message.');
            setStatus('error');
            return;
        }
        if (!silent) setStatus('loading');
        try {
            const { data, error } = await supabase.rpc('get_document_by_token', { doc_token: token });
            if (error) throw new Error(error.message);
            throwIfPayloadError(data);
            const payload = parseRpcPayload(data);
            const d = normalizeDocument(payload.document);
            if (!d) throw new Error('Document not found');
            const link = parseRpcPayload(payload.link);
            setLinkCanSign(typeof link.can_sign === 'boolean' ? link.can_sign : link.used_at ? false : null);
            setDoc(d);
            setContractor(normalizeContractor(payload.contractor));
            setStatus('ready');
        } catch (e) {
            if (silent) return;
            const msg = getErrorMessage(e);
            setLoadError(isNetworkMessage(msg) ? msg : 'This approval link is no longer valid. It may have been replaced by a newer link. Please ask the sender for the latest one.');
            setStatus('error');
        }
    }, [token]);

    useEffect(() => { load(); }, [load]);

    const state: DocState | LinkProblem | null = doc ? (problem && problem !== 'invalid' ? problem : getDocState(doc)) : null;
    // an open document behind a link the client already used (the contractor must send a new link)
    const linkUsed = state === 'open' && linkCanSign === false && !outcome;
    const canSign = state === 'open' && !outcome && !linkUsed;

    // Mobile: show a fixed "Review & sign" bar until the signing panel scrolls into view.
    useEffect(() => {
        const el = signRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const obs = new IntersectionObserver(([entry]) => setSignInView(entry.isIntersecting), { threshold: 0.05 });
        obs.observe(el);
        return () => obs.disconnect();
    }, [canSign, status]);

    const company = contractorName(contractor);
    const clientName = doc ? str(doc.data.clientName) : '';

    const intro = useMemo(() => {
        if (!doc) return { title: '', subtitle: '' };
        const noun = typeNoun(doc.type);
        if (outcome) return { title: outcome.kind === 'signed' ? 'All set' : 'Response sent', subtitle: `Your response to this ${noun} was recorded.` };
        if (linkUsed) return { title: 'This link was already used', subtitle: `Ask ${company} for a new link to sign this ${noun}.` };
        if (isPurchaseOrder(doc.type)) {
            switch (state) {
                case 'signed': return { title: 'Order already confirmed', subtitle: `This order was confirmed. You can download a copy below.` };
                case 'declined': return { title: 'Marked as can’t fill', subtitle: `Contact ${company} if anything has changed.` };
                case 'open': return { title: 'Confirm this order', subtitle: `${company} sent you a purchase order. Check the items and the delivery details, then confirm it or tell them what you can’t supply.` };
                default: return { title: 'Purchase order', subtitle: `Sent to you by ${company}.` };
            }
        }
        switch (state) {
            case 'signed': return { title: 'Already approved', subtitle: `This ${noun} has already been signed. You can download a copy below.` };
            case 'declined': return { title: 'Declined', subtitle: `This ${noun} was declined. Contact ${company} if you'd like to discuss it.` };
            case 'expired': return { title: `This ${noun} has expired`, subtitle: `Contact ${company} for an updated version.` };
            case 'open': return { title: 'Review and approve', subtitle: `${company} sent you ${article(noun)} ${noun} to review and sign.` };
            default: return { title: doc.type, subtitle: `Shared with you by ${company}.` };
        }
    }, [doc, state, outcome, company, linkUsed]);

    if (status === 'loading') return <PublicPageSkeleton />;
    if (status === 'error' || !doc || !contractor) {
        return (
            <LinkErrorPage
                title={isNetworkMessage(loadError) ? "We couldn't load this page" : 'This link is not valid'}
                message={loadError || 'This approval link is no longer valid.'}
                onRetry={isNetworkMessage(loadError) ? () => load() : undefined}
            />
        );
    }
    if (problem === 'invalid') {
        return (
            <LinkErrorPage
                title="This document is no longer available"
                message={`${company} may have replaced or withdrawn it. Please ask them for the latest link.`}
                contractor={contractor}
            />
        );
    }

    const addons = canSign ? addonView(doc, addonPicks) : null;
    const hasAddons = !!addons && addons.lines.length > 0;
    const totals = documentTotals(hasAddons ? addons!.data : doc.data);
    const toggleAddon = (id: string, on: boolean) => setAddonPicks((prev) => {
        const cur = prev ?? addonView(doc, null).picks;
        return on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id);
    });
    const optionSet = openOptionSet(doc);
    const pickedTotal = optionSet && pick ? summarizeOptions(doc.data, optionSet).find((x) => x.option.id === pick)?.totals.total ?? null : null;
    const range = optionSet ? optionRange(doc.data) : null;
    const showOptions = () => optionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const payBar = doc.type === 'Invoice' && str(doc.data.status) !== 'Draft' && !paymentReportOf(doc.data) ? payLinkFor(doc.data) : null;

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
            <BrandHeader contractor={contractor} tagline={doc.type === 'Invoice' ? 'Secure invoice' : isPurchaseOrder(doc.type) ? 'Secure order confirmation' : 'Secure document approval'} />

            <main className={cx('mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-10', ((canSign && !signInView) || payBar) && 'pb-28 sm:pb-10')}>
                <section className="animate-fade-in">
                    <h1 className="text-2xl font-bold sm:text-3xl">{intro.title}</h1>
                    <p className="mt-1 text-muted-foreground">{intro.subtitle}</p>
                </section>

                {outcome && <CompletionCard outcome={outcome} doc={doc} contractor={contractor} clientName={clientName} />}

                {pageError && <Notice tone="danger" onClose={() => setPageError('')}>{pageError}</Notice>}

                <div className="card card-pad scroll-mt-24" ref={optionsRef}>
                    <DocumentDetail
                        doc={doc}
                        contractor={contractor}
                        clientName={clientName}
                        onReportPayment={makeReportPayment({ token })}
                        onPaymentReported={() => load(true)}
                        chosenOptionId={pick}
                        onChooseOption={canSign ? setPick : undefined}
                        addonPicks={addonPicks}
                        onToggleAddon={hasAddons ? toggleAddon : undefined}
                    />
                    <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
                        <DownloadPdfButton doc={doc} contractor={contractor} clientName={clientName} onError={setPageError} />
                    </div>
                </div>

                {canSign && (
                    <div ref={signRef}>
                        <SigningPanel
                            id="sign"
                            doc={doc}
                            contractor={contractor}
                            defaultName={clientName}
                            chosenOptionId={pick}
                            onShowOptions={optionSet ? showOptions : undefined}
                            addonPicks={addonPicks}
                            onSign={async (name, signature) => {
                                if (optionSet && pick) await signWithOption({ token }, optionSet, pick, name, signature);
                                else if (hasAddons) return signWithAddons({ token }, doc, addonPicks, name, signature);
                                else await callSigningRpc('approve_document_by_token', { doc_token: token, p_signature: signature }, name);
                            }}
                            onDecline={(reason, name) => callDeclineRpcWithName(
                                'decline_document_by_token',
                                { doc_token: token, p_reason: reason || null },
                                name,
                            )}
                            onComplete={(o) => { setOutcome(o); load(true); }}
                            onProblem={(p) => { setProblem(p); load(true); }}
                        />
                    </div>
                )}

                <section className="card card-pad">
                    <h2 className="font-semibold">Questions about this {typeNoun(doc.type)}?</h2>
                    <p className="mb-2 text-sm text-muted-foreground">Contact {company} directly.</p>
                    <ContractorContact contractor={contractor} />
                </section>
            </main>

            {/* phones: the pay button stays in reach while the invoice is read */}
            {payBar && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-lift backdrop-blur sm:hidden">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-xs text-muted-foreground">{payBar.amountLabel}</p>
                            <p className="text-base font-bold tabular-nums">{formatMoney(payBar.amount, currencyOf(doc.data))}</p>
                        </div>
                        <a href={payBar.href} target="_blank" rel="noopener noreferrer" className="btn btn-primary min-h-[44px] shrink-0">
                            <CreditCardIcon className="h-4 w-4" /> Pay now
                        </a>
                    </div>
                </div>
            )}

            {canSign && !signInView && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-lift backdrop-blur sm:hidden">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-xs text-muted-foreground">
                                {optionSet ? (pick ? `Option ${optionLabelOf(optionSet, pick)}` : `${optionSet.options.length} options, choose one`) : documentLabel(doc.type, doc.data)}
                            </p>
                            {optionSet
                                ? <p className="text-base font-bold tabular-nums">{pickedTotal !== null ? formatMoney(pickedTotal, currencyOf(doc.data)) : range ? `from ${formatMoney(range.min, currencyOf(doc.data))}` : ''}</p>
                                : totals.hasMoney && <p className="text-base font-bold tabular-nums">{formatMoney(totals.total, currencyOf(doc.data))}</p>}
                        </div>
                        <button
                            type="button"
                            className="btn btn-primary min-h-[44px] shrink-0"
                            onClick={() => (optionSet && !pick ? showOptions() : signRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}
                        >
                            {optionSet && !pick ? 'Choose an option' : <><PenIcon className="h-4 w-4" /> {isPurchaseOrder(doc.type) ? 'Review & confirm' : <>Review &amp; sign</>}</>}
                        </button>
                    </div>
                </div>
            )}

            <PublicFooter />
        </div>
    );
};

export default DocumentApprovalView;
