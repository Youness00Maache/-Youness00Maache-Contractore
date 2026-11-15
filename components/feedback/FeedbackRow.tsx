/**
 * One client response in the owner's feedback list (Settings › Client feedback, and the job's "Ask for feedback" window).
 * A ledger line, not a card: the rating as a big number on the left (green 4-5, amber 3, red 1-2), then who / which job /
 * when, the client's own words, and the actions:
 *   answered   Use as testimonial (name + quote, edited inline) · Edit / Remove from page · ⋯ Hide / Unhide, Private note, Delete
 *   waiting    Copy link (send it again) · ⋯ Delete
 * Every change needs a connection and says so. The quote of a testimonial must be a part of the client's own comment (the
 * database checks it too); the name defaults to first name + last initial and never takes an email or a phone number.
 */
import React, { useState } from 'react';
import type { FeedbackResponse } from '../../lib/feedback/feedbackTypes.ts';
import { FEEDBACK_LIMITS } from '../../lib/feedback/feedbackTypes.ts';
import { canBeTestimonial } from '../../lib/feedback/feedbackLogic.ts';
import { feedbackLink, deleteFeedback, setFeedbackHidden, setFeedbackNote, setTestimonial } from '../../lib/feedback/feedbackApi.ts';
import { publicLookFor, testimonialDraftFor, testimonialPatch, validateTestimonialDraft, type TestimonialDraft } from '../../lib/feedback/feedbackUi.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError } from '../../lib/account.ts';
import { copyToClipboard } from '../../utils/clientLinks.ts';
import { toast } from '../Toast.tsx';
import { ConfirmDialog } from '../commsKit.tsx';
import { DropdownItem, DropdownMenu, DropdownSeparator } from '../ui/DropdownMenu.tsx';
import { CopyIcon, EditIcon, EyeIcon, EyeOffIcon, MoreVerticalIcon, TrashIcon } from '../Icons.tsx';
import { StarsDisplay } from './Stars.tsx';

const dateText = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const ratingTone = (rating: number | null): string =>
    rating === null ? 'text-muted-foreground' : rating >= 4 ? 'text-success' : rating === 3 ? 'text-warning' : 'text-destructive';

type Mode = 'none' | 'testimonial' | 'note';

const FeedbackRow: React.FC<{
    r: FeedbackResponse;
    showJob?: boolean;
    isOnline: boolean;
    onChanged: (row: FeedbackResponse) => void;
    onDeleted: (id: string) => void;
}> = ({ r, showJob = true, isOnline, onChanged, onDeleted }) => {
    const [mode, setMode] = useState<Mode>('none');
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [draft, setDraft] = useState<TestimonialDraft>({ name: '', text: '' });
    const [note, setNote] = useState('');
    const [formError, setFormError] = useState('');

    const answered = r.status === 'submitted' && r.rating !== null;
    const look = publicLookFor(r);
    const who = r.clientName || r.clientFirstName || 'A client';
    const checks = validateTestimonialDraft(draft, r);

    const needOnline = (): boolean => {
        if (isOnline) return true;
        toast.error(NEEDS_CONNECTION);
        return false;
    };

    const run = async (work: () => Promise<FeedbackResponse | void>, done?: string): Promise<boolean> => {
        if (!needOnline()) return false;
        setBusy(true);
        try {
            const row = await work();
            if (row) onChanged(row);
            if (done) toast.success(done);
            return true;
        } catch (e) {
            const message = describeError(e, 'The change could not be saved.');
            setFormError(message);
            toast.error(message);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const openTestimonial = () => { setDraft(testimonialDraftFor(r)); setFormError(''); setMode('testimonial'); };
    const openNote = () => { setNote(r.ownerNote || ''); setFormError(''); setMode('note'); };

    const saveTestimonial = async () => {
        if (!checks.ok) { setFormError(checks.nameError || checks.textError || ''); return; }
        const p = testimonialPatch(draft);
        const ok = await run(() => setTestimonial(r.id, true, { name: p.name, text: p.text }), 'Shown on your page.');
        if (ok) setMode('none');
    };

    const saveNote = async () => {
        const ok = await run(() => setFeedbackNote(r.id, note.trim() ? note.trim() : null), 'Note saved.');
        if (ok) setMode('none');
    };

    const copyLink = async () => {
        const ok = await copyToClipboard(feedbackLink(r.token));
        if (ok) toast.success('Link copied. Send it to your client again.');
        else toast.error('Could not copy. Open the link from the menu on a job page.');
    };

    return (
        <li className="py-4">
            <div className="flex items-start gap-3">
                <div className={`w-11 shrink-0 text-center ${ratingTone(r.rating)}`} aria-hidden={answered ? undefined : true}>
                    {answered ? (
                        <>
                            <span className="block text-3xl font-extrabold leading-none tabular-nums">{r.rating}</span>
                            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider opacity-70">of 5</span>
                        </>
                    ) : (
                        <span className="block text-2xl leading-none" title="Waiting for the client">…</span>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {answered ? <StarsDisplay value={r.rating} size={14} /> : <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Waiting</span>}
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">{who}</span>
                        {look && <span className="badge badge-success">On your page</span>}
                        {r.hidden && <span className="badge badge-muted">Hidden</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {showJob && r.jobName ? `${r.jobName} · ` : ''}
                        {answered ? `Answered ${dateText(r.submittedAt)}` : `Asked ${dateText(r.requestedAt)}`}
                    </p>

                    {answered && (
                        r.comment
                            ? <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-foreground">“{r.comment}”</p>
                            : <p className="mt-2 text-sm italic text-muted-foreground">No comment, just the stars.</p>
                    )}
                    {r.ownerNote && mode !== 'note' && (
                        <p className="mt-2 border-l-2 border-border pl-2.5 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold">Private note:</span> {r.ownerNote}</p>
                    )}

                    {mode === 'none' && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {answered && !look && canBeTestimonial(r) && (
                                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={openTestimonial} disabled={busy}>Use as testimonial</button>
                            )}
                            {look && (
                                <>
                                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={openTestimonial} disabled={busy}><EditIcon className="h-3.5 w-3.5" /> Edit</button>
                                    <button type="button" className="btn btn-ghost btn-sm min-h-[40px] text-muted-foreground" disabled={busy}
                                        onClick={() => void run(() => setTestimonial(r.id, false), 'Removed from your page.')}>Remove from page</button>
                                </>
                            )}
                            {!answered && (
                                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => void copyLink()}><CopyIcon className="h-3.5 w-3.5" /> Copy link</button>
                            )}
                            <DropdownMenu
                                asButton portal label="More actions" menuClassName="min-w-[12rem]"
                                trigger={<span className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"><MoreVerticalIcon className="h-4 w-4" /></span>}
                            >
                                {answered && (
                                    <DropdownItem onClick={() => void run(() => setFeedbackHidden(r.id, !r.hidden), r.hidden ? 'Unhidden.' : 'Hidden from your page.')}>
                                        {r.hidden ? <><EyeIcon className="h-4 w-4" /> Unhide</> : <><EyeOffIcon className="h-4 w-4" /> Hide</>}
                                    </DropdownItem>
                                )}
                                <DropdownItem onClick={openNote}><EditIcon className="h-4 w-4" /> {r.ownerNote ? 'Edit private note' : 'Add private note'}</DropdownItem>
                                <DropdownSeparator />
                                <DropdownItem onClick={() => setConfirmDelete(true)} destructive><TrashIcon className="h-4 w-4" /> Delete</DropdownItem>
                            </DropdownMenu>
                        </div>
                    )}

                    {mode === 'testimonial' && (
                        <div className="mt-3 space-y-3 rounded-xl border border-border p-3.5">
                            <p className="text-sm font-semibold text-foreground">Show this on your public page</p>
                            <div>
                                <label className="label" htmlFor={`tn-${r.id}`}>Name shown</label>
                                <input id={`tn-${r.id}`} className="input" value={draft.name} maxLength={FEEDBACK_LIMITS.testimonialName} placeholder="A client"
                                    onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setFormError(''); }} aria-invalid={!!checks.nameError} />
                                <p className="mt-1 text-xs text-muted-foreground">First name and last initial is best. Never an email or a phone number.</p>
                                {checks.nameError && <p className="mt-1 text-xs font-medium text-destructive">{checks.nameError}</p>}
                            </div>
                            <div>
                                <label className="label" htmlFor={`tt-${r.id}`}>Quote <span className="font-normal normal-case tracking-normal">(optional)</span></label>
                                <textarea id={`tt-${r.id}`} rows={4} className="input" value={draft.text} maxLength={FEEDBACK_LIMITS.testimonialText + 200} disabled={!r.comment}
                                    placeholder={r.comment ? '' : 'The client did not write a comment: only the stars and the name are shown.'}
                                    onChange={(e) => { setDraft({ ...draft, text: e.target.value }); setFormError(''); }} aria-invalid={!!checks.textError} />
                                <div className="mt-1 flex items-start justify-between gap-3">
                                    <p className="text-xs leading-relaxed text-muted-foreground">It must be part of what {r.clientFirstName || 'the client'} wrote, word for word. You can shorten it, not rewrite it.</p>
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{draft.text.trim().length}/{FEEDBACK_LIMITS.testimonialText}</span>
                                </div>
                                {checks.textError && <p className="mt-1 text-xs font-medium text-destructive">{checks.textError}</p>}
                            </div>
                            {formError && !checks.nameError && !checks.textError && <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>}
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={() => void saveTestimonial()} disabled={busy || !checks.ok}>{busy ? 'Saving…' : look ? 'Save changes' : 'Show on my page'}</button>
                                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => setMode('none')} disabled={busy}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {mode === 'note' && (
                        <div className="mt-3 space-y-3 rounded-xl border border-border p-3.5">
                            <label className="label" htmlFor={`pn-${r.id}`}>Private note <span className="font-normal normal-case tracking-normal">(only you see it)</span></label>
                            <textarea id={`pn-${r.id}`} rows={3} className="input" value={note} maxLength={FEEDBACK_LIMITS.ownerNote} onChange={(e) => setNote(e.target.value)} placeholder="For example: called back on Friday, fixed the gate." />
                            {formError && <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>}
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={() => void saveNote()} disabled={busy}>{busy ? 'Saving…' : 'Save note'}</button>
                                <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => setMode('none')} disabled={busy}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmDialog
                open={confirmDelete}
                title="Delete this feedback?"
                message={<p>{answered ? 'The answer is removed from your list and from your public page. ' : 'The link stops working. '}This cannot be undone.</p>}
                confirmLabel="Delete"
                destructive
                busy={busy}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={async () => {
                    const ok = await run(async () => { await deleteFeedback(r.id); onDeleted(r.id); }, 'Deleted.');
                    if (ok) setConfirmDelete(false);
                }}
            />
        </li>
    );
};

export default FeedbackRow;
