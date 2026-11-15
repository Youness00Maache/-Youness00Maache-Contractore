/**
 * "My tasks" on the worker's page (/clock/<token>, no login): the open tasks the boss gave this worker, with the job,
 * the due date, notes and what they still wait for; Start / Done (with an optional photo and a short comment); the
 * tasks finished in the last 14 days are folded away. English / Spanish like the rest of the page.
 *
 * Quiet by design: if the task list can't be reached (tables not switched on, no connection and nothing saved, any
 * error) this renders nothing, so the clock-in page works exactly as before. Changes need a connection (the page
 * says so); the last list is kept on the phone so the tasks can still be read offline.
 * Calls: lib/tasks/tasksPublicApi.ts (fetchCrewTasks, updateCrewTask, uploadCrewTaskPhoto).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCrewTasks, updateCrewTask, uploadCrewTaskPhoto } from '../../lib/tasks/tasksPublicApi.ts';
import { crewDueLabel, crewTaskLists, shortDay, type TaskLang } from '../../lib/tasks/taskView.ts';
import { CrewSendError } from '../../lib/crew/punchQueue.ts';
import type { CrewTask, CrewTasksView } from '../../lib/tasks/taskTypes.ts';
import { TASK_LIMITS } from '../../lib/tasks/taskTypes.ts';
import { compressImage, describeImageError } from '../../utils/imageCompression.ts';

const WORDS = {
    en: {
        title: 'My tasks', none: 'No tasks for you right now.', start: 'Start', done: 'Done', inProgress: 'In progress', blocked: 'Blocked',
        waiting: (n: number) => `Waiting on ${n} other task${n === 1 ? '' : 's'}`, milestone: 'Milestone', directions: 'Directions',
        addPhoto: 'Add a photo', changePhoto: 'Change photo', removePhoto: 'Remove', commentPh: 'Comment for your boss (optional)', markDone: 'Mark done',
        cancel: 'Cancel', saving: 'Saving…', recent: (n: number) => `Done in the last 14 days (${n})`, hide: 'Hide', show: 'Show',
        offline: "You're offline. Tasks need a connection.", photoError: 'That photo could not be used.', sendComment: 'Send', comment: 'Comment',
        paused: 'Tasks are paused for this company right now. Ask your boss.', failed: 'That did not save. Try again.',
        photoLater: 'Marked done, but the photo was not sent.', retryPhoto: 'Send the photo again', photoSent: 'Photo sent.',
        boss: 'Boss', you: 'You', photoOn: 'Photo sent', doneOn: 'Done', oldCopy: 'Showing the last list this phone saw.',
    },
    es: {
        title: 'Mis tareas', none: 'No tienes tareas por ahora.', start: 'Empezar', done: 'Hecha', inProgress: 'En curso', blocked: 'Bloqueada',
        waiting: (n: number) => `Espera ${n} tarea${n === 1 ? '' : 's'} más`, milestone: 'Hito', directions: 'Cómo llegar',
        addPhoto: 'Agregar foto', changePhoto: 'Cambiar foto', removePhoto: 'Quitar', commentPh: 'Comentario para tu jefe (opcional)', markDone: 'Marcar como hecha',
        cancel: 'Cancelar', saving: 'Guardando…', recent: (n: number) => `Hechas en los últimos 14 días (${n})`, hide: 'Ocultar', show: 'Ver',
        offline: 'Sin conexión. Las tareas necesitan conexión.', photoError: 'No se pudo usar esa foto.', sendComment: 'Enviar', comment: 'Comentar',
        paused: 'Las tareas están en pausa para esta empresa. Pregunta a tu jefe.', failed: 'No se guardó. Inténtalo de nuevo.',
        photoLater: 'Marcada como hecha, pero la foto no se envió.', retryPhoto: 'Enviar la foto otra vez', photoSent: 'Foto enviada.',
        boss: 'Jefe', you: 'Tú', photoOn: 'Foto enviada', doneOn: 'Hecha', oldCopy: 'Mostrando la última lista que vio este teléfono.',
    },
} as const;

const CACHE_PREFIX = 'cd.crew.tasks:';
const safeGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } };

/** The last list from the phone (checked: anything unreadable is ignored). */
const readCache = (token: string): CrewTasksView | null => {
    try {
        const raw = JSON.parse(safeGet(CACHE_PREFIX + token) || 'null');
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) return null;
        const tasks = (raw.tasks as unknown[]).filter((t): t is CrewTask => !!t && typeof t === 'object' && typeof (t as CrewTask).id === 'string' && typeof (t as CrewTask).title === 'string'
            && Array.isArray((t as CrewTask).comments)).slice(0, 200);
        return { serverNow: typeof raw.serverNow === 'string' ? raw.serverNow : new Date().toISOString(), tasks };
    } catch { return null; }
};

const mapsHref = (address: string) => (address.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}` : '');

/** A ring (diamond for a milestone): hollow = to do, half = in progress, solid = done. */
const Ring: React.FC<{ status: CrewTask['status']; milestone: boolean; late: boolean }> = ({ status, milestone, late }) => {
    const shape = milestone ? 'rotate-45 rounded-[5px]' : 'rounded-full';
    const edge = status === 'done' ? 'border-success bg-success' : late ? 'border-destructive' : status === 'doing' ? 'border-primary' : 'border-muted-foreground/60';
    return (
        <span className={`relative mt-1 block h-5 w-5 shrink-0 border-2 bg-background ${shape} ${edge}`} aria-hidden>
            {status === 'doing' && <span className={`absolute inset-0 overflow-hidden ${shape}`}><span className="absolute inset-y-0 left-0 w-1/2 bg-primary" /></span>}
        </span>
    );
};

interface Pick { blob: Blob; url: string; type: 'jpg' | 'png' | 'webp' }

const CrewMyTasks: React.FC<{ token: string; lang: TaskLang; today: string; now: number; online: boolean }> = ({ token, lang, today, now, online }) => {
    const w = WORDS[lang];
    const [view, setView] = useState<CrewTasksView | null>(() => readCache(token));
    const [fromCopy, setFromCopy] = useState(() => readCache(token) !== null);
    const [paused, setPaused] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [photo, setPhoto] = useState<Pick | null>(null);
    const [photoError, setPhotoError] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ id: string; text: string; tone: 'error' | 'info' } | null>(null);
    const [retry, setRetry] = useState<{ taskId: string; path: string; blob: Blob } | null>(null);
    const [showDone, setShowDone] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const photoRef = useRef(photo);
    photoRef.current = photo;
    useEffect(() => () => { if (photoRef.current) URL.revokeObjectURL(photoRef.current.url); }, []);

    const load = useCallback(async () => {
        try {
            const v = await fetchCrewTasks(token);
            setView(v);
            setFromCopy(false);
            setPaused(false);
            safeSet(CACHE_PREFIX + token, JSON.stringify(v));
        } catch (e) {
            const kind = e instanceof CrewSendError ? e.kind : 'unknown';
            if (kind === 'paused') setPaused(true);
            // anything else (not switched on, no connection, invalid link): keep what we have, show nothing new
            if (kind === 'invalid_link' || kind === 'unavailable') { setView(null); safeSet(CACHE_PREFIX + token, null); }
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

    const lists = useMemo(() => crewTaskLists(view?.tasks || [], now), [view, now]);

    const clearForm = () => {
        setOpenId(null);
        setComment('');
        setPhotoError('');
        if (photo) URL.revokeObjectURL(photo.url);
        setPhoto(null);
    };

    const pickPhoto = async (file: File | undefined) => {
        setPhotoError('');
        if (!file) return;
        try {
            const out = await compressImage(file);
            const type = out.type === 'image/jpeg' ? 'jpg' : out.type === 'image/png' ? 'png' : out.type === 'image/webp' ? 'webp' : null;
            if (!type || out.size > 4 * 1024 * 1024) throw new Error(w.photoError);
            if (photo) URL.revokeObjectURL(photo.url);
            setPhoto({ blob: out, url: URL.createObjectURL(out), type });
        } catch (e) {
            setPhotoError(describeImageError(e) || w.photoError);
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const patchTask = (id: string, patch: (t: CrewTask) => CrewTask) => {
        setView(v => {
            if (!v) return v;
            const next = { ...v, tasks: v.tasks.map(t => (t.id === id ? patch(t) : t)) };
            safeSet(CACHE_PREFIX + token, JSON.stringify(next));
            return next;
        });
    };

    const send = async (task: CrewTask, change: { status?: 'doing' | 'done'; comment?: string; withPhoto?: Pick | null }) => {
        if (busyId) return;
        if (!online) { setMsg({ id: task.id, text: w.offline, tone: 'error' }); return; }
        setBusyId(task.id);
        setMsg(null);
        try {
            const text = (change.comment || '').trim().slice(0, TASK_LIMITS.crewComment);
            const res = await updateCrewTask(token, task.id, { status: change.status || null, comment: text || null, photoType: change.withPhoto?.type || null });
            patchTask(task.id, t => ({
                ...t,
                status: res.status,
                completedAt: res.status === 'done' ? (res.completedAt || new Date().toISOString()) : res.completedAt,
                hasPhoto: res.hasPhoto || t.hasPhoto,
                comments: text ? [...t.comments, { id: `local-${Date.now()}`, body: text, authorKind: 'crew', authorName: null, createdAt: new Date().toISOString() }] : t.comments,
            }));
            if (change.withPhoto && res.uploadPath) {
                try {
                    await uploadCrewTaskPhoto(res.uploadPath, change.withPhoto.blob);
                    patchTask(task.id, t => ({ ...t, hasPhoto: true }));
                    setMsg({ id: task.id, text: w.photoSent, tone: 'info' });
                } catch {
                    setRetry({ taskId: task.id, path: res.uploadPath, blob: change.withPhoto.blob });
                    setMsg({ id: task.id, text: w.photoLater, tone: 'error' });
                }
            }
            clearForm();
        } catch (e) {
            if (e instanceof CrewSendError && e.kind === 'paused') setPaused(true);
            setMsg({ id: task.id, text: e instanceof CrewSendError && e.kind !== 'unknown' && e.kind !== 'rejected' ? e.message : w.failed, tone: 'error' });
        } finally {
            setBusyId(null);
        }
    };

    const retryPhoto = async () => {
        if (!retry || busyId) return;
        setBusyId(retry.taskId);
        try {
            await uploadCrewTaskPhoto(retry.path, retry.blob);
            patchTask(retry.taskId, t => ({ ...t, hasPhoto: true }));
            setMsg({ id: retry.taskId, text: w.photoSent, tone: 'info' });
            setRetry(null);
        } catch {
            setMsg({ id: retry.taskId, text: w.photoLater, tone: 'error' });
        } finally {
            setBusyId(null);
        }
    };

    // nothing to show: no list (feature off / unreachable / invalid) or no tasks at all
    if (!view) return paused ? (
        <section className="mt-6" aria-labelledby="crew-tasks"><h2 id="crew-tasks" className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{w.title}</h2><p className="rounded-xl border border-border bg-muted px-3 py-2.5 text-sm">{w.paused}</p></section>
    ) : null;
    if (!lists.open.length && !lists.done.length && !paused) return null;

    const year = Number(today.slice(0, 4));
    const doneDay = (t: CrewTask) => (t.completedAt ? shortDay(t.completedAt.slice(0, 10), lang, year) : '');

    return (
        <section className="mt-6" aria-labelledby="crew-tasks">
            <div className="mb-2 flex items-baseline justify-between">
                <h2 id="crew-tasks" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{w.title}</h2>
                {lists.open.length > 0 && <span className="font-mono text-sm font-bold tabular-nums">{lists.open.length}</span>}
            </div>
            {paused && <p className="mb-2 rounded-xl border border-border bg-muted px-3 py-2.5 text-sm">{w.paused}</p>}
            {!online && <p className="mb-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="status">{w.offline}</p>}
            {fromCopy && online && <p className="mb-2 text-xs text-muted-foreground">{w.oldCopy}</p>}

            {lists.open.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">{w.none}</p>
            ) : (
                <ul className="space-y-3">
                    {lists.open.map(t => {
                        const due = crewDueLabel(t, today, lang);
                        const opening = openId === t.id;
                        const last = t.comments.slice(-2);
                        return (
                            <li key={t.id} className="rounded-2xl border border-border bg-card p-4">
                                <div className="flex items-start gap-3">
                                    <Ring status={t.status} milestone={t.isMilestone} late={due.late} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-base font-bold leading-snug">{t.title}</p>
                                        <p className="mt-0.5 truncate text-sm text-muted-foreground">{t.jobName}{t.jobAddress ? ` · ${t.jobAddress}` : ''}</p>
                                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                            <span className={due.late ? 'font-bold text-destructive' : 'font-semibold text-foreground'}>{due.text}</span>
                                            {t.isMilestone && <span className="text-muted-foreground">{w.milestone}</span>}
                                            {t.status === 'doing' && <span className="font-semibold text-primary">{w.inProgress}</span>}
                                            {t.waitingOn > 0 && <span className="font-semibold text-warning">{w.waiting(t.waitingOn)}</span>}
                                            {t.jobAddress && <a href={mapsHref(t.jobAddress)} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">{w.directions}</a>}
                                        </p>
                                        {t.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{t.notes}</p>}
                                        {last.length > 0 && (
                                            <ul className="mt-2 space-y-1">
                                                {last.map(c => <li key={c.id} className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs"><span className="font-semibold">{c.authorKind === 'owner' ? w.boss : (c.authorName || w.you)}:</span> {c.body}</li>)}
                                            </ul>
                                        )}
                                    </div>
                                </div>

                                {!opening ? (
                                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                                        {t.status !== 'doing'
                                            ? <button type="button" className="min-h-[52px] rounded-xl border-2 border-border bg-card text-base font-bold active:bg-muted disabled:opacity-60" disabled={!!busyId || paused} onClick={() => { void send(t, { status: 'doing' }); }}>{w.start}</button>
                                            : <button type="button" className="min-h-[52px] rounded-xl border-2 border-border bg-card text-base font-bold active:bg-muted disabled:opacity-60" disabled={!!busyId || paused} onClick={() => { setOpenId(t.id); setComment(''); setMsg(null); }}>{w.comment}</button>}
                                        <button type="button" className="min-h-[52px] rounded-xl bg-primary text-base font-extrabold text-primary-foreground active:opacity-90 disabled:opacity-60" disabled={!!busyId || paused} onClick={() => { setOpenId(t.id); setMsg(null); }}>{w.done}</button>
                                    </div>
                                ) : (
                                    <div className="mt-3 space-y-3 rounded-xl bg-muted/50 p-3">
                                        <textarea value={comment} onChange={e => setComment(e.target.value.slice(0, TASK_LIMITS.crewComment))} rows={2} placeholder={w.commentPh} aria-label={w.commentPh} className="input min-h-[72px] text-base" />
                                        <div className="flex items-center gap-3">
                                            {photo && <img src={photo.url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
                                            <button type="button" className="btn btn-outline min-h-[48px]" onClick={() => fileRef.current?.click()}>{photo ? w.changePhoto : w.addPhoto}</button>
                                            {photo && <button type="button" className="min-h-[44px] text-sm font-medium text-muted-foreground" onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); }}>{w.removePhoto}</button>}
                                            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { void pickPhoto(e.target.files?.[0]); }} />
                                        </div>
                                        {photoError && <p className="text-sm font-medium text-destructive">{photoError}</p>}
                                        <div className="grid grid-cols-2 gap-2.5">
                                            <button type="button" className="min-h-[52px] rounded-xl border-2 border-border bg-card text-base font-bold active:bg-muted" onClick={clearForm} disabled={busyId === t.id}>{w.cancel}</button>
                                            <button type="button" className="min-h-[52px] rounded-xl bg-primary text-base font-extrabold text-primary-foreground active:opacity-90 disabled:opacity-60" disabled={busyId === t.id}
                                                onClick={() => { void send(t, { status: 'done', comment, withPhoto: photo }); }}>
                                                {busyId === t.id ? w.saving : w.markDone}
                                            </button>
                                        </div>
                                        {t.status === 'doing' && comment.trim() && (
                                            <button type="button" className="min-h-[44px] text-sm font-semibold text-primary disabled:opacity-60" disabled={busyId === t.id} onClick={() => { void send(t, { comment }); }}>{w.sendComment}</button>
                                        )}
                                    </div>
                                )}
                                {msg && msg.id === t.id && <p className={`mt-2 text-sm font-medium ${msg.tone === 'error' ? 'text-destructive' : 'text-success'}`} role="status">{msg.text}</p>}
                                {retry && retry.taskId === t.id && <button type="button" className="btn btn-outline mt-2 min-h-[48px]" disabled={!!busyId || !online} onClick={() => { void retryPhoto(); }}>{w.retryPhoto}</button>}
                            </li>
                        );
                    })}
                </ul>
            )}

            {lists.done.length > 0 && (
                <div className="mt-4">
                    <button type="button" className="flex min-h-[44px] w-full items-center justify-between text-left text-sm font-semibold text-muted-foreground" onClick={() => setShowDone(v => !v)} aria-expanded={showDone}>
                        <span>{w.recent(lists.done.length)}</span><span className="text-primary">{showDone ? w.hide : w.show}</span>
                    </button>
                    {showDone && (
                        <ul className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
                            {lists.done.map(t => (
                                <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                                    <Ring status="done" milestone={t.isMilestone} late={false} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold text-muted-foreground line-through decoration-muted-foreground/40">{t.title}</span>
                                        <span className="block truncate text-xs text-muted-foreground">{t.jobName} · {w.doneOn} {doneDay(t)}{t.hasPhoto ? ` · ${w.photoOn}` : ''}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {retry && !lists.open.some(t => t.id === retry.taskId) && (
                <div className="mt-3">
                    <p className="text-sm font-medium text-destructive">{w.photoLater}</p>
                    <button type="button" className="btn btn-outline mt-2 min-h-[48px]" disabled={!!busyId || !online} onClick={() => { void retryPhoto(); }}>{w.retryPhoto}</button>
                </div>
            )}
        </section>
    );
};

export default CrewMyTasks;
