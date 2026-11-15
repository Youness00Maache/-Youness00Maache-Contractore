/**
 * Job page › Subs › "New subcontract" / "Edit": who does the work (a crew subcontractor, or a name you type), the scope, what the
 * sub reads on their link, the agreed amount, retainage, dates and your private notes.
 * New: "Save draft" keeps it to yourself; "Save and send" shows it on the sub's link. Editing a subcontract the sub already
 * accepted warns first: changing the scope, amount, retainage or dates sends it back to "Sent" so the sub accepts again.
 * Data: lib/subs/subsApi.ts (createCommitment / updateCommitment); words and rules: lib/subs/subView.ts, subLogic.ts.
 */
import React, { useMemo, useState } from 'react';
import { planLimitMessage } from '../../lib/account.ts';
import { isPlanLimitError } from '../../lib/jobFiles/jobFilesApi.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { createCommitment, updateCommitment } from '../../lib/subs/subsApi.ts';
import {
    parseAmount, parseRetainage, subDisplayName, subNameOf, termsResetAcceptance, validateCommitmentDraft,
} from '../../lib/subs/subLogic.ts';
import { EDIT_RESET_WARNING, moneyText } from '../../lib/subs/subView.ts';
import { SUB_LIMITS, type CommitmentDraft, type CommitmentPatch, type SubCommitment, type SubMember } from '../../lib/subs/subTypes.ts';
import { Modal } from '../viewKit.tsx';

const OTHER = '__other';

export interface CommitmentEditorProps {
    commitment?: SubCommitment;
    jobId: string;
    userId: string;
    /** crew subcontractors that are not archived */
    subs: readonly SubMember[];
    isOnline: boolean;
    onClose: () => void;
    onSaved: (saved: SubCommitment, sent: boolean) => void;
    onUpgrade: (reason?: string) => void;
}

const CommitmentEditorModal: React.FC<CommitmentEditorProps> = ({ commitment, jobId, userId, subs, isOnline, onClose, onSaved, onUpgrade }) => {
    const c = commitment;
    const [who, setWho] = useState<string>(() => (c ? (c.crewMemberId || OTHER) : subs.length === 0 ? OTHER : ''));
    const [subName, setSubName] = useState(c && !c.crewMemberId ? c.subName : '');
    const [title, setTitle] = useState(c?.title || '');
    const [description, setDescription] = useState(c?.description || '');
    const [amount, setAmount] = useState(c ? String(c.amount) : '');
    const [retainage, setRetainage] = useState(c ? String(c.retainagePct) : '0');
    const [startDate, setStartDate] = useState(c?.startDate || '');
    const [dueDate, setDueDate] = useState(c?.dueDate || '');
    const [notes, setNotes] = useState(c?.notes || '');
    const [busy, setBusy] = useState<'draft' | 'send' | 'save' | null>(null);
    const [err, setErr] = useState('');

    const member = who && who !== OTHER ? subs.find(m => m.id === who) || null : null;
    // an existing commitment may point at someone who is no longer a (non-archived) subcontractor
    const keptName = c && c.crewMemberId && !subs.some(m => m.id === c.crewMemberId) ? c.subName : '';

    const fields = (): Omit<CommitmentDraft, 'quoteId'> => ({
        crewMemberId: who && who !== OTHER ? who : null,
        subName: who === OTHER ? subName : member ? subNameOf(member) : keptName || null,
        title: title.trim(),
        description: description.trim() || null,
        amount: parseAmount(amount) ?? Number.NaN,
        retainagePct: parseRetainage(retainage) ?? Number.NaN,
        startDate: startDate || null,
        dueDate: dueDate || null,
        notes: notes.trim() || null,
    });

    const resets = useMemo(() => {
        if (!c || c.status !== 'accepted') return false;
        const f = { title: title.trim(), description: description.trim() || null, amount: parseAmount(amount) ?? c.amount, retainagePct: parseRetainage(retainage) ?? c.retainagePct, startDate: startDate || null, dueDate: dueDate || null };
        return termsResetAcceptance(c, f);
    }, [c, title, description, amount, retainage, startDate, dueDate]);

    const held = (() => {
        const a = parseAmount(amount);
        const r = parseRetainage(retainage);
        return a !== null && r !== null && r > 0 ? Math.round(a * r) / 100 : null;
    })();

    const save = async (mode: 'draft' | 'send' | 'save') => {
        setErr('');
        if (!isOnline) { setErr(NEEDS_CONNECTION); return; }
        if (who === '') { setErr('Pick the subcontractor or choose "Someone else" and type who does the work.'); return; }
        const f = fields();
        const problem = validateCommitmentDraft(c ? (f as CommitmentPatch) : (f as CommitmentDraft));
        if (problem) { setErr(problem); return; }
        setBusy(mode);
        try {
            if (c) {
                const saved = await updateCommitment(c.id, f as CommitmentPatch);
                onSaved(saved, false);
            } else {
                const saved = await createCommitment(userId, jobId, f as CommitmentDraft, { issue: mode === 'send' });
                onSaved(saved, mode === 'send');
            }
            onClose();
        } catch (e) {
            if (isPlanLimitError(e)) { onClose(); onUpgrade(planLimitMessage(e)); return; }
            setErr((e as Error)?.message || 'It could not be saved.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy !== null}
            size="lg"
            title={c ? 'Edit subcontract' : 'New subcontract'}
            description={c ? undefined : 'The agreed scope and price with one subcontractor. It counts as committed cost once you send it.'}
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy !== null}>Cancel</button>
                    {c ? (
                        <button type="button" className="btn btn-primary" onClick={() => void save('save')} disabled={busy !== null || !isOnline}>{busy ? 'Saving…' : resets ? 'Save and ask the sub to accept again' : 'Save'}</button>
                    ) : (
                        <>
                            <button type="button" className="btn btn-outline" onClick={() => void save('draft')} disabled={busy !== null || !isOnline}>{busy === 'draft' ? 'Saving…' : 'Save draft'}</button>
                            <button type="button" className="btn btn-primary" onClick={() => void save('send')} disabled={busy !== null || !isOnline}>{busy === 'send' ? 'Sending…' : 'Save and send to sub'}</button>
                        </>
                    )}
                </>
            )}
        >
            <div className="space-y-4">
                {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="status">{NEEDS_CONNECTION}</p>}
                {resets && <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm font-medium" role="status">{EDIT_RESET_WARNING}</p>}

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="label">Who does the work</span>
                        <select className="input" value={who} onChange={e => setWho(e.target.value)} disabled={!!busy}>
                            {who === '' && <option value="" disabled>Choose a subcontractor…</option>}
                            {keptName && c?.crewMemberId && <option value={c.crewMemberId}>{keptName} (no longer on your subs list)</option>}
                            {subs.map(m => <option key={m.id} value={m.id}>{subDisplayName(m)}{m.trade ? ` · ${m.trade}` : ''}</option>)}
                            <option value={OTHER}>Someone else (type a name)</option>
                        </select>
                    </label>
                    {who === OTHER ? (
                        <label className="block">
                            <span className="label">Name of the sub or company</span>
                            <input className="input" value={subName} onChange={e => setSubName(e.target.value.slice(0, SUB_LIMITS.subName))} placeholder="e.g. Bay Electric" autoComplete="off" disabled={!!busy} />
                        </label>
                    ) : (
                        <p className="self-end pb-2 text-xs text-muted-foreground">
                            {subs.length === 0 ? 'Add subcontractors on the Crew screen so they get a link to accept the work.' : 'They accept the work on their crew link.'}
                        </p>
                    )}
                </div>
                {who === OTHER && <p className="-mt-2 text-xs text-muted-foreground">A name you type has no link, so they cannot accept on a phone. Add them on the Crew screen as a subcontractor to give them one.</p>}

                <label className="block">
                    <span className="label">Scope of work</span>
                    <input className="input" value={title} onChange={e => setTitle(e.target.value.slice(0, SUB_LIMITS.title))} placeholder="e.g. Electrical rough-in" autoComplete="off" disabled={!!busy} autoFocus={!c} />
                </label>

                <label className="block">
                    <span className="label">What the sub reads <span className="font-normal text-muted-foreground">(shown on their link)</span></span>
                    <textarea className="input min-h-[88px]" value={description} onChange={e => setDescription(e.target.value.slice(0, SUB_LIMITS.longText))} rows={3} placeholder="What is included, materials, access, how it should be finished…" disabled={!!busy} />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="label">Agreed amount</span>
                        <span className="relative block">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <input className="input pl-7 tabular-nums" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))} placeholder="12,000" disabled={!!busy} />
                        </span>
                    </label>
                    <label className="block">
                        <span className="label">Retainage <span className="font-normal text-muted-foreground">(held until the work is complete)</span></span>
                        <span className="relative block">
                            <input className="input pr-8 tabular-nums" inputMode="decimal" value={retainage} onChange={e => setRetainage(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} placeholder="0" disabled={!!busy} />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">{held !== null ? `${moneyText(held)} is held back until completion.` : `0 to ${SUB_LIMITS.maxRetainagePct}%. Leave 0 for none.`}</span>
                    </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="label">Start date <span className="font-normal text-muted-foreground">(optional)</span></span>
                        <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={!!busy} />
                    </label>
                    <label className="block">
                        <span className="label">Due date <span className="font-normal text-muted-foreground">(optional)</span></span>
                        <input className="input" type="date" value={dueDate} min={startDate || undefined} onChange={e => setDueDate(e.target.value)} disabled={!!busy} />
                    </label>
                </div>

                <label className="block">
                    <span className="label">Private notes <span className="font-normal text-muted-foreground">(only you see these)</span></span>
                    <textarea className="input min-h-[64px]" value={notes} onChange={e => setNotes(e.target.value.slice(0, SUB_LIMITS.longText))} rows={2} disabled={!!busy} />
                </label>

                {err && <p className="text-sm font-medium text-destructive" role="alert">{err}</p>}
            </div>
        </Modal>
    );
};

export default CommitmentEditorModal;
