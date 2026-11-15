/**
 * Job page › Subs › Subcontracts: what you agreed with each sub for this job. A ruled list (no card grid): open ones first (sent,
 * accepted, in progress), then drafts, then completed and cancelled folded away. Each row: the scope, who, the status, the amount,
 * paid / still to pay with a thin bar, the retainage held, the due date (overdue in red) and whether the sub accepted.
 * Tap a row for the whole story (components/subs/CommitmentDetailModal.tsx): actions, payments, Copy sub link.
 * Every change needs a connection and Premium (the list stays readable on Free).
 */
import React, { useMemo, useState } from 'react';
import {
    commitmentMoney, ownerActions, sortCommitments, statusLabel, subDisplayName, summarizeCommitments, todayISO, type OwnerAction,
} from '../../lib/subs/subLogic.ts';
import { deleteCommitment, setCommitmentStatus } from '../../lib/subs/subsApi.ts';
import {
    ACTION_CONFIRM, acceptanceLine, actionLabel, commitmentTone, dueInfo, headlineParts, moneyText, sentNote,
} from '../../lib/subs/subView.ts';
import type { SubCommitment } from '../../lib/subs/subTypes.ts';
import { cx } from '../commsKit.tsx';
import { ActionMenu, ConfirmDialog } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { PlusIcon } from '../Icons.tsx';
import { StatusChip } from '../jobFiles/ui.tsx';
import CommitmentDetailModal from './CommitmentDetailModal.tsx';
import CommitmentEditorModal from './CommitmentEditorModal.tsx';
import { copySubLink, type SubsGuards } from './subsShared.ts';
import type { JobListState, SubMembersState } from './useJobSubs.ts';

export interface SubcontractsSectionProps {
    jobId: string;
    userId: string;
    company: string;
    commitments: JobListState<SubCommitment>;
    members: SubMembersState;
    guards: SubsGuards;
}

type Act = OwnerAction['id'] | 'edit' | 'delete' | 'pay' | 'copy_link' | 'open';
type Confirm = { id: keyof typeof ACTION_CONFIRM; commitment: SubCommitment };

const BAR: Record<ReturnType<typeof commitmentTone>, string> = {
    primary: 'bg-primary', warning: 'bg-warning', success: 'bg-success', danger: 'bg-destructive', muted: 'bg-muted-foreground/30',
};

const EMPTY: SubCommitment[] = [];

const SubcontractsSection: React.FC<SubcontractsSectionProps> = ({ jobId, userId, company, commitments, members, guards }) => {
    const today = todayISO();
    const list = Array.isArray(commitments.items) ? commitments.items : EMPTY;
    const summary = useMemo(() => summarizeCommitments(list, today), [list, today]);
    const sorted = useMemo(() => sortCommitments(list), [list]);
    const open = sorted.filter(c => c.status === 'issued' || c.status === 'accepted' || c.status === 'in_progress');
    const drafts = sorted.filter(c => c.status === 'draft');
    const closed = sorted.filter(c => c.status === 'completed' || c.status === 'cancelled');
    const [editor, setEditor] = useState<{ commitment?: SubCommitment } | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<Confirm | null>(null);
    const [showClosed, setShowClosed] = useState(false);
    const detail = openId ? list.find(c => c.id === openId) || null : null;
    const parts = headlineParts(summary);

    const start = () => { if (guards.needPremium() && guards.needOnline()) setEditor({}); };

    const run = async (id: OwnerAction['id'], c: SubCommitment) => {
        const a = ownerActions(c).find(x => x.id === id);
        if (!a || busyId) return;
        setBusyId(c.id);
        try {
            const saved = await setCommitmentStatus(c.id, a.to);
            commitments.upsert(saved);
            toast.success(id === 'issue' ? sentNote(saved) : id === 'complete' ? 'Marked completed.' : id === 'start' ? 'Marked in progress.' : id === 'cancel' ? 'Cancelled.' : id === 'reopen' ? 'Back to In progress.' : 'Back to a draft.');
        } catch (e) {
            guards.fail(e, 'The change could not be saved.');
        } finally {
            setBusyId(null);
        }
    };

    const act = (id: Act, c: SubCommitment) => {
        if (id === 'open') { setOpenId(c.id); return; }
        if (id === 'copy_link') {
            const m = c.crewMemberId ? members.byId.get(c.crewMemberId) : null;
            if (!m) { toast.error('This sub was typed in by name, so there is no link to copy.'); return; }
            void copySubLink({ memberId: m.id, memberName: m.name, company }).then(r => (r.ok ? toast.success(r.message) : toast.error(r.message)));
            return;
        }
        if (id === 'pay') { setOpenId(c.id); return; }
        if (!guards.needPremium()) return;
        if (id === 'edit') { setOpenId(null); if (guards.needOnline()) setEditor({ commitment: c }); return; }
        if (id === 'delete') { setConfirm({ id: 'delete', commitment: c }); return; }
        if (ACTION_CONFIRM[id]) { setConfirm({ id, commitment: c }); return; }
        if (!guards.needOnline()) return;
        void run(id, c);
    };

    const confirmNow = async () => {
        const cf = confirm;
        if (!cf || !guards.needOnline()) return;
        if (cf.id === 'delete') {
            setBusyId(cf.commitment.id);
            try {
                await deleteCommitment(cf.commitment.id);
                commitments.remove(cf.commitment.id);
                setOpenId(null);
                setConfirm(null);
                toast.success('Deleted.');
            } catch (e) {
                guards.fail(e, 'It could not be deleted.');
            } finally {
                setBusyId(null);
            }
            return;
        }
        setConfirm(null);
        await run(cf.id as OwnerAction['id'], cf.commitment);
    };

    const row = (c: SubCommitment) => {
        const m = commitmentMoney(c);
        const tone = commitmentTone(c.status);
        const due = dueInfo(c, today);
        const accepted = acceptanceLine(c, today);
        const member = c.crewMemberId ? members.byId.get(c.crewMemberId) : undefined;
        const actions = ownerActions(c);
        return (
            <li key={c.id} className={cx('relative flex items-center gap-1 pl-4 pr-1', busyId === c.id && 'opacity-60')}>
                <span aria-hidden className={cx('absolute inset-y-2 left-0 w-[3px] rounded-r', BAR[due.tone === 'late' ? 'danger' : tone])} />
                <button type="button" onClick={() => setOpenId(c.id)} className="min-w-0 flex-1 py-2.5 pr-1 text-left">
                    <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-sm font-semibold leading-5">{c.title}</span>
                        <StatusChip tone={due.tone === 'late' ? 'danger' : tone} className="mt-0.5 shrink-0">{due.tone === 'late' ? due.text : statusLabel(c.status)}</StatusChip>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="truncate">{member ? subDisplayName(member) : c.subName}</span>
                        {due.text && due.tone !== 'late' && <span className={cx(due.tone === 'soon' && 'font-semibold text-warning')}>{due.text}</span>}
                        {accepted && <span className={cx(c.status === 'issued' ? 'text-warning' : 'text-success')}>{accepted}</span>}
                    </span>
                    <span className="mt-1.5 flex items-baseline gap-x-2 text-sm">
                        <span className="font-bold tabular-nums">{moneyText(m.amount)}</span>
                        {c.status !== 'draft' && (
                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                                {moneyText(m.paid)} paid · {moneyText(m.remaining)} left{m.retainageHeld > 0 ? ` · ${moneyText(m.retainageHeld)} held` : ''}
                            </span>
                        )}
                        {c.status === 'draft' && m.retainageTotal > 0 && <span className="text-xs text-muted-foreground">{c.retainagePct}% retainage</span>}
                    </span>
                    {c.status !== 'draft' && m.amount > 0 && (
                        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <span className={cx('block h-full rounded-full', m.intoRetainage ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, m.pctPaid)}%` }} />
                        </span>
                    )}
                </button>
                <span className="shrink-0">
                    <ActionMenu
                        label={`More for ${c.title}`}
                        items={[
                            { label: 'Open', onSelect: () => act('open', c) },
                            ...actions.map(a => ({ label: actionLabel(a), onSelect: () => act(a.id, c) })),
                            c.status !== 'draft' && c.status !== 'cancelled' ? { label: 'Record a payment', onSelect: () => act('pay', c) } : null,
                            c.crewMemberId && c.status !== 'draft' && c.status !== 'cancelled' ? { label: 'Copy sub link', onSelect: () => act('copy_link', c) } : null,
                            c.status !== 'cancelled' ? { label: 'Edit', onSelect: () => act('edit', c) } : null,
                            (c.status === 'draft' || c.status === 'cancelled') && c.payments.length === 0 ? { label: 'Delete', destructive: true, onSelect: () => act('delete', c) } : null,
                        ]}
                    />
                </span>
            </li>
        );
    };

    const section = (title: string, rows: SubCommitment[], strong = false) => (rows.length === 0 ? null : (
        <div key={title}>
            <h3 className="mb-1 flex items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className={strong ? 'text-foreground' : ''}>{title}</span>
                <span className="tabular-nums normal-case tracking-normal">{rows.length}</span>
            </h3>
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">{rows.map(row)}</ul>
        </div>
    ));

    const cf = confirm ? ACTION_CONFIRM[confirm.id] : undefined;

    return (
        <div className="space-y-4" data-testid="subs-commitments">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p className="min-w-0 text-sm text-muted-foreground">
                    {parts.length === 0 ? 'No subcontracts yet.' : parts.map((p, i) => (
                        <React.Fragment key={p.text}>
                            {i > 0 && ' · '}
                            <span className={p.tone === 'strong' ? 'font-semibold text-foreground' : p.tone === 'late' ? 'font-semibold text-destructive' : ''}>{p.text}</span>
                        </React.Fragment>
                    ))}
                </p>
                <button type="button" className="btn btn-primary h-11 w-full shrink-0 px-3.5 sm:h-10 sm:w-auto" onClick={start}><PlusIcon className="h-4 w-4" /> New subcontract</button>
            </div>

            {list.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Hired a sub for part of this job? Write down the scope, the agreed amount and any retainage. It counts as committed cost on the job, the sub accepts it on their link, and you record each payment against it. Start with <span className="font-semibold text-foreground">New subcontract</span>, or compare prices first under Quotes.
                </p>
            ) : (
                <div className="space-y-4">
                    {section('Open', open, true)}
                    {section('Drafts', drafts)}
                    {closed.length > 0 && (
                        <div>
                            <button type="button" className="mb-1 flex w-full items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => setShowClosed(v => !v)} aria-expanded={showClosed}>
                                <span>Completed and cancelled <span className="normal-case tracking-normal">· {showClosed ? 'hide' : 'show'}</span></span>
                                <span className="tabular-nums normal-case tracking-normal">{closed.length}</span>
                            </button>
                            {showClosed && <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">{closed.map(row)}</ul>}
                        </div>
                    )}
                </div>
            )}

            {editor && (
                <CommitmentEditorModal
                    commitment={editor.commitment}
                    jobId={jobId}
                    userId={userId}
                    subs={members.subs}
                    isOnline={guards.isOnline}
                    onClose={() => setEditor(null)}
                    onSaved={(saved, sent) => {
                        commitments.upsert(saved);
                        toast.success(sent ? sentNote(saved) : editor.commitment ? (saved.status === 'issued' && editor.commitment.status === 'accepted' ? 'Saved. The sub will be asked to accept again.' : 'Saved.') : 'Saved as a draft.');
                    }}
                    onUpgrade={guards.onUpgrade}
                />
            )}

            {detail && !editor && (
                <CommitmentDetailModal
                    key={detail.id}
                    commitment={detail}
                    member={detail.crewMemberId ? members.byId.get(detail.crewMemberId) || null : null}
                    company={company}
                    guards={guards}
                    busy={busyId === detail.id}
                    onClose={() => setOpenId(null)}
                    onAction={(id, c) => act(id, c)}
                    onPaid={saved => commitments.upsert(saved)}
                />
            )}

            <ConfirmDialog
                open={!!confirm}
                title={cf?.title || ''}
                message={confirm && cf ? cf.message(confirm.commitment) : undefined}
                confirmLabel={cf?.label || 'Confirm'}
                destructive={!!cf?.destructive}
                busy={!!confirm && busyId === confirm.commitment.id}
                onConfirm={() => { void confirmNow(); }}
                onCancel={() => setConfirm(null)}
            />
        </div>
    );
};

export default SubcontractsSection;
