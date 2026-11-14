/**
 * Papers (/papers, Premium): insurance certificates, licenses, permits, bonds and W-9 with their expiry dates.
 *  - the list is an expiry timeline: most urgent first, the date block coloured by how close it is
 *  - reminders 30 / 7 / 1 days before expiry (bell + an email to yourself from your Gmail, see the reminders function)
 *  - "Send": emails the file to a client or GC from your Gmail
 *  - "Lien waiver" (every plan) opens the waiver window for any job
 * Files live in the private document-assets bucket. Everything here needs a connection.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Client, FormData as FormDataType, Job, UserProfile } from '../../types.ts';
import { isPaidTier, normalizeTier } from '../../lib/plans.ts';
import {
    PAPER_KINDS, PAPER_REMINDER_OFFSETS, blankPaper, defaultPaperTitle, expiryPhrase, expiryState, nextPaperStep, paperFileProblem, paperKindShort,
    paperProblems, papersSummary, sendPaperEmail, sortPapers, type CompanyPaper, type ExpiryState, type PaperKind,
} from '../../lib/papers.ts';
import { deletePaper, listPapers, markPaperSent, paperFileBase64, paperFileUrl, removePaperFile, savePaper, uploadPaperFile } from './papersApi.ts';
import { ActionMenu, ConfirmDialog, EmptyState, Field, InlineError, Modal, PageHeader } from '../viewKit.tsx';
import { NumberInput } from '../forms/Fields.tsx';
import { toast } from '../Toast.tsx';
import { describeError } from '../../lib/account.ts';
import { todayYMD, formatYMD } from '../../utils/localDates.ts';
import { PaperclipIcon, PlusIcon, ShieldCheckIcon, StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';

const LienWaiverModal = React.lazy(() => import('./LienWaiverModal.tsx'));

export interface PapersViewProps {
    userId: string;
    profile: UserProfile;
    plan: string;
    jobs: Array<Job & { clientId?: string | null }>;
    clients: Client[];
    isOnline: boolean;
    onBack: () => void;
    onUpgrade: (reason?: string) => void;
    onOpenJob: (jobId: string) => void;
    onEmailSent?: () => void;
    /** a lien waiver was saved on a job: open it */
    onWaiverCreated: (form: FormDataType) => void;
}

const newId = (): string => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

const STATE_STYLE: Record<ExpiryState, { block: string; text: string }> = {
    expired: { block: 'border-destructive/50 bg-destructive/10 text-destructive', text: 'text-destructive' },
    urgent: { block: 'border-warning/60 bg-warning/15 text-warning', text: 'text-warning' },
    soon: { block: 'border-warning/40 bg-warning/5 text-foreground', text: 'text-warning' },
    ok: { block: 'border-success/40 bg-success/5 text-foreground', text: 'text-success' },
    none: { block: 'border-border bg-muted/40 text-muted-foreground', text: 'text-muted-foreground' },
};

/** The calendar block at the start of a row: month / day / year of the expiry date. */
const DateBlock: React.FC<{ ymd: string; state: ExpiryState }> = ({ ymd, state }) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
    const style = STATE_STYLE[state].block;
    if (!m) return <span className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border text-[10px] font-semibold uppercase leading-3 ${style}`}>No<br />date</span>;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return (
        <span className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border leading-none ${style}`} aria-hidden>
            <span className="text-[10px] font-semibold uppercase tracking-wide">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
            <span className="text-lg font-bold tabular-nums">{d.getDate()}</span>
            <span className="text-[10px] tabular-nums opacity-80">{d.getFullYear()}</span>
        </span>
    );
};

type KindFilter = 'all' | PaperKind;

const PapersView: React.FC<PapersViewProps> = ({ userId, profile, plan, jobs, clients, isOnline, onBack, onUpgrade, onOpenJob, onEmailSent, onWaiverCreated }) => {
    const paid = isPaidTier(normalizeTier(plan));
    const [papers, setPapers] = useState<CompanyPaper[] | null | undefined>(undefined);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<KindFilter>('all');
    const [editing, setEditing] = useState<{ paper: CompanyPaper; mode: 'create' | 'edit' | 'renew' } | null>(null);
    const [sending, setSending] = useState<CompanyPaper | null>(null);
    const [deleting, setDeleting] = useState<CompanyPaper | null>(null);
    const [busy, setBusy] = useState(false);
    const [waiver, setWaiver] = useState(false);
    const today = todayYMD();

    const load = useCallback(async () => {
        setError('');
        try { setPapers(await listPapers()); } catch (e) { setError(describeError(e, 'Your papers could not be loaded.')); setPapers(p => p ?? []); }
    }, []);
    useEffect(() => { if (isOnline) void load(); else setPapers(p => p ?? []); }, [load, isOnline]);

    const list = papers || [];
    const counts = useMemo(() => {
        const c: Record<string, number> = { all: list.length };
        for (const p of list) c[p.kind] = (c[p.kind] || 0) + 1;
        return c;
    }, [list]);
    const shown = useMemo(() => sortPapers(filter === 'all' ? list : list.filter(p => p.kind === filter), today), [list, filter, today]);
    const summary = useMemo(() => papersSummary(list, today), [list, today]);
    const jobName = (id: string | null) => (id ? jobs.find(j => j.id === id)?.name || '' : '');

    const startAdd = (kind: PaperKind = 'coi') => {
        if (!paid) { onUpgrade('The papers vault (insurance, licenses, permits with expiry reminders) is part of Premium.'); return; }
        if (!isOnline) { toast.error("You're offline, this needs a connection."); return; }
        setEditing({ paper: blankPaper(newId(), kind), mode: 'create' });
    };

    const openFile = async (p: CompanyPaper) => {
        if (!p.filePath) return;
        // open the tab first (pop-up blockers), then point it at the signed link
        const w = window.open('', '_blank', 'noopener');
        try {
            const url = await paperFileUrl(p.filePath);
            if (w) w.location.href = url; else window.location.assign(url);
        } catch (e) {
            w?.close();
            toast.error(describeError(e, 'The file could not be opened.'));
        }
    };

    const remove = async (p: CompanyPaper) => {
        setBusy(true);
        try {
            await deletePaper(p);
            setPapers(prev => (prev || []).filter(x => x.id !== p.id));
            toast.success('Deleted.');
        } catch (e) {
            toast.error(describeError(e, 'Could not delete.'));
        } finally {
            setBusy(false);
            setDeleting(null);
        }
    };

    const header = (
        <PageHeader
            title="Papers"
            subtitle="Insurance, licenses, permits and bonds, with reminders before they expire."
            onBack={onBack}
            actions={
                <>
                    <HelpButton topic="papers" />
                    <button type="button" className="btn btn-outline h-10" onClick={() => setWaiver(true)} disabled={!jobs.length}>Lien waiver</button>
                    <button type="button" className="btn btn-primary h-10" onClick={() => startAdd()}><PlusIcon className="h-4 w-4" /> Add paper</button>
                </>
            }
        />
    );

    const waiverModal = waiver && (
        <React.Suspense fallback={null}>
            <LienWaiverModal userId={userId} profile={profile} jobs={jobs} clients={clients} isOnline={isOnline}
                onClose={() => setWaiver(false)} onCreated={(form) => { setWaiver(false); toast.success('Lien waiver saved on the job.'); onWaiverCreated(form); }} />
        </React.Suspense>
    );

    if (papers === null) {
        return (
            <div className="page">
                {header}
                <EmptyState icon={<ShieldCheckIcon />} title="The papers vault is on its way" description="It is being switched on for your account. Lien waivers already work: click Lien waiver above." />
                {waiverModal}
            </div>
        );
    }

    return (
        <div className="page">
            {header}
            {!isOnline && <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">You're offline. Papers need a connection.</p>}
            {error && <div className="mb-4"><InlineError onRetry={() => { void load(); }}>{error}</InlineError></div>}

            {!paid && (
                <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm">
                        <span className="font-semibold">Keep your COI, licenses, permits and bonds in one place.</span>
                        <span className="block text-muted-foreground">Premium reminds you 30, 7 and 1 days before each one expires and sends a certificate to a client or GC in two taps. Lien waivers stay free.</span>
                    </p>
                    <button type="button" className="btn btn-primary shrink-0" onClick={() => onUpgrade('The papers vault is part of Premium.')}><StarIcon className="h-4 w-4" /> Upgrade</button>
                </div>
            )}

            {papers === undefined ? (
                <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="skeleton h-[74px] w-full rounded-xl" />)}</div>
            ) : list.length === 0 ? (
                paid ? (
                    <div className="rounded-2xl border border-dashed border-border p-5">
                        <p className="font-semibold">Start with the papers clients ask for</p>
                        <p className="mt-1 text-sm text-muted-foreground">Add one, upload the PDF or a photo, and set its expiry date.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {PAPER_KINDS.filter(k => k.value !== 'other').map(k => (
                                <button key={k.value} type="button" className="btn btn-outline btn-sm" onClick={() => startAdd(k.value)}>{k.label}</button>
                            ))}
                        </div>
                    </div>
                ) : null
            ) : (
                <>
                    {/* where things stand */}
                    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        {summary.expired > 0 && <span className="font-semibold text-destructive">{summary.expired} expired</span>}
                        {summary.expiring > 0 && <span className="font-semibold text-warning">{summary.expiring} expiring within 30 days</span>}
                        <span className="text-muted-foreground">{summary.valid} valid{summary.noDate ? ` · ${summary.noDate} without a date` : ''}</span>
                    </div>
                    {Object.keys(counts).length > 2 && (
                        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="radiogroup" aria-label="Show">
                            {(['all', ...PAPER_KINDS.map(k => k.value)] as KindFilter[]).filter(k => k === 'all' || counts[k]).map(k => (
                                <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}
                                    className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition ${filter === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>
                                    {k === 'all' ? 'All' : paperKindShort(k)} <span className="ml-1 opacity-70">{counts[k]}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
                        {shown.map(p => {
                            const { state, days } = expiryState(p.expiresOn, today);
                            const next = p.remind ? nextPaperStep({ expiresOn: p.expiresOn, offsets: p.reminderOffsets, today }) : null;
                            const job = jobName(p.jobId);
                            return (
                                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                                    <DateBlock ymd={p.expiresOn} state={state} />
                                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => paid && setEditing({ paper: p, mode: 'edit' })}>
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className="truncate font-semibold">{p.title}</span>
                                            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{paperKindShort(p.kind)}</span>
                                            {p.filePath && <PaperclipIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="File attached" />}
                                        </span>
                                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                            {[p.number && `No. ${p.number}`, p.issuer, job && `Job: ${job}`, p.inspectionOn && `Inspection ${formatYMD(p.inspectionOn, { month: 'short', day: 'numeric' })}`].filter(Boolean).join(' · ') || '—'}
                                        </span>
                                        <span className={`mt-0.5 block text-xs font-semibold ${STATE_STYLE[state].text}`}>
                                            {state === 'none' ? (p.kind === 'w9' ? 'No expiry' : 'Add the expiry date') : expiryPhrase(days)}
                                            {next && state !== 'expired' && <span className="font-normal text-muted-foreground"> · reminder {formatYMD(next.date, { month: 'short', day: 'numeric' })}</span>}
                                            {p.lastSentAt && <span className="font-normal text-muted-foreground"> · sent to {p.lastSentTo || 'a client'} {formatYMD(p.lastSentAt.slice(0, 10), { month: 'short', day: 'numeric' })}</span>}
                                        </span>
                                    </button>
                                    {p.filePath && paid && (
                                        <button type="button" className="btn btn-outline btn-sm hidden shrink-0 sm:inline-flex" onClick={() => setSending(p)} disabled={!isOnline}>Send</button>
                                    )}
                                    <ActionMenu
                                        label={`More for ${p.title}`}
                                        items={[
                                            p.filePath ? { label: 'Open file', onSelect: () => { void openFile(p); } } : null,
                                            p.filePath && paid ? { label: 'Send by email', onSelect: () => setSending(p) } : null,
                                            paid ? { label: 'Edit', onSelect: () => setEditing({ paper: p, mode: 'edit' }) } : null,
                                            paid && p.kind !== 'w9' ? { label: 'Renew (new date and file)', onSelect: () => setEditing({ paper: { ...p, issuedOn: '', expiresOn: '' }, mode: 'renew' }) } : null,
                                            job && p.jobId ? { label: 'Open job', onSelect: () => onOpenJob(p.jobId as string) } : null,
                                            { label: 'Delete', onSelect: () => setDeleting(p), destructive: true },
                                        ]}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}

            {editing && (
                <PaperEditor
                    key={editing.paper.id + editing.mode}
                    userId={userId}
                    paper={editing.paper}
                    mode={editing.mode}
                    jobs={jobs}
                    onClose={() => setEditing(null)}
                    onSaved={(saved) => {
                        setPapers(prev => {
                            const l = prev || [];
                            return l.some(x => x.id === saved.id) ? l.map(x => (x.id === saved.id ? saved : x)) : [...l, saved];
                        });
                        setEditing(null);
                        toast.success(editing.mode === 'renew' ? 'Renewed. Reminders restart from the new date.' : 'Saved.');
                    }}
                    onUpgrade={onUpgrade}
                />
            )}
            {sending && (
                <SendPaperModal paper={sending} profile={profile} clients={clients} jobs={jobs} onClose={() => setSending(null)}
                    onSent={(to) => { void markPaperSent(sending.id, to); setPapers(prev => (prev || []).map(x => (x.id === sending.id ? { ...x, lastSentAt: new Date().toISOString(), lastSentTo: to } : x))); onEmailSent?.(); setSending(null); }} />
            )}
            <ConfirmDialog
                open={!!deleting}
                title="Delete this paper?"
                message="The paper and its file are removed. Reminders about it stop."
                confirmLabel="Delete"
                destructive
                busy={busy}
                onConfirm={() => { if (deleting) void remove(deleting); }}
                onCancel={() => setDeleting(null)}
            />
            {waiverModal}
        </div>
    );
};

// ------------------------------------------------------------------------------------------------
// Add / edit / renew
// ------------------------------------------------------------------------------------------------
const PaperEditor: React.FC<{
    userId: string;
    paper: CompanyPaper;
    mode: 'create' | 'edit' | 'renew';
    jobs: Array<Job & { clientId?: string | null }>;
    onClose: () => void;
    onSaved: (p: CompanyPaper) => void;
    onUpgrade: (reason?: string) => void;
}> = ({ userId, paper, mode, jobs, onClose, onSaved, onUpgrade }) => {
    const [v, setV] = useState<CompanyPaper>(paper);
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const set = <K extends keyof CompanyPaper>(k: K, val: CompanyPaper[K]) => setV(cur => ({ ...cur, [k]: val }));
    const titleTouched = useRef(mode !== 'create');

    const pickKind = (kind: PaperKind) => setV(cur => ({
        ...cur, kind,
        title: titleTouched.current ? cur.title : defaultPaperTitle(kind),
        showInPortal: ['coi', 'license', 'bond'].includes(kind) ? cur.showInPortal || kind !== 'bond' : false,
        remind: kind === 'w9' ? false : cur.remind,
    }));

    const toggleOffset = (o: number) => setV(cur => {
        const has = cur.reminderOffsets.includes(o);
        const next = has ? cur.reminderOffsets.filter(x => x !== o) : [...cur.reminderOffsets, o];
        return { ...cur, reminderOffsets: next.sort((a, b) => b - a) };
    });

    const save = async () => {
        const problems = paperProblems(v);
        if (mode === 'renew' && !v.expiresOn) problems.unshift('Add the new expiry date.');
        if (problems.length) { setError(problems[0]); return; }
        setBusy(true);
        setError('');
        let uploaded: Awaited<ReturnType<typeof uploadPaperFile>> | null = null;
        try {
            if (file) uploaded = await uploadPaperFile(userId, v.id, file);
            const next = uploaded ? { ...v, ...uploaded } : v;
            const saved = await savePaper(next, userId, mode === 'create' ? 'create' : 'edit');
            // the replaced file is no longer needed
            if (uploaded && paper.filePath && paper.filePath !== saved.filePath) void removePaperFile(paper.filePath);
            onSaved(saved);
        } catch (e) {
            if (uploaded) void removePaperFile(uploaded.filePath);
            const msg = describeError(e, 'Could not save.');
            if (/PLAN_LIMIT|part of Premium/i.test(`${(e as any)?.message || ''} ${msg}`)) { onClose(); onUpgrade(msg.replace(/^PLAN_LIMIT:\s*/, '')); return; }
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    const isPermit = v.kind === 'permit';
    const hasCoverage = v.kind === 'coi' || v.kind === 'bond';
    const canShowInPortal = ['coi', 'license', 'bond'].includes(v.kind);

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="lg"
            title={mode === 'create' ? 'Add paper' : mode === 'renew' ? `Renew: ${paper.title}` : paper.title}
            description={mode === 'renew' ? 'Type the new dates and upload the new copy. Reminders start again from the new expiry date.' : undefined}
            footer={
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => { void save(); }} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
                </>
            }
        >
            <div className="space-y-4">
                {mode === 'create' && (
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind">
                        {PAPER_KINDS.map(k => (
                            <button key={k.value} type="button" role="radio" aria-checked={v.kind === k.value} onClick={() => pickKind(k.value)} title={k.hint}
                                className={`h-9 rounded-full border px-3 text-sm font-medium transition ${v.kind === k.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                                {k.short}
                            </button>
                        ))}
                    </div>
                )}
                <Field label="Name" htmlFor="paper-title">
                    <input id="paper-title" className="input" value={v.title} onChange={(e) => { titleTouched.current = true; set('title', e.target.value); }} maxLength={200} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={isPermit ? 'Permit number' : v.kind === 'w9' ? 'TIN / EIN (optional)' : 'Number'} htmlFor="paper-number">
                        <input id="paper-number" className="input" value={v.number} onChange={(e) => set('number', e.target.value)} maxLength={120} />
                    </Field>
                    <Field label={isPermit ? 'Issued by (city / county)' : v.kind === 'coi' ? 'Insurer' : 'Issued by'} htmlFor="paper-issuer">
                        <input id="paper-issuer" className="input" value={v.issuer} onChange={(e) => set('issuer', e.target.value)} maxLength={200} />
                    </Field>
                    <Field label="Issued" htmlFor="paper-issued">
                        <input id="paper-issued" type="date" className="input" value={v.issuedOn} onChange={(e) => set('issuedOn', e.target.value)} />
                    </Field>
                    <Field label="Expires" htmlFor="paper-expires">
                        <input id="paper-expires" type="date" className="input" value={v.expiresOn} onChange={(e) => set('expiresOn', e.target.value)} />
                    </Field>
                    {hasCoverage && (
                        <Field label={v.kind === 'coi' ? 'Coverage (per occurrence)' : 'Bond amount'} htmlFor="paper-coverage">
                            <NumberInput id="paper-coverage" value={v.coverageAmount ?? ''} onValueChange={(n) => set('coverageAmount', n)} decimals={0} prefix="$" placeholder="1,000,000" />
                        </Field>
                    )}
                    {(isPermit || v.kind === 'other' || v.jobId) && (
                        <Field label="Job" htmlFor="paper-job">
                            <select id="paper-job" className="input" value={v.jobId || ''} onChange={(e) => set('jobId', e.target.value || null)}>
                                <option value="">No job</option>
                                {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                            </select>
                        </Field>
                    )}
                    {isPermit && (
                        <Field label="Next inspection" htmlFor="paper-inspection">
                            <input id="paper-inspection" type="date" className="input" value={v.inspectionOn} onChange={(e) => set('inspectionOn', e.target.value)} />
                        </Field>
                    )}
                </div>

                <div>
                    <span className="label">File</span>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                            <PaperclipIcon className="h-4 w-4" /> {file || v.filePath ? 'Replace file' : 'Upload PDF or photo'}
                        </button>
                        <span className="min-w-0 truncate text-sm text-muted-foreground">{file ? file.name : v.fileName || (v.filePath ? 'Attached' : 'No file yet')}</span>
                    </div>
                    <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            const problem = paperFileProblem(f);
                            if (problem) { setError(problem); return; }
                            setError('');
                            setFile(f);
                        }} />
                </div>

                {v.kind !== 'w9' && (
                    <div className="rounded-xl border border-border p-3">
                        <label className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium">Remind me before it expires</span>
                            <input type="checkbox" className="h-4 w-4" checked={v.remind} onChange={(e) => set('remind', e.target.checked)} />
                        </label>
                        {v.remind && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                                {[60, ...PAPER_REMINDER_OFFSETS, 14].sort((a, b) => b - a).map(o => (
                                    <button key={o} type="button" onClick={() => toggleOffset(o)} aria-pressed={v.reminderOffsets.includes(o)}
                                        className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${v.reminderOffsets.includes(o) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                                        {o === 1 ? '1 day' : `${o} days`}
                                    </button>
                                ))}
                                <span className="text-xs text-muted-foreground">before · in the bell and by email to you</span>
                            </div>
                        )}
                    </div>
                )}
                {canShowInPortal && (
                    <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={v.showInPortal} onChange={(e) => set('showInPortal', e.target.checked)} />
                        <span>Show in client portal <span className="block text-xs text-muted-foreground">Clients see “Licensed & insured” with the name, number and expiry date (not the file).</span></span>
                    </label>
                )}
                <Field label="Notes" htmlFor="paper-notes">
                    <textarea id="paper-notes" className="input min-h-[64px]" value={v.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} />
                </Field>
                {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            </div>
        </Modal>
    );
};

// ------------------------------------------------------------------------------------------------
// Send by email (Gmail, with the file attached)
// ------------------------------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SendPaperModal: React.FC<{
    paper: CompanyPaper;
    profile: UserProfile;
    clients: Client[];
    jobs: Array<Job & { clientId?: string | null }>;
    onClose: () => void;
    onSent: (to: string) => void;
}> = ({ paper, profile, clients, onClose, onSent }) => {
    const company = profile.companyName || profile.name || '';
    const [to, setTo] = useState('');
    const recipient = clients.find(c => c.email && c.email.toLowerCase() === to.trim().toLowerCase());
    const draft = useMemo(() => sendPaperEmail(paper, company, recipient?.name || ''), [paper, company, recipient?.name]);
    const [subject, setSubject] = useState(draft.subject);
    const [body, setBody] = useState(draft.body);
    const bodyTouched = useRef(false);
    useEffect(() => { if (!bodyTouched.current) setBody(draft.body); }, [draft.body]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const send = async () => {
        const address = to.trim();
        if (!EMAIL_RE.test(address)) { setError('Add the email address.'); return; }
        if (!paper.filePath) return;
        setBusy(true);
        setError('');
        try {
            const [{ sendEmail, getPreferredSender, GmailError }, file] = await Promise.all([import('../../services/gmailService.ts'), paperFileBase64(paper.filePath)]);
            const ext = /\.(pdf|jpe?g|png|webp)$/i.exec(paper.filePath)?.[1] || 'pdf';
            const name = (paper.fileName || `${paper.title}.${ext}`).replace(/[\\/:*?"<>|]+/g, '-');
            try {
                await sendEmail({
                    accountId: getPreferredSender(), to: address, subject: subject.trim() || draft.subject, text: body,
                    fromName: company || undefined, attachments: [{ filename: name, mimeType: paper.fileType || file.type, dataBase64: file.base64 }],
                });
            } catch (e) {
                const code = e instanceof GmailError ? e.code : '';
                throw new Error(code === 'NO_ACCOUNT' ? 'Connect your Gmail first (Messages page).'
                    : code === 'RECONNECT_REQUIRED' || code === 'SCOPE_MISSING' ? 'Your Gmail connection needs to be renewed (Messages page).'
                        : describeError(e, 'The email could not be sent.'));
            }
            toast.success(`Sent to ${address} from your Gmail.`);
            onSent(address);
        } catch (e) {
            setError((e as Error).message || 'The email could not be sent.');
        } finally {
            setBusy(false);
        }
    };

    const emails = Array.from(new Set(clients.map(c => c.email).filter(Boolean) as string[]));
    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            title={`Send ${paper.kind === 'coi' ? 'COI' : paper.title}`}
            description="From your Gmail, with the file attached."
            footer={
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => { void send(); }} disabled={busy}>{busy ? 'Sending…' : 'Send with Gmail'}</button>
                </>
            }
        >
            <div className="space-y-3">
                <Field label="To" htmlFor="paper-to" hint="A client, general contractor or property manager.">
                    <input id="paper-to" type="email" className="input" value={to} onChange={(e) => setTo(e.target.value)} list="paper-to-list" autoComplete="email" placeholder="name@example.com" />
                    <datalist id="paper-to-list">{emails.map(e => <option key={e} value={e} />)}</datalist>
                </Field>
                <Field label="Subject" htmlFor="paper-subject"><input id="paper-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></Field>
                <Field label="Message" htmlFor="paper-body"><textarea id="paper-body" className="input min-h-[140px]" value={body} onChange={(e) => { bodyTouched.current = true; setBody(e.target.value); }} /></Field>
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><PaperclipIcon className="h-4 w-4" /> {paper.fileName || 'Attached file'}</p>
                {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
            </div>
        </Modal>
    );
};

export default PapersView;
