/**
 * The owner's job photo library for the gallery picker (Settings › Public profile): the latest photos across all jobs with
 * their job names and a small signed thumbnail each (private bucket, 1 hour). Read only; nothing here makes a photo public:
 * a photo becomes public only through addGalleryPhoto (lib/profile/profileApi.ts), which copies it to the portal-photos bucket.
 */
import { supabase } from '../../lib/supabase.ts';
import { JOB_PHOTO_COLUMNS, mapPhotoRow, type JobPhoto } from '../photos/photoLogic.ts';
import { signedPhotoUrls } from '../photos/photosApi.ts';
import { isMissingBackendError } from '../requests/requestLogic.ts';

export interface LibraryPhoto extends JobPhoto {
    jobName: string;
    thumbUrl: string;
}

const MAX_PHOTOS = 150;

/** "After" photos first (the finished work), then the rest, newest first inside each group. */
export const sortLibrary = <T extends Pick<JobPhoto, 'tag' | 'takenAt'>>(photos: T[]): T[] =>
    [...photos].sort((a, b) => {
        const rank = (p: T) => (p.tag === 'after' ? 0 : p.tag === 'issue' ? 2 : 1);
        return rank(a) - rank(b) || String(b.takenAt).localeCompare(String(a.takenAt));
    });

export async function loadPhotoLibrary(): Promise<LibraryPhoto[]> {
    const { data, error } = await supabase.from('job_photos').select(JOB_PHOTO_COLUMNS).order('taken_at', { ascending: false }).limit(MAX_PHOTOS);
    if (error) {
        if (isMissingBackendError(error)) return [];
        throw error;
    }
    const photos = (data || []).map(mapPhotoRow).filter(p => p.storagePath);
    if (!photos.length) return [];
    const jobIds = Array.from(new Set(photos.map(p => p.jobId).filter(Boolean)));
    const names: Record<string, string> = {};
    if (jobIds.length) {
        const { data: jobs } = await supabase.from('jobs').select('id, name').in('id', jobIds);
        for (const j of (jobs || []) as Array<{ id: string; name: string | null }>) names[j.id] = j.name || 'Untitled job';
    }
    const urls = await signedPhotoUrls(photos.map(p => p.thumbPath || p.storagePath));
    return sortLibrary(photos.map(p => ({
        ...p,
        jobName: names[p.jobId] || 'Job',
        thumbUrl: urls[p.thumbPath || p.storagePath] || '',
    })));
}
