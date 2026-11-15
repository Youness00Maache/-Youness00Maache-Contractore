/**
 * "My subcontract" on the crew link (/clock/<token>, no login), above "My tasks": for a subcontractor the contractor sent work
 * to. Each subcontract shows the scope, the job and address, the agreed price, what was paid and what is left, the retainage, the
 * dates, a simple job progress bar and, while it waits for them, "Accept this work" with a typed name. English / Spanish like the
 * rest of the page (lib/subs/subLinkView.ts has the words).
 *
 * Quiet by design: a worker, a link that is off, a company on the Free plan (paused), a database without the sub functions, no
 * connection and nothing saved, any error: this renders NOTHING, so the page is exactly what it was. Accepting needs a
 * connection (the page says so); the last copy is kept on the phone so the agreement can still be read offline.
 * Calls: lib/subs/subPublicApi.ts (fetchSubCommitments, acceptSubCommitment, isAlreadyAccepted).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CrewSendError } from '../../lib/crew/punchQueue.ts';
import { acceptSubCommitment, fetchSubCommitments, isAlreadyAccepted } from '../../lib/subs/subPublicApi.ts';
import { validateAcceptName } from '../../lib/subs/subLogic.ts';
import {
    SUB_WORDS, showAcceptForm, splitSubCommitments, subAcceptedLine, subDates, subMoney, subPaidParts, subProgressLine, subRetainageLine,
    subStatusWord, visibleSubView, type SubLang,
} from '../../lib/subs/subLinkView.ts';
import { SUB_LIMITS, type CommitmentStatus, type SubLinkCommitment, type SubLinkView } from '../../lib/subs/subTypes.ts';

const CACHE_PREFIX = 'cd.crew.sub:';
const safeGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } };

/** The last view from the phone (checked: anything unreadable is ignored). */
const readCache = (token: string): SubLinkView | null => {
    try {
        const raw = JSON.parse(safeGet(CACHE_PREFIX + token) || 'null');
        if (!raw || raw.available !== true || !raw.member || typeof raw.member.name !== 'string' || !Array.isArray(raw.commitments)) return null;
        const commitments = (raw.commitments as unknown[]).filter((c): c is SubLinkCommitment => !!c && typeof c === 'object'
            && typeof (c as SubLinkCommitment).id === 'string' && typeof (c as SubLinkCommitment).title === 'string'
            && typeof (c as SubLinkCommitment).status === 'string' && typeof (c as SubLinkCommitment).amount === 'number').slice(0, 100);
        return {
            available: true,
            serverNow: typeof raw.serverNow === 'string' ? raw.serverNow : null,
            member: { name: raw.member.name, company: String(raw.member.company || ''), trade: String(raw.member.trade || ''), isSubcontractor: raw.member.isSubcontractor === true },
            commitments,
        };
    } catch { return null; }
};

const mapsHref = (address: string) => (address.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}` : '');

const STATUS_TEXT: Record<CommitmentStatus, string> = {
    draft: 'text-muted-foreground', issued: 'text-warning', accepted: 'text-primary', in_progress: 'text-primary', completed: 'text-success', cancelled: 'text-muted-foreground',
};

const CrewMySubcontract: React.FC<{ token: string; lang: SubLang; today: string; online: boolean }> = ({ token, lang, today, online }) => {
    const w = SUB_WORDS[lang];
    const [view, setView] = useState<SubLinkView | null>(() => readCache(token));
    const [fromCopy, setFromCopy] = useState(() => readCache(token) !== null);
    const [names, setNames] = useState<Record<string, string>>({});
    const [busyId, setBusyId] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ id: string; text: string; tone: 'error' | 'info' } | null>(null);
    const [showFinished, setShowFinished] = useState(false);

    const load = useCallback(async () => {
        try {
            const v = await fetchSubCommitments(token);
            setFromCopy(false);
            if (v.available) { setView(v); safeSet(CACHE_PREFIX + token, JSON.stringify(v)); } else { setView(null); safeSet(CACHE_PREFIX + token, null); }
        } catch (e) {
            const kind = e instanceof CrewSendError ? e.kind : 'unknown';
            // not switched on, link off / invalid, paused: nothing new on the page. Anything else (no connection...): keep what we have.
            if (kind === 'invalid_link' || kind === 'unavailable' || kind === 'paused') { setView(null); safeSet(CACHE_PREFIX + token, null); }
        }
    }, [token]);

    useEffect(() => {
        void load();
        const onOnline = () => { void load(); };
        const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
        window.addEventListener('online', onOnline);
        document.addEventListener('visibilitychange', onVisible);
        return () => { window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisible); };
    }, [load]);

    const shown = useMemo(() => visibleSubView(view), [view]);
    const lists = useMemo(() => splitSubCommitments(shown?.commitments || []), [shown]);

    const accept = async (c: SubLinkCommitment) => {
        if (busyId) return;
        const name = (names[c.id] || '').trim();
        const problem = validateAcceptName(name);
        if (problem) { setMsg({ id: c.id, text: w.nameNeeded, tone: 'error' }); return; }
        if (!online) { setMsg({ id: c.id, text: w.offline, tone: 'error' }); return; }
        setBusyId(c.id);
        setMsg(null);
        try {
            const done = await acceptSubCommitment(token, c.id, name);
            setView(v => {
                if (!v) return v;
                const next = { ...v, commitments: v.commitments.map(x => (x.id === c.id ? { ...x, status: done.status, acceptedAt: done.acceptedAt, acceptedBy: done.acceptedBy, paidTotal: done.paidTotal } : x)) };
                safeSet(CACHE_PREFIX + token, JSON.stringify(next));
                return next;
            });
            setMsg({ id: c.id, text: w.thanks, tone: 'info' });
        } catch (e) {
            if (isAlreadyAccepted(e)) {
                await load();
                setMsg({ id: c.id, text: w.already, tone: 'info' });
            } else {
                setMsg({ id: c.id, text: e instanceof CrewSendError && e.kind === 'network' ? w.offline : w.failed, tone: 'error' });
            }
        } finally {
            setBusyId(null);
        }
    };

    if (!shown) return null;

    const card = (c: SubLinkCommitment) => {
        const paid = subPaidParts(c);
        const dates = subDates(c, lang, today);
        const progress = subProgressLine(c, lang);
        const pct = c.tasksTotal > 0 ? Math.round((Math.min(c.tasksDone, c.tasksTotal) / c.tasksTotal) * 100) : null;
        const retainage = subRetainageLine(c, lang);
        const accepted = subAcceptedLine(c, lang, today);
        const canAccept = showAcceptForm(c);
        return (
            <li key={c.id} className="rounded-2xl border border-border bg-card p-4">
                <p className={`text-xs font-bold uppercase tracking-[0.12em] ${STATUS_TEXT[c.status] || 'text-muted-foreground'}`}>{subStatusWord(c.status, lang)}</p>
                <p className="mt-1 text-base font-bold leading-snug">{c.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    <span className="break-words">{c.jobName}{c.jobAddress ? ` · ${c.jobAddress}` : ''}</span>
                    {c.jobAddress && <> · <a href={mapsHref(c.jobAddress)} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">{w.directions}</a></>}
                </p>

                <dl className="mt-3 grid grid-cols-3 divide-x divide-border border-y border-border text-sm">
                    <div className="min-w-0 py-2 pr-2"><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{w.price}</dt><dd className="mt-0.5 truncate text-base font-extrabold tabular-nums">{subMoney(c.amount, lang)}</dd></div>
                    <div className="min-w-0 px-2 py-2"><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{w.paid}</dt><dd className="mt-0.5 truncate font-bold tabular-nums">{subMoney(paid.paid, lang)}</dd></div>
                    <div className="min-w-0 py-2 pl-2"><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{w.left}</dt><dd className="mt-0.5 truncate font-bold tabular-nums">{subMoney(paid.left, lang)}</dd></div>
                </dl>
                {c.amount > 0 && (
                    <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={w.paid} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(paid.pct)}>
                            <div className="h-full rounded-full bg-success" style={{ width: `${paid.pct}%` }} />
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{w.paidPct(Math.round(paid.pct))}</span>
                    </div>
                )}
                {retainage && <p className="mt-2 text-sm text-muted-foreground">{retainage}</p>}

                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                    {dates.start && <span><span className="text-muted-foreground">{w.start}</span> <span className="font-semibold">{dates.start}</span></span>}
                    {dates.due && <span><span className="text-muted-foreground">{w.due}</span> <span className="font-semibold">{dates.due}</span></span>}
                    {!dates.start && !dates.due && <span className="text-muted-foreground">{w.noDates}</span>}
                </p>

                {c.description && (
                    <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{w.scope}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.description}</p>
                    </div>
                )}

                {pct !== null && (
                    <div className="mt-3">
                        <div className="flex items-baseline justify-between text-xs text-muted-foreground"><span className="font-semibold uppercase tracking-wider">{w.progress}</span><span>{progress}</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={w.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                )}

                {accepted && <p className="mt-3 text-sm font-semibold text-success">{accepted}</p>}

                {canAccept && (
                    <div className="mt-3 space-y-2.5 rounded-xl bg-muted/50 p-3">
                        <label className="block">
                            <span className="text-sm font-semibold">{w.nameLabel}</span>
                            <input
                                className="input mt-1 min-h-[48px] text-base"
                                value={names[c.id] || ''}
                                onChange={e => setNames(n => ({ ...n, [c.id]: e.target.value.slice(0, SUB_LIMITS.acceptName) }))}
                                placeholder={w.typeName}
                                autoComplete="name"
                                disabled={busyId === c.id}
                            />
                        </label>
                        <p className="text-xs text-muted-foreground">{w.acceptNote}</p>
                        <button type="button" className="min-h-[52px] w-full rounded-xl bg-primary text-base font-extrabold text-primary-foreground active:opacity-90 disabled:opacity-60"
                            disabled={busyId === c.id || !(names[c.id] || '').trim()} onClick={() => { void accept(c); }}>
                            {busyId === c.id ? w.accepting : w.accept}
                        </button>
                    </div>
                )}
                {msg && msg.id === c.id && <p className={`mt-2 text-sm font-medium ${msg.tone === 'error' ? 'text-destructive' : 'text-success'}`} role="status">{msg.text}</p>}
            </li>
        );
    };

    return (
        <section className="mt-6" aria-labelledby="crew-subcontract" data-testid="crew-my-subcontract">
            <div className="mb-2 flex items-baseline justify-between">
                <h2 id="crew-subcontract" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{lists.open.length + lists.finished.length > 1 ? w.titleMany : w.title}</h2>
                {shown.member?.company && <span className="truncate pl-3 text-xs text-muted-foreground">{shown.member.company}</span>}
            </div>
            {!online && <p className="mb-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="status">{w.offline}</p>}
            {fromCopy && online && <p className="mb-2 text-xs text-muted-foreground">{w.oldCopy}</p>}

            {lists.open.length > 0 && <ul className="space-y-3">{lists.open.map(card)}</ul>}

            {lists.finished.length > 0 && (lists.open.length === 0 ? (
                <ul className="space-y-3">{lists.finished.map(card)}</ul>
            ) : (
                <div className="mt-4">
                    <button type="button" className="flex min-h-[44px] w-full items-center justify-between text-left text-sm font-semibold text-muted-foreground" onClick={() => setShowFinished(v => !v)} aria-expanded={showFinished}>
                        <span>{w.finished(lists.finished.length)}</span><span className="text-primary">{showFinished ? w.hide : w.show}</span>
                    </button>
                    {showFinished && <ul className="space-y-3">{lists.finished.map(card)}</ul>}
                </div>
            ))}
        </section>
    );
};

export default CrewMySubcontract;
