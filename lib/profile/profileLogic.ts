/**
 * Richer public profile (roadmap D8): pure logic (no React, no Supabase). Shapes: ./profileTypes.ts.
 * Tested by scripts/feedback-check.ts. Server rules: supabase/migrations/20261116001000_feedback_profile.sql.
 *
 *   normalizeServices(list | 'a, b; c' | 'a\nb')  -> trimmed, deduped (case-insensitive), <= 20 of <= 60 chars
 *   validateProfilePatch(patch)                   -> { ok, errors: { about?, services?, serviceArea?, licenseLine?, yearsLine? } }
 *   profileRpcArgs(patch)                         -> update_request_profile args (null = keep, '' / [] = remove)
 *   GALLERY_PATH_RE / isGalleryPath(userId, path) -> '<user_id>/<random 6-80>.<jpg|png|webp>' in the owner's folder
 *   galleryCopyPath(userId, randomId, storagePath)-> path of a new public copy (same rule as portal photo copies)
 *   addGalleryItem(list, item) / removeGalleryItem(list, path) / moveGalleryItem(list, path, delta)
 *   setGalleryCaption(list, path, caption)        -> new lists (max 12, no duplicate paths, captions <= 200)
 *   canAddToGallery(list)                         -> list.length < 12
 *   galleryRpcPayload(list)                       -> [{ path, caption, photo_id }] for set_request_profile_gallery
 *   parseMyRequestProfile(raw)                    -> MyRequestProfile
 *   parsePublicProfileExtras(raw, publicUrl)      -> PublicProfileExtras (testimonials parsed with lib/feedback)
 *   hasProfileContent(extras)                     -> anything new to show (else /r/<slug> renders exactly as before)
 *   EMPTY_PROFILE_EXTRAS
 */
import { cleanLine, cleanMultiline, parseTestimonial } from '../feedback/feedbackLogic.ts';
import type { Testimonial } from '../feedback/feedbackTypes.ts';
import {
    PROFILE_LIMITS, type GalleryItem, type MyRequestProfile, type ProfilePatch, type PublicProfileExtras,
} from './profileTypes.ts';

export const GALLERY_PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$/;

export const EMPTY_PROFILE_EXTRAS: PublicProfileExtras = {
    about: null, services: [], serviceArea: null, licenseLine: null, yearsLine: null, gallery: [], testimonials: [],
    ratingAverage: null, ratingCount: 0,
};

export const normalizeServices = (input: string[] | string | null | undefined): string[] => {
    const raw = Array.isArray(input) ? input : String(input ?? '').split(/[\n,;]+/);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
        const s = cleanLine(item, PROFILE_LIMITS.serviceLength);
        if (!s || seen.has(s.toLowerCase())) continue;
        seen.add(s.toLowerCase());
        out.push(s);
        if (out.length >= PROFILE_LIMITS.services) break;
    }
    return out;
};

export const validateProfilePatch = (patch: ProfilePatch): {
    ok: boolean;
    errors: { about?: string; services?: string; serviceArea?: string; licenseLine?: string; yearsLine?: string };
} => {
    const errors: { about?: string; services?: string; serviceArea?: string; licenseLine?: string; yearsLine?: string } = {};
    const tooLong = (v: string | undefined, max: number) => v !== undefined && v.trim().length > max;
    if (tooLong(patch.about, PROFILE_LIMITS.about)) errors.about = `Please keep it under ${PROFILE_LIMITS.about} characters.`;
    if (tooLong(patch.serviceArea, PROFILE_LIMITS.serviceArea)) errors.serviceArea = `Please keep it under ${PROFILE_LIMITS.serviceArea} characters.`;
    if (tooLong(patch.licenseLine, PROFILE_LIMITS.licenseLine)) errors.licenseLine = `Please keep it under ${PROFILE_LIMITS.licenseLine} characters.`;
    if (tooLong(patch.yearsLine, PROFILE_LIMITS.yearsLine)) errors.yearsLine = `Please keep it under ${PROFILE_LIMITS.yearsLine} characters.`;
    if (patch.services !== undefined) {
        const raw = Array.isArray(patch.services) ? patch.services : String(patch.services).split(/[\n,;]+/);
        const list = normalizeServices(patch.services);
        if (raw.filter(s => String(s).trim()).length > PROFILE_LIMITS.services && list.length >= PROFILE_LIMITS.services) {
            errors.services = `Up to ${PROFILE_LIMITS.services} services.`;
        } else if (raw.some(s => String(s).trim().length > PROFILE_LIMITS.serviceLength)) {
            errors.services = `Keep each service under ${PROFILE_LIMITS.serviceLength} characters.`;
        } else if (list.join('|').length > PROFILE_LIMITS.servicesTotal) {
            errors.services = 'The services list is too long.';
        }
    }
    return { ok: Object.keys(errors).length === 0, errors };
};

/** Args of update_request_profile: undefined -> null (keep); '' -> '' (remove, the database stores null). */
export const profileRpcArgs = (patch: ProfilePatch): Record<string, unknown> => ({
    p_about: patch.about === undefined ? null : (cleanMultiline(patch.about, PROFILE_LIMITS.about) ?? ''),
    p_services: patch.services === undefined ? null : normalizeServices(patch.services),
    p_service_area: patch.serviceArea === undefined ? null : (cleanLine(patch.serviceArea, PROFILE_LIMITS.serviceArea) ?? ''),
    p_license_line: patch.licenseLine === undefined ? null : (cleanLine(patch.licenseLine, PROFILE_LIMITS.licenseLine) ?? ''),
    p_years_line: patch.yearsLine === undefined ? null : (cleanLine(patch.yearsLine, PROFILE_LIMITS.yearsLine) ?? ''),
});

export const isGalleryPath = (userId: string, path: string): boolean =>
    GALLERY_PATH_RE.test(path) && path.split('/')[0] === userId;

/** Public copy: <user>/<random>.<ext> in portal-photos (same rule as components/photos/photoLogic.ts portalPhotoPath). */
export const galleryCopyPath = (userId: string, randomId: string, storagePath: string): string => {
    const ext = /\.(png|webp)$/i.exec(storagePath)?.[1]?.toLowerCase() || 'jpg';
    return `${userId}/${randomId.replace(/[^A-Za-z0-9_-]/g, '')}.${ext}`;
};

const cleanItem = (item: GalleryItem): GalleryItem => ({
    path: item.path,
    caption: cleanLine(item.caption, PROFILE_LIMITS.caption),
    photoId: item.photoId || null,
});

export const canAddToGallery = (list: GalleryItem[]): boolean => list.length < PROFILE_LIMITS.gallery;

export const addGalleryItem = (list: GalleryItem[], item: GalleryItem): GalleryItem[] => {
    if (!canAddToGallery(list) || list.some(g => g.path === item.path)) return list;
    return [...list, cleanItem(item)];
};

export const removeGalleryItem = (list: GalleryItem[], path: string): GalleryItem[] => list.filter(g => g.path !== path);

export const moveGalleryItem = (list: GalleryItem[], path: string, delta: number): GalleryItem[] => {
    const i = list.findIndex(g => g.path === path);
    if (i < 0) return list;
    const j = Math.max(0, Math.min(list.length - 1, i + delta));
    if (i === j) return list;
    const next = [...list];
    const [item] = next.splice(i, 1);
    next.splice(j, 0, item);
    return next;
};

export const setGalleryCaption = (list: GalleryItem[], path: string, caption: string | null): GalleryItem[] =>
    list.map(g => (g.path === path ? cleanItem({ ...g, caption }) : g));

export const galleryRpcPayload = (list: GalleryItem[]): Array<{ path: string; caption: string | null; photo_id: string | null }> =>
    list.slice(0, PROFILE_LIMITS.gallery).map(g => ({ path: g.path, caption: cleanLine(g.caption, PROFILE_LIMITS.caption), photo_id: g.photoId || null }));

// ------------------------------------------------------------------------------------------- parsers
const obj = (raw: unknown): Record<string, unknown> => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
    }
    return {};
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []);

export const parseGalleryItems = (raw: unknown): GalleryItem[] =>
    (Array.isArray(raw) ? raw : [])
        .map(obj)
        .filter(o => typeof o.path === 'string' && GALLERY_PATH_RE.test(o.path))
        .map(o => ({ path: String(o.path), caption: str(o.caption), photoId: str(o.photo_id) }));

export const parseMyRequestProfile = (raw: unknown): MyRequestProfile => {
    const r = obj(raw);
    return {
        slug: String(r.slug ?? ''),
        about: str(r.about),
        services: strList(r.services),
        serviceArea: str(r.service_area),
        licenseLine: str(r.license_line),
        yearsLine: str(r.years_line),
        gallery: parseGalleryItems(r.gallery),
    };
};

export const parsePublicProfileExtras = (raw: unknown, publicUrl: (path: string) => string): PublicProfileExtras => {
    const r = obj(raw);
    const avg = typeof r.rating_average === 'number' ? r.rating_average : r.rating_average != null ? Number(r.rating_average) : NaN;
    return {
        about: str(r.about),
        services: strList(r.services),
        serviceArea: str(r.service_area),
        licenseLine: str(r.license_line),
        yearsLine: str(r.years_line),
        gallery: parseGalleryItems(r.gallery).slice(0, PROFILE_LIMITS.gallery).map(g => ({ path: g.path, caption: g.caption, url: publicUrl(g.path) })),
        testimonials: (Array.isArray(r.testimonials) ? r.testimonials : []).map(parseTestimonial).filter((t): t is Testimonial => t !== null),
        ratingAverage: Number.isFinite(avg) && avg >= 1 && avg <= 5 ? Math.round(avg * 10) / 10 : null,
        ratingCount: Math.max(0, Math.floor(Number(r.rating_count) || 0)),
    };
};

export const hasProfileContent = (e: PublicProfileExtras): boolean =>
    !!(e.about || e.services.length || e.serviceArea || e.licenseLine || e.yearsLine || e.gallery.length || e.testimonials.length);
