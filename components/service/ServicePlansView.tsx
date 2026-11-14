/**
 * Service plans (/service-plans, Premium): maintenance visits that schedule themselves.
 *  - top: the visit agenda (next 8 weeks): Done / Skip, open the work order or the job
 *  - below: the plans, one compact row each (client, rhythm, price, next visit), ⋯ to edit / pause / end
 *  - each visit brings a Work Order (Scheduled), with per-visit billing a Draft invoice, the plan's job moves to the
 *    visit date (calendar + the client's visit reminder); period billing uses one recurring invoice
 * Everything here needs a connection; generation also runs every hour on the server.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Client, FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import { isPaidTier, normalizeTier } from '../../lib/plans.ts';
import {
    BILLING_OPTIONS, FREQUENCY_PRESETS, annualValue, frequencyLabel, planProblems, priceLabel, upcomingVisitDates, visitInvoicePreview,
    type IntervalUnit, type PlanBilling, type ServicePlan, type ServiceVisit, type VisitStatus,
} from '../../lib/servicePlans.ts';
import { deletePlan, listPlans, listVisits, savePlan, setPlanStatus, setVisitStatus } from './servicePlansApi.ts';
import { ActionMenu, ConfirmDialog, EmptyState, Field, InlineError, Modal, PageHeader } from '../viewKit.tsx';
import { NumberInput } from '../forms/Fields.tsx';
import { toast } from '../Toast.tsx';
import { describeError } from '../../lib/account.ts';
import { formatMoney } from '../../utils/money.ts';
import { formatYMD, todayYMD } from '../../utils/localDates.ts';
import { CheckIcon, PlusIcon, RefreshCwIcon, StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';

export interface ServicePlansViewProps {
    userId: string;
    profile: UserProfile;
    plan: string;
    clients: Client[];
    jobs: Array<Job & { clientId?: string | null }>;
    isOnline: boolean;
    /** invoice numbers already used (a recurring invoice gets the next free one) */
    existingInvoiceNumbers: string[];
    onBack: () => void;
    onUpgrade: (reason?: string) => void;
    onOpenJob: (jobId: string) => void;
    onOpenDocument: (formId: string, jobId: string, type: string) => void;
    /** a plan created / changed its job or documents: the app reloads them */
    onDataChanged: (created: { invoice?: FormDataType | null; jobId?: string | null }) => void;
}

const newId = (): string => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

const addDays = (ymd: string, n: number) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const blankPlan = (today: string): ServicePlan => ({
    id: newId(), clientId: null, clientName: '', clientAddress: '', jobId: null, name: '', service: '', price: 0, billing: 'per_visit',
    intervalUnit: 'month', intervalCount: 6, anchorDay: null, nextVisit: addDays(today, 14), endsOn: '', assignedTo: '', leadDays: 14,
    remindClient: true, showInPortal: true, status: 'active', invoiceSourceId: null, visitsCreated: 0, notes: '', createdAt: '',
});

/** "Tue · Nov 18" block for the agenda. */
const DayChip: React.FC<{ ymd: string; today: string }> = ({ ymd, today }) => {
    const late = ymd < today;
    const isToday = ymd === today;
    return (
        <span className={`flex w-14 shrink-0 flex-col items-center rounded-lg border py-1 leading-none ${isToday ? 'border-primary bg-primary text-primary-foreground' : late ? 'border-warning/50 bg-warning/10 text-warning' : 'border-border bg-card text-foreground'}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{formatYMD(ymd, { weekday: 'short' })}</span>
            <span className="text-base font-bold tabular-nums">{Number(ymd.slice(8, 10))}</span>
            <span className="text-[10px] uppercase opacity-80">{formatYMD(ymd, { month: 'short' })}</span>
        </span>
    );
};

const ServicePlansView: React.FC<ServicePlansViewProps> = ({ userId, profile, plan, clients, jobs, isOnline, existingInvoiceNumbers, onBack, onUpgrade, onOpenJob, onOpenDocument, onDataChanged }) => {
    const paid = isPaidTier(normalizeTier(plan));
    const today = todayYMD();
    const [plans, setPlans] = useState<ServicePlan[] | null | undefined>(undefined);
    const [visits, setVisits] = useState<ServiceVisit[]>([]);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState<{ plan: ServicePlan; kind: 'create' | 'edit' } | null>(null);
    const [deleting, setDeleting] = useState<ServicePlan | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError('');
        try {
            const list = await listPlans();
            setPlans(list);
            if (list) setVisits(await listVisits(addDays(todayYMD(), -14)));
        } catch (e) {
            setError(describeError(e, 'Your service plans could not be loaded.'));
            setPlans(p => p ?? []);
        }
    }, []);
    useEffect(() => { if (isOnline) void load(); else setPlans(p => p ?? []); }, [load, isOnline]);

    const list = plans || [];
    const byId = useMemo(() => new Map(list.map(p => [p.id, p])), [list]);
    const active = list.filter(p => p.status === 'active');
    const agenda = useMemo(() => visits.filter(v => v.status === 'scheduled' && v.scheduledFor <= addDays(today, 56)), [visits, today]);
    const weekCount = agenda.filter(v => v.scheduledFor >= today && v.scheduledFor <= addDays(today, 7)).length;
    const yearly = active.reduce((n, p) => n + annualValue(p), 0);

    const startNew = () => {
        if (!paid) { onUpgrade('Service plans (maintenance visits that schedule themselves) are part of Premium.'); return; }
        if (!isOnline) { toast.error("You're offline, this needs a connection."); return; }
        setEditing({ plan: blankPlan(today), kind: 'create' });
    };

    const visitAction = async (v: ServiceVisit, status: VisitStatus) => {
        setBusy(v.id);
        try {
            await setVisitStatus(v.id, status);
            setVisits(prev => prev.map(x => (x.id === v.id ? { ...x, status, doneAt: status === 'done' ? new Date().toISOString() : null } : x)));
            toast.success(status === 'done' ? 'Visit done. The work order is marked Completed.' : status === 'skipped' ? 'Visit skipped.' : 'Back on the schedule.');
            onDataChanged({ jobId: v.jobId });
        } catch (e) {
            toast.error(describeError(e, 'Could not update the visit.'));
        } finally {
            setBusy(null);
        }
    };

    const changeStatus = async (p: ServicePlan, status: ServicePlan['status']) => {
        setBusy(p.id);
        try {
            await setPlanStatus(p.id, status);
            setPlans(prev => (prev || []).map(x => (x.id === p.id ? { ...x, status } : x)));
            toast.success(status === 'paused' ? 'Plan paused: no new visits until you resume it.' : status === 'ended' ? 'Plan ended.' : 'Plan resumed.');
            onDataChanged({ jobId: p.jobId });
        } catch (e) {
            toast.error(describeError(e, 'Could not change the plan.'));
        } finally {
            setBusy(null);
        }
    };

    const remove = async (p: ServicePlan) => {
        setBusy(p.id);
        try {
            await deletePlan(p.id);
            setPlans(prev => (prev || []).filter(x => x.id !== p.id));
            setVisits(prev => prev.filter(v => v.planId !== p.id));
            toast.success('Plan deleted. Its job, work orders and invoices stay.');
        } catch (e) {
            toast.error(describeError(e, 'Could not delete.'));
        } finally {
            setBusy(null);
            setDeleting(null);
        }
    };

    const header = (
        <PageHeader
            title="Service plans"
            subtitle="Maintenance visits that schedule themselves, with a work order, an invoice and a reminder for each."
            onBack={onBack}
            actions={<><HelpButton topic="service-plans" /><button type="button" className="btn btn-primary h-10" onClick={startNew}><PlusIcon className="h-4 w-4" /> New plan</button></>}
        />
    );

    if (plans === null) {
        return <div className="page">{header}<EmptyState icon={<RefreshCwIcon />} title="Service plans are on their way" description="They are being switched on for your account. Check back soon." /></div>;
    }

    return (
        <div className="page">
            {header}
            {!isOnline && <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">You're offline. Service plans need a connection.</p>}
            {error && <div className="mb-4"><InlineError onRetry={() => { void load(); }}>{error}</InlineError></div>}
            {!paid && (
                <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm">
                        <span className="font-semibold">Turn one-off jobs into yearly maintenance income.</span>
                        <span className="block text-muted-foreground">With Premium, a plan like “HVAC tune-up twice a year” creates each visit, its work order and its invoice, and reminds your client the day before.</span>
                    </p>
                    <button type="button" className="btn btn-primary shrink-0" onClick={() => onUpgrade('Service plans are part of Premium.')}><StarIcon className="h-4 w-4" /> Upgrade</button>
                </div>
            )}

            {plans === undefined ? (
                <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}</div>
            ) : list.length === 0 ? (
                paid ? (
                    <div className="rounded-2xl border border-dashed border-border p-5">
                        <p className="font-semibold">Your first plan takes a minute</p>
                        <p className="mt-1 text-sm text-muted-foreground">Pick the client, what you do and how often (for example a furnace and AC tune-up twice a year at $129 a visit). The visits, work orders and invoices follow by themselves.</p>
                        <button type="button" className="btn btn-primary mt-4" onClick={startNew}><PlusIcon className="h-4 w-4" /> New plan</button>
                    </div>
                ) : null
            ) : (
                <>
                    <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span><span className="font-semibold tabular-nums">{active.length}</span> active</span>
                        <span><span className="font-semibold tabular-nums">{weekCount}</span> {weekCount === 1 ? 'visit' : 'visits'} in the next 7 days</span>
                        {yearly > 0 && <span className="text-muted-foreground">≈ {formatMoney(yearly)} a year</span>}
                    </p>

                    {/* agenda */}
                    <section aria-labelledby="sp-agenda" className="mb-6">
                        <h2 id="sp-agenda" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next visits</h2>
                        {agenda.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">No visit in the next 8 weeks. Visits appear here {active[0] ? `${active[0].leadDays} days` : 'a couple of weeks'} before their day.</p>
                        ) : (
                            <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
                                {agenda.map(v => {
                                    const p = byId.get(v.planId);
                                    return (
                                        <li key={v.id} className={`flex items-center gap-3 px-3 py-2.5 sm:px-4 ${busy === v.id ? 'opacity-60' : ''}`}>
                                            <DayChip ymd={v.scheduledFor} today={today} />
                                            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => v.jobId && onOpenJob(v.jobId)}>
                                                <span className="block truncate font-semibold">{p?.name || 'Service visit'}</span>
                                                <span className="block truncate text-xs text-muted-foreground">{[p?.clientName, v.assignedTo && `@${v.assignedTo}`, v.scheduledFor < today ? 'not marked done yet' : ''].filter(Boolean).join(' · ')}</span>
                                            </button>
                                            <button type="button" className="btn btn-outline btn-sm h-9 shrink-0" onClick={() => { void visitAction(v, 'done'); }} disabled={busy === v.id || !isOnline} aria-label={`Mark the visit of ${formatYMD(v.scheduledFor)} done`}>
                                                <CheckIcon className="h-4 w-4" /><span className="hidden sm:inline">Done</span>
                                            </button>
                                            <ActionMenu
                                                label="Visit actions"
                                                items={[
                                                    v.workOrderId && v.jobId ? { label: 'Open work order', onSelect: () => onOpenDocument(v.workOrderId as string, v.jobId as string, 'Work Order') } : null,
                                                    v.invoiceId && v.jobId ? { label: 'Open invoice', onSelect: () => onOpenDocument(v.invoiceId as string, v.jobId as string, 'Invoice') } : null,
                                                    v.jobId ? { label: 'Open job', onSelect: () => onOpenJob(v.jobId as string) } : null,
                                                    { label: 'Skip this visit', onSelect: () => { void visitAction(v, 'skipped'); } },
                                                ]}
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    {/* plans */}
                    <section aria-labelledby="sp-plans">
                        <h2 id="sp-plans" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plans</h2>
                        <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
                            {list.map(p => (
                                <li key={p.id} className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${busy === p.id ? 'opacity-60' : ''}`}>
                                    <span className={`h-10 w-1 shrink-0 rounded-full ${p.status === 'active' ? 'bg-primary' : p.status === 'paused' ? 'bg-warning' : 'bg-muted-foreground/40'}`} aria-hidden />
                                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => paid && setEditing({ plan: p, kind: 'edit' })}>
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className="truncate font-semibold">{p.name}</span>
                                            {p.status !== 'active' && <span className={`badge ${p.status === 'paused' ? 'badge-warning' : 'badge-muted'}`}>{p.status === 'paused' ? 'Paused' : 'Ended'}</span>}
                                        </span>
                                        <span className="block truncate text-xs text-muted-foreground">{[p.clientName || 'No client', frequencyLabel(p.intervalUnit, p.intervalCount), priceLabel(p)].join(' · ')}</span>
                                        {p.status === 'active' && <span className="block text-xs text-foreground">Next visit created for {formatYMD(p.nextVisit, { month: 'short', day: 'numeric', year: p.nextVisit.slice(0, 4) !== today.slice(0, 4) ? 'numeric' : undefined })}</span>}
                                    </button>
                                    <ActionMenu
                                        label={`More for ${p.name}`}
                                        items={[
                                            paid ? { label: 'Edit', onSelect: () => setEditing({ plan: p, kind: 'edit' }) } : null,
                                            p.jobId ? { label: 'Open job', onSelect: () => onOpenJob(p.jobId as string) } : null,
                                            p.status === 'active' ? { label: 'Pause', onSelect: () => { void changeStatus(p, 'paused'); } } : null,
                                            p.status !== 'active' && paid ? { label: 'Resume', onSelect: () => { void changeStatus(p, 'active'); } } : null,
                                            p.status !== 'ended' ? { label: 'End plan', onSelect: () => { void changeStatus(p, 'ended'); } } : null,
                                            { label: 'Delete', onSelect: () => setDeleting(p), destructive: true },
                                        ]}
                                    />
                                </li>
                            ))}
                        </ul>
                    </section>
                </>
            )}

            {editing && (
                <PlanEditor
                    plan={editing.plan}
                    kind={editing.kind}
                    clients={clients}
                    today={today}
                    onClose={() => setEditing(null)}
                    onSave={async (next) => {
                        const r = await savePlan({ plan: next, userId, kind: editing.kind, profile, existingInvoiceNumbers, today });
                        setPlans(prev => {
                            const l = prev || [];
                            return l.some(x => x.id === r.plan.id) ? l.map(x => (x.id === r.plan.id ? r.plan : x)) : [...l, r.plan];
                        });
                        setEditing(null);
                        toast.success(editing.kind === 'create'
                            ? `Plan saved.${r.visitsCreated ? ` ${r.visitsCreated === 1 ? 'The first visit was' : `${r.visitsCreated} visits were`} created with ${r.visitsCreated === 1 ? 'its' : 'their'} work order.` : ' Its first visit appears here before its day.'}${r.invoice ? ' A recurring invoice was added to the job.' : ''}`
                            : 'Plan saved.');
                        onDataChanged({ invoice: r.invoice, jobId: r.plan.jobId });
                        void load();
                    }}
                    onUpgrade={onUpgrade}
                    jobsCount={jobs.length}
                />
            )}
            <ConfirmDialog
                open={!!deleting}
                title="Delete this plan?"
                message="No more visits are created. Its job, work orders and invoices stay where they are (delete them there if you need to)."
                confirmLabel="Delete"
                destructive
                busy={!!deleting && busy === deleting.id}
                onConfirm={() => { if (deleting) void remove(deleting); }}
                onCancel={() => setDeleting(null)}
            />
        </div>
    );
};

// ------------------------------------------------------------------------------------------------
// New / edit plan
// ------------------------------------------------------------------------------------------------
const PlanEditor: React.FC<{
    plan: ServicePlan;
    kind: 'create' | 'edit';
    clients: Client[];
    today: string;
    jobsCount: number;
    onClose: () => void;
    onSave: (p: ServicePlan) => Promise<void>;
    onUpgrade: (reason?: string) => void;
}> = ({ plan, kind, clients, today, onClose, onSave, onUpgrade }) => {
    const [v, setV] = useState<ServicePlan>(plan);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const set = <K extends keyof ServicePlan>(k: K, val: ServicePlan[K]) => setV(cur => ({ ...cur, [k]: val }));
    const preset = FREQUENCY_PRESETS.find(f => f.unit === v.intervalUnit && f.count === v.intervalCount)?.id || 'custom';
    const sorted = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name)), [clients]);
    const next = upcomingVisitDates(v, 4);
    const inv = visitInvoicePreview(v, next[0] || v.nextVisit);
    const yearly = annualValue(v);
    // a plan with a recurring invoice keeps its billing (the invoice repeats by itself; changing it here would bill twice)
    const periodBillingLocked = kind === 'edit' && !!plan.invoiceSourceId;

    const pickClient = (id: string) => {
        const c = clients.find(x => x.id === id);
        setV(cur => ({ ...cur, clientId: c?.id || null, clientName: c?.name || '', clientAddress: c?.address || '' }));
    };

    const save = async () => {
        const problems = planProblems(v, today);
        if (problems.length) { setError(problems[0]); return; }
        setBusy(true);
        setError('');
        try {
            await onSave(v);
        } catch (e) {
            const msg = describeError(e, 'Could not save the plan.');
            if (/PLAN_LIMIT|part of Premium/i.test(`${(e as any)?.message || ''} ${msg}`)) { onClose(); onUpgrade(msg.replace(/^PLAN_LIMIT:\s*/, '')); return; }
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="lg"
            title={kind === 'create' ? 'New service plan' : v.name || 'Service plan'}
            footer={
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => { void save(); }} disabled={busy}>{busy ? 'Saving…' : 'Save plan'}</button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Client" htmlFor="sp-client">
                        {sorted.length ? (
                            <select id="sp-client" className="input" value={v.clientId || ''} onChange={(e) => pickClient(e.target.value)} disabled={kind === 'edit'}>
                                <option value="">Choose a client…</option>
                                {sorted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        ) : (
                            <input id="sp-client" className="input" value={v.clientName} onChange={(e) => set('clientName', e.target.value)} placeholder="Client name" />
                        )}
                    </Field>
                    <Field label="Plan name" htmlFor="sp-name">
                        <input id="sp-name" className="input" value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={120} placeholder="HVAC maintenance" />
                    </Field>
                </div>
                <Field label="What is done at each visit" htmlFor="sp-service" hint="Printed on each work order.">
                    <textarea id="sp-service" className="input min-h-[70px]" value={v.service} onChange={(e) => set('service', e.target.value)} maxLength={2000} placeholder="Furnace and AC tune-up: filters, coils, refrigerant check, safety test" />
                </Field>

                <div>
                    <span className="label">How often</span>
                    <div className="flex flex-wrap gap-1.5">
                        {FREQUENCY_PRESETS.map(f => (
                            <button key={f.id} type="button" onClick={() => setV(cur => ({ ...cur, intervalUnit: f.unit, intervalCount: f.count, anchorDay: null }))} aria-pressed={preset === f.id}
                                className={`h-9 rounded-full border px-3 text-sm font-medium transition ${preset === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">or every</span>
                        <span className="w-20"><NumberInput value={v.intervalCount} onValueChange={(n) => setV(cur => ({ ...cur, intervalCount: Math.max(1, Math.round(n) || 1), anchorDay: null }))} decimals={0} min={1} max={v.intervalUnit === 'week' ? 52 : 24} aria-label="Every how many" /></span>
                        <select className="input h-10 w-auto" value={v.intervalUnit} onChange={(e) => setV(cur => ({ ...cur, intervalUnit: e.target.value as IntervalUnit, anchorDay: null }))} aria-label="Weeks or months">
                            <option value="week">weeks</option>
                            <option value="month">months</option>
                        </select>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <Field label={kind === 'create' ? 'First visit' : 'Next visit'} htmlFor="sp-next">
                        <input id="sp-next" type="date" className="input" value={v.nextVisit} onChange={(e) => setV(cur => ({ ...cur, nextVisit: e.target.value, anchorDay: null }))} />
                    </Field>
                    <Field label="Ends (optional)" htmlFor="sp-ends">
                        <input id="sp-ends" type="date" className="input" value={v.endsOn} onChange={(e) => set('endsOn', e.target.value)} />
                    </Field>
                    <Field label="Assigned to" htmlFor="sp-assigned">
                        <input id="sp-assigned" className="input" value={v.assignedTo} onChange={(e) => set('assignedTo', e.target.value)} maxLength={120} placeholder="Crew or tech" />
                    </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Billing" htmlFor="sp-billing" hint={periodBillingLocked ? 'Billed by its recurring invoice on the job: change the amount or stop it there.' : v.billing === 'per_visit' ? 'A Draft invoice is made with each visit.' : v.billing === 'none' ? 'No invoice is made by the plan.' : 'One recurring invoice on the plan’s job repeats by itself.'}>
                        <select id="sp-billing" className="input" value={v.billing} onChange={(e) => set('billing', e.target.value as PlanBilling)} disabled={periodBillingLocked}>
                            {BILLING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </Field>
                    {v.billing !== 'none' && (
                        <Field label={`Price ${BILLING_OPTIONS.find(o => o.value === v.billing)?.per || ''}`} htmlFor="sp-price">
                            <NumberInput id="sp-price" value={v.price || ''} onValueChange={(n) => set('price', n)} decimals={2} prefix="$" placeholder="129.00" />
                        </Field>
                    )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Create each visit" htmlFor="sp-lead" hint="The work order (and invoice) appear this early, so you can plan and the client gets the reminder.">
                        <select id="sp-lead" className="input" value={v.leadDays} onChange={(e) => set('leadDays', Number(e.target.value))}>
                            {[3, 7, 14, 21, 30].map(n => <option key={n} value={n}>{n} days before</option>)}
                        </select>
                    </Field>
                    <div className="space-y-2 pt-6 text-sm">
                        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={v.remindClient} onChange={(e) => set('remindClient', e.target.checked)} /> Remind the client before each visit</label>
                        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={v.showInPortal} onChange={(e) => set('showInPortal', e.target.checked)} /> Show the plan in the client portal</label>
                    </div>
                </div>

                <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
                    <p><span className="font-semibold">{frequencyLabel(v.intervalUnit, v.intervalCount)}</span>{next.length ? <> · next visits {next.map(d => formatYMD(d, { month: 'short', day: 'numeric', year: d.slice(0, 4) !== today.slice(0, 4) ? 'numeric' : undefined })).join(', ')}</> : null}</p>
                    {inv && <p className="text-muted-foreground">Each visit: work order + Draft invoice {formatMoney(inv.total)}, due 14 days after the visit.</p>}
                    {yearly > 0 && <p className="text-muted-foreground">About {formatMoney(yearly)} a year.</p>}
                    {v.remindClient && <p className="text-muted-foreground">The client gets your visit reminder by email (Settings › Reminders sets the day and wording).</p>}
                </div>
                {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            </div>
        </Modal>
    );
};

export default ServicePlansView;
