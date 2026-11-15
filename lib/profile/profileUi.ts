/**
 * Richer public profile (roadmap D8, phase B): the pure rules behind the screens (no React, no Supabase), tested by
 * scripts/feedback-check.ts. Data layer: ./profileApi.ts, ./profileLogic.ts.
 *
 *   profileSections(extras)       which blocks of /r/<slug> have something to show: nothing for an empty field, and an
 *                                 empty extras object shows no section at all (the page stays exactly as it was)
 *   monthYear('2026-11-05')       'November 2026'
 *   ratingLine(avg, count)        '4.8 from 12 reviews' / '5.0 from 1 review'
 *   lightboxStep(index, n, key)   gallery viewer keys: arrows wrap around, Home / End -> first / last, null = key not used
 *   addServiceChip(list, text)    the services list as chips (up to 20, 60 characters each, no duplicates)
 *   removeServiceChip(list, i)
 *   profilePatchFrom(form)        the form values -> ProfilePatch (only what changed; '' removes a field)
 *   profileFormFrom(profile)      MyRequestProfile -> form values
 *   profileFillCount(profile)     how many of the 6 parts are filled ("4 of 6")
 *   previewExtras(...)            the owner's saved profile + the testimonials on the page, as the public page will show it
 */
import { PROFILE_LIMITS, type MyRequestProfile, type ProfilePatch, type PublicProfileExtras } from './profileTypes.ts';
import { EMPTY_PROFILE_EXTRAS, normalizeServices } from './profileLogic.ts';
import type { Testimonial } from '../feedback/feedbackTypes.ts';

export interface ProfileSections {
    about: boolean;
    services: boolean;
    /** area / license / years lines */
    facts: boolean;
    gallery: boolean;
    reviews: boolean;
    /** at least one block has content */
    any: boolean;
}

export const profileSections = (e: PublicProfileExtras | null | undefined): ProfileSections => {
    const x = e || EMPTY_PROFILE_EXTRAS;
    const about = !!(x.about && x.about.trim());
    const services = x.services.length > 0;
    const facts = !!((x.serviceArea && x.serviceArea.trim()) || (x.licenseLine && x.licenseLine.trim()) || (x.yearsLine && x.yearsLine.trim()));
    const gallery = x.gallery.length > 0;
    const reviews = x.testimonials.length > 0;
    return { about, services, facts, gallery, reviews, any: about || services || facts || gallery || reviews };
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const monthYear = (ymd: string | null | undefined): string => {
    const m = /^(\d{4})-(\d{2})/.exec(String(ymd ?? ''));
    if (!m) return '';
    const month = MONTHS[Number(m[2]) - 1];
    return month ? `${month} ${m[1]}` : '';
};

export const ratingLine = (average: number | null | undefined, count: number): string => {
    if (average === null || average === undefined || !(count > 0)) return '';
    return `${average.toFixed(1)} from ${count} ${count === 1 ? 'review' : 'reviews'}`;
};

export const lightboxStep = (index: number, count: number, key: string): number | null => {
    if (count <= 0) return null;
    switch (key) {
        case 'ArrowRight': return (index + 1) % count;
        case 'ArrowLeft': return (index - 1 + count) % count;
        case 'Home': return 0;
        case 'End': return count - 1;
        default: return null;
    }
};

// ------------------------------------------------------------------------------------------------- owner form
export interface ProfileForm {
    about: string;
    services: string[];
    serviceArea: string;
    licenseLine: string;
    yearsLine: string;
}

export const EMPTY_PROFILE_FORM: ProfileForm = { about: '', services: [], serviceArea: '', licenseLine: '', yearsLine: '' };

export const profileFormFrom = (p: MyRequestProfile | null | undefined): ProfileForm => ({
    about: p?.about || '',
    services: p ? [...p.services] : [],
    serviceArea: p?.serviceArea || '',
    licenseLine: p?.licenseLine || '',
    yearsLine: p?.yearsLine || '',
});

export const addServiceChip = (list: string[], text: string): string[] => normalizeServices([...list, ...String(text ?? '').split(/[\n,;]+/)]);

export const removeServiceChip = (list: string[], index: number): string[] => list.filter((_, i) => i !== index);

export const canAddService = (list: string[]): boolean => list.length < PROFILE_LIMITS.services;

export const sameProfileForm = (a: ProfileForm, b: ProfileForm): boolean =>
    a.about.trim() === b.about.trim()
    && a.serviceArea.trim() === b.serviceArea.trim()
    && a.licenseLine.trim() === b.licenseLine.trim()
    && a.yearsLine.trim() === b.yearsLine.trim()
    && a.services.join('\u0001') === b.services.join('\u0001');

/** Only the fields that differ from what is saved (an empty value removes the field). */
export const profilePatchFrom = (form: ProfileForm, saved: ProfileForm): ProfilePatch => {
    const patch: ProfilePatch = {};
    if (form.about.trim() !== saved.about.trim()) patch.about = form.about.trim();
    if (form.serviceArea.trim() !== saved.serviceArea.trim()) patch.serviceArea = form.serviceArea.trim();
    if (form.licenseLine.trim() !== saved.licenseLine.trim()) patch.licenseLine = form.licenseLine.trim();
    if (form.yearsLine.trim() !== saved.yearsLine.trim()) patch.yearsLine = form.yearsLine.trim();
    if (form.services.join('\u0001') !== saved.services.join('\u0001')) patch.services = [...form.services];
    return patch;
};

export const profileFillCount = (p: ProfileForm, galleryCount: number): { filled: number; total: number } => {
    const parts = [!!p.about.trim(), p.services.length > 0, !!p.serviceArea.trim(), !!p.licenseLine.trim(), !!p.yearsLine.trim(), galleryCount > 0];
    return { filled: parts.filter(Boolean).length, total: parts.length };
};

/** The public page as it will look: the form as typed (even before saving), the gallery and the approved testimonials. */
export const previewExtras = (
    form: ProfileForm,
    gallery: Array<{ path: string; caption: string | null }>,
    galleryUrl: (path: string) => string,
    testimonials: Testimonial[],
    ratingAverage: number | null,
): PublicProfileExtras => ({
    about: form.about.trim() || null,
    services: normalizeServices(form.services),
    serviceArea: form.serviceArea.trim() || null,
    licenseLine: form.licenseLine.trim() || null,
    yearsLine: form.yearsLine.trim() || null,
    gallery: gallery.map(g => ({ path: g.path, caption: g.caption, url: galleryUrl(g.path) })),
    testimonials,
    ratingAverage,
    ratingCount: testimonials.length,
});
