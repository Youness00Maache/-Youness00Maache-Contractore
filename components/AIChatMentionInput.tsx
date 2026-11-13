import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CameraIcon, SendIcon, XCircleIcon } from './Icons.tsx';
import AIVoiceInput from './AIVoiceInput.tsx';
import type { Client, FormData } from '../types.ts';
import {
    detectMentionTrigger, filterMentionOptions, insertMention,
    type MentionOption, type ResolvedMention,
} from '../utils/aiMentionUtils.ts';
import { MAX_AI_IMAGES, describeAttachmentError, prepareImage, type PendingImage } from '../src/ai/attachments.ts';

export interface ChatSubmit {
    text: string;
    mentions: ResolvedMention[];
    images: PendingImage[];
}

interface AIChatMentionInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (submit: ChatSubmit) => void;
    clients: Client[];
    forms: FormData[];
    /** Restrict #document suggestions to one job. */
    jobId?: string;
    placeholder?: string;
    disabled?: boolean;
    allowImages?: boolean;
    autoFocus?: boolean;
}

/**
 * Chat composer: @client / #document mentions (keyboard + touch), photo attachments
 * (compressed, max 3), continuous voice dictation and a visible Send button (AI-037).
 */
export const AIChatMentionInput: React.FC<AIChatMentionInputProps> = ({
    value, onChange, onSubmit, clients, forms, jobId, placeholder = 'Ask anything… use @ for a client, # for a document',
    disabled, allowImages = true, autoFocus,
}) => {
    const [mention, setMention] = useState<{ trigger: '@' | '#'; search: string } | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [resolved, setResolved] = useState<ResolvedMention[]>([]);
    const [images, setImages] = useState<PendingImage[]>([]);
    const [imageError, setImageError] = useState<string | null>(null);
    const [interim, setInterim] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const valueRef = useRef(value);
    valueRef.current = value;

    const options = useMemo<MentionOption[]>(
        () => (mention ? filterMentionOptions(mention.trigger, mention.search, clients, forms, jobId) : []),
        [mention, clients, forms, jobId],
    );

    // Auto-grow up to ~6 lines.
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [value, interim]);

    useEffect(() => {
        if (autoFocus && !disabled) textareaRef.current?.focus();
    }, [autoFocus, disabled]);

    const imagesRef = useRef(images);
    imagesRef.current = images;
    useEffect(() => () => imagesRef.current.forEach(img => URL.revokeObjectURL(img.previewUrl)), []);

    const updateMentionState = (text: string, cursor: number) => {
        const detected = detectMentionTrigger(text.substring(0, cursor));
        setMention(detected);
        setMentionIndex(0);
    };

    const choose = (option: MentionOption) => {
        const el = textareaRef.current;
        if (!el || !mention) return;
        const result = insertMention(value, el.selectionStart ?? value.length, mention.trigger, option, resolved);
        if (!result.tag) return;
        onChange(result.newText);
        setResolved(prev => [...prev.filter(m => m.tag !== result.resolved.tag), result.resolved]);
        setMention(null);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(result.cursor, result.cursor);
        });
    };

    const submit = () => {
        const text = value.trim();
        if (disabled || (!text && images.length === 0)) return;
        onSubmit({ text, mentions: resolved.filter(m => text.includes(m.tag)), images });
        setResolved([]);
        setImages([]);
        setMention(null);
        setImageError(null);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mention && options.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % options.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + options.length) % options.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(options[mentionIndex]); return; }
            if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
        }
    };

    const pickImages = async (files: FileList | null) => {
        if (!files?.length) return;
        setImageError(null);
        const room = MAX_AI_IMAGES - images.length;
        if (room <= 0) { setImageError(`You can attach up to ${MAX_AI_IMAGES} photos.`); return; }
        const picked: PendingImage[] = [];
        for (const file of Array.from(files).slice(0, room)) {
            try { picked.push(await prepareImage(file)); } catch (err) { setImageError(describeAttachmentError(err)); }
        }
        if (files.length > room) setImageError(`Only ${MAX_AI_IMAGES} photos can be attached.`);
        setImages(prev => [...prev, ...picked].slice(0, MAX_AI_IMAGES));
    };

    const appendDictation = (text: string) => {
        const current = valueRef.current;
        onChange(current + (current && !/\s$/.test(current) ? ' ' : '') + text);
    };

    const canSend = !disabled && (value.trim().length > 0 || images.length > 0);

    return (
        <div className="relative">
            {mention && options.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
                    <p className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {mention.trigger === '@' ? 'Clients' : 'Documents'}
                    </p>
                    <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
                        {options.map((opt, i) => (
                            <li key={`${opt.kind}-${opt.id}`} role="option" aria-selected={i === mentionIndex}>
                                <button
                                    type="button"
                                    onMouseDown={e => { e.preventDefault(); choose(opt); }}
                                    onMouseEnter={() => setMentionIndex(i)}
                                    className={`flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === mentionIndex ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted'}`}
                                >
                                    <span className="truncate font-medium">{opt.label}</span>
                                    {opt.detail && <span className="truncate text-xs text-muted-foreground">{opt.detail}</span>}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="rounded-2xl border border-input bg-card shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                {images.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-3 pt-3">
                        {images.map(img => (
                            <div key={img.id} className="relative h-14 w-14 overflow-hidden rounded-xl border border-border">
                                <img src={img.previewUrl} alt={img.name} className="h-full w-full object-cover" />
                                <button
                                    type="button"
                                    aria-label={`Remove ${img.name}`}
                                    onClick={() => { URL.revokeObjectURL(img.previewUrl); setImages(prev => prev.filter(x => x.id !== img.id)); }}
                                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 text-white"
                                >
                                    <XCircleIcon className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={value}
                    disabled={disabled}
                    placeholder={interim ? '' : placeholder}
                    aria-label="Message the AI assistant"
                    onChange={e => { onChange(e.target.value); updateMentionState(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
                    onClick={e => updateMentionState(value, (e.target as HTMLTextAreaElement).selectionStart ?? value.length)}
                    onKeyDown={onKeyDown}
                    className="block max-h-40 min-h-[48px] w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-6 text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-60"
                />
                {interim && <p className="px-4 pb-1 text-sm italic text-muted-foreground">{interim}…</p>}
                <div className="flex items-center gap-2 px-2 pb-2">
                    {allowImages && (
                        <>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                multiple
                                className="hidden"
                                onChange={e => { void pickImages(e.target.files); e.target.value = ''; }}
                            />
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                disabled={disabled || images.length >= MAX_AI_IMAGES}
                                aria-label="Attach photos"
                                title="Attach photos (up to 3)"
                                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                            >
                                <CameraIcon className="h-5 w-5" />
                            </button>
                        </>
                    )}
                    <AIVoiceInput variant="compact" disabled={disabled} onTranscript={appendDictation} onInterim={setInterim} />
                    <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
                        <kbd className="font-sans font-semibold">@</kbd> client · <kbd className="font-sans font-semibold">#</kbd> document · Shift+Enter for a new line
                    </p>
                    <span className="flex-1 sm:hidden" />
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSend}
                        aria-label="Send message"
                        className="inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[.98] disabled:opacity-40"
                    >
                        <SendIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Send</span>
                    </button>
                </div>
            </div>
            {imageError && <p className="mt-1.5 text-xs font-medium text-destructive">{imageError}</p>}
        </div>
    );
};

export default AIChatMentionInput;
