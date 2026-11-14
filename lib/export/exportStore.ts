/**
 * The running "Export everything" job, kept outside React: it goes on while the user moves around the app, and the
 * Settings → Your data section and the small progress bar (components/export/ExportProgressDock.tsx) both follow it.
 *
 * This file is small on purpose. The ZIP code, fflate and the PDF generator are loaded only when an export starts.
 * Never checks the plan: export works on every plan, including Free, and after a subscription is cancelled.
 */
import { useSyncExternalStore } from 'react';
import type { Job, UserProfile } from '../../types.ts';
import type { ExportMode, ExportProgress } from './runExport.ts';
import type { ExportJobRow } from './model.ts';

export type { ExportMode } from './runExport.ts';

export interface ExportFile {
    index: number;
    name: string;
    size: number;
    url: string;
}

export interface ExportSnapshot {
    status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
    /** the signed-in user the export belongs to */
    ownerId: string | null;
    mode: ExportMode;
    phase: ExportProgress['phase'] | null;
    label: string;
    done: number;
    total: number;
    percent: number;
    startedAt: number | null;
    finishedAt: number | null;
    files: ExportFile[];
    pdfs: { planned: number; done: number; failed: number } | null;
    rows: number;
    documents: number;
    warnings: string[];
    failures: string[];
    error: string | null;
    /** the floating progress bar was closed by the user (the export keeps running) */
    dockHidden: boolean;
}

const IDLE: ExportSnapshot = {
    status: 'idle', ownerId: null, mode: 'full', phase: null, label: '', done: 0, total: 0, percent: 0, startedAt: null, finishedAt: null,
    files: [], pdfs: null, rows: 0, documents: 0, warnings: [], failures: [], error: null, dockHidden: false,
};

let state: ExportSnapshot = IDLE;
let cancelRequested = false;
let runId = 0;
const listeners = new Set<() => void>();

const set = (patch: Partial<ExportSnapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
};

export const getExportSnapshot = (): ExportSnapshot => state;
export const subscribeExport = (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
};
/** The current export, for components. */
export const useExportSnapshot = (): ExportSnapshot => useSyncExternalStore(subscribeExport, getExportSnapshot, () => IDLE);

export const isExportRunning = (): boolean => state.status === 'running';

/** Saves one file of the export (also used by the "Download" buttons). */
export const downloadExportFile = (file: Pick<ExportFile, 'url' | 'name'>): void => {
    if (typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 0);
};

const revokeFiles = (files: ExportFile[]) => {
    for (const f of files) { try { URL.revokeObjectURL(f.url); } catch { /* already gone */ } }
};

/** While an export runs, closing or reloading the tab asks first. */
const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };

/** Hands control back to the page between PDFs (a message, not a timer: timers are slowed down a lot in the background). */
const yieldToUi = () => new Promise<void>((resolve) => {
    if (typeof MessageChannel === 'undefined') { setTimeout(resolve, 0); return; }
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
    ch.port2.postMessage(0);
});

const toJob = (row: ExportJobRow | null, userId: string): Job | null => row ? ({
    id: row.id,
    userId,
    name: row.name || '',
    clientName: row.client_name || '',
    clientAddress: row.client_address || '',
    startDate: row.start_date || row.created_at || '',
    endDate: row.end_date ?? null,
    status: (row.status as Job['status']) || 'active',
    workerName: row.worker_name || undefined,
    createdAt: row.created_at || undefined,
}) : null;

const friendlyError = (e: unknown): string => {
    const msg = (e as Error)?.message || String(e || '');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return "You're offline. Connect to the internet and start the export again.";
    if (/quota|allocation|out of memory|array buffer/i.test(msg)) return 'Your browser ran out of memory for this export. Try "Spreadsheets only", or export on a computer.';
    return msg || 'The export stopped unexpectedly. Please try again.';
};

export interface StartExportOptions {
    userId: string;
    profile: UserProfile;
    mode: ExportMode;
}

/** Starts an export (does nothing when one is already running). Returns false when it didn't start. */
export function startExport(opts: StartExportOptions): boolean {
    if (state.status === 'running' || !opts.userId) return false;
    revokeFiles(state.files);
    cancelRequested = false;
    const myRun = ++runId;
    set({ ...IDLE, status: 'running', ownerId: opts.userId, mode: opts.mode, label: 'Getting ready', startedAt: Date.now() });
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', beforeUnload);
    const files: ExportFile[] = [];

    void (async () => {
        try {
            const [{ runExport, dataUriToBytes }, { createSupabaseExportSource }, { supabase }, { exportTypeLabel }] = await Promise.all([
                import('./runExport.ts'), import('./supabaseSource.ts'), import('../supabase.ts'), import('./model.ts'),
            ]);
            const renderPdf = opts.mode === 'full'
                ? async (doc: import('./model.ts').ExportDocRow, job: ExportJobRow | null) => {
                    const { generateDocumentPDF } = await import('../../services/pdfGenerator.ts');
                    const data = doc.data || {};
                    const uri = await generateDocumentPDF(exportTypeLabel(doc.type), data, opts.profile, toJob(job, opts.userId), (data as any).templateId, true, {
                        createdAt: doc.created_at || undefined,
                        // a little lighter than the "print" default: still sharp, and much faster on a few hundred documents
                        scale: 1.5,
                    });
                    return dataUriToBytes(uri);
                }
                : undefined;

            const result = await runExport({
                source: createSupabaseExportSource(supabase, opts.userId),
                mode: opts.mode,
                renderPdf,
                account: { name: opts.profile?.name, company: opts.profile?.companyName, email: opts.profile?.email },
                isCancelled: () => cancelRequested || myRun !== runId,
                yieldToUi,
                onProgress: (p) => {
                    if (myRun !== runId) return;
                    set({ phase: p.phase, label: p.label, done: p.done, total: p.total, percent: p.percent });
                },
                onPart: (part) => {
                    if (myRun !== runId) return;
                    const file: ExportFile = { index: part.index, name: part.name, size: part.size, url: URL.createObjectURL(part.blob) };
                    files.push(file);
                    set({ files: [...files] });
                    // saved right away (a big export comes in several parts; each one is saved as soon as it is complete)
                    downloadExportFile(file);
                },
            });
            if (myRun !== runId) { revokeFiles(files); return; }
            set({
                status: 'done', phase: null, percent: 100, label: 'Ready', finishedAt: Date.now(), files: [...files], pdfs: result.pdfs,
                rows: Object.values(result.counts).reduce((s, n) => s + n, 0), documents: result.documents,
                warnings: result.warnings, failures: result.failures,
            });
            try {
                const { toast } = await import('../../components/Toast.tsx');
                toast.success(result.pdfs.failed
                    ? `Your export is ready. ${result.pdfs.failed} PDF${result.pdfs.failed === 1 ? '' : 's'} could not be created (listed in errors.txt).`
                    : 'Your export is ready and downloading.', { title: 'Export complete' });
            } catch { /* toasts are optional */ }
        } catch (e) {
            if (myRun !== runId) { revokeFiles(files); return; }
            revokeFiles(files);
            const wasCancelled = (e as Error)?.name === 'ExportCancelledError' || cancelRequested;
            set({
                status: wasCancelled ? 'cancelled' : 'error', phase: null, finishedAt: Date.now(), files: [],
                error: wasCancelled ? null : friendlyError(e), label: wasCancelled ? 'Cancelled' : 'Stopped',
            });
        } finally {
            if (myRun === runId && typeof window !== 'undefined') window.removeEventListener('beforeunload', beforeUnload);
        }
    })();
    return true;
}

/** Stops the running export (finished files are discarded). */
export function cancelExport(): void {
    if (state.status !== 'running') return;
    cancelRequested = true;
    set({ label: 'Cancelling…' });
}

/** Forgets the last export (frees its memory). Cancels a running one. */
export function dismissExport(): void {
    if (state.status === 'running') cancelRequested = true;
    runId++;
    revokeFiles(state.files);
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', beforeUnload);
    set({ ...IDLE });
}

/** Hides the floating progress bar (the export keeps going; Settings → Your data still shows it). */
export function hideExportDock(hidden = true): void {
    set({ dockHidden: hidden });
}

/** "48.2 MB" */
export const formatBytes = (n: number): string => {
    if (!Number.isFinite(n) || n <= 0) return '0 KB';
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};
