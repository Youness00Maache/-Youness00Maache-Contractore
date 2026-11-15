/**
 * Proposal builder on the estimate form (roadmap N4). Logic: lib/proposal.ts; money rule: utils/money.ts.
 *   OptionalAddOns   the "Optional add-ons" block under the items (priced, not in the total unless switched on)
 *   ProposalSection  scope sections, payment schedule, project photos and reusable templates
 *   MilestonePicker  "Convert to invoice": bill one payment of the schedule
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { InventoryItem, LineItem, SavedItem } from '../../types.ts';
import { cn } from '../../lib/utils.ts';
import { formatMoney, lineItemScheduledValue, roundMoney, toNumber } from '../../utils/money.ts';
import {
    MILESTONE_KIND_LABELS, MILESTONE_PRESETS, PROPOSAL_LIMITS, SCOPE_KINDS, addImage, addMilestone, addSection,
    applyProposalTemplate, computeMilestones, imageProblem, mergeLines, moveSection, optionalLines, parseProposalTemplates,
    readProposal, regularLines, removeImage, removeMilestone, removeSection, serializeProposalTemplates, setLineOptional,
    setLineSelected, templateFromEstimate, templateSaveProblem, updateImageCaption, updateMilestone, updateSection, upsertTemplate,
    withProposal, type Milestone, type MilestoneKind, type ProposalTemplate, type ScopeKind,
} from '../../lib/proposal.ts';
import { loadProposalTemplatesRaw, saveProposalTemplatesRaw } from '../../lib/userData.ts';
import type { ClientAddonChoice } from '../../lib/addonChoice.ts';
import { ChevronDownIcon, ImageIcon, PlusIcon, TrashIcon, CameraIcon } from '../Icons.tsx';
import { FormSection, NumberInput, Segmented } from '../forms/Fields.tsx';
import LineItemsEditor from '../forms/LineItemsEditor.tsx';
import { Spinner } from '../forms/Spinner.tsx';
import { downloadPhoto, listJobPhotos, signedPhotoUrls } from '../photos/photosApi.ts';
import type { JobPhoto } from '../photos/photoLogic.ts';

const small = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
const iconBtn = 'btn btn-ghost h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30';

// =====================================================================================================================
// Optional add-ons
// =====================================================================================================================
export const OptionalAddOns: React.FC<{
    items: LineItem[];
    onChange: (items: LineItem[]) => void;
    savedItems?: SavedItem[];
    inventoryItems?: InventoryItem[];
    showCost?: boolean;
    jobId?: string;
    /** D13: what the client chose when signing (lib/addonChoice.ts clientAddonChoiceOf); null/undefined = no client choice */
    clientChoice?: ClientAddonChoice | null;
}> = ({ items, onChange, savedItems, inventoryItems, showCost, jobId, clientChoice }) => {
    const regular = regularLines(items);
    const optional = optionalLines(items);
    const [open, setOpen] = useState(optional.length > 0);
    const setOptional = (next: LineItem[]) => onChange(mergeLines(regular, next.map(li => (li.optional ? li : setLineOptional(li, true)))));
    const toggleIncluded = (id: string, on: boolean) => setOptional(optional.map(li => (li.id === id ? setLineSelected(li, on) : li)));
    const makeRegular = (id: string) => {
        const li = optional.find(x => x.id === id);
        if (!li) return;
        onChange(mergeLines([...regular, setLineOptional(li, false)], optional.filter(x => x.id !== id)));
    };
    const moveToOptional = (id: string) => {
        const li = regular.find(x => x.id === id);
        if (!li) return;
        onChange(mergeLines(regular.filter(x => x.id !== id), [...optional, setLineOptional(li, true)]));
        setOpen(true);
    };
    const notCounted = roundMoney(optional.filter(li => !li.selected).reduce((a, li) => a + lineItemScheduledValue(li), 0));
    const movable = regular.filter(li => li.description.trim() || toNumber(li.rate));

    if (!open && !optional.length) {
        return (
            <button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground" onClick={() => setOpen(true)}>
                <span><span className="font-semibold text-foreground">Optional add-ons</span> · extras the client can ask for, shown with their price, not in the total</span>
                <PlusIcon className="h-4 w-4 shrink-0" />
            </button>
        );
    }
    return (
        <div className="rounded-xl border-l-4 border-primary/40 bg-muted/30 py-3 pl-3 pr-2 sm:pl-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Optional add-ons</p>
                <p className="text-xs text-muted-foreground">{optional.length ? `${formatMoney(notCounted)} not in the total` : 'Not in the total unless you switch one on'}</p>
            </div>
            {clientChoice && (
                <p className="mb-3 rounded-lg border border-primary/30 bg-card px-3 py-2 text-xs text-foreground">
                    <span className="font-semibold">Chosen by the client when signing</span>
                    {clientChoice.name ? ` (${clientChoice.name})` : ''}: {clientChoice.ids.length
                        ? `${optional.filter(li => clientChoice.ids.includes(li.id)).length} of ${optional.length} add-ons, included in the total.`
                        : 'no add-ons.'}
                </p>
            )}
            <LineItemsEditor
                items={optional}
                onChange={setOptional}
                savedItems={savedItems}
                inventoryItems={inventoryItems}
                showCost={showCost}
                rateLabel="Price"
                addLabel="Add an add-on"
                descriptionPlaceholder="e.g. Heated floor, extra outlet"
                quickMeasure={{ jobId }}
            />
            {optional.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                    {optional.map((li, i) => (
                        <li key={li.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <span className="min-w-0 flex-1 truncate text-foreground">{li.description.trim() || `Add-on ${i + 1}`}</span>
                            <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 text-xs font-medium">
                                <input type="checkbox" className="h-4 w-4 rounded border-input" checked={!!li.selected} onChange={e => toggleIncluded(li.id, e.target.checked)} />
                                {li.selected ? 'In the total' : 'Not in the total'}
                            </label>
                            {clientChoice && (
                                <span className={cn('rounded border px-1.5 text-[10px] font-bold uppercase tracking-wide', clientChoice.ids.includes(li.id) ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground')}>
                                    {clientChoice.ids.includes(li.id) ? 'Client chose it' : 'Not chosen'}
                                </span>
                            )}
                            <button type="button" className="text-xs font-medium text-primary underline-offset-2 hover:underline" onClick={() => makeRegular(li.id)}>Make it a regular line</button>
                        </li>
                    ))}
                </ul>
            )}
            {movable.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <label htmlFor="move-optional">Move a line here:</label>
                    <select id="move-optional" className="input h-9 w-auto max-w-[240px] py-0 text-xs" value="" onChange={e => e.target.value && moveToOptional(e.target.value)}>
                        <option value="">Pick a line…</option>
                        {movable.map((li, i) => <option key={li.id} value={li.id}>{li.description.trim() || `Item ${i + 1}`}</option>)}
                    </select>
                </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">The PDF and the client page list these under “Optional add-ons” with their price, clearly not included in the total. When signing online, the client can tick the ones they want.</p>
        </div>
    );
};

// =====================================================================================================================
// Proposal: scope, payments, photos, templates
// =====================================================================================================================
type Tab = 'scope' | 'payments' | 'photos';

interface ProposalProps<T extends Record<string, any>> {
    data: T;
    update: (fn: (prev: T) => T) => void;
    total: number;
    paid: boolean;
    jobId: string;
    locked?: boolean;
    isNew?: boolean;
    onUploadImage?: (file: File) => Promise<string>;
    onUpgrade?: (reason?: string) => void;
    onFeedback?: (tone: 'info' | 'success' | 'error', message: string) => void;
}

export function ProposalSection<T extends Record<string, any>>({ data, update, total, paid, jobId, locked, isNew, onUploadImage, onUpgrade, onFeedback }: ProposalProps<T>) {
    const p = readProposal(data);
    const [tab, setTab] = useState<Tab>('scope');
    const setP = (fn: (cur: ReturnType<typeof readProposal>) => Partial<ReturnType<typeof readProposal>>) =>
        update(prev => { const cur = readProposal(prev); return withProposal(prev, { ...cur, ...fn(cur) }); });
    const counts = { scope: p.sections.length, payments: p.milestones.length, photos: p.images.length };
    return (
        <FormSection
            title="Proposal"
            description="Scope, payment schedule and photos, printed on the estimate in every design."
            actions={!locked ? <TemplateBar data={data} update={update} paid={paid} isNew={isNew} onUpgrade={onUpgrade} onFeedback={onFeedback} /> : undefined}
        >
            <Segmented
                ariaLabel="Proposal part"
                value={tab}
                onChange={v => setTab(v as Tab)}
                options={[
                    { value: 'scope', label: <>Scope{counts.scope ? <span className="ml-1 tabular-nums opacity-60">{counts.scope}</span> : null}</> },
                    { value: 'payments', label: <>Payments{counts.payments ? <span className="ml-1 tabular-nums opacity-60">{counts.payments}</span> : null}</> },
                    { value: 'photos', label: <>Photos{counts.photos ? <span className="ml-1 tabular-nums opacity-60">{counts.photos}</span> : null}</> },
                ]}
            />
            <fieldset disabled={locked} className="min-w-0">
                {tab === 'scope' && <ScopeEditor sections={p.sections} onChange={sections => setP(() => ({ sections }))} />}
                {tab === 'payments' && <MilestonesEditor milestones={p.milestones} total={total} onChange={milestones => setP(() => ({ milestones }))} />}
                {tab === 'photos' && <PhotosEditor images={p.images} jobId={jobId} onUploadImage={onUploadImage} onChange={fn => setP(cur => ({ images: fn(cur.images) }))} />}
            </fieldset>
        </FormSection>
    );
}

// ------------------------------------------------------------------------------------------------ scope
const ScopeEditor: React.FC<{ sections: ReturnType<typeof readProposal>['sections']; onChange: (s: ReturnType<typeof readProposal>['sections']) => void }> = ({ sections, onChange }) => {
    const missing = SCOPE_KINDS.filter(k => !sections.some(s => s.kind === k.kind));
    const full = sections.length >= PROPOSAL_LIMITS.sections;
    return (
        <div className="space-y-3">
            {sections.length === 0 && <p className="text-sm text-muted-foreground">Spell out the job so there are no surprises: what you do, what is and isn’t included, what you assume, and when.</p>}
            <ol className="space-y-3">
                {sections.map((s, i) => {
                    const hint = SCOPE_KINDS.find(k => k.kind === s.kind)?.hint;
                    return (
                        <li key={s.id} className="rounded-xl border border-border bg-background/60 p-3">
                            <div className="flex items-center gap-1">
                                <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                                <input className="input h-9 min-w-0 flex-1 font-semibold" value={s.title} maxLength={PROPOSAL_LIMITS.sectionTitle} onChange={e => onChange(updateSection(sections, s.id, { title: e.target.value }))} aria-label={`Section ${i + 1} title`} />
                                <button type="button" className={iconBtn} onClick={() => onChange(moveSection(sections, s.id, -1))} disabled={i === 0} aria-label="Move up"><ChevronDownIcon className="h-4 w-4 rotate-180" /></button>
                                <button type="button" className={iconBtn} onClick={() => onChange(moveSection(sections, s.id, 1))} disabled={i === sections.length - 1} aria-label="Move down"><ChevronDownIcon className="h-4 w-4" /></button>
                                <button type="button" className={cn(iconBtn, 'hover:text-destructive')} onClick={() => onChange(removeSection(sections, s.id))} aria-label={`Remove ${s.title}`}><TrashIcon className="h-4 w-4" /></button>
                            </div>
                            <textarea
                                className="input mt-2 min-h-[88px] w-full py-2 text-sm"
                                value={s.text}
                                maxLength={PROPOSAL_LIMITS.sectionText}
                                placeholder={s.style === 'bullets' ? 'One item per line' : 'Plain words; a blank line starts a new paragraph'}
                                onChange={e => onChange(updateSection(sections, s.id, { text: e.target.value }))}
                                aria-label={`${s.title} text`}
                            />
                            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">{hint}</span>
                                <span className="inline-flex items-center gap-1 text-xs">
                                    <span className="text-muted-foreground">Print as</span>
                                    {(['bullets', 'text'] as const).map(st => (
                                        <button key={st} type="button" onClick={() => onChange(updateSection(sections, s.id, { style: st }))} className={cn('rounded-md px-2 py-1 font-semibold', s.style === st ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')} aria-pressed={s.style === st}>
                                            {st === 'bullets' ? 'List' : 'Paragraphs'}
                                        </button>
                                    ))}
                                </span>
                            </div>
                        </li>
                    );
                })}
            </ol>
            {!full && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn(small, 'mr-1')}>Add</span>
                    {(missing.length ? missing : SCOPE_KINDS).map(k => (
                        <button key={k.kind} type="button" className="btn btn-outline btn-sm min-h-[36px]" onClick={() => onChange(addSection(sections, k.kind as ScopeKind))}>
                            <PlusIcon className="h-3.5 w-3.5" /> {k.title}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ------------------------------------------------------------------------------------------------ milestones
const MilestonesEditor: React.FC<{ milestones: Milestone[]; total: number; onChange: (m: Milestone[]) => void }> = ({ milestones, total, onChange }) => {
    const sched = computeMilestones(milestones, total);
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn(small, 'mr-1')}>{milestones.length ? 'Replace with' : 'Start with'}</span>
                {MILESTONE_PRESETS.map(pr => (
                    <button key={pr.id} type="button" className="btn btn-outline btn-sm min-h-[36px] tabular-nums" onClick={() => onChange(pr.build())}>{pr.label}</button>
                ))}
            </div>
            {milestones.length > 0 && (
                <ol className="divide-y divide-border rounded-xl border border-border">
                    {sched.rows.map((m, i) => (
                        <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3 sm:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_112px_36px] sm:items-center">
                            <div className="flex min-w-0 gap-2">
                                <select className="input h-10 w-[104px] shrink-0 px-2 text-xs" value={m.kind} onChange={e => onChange(updateMilestone(milestones, m.id, { kind: e.target.value as MilestoneKind }))} aria-label={`Payment ${i + 1} type`}>
                                    {(Object.keys(MILESTONE_KIND_LABELS) as MilestoneKind[]).map(k => <option key={k} value={k}>{k === 'progress' ? 'Progress' : MILESTONE_KIND_LABELS[k].replace(' payment', '')}</option>)}
                                </select>
                                <input className="input h-10 min-w-0 flex-1" value={m.label} maxLength={PROPOSAL_LIMITS.milestoneLabel} onChange={e => onChange(updateMilestone(milestones, m.id, { label: e.target.value }))} aria-label={`Payment ${i + 1} name`} />
                            </div>
                            <button type="button" className={cn(iconBtn, 'sm:order-last hover:text-destructive')} onClick={() => onChange(removeMilestone(milestones, m.id))} aria-label={`Remove ${m.label}`}><TrashIcon className="h-4 w-4" /></button>
                            <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
                                <NumberInput value={m.value} onValueChange={v => onChange(updateMilestone(milestones, m.id, { value: v }))} decimals={m.mode === 'amount' ? 2 : undefined} max={m.mode === 'percent' ? 100 : undefined} prefix={m.mode === 'amount' ? '$' : undefined} suffix={m.mode === 'percent' ? '%' : undefined} aria-label={`Payment ${i + 1} ${m.mode === 'percent' ? 'percent' : 'amount'}`} className="h-10" />
                                <button type="button" className="btn btn-ghost h-10 shrink-0 px-2 text-xs font-semibold" title="Switch between % of the total and a fixed amount" onClick={() => onChange(updateMilestone(milestones, m.id, { mode: m.mode === 'percent' ? 'amount' : 'percent', value: m.mode === 'percent' ? m.amount : roundMoney(m.percent) }))}>
                                    {m.mode === 'percent' ? '% → $' : '$ → %'}
                                </button>
                            </div>
                            <input className="input col-span-2 h-10 sm:col-span-1" value={m.due} maxLength={PROPOSAL_LIMITS.milestoneDue} placeholder="When (e.g. On signing)" onChange={e => onChange(updateMilestone(milestones, m.id, { due: e.target.value }))} aria-label={`Payment ${i + 1} due`} />
                            <p className="col-span-2 text-right text-sm font-semibold tabular-nums sm:col-span-1">{formatMoney(m.amount)}</p>
                        </li>
                    ))}
                </ol>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
                {milestones.length < PROPOSAL_LIMITS.milestones && (
                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => onChange(addMilestone(milestones))}><PlusIcon className="h-4 w-4" /> Add payment</button>
                )}
                {milestones.length > 0 && (
                    sched.error
                        ? <p role="alert" className="text-sm font-medium text-destructive">{sched.error}</p>
                        : <p className="text-sm text-muted-foreground">Adds up to <span className="font-semibold tabular-nums text-foreground">{formatMoney(sched.total)}</span> (100%). Cents left over go on the last payment.</p>
                )}
            </div>
        </div>
    );
};

// ------------------------------------------------------------------------------------------------ photos
const PhotosEditor: React.FC<{
    images: ReturnType<typeof readProposal>['images'];
    jobId: string;
    onUploadImage?: (file: File) => Promise<string>;
    onChange: (fn: (cur: ReturnType<typeof readProposal>['images']) => ReturnType<typeof readProposal>['images']) => void;
}> = ({ images, jobId, onUploadImage, onChange }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [picker, setPicker] = useState(false);
    const full = images.length >= PROPOSAL_LIMITS.images;

    const uploadFiles = async (files: File[]) => {
        if (!onUploadImage) return;
        setError('');
        setBusy(true);
        try {
            let count = images.length;
            for (const f of files) {
                const problem = imageProblem(f, count);
                if (problem) { setError(problem); break; }
                const url = await onUploadImage(f);
                if (!url) { setError('This photo could not be uploaded. Check your connection and try again.'); break; }
                onChange(cur => addImage(cur, { url, caption: '' }));
                count++;
            }
        } finally { setBusy(false); }
    };
    const addJobPhoto = async (ph: JobPhoto) => {
        if (!onUploadImage) return;
        setPicker(false);
        setError('');
        setBusy(true);
        try {
            const blob = await downloadPhoto(ph.storagePath);
            const file = new File([blob], `job-photo-${ph.id.slice(0, 8)}.jpg`, { type: blob.type || 'image/jpeg' });
            const problem = imageProblem(file, images.length);
            if (problem) { setError(problem); return; }
            const url = await onUploadImage(file);
            if (!url) { setError('This photo could not be added. Try again.'); return; }
            onChange(cur => addImage(cur, { url, caption: ph.caption, photoId: ph.id }));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'This photo could not be added.');
        } finally { setBusy(false); }
    };

    return (
        <div className="space-y-3">
            {images.length > 0 && (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {images.map((im, i) => (
                        <li key={im.id} className="min-w-0">
                            <div className="relative">
                                <img src={im.url} alt={im.caption || `Photo ${i + 1}`} className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
                                <button type="button" className="absolute right-1 top-1 rounded-md bg-background/90 p-1.5 text-muted-foreground shadow hover:text-destructive" onClick={() => onChange(cur => removeImage(cur, im.id))} aria-label={`Remove photo ${i + 1}`}><TrashIcon className="h-3.5 w-3.5" /></button>
                            </div>
                            <input className="input mt-1.5 h-9 text-xs" value={im.caption} maxLength={PROPOSAL_LIMITS.caption} placeholder="Caption" onChange={e => onChange(cur => updateImageCaption(cur, im.id, e.target.value))} aria-label={`Photo ${i + 1} caption`} />
                        </li>
                    ))}
                </ul>
            )}
            {!onUploadImage ? (
                <p className="text-sm text-muted-foreground">Photos can be added from the app when you are signed in.</p>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; void uploadFiles(files); }} />
                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" disabled={busy || full} onClick={() => fileRef.current?.click()}>
                        {busy ? <Spinner /> : <ImageIcon className="h-4 w-4" />} Upload photo
                    </button>
                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" disabled={busy || full} onClick={() => setPicker(true)}>
                        <CameraIcon className="h-4 w-4" /> From job photos
                    </button>
                    <span className="text-xs text-muted-foreground tabular-nums">{images.length} / {PROPOSAL_LIMITS.images} · JPG, PNG or WebP</span>
                </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {images.length === 0 && <p className="text-xs text-muted-foreground">Printed as a photo page with captions. Clients see them on the approval page too.</p>}
            {picker && <JobPhotoPicker jobId={jobId} usedIds={new Set(images.map(i => i.photoId).filter(Boolean) as string[])} onPick={ph => void addJobPhoto(ph)} onClose={() => setPicker(false)} />}
        </div>
    );
};

const JobPhotoPicker: React.FC<{ jobId: string; usedIds: Set<string>; onPick: (p: JobPhoto) => void; onClose: () => void }> = ({ jobId, usedIds, onPick, onClose }) => {
    const [photos, setPhotos] = useState<JobPhoto[] | null>(null);
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        listJobPhotos(jobId)
            .then(async list => {
                if (!active) return;
                const l = (list || []).slice(0, 60);
                setPhotos(l);
                const map = await signedPhotoUrls(l.map(ph => ph.thumbPath || ph.storagePath));
                if (active) setUrls(map);
            })
            .catch(() => { if (active) { setPhotos([]); setError('Job photos could not be loaded.'); } });
        return () => { active = false; };
    }, [jobId]);
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-panel max-w-2xl p-5" role="dialog" aria-modal="true" aria-labelledby="pick-photo-title" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-3">
                    <h3 id="pick-photo-title" className="text-base font-semibold text-foreground">Pick a job photo</h3>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
                </div>
                {photos === null ? (
                    <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading photos…</p>
                ) : photos.length === 0 ? (
                    <p className="mt-6 text-sm text-muted-foreground">{error || 'This job has no photos yet. Add them in the job’s Photos, or upload one here.'}</p>
                ) : (
                    <ul className="mt-4 grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                        {photos.map(ph => {
                            const src = urls[ph.thumbPath || ph.storagePath];
                            const used = usedIds.has(ph.id);
                            return (
                                <li key={ph.id}>
                                    <button type="button" disabled={used} onClick={() => onPick(ph)} className="group block w-full text-left disabled:opacity-40" aria-label={`Add photo${ph.caption ? `: ${ph.caption}` : ''}`}>
                                        {src ? <img src={src} alt="" className="aspect-square w-full rounded-lg object-cover group-hover:ring-2 group-hover:ring-primary" loading="lazy" /> : <span className="block aspect-square w-full rounded-lg bg-muted" />}
                                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">{used ? 'Added' : ph.caption || ph.tag}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
};

// ------------------------------------------------------------------------------------------------ templates
function TemplateBar<T extends Record<string, any>>({ data, update, paid, isNew, onUpgrade, onFeedback }: {
    data: T; update: (fn: (prev: T) => T) => void; paid: boolean; isNew?: boolean;
    onUpgrade?: (reason?: string) => void; onFeedback?: (tone: 'info' | 'success' | 'error', message: string) => void;
}) {
    const [list, setList] = useState<ProposalTemplate[] | null>(null);
    const [saving, setSaving] = useState(false);
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');
    useEffect(() => {
        let active = true;
        loadProposalTemplatesRaw().then(raw => { if (active) setList(parseProposalTemplates(raw)); }).catch(() => { if (active) setList([]); });
        return () => { active = false; };
    }, []);
    const templates = list || [];
    const apply = (id: string) => {
        const tpl = templates.find(t => t.id === id);
        if (!tpl) return;
        update(prev => applyProposalTemplate(prev, tpl));
        onFeedback?.('info', `Template “${tpl.name}” applied: scope, payment schedule${tpl.terms.trim() ? ' and terms' : ''} filled in. Review, then save.`);
    };
    const save = async () => {
        const problem = templateSaveProblem(templates, name, paid);
        if (problem === 'premium') { onUpgrade?.('Free plan: one proposal template. Premium keeps up to 20.'); return; }
        if (problem) { onFeedback?.('error', problem); return; }
        const tpl = templateFromEstimate(name, data);
        if (!tpl) return;
        const next = upsertTemplate(templates, tpl);
        const ser = serializeProposalTemplates(next);
        if (ser.error || !ser.value) { onFeedback?.('error', ser.error || 'Could not save the template.'); return; }
        setSaving(true);
        try {
            const mode = await saveProposalTemplatesRaw(ser.value);
            setList(next);
            setNaming(false);
            setName('');
            onFeedback?.(mode === 'failed' ? 'error' : 'success', mode === 'failed' ? 'The template could not be saved. Try again.' : mode === 'account' ? `Saved template “${tpl.name}”.` : `Saved template “${tpl.name}” on this device; it syncs when you are back online.`);
        } finally { setSaving(false); }
    };
    const remove = async (id: string) => {
        const next = templates.filter(t => t.id !== id);
        const ser = serializeProposalTemplates(next);
        if (!ser.value) return;
        await saveProposalTemplatesRaw(ser.value);
        setList(next);
    };
    const hasContent = readProposal(data).sections.length > 0 || readProposal(data).milestones.length > 0;

    if (naming) {
        return (
            <form className="flex w-full flex-wrap items-center gap-2 sm:w-auto" onSubmit={e => { e.preventDefault(); void save(); }}>
                <input className="input h-9 w-full text-sm sm:w-48" autoFocus value={name} maxLength={PROPOSAL_LIMITS.templateName} placeholder="Template name" list="proposal-template-names" onChange={e => setName(e.target.value)} aria-label="Template name" />
                <datalist id="proposal-template-names">{templates.map(t => <option key={t.id} value={t.name} />)}</datalist>
                <button type="submit" className="btn btn-primary btn-sm min-h-[36px]" disabled={saving || !name.trim()}>{saving ? <Spinner /> : null} Save</button>
                <button type="button" className="btn btn-ghost btn-sm min-h-[36px]" onClick={() => setNaming(false)}>Cancel</button>
            </form>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-2">
            {templates.length > 0 && (
                <select className={cn('input h-9 w-auto max-w-[200px] py-0 text-sm', isNew && !hasContent && 'border-primary/60')} value="" onChange={e => { if (e.target.value.startsWith('del:')) void remove(e.target.value.slice(4)); else if (e.target.value) apply(e.target.value); }} aria-label="Use a template">
                    <option value="">Use a template…</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    <optgroup label="Delete">
                        {templates.map(t => <option key={`del-${t.id}`} value={`del:${t.id}`}>Delete “{t.name}”</option>)}
                    </optgroup>
                </select>
            )}
            <button type="button" className="btn btn-outline btn-sm min-h-[36px]" disabled={!hasContent && !String(data.terms || '').trim()} onClick={() => setNaming(true)} title="Save this scope, payment schedule and terms to reuse on other estimates">
                Save as template
            </button>
        </div>
    );
}

// =====================================================================================================================
// "Convert to invoice": which payment to bill
// =====================================================================================================================
export const MilestonePicker: React.FC<{
    data: Record<string, any>;
    total: number;
    value: string;
    onChange: (id: string) => void;
}> = ({ data, total, value, onChange }) => {
    const sched = useMemo(() => computeMilestones(readProposal(data).milestones, total), [data, total]);
    if (!sched.rows.length) return null;
    if (sched.error) return <p className="mt-3 text-sm text-warning">The payment schedule doesn’t add up ({sched.error}), so this invoices the whole estimate.</p>;
    const opts = [{ id: '', label: 'Whole estimate', sub: 'All lines, as before', amount: total }, ...sched.rows.map((m, i) => ({
        id: m.id,
        label: `${i + 1}. ${m.label}`,
        sub: i === 0 && m.kind === 'deposit' ? `${roundMoney(m.percent)}% deposit, one line` : `Progress billing to ${roundMoney(sched.rows.slice(0, i + 1).reduce((a, r) => a + r.percent, 0))}%`,
        amount: m.amount,
    }))];
    return (
        <fieldset className="mt-4">
            <legend className="label mb-1.5">What to invoice</legend>
            <div className="divide-y divide-border rounded-xl border border-border">
                {opts.map(o => (
                    <label key={o.id || 'all'} className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm', value === o.id && 'bg-primary/5')}>
                        <input type="radio" name="milestone" className="h-4 w-4" checked={value === o.id} onChange={() => onChange(o.id)} />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">{o.label}</span>
                            <span className="block text-xs text-muted-foreground">{o.sub}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{formatMoney(o.amount)}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
};
