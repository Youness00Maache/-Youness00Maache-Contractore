/**
 * Settings › Request-a-quote link › "Public profile": what shows under the request form on /r/<slug> (roadmap D8): About,
 * what you do (chips, up to 20), where you work, your license line, your years, a photo gallery (components/profile/GalleryManager.tsx)
 * and the testimonials you approved (managed in Settings › Client feedback). A live preview shows the page section as clients see it
 * (the same component the public page draws: components/profile/PublicProfileView.tsx).
 * Profile fields are free on every plan. Hidden until the database has the feature (lib/profile/profileApi.ts useProfileFeature).
 * A paused request page shows a note: the profile appears on the page only while the page is on.
 *
 * Mount: RequestLinkSettings (withProfile) renders <PublicProfileEditor pageEnabled={page.enabled} />.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { getMyRequestProfile, galleryPublicUrl, updateMyRequestProfile, useProfileFeature } from '../../lib/profile/profileApi.ts';
import { validateProfilePatch } from '../../lib/profile/profileLogic.ts';
import { PROFILE_LIMITS, type MyRequestProfile } from '../../lib/profile/profileTypes.ts';
import {
    EMPTY_PROFILE_FORM, addServiceChip, canAddService, previewExtras, profileFillCount, profileFormFrom, profilePatchFrom, profileSections,
    removeServiceChip, sameProfileForm, type ProfileForm,
} from '../../lib/profile/profileUi.ts';
import { useFeedbackFeature } from '../../lib/feedback/feedbackApi.ts';
import { approvedTestimonials, averageRating } from '../../lib/feedback/feedbackLogic.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError } from '../../lib/account.ts';
import { toast } from '../Toast.tsx';
import { Notice } from '../commsKit.tsx';
import { getCurrentUserId } from '../viewKit.tsx';
import { ChevronDownIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { useFeedbackList, useOnline } from '../feedback/useFeedbackList.ts';
import GalleryManager from './GalleryManager.tsx';
import PublicProfileView from './PublicProfileView.tsx';

const Counter: React.FC<{ n: number; max: number }> = ({ n, max }) => (
    <span className={`text-xs tabular-nums ${n > max ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{n}/{max}</span>
);

const PublicProfileEditor: React.FC<{ pageEnabled: boolean; companyName?: string; className?: string }> = ({ pageEnabled, companyName, className = '' }) => {
    const online = useOnline();
    const [userId, setUserId] = useState<string | null>(null);
    useEffect(() => { void getCurrentUserId().then(setUserId).catch(() => undefined); }, []);
    const feature = useProfileFeature(userId, online);
    const feedbackFeature = useFeedbackFeature(userId, online);
    const ready = feature === 'ready';

    const [open, setOpen] = useState(false);
    const [saved, setSaved] = useState<MyRequestProfile | null | undefined>(undefined);
    const [loadError, setLoadError] = useState('');
    const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE_FORM);
    const [chip, setChip] = useState('');
    const [saving, setSaving] = useState(false);

    const feedback = useFeedbackList({ enabled: feedbackFeature === 'ready', isOnline: online });

    const load = async () => {
        try {
            const p = await getMyRequestProfile();
            setSaved(p);
            setLoadError('');
            if (p) setForm(profileFormFrom(p));
        } catch (e) {
            setLoadError(describeError(e, 'Your profile could not be loaded.'));
            setSaved(prev => (prev === undefined ? null : prev));
        }
    };
    useEffect(() => { if (ready && online) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ready, online]);

    const savedForm = useMemo(() => profileFormFrom(saved), [saved]);
    const dirty = !sameProfileForm(form, savedForm);
    const checks = validateProfilePatch({ about: form.about, serviceArea: form.serviceArea, licenseLine: form.licenseLine, yearsLine: form.yearsLine, services: form.services });
    const gallery = saved?.gallery || [];
    const fill = profileFillCount(savedForm, gallery.length);

    const testimonials = useMemo(() => approvedTestimonials(feedback.rows || []), [feedback.rows]);
    const preview = useMemo(
        () => previewExtras(form, gallery, galleryPublicUrl, testimonials, averageRating(testimonials.map(t => t.rating))),
        [form, gallery, testimonials],
    );

    if (!ready || (saved === null && !loadError)) return null;

    const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => setForm(f => ({ ...f, [key]: value }));

    const addChips = () => {
        if (!chip.trim()) return;
        set('services', addServiceChip(form.services, chip));
        setChip('');
    };

    const save = async () => {
        if (!online) { toast.error(NEEDS_CONNECTION); return; }
        if (!checks.ok) return;
        const patch = profilePatchFrom(form, savedForm);
        if (!Object.keys(patch).length) return;
        setSaving(true);
        try {
            const next = await updateMyRequestProfile(patch);
            setSaved(next);
            setForm(profileFormFrom(next));
            toast.success('Profile saved.');
        } catch (e) {
            toast.error(describeError(e, 'The profile could not be saved.'));
        } finally {
            setSaving(false);
        }
    };

    const summary = saved === undefined ? (online ? 'Loading…' : 'Needs a connection') : `${fill.filled} of ${fill.total} filled${gallery.length ? ` · ${gallery.length} ${gallery.length === 1 ? 'photo' : 'photos'}` : ''}`;
    const company = (companyName || '').trim() || 'Your business';

    return (
        <section className={`border-t border-border ${className}`} aria-label="Public profile">
            <div className="flex items-center gap-1">
                <h3 className="min-w-0 flex-1">
                    <button type="button" aria-expanded={open} aria-controls="public-profile-body" onClick={() => setOpen(v => !v)}
                        className="flex min-h-[60px] w-full items-center justify-between gap-3 py-3 text-left">
                        <span className="min-w-0">
                            <span className="block text-base font-bold text-foreground">Public profile</span>
                            <span className="block text-sm text-muted-foreground">{summary}</span>
                        </span>
                        <ChevronDownIcon className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                </h3>
                <HelpButton topic="public-profile" iconOnly />
            </div>

            {open && (
                <div id="public-profile-body" className="space-y-6 pb-3">
                    {!pageEnabled && (
                        <Notice tone="warning" title="Your request page is paused">Your profile appears on the page when the page is on. Turn it on with the switch above.</Notice>
                    )}
                    {loadError && (
                        <p role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                            <span>{loadError}</span>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>Try again</button>
                        </p>
                    )}

                    {saved === undefined ? (
                        online ? <div className="space-y-3" aria-busy="true"><div className="skeleton h-24 w-full" /><div className="skeleton h-11 w-full" /></div>
                            : <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{NEEDS_CONNECTION}</p>
                    ) : saved && (
                        <>
                            <p className="text-sm leading-relaxed text-muted-foreground">Everything here shows under your request form, for anyone with your link. Leave a field empty and it is not shown.</p>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex items-baseline justify-between gap-3"><label className="label" htmlFor="pp-about">About your business</label><Counter n={form.about.length} max={PROFILE_LIMITS.about} /></div>
                                    <textarea id="pp-about" rows={4} className="input" value={form.about} onChange={(e) => set('about', e.target.value)}
                                        placeholder="Who you are, how long you have been at it, and what clients can expect when they work with you." aria-invalid={!!checks.errors.about} />
                                    {checks.errors.about && <p className="mt-1 text-xs font-medium text-destructive">{checks.errors.about}</p>}
                                </div>

                                <div>
                                    <div className="flex items-baseline justify-between gap-3"><label className="label" htmlFor="pp-service">What you do</label><span className="text-xs tabular-nums text-muted-foreground">{form.services.length} of {PROFILE_LIMITS.services}</span></div>
                                    {form.services.length > 0 && (
                                        <ul className="mb-2 flex flex-wrap gap-2">
                                            {form.services.map((s, i) => (
                                                <li key={s} className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border bg-card pl-3 pr-1 text-sm font-medium">
                                                    {s}
                                                    <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${s}`}
                                                        onClick={() => set('services', removeServiceChip(form.services, i))}>×</button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <div className="flex gap-2">
                                        <input id="pp-service" className="input min-w-0 flex-1" value={chip} maxLength={PROFILE_LIMITS.serviceLength} disabled={!canAddService(form.services)}
                                            placeholder={canAddService(form.services) ? 'For example: Roof repair' : 'You reached the limit'}
                                            onChange={(e) => setChip(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChips(); } }}
                                            onBlur={addChips} />
                                        <button type="button" className="btn btn-outline min-h-[44px]" onClick={addChips} disabled={!chip.trim() || !canAddService(form.services)}>Add</button>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">Press Enter after each one. Short and plain works best.</p>
                                    {checks.errors.services && <p className="mt-1 text-xs font-medium text-destructive">{checks.errors.services}</p>}
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="label" htmlFor="pp-area">Where you work</label>
                                        <input id="pp-area" className="input" value={form.serviceArea} maxLength={PROFILE_LIMITS.serviceArea + 50} onChange={(e) => set('serviceArea', e.target.value)} placeholder="Austin and 30 miles around" aria-invalid={!!checks.errors.serviceArea} />
                                        {checks.errors.serviceArea && <p className="mt-1 text-xs font-medium text-destructive">{checks.errors.serviceArea}</p>}
                                    </div>
                                    <div>
                                        <label className="label" htmlFor="pp-license">License</label>
                                        <input id="pp-license" className="input" value={form.licenseLine} maxLength={PROFILE_LIMITS.licenseLine + 50} onChange={(e) => set('licenseLine', e.target.value)} placeholder="License #123456, insured and bonded" aria-invalid={!!checks.errors.licenseLine} />
                                        {checks.errors.licenseLine && <p className="mt-1 text-xs font-medium text-destructive">{checks.errors.licenseLine}</p>}
                                    </div>
                                    <div>
                                        <label className="label" htmlFor="pp-years">Experience</label>
                                        <input id="pp-years" className="input" value={form.yearsLine} maxLength={PROFILE_LIMITS.yearsLine + 20} onChange={(e) => set('yearsLine', e.target.value)} placeholder="15 years in business" aria-invalid={!!checks.errors.yearsLine} />
                                        {checks.errors.yearsLine && <p className="mt-1 text-xs font-medium text-destructive">{checks.errors.yearsLine}</p>}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => void save()} disabled={!dirty || !checks.ok || saving}>{saving ? 'Saving…' : 'Save profile'}</button>
                                    {dirty && !saving && <button type="button" className="btn btn-ghost min-h-[44px] text-muted-foreground" onClick={() => { setForm(savedForm); setChip(''); }}>Undo changes</button>}
                                </div>
                            </div>

                            <div className="border-t border-border pt-5">
                                {userId && <GalleryManager userId={userId} gallery={gallery} isOnline={online} onSaved={(p) => setSaved(p)} />}
                            </div>

                            <div className="border-t border-border pt-5">
                                <h4 className="text-sm font-bold text-foreground">Preview</h4>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    How the section under your form looks to clients. It updates as you type; unsaved text is not public until you save. Testimonials come from Client feedback below.
                                </p>
                                <div className="mt-3 max-h-[34rem] overflow-y-auto rounded-2xl border border-border bg-background px-4 pb-6 pt-1">
                                    {profileSections(preview).any
                                        ? <PublicProfileView extras={preview} company={company} className="!border-t-0 !pt-8" />
                                        : <p className="py-8 text-center text-sm text-muted-foreground">Fill in a field above and it shows here.</p>}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </section>
    );
};

export default PublicProfileEditor;
