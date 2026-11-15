/**
 * The crew member's clock-in page: /clock/<token> (no login, no app shell, its own small chunk; index.tsx).
 * Phone-first: today's assigned jobs, one big button for what comes next (Clock in → Clock out / Start break →
 * End break), an optional note or photo for the punch, today's punches and the week's hours. No prices, no rates.
 *
 * Location: asked once ("Save your location when you tap?"); with a yes, ONE reading is taken at each tap and
 * nowhere else. No or no reading = the punch is still saved, flagged "No location" for the boss.
 * Offline: every tap is stored on the phone first (lib/crew/punchQueue.ts) and sent in order when the connection is
 * back; the page itself opens offline from the last copy it saw.
 * English / Spanish by the phone's language (toggle at the bottom).
 * "My tasks" (components/crew/CrewMyTasks.tsx): the job tasks the boss gave this worker, Start / Done with a photo.
 */
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    allowedKinds, buildSessions, clockLabel, distanceLabel, durationLabel, firstName, isCrewToken, localDayOf, mapPortal, newClientId,
    punchLocationFlag, splitPortalJobs, workedInWeek, workerState, type PortalJob, type Punch, type PunchKind, type WorkerPortal,
} from '../../lib/crew/crewLogic.ts';
import {
    createBrowserCrewStore, dismissRejected, enqueuePunch, mergePunches, parseQueue, pendingCount, queueKey, syncPunchQueue,
    type PhotoType, type QueuedLocation, type QueuedPunch,
} from '../../lib/crew/punchQueue.ts';
import { CrewSendError } from '../../lib/crew/punchQueue.ts';
import { parseLocalDate } from '../../utils/localDates.ts';
import { fetchWorkerPortal, workerSender } from '../../lib/crew/crewPublicApi.ts';
import { compressImage, describeImageError } from '../../utils/imageCompression.ts';
import { registerOfflineShell, warmOfflineShell } from '../../lib/offline/offlineShell.ts';

// "My tasks" (job tasks the boss gave this worker): its own small chunk; renders nothing when the task list can't be reached
const CrewMyTasks = lazy(() => import('./CrewMyTasks.tsx'));
// "My subcontract" (roadmap D7): for a subcontractor with work sent to them; renders nothing for workers or when it can't be reached
const CrewMySubcontract = lazy(() => import('./CrewMySubcontract.tsx'));

/** A problem inside the task list must never break the clock-in page. */
class TasksBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? null : this.props.children; }
}

// ------------------------------------------------------------------------------------------------------------- words
type Lang = 'en' | 'es';
const EN = {
        offClock: 'Off the clock', onClock: 'On the clock', onBreak: 'On break', since: 'since',
        clockIn: 'Clock in', clockOut: 'Clock out', startBreak: 'Start break', endBreak: 'End break', switchHere: 'Switch here',
        todaysJobs: "Today's jobs", comingUp: 'Coming up', noJobs: 'No jobs for you today. Your boss adds you to a job and it shows here.',
        directions: 'Directions', addExtras: 'Add a note or photo', hideExtras: 'Hide note and photo', notePh: 'Note for this punch (optional)',
        photo: 'Photo', changePhoto: 'Change photo', removePhoto: 'Remove', today: 'Today', thisWeek: 'This week', nothingYet: 'No punches yet today.',
        waiting: (n: number) => `${n} punch${n === 1 ? '' : 'es'} waiting to send. They go out by themselves when you're online.`,
        sending: 'Sending…', allSaved: 'All punches saved.', notSaved: 'Not saved', dismiss: 'OK',
        offline: "You're offline. Punches are saved on this phone.", locating: 'Getting your location…', saving: 'Saving…',
        locTitle: 'Save your location when you tap?',
        locBody: 'Your boss sees where you were at the moment you clock in or out. Only at the tap: never in between, never in the background.',
        locAllow: 'Allow location', locSkip: 'Not now', locOn: 'Location at the tap: on', locOff: 'Location: off', change: 'Change',
        savedIn: 'Clocked in', savedOut: 'Clocked out', savedBreak: 'Break started', savedBreakEnd: 'Break ended',
        locSaved: 'Location saved.', locNone: 'No location saved: your boss will see “No location”.',
        far: (d: string) => `You're about ${d} from the job site. The punch is saved; your boss will see it was far from the job.`,
        later: () => `Will send when you're online.`,
        invalidTitle: "This link doesn't work anymore", invalidBody: 'Ask your boss for a new clock-in link.',
        pausedTitle: 'Clock-in is paused', pausedBody: (c: string) => `Ask ${c || 'your boss'}. Punches already on this phone are kept.`,
        neverOpened: "You're offline and this link hasn't been opened on this phone yet. Open it once with a connection.",
        retry: 'Try again', call: (c: string) => `Call ${c}`, keep: 'Keep this link: bookmark it or add it to your home screen.',
        clockSkew: (m: number) => `Your phone's clock is ${m} min off. Punches use the phone's time; please fix it in Settings.`,
        lateTitle: 'Still clocked in from earlier', lateBody: 'Clock out now; your boss can fix the time.',
        lang: 'Español', unsentDead: 'These punches were not sent. Tell your boss the times:', photoError: 'That photo could not be used.',
        brk: 'break', jobPick: 'Clock in to', job: 'Job',
};
type Words = typeof EN;
const ES: Words = {
        offClock: 'Fuera de turno', onClock: 'En turno', onBreak: 'En descanso', since: 'desde',
        clockIn: 'Marcar entrada', clockOut: 'Marcar salida', startBreak: 'Iniciar descanso', endBreak: 'Terminar descanso', switchHere: 'Cambiar aquí',
        todaysJobs: 'Trabajos de hoy', comingUp: 'Próximos', noJobs: 'No tienes trabajos hoy. Tu jefe te agrega a un trabajo y aparece aquí.',
        directions: 'Cómo llegar', addExtras: 'Agregar nota o foto', hideExtras: 'Ocultar nota y foto', notePh: 'Nota para esta marca (opcional)',
        photo: 'Foto', changePhoto: 'Cambiar foto', removePhoto: 'Quitar', today: 'Hoy', thisWeek: 'Esta semana', nothingYet: 'Todavía no hay marcas hoy.',
        waiting: (n: number) => `${n} marca${n === 1 ? '' : 's'} por enviar. Se envían solas cuando tengas conexión.`,
        sending: 'Enviando…', allSaved: 'Todas las marcas guardadas.', notSaved: 'No guardada', dismiss: 'OK',
        offline: 'Sin conexión. Las marcas se guardan en este teléfono.', locating: 'Obteniendo tu ubicación…', saving: 'Guardando…',
        locTitle: '¿Guardar tu ubicación al marcar?',
        locBody: 'Tu jefe ve dónde estabas en el momento de marcar entrada o salida. Solo al tocar: nunca entre medio ni en segundo plano.',
        locAllow: 'Permitir ubicación', locSkip: 'Ahora no', locOn: 'Ubicación al marcar: sí', locOff: 'Ubicación: no', change: 'Cambiar',
        savedIn: 'Entrada marcada', savedOut: 'Salida marcada', savedBreak: 'Descanso iniciado', savedBreakEnd: 'Descanso terminado',
        locSaved: 'Ubicación guardada.', locNone: 'Sin ubicación: tu jefe verá “Sin ubicación”.',
        far: (d: string) => `Estás a unos ${d} del trabajo. La marca se guardó; tu jefe verá que estabas lejos.`,
        later: () => 'Se enviará cuando tengas conexión.',
        invalidTitle: 'Este enlace ya no funciona', invalidBody: 'Pide a tu jefe un nuevo enlace para marcar.',
        pausedTitle: 'Las marcas están en pausa', pausedBody: (c: string) => `Pregunta a ${c || 'tu jefe'}. Las marcas en este teléfono se conservan.`,
        neverOpened: 'Sin conexión, y este enlace no se ha abierto antes en este teléfono. Ábrelo una vez con conexión.',
        retry: 'Reintentar', call: (c: string) => `Llamar a ${c}`, keep: 'Guarda este enlace: márcalo como favorito o agrégalo a tu pantalla de inicio.',
        clockSkew: (m: number) => `El reloj de tu teléfono está desfasado ${m} min. Las marcas usan la hora del teléfono; corrígela en Ajustes.`,
        lateTitle: 'Sigues en turno desde antes', lateBody: 'Marca la salida ahora; tu jefe puede corregir la hora.',
        lang: 'English', unsentDead: 'Estas marcas no se enviaron. Dile las horas a tu jefe:', photoError: 'No se pudo usar esa foto.',
        brk: 'descanso', jobPick: 'Marcar entrada en', job: 'Trabajo',
};
const WORDS: Record<Lang, Words> = { en: EN, es: ES };

const KIND_WORD = (w: Words, k: PunchKind) => ({ in: w.savedIn, out: w.savedOut, break_start: w.savedBreak, break_end: w.savedBreakEnd }[k]);

// ------------------------------------------------------------------------------------------------------------- device
const safeGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } };

const portalCacheKey = (token: string) => `cd.crew.portal:${token}`;
const consentKey = (token: string) => `cd.crew.geo:${token}`;
const LANG_KEY = 'cd.crew.lang';

type Position = { lat: number; lng: number; accuracy: number } | { status: Exclude<QueuedLocation, 'ok' | 'skipped'> };

/** ONE reading, right now (never watchPosition). */
const readPosition = (): Promise<Position> => new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { resolve({ status: 'unavailable' }); return; }
    let done = false;
    const finish = (v: Position) => { if (!done) { done = true; resolve(v); } };
    const timer = window.setTimeout(() => finish({ status: 'timeout' }), 12_000);
    try {
        navigator.geolocation.getCurrentPosition(
            pos => { window.clearTimeout(timer); finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0) }); },
            err => { window.clearTimeout(timer); finish({ status: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable' }); },
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
        );
    } catch {
        window.clearTimeout(timer);
        finish({ status: 'unavailable' });
    }
});

const mapsHref = (address: string) => (address.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}` : '');
const telHref = (phone: string) => { const d = phone.replace(/[^\d+]/g, ''); return d.replace(/\D/g, '').length >= 6 ? `tel:${d}` : ''; };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '·';

// ------------------------------------------------------------------------------------------------------------- bits
const STATUS_TONE = {
    off: { dot: 'bg-muted-foreground/50', text: 'text-muted-foreground', band: 'bg-muted' },
    working: { dot: 'bg-success', text: 'text-success', band: 'bg-success' },
    break: { dot: 'bg-warning', text: 'text-warning', band: 'bg-warning' },
} as const;

const BigButton: React.FC<{ onClick: () => void; disabled?: boolean; tone: 'primary' | 'dark' | 'outline' | 'warning'; children: React.ReactNode; label?: string }> = ({ onClick, disabled, tone, children, label }) => {
    const cls = {
        primary: 'bg-primary text-primary-foreground shadow-[0_6px_0_0_hsl(var(--primary)/0.35)] active:translate-y-[3px] active:shadow-[0_3px_0_0_hsl(var(--primary)/0.35)]',
        dark: 'bg-foreground text-background shadow-[0_6px_0_0_hsl(var(--foreground)/0.25)] active:translate-y-[3px] active:shadow-[0_3px_0_0_hsl(var(--foreground)/0.25)]',
        warning: 'bg-warning text-warning-foreground shadow-[0_6px_0_0_hsl(var(--warning)/0.35)] active:translate-y-[3px] active:shadow-[0_3px_0_0_hsl(var(--warning)/0.35)]',
        outline: 'border-2 border-border bg-card text-foreground active:bg-muted',
    }[tone];
    return (
        <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
            className={`flex min-h-[64px] w-full items-center justify-center rounded-2xl px-5 text-lg font-extrabold tracking-tight transition-[transform,box-shadow] disabled:opacity-60 ${cls}`}>
            {children}
        </button>
    );
};

/** The punch strip: times down a perforated line, like a paper time card. */
/** "Fri 7:02 AM" for a time that isn't today, else "7:02 AM". */
const whenLabel = (t: number, today: string, lang: Lang): string =>
    localDayOf(t) === today ? clockLabel(t) : `${new Date(t).toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { weekday: 'short' })} ${clockLabel(t)}`;

const PunchStrip: React.FC<{ punches: Punch[]; jobs: Map<string, PortalJob>; w: Words; today: string; lang: Lang }> = ({ punches, jobs, w, today, lang }) => (
    <ol className="relative ml-1 border-l-2 border-dashed border-border pl-4">
        {punches.map(p => {
            const job = jobs.get(p.jobId);
            // the account copy has no coordinates (the page never gets them back), only the status and the distance
            const loc = p.lat !== null && p.lat !== undefined
                ? punchLocationFlag(p, job?.site || null)
                : p.locationStatus !== 'ok'
                    ? { flag: 'no_location' as const, distanceM: null }
                    : p.distanceM !== null && p.distanceM !== undefined && job?.site && p.distanceM > job.site.radiusM
                        ? { flag: 'far' as const, distanceM: p.distanceM }
                        : { flag: 'ok' as const, distanceM: p.distanceM ?? null };
            return (
                <li key={p.id} className="relative py-1.5">
                    <span className={`absolute -left-[23px] top-3 h-3 w-3 rounded-full border-2 border-card ${p.kind === 'in' ? 'bg-success' : p.kind === 'out' ? 'bg-foreground' : 'bg-warning'}`} aria-hidden />
                    <div className="flex items-baseline gap-2">
                        <span className="min-w-[4.6rem] shrink-0 font-mono text-[15px] font-bold tabular-nums text-foreground">{whenLabel(new Date(p.at).getTime(), today, lang)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {KIND_WORD(w, p.kind)}{job && p.kind === 'in' ? <span className="text-muted-foreground"> · {job.name}</span> : null}
                        </span>
                        {p.pending
                            ? <span className="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">⏳</span>
                            : loc.flag === 'no_location'
                                ? <span className="shrink-0 text-[11px] font-medium text-muted-foreground">⌀ GPS</span>
                                : loc.flag === 'far'
                                    ? <span className="shrink-0 text-[11px] font-semibold text-warning">{distanceLabel(loc.distanceM || 0)}</span>
                                    : null}
                    </div>
                    {p.note && <p className="ml-[5.1rem] mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.note}</p>}
                </li>
            );
        })}
    </ol>
);

// ------------------------------------------------------------------------------------------------------------- page
type LoadState = 'loading' | 'ready' | 'invalid' | 'never' | 'error';
interface PendingAction { kind: PunchKind; jobId: string; switchFrom?: string | null }
interface Flash { tone: 'success' | 'warning' | 'info'; title: string; lines: string[] }

const CrewClockPage: React.FC<{ token: string }> = ({ token }) => {
    const validToken = isCrewToken(token);
    const [lang, setLang] = useState<Lang>(() => {
        const saved = safeGet(LANG_KEY);
        if (saved === 'en' || saved === 'es') return saved;
        return typeof navigator !== 'undefined' && /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
    });
    const w = WORDS[lang];
    const store = useMemo(() => createBrowserCrewStore(), []);
    const key = queueKey(token);
    const [portal, setPortal] = useState<WorkerPortal | null>(() => {
        if (!validToken) return null;
        const raw = safeGet(portalCacheKey(token));
        if (!raw) return null;
        try { return mapPortal(JSON.parse(raw)); } catch { return null; }
    });
    const [load, setLoad] = useState<LoadState>(validToken ? 'loading' : 'invalid');
    const [loadMsg, setLoadMsg] = useState('');
    const [queue, setQueue] = useState<QueuedPunch[]>([]);
    const [now, setNow] = useState(() => Date.now());
    const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
    const [busy, setBusy] = useState<'locating' | 'saving' | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [consent, setConsent] = useState<'yes' | 'no' | null>(() => {
        const v = safeGet(consentKey(token));
        return v === 'yes' || v === 'no' ? v : null;
    });
    const [ask, setAsk] = useState<PendingAction | null>(null);
    const [extras, setExtras] = useState(false);
    const [note, setNote] = useState('');
    const [photo, setPhoto] = useState<{ blob: Blob; url: string; type: PhotoType } | null>(null);
    const [photoError, setPhotoError] = useState('');
    const [flash, setFlash] = useState<Flash | null>(null);
    const [skewMin, setSkewMin] = useState(0);
    const [dead, setDead] = useState<'invalid_link' | 'paused' | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const photoRef = useRef(photo);
    photoRef.current = photo;

    useEffect(() => () => { if (photoRef.current) URL.revokeObjectURL(photoRef.current.url); }, []);

    // the page: own title, no app manifest (so "Add to Home Screen" keeps THIS link), opens offline next time
    useEffect(() => {
        const prev = document.title;
        document.title = portal?.company.name ? `${w.clockIn} · ${portal.company.name}` : 'Clock in';
        return () => { document.title = prev; };
    }, [portal?.company.name, w.clockIn]);
    useEffect(() => {
        document.querySelectorAll('link[rel="manifest"]').forEach(el => el.parentElement?.removeChild(el));
        const robots = document.createElement('meta');
        robots.name = 'robots';
        robots.content = 'noindex, nofollow';
        document.head.appendChild(robots);
        registerOfflineShell();
        return () => { robots.remove(); };
    }, []);

    // ---------------------------------------------------------------- reads
    const refreshQueue = useCallback(async () => {
        if (!validToken) return [];
        const items = parseQueue(await store.readQueue(key));
        setQueue(items);
        return items;
    }, [store, key, validToken]);

    const refreshPortal = useCallback(async () => {
        if (!validToken) return;
        const asked = Date.now();
        try {
            const p = await fetchWorkerPortal(token);
            setPortal(p);
            setLoad('ready');
            setDead(p.paused ? 'paused' : null);
            safeSet(portalCacheKey(token), JSON.stringify({
                member: p.member, company: { name: p.company.name, logo_url: p.company.logoUrl, phone: p.company.phone }, paused: p.paused,
                server_now: p.serverNow,
                jobs: p.jobs.map(j => ({ ...j, site: j.site ? { lat: j.site.lat, lng: j.site.lng, radius_m: j.site.radiusM } : null })),
                punches: p.punches.map(x => ({ id: x.id, client_id: x.clientId, job_id: x.jobId, kind: x.kind, at: x.at, location: x.locationStatus, distance_m: x.distanceM, note: x.note })),
            }));
            if (p.serverNow) {
                const skew = (new Date(p.serverNow).getTime() - (asked + Date.now()) / 2) / 60_000;
                setSkewMin(Math.abs(skew) >= 10 ? Math.round(Math.abs(skew)) : 0);
            }
            warmOfflineShell();
        } catch (e) {
            const kind = e instanceof CrewSendError ? e.kind : 'unknown';
            if (kind === 'invalid_link') {
                setLoad('invalid');
                setDead('invalid_link');
                safeSet(portalCacheKey(token), null);
                setPortal(null);
                return;
            }
            setLoadMsg((e as Error)?.message || '');
            setLoad(prev => (prev === 'ready' ? 'ready' : portal || safeGet(portalCacheKey(token)) ? 'ready' : kind === 'network' ? 'never' : 'error'));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, validToken]);

    const sync = useCallback(async () => {
        if (!validToken || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
        const items = parseQueue(await store.readQueue(key));
        if (!pendingCount(items)) return;
        setSyncing(true);
        try {
            const report = await syncPunchQueue(store, key, workerSender(token));
            if (report.stoppedBy === 'invalid_link' || report.stoppedBy === 'paused') setDead(report.stoppedBy);
            if (report.sent) await refreshPortal();
        } finally {
            setSyncing(false);
            await refreshQueue();
        }
    }, [store, key, token, validToken, refreshPortal, refreshQueue]);

    useEffect(() => {
        if (!validToken) return;
        void (async () => {
            await refreshQueue();
            await refreshPortal();
            await sync();
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        const tick = window.setInterval(() => setNow(Date.now()), 15_000);
        const goOnline = () => { setOnline(true); void sync(); void refreshPortal(); };
        const goOffline = () => setOnline(false);
        let lastBack = Date.now();
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            setNow(Date.now());
            if (Date.now() - lastBack > 60_000) { lastBack = Date.now(); void sync(); void refreshPortal(); }
        };
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(tick);
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [sync, refreshPortal]);

    // ---------------------------------------------------------------- derived
    const punches = useMemo(() => mergePunches(portal?.punches || [], queue, 'me'), [portal?.punches, queue]);
    const state = useMemo(() => workerState(punches, now), [punches, now]);
    const sessions = useMemo(() => buildSessions(punches, { now }), [punches, now]);
    const today = localDayOf(now);
    const jobsById = useMemo(() => new Map((portal?.jobs || []).map(j => [j.id, j])), [portal?.jobs]);
    const split = useMemo(() => splitPortalJobs(portal?.jobs || [], today, state.jobId), [portal?.jobs, today, state.jobId]);
    const todayPunches = useMemo(() => punches.filter(p => localDayOf(new Date(p.at).getTime()) === today || (state.session && state.session.punches.some(x => x.id === p.id)))
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()), [punches, today, state.session]);
    const weekMs = workedInWeek(sessions, today);
    const waiting = pendingCount(queue);
    const rejected = queue.filter(q => q.status === 'rejected');
    const currentJob = state.jobId ? jobsById.get(state.jobId) || null : null;
    const companyName = portal?.company.name || '';
    const allowed = allowedKinds(state.status);

    // ---------------------------------------------------------------- punching
    const pickPhoto = async (file: File | undefined) => {
        setPhotoError('');
        if (!file) return;
        try {
            const out = await compressImage(file);
            const type: PhotoType | null = out.type === 'image/jpeg' ? 'jpg' : out.type === 'image/png' ? 'png' : out.type === 'image/webp' ? 'webp' : null;
            if (!type || out.size > 4 * 1024 * 1024) throw new Error(w.photoError);
            if (photo) URL.revokeObjectURL(photo.url);
            setPhoto({ blob: out, url: URL.createObjectURL(out), type });
        } catch (e) {
            setPhotoError(describeImageError(e) || w.photoError);
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const punch = async (action: PendingAction, consentNow: 'yes' | 'no' | null = consent) => {
        if (busy) return;
        if (consentNow === null) { setAsk(action); return; }
        const tapped = Date.now();
        setFlash(null);
        let pos: Position | null = null;
        if (consentNow === 'yes') {
            setBusy('locating');
            pos = await readPosition();
        }
        setBusy('saving');
        try {
            const loc = pos && 'lat' in pos ? pos : null;
            const location: QueuedLocation = loc ? 'ok' : consentNow === 'no' ? 'skipped' : (pos as { status: QueuedLocation } | null)?.status || 'unavailable';
            const base = {
                lat: loc?.lat ?? null, lng: loc?.lng ?? null, accuracy: loc?.accuracy ?? null, location,
                status: 'pending' as const, attempts: 0, error: null, savedId: null, uploadPath: null,
            };
            const list: QueuedPunch[] = [];
            if (action.switchFrom) {
                list.push({ ...base, clientId: newClientId(), jobId: action.switchFrom, kind: 'out', at: new Date(tapped).toISOString(), note: '', photoType: null, queuedAt: new Date().toISOString() });
            }
            const main: QueuedPunch = {
                ...base, clientId: newClientId(), jobId: action.jobId, kind: action.kind,
                at: new Date(action.switchFrom ? tapped + 1000 : tapped).toISOString(),
                note: note.trim().slice(0, 500), photoType: photo?.type || null, queuedAt: new Date().toISOString(),
            };
            list.push(main);
            if (photo) await store.putPhoto(main.clientId, photo.blob);
            let items = parseQueue(await store.readQueue(key));
            for (const p of list) items = enqueuePunch(items, p);
            await store.writeQueue(key, items);
            setQueue(items);
            setNow(Date.now());
            setNote('');
            if (photo) URL.revokeObjectURL(photo.url);
            setPhoto(null);
            setExtras(false);

            const job = jobsById.get(action.jobId);
            const lines: string[] = [];
            let tone: Flash['tone'] = 'success';
            if (loc) {
                const flag = punchLocationFlag({ lat: loc.lat, lng: loc.lng, accuracyM: loc.accuracy, locationStatus: 'ok' }, job?.site || null);
                if (flag.flag === 'far') { lines.push(w.far(distanceLabel(flag.distanceM || 0))); tone = 'warning'; } else lines.push(w.locSaved);
            } else {
                lines.push(w.locNone);
                tone = 'info';
            }
            if (typeof navigator !== 'undefined' && navigator.onLine === false) lines.push(w.later());
            setFlash({ tone, title: `${KIND_WORD(w, action.kind)} · ${clockLabel(tapped)}${job && action.kind === 'in' ? ` · ${job.name}` : ''}`, lines });
        } finally {
            setBusy(null);
        }
        void sync();
    };

    const answerConsent = (yes: boolean) => {
        const v = yes ? 'yes' : 'no';
        safeSet(consentKey(token), v);
        setConsent(v);
        const pending = ask;
        setAsk(null);
        if (pending) void punch(pending, v);
    };

    // ---------------------------------------------------------------- screens
    // a plain function (not a component): a component defined in here would remount the page on every render
    const shell = (children: React.ReactNode) => (
        <div className="min-h-[100dvh] bg-background text-foreground">
            <header className="border-b border-border bg-card">
                <div className="mx-auto flex min-h-[60px] w-full max-w-md items-center gap-3 px-4 py-2.5">
                    {portal?.company.logoUrl && /^https:\/\//i.test(portal.company.logoUrl)
                        ? <img src={portal.company.logoUrl} alt="" referrerPolicy="no-referrer" className="h-9 w-auto max-w-[110px] shrink-0 rounded bg-white object-contain" />
                        : companyName ? <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{initials(companyName)}</span> : null}
                    <p className="min-w-0 flex-1 truncate text-[15px] font-bold">{companyName || 'Clock in'}</p>
                    {portal?.member.name && <p className="max-w-[40%] shrink-0 truncate text-sm font-medium text-muted-foreground">{firstName(portal.member.name)}</p>}
                </div>
            </header>
            <main className="mx-auto w-full max-w-md px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">{children}</main>
        </div>
    );

    const unsentList = queue.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="font-semibold">{w.unsentDead}</p>
            <ul className="mt-2 space-y-1 font-mono tabular-nums">
                {queue.map(q => <li key={q.clientId}>{new Date(q.at).toLocaleDateString()} {clockLabel(q.at)} · {KIND_WORD(w, q.kind)}</li>)}
            </ul>
        </div>
    );

    if (load === 'invalid' || dead === 'invalid_link') {
        return (
            shell(<>
                <div className="rounded-2xl border border-border bg-card p-6 text-center">
                    <p className="text-lg font-bold">{w.invalidTitle}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{w.invalidBody}</p>
                </div>
                {unsentList}
            </>)
        );
    }
    if (load === 'loading' && !portal) {
        return (
            shell(<>
                <div className="space-y-3" aria-busy="true">
                    <div className="skeleton h-28 w-full rounded-2xl" />
                    <div className="skeleton h-20 w-full rounded-2xl" />
                    <div className="skeleton h-20 w-full rounded-2xl" />
                </div>
            </>)
        );
    }
    if (!portal) {
        return (
            shell(<>
                <div className="rounded-2xl border border-border bg-card p-6 text-center">
                    <p className="text-base font-semibold">{load === 'never' ? w.neverOpened : (loadMsg || w.neverOpened)}</p>
                    <button type="button" className="btn btn-outline mt-4 min-h-[48px]" onClick={() => { setLoad('loading'); void refreshPortal(); }}>{w.retry}</button>
                </div>
                {waiting > 0 && <p className="mt-3 text-center text-sm text-muted-foreground">{w.waiting(waiting)}</p>}
            </>)
        );
    }

    const paused = dead === 'paused' || portal.paused;
    const tone = STATUS_TONE[state.status];
    const tel = telHref(portal.company.phone);
    const otherJobs = split.today.filter(j => j.id !== state.jobId);
    const working = state.status !== 'off';
    const disabled = Boolean(busy) || paused;

    return (
        shell(<>
            {/* status card: date, big clock / timer, the next action */}
            <section aria-live="polite" className="overflow-hidden rounded-3xl border border-border bg-card">
                <div className={`h-1.5 ${tone.band}`} aria-hidden />
                <div className="px-5 pb-5 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {new Date(now).toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    {working && state.since ? (
                        <>
                            <p className="mt-1 font-mono text-[44px] font-black leading-none tabular-nums tracking-tight">
                                {durationLabel(state.status === 'break' && state.breakSince ? now - state.breakSince : state.session?.liveMs || 0)}
                            </p>
                            <p className="mt-2 flex items-center gap-2 text-sm">
                                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.late ? 'bg-warning' : tone.dot} animate-pulse`} aria-hidden />
                                <span className={`whitespace-nowrap font-bold ${tone.text}`}>{state.status === 'break' ? w.onBreak : w.onClock}</span>
                                <span className="whitespace-nowrap text-muted-foreground">{w.since} {whenLabel(state.status === 'break' && state.breakSince ? state.breakSince : state.since, today, lang)}</span>
                            </p>
                            {currentJob && <p className="mt-0.5 truncate pl-[18px] text-sm font-semibold text-foreground">{currentJob.name}</p>}
                        </>
                    ) : (
                        <>
                            <p className="mt-1 font-mono text-[44px] font-black leading-none tabular-nums tracking-tight">{clockLabel(now)}</p>
                            <p className="mt-2 flex items-center gap-2 text-sm">
                                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                                <span className={`font-bold ${tone.text}`}>{w.offClock}</span>
                            </p>
                        </>
                    )}

                    {state.late && (
                        <div className="mt-3 rounded-xl bg-warning/15 px-3 py-2 text-sm">
                            <span className="font-semibold text-warning">{w.lateTitle}.</span> {w.lateBody}
                        </div>
                    )}

                    {working && state.jobId && (
                        <div className="mt-4 space-y-3">
                            {state.status === 'break' ? (
                                <BigButton tone="primary" disabled={disabled} onClick={() => void punch({ kind: 'break_end', jobId: state.jobId! })}>{w.endBreak}</BigButton>
                            ) : (
                                <BigButton tone="dark" disabled={disabled} onClick={() => void punch({ kind: 'out', jobId: state.jobId! })}>{w.clockOut}</BigButton>
                            )}
                            {state.status === 'break' ? (
                                <BigButton tone="outline" disabled={disabled} onClick={() => void punch({ kind: 'out', jobId: state.jobId! })}>{w.clockOut}</BigButton>
                            ) : allowed.includes('break_start') && (
                                <BigButton tone="outline" disabled={disabled} onClick={() => void punch({ kind: 'break_start', jobId: state.jobId! })}>{w.startBreak}</BigButton>
                            )}
                        </div>
                    )}

                    {busy && <p className="mt-3 text-center text-sm font-medium text-muted-foreground" role="status">{busy === 'locating' ? w.locating : w.saving}</p>}

                    {flash && !busy && (
                        <div className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${flash.tone === 'warning' ? 'bg-warning/15' : flash.tone === 'info' ? 'bg-muted' : 'bg-success/10'}`} role="status">
                            <p className={`font-bold ${flash.tone === 'warning' ? 'text-warning' : flash.tone === 'success' ? 'text-success' : 'text-foreground'}`}>{flash.title}</p>
                            {flash.lines.map(l => <p key={l} className="mt-0.5 text-muted-foreground">{l}</p>)}
                        </div>
                    )}
                </div>
            </section>

            {/* connection / queue */}
            {(!online || waiting > 0 || syncing) && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="status">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
                    <span>{syncing ? w.sending : waiting > 0 ? w.waiting(waiting) : w.offline}</span>
                </p>
            )}
            {rejected.map(r => (
                <div key={r.clientId} className="mt-3 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                        <span className="font-semibold text-destructive">{w.notSaved}:</span> {KIND_WORD(w, r.kind)} {clockLabel(r.at)}
                        <span className="block text-muted-foreground">{r.error}</span>
                    </span>
                    <button type="button" className="btn btn-outline btn-sm min-h-[40px] shrink-0" onClick={() => { void dismissRejected(store, key, r.clientId).then(setQueue); }}>{w.dismiss}</button>
                </div>
            ))}
            {paused && (
                <div className="mt-3 rounded-xl border border-border bg-muted px-3 py-2.5 text-sm">
                    <p className="font-bold">{w.pausedTitle}</p>
                    <p className="text-muted-foreground">{w.pausedBody(companyName)}</p>
                </div>
            )}
            {skewMin > 0 && <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">{w.clockSkew(skewMin)}</p>}

            {/* jobs */}
            {!paused && (!working || otherJobs.length > 0) && (
                <section className="mt-6" aria-labelledby="crew-jobs">
                    <h2 id="crew-jobs" className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{w.todaysJobs}</h2>
                    {!working && split.today.length === 0 && <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{w.noJobs}</p>}
                    <div className="space-y-3">
                        {(working ? otherJobs : split.today).map(job => (
                            <article key={job.id} className="rounded-2xl border border-border bg-card p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-base font-bold">{job.name}</h3>
                                        {job.address && <p className="truncate text-sm text-muted-foreground">{job.address}</p>}
                                    </div>
                                    {job.address && (
                                        <a href={mapsHref(job.address)} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary underline-offset-2 hover:underline">{w.directions}</a>
                                    )}
                                </div>
                                {job.status === 'paused' ? null : (
                                    <div className="mt-3">
                                        {working
                                            ? <BigButton tone="outline" disabled={disabled} onClick={() => void punch({ kind: 'in', jobId: job.id, switchFrom: state.jobId })}>{w.switchHere}</BigButton>
                                            : <BigButton tone="primary" disabled={disabled} label={`${w.clockIn}: ${job.name}`} onClick={() => void punch({ kind: 'in', jobId: job.id })}>{w.clockIn}</BigButton>}
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                    {split.later.length > 0 && !working && (
                        <div className="mt-4">
                            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{w.comingUp}</h3>
                            <ul className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
                                {split.later.map(j => <li key={j.id} className="flex justify-between gap-3 px-4 py-2.5"><span className="truncate font-medium">{j.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{parseLocalDate(j.from)?.toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }) || j.from}</span></li>)}
                            </ul>
                        </div>
                    )}
                </section>
            )}

            {/* optional note / photo for the next punch */}
            {!paused && (split.today.length > 0 || working) && (
                <section className="mt-4">
                    <button type="button" onClick={() => setExtras(v => !v)} aria-expanded={extras} className="min-h-[44px] text-sm font-semibold text-primary">
                        {extras ? w.hideExtras : `+ ${w.addExtras}`}{!extras && (note || photo) ? ' ✓' : ''}
                    </button>
                    {extras && (
                        <div className="mt-1 space-y-3 rounded-2xl border border-border bg-card p-4">
                            <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 500))} rows={2} placeholder={w.notePh} className="input min-h-[72px] text-base" aria-label={w.notePh} />
                            <div className="flex items-center gap-3">
                                {photo && <img src={photo.url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
                                <button type="button" className="btn btn-outline min-h-[48px]" onClick={() => fileRef.current?.click()}>{photo ? w.changePhoto : w.photo}</button>
                                {photo && <button type="button" className="min-h-[44px] text-sm font-medium text-muted-foreground" onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); }}>{w.removePhoto}</button>}
                                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => void pickPhoto(e.target.files?.[0])} />
                            </div>
                            {photoError && <p className="text-sm font-medium text-destructive">{photoError}</p>}
                        </div>
                    )}
                </section>
            )}

            {/* my subcontract (subcontractors only): nothing at all for workers or when it can't be reached */}
            {!paused && (
                <TasksBoundary>
                    <Suspense fallback={null}>
                        <CrewMySubcontract token={token} lang={lang} today={today} online={online} />
                    </Suspense>
                </TasksBoundary>
            )}

            {/* my tasks (job tasks); nothing at all when they can't be reached */}
            {!paused && (
                <TasksBoundary>
                    <Suspense fallback={null}>
                        <CrewMyTasks token={token} lang={lang} today={today} now={now} online={online} />
                    </Suspense>
                </TasksBoundary>
            )}

            {/* today's punches + the week */}
            <section className="mt-6" aria-labelledby="crew-today">
                <div className="mb-2 flex items-baseline justify-between">
                    <h2 id="crew-today" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{w.today}</h2>
                    <p className="text-sm"><span className="text-muted-foreground">{w.thisWeek}</span> <span className="font-mono font-bold tabular-nums">{durationLabel(weekMs)}</span></p>
                </div>
                <div className="rounded-2xl border border-border bg-card px-4 py-3">
                    {todayPunches.length ? <PunchStrip punches={todayPunches} jobs={jobsById} w={w} today={today} lang={lang} /> : <p className="py-2 text-sm text-muted-foreground">{w.nothingYet}</p>}
                </div>
            </section>

            <footer className="mt-6 space-y-2 text-center text-xs text-muted-foreground">
                <p>
                    {consent === 'yes' ? w.locOn : consent === 'no' ? w.locOff : w.locTitle}{' '}
                    {consent !== null && (
                        <button type="button" className="min-h-[36px] font-semibold text-primary" onClick={() => { safeSet(consentKey(token), null); setConsent(null); setAsk(null); }}>{w.change}</button>
                    )}
                </p>
                <p>{w.keep}</p>
                <div className="flex items-center justify-center gap-4">
                    {tel && <a href={tel} className="inline-flex min-h-[44px] items-center font-semibold text-foreground">{w.call(companyName || '')}</a>}
                    <button type="button" className="min-h-[44px] font-semibold text-foreground" onClick={() => { const next = lang === 'en' ? 'es' : 'en'; setLang(next); safeSet(LANG_KEY, next); }}>{w.lang}</button>
                </div>
            </footer>

            {/* location consent (once per link and phone) */}
            {ask && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="crew-geo-title">
                    <div className="w-full max-w-md rounded-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl">
                        <p id="crew-geo-title" className="text-lg font-extrabold">{w.locTitle}</p>
                        <p className="mt-1.5 text-sm text-muted-foreground">{w.locBody}</p>
                        <div className="mt-4 space-y-2.5">
                            <BigButton tone="primary" onClick={() => answerConsent(true)}>{w.locAllow}</BigButton>
                            <BigButton tone="outline" onClick={() => answerConsent(false)}>{w.locSkip}</BigButton>
                        </div>
                    </div>
                </div>
            )}
        </>)
    );
};

export default CrewClockPage;
