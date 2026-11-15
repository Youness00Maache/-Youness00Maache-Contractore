import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { UserProfile } from '../types';
import {
    SunIcon, MoonIcon, DropletIcon, LanguageIcon, CreditCardIcon, LogoutIcon, BriefcaseIcon, UploadImageIcon, UserIcon,
    PenIcon, TrashIcon, StarIcon, ExternalLinkIcon, AlertTriangleIcon, CheckIcon, SparklesIcon,
} from './Icons.tsx';
import { compressImage } from '../utils/imageCompression.ts';
import { PageHeader } from './ui/PageHeader.tsx';
import SetupSignatureModal from './SetupSignatureModal.tsx';
import { getDefaultSignature, setDefaultSignature } from './SignaturePad.tsx';
import { SUPPORTED_LANGUAGES } from '../utils/translations.ts';
import { PLANS, isPaidTier, normalizeTier, type PlanTier } from '../lib/plans.ts';
import { SUPPORT_EMAIL, type UsageSnapshot } from '../lib/account.ts';
import {
    PAY_SERVICES, mapPaymentSettings, paymentSettingsOf, paymentSettingsProblem, paymentSettingsRow, samePaymentSettings,
    type PaymentSettings,
} from '../lib/payments.ts';
import { savePaymentSettings } from '../lib/paymentsApi.ts';
import { Toggle } from './forms/Fields.tsx';
import RequestLinkSettings from './requests/RequestLinkSettings.tsx';
import ReminderSettingsCard from './reminders/ReminderSettingsCard.tsx';
import DataExportSection from './export/DataExportSection.tsx';
import IntegrationsSettings from './integrations/IntegrationsSettings.tsx';
import { AICreditsRow } from './billing/AICredits.tsx';
import DocumentDesignSettings from './settings/DocumentDesignSettings.tsx';
import NotificationSettingsCard from './notifications/NotificationSettingsCard.tsx';
import AutomationsSettings from './automations/AutomationsSettings.tsx';
import { SyncChip } from './offline/OfflineContext.tsx';
import { errorText } from '../lib/offline/connection.ts';

type ThemeName = 'light' | 'dark' | 'blue';
export type SettingsSection = 'profile' | 'company' | 'payments' | 'requests' | 'signature' | 'documents' | 'appearance' | 'billing' | 'automations' | 'reminders' | 'notifications' | 'integrations' | 'data' | 'account';

interface SettingsProps {
    mode: 'settings' | 'profile';
    profile: UserProfile;
    /**
     * Should throw on failure: the page stays open with the user's edits and shows the error. Offline the app keeps the
     * save on the device (`extras.paymentSettings`: the payment / review links changed in this save, or null).
     */
    onSave: (profile: UserProfile, logoFile?: File | null, profilePicFile?: File | null, extras?: { paymentSettings?: PaymentSettings | null }) => Promise<unknown> | void;
    /** settings saved offline that haven't reached the account yet (chip next to Save) */
    syncState?: { tone: 'pending' | 'syncing' | 'error'; label: string; reason: string } | null;
    onBack: () => void;
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
    onLogout: () => void;
    onUpgradeClick?: () => void;
    /** Plan usage for the meters (from RPC get_my_usage, or counted locally). */
    usage?: UsageSnapshot | null;
    /** Opens the billing portal. Should throw with a readable message when unavailable. */
    onManageBilling?: () => Promise<void>;
    /** Persists the default signature to the account (best effort, in addition to this device). */
    onSaveSignature?: (dataUrl: string | null) => Promise<void> | void;
    /** Permanently deletes the account. Should throw when it can't. */
    onDeleteAccount?: () => Promise<void>;
    /** Section to scroll to on open. */
    initialSection?: SettingsSection;
    /** Setup assistant section (Resume setup, Remove example data); renders its own card, nothing until it has loaded. */
    setupSlot?: React.ReactNode;
    /** A price list was applied (Integrations & data): the app reloads its copy of the price book. */
    onPriceBookChanged?: () => void;
}

const THEMES: { value: ThemeName; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; swatch: string }[] = [
    { value: 'light', label: 'Light', icon: SunIcon, swatch: 'bg-white border-zinc-200' },
    { value: 'dark', label: 'Dark', icon: MoonIcon, swatch: 'bg-zinc-900 border-zinc-700' },
    { value: 'blue', label: 'Blue', icon: DropletIcon, swatch: 'bg-[#0b1530] border-[#1e3a8a]' },
];

const SECTIONS: { id: SettingsSection; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'company', label: 'Company' },
    { id: 'payments', label: 'Payments & reviews' },
    { id: 'requests', label: 'Request-a-quote link' },
    { id: 'signature', label: 'Signature' },
    { id: 'documents', label: 'Document design' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'billing', label: 'Plan & billing' },
    { id: 'automations', label: 'Automations' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'integrations', label: 'Integrations & data' },
    { id: 'data', label: 'Your data' },
    { id: 'account', label: 'Account' },
];

const editableKeys: (keyof UserProfile)[] = ['name', 'companyName', 'email', 'phone', 'website', 'address', 'jobTitle', 'language', 'logoUrl', 'profilePictureUrl'];

const formatDate = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const Section: React.FC<{ id: SettingsSection; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; tone?: 'danger' }> = ({ id, title, description, children, footer, tone }) => (
    <section id={`settings-${id}`} className={`card scroll-mt-24 ${tone === 'danger' ? 'border-destructive/30' : ''}`} aria-labelledby={`settings-${id}-title`}>
        <div className="border-b border-border px-4 py-4 sm:px-6">
            <h2 id={`settings-${id}-title`} className={`text-base font-semibold ${tone === 'danger' ? 'text-destructive' : ''}`}>{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="p-4 sm:p-6">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
    </section>
);

const Meter: React.FC<{ label: string; used: number; limit: number | null }> = ({ label, used, limit }) => (
    <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold">{used}{limit !== null ? <span className="font-normal text-muted-foreground"> / {limit}</span> : <span className="font-normal text-muted-foreground"> · unlimited</span>}</span>
        </div>
        {limit !== null && (
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${used >= limit ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }} />
            </div>
        )}
    </div>
);

const Settings: React.FC<SettingsProps> = ({
    mode, profile: initialProfile, onSave, onBack, theme, setTheme, onLogout, onUpgradeClick,
    usage, onManageBilling, onSaveSignature, onDeleteAccount, initialSection, syncState, setupSlot, onPriceBookChanged,
}) => {
    const [profile, setProfile] = useState<UserProfile>(initialProfile);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string>(initialProfile?.logoUrl || '');
    const [profilePicPreview, setProfilePicPreview] = useState<string>(initialProfile?.profilePictureUrl || '');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);
    const [signature, setSignature] = useState<string>('');
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [billingBusy, setBillingBusy] = useState(false);
    const [billingError, setBillingError] = useState<string | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteText, setDeleteText] = useState('');
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const baselineRef = useRef<UserProfile>(initialProfile);
    // "Get paid" settings (own pay link, financing link, Google review link): saved to their own columns
    const [pay, setPay] = useState<PaymentSettings>(() => paymentSettingsOf(initialProfile));
    const payBaselineRef = useRef<PaymentSettings>(paymentSettingsOf(initialProfile));
    const [payNotice, setPayNotice] = useState<string | null>(null);
    const payUnavailable = Boolean(initialProfile?.paymentSettingsUnavailable);
    const payDirty = !samePaymentSettings(pay, payBaselineRef.current);
    const updatePay = (patch: Partial<PaymentSettings>) => { setSavedAt(null); setPay(prev => ({ ...prev, ...patch })); };

    // Re-sync from the app only when there are no unsaved edits (never drop the user's typing).
    useEffect(() => {
        if (!initialProfile) return;
        const dirtyNow = editableKeys.some(k => (profile as any)[k] !== (baselineRef.current as any)[k]) || logoFile || profilePicFile;
        baselineRef.current = initialProfile;
        if (!dirtyNow) {
            setProfile(initialProfile);
            setLogoPreview(initialProfile.logoUrl || '');
            setProfilePicPreview(initialProfile.profilePictureUrl || '');
        }
        const payDirtyNow = !samePaymentSettings(pay, payBaselineRef.current);
        payBaselineRef.current = paymentSettingsOf(initialProfile);
        if (!payDirtyNow) setPay(paymentSettingsOf(initialProfile));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialProfile]);

    // Default signature: this device first, then the account copy.
    useEffect(() => {
        const local = getDefaultSignature(initialProfile?.id);
        const remote = (initialProfile as any)?.defaultSignatureUrl as string | undefined;
        if (!local && remote && remote.startsWith('data:image/')) setDefaultSignature(initialProfile.id, remote);
        setSignature(local || remote || '');
    }, [initialProfile?.id, (initialProfile as any)?.defaultSignatureUrl]);

    useEffect(() => {
        // a #section in the address (e.g. /settings#notifications from the bell) when the app didn't pass one
        const fromHash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
        const hashSection = SECTIONS.some(s => s.id === fromHash) ? (fromHash as SettingsSection) : null;
        const target = initialSection || hashSection || (mode === 'profile' ? 'profile' : null);
        if (!target) return;
        const t = setTimeout(() => document.getElementById(`settings-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        return () => clearTimeout(t);
    }, [initialSection, mode]);

    useEffect(() => () => {
        if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
        if (profilePicPreview.startsWith('blob:')) URL.revokeObjectURL(profilePicPreview);
    }, [logoPreview, profilePicPreview]);

    const [firstName, lastName] = useMemo(() => {
        const parts = (profile.name || '').trim().split(/\s+/);
        return [parts[0] || '', parts.slice(1).join(' ')];
    }, [profile.name]);

    const dirty = useMemo(
        () => editableKeys.some(k => ((profile as any)[k] || '') !== ((baselineRef.current as any)[k] || '')) || !!logoFile || !!profilePicFile || payDirty,
        [profile, logoFile, profilePicFile, payDirty],
    );

    useEffect(() => {
        if (!savedAt) return;
        const t = setTimeout(() => setSavedAt(null), 3000);
        return () => clearTimeout(t);
    }, [savedAt]);

    useEffect(() => {
        if (!dirty) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);

    const update = (key: keyof UserProfile, value: string) => {
        setSavedAt(null);
        setProfile(prev => ({ ...prev, [key]: value }));
    };

    const setName = (first: string, last: string) => update('name', `${first} ${last}`.replace(/\s+$/, '').replace(/^\s+/, ''));

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'profile') => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setImageError(null);
        if (!file.type.startsWith('image/')) { setImageError('Please choose an image file (PNG, JPG or WebP).'); return; }
        if (file.size > 10 * 1024 * 1024) { setImageError('That image is larger than 10 MB. Please choose a smaller one.'); return; }
        try {
            const compressed = await compressImage(file);
            const previewUrl = URL.createObjectURL(compressed);
            setSavedAt(null);
            if (type === 'logo') { setLogoFile(compressed); setLogoPreview(previewUrl); }
            else { setProfilePicFile(compressed); setProfilePicPreview(previewUrl); }
        } catch {
            setImageError('We could not read that image. Try a different file.');
        }
    };

    const handleSaveChanges = async () => {
        const payProblem = payDirty && !payUnavailable ? paymentSettingsProblem(pay) : null;
        if (payProblem) {
            setSaveError(payProblem);
            document.getElementById('settings-payments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        setSaving(true);
        setSaveError(null);
        setPayNotice(null);
        try {
            // links are stored as https:// addresses ("paypal.me/acme" → "https://paypal.me/acme")
            let savedPay: PaymentSettings | null = null;
            const payChanged = payDirty && !payUnavailable;
            // offline: everything (payment settings included) waits on this device and is saved when back online
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            if (payChanged && offline) {
                savedPay = mapPaymentSettings(paymentSettingsRow(pay));
            } else if (payChanged) {
                const res = await savePaymentSettings(initialProfile.id, pay);
                if (res === 'saved') savedPay = mapPaymentSettings(paymentSettingsRow(pay));
                else setPayNotice('Your payment settings need a one-time database update before they can be saved. Everything else was saved.');
            }
            await onSave(
                {
                    ...profile,
                    ...(savedPay || {}),
                    logoUrl: logoPreview ? profile.logoUrl : '',
                    profilePictureUrl: profilePicPreview ? profile.profilePictureUrl : '',
                },
                logoFile,
                profilePicFile,
                { paymentSettings: savedPay ? pay : null },
            );
            if (savedPay) {
                setPay(savedPay);
                payBaselineRef.current = savedPay;
            }
            setLogoFile(null);
            setProfilePicFile(null);
            baselineRef.current = profile;
            setSavedAt(Date.now());
        } catch (err: any) {
            setSaveError(errorText(err, 'Your changes could not be saved. Please try again.'));
        } finally {
            setSaving(false);
        }
    };

    const discardChanges = () => {
        setProfile(baselineRef.current);
        setPay(payBaselineRef.current);
        setLogoFile(null);
        setProfilePicFile(null);
        setLogoPreview(baselineRef.current.logoUrl || '');
        setProfilePicPreview(baselineRef.current.profilePictureUrl || '');
        setSaveError(null);
    };

    const saveSignature = async (dataUrl: string | null) => {
        setDefaultSignature(initialProfile.id, dataUrl || '');
        setSignature(dataUrl || '');
        try { await onSaveSignature?.(dataUrl); } catch { /* device copy is kept; the app reports sync errors */ }
    };

    const plan: PlanTier = normalizeTier((initialProfile as any)?.plan || initialProfile?.subscriptionTier);
    const paid = isPaidTier(plan);
    const status: string = (initialProfile as any)?.subscriptionStatus || (paid ? 'active' : 'none');
    const periodEnd: string | null = (initialProfile as any)?.subscriptionPeriodEnd || null;

    const openBilling = async () => {
        if (!onManageBilling) return;
        setBillingBusy(true);
        setBillingError(null);
        try { await onManageBilling(); }
        catch (err: any) { setBillingError(errorText(err, 'Could not open the billing portal.')); }
        finally { setBillingBusy(false); }
    };

    const confirmDelete = async () => {
        if (deleteText.trim().toUpperCase() !== 'DELETE' || !onDeleteAccount) return;
        setDeleteBusy(true);
        setDeleteError(null);
        try { await onDeleteAccount(); }
        catch (err: any) { setDeleteError(errorText(err, 'We could not delete your account automatically.')); setDeleteBusy(false); }
    };

    const statusBadge = (() => {
        switch (status) {
            case 'active': return <span className="badge badge-success">Active</span>;
            case 'past_due': return <span className="badge badge-warning">Payment due</span>;
            case 'cancelled': return <span className="badge badge-muted">Cancelled</span>;
            case 'paused': return <span className="badge badge-muted">Paused</span>;
            default: return null;
        }
    })();

    const periodLine = paid && periodEnd
        ? (status === 'cancelled' ? `Access ends on ${formatDate(periodEnd)}` : `Renews on ${formatDate(periodEnd)}`)
        : null;

    return (
        <div className="page max-w-5xl pb-32">
            <PageHeader title={mode === 'profile' ? 'Profile & settings' : 'Settings'} subtitle="Your details appear on every document you send." onBack={onBack} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
                <nav className="hidden lg:block" aria-label="Settings sections">
                    <ul className="sticky top-24 space-y-1">
                        {SECTIONS.map(s => (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    onClick={() => document.getElementById(`settings-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                    className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                >
                                    {s.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="min-w-0 space-y-6">
                    {setupSlot}
                    {/* Profile */}
                    <Section id="profile" title="Profile" description="Your name and photo.">
                        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                                    {profilePicPreview ? <img src={profilePicPreview} alt="Profile" className="h-full w-full object-cover" /> : <UserIcon className="h-10 w-10 text-muted-foreground" />}
                                </div>
                                <label className="btn btn-sm btn-ghost cursor-pointer">
                                    <UploadImageIcon className="h-4 w-4" /> Change photo
                                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleFileChange(e, 'profile')} />
                                </label>
                                {profilePicPreview && (
                                    <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => { setProfilePicFile(null); setProfilePicPreview(''); setProfile(p => ({ ...p, profilePictureUrl: '' })); }}>
                                        Remove
                                    </button>
                                )}
                            </div>
                            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="firstName" className="label">First name</label>
                                    <input id="firstName" className="input" value={firstName} onChange={(e) => setName(e.target.value, lastName)} autoComplete="given-name" />
                                </div>
                                <div>
                                    <label htmlFor="lastName" className="label">Last name</label>
                                    <input id="lastName" className="input" value={lastName} onChange={(e) => setName(firstName, e.target.value)} autoComplete="family-name" />
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor="jobTitle" className="label">Job title</label>
                                    <div className="relative">
                                        <BriefcaseIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <input id="jobTitle" className="input pl-10" value={profile.jobTitle || ''} onChange={(e) => update('jobTitle', e.target.value)} placeholder="e.g. General contractor" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* Company */}
                    <Section id="company" title="Company" description="Shown in the header of your invoices, estimates and reports.">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="companyName" className="label">Company name</label>
                                <input id="companyName" className="input" value={profile.companyName || ''} onChange={(e) => update('companyName', e.target.value)} autoComplete="organization" />
                            </div>
                            <div>
                                <label htmlFor="email" className="label">Business email</label>
                                <input id="email" type="email" className="input" value={profile.email || ''} onChange={(e) => update('email', e.target.value)} autoComplete="email" />
                            </div>
                            <div>
                                <label htmlFor="phone" className="label">Phone</label>
                                <input id="phone" type="tel" className="input" value={profile.phone || ''} onChange={(e) => update('phone', e.target.value)} autoComplete="tel" />
                            </div>
                            <div>
                                <label htmlFor="website" className="label">Website</label>
                                <input id="website" className="input" value={profile.website || ''} onChange={(e) => update('website', e.target.value)} placeholder="https://" autoComplete="url" />
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="address" className="label">Address</label>
                                <input id="address" className="input" value={profile.address || ''} onChange={(e) => update('address', e.target.value)} autoComplete="street-address" />
                            </div>
                            <div className="sm:col-span-2">
                                <span className="label">Logo</span>
                                <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-4 sm:flex-row sm:items-center">
                                    <div className="flex h-16 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
                                        {logoPreview ? <img src={logoPreview} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-zinc-400">No logo</span>}
                                    </div>
                                    <div className="flex-1 text-sm text-muted-foreground">PNG or JPG, ideally on a white or transparent background.</div>
                                    <div className="flex gap-2">
                                        <label className="btn btn-sm btn-outline cursor-pointer">
                                            <UploadImageIcon className="h-4 w-4" /> {logoPreview ? 'Replace' : 'Upload'}
                                            <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleFileChange(e, 'logo')} />
                                        </label>
                                        {logoPreview && (
                                            <button type="button" className="btn btn-sm btn-ghost text-destructive" onClick={() => { setLogoFile(null); setLogoPreview(''); setProfile(p => ({ ...p, logoUrl: '' })); }}>
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {imageError && <p role="alert" className="mt-3 text-sm text-destructive">{imageError}</p>}
                    </Section>

                    {/* Payments & reviews: the contractor's own links; ContractorDocs never handles the money */}
                    <Section id="payments" title="Payments & reviews" description="Your own payment page, financing partner and Google reviews. Clients pay you directly.">
                        {payUnavailable && (
                            <p className="mb-5 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm text-foreground">
                                <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                                These settings need a one-time database update before they can be saved. Everything else on this page works as usual.
                            </p>
                        )}
                        {payNotice && <p role="status" className="mb-5 rounded-xl bg-warning/10 px-3 py-2 text-sm text-foreground">{payNotice}</p>}
                        <fieldset disabled={payUnavailable} className="space-y-6 divide-y divide-border disabled:opacity-60">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div className="sm:col-span-3">
                                    <h3 className="text-sm font-semibold text-foreground">“Pay now” link</h3>
                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                        Your PayPal.me, Square, Venmo, Stripe Payment Link or bank page. New invoices get it automatically (you can change it on each one).
                                        Clients see a Pay now button with the amount due in the portal and the email, and a “Scan to pay” code on the PDF.
                                    </p>
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor="payLinkDefault" className="label">Payment link</label>
                                    <input id="payLinkDefault" type="url" inputMode="url" className="input" value={pay.payLinkDefault} onChange={(e) => updatePay({ payLinkDefault: e.target.value })} placeholder="https://paypal.me/yourcompany" autoComplete="off" />
                                </div>
                                <div>
                                    <label htmlFor="payLinkLabel" className="label">Shown as (optional)</label>
                                    <input id="payLinkLabel" className="input" list="pay-services" value={pay.payLinkLabel} onChange={(e) => updatePay({ payLinkLabel: e.target.value })} placeholder="PayPal" maxLength={40} autoComplete="off" />
                                    <datalist id="pay-services">{PAY_SERVICES.map(s => <option key={s} value={s} />)}</datalist>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3">
                                <div className="sm:col-span-3">
                                    <h3 className="text-sm font-semibold text-foreground">Financing for larger jobs</h3>
                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                        Paste your application link from Wisetack, Hearth, GoodLeap or your local lender. Estimates from the amount you choose show
                                        “Financing available” in the portal and on the PDF. The lender shows the terms; no rates are printed by ContractorDocs.
                                    </p>
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor="financingLink" className="label">Financing link</label>
                                    <input id="financingLink" type="url" inputMode="url" className="input" value={pay.financingLink} onChange={(e) => updatePay({ financingLink: e.target.value })} placeholder="https://" autoComplete="off" />
                                </div>
                                <div>
                                    <label htmlFor="financingMin" className="label">Show on estimates from ($)</label>
                                    <input
                                        id="financingMin"
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step="100"
                                        className="input"
                                        value={pay.financingMinAmount ? String(pay.financingMinAmount) : ''}
                                        onChange={(e) => updatePay({ financingMinAmount: Math.max(0, Number(e.target.value) || 0) })}
                                        placeholder="e.g. 2000"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 pt-6">
                                <div>
                                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                        Google review request {!paid && <span className="badge badge-primary">Premium</span>}
                                    </h3>
                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                        After you mark an invoice as paid, send the client a short thank-you with your review link (email from your Gmail, or copy it into a text).
                                        Every client gets the same request: Google doesn’t allow asking only the happy ones.
                                    </p>
                                </div>
                                <div>
                                    <label htmlFor="googleReviewLink" className="label">Google review link</label>
                                    <input id="googleReviewLink" type="url" inputMode="url" className="input" value={pay.googleReviewLink} onChange={(e) => updatePay({ googleReviewLink: e.target.value })} placeholder="https://g.page/r/…/review" autoComplete="off" />
                                    <p className="mt-1.5 text-xs text-muted-foreground">Find it in your Google Business Profile under “Ask for reviews”.</p>
                                </div>
                                <Toggle
                                    checked={pay.reviewAutoSend && paid}
                                    onChange={(on) => updatePay({ reviewAutoSend: on })}
                                    disabled={!paid || payUnavailable}
                                    label="Send it automatically when I mark an invoice as paid"
                                    description={paid ? 'Uses your connected Gmail. One request per invoice; you can always send it by hand instead.' : 'Part of Premium. Upgrade to send review requests after each payment.'}
                                />
                                {!paid && onUpgradeClick && (
                                    <div><button type="button" className="btn btn-outline btn-sm" onClick={onUpgradeClick}><StarIcon className="h-4 w-4" /> Upgrade for review requests</button></div>
                                )}
                            </div>
                        </fieldset>
                    </Section>

                    {/* Request-a-quote link (public request page + QR; components/requests) */}
                    <Section id="requests" title="Request-a-quote link" description="A public page and QR code where new clients can ask you for a quote.">
                        <RequestLinkSettings
                            embedded
                            plan={plan}
                            companyName={profile.companyName || profile.name}
                            logoUrl={profile.logoUrl}
                            phone={profile.phone}
                            onUpgrade={onUpgradeClick ? () => onUpgradeClick() : undefined}
                        />
                    </Section>

                    {/* Signature */}
                    <Section id="signature" title="Default signature" description="Offered when you sign a document, so you don't have to draw it every time. It's only added when you choose it.">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="flex h-24 w-full max-w-xs items-center justify-center rounded-xl border border-border bg-white px-3">
                                {signature ? <img src={signature} alt="Your saved signature" className="max-h-20 max-w-full object-contain" /> : <span className="text-sm text-zinc-400">No signature saved</span>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className="btn btn-outline" onClick={() => setShowSignatureModal(true)}>
                                    <PenIcon className="h-4 w-4" /> {signature ? 'Change signature' : 'Add signature'}
                                </button>
                                {signature && (
                                    <button type="button" className="btn btn-ghost text-destructive" onClick={() => saveSignature(null)}>
                                        <TrashIcon className="h-4 w-4" /> Remove
                                    </button>
                                )}
                            </div>
                        </div>
                    </Section>

                    {/* Document design: default PDF design of new documents (same setting as the picker's "Use for new documents") */}
                    <Section id="documents" title="Document design" description="The PDF design new invoices, estimates and other documents start with. You can still change it on each document.">
                        <DocumentDesignSettings plan={plan} />
                    </Section>

                    {/* Appearance */}
                    <Section id="appearance" title="Appearance & language">
                        <div className="space-y-6">
                            <div>
                                <span className="label">Theme</span>
                                <div className="grid grid-cols-3 gap-2 sm:max-w-md" role="radiogroup" aria-label="Theme">
                                    {THEMES.map(({ value, label, icon: Icon, swatch }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={theme === value}
                                            onClick={() => setTheme(value)}
                                            className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-sm font-medium transition ${theme === value ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:bg-muted'}`}
                                        >
                                            <span className={`flex h-10 w-full items-center justify-center rounded-lg border ${swatch}`}>
                                                <Icon className={`h-4 w-4 ${value === 'light' ? 'text-amber-500' : 'text-sky-300'}`} />
                                            </span>
                                            <span className="flex items-center gap-1">{theme === value && <CheckIcon className="h-3.5 w-3.5 text-primary" />}{label}</span>
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">Applied right away and saved to your account, so it follows you to every device you sign in on.</p>
                            </div>
                            <div className="sm:max-w-xs">
                                <label htmlFor="language" className="label flex items-center gap-1.5"><LanguageIcon className="h-3.5 w-3.5" /> Language</label>
                                <select id="language" className="input" value={profile.language || 'English'} onChange={(e) => update('language', e.target.value)}>
                                    {SUPPORTED_LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                                </select>
                            </div>
                        </div>
                    </Section>

                    {/* Billing */}
                    <Section id="billing" title="Plan & billing">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${paid ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                    {plan === 'ai' ? <SparklesIcon className="h-5 w-5" /> : paid ? <StarIcon className="h-5 w-5" /> : <CreditCardIcon className="h-5 w-5" />}
                                </span>
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-lg font-bold">{PLANS[plan].name}</h3>
                                        {statusBadge}
                                    </div>
                                    <p className="text-sm text-muted-foreground">{periodLine || PLANS[plan].tagline}</p>
                                    {status === 'past_due' && (
                                        <p className="mt-1 flex items-center gap-1.5 text-sm text-warning"><AlertTriangleIcon className="h-4 w-4" /> Your last payment failed. Update your payment method to keep Premium.</p>
                                    )}
                                    {status === 'cancelled' && (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Your data stays yours: you can still{' '}
                                            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => document.getElementById('settings-data')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                                                export everything
                                            </button>{' '}on any plan.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 sm:items-end">
                                {paid ? (
                                    <button type="button" className="btn btn-outline" onClick={openBilling} disabled={billingBusy || !onManageBilling}>
                                        {billingBusy ? 'Opening...' : <>Manage billing <ExternalLinkIcon className="h-4 w-4" /></>}
                                    </button>
                                ) : (
                                    <button type="button" className="btn btn-primary" onClick={onUpgradeClick}>
                                        <StarIcon className="h-4 w-4" /> Upgrade
                                    </button>
                                )}
                            </div>
                        </div>
                        {billingError && <p role="alert" className="mt-3 text-sm text-destructive">{billingError}</p>}

                        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <Meter label="New jobs this month" used={usage?.jobsThisMonth ?? 0} limit={usage?.limits.jobs ?? null} />
                            <Meter label={usage?.limits.clients ? "New clients this month" : "Saved clients"} used={(usage?.limits.clients ? usage?.clientsThisMonth : usage?.clientsTotal) ?? 0} limit={usage?.limits.clients ?? null} />
                            <Meter label="Emails sent this month" used={usage?.emailsThisMonth ?? 0} limit={usage?.limits.emails ?? null} />
                            <Meter label="AI requests this month" used={usage?.aiThisMonth ?? 0} limit={usage?.limits.ai ?? null} />
                        </div>
                        {!paid && usage?.limits.docs != null && (
                            <p className="mt-4 text-xs text-muted-foreground">Free plan: up to {usage.limits.docs} new documents per job each month.</p>
                        )}
                        {usage && !usage.fromServer && (
                            <p className="mt-2 text-xs text-muted-foreground">Usage counted from the data loaded on this device.</p>
                        )}
                        {/* AI credit top-ups: renders nothing until the server enables them (components/billing/AICredits.tsx) */}
                        <AICreditsRow />
                    </Section>

                    {/* Automations: the rules list (components/automations; id settings-automations). Its reminder and bell switches are bound to the settings of the cards below. */}
                    <AutomationsSettings plan={plan} onUpgradeClick={onUpgradeClick} reviewLink={initialProfile.googleReviewLink || ''} company={profile.companyName || ''} myName={profile.name || ''} />

                    {/* Reminders & follow-ups (components/reminders; the card's id is settings-reminders) */}
                    <ReminderSettingsCard onUpgradeClick={onUpgradeClick} />

                    {/* Notifications: the bell's types, quiet mode, browser pop-ups (components/notifications; id settings-notifications) */}
                    <NotificationSettingsCard />

                    {/* Integrations & data: Gmail, calendar file, QuickBooks / Xero files, price list import (components/integrations; id settings-integrations) */}
                    <IntegrationsSettings profile={initialProfile} plan={plan} onUpgradeClick={onUpgradeClick} onPriceBookChanged={onPriceBookChanged} />

                    {/* Your data: export everything + bookkeeper CSV, on every plan (components/export; id settings-data) */}
                    <DataExportSection profile={initialProfile} onUpgradeClick={onUpgradeClick} />

                    {/* Account */}
                    <Section id="account" title="Account" tone="danger">
                        <div className="space-y-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="font-medium">Log out</p>
                                    <p className="text-sm text-muted-foreground">Sign out and clear your data from this device.</p>
                                </div>
                                <button type="button" className="btn btn-outline" onClick={onLogout}><LogoutIcon className="h-4 w-4" /> Log out</button>
                            </div>
                            <div className="border-t border-border pt-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="font-medium text-destructive">Delete account</p>
                                        <p className="text-sm text-muted-foreground">Permanently delete your account, jobs, documents and clients. This can't be undone.</p>
                                    </div>
                                    {!deleteOpen && (
                                        <button type="button" className="btn btn-danger" onClick={() => { setDeleteOpen(true); setDeleteText(''); setDeleteError(null); }}>
                                            <TrashIcon className="h-4 w-4" /> Delete account
                                        </button>
                                    )}
                                </div>
                                {deleteOpen && (
                                    <div className="mt-4 space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                                        {paid && <p className="text-sm text-foreground">Your paid subscription will be cancelled as part of the deletion.</p>}
                                        <label htmlFor="delete-confirm" className="block text-sm">Type <strong>DELETE</strong> to confirm.</label>
                                        <input id="delete-confirm" className="input max-w-xs" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />
                                        {deleteError && (
                                            <p role="alert" className="text-sm text-destructive">
                                                {deleteError}{' '}
                                                <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Delete my ContractorDocs account')}&body=${encodeURIComponent(`Please delete my account (${initialProfile.email || initialProfile.id}) and all its data.`)}`}>
                                                    Email support to delete it
                                                </a>.
                                            </p>
                                        )}
                                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                                            <button type="button" className="btn btn-outline" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>Cancel</button>
                                            <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleteBusy || deleteText.trim().toUpperCase() !== 'DELETE'}>
                                                {deleteBusy ? 'Deleting...' : 'Permanently delete'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Section>
                </div>
            </div>

            {/* Sticky save bar */}
            {(dirty || saveError || savedAt) && (
                <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:bottom-4">
                    <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-border bg-popover p-3 shadow-lift sm:flex-row sm:items-center sm:justify-between">
                        <p className={`flex min-w-0 items-center gap-2 text-sm ${saveError ? 'text-destructive' : 'text-muted-foreground'}`} role={saveError ? 'alert' : 'status'}>
                            {saveError ? saveError : dirty ? 'You have unsaved changes.' : syncState ? 'Saved on this device. It syncs when you’re back online.' : 'All changes saved.'}
                            {!saveError && !dirty && syncState && <SyncChip tone={syncState.tone} label={syncState.label} title={syncState.reason} />}
                        </p>
                        {dirty && (
                            <div className="flex gap-2">
                                <button type="button" className="btn btn-ghost flex-1 sm:flex-none" onClick={discardChanges} disabled={saving}>Discard</button>
                                <button type="button" className="btn btn-primary flex-1 sm:flex-none" onClick={handleSaveChanges} disabled={saving}>
                                    {saving && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
                                    {saving ? 'Saving...' : 'Save changes'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showSignatureModal && (
                <SetupSignatureModal
                    initialDataUrl={signature || undefined}
                    userId={initialProfile.id}
                    title="Your default signature"
                    description="Saved to your account for quick signing. It's only added to a document when you choose it."
                    onClose={() => setShowSignatureModal(false)}
                    onSave={(url) => { saveSignature(url); }}
                />
            )}
        </div>
    );
};

export default Settings;
