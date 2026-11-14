import React, { useEffect, useRef, useState } from 'react';
import {
    AlertTriangleIcon, BriefcaseIcon, ClockIcon, PlusIcon, SparklesIcon, StarIcon, TrashIcon, XCircleIcon,
} from '../../../components/Icons.tsx';
import AIChatMentionInput from '../../../components/AIChatMentionInput.tsx';
import type { AIAssistant } from '../../hooks/useAIAssistant.ts';
import type { AIConversation } from '../../hooks/useMasterAIRouter.ts';
import { LabelText, ProposalCard } from './ProposalCards.tsx';
import { isAiLimitCode } from '../events.ts';
import { BuyCreditsButton } from '../../../components/billing/AICredits.tsx';

const DASHBOARD_SUGGESTIONS = [
    'Draft today’s daily report: ',
    'Invoice for 2 doors at $450 and 6 hours labor at $75',
    'Email the latest invoice to @',
    'How do I get paid online?',
];
const JOB_SUGGESTIONS = [
    'Daily report: ',
    'Estimate for ',
    'Change order: add ',
    'Material log: 20 studs at $8 from ',
];

const TypingDots = () => (
    <div className="flex justify-start" aria-live="polite" aria-label="The assistant is typing">
        <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
            {[0, 1, 2].map(i => (
                <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
        </div>
    </div>
);

const HistoryList: React.FC<{
    loading: boolean;
    items: AIConversation[];
    activeId: string | null;
    onOpen: (c: AIConversation) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}> = ({ loading, items, activeId, onOpen, onDelete, onClose }) => {
    const [confirmId, setConfirmId] = useState<string | null>(null);
    return (
        <div className="absolute inset-0 z-20 flex flex-col bg-card animate-fade-in">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">Past chats</p>
                <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-primary hover:bg-muted">Back to chat</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {loading && [0, 1, 2].map(i => <div key={i} className="skeleton m-2 h-12" />)}
                {!loading && items.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                        <ClockIcon className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Your conversations will appear here.</p>
                    </div>
                )}
                {!loading && items.map(chat => (
                    <div key={chat.id} className={`flex items-center gap-1 rounded-xl ${chat.id === activeId ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                        <button type="button" onClick={() => onOpen(chat)} className="min-h-[48px] min-w-0 flex-1 px-3 py-2 text-left">
                            <span className="block truncate text-sm font-medium text-foreground">{chat.title}</span>
                            <span className="block text-xs text-muted-foreground">{chat.created_at ? new Date(chat.created_at).toLocaleDateString() : ''}</span>
                        </button>
                        {confirmId === chat.id ? (
                            <div className="flex items-center gap-1 pr-2">
                                <button type="button" onClick={() => { onDelete(chat.id); setConfirmId(null); }} className="h-9 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground">Delete</button>
                                <button type="button" onClick={() => setConfirmId(null)} className="h-9 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted">Keep</button>
                            </div>
                        ) : (
                            <button type="button" aria-label="Delete chat" onClick={() => setConfirmId(chat.id)} className="mr-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive">
                                <TrashIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

/**
 * The single assistant panel (dashboard and job context). Full-screen sheet on phones,
 * right-hand drawer on larger screens. Uses design tokens only, so dark mode follows the theme.
 */
export const AssistantPanel: React.FC<{ assistant: AIAssistant }> = ({ assistant }) => {
    const { chat, isOpen, mode, job } = assistant;
    const [showHistory, setShowHistory] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const closeRef = useRef(assistant.close);
    closeRef.current = assistant.close;
    useEffect(() => {
        if (!isOpen) { setShowHistory(false); return; }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [isOpen, chat.messages.length, chat.isProcessing]);

    if (!isOpen) return null;

    // Phones: no keyboard popping up over the panel the moment it opens (tap the box to type).
    const finePointer = typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(pointer: fine)').matches;

    const openHistory = async () => {
        setShowHistory(true);
        setHistoryLoading(true);
        await chat.fetchHistory();
        setHistoryLoading(false);
    };
    const suggestions = mode === 'job' ? JOB_SUGGESTIONS : DASHBOARD_SUGGESTIONS;
    const empty = chat.messages.length === 0 && !chat.isProcessing;
    const err = chat.error;

    return (
        <div className="fixed inset-0 z-[200] flex justify-end" role="dialog" aria-modal="true" aria-label="AI assistant">
            <div className="absolute inset-0 hidden bg-black/40 backdrop-blur-[2px] animate-fade-in md:block" onClick={assistant.close} />
            {/* Rainbow frame = the AI Command button's gradient (index.css .ai-panel-frame): top edge on phones, border on larger screens. */}
            <div
                ref={panelRef}
                className="ai-panel-frame h-[100dvh] w-full animate-fade-in md:my-3 md:mr-3 md:h-[calc(100dvh-1.5rem)] md:w-[460px]"
            >
              <div className="ai-panel-frame-inner">
                {/* Header */}
                <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
                        <SparklesIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-[15px] font-semibold leading-5">AI Assistant</h2>
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            {mode === 'job' && job ? <><BriefcaseIcon className="h-3.5 w-3.5" /> {job.name}</> : 'Documents, emails and your whole account'}
                        </p>
                    </div>
                    {chat.canPersist && (
                        <button type="button" onClick={openHistory} aria-label="Past chats" title="Past chats" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                            <ClockIcon className="h-5 w-5" />
                        </button>
                    )}
                    <button type="button" onClick={() => { chat.newChat(); setShowHistory(false); }} aria-label="New chat" title="New chat" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                        <PlusIcon className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={assistant.close} aria-label="Close assistant" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                        <XCircleIcon className="h-5 w-5" />
                    </button>
                </header>

                <div className="relative flex min-h-0 flex-1 flex-col">
                    {showHistory && (
                        <HistoryList
                            loading={historyLoading}
                            items={chat.historyList}
                            activeId={chat.currentChatId}
                            onOpen={c => { chat.loadConversation(c); setShowHistory(false); }}
                            onDelete={id => { void chat.deleteConversation(id); }}
                            onClose={() => setShowHistory(false)}
                        />
                    )}

                    {/* Messages */}
                    <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
                        {empty && (
                            <div className="mx-auto flex max-w-sm flex-col items-center px-2 pt-8 text-center">
                                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                    <SparklesIcon className="h-7 w-7" />
                                </span>
                                <p className="text-base font-semibold">{mode === 'job' && job ? `What do you need for ${job.name}?` : 'What can I do for you?'}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    I draft documents from your notes, prepare emails with your documents, run tasks and explain how anything in the app works — you review everything before it is saved or sent.
                                </p>
                                <div className="mt-5 flex w-full flex-col gap-2">
                                    {suggestions.map(s => (
                                        <button key={s} type="button" onClick={() => assistant.setComposerText(s)}
                                            className="min-h-[44px] rounded-xl border border-border bg-card px-4 py-2.5 text-left text-sm text-foreground transition hover:border-primary/40 hover:bg-primary/5">
                                            {s.trim().replace(/[:@]$/, '…')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {chat.messages.map(m => (
                            <div key={m.id} className="space-y-2">
                                <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[88%] whitespace-pre-line break-words rounded-2xl px-4 py-2.5 text-[14px] leading-6 ${m.role === 'user'
                                        ? 'rounded-br-md bg-primary text-primary-foreground'
                                        : m.isError
                                            ? 'rounded-bl-md border border-destructive/30 bg-destructive/10 text-foreground'
                                            : 'rounded-bl-md bg-muted text-foreground'}`}>
                                        {m.isError && <AlertTriangleIcon className="mr-1.5 inline h-4 w-4 -translate-y-px text-destructive" />}
                                        {m.role === 'assistant' ? <LabelText text={m.content} /> : m.content}
                                    </div>
                                </div>
                                {m.role === 'assistant' && m.proposal && <ProposalCard message={m} assistant={assistant} />}
                            </div>
                        ))}

                        {chat.isProcessing && <TypingDots />}

                        {isAiLimitCode(err?.code) && (
                            <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
                                <p className="text-sm font-semibold">You have reached this month’s AI limit</p>
                                <p className="mt-1 text-[13px] text-muted-foreground">{err!.message}</p>
                                <div className="mt-3 flex flex-wrap items-start gap-2">
                                    <button type="button" onClick={assistant.upgrade} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
                                        <StarIcon className="h-4 w-4" /> See plans
                                    </button>
                                    {/* AI credits on and used up: buy a pack right here */}
                                    {err!.code === 'CREDITS_EMPTY' && <BuyCreditsButton />}
                                </div>
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>

                    {/* Composer */}
                    <div className="border-t border-border bg-card px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
                        <AIChatMentionInput
                            value={assistant.composerText}
                            onChange={assistant.setComposerText}
                            onSubmit={({ text, mentions, images }) => { void assistant.send(text, { mentions, images }); }}
                            clients={assistant.data.clients}
                            forms={assistant.data.forms}
                            jobId={mode === 'job' && job ? job.id : undefined}
                            disabled={chat.isProcessing}
                            autoFocus={finePointer}
                            placeholder={mode === 'job' ? 'Describe the work, or ask for a document…' : 'Ask anything… @ for a client, # for a document'}
                        />
                    </div>
                </div>
              </div>
            </div>
        </div>
    );
};

export default AssistantPanel;
