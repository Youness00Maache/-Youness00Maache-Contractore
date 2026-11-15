/**
 * Job page › Selections (Premium): let the client choose the tile, the paint, the fixtures... and keep the choice on the record.
 *  - "New" starts from one of six ready-made ones (Tile, Paint colour, Flooring, Fixtures, Appliances, Countertops) or blank
 *  - the client chooses from their project link ("Copy client link" gives it to you)
 *  - to approve (the client chose), waiting for the client (overdue ones first), changes needed, to order, drafts, ordered, closed
 *  - tap a row for the whole story: the options, what they chose and wrote, the history and the actions that fit
 *    (Approve, Ask for changes, Ask again, Create purchase order, Mark ordered, Cancel order, Close, Reopen, Edit, Delete)
 * Every change needs a connection (it says so); the list is read again when the connection is back.
 * Data: lib/selections (logic in selectionLogic.ts / selectionView.ts, Supabase calls in selectionsApi.ts).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Client, FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { isPlanLimitError } from '../../lib/jobFiles/jobFilesApi.ts';
import {
    approveSelection, askAgain, cancelOrder, closeSelection, deleteSelection, markOrdered, reopenSelection, requestChanges, sendSelection,
    withdrawSelection,
} from '../../lib/selections/selectionsApi.ts';
import { chosenOption, ownerActions, summarizeSelections, type SelectionOwnerAction } from '../../lib/selections/selectionLogic.ts';
import type { JobSelection, SelectionSummary } from '../../lib/selections/selectionTypes.ts';
import {
    ACTION_LABEL, CLIENT_CHOOSES_LINE, SELECTIONS_NEED_CONNECTION, SELECTIONS_PREMIUM_REASON, chipLabel, clientLinkNote, countsParts, decidedLine,
    dueInfo, groupSelections, poNumberOf, selectionMeta, sentNote, statusTone,
} from '../../lib/selections/selectionView.ts';
import { todayYmd } from '../../lib/tasks/taskLogic.ts';
import { copyToClipboard, ensurePortalKey, portalUrl } from '../../utils/clientLinks.ts';
import { cx } from '../commsKit.tsx';
import { ActionMenu, ConfirmDialog } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { PlusIcon, StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { StatusChip } from '../jobFiles/ui.tsx';
import { useJobSelections } from './useJobSelections.ts';
import { useSelectionSuppliers } from './useSelectionSuppliers.ts';
import SelectionDetailModal from './SelectionDetailModal.tsx';
import SelectionEditorModal from './SelectionEditorModal.tsx';
import SelectionPoDialog from './SelectionPoDialog.tsx';
import StoredImage from './StoredImage.tsx';

export interface JobSelectionsPanelProps {
    job: Job;
    /** the job's client (the link they choose from); null = no client on the job */
    client: Client | null;
    userId: string;
    profile: UserProfile | null;
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason?: string) => void;
    /** counts changed (the "2 waiting" next to the tab and in the job header) */
    onSummary?: (jobId: string, summary: SelectionSummary) => void;
    /** open a document of this job (the purchase order made from a selection) */
    onOpenDocument?: (jobId: string, docId: string) => void;
}

const EMPTY: JobSelection[] = [];

const BAR: Record<ReturnType<typeof statusTone>, string> = {
    primary: 'bg-primary', warning: 'bg-warning', success: 'bg-success', danger: 'bg-destructive', muted: 'bg-muted-foreground/30',
};

type Confirm = { action: 'request_changes' | 'ask_again' | 'cancel_order' | 'delete' | 'reopen'; selection: JobSelection };

const CONFIRM: Record<Confirm['action'], { title: string; label: string; destructive?: boolean; message: (s: JobSelection) => React.ReactNode }> = {
    reopen: {
        title: 'Reopen it for your client?',
        label: 'Reopen',
        message: s => <>“{s.title}” goes back to your client to choose from, as if it were new. Their earlier choice stays in the history but no longer stands.</>,
    },
    request_changes: {
        title: 'Ask for changes?',
        label: 'Ask for changes',
        message: s => <>“{s.title}” goes back to you. Change the options, then send it again. The client&apos;s choice stays in the history{s.status === 'approved' ? ', and the approval is undone' : ''}.</>,
    },
    ask_again: {
        title: 'Ask the client again?',
        label: 'Ask again',
        message: s => <>“{s.title}” goes back to your client to choose from. Their earlier choice stays in the history.</>,
    },
    cancel_order: {
        title: 'Cancel the order?',
        label: 'Cancel order',
        message: s => <>“{s.title}” goes back to Approved.{s.poDocumentId ? ' Its purchase order stays under this job: cancel or delete that document yourself if you no longer want it.' : ''}</>,
    },
    delete: {
        title: 'Delete this selection?',
        label: 'Delete',
        destructive: true,
        message: s => <>“{s.title}” is removed with its history and photos{s.status === 'sent' ? ', and your client stops seeing it' : ''}. To keep the record, close it instead.</>,
    },
};

const JobSelectionsPanel: React.FC<JobSelectionsPanelProps> = ({ job, client, userId, profile, plan, isOnline, onUpgrade, onSummary, onOpenDocument }) => {
    const paid = isPaidTier(plan);
    const today = todayYmd();
    const { selections: loaded, error: loadError, ready, reload, upsert, remove } = useJobSelections(job.id, isOnline);
    const selections = Array.isArray(loaded) ? loaded : EMPTY;

    const [editor, setEditor] = useState<{ selection?: JobSelection } | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<Confirm | null>(null);
    const [poFor, setPoFor] = useState<JobSelection | null>(null);
    const [showClosed, setShowClosed] = useState(false);
    const [copied, setCopied] = useState(false);
    const portalKey = useRef<string | null>(client?.portal_key || null);
    const sup = useSelectionSuppliers(userId, !!editor);

    const summary = useMemo(() => summarizeSelections(selections, today), [selections, today]);
    const groups = useMemo(() => groupSelections(selections), [selections]);
    const detail = openId ? selections.find(s => s.id === openId) || null : null;
    const hasClient = !!client;

    useEffect(() => { if (Array.isArray(loaded)) onSummary?.(job.id, summary); }, [loaded, summary, job.id, onSummary]);

    // ------------------------------------------------------------------------------ guards
    const needPremium = (): boolean => {
        if (paid) return true;
        onUpgrade(SELECTIONS_PREMIUM_REASON);
        return false;
    };
    const needOnline = (): boolean => {
        if (isOnline) return true;
        toast.error(NEEDS_CONNECTION);
        return false;
    };
    const fail = (e: unknown, fallback: string) => {
        if (isPlanLimitError(e)) onUpgrade(planLimitMessage(e));
        else toast.error(describeError(e, fallback));
    };

    // ------------------------------------------------------------------------------ the client's link
    const copyLink = async () => {
        if (!client || !needOnline()) return;
        try {
            const key = portalKey.current || await ensurePortalKey(client);
            portalKey.current = key;
            if (await copyToClipboard(portalUrl(key))) {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2500);
            } else {
                toast.error('Copying is blocked by your browser. Open the client page to copy the link.');
            }
        } catch (e) {
            toast.error(describeError(e, 'The link could not be made.'));
        }
    };

    // ------------------------------------------------------------------------------ changes
    const run = async (action: SelectionOwnerAction, s: JobSelection) => {
        if (busyId) return;
        setBusyId(s.id);
        try {
            switch (action) {
                case 'send': upsert(await sendSelection(s, userId)); toast.success(sentNote(hasClient)); break;
                case 'withdraw': upsert(await withdrawSelection(s.id)); toast.success('Taken back to drafts. Your client no longer sees it.'); break;
                case 'approve': upsert(await approveSelection(s.id)); toast.success('Approved. You can create the purchase order now.'); break;
                case 'request_changes': upsert(await requestChanges(s.id)); toast.success('Back with you. Change the options, then send it again.'); break;
                case 'ask_again': upsert(await askAgain(s, userId)); toast.success('Asked again. The earlier choice stays in the history.'); break;
                case 'mark_ordered': upsert(await markOrdered(s.id)); toast.success('Marked ordered.'); break;
                case 'cancel_order': upsert(await cancelOrder(s.id)); toast.success('Back to Approved.'); break;
                case 'close': upsert(await closeSelection(s.id)); toast.success('Closed.'); break;
                case 'reopen': upsert(await reopenSelection(s, userId)); toast.success(sentNote(hasClient)); break;
                default: break;
            }
        } catch (e) {
            fail(e, 'The change could not be saved.');
        } finally {
            setBusyId(null);
        }
    };

    const act = (action: SelectionOwnerAction, s: JobSelection) => {
        if (action === 'edit') { if (needPremium()) { setOpenId(null); setEditor({ selection: s }); } return; }
        if (action === 'open_po') { if (s.poDocumentId) onOpenDocument?.(s.jobId, s.poDocumentId); return; }
        if (!needPremium()) return;
        if (action === 'delete' || action === 'request_changes' || action === 'ask_again' || action === 'cancel_order' || (action === 'reopen' && s.chosenOptionId)) {
            setConfirm({ action, selection: s });
            return;
        }
        if (!needOnline()) return;
        if (action === 'create_po') { setOpenId(null); setPoFor(s); return; }
        void run(action, s);
    };

    const confirmNow = async () => {
        const c = confirm;
        if (!c || !needOnline()) return;
        if (c.action === 'delete') {
            setBusyId(c.selection.id);
            try {
                await deleteSelection(c.selection);
                remove(c.selection.id);
                setOpenId(null);
                setConfirm(null);
                toast.success('Deleted.');
            } catch (e) {
                fail(e, 'It could not be deleted.');
            } finally {
                setBusyId(null);
            }
            return;
        }
        setConfirm(null);
        await run(c.action, c.selection);
    };

    const startNew = () => { if (needPremium() && needOnline()) setEditor({}); };

    // ------------------------------------------------------------------------------ rows
    // a plain function (not a component): a component defined in here would remount every row on each render
    const renderRow = (s: JobSelection) => {
        const tone = statusTone(s.status);
        const due = dueInfo(s, today);
        const late = s.status === 'sent' && due.tone === 'late';
        const choice = chosenOption(s);
        const decided = decidedLine(s);
        const actions = ownerActions(s);
        return (
            <li key={s.id} className={cx('relative flex items-center gap-1 pl-4 pr-1', busyId === s.id && 'opacity-60')}>
                <span aria-hidden className={cx('absolute inset-y-2 left-0 w-[3px] rounded-r', BAR[late ? 'danger' : tone])} />
                <button type="button" onClick={() => setOpenId(s.id)} className="min-w-0 flex-1 py-2.5 pr-1 text-left">
                    <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-sm font-semibold leading-5">{s.title}</span>
                        <StatusChip tone={late ? 'danger' : tone} className="mt-0.5 shrink-0">{late ? due.text : chipLabel(s.status)}</StatusChip>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {selectionMeta(s, today).filter(m => !(late && m === due.text)).map((m, i) => <span key={i}>{m}</span>)}
                    </span>
                    {decided && choice && s.status !== 'sent' && (
                        <span className="mt-1.5 flex items-center gap-2 text-xs text-foreground">
                            <StoredImage path={choice.imagePath} alt="" className="h-9 w-9 shrink-0 rounded-md" fallback={<span aria-hidden>·</span>} />
                            <span className="min-w-0 truncate"><span className="font-semibold">{decided}</span>{s.chosenBy ? <span className="text-muted-foreground"> · {s.chosenBy}</span> : null}</span>
                        </span>
                    )}
                </button>
                <span className="shrink-0">
                    <ActionMenu
                        label={`More for ${s.title}`}
                        items={[
                            { label: 'Open', onSelect: () => setOpenId(s.id) },
                            ...actions.map(a => ({
                                label: ACTION_LABEL(a, s),
                                onSelect: () => act(a, s),
                                destructive: a === 'delete',
                            })),
                        ]}
                    />
                </span>
            </li>
        );
    };

    const section = (title: string, list: JobSelection[], strong = false) => (list.length === 0 ? null : (
        <div key={title}>
            <h3 className="mb-1 flex items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className={strong ? 'text-foreground' : ''}>{title}</span>
                <span className="tabular-nums normal-case tracking-normal">{list.length}</span>
            </h3>
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">{list.map(renderRow)}</ul>
        </div>
    ));

    // ------------------------------------------------------------------------------ render
    if (loaded === undefined) return <div className="skeleton h-40 w-full rounded-2xl" aria-busy="true" />;
    if (loaded === null) {
        return (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Client selections are being switched on for your account. Check back soon.
            </div>
        );
    }
    if (!ready && loadError) {
        return (
            <div className="rounded-2xl border border-border bg-card p-5 text-sm" role="alert">
                <p className="font-semibold">{isOnline ? loadError : SELECTIONS_NEED_CONNECTION}</p>
                <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => { void reload(); }} disabled={!isOnline}>Try again</button>
            </div>
        );
    }
    if (!paid && selections.length === 0) {
        return (
            <section className="rounded-2xl border border-primary/30 bg-card p-5" aria-labelledby="selections-premium">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Premium</p>
                <h3 id="selections-premium" className="mt-1 text-lg font-bold">Let your client choose, and keep it on the record</h3>
                <p className="mt-1 text-sm text-muted-foreground">Show two or three tiles, paint colours or fixtures with photos and prices. Your client picks one from their project link, you see the upgrade or credit against the allowance, and an approved choice becomes a purchase order.</p>
                <button type="button" className="btn btn-primary mt-4" onClick={() => onUpgrade(SELECTIONS_PREMIUM_REASON)}><StarIcon className="h-4 w-4" /> Upgrade to Premium</button>
            </section>
        );
    }

    const parts = countsParts(summary);

    return (
        <section aria-labelledby="selections-heading" className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="selections-heading" className="text-base font-bold leading-tight">Client selections</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {parts.length === 0 ? 'Nothing sent yet.' : parts.map((p, i) => (
                                <React.Fragment key={p.text}>
                                    {i > 0 && ' · '}
                                    <span className={p.tone === 'strong' ? 'font-semibold text-foreground' : p.tone === 'late' ? 'text-destructive' : ''}>{p.text}</span>
                                </React.Fragment>
                            ))}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <HelpButton topic="job-selections" />
                        <button type="button" className="btn btn-primary h-10 px-3.5" onClick={startNew}><PlusIcon className="h-4 w-4" /> New</button>
                    </div>
                </div>
                <div className={cx('mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/70 pt-3 text-sm', !hasClient && 'text-foreground')}>
                    <p className={cx('min-w-0', hasClient ? 'text-muted-foreground' : 'font-medium')}>{hasClient ? CLIENT_CHOOSES_LINE : clientLinkNote(false)}</p>
                    {hasClient && (
                        <button type="button" className={cx('btn btn-outline btn-sm min-h-[40px] shrink-0', copied && 'text-success')} onClick={() => { void copyLink(); }}>
                            {copied ? 'Link copied' : 'Copy client link'}
                        </button>
                    )}
                </div>
            </div>

            {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm" role="status">{SELECTIONS_NEED_CONNECTION}</p>}
            {!paid && <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">Client selections are part of Premium. You can still read these; <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onUpgrade(SELECTIONS_PREMIUM_REASON)}>upgrade</button> to send and change them.</p>}
            {loadError && <p className="text-sm text-destructive" role="alert">{loadError} <button type="button" className="underline" onClick={() => { void reload(); }}>Try again</button></p>}

            {selections.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Let your client choose the tile, the paint colour or the fixtures. Add two or three options with a photo and a price; they pick one, and you see what it adds or saves against the allowance. Start from a ready-made one with <span className="font-semibold text-foreground">New</span>.
                </p>
            ) : (
                <div className="space-y-4">
                    {section('To approve', groups.toApprove, true)}
                    {section('Waiting for client', groups.waiting, true)}
                    {section('Changes needed', groups.changes)}
                    {section('Approved: to order', groups.toOrder)}
                    {section('Drafts', groups.drafts)}
                    {section('Ordered', groups.ordered)}
                    {groups.closed.length > 0 && (
                        <div>
                            <button type="button" className="mb-1 flex w-full items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => setShowClosed(v => !v)} aria-expanded={showClosed}>
                                <span>Closed <span className="normal-case tracking-normal">· {showClosed ? 'hide' : 'show'}</span></span>
                                <span className="tabular-nums normal-case tracking-normal">{groups.closed.length}</span>
                            </button>
                            {showClosed && <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">{groups.closed.map(renderRow)}</ul>}
                        </div>
                    )}
                </div>
            )}

            {editor && (
                <SelectionEditorModal
                    selection={editor.selection}
                    userId={userId}
                    jobId={job.id}
                    isOnline={isOnline}
                    hasClient={hasClient}
                    suppliers={sup.available ? sup.suppliers : null}
                    onClose={() => setEditor(null)}
                    onSaved={(saved, sent) => {
                        upsert(saved);
                        toast.success(sent ? sentNote(hasClient) : 'Saved.');
                    }}
                    onUpgrade={onUpgrade}
                />
            )}

            {detail && !editor && !poFor && (
                <SelectionDetailModal
                    key={detail.id}
                    selection={detail}
                    busy={busyId === detail.id}
                    onClose={() => setOpenId(null)}
                    onAction={act}
                />
            )}

            {poFor && (
                <SelectionPoDialog
                    selection={poFor}
                    job={job}
                    clientId={client?.id ?? null}
                    userId={userId}
                    profile={profile}
                    isOnline={isOnline}
                    onClose={() => setPoFor(null)}
                    onDone={(saved: JobSelection, doc: FormDataType) => {
                        upsert(saved);
                        setPoFor(null);
                        setOpenId(saved.id);
                        toast.success(`Purchase order ${poNumberOf(doc)} made as a Draft. The selection is ordered.`);
                    }}
                    onLinked={(saved: JobSelection) => {
                        upsert(saved);
                        setPoFor(null);
                        setOpenId(saved.id);
                        toast.success('Linked. The selection is ordered.');
                    }}
                />
            )}

            <ConfirmDialog
                open={!!confirm}
                title={confirm ? CONFIRM[confirm.action].title : ''}
                message={confirm ? CONFIRM[confirm.action].message(confirm.selection) : undefined}
                confirmLabel={confirm ? CONFIRM[confirm.action].label : 'Confirm'}
                destructive={!!confirm && !!CONFIRM[confirm.action].destructive}
                busy={!!confirm && busyId === confirm.selection.id}
                onConfirm={() => { void confirmNow(); }}
                onCancel={() => setConfirm(null)}
            />
        </section>
    );
};

export default JobSelectionsPanel;
