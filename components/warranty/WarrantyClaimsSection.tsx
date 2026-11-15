/**
 * Warranty form > "Claims": problems the client reported under this warranty. Add one (date, what is wrong, photos),
 * move it Open > In review > Resolved or Denied (only the moves the logic allows), say what was done, reopen, remove.
 *
 * The claims live inside the form's data (documents.data.warrantyTracking.claims) and are saved by the form's normal
 * Save, like every other field. Photos are uploaded at once (they need a connection) and kept as private storage paths.
 *
 *   <WarrantyClaimsSection data={d} documentId={id} update={form.update} />
 */
import React, { useEffect, useRef, useState } from 'react';
import { FormSection } from '../forms/Fields.tsx';
import { PlusIcon, CameraIcon, ChevronDownIcon } from '../Icons.tsx';
import { newId, todayISO } from '../forms/formUtils.ts';
import { cn } from '../../lib/utils.ts';
import {
    addClaim, editClaim, isFailure, moveClaim, readWarrantyTracking, removeClaim, sortClaims, withWarrantyTracking, WARRANTY_LIMITS,
} from '../../lib/warranty/warrantyLogic.ts';
import { claimChipText, claimMoves, claimNeedsReason, formatDay, type ClaimMove } from '../../lib/warranty/warrantyView.ts';
import { claimPhotoUrl, removeClaimPhotoFile, uploadClaimPhoto } from '../../lib/warranty/claimPhotos.ts';
import type { ClaimStatus, TrackingResult, WarrantyClaim, WarrantyTracking } from '../../lib/warranty/types.ts';
import type { FormUpdate } from './WarrantyCoverageSection.tsx';
import { errorText } from '../../lib/offline/connection.ts';

type Data = Record<string, unknown>;

const STATUS_RULE: Record<ClaimStatus, string> = {
    open: 'bg-warning',
    in_review: 'bg-primary',
    resolved: 'bg-success',
    denied: 'bg-muted-foreground/50',
};
const STATUS_TEXT: Record<ClaimStatus, string> = {
    open: 'text-warning',
    in_review: 'text-primary',
    resolved: 'text-success',
    denied: 'text-muted-foreground',
};

/* ------------------------------------------------------------------------------------------ photos */

const Thumb: React.FC<{ path: string; onRemove?: () => void }> = ({ path, onRemove }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let alive = true;
        setUrl(null);
        setFailed(false);
        void claimPhotoUrl(path).then(u => { if (!alive) return; if (u) setUrl(u); else setFailed(true); });
        return () => { alive = false; };
    }, [path]);
    return (
        <span className="relative inline-block h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {url ? (
                <a href={url} target="_blank" rel="noreferrer" aria-label="Open photo"><img src={url} alt="Claim photo" className="h-full w-full object-cover" loading="lazy" /></a>
            ) : (
                <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-muted-foreground">{failed ? 'Needs a connection' : '…'}</span>
            )}
            {onRemove && (
                <button type="button" onClick={onRemove} aria-label="Remove photo" className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-none text-white">×</button>
            )}
        </span>
    );
};

const Photos: React.FC<{
    photos: string[];
    documentKey: string;
    onChange: (photos: string[]) => void;
    onError: (message: string | null) => void;
    /** photos uploaded in this session */
    fresh: React.MutableRefObject<Set<string>>;
    /** a removed photo is also deleted from storage (only for a claim that is not added yet: nothing refers to it) */
    deleteFiles?: boolean;
}> = ({ photos, documentKey, onChange, onError, fresh, deleteFiles }) => {
    const [busy, setBusy] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const room = WARRANTY_LIMITS.maxPhotosPerClaim - photos.length;

    const add = async (files: FileList | null) => {
        if (!files?.length) return;
        setBusy(true);
        onError(null);
        const next = [...photos];
        try {
            for (const file of Array.from(files).slice(0, room)) {
                const { path } = await uploadClaimPhoto(documentKey, file);
                fresh.current.add(path);
                next.push(path);
            }
        } catch (e) {
            onError(errorText(e, 'The photo could not be added.'));
        } finally {
            if (next.length !== photos.length) onChange(next);
            setBusy(false);
            if (input.current) input.current.value = '';
        }
    };
    const remove = (path: string) => {
        if (deleteFiles && fresh.current.has(path)) { fresh.current.delete(path); void removeClaimPhotoFile(path); }
        onChange(photos.filter(p => p !== path));
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {photos.map(p => <Thumb key={p} path={p} onRemove={() => remove(p)} />)}
            {room > 0 && (
                <>
                    <button type="button" className="btn btn-sm btn-outline min-h-[40px]" onClick={() => input.current?.click()} disabled={busy}>
                        <CameraIcon className="h-4 w-4" /> {busy ? 'Adding…' : photos.length ? 'Add photo' : 'Add photos'}
                    </button>
                    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple className="sr-only" onChange={e => { void add(e.target.files); }} aria-label="Add photos to this claim" />
                </>
            )}
        </div>
    );
};

/* ------------------------------------------------------------------------------------------ one claim */

interface CardProps {
    claim: WarrantyClaim;
    documentKey: string;
    fresh: React.MutableRefObject<Set<string>>;
    onMove: (to: ClaimStatus, opts: { resolution?: string; resolvedOn?: string }) => string | null;
    onEdit: (patch: { date?: string; description?: string; photos?: string[] }) => string | null;
    onRemove: () => void;
}

const ClaimCard: React.FC<CardProps> = ({ claim, documentKey, fresh, onMove, onEdit, onRemove }) => {
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState<ClaimMove | null>(null);
    const [resolution, setResolution] = useState(claim.resolution);
    const [resolvedOn, setResolvedOn] = useState(claim.resolvedOn ?? todayISO());
    const [desc, setDesc] = useState(claim.description);
    const [date, setDate] = useState(claim.date);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const closed = claim.status === 'resolved' || claim.status === 'denied';
    const dirtyText = desc.trim() !== claim.description || date !== claim.date;

    const run = (message: string | null) => { setError(message); return message === null; };

    const move = (m: ClaimMove) => {
        if (m.closes) { setClosing(m); setResolution(claim.resolution); setResolvedOn(todayISO()); setError(null); return; }
        run(onMove(m.to, {}));
    };

    return (
        <li className="relative border-b border-border py-3 pl-4 last:border-b-0">
            <span aria-hidden className={cn('absolute bottom-3 left-0 top-3 w-0.5 rounded-full', STATUS_RULE[claim.status])} />
            <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-foreground">{formatDay(claim.date)}</span>
                        <span className={cn('text-xs font-bold uppercase tracking-wide', STATUS_TEXT[claim.status])}>{claimChipText(claim)}</span>
                        {claim.photos.length > 0 && <span className="text-xs text-muted-foreground">{claim.photos.length} photo{claim.photos.length === 1 ? '' : 's'}</span>}
                    </span>
                    <span className={cn('mt-0.5 block text-sm text-muted-foreground', open ? '' : 'truncate')}>{claim.description.split('\n')[0]}</span>
                </span>
                <ChevronDownIcon className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
                <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                        <div>
                            <label className="label" htmlFor={`claim-date-${claim.id}`}>Reported</label>
                            <input id={`claim-date-${claim.id}`} type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="label" htmlFor={`claim-desc-${claim.id}`}>What is wrong</label>
                            <textarea id={`claim-desc-${claim.id}`} rows={3} className="input min-h-[72px] resize-y" value={desc} maxLength={WARRANTY_LIMITS.description} onChange={e => setDesc(e.target.value)} />
                        </div>
                    </div>
                    {dirtyText && (
                        <div className="flex gap-2">
                            <button type="button" className="btn btn-sm btn-primary min-h-[36px]" onClick={() => { run(onEdit({ date, description: desc })); }}>Update claim</button>
                            <button type="button" className="btn btn-sm btn-ghost min-h-[36px]" onClick={() => { setDesc(claim.description); setDate(claim.date); setError(null); }}>Undo</button>
                        </div>
                    )}

                    <Photos photos={claim.photos} documentKey={documentKey} fresh={fresh} onError={setError} onChange={photos => { run(onEdit({ photos })); }} />

                    {closed && claim.resolution && (
                        <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground">
                            <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{claim.status === 'denied' ? 'Why it was denied' : 'What was done'}</span>
                            {claim.resolution}
                        </p>
                    )}

                    {closing ? (
                        <div className="space-y-2 rounded-xl border border-border p-3">
                            <label className="label" htmlFor={`claim-res-${claim.id}`}>{claimNeedsReason(closing.to) ? 'Why is it denied?' : 'What was done?'}{claimNeedsReason(closing.to) ? '' : ' (optional)'}</label>
                            <textarea id={`claim-res-${claim.id}`} rows={3} className="input min-h-[72px] resize-y" value={resolution} maxLength={WARRANTY_LIMITS.resolution} onChange={e => setResolution(e.target.value)} autoFocus />
                            <div className="flex flex-wrap items-end gap-2">
                                <div>
                                    <label className="label" htmlFor={`claim-on-${claim.id}`}>{closing.to === 'denied' ? 'Denied on' : 'Resolved on'}</label>
                                    <input id={`claim-on-${claim.id}`} type="date" className="input w-auto" value={resolvedOn} onChange={e => setResolvedOn(e.target.value)} />
                                </div>
                                <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={() => { if (run(onMove(closing.to, { resolution, resolvedOn }))) setClosing(null); }}>{closing.label}</button>
                                <button type="button" className="btn btn-sm btn-ghost min-h-[40px]" onClick={() => { setClosing(null); setError(null); }}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            {claimMoves(claim.status).map(m => (
                                <button key={m.to} type="button" className={cn('btn btn-sm min-h-[36px]', m.to === 'resolved' ? 'btn-primary' : 'btn-outline')} onClick={() => move(m)}>{m.label}</button>
                            ))}
                            <span className="flex-1" />
                            {confirmRemove ? (
                                <span className="flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground">Remove this claim?</span>
                                    <button type="button" className="font-semibold text-destructive hover:underline" onClick={onRemove}>Remove</button>
                                    <button type="button" className="font-semibold text-muted-foreground hover:underline" onClick={() => setConfirmRemove(false)}>Keep</button>
                                </span>
                            ) : (
                                <button type="button" className="text-xs font-semibold text-muted-foreground hover:text-destructive hover:underline" onClick={() => setConfirmRemove(true)}>Remove claim</button>
                            )}
                        </div>
                    )}
                    {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
                </div>
            )}
        </li>
    );
};

/* ------------------------------------------------------------------------------------------ the section */

interface Props {
    data: Data;
    /** id of the saved warranty (photos are filed under it; a new warranty files them under "draft") */
    documentId?: string | null;
    update: FormUpdate;
}

const WarrantyClaimsSection: React.FC<Props> = ({ data, documentId, update }) => {
    const tracking = readWarrantyTracking(data);
    const claims = sortClaims(tracking.claims);
    const fresh = useRef<Set<string>>(new Set());
    const documentKey = documentId || 'draft';
    const [adding, setAdding] = useState(false);
    const [date, setDate] = useState(todayISO());
    const [text, setText] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const full = claims.length >= WARRANTY_LIMITS.maxClaims;

    const store = (next: WarrantyTracking) => update(prev => withWarrantyTracking(prev as Data, next));
    /** applies a logic result to the form; returns the message when it was refused */
    const apply = (r: TrackingResult): string | null => {
        if (isFailure(r)) return r.message;
        store((r as { tracking: WarrantyTracking }).tracking);
        return null;
    };

    const submit = () => {
        const message = apply(addClaim(tracking, { id: newId(), date, description: text, photos }, Date.now(), todayISO()));
        setError(message);
        if (message) return;
        photos.forEach(p => fresh.current.delete(p));
        setAdding(false);
        setText('');
        setPhotos([]);
        setDate(todayISO());
    };
    const cancel = () => {
        photos.forEach(p => { if (fresh.current.has(p)) { fresh.current.delete(p); void removeClaimPhotoFile(p); } });
        setAdding(false); setText(''); setPhotos([]); setError(null); setDate(todayISO());
    };

    const openCount = tracking.claims.filter(c => c.status === 'open' || c.status === 'in_review').length;

    return (
        <FormSection
            title="Claims"
            description={tracking.claims.length
                ? `${tracking.claims.length} claim${tracking.claims.length === 1 ? '' : 's'}${openCount ? `, ${openCount} open` : ', none open'}`
                : 'Problems the client reports under this warranty, with photos and what you did.'}
            actions={!adding && (
                <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={() => setAdding(true)} disabled={full}>
                    <PlusIcon className="h-4 w-4" /> Add claim
                </button>
            )}
        >
            {adding && (
                <div className="space-y-3 rounded-xl border border-border p-3.5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                        <div>
                            <label className="label" htmlFor="new-claim-date">Reported on</label>
                            <input id="new-claim-date" type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="label" htmlFor="new-claim-text">What is wrong</label>
                            <textarea id="new-claim-text" rows={3} className="input min-h-[72px] resize-y" value={text} maxLength={WARRANTY_LIMITS.description} onChange={e => setText(e.target.value)} placeholder="e.g. Water stain under the bathroom window" autoFocus />
                        </div>
                    </div>
                    <Photos photos={photos} documentKey={documentKey} fresh={fresh} deleteFiles onChange={setPhotos} onError={setError} />
                    {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
                    <div className="flex gap-2">
                        <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={submit}>Add claim</button>
                        <button type="button" className="btn btn-sm btn-ghost min-h-[40px]" onClick={cancel}>Cancel</button>
                    </div>
                </div>
            )}

            {claims.length > 0 ? (
                <ul className="-my-1">
                    {claims.map(c => (
                        <ClaimCard
                            key={c.id}
                            claim={c}
                            documentKey={documentKey}
                            fresh={fresh}
                            onMove={(to, opts) => apply(moveClaim(tracking, c.id, to, { ...opts, now: Date.now(), today: todayISO() }))}
                            onEdit={patch => apply(editClaim(tracking, c.id, patch, Date.now(), todayISO()))}
                            onRemove={() => store(removeClaim(tracking, c.id))}
                        />
                    ))}
                </ul>
            ) : !adding && (
                <p className="text-sm text-muted-foreground">No claims yet. When the client reports a problem, add it here so there is a dated record.</p>
            )}
            {full && <p className="text-xs text-muted-foreground">This warranty has the most claims it can hold ({WARRANTY_LIMITS.maxClaims}).</p>}
            <p className="text-xs text-muted-foreground">Claims are saved with the warranty (use Save). They are for your records: the client does not see them.</p>
        </FormSection>
    );
};

export default WarrantyClaimsSection;
