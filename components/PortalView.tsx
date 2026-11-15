/**
 * Public client portal (`/?portal=<key>`), no login. Like the original portal: Invoices / Estimates (+ change
 * orders) / Reports (+ work orders, warranties, receipts) tabs, the outstanding balance of every unpaid invoice,
 * "Review & sign" on estimates and change orders the client hasn't answered, and Download on every document; plus
 * pay now, "I've paid", decline with a reason and shared job photos. Drafts are not shown (the database leaves
 * them out). Building blocks live in DocumentApprovalView.tsx, the rules in utils/clientPortalRules.ts.
 *
 * Project view (roadmap D9, components/portal/): a client who has jobs also gets "Project" (the job's progress,
 * milestones, what happens next, balance + its documents, photos) next to "All documents" (the list below, unchanged).
 * Without jobs, or while the database doesn't have get_portal_project_dashboard yet, the page is exactly the old one.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { EmptyState, Modal, Notice, StatusBadge, cx, getErrorMessage } from './commsKit.tsx';
import { documentLabel } from '../utils/clientLinks.ts';
import { formatMoney } from '../utils/money.ts';
import { payLinkFor, paymentReportOf } from '../lib/payments.ts';
import { groupPortalDocuments } from '../utils/clientPortalRules.ts';
import PortalPhotos from './photos/PortalPhotos.tsx';
import PortalPunchList from './punch/PortalPunchList.tsx';
import PortalCredentials from './papers/PortalCredentials.tsx';
import PortalProjectDashboard, { JobSwitcher, ProjectSkeleton } from './portal/PortalProjectDashboard.tsx';
import { usePortalDashboard } from './portal/usePortalDashboard.ts';
import type { DashboardDocumentRow, NextStep } from '../lib/portal/dashboardTypes.ts';
import type { StepAction } from '../lib/portal/dashboardLogic.ts';
import PortalServicePlans from './service/PortalServicePlans.tsx';
import { choiceOf, optionRange, withEffectiveLines } from '../lib/estimateOptions.ts';
import {
    BrandHeader, CompletionCard, ContractorContact, DocumentDetail, DownloadPdfButton, LinkErrorPage, PublicFooter,
    PublicPageSkeleton, SIGNABLE_TYPES, SigningPanel, callDeclineRpcWithName, callSigningRpc, contractorName, currencyOf,
    documentTotals, fmtDate, getDocState, isNetworkMessage, makeReportPayment, normalizeContractor, normalizeDocument, openOptionSet, parseRpcPayload,
    signWithOption, str, throwIfPayloadError,
    type LinkProblem, type PublicContractor, type PublicDocument, type SigningOutcome,
} from './DocumentApprovalView.tsx';
import {
    ChangeOrderIcon, ClockIcon, CreditCardIcon, DailyReportIcon, EstimateIcon, EyeIcon, FileTextIcon, InvoiceIcon, PenIcon,
    ReceiptIcon, WarrantyIcon, WorkOrderIcon,
} from './Icons.tsx';

interface PortalViewProps {
    /** Legacy prop; the shared client from lib/supabase.ts is used. */
    supabase?: unknown;
    portalKey: string;
}

type TabId = 'invoices' | 'approvals' | 'other';

const TABS: Array<{ id: TabId; label: string; short: string; empty: string }> = [
    { id: 'invoices', label: 'Invoices', short: 'Invoices', empty: 'No invoices yet' },
    { id: 'approvals', label: 'Estimates & change orders', short: 'Estimates', empty: 'No estimates or change orders yet' },
    { id: 'other', label: 'Reports & other', short: 'Reports', empty: 'No reports yet' },
];

/** Internal documents are never meant for clients (defence in depth; the RPC filters them too). */
const INTERNAL_TYPES = new Set(['Expense Log', 'Purchase Order', 'Material Log', 'Time Sheet', 'Note', 'Profit Report']);
const PORTAL_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;

const typeIcon = (type: string, className = 'h-5 w-5') => {
    switch (type) {
        case 'Invoice': return <InvoiceIcon className={className} />;
        case 'Estimate': return <EstimateIcon className={className} />;
        case 'Change Order': return <ChangeOrderIcon className={className} />;
        case 'Daily Job Report': return <DailyReportIcon className={className} />;
        case 'Warranty': return <WarrantyIcon className={className} />;
        case 'Work Order': return <WorkOrderIcon className={className} />;
        case 'Receipt': return <ReceiptIcon className={className} />;
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
    // good/better/best: the chosen option's total once the client chose
    const totals = documentTotals(doc.type === 'Estimate' ? withEffectiveLines(d) : d);
    const label = documentLabel(doc.type, d);
    const date = fmtDate(d.issueDate || d.date || doc.createdAt);
    const title = str(d.title);
    const showBalance = doc.type === 'Invoice' && totals.amountPaid > 0;
    const pay = doc.type === 'Invoice' && str(d.status) !== 'Draft' ? payLinkFor(d) : null;
    const reported = doc.type === 'Invoice' ? paymentReportOf(d) : null;
    // good/better/best: "3 options from $X" until one is chosen
    const optionSet = openOptionSet(doc);
    const range = optionSet && !choiceOf(d, optionSet) ? optionRange(d) : null;
    return (
        <article className="card card-pad flex flex-col gap-4 transition hover:shadow-card sm:flex-row sm:items-center">
            <button type="button" onClick={onView} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', typeTone(doc.type))}>{typeIcon(doc.type)}</span>
                <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground">{label}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                        {title && title !== label ? `${title} · ` : ''}{doc.type}{date ? ` · ${date}` : ''}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                        <DocBadge doc={doc} />
                        {reported && <span className="badge badge-primary">Payment reported {fmtDate(reported.at)}</span>}
                    </span>
                </span>
            </button>
            <div className="flex flex-col gap-3 sm:items-end">
                {range ? (
                    <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{range.count} options from</p>
                        <p className="text-lg font-bold tabular-nums text-foreground">{formatMoney(range.min, currencyOf(d))}</p>
                    </div>
                ) : totals.hasMoney && (
                    <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{showBalance ? 'Balance due' : 'Total'}</p>
                        <p className="text-lg font-bold tabular-nums text-foreground">
                            {formatMoney(showBalance ? totals.balanceDue : totals.total, currencyOf(d))}
                        </p>
                    </div>
                )}
                <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:justify-end">
                    {pay && !reported && (
                        <a href={pay.href} target="_blank" rel="noopener noreferrer" className="btn btn-primary min-h-[40px] flex-1 sm:flex-none" title={pay.buttonLabel}>
                            <CreditCardIcon className="h-4 w-4" /> Pay {formatMoney(pay.amount, currencyOf(d))}
                        </a>
                    )}
                    {state === 'open' && (
                        <button type="button" className="btn btn-primary min-h-[40px] flex-1 sm:flex-none" onClick={onSign}>
                            <PenIcon className="h-4 w-4" /> Review &amp; sign
                        </button>
                    )}
                    <button type="button" className="btn btn-outline min-h-[40px] flex-1 sm:flex-none" onClick={onView}>
                        <EyeIcon className="h-4 w-4" /> View
                    </button>
                    <DownloadPdfButton doc={doc} contractor={contractor} clientName={clientName} label="Download" className="flex-1 sm:flex-none" onError={onDownloadError} />
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
    /** only for clients with jobs: the project view (default) or the full document list */
    const [section, setSection] = useState<'project' | 'documents'>('project');
    const dash = usePortalDashboard(key);
    const [openDoc, setOpenDoc] = useState<{ id: string; signing: boolean; session: number } | null>(null);
    const [outcomes, setOutcomes] = useState<Record<string, SigningOutcome>>({});
    const [problems, setProblems] = useState<Record<string, LinkProblem>>({});
    const [modalBusy, setModalBusy] = useState(false);
    /** good/better/best: the option picked per estimate */
    const [picks, setPicks] = useState<Record<string, string>>({});
    const optionsRef = useRef<HTMLDivElement>(null);
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
                // drafts are not shown (the database leaves them out too); no status and every other status are
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

    /** after a signature or a payment note: the document list and the project dashboard both refresh quietly */
    const refreshDashboard = dash.refresh;
    const reload = useCallback(() => { void load(true); refreshDashboard(); }, [load, refreshDashboard]);

    // Outstanding = every unpaid invoice (old portal: all invoices not Paid; Cancelled never counts)
    const groups = useMemo(() => groupPortalDocuments(documents), [documents]);

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
    /** picking a document tab always lands on the full list (also from the project view's "Review now") */
    const selectTab = (id: TabId) => {
        setTab(id);
        setTabTouched(true);
        setSection('documents');
    };

    // the first answer of the project dashboard is waited for a moment (capped) so the page doesn't jump
    if (status === 'loading' || (status === 'ready' && !dash.settled)) return <PublicPageSkeleton />;
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

    // ---- project view (clients with jobs) ----
    const showProject = dash.phase === 'ready' && section === 'project';
    const projectDocIds = new Set((dash.view?.documents || []).map((r) => r.id));
    /** documents to sign that the project view doesn't list (other jobs, or no job) */
    const awaitingShown = showProject ? groups.awaiting.filter((d) => !projectDocIds.has(d.id)) : groups.awaiting;
    const renderProjectDocument = (row: DashboardDocumentRow) => {
        const doc = documents.find((d) => d.id === row.id);
        return doc ? (
            <DocumentRow
                doc={doc}
                contractor={contractor}
                clientName={clientName}
                onView={() => openDocument(doc.id, false)}
                onSign={() => openDocument(doc.id, true)}
                onDownloadError={setPageError}
            />
        ) : null;
    };
    /** the punch list section sits at the bottom of the page; leave room for the sticky header */
    const scrollToPunch = () => {
        const el = document.getElementById('portal-punch-heading');
        if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 96), behavior: 'smooth' });
    };
    const onProjectStep = (step: NextStep, action: StepAction) => {
        if (action === 'punch') scrollToPunch();
        else if (step.refId) openDocument(step.refId, action === 'sign');
    };

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

                {dash.phase === 'error' && (
                    <p className="mt-4 text-sm text-muted-foreground" role="status">
                        We couldn&apos;t load your project overview.{' '}
                        <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={dash.retry}>Try again</button>
                    </p>
                )}

                {dash.phase === 'ready' && (
                    <div role="tablist" aria-label="Portal sections" className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
                        {([['project', 'Project', null], ['documents', 'All documents', documents.length]] as const).map(([id, label, count]) => {
                            const active = section === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setSection(id)}
                                    className={cx(
                                        'flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition',
                                        active ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    <span className="truncate">{label}</span>
                                    {count !== null && <span className={cx('rounded-full px-1.5 text-[11px] tabular-nums', active ? 'bg-primary/10 text-primary' : 'bg-background/60')}>{count}</span>}
                                </button>
                            );
                        })}
                    </div>
                )}

                {!showProject && (
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
                )}

                {awaitingShown.length > 0 && (showProject || tab !== 'approvals') && (
                    <Notice
                        tone="warning"
                        className="mt-4"
                        title={`${awaitingShown.length} ${showProject ? 'more ' : ''}document${awaitingShown.length === 1 ? ' is' : 's are'} waiting for your signature`}
                        action={<button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={() => selectTab('approvals')}>Review now</button>}
                    />
                )}

                {pageError && <Notice tone="danger" className="mt-4" onClose={() => setPageError('')}>{pageError}</Notice>}

                {showProject ? (
                    <div className="mt-6">
                        {dash.jobPhase === 'ready' && dash.view ? (
                            <PortalProjectDashboard
                                view={dash.view}
                                onSelectJob={dash.selectJob}
                                renderDocument={renderProjectDocument}
                                onStepAction={onProjectStep}
                                onOpenPunch={scrollToPunch}
                            />
                        ) : (
                            <div className="space-y-4">
                                {dash.jobs.length > 1 && <JobSwitcher jobs={dash.jobs} activeId={dash.jobId} onSelect={dash.selectJob} />}
                                {dash.jobPhase === 'error' ? (
                                    <p className="text-sm text-muted-foreground" role="status">
                                        We couldn&apos;t load this project.{' '}
                                        <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={dash.retryJob}>Try again</button>
                                    </p>
                                ) : <ProjectSkeleton />}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
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
                                        title={TABS.find((t) => t.id === tab)?.empty || 'Nothing here yet'}
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

                    {/* job photos the contractor chose to share (components/photos; nothing when there are none) */}
                    <PortalPhotos portalKey={key} className="mt-8" />
                    </>
                )}

                {/* field features (nothing when none is shared or the database doesn't have them yet) */}
                <PortalServicePlans portalKey={key} className="mt-8" />
                <PortalPunchList portalKey={key} className="mt-8" />
                <PortalCredentials portalKey={key} className="mt-8" />

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
                        <div ref={optionsRef} className="scroll-mt-4">
                            <DocumentDetail
                                doc={current}
                                contractor={contractor}
                                clientName={clientName}
                                onReportPayment={makeReportPayment({ portalKey: key, documentId: current.id })}
                                onPaymentReported={reload}
                                chosenOptionId={picks[current.id] ?? null}
                                onChooseOption={currentSignable ? (id) => setPicks((prev) => ({ ...prev, [current.id]: id })) : undefined}
                            />
                        </div>
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
                                    chosenOptionId={picks[current.id] ?? null}
                                    onShowOptions={openOptionSet(current) ? () => optionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : undefined}
                                    onSign={async (name, signature) => {
                                        const set = openOptionSet(current);
                                        const pick = picks[current.id];
                                        if (set && pick) await signWithOption({ portalKey: key, documentId: current.id }, set, pick, name, signature);
                                        else await callSigningRpc('sign_document_via_portal', { p_key: key, p_doc_id: current.id, p_signature: signature }, name);
                                    }}
                                    onDecline={(reason, name) => callDeclineRpcWithName(
                                        'decline_document_via_portal',
                                        { p_key: key, p_doc_id: current.id, p_reason: reason || null },
                                        name,
                                    )}
                                    onComplete={(o) => {
                                        setOutcomes((prev) => ({ ...prev, [current.id]: o }));
                                        reload();
                                    }}
                                    onProblem={(p) => {
                                        setProblems((prev) => ({ ...prev, [current.id]: p }));
                                        reload();
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
