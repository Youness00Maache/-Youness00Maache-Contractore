/**
 * Browser pop-ups (the Notification API) while ContractorDocs is open. Off by default, switched on per device in
 * Settings › Notifications. No push service and no service-worker push: nothing arrives when every tab is closed.
 */
export type PopupSupport = 'unsupported' | 'default' | 'granted' | 'denied';

const api = (): typeof Notification | null =>
    typeof window !== 'undefined' && 'Notification' in window ? (window as unknown as { Notification: typeof Notification }).Notification : null;

/** What this browser allows right now. */
export const popupSupport = (): PopupSupport => {
    const N = api();
    if (!N) return 'unsupported';
    const p = N.permission;
    return p === 'granted' || p === 'denied' ? p : 'default';
};

/** Asks the browser (must run from a click). */
export async function requestPopupPermission(): Promise<PopupSupport> {
    const N = api();
    if (!N) return 'unsupported';
    try {
        const result = await N.requestPermission();
        return result === 'granted' || result === 'denied' ? result : 'default';
    } catch {
        return popupSupport();
    }
}

/** Shows one pop-up; a click focuses the app and runs `onClick`. Same `tag` = replaces (several tabs show it once). */
export function showPopup(title: string, body: string, tag: string, onClick?: () => void): boolean {
    const N = api();
    if (!N || N.permission !== 'granted') return false;
    try {
        const n = new N(title, { body, tag, icon: '/icon-192.png', silent: false });
        n.onclick = () => {
            try { window.focus(); } catch { /* ignore */ }
            onClick?.();
            n.close();
        };
        return true;
    } catch {
        // some mobile browsers only allow pop-ups from a service worker
        return false;
    }
}
