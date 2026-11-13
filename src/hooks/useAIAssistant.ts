/**
 * Everything App.tsx needs for the AI assistant, in one hook:
 *   const ai = useAIAssistant({...});   <AIAssistantPanel assistant={ai} />   ai.openDashboard() / ai.openForJob(job)
 *
 * The router only proposes. Every side effect below runs from an explicit click on a card:
 *   GENERATE_DOCUMENT → "Open & edit" / "Save"      PREPARE_EMAIL_BATCH → checkboxes + "Send" (exactly once)
 *   UPDATE_JOB_STATUS / DUPLICATE_JOB / CREATE_* / ADD_* / RESTOCK_INVENTORY → "Confirm"
 *   RUN_PLAN → "Do it all": every step runs in order, documents are saved as Drafts (no form opens)
 *   NAVIGATE_TO is harmless and runs immediately.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase.ts';
import {
    assertFullDocument, fetchFullDocuments, mapDocumentRow, primeDocumentCache, stripLightweightFlag,
} from '../../lib/documents.ts';
import { isMissingColumnError } from '../../lib/account.ts';
import { FormType } from '../../types.ts';
import type { Client, FormData, Job, UserProfile } from '../../types.ts';
import { insertClient } from '../../components/ClientDetails.tsx';
import { withSchemaFallback } from '../../components/viewKit.tsx';
import { DOC_NUMBER_CONFIG } from '../../components/forms/formUtils.ts';
import type { PlanStep } from '../../supabase/functions/ai-assistant/shared/routerContract.ts';
import { buildPlanDocument } from '../ai/planDocuments.ts';
import {
    PlanStepError, runPlan as runPlanSteps, stepsNeedingJob, summarizePlanRun, type PlanIO, type PlanJobRecord,
} from '../ai/planRunner.ts';
import { sendEmailBatch as sendBatchViaGmail } from '../../services/batchEmailSender.ts';
import { finalizeDraft, formTypeForDoc, toFormPrefill } from '../../utils/documentDraft.ts';
import { normalizeDocumentSetupPayload, buildSetupSubmissionText } from '../../utils/documentSetupPayload.ts';
import { userAllowsEmptyOrProceed } from '../../utils/documentMetadata.ts';
import { getFormLabel, resolveMentionsInText, stripSystemContext, type ResolvedMention } from '../../utils/aiMentionUtils.ts';
import {
    DOC_LABELS, getMissingAskFields, resolveDocKey, toLocalYmd, type DocKey,
} from '../config/documentFieldRequirements.ts';
import { REQUEST_LIMITS, type RouterProposal, type RouterRequestContext } from '../../supabase/functions/ai-assistant/shared/routerContract.ts';
import { DOCUMENT_SUMMARY_COLUMNS, summarizeDocument } from '../ai/documentSummary.ts';
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
    /** Refresh App data after the assistant changed something (inventory, clients, documents, usage). */
    refreshData?: () => void;
    /**
     * CORE's job creation without navigation (App: `handleSaveJob(values, true)`): checks the plan limit,
     * inserts the job, adds it to the job list and resolves with its id. Throws a readable Error.
     */
    createJob?: (values: { name: string; clientName?: string; clientAddress?: string; startDate?: string; clientId?: string }) => Promise<string>;
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
    const runningPlanRef = useRef(false);
    /** A message is being prepared (document facts / photos loading) before the request starts. */
    const preparingRef = useRef(false);
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

    /**
     * Fresh facts (status, totals, payments, line items) for the open job's documents, or for the
     * documents mentioned with # on the dashboard, so the assistant can answer "is the invoice paid?".
     * One light query (JSON paths only, no logos or signature images), at most 4 s; on any failure
     * the app's own copies are used (number and status).
     */
    const loadDocumentRows = useCallback(async (filter: { jobId?: string; ids?: string[] }): Promise<Map<string, Record<string, unknown>>> => {
        const rows = new Map<string, Record<string, unknown>>();
        const ids = Array.from(new Set(filter.ids || [])).slice(0, REQUEST_LIMITS.documents);
        if (!filter.jobId && !ids.length) return rows;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        try {
            const base = supabase.from('documents').select(DOCUMENT_SUMMARY_COLUMNS);
            const scoped = filter.jobId ? base.eq('job_id', filter.jobId) : base.in('id', ids);
            const { data, error } = await scoped.order('created_at', { ascending: false })
                .limit(REQUEST_LIMITS.documents * 2).abortSignal(ctrl.signal);
            if (!error) for (const r of (data || []) as unknown as Array<Record<string, unknown>>) if (r?.id) rows.set(String(r.id), r);
        } catch { /* summaries fall back to the loaded documents */ } finally {
            clearTimeout(timer);
        }
        return rows;
    }, []);

    /** Context the router may use. Only ids/names/document facts: the user's own records, bounded in size. */
    const buildContext = useCallback((text: string, mentions: ResolvedMention[], proceed = false, freshDocs?: Map<string, Record<string, unknown>>): RouterRequestContext => {
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
            documents: documents.map(f => {
                const summary = summarizeDocument(f, freshDocs?.get(f.id));
                return {
                    id: f.id, type: f.type, label: getFormLabel(f), job_id: f.jobId,
                    client_name: String((f.data as unknown as Record<string, unknown>)?.clientName || d.jobs.find(j => j.id === f.jobId)?.clientName || '') || undefined,
                    ...(summary ? { summary } : {}),
                };
            }),
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
        if ((!text && !images.length) || chat.isProcessing || preparingRef.current) return;
        // "skip" / "go ahead" while a setup card is open: finish locally, no AI request.
        const gather = pendingGather();
        if (gather && text && !images.length && userAllowsEmptyOrProceed(text) && text.split(/\s+/).length <= 8) {
            completeGather(gather.id, {}, display);
            setComposerText('');
            return;
        }
        const mentions = resolveMentionsInText(text, options.mentions || [], d.clients, d.forms);
        setComposerText('');
        preparingRef.current = true;
        let context: RouterRequestContext;
        let routerImages: Awaited<ReturnType<typeof toRouterImages>> = [];
        try {
            const freshDocs = await loadDocumentRows(mode === 'job' && job
                ? { jobId: job.id }
                : { ids: mentions.filter(m => m.kind === 'document').map(m => m.id) });
            context = buildContext(text, mentions, Boolean(gather && userAllowsEmptyOrProceed(text)), freshDocs);
            routerImages = images.length ? await toRouterImages(images) : [];
        } finally {
            preparingRef.current = false;
        }
        const { proposal, userMessageId, replyMessageId } = await chat.send(text, { context, images: routerImages, displayText: display || 'Sent photos' });
        if (images.length) photosRef.current.set(userMessageId, images.map(i => i.file));
        if (gather && proposal && proposal.action_type !== 'CHAT') chat.updateMessage(gather.id, { status: 'done', result: 'Updated' });
        if (proposal?.action_type === 'NAVIGATE_TO' && proposal.route) {
            // Navigation is harmless: run it right away (the card stays as a "done" record).
            if (replyMessageId) chat.updateMessage(replyMessageId, { status: 'done', result: 'Opened' });
            navigate(proposal.route);
            setIsOpen(false);
        }
    }, [buildContext, chat, completeGather, job, loadDocumentRows, mode, navigate, pendingGather, setComposerText]);

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

    /**
     * RUN_PLAN "Do it all" (and "Retry"): runs the (edited) steps in order. Clients, jobs and documents
     * are saved directly: documents as Drafts with the forms' defaults, numbering and normalization
     * (src/ai/planDocuments.ts), on the job and client the plan says. Progress is written to the message
     * after every step; a failed step never undoes the others. Plan limits are enforced by the database
     * (PLAN_LIMIT errors are shown on the step, with an upgrade button on the card).
     */
    const runPlan = useCallback(async (messageId: string, steps: PlanStep[]) => {
        const msg = chat.messages.find(m => m.id === messageId);
        const p = msg?.proposal;
        if (!msg || p?.action_type !== 'RUN_PLAN' || msg.status === 'working' || runningPlanRef.current) return;
        const uid = depsRef.current.session?.user?.id;
        if (!uid) { fail(messageId, 'Please sign in again, then press "Do it all".'); return; }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { fail(messageId, 'You are offline. Reconnect, then press "Do it all" again.'); return; }
        if (stepsNeedingJob(steps).length) return; // the card asks for a job first
        runningPlanRef.current = true;
        chat.updateMessage(messageId, { status: 'working' });

        const facts = p.sample_data ? undefined : userText(chat.messages);
        const numbers = new Map<FormType, Set<string>>();
        const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
        const planError = (err: unknown, fallback: string): PlanStepError => {
            if (err instanceof PlanStepError) return err;
            const message = (err as { message?: string })?.message || fallback;
            // DB triggers raise "PLAN_LIMIT: …"; CORE's job pre-check throws "…Free plan job limit…".
            const limit = /PLAN_LIMIT|free plan|upgrade/i.test(message);
            return new PlanStepError(message, limit ? 'PLAN_LIMIT' : (err as { code?: string })?.code);
        };
        const jobRecord = (j: Job): PlanJobRecord => ({
            id: j.id, name: j.name, clientName: j.clientName, clientAddress: j.clientAddress, clientId: (j as Job & { clientId?: string }).clientId ?? null,
        });
        /** Numbers already used for this type: loaded documents + the database (same lookup as the forms) + this run. */
        const numbersFor = async (formType: FormType): Promise<Set<string>> => {
            const cached = numbers.get(formType);
            if (cached) return cached;
            const set = new Set<string>();
            const cfg = DOC_NUMBER_CONFIG[formType];
            if (cfg) {
                for (const f of depsRef.current.forms) {
                    const n = f.type === formType ? (f.data as unknown as Record<string, unknown>)?.[cfg.field] : null;
                    if (typeof n === 'string' && n) set.add(n.toUpperCase());
                }
                const { data } = await supabase.from('documents').select(`num:data->>${cfg.field}`).eq('type', formType)
                    .order('created_at', { ascending: false }).limit(1000);
                for (const r of (data || []) as Array<{ num?: unknown }>) if (typeof r?.num === 'string' && r.num) set.add(r.num.toUpperCase());
            }
            numbers.set(formType, set);
            return set;
        };

        /** Clients created during this run (App's list refreshes only at the end). */
        const newClients = new Map<string, { id: string; name: string; address: string }>();
        const io: PlanIO = {
            async createClient(entity) {
                const name = str(entity.name);
                const key = name.toLowerCase();
                const known = depsRef.current.clients.find(c => c.name.trim().toLowerCase() === key);
                const existing = known ? { id: known.id, name: known.name, address: known.address || '' } : newClients.get(key);
                if (existing) return { client: existing, reused: true };
                try {
                    const row = await insertClient({ name, email: str(entity.email), phone: str(entity.phone), address: str(entity.address), notes: str(entity.notes) }, uid);
                    const client = { id: row.id, name: row.name, address: row.address || '' };
                    newClients.set(key, client);
                    return { client };
                } catch (err) { throw planError(err, `Could not add ${name}.`); }
            },
            async createJob({ entity, client }) {
                const d = depsRef.current;
                const name = str(entity.name);
                const values = {
                    name,
                    clientName: client?.name || str(entity.client_name) || undefined,
                    clientAddress: str(entity.address) || client?.address || undefined,
                    startDate: str(entity.start_date) || undefined,
                    clientId: client?.id || undefined,
                };
                try {
                    if (d.createJob) {
                        const id = await d.createJob(values);
                        return { id, name, clientName: values.clientName, clientAddress: values.clientAddress, clientId: values.clientId ?? null };
                    }
                    const row: Record<string, unknown> = {
                        id: crypto.randomUUID(), user_id: uid, name, client_name: values.clientName || null, client_address: values.clientAddress || null,
                        start_date: values.startDate || toLocalYmd(), end_date: null, status: 'active', ...(values.clientId ? { client_id: values.clientId } : {}),
                    };
                    const { error } = await withSchemaFallback(row, r => supabase.from('jobs').insert(r));
                    if (error) throw error;
                    return { id: String(row.id), name, clientName: values.clientName, clientAddress: values.clientAddress, clientId: values.clientId ?? null };
                } catch (err) { throw planError(err, `Could not create the job ${name}.`); }
            },
            getJob(id) {
                const j = depsRef.current.jobs.find(x => x.id === id);
                return j ? jobRecord(j) : null;
            },
            getClient(id) {
                const c = depsRef.current.clients.find(x => x.id === id);
                return c ? { id: c.id, name: c.name, address: c.address || '' } : null;
            },
            async saveDocument({ step, docType, job, client }) {
                const d = depsRef.current;
                const formType = formTypeForDoc(docType);
                const taken = await numbersFor(formType);
                const known = d.jobs.find(j => j.id === job.id);
                const built = buildPlanDocument(docType, step.prefill, {
                    job: {
                        id: job.id, userId: uid, name: job.name, clientName: job.clientName || '', clientAddress: job.clientAddress || '',
                        startDate: known?.startDate || '', endDate: null, status: known?.status || 'active', workerName: known?.workerName,
                    },
                    client: client ? { id: client.id || undefined, name: client.name, address: client.address } : null,
                    clients: d.clients,
                    profile: d.profile,
                    existingNumbers: taken,
                    userText: facts,
                    today: toLocalYmd(),
                });
                if (built.number) taken.add(built.number.toUpperCase());
                const data = stripLightweightFlag(built.data);
                assertFullDocument({ data });
                const record: Record<string, unknown> = { id: crypto.randomUUID(), user_id: uid, job_id: job.id, type: built.formType, data };
                const clientId = client?.id || job.clientId || null;
                if (clientId) record.client_id = clientId;
                let { error } = await supabase.from('documents').insert(record);
                if (error && 'client_id' in record && isMissingColumnError(error)) {
                    delete record.client_id;
                    ({ error } = await supabase.from('documents').insert(record));
                }
                if (error) throw planError(error, `The ${built.formType.toLowerCase()} could not be saved.`);
                primeDocumentCache(mapDocumentRow({ ...record, created_at: new Date().toISOString() }, true));
                return { id: String(record.id), label: built.label, link: `/jobs/${job.id}/forms/${encodeURIComponent(built.formType)}/${record.id}` };
            },
            async addInventory(entity) {
                const name = str(entity.name);
                const row = {
                    id: crypto.randomUUID(), user_id: uid, name, quantity: Math.max(0, num(entity.quantity) ?? 0), category: str(entity.category) || null,
                    unit: str(entity.unit) || 'pcs', cost_price: Math.max(0, num(entity.cost) ?? num(entity.price) ?? 0), supplier: str(entity.supplier) || null,
                    sku: null, location: null, low_stock_threshold: 5, is_assembly: false, assembly_items: [],
                };
                const { error } = await withSchemaFallback(row, r => supabase.from('inventory').insert(r));
                if (error) throw planError(error, `Could not add ${name} to inventory.`);
                return { label: name };
            },
            async addPriceBookItem(entity) {
                const name = str(entity.name);
                const row = {
                    id: crypto.randomUUID(), user_id: uid, name, description: str(entity.description) || null, sku: null, category: str(entity.category) || 'General',
                    type: 'service', unit: str(entity.unit) || null, taxable: true, rate: Math.max(0, num(entity.price) ?? 0), unit_cost: Math.max(0, num(entity.cost) ?? 0),
                    markup: 0, images: [], is_assembly: false, assembly_items: [],
                };
                const { error } = await withSchemaFallback(row, r => supabase.from('saved_items').insert(r));
                if (error) throw planError(error, `Could not add ${name} to the price book.`);
                return { label: name };
            },
            async restock(itemId, delta) {
                const item = (depsRef.current.inventory || []).find(i => i.id === itemId);
                const { error } = await supabase.rpc('adjust_inventory', { p_item_id: itemId, p_delta: delta, p_reason: 'AI assistant', p_job_id: null });
                if (error) throw new PlanStepError(/insufficient/i.test(error.message) ? 'Not enough stock for that change.' : `Stock was not changed: ${error.message}`);
                return { label: `${item?.name || 'Item'} ${delta > 0 ? '+' : ''}${delta}` };
            },
            async updateJobStatus(job, status) {
                const d = depsRef.current;
                if (d.updateJobStatus && d.jobs.some(j => j.id === job.id)) { await d.updateJobStatus(job.id, status as Job['status']); return; }
                const { error } = await supabase.from('jobs').update({ status }).eq('id', job.id);
                if (error) throw planError(error, 'The job was not updated.');
            },
            onProgress(state) {
                chat.updateMessage(messageId, { planRun: state });
            },
        };

        try {
            const state = await runPlanSteps(steps, io, msg.planRun);
            const summary = summarizePlanRun(state, steps);
            chat.updateMessage(messageId, { status: 'done', planRun: state, result: summary.text });
        } catch (err) {
            // runPlan never throws; this is only a safety net.
            fail(messageId, err instanceof Error ? err.message : 'The plan stopped unexpectedly. Please try again.');
        } finally {
            runningPlanRef.current = false;
            depsRef.current.refreshData?.();
        }
    }, [chat, fail, userText]);

    /** Opens a page from a card link (closes the panel). */
    const openLink = useCallback((route: string) => {
        if (!route.startsWith('/')) return;
        setIsOpen(false);
        navigate(route);
    }, [navigate]);

    const upgrade = useCallback(() => {
        dispatchUpgradeEvent(chat.error?.message || 'Upgrade to keep using the AI assistant this month.');
    }, [chat.error]);

    /** Plan step hit a plan limit: close the panel so the upgrade window is visible, then open it. */
    const upgradeFor = useCallback((message: string) => {
        setIsOpen(false);
        dispatchUpgradeEvent(message || 'Upgrade your plan to create more.');
    }, []);

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
        runPlan,
        openLink,
        dismiss,
        upgrade,
        upgradeFor,
        data: { clients: deps.clients, forms: deps.forms, jobs: deps.jobs, profile: deps.profile, inventory: deps.inventory || [] },
    };
}

export type AIAssistant = ReturnType<typeof useAIAssistant>;
