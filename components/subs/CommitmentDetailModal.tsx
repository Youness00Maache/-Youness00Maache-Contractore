/**
 * Job page › Subs › one subcontract in full: the ledger (agreed, paid, still to pay, retainage held), the dates, whether the sub
 * accepted (and who, when), the scope the sub reads, your private notes, the buttons that fit its status (Send to sub, Mark in
 * progress, Mark completed, Cancel, Edit, Delete, Copy sub link) and the payments: "Record a payment" (a correction is a negative
 * amount) with the full history, oldest first, never edited.
 * Data: lib/subs/subsApi.ts (addPayment). Rules and words: lib/subs/subLogic.ts, subView.ts.
 */
import React, { useMemo, useState } from 'react';
import { addPayment } from '../../lib/subs/subsApi.ts';
import {
    canDelete, canEditTerms, canRecordPayment, commitmentMoney, ownerActions, statusLabel, subDisplayName, todayISO, validatePayment,
    type OwnerAction,
} from '../../lib/subs/subLogic.ts';
import {
    CORRECTION_HELP, acceptanceLine, actionLabel, commitmentTone, dayLabel, dueInfo, moneyText, payPreview, paymentLine,
} from '../../lib/subs/subView.ts';
import { SUB_LIMITS, type SubCommitment, type SubMember } from '../../lib/subs/subTypes.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { toast } from '../Toast.tsx';
import { Modal } from '../viewKit.tsx';
import { cx } from '../commsKit.tsx';
import { StatusChip } from '../jobFiles/ui.tsx';
import { copySubLink, type SubsGuards } from './subsShared.ts';

export interface CommitmentDetailProps {
    commitment: SubCommitment;
    member: SubMember | null;
    company: string;
    guards: SubsGuards;
    busy: boolean;
    /** the status buttons, Edit and Delete are run by the list (it asks first where it should) */
    onAction: (action: OwnerAction['id'] | 'edit' | 'delete', c: SubCommitment) => void;
    onPaid: (saved: SubCommitment) => void;
    onClose: () => void;
}

const Ledger: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
    <div className="min-w-0 px-3 py-2 first:pl-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className={cx('mt-0.5 truncate tabular-nums', strong ? 'text-lg font-bold' : 'text-base font-semibold')}>{value}</dd>
    </div>
);

const CommitmentDetailModal: React.FC<CommitmentDetailProps> = ({ commitment: c, member, company, guards, busy, onAction, onPaid, onClose }) => {
    const today = todayISO();
    const m = commitmentMoney(c);
    const due = dueInfo(c, today);
    const accepted = acceptanceLine(c, today);
    const actions = ownerActions(c);
    const [paying, setPaying] = useState(false);
    const [at, setAt] = useState(today);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [linking, setLinking] = useState(false);

    const preview = useMemo(() => payPreview(c, { amount, at, note }), [c, amount, at, note]);
    const link = c.crewMemberId && (c.status === 'issued' || c.status === 'accepted' || c.status === 'in_progress' || c.status === 'completed');

    const savePayment = async () => {
        setErr('');
        if (!guards.needPremium()) return;
        if (!guards.needOnline()) return;
        const problem = validatePayment(c, { amount, at, note });
        if (problem) { setErr(problem); return; }
        setSaving(true);
        try {
            const saved = await addPayment(c, { amount, at, note });
            onPaid(saved);
            setAmount('');
            setNote('');
            setAt(todayISO());
            setPaying(false);
            toast.success(Number(String(amount).replace(/[\s$,]/g, '')) < 0 ? 'Correction recorded.' : 'Payment recorded.');
        } catch (e) {
            guards.fail(e, 'The payment could not be saved.');
            setErr((e as Error)?.message || 'The payment could not be saved.');
        } finally {
            setSaving(false);
        }
    };

    const copyLink = async () => {
        if (!member || linking) return;
        setLinking(true);
        const res = await copySubLink({ memberId: member.id, memberName: member.name, company });
        setLinking(false);
        if (res.ok) toast.success(res.message); else toast.error(res.message);
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={saving}
            size="lg"
            title={(
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 break-words">{c.title}</span>
                    <StatusChip tone={commitmentTone(c.status)} className="shrink-0 align-middle">{statusLabel(c.status)}</StatusChip>
                </span>
            )}
            description={(
                <span>
                    {member ? subDisplayName(member) : c.subName}
                    {member?.trade ? ` · ${member.trade}` : ''}
                    {c.quoteId ? ' · from a quote' : ''}
                </span>
            )}
        >
            <div className="space-y-5">
                {/* ledger: not a card grid, one ruled strip */}
                <section aria-label="Money">
                    <dl className="grid grid-cols-3 divide-x divide-border/70 border-y border-border/70">
                        <Ledger label="Agreed" value={moneyText(m.amount)} strong />
                        <Ledger label="Paid" value={moneyText(m.paid)} />
                        <Ledger label="Still to pay" value={moneyText(m.remaining)} />
                    </dl>
                    <div className="mt-2.5 flex items-center gap-3">
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Paid" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(m.pctPaid)}>
                            <div className={cx('h-full rounded-full', m.intoRetainage ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, m.pctPaid)}%` }} />
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{m.pctPaid}% paid</span>
                    </div>
                    {m.retainageTotal > 0 && (
                        <p className="mt-2 text-sm text-muted-foreground">
                            Retainage {c.retainagePct}% ({moneyText(m.retainageTotal)}): <span className="font-medium text-foreground">{moneyText(m.retainageHeld)} still held</span>
                            {c.status === 'completed' && m.retainageHeld > 0 ? ', ready to pay now.' : c.status === 'completed' ? '.' : ' until the work is complete.'}
                            {m.intoRetainage && <span className="font-medium text-warning"> You have paid into the retainage.</span>}
                        </p>
                    )}
                </section>

                <section className="space-y-1.5 text-sm" aria-label="Status">
                    {(c.startDate || c.dueDate) && (
                        <p className="flex flex-wrap gap-x-4 gap-y-0.5">
                            {c.startDate && <span><span className="text-muted-foreground">Starts</span> <span className="font-medium">{dayLabel(c.startDate, today)}</span></span>}
                            {c.dueDate && <span><span className="text-muted-foreground">Due</span> <span className={cx('font-medium', due.tone === 'late' && 'text-destructive')}>{dayLabel(c.dueDate, today)}</span>{due.tone === 'late' && <span className="font-semibold text-destructive"> · {due.text}</span>}</span>}
                        </p>
                    )}
                    {accepted && <p className={cx('font-medium', c.status === 'issued' ? 'text-warning' : 'text-success')}>{accepted}</p>}
                    {c.status === 'draft' && <p className="text-muted-foreground">A draft: the sub does not see it yet. Send it when the scope and price are right.</p>}
                    {!c.crewMemberId && c.status !== 'draft' && c.status !== 'cancelled' && (
                        <p className="text-muted-foreground">This sub was typed in by name, so there is no link for them to accept on. Add them on the Crew screen as a subcontractor to give them one.</p>
                    )}
                </section>

                {c.description && (
                    <section aria-label="What the sub reads">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What the sub reads</h3>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.description}</p>
                    </section>
                )}
                {c.notes && (
                    <section aria-label="Private notes">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your private notes</h3>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{c.notes}</p>
                    </section>
                )}

                <section aria-label="Actions" className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
                    {actions.map((a, i) => (
                        <button key={a.id} type="button" className={cx('btn btn-sm min-h-[40px]', i === 0 ? 'btn-primary' : 'btn-outline')} disabled={busy} onClick={() => onAction(a.id, c)}>{actionLabel(a)}</button>
                    ))}
                    {link && member && (
                        <button type="button" className="btn btn-outline btn-sm min-h-[40px]" disabled={linking} onClick={() => { void copyLink(); }}>{linking ? 'Copying…' : 'Copy sub link'}</button>
                    )}
                    {canEditTerms(c) && <button type="button" className="btn btn-ghost btn-sm min-h-[40px]" disabled={busy} onClick={() => onAction('edit', c)}>Edit</button>}
                    {canDelete(c) && <button type="button" className="btn btn-ghost btn-sm min-h-[40px] text-destructive" disabled={busy} onClick={() => onAction('delete', c)}>Delete</button>}
                </section>

                <section aria-labelledby="sub-payments">
                    <div className="flex items-center justify-between gap-3">
                        <h3 id="sub-payments" className="text-sm font-bold">Payments</h3>
                        {canRecordPayment(c) && !paying && (
                            <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => { if (guards.needPremium()) setPaying(true); }}>Record a payment</button>
                        )}
                    </div>
                    {!canRecordPayment(c) && c.payments.length === 0 && (
                        <p className="mt-1 text-sm text-muted-foreground">{c.status === 'draft' ? 'Send the subcontract before you record payments.' : 'No payments were recorded.'}</p>
                    )}

                    {paying && (
                        <form className="mt-3 space-y-3 rounded-xl border border-border bg-muted/40 p-3" onSubmit={e => { e.preventDefault(); void savePayment(); }}>
                            <div className="grid gap-3 sm:grid-cols-[9.5rem_1fr]">
                                <label className="block">
                                    <span className="label">Date</span>
                                    <input className="input" type="date" value={at} max={today} onChange={e => setAt(e.target.value)} disabled={saving} />
                                </label>
                                <label className="block">
                                    <span className="label">Amount</span>
                                    <span className="relative block">
                                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                        <input className="input pl-7 tabular-nums" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.,-]/g, '').slice(0, 13))} placeholder={m.payableNow > 0 ? String(m.payableNow) : '0'} disabled={saving} autoFocus />
                                    </span>
                                </label>
                            </div>
                            <label className="block">
                                <span className="label">Note <span className="font-normal text-muted-foreground">(optional)</span></span>
                                <input className="input" value={note} onChange={e => setNote(e.target.value.slice(0, SUB_LIMITS.paymentNote))} placeholder="e.g. Check 1042, rough-in draw" disabled={saving} />
                            </label>
                            <p className="text-xs text-muted-foreground">{CORRECTION_HELP}</p>
                            {preview.error && <p className="text-sm font-medium text-destructive" role="alert">{preview.error}</p>}
                            {preview.ready && preview.after && (
                                <p className="text-sm" role="status">
                                    After this: <span className="font-semibold">{moneyText(preview.after.paid)} paid</span>, {moneyText(preview.after.remaining)} still to pay.
                                    {preview.notes.map(n => <span key={n} className="mt-1 block text-warning">{n}</span>)}
                                </p>
                            )}
                            {err && !preview.error && <p className="text-sm font-medium text-destructive" role="alert">{err}</p>}
                            {!guards.isOnline && <p className="text-sm text-warning" role="status">{NEEDS_CONNECTION}</p>}
                            <div className="flex flex-wrap gap-2">
                                <button type="submit" className="btn btn-primary min-h-[44px]" disabled={saving || !preview.ready || !guards.isOnline}>{saving ? 'Saving…' : preview.correction ? 'Record correction' : 'Record payment'}</button>
                                <button type="button" className="btn btn-outline min-h-[44px]" onClick={() => { setPaying(false); setErr(''); setAmount(''); }} disabled={saving}>Cancel</button>
                            </div>
                        </form>
                    )}

                    {c.payments.length > 0 && (
                        <ul className="mt-3 divide-y divide-border/70 border-y border-border/70 text-sm">
                            {c.payments.map(p => {
                                const l = paymentLine(p, today);
                                return (
                                    <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                                        <span className="min-w-0">
                                            <span className="font-medium">{l.when}</span>
                                            {l.correction && <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-warning">Correction</span>}
                                            {l.note && <span className="block truncate text-xs text-muted-foreground">{l.note}</span>}
                                        </span>
                                        <span className={cx('shrink-0 font-semibold tabular-nums', l.correction && 'text-warning')}>{l.amount}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {c.payments.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">Payments are never edited or deleted. To fix a mistake, record a correction.</p>}
                </section>
            </div>
        </Modal>
    );
};

export default CommitmentDetailModal;
