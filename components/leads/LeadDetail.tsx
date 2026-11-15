/**
 * One lead, in a window: where it stands (stage buttons), how to reach them (call / text / email / map, "Log contact"),
 * what they need and their photos, the follow-up date with quick chips, appointments, notes and files, and the ways out:
 * Convert to job (the same one-tap path as the old inbox: client matched or created + active job, plan limits kept,
 * request photos become Before photos), Mark lost (with a reason) / Reopen, Draft estimate with AI, Delete.
 * Every change goes through lib/leads/leadsApi.ts and lands in the shared list (leadsStore), so the board, the nav
 * badge and the Schedule update at once. Edit swaps the body for the same fields as "Add a lead".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InlineError, Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { BriefcaseIcon, MailIcon, MapPinIcon, MessageSquareIcon, PaperclipIcon, PhoneIcon, SparklesIcon, TrashIcon } from '../Icons.tsx';
import { describeError, isPlanLimitError, planLimitMessage } from '../../lib/account.ts';
import { MAX_AI_IMAGES, prepareImage, type PendingImage } from '../../src/ai/attachments.ts';
import {
    buildEstimatePrompt, jobNameFromRequest, mailHref, mapsHref, relativeTime, smsHref, telHref,
} from '../requests/requestLogic.ts';
import { downloadRequestPhotos, requestPhotoUrls, setQuoteRequestStatus, type ConvertResult } from '../requests/requestsApi.ts';
import { addRequestPhotosToJob } from '../photos/photosApi.ts';
import { isClientCreatedWithJob } from '../../utils/clientPortalRules.ts';
import type { RequestActionsProps } from '../requests/RequestDetailModal.tsx';
import {
    addLeadAttachment, convertLead, deleteLead, leadAttachmentUrls, logLeadContact, markLeadLost, moveLeadStage, removeLeadAttachment,
    reopenLead, setLeadFollowUp, updateLead,
} from '../../lib/leads/leadsApi.ts';
import { patchLead, removeLead } from '../../lib/leads/leadsStore.ts';
import {
    LEAD_STAGE_INFO, LOST_REASONS, canMoveStage, formatBudget, hasLeadErrors, isOpenStage, leadFormToPatch, leadToForm, originLabel,
    stageLabel, validateLeadForm,
} from '../../lib/leads/leadLogic.ts';
import { attachmentKind, followUpChips, followUpText, formatFileSize } from '../../lib/leads/leadViewLogic.ts';
import { LEAD_LIMITS, OPEN_LEAD_STAGES, type Appointment, type Lead, type LeadFormErrors, type LeadFormValues, type LeadStage } from '../../lib/leads/leadTypes.ts';
import { LeadFormFields } from './LeadForm.tsx';
import LeadAppointments from './LeadAppointments.tsx';
import { FollowUpPill, LEAD_STAGE_STYLE, cx } from './leadUi.tsx';

export interface LeadDetailProps extends RequestActionsProps {
    lead: Lead | null;
    userId: string;
    /** every appointment of the account */
    appointments: readonly Appointment[];
    today: string;
    onClose: () => void;
}

const ContactButton: React.FC<{ href: string; icon: React.ReactNode; label: string; external?: boolean }> = ({ href, icon, label, external }) => (
    <a href={href} className="btn btn-outline min-h-[44px] flex-1 sm:flex-none" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {icon} {label}
    </a>
);

const Fact: React.FC<{ label: string; children: React.ReactNode; wide?: boolean }> = ({ label, children, wide }) => (
    <div className={wide ? 'sm:col-span-2' : undefined}><dt className="label">{label}</dt><dd className="break-words">{children}</dd></div>
);

const LeadDetail: React.FC<LeadDetailProps> = ({
    lead, userId, appointments, today, onClose, plan, checkJobLimit, onConverted, onOpenJob, onUpgrade, onDraftEstimate,
}) => {
    const [mode, setMode] = useState<'view' | 'edit'>('view');
    const [panel, setPanel] = useState<null | 'lost' | 'convert'>(null);
    const [busy, setBusy] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
    const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
    const [removing, setRemoving] = useState<string | null>(null);
    const [form, setForm] = useState<LeadFormValues | null>(null);
    const [formErrors, setFormErrors] = useState<LeadFormErrors>({});
    const [formProblem, setFormProblem] = useState('');
    const [lostReason, setLostReason] = useState('');
    const [jobName, setJobName] = useState('');
    const [temporary, setTemporary] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const leadRef = useRef<Lead | null>(lead);
    leadRef.current = lead;
    const fileInput = useRef<HTMLInputElement>(null);
    const id = lead?.id;
    const attachmentKey = lead?.attachments.map(a => a.path).join('|') || '';

    useEffect(() => {
        setMode('view'); setPanel(null); setConfirmDelete(false); setBusy(''); setRemoving(null);
        setForm(null); setFormErrors({}); setFormProblem(''); setLostReason(''); setTemporary(false); setPhotoUrls({});
        const current = leadRef.current;
        if (!current) return;
        setJobName(jobNameFromRequest(current));
        let cancelled = false;
        if (current.photoPaths.length) requestPhotoUrls(current.photoPaths).then(m => { if (!cancelled) setPhotoUrls(m); }).catch(() => undefined);
        // like the old inbox: opening a new request marks it as seen
        if (current.status === 'new') {
            setQuoteRequestStatus(current.id, 'seen').then(() => { if (!cancelled && leadRef.current?.id === current.id) patchLead({ ...leadRef.current, status: 'seen' }); }).catch(() => undefined);
        }
        return () => { cancelled = true; };
    }, [id]);

    useEffect(() => {
        const current = leadRef.current;
        if (!current || !current.attachments.length) { setFileUrls({}); return; }
        let cancelled = false;
        leadAttachmentUrls(current.attachments.map(a => a.path)).then(m => { if (!cancelled) setFileUrls(m); }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [id, attachmentKey]);

    useEffect(() => {
        if (panel) panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }, [panel]);

    const mine = useMemo(
        () => (lead ? appointments.filter(a => a.leadId === lead.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : []),
        [appointments, lead],
    );

    if (!lead) return null;

    const open = isOpenStage(lead.stage);
    const converted = !!lead.jobId;
    const lost = lead.stage === 'lost';
    const tel = telHref(lead.phone);
    const sms = smsHref(lead.phone);
    const mail = mailHref(lead.email, 'Your quote request');
    const map = mapsHref(lead.address);
    const budget = formatBudget(lead);
    const follow = followUpText(lead, today);
    const working = busy !== '';

    const act = async (key: string, fn: () => Promise<void>) => {
        setBusy(key);
        try { await fn(); } catch (e) { toast.error(describeError(e)); } finally { setBusy(''); }
    };

    // ---------------------------------------------------------------- stage, contact, follow-up
    const moveTo = (stage: LeadStage) => {
        const check = canMoveStage(lead, stage);
        if ('reason' in check) { toast.error(check.reason); return; }
        void act('stage', async () => {
            patchLead(lost ? await reopenLead(lead, stage) : await moveLeadStage(lead, stage));
            toast.success(lost ? `Reopened as ${stageLabel(stage)}.` : `Moved to ${stageLabel(stage)}.`);
        });
    };

    const logContact = () => act('contact', async () => {
        patchLead(await logLeadContact(lead));
        toast.success('Contact logged.');
    });

    const setFollow = (ymd: string | null) => act('follow', async () => {
        patchLead(await setLeadFollowUp(lead.id, ymd));
    });

    const markLost = () => act('lost', async () => {
        patchLead(await markLeadLost(lead, lostReason));
        toast.success('Lead marked as lost.');
        setPanel(null);
    });

    // ---------------------------------------------------------------- edit
    const startEdit = () => {
        setForm(leadToForm(lead));
        setFormErrors({});
        setFormProblem('');
        setMode('edit');
    };

    const saveEdit = () => {
        if (!form) return;
        // a won lead keeps its stage; the form only needs a valid one to be checked
        const found = validateLeadForm({ ...form, stage: form.stage === 'won' ? 'contacted' : form.stage });
        setFormErrors(found);
        if (hasLeadErrors(found)) { setFormProblem('Please check the highlighted fields.'); return; }
        setFormProblem('');
        setBusy('save');
        const { origin: _origin, stage: _stage, ...patch } = leadFormToPatch(form);
        updateLead(lead.id, patch)
            .then(updated => { patchLead(updated); toast.success('Lead saved.'); setMode('view'); })
            .catch(e => setFormProblem(describeError(e, 'The lead could not be saved.')))
            .finally(() => setBusy(''));
    };

    // ---------------------------------------------------------------- files
    const upload = async (files: FileList | null) => {
        if (!files?.length) return;
        setBusy('file');
        try {
            let latest = leadRef.current || lead;
            for (const file of Array.from(files)) {
                latest = await addLeadAttachment(userId, latest, file);
                patchLead(latest);
            }
            toast.success(files.length === 1 ? 'File added.' : `${files.length} files added.`);
        } catch (e) {
            toast.error(describeError(e));
        } finally {
            setBusy('');
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    const removeFile = (path: string) => act('file', async () => {
        patchLead(await removeLeadAttachment(leadRef.current || lead, path));
        setRemoving(null);
        toast.success('File removed.');
    });

    // ---------------------------------------------------------------- convert (same path and checks as the old inbox)
    const markTemporary = async (res: ConvertResult): Promise<ConvertResult> => {
        if (!res.client?.id || res.already || !isClientCreatedWithJob(res.client, res.job)) return res;
        try {
            const { setClientTemporary } = await import('../ClientDetails.tsx');
            return { ...res, client: { ...(await setClientTemporary({ id: String(res.client.id), notes: res.client.notes ?? null }, true)) } };
        } catch (error) {
            toast.error(`The client was created but could not be marked as temporary. ${describeError(error)}`);
            return res;
        }
    };

    /** Creates the client + job; returns the job id (null when refused). */
    const convert = async (name: string, asTemporary = false): Promise<string | null> => {
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to create the job."); return null; }
        if (!checkJobLimit()) return null;
        setBusy('convert');
        try {
            let res = await convertLead(lead, name);
            if (asTemporary) res = await markTemporary(res);
            onConverted(res);
            patchLead({ ...lead, status: 'converted', stage: 'won', archived: false, jobId: String(res.job.id), clientId: res.client?.id ?? null, convertedAt: new Date().toISOString() });
            if (res.clientSkipped) {
                toast.info(`The job was created, but the client was not saved. ${res.clientSkipped}`, {
                    duration: 10000, action: { label: 'Upgrade', onClick: () => onUpgrade(res.clientSkipped || '') },
                });
            } else {
                toast.success(res.already ? 'This request already has a job.' : `Client and job "${res.job.name}" created.`);
            }
            // the request photos become the job's "Before" photos (in the background)
            if (!res.already && lead.photoPaths.length && res.job.user_id) {
                downloadRequestPhotos(lead.photoPaths)
                    .then(files => addRequestPhotosToJob({ userId: String(res.job.user_id), jobId: String(res.job.id), requestId: lead.id, files }))
                    .catch(() => undefined);
            }
            setPanel(null);
            return String(res.job.id);
        } catch (error) {
            if (isPlanLimitError(error)) onUpgrade(planLimitMessage(error));
            else toast.error(`Could not create the job. ${describeError(error)}`);
            return null;
        } finally {
            setBusy('');
        }
    };

    const draftEstimate = async () => {
        if (plan !== 'ai') { onUpgrade('Drafting an estimate from a quote request with AI is part of Premium + AI.'); return; }
        setBusy('ai');
        try {
            const jobId = lead.jobId || (await convert(jobName || jobNameFromRequest(lead), temporary));
            if (!jobId) return;
            setBusy('ai');
            const files = await downloadRequestPhotos(lead.photoPaths, MAX_AI_IMAGES).catch(() => [] as File[]);
            const images: PendingImage[] = [];
            for (const f of files) {
                try { images.push(await prepareImage(f)); } catch { /* skip a photo the assistant can't use */ }
            }
            onDraftEstimate({ jobId, prompt: buildEstimatePrompt(lead, images.length), images });
            onClose();
        } finally {
            setBusy('');
        }
    };

    const remove = () => act('delete', async () => {
        await deleteLead(lead);
        removeLead(lead.id);
        toast.success('Lead deleted.');
        onClose();
    });

    // ---------------------------------------------------------------- footer
    const footer = confirmDelete ? (
        <>
            <span className="mr-auto self-center text-sm text-muted-foreground">Delete this lead, its photos and files? This can’t be undone.</span>
            <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)} disabled={working}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={() => void remove()} disabled={working}>{busy === 'delete' ? 'Deleting…' : 'Delete'}</button>
        </>
    ) : mode === 'edit' ? (
        <>
            <button type="button" className="btn btn-outline" onClick={() => setMode('view')} disabled={working}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={working}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
        </>
    ) : converted ? (
        <button type="button" className="btn btn-primary" onClick={() => { onClose(); onOpenJob(lead.jobId as string); }} disabled={working}>
            <BriefcaseIcon className="h-4 w-4" /> Open job
        </button>
    ) : open ? (
        <>
            <button type="button" className="btn btn-outline" onClick={() => setPanel(p => (p === 'lost' ? null : 'lost'))} disabled={working}>Mark lost</button>
            <button type="button" className="btn btn-primary" onClick={() => setPanel('convert')} disabled={working || panel === 'convert'}>Convert to job</button>
        </>
    ) : lost ? (
        <button type="button" className="btn btn-outline" onClick={() => moveTo('contacted')} disabled={working}>Reopen</button>
    ) : (
        <button type="button" className="btn btn-primary" onClick={() => setPanel('convert')} disabled={working || panel === 'convert'}>Convert to job</button>
    );

    const stagePills = (open || lost) && !converted ? (
        <div>
            <h3 className="label">{lost ? 'Reopen as' : 'Stage'}</h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={lost ? 'Reopen as' : 'Stage'}>
                {OPEN_LEAD_STAGES.map(s => {
                    const current = s === lead.stage;
                    return (
                        <button
                            key={s}
                            type="button"
                            aria-current={current ? 'step' : undefined}
                            disabled={current || working}
                            onClick={() => moveTo(s)}
                            className={cx(
                                'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition',
                                current ? 'border-foreground/25 bg-card text-foreground shadow-soft' : 'border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                            )}
                        >
                            <span className={cx('h-2 w-2 rounded-full', LEAD_STAGE_STYLE[s].bar)} aria-hidden />
                            {LEAD_STAGE_INFO[s].label}
                        </button>
                    );
                })}
            </div>
        </div>
    ) : null;

    const description = [
        stageLabel(lead.stage),
        lead.createdAt ? `received ${relativeTime(lead.createdAt)}` : '',
        originLabel(lead.origin, lead.source),
    ].filter(Boolean).join(' · ');

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy === 'convert' || busy === 'delete' || busy === 'save'}
            size="lg"
            title={lead.name}
            description={description}
            footer={footer}
        >
            {mode === 'edit' && form ? (
                <div className="space-y-4">
                    <LeadFormFields values={form} errors={formErrors} onChange={p => setForm(f => (f ? { ...f, ...p } : f))} mode="edit" disabled={working} />
                    <InlineError>{formProblem}</InlineError>
                </div>
            ) : (
                <div className="space-y-5">
                    {converted && (
                        <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
                            Client and job created{lead.convertedAt ? ` ${relativeTime(lead.convertedAt)}` : ''}. Open the job to write the estimate, add photos or schedule it.
                        </p>
                    )}
                    {lost && (
                        <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm">
                            <span className="font-semibold text-destructive">Lost</span>{lead.lostReason ? `: ${lead.lostReason}` : '.'}
                        </p>
                    )}

                    <div ref={panelRef}>
                        {panel === 'lost' && !converted && (
                            <div className="rounded-xl border border-border bg-muted/40 p-4" data-testid="lost-panel">
                                <h3 className="label">Why did you lose it?</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {LOST_REASONS.map(r => (
                                        <button key={r} type="button" onClick={() => setLostReason(r)} aria-pressed={lostReason === r} className={cx('rounded-full border px-2.5 py-1 text-xs font-semibold transition', lostReason === r ? 'border-foreground/30 bg-card text-foreground shadow-soft' : 'border-border text-muted-foreground hover:text-foreground')}>{r}</button>
                                    ))}
                                </div>
                                <input className="input mt-3" aria-label="Reason" value={lostReason} maxLength={LEAD_LIMITS.lostReason} onChange={e => setLostReason(e.target.value)} placeholder="Or type your own (optional)" />
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button type="button" className="btn btn-danger" onClick={() => void markLost()} disabled={working}>{busy === 'lost' ? 'Saving…' : 'Mark as lost'}</button>
                                    <button type="button" className="btn btn-outline" onClick={() => setPanel(null)} disabled={working}>Cancel</button>
                                </div>
                            </div>
                        )}
                        {panel === 'convert' && !converted && (
                            <div className="rounded-xl border border-border bg-muted/40 p-4" data-testid="convert-panel">
                                <label htmlFor="lead-job-name" className="label">Job name</label>
                                <input id="lead-job-name" className="input" value={jobName} maxLength={120} onChange={e => setJobName(e.target.value)} autoFocus />
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Adds {lead.name} to your clients (or uses the client with the same email, phone or name) and creates an active job
                                    {lead.photoPaths.length ? ' with their photos as “Before” photos' : ''}. It counts toward your plan’s monthly jobs and clients.
                                </p>
                                <label className="mt-3 flex min-h-[40px] cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                                    <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={temporary} onChange={e => setTemporary(e.target.checked)} disabled={busy === 'convert'} />
                                    <span>
                                        <span className="font-medium text-foreground">Mark as temporary client</span>
                                        <span className="block text-xs text-muted-foreground">For a one-off job: kept under “Temporary” on the Clients page (an existing client it matches stays as it is).</span>
                                    </span>
                                </label>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button type="button" className="btn btn-primary" onClick={() => void convert(jobName, temporary)} disabled={busy === 'convert' || !jobName.trim()}>
                                        {busy === 'convert' ? 'Creating…' : 'Create client & job'}
                                    </button>
                                    <button type="button" className="btn btn-outline" onClick={() => setPanel(null)} disabled={busy === 'convert'}>Cancel</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {stagePills}

                    {(tel || mail || map) && (
                        <div className="flex flex-wrap gap-2">
                            {tel && <ContactButton href={tel} icon={<PhoneIcon className="h-4 w-4" />} label="Call" />}
                            {sms && <ContactButton href={sms} icon={<MessageSquareIcon className="h-4 w-4" />} label="Text" />}
                            {mail && <ContactButton href={mail} icon={<MailIcon className="h-4 w-4" />} label="Email" />}
                            {map && <ContactButton href={map} icon={<MapPinIcon className="h-4 w-4" />} label="Map" external />}
                        </div>
                    )}

                    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                        {lead.phone && <Fact label="Phone"><a className="hover:underline" href={tel || undefined}>{lead.phone}</a></Fact>}
                        {lead.email && <Fact label="Email"><a className="break-all hover:underline" href={mail || undefined}>{lead.email}</a></Fact>}
                        {lead.address && <Fact label="Job address" wide><span className="whitespace-pre-line">{lead.address}</span></Fact>}
                        <Fact label="Budget">{budget || <span className="text-muted-foreground">Not given</span>}</Fact>
                        <Fact label="Source">{originLabel(lead.origin, lead.source)}</Fact>
                        <Fact label="Last contact">
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className={lead.lastContactAt ? undefined : 'text-muted-foreground'}>{lead.lastContactAt ? relativeTime(lead.lastContactAt) : 'Not logged yet'}</span>
                                {open && <button type="button" className="btn btn-outline btn-sm" onClick={() => void logContact()} disabled={working}>{busy === 'contact' ? 'Saving…' : 'Log contact'}</button>}
                            </span>
                        </Fact>
                    </dl>

                    <div>
                        <h3 className="label">What they need</h3>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{lead.details || '—'}</p>
                    </div>

                    {lead.photoPaths.length > 0 && (
                        <div>
                            <h3 className="label">Photos ({lead.photoPaths.length})</h3>
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                                {lead.photoPaths.map((path, i) => photoUrls[path] ? (
                                    <a key={path} href={photoUrls[path]} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                                        <img src={photoUrls[path]} alt={`Photo ${i + 1} from ${lead.name}`} className="h-full w-full object-cover" loading="lazy" />
                                    </a>
                                ) : (
                                    <div key={path} className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border px-2 text-center text-xs text-muted-foreground">
                                        {Object.keys(photoUrls).length ? 'Not uploaded' : 'Loading…'}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {open && (
                        <section aria-labelledby="lead-follow-heading">
                            <h3 id="lead-follow-heading" className="label">Follow-up</h3>
                            <p className="mb-2 flex items-center gap-2 text-sm">
                                {lead.followUpOn ? <FollowUpPill text={{ ...follow, short: follow.long }} className="text-[13px]" /> : <span className="text-muted-foreground">No follow-up date set.</span>}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {followUpChips(today).map(c => (
                                    <button key={c.id} type="button" className={cx('btn btn-outline btn-sm', lead.followUpOn === c.ymd && 'border-primary text-primary')} onClick={() => void setFollow(c.ymd)} disabled={working}>{c.label}</button>
                                ))}
                                <input type="date" className="input h-9 w-auto py-1 text-sm" aria-label="Follow-up date" value={lead.followUpOn || ''} min="2000-01-01" onChange={e => void setFollow(e.target.value || null)} disabled={working} />
                                {lead.followUpOn && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setFollow(null)} disabled={working}>Clear</button>}
                            </div>
                        </section>
                    )}

                    <LeadAppointments lead={lead} userId={userId} appointments={mine} allAppointments={appointments} canBook={open} />

                    <div>
                        <h3 className="label">Notes</h3>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{lead.notes || <span className="text-muted-foreground">No notes yet. Use Edit lead to add some.</span>}</p>
                    </div>

                    <section aria-labelledby="lead-files-heading">
                        <div className="flex items-center justify-between gap-2">
                            <h3 id="lead-files-heading" className="label !mb-0">Files{lead.attachments.length ? ` (${lead.attachments.length})` : ''}</h3>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInput.current?.click()} disabled={working || lead.attachments.length >= LEAD_LIMITS.attachments}>
                                <PaperclipIcon className="h-3.5 w-3.5" /> {busy === 'file' ? 'Uploading…' : 'Add file'}
                            </button>
                            <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label="Add a file to this lead" multiple accept="image/*,application/pdf" onChange={e => void upload(e.target.files)} />
                        </div>
                        {lead.attachments.length === 0 ? (
                            <p className="mt-1.5 text-sm text-muted-foreground">Plans, quotes or photos you got from them. Images and PDFs, up to 15 MB each.</p>
                        ) : (
                            <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
                                {lead.attachments.map(a => {
                                    const url = fileUrls[a.path];
                                    const kind = attachmentKind(a);
                                    return (
                                        <li key={a.path} className="flex items-center gap-3 px-3 py-2" data-testid="lead-file">
                                            {kind === 'image' && url ? (
                                                <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" loading="lazy" />
                                            ) : (
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[10px] font-bold uppercase text-muted-foreground">{kind === 'pdf' ? 'PDF' : 'File'}</span>
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-foreground">{a.name}</span>
                                                <span className="block text-xs text-muted-foreground">{formatFileSize(a.size)}</span>
                                            </span>
                                            {removing === a.path ? (
                                                <span className="flex shrink-0 items-center gap-1 text-xs">
                                                    <span className="text-muted-foreground">Remove?</span>
                                                    <button type="button" className="btn btn-danger btn-sm" onClick={() => void removeFile(a.path)} disabled={working}>Yes</button>
                                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setRemoving(null)} disabled={working}>No</button>
                                                </span>
                                            ) : (
                                                <span className="flex shrink-0 gap-1">
                                                    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">Open</a> : <span className="px-2 text-xs text-muted-foreground">Loading…</span>}
                                                    <button type="button" className="btn btn-ghost btn-sm text-destructive" onClick={() => setRemoving(a.path)} disabled={working} aria-label={`Remove ${a.name}`}>Remove</button>
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    <div className="flex flex-wrap gap-x-2 gap-y-1 border-t border-border pt-3">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={startEdit} disabled={working}>Edit lead</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void draftEstimate()} disabled={working}>
                            {busy === 'ai' ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <SparklesIcon className="h-4 w-4" />}
                            Draft estimate with AI
                            {plan !== 'ai' && <span className="badge badge-muted ml-1">Premium + AI</span>}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm text-destructive sm:ml-auto" onClick={() => setConfirmDelete(true)} disabled={working}>
                            <TrashIcon className="h-4 w-4" /> Delete lead
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default LeadDetail;
