/**
 * One AI chat session (dashboard or one job): message list, request to `ai-assistant`,
 * cancellation, chat history persistence. It never executes actions — see useAIAssistant.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase.ts';
import type { Client, Job } from '../../types.ts';
import { parseSetupFieldsFromPrompt } from '../../utils/parseDocumentSetup.ts';
import { detectNavigation, mockModelOutput } from '../../supabase/functions/ai-assistant/shared/mockModel.ts';
import type { PlanRunState } from '../ai/planRunner.ts';
import {
    buildProposal, sanitizeRequest,
    type RouterImage, type RouterProposal, type RouterRequestContext, type RouterResponse,
} from '../../supabase/functions/ai-assistant/shared/routerContract.ts';

export { DOC_TYPE_TO_FORM_TYPE } from '../config/docTypeMap.ts';
export type { MasterDocumentType } from '../config/docTypeMap.ts';
export type { RouterProposal } from '../../supabase/functions/ai-assistant/shared/routerContract.ts';

export type ProposalStatus = 'pending' | 'working' | 'done' | 'dismissed';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    proposal?: RouterProposal;
    status?: ProposalStatus;
    /** Short outcome shown on a finished card ("Opened in the editor", "2 emails sent"). */
    result?: string;
    isError?: boolean;
    /** RUN_PLAN: per-step progress and the records created so far (kept for "Retry"). */
    planRun?: PlanRunState;
}

export interface AIError {
    message: string;
    code: string;
}

export interface AIConversation {
    id: string;
    title: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    created_at: string;
}

export interface SendOptions {
    context: RouterRequestContext;
    images?: RouterImage[];
    /** What the chat shows for the user turn (defaults to the message). */
    displayText?: string;
}

export interface UseMasterAIRouterOptions {
    scope: 'dashboard' | 'job';
    scopeId?: string | null;
    userId?: string | null;
}

/** Device pointer value meaning "the user started a new chat" (vs. no pointer = reopen the latest chat). */
const NEW_CHAT_MARKER = 'new';

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`);

const normalizeEntityName = (value: unknown): string => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Picks the job a dashboard document request refers to, or undefined when it is ambiguous.
 * Never falls back to "the first active job" (AI-008 / CORE-013).
 */
export function resolveJobForDocumentRequest(
    text: string,
    jobs: Job[],
    clients: Client[],
    setup: Record<string, unknown> = {},
): Job | undefined {
    const parsed = parseSetupFieldsFromPrompt(text, null, clients);
    const normalizedText = normalizeEntityName(text);
    const namedJobClients = Array.from(new Set(jobs.map(job => job.clientName).filter(name => {
        const n = normalizeEntityName(name);
        return n.length >= 3 && ` ${normalizedText} `.includes(` ${n} `);
    })));
    const requestedClientId = String(setup.clientId || parsed.clientId || '').trim();
    const requestedClientName = normalizeEntityName(setup.clientName || parsed.clientName);
    const requestedProjectName = normalizeEntityName(setup.projectName || parsed.projectName);
    const requestedClient = requestedClientId
        ? clients.find(c => c.id === requestedClientId)
        : clients.find(c => normalizeEntityName(c.name) === requestedClientName);
    const effectiveClientName = namedJobClients.length === 1
        ? normalizeEntityName(namedJobClients[0])
        : requestedClientName || normalizeEntityName(requestedClient?.name);
    const matches = (job: Job): boolean => {
        if (requestedProjectName && normalizeEntityName(job.name) !== requestedProjectName) return false;
        if (effectiveClientName && normalizeEntityName(job.clientName) !== effectiveClientName) return false;
        return true;
    };
    const providedJobId = String(setup.jobId || '').trim();
    if (providedJobId) {
        const provided = jobs.find(j => j.id === providedJobId);
        if (provided && matches(provided)) return provided;
    }
    const namedJobs = jobs.filter(job => {
        const n = normalizeEntityName(job.name);
        return n.length >= 3 && ` ${normalizedText} `.includes(` ${n} `);
    });
    if (namedJobs.length === 1 && matches(namedJobs[0])) return namedJobs[0];
    if (requestedProjectName) {
        const byProject = jobs.filter(matches);
        if (byProject.length === 1) return byProject[0];
    }
    if (effectiveClientName) {
        const byClient = jobs.filter(job => normalizeEntityName(job.clientName) === effectiveClientName);
        if (byClient.length === 1) return byClient[0];
    }
    return undefined;
}

/**
 * Offline fallback: only harmless navigation, and only when the AI service is unreachable.
 * Documents are never guessed by regex any more (AI-017).
 */
export function clientSideHeuristicRouter(input: string): RouterProposal | null {
    const route = detectNavigation(input);
    if (!route) return null;
    return { action_type: 'NAVIGATE_TO', route, reply_text: 'The AI service is not reachable right now, but I can open that page for you.' };
}

/** Same pipeline the server runs with AI_PROVIDER=mock (tests / dev harness). */
export function runLocalMockRouter(message: string, scope: 'dashboard' | 'job' | 'form', context: RouterRequestContext): RouterProposal {
    const request = sanitizeRequest({ message, scope, context });
    return buildProposal(mockModelOutput(request), { request });
}

/** A failed `ai-assistant` call → a user-facing message and code (also used by the job photo AI tasks). */
export async function readFunctionError(error: unknown): Promise<AIError> {
    if (error instanceof FunctionsHttpError) {
        const res = (error as unknown as { context?: Response }).context;
        const status = res?.status || 0;
        let body: { error?: string; code?: string } | null = null;
        try { body = res ? await res.clone().json() : null; } catch { body = null; }
        const code = body?.code || (status === 401 ? 'UNAUTHORIZED' : status === 402 ? 'PLAN_LIMIT' : status === 429 ? 'RATE_LIMITED' : status === 503 ? 'AI_BUSY' : status >= 500 ? 'AI_UPSTREAM' : 'ERROR');
        // The server's message is already user-facing; without one, never show a raw status code.
        const message = body?.error
            || (status === 401 ? 'Your session has expired. Please sign in again.'
                : status === 503 || status === 429 ? 'The AI is busy right now. Please try again in a minute.'
                    : 'The AI assistant could not answer. Please try again.');
        return { code, message: message.replace(/^PLAN_LIMIT:\s*/, '') };
    }
    if (error instanceof FunctionsRelayError) return { code: 'AI_UPSTREAM', message: 'The AI service is not reachable right now. Please try again in a moment.' };
    if (error instanceof FunctionsFetchError) return { code: 'NETWORK', message: 'You appear to be offline, or the AI service is unreachable. Please try again.' };
    return { code: 'ERROR', message: error instanceof Error ? error.message : 'The AI assistant could not answer. Please try again.' };
}

export function useMasterAIRouter({ scope, scopeId = null, userId = null }: UseMasterAIRouterOptions) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<AIError | null>(null);
    const [historyList, setHistoryList] = useState<AIConversation[]>([]);
    const [currentChatId, setCurrentChatId] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const messagesRef = useRef<ChatMessage[]>([]);
    const chatIdRef = useRef<string | null>(null);

    // Key names match lib/account.ts clearUserBrowserStorage() so they are wiped on logout.
    const storageKey = scope === 'job' ? (scopeId ? `active_job_ai_chat_${scopeId}` : null) : 'active_ai_chat_id';
    const canPersist = Boolean(userId && (scope === 'dashboard' || scopeId));

    const fetchHistory = useCallback(async (): Promise<AIConversation[]> => {
        if (!canPersist) { setHistoryList([]); return []; }
        let query = supabase.from('ai_chat_history').select('id, title, messages, created_at, scope, scope_id')
            .eq('user_id', userId as string).order('created_at', { ascending: false }).limit(30);
        query = scope === 'job' ? query.eq('scope', 'job').eq('scope_id', scopeId as string) : query.or('scope.is.null,scope.eq.dashboard');
        let { data, error: err } = await query;
        if (err) {
            // Older schema without scope columns: fall back to the title prefix.
            const fallback = await supabase.from('ai_chat_history').select('id, title, messages, created_at')
                .eq('user_id', userId as string).order('created_at', { ascending: false }).limit(30);
            data = (fallback.data || []).filter((c: { title?: string }) => scope === 'job'
                ? c.title?.startsWith(`[JOB:${scopeId}]`)
                : !c.title?.startsWith('[JOB:')) as typeof data;
        }
        const list = (data || []).map((c: Record<string, unknown>) => ({
            id: String(c.id),
            title: String(c.title || 'Chat').replace(/^\[JOB:[^\]]+\]\s*/, ''),
            messages: Array.isArray(c.messages) ? c.messages as AIConversation['messages'] : [],
            created_at: String(c.created_at || ''),
        }));
        setHistoryList(list);
        return list;
    }, [canPersist, scope, scopeId, userId]);

    // Restore the last open chat of this scope (once per scope id).
    useEffect(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        messagesRef.current = [];
        chatIdRef.current = null;
        setMessages([]);
        setError(null);
        setCurrentChatId(null);
        setHistoryList([]);
        if (!canPersist || !storageKey) return;
        let saved: string | null = null;
        try { saved = localStorage.getItem(storageKey); } catch { saved = null; }
        // The user chose "New chat" on this device: start empty.
        if (saved === NEW_CHAT_MARKER) return;
        let cancelled = false;
        // No device pointer (after logout, on another device): reopen this scope's most recent chat from the account.
        let latest = supabase.from('ai_chat_history').select('id, messages').eq('user_id', userId as string);
        latest = scope === 'job' ? latest.eq('scope', 'job').eq('scope_id', scopeId as string) : latest.or('scope.is.null,scope.eq.dashboard');
        const request = saved
            ? supabase.from('ai_chat_history').select('id, messages').eq('id', saved).eq('user_id', userId as string).maybeSingle()
            : latest.order('updated_at', { ascending: false }).limit(1).maybeSingle();
        request
            .then(({ data }) => {
                if (cancelled || !data || messagesRef.current.length) return;
                if (!saved) { try { localStorage.setItem(storageKey, String(data.id)); } catch { /* ignore */ } }
                const restored: ChatMessage[] = (Array.isArray(data.messages) ? data.messages : []).map((m: { role: string; content: string }) => ({
                    id: newId(), role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || ''),
                }));
                chatIdRef.current = String(data.id);
                messagesRef.current = restored;
                setCurrentChatId(String(data.id));
                setMessages(restored);
            });
        return () => { cancelled = true; };
    }, [canPersist, storageKey, userId, scope, scopeId]);

    const persist = useCallback(async (list: ChatMessage[]) => {
        if (!canPersist) return;
        const isNew = !chatIdRef.current;
        const id = chatIdRef.current || newId();
        chatIdRef.current = id; // reserve now so two quick saves never create two rows
        const firstUser = list.find(m => m.role === 'user')?.content || 'New chat';
        const title = firstUser.length > 60 ? `${firstUser.slice(0, 57)}…` : firstUser;
        const { error: err } = await supabase.from('ai_chat_history').upsert({
            id,
            user_id: userId,
            title,
            messages: list.filter(m => !m.isError).slice(-60).map(m => ({ role: m.role, content: m.content })),
            scope,
            scope_id: scope === 'job' ? scopeId : null,
        });
        if (!isNew) return;
        if (err) { if (chatIdRef.current === id) chatIdRef.current = null; return; }
        setCurrentChatId(id);
        try { if (storageKey) localStorage.setItem(storageKey, id); } catch { /* ignore */ }
    }, [canPersist, scope, scopeId, storageKey, userId]);

    /** All message changes go through here (the ref is the source of truth, no side effects in updaters). */
    const updateMessages = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[], save = false) => {
        const next = updater(messagesRef.current);
        messagesRef.current = next;
        setMessages(next);
        if (save) void persist(next);
    }, [persist]);

    const updateMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
        updateMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
    }, [updateMessages]);

    /** Adds turns produced locally (setup card, action results) without calling the AI. */
    const appendMessages = useCallback((add: Array<Omit<ChatMessage, 'id'>>) => {
        updateMessages(prev => [...prev, ...add.map(m => ({ ...m, id: newId() }))], true);
    }, [updateMessages]);

    const send = useCallback(async (message: string, options: SendOptions): Promise<{ proposal: RouterProposal | null; userMessageId: string; replyMessageId?: string }> => {
        const text = message.trim();
        const userMessageId = newId();
        if ((!text && !options.images?.length) || abortRef.current) return { proposal: null, userMessageId };
        const prior = messagesRef.current;
        const history = prior.filter(m => !m.isError && m.content.trim()).slice(-12).map(m => ({ role: m.role, text: m.content.slice(0, 2000) }));
        const userMsg: ChatMessage = { id: userMessageId, role: 'user', content: options.displayText || text || 'Sent photos' };
        updateMessages(prev => [...prev, userMsg]);
        setError(null);
        setIsProcessing(true);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const { data, error: fnError } = await supabase.functions.invoke<RouterResponse>('ai-assistant', {
                body: { message: text, scope, history, context: options.context, images: options.images || [] },
                signal: controller.signal,
                timeout: 130_000,
            });
            if (controller.signal.aborted) return { proposal: null, userMessageId };
            if (fnError) throw fnError;
            const proposal = data?.proposal;
            if (!data?.ok || !proposal || typeof proposal.action_type !== 'string') {
                throw Object.assign(new Error('The AI returned an unexpected answer. Please try again.'), { code: 'AI_BAD_OUTPUT' });
            }
            const reply: ChatMessage = {
                id: newId(), role: 'assistant', content: proposal.reply_text || 'Done.', proposal,
                status: proposal.action_type === 'CHAT' ? undefined : 'pending',
            };
            updateMessages(prev => [...prev, reply], true);
            return { proposal, userMessageId, replyMessageId: reply.id };
        } catch (err) {
            if (controller.signal.aborted) return { proposal: null, userMessageId };
            const info = (err as { code?: string }).code
                ? { code: String((err as { code?: string }).code), message: (err as Error).message }
                : await readFunctionError(err);
            const offline = ['NETWORK', 'AI_UPSTREAM', 'AI_UNAVAILABLE', 'AI_TIMEOUT', 'AI_BUSY', 'USAGE_UNAVAILABLE', 'NOT_CONFIGURED'].includes(info.code);
            const local = offline ? clientSideHeuristicRouter(text) : null;
            if (local) {
                const replyMessageId = newId();
                updateMessages(prev => [...prev, { id: replyMessageId, role: 'assistant', content: local.reply_text, proposal: local, status: 'pending' }], true);
                return { proposal: local, userMessageId, replyMessageId };
            }
            setError(info);
            updateMessages(prev => [...prev, { id: newId(), role: 'assistant', content: info.message, isError: true }]);
            return { proposal: null, userMessageId };
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setIsProcessing(false);
        }
    }, [scope, updateMessages]);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsProcessing(false);
    }, []);

    const newChat = useCallback(() => {
        cancel();
        setMessages([]);
        messagesRef.current = [];
        setError(null);
        setCurrentChatId(null);
        chatIdRef.current = null;
        // Remember the choice so a reload doesn't reopen the latest chat (the chats themselves stay in the account).
        try { if (storageKey) localStorage.setItem(storageKey, NEW_CHAT_MARKER); } catch { /* ignore */ }
    }, [cancel, storageKey]);

    const loadConversation = useCallback((chat: AIConversation) => {
        cancel();
        setError(null);
        setCurrentChatId(chat.id);
        chatIdRef.current = chat.id;
        const list = chat.messages.map(m => ({ id: newId(), role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: String(m.content || '') }));
        messagesRef.current = list;
        setMessages(list);
        try { if (storageKey) localStorage.setItem(storageKey, chat.id); } catch { /* ignore */ }
    }, [cancel, storageKey]);

    const deleteConversation = useCallback(async (chatId: string) => {
        await supabase.from('ai_chat_history').delete().eq('id', chatId).eq('user_id', userId as string);
        if (chatIdRef.current === chatId) newChat();
        setHistoryList(prev => prev.filter(c => c.id !== chatId));
    }, [newChat, userId]);

    const clearError = useCallback(() => setError(null), []);

    return {
        messages, isProcessing, error, historyList, currentChatId, canPersist,
        send, cancel, newChat, fetchHistory, loadConversation, deleteConversation,
        updateMessage, appendMessages, clearError,
    };
}

export type MasterAIRouterSession = ReturnType<typeof useMasterAIRouter>;
