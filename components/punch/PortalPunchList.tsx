/**
 * Client portal: the punch lists the contractor chose to show, per job, with progress. On a finished item the client
 * taps "Looks good" (verified) or "Needs work" (with a note: the item opens again and the contractor sees the note).
 * Reads get_portal_punch_list(portal key); renders nothing when there is none or the database doesn't have punch
 * lists yet. Mounted in components/PortalView.tsx under the documents.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.ts';
import { parsePortalPunch, portalActionsFor, progressLabel, type PortalPunchItem, type PortalPunchJob } from '../../lib/punchList.ts';
import { portalPhotoUrl } from '../photos/photosApi.ts';
import { PunchRail } from './PunchRail.tsx';

const PortalPunchList: React.FC<{ portalKey: string; className?: string }> = ({ portalKey, className = '' }) => {
    const [jobs, setJobs] = useState<PortalPunchJob[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [noteFor, setNoteFor] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

    const load = useCallback(async () => {
        const { data, error } = await supabase.rpc('get_portal_punch_list', { p_key: portalKey });
        if (!error) setJobs(parsePortalPunch(data));
    }, [portalKey]);
    useEffect(() => { void load().catch(() => undefined); }, [load]);

    const answer = async (item: PortalPunchItem, ok: boolean) => {
        if (!ok && !note.trim()) { setMessage({ tone: 'error', text: 'Say what still needs work.' }); return; }
        setBusy(item.id);
        setMessage(null);
        const { error } = await supabase.rpc('punch_item_feedback_via_portal', { p_key: portalKey, p_item_id: item.id, p_ok: ok, p_note: ok ? null : note.trim() });
        setBusy(null);
        if (error) {
            setMessage({ tone: 'error', text: /not available|not finished|Only finished/i.test(error.message || '') ? error.message : 'That didn’t go through. Please try again.' });
            return;
        }
        setNoteFor(null);
        setNote('');
        setMessage({ tone: 'ok', text: ok ? 'Thanks, marked as looking good.' : 'Thanks, your note was sent.' });
        void load();
    };

    if (!jobs.length) return null;

    return (
        <section aria-labelledby="portal-punch-heading" className={className}>
            <h2 id="portal-punch-heading" className="text-lg font-bold">Punch list</h2>
            <p className="mt-1 text-sm text-muted-foreground">What is left to finish. When an item is done, check it and tap “Looks good”, or tell us what still needs work.</p>
            {message && <p className={`mt-3 text-sm font-medium ${message.tone === 'ok' ? 'text-success' : 'text-destructive'}`} role="status">{message.text}</p>}
            <div className="mt-3 space-y-5">
                {jobs.map(j => (
                    <div key={j.jobId} className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                        <div className="flex items-baseline justify-between gap-3">
                            <h3 className="min-w-0 truncate font-semibold">{j.jobName}</h3>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">{progressLabel(j.progress)}</span>
                        </div>
                        <PunchRail progress={j.progress} className="mt-2" />
                        <ul className="mt-3 divide-y divide-border/70">
                            {j.items.map(item => {
                                const can = portalActionsFor(item);
                                const label = item.status === 'verified' ? (item.verifiedBy === 'client' ? 'You approved' : 'Verified') : item.status === 'done' ? 'Ready for you to check' : 'In progress';
                                const tone = item.status === 'verified' ? 'text-success' : item.status === 'done' ? 'text-primary' : 'text-muted-foreground';
                                return (
                                    <li key={item.id} className="py-2.5">
                                        <div className="flex items-start gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold leading-5">{item.title}</p>
                                                <p className="text-xs text-muted-foreground">{[item.area, <span key="s" className={`font-semibold ${tone}`}>{label}</span>].filter(Boolean).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}</p>
                                                {item.clientNote && <p className="mt-1 text-xs text-foreground"><span className="font-semibold text-warning">Your note:</span> {item.clientNote}</p>}
                                            </div>
                                            {(item.beforePath || item.afterPath) && (
                                                <span className="flex shrink-0 gap-1">
                                                    {item.beforePath && <img src={portalPhotoUrl(item.beforePath)} alt="Before" loading="lazy" className="h-12 w-12 rounded-md object-cover" />}
                                                    {item.afterPath && <img src={portalPhotoUrl(item.afterPath)} alt="After" loading="lazy" className="h-12 w-12 rounded-md object-cover ring-2 ring-success/60" />}
                                                </span>
                                            )}
                                        </div>
                                        {(can.looksGood || can.needsWork) && noteFor !== item.id && (
                                            <div className="mt-2 flex gap-2">
                                                {can.looksGood && <button type="button" className="btn btn-primary btn-sm min-h-[40px]" disabled={busy === item.id} onClick={() => { void answer(item, true); }}>Looks good</button>}
                                                {can.needsWork && <button type="button" className="btn btn-outline btn-sm min-h-[40px]" disabled={busy === item.id} onClick={() => { setNoteFor(item.id); setNote(''); setMessage(null); }}>Needs work</button>}
                                            </div>
                                        )}
                                        {noteFor === item.id && (
                                            <div className="mt-2 space-y-2">
                                                <textarea className="input min-h-[64px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What still needs work?" aria-label="What still needs work?" autoFocus />
                                                <div className="flex gap-2">
                                                    <button type="button" className="btn btn-primary btn-sm min-h-[40px]" disabled={busy === item.id || !note.trim()} onClick={() => { void answer(item, false); }}>Send note</button>
                                                    <button type="button" className="btn btn-ghost btn-sm min-h-[40px]" onClick={() => setNoteFor(null)}>Cancel</button>
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default PortalPunchList;
