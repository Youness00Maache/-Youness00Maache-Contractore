/**
 * Phones only: a small, dismissible "Add ContractorDocs to your home screen" strip above the bottom bar.
 * Shown from the 2nd visit, or after the user saved a document (App dispatches `cd:document-saved`), never when the
 * app is already installed (opened from the home screen) and never again after "Not now" on this device.
 * Android / Chrome: the real install dialog (beforeinstallprompt). iPhone Safari: the Share → Add to Home Screen steps.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { AppLogo, XCircleIcon } from './Icons.tsx';
import { canPromptInstall, isIOS, isInstalledApp, isPhone, promptInstall, subscribeInstall } from '../lib/installPrompt.ts';

const DISMISSED_KEY = 'cd-install-banner-dismissed';
const VISITS_KEY = 'cd-install-visits';
const VISIT_SEEN_KEY = 'cd-install-visit-counted';
export const DOCUMENT_SAVED_EVENT = 'cd:document-saved';

const read = (store: Storage | undefined, key: string): string | null => { try { return store?.getItem(key) ?? null; } catch { return null; } };
const write = (store: Storage | undefined, key: string, value: string) => { try { store?.setItem(key, value); } catch { /* private mode */ } };
const local = () => (typeof window !== 'undefined' ? window.localStorage : undefined);
const session = () => (typeof window !== 'undefined' ? window.sessionStorage : undefined);

/** Counts this visit once per browser session and returns how many visits this device has made. */
const countVisit = (): number => {
    let visits = Number(read(local(), VISITS_KEY) || '0') || 0;
    if (!read(session(), VISIT_SEEN_KEY)) {
        visits += 1;
        write(local(), VISITS_KEY, String(visits));
        write(session(), VISIT_SEEN_KEY, '1');
    }
    return visits;
};

/** Share icon as Safari draws it (square with an arrow up), so the steps are easy to follow. */
const ShareGlyph: React.FC = () => (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4 align-[-3px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
);

const InstallAppBanner: React.FC<{ aboveTabBar: boolean }> = ({ aboveTabBar }) => {
    const promptReady = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
    const [eligible, setEligible] = useState(false);
    const [dismissed, setDismissed] = useState(() => read(local(), DISMISSED_KEY) === '1');
    const [showSteps, setShowSteps] = useState(false);
    const ios = isIOS();

    useEffect(() => {
        if (countVisit() >= 2) setEligible(true);
        const onSaved = () => setEligible(true);
        window.addEventListener(DOCUMENT_SAVED_EVENT, onSaved);
        return () => window.removeEventListener(DOCUMENT_SAVED_EVENT, onSaved);
    }, []);

    const installedNow = useSyncExternalStore(subscribeInstall, isInstalledApp, () => false);
    if (dismissed || installedNow || !eligible || !aboveTabBar || !isPhone()) return null;
    // only where adding it really works: the browser's own dialog, or Safari's Share sheet on iPhone / iPad
    if (!promptReady && !ios) return null;

    const dismiss = () => { write(local(), DISMISSED_KEY, '1'); setDismissed(true); };
    const install = async () => {
        if (await promptInstall()) dismiss();
    };

    return (
        <div
            className="no-print fixed inset-x-3 z-30 rounded-2xl border border-border bg-card/95 p-3 shadow-lift backdrop-blur-lg md:hidden"
            style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
            role="region"
            aria-label="Add ContractorDocs to your home screen"
        >
            <div className="flex items-center gap-3">
                <AppLogo className="h-9 w-9 shrink-0" />
                <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
                    <span className="font-semibold">Add ContractorDocs to your home screen</span>
                    <span className="text-muted-foreground"> — it works offline.</span>
                </p>
                {promptReady ? (
                    <button type="button" onClick={() => { void install(); }} className="btn btn-primary btn-sm shrink-0">Install</button>
                ) : (
                    <button type="button" onClick={() => setShowSteps(v => !v)} className="btn btn-outline btn-sm shrink-0" aria-expanded={showSteps}>How?</button>
                )}
                <button type="button" onClick={dismiss} className="-mr-1 shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Not now">
                    <XCircleIcon className="h-5 w-5" />
                </button>
            </div>
            {showSteps && !promptReady && (
                <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
                    In Safari, tap Share <ShareGlyph /> at the bottom of the screen, then <strong className="font-semibold text-foreground">Add to Home Screen</strong>. It opens like an app, full screen, and keeps working without a connection.
                </p>
            )}
        </div>
    );
};

export default InstallAppBanner;
