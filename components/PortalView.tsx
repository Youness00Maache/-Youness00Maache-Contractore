/**
 * Public client portal (`/?portal=<key>`), no login. Lists the documents a contractor shared with
 * one client, shows correct totals, lets the client view/download documents and approve, sign or
 * decline estimates and change orders. Building blocks live in DocumentApprovalView.tsx.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { EmptyState, Modal, Notice, StatusBadge, cx, getErrorMessage } from './commsKit.tsx';
import { documentLabel } from '../utils/clientLinks.ts';
import { formatMoney } from '../utils/money.ts';
import {
    BrandHeader, CompletionCard, ContractorContact, DocumentDetail, DownloadPdfButton, LinkErrorPage, PublicFooter,
    PublicPageSkeleton, SIGNABLE_TYPES, SigningPanel, callDeclineRpcWithName, callSigningRpc, contractorName, currencyOf,
    documentTotals, fmtDate, getDocState, isNetworkMessage, normalizeContractor, normalizeDocument, parseRpcPayload, str,
    throwIfPayloadError,
    type LinkProblem, type PublicContractor, type PublicDocument, type SigningOutcome,
} from './DocumentApprovalView.tsx';
import {
    ChangeOrderIcon, ClockIcon, CreditCardIcon, DailyReportIcon, EstimateIcon, EyeIcon, FileTextIcon, InvoiceIcon, PenIcon,
    WarrantyIcon, WorkOrderIcon,
} from './Icons.tsx';

interface PortalViewProps {
    /** Legacy prop; the shared client from lib/supabase.ts is used. */
    supabase?: unknown;
    portalKey: string;
}

type TabId = 'invoices' | 'approvals' | 'other';

const TABS: Array<{ id: TabId; label: string; short: string }> = [
    { id: 'invoices', label: 'Invoices', short: 'Invoices' },
    { id: 'approvals', label: 'Estimates & change orders', short: 'Estimates' },
    { id: 'other', label: 'Reports & other', short: 'Other' },
];

/** Internal documents are never meant for clients (defence in depth; the RPC filters them too). */
const INTERNAL_TYPES = new Set(['Expense Log', 'Purchase Order', 'Material Log', 'Time Sheet', 'Note', 'Receipt', 'Profit Report']);
const PORTAL_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;

const typeIcon = (type: string, className = 'h-5 w-5') => {
    switch (type) {
        case 'Invoice': return <InvoiceIcon className={className} />;
        case 'Estimate': return <EstimateIcon className={className} />;
        case 'Change Order': return <ChangeOrderIcon className={className} />;
        case 'Daily Job Report': return <DailyReportIcon className={className} />;
        case 'Warranty': return <WarrantyIcon className={className} />;
        case 'Work Order': return <WorkOrderIcon className={className} />;
        default: return <FileTextIcon className={className} />;
    }
};

const typeTone = (type: string) =>
    type === 'Invoice' ? 'bg-success/10 text-success'
        : SIGNABLE_TYPES.includes(type) ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground';

const DocBadge: React.FC<{ doc: PublicDocument }> = ({ doc }) => {
    const state = getDocState(doc);
    if (state === 'open') {
        return (
            <span className="badge badge-warning">
                <ClockIcon className="h-3.5 w-3.5" /> Awaiting your signature
            </span>
        );
    }
    if (state === 'signed') return <StatusBadge status="Accepted" />;
    if (state === 'declined') return <StatusBadge status="Declined" />;
    if (state === 'expired') return <StatusBadge status="Expired" />;
    const status = str(doc.data.status);
    return status ? <StatusBadge status={status} /> : null;
};

const StatCard: React.FC<{ label: string; value: string; hint?: string; icon: React.ReactNode; highlight?: boolean; className?: string }> = ({
    label, value, hint, icon, highlight, className,
}) => (
    <div className={cx('card card-pad', highlight && 'border-warning/50 bg-warning/5', className)}>
        <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg', highlight ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary')}>{icon}</span>
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
);

const DocumentRow: React.FC<{
    doc: PublicDocument;
    contractor: PublicContractor;
    clientName: string;
    onView: () => void;
    onSign: () => void;
    onDownloadError: (msg: string) => void;
}> = ({ doc, contractor, clientName, onView, onSign, onDownloadError }) => {
    const d = doc.data;
    const state = getDocState(doc);
    const totals = documentTotals(d);
    const label = documentLabel(doc.type, d);
    const date = fmtDate(d.issueDate || d.date || doc.createdAt);
    const title = str(d.title);
    const showBalance = doc.type === 'Invoice' && totals.amountPaid > 0;
    return (
        <article className="card card-pad flex flex-col gap-4 transition hover:shadow-card sm:flex-row sm:items-center">
            <button type="button" onClick={onView} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', typeTone(doc.type))}>{typeIcon(doc.type)}</span>
                <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground">{label}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                        {title && title !== label ? `${title} · ` : ''}{doc.type}{date ? ` · ${date}` : ''}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5"><DocBadge doc={doc} /></span>
                </span>
            </button>
            <div className="flex flex-col gap-3 sm:items-end">
                {totals.hasMoney && (
                    <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{showBalance ? 'Balance due' : 'Total'}</p>
                        <p className="text-lg font-bold tabular-nums text-foreground">
                            {formatMoney(showBalance ? totals.balanceDue : totals.total, currencyOf(d))}
                        </p>
                    </div>
                )}
                <div className="flex gap-2">
                    {state === 'open' && (
                        <button type="button" className="btn btn-primary min-h-[40px] flex-1 sm:flex-none" onClick={onSign}>
                            <PenIcon className="h-4 w-4" /> Review &amp; sign
                        </button>
                    )}
                    <button type="button" className="btn btn-outline min-h-[40px] flex-1 sm:flex-none" onClick={onView}>
                        <EyeIcon className="h-4 w-4" /> View
                    </button>
                    <DownloadPdfButton doc={doc} contractor={contractor} clientName={clientName} iconOnly onError={onDownloadError} />
                </div>
                {state === 'expired' && (
                    <p className="text-xs text-muted-foreground sm:text-right">Expired. Contact {contractorName(contractor)} for an updated version.</p>
                )}
            </div>
        </article>
    );
};

const PROBLEM_COPY: Record<LinkProblem, { tone: 'success' | 'danger' | 'warning'; text: (noun: string) => string }> = {
    signed: { tone: 'success', text: (n) => `This ${n} has already been signed.` },
    declined: { tone: 'danger', text: (n) => `This ${n} has already been declined.` },
    expired: { tone: 'warning', text: (n) => `This ${n} has expired and can no longer be signed online.` },
    invalid: { tone: 'danger', text: () => 'This document is no longer available in your portal.' },
};

const PortalView: React.FC<PortalViewProps> = ({ portalKey }) => {
    const key = str(portalKey);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [loadError, setLoadError] = useState('');
    const [clientName, setClientName] = useState('');
    const [contractor, setContractor] = useState<PublicContractor | null>(null);
    const [documents, setDocuments] = useState<PublicDocument[]>([]);
    const [tab, setTab] = useState<TabId>('invoices');
    const [tabTouched, setTabTouched] = useState(false);
    const [openDoc, setOpenDoc] = useState<{ id: string; signing: boolean; session: number } | null>(null);
    const [outcomes, setOutcomes] = useState<Record<string, SigningOutcome>>({});
    const [problems, setProblems] = useState<Record<string, LinkProblem>>({});
    const [modalBusy, setModalBusy] = useState(false);
    const [pageError, setPageError] = useState('');
    const sessionRef = useRef(0);
    const panelRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async (silent = false) => {
        if (!PORTAL_KEY_RE.test(key)) {
            setLoadError('This portal link is incomplete. Please open the full link from your email or message.');
            setStatus('error');
            return;
        }
        if (!silent) setStatus('loading');
        try {
            const { data, error } = await supabase.rpc('get_portal_data', { p_key: key });
            if (error) throw new Error(error.message);
            throwIfPayloadError(data);
            const payload = parseRpcPayload(data);
            const docs = (Array.isArray(payload.documents) ? payload.documents : [])
                .map(normalizeDocument)
                .filter((d): d is PublicDocument => !!d)
                .filter((d) => !INTERNAL_TYPES.has(d.type) && str(d.data.status) !== 'Draft')
                .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
            setDocuments(docs);
            setClientName(str(parseRpcPayload(payload.client).name));
            setContractor(normalizeContractor(payload.contractor));
            setStatus('ready');
        } catch (e) {
            if (silent) return;
            const msg = getErrorMessage(e);
            setLoadError(isNetworkMessage(msg)
                ? msg
                : 'This portal link is no longer valid. It may have been replaced with a new link. Please ask your contractor to send you the latest one.');
            setStatus('error');
        }
    }, [key]);

    useEffect(() => { load(); }, [load]);

    const groups = useMemo(() => {
        const invoices = documents.filter((d) => d.type === 'Invoice');
        const approvals = documents.filter((d) => SIGNABLE_TYPES.includes(d.type));
        const other = documents.filter((d) => d.type !== 'Invoice' && !SIGNABLE_TYPES.includes(d.type));
        const awaiting = approvals.filter((d) => getDocState(d) === 'open');
        const unpaid = invoices.filter((d) => ['Sent', 'Overdue'].includes(str(d.data.status)));
        const outstanding = unpaid.reduce((sum, d) => sum + documentTotals(d.data).balanceDue, 0);
        const currency = invoices[0] ? currencyOf(invoices[0].data) : 'USD';
        return { invoices, approvals, other, awaiting, unpaid, outstanding, currency };
    }, [documents]);

    // Pick the most useful tab on first load (documents waiting for a signature first).
    useEffect(() => {
        if (status !== 'ready' || tabTouched) return;
        const { awaiting, invoices, approvals, other } = groups;
        setTab(awaiting.length ? 'approvals' : invoices.length ? 'invoices' : approvals.length ? 'approvals' : other.length ? 'other' : 'invoices');
    }, [status, tabTouched, groups]);

    // Bring the signing panel into view when it opens.
    useEffect(() => {
        if (!openDoc?.signing) return;
        const t = window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        return () => window.clearTimeout(t);
    }, [openDoc?.signing, openDoc?.session]);

    const openDocument = (id: string, signing: boolean) => {
        sessionRef.current += 1;
        setOpenDoc({ id, signing, session: sessionRef.current });
    };
    const closeModal = () => {
        if (modalBusy) return;
        setOpenDoc(null);
    };
    const selectTab = (id: TabId) => {
        setTab(id);
        setTabTouched(true);
    };

    if (status === 'loading') return <PublicPageSkeleton />;
    if (status === 'error' || !contractor) {
        return (
            <LinkErrorPage
                title={isNetworkMessage(loadError) ? "We couldn't load your portal" : 'This link is not valid'}
                message={loadError || 'This portal link is no longer valid.'}
                onRetry={isNetworkMessage(loadError) ? () => load() : undefined}
            />
        );
    }

    const company = contractorName(contractor);
    const firstName = clientName.split(/\s+/)[0] || '';
    const counts: Record<TabId, number> = { invoices: groups.invoices.length, approvals: groups.approvals.length, other: groups.other.length };
    const activeDocs = tab === 'invoices' ? groups.invoices : tab === 'approvals' ? groups.approvals : groups.other;

    const current = openDoc ? documents.find((d) => d.id === openDoc.id) ?? null : null;
    const currentOutcome = current ? outcomes[current.id] : undefined;
    const currentProblem = current ? problems[current.id] : undefined;
    const currentSignable = !!current && getDocState(current) === 'open' && !currentOutcome && !currentProblem;

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
            <BrandHeader contractor={contractor} />

            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
                <section className="animate-fade-in">
                    <p className="text-sm font-semibold text-primary">Client portal</p>
                    <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Hello{firstName ? `, ${firstName}` : ''}</h1>
                    <p className="mt-1 max-w-2xl text-muted-foreground">
                        Your documents from {company}, all in one place. View, download and sign them anytime.
                    </p>
                </section>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <StatCard
                        className="col-span-2 sm:col-span-1"
                        label="Outstanding balance"
                        value={formatMoney(groups.outstanding, groups.currency)}
                        hint={groups.unpaid.length ? `${groups.unpaid.length} unpaid invoice${groups.unpaid.length === 1 ? '' : 's'}` : 'Nothing due right now'}
                        icon={<CreditCardIcon className="h-4 w-4" />}
                    />
                    <StatCard
                        label="To sign"
                        value={String(groups.awaiting.length)}
                        hint={groups.awaiting.length ? 'Waiting for you' : 'All caught up'}
                        icon={<PenIcon className="h-4 w-4" />}
                        highlight={groups.awaiting.length > 0}
                    />
                    <StatCard
                        label="Documents"
                        value={String(documents.length)}
                        hint={`Shared by ${company}`}
                        icon={<FileTextIcon className="h-4 w-4" />}
                    />
                </div>

                {groups.awaiting.length > 0 && tab !== 'approvals' && (
                    <Notice
                        tone="warning"
                        className="mt-4"
                        title={`${groups.awaiting.length} document${groups.awaiting.length === 1 ? ' is' : 's are'} waiting for your signature`}
                        action={<button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={() => selectTab('approvals')}>Review now</button>}
                    />
                )}

                {pageError && <Notice tone="danger" className="mt-4" onClose={() => setPageError('')}>{pageError}</Notice>}

                {documents.length === 0 ? (
                    <EmptyState
                        className="mt-8"
                        icon={<FileTextIcon className="h-6 w-6" />}
                        title="No documents yet"
                        description={`When ${company} shares invoices, estimates or reports with you, they'll show up here.`}
                    />
                ) : (
                    <>
                        <div role="tablist" aria-label="Document types" className="mt-8 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
                            {TABS.map((t) => {
                                const active = tab === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        onClick={() => selectTab(t.id)}
                                        className={cx(
                                            'flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition sm:text-sm',
                                            active ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <span className="truncate sm:hidden">{t.short}</span>
                                        <span className="hidden truncate sm:inline">{t.label}</span>
                                        <span className={cx('rounded-full px-1.5 text-[11px] tabular-nums', active ? 'bg-primary/10 text-primary' : 'bg-background/60')}>
                                            {counts[t.id]}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-4 space-y-3" role="tabpanel">
                            {activeDocs.length === 0 ? (
                                <EmptyState
                                    icon={tab === 'invoices' ? <InvoiceIcon className="h-6 w-6" /> : tab === 'approvals' ? <EstimateIcon className="h-6 w-6" /> : <DailyReportIcon className="h-6 w-6" />}
                                    title={tab === 'invoices' ? 'No invoices yet' : tab === 'approvals' ? 'No estimates or change orders' : 'No reports yet'}
                                    description={`Documents ${company} shares with you will appear here.`}
                                />
                            ) : (
                                activeDocs.map((doc) => (
                                    <DocumentRow
                                        key={doc.id}
                                        doc={doc}
                                        contractor={contractor}
                                        clientName={clientName}
                                        onView={() => openDocument(doc.id, false)}
                                        onSign={() => openDocument(doc.id, true)}
                                        onDownloadError={setPageError}
                                    />
                                ))
                            )}
                        </div>
                    </>
                )}

                <section className="card card-pad mt-8">
                    <h2 className="font-semibold">Questions? Contact {company}</h2>
                    <p className="mb-2 text-sm text-muted-foreground">They'll be happy to help with any of these documents.</p>
                    <ContractorContact contractor={contractor} />
                </section>
            </main>

            <PublicFooter />

            <Modal
                open={!!current}
                onClose={closeModal}
                locked={modalBusy}
                size="xl"
                title={current ? documentLabel(current.type, current.data) : ''}
                description={current ? `${current.type} from ${company}` : undefined}
            >
                {current && (
                    <div className="space-y-6 pb-2">
                        {currentOutcome && <CompletionCard outcome={currentOutcome} doc={current} contractor={contractor} clientName={clientName} />}
                        {currentProblem && (
                            <Notice tone={PROBLEM_COPY[currentProblem].tone}>
                                {PROBLEM_COPY[currentProblem].text(current.type.toLowerCase())}
                                {currentProblem !== 'signed' && ` Contact ${company} if you have questions.`}
                            </Notice>
                        )}
                        <DocumentDetail doc={current} contractor={contractor} clientName={clientName} />
                        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                            <DownloadPdfButton doc={current} contractor={contractor} clientName={clientName} />
                        </div>
                        {currentSignable && openDoc && (openDoc.signing ? (
                            <div ref={panelRef} className="scroll-mt-4">
                                <SigningPanel
                                    key={`${current.id}-${openDoc.session}`}
                                    doc={current}
                                    contractor={contractor}
                                    defaultName={clientName}
                                    onSign={async (name, signature) => {
                                        await callSigningRpc('sign_document_via_portal', { p_key: key, p_doc_id: current.id, p_signature: signature }, name);
                                    }}
                                    onDecline={(reason, name) => callDeclineRpcWithName(
                                        'decline_document_via_portal',
                                        { p_key: key, p_doc_id: current.id, p_reason: reason || null },
                                        name,
                                    )}
                                    onComplete={(o) => {
                                        setOutcomes((prev) => ({ ...prev, [current.id]: o }));
                                        load(true);
                                    }}
                                    onProblem={(p) => {
                                        setProblems((prev) => ({ ...prev, [current.id]: p }));
                                        load(true);
                                    }}
                                    onBusyChange={setModalBusy}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="font-semibold text-foreground">Ready to approve?</p>
                                    <p className="text-sm text-muted-foreground">Sign online in under a minute, or decline with a note.</p>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-primary min-h-[44px]"
                                    onClick={() => setOpenDoc((o) => (o ? { ...o, signing: true } : o))}
                                >
                                    <PenIcon className="h-4 w-4" /> Review &amp; sign
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default PortalView;
