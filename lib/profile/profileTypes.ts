/**
 * Richer public profile on /r/<slug> (roadmap D8): shapes + limits. New nullable request_pages columns and the
 * functions get_my_request_profile / update_request_profile / set_request_profile_gallery / get_public_profile_extras
 * of supabase/migrations/20261116001000_feedback_profile.sql (keep PROFILE_LIMITS in sync with it).
 *
 *   GalleryItem          { path, caption: string | null, photoId: string | null }
 *                        path = public copy in the portal-photos bucket: '<user_id>/<random>.<jpg|png|webp>'
 *   MyRequestProfile     (owner) { slug, about, services: string[], serviceArea, licenseLine, yearsLine,
 *                        gallery: GalleryItem[] }   (text fields: string | null)
 *   ProfilePatch         { about?, services?, serviceArea?, licenseLine?, yearsLine? }
 *                        omitted = keep; '' / [] = remove
 *   PublicGalleryItem    { path, caption: string | null, url }   (url = public URL of the copy)
 *   PublicProfileExtras  { about, services, serviceArea, licenseLine, yearsLine, gallery: PublicGalleryItem[],
 *                        testimonials: Testimonial[] (lib/feedback/feedbackTypes.ts), ratingAverage: number | null,
 *                        ratingCount }   — approved testimonials only; a page turned off returns empty extras
 */
import type { Testimonial } from '../feedback/feedbackTypes.ts';

export const PROFILE_LIMITS = {
    about: 1500,
    services: 20,
    serviceLength: 60,
    servicesTotal: 1400,
    serviceArea: 200,
    licenseLine: 160,
    yearsLine: 80,
    gallery: 12,
    caption: 200,
} as const;

export interface GalleryItem {
    path: string;
    caption: string | null;
    photoId: string | null;
}

export interface MyRequestProfile {
    slug: string;
    about: string | null;
    services: string[];
    serviceArea: string | null;
    licenseLine: string | null;
    yearsLine: string | null;
    gallery: GalleryItem[];
}

export interface ProfilePatch {
    about?: string;
    services?: string[] | string;
    serviceArea?: string;
    licenseLine?: string;
    yearsLine?: string;
}

export interface PublicGalleryItem {
    path: string;
    caption: string | null;
    url: string;
}

export interface PublicProfileExtras {
    about: string | null;
    services: string[];
    serviceArea: string | null;
    licenseLine: string | null;
    yearsLine: string | null;
    gallery: PublicGalleryItem[];
    testimonials: Testimonial[];
    ratingAverage: number | null;
    ratingCount: number;
}

export type ProfileExtrasResult =
    | { status: 'ready'; data: PublicProfileExtras }
    | { status: 'missing' }
    | { status: 'invalid' }
    | { status: 'error'; message: string };
