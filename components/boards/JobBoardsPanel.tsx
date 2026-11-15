/**
 * Job page › Boards (Premium): mood boards for a job: collect pictures, links, notes and colours (a kitchen, a bathroom,
 * the exterior) and, when you are ready, show a board to the client. A board is private until you switch on "Share with
 * client"; then the client sees it, read-only, on their project link (titles and captions are visible, your board notes
 * are not). Open a board to edit it, preview it exactly like the client sees it, or share it.
 * Every change needs a connection (it says so). Data: lib/boards (logic in boardLogic.ts / boardView.ts, calls in boardsApi.ts).
 */
import React, { useMemo, useState } from 'react';
import type { Client, Job } from '../../types.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { isPlanLimitError } from '../../lib/jobFiles/jobFilesApi.ts';
import { createBoard, deleteBoard } from '../../lib/boards/boardsApi.ts';
import { BOARD_LIMITS, type JobBoard } from '../../lib/boards/boardTypes.ts';
import { BOARDS_NEED_CONNECTION, boardSummary } from '../../lib/boards/boardView.ts';
import { SELECTIONS_PREMIUM_REASON } from '../../lib/selections/selectionView.ts';
import { shortDate } from '../../lib/jobFiles/jobFileView.ts';
import { cx } from '../commsKit.tsx';
import { ActionMenu, ConfirmDialog, Field, Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { PlusIcon, StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { StatusChip } from '../jobFiles/ui.tsx';
import StoredImage from '../selections/StoredImage.tsx';
import { useJobBoards } from './useJobBoards.ts';
import BoardEditor from './BoardEditor.tsx';

export interface JobBoardsPanelProps {
    job: Job;
    client: Client | null;
    userId: string;
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason?: string) => void;
}

const EMPTY: JobBoard[] = [];

/** A strip of the first pictures of a board (a few thumbnails, like a contact sheet). */
const Strip: React.FC<{ board: JobBoard }> = ({ board }) => {
    const pics = board.items.filter(i => i.kind === 'image' && (i.imagePath || i.url)).slice(0, 4);
    const swatches = board.items.filter(i => i.kind === 'color' && i.color).slice(0, 4 - Math.min(pics.length, 4));
    if (!pics.length && !swatches.length) return null;
    return (
        <span className="mt-2 flex gap-1" aria-hidden>
            {pics.map(p => (p.imagePath
                ? <StoredImage key={p.id} kind="board" path={p.imagePath} alt="" className="h-12 w-12 rounded-md" />
                : <img key={p.id} src={p.url!} alt="" loading="lazy" className="h-12 w-12 rounded-md bg-muted object-cover" />))}
            {swatches.map(c => <span key={c.id} className="h-12 w-12 rounded-md ring-1 ring-border" style={{ backgroundColor: c.color! }} />)}
        </span>
    );
};

const JobBoardsPanel: React.FC<JobBoardsPanelProps> = ({ job, client, userId, plan, isOnline, onUpgrade }) => {
    const paid = isPaidTier(plan);
    const { boards: loaded, error: loadError, ready, reload, upsert, remove } = useJobBoards(job.id, isOnline);
    const boards = Array.isArray(loaded) ? loaded : EMPTY;
    const [openId, setOpenId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [createError, setCreateError] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<JobBoard | null>(null);
    const open = openId ? boards.find(b => b.id === openId) || null : null;
    const hasClient = !!client;
    const sharedCount = useMemo(() => boards.filter(b => b.sharedInPortal).length, [boards]);

    const needPremium = (): boolean => { if (paid) return true; onUpgrade(SELECTIONS_PREMIUM_REASON); return false; };
    const needOnline = (): boolean => { if (isOnline) return true; toast.error(NEEDS_CONNECTION); return false; };
    const fail = (e: unknown, fallback: string) => {
        if (isPlanLimitError(e)) onUpgrade(planLimitMessage(e));
        else toast.error(describeError(e, fallback));
    };

    const startNew = () => { if (needPremium() && needOnline()) { setNewTitle(''); setCreateError(''); setCreating(true); } };

    const create = async () => {
        if (busy || !needOnline()) return;
        const t = newTitle.trim();
        if (!t) { setCreateError('Give the board a name.'); return; }
        setBusy(true);
        try {
            const saved = await createBoard(userId, job.id, { title: t });
            upsert(saved);
            setCreating(false);
            setOpenId(saved.id);
        } catch (e) {
            if (isPlanLimitError(e)) { setCreating(false); onUpgrade(planLimitMessage(e)); }
            else setCreateError(describeError(e, 'The board could not be made.'));
        } finally {
            setBusy(false);
        }
    };

    const confirmRemove = async () => {
        const b = confirmDelete;
        if (!b || !needOnline()) return;
        setBusy(true);
        try {
            await deleteBoard(b);
            remove(b.id);
            if (openId === b.id) setOpenId(null);
            setConfirmDelete(null);
            toast.success('Deleted.');
        } catch (e) {
            fail(e, 'It could not be deleted.');
        } finally {
            setBusy(false);
        }
    };

    // ------------------------------------------------------------------------------ render
    if (loaded === undefined) return <div className="skeleton h-40 w-full rounded-2xl" aria-busy="true" />;
    if (loaded === null) {
        return (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Mood boards are being switched on for your account. Check back soon.
            </div>
        );
    }
    if (!ready && loadError) {
        return (
            <div className="rounded-2xl border border-border bg-card p-5 text-sm" role="alert">
                <p className="font-semibold">{isOnline ? loadError : BOARDS_NEED_CONNECTION}</p>
                <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => { void reload(); }} disabled={!isOnline}>Try again</button>
            </div>
        );
    }
    if (!paid && boards.length === 0) {
        return (
            <section className="rounded-2xl border border-primary/30 bg-card p-5" aria-labelledby="boards-premium">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Premium</p>
                <h3 id="boards-premium" className="mt-1 text-lg font-bold">Pin the ideas, then show them to your client</h3>
                <p className="mt-1 text-sm text-muted-foreground">Collect pictures, links, colours and notes for a room and keep them on the job. Share a board and your client sees it, read-only, on their project link.</p>
                <button type="button" className="btn btn-primary mt-4" onClick={() => onUpgrade(SELECTIONS_PREMIUM_REASON)}><StarIcon className="h-4 w-4" /> Upgrade to Premium</button>
            </section>
        );
    }

    if (open) {
        return (
            <BoardEditor
                key={open.id}
                board={open}
                userId={userId}
                jobId={job.id}
                isOnline={isOnline}
                paid={paid}
                hasClient={hasClient}
                onBack={() => setOpenId(null)}
                onSaved={upsert}
                onUpgrade={onUpgrade}
            />
        );
    }

    return (
        <section aria-labelledby="boards-heading" className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="boards-heading" className="text-base font-bold leading-tight">Mood boards</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {boards.length === 0 ? 'No boards yet.' : `${boards.length} ${boards.length === 1 ? 'board' : 'boards'}${sharedCount ? ` · ${sharedCount} shared with the client` : ' · none shared'}`}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <HelpButton topic="job-boards" />
                        <button type="button" className="btn btn-primary h-10 px-3.5" onClick={startNew}><PlusIcon className="h-4 w-4" /> New board</button>
                    </div>
                </div>
            </div>

            {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm" role="status">{BOARDS_NEED_CONNECTION}</p>}
            {!paid && <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">Mood boards are part of Premium. You can still read these; <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onUpgrade(SELECTIONS_PREMIUM_REASON)}>upgrade</button> to change them.</p>}
            {loadError && <p className="text-sm text-destructive" role="alert">{loadError} <button type="button" className="underline" onClick={() => { void reload(); }}>Try again</button></p>}

            {boards.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Pin the pictures, links, colours and notes for a room in one place, then show the board to your client. Start with <span className="font-semibold text-foreground">New board</span>.
                </p>
            ) : (
                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                    {boards.map(b => (
                        <li key={b.id} className="relative flex items-center gap-1 pl-4 pr-1">
                            <span aria-hidden className={cx('absolute inset-y-2 left-0 w-[3px] rounded-r', b.sharedInPortal ? 'bg-success' : 'bg-muted-foreground/30')} />
                            <button type="button" onClick={() => setOpenId(b.id)} className="min-w-0 flex-1 py-2.5 pr-1 text-left">
                                <span className="flex items-start justify-between gap-2">
                                    <span className="min-w-0 text-sm font-semibold leading-5">{b.title}</span>
                                    <StatusChip tone={b.sharedInPortal ? 'success' : 'muted'} className="mt-0.5 shrink-0">{b.sharedInPortal ? 'Shared' : 'Private'}</StatusChip>
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">{boardSummary(b)}{b.updatedAt ? ` · ${shortDate(b.updatedAt)}` : ''}</span>
                                <Strip board={b} />
                            </button>
                            <span className="shrink-0">
                                <ActionMenu
                                    label={`More for ${b.title}`}
                                    items={[
                                        { label: 'Open', onSelect: () => setOpenId(b.id) },
                                        { label: 'Delete', destructive: true, onSelect: () => { if (needPremium()) setConfirmDelete(b); } },
                                    ]}
                                />
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {boards.length >= BOARD_LIMITS.perJob && <p className="text-xs text-muted-foreground">A job holds up to {BOARD_LIMITS.perJob} boards.</p>}

            <Modal
                open={creating}
                onClose={() => { if (!busy) setCreating(false); }}
                busy={busy}
                size="sm"
                title="New mood board"
                footer={(
                    <>
                        <button type="button" className="btn btn-outline" onClick={() => setCreating(false)} disabled={busy}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={() => { void create(); }} disabled={busy}>{busy ? 'Making it…' : 'Make the board'}</button>
                    </>
                )}
            >
                <form onSubmit={e => { e.preventDefault(); void create(); }}>
                    <Field label="Board name" htmlFor="nb-title" error={createError} hint="e.g. Kitchen ideas. It stays private until you share it.">
                        <input id="nb-title" className="input" value={newTitle} onChange={e => { setNewTitle(e.target.value); setCreateError(''); }} maxLength={BOARD_LIMITS.title} autoFocus disabled={busy} />
                    </Field>
                </form>
            </Modal>

            <ConfirmDialog
                open={!!confirmDelete}
                title="Delete this board?"
                message={confirmDelete ? <>“{confirmDelete.title}” and its pictures are removed{confirmDelete.sharedInPortal ? ', and your client stops seeing it' : ''}. This cannot be undone.</> : undefined}
                confirmLabel="Delete"
                destructive
                busy={busy}
                onConfirm={() => { void confirmRemove(); }}
                onCancel={() => setConfirmDelete(null)}
            />
        </section>
    );
};

export default JobBoardsPanel;
