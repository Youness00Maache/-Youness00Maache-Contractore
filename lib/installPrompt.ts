/**
 * "Add to home screen" support. Imported by index.tsx so the browser's one-time `beforeinstallprompt` event (Android /
 * Chrome / Edge) is kept even when it fires before the app screens have loaded. iPhone / iPad Safari has no such
 * event: the banner shows the Share → Add to Home Screen steps there instead (components/InstallAppBanner.tsx).
 */
interface InstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); // the app shows its own, gentler banner
        deferred = e as InstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        installed = true;
        deferred = null;
        notify();
    });
}

export const subscribeInstall = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** The browser can show its install dialog now. */
export const canPromptInstall = (): boolean => deferred !== null;

/** Opens the browser's install dialog; true when the user accepted. */
export const promptInstall = async (): Promise<boolean> => {
    const e = deferred;
    if (!e) return false;
    deferred = null;
    notify();
    try {
        await e.prompt();
        const choice = await e.userChoice;
        return choice.outcome === 'accepted';
    } catch {
        return false;
    }
};

/** Opened from the home screen (or installed during this visit). */
export const isInstalledApp = (): boolean => {
    if (installed) return true;
    if (typeof window === 'undefined') return false;
    try {
        return window.matchMedia('(display-mode: standalone)').matches
            || window.matchMedia('(display-mode: fullscreen)').matches
            || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    } catch {
        return false;
    }
};

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export const isIOS = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
};

/** A phone-sized touch screen. */
export const isPhone = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return window.matchMedia('(max-width: 767px)').matches && window.matchMedia('(pointer: coarse)').matches;
    } catch {
        return false;
    }
};
