/**
 * The job page's Crew tab (Premium): who is on this job (and on the clock right now), their links, this week's
 * hours here, and the job site pin that the "far from the job" flag compares punches with.
 * No geocoding: the pin comes from "Use my location" (standing at the site) or a pasted map link / coordinates.
 */
import React, { useMemo, useState } from 'react';
import type { Job } from '../../types.ts';
import { isPaidTier } from '../../lib/plans.ts';
import {
    DEFAULT_SITE_RADIUS_M, SITE_RADIUS_OPTIONS, buildSessions, distanceLabel, durationLabel, hoursLabel, localDayOf, parseLatLng, sessionCounts,
    weekDays as daysOfWeek, weekRangeLabel, weekStartOf, type JobSite,
} from '../../lib/crew/crewLogic.ts';
import { assignJob, saveJobSite, unassignJob, type CrewMember } from '../../lib/crew/crewApi.ts';
import { toast } from '../Toast.tsx';
import { MapPinIcon, PlusIcon, StarIcon } from '../Icons.tsx';
import { LinkSheet, MemberEditor } from './CrewMembers.tsx';
import { Chip, LiveDot, cx, openShiftLabel, shiftChips, useCrewData, useWeekPunches } from './crewUi.tsx';

const SiteEditor: React.FC<{ job: Job; site: JobSite | null; isOnline: boolean; onSaved: (s: JobSite | null) => void }> = ({ job, site, isOnline, onSaved }) => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [radius, setRadius] = useState(site?.radiusM || DEFAULT_SITE_RADIUS_M);
    const [busy, setBusy] = useState<'gps' | 'save' | null>(null);
    const [err, setErr] = useState('');

    const save = async (pin: { lat: number; lng: number } | null, label?: string) => {
        setBusy('save');
        setErr('');
        try {
            const saved = await saveJobSite(job.id, pin ? { ...pin, radiusM: radius, label: label || null } : null);
            onSaved(saved);
            setOpen(false);
            setText('');
            toast.success(pin ? 'Job site saved. Punches are now checked against it.' : 'Job site removed.');
        } catch (e) {
            setErr((e as Error)?.message || 'Could not save.');
        } finally {
            setBusy(null);
        }
    };

    const useMyLocation = () => {
        if (!('geolocation' in navigator)) { setErr('This browser can’t share a location.'); return; }
        setBusy('gps');
        setErr('');
        navigator.geolocation.getCurrentPosition(
            pos => { void save({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'Set on site'); },
            e => { setBusy(null); setErr(e.code === 1 ? 'Location is blocked for this site in the browser settings.' : 'Could not get your location. Try again outside, or paste a map link.'); },
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
        );
    };

    const pasted = parseLatLng(text);

    return (
        <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby={`site-${job.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 id={`site-${job.id}`} className="flex items-center gap-1.5 text-sm font-semibold"><MapPinIcon className="h-4 w-4 text-primary" /> Job site pin</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {site
                            ? <>Punches more than <span className="font-semibold text-foreground">{distanceLabel(site.radiusM)}</span> away are flagged “Far from job”. <span className="font-mono">{site.lat.toFixed(5)}, {site.lng.toFixed(5)}</span></>
                            : 'Not set: punches are saved with their location but not checked for distance.'}
                    </p>
                </div>
                {!open && <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)} disabled={!isOnline}>{site ? 'Change' : 'Set pin'}</button>}
            </div>
            {open && (
                <div className="mt-3 space-y-3">
                    <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={useMyLocation} disabled={busy !== null}>
                        {busy === 'gps' ? 'Getting your location…' : 'Use my location (I’m at the site)'}
                    </button>
                    <label className="block">
                        <span className="label">Or paste a map link or coordinates</span>
                        <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="https://maps.google.com/…  or  40.7128, -74.0060" />
                    </label>
                    {text.trim() && !pasted && <p className="text-xs text-warning">No coordinates found. In Google Maps, long-press the spot and copy the numbers it shows.</p>}
                    <label className="block sm:w-56">
                        <span className="label">Flag punches farther than</span>
                        <select className="input" value={radius} onChange={e => setRadius(Number(e.target.value))}>
                            {SITE_RADIUS_OPTIONS.map(r => <option key={r} value={r}>{distanceLabel(r)}</option>)}
                        </select>
                    </label>
                    {err && <p className="text-sm font-medium text-destructive" role="alert">{err}</p>}
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-primary btn-sm" disabled={!pasted || busy !== null} onClick={() => pasted && void save(pasted, 'Pasted')}>Save pin</button>
                        {site && <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void save({ lat: site.lat, lng: site.lng }, site.label || undefined)}>Keep pin, save distance</button>}
                        {site && <button type="button" className="btn btn-ghost btn-sm text-destructive" disabled={busy !== null} onClick={() => void save(null)}>Remove pin</button>}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setErr(''); }} disabled={busy !== null}>Cancel</button>
                    </div>
                </div>
            )}
        </section>
    );
};

const JobCrewPanel: React.FC<{
    job: Job;
    jobs: readonly Job[];
    profile: { companyName?: string; name?: string };
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason?: string) => void;
    onOpenCrew: () => void;
}> = ({ job, jobs, profile, plan, isOnline, onUpgrade, onOpenCrew }) => {
    const paid = isPaidTier(plan);
    const { data, setData, loading, error, reload } = useCrewData(true);
    const [now] = useState(() => Date.now());
    const weekStart = weekStartOf(localDayOf(now));
    // all of the week's punches (a shift is paired from every punch of the worker), then this job's shifts
    const week = useWeekPunches(weekStart, Boolean(data && (paid || data.members.length)));
    const [pick, setPick] = useState('');
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState(false);
    const [linkFor, setLinkFor] = useState<CrewMember | null>(null);

    const sessions = useMemo(() => buildSessions(week.punches, { now: Date.now() }).filter(s => s.jobId === job.id), [week.punches, job.id]);
    const weekDays = new Set(daysOfWeek(weekStart));
    const site = data?.sites[job.id] || null;
    const assignedIds = new Set((data?.assignments || []).filter(a => a.jobId === job.id).map(a => a.memberId));
    const onJob = (data?.members || []).filter(m => assignedIds.has(m.id) || sessions.some(s => s.memberId === m.id));
    const addable = (data?.members || []).filter(m => m.active && !assignedIds.has(m.id));
    const hoursOf = (memberId: string) => sessions.filter(s => s.memberId === memberId && weekDays.has(s.day) && sessionCounts(s)).reduce((n, s) => n + s.workedMs, 0);
    const totalMs = sessions.filter(s => weekDays.has(s.day) && sessionCounts(s)).reduce((n, s) => n + s.workedMs, 0);
    const toCheck = sessions.filter(s => weekDays.has(s.day)).flatMap(s => shiftChips(s, site).filter(c => c.tone !== 'muted' || c.key === 'noloc').map(c => ({ ...c, memberId: s.memberId, key: `${s.key}:${c.key}` })));
    const company = profile.companyName || profile.name || '';

    if (!paid && !(data && data.members.length)) {
        return (
            <section className="rounded-2xl border border-primary/30 bg-card p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Premium</p>
                <h3 className="mt-1 text-lg font-bold">Let your crew clock in to this job from their phones</h3>
                <p className="mt-1 text-sm text-muted-foreground">A private link per worker, no logins or seat fees. Their hours land here and turn into time sheets for job costing.</p>
                <button type="button" className="btn btn-primary mt-4" onClick={() => onUpgrade('Crew clock-in links are part of Premium.')}><StarIcon className="h-4 w-4" /> Upgrade to Premium</button>
            </section>
        );
    }

    const assign = async (memberId: string) => {
        if (!memberId || !data) return;
        setBusy(true);
        try {
            const a = await assignJob(memberId, job.id);
            setData({ ...data, assignments: [...data.assignments.filter(x => !(x.memberId === memberId && x.jobId === job.id)), a] });
            setPick('');
            const m = data.members.find(x => x.id === memberId);
            toast.success(`${m?.name.split(' ')[0] || 'They'} can now clock in to ${job.name}.`);
        } catch (e) {
            toast.error((e as Error)?.message || 'Could not add.');
        } finally {
            setBusy(false);
        }
    };

    const unassign = async (m: CrewMember) => {
        if (!data) return;
        setBusy(true);
        try {
            await unassignJob(m.id, job.id);
            setData({ ...data, assignments: data.assignments.filter(x => !(x.memberId === m.id && x.jobId === job.id)) });
            toast.success(`${m.name.split(' ')[0]} is off this job. Their hours here stay.`);
        } catch (e) {
            toast.error((e as Error)?.message || 'Could not remove.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            {error && (
                <p className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                    {error}<button type="button" className="btn btn-outline btn-sm" onClick={() => void reload()}>Try again</button>
                </p>
            )}
            {loading && !data ? <div className="skeleton h-40 w-full rounded-2xl" aria-busy="true" /> : data && (
                <>
                    <section className="rounded-2xl border border-border bg-card" aria-labelledby={`crew-on-${job.id}`}>
                        <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-2 pt-3">
                            <h3 id={`crew-on-${job.id}`} className="text-sm font-semibold">Crew on this job</h3>
                            <button type="button" className="text-xs font-semibold text-primary" onClick={onOpenCrew}>
                                {weekRangeLabel(weekStart)}: <span className="font-mono tabular-nums">{hoursLabel(totalMs)} h</span> · Crew hours ›
                            </button>
                        </header>
                        {onJob.length === 0 ? (
                            <p className="px-4 pb-3 text-sm text-muted-foreground">Nobody yet. Add crew members so they can clock in to this job.</p>
                        ) : (
                            <ul className="divide-y divide-border border-t border-border">
                                {onJob.map(m => {
                                    const open = sessions.find(s => s.open && s.memberId === m.id);
                                    const live = open ? openShiftLabel(open) : null;
                                    const token = data.links[m.id];
                                    return (
                                        <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2">
                                                    {live && <LiveDot tone={live.tone} />}
                                                    <span className="truncate font-medium">{m.name}</span>
                                                    {!assignedIds.has(m.id) && <span className="text-xs text-muted-foreground">(not on the job anymore)</span>}
                                                </span>
                                                <span className={cx('block text-xs', live ? (live.tone === 'success' ? 'text-success' : live.tone === 'warning' ? 'text-warning' : 'text-destructive') : 'text-muted-foreground')}>
                                                    {live ? live.text : `${durationLabel(hoursOf(m.id))} this week`}
                                                </span>
                                            </span>
                                            {m.active && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkFor(m)}>{token ? 'Link' : 'Link off'}</button>}
                                            {assignedIds.has(m.id) && <button type="button" className="btn btn-ghost btn-sm text-muted-foreground" onClick={() => void unassign(m)} disabled={!isOnline || busy}>Remove</button>}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {paid && (
                            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
                                {addable.length > 0 && (
                                    <>
                                        <label className="sr-only" htmlFor={`crew-add-${job.id}`}>Add a crew member to this job</label>
                                        <select id={`crew-add-${job.id}`} className="input h-9 w-auto min-w-[10rem] py-1 text-sm" value={pick} onChange={e => setPick(e.target.value)} disabled={!isOnline || busy}>
                                            <option value="">Add from your crew…</option>
                                            {addable.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                        <button type="button" className="btn btn-outline btn-sm" onClick={() => void assign(pick)} disabled={!pick || !isOnline || busy}>Add to job</button>
                                    </>
                                )}
                                <button type="button" className="inline-flex min-h-[36px] items-center gap-1 text-sm font-semibold text-primary disabled:opacity-50" onClick={() => setAdding(true)} disabled={!isOnline}>
                                    <PlusIcon className="h-4 w-4" /> New crew member
                                </button>
                            </div>
                        )}
                    </section>

                    {toCheck.length > 0 && (
                        <section className="rounded-2xl border border-border bg-card px-4 py-3">
                            <h3 className="text-sm font-semibold">To check this week</h3>
                            <ul className="mt-2 flex flex-wrap gap-1.5">
                                {toCheck.slice(0, 12).map(c => (
                                    <li key={c.key}><Chip tone={c.tone} title={c.title}>{data.members.find(m => m.id === c.memberId)?.name.split(' ')[0] || 'Crew'}: {c.label}</Chip></li>
                                ))}
                            </ul>
                            <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={onOpenCrew}>Fix in Crew hours ›</button>
                        </section>
                    )}

                    <SiteEditor job={job} site={site} isOnline={isOnline} onSaved={(s) => {
                        const sites = { ...data.sites };
                        if (s) sites[job.id] = s; else delete sites[job.id];
                        setData({ ...data, sites });
                    }} />
                    {site && sessions.length > 0 && (
                        <p className="px-1 text-xs text-muted-foreground">
                            Distances use one reading taken at each tap{site.radiusM ? `; the pin allows ${distanceLabel(site.radiusM)}` : ''}.
                        </p>
                    )}
                </>
            )}

            {adding && data && (
                <MemberEditor open member={null} jobs={jobs} data={data} presetJobId={job.id} onClose={() => setAdding(false)} onUpgrade={onUpgrade}
                    onSaved={(m, token, jobIds) => {
                        const links = { ...data.links };
                        if (token) links[m.id] = token;
                        setData({
                            ...data,
                            members: [...data.members, m].sort((a, b) => a.name.localeCompare(b.name)),
                            assignments: [...data.assignments, ...jobIds.map(jobId => ({ id: `${m.id}:${jobId}`, memberId: m.id, jobId, startsOn: null, endsOn: null }))],
                            links,
                        });
                        setAdding(false);
                        setLinkFor(m);
                    }} />
            )}
            {linkFor && data && (
                <LinkSheet member={linkFor} token={data.links[linkFor.id] || null} company={company} isOnline={isOnline} onClose={() => setLinkFor(null)}
                    onToken={(token) => {
                        const links = { ...data.links };
                        if (token) links[linkFor.id] = token; else delete links[linkFor.id];
                        setData({ ...data, links });
                    }} />
            )}
        </div>
    );
};

export default JobCrewPanel;
