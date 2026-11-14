/**
 * Settings saved without a connection (Settings / Profile: profile, company details, logo and picture, payment and
 * review links). No React, no Supabase: tested by scripts/offline-drafts-check.ts.
 *
 *  - The save becomes ONE outbox item per user (`profile`, docId = the user id): a patch of the profiles row. Later
 *    offline saves merge into it (the newest value of each field wins).
 *  - A logo / picture picked offline is kept inside the patch as a compressed data URL (shown at once) and uploaded to
 *    the same bucket as online when the item syncs (sync engine photo step).
 *  - Last write wins: the item remembers the account's values of the fields it changes (OutboxBase hash + keys); when
 *    those changed on another device meanwhile, the offline version is still saved and the other version is kept in
 *    the outbox history for 7 days with a "Changed on another device" notice (same as documents).
 */
import type { UserProfile } from '../../types.ts';
import { mapPaymentSettings, paymentSettingsOf, paymentSettingsRow, type PaymentSettings } from '../payments.ts';
import { contentHash, entityOf, itemsOfUser, rowSnapshot, type OutboxBase, type OutboxItem } from './outboxModel.ts';

/** Payment / review columns: a database without them saves the rest (as online: "needs a one-time update"). */
export const PROFILE_PAYMENT_COLUMNS = ['default_pay_link', 'default_pay_link_label', 'financing_link', 'financing_min_amount', 'google_review_link', 'review_auto_send'] as const;

const trim = (v: unknown) => String(v ?? '').trim();

/**
 * The profiles columns a Settings save writes (same values as the online save in App.tsx handleSaveProfile).
 * `images` are the logo / picture URLs to store (an upload's URL online, a data URL offline).
 */
export const profileRowOf = (p: Partial<UserProfile>, images?: { logoUrl?: string; pictureUrl?: string }): Record<string, unknown> => ({
    name: trim(p.name),
    company_name: trim(p.companyName),
    email: trim(p.email),
    phone: trim(p.phone),
    address: trim(p.address),
    website: trim(p.website),
    logo_url: (images?.logoUrl ?? p.logoUrl) || null,
    profile_picture_url: (images?.pictureUrl ?? p.profilePictureUrl) || null,
    job_title: trim(p.jobTitle),
    language: p.language || 'English',
    email_templates: p.emailTemplates ?? {},
});

/** The settings patch of an offline save (payment settings only when they were changed). */
export const offlineProfilePatch = (
    p: Partial<UserProfile>,
    images: { logoUrl?: string; pictureUrl?: string },
    payment?: PaymentSettings | null,
): Record<string, unknown> => ({
    ...profileRowOf(p, images),
    ...(payment ? paymentSettingsRow(payment) : {}),
});

/** Conflict base: the account's values (as this device last saw them) of the columns the patch changes. */
export const profileBaseFor = (baseline: Partial<UserProfile>, patch: Record<string, unknown>): OutboxBase => {
    const keys = Object.keys(patch).filter(k => k !== 'id' && k !== 'updated_at' && k !== 'theme').sort();
    const hasPayment = keys.some(k => (PROFILE_PAYMENT_COLUMNS as readonly string[]).includes(k));
    const known = { ...profileRowOf(baseline), ...(hasPayment ? paymentSettingsRow(paymentSettingsOf(baseline)) : {}) };
    return { hash: contentHash(rowSnapshot(known, keys)), updatedAt: null, keys };
};

/**
 * The account's profiles row in the form profileBaseFor() hashes (the same defaults the app applies when it loads a
 * profile: lib/account.ts mapProfileRow), so "changed on another device" only fires for a real change.
 */
export const comparableProfileRow = (row: Record<string, unknown>): Record<string, unknown> => ({
    ...profileRowOf({
        name: String(row.name || ''),
        companyName: String(row.company_name || ''),
        email: String(row.email || ''),
        phone: String(row.phone || ''),
        address: String(row.address || ''),
        website: String(row.website || ''),
        logoUrl: String(row.logo_url || ''),
        profilePictureUrl: String(row.profile_picture_url || ''),
        jobTitle: String(row.job_title || ''),
        language: String(row.language || '') || 'English',
        emailTemplates: (row.email_templates as UserProfile['emailTemplates']) || {},
    }),
    ...('default_pay_link' in row ? paymentSettingsRow(mapPaymentSettings(row)) : {}),
});

/** A profiles patch → the profile fields the app shows (only the fields in the patch). */
export const profileFieldsFromRow = (row: Record<string, unknown>): Partial<UserProfile> => {
    const out: Partial<UserProfile> & Record<string, unknown> = {};
    const str = (k: string) => String(row[k] ?? '');
    if ('name' in row) out.name = str('name');
    if ('company_name' in row) out.companyName = str('company_name');
    if ('email' in row) out.email = str('email');
    if ('phone' in row) out.phone = str('phone');
    if ('address' in row) out.address = str('address');
    if ('website' in row) out.website = str('website');
    if ('logo_url' in row) out.logoUrl = str('logo_url');
    if ('profile_picture_url' in row) out.profilePictureUrl = str('profile_picture_url');
    if ('job_title' in row) out.jobTitle = str('job_title');
    if ('language' in row) out.language = str('language') || 'English';
    if ('email_templates' in row && row.email_templates && typeof row.email_templates === 'object') out.emailTemplates = row.email_templates as UserProfile['emailTemplates'];
    if (PROFILE_PAYMENT_COLUMNS.some(k => k in row)) Object.assign(out, mapPaymentSettings(row));
    return out;
};

/** The settings waiting in this user's outbox (null = none). */
export const pendingProfileItem = (items: readonly OutboxItem[], userId: string | null | undefined): OutboxItem | null =>
    itemsOfUser(items, userId).find(i => entityOf(i) === 'profile' && i.docId === userId) ?? null;

/** The profile the app shows: the account's (or the device's copy) with settings saved offline on top. */
export const applyProfileOverlay = <T extends Partial<UserProfile>>(profile: T | null, items: readonly OutboxItem[], userId: string | null | undefined): T | null => {
    if (!profile) return profile;
    const item = pendingProfileItem(items, userId);
    if (!item) return profile;
    return { ...profile, ...profileFieldsFromRow(item.data || {}) };
};

/** The patch without the payment columns (a database that doesn't have them yet). */
export const withoutPaymentColumns = (row: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) if (!(PROFILE_PAYMENT_COLUMNS as readonly string[]).includes(k)) out[k] = v;
    return out;
};
