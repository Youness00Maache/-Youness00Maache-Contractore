/**
 * Crew members (Crew page › Crew members, and the job Crew tab): add / edit people, the jobs they may clock in to,
 * and their private clock-in link (copy, text, email, QR, new link, turn off). Workers need no login and cost no seat.
 */
import React, { useMemo, useState } from 'react';
import type { Job } from '../../types.ts';
import { CREW_LIMITS, crewInviteText, crewLinkUrl, firstName } from '../../lib/crew/crewLogic.ts';
import {
    assignJob, createMember, deleteMember, setMemberLink, unassignJob, updateMember, type CrewData, type CrewMember,
} from '../../lib/crew/crewApi.ts';
import { qrSvg } from '../../lib/qrcode.ts';
import { ConfirmDialog, Modal, timeAgo } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { CopyIcon, MailIcon, PhoneIcon, PlusIcon, RefreshCwIcon, TrashIcon } from '../Icons.tsx';
import { cx } from './crewUi.tsx';

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`;
const openJobs = (jobs: readonly Job[]) => jobs.filter(j => j.status === 'active' || j.status === 'paused');

export const copyText = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const done = document.execCommand('copy');
            ta.remove();
            return done;
        } catch {
            return false;
        }
    }
};

const smsHref = (phone: string, body: string): string => {
    const num = phone.replace(/[^\d+]/g, '');
    return num.replace(/\D/g, '').length >= 6 ? `sms:${num}?&body=${encodeURIComponent(body)}` : '';
};
const mailHref = (email: string, subject: string, body: string): string =>
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : '';

// ------------------------------------------------------------------------------------------------- member editor
export const MemberEditor: React.FC<{
    open: boolean;
    member: CrewMember | null;
    jobs: readonly Job[];
    data: CrewData;
    /** a job to tick for a new member (job page) */
    presetJobId?: string;
    onClose: () => void;
    onSaved: (member: CrewMember, token: string | null, jobIds: string[]) => void;
    onUpgrade: (reason?: string) => void;
}> = ({ open, member, jobs, data, presetJobId, onClose, onSaved, onUpgrade }) => {
    const assigned = useMemo(() => new Set(member ? data.assignments.filter(a => a.memberId === member.id).map(a => a.jobId) : presetJobId ? [presetJobId] : []), [member, data.assignments, presetJobId]);
    const [name, setName] = useState(member?.name || '');
    const [phone, setPhone] = useState(member?.phone || '');
    const [email, setEmail] = useState(member?.email || '');
    const [rate, setRate] = useState(member?.costRate === null || member?.costRate === undefined ? '' : String(member.costRate));
    const [jobIds, setJobIds] = useState<Set<string>>(() => new Set(assigned));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const list = useMemo(() => {
        const visible = openJobs(jobs);
        // jobs already assigned stay visible even when finished, so they can be unticked
        for (const id of assigned) if (!visible.some(j => j.id === id)) { const j = jobs.find(x => x.id === id); if (j) visible.push(j); }
        return visible.sort((a, b) => a.name.localeCompare(b.name));
    }, [jobs, assigned]);

    const save = async () => {
        const n = name.trim();
        if (!n) { setErr('Add a name.'); return; }
        const r = rate.trim() === '' ? null : Number(rate);
        if (r !== null && (!Number.isFinite(r) || r < 0 || r > CREW_LIMITS.maxRate)) { setErr('Check the hourly cost.'); return; }
        setBusy(true);
        setErr('');
        try {
            let saved: CrewMember;
            let token: string | null = null;
            if (member) saved = await updateMember(member.id, { name: n, phone, email, costRate: r });
            else ({ member: saved, token } = await createMember({ name: n, phone, email, costRate: r }));
            const add = [...jobIds].filter(id => !assigned.has(id) || !member);
            const remove = member ? [...assigned].filter(id => !jobIds.has(id)) : [];
            for (const id of add) await assignJob(saved.id, id);
            for (const id of remove) await unassignJob(saved.id, id);
            onSaved(saved, token, [...jobIds]);
        } catch (e) {
            const kind = (e as { kind?: string })?.kind;
            if (kind === 'premium') { onClose(); onUpgrade('Crew clock-in links are part of Premium.'); return; }
            setErr((e as Error)?.message || 'Could not save.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            busy={busy}
            title={member ? `Edit ${member.name}` : 'Add crew member'}
            description={member ? undefined : 'They get a private clock-in link. No login, no app, no seat fee.'}
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : member ? 'Save' : 'Add and get link'}</button>
                </>
            )}
        >
            <div className="space-y-4">
                <label className="block">
                    <span className="label">Name</span>
                    <input className="input" value={name} onChange={e => setName(e.target.value.slice(0, CREW_LIMITS.name))} autoFocus={!member} placeholder="e.g. Maria Lopez" autoComplete="off" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="label">Phone <span className="font-normal text-muted-foreground">(optional, to text the link)</span></span>
                        <input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value.slice(0, CREW_LIMITS.phone))} autoComplete="off" />
                    </label>
                    <label className="block">
                        <span className="label">Email <span className="font-normal text-muted-foreground">(optional)</span></span>
                        <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value.slice(0, CREW_LIMITS.email))} autoComplete="off" />
                    </label>
                </div>
                <label className="block sm:w-1/2">
                    <span className="label">Hourly cost <span className="font-normal text-muted-foreground">(optional, never shown to them)</span></span>
                    <span className="relative block">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <input className="input pl-7 tabular-nums" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value.replace(/[^\d.]/g, '').slice(0, 9))} placeholder="28.00" />
                    </span>
                </label>
                <fieldset>
                    <legend className="label">Jobs they can clock in to</legend>
                    {list.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No open jobs yet. Add jobs later from the job’s Crew tab.</p>
                    ) : (
                        <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-1.5">
                            {list.map(j => (
                                <label key={j.id} className="flex min-h-[40px] cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted">
                                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={jobIds.has(j.id)}
                                        onChange={e => setJobIds(prev => { const next = new Set(prev); if (e.target.checked) next.add(j.id); else next.delete(j.id); return next; })} />
                                    <span className="min-w-0 flex-1 truncate text-sm">{j.name}</span>
                                    {j.status !== 'active' && <span className="text-xs text-muted-foreground">{j.status}</span>}
                                </label>
                            ))}
                        </div>
                    )}
                </fieldset>
                {err && <p className="text-sm font-medium text-destructive" role="alert">{err}</p>}
            </div>
        </Modal>
    );
};

// ------------------------------------------------------------------------------------------------- link sheet
export const LinkSheet: React.FC<{
    member: CrewMember;
    token: string | null;
    company: string;
    isOnline: boolean;
    onClose: () => void;
    onToken: (token: string | null) => void;
}> = ({ member, token, company, isOnline, onClose, onToken }) => {
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<'new' | 'off' | null>(null);
    const url = token ? crewLinkUrl(window.location.origin, token) : '';
    const text = url ? crewInviteText(member.name, company, url) : '';
    const sms = url && member.phone ? smsHref(member.phone, text) : '';
    const mail = url && member.email ? mailHref(member.email, `${company || 'Your'} clock-in link`, text) : '';
    const qr = useMemo(() => (url ? qrSvg(url, { size: 168, margin: 2, title: `Clock-in link for ${member.name}` }) : ''), [url, member.name]);

    const run = async (action: 'new' | 'off') => {
        setBusy(true);
        try {
            const next = await setMemberLink(member.id, action);
            onToken(next);
            toast.success(action === 'new' ? `New link for ${firstName(member.name)}. The old one stopped working.` : `${firstName(member.name)}'s link is off.`);
        } catch (e) {
            toast.error((e as Error)?.message || 'Could not change the link.');
        } finally {
            setBusy(false);
            setConfirm(null);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            title={`${member.name}'s clock-in link`}
            description="Private to them: it works only for the jobs you give them, and only until you turn it off."
            footer={<button type="button" className="btn btn-outline" onClick={onClose}>Done</button>}
        >
            {url ? (
                <div className="space-y-4">
                    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                        <div className="shrink-0 rounded-xl border border-border bg-white p-1.5" dangerouslySetInnerHTML={{ __html: qr }} />
                        <div className="min-w-0 flex-1 space-y-2">
                            <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed">{url}</p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => void copyText(text).then(ok => (ok ? toast.success('Link and message copied.') : toast.error('Could not copy.')))}>
                                    <CopyIcon className="h-4 w-4" /> Copy link
                                </button>
                                {sms && <a className="btn btn-outline btn-sm" href={sms}><PhoneIcon className="h-4 w-4" /> Text it</a>}
                                {mail && <a className="btn btn-outline btn-sm" href={mail}><MailIcon className="h-4 w-4" /> Email it</a>}
                            </div>
                            <p className="text-xs text-muted-foreground">Or let them scan the code with their phone camera.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
                        <button type="button" className="inline-flex min-h-[40px] items-center gap-1.5 font-medium text-foreground disabled:opacity-50" disabled={!isOnline || busy} onClick={() => setConfirm('new')}>
                            <RefreshCwIcon className="h-4 w-4" /> New link
                        </button>
                        <button type="button" className="inline-flex min-h-[40px] items-center gap-1.5 font-medium text-destructive disabled:opacity-50" disabled={!isOnline || busy} onClick={() => setConfirm('off')}>
                            Turn off link
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3 text-sm">
                    <p>{member.active ? 'The link is off: it doesn’t open for anyone.' : `${member.name} is archived, so the link doesn’t work.`}</p>
                    {member.active && <button type="button" className="btn btn-primary" disabled={!isOnline || busy} onClick={() => void run('new')}>Make a new link</button>}
                </div>
            )}
            <ConfirmDialog
                open={confirm !== null}
                title={confirm === 'new' ? 'Make a new link?' : 'Turn off this link?'}
                message={confirm === 'new'
                    ? `The link ${firstName(member.name)} has now stops working right away. Send them the new one.`
                    : `${firstName(member.name)} can’t clock in until you make a new link. Their hours so far stay.`}
                confirmLabel={confirm === 'new' ? 'New link' : 'Turn off'}
                destructive={confirm === 'off'}
                busy={busy}
                onConfirm={() => confirm && void run(confirm)}
                onCancel={() => setConfirm(null)}
            />
        </Modal>
    );
};

// ------------------------------------------------------------------------------------------------- list
const CrewMembers: React.FC<{
    data: CrewData;
    jobs: readonly Job[];
    userId: string;
    company: string;
    isOnline: boolean;
    paid: boolean;
    /** member id → "On the clock 3h" etc. */
    status: Record<string, { text: string; tone: 'success' | 'warning' | 'danger' }>;
    onChange: (next: CrewData) => void;
    onUpgrade: (reason?: string) => void;
    adding: boolean;
    setAdding: (v: boolean) => void;
}> = ({ data, jobs, userId, company, isOnline, paid, status, onChange, onUpgrade, adding, setAdding }) => {
    const [editing, setEditing] = useState<CrewMember | null>(null);
    const [linkFor, setLinkFor] = useState<CrewMember | null>(null);
    const [removing, setRemoving] = useState<CrewMember | null>(null);
    const [busy, setBusy] = useState(false);
    const jobName = useMemo(() => new Map(jobs.map(j => [j.id, j.name])), [jobs]);
    const active = data.members.filter(m => m.active);
    const archived = data.members.filter(m => !m.active);

    const saved = (m: CrewMember, token: string | null, jobIds: string[]) => {
        const members = data.members.some(x => x.id === m.id) ? data.members.map(x => (x.id === m.id ? m : x)) : [...data.members, m].sort((a, b) => a.name.localeCompare(b.name));
        const assignments = [
            ...data.assignments.filter(a => a.memberId !== m.id),
            ...jobIds.map(jobId => data.assignments.find(a => a.memberId === m.id && a.jobId === jobId) || { id: `${m.id}:${jobId}`, memberId: m.id, jobId, startsOn: null, endsOn: null }),
        ];
        const links = { ...data.links };
        if (token) links[m.id] = token;
        onChange({ ...data, members, assignments, links });
        const isNew = !editing;
        setEditing(null);
        setAdding(false);
        if (isNew) setLinkFor(m);
        else toast.success('Saved.');
    };

    const setActive = async (m: CrewMember, next: boolean) => {
        setBusy(true);
        try {
            const updated = await updateMember(m.id, { name: m.name, phone: m.phone, email: m.email, costRate: m.costRate, active: next });
            onChange({ ...data, members: data.members.map(x => (x.id === m.id ? updated : x)) });
            toast.success(next ? `${firstName(m.name)} is back on the crew.` : `${firstName(m.name)} is archived; their link stopped working.`);
        } catch (e) {
            toast.error((e as Error)?.message || 'Could not save.');
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!removing) return;
        setBusy(true);
        try {
            await deleteMember(removing.id, userId);
            onChange({ ...data, members: data.members.filter(x => x.id !== removing.id), assignments: data.assignments.filter(a => a.memberId !== removing.id) });
            toast.success(`${removing.name} was removed.`);
            setRemoving(null);
        } catch (e) {
            toast.error((e as Error)?.message || 'Could not remove.');
        } finally {
            setBusy(false);
        }
    };

    const row = (m: CrewMember) => {
        const mine = data.assignments.filter(a => a.memberId === m.id).map(a => jobName.get(a.jobId)).filter(Boolean) as string[];
        const st = status[m.id];
        const token = data.links[m.id] || null;
        return (
            <li key={m.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="truncate font-semibold">{m.name}</span>
                        {st && <span className={cx('text-xs font-semibold', st.tone === 'success' ? 'text-success' : st.tone === 'warning' ? 'text-warning' : 'text-destructive')}>{st.text}</span>}
                        {!m.active && <span className="text-xs font-medium text-muted-foreground">Archived</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                        {[m.phone, m.email, m.costRate !== null ? `${money(m.costRate)}/h cost` : ''].filter(Boolean).join(' · ') || 'No contact details'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {mine.length ? `Jobs: ${mine.slice(0, 3).join(', ')}${mine.length > 3 ? ` +${mine.length - 3}` : ''}` : 'No jobs yet'}
                        {' · '}
                        {!m.active ? 'link off' : token ? (m.lastSeenAt ? `opened ${timeAgo(m.lastSeenAt)}` : 'link not opened yet') : 'link off'}
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {m.active && <button type="button" className="btn btn-outline btn-sm" onClick={() => setLinkFor(m)}>{token ? 'Share link' : 'Link off'}</button>}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(m)} disabled={!isOnline}>Edit</button>
                    {m.active
                        ? <button type="button" className="btn btn-ghost btn-sm text-muted-foreground" onClick={() => void setActive(m, false)} disabled={!isOnline || busy}>Archive</button>
                        : <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setActive(m, true)} disabled={!isOnline || busy || !paid}>Restore</button>
                            <button type="button" className="btn btn-ghost btn-sm text-destructive" aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)} disabled={!isOnline || busy}><TrashIcon className="h-4 w-4" /></button>
                        </>}
                </div>
            </li>
        );
    };

    return (
        <div className="space-y-4">
            {active.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-8 text-center">
                    <p className="font-semibold">No crew yet</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Add the people who work for you. Each one gets a private link to clock in and out from their phone.</p>
                    <button type="button" className="btn btn-primary mt-4" onClick={() => (paid ? setAdding(true) : onUpgrade('Crew clock-in links are part of Premium.'))} disabled={!isOnline}>
                        <PlusIcon className="h-4 w-4" /> Add crew member
                    </button>
                </div>
            ) : (
                <ul className="divide-y divide-border rounded-2xl border border-border bg-card">{active.map(row)}</ul>
            )}
            {archived.length > 0 && (
                <details className="rounded-2xl border border-border bg-card">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-muted-foreground">Archived ({archived.length})</summary>
                    <ul className="divide-y divide-border border-t border-border">{archived.map(row)}</ul>
                </details>
            )}

            {(adding || editing) && (
                <MemberEditor
                    open
                    member={editing}
                    jobs={jobs}
                    data={data}
                    onClose={() => { setEditing(null); setAdding(false); }}
                    onSaved={saved}
                    onUpgrade={onUpgrade}
                />
            )}
            {linkFor && (
                <LinkSheet
                    member={data.members.find(m => m.id === linkFor.id) || linkFor}
                    token={data.links[linkFor.id] || null}
                    company={company}
                    isOnline={isOnline}
                    onClose={() => setLinkFor(null)}
                    onToken={(token) => {
                        const links = { ...data.links };
                        if (token) links[linkFor.id] = token; else delete links[linkFor.id];
                        onChange({ ...data, links, members: data.members.map(m => (m.id === linkFor.id ? { ...m, linkOn: Boolean(token), lastSeenAt: token ? null : m.lastSeenAt } : m)) });
                    }}
                />
            )}
            <ConfirmDialog
                open={removing !== null}
                title={`Remove ${s(removing?.name)}?`}
                message="Their punches and photos are deleted too. Time sheets you already made from their hours stay."
                confirmLabel="Remove"
                destructive
                busy={busy}
                onConfirm={() => void remove()}
                onCancel={() => setRemoving(null)}
            />
        </div>
    );
};

export default CrewMembers;
