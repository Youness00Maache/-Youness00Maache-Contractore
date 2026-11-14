/**
 * Registers public/sw.js (production builds only), so the app itself opens without a connection; see that file for
 * exactly what it caches (network first for pages, so online loading is unchanged).
 */
let registration: Promise<ServiceWorkerRegistration | null> | null = null;

const supported = (): boolean =>
    Boolean((import.meta as any).env?.PROD)
    && typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

/** Built files this page has loaded so far (the worker stores the ones it hasn't seen). */
const loadedAssets = (): string[] => {
    try {
        return performance.getEntriesByType('resource').map(e => e.name).filter(u => u.includes('/assets/'));
    } catch {
        return [];
    }
};

/** Asks the worker to refresh its app-shell copy and keep the files loaded so far. */
export const warmOfflineShell = (): void => {
    if (!registration || typeof navigator === 'undefined' || !navigator.onLine) return;
    void registration.then(reg => {
        try { reg?.active?.postMessage({ type: 'cd-warm', urls: loadedAssets() }); } catch { /* ignore */ }
    });
};

export const registerOfflineShell = (): void => {
    if (registration || !supported()) return;
    registration = navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(() => navigator.serviceWorker.ready)
        .catch(() => null);
    warmOfflineShell();
};
