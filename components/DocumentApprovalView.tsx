/**
 * Public, no-login pages for clients: single-document approval (`/?approval_token=<token>`).
 * This file also exports the building blocks shared with `PortalView.tsx` (branding, document
 * detail, signing panel, PDF download). Everything is rendered as React text: no HTML injection.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import SignaturePad from './SignaturePad.tsx';
import { Avatar, Notice, SkeletonRows, Spinner, StatusBadge, cx, getErrorMessage } from './commsKit.tsx';
import { documentLabel, isExpired, isMissingFunctionError } from '../utils/clientLinks.ts';
import { computeDocumentTotals, formatMoney, lineItemAmount, toNumber, type DocumentTotals } from '../utils/money.ts';
import { safeUrl } from '../utils/escapeHtml.ts';
import { generateDocumentBase64 } from '../services/pdfGenerator.ts';
import type { Job, UserProfile } from '../types.ts';
import {
    AlertTriangleIcon, CheckCircleIcon, ClockIcon, CreditCardIcon, DownloadIcon, GlobeIcon, MailIcon,
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
}

export interface SigningOutcome {
    kind: 'signed' | 'declined';
    name: string;
    at: string;
}

/** A state the link/document is in that replaces the normal review UI. */
export type LinkProblem = 'signed' | 'declined' | 'expired' | 'invalid';
export type DocState = 'open' | 'signed' | 'declined' | 'expired' | 'readonly';

export const SIGNABLE_TYPES = ['Estimate', 'Change Order'];

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

export const isSignedData = (d: Record<string, any>) =>
    str(d.status) === 'Accepted' || !!str(d.clientSignatureUrl) || !!str(d.clientSignedAt);
export const isDeclinedData = (d: Record<string, any>) => str(d.status) === 'Rejected' || !!str(d.clientDeclinedAt);
export const signerNameOf = (d: Record<string, any>) => str(d.clientSignerName) || str(d.clientSignedBy);

export const getDocState = (doc: PublicDocument): DocState => {
    if (!SIGNABLE_TYPES.includes(doc.type)) return 'readonly';
    if (isSignedData(doc.data)) return 'signed';
    if (isDeclinedData(doc.data)) return 'declined';
    if (isExpired(str(doc.data.expiryDate))) return 'expired';
    return 'open';
};

/** computeDocumentTotals(), with a fallback for documents that only carry a flat `amount`. */
export const documentTotals = (d: Record<string, any>): DocumentTotals & { hasMoney: boolean } => {
    const totals = computeDocumentTotals(d);
    const hasItems = Array.isArray(d.lineItems) && d.lineItems.length > 0;
    if (!hasItems) {
        const amount = toNumber(d.amount);
        if (amount > 0) {
            const paid = Math.max(0, toNumber(d.amountPaid));
            return { ...totals, subtotal: amount, taxableAmount: amount, total: amount, amountPaid: paid, balanceDue: Math.max(0, amount - paid), hasMoney: true };
        }
    }
    return { ...totals, hasMoney: hasItems };
};

export const currencyOf = (d: Record<string, any>) => str(d.currency) || 'USD';

const typeNoun = (type: string) => (type ? type.toLowerCase() : 'document');
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

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
    if (/invalid|not found|no longer/.test(m)) return 'invalid';
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
                <CheckCircleIcon className="h-5 w-5 text-success" /> Approved by {who}
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

export const DocumentDetail: React.FC<{ doc: PublicDocument; contractor: PublicContractor; clientName?: string }> = ({ doc, contractor, clientName = '' }) => {
    const d = doc.data;
    const currency = currencyOf(d);
    const money = (v: number) => formatMoney(v, currency);
    const totals = documentTotals(d);
    const items: any[] = Array.isArray(d.lineItems) ? d.lineItems.filter((it: unknown) => it && typeof it === 'object') : [];
    const isProgress = !!d.isProgressBilling;
    const state = getDocState(doc);
    const label = documentLabel(doc.type, d);
    const title = str(d.title);

    const dates: Array<[string, string]> = ([
        ['Issued', fmtDate(d.issueDate || d.date || doc.createdAt)],
        ['Due', fmtDate(d.dueDate)],
        ['Valid until', fmtDate(d.expiryDate)],
        ['Completed', fmtDate(d.completedDate)],
    ] as Array<[string, string]>).filter(([, v]) => !!v);

    const toName = str(d.clientName) || clientName;
    const toAddress = str(d.clientAddress) || str(d.projectAddress);
    const fromName = contractorName(contractor);
    const fromAddress = contractor.address || str(d.companyAddress);

    const facts: Array<[string, string]> = ([
        ['Project', str(d.projectName)],
        ['Reason', str(d.reason)],
        ['Status', doc.type === 'Work Order' ? str(d.status) : ''],
        ['Hours', toNumber(d.hours) > 0 ? String(toNumber(d.hours)) : ''],
        ['Warranty period', str(d.duration)],
        ['Weather', [str(d.weather), str(d.temperature)].filter(Boolean).join(' · ')],
    ] as Array<[string, string]>).filter(([, v]) => !!v);

    const sections: Array<[string, string]> = ([
        ['Description', htmlToText(d.description)],
        ['Coverage', htmlToText(d.coverage)],
        ['Conditions', htmlToText(d.conditions)],
        ['Report', htmlToText(d.content)],
        ['Materials used', htmlToText(d.materialsUsed)],
        ['Notes', htmlToText(d.notes)],
        ['Terms & conditions', htmlToText(d.terms)],
    ] as Array<[string, string]>).filter(([, v]) => !!v);

    const contractSum = toNumber(d.currentContractSum);
    const payLink = doc.type === 'Invoice' && totals.balanceDue > 0 && str(d.status) !== 'Paid' && /^https:\/\//i.test(str(d.paypalLink))
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
                {totals.hasMoney && (
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
                    <p className="label">{doc.type === 'Invoice' ? 'Bill to' : 'Prepared for'}</p>
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
                                        <td className="whitespace-pre-wrap break-words">{str(it.description) || '—'}</td>
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
                                    <p className="min-w-0 whitespace-pre-wrap break-words text-sm font-medium text-foreground">{str(it.description) || '—'}</p>
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

            {/* Totals */}
            {totals.hasMoney && (
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

            {payLink && (
                <a href={payLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary min-h-[44px] w-full sm:w-auto">
                    <CreditCardIcon className="h-4 w-4" /> Pay online
                </a>
            )}

            {sections.map(([k, v]) => <TextSection key={k} title={k} text={v} />)}

            {/* Signature / decision state */}
            {state === 'signed' && <SignatureBlock doc={doc} />}
            {state === 'declined' && (
                <Notice tone="danger" title={`Declined${signerNameOf(d) ? ` by ${signerNameOf(d)}` : ''}${fmtDateTime(d.clientDeclinedAt) ? ` on ${fmtDateTime(d.clientDeclinedAt)}` : ''}`}>
                    {str(d.clientDeclineReason) ? <span className="whitespace-pre-wrap">Reason: {str(d.clientDeclineReason)}</span> : `This ${typeNoun(doc.type)} was declined.`}
                </Notice>
            )}
            {state === 'expired' && (
                <Notice tone="warning" title={`This ${typeNoun(doc.type)} expired${fmtDate(d.expiryDate) ? ` on ${fmtDate(d.expiryDate)}` : ''}`}>
                    Prices and availability may have changed. Contact {contractorName(contractor)} for an updated version.
                </Notice>
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
    onSign: (name: string, signature: string) => Promise<void>;
    onDecline: (reason: string, name: string) => Promise<'ok' | 'unsupported'>;
    onComplete: (outcome: SigningOutcome) => void;
    /** Called when the server says the document is already signed/declined/expired/gone. */
    onProblem?: (problem: LinkProblem) => void;
    onBusyChange?: (busy: boolean) => void;
    id?: string;
}> = ({ doc, contractor, defaultName = '', onSign, onDecline, onComplete, onProblem, onBusyChange, id }) => {
    const [mode, setMode] = useState<'sign' | 'decline'>('sign');
    const [name, setName] = useState(defaultName);
    const [signature, setSignature] = useState('');
    const [padKey, setPadKey] = useState(() => Date.now());
    const [consent, setConsent] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusyState] = useState(false);
    const [error, setError] = useState('');
    const [declineUnsupported, setDeclineUnsupported] = useState(false);

    const d = doc.data;
    const totals = documentTotals(d);
    const label = documentLabel(doc.type, d);
    const noun = typeNoun(doc.type);
    const company = contractorName(contractor);
    const trimmedName = name.trim();
    const canSign = trimmedName.length >= 2 && signature.startsWith('data:image/') && consent && !busy;

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
            await onSign(trimmedName, signature);
            onComplete({ kind: 'signed', name: trimmedName, at: new Date().toISOString() });
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
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{mode === 'sign' ? 'Review & sign' : 'Decline'}</p>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="min-w-0 break-words text-lg font-semibold text-foreground">{label}</h3>
                    {totals.hasMoney && <p className="text-lg font-bold tabular-nums text-foreground">{formatMoney(totals.total, currencyOf(d))}</p>}
                </div>
                <p className="text-sm text-muted-foreground">From {company}</p>
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
                        <span>I have reviewed this {noun} and agree to its terms. I understand this electronic signature is legally binding.</span>
                    </label>
                    {error && <Notice tone="danger" onClose={() => setError('')}>{error}</Notice>}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                            type="button"
                            className="btn btn-outline min-h-[44px] text-destructive"
                            onClick={() => { setMode('decline'); setError(''); }}
                            disabled={busy}
                        >
                            <XCircleIcon className="h-4 w-4" /> Decline
                        </button>
                        <button type="button" className="btn btn-primary btn-lg min-h-[48px]" onClick={submitSign} disabled={!canSign}>
                            {busy ? <Spinner label="Signing…" /> : (<><PenIcon className="h-4 w-4" /> Approve &amp; sign</>)}
                        </button>
                    </div>
                    {!canSign && !busy && (
                        <p className="text-center text-xs text-muted-foreground sm:text-right">
                            {trimmedName.length < 2 ? 'Enter your full name' : !signature ? 'Add your signature' : !consent ? 'Tick the box to confirm' : ''}
                            {' '}to continue.
                        </p>
                    )}
                </div>
            ) : (
                <div className="space-y-4 px-4 py-5 sm:px-6">
                    <p className="text-sm text-muted-foreground">
                        Let {company} know you're declining this {noun}. You can add a short reason so they can follow up.
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
                            placeholder="e.g. We'd like to change the scope before approving."
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
                                {busy ? <Spinner label="Sending…" /> : `Decline ${noun}`}
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
            <h2 className="text-xl font-bold text-foreground">{signed ? `${doc.type} approved` : `${doc.type} declined`}</h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
                Thanks, {outcome.name}. {company} has been notified{signed ? '' : ' of your decision'}.
            </p>
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
    const signRef = useRef<HTMLDivElement>(null);

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
    const canSign = state === 'open' && !outcome;

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
        switch (state) {
            case 'signed': return { title: 'Already approved', subtitle: `This ${noun} has already been signed. You can download a copy below.` };
            case 'declined': return { title: 'Declined', subtitle: `This ${noun} was declined. Contact ${company} if you'd like to discuss it.` };
            case 'expired': return { title: `This ${noun} has expired`, subtitle: `Contact ${company} for an updated version.` };
            case 'open': return { title: 'Review and approve', subtitle: `${company} sent you ${article(noun)} ${noun} to review and sign.` };
            default: return { title: doc.type, subtitle: `Shared with you by ${company}.` };
        }
    }, [doc, state, outcome, company]);

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

    const totals = documentTotals(doc.data);

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
            <BrandHeader contractor={contractor} tagline="Secure document approval" />

            <main className={cx('mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-10', canSign && !signInView && 'pb-28 sm:pb-10')}>
                <section className="animate-fade-in">
                    <h1 className="text-2xl font-bold sm:text-3xl">{intro.title}</h1>
                    <p className="mt-1 text-muted-foreground">{intro.subtitle}</p>
                </section>

                {outcome && <CompletionCard outcome={outcome} doc={doc} contractor={contractor} clientName={clientName} />}

                {pageError && <Notice tone="danger" onClose={() => setPageError('')}>{pageError}</Notice>}

                <div className="card card-pad">
                    <DocumentDetail doc={doc} contractor={contractor} clientName={clientName} />
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
                            onSign={async (name, signature) => {
                                await callSigningRpc('approve_document_by_token', { doc_token: token, p_signature: signature }, name);
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

            {canSign && !signInView && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-lift backdrop-blur sm:hidden">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-xs text-muted-foreground">{documentLabel(doc.type, doc.data)}</p>
                            {totals.hasMoney && <p className="text-base font-bold tabular-nums">{formatMoney(totals.total, currencyOf(doc.data))}</p>}
                        </div>
                        <button
                            type="button"
                            className="btn btn-primary min-h-[44px] shrink-0"
                            onClick={() => signRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        >
                            <PenIcon className="h-4 w-4" /> Review &amp; sign
                        </button>
                    </div>
                </div>
            )}

            <PublicFooter />
        </div>
    );
};

export default DocumentApprovalView;
