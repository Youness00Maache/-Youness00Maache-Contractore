/**
 * Everything App.tsx needs for the AI assistant, in one hook:
 *   const ai = useAIAssistant({...});   <AIAssistantPanel assistant={ai} />   ai.openDashboard() / ai.openForJob(job)
 *
 * The router only proposes. Every side effect below runs from an explicit click on a card:
 *   GENERATE_DOCUMENT → "Open & edit" / "Save"      PREPARE_EMAIL_BATCH → checkboxes + "Send" (exactly once)
 *   UPDATE_JOB_STATUS / DUPLICATE_JOB / CREATE_* / ADD_* / RESTOCK_INVENTORY → "Confirm"
 *   NAVIGATE_TO is harmless and runs immediately.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase.ts';
import { fetchFullDocuments } from '../../lib/documents.ts';
import type { Client, FormData, Job, UserProfile } from '../../types.ts';
import { sendEmailBatch as sendBatchViaGmail } from '../../services/batchEmailSender.ts';
import { finalizeDraft, formTypeForDoc, toFormPrefill } from '../../utils/documentDraft.ts';
import { normalizeDocumentSetupPayload, buildSetupSubmissionText } from '../../utils/documentSetupPayload.ts';
import { userAllowsEmptyOrProceed } from '../../utils/documentMetadata.ts';
import { getFormLabel, resolveMentionsInText, stripSystemContext, type ResolvedMention } from '../../utils/aiMentionUtils.ts';
import {
    DOC_LABELS, getMissingAskFields, resolveDocKey, toLocalYmd, type DocKey,
} from '../config/documentFieldRequirements.ts';
import type { RouterProposal, RouterRequestContext } from '../../supabase/functions/master-ai-router/shared/routerContract.ts';
import { useMasterAIRouter, resolveJobForDocumentRequest, type ChatMessage } from './useMasterAIRouter.ts';
import { imagesToHtml, toRouterImages, type PendingImage } from '../ai/attachments.ts';
import { toEmailBatchItems, type AIEmailDraft } from '../ai/emailBatch.ts';
import { AI_UPGRADE_EVENT as AI_UPGRADE_EVENT_NAME, dispatchUpgradeEvent } from '../ai/events.ts';

export interface AIAssistantDeps {
    session: Session | null;
    profile: UserProfile | null;
    jobs: Job[];
    clients: Client[];
    forms: FormData[];
    inventory?: Array<{ id: string; name: string; quantity?: number; unit?: string }>;
    /** CORE's free-plan check; return false to block (CORE shows the upgrade modal). */
    checkLimit?: (type: 'jobs' | 'clients' | 'docs', contextId?: string) => boolean;
    /** Show the upgrade modal (AI monthly limit reached). */
    onUpgrade?: (message: string) => void;
    /** CORE's job status updater (keeps App state in sync). */
    updateJobStatus?: (jobId: string, status: Job['status']) => unknown;
    /** CORE opens its Duplicate Job modal. */
    onDuplicateJob?: (job: Job) => void;
    /** Count emails toward the plan usage. */
    onEmailsSent?: (count: number) => void;
    /** Upload a photo to Storage and return its public URL (for report photos). */
    uploadImage?: (file: File) => Promise<string>;
    /** Refresh App data after the assistant changed something (inventory, jobs). */
    refreshData?: () => void;
}

export type AssistantMode = 'dashboard' | 'job';

export { AI_UPGRADE_EVENT } from '../ai/events.ts';

const JOB_STATUS_LABEL: Record<string, string> = { active: 'Active', paused: 'Paused', completed: 'Completed', inactive: 'Inactive' };

export function useAIAssistant(deps: AIAssistantDeps) {
    const navigate = useNavigate();
    const userId = deps.session?.user?.id || null;
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<AssistantMode>('dashboard');
    const [jobId, setJobId] = useState<string | null>(null);
    const [composer, setComposer] = useState<Record<AssistantMode, string>>({ dashboard: '', job: '' });
    const sendingEmailsRef = useRef(false);
    /** user-message id → photos, to embed into the drafted report after upload */
    const photosRef = useRef(new Map<string, File[]>());

    const dashboard = useMasterAIRouter({ scope: 'dashboard', userId });
    const jobChat = useMasterAIRouter({ scope: 'job', scopeId: jobId, userId });
    const chat = mode === 'job' && jobId ? jobChat : dashboard;
    const job = useMemo(() => deps.jobs.find(j => j.id === jobId) || null, [deps.jobs, jobId]);

    const depsRef = useRef(deps);
    depsRef.current = deps;

    // PLAN_LIMIT → upgrade modal (once per error). One path for the chat and the in-form AI modal:
    // everything dispatches AI_UPGRADE_EVENT and this listener calls CORE's onUpgrade.
    useEffect(() => {
        const err = chat.error;
        if (err?.code === 'PLAN_LIMIT') dispatchUpgradeEvent(err.message);
    }, [chat.error]);
    useEffect(() => {
        const onEvent = (e: Event) => {
            const message = (e as CustomEvent<{ message?: string }>).detail?.message || 'Upgrade to keep using the AI assistant.';
            depsRef.current.onUpgrade?.(message);
        };
        window.addEventListener(AI_UPGRADE_EVENT_NAME, onEvent);
        return () => window.removeEventListener(AI_UPGRADE_EVENT_NAME, onEvent);
    }, []);

    // A different (or no) signed-in user: close the panel and forget the job context.
    useEffect(() => {
        setIsOpen(false);
        setJobId(null);
        setMode('dashboard');
        setComposer({ dashboard: '', job: '' });
        photosRef.current.clear();
    }, [userId]);

    const openDashboard = useCallback(() => { setMode('dashboard'); setIsOpen(true); }, []);
    const openForJob = useCallback((target: Job) => { setJobId(target.id); setMode('job'); setIsOpen(true); }, []);
    /** Closing cancels the request in flight; typed text is kept for next time (AI-035). */
    const close = useCallback(() => { dashboard.cancel(); jobChat.cancel(); setIsOpen(false); }, [dashboard, jobChat]);

    const setComposerText = useCallback((text: string) => setComposer(prev => ({ ...prev, [mode]: text })), [mode]);

    const userText = useCallback((messages: ChatMessage[]) => messages.filter(m => m.role === 'user').map(m => m.content).join('\n'), []);

    const pendingGather = useCallback((): ChatMessage | undefined => [...chat.messages].reverse()
        .find(m => m.proposal?.action_type === 'GATHER_INFO' && m.status === 'pending'), [chat.messages]);

    /** Context the router may use. Only ids/names: the user's own records, bounded in size. */
    const buildContext = useCallback((text: string, mentions: ResolvedMention[], proceed = false): RouterRequestContext => {
        const d = depsRef.current;
        const lower = text.toLowerCase();
        const mentionedClientIds = new Set(mentions.filter(m => m.kind === 'client').map(m => m.id));
        const mentionedDocIds = new Set(mentions.filter(m => m.kind === 'document').map(m => m.id));
        const named = (name: string) => name.length >= 3 && lower.includes(name.toLowerCase());
        const rank = <T,>(list: T[], score: (x: T) => number) => [...list].sort((a, b) => score(b) - score(a));
        const clients = rank(d.clients, c => (mentionedClientIds.has(c.id) ? 2 : 0) + (named(c.name) ? 1 : 0)).slice(0, 60);
        const inJob = mode === 'job' && job;
        const jobs = inJob ? [job] : rank(d.jobs, j => (named(j.name) || named(j.clientName || '') ? 2 : 0) + (j.status === 'active' ? 1 : 0)).slice(0, 40);
        const docPool = inJob ? d.forms.filter(f => f.jobId === job.id) : d.forms;
        const documents = rank(docPool, f => (mentionedDocIds.has(f.id) ? 2 : 0) + (named(getFormLabel(f).split('#')[1] || '') ? 1 : 0)).slice(0, 40);
        const gather = pendingGather();
        return {
            today: toLocalYmd(),
            active_job_id: inJob ? job.id : undefined,
            company_name: d.profile?.companyName || undefined,
            clients: clients.map(c => ({ id: c.id, name: c.name, email: c.email || undefined, address: c.address || undefined })),
            jobs: jobs.map(j => ({ id: j.id, name: j.name, client_name: j.clientName || undefined, address: j.clientAddress || undefined, status: j.status })),
            documents: documents.map(f => ({
                id: f.id, type: f.type, label: getFormLabel(f), job_id: f.jobId,
                client_name: String((f.data as unknown as Record<string, unknown>)?.clientName || d.jobs.find(j => j.id === f.jobId)?.clientName || '') || undefined,
            })),
            inventory: inJob ? [] : (d.inventory || []).slice(0, 40).map(i => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit })),
            mentions: mentions.map(m => ({ kind: m.kind, id: m.id })),
            pending_draft: gather?.proposal?.document_type
                ? { document_type: gather.proposal.document_type, prefill: gather.proposal.prefill || {} }
                : null,
            proceed,
        };
    }, [job, mode, pendingGather]);

    /** Turns a pending GATHER_INFO into a ready draft locally (Skip / setup card / "go ahead"). */
    const completeGather = useCallback((messageId: string, values: Record<string, unknown>, displayText: string) => {
        const msg = chat.messages.find(m => m.id === messageId);
        const p = msg?.proposal;
        const docType = resolveDocKey(p?.document_type);
        if (!msg || !p || !docType) return;
        const added = normalizeDocumentSetupPayload(values, docType);
        const prefill = { ...(p.prefill || {}), ...added };
        const missing = getMissingAskFields(docType, prefill);
        chat.updateMessage(messageId, { status: 'done', result: Object.keys(added).length ? 'Details added' : 'Skipped' });
        const next: RouterProposal = { ...p, action_type: 'GENERATE_DOCUMENT', prefill, missing_fields: missing, reply_text: '' };
        chat.appendMessages([
            { role: 'user', content: displayText },
            {
                role: 'assistant',
                content: missing.length
                    ? `Here is your ${DOC_LABELS[docType].toLowerCase()} draft. The empty boxes stay empty — you can fill them in the editor.`
                    : `Here is your ${DOC_LABELS[docType].toLowerCase()} draft. Check it, then open it to edit or save it.`,
                proposal: next,
                status: 'pending',
            },
        ]);
    }, [chat]);

    const send = useCallback(async (rawText: string, options: { mentions?: ResolvedMention[]; images?: PendingImage[] } = {}) => {
        const d = depsRef.current;
        const display = rawText.trim();
        const text = stripSystemContext(display);
        const images = options.images || [];
        if ((!text && !images.length) || chat.isProcessing) return;
        // "skip" / "go ahead" while a setup card is open: finish locally, no AI request.
        const gather = pendingGather();
        if (gather && text && !images.length && userAllowsEmptyOrProceed(text) && text.split(/\s+/).length <= 8) {
            completeGather(gather.id, {}, display);
            setComposerText('');
            return;
        }
        const mentions = resolveMentionsInText(text, options.mentions || [], d.clients, d.forms);
        const context = buildContext(text, mentions, Boolean(gather && userAllowsEmptyOrProceed(text)));
        setComposerText('');
        const routerImages = images.length ? await toRouterImages(images) : [];
        const { proposal, userMessageId, replyMessageId } = await chat.send(text, { context, images: routerImages, displayText: display || 'Sent photos' });
        if (images.length) photosRef.current.set(userMessageId, images.map(i => i.file));
        if (gather && proposal && proposal.action_type !== 'CHAT') chat.updateMessage(gather.id, { status: 'done', result: 'Updated' });
        if (proposal?.action_type === 'NAVIGATE_TO' && proposal.route) {
            // Navigation is harmless: run it right away (the card stays as a "done" record).
            if (replyMessageId) chat.updateMessage(replyMessageId, { status: 'done', result: 'Opened' });
            navigate(proposal.route);
            setIsOpen(false);
        }
    }, [buildContext, chat, completeGather, navigate, pendingGather, setComposerText]);

    /** Photos sent in the user turn right before this assistant message. */
    const photosFor = useCallback((messageId: string): File[] => {
        const idx = chat.messages.findIndex(m => m.id === messageId);
        for (let i = idx - 1; i >= 0; i--) {
            const m = chat.messages[i];
            if (m.role === 'user') return photosRef.current.get(m.id) || [];
        }
        return [];
    }, [chat.messages]);

    /** Jobs a drafted document can be filed under, and the one we are sure about (or null). */
    const jobChoices = useCallback((proposal: RouterProposal): { jobs: Job[]; suggested: string | null } => {
        const d = depsRef.current;
        if (mode === 'job' && job) return { jobs: [job], suggested: job.id };
        const byId = proposal.job_id && d.jobs.some(j => j.id === proposal.job_id) ? proposal.job_id : null;
        const sorted = [...d.jobs].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
        if (byId) return { jobs: sorted, suggested: byId };
        const client = d.clients.find(c => c.id === proposal.client_ids?.[0]);
        if (client) {
            const forClient = d.jobs.filter(j => (j.clientName || '').trim().toLowerCase() === client.name.trim().toLowerCase());
            const active = forClient.filter(j => j.status === 'active');
            const pick = active.length === 1 ? active[0] : forClient.length === 1 ? forClient[0] : null;
            return { jobs: sorted, suggested: pick?.id || null };
        }
        const resolved = resolveJobForDocumentRequest(userText(chat.messages), d.jobs, d.clients);
        return { jobs: sorted, suggested: resolved?.id || null };
    }, [chat.messages, job, mode, userText]);

    const openDraft = useCallback(async (messageId: string, targetJobId: string, autoSave: boolean) => {
        const d = depsRef.current;
        const msg = chat.messages.find(m => m.id === messageId);
        const p = msg?.proposal;
        const docType: DocKey | null = resolveDocKey(p?.document_type);
        const targetJob = d.jobs.find(j => j.id === targetJobId);
        if (!msg || !p || !docType || !targetJob) return;
        if (d.checkLimit && !d.checkLimit('docs', targetJob.id)) return;
        chat.updateMessage(messageId, { status: 'working' });
        const client = d.clients.find(c => c.id === p.client_ids?.[0]) || null;
        const prefill = finalizeDraft(docType, p.prefill || {}, {
            job: targetJob, client, clients: d.clients, profile: d.profile, userText: userText(chat.messages),
        });
        if (docType === 'DAILY_REPORT' || docType === 'NOTE') {
            const photosHtml = await imagesToHtml(photosFor(messageId), d.uploadImage);
            if (photosHtml) prefill.content = `${String(prefill.content || '')}${photosHtml}`;
        }
        chat.updateMessage(messageId, { status: 'done', result: autoSave ? `Saved to ${targetJob.name}` : `Opened in the editor (${targetJob.name})` });
        setIsOpen(false);
        navigate(`/jobs/${targetJob.id}/forms/${encodeURIComponent(formTypeForDoc(docType))}`, {
            state: { prefillData: toFormPrefill(prefill, { autoSave }) },
        });
    }, [chat, navigate, photosFor, userText]);

    const submitSetup = useCallback((messageId: string, values: Record<string, unknown>) => {
        const msg = chat.messages.find(m => m.id === messageId);
        const docType = resolveDocKey(msg?.proposal?.document_type);
        if (!docType) return;
        completeGather(messageId, values, buildSetupSubmissionText(values, docType));
    }, [chat.messages, completeGather]);

    const skipSetup = useCallback((messageId: string) => completeGather(messageId, {}, 'Skip — draft it with what I gave you'), [completeGather]);

    const dismiss = useCallback((messageId: string) => chat.updateMessage(messageId, { status: 'dismissed', result: 'Cancelled' }), [chat]);

    const finish = useCallback((messageId: string, result: string, reply?: string) => {
        chat.updateMessage(messageId, { status: 'done', result });
        if (reply) chat.appendMessages([{ role: 'assistant', content: reply }]);
    }, [chat]);

    const fail = useCallback((messageId: string, message: string) => {
        chat.updateMessage(messageId, { status: 'pending' });
        chat.appendMessages([{ role: 'assistant', content: message, isError: true }]);
    }, [chat]);

    /** Runs a confirmed non-document action. `extra.jobId` comes from the card's job picker. */
    const confirmAction = useCallback(async (messageId: string, extra: { jobId?: string } = {}) => {
        const d = depsRef.current;
        const msg = chat.messages.find(m => m.id === messageId);
        const p = msg?.proposal;
        if (!msg || !p || msg.status === 'working' || msg.status === 'done') return;
        const e = (p.entity || {}) as Record<string, unknown>;
        chat.updateMessage(messageId, { status: 'working' });
        try {
            switch (p.action_type) {
                case 'CREATE_JOB': {
                    if (d.checkLimit && !d.checkLimit('jobs')) { chat.updateMessage(messageId, { status: 'pending' }); return; }
                    const client = d.clients.find(c => c.name.toLowerCase() === String(e.client_name || '').toLowerCase());
                    finish(messageId, 'Opened the new job form');
                    setIsOpen(false);
                    navigate('/jobs/create', { state: { prefillData: { name: e.name, clientName: client?.name || e.client_name, clientAddress: e.address || client?.address, startDate: e.start_date } } });
                    return;
                }
                case 'CREATE_CLIENT': {
                    finish(messageId, 'Opened the new client form');
                    setIsOpen(false);
                    navigate('/clients', { state: { openCreateModal: true, prefillData: { name: e.name, email: e.email || '', phone: e.phone || '', address: e.address || '', notes: e.notes || '' } } });
                    return;
                }
                case 'ADD_INVENTORY': {
                    finish(messageId, 'Opened the new item form');
                    setIsOpen(false);
                    navigate('/inventory', { state: { openAddModal: true, prefillData: { name: e.name, quantity: e.quantity ?? 1, cost_price: e.cost ?? e.price ?? 0, unit: e.unit || 'pcs', category: e.category || '', supplier: e.supplier || '' } } });
                    return;
                }
                case 'ADD_PRICE_BOOK_ITEM': {
                    finish(messageId, 'Opened the price book form');
                    setIsOpen(false);
                    navigate('/pricebook', { state: { openAddModal: true, prefillData: { name: e.name, rate: e.price ?? 0, unit_cost: e.cost ?? undefined, description: e.description || '', category: e.category || '' } } });
                    return;
                }
                case 'RESTOCK_INVENTORY': {
                    const item = (d.inventory || []).find(i => i.id === p.inventory_item_id);
                    const { error } = await supabase.rpc('adjust_inventory', {
                        p_item_id: p.inventory_item_id, p_delta: p.quantity_delta, p_reason: 'AI assistant', p_job_id: null,
                    });
                    if (error) { fail(messageId, /insufficient/i.test(error.message) ? 'Not enough stock for that change.' : `Stock was not changed: ${error.message}`); return; }
                    d.refreshData?.();
                    finish(messageId, `${item?.name || 'Item'} ${Number(p.quantity_delta) > 0 ? '+' : ''}${p.quantity_delta}`);
                    return;
                }
                case 'UPDATE_JOB_STATUS': {
                    const target = d.jobs.find(j => j.id === (extra.jobId || p.job_id));
                    if (!target || !p.job_status) { chat.updateMessage(messageId, { status: 'pending' }); return; }
                    if (d.updateJobStatus) {
                        await d.updateJobStatus(target.id, p.job_status as Job['status']);
                    } else {
                        const { error } = await supabase.from('jobs').update({ status: p.job_status }).eq('id', target.id);
                        if (error) { fail(messageId, `The job was not updated: ${error.message}`); return; }
                        d.refreshData?.();
                    }
                    finish(messageId, `${target.name} → ${JOB_STATUS_LABEL[p.job_status] || p.job_status}`);
                    return;
                }
                case 'DUPLICATE_JOB': {
                    const target = d.jobs.find(j => j.id === (extra.jobId || p.job_id));
                    if (!target || !d.onDuplicateJob) { chat.updateMessage(messageId, { status: 'pending' }); return; }
                    finish(messageId, `Duplicating ${target.name}`);
                    setIsOpen(false);
                    d.onDuplicateJob(target);
                    return;
                }
                case 'DRAFT_EMAIL_ONLY': {
                    finish(messageId, 'Opened in Communication');
                    setIsOpen(false);
                    navigate('/communication', { state: { prefillData: { clientId: p.client_ids?.[0], subject: p.email_subject || '', body: p.email_body || '' } } });
                    return;
                }
                case 'NAVIGATE_TO': {
                    if (p.route) { finish(messageId, 'Opened'); setIsOpen(false); navigate(p.route); }
                    return;
                }
                default:
                    chat.updateMessage(messageId, { status: 'pending' });
            }
        } catch (err) {
            fail(messageId, err instanceof Error ? err.message : 'That did not work. Please try again.');
        }
    }, [chat, fail, finish, navigate]);

    /** Sends the selected emails exactly once (AI-005). */
    const sendEmails = useCallback(async (messageId: string, drafts: AIEmailDraft[]) => {
        const d = depsRef.current;
        const msg = chat.messages.find(m => m.id === messageId);
        if (!msg || msg.status === 'done' || msg.status === 'working' || sendingEmailsRef.current) return;
        // Stable ids: a retry never re-sends an email that already went out (batchEmailSender de-duplicates by id).
        const items = toEmailBatchItems(drafts).map(item => ({ ...item, id: `${messageId}:${item.client_id}` }));
        if (!items.length) return;
        if (!d.session || !d.profile) { fail(messageId, 'Please sign in again before sending emails.'); return; }
        sendingEmailsRef.current = true;
        chat.updateMessage(messageId, { status: 'working' });
        const explain = (reason: string, code?: string) => {
            if (code === 'PLAN_LIMIT' || /PLAN_LIMIT/.test(reason)) {
                const message = reason.replace(/^.*?PLAN_LIMIT:\s*/, '') || 'You have reached the email limit of your plan this month.';
                dispatchUpgradeEvent(message);
                return message;
            }
            if (code === 'NO_ACCOUNT' || /GMAIL_NOT_CONNECTED/.test(reason)) return 'Connect Gmail in Communication first, then press Send again.';
            if (code === 'RECONNECT_REQUIRED') return reason || 'Reconnect your Gmail account in Communication, then press Send again.';
            return reason;
        };
        try {
            const attachmentIds = Array.from(new Set(items.flatMap(i => i.attachment_document_ids || [])));
            const full = attachmentIds.length ? await fetchFullDocuments(attachmentIds) : [];
            const forms = [...full, ...d.forms.filter(f => !attachmentIds.includes(f.id))];
            const result = await sendBatchViaGmail(items, { supabase, session: d.session, profile: d.profile, forms, jobs: d.jobs, clients: d.clients });
            if (result.sent > 0) d.onEmailsSent?.(result.sent);
            const stopped = result.stoppedReason ? explain(result.errors[0] || '', result.stoppedReason) : '';
            if (result.sent === 0) {
                fail(messageId, stopped || explain(result.errors[0] || 'No email was sent.'));
                return;
            }
            const notes = [result.failed ? `${result.failed} failed` : '', result.skipped ? `${result.skipped} not sent` : ''].filter(Boolean).join(', ');
            finish(messageId, `${result.sent} email${result.sent === 1 ? '' : 's'} sent${result.sender ? ` from ${result.sender}` : ''}${notes ? ` (${notes})` : ''}`,
                stopped || (result.errors.length ? `Some emails were not sent: ${result.errors.join('; ')}` : undefined));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'The emails could not be sent.';
            fail(messageId, explain(message, (err as { code?: string }).code));
        } finally {
            sendingEmailsRef.current = false;
        }
    }, [chat, fail, finish]);

    const upgrade = useCallback(() => {
        dispatchUpgradeEvent(chat.error?.message || 'Upgrade to keep using the AI assistant this month.');
    }, [chat.error]);

    return {
        isOpen, mode, job, openDashboard, openForJob, close,
        chat,
        composerText: composer[mode],
        setComposerText,
        send,
        jobChoices,
        openDraft,
        submitSetup,
        skipSetup,
        confirmAction,
        sendEmails,
        dismiss,
        upgrade,
        data: { clients: deps.clients, forms: deps.forms, jobs: deps.jobs, profile: deps.profile, inventory: deps.inventory || [] },
    };
}

export type AIAssistant = ReturnType<typeof useAIAssistant>;
