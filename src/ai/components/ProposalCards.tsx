import React, { useMemo, useState } from 'react';
import {
    AlertTriangleIcon, BoxIcon, BriefcaseIcon, CalendarIcon, ChangeOrderIcon, CheckCircleIcon, CopyIcon, DailyReportIcon,
    EstimateIcon, ExpenseLogIcon, ExternalLinkIcon, InvoiceIcon, MailIcon, MaterialLogIcon, NoteIcon, PaperclipIcon,
    ReceiptIcon, RefreshCwIcon, SparklesIcon, StarIcon, TagIcon, TimeSheetIcon, TrashIcon, TruckIcon, UndoIcon, UserIcon,
    WarrantyIcon, WorkOrderIcon, XCircleIcon,
} from '../../../components/Icons.tsx';
import { formatMoney } from '../../../utils/money.ts';
import { getFormLabel } from '../../../utils/aiMentionUtils.ts';
import {
    DOC_LABELS, getSchema, getSetupFields, resolveDocKey, toPlainText, type DocKey, type SetupFieldSpec,
} from '../../config/documentFieldRequirements.ts';
import type { ChatMessage } from '../../hooks/useMasterAIRouter.ts';
import type { AIAssistant } from '../../hooks/useAIAssistant.ts';
import { buildEmailDrafts, type AIEmailDraft } from '../emailBatch.ts';
import type { PlanStep, PlanStepAction, RouterProposal } from '../../../supabase/functions/ai-assistant/shared/routerContract.ts';
import { applyPlanEdits, stepsNeedingJob, summarizePlanRun, type PlanStepResult } from '../planRunner.ts';

type IconType = React.ComponentType<{ className?: string }>;

const DOC_ICONS: Record<DocKey, IconType> = {
    INVOICE: InvoiceIcon, ESTIMATE: EstimateIcon, WORK_ORDER: WorkOrderIcon, DAILY_REPORT: DailyReportIcon,
    TIME_SHEET: TimeSheetIcon, MATERIAL_LOG: MaterialLogIcon, EXPENSE_LOG: ExpenseLogIcon, WARRANTY: WarrantyIcon,
    NOTE: NoteIcon, RECEIPT: ReceiptIcon, CHANGE_ORDER: ChangeOrderIcon, PURCHASE_ORDER: TruckIcon,
};

const ROUTE_LABELS: Record<string, string> = {
    '/dashboard': 'Dashboard', '/clients': 'Clients', '/inventory': 'Inventory', '/pricebook': 'Price book',
    '/analytics': 'Analytics', '/calendar': 'Calendar', '/communication': 'Communication', '/calculator': 'Profit calculator',
    '/forum': 'Community', '/settings': 'Settings', '/profile': 'Profile',
};

// ───────────────────────────── shell ─────────────────────────────

const CardShell: React.FC<{
    icon: IconType;
    title: string;
    subtitle?: string;
    tone?: 'primary' | 'warning';
    children?: React.ReactNode;
    footer?: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, tone = 'primary', children, footer }) => (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-card animate-fade-in-up">
        <div className="flex items-start gap-3 px-4 pt-4">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone === 'warning' ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary'}`}>
                <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-5 text-foreground">{title}</p>
                {subtitle && <p className="text-xs leading-5 text-muted-foreground">{subtitle}</p>}
            </div>
        </div>
        {children && <div className="space-y-3 px-4 pt-3">{children}</div>}
        {footer && <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3">{footer}</div>}
    </div>
);

const DoneRow: React.FC<{ message: ChatMessage }> = ({ message }) => (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${message.status === 'dismissed'
        ? 'border-border bg-muted/40 text-muted-foreground'
        : 'border-success/30 bg-success/10 text-success'}`}>
        {message.status === 'dismissed' ? <XCircleIcon className="h-4 w-4" /> : <CheckCircleIcon className="h-4 w-4" />}
        <span className="truncate">{message.result || (message.status === 'dismissed' ? 'Cancelled' : 'Done')}</span>
    </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="grid grid-cols-[minmax(84px,34%)_1fr] gap-3 py-1.5 text-[13px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="min-w-0 break-words font-medium text-foreground">{children}</span>
    </div>
);

const btn = 'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50';
const btnPrimary = `${btn} bg-primary text-primary-foreground shadow-sm hover:brightness-110`;
const btnOutline = `${btn} border border-input bg-card text-foreground hover:bg-muted`;
const btnGhost = `${btn} px-3 text-muted-foreground hover:bg-muted hover:text-foreground`;

const Spinner = () => <RefreshCwIcon className="h-4 w-4 animate-spin" />;

// ───────────────────────────── document draft ─────────────────────────────

function formatValue(docType: DocKey, key: string, value: unknown): React.ReactNode {
    const spec = getSchema(docType)[key];
    if (!spec || value == null) return null;
    switch (spec.kind) {
        case 'money': return formatMoney(value);
        case 'percent': return `${value}%`;
        case 'colors': {
            const c = value as { primary: string; secondary: string };
            return (
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-4 w-4 rounded-full border border-border" style={{ background: c.primary }} />
                    <span className="h-4 w-4 rounded-full border border-border" style={{ background: c.secondary }} />
                </span>
            );
        }
        case 'tags': return (value as string[]).join(', ');
        case 'richtext':
        case 'longtext': {
            const text = toPlainText(value);
            return <span className="line-clamp-4 whitespace-pre-line font-normal">{text}</span>;
        }
        default: return String(value);
    }
}

const ItemsPreview: React.FC<{ items: Array<Record<string, unknown>>; material?: boolean }> = ({ items, material }) => {
    const total = items.reduce((sum, i) => sum + Number(i.quantity || 0) * Number((material ? i.unitCost : i.rate) || 0), 0);
    return (
        <div className="overflow-hidden rounded-xl border border-border">
            <ul className="divide-y divide-border text-[13px]">
                {items.slice(0, 6).map((item, idx) => {
                    const price = Number((material ? item.unitCost : item.rate) || 0);
                    return (
                        <li key={String(item.id || idx)} className="flex items-start justify-between gap-3 px-3 py-2">
                            <span className="min-w-0 flex-1 break-words text-foreground">{String(material ? item.name : item.description)}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                                {String(item.quantity)} × {formatMoney(price)}
                            </span>
                        </li>
                    );
                })}
                {items.length > 6 && <li className="px-3 py-2 text-xs text-muted-foreground">+ {items.length - 6} more</li>}
            </ul>
            {total > 0 && (
                <div className="flex justify-between bg-muted/40 px-3 py-2 text-[13px] font-semibold">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatMoney(total)}</span>
                </div>
            )}
        </div>
    );
};

const DraftCard: React.FC<{ message: ChatMessage; assistant: AIAssistant }> = ({ message, assistant }) => {
    const p = message.proposal as RouterProposal;
    const docType = resolveDocKey(p.document_type) as DocKey;
    const { jobs, suggested } = useMemo(() => assistant.jobChoices(p), [assistant, p]);
    const [jobId, setJobId] = useState<string>(suggested || '');
    const working = message.status === 'working';
    const prefill = p.prefill || {};
    const schema = getSchema(docType);
    const itemsKey = schema.items ? 'items' : schema.lineItems ? 'lineItems' : null;
    const items = itemsKey && Array.isArray(prefill[itemsKey]) ? prefill[itemsKey] as Array<Record<string, unknown>> : [];
    const rows = Object.keys(schema)
        .filter(k => k !== itemsKey && !schema[k].source && prefill[k] != null && k !== 'templateId')
        .slice(0, 9);
    const missing = (p.missing_fields || []).filter(k => schema[k]);
    const fixedJob = assistant.mode === 'job' && assistant.job;

    if (message.status === 'done' || message.status === 'dismissed') return <DoneRow message={message} />;
    return (
        <CardShell
            icon={DOC_ICONS[docType]}
            title={`${DOC_LABELS[docType]} draft`}
            subtitle="Check the details. Nothing is saved until you choose."
            footer={(
                <>
                    <button type="button" className={btnGhost} disabled={working} onClick={() => assistant.dismiss(message.id)}>Discard</button>
                    <button type="button" className={btnOutline} disabled={working || !jobId} onClick={() => assistant.openDraft(message.id, jobId, false)}>
                        <ExternalLinkIcon className="h-4 w-4" /> Open &amp; edit
                    </button>
                    <button type="button" className={btnPrimary} disabled={working || !jobId} onClick={() => assistant.openDraft(message.id, jobId, true)}>
                        {working ? <Spinner /> : <CheckCircleIcon className="h-4 w-4" />} Save
                    </button>
                </>
            )}
        >
            {rows.length > 0 && (
                <div className="divide-y divide-border/60">
                    {rows.map(k => <Row key={k} label={schema[k].label}>{formatValue(docType, k, prefill[k])}</Row>)}
                </div>
            )}
            {items.length > 0 && <ItemsPreview items={items} material={itemsKey === 'items'} />}
            {rows.length === 0 && items.length === 0 && (
                <p className="text-[13px] text-muted-foreground">The form will open with your job and company details filled in.</p>
            )}
            {missing.length > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-foreground">
                    <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <span>Left empty: {missing.map(k => schema[k].label.toLowerCase()).join(', ')}.</span>
                </p>
            )}
            {fixedJob ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><BriefcaseIcon className="h-4 w-4" /> {fixedJob.name}</p>
            ) : (
                <label className="block">
                    <span className="label">Job</span>
                    <select className="input min-h-[44px]" value={jobId} onChange={e => setJobId(e.target.value)}>
                        <option value="">Choose the job for this document…</option>
                        {jobs.map(j => <option key={j.id} value={j.id}>{j.name}{j.clientName ? ` — ${j.clientName}` : ''}{j.status !== 'active' ? ` (${j.status})` : ''}</option>)}
                    </select>
                    {jobs.length === 0 && <span className="mt-1 block text-xs text-muted-foreground">Create a job first, then ask me again.</span>}
                </label>
            )}
        </CardShell>
    );
};

// ───────────────────────────── setup (missing info) ─────────────────────────────

const SetupField: React.FC<{ field: SetupFieldSpec; value: string; onChange: (v: string) => void; onEnter: () => void }> = ({ field, value, onChange, onEnter }) => {
    const common = { id: `setup-${field.key}`, value, placeholder: field.placeholder, className: 'input' };
    if (field.kind === 'longtext' || field.kind === 'items') {
        return <textarea {...common} rows={field.kind === 'items' ? 2 : 3} onChange={e => onChange(e.target.value)} />;
    }
    if (field.kind === 'enum') {
        return (
            <select {...common} className="input min-h-[44px]" onChange={e => onChange(e.target.value)}>
                <option value="">Select…</option>
                {(field.values || []).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
        );
    }
    return (
        <input
            {...common}
            type={field.kind === 'date' ? 'date' : 'text'}
            inputMode={field.kind === 'number' ? 'decimal' : undefined}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
        />
    );
};

const SetupCard: React.FC<{ message: ChatMessage; assistant: AIAssistant }> = ({ message, assistant }) => {
    const p = message.proposal as RouterProposal;
    const docType = resolveDocKey(p.document_type) as DocKey;
    const fields = getSetupFields(docType, p.missing_fields || []);
    const [values, setValues] = useState<Record<string, string>>({});
    const hasAny = Object.values(values).some(v => v.trim());
    if (message.status === 'done' || message.status === 'dismissed') return <DoneRow message={message} />;
    const submit = () => (hasAny ? assistant.submitSetup(message.id, values) : assistant.skipSetup(message.id));
    return (
        <CardShell
            icon={DOC_ICONS[docType]}
            tone="warning"
            title={`A few details for your ${DOC_LABELS[docType].toLowerCase()}`}
            subtitle="Fill in what you know. Anything you skip stays empty — nothing is made up."
            footer={(
                <>
                    <button type="button" className={btnGhost} onClick={() => assistant.skipSetup(message.id)}>Skip</button>
                    <button type="button" className={btnPrimary} onClick={submit}>{hasAny ? 'Continue' : 'Draft without them'}</button>
                </>
            )}
        >
            {fields.map(field => (
                <div key={field.key}>
                    <label htmlFor={`setup-${field.key}`} className="label">{field.label}</label>
                    <SetupField field={field} value={values[field.key] || ''} onChange={v => setValues(prev => ({ ...prev, [field.key]: v }))} onEnter={submit} />
                </div>
            ))}
        </CardShell>
    );
};

// ───────────────────────────── emails ─────────────────────────────

const EmailBatchCard: React.FC<{ message: ChatMessage; assistant: AIAssistant }> = ({ message, assistant }) => {
    const p = message.proposal as RouterProposal;
    const { clients, forms, jobs, profile } = assistant.data;
    const [drafts, setDrafts] = useState<AIEmailDraft[]>(() => buildEmailDrafts(p, { clients, forms, jobs, profile }));
    const [expanded, setExpanded] = useState<string | null>(null);
    const working = message.status === 'working';
    const selectedCount = drafts.filter(d => d.selected && d.recipient_email).length;
    const update = (key: string, patch: Partial<AIEmailDraft>) => setDrafts(prev => prev.map(d => (d.key === key ? { ...d, ...patch } : d)));
    const labelOf = (id: string) => {
        const f = forms.find(x => x.id === id);
        return f ? getFormLabel(f) : 'Document';
    };
    if (message.status === 'done' || message.status === 'dismissed') return <DoneRow message={message} />;
    return (
        <CardShell
            icon={MailIcon}
            title={`Review ${drafts.length === 1 ? 'email' : `${drafts.length} emails`} before sending`}
            subtitle="Recipients come from your saved clients. Nothing is sent until you press Send."
            footer={(
                <>
                    <button type="button" className={btnGhost} disabled={working} onClick={() => assistant.dismiss(message.id)}>Cancel</button>
                    <button type="button" className={btnPrimary} disabled={working || selectedCount === 0} onClick={() => assistant.sendEmails(message.id, drafts)}>
                        {working ? <Spinner /> : <MailIcon className="h-4 w-4" />}
                        {working ? 'Sending…' : `Send ${selectedCount || ''} ${selectedCount === 1 ? 'email' : 'emails'}`.replace('  ', ' ')}
                    </button>
                </>
            )}
        >
            {drafts.map(d => (
                <div key={d.key} className={`rounded-xl border p-3 ${d.selected ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                    <label className="flex min-h-[40px] cursor-pointer items-start gap-3">
                        <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                            checked={d.selected}
                            disabled={!d.recipient_email || working}
                            onChange={e => update(d.key, { selected: e.target.checked })}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground">{d.client_name}</span>
                            <span className={`block truncate text-xs ${d.recipient_email ? 'text-muted-foreground' : 'text-destructive'}`}>
                                {d.recipient_email || d.problem}
                            </span>
                        </span>
                    </label>
                    <div className="mt-2 space-y-2 pl-8">
                        <input className="input" aria-label="Subject" value={d.subject} disabled={working} onChange={e => update(d.key, { subject: e.target.value })} />
                        {expanded === d.key ? (
                            <textarea className="input" rows={6} aria-label="Message" value={d.body_text} disabled={working} onChange={e => update(d.key, { body_text: e.target.value })} />
                        ) : (
                            <button type="button" onClick={() => setExpanded(d.key)} className="block w-full rounded-xl bg-muted/50 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted">
                                <span className="line-clamp-2 whitespace-pre-line">{d.body_text}</span>
                                <span className="mt-1 block font-semibold text-primary">Edit message</span>
                            </button>
                        )}
                        {d.attachment_document_ids.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {d.attachment_document_ids.map(id => (
                                    <span key={id} className="badge badge-muted gap-1.5 py-1">
                                        <PaperclipIcon className="h-3.5 w-3.5" /> {labelOf(id)}
                                        <button type="button" aria-label="Remove attachment" disabled={working}
                                            onClick={() => update(d.key, { attachment_document_ids: d.attachment_document_ids.filter(x => x !== id) })}>
                                            <XCircleIcon className="h-3.5 w-3.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">No attachment. Mention a document with # to attach it.</p>
                        )}
                    </div>
                </div>
            ))}
            {drafts.length === 0 && <p className="text-[13px] text-muted-foreground">I could not match a saved client. Mention the client with @ and try again.</p>}
        </CardShell>
    );
};

const DraftEmailCard: React.FC<{ message: ChatMessage; assistant: AIAssistant }> = ({ message, assistant }) => {
    const p = message.proposal as RouterProposal;
    const [copied, setCopied] = useState(false);
    if (message.status === 'done' || message.status === 'dismissed') return <DoneRow message={message} />;
    const text = `${p.email_subject ? `Subject: ${p.email_subject}\n\n` : ''}${p.email_body || ''}`;
    return (
        <CardShell
            icon={MailIcon}
            title={p.email_subject || 'Email draft'}
            subtitle="A draft to copy or finish in Communication."
            footer={(
                <>
                    <button type="button" className={btnOutline} onClick={() => {
                        navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => setCopied(false));
                    }}>
                        <CopyIcon className="h-4 w-4" /> {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" className={btnPrimary} onClick={() => assistant.confirmAction(message.id)}>
                        <ExternalLinkIcon className="h-4 w-4" /> Open in Communication
                    </button>
                </>
            )}
        >
            <p className="whitespace-pre-line rounded-xl bg-muted/50 px-3 py-2 text-[13px] text-foreground">{p.email_body}</p>
        </CardShell>
    );
};

// ───────────────────────────── confirm (jobs, clients, inventory, …) ─────────────────────────────

const JobPicker: React.FC<{ value: string; onChange: (v: string) => void; jobs: AIAssistant['data']['jobs'] }> = ({ value, onChange, jobs }) => (
    <label className="block">
        <span className="label">Job</span>
        <select className="input min-h-[44px]" value={value} onChange={e => onChange(e.target.value)}>
            <option value="">Choose a job…</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.name}{j.clientName ? ` — ${j.clientName}` : ''}</option>)}
        </select>
    </label>
);

const ConfirmCard: React.FC<{ message: ChatMessage; assistant: AIAssistant }> = ({ message, assistant }) => {
    const p = message.proposal as RouterProposal;
    const e = (p.entity || {}) as Record<string, unknown>;
    const { jobs, inventory } = assistant.data;
    const [jobId, setJobId] = useState<string>(p.job_id || (assistant.mode === 'job' && assistant.job ? assistant.job.id : ''));
    const working = message.status === 'working';
    if (message.status === 'done' || message.status === 'dismissed') return <DoneRow message={message} />;

    let icon: IconType = CheckCircleIcon;
    let title = '';
    let action = 'Confirm';
    let body: React.ReactNode = null;
    let needsJob = false;
    switch (p.action_type) {
        case 'CREATE_JOB':
            icon = BriefcaseIcon; title = 'New job'; action = 'Review & create';
            body = <>{e.name ? <Row label="Name">{String(e.name)}</Row> : null}{e.client_name ? <Row label="Client">{String(e.client_name)}</Row> : null}{e.address ? <Row label="Address">{String(e.address)}</Row> : null}{e.start_date ? <Row label="Start">{String(e.start_date)}</Row> : null}</>;
            break;
        case 'CREATE_CLIENT':
            icon = UserIcon; title = 'New client'; action = 'Review & add';
            body = <>{['name', 'email', 'phone', 'address'].filter(k => e[k]).map(k => <Row key={k} label={k[0].toUpperCase() + k.slice(1)}>{String(e[k])}</Row>)}</>;
            break;
        case 'ADD_INVENTORY':
            icon = BoxIcon; title = 'New inventory item'; action = 'Review & add';
            body = <><Row label="Item">{String(e.name)}</Row>{e.quantity != null ? <Row label="Quantity">{String(e.quantity)}</Row> : null}{e.cost != null ? <Row label="Unit cost">{formatMoney(e.cost)}</Row> : null}</>;
            break;
        case 'ADD_PRICE_BOOK_ITEM':
            icon = TagIcon; title = 'New price book item'; action = 'Review & add';
            body = <><Row label="Item">{String(e.name)}</Row>{e.price != null ? <Row label="Price">{formatMoney(e.price)}</Row> : null}{e.cost != null ? <Row label="Cost">{formatMoney(e.cost)}</Row> : null}</>;
            break;
        case 'RESTOCK_INVENTORY': {
            const item = inventory.find(i => i.id === p.inventory_item_id);
            const current = Number(item?.quantity ?? 0);
            icon = BoxIcon; title = 'Change stock'; action = 'Update stock';
            body = <><Row label="Item">{item?.name || 'Item'}</Row><Row label="Change">{Number(p.quantity_delta) > 0 ? '+' : ''}{String(p.quantity_delta)}</Row>{item?.quantity != null ? <Row label="New stock">{current} → {current + Number(p.quantity_delta)}</Row> : null}</>;
            break;
        }
        case 'UPDATE_JOB_STATUS': {
            icon = CalendarIcon; title = `Mark job as ${p.job_status}`; action = 'Update job'; needsJob = true;
            break;
        }
        case 'DUPLICATE_JOB':
            icon = BriefcaseIcon; title = 'Duplicate a job'; action = 'Duplicate'; needsJob = true;
            break;
        case 'NAVIGATE_TO':
            icon = ExternalLinkIcon; title = `Open ${ROUTE_LABELS[p.route || ''] || 'page'}`; action = 'Open';
            break;
        default:
            return null;
    }
    const fixedJob = assistant.mode === 'job' && assistant.job;
    return (
        <CardShell
            icon={icon}
            title={title}
            footer={(
                <>
                    <button type="button" className={btnGhost} disabled={working} onClick={() => assistant.dismiss(message.id)}>Cancel</button>
                    <button type="button" className={btnPrimary} disabled={working || (needsJob && !jobId)} onClick={() => assistant.confirmAction(message.id, { jobId })}>
                        {working && <Spinner />} {action}
                    </button>
                </>
            )}
        >
            {body && <div className="divide-y divide-border/60">{body}</div>}
            {needsJob && (fixedJob ? <Row label="Job">{fixedJob.name}</Row> : <JobPicker value={jobId} onChange={setJobId} jobs={jobs} />)}
        </CardShell>
    );
};

// ───────────────────────────── multi-step plan ─────────────────────────────

const STEP_ICONS: Record<PlanStepAction, IconType> = {
    CREATE_CLIENT: UserIcon, CREATE_JOB: BriefcaseIcon, GENERATE_DOCUMENT: InvoiceIcon, ADD_INVENTORY: BoxIcon,
    ADD_PRICE_BOOK_ITEM: TagIcon, RESTOCK_INVENTORY: BoxIcon, UPDATE_JOB_STATUS: CalendarIcon,
};

const STEP_TITLES: Record<PlanStepAction, string> = {
    CREATE_CLIENT: 'New client', CREATE_JOB: 'New job', GENERATE_DOCUMENT: 'Document', ADD_INVENTORY: 'New inventory item',
    ADD_PRICE_BOOK_ITEM: 'New price book item', RESTOCK_INVENTORY: 'Change stock', UPDATE_JOB_STATUS: 'Job status',
};

/** Short content summary of a document step ("2 items · $795.00", first words of a report). */
function documentSummary(step: PlanStep): string {
    const pre = step.prefill || {};
    const items = (Array.isArray(pre.lineItems) ? pre.lineItems : Array.isArray(pre.items) ? pre.items : []) as Array<Record<string, unknown>>;
    if (items.length) {
        const total = items.reduce((sum, i) => sum + Number(i.quantity || 0) * Number((i.rate ?? i.unitCost) || 0), 0);
        return `${items.length} item${items.length === 1 ? '' : 's'}${total > 0 ? ` · ${formatMoney(total)}` : ''}`;
    }
    if (pre.amount != null) return formatMoney(pre.amount);
    const text = toPlainText(pre.content ?? pre.description ?? pre.notes ?? pre.coverage ?? pre.title ?? '');
    return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

const StepStatus: React.FC<{ result?: PlanStepResult; index: number; icon: IconType }> = ({ result, index, icon: Icon }) => {
    const base = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold';
    switch (result?.status) {
        case 'running': return <span className={`${base} bg-primary/10 text-primary`} aria-label="Running"><RefreshCwIcon className="h-4 w-4 animate-spin" /></span>;
        case 'done': return <span className={`${base} bg-success/15 text-success`} aria-label="Done"><CheckCircleIcon className="h-4 w-4" /></span>;
        case 'error': return <span className={`${base} bg-destructive/10 text-destructive`} aria-label="Failed"><AlertTriangleIcon className="h-4 w-4" /></span>;
        case 'skipped': return <span className={`${base} bg-muted text-muted-foreground`} aria-label="Skipped"><XCircleIcon className="h-4 w-4" /></span>;
        case 'pending': return <span className={`${base} bg-muted text-muted-foreground`}>{index}</span>;
        default: return <span className={`${base} bg-primary/10 text-primary`}><Icon className="h-[15px] w-[15px]" /></span>;
    }
};

const PlanCard: React.FC<{ message: ChatMessage; assistant: AIAssistant }> = ({ message, assistant }) => {
    const p = message.proposal as RouterProposal;
    const run = message.planRun;
    const [removed, setRemoved] = useState<string[]>([]);
    const [names, setNames] = useState<Record<string, string>>({});
    const [jobPicks, setJobPicks] = useState<Record<string, string>>({});
    const edited = useMemo(() => applyPlanEdits(p.plan || [], { removed, names, jobs: jobPicks }), [p.plan, removed, names, jobPicks]);
    // Once started, the card shows (and a retry re-runs) exactly the steps that ran.
    const steps = run?.steps?.length ? run.steps : edited;
    const working = message.status === 'working';
    const locked = Boolean(run) || working;
    const needJob = locked ? [] : stepsNeedingJob(steps);
    const active = steps.filter(s => !s.skip);
    const summary = run ? summarizePlanRun(run, steps) : null;
    const limit = run ? Object.values(run.results).find(r => r.code === 'PLAN_LIMIT') : undefined;
    const { jobs, clients } = assistant.data;
    if (message.status === 'dismissed') return <DoneRow message={message} />;

    const nameOf = (ref?: string | null) => String(steps.find(s => s.ref === ref)?.entity?.name || '');
    const jobName = (s: PlanStep) => (s.job_ref ? nameOf(s.job_ref) : s.job_id ? jobs.find(j => j.id === s.job_id)?.name || '' : '');
    const clientName = (s: PlanStep) => (s.client_ref ? nameOf(s.client_ref) : s.client_id ? clients.find(c => c.id === s.client_id)?.name || '' : '');
    const planJobs = steps.filter(s => s.action_type === 'CREATE_JOB' && !s.skip);
    const toggle = (id: string) => setRemoved(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    const doneCount = summary?.done ?? 0;
    const runningCount = run ? active.filter(s => ['done', 'error', 'skipped'].includes(run.results[s.id]?.status || '')).length : 0;

    const footer = working ? (
        <span className="inline-flex min-h-[40px] items-center gap-2 text-sm font-medium text-muted-foreground">
            <Spinner /> Working… {runningCount} of {active.length}
        </span>
    ) : run ? (
        summary && summary.failed > 0 ? (
            <button type="button" className={btnPrimary} onClick={() => assistant.runPlan(message.id, steps)}>
                <RefreshCwIcon className="h-4 w-4" /> Retry {summary.failed} failed step{summary.failed === 1 ? '' : 's'}
            </button>
        ) : null
    ) : (
        <>
            <button type="button" className={btnGhost} onClick={() => assistant.dismiss(message.id)}>Cancel</button>
            <button type="button" className={btnPrimary} disabled={!active.length || needJob.length > 0} onClick={() => assistant.runPlan(message.id, steps)}>
                <CheckCircleIcon className="h-4 w-4" /> Do it all ({active.length} step{active.length === 1 ? '' : 's'})
            </button>
        </>
    );

    return (
        <CardShell
            icon={SparklesIcon}
            title={run && !working ? (summary?.failed ? `${doneCount} of ${active.length} steps done` : `Done: ${doneCount} step${doneCount === 1 ? '' : 's'}`) : `Plan: ${active.length} step${active.length === 1 ? '' : 's'}`}
            subtitle={run ? (working ? 'Running the steps in order…' : 'Open anything below to check or edit it.') : 'Check every step. Nothing is created until you press “Do it all”. Documents are saved as drafts.'}
            footer={footer}
        >
            {p.sample_data && (
                <p className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs text-foreground">
                    <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Sample data: the documents are filled with example content. Edit them before you send anything.</span>
                </p>
            )}
            <ol className="space-y-2" aria-label="Plan steps">
                {steps.map((s, i) => {
                    const result = run?.results[s.id];
                    const userRemoved = removed.includes(s.id);
                    const icon = s.action_type === 'GENERATE_DOCUMENT' && s.document_type ? DOC_ICONS[s.document_type] : STEP_ICONS[s.action_type];
                    const editableName = !locked && !s.skip && ['CREATE_CLIENT', 'CREATE_JOB', 'ADD_INVENTORY', 'ADD_PRICE_BOOK_ITEM'].includes(s.action_type);
                    const isDoc = s.action_type === 'GENERATE_DOCUMENT';
                    const pickJob = !locked && (isDoc || s.action_type === 'UPDATE_JOB_STATUS') && !userRemoved && Boolean(jobPicks[s.id] || (!s.job_ref && !s.job_id) || s.skip);
                    const title = isDoc && s.document_type ? DOC_LABELS[s.document_type]
                        : s.action_type === 'RESTOCK_INVENTORY' ? `${assistant.data.inventory.find(it => it.id === s.inventory_item_id)?.name || 'Item'} ${Number(s.quantity_delta) > 0 ? '+' : ''}${s.quantity_delta}`
                            : s.action_type === 'UPDATE_JOB_STATUS' ? `Mark as ${s.job_status}`
                                : String(s.entity?.name || STEP_TITLES[s.action_type]);
                    const details = isDoc
                        ? [clientName(s) ? `For ${clientName(s)}` : '', jobName(s) ? `Job: ${jobName(s)}` : '', documentSummary(s)]
                        : s.action_type === 'CREATE_JOB' ? [s.entity?.client_name ? `Client: ${String(s.entity.client_name)}` : '', s.entity?.address ? String(s.entity.address) : '']
                            : s.action_type === 'CREATE_CLIENT' ? [String(s.entity?.email || ''), String(s.entity?.phone || '')]
                                : s.action_type === 'UPDATE_JOB_STATUS' ? [jobName(s)] : [];
                    return (
                        <li key={s.id} className={`rounded-xl border px-3 py-2.5 ${result?.status === 'error' ? 'border-destructive/40 bg-destructive/5' : 'border-border'} ${s.skip && !result ? 'opacity-60' : ''}`}>
                            <div className="flex items-start gap-2.5">
                                <StepStatus result={result} index={i + 1} icon={icon} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{STEP_TITLES[s.action_type]}</p>
                                    {editableName ? (
                                        <input
                                            className="input mt-0.5 h-9 py-1 text-[13px] font-semibold"
                                            aria-label={`${STEP_TITLES[s.action_type]} name`}
                                            value={names[s.id] ?? String(s.entity?.name || '')}
                                            onChange={e => setNames(prev => ({ ...prev, [s.id]: e.target.value }))}
                                            maxLength={120}
                                        />
                                    ) : (
                                        <p className={`break-words text-[13px] font-semibold text-foreground ${s.skip ? 'line-through' : ''}`}>{title}</p>
                                    )}
                                    {details.filter(Boolean).length > 0 && (
                                        <p className="mt-0.5 break-words text-xs text-muted-foreground">{details.filter(Boolean).join(' · ')}</p>
                                    )}
                                    {isDoc && !locked && !s.skip && (s.missing_fields || []).length > 0 && s.document_type && (
                                        <p className="mt-0.5 text-xs text-warning">Left empty: {(s.missing_fields || []).map(k => getSchema(s.document_type as DocKey)[k]?.label.toLowerCase() || k).join(', ')}</p>
                                    )}
                                    {s.skip && !result && !userRemoved && <p className="mt-0.5 text-xs text-muted-foreground">Skipped: its job was removed. Choose another job to keep it.</p>}
                                    {pickJob && (
                                        <select
                                            className="input mt-1.5 min-h-[40px] text-[13px]"
                                            aria-label="Job for this step"
                                            value={jobPicks[s.id] || ''}
                                            onChange={e => setJobPicks(prev => ({ ...prev, [s.id]: e.target.value }))}
                                        >
                                            <option value="">Choose the job…</option>
                                            {planJobs.map(j => <option key={j.ref} value={`ref:${j.ref}`}>New: {String(j.entity?.name || 'job')}</option>)}
                                            {jobs.map(j => <option key={j.id} value={`id:${j.id}`}>{j.name}{j.clientName ? ` — ${j.clientName}` : ''}</option>)}
                                        </select>
                                    )}
                                    {result?.message && result.status !== 'pending' && result.status !== 'running' && (
                                        <p className={`mt-1 break-words text-xs ${result.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{result.message}</p>
                                    )}
                                </div>
                                {!locked && (
                                    <button
                                        type="button"
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                        aria-label={userRemoved ? 'Keep this step' : 'Remove this step'}
                                        title={userRemoved ? 'Keep this step' : 'Remove this step'}
                                        onClick={() => toggle(s.id)}
                                    >
                                        {userRemoved ? <UndoIcon className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
                                    </button>
                                )}
                                {result?.status === 'done' && result.link && (
                                    <button type="button" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10" onClick={() => assistant.openLink(result.link as string)}>
                                        Open <ExternalLinkIcon className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>
            {(p.plan_notes || []).length > 0 && !run && (
                <ul className="space-y-1 rounded-xl bg-warning/10 px-3 py-2 text-xs text-foreground">
                    {(p.plan_notes || []).map(n => (
                        <li key={n} className="flex items-start gap-2"><AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /><span>{n}</span></li>
                    ))}
                </ul>
            )}
            {needJob.length > 0 && (
                <p className="text-xs font-medium text-warning">Choose a job for {needJob.length === 1 ? 'the step' : `${needJob.length} steps`} marked above.</p>
            )}
            {limit && !working && (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
                    <p className="text-xs text-foreground">{limit.message || 'You have reached a limit of your plan.'}</p>
                    <button type="button" onClick={() => assistant.upgradeFor(limit.message || '')} className="mt-2 inline-flex min-h-[36px] items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">
                        <StarIcon className="h-4 w-4" /> See plans
                    </button>
                </div>
            )}
        </CardShell>
    );
};

export const ProposalCard: React.FC<{ message: ChatMessage; assistant: AIAssistant }> = ({ message, assistant }) => {
    const p = message.proposal;
    if (!p || !message.status) return null;
    switch (p.action_type) {
        case 'RUN_PLAN': return (p.plan || []).length ? <PlanCard message={message} assistant={assistant} /> : null;
        case 'GENERATE_DOCUMENT': return resolveDocKey(p.document_type) ? <DraftCard message={message} assistant={assistant} /> : null;
        case 'GATHER_INFO': return resolveDocKey(p.document_type) ? <SetupCard message={message} assistant={assistant} /> : null;
        case 'PREPARE_EMAIL_BATCH': return <EmailBatchCard message={message} assistant={assistant} />;
        case 'DRAFT_EMAIL_ONLY': return <DraftEmailCard message={message} assistant={assistant} />;
        case 'CHAT': return null;
        default: return <ConfirmCard message={message} assistant={assistant} />;
    }
};
