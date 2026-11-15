/**
 * Job photos → AI (Premium + AI, competitor gap #11):
 *  - "Write client update": pick photos (default: added since the last update, max 8) + an optional typed or dictated
 *    note → the AI writes a short update in the contractor's voice → the contractor edits it and sends it with
 *    their own Gmail, a text or WhatsApp, with the client portal link. Each sent update is recorded as a Note on the
 *    job tagged "Client update" (the next update starts from there).
 *  - "AI walkthrough": photos + narration → a Daily Job Report (or Note) draft that opens in the form through the
 *    assistant's own prefill path; nothing is saved until the contractor saves the form.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Client, Job, UserProfile } from '../../types.ts';
import { toast } from '../Toast.tsx';
import { Modal, Segmented } from '../viewKit.tsx';
import { CheckIcon, CopyIcon, MailIcon, SparklesIcon } from '../Icons.tsx';
import AIVoiceInput from '../AIVoiceInput.tsx';
import { MessageAppButtons } from '../MessageAppButtons.tsx';
import { describeError } from '../../lib/account.ts';
import { esc } from '../../utils/escapeHtml.ts';
import { plainTextToEmailHtml, senderIdentity } from '../../utils/emailTemplates.ts';
import { copyToClipboard, ensurePortalKey, portalUrl } from '../../utils/clientLinks.ts';
import { GmailError, getPreferredSender, sendEmail } from '../../services/gmailService.ts';
import { sortPhotos, tagLabel, type JobPhoto } from './photoLogic.ts';
import { currentUserId } from './photosApi.ts';
import {
    AI_PHOTO_MAX, AI_PHOTOS_UPGRADE_REASON, NOTE_MAX_CHARS, buildPhotoTaskBody, buildUpdateRecord, canUseAiPhotos, composeClientUpdate,
    pickUpdatePhotos, pickWalkthroughPhotos, shortDate, togglePick, updateSubject, walkthroughDraft, walkthroughFacts,
    type SentUpdate, type UpdateChannel, type WalkthroughDocType,
} from './photoUpdates.ts';
import { photosToAiImages, runPhotoTask, saveUpdateRecord, walkthroughPhotosHtml, type UpdateRecordRef } from './photoUpdatesApi.ts';

export type PhotoAIMode = 'update' | 'walkthrough';

export interface PhotoAIModalProps {
    mode: PhotoAIMode;
    job: Job & { clientId?: string | null };
    client?: Client | null;
    clients?: Client[];
    profile: Partial<UserProfile> | null;
    plan: string;
    /** the job's whole timeline */
    photos: JobPhoto[];
    /** signed preview URLs (thumb path or photo path → URL) */
    urls: Record<string, string>;
    ensureUrl: (path: string) => void;
    initialPick: JobPhoto[];
    lastUpdate: SentUpdate | null;
    hasClient: boolean;
    onClose: () => void;
    onUpgrade: (reason: string) => void;
    /** shows these photos in the client portal (the timeline's own "Show in portal") */
    onSharePhotos: (photos: JobPhoto[]) => Promise<void>;
    /** an update was recorded on the job */
    onRecorded: (update: SentUpdate) => void;
    onEmailSent?: () => void;
    onDocumentsChanged?: () => void;
    uploadImage?: (file: File) => Promise<string>;
}

const localYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PICKER_PAGE = 24;
const DOC_TYPES: { value: WalkthroughDocType; label: string }[] = [
    { value: 'DAILY_REPORT', label: 'Daily report' },
    { value: 'NOTE', label: 'Note' },
];

const PhotoAIModal: React.FC<PhotoAIModalProps> = ({
    mode, job, client, clients, profile, plan, photos, urls, ensureUrl, initialPick, lastUpdate, hasClient,
    onClose, onUpgrade, onSharePhotos, onRecorded, onEmailSent, onDocumentsChanged, uploadImage,
}) => {
    const navigate = useNavigate();
    const isUpdate = mode === 'update';
    const [picked, setPicked] = useState<JobPhoto[]>(initialPick);
    const [note, setNote] = useState('');
    const [interim, setInterim] = useState('');
    const [docType, setDocType] = useState<WalkthroughDocType>('DAILY_REPORT');
    const [step, setStep] = useState<'compose' | 'working' | 'review'>('compose');
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');
    const [showAll, setShowAll] = useState(false);
    // review (client update)
    const [text, setText] = useState('');
    const [subject, setSubject] = useState('');
    const [to, setTo] = useState(String(client?.email || ''));
    const [shareInPortal, setShareInPortal] = useState(true);
    const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
    const [sending, setSending] = useState(false);
    const [recorded, setRecorded] = useState<string>('');
    const abortRef = useRef<AbortController | null>(null);
    const linkRef = useRef('');
    const textRef = useRef('');
    textRef.current = text;
    const recordRef = useRef<UpdateRecordRef | null>(null);
    const channelsRef = useRef<Array<{ channel: UpdateChannel; to?: string; at: Date }>>([]);
    const queueRef = useRef<Promise<void>>(Promise.resolve());
    const sharedRef = useRef(false);

    useEffect(() => () => abortRef.current?.abort(), []);

    const ordered = useMemo(() => sortPhotos(photos), [photos]);
    const pickedIds = useMemo(() => new Set(picked.map(p => p.id)), [picked]);
    // Picked photos first in view even when they are older than the first page.
    const shown = useMemo(() => {
        if (showAll || ordered.length <= PICKER_PAGE) return ordered;
        const page = ordered.slice(0, PICKER_PAGE);
        const extra = ordered.slice(PICKER_PAGE).filter(p => pickedIds.has(p.id));
        return [...page, ...extra];
    }, [ordered, showAll, pickedIds]);

    useEffect(() => {
        for (const p of shown) {
            const path = p.thumbPath || p.storagePath;
            if (!urls[path] && !urls[p.storagePath]) ensureUrl(path);
        }
    }, [shown, urls, ensureUrl]);

    const notShared = picked.filter(p => !p.sharedInPortal);
    const docLabel = docType === 'NOTE' ? 'note' : 'daily report';

    const toggle = (photo: JobPhoto) => {
        const res = togglePick(picked, photo);
        if (res.full) toast.info(`Up to ${AI_PHOTO_MAX} photos at a time. Unselect one first.`);
        setPicked(res.picked);
    };

    const portalLink = async (): Promise<string> => {
        if (!client?.id) return '';
        try {
            return portalUrl(await ensurePortalKey(client));
        } catch {
            return '';
        }
    };

    // ------------------------------------------------------------------------------- AI
    const generate = async () => {
        if (!canUseAiPhotos(plan)) { onClose(); onUpgrade(AI_PHOTOS_UPGRADE_REASON); return; }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { setError("You're offline. Reconnect to use the AI."); return; }
        const typed = note.trim();
        if (!picked.length && !typed) { setError(isUpdate ? 'Pick at least one photo or add a note.' : 'Pick at least one photo or say what was done.'); return; }
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setError('');
        setStatus(null);
        setStep('working');
        try {
            setProgress('Preparing the photos…');
            const images = await photosToAiImages(picked, (done, total) => setProgress(`Preparing photos ${done} of ${total}…`), ctrl.signal);
            if (ctrl.signal.aborted) return;
            if (picked.length && !images.length && !typed) throw new Error('The photos could not be loaded. Check your connection and try again.');
            const used = images.map(i => i.photo);
            setProgress(isUpdate ? 'Writing the update…' : `Writing the ${docLabel}…`);
            const body = buildPhotoTaskBody({
                task: isUpdate ? 'photo_update' : 'photo_walkthrough',
                note: typed,
                images,
                job,
                client: client || null,
                profile,
                today: localYmd(),
                lastUpdate: lastUpdate ? { sentAt: lastUpdate.sentAt, text: lastUpdate.text } : null,
                docType,
            });
            const res = await runPhotoTask(isUpdate ? 'photo_update' : 'photo_walkthrough', body, ctrl.signal);
            if (ctrl.signal.aborted) return;
            if (isUpdate && res.update) {
                const link = await portalLink();
                linkRef.current = link;
                setText(composeClientUpdate({
                    clientName: client?.name || job.clientName, message: res.update.message, decision: res.update.decision,
                    portalLink: link, senderName: profile?.name, company: profile?.companyName,
                }));
                setSubject(updateSubject(res.update.subject, job.name, profile?.companyName));
                setPicked(used.length ? used : picked);
                setStep('review');
                return;
            }
            if (res.proposal) {
                setProgress('Adding the photos to the report…');
                const photosHtml = await walkthroughPhotosHtml(used, uploadImage);
                if (ctrl.signal.aborted) return;
                const draft = walkthroughDraft(res.proposal, {
                    job, client: client || null, clients, profile: (profile || null) as UserProfile | null, facts: walkthroughFacts(typed, used), photosHtml, today: localYmd(),
                });
                onClose();
                navigate(draft.path, { state: draft.state });
                toast.info(`Your ${docLabel} draft is open. Check it, then save it.`);
            }
        } catch (e) {
            if (ctrl.signal.aborted) return;
            const code = String((e as { code?: string })?.code || '');
            const message = e instanceof Error ? e.message : 'The AI could not answer. Please try again.';
            // CREDITS_EMPTY (AI credits on): the upgrade window also offers the credit packs
            if (code === 'PLAN_REQUIRED' || code === 'CREDITS_EMPTY' || (code === 'PLAN_LIMIT' && !canUseAiPhotos(plan))) { onClose(); onUpgrade(message); return; }
            setError(message);
            setStep('compose');
        } finally {
            if (abortRef.current === ctrl) abortRef.current = null;
        }
    };

    const cancel = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setStep('compose');
        setProgress('');
    };

    // ------------------------------------------------------------------------------- send + record
    const shareIfWanted = async () => {
        if (!shareInPortal || !hasClient || sharedRef.current || !notShared.length) return;
        sharedRef.current = true;
        await onSharePhotos(notShared);
    };

    /** One Note per update; each channel used is added to it. Runs in order, never blocks sending. */
    const record = (channel: UpdateChannel, recipient?: string) => {
        channelsRef.current = [...channelsRef.current, { channel, to: recipient, at: new Date() }];
        queueRef.current = queueRef.current.then(async () => {
            const first = !recordRef.current;
            const rec = buildUpdateRecord({ text: textRef.current, channels: channelsRef.current, photos: picked, sentAt: channelsRef.current[0].at });
            try {
                const userId = (await currentUserId()) || job.userId;
                recordRef.current = await saveUpdateRecord({
                    ref: recordRef.current, userId, job, profile: (profile || null) as UserProfile | null, record: rec, today: localYmd(),
                });
                if (first) {
                    setRecorded(rec.title);
                    onRecorded({ id: recordRef.current.id, sentAt: channelsRef.current[0].at.toISOString(), title: rec.title, text: textRef.current });
                    onDocumentsChanged?.();
                }
            } catch (e) {
                toast.error(`The update went out, but it could not be saved on the job. ${describeError(e)}`);
            }
        });
    };

    const sendWithGmail = async () => {
        const recipient = to.trim();
        if (!EMAIL_RE.test(recipient)) { setStatus({ tone: 'error', text: 'Add the client’s email address.' }); return; }
        if (!text.trim()) { setStatus({ tone: 'error', text: 'The message is empty.' }); return; }
        setSending(true);
        setStatus(null);
        try {
            await shareIfWanted();
            const link = linkRef.current;
            let html = plainTextToEmailHtml(text);
            if (link && text.includes(link)) html = html.split(esc(link)).join(`<a href="${esc(link)}">${esc(link)}</a>`);
            await sendEmail({
                accountId: getPreferredSender(),
                to: recipient,
                subject: subject.trim() || updateSubject('', job.name, profile?.companyName),
                text,
                html,
                fromName: senderIdentity(profile).displayName || undefined,
                log: { kind: 'job_update', jobId: job.id || null },
            });
            setStatus({ tone: 'ok', text: `Sent to ${recipient} from your Gmail.` });
            onEmailSent?.();
            record('email', recipient);
        } catch (e) {
            const code = e instanceof GmailError ? e.code : '';
            const msg = code === 'NO_ACCOUNT' ? 'Connect your Gmail first (Communication page), or send it by text or WhatsApp.'
                : code === 'RECONNECT_REQUIRED' || code === 'SCOPE_MISSING' ? 'Your Gmail connection needs to be renewed (Communication page). You can send it by text or WhatsApp meanwhile.'
                    : describeError(e, 'The email could not be sent.');
            setStatus({ tone: 'error', text: msg });
        } finally {
            setSending(false);
        }
    };

    const openedApp = (channel: 'sms' | 'whatsapp') => {
        void shareIfWanted();
        record(channel, client?.phone || undefined);
        setStatus({ tone: 'ok', text: channel === 'sms' ? 'Opened your messages app with the update.' : 'Opened WhatsApp with the update.' });
    };

    const copy = async () => {
        const ok = await copyToClipboard(text);
        setStatus(ok ? { tone: 'ok', text: 'Copied. Paste it into a text, WhatsApp or your email.' } : { tone: 'error', text: 'Copying isn’t allowed here. Select the text and copy it.' });
        if (ok) { void shareIfWanted(); record('copy'); }
    };

    // ------------------------------------------------------------------------------- render
    const working = step === 'working';
    const title = isUpdate ? 'Client update' : 'AI walkthrough';
    const description = step === 'review'
        ? `Check the text, then send it from your own Gmail or phone.${hasClient ? '' : ' Link this job to a client to add the portal link.'}`
        : isUpdate
            ? `${lastUpdate ? `Last update sent ${shortDate(lastUpdate.sentAt)}.` : 'First update for this job.'} Pick the photos, add a note if you like; you check the text before it goes out.`
            : 'Pick the photos and say what was done. The AI drafts the report; you check it before saving.';

    const footer = step === 'review' ? (
        // one compact row on phones too, so the send buttons above stay in view; "Done" leads once it went out
        <div className="flex w-full gap-2 sm:w-auto">
            <button type="button" className="btn btn-outline flex-1 sm:flex-none" onClick={() => { setStep('compose'); setStatus(null); }} disabled={sending}>Back</button>
            <button type="button" className={`btn flex-1 sm:flex-none ${recorded ? 'btn-primary' : 'btn-outline'}`} onClick={onClose} disabled={sending}>{recorded ? 'Done' : 'Close'}</button>
        </div>
    ) : working ? (
        <button type="button" className="btn btn-outline" onClick={cancel}>Cancel</button>
    ) : (
        <>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={!picked.length && !note.trim()}>
                <SparklesIcon className="h-4 w-4" /> {isUpdate ? 'Write update' : `Draft ${docLabel}`}
            </button>
        </>
    );

    return (
        <Modal open onClose={working ? cancel : onClose} title={title} description={description} size="lg" busy={sending} footer={footer}>
            {step === 'working' && (
                <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center" role="status" aria-live="polite">
                    <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-r-transparent" />
                    <p className="text-sm font-medium text-foreground">{progress}</p>
                    <p className="text-xs text-muted-foreground">{picked.length} {picked.length === 1 ? 'photo' : 'photos'} · usually 10–30 seconds</p>
                </div>
            )}

            {step === 'compose' && (
                <div className="space-y-5">
                    {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                    <div>
                        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photos</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{picked.length} of {AI_PHOTO_MAX}</span>
                            <span className="ml-auto flex gap-1">
                                <button type="button" className="btn btn-ghost btn-sm h-8 px-2 text-xs"
                                    onClick={() => setPicked(isUpdate ? pickUpdatePhotos(photos, lastUpdate?.sentAt) : pickWalkthroughPhotos(photos))}>
                                    {isUpdate ? (lastUpdate ? 'Since last update' : 'Newest') : 'Latest day'}
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm h-8 px-2 text-xs" onClick={() => setPicked([])} disabled={!picked.length}>Clear</button>
                            </span>
                        </div>
                        {photos.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No photos on this job yet.</p>
                        ) : (
                            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
                                {shown.map(p => {
                                    const src = (p.thumbPath && urls[p.thumbPath]) || urls[p.storagePath] || '';
                                    const on = pickedIds.has(p.id);
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => toggle(p)}
                                            aria-pressed={on}
                                            aria-label={`${tagLabel(p.tag)} photo${p.caption ? `: ${p.caption}` : ''}`}
                                            className={`relative aspect-square overflow-hidden rounded-lg bg-muted outline-none transition focus-visible:ring-4 focus-visible:ring-primary/40 ${on ? 'ring-[3px] ring-primary' : 'opacity-80 hover:opacity-100'}`}
                                        >
                                            {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} /> : <span className="skeleton block h-full w-full" />}
                                            <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 py-px text-[10px] font-semibold text-white">{tagLabel(p.tag)}</span>
                                            {on && (
                                                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                    <CheckIcon className="h-3 w-3" />
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {!showAll && ordered.length > PICKER_PAGE && (
                            <button type="button" className="mt-2 text-sm font-semibold text-primary hover:underline" onClick={() => setShowAll(true)}>
                                Show all {ordered.length} photos
                            </button>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground">Captions you added to the photos are sent too. Photos are sent smaller (1024 px) to keep it fast.</p>
                    </div>

                    <div>
                        <label htmlFor="photo-ai-note" className="label">{isUpdate ? 'Anything to add? (optional)' : 'What was done?'}</label>
                        <div className="flex items-start gap-2">
                            <textarea
                                id="photo-ai-note"
                                rows={3}
                                maxLength={NOTE_MAX_CHARS}
                                className="input min-h-[88px] flex-1 resize-y text-base sm:text-sm"
                                value={interim ? `${note}${note && !/\s$/.test(note) ? ' ' : ''}${interim}` : note}
                                onChange={(e) => { setInterim(''); setNote(e.target.value); }}
                                placeholder={isUpdate
                                    ? 'e.g. Cabinets go in Monday. Need their grout color by Friday.'
                                    : 'e.g. Framed the hallway, 3 of us, 7 hours. Inspector comes Thursday.'}
                            />
                            <AIVoiceInput
                                variant="compact"
                                onInterim={setInterim}
                                onTranscript={(t) => { setInterim(''); setNote(prev => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}${t}`.slice(0, NOTE_MAX_CHARS)); }}
                            />
                        </div>
                        {isUpdate && lastUpdate && (
                            <p className="mt-2 text-xs text-muted-foreground">The AI sees your last update too, so it won’t repeat it.</p>
                        )}
                    </div>

                    {!isUpdate && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Draft as</span>
                            <Segmented<WalkthroughDocType> size="sm" ariaLabel="Document to draft" options={DOC_TYPES} value={docType} onChange={setDocType} />
                        </div>
                    )}
                </div>
            )}

            {step === 'review' && (
                <div className="space-y-4">
                    <div>
                        <label htmlFor="photo-ai-text" className="label">Message</label>
                        <textarea id="photo-ai-text" className="input min-h-[170px] resize-y text-base leading-relaxed sm:min-h-[220px] sm:text-sm" value={text} onChange={(e) => setText(e.target.value)} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label htmlFor="photo-ai-to" className="label">Email to</label>
                            <input id="photo-ai-to" type="email" inputMode="email" autoComplete="off" className="input text-base sm:text-sm" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
                        </div>
                        <div>
                            <label htmlFor="photo-ai-subject" className="label">Email subject</label>
                            <input id="photo-ai-subject" className="input text-base sm:text-sm" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
                        </div>
                    </div>
                    {hasClient && notShared.length > 0 && (
                        <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
                            <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={shareInPortal} onChange={(e) => setShareInPortal(e.target.checked)} />
                            <span>Show {notShared.length === picked.length ? `these ${picked.length}` : `the ${notShared.length} new`} {notShared.length === 1 ? 'photo' : 'photos'} in the client portal when you send</span>
                        </label>
                    )}
                    {status && (
                        <p role="status" className={`rounded-lg px-3 py-2 text-xs font-medium ${status.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{status.text}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={() => void sendWithGmail()} disabled={sending || !text.trim()}>
                            {sending ? <><span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> Sending…</> : <><MailIcon className="h-4 w-4" /> Send with Gmail</>}
                        </button>
                        <MessageAppButtons phone={client?.phone} message={text} onOpen={openedApp} />
                        <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => void copy()} disabled={!text.trim()}>
                            <CopyIcon className="h-4 w-4" /> Copy text
                        </button>
                    </div>
                    {recorded && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckIcon className="h-3.5 w-3.5 text-success" /> Saved on this job as “{recorded}” (Documents › Notes).
                        </p>
                    )}
                </div>
            )}
        </Modal>
    );
};

export default PhotoAIModal;
