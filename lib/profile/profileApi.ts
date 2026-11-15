/**
 * Richer public profile on /r/<slug> (roadmap D8): Supabase calls. Shapes: ./profileTypes.ts, pure logic:
 * ./profileLogic.ts. request_pages has no browser write grant: like the existing link settings
 * (components/requests/requestsApi.ts updateMyRequestPage -> update_request_page, left as it is), the new columns are
 * written only through the new definer functions of supabase/migrations/20261116001000_feedback_profile.sql.
 *
 * OWNER (keep the UI HIDDEN until `useProfileFeature(userId, online) === 'ready'`)
 *   probeProfileBackend() / profileFeature / useProfileFeature(uid, online)   'unknown' | 'ready' | 'missing'
 *   getMyRequestProfile()                       MyRequestProfile | null   (null = migration not applied; creates the
 *                                               request page on first use, like getMyRequestPage)
 *   updateMyRequestProfile(patch: ProfilePatch) MyRequestProfile          (omitted = keep, '' / [] = remove)
 *   addGalleryPhoto(userId, photo: { id, storagePath }, caption, current: GalleryItem[])
 *                                               MyRequestProfile   copies the job photo to the public portal-photos
 *                                               bucket (unguessable name; server copy, else download + upload: exactly
 *                                               like setPhotoShared), then saves the gallery; a failed save removes
 *                                               the copy again. Max 12.
 *   saveGallery(items: GalleryItem[])           MyRequestProfile   (reorder / captions / remove; removed copies are
 *                                               queued in storage_cleanup_queue by the database and flushed here)
 *   removeGalleryPhoto(path, current)           MyRequestProfile
 *   galleryPublicUrl(path)                      public URL of a gallery copy
 *   Writes need a connection (lib/offline/writePathAudit.ts 'needs_connection'): offline they throw NEEDS_CONNECTION.
 *
 * PUBLIC (/r/<slug>, no login; never throws)
 *   loadPublicProfileExtras(slug)  -> { status: 'ready', data: PublicProfileExtras } | { status: 'missing' }
 *                                     | { status: 'invalid' } | { status: 'error', message }
 *   'missing' (function not in the database yet) or 'error' -> render /r/<slug> EXACTLY as today (no new section).
 *   Call it next to the existing fetchRequestPage(slug) (get_request_page is unchanged).
 */
import { supabase } from '../supabase.ts';
import { NEEDS_CONNECTION, errorText, isBrowserOffline } from '../offline/connection.ts';
import { isCrewBackendMissing, isNetworkError } from '../crew/crewLogic.ts';
import { createBackendFeature } from '../jobFiles/featureFlag.ts';
import { isMissingBackendError, isValidSlug } from '../../components/requests/requestLogic.ts';
import { flushStorageCleanup } from '../../components/requests/requestsApi.ts';
import {
    EMPTY_PROFILE_EXTRAS, addGalleryItem, canAddToGallery, galleryCopyPath, galleryRpcPayload, parseMyRequestProfile,
    parsePublicProfileExtras, profileRpcArgs, removeGalleryItem, validateProfilePatch,
} from './profileLogic.ts';
import { PROFILE_LIMITS, type GalleryItem, type MyRequestProfile, type ProfileExtrasResult, type ProfilePatch } from './profileTypes.ts';

const JOB_PHOTOS_BUCKET = 'job-photos';
const PORTAL_PHOTOS_BUCKET = 'portal-photos';

const ensureOnline = () => {
    if (isBrowserOffline()) throw new Error(NEEDS_CONNECTION);
};

const writeError = (error: unknown, fallback: string): Error => {
    if (isNetworkError(error as any)) return new Error(isBrowserOffline() ? NEEDS_CONNECTION : 'Network error. Check your connection and try again.');
    if (isCrewBackendMissing(error as any)) { profileFeature.markMissing(); return new Error('The public profile is not switched on yet. Please try again later.'); }
    return new Error(errorText(error, fallback));
};

const newId = (): string => {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID();
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
};

// ------------------------------------------------------------------------------------------------- feature
export async function probeProfileBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        // read-only (get_my_request_profile would create the request page)
        const { error } = await supabase.from('request_pages').select('about, gallery').limit(1);
        if (!error) return 'ready';
        return isCrewBackendMissing(error as any) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

export const profileFeature = createBackendFeature('cd.profile.feature', probeProfileBackend);
export const useProfileFeature = profileFeature.useFeature;

export const galleryPublicUrl = (path: string): string =>
    supabase.storage.from(PORTAL_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;

// ------------------------------------------------------------------------------------------------- owner
export async function getMyRequestProfile(): Promise<MyRequestProfile | null> {
    const { data, error } = await supabase.rpc('get_my_request_profile');
    if (error) {
        if (isCrewBackendMissing(error as any)) { profileFeature.markMissing(); return null; }
        throw writeError(error, 'The profile could not be loaded.');
    }
    return parseMyRequestProfile(data);
}

export async function updateMyRequestProfile(patch: ProfilePatch): Promise<MyRequestProfile> {
    ensureOnline();
    const v = validateProfilePatch(patch);
    if (!v.ok) throw new Error(Object.values(v.errors)[0] || 'Please check the profile.');
    const { data, error } = await supabase.rpc('update_request_profile', profileRpcArgs(patch));
    if (error) throw writeError(error, 'The profile could not be saved.');
    return parseMyRequestProfile(data);
}

export async function saveGallery(items: GalleryItem[]): Promise<MyRequestProfile> {
    ensureOnline();
    const { data, error } = await supabase.rpc('set_request_profile_gallery', { p_items: galleryRpcPayload(items) });
    if (error) throw writeError(error, 'The gallery could not be saved.');
    flushStorageCleanup().catch(() => undefined);
    return parseMyRequestProfile(data);
}

export async function addGalleryPhoto(
    userId: string, photo: { id: string; storagePath: string }, caption: string | null, current: GalleryItem[],
): Promise<MyRequestProfile> {
    ensureOnline();
    if (!canAddToGallery(current)) throw new Error(`The gallery holds up to ${PROFILE_LIMITS.gallery} photos.`);
    const path = galleryCopyPath(userId, newId(), photo.storagePath);
    const { error: copyError } = await supabase.storage
        .from(JOB_PHOTOS_BUCKET)
        .copy(photo.storagePath, path, { destinationBucket: PORTAL_PHOTOS_BUCKET });
    if (copyError) {
        // Older storage servers: download + upload instead of a server-side copy (same as setPhotoShared).
        const { data: blob, error: dlError } = await supabase.storage.from(JOB_PHOTOS_BUCKET).download(photo.storagePath);
        if (dlError || !blob) throw writeError(dlError || copyError, 'The photo could not be added.');
        const { error: upError } = await supabase.storage.from(PORTAL_PHOTOS_BUCKET).upload(path, blob, {
            upsert: false, contentType: blob.type || 'image/jpeg', cacheControl: '86400',
        });
        if (upError) throw writeError(upError, 'The photo could not be added.');
    }
    const next = addGalleryItem(current, { path, caption, photoId: photo.id });
    const { data, error } = await supabase.rpc('set_request_profile_gallery', { p_items: galleryRpcPayload(next) });
    if (error) {
        await supabase.storage.from(PORTAL_PHOTOS_BUCKET).remove([path]).catch(() => undefined);
        throw writeError(error, 'The photo could not be added.');
    }
    return parseMyRequestProfile(data);
}

export const removeGalleryPhoto = (path: string, current: GalleryItem[]): Promise<MyRequestProfile> =>
    saveGallery(removeGalleryItem(current, path));

// ------------------------------------------------------------------------------------------------- public
let publicFeature: 'unknown' | 'ready' | 'missing' = 'unknown';
export const publicProfileFeature = () => publicFeature;

export async function loadPublicProfileExtras(slug: string): Promise<ProfileExtrasResult> {
    if (publicFeature === 'missing') return { status: 'missing' };
    const s = String(slug || '').trim().toLowerCase();
    if (!isValidSlug(s)) return { status: 'invalid' };
    try {
        const { data, error } = await supabase.rpc('get_public_profile_extras', { p_slug: s });
        if (error) {
            if (isMissingBackendError(error)) { publicFeature = 'missing'; return { status: 'missing' }; }
            if ((error as { code?: string }).code === 'P0002') return { status: 'invalid' };
            return { status: 'error', message: errorText(error, 'Could not load the profile.') };
        }
        publicFeature = 'ready';
        return { status: 'ready', data: data ? parsePublicProfileExtras(data, galleryPublicUrl) : EMPTY_PROFILE_EXTRAS };
    } catch (e) {
        if (isMissingBackendError(e as any)) { publicFeature = 'missing'; return { status: 'missing' }; }
        return { status: 'error', message: e instanceof Error ? e.message : 'Could not load the profile.' };
    }
}
