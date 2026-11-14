/**
 * Photos added while offline. The editor embeds them in the document as compressed data URLs (so they show and print
 * at once); this registry remembers which ones were added offline, so the sync uploads exactly those to storage and
 * swaps the data URL for the file's URL, like an online upload would have done. Data URLs that were already in a
 * document (an upload that failed online) stay as they are.
 */
import { photoHash } from './outboxModel.ts';
import { getOutboxStore } from './outboxStore.ts';

let currentUser: string | null = null;

/** Set by the app when the signed-in user changes. */
export const setOfflinePhotoUser = (userId: string | null): void => { currentUser = userId; };

/** Remembers a photo embedded offline (best effort: without the registry it simply stays inside the document). */
export const rememberOfflinePhoto = async (dataUrl: string): Promise<void> => {
    const uid = currentUser;
    if (!uid || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return;
    const hash = photoHash(dataUrl);
    try {
        await getOutboxStore().putPhoto({ id: `${uid}:${hash}`, userId: uid, hash, createdAt: new Date().toISOString() });
    } catch { /* the photo stays embedded in the document */ }
};

/** data:image/...;base64,... → Blob (for the upload on sync). */
export const dataUrlToBlob = (dataUrl: string): Blob => {
    const m = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/.exec(dataUrl);
    if (!m) throw new Error('Not an image data URL');
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] || 'image/jpeg' });
};

export const extensionForType = (type: string): string => {
    const t = type.toLowerCase();
    if (t.includes('png')) return 'png';
    if (t.includes('webp')) return 'webp';
    if (t.includes('gif')) return 'gif';
    return 'jpg';
};
