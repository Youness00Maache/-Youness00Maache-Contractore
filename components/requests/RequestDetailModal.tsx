/**
 * One quote request: contact buttons, what they need, address, photos, and the actions
 * "Create client & job" (one tap, plan limits respected), "Draft estimate with AI" (Premium + AI: opens the job's
 * assistant with the request text and photos), archive and delete.
 */
import React, { useEffect, useState } from 'react';
import { Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { MailIcon, MapPinIcon, MessageSquareIcon, PhoneIcon, SparklesIcon, TrashIcon, BriefcaseIcon } from '../Icons.tsx';
import { describeError, isPlanLimitError, planLimitMessage } from '../../lib/account.ts';
import { MAX_AI_IMAGES, prepareImage, type PendingImage } from '../../src/ai/attachments.ts';
import {
    buildEstimatePrompt, jobNameFromRequest, mailHref, mapsHref, relativeTime, smsHref, sourceLabel, telHref,
    type QuoteRequest,
} from './requestLogic.ts';
import {
    convertQuoteRequest, deleteQuoteRequest, downloadRequestPhotos, requestPhotoUrls, setQuoteRequestStatus,
    type ConvertResult,
} from './requestsApi.ts';
import { addRequestPhotosToJob } from '../photos/photosApi.ts';

export interface EstimateHandoff { jobId: string; prompt: string; images: PendingImage[] }

export interface RequestActionsProps {
    plan: string;
    /** App's Free plan pre-check for a new job (opens the upgrade window and returns false when at the limit). */
    checkJobLimit: () => boolean;
    onConverted: (result: ConvertResult) => void;
    onOpenJob: (jobId: string) => void;
    onUpgrade: (reason: string) => void;
    onDraftEstimate: (handoff: EstimateHandoff) => void;
}

interface Props extends RequestActionsProps {
    request: QuoteRequest | null;
    onClose: () => void;
    onChanged: (req: QuoteRequest) => void;
    onDeleted: (id: string) => void;
}

const localYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ContactButton: React.FC<{ href: string; icon: React.ReactNode; label: string; external?: boolean }> = ({ href, icon, label, external }) => (
    <a href={href} className="btn btn-outline min-h-[44px] flex-1 sm:flex-none" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {icon} {label}
    </a>
);

const RequestDetailModal: React.FC<Props> = ({
    request, onClose, onChanged, onDeleted, plan, checkJobLimit, onConverted, onOpenJob, onUpgrade, onDraftEstimate,
}) => {
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<'' | 'convert' | 'ai' | 'archive' | 'delete'>('');
    const [converting, setConverting] = useState(false);
    const [jobName, setJobName] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const req = request;

    useEffect(() => {
        setConverting(false);
        setConfirmDelete(false);
        setUrls({});
        if (!req) return;
        setJobName(jobNameFromRequest(req));
        let cancelled = false;
        if (req.photoPaths.length) {
            requestPhotoUrls(req.photoPaths).then(map => { if (!cancelled) setUrls(map); }).catch(() => undefined);
        }
        if (req.status === 'new') {
            setQuoteRequestStatus(req.id, 'seen').then(() => { if (!cancelled) onChanged({ ...req, status: 'seen' }); }).catch(() => undefined);
        }
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [req?.id]);

    if (!req) return null;

    const converted = req.status === 'converted' && !!req.jobId;
    const photoCount = req.photoPaths.length;
    const tel = telHref(req.phone);
    const sms = smsHref(req.phone);
    const mail = mailHref(req.email, 'Your quote request');
    const map = mapsHref(req.address);

    /** Creates the client + job; returns the job id (null when refused). */
    const convert = async (name: string): Promise<string | null> => {
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to create the job."); return null; }
        if (!checkJobLimit()) return null;
        setBusy('convert');
        try {
            const res = await convertQuoteRequest(req.id, name, localYmd());
            onConverted(res);
            const next: QuoteRequest = { ...req, status: 'converted', jobId: String(res.job.id), clientId: res.client?.id ?? null, convertedAt: new Date().toISOString() };
            onChanged(next);
            if (res.clientSkipped) {
                toast.info(`The job was created, but the client was not saved. ${res.clientSkipped}`, {
                    duration: 10000, action: { label: 'Upgrade', onClick: () => onUpgrade(res.clientSkipped || '') },
                });
            } else {
                toast.success(res.already ? 'This request already has a job.' : `Client and job "${res.job.name}" created.`);
            }
            // The request photos become the job's "Before" photos (in the background).
            if (!res.already && photoCount && res.job.user_id) {
                downloadRequestPhotos(req.photoPaths)
                    .then(files => addRequestPhotosToJob({ userId: String(res.job.user_id), jobId: String(res.job.id), requestId: req.id, files }))
                    .catch(() => undefined);
            }
            setConverting(false);
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
        if (plan !== 'ai') {
            onUpgrade('Drafting an estimate from a quote request with AI is part of Premium + AI.');
            return;
        }
        setBusy('ai');
        try {
            const jobId = req.jobId || (await convert(jobName || jobNameFromRequest(req)));
            if (!jobId) return;
            setBusy('ai');
            const files = await downloadRequestPhotos(req.photoPaths, MAX_AI_IMAGES).catch(() => [] as File[]);
            const images: PendingImage[] = [];
            for (const f of files) {
                try { images.push(await prepareImage(f)); } catch { /* skip a photo the assistant can't use */ }
            }
            onDraftEstimate({ jobId, prompt: buildEstimatePrompt(req, images.length), images });
            onClose();
        } finally {
            setBusy('');
        }
    };

    const archive = async () => {
        setBusy('archive');
        const status = req.status === 'archived' ? (req.jobId ? 'converted' : 'seen') : 'archived';
        try {
            await setQuoteRequestStatus(req.id, status);
            onChanged({ ...req, status });
            toast.success(status === 'archived' ? 'Request archived.' : 'Request moved back to the inbox.');
            if (status === 'archived') onClose();
        } catch (e) {
            toast.error(describeError(e));
        } finally {
            setBusy('');
        }
    };

    const remove = async () => {
        setBusy('delete');
        try {
            await deleteQuoteRequest(req.id);
            onDeleted(req.id);
            toast.success('Request deleted.');
            onClose();
        } catch (e) {
            toast.error(describeError(e));
        } finally {
            setBusy('');
        }
    };

    const working = busy !== '';
    const footer = confirmDelete ? (
        <>
            <span className="mr-auto self-center text-sm text-muted-foreground">Delete this request and its photos? This can’t be undone.</span>
            <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)} disabled={working}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={() => void remove()} disabled={working}>{busy === 'delete' ? 'Deleting…' : 'Delete'}</button>
        </>
    ) : (
        <>
            <button type="button" className="btn btn-ghost text-destructive sm:mr-auto" onClick={() => setConfirmDelete(true)} disabled={working}>
                <TrashIcon className="h-4 w-4" /> Delete
            </button>
            <button type="button" className="btn btn-outline" onClick={() => void archive()} disabled={working}>
                {req.status === 'archived' ? 'Move to inbox' : 'Archive'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => void draftEstimate()} disabled={working}>
                {busy === 'ai' ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <SparklesIcon className="h-4 w-4" />}
                Draft estimate with AI
                {plan !== 'ai' && <span className="badge badge-muted ml-1">Premium + AI</span>}
            </button>
            {converted ? (
                <button type="button" className="btn btn-primary" onClick={() => { onClose(); onOpenJob(req.jobId as string); }} disabled={working}>
                    <BriefcaseIcon className="h-4 w-4" /> Open job
                </button>
            ) : (
                <button type="button" className="btn btn-primary" onClick={() => setConverting(true)} disabled={working || converting}>
                    Create client &amp; job
                </button>
            )}
        </>
    );

    return (
        <Modal
            open={!!request}
            onClose={onClose}
            busy={busy === 'convert' || busy === 'delete'}
            size="lg"
            title={req.name}
            description={[relativeTime(req.createdAt), sourceLabel(req.source) ? `via ${sourceLabel(req.source)}` : ''].filter(Boolean).join(' · ')}
            footer={footer}
        >
            <div className="space-y-5">
                {converted && (
                    <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
                        Client and job created{req.convertedAt ? ` ${relativeTime(req.convertedAt)}` : ''}. Open the job to write the estimate, add photos or schedule it.
                    </p>
                )}

                {(tel || mail || map) && (
                    <div className="flex flex-wrap gap-2">
                        {tel && <ContactButton href={tel} icon={<PhoneIcon className="h-4 w-4" />} label="Call" />}
                        {sms && <ContactButton href={sms} icon={<MessageSquareIcon className="h-4 w-4" />} label="Text" />}
                        {mail && <ContactButton href={mail} icon={<MailIcon className="h-4 w-4" />} label="Email" />}
                        {map && <ContactButton href={map} icon={<MapPinIcon className="h-4 w-4" />} label="Map" external />}
                    </div>
                )}

                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    {req.phone && <div><dt className="label">Phone</dt><dd className="break-words">{req.phone}</dd></div>}
                    {req.email && <div><dt className="label">Email</dt><dd className="break-all">{req.email}</dd></div>}
                    {req.address && <div className="sm:col-span-2"><dt className="label">Job address</dt><dd className="whitespace-pre-line">{req.address}</dd></div>}
                </dl>

                <div>
                    <h3 className="label">What they need</h3>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{req.details || '—'}</p>
                </div>

                {photoCount > 0 && (
                    <div>
                        <h3 className="label">Photos ({photoCount})</h3>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {req.photoPaths.map((path, i) => urls[path] ? (
                                <a key={path} href={urls[path]} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                                    <img src={urls[path]} alt={`Photo ${i + 1} from ${req.name}`} className="h-full w-full object-cover" loading="lazy" />
                                </a>
                            ) : (
                                <div key={path} className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border px-2 text-center text-xs text-muted-foreground">
                                    {Object.keys(urls).length ? 'Not uploaded' : 'Loading…'}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {converting && !converted && (
                    <div className="rounded-xl border border-border bg-muted/40 p-4">
                        <label htmlFor="rq-job-name" className="label">Job name</label>
                        <input id="rq-job-name" className="input" value={jobName} maxLength={120} onChange={(e) => setJobName(e.target.value)} autoFocus />
                        <p className="mt-2 text-xs text-muted-foreground">
                            Adds {req.name} to your clients (or uses the client with the same email, phone or name) and creates an active job
                            {photoCount ? ' with their photos as “Before” photos' : ''}. It counts toward your plan’s monthly jobs and clients.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" className="btn btn-primary" onClick={() => void convert(jobName)} disabled={busy === 'convert' || !jobName.trim()}>
                                {busy === 'convert' ? 'Creating…' : 'Create client & job'}
                            </button>
                            <button type="button" className="btn btn-outline" onClick={() => setConverting(false)} disabled={busy === 'convert'}>Cancel</button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default RequestDetailModal;
