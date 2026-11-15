/**
 * Timeline source: job photos (job_photos). Photos of the same day and the same stage (Before / During / After /
 * Issue) become ONE entry with a strip of small pictures, so a morning of 30 shots is one line, not thirty. Pure: the
 * picture addresses are signed by the panel when an entry is on screen (components/photos/photosApi.ts signedPhotoUrls).
 */
import { tagLabel, type JobPhoto } from '../../../components/photos/photoLogic.ts';
import { countWord, dayOf, isoOf, makeEvent, plainText, safely } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineEvent } from '../timelineTypes.ts';

/** how many small pictures an entry carries (the rest are only counted) */
export const PHOTOS_PER_ENTRY = 6;

export const photoEvents = ({ photos }: { photos: readonly JobPhoto[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const groups = new Map<string, Array<{ photo: JobPhoto; at: string }>>();
    for (const photo of photos) {
        const at = isoOf(photo.takenAt);
        const day = at ? dayOf(at, ctx.tz) : null;
        if (!at || !day) continue;
        const key = `${day}|${photo.tag}`;
        groups.set(key, [...(groups.get(key) || []), { photo, at }]);
    }
    const out: TimelineEvent[] = [];
    for (const [key, list] of groups) {
        const sorted = [...list].sort((a, b) => b.at.localeCompare(a.at) || b.photo.id.localeCompare(a.photo.id));
        const tag = sorted[0].photo.tag;
        const stage = tagLabel(tag);
        const n = sorted.length;
        const captions = sorted.map(x => plainText(x.photo.caption, 80)).filter(Boolean);
        const title = n === 1
            ? `${tag === 'issue' ? 'Issue photo' : 'Photo'} added${captions[0] ? `: ${captions[0]}` : ''}`
            : `${countWord(n, tag === 'issue' ? 'issue photo' : 'photo')} added`;
        out.push(makeEvent({
            id: `photos:${key}`, at: sorted[0].at, kind: 'photos', source: 'photos',
            title, detail: [`${stage} stage`, n > 1 ? captions.slice(0, 2).join(' · ') : ''].filter(Boolean).join(' · '),
            actor: sorted.every(x => !!x.photo.requestId) ? 'client' : 'you',
            photos: sorted.slice(0, PHOTOS_PER_ENTRY).map(x => ({ id: x.photo.id, thumbPath: x.photo.thumbPath || x.photo.storagePath, caption: x.photo.caption || undefined })),
            photoCount: n, link: { type: 'tab', tab: 'photos' },
        }));
    }
    return out;
});
