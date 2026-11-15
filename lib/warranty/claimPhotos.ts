/**
 * Photos on a warranty claim: private images in the `document-assets` bucket (like the selection images), kept on the
 * claim as storage PATHS (never links), shown through short signed links. Adding a photo needs a connection (the file
 * is uploaded at once); the claim itself is saved by the Warranty form's normal Save.
 *
 *   claimPhotoPath(userId, documentKey, fileName, mime, random?)   '<user>/warranty/<document>/<rand>-<name>.<ext>'
 *   uploadClaimPhoto(documentKey, file)                            { path }   (compressed first; throws a plain sentence)
 *   claimPhotoUrl(path, seconds?)                                  signed link or null
 *   removeClaimPhotoFile(path)                                     best effort (a photo added and then removed before saving)
 */
import { supabase } from '../supabase.ts';
import { sanitizeFileName } from '../jobFiles/jobFileLogic.ts';
import { imageMimeFor, validateOptionImage } from '../selections/selectionLogic.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import { compressImage } from '../../utils/imageCompression.ts';

export const CLAIM_PHOTO_BUCKET = 'document-assets';

const randomPart = (len = 12): string => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(len);
    const c = globalThis.crypto;
    if (c?.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
};

/** Storage path of a claim photo; matches the claim parser (letters, digits, _ . / -) and the owner-folder rule. */
export function claimPhotoPath(userId: string, documentKey: string, fileName: string, mime: string, random: string = randomPart()): string {
    const { base } = sanitizeFileName(fileName);
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const r = random.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32).padEnd(8, '0');
    const doc = String(documentKey || 'draft').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'draft';
    return `${userId}/warranty/${doc}/${r}-${base}.${ext}`;
}

export async function uploadClaimPhoto(documentKey: string, file: File): Promise<{ path: string }> {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
    let upload = file;
    try { upload = await compressImage(file); } catch (e) { throw new Error(errorText(e, 'That image could not be read. Try another photo.')); }
    const problem = validateOptionImage({ name: upload.name || file.name, size: upload.size, type: upload.type });
    if (problem) throw new Error(problem);
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) throw new Error('Please sign in again.');
    const mime = imageMimeFor(upload.name || file.name, upload.type) ?? 'image/jpeg';
    const path = claimPhotoPath(userId, documentKey, upload.name || file.name, mime);
    const { error } = await supabase.storage.from(CLAIM_PHOTO_BUCKET).upload(path, upload, { upsert: false, contentType: mime, cacheControl: '3600' });
    if (error) throw new Error(errorText(error, 'The photo could not be uploaded.'));
    return { path };
}

export async function claimPhotoUrl(path: string, seconds = 3600): Promise<string | null> {
    try {
        const { data, error } = await supabase.storage.from(CLAIM_PHOTO_BUCKET).createSignedUrl(path, seconds);
        return error || !data?.signedUrl ? null : data.signedUrl;
    } catch {
        return null;
    }
}

export async function removeClaimPhotoFile(path: string | null | undefined): Promise<void> {
    if (!path) return;
    try { await supabase.storage.from(CLAIM_PHOTO_BUCKET).remove([path]); } catch { /* best effort */ }
}
