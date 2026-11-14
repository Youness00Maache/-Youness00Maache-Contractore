import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import AIVoiceInput from '../AIVoiceInput.tsx';
import {
    BoldIcon, CameraIcon, EditIcon, ExternalLinkIcon, HighlighterIcon, ItalicIcon, LinkIcon, RemoveFormatIcon, StrikethroughIcon, TextColorIcon,
    TrashIcon, UnderlineIcon, UploadImageIcon, XCircleIcon,
} from '../Icons.tsx';
import { assertUsableImage, compressImage, describeImageError, fileToDataUrl } from '../../utils/imageCompression.ts';
import { cleanPastedHtml, sanitizeEditorHtml } from './formUtils.ts';
import { NumberInput } from './Fields.tsx';
import { Spinner } from './Spinner.tsx';
import RichTextToolbar, {
    BlockMenuList, DEFAULT_HIGHLIGHT, EMPTY_ACTIVE, MOD, MenuButton, Swatches, TEXT_COLORS, ToolButton, blockItemsFor, preventFocusLoss,
    type Align, type BlockItem, type BlockStyle, type EditorActiveState, type EditorCommand, type EditorFeatures,
} from './RichTextToolbar.tsx';
import {
    changeIndent, checklistItemAt, checklistItemText, clearChecklist, closestIn, dropRedundantSpanStyles, getSelectionOffsets, hitsCheckbox, insertDivider, isChecklistItem,
    liftListsOutOfParagraphs, normalizeChecklists, openLinkSafely, placeCaretAfterBox, placeCaretAtEnd, separateFromChecklist, setSelectionOffsets, tableAddColumn, tableAddRow,
    tableDeleteRow, textStats, toggleChecklist, toggleChecklistItem, toSafeLink, unwrapElement, type TextOffsets,
} from './richTextDom.ts';
import { rememberOfflinePhoto } from '../../lib/offline/offlinePhotos.ts';

export interface RichTextEditorHandle {
    /** current sanitized HTML (use it right before saving / downloading) */
    getHtml: () => string;
    focus: () => void;
    /** inserts HTML at the caret (or at the end), as one undoable step */
    insertHtml: (html: string) => void;
}

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    onUploadImage?: (file: File) => Promise<string>;
    placeholder?: string;
    minHeight?: number;
    ariaLabel?: string;
    /** 'email': no photos/camera (embedded images don't survive email) and only fonts every device has. */
    mode?: 'document' | 'email';
    /** read-only while the parent is busy (e.g. sending) */
    disabled?: boolean;
}

const COLORS = ['#000000', '#374151', '#9ca3af', '#ffffff', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#db2777', '#fee2e2', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe', '#f3f4f6'];
const ALIGN_COMMAND: Record<Align, string> = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' };
const EMBEDDABLE = /^data:image\/(png|jpe?g|gif|webp);base64,/i;
const HISTORY_LIMIT = 150;
/** Markdown-style shortcuts typed at the start of a paragraph, then a space. */
const MARKDOWN: { re: RegExp; command: EditorCommand }[] = [
    { re: /^#$/, command: { type: 'block', value: 'h1' } },
    { re: /^##$/, command: { type: 'block', value: 'h2' } },
    { re: /^###$/, command: { type: 'block', value: 'h3' } },
    { re: /^[-*•]$/, command: { type: 'list', value: 'ul' } },
    { re: /^1[.)]$/, command: { type: 'list', value: 'ol' } },
    { re: /^\[\s?\]$/, command: { type: 'list', value: 'check' } },
    { re: /^>$/, command: { type: 'block', value: 'blockquote' } },
];
const SELECTION_BAR_W = 300;

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const exec = (command: string, value?: string): boolean => {
    try { return document.execCommand(command, false, value); } catch { return false; }
};
/** Colors, fonts and sizes as inline CSS (kept by both sanitizers); bold/italic/... stay semantic tags. */
const withCss = (fn: () => void) => {
    exec('styleWithCSS', 'true');
    try { fn(); } finally { exec('styleWithCSS', 'false'); }
};
const selectionInside = (el: HTMLElement | null): boolean => {
    const sel = window.getSelection();
    return Boolean(el && sel && sel.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer));
};
const isCoarsePointer = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** Puts the caret at `range`; a block left without text gets a <br> so the browser can keep editing it. */
const collapseInto = (range: Range, root: HTMLElement) => {
    const sel = window.getSelection();
    if (!sel) return;
    const block = closestIn<HTMLElement>(range.startContainer, 'p,h1,h2,h3,h4,h5,h6,blockquote,pre,li,td,th,div', root) || root;
    if (!(block.textContent || '').length && !block.querySelector('br,img,table,hr')) {
        block.innerHTML = '<br>';
        range.setStart(block, 0);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
};

type Snapshot = { html: string; sel: TextOffsets | null };
type SlashState = { node: Text; offset: number; query: string; index: number; top: number; left: number; above: boolean };

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
    <div className="modal-backdrop" onClick={onClose}>
        <div className={`modal-panel p-5 ${wide ? 'sm:max-w-2xl' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{title}</h3>
                <button type="button" className="btn btn-ghost h-10 w-10 p-0" onClick={onClose} aria-label="Close"><XCircleIcon className="h-5 w-5" /></button>
            </div>
            {children}
        </div>
    </div>
);

const miniButton = 'flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted';
const footerButton = 'flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4';

/** Block styles of the editing surface (the PDF has its own, see utils/templates/blocks.ts). */
const EDITOR_CSS = `
.cd-editor>:first-child{margin-top:0}
.cd-editor h1{font-size:1.65em;line-height:1.25;font-weight:700;letter-spacing:-.02em;margin:1.1em 0 .35em}
.cd-editor h2{font-size:1.32em;line-height:1.3;font-weight:700;letter-spacing:-.015em;margin:1em 0 .3em}
.cd-editor h3{font-size:1.1em;line-height:1.35;font-weight:600;margin:.9em 0 .25em}
.cd-editor h4{font-size:1em;font-weight:600;margin:.8em 0 .2em}
.cd-editor p{margin:.4em 0}
.cd-editor ul{list-style:disc;padding-left:1.5em;margin:.45em 0}
.cd-editor ol{list-style:decimal;padding-left:1.5em;margin:.45em 0}
.cd-editor ul ul{list-style-type:circle}
.cd-editor ol ol{list-style-type:lower-alpha}
.cd-editor li{margin:.2em 0;padding-left:.15em}
.cd-editor li::marker{color:hsl(var(--muted-foreground))}
.cd-editor ul[style*="list-style-type: none"]>li{padding-left:0;margin:.3em 0}
.cd-editor blockquote{margin:.8em 0;padding:.15em 0 .15em 1em;border-left:3px solid hsl(var(--primary)/.55);color:hsl(var(--foreground)/.75)}
.cd-editor pre{font-family:ui-monospace,monospace;font-size:.9em;white-space:pre-wrap;background:hsl(var(--muted));padding:.6em .8em;border-radius:8px}
.cd-editor code{font-family:ui-monospace,monospace;font-size:.9em;background:hsl(var(--muted));padding:.1em .35em;border-radius:5px}
.cd-editor a{color:hsl(var(--primary));text-decoration:underline;text-underline-offset:2px;text-decoration-color:hsl(var(--primary)/.45);cursor:pointer}
.cd-editor img{max-width:100%;height:auto;border-radius:10px}
.cd-editor table{max-width:100%;border-collapse:collapse;margin:.8em 0;font-size:.95em}
.cd-editor th,.cd-editor td{border:1px solid hsl(var(--border));padding:7px 10px;vertical-align:top}
.cd-editor th{font-weight:600;text-align:left}
.cd-editor hr{border:0;border-top:1px solid hsl(var(--border));margin:1.4em 0}
.cd-editor mark{background:#fef08a;color:inherit}
.dark .cd-editor tr[style*="background"],.dark .cd-editor th[style*="background"],.dark .cd-editor td[style*="background"],
.dark .cd-editor mark,.dark .cd-editor span[style*="background"]{color:#111827}
`;

/**
 * Rich text editor of the Daily Report and Note bodies and of emails (contentEditable + execCommand, no dependency).
 * - one-row toolbar (the rest in a "…" menu), a floating toolbar on selected text, "/" commands and markdown shortcuts
 * - own undo/redo history (also covers checklist, indent, link, image and table changes the browser can't undo)
 * - paragraph styles, B/I/U/S, colors, highlight, fonts/sizes, lists, checklists, indent, alignment
 * - links: add / edit / remove, open with a click on the link bubble or Ctrl/⌘+click
 * - photos: upload, camera, paste, drop; embedded as a compressed data URL when the upload fails or offline
 * - tables, horizontal line, clear formatting, clean paste from Word / Google Docs, word count, sticky toolbar, voice
 * Output is plain HTML kept by `sanitizeEditorHtml` and by the PDF sanitizer (`sanitizeRichText`).
 */
const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(({
    value, onChange, onUploadImage, placeholder = 'Start writing…', minHeight = 280, ariaLabel = 'Document body', mode = 'document', disabled = false,
}, ref) => {
    const features = useMemo<EditorFeatures>(() => ({ images: mode !== 'email', fonts: mode !== 'email' }), [mode]);
    const shellRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const lastEmitted = useRef<string>('');
    const savedRange = useRef<Range | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const [active, setActive] = useState<EditorActiveState>(EMPTY_ACTIVE);
    const [inTable, setInTable] = useState(false);
    const [isEmpty, setIsEmpty] = useState(!value);
    const [stats, setStats] = useState({ words: 0, chars: 0 });
    const [notice, setNotice] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
    const [uploading, setUploading] = useState(false);
    const [linkDialog, setLinkDialog] = useState<null | { url: string; text: string; askText: boolean; editing: boolean; error?: string }>(null);
    const linkTargetRef = useRef<HTMLAnchorElement | null>(null);
    const [tableOpen, setTableOpen] = useState(false);
    const [table, setTable] = useState({ rows: 3, cols: 3, border: '#d1d5db', header: '#f3f4f6' });
    const [cameraOpen, setCameraOpen] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
    const lastCellRef = useRef<HTMLElement | null>(null);
    const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
    const [bubble, setBubble] = useState<{ anchor: HTMLAnchorElement; top: number; left: number } | null>(null);
    const [selBar, setSelBar] = useState<{ top: number; left: number; below: boolean } | null>(null);
    const pointerDownRef = useRef(false);
    const [slash, setSlash] = useState<SlashState | null>(null);
    const slashRef = useRef<SlashState | null>(null);
    slashRef.current = slash;
    const [stickyTop, setStickyTop] = useState(0);
    const stickyTopRef = useRef(0);
    stickyTopRef.current = stickyTop;
    const [history, setHistory] = useState({ canUndo: false, canRedo: false });
    const historyRef = useRef<{ stack: Snapshot[]; index: number }>({ stack: [], index: -1 });
    const recordTimer = useRef<number | null>(null);

    // ---------------------------------------------------------------- content <-> parent
    const syncMeta = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        setIsEmpty(!el.textContent?.trim() && !el.querySelector('img,table,hr'));
        setStats(textStats(el));
    }, []);

    const emit = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        const html = el.innerHTML;
        lastEmitted.current = html;
        syncMeta();
        onChangeRef.current(html);
    }, [syncMeta]);

    // ---------------------------------------------------------------- history
    const syncHistory = useCallback(() => {
        const h = historyRef.current;
        setHistory({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
    }, []);

    const resetHistory = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        if (recordTimer.current !== null) window.clearTimeout(recordTimer.current);
        recordTimer.current = null;
        historyRef.current = { stack: [{ html: el.innerHTML, sel: null }], index: 0 };
        syncHistory();
    }, [syncHistory]);

    const record = useCallback(() => {
        if (recordTimer.current !== null) window.clearTimeout(recordTimer.current);
        recordTimer.current = null;
        const el = editorRef.current;
        if (!el) return;
        const h = historyRef.current;
        const html = el.innerHTML;
        const sel = getSelectionOffsets(el);
        const current = h.stack[h.index];
        if (current && current.html === html) {
            if (sel) current.sel = sel;
            return;
        }
        h.stack = h.stack.slice(0, h.index + 1);
        h.stack.push({ html, sel });
        if (h.stack.length > HISTORY_LIMIT) h.stack.shift();
        h.index = h.stack.length - 1;
        syncHistory();
    }, [syncHistory]);

    const scheduleRecord = useCallback(() => {
        if (recordTimer.current !== null) window.clearTimeout(recordTimer.current);
        recordTimer.current = window.setTimeout(record, 600);
    }, [record]);

    const flushRecord = useCallback(() => {
        if (recordTimer.current !== null) record();
    }, [record]);

    useEffect(() => () => { if (recordTimer.current !== null) window.clearTimeout(recordTimer.current); }, []);

    // ---------------------------------------------------------------- initial content + external updates (AI prefill)
    useEffect(() => {
        const el = editorRef.current;
        if (!el) return;
        const firstRun = historyRef.current.index < 0;
        if (!firstRun && value === lastEmitted.current) return;
        if (!firstRun && document.activeElement === el && lastEmitted.current) return;
        el.innerHTML = sanitizeEditorHtml(value || '');
        lastEmitted.current = value || '';
        syncMeta();
        resetHistory();
    }, [value, syncMeta, resetHistory]);


    // ---------------------------------------------------------------- selection
    const rememberSelection = useCallback(() => {
        const sel = window.getSelection();
        const el = editorRef.current;
        if (sel && sel.rangeCount && el && el.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
    }, []);

    /** Puts the focus and the selection back in the editor (where it was before a toolbar click or a dialog). */
    const restoreSelection = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        const inside = selectionInside(el);
        if (document.activeElement !== el) el.focus({ preventScroll: true });
        if (inside) return;
        const sel = window.getSelection();
        if (!sel) return;
        if (savedRange.current && el.contains(savedRange.current.startContainer)) {
            sel.removeAllRanges();
            sel.addRange(savedRange.current);
        } else {
            placeCaretAtEnd(el);
        }
    }, []);

    const refreshActive = useCallback(() => {
        const el = editorRef.current;
        const sel = window.getSelection();
        if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
        const q = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };
        const anchor = sel.anchorNode;
        const blockEl = closestIn(anchor, 'h1,h2,h3,blockquote', el);
        const listEl = closestIn(anchor, 'ul,ol', el);
        setActive({
            bold: q('bold'),
            italic: q('italic'),
            underline: q('underline'),
            strike: q('strikeThrough'),
            block: (blockEl?.tagName.toLowerCase() as BlockStyle) || 'p',
            list: checklistItemAt(anchor, el) ? 'check' : listEl ? (listEl.tagName === 'OL' ? 'ol' : 'ul') : null,
            align: q('justifyCenter') ? 'center' : q('justifyRight') ? 'right' : q('justifyFull') ? 'justify' : 'left',
            link: Boolean(closestIn(anchor, 'a', el)),
            highlight: Boolean(closestIn(anchor, 'mark,span[style*="background"],font[style*="background"]', el)),
        });
        setInTable(Boolean(closestIn(anchor, 'td,th', el)));
    }, []);

    const updateBubble = useCallback(() => {
        const el = editorRef.current;
        const wrap = wrapperRef.current;
        const sel = window.getSelection();
        const anchor = el && sel && sel.rangeCount && sel.isCollapsed ? closestIn<HTMLAnchorElement>(sel.anchorNode, 'a', el) : null;
        if (!anchor || !wrap) { setBubble(b => (b ? null : b)); return; }
        const r = anchor.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        setBubble({ anchor, top: Math.round(r.bottom - w.top + 6), left: Math.round(Math.max(0, Math.min(r.left - w.left, w.width - 300))) });
    }, []);

    /** Floating toolbar over (desktop) or under (touch, where the system menu sits above) the selected text. */
    const updateSelBar = useCallback(() => {
        const el = editorRef.current;
        const wrap = wrapperRef.current;
        const sel = window.getSelection();
        const hide = () => setSelBar(b => (b ? null : b));
        if (!el || !wrap || !sel || !sel.rangeCount || sel.isCollapsed || pointerDownRef.current || slashRef.current) return hide();
        if (document.activeElement !== el || !selectionInside(el) || !sel.toString().trim()) return hide();
        const range = sel.getRangeAt(0);
        let r = range.getBoundingClientRect();
        if (!r.width && !r.height) {
            const first = range.getClientRects()[0];
            if (!first) return hide();
            r = first;
        }
        const w = wrap.getBoundingClientRect();
        const below = isCoarsePointer() || r.top - 52 < Math.max(0, stickyTopRef.current) + 52;
        const center = r.left + r.width / 2;
        const minLeft = 8 - w.left;
        const maxLeft = window.innerWidth - 8 - SELECTION_BAR_W - w.left;
        const left = Math.round(Math.max(minLeft, Math.min(center - w.left - SELECTION_BAR_W / 2, maxLeft)));
        setSelBar({ top: Math.round(below ? r.bottom - w.top + 10 : r.top - w.top - 10), left, below });
    }, []);

    // ---------------------------------------------------------------- "/" commands
    const slashItems = useMemo(() => (slash ? blockItemsFor(features, slash.query, inTable) : []), [slash, features, inTable]);

    const openSlash = (node: Text, offset: number) => {
        const wrap = wrapperRef.current;
        if (!wrap) return;
        const r = document.createRange();
        r.setStart(node, offset);
        r.setEnd(node, offset + 1);
        const rect = r.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        const viewH = window.visualViewport?.height ?? window.innerHeight;
        const above = rect.bottom + 300 > viewH && rect.top > 320;
        setSlash({
            node, offset, query: '', index: 0, above,
            top: Math.round(above ? rect.top - w.top - 6 : rect.bottom - w.top + 6),
            left: Math.round(Math.max(0, Math.min(rect.left - w.left - 8, w.width - 260))),
        });
        setSelBar(null);
    };

    /** Keeps the "/" menu in sync with what was typed after the slash; closes it when the caret leaves. */
    const syncSlash = () => {
        const s = slashRef.current;
        if (!s) return;
        const el = editorRef.current;
        const sel = window.getSelection();
        const close = () => setSlash(null);
        if (!el || !sel || !sel.rangeCount || !sel.isCollapsed || !el.contains(s.node) || s.node.data[s.offset] !== '/') return close();
        if (sel.anchorNode !== s.node || sel.anchorOffset <= s.offset) return close();
        const query = s.node.data.slice(s.offset + 1, sel.anchorOffset);
        if (/^\s|\s\s|\n/.test(query) || query.length > 24) return close();
        if (/\s$/.test(query) && !blockItemsFor(features, query, inTable).length) return close();
        if (query !== s.query) setSlash({ ...s, query, index: 0 });
    };

    /** Removes "/query" and leaves the caret where the slash was. */
    const consumeSlash = (): boolean => {
        const s = slashRef.current;
        const el = editorRef.current;
        setSlash(null);
        if (!s || !el || !el.contains(s.node) || s.node.data[s.offset] !== '/') return false;
        const sel = window.getSelection();
        const end = sel && sel.anchorNode === s.node ? Math.max(sel.anchorOffset, s.offset + 1) : s.offset + 1 + s.query.length;
        const range = document.createRange();
        range.setStart(s.node, s.offset);
        range.setEnd(s.node, Math.min(end, s.node.length));
        range.deleteContents();
        collapseInto(range, el);
        rememberSelection();
        return true;
    };

    // ---------------------------------------------------------------- selection change
    const latestSync = useRef(syncSlash);
    latestSync.current = syncSlash;
    useEffect(() => {
        let timer = 0;
        const onSelectionChange = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                if (!selectionInside(editorRef.current)) { setSelBar(b => (b ? null : b)); return; }
                rememberSelection();
                refreshActive();
                updateBubble();
                updateSelBar();
                latestSync.current();
            }, 30);
        };
        const onPointerUp = () => {
            if (!pointerDownRef.current) return;
            pointerDownRef.current = false;
            window.setTimeout(updateSelBar, 10);
        };
        document.addEventListener('selectionchange', onSelectionChange);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        return () => {
            document.removeEventListener('selectionchange', onSelectionChange);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            window.clearTimeout(timer);
        };
    }, [rememberSelection, refreshActive, updateBubble, updateSelBar]);

    // ---------------------------------------------------------------- commands
    /** Runs one editing step: selection back in the editor, change, then save to history and to the parent. */
    const run = (fn: (el: HTMLDivElement) => void) => {
        const el = editorRef.current;
        if (!el || disabled) return;
        setNotice(null);
        flushRecord();
        restoreSelection();
        fn(el);
        liftListsOutOfParagraphs(el);
        normalizeChecklists(el);
        dropRedundantSpanStyles(el);
        emit();
        record();
        refreshActive();
        updateBubble();
        updateSelBar();
    };

    const travel = (step: 1 | -1) => {
        const el = editorRef.current;
        if (!el || disabled) return;
        flushRecord();
        const h = historyRef.current;
        const target = h.index + step;
        if (target < 0 || target >= h.stack.length) return;
        h.index = target;
        const snap = h.stack[target];
        el.innerHTML = snap.html;
        el.focus({ preventScroll: true });
        setSelectionOffsets(el, snap.sel);
        setSelectedEl(null);
        setBubble(null);
        setSlash(null);
        emit();
        syncHistory();
        refreshActive();
    };

    const openLinkDialog = () => {
        const el = editorRef.current;
        if (!el || disabled) return;
        restoreSelection();
        rememberSelection();
        const sel = window.getSelection();
        const anchor = closestIn<HTMLAnchorElement>(sel?.anchorNode, 'a', el);
        linkTargetRef.current = anchor;
        setBubble(null);
        setSelBar(null);
        if (anchor) {
            setLinkDialog({ url: anchor.getAttribute('href') || '', text: anchor.textContent || '', askText: true, editing: true });
            return;
        }
        const selected = sel && !sel.isCollapsed ? sel.toString() : '';
        setLinkDialog({ url: /^(https?:\/\/|www\.)\S+$/i.test(selected.trim()) ? selected.trim() : '', text: selected, askText: !selected.trim(), editing: false });
    };

    const applyLink = () => {
        const d = linkDialog;
        if (!d) return;
        const url = toSafeLink(d.url);
        if (!url) { setLinkDialog({ ...d, error: 'Enter a web address (https://…), an email address or a phone number.' }); return; }
        const anchor = linkTargetRef.current;
        setLinkDialog(null);
        run(el => {
            if (anchor && el.contains(anchor)) {
                anchor.setAttribute('href', url);
                anchor.setAttribute('target', '_blank');
                anchor.setAttribute('rel', 'noopener noreferrer');
                const text = d.text.trim();
                if (text && text !== anchor.textContent) anchor.textContent = text;
                return;
            }
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed && !d.askText) {
                exec('createLink', url);
                el.querySelectorAll('a').forEach(a => {
                    if (a.getAttribute('href') === url) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
                });
            } else {
                const text = d.text.trim() || url.replace(/^(mailto:|tel:)/i, '');
                exec('insertHTML', `<a href="${attr(url)}" target="_blank" rel="noopener noreferrer">${escapeText(text)}</a>&nbsp;`);
            }
        });
        linkTargetRef.current = null;
    };

    const removeLink = (anchor: HTMLAnchorElement) => {
        setBubble(null);
        run(el => { if (el.contains(anchor)) unwrapElement(anchor); });
    };

    const insertHtml = (html: string) => run(() => { exec('insertHTML', html); });

    const latestInsert = useRef(insertHtml);
    latestInsert.current = insertHtml;
    useImperativeHandle(ref, () => ({
        getHtml: () => sanitizeEditorHtml(editorRef.current?.innerHTML ?? value ?? ''),
        focus: () => editorRef.current?.focus(),
        insertHtml: (html: string) => latestInsert.current(sanitizeEditorHtml(html)),
    }), [value]);

    const handleCommand = (cmd: EditorCommand) => {
        if (disabled) return;
        switch (cmd.type) {
            case 'undo': travel(-1); return;
            case 'redo': travel(1); return;
            case 'link': openLinkDialog(); return;
            case 'table': rememberSelection(); setTableOpen(true); return;
            case 'image': if (features.images) { rememberSelection(); fileRef.current?.click(); } return;
            case 'camera': if (features.images) void startCamera(); return;
            case 'block': run(() => { exec('formatBlock', `<${cmd.value}>`); }); return;
            case 'inline': run(() => { exec(cmd.value); }); return;
            case 'color': run(() => withCss(() => { exec('foreColor', cmd.value); })); return;
            case 'highlight':
                run(el => {
                    if (cmd.value === 'transparent') {
                        // <mark> (pasted or AI text) is highlighted by the tag itself: unwrap it
                        const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
                        if (range) el.querySelectorAll('mark').forEach(m => { if (range.intersectsNode(m)) unwrapElement(m); });
                    }
                    withCss(() => { if (!exec('hiliteColor', cmd.value)) exec('backColor', cmd.value); });
                });
                return;
            case 'font': run(() => withCss(() => { exec('fontName', cmd.value); })); return;
            case 'size': run(() => withCss(() => { exec('fontSize', String(cmd.value)); })); return;
            case 'indent': run(el => changeIndent(el, cmd.value)); return;
            case 'align': run(() => { exec(ALIGN_COMMAND[cmd.value]); }); return;
            case 'hr':
                run(el => { if (!insertDivider(el)) exec('insertHorizontalRule'); });
                return;
            case 'clear': run(() => { exec('removeFormat'); }); return;
            case 'list':
                run(el => {
                    const anchor = window.getSelection()?.anchorNode;
                    const checkItem = checklistItemAt(anchor, el);
                    if (cmd.value === 'check') { toggleChecklist(el); return; }
                    if (checkItem) {
                        clearChecklist(checkItem.parentElement as HTMLElement); // checklist → plain bullets
                        if (cmd.value === 'ol') exec('insertOrderedList');
                        return;
                    }
                    exec(cmd.value === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
                    if (cmd.value === 'ul') separateFromChecklist(el, closestIn<HTMLLIElement>(window.getSelection()?.anchorNode, 'li', el));
                });
                return;
            default:
        }
    };

    const chooseBlock = (item: BlockItem) => {
        if (consumeSlash()) { emit(); scheduleRecord(); }
        handleCommand(item.command);
    };

    // ---------------------------------------------------------------- keyboard, clicks, input
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const el = editorRef.current;
        if (!el) return;
        const s = slashRef.current;
        if (s) {
            const count = slashItems.length;
            if (e.key === 'ArrowDown' && count) { e.preventDefault(); setSlash({ ...s, index: (s.index + 1) % count }); return; }
            if (e.key === 'ArrowUp' && count) { e.preventDefault(); setSlash({ ...s, index: (s.index - 1 + count) % count }); return; }
            if ((e.key === 'Enter' || e.key === 'Tab') && count) { e.preventDefault(); chooseBlock(slashItems[Math.min(s.index, count - 1)]); return; }
            if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
            if (e.key === 'Enter') setSlash(null);
        }
        const mod = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        const sel = window.getSelection();
        if (mod && !e.altKey) {
            if (key === 'z' && !e.shiftKey) { e.preventDefault(); travel(-1); return; }
            if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) { e.preventDefault(); travel(1); return; }
            if (key === 'k' && !e.shiftKey) { e.preventDefault(); openLinkDialog(); return; }
            if (!e.shiftKey && (key === 'b' || key === 'i' || key === 'u')) {
                e.preventDefault();
                handleCommand({ type: 'inline', value: key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline' });
                return;
            }
            if (e.shiftKey && e.code === 'KeyX') { e.preventDefault(); handleCommand({ type: 'inline', value: 'strikeThrough' }); return; }
            if (e.shiftKey && e.code === 'Digit7') { e.preventDefault(); handleCommand({ type: 'list', value: 'ol' }); return; }
            if (e.shiftKey && e.code === 'Digit8') { e.preventDefault(); handleCommand({ type: 'list', value: 'ul' }); return; }
            if (e.shiftKey && e.code === 'Digit9') { e.preventDefault(); handleCommand({ type: 'list', value: 'check' }); return; }
            if (e.code === 'Backslash') { e.preventDefault(); handleCommand({ type: 'clear' }); return; }
        }
        if (mod && e.altKey && /^Digit[0-3]$/.test(e.code)) {
            e.preventDefault();
            const level = Number(e.code.slice(5));
            handleCommand({ type: 'block', value: level === 0 ? 'p' : (`h${level}` as BlockStyle) });
            return;
        }
        if (e.key === 'Tab' && !mod && !e.altKey && closestIn(sel?.anchorNode, 'li', el)) {
            e.preventDefault();
            handleCommand({ type: 'indent', value: e.shiftKey ? -1 : 1 });
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            const item = checklistItemAt(sel?.anchorNode, el);
            if (item && !checklistItemText(item)) {
                // Enter on an empty checklist item ends the checklist (like an empty bullet)
                e.preventDefault();
                run(() => {
                    item.textContent = '';
                    item.appendChild(document.createElement('br'));
                    placeCaretAtEnd(item);
                    exec('insertUnorderedList');
                    if (!closestIn(window.getSelection()?.anchorNode, 'p,h1,h2,h3,h4,blockquote,pre,div', el)) exec('formatBlock', '<p>');
                });
                return;
            }
        }
        if ((e.key === 'Backspace' || e.key === 'Delete') && selectedEl?.tagName === 'IMG') {
            e.preventDefault();
            const img = selectedEl;
            setSelectedEl(null);
            run(() => img.remove());
            return;
        }
        if (e.key === 'Escape') { setBubble(null); setSelectedEl(null); setSelBar(null); }
    };

    /** "# ", "- ", "1. ", "[] ", "> " at the start of a paragraph, and "---", turn into blocks (like Docs / Notion). */
    const tryMarkdownShortcut = (data: string | null): boolean => {
        const el = editorRef.current;
        const sel = window.getSelection();
        if (!el || !sel || !sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== Node.TEXT_NODE) return false;
        if (data !== ' ' && data !== '-') return false;
        if (closestIn(sel.anchorNode, 'li,td,th,pre,h1,h2,h3,h4,blockquote', el)) return false;
        const block = closestIn<HTMLElement>(sel.anchorNode, 'p,div', el) || el;
        const before = document.createRange();
        before.setStart(block, 0);
        before.setEnd(sel.anchorNode, sel.anchorOffset);
        const typed = before.toString().replace(/ /g, ' ');
        let command: EditorCommand | null = null;
        if (data === '-' && typed === '---') command = { type: 'hr' };
        else if (data === ' ') command = MARKDOWN.find(m => m.re.test(typed.slice(0, -1)))?.command || null;
        if (!command) return false;
        flushRecord();
        record();
        before.deleteContents();
        collapseInto(before, el);
        rememberSelection();
        handleCommand(command);
        return true;
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        const el = editorRef.current;
        if (!el) return;
        const native = e.nativeEvent as InputEvent;
        if (native.inputType === 'insertParagraph') {
            // a new line in a checklist gets its own box
            normalizeChecklists(el);
            const item = checklistItemAt(window.getSelection()?.anchorNode, el);
            if (item && !checklistItemText(item)) placeCaretAfterBox(item);
        }
        if (native.inputType === 'insertText' && !slashRef.current && tryMarkdownShortcut(native.data)) return;
        // "/" at the start of a line or after a space opens the block menu
        if (!slashRef.current && (native.inputType === 'insertText' || native.inputType === 'insertCompositionText')) {
            const sel = window.getSelection();
            const node = sel?.anchorNode;
            if (sel?.isCollapsed && node && node.nodeType === Node.TEXT_NODE) {
                const text = (node as Text).data;
                const at = sel.anchorOffset - 1;
                if (at >= 0 && text[at] === '/' && (at === 0 || /\s/.test(text[at - 1]))) openSlash(node as Text, at);
            }
        } else if (slashRef.current) {
            syncSlash();
        }
        emit();
        scheduleRecord();
    };

    // browser "Undo" (context menu, iOS shake) uses the editor's own history too
    const latest = useRef({ travel });
    latest.current.travel = travel;
    useEffect(() => {
        const el = editorRef.current;
        if (!el) return;
        const onBeforeInput = (e: Event) => {
            const type = (e as InputEvent).inputType;
            if (type === 'historyUndo' || type === 'historyRedo') {
                e.preventDefault();
                latest.current.travel(type === 'historyUndo' ? -1 : 1);
            }
        };
        el.addEventListener('beforeinput', onBeforeInput);
        return () => el.removeEventListener('beforeinput', onBeforeInput);
    }, []);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = editorRef.current;
        if (!el) return;
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor && el.contains(anchor) && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            openLinkSafely(anchor.getAttribute('href'));
            return;
        }
        const li = target.closest('li');
        if (li && el.contains(li) && isChecklistItem(li) && hitsCheckbox(li, e.clientX, e.clientY)) {
            e.preventDefault();
            run(() => toggleChecklistItem(li));
        }
    };

    // ---------------------------------------------------------------- paste / drop
    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const html = e.clipboardData.getData('text/html');
        const text = e.clipboardData.getData('text/plain');
        const images = Array.from(e.clipboardData.files || []).filter(f => f.type.startsWith('image/'));
        if (images.length && !html.trim()) {
            e.preventDefault();
            if (!features.images) { setNotice({ tone: 'warn', text: 'Photos can’t be pasted into an email. Attach a document instead.' }); return; }
            rememberSelection();
            void (async () => { for (const f of images.slice(0, 5)) await insertImageFile(f); })();
            return;
        }
        if (!html && !text) return;
        e.preventDefault();
        run(() => {
            let clean = html ? cleanPastedHtml(html) : '';
            if (clean && !features.images) clean = clean.replace(/<img\b[^>]*>/gi, '');
            if (clean) exec('insertHTML', clean);
            else exec('insertText', text);
        });
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        const images = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
        if (!images.length) return;
        e.preventDefault();
        if (!features.images) return;
        const doc = document as Document & {
            caretRangeFromPoint?: (x: number, y: number) => Range | null;
            caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        };
        let range: Range | null = doc.caretRangeFromPoint?.(e.clientX, e.clientY) ?? null;
        if (!range && doc.caretPositionFromPoint) {
            const p = doc.caretPositionFromPoint(e.clientX, e.clientY);
            if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset); }
        }
        if (range && editorRef.current?.contains(range.startContainer)) {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
        rememberSelection();
        void (async () => { for (const f of images.slice(0, 5)) await insertImageFile(f); })();
    };

    // ---------------------------------------------------------------- tables
    const insertTable = () => {
        const rows = Math.min(30, Math.max(1, table.rows || 1));
        const cols = Math.min(10, Math.max(1, table.cols || 1));
        const cell = `border:1px solid ${table.border};padding:8px;min-width:40px;text-align:left`;
        let html = `<table style="border-collapse:collapse;width:100%;border:1px solid ${table.border}"><tbody><tr style="background-color:${table.header}">`;
        for (let c = 0; c < cols; c++) html += `<th style="${cell};font-weight:bold"><br></th>`;
        html += '</tr>';
        for (let r = 1; r < rows; r++) { html += '<tr>'; for (let c = 0; c < cols; c++) html += `<td style="${cell}"><br></td>`; html += '</tr>'; }
        html += '</tbody></table><p><br></p>';
        setTableOpen(false);
        insertHtml(html);
    };

    // ---------------------------------------------------------------- images
    /** Uploads the photo; when that fails or the device is offline it is embedded as a compressed data URL instead. */
    const insertImageFile = async (file?: File | null) => {
        if (!file || !features.images) return;
        setNotice(null);
        setUploading(true);
        try {
            assertUsableImage(file);
            const compressed = await compressImage(file);
            let url = '';
            if (onUploadImage && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
                try { url = (await onUploadImage(compressed)) || ''; } catch { url = ''; }
            }
            const embedded = !url;
            if (embedded) {
                url = await fileToDataUrl(compressed);
                if (!EMBEDDABLE.test(url)) throw new Error('this image type can’t be embedded. Please use a JPG or PNG.');
            }
            // offline: remembered, so the offline outbox uploads it when the document syncs (lib/offline/offlinePhotos.ts)
            const offlineNow = embedded && typeof navigator !== 'undefined' && navigator.onLine === false;
            if (offlineNow) void rememberOfflinePhoto(url);
            insertHtml(`<img src="${attr(url)}" alt="Photo" style="max-width:100%;height:auto;border-radius:8px;display:inline-block;margin:4px 0" />`);
            if (embedded && onUploadImage) {
                setNotice({
                    tone: 'info',
                    text: offlineNow
                        ? 'You’re offline: the photo is kept with the document on this device and uploaded when it syncs. It appears in the PDF.'
                        : 'The photo couldn’t be uploaded (offline?), so it was saved inside the document. It still appears in the PDF.',
                });
            }
        } catch (e) {
            setNotice({ tone: 'warn', text: describeImageError(e) });
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    // ---- camera ----
    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setCameraOpen(false);
    }, []);
    useEffect(() => () => streamRef.current?.getTracks().forEach(t => t.stop()), []);

    async function startCamera() {
        setNotice(null);
        rememberSelection();
        if (!navigator.mediaDevices?.getUserMedia) { setNotice({ tone: 'warn', text: 'The camera isn’t available in this browser. Use “Photo” to upload instead.' }); return; }
        try {
            let stream: MediaStream;
            try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
            catch { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
            streamRef.current = stream;
            setCameraOpen(true);
        } catch (e: any) {
            setNotice({ tone: 'warn', text: e?.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings, or upload a photo instead.' : 'Could not open the camera. Upload a photo instead.' });
        }
    }

    const videoCallback = useCallback((node: HTMLVideoElement | null) => {
        videoRef.current = node;
        if (node && streamRef.current) { node.srcObject = streamRef.current; node.play().catch(() => undefined); }
    }, []);

    const capturePhoto = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        canvas.toBlob(blob => {
            stopCamera();
            if (blob) void insertImageFile(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.9);
    };

    const handleVoice = (transcript: string) => run(() => { exec('insertText', `${transcript} `); });

    // ---------------------------------------------------------------- image / table selection + resizing
    const handleEditorPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        pointerDownRef.current = true;
        setSelBar(null);
        const target = e.target as HTMLElement;
        const img = target.closest('img');
        const tbl = target.closest('table');
        const el = (img || tbl) as HTMLElement | null;
        lastCellRef.current = target.closest('td,th');
        setSelectedEl(el && editorRef.current?.contains(el) ? el : null);
    };

    useEffect(() => {
        if (!selectedEl) { setBox(null); return; }
        const update = () => {
            const wrap = wrapperRef.current;
            if (!wrap || !document.body.contains(selectedEl)) { setSelectedEl(null); return; }
            const r = selectedEl.getBoundingClientRect();
            const w = wrap.getBoundingClientRect();
            setBox({ top: r.top - w.top, left: r.left - w.left, width: r.width, height: r.height });
        };
        update();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
        ro?.observe(selectedEl);
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => { ro?.disconnect(); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
    }, [selectedEl]);

    useEffect(() => {
        if (!selectedEl) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest('[data-resize-handle]') || t.closest('[data-element-tools]') || selectedEl.contains(t)) return;
            setSelectedEl(null);
        };
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
    }, [selectedEl]);

    const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!selectedEl || !editorRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        flushRecord();
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startW = selectedEl.offsetWidth;
        const maxW = editorRef.current.clientWidth;
        const isImg = selectedEl.tagName === 'IMG';
        const move = (ev: PointerEvent) => {
            const w = Math.max(40, Math.min(maxW, startW + (ev.clientX - startX)));
            selectedEl.style.width = `${Math.round(w)}px`;
            if (isImg) selectedEl.style.height = 'auto';
        };
        const up = () => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', up);
            handle.removeEventListener('pointercancel', up);
            emit();
            record();
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
    };

    const editSelected = (fn: (node: HTMLElement) => void, deselect = false) => {
        const node = selectedEl;
        if (!node) return;
        if (deselect) setSelectedEl(null);
        run(() => fn(node));
    };

    // ---------------------------------------------------------------- sticky toolbar under the page / form header
    useEffect(() => {
        let header: HTMLElement | null = null;
        for (let node = shellRef.current?.parentElement; node && !header; node = node.parentElement) {
            const h = Array.from(node.children).find(c => c.tagName === 'HEADER') as HTMLElement | undefined;
            if (h && getComputedStyle(h).position === 'sticky') header = h;
        }
        if (!header) return;
        const target = header;
        const update = () => setStickyTop(Math.round(target.getBoundingClientRect().height));
        update();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
        ro?.observe(target);
        window.addEventListener('resize', update);
        return () => { ro?.disconnect(); window.removeEventListener('resize', update); };
    }, []);

    const isImgSelected = selectedEl?.tagName === 'IMG';
    const bubbleHref = bubble?.anchor.getAttribute('href') || '';

    return (
        <div className="space-y-2">
            <style>{EDITOR_CSS}</style>
            <div
                ref={shellRef}
                className={`rounded-xl border border-input bg-card shadow-sm transition focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10 ${disabled ? 'opacity-70' : ''}`}
                aria-disabled={disabled || undefined}
            >
                <div className="sticky z-20 rounded-t-xl border-b border-border bg-card" style={{ top: stickyTop }}>
                    <RichTextToolbar
                        active={active}
                        canUndo={history.canUndo}
                        canRedo={history.canRedo}
                        onCommand={handleCommand}
                        features={features}
                        disabled={disabled}
                        inTable={inTable}
                    />
                </div>
                <div ref={wrapperRef} className="relative">
                    {isEmpty && <div className="pointer-events-none absolute left-4 right-4 top-3.5 text-base text-muted-foreground/60 sm:left-5 sm:text-[15px]">{placeholder}</div>}
                    <div
                        ref={editorRef}
                        contentEditable={!disabled}
                        suppressContentEditableWarning
                        role="textbox"
                        aria-multiline="true"
                        aria-label={ariaLabel}
                        aria-readonly={disabled || undefined}
                        spellCheck
                        className="cd-editor w-full overflow-x-auto px-4 py-3.5 text-base leading-[1.7] text-foreground focus:outline-none sm:px-5 sm:text-[15px]"
                        style={{ minHeight: `min(${minHeight}px, 60vh)` }}
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        onClick={handleClick}
                        onFocus={() => exec('defaultParagraphSeparator', 'p')}
                        onBlur={() => { rememberSelection(); flushRecord(); setBubble(null); setSlash(null); setSelBar(null); }}
                        onPaste={handlePaste}
                        onDrop={handleDrop}
                        onPointerDown={handleEditorPointerDown}
                    />

                    {box && (
                        <div className="pointer-events-none absolute rounded-sm ring-2 ring-primary" style={{ top: box.top, left: box.left, width: box.width, height: box.height }}>
                            {isImgSelected && (
                                <div
                                    data-resize-handle
                                    onPointerDown={startResize}
                                    className="pointer-events-auto absolute -bottom-3 -right-3 h-6 w-6 cursor-se-resize rounded-full border-2 border-primary bg-card shadow"
                                    style={{ touchAction: 'none' }}
                                    aria-label="Drag to resize"
                                />
                            )}
                        </div>
                    )}
                    {/* table tools give way to the selection toolbar while text in the table is selected */}
                    {box && selectedEl && !(selBar && !isImgSelected) && (
                        <div
                            data-element-tools
                            onMouseDown={preventFocusLoss}
                            className="absolute z-20 flex flex-wrap items-center gap-0.5 rounded-xl border border-border bg-popover p-1 shadow-lift"
                            style={{ top: box.top >= 44 ? box.top - 42 : box.top + Math.min(box.height, 40) + 6, left: Math.max(0, box.left) }}
                        >
                            {isImgSelected ? (
                                <>
                                    {[['Small', '33%'], ['Medium', '50%'], ['Full width', '100%']].map(([label, width]) => (
                                        <button key={width} type="button" className={miniButton} onClick={() => editSelected(n => { n.style.width = width; n.style.height = 'auto'; })}>{label}</button>
                                    ))}
                                    <button type="button" className={`${miniButton} text-destructive`} onClick={() => editSelected(n => n.remove(), true)}><TrashIcon className="h-3.5 w-3.5" /> Remove</button>
                                </>
                            ) : (
                                <>
                                    <button type="button" className={miniButton} onClick={() => editSelected(n => tableAddRow(n as HTMLTableElement))}>+ Row</button>
                                    <button type="button" className={miniButton} onClick={() => editSelected(n => tableAddColumn(n as HTMLTableElement))}>+ Column</button>
                                    <button type="button" className={miniButton} onClick={() => editSelected(n => { tableDeleteRow(n as HTMLTableElement, lastCellRef.current); })}>− Row</button>
                                    <button type="button" className={`${miniButton} text-destructive`} onClick={() => editSelected(n => n.remove(), true)}><TrashIcon className="h-3.5 w-3.5" /> Table</button>
                                </>
                            )}
                        </div>
                    )}

                    {bubble && !selBar && (
                        <div
                            onMouseDown={preventFocusLoss}
                            className="absolute z-20 flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-xl border border-border bg-popover p-1 text-xs shadow-lift"
                            style={{ top: bubble.top, left: bubble.left }}
                            role="dialog"
                            aria-label="Link"
                        >
                            <span className="max-w-[150px] truncate px-2 text-muted-foreground sm:max-w-[220px]" title={bubbleHref}>{bubbleHref.replace(/^(mailto:|tel:)/i, '')}</span>
                            <button type="button" className={miniButton} onClick={() => openLinkSafely(bubbleHref)}><ExternalLinkIcon className="h-3.5 w-3.5" /> Open</button>
                            <button type="button" className={miniButton} onClick={() => { linkTargetRef.current = bubble.anchor; openLinkDialog(); }}><EditIcon className="h-3.5 w-3.5" /> Edit</button>
                            <button type="button" className={`${miniButton} text-destructive`} onClick={() => removeLink(bubble.anchor)}>Remove</button>
                        </div>
                    )}

                    {selBar && !isImgSelected && (
                        <div
                            onMouseDown={preventFocusLoss}
                            className="absolute z-30 flex items-center gap-0.5 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lift animate-fade-in"
                            style={{ top: selBar.top, left: selBar.left, width: SELECTION_BAR_W, transform: selBar.below ? undefined : 'translateY(-100%)' }}
                            role="toolbar"
                            aria-label="Format selected text"
                        >
                            <ToolButton label="Bold" keys={`${MOD}B`} toggle active={active.bold} onClick={() => handleCommand({ type: 'inline', value: 'bold' })}><BoldIcon className="h-4 w-4" /></ToolButton>
                            <ToolButton label="Italic" keys={`${MOD}I`} toggle active={active.italic} onClick={() => handleCommand({ type: 'inline', value: 'italic' })}><ItalicIcon className="h-4 w-4" /></ToolButton>
                            <ToolButton label="Underline" keys={`${MOD}U`} toggle active={active.underline} onClick={() => handleCommand({ type: 'inline', value: 'underline' })}><UnderlineIcon className="h-4 w-4" /></ToolButton>
                            <ToolButton label="Strikethrough" toggle active={active.strike} onClick={() => handleCommand({ type: 'inline', value: 'strikeThrough' })}><StrikethroughIcon className="h-4 w-4" /></ToolButton>
                            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
                            <ToolButton label={active.highlight ? 'Remove highlight' : 'Highlight'} toggle active={active.highlight} onClick={() => handleCommand({ type: 'highlight', value: active.highlight ? 'transparent' : DEFAULT_HIGHLIGHT })}><HighlighterIcon className="h-4 w-4" /></ToolButton>
                            <MenuButton label="Text color" width={260} trigger={<TextColorIcon className="h-4 w-4" />}>
                                {close => <Swatches colors={TEXT_COLORS} onPick={c => { handleCommand({ type: 'color', value: c }); close(); }} />}
                            </MenuButton>
                            <ToolButton label={active.link ? 'Edit link' : 'Link'} keys={`${MOD}K`} toggle active={active.link} onClick={openLinkDialog}><LinkIcon className="h-4 w-4" /></ToolButton>
                            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
                            <ToolButton label="Clear formatting" onClick={() => handleCommand({ type: 'clear' })}><RemoveFormatIcon className="h-4 w-4" /></ToolButton>
                        </div>
                    )}

                    {slash && (
                        <div
                            onMouseDown={preventFocusLoss}
                            className="absolute z-30 max-h-72 w-64 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lift animate-fade-in [scrollbar-width:thin]"
                            style={{ top: slash.top, left: slash.left, transform: slash.above ? 'translateY(-100%)' : undefined }}
                        >
                            <BlockMenuList
                                title={slash.query ? `Blocks for “${slash.query}”` : 'Blocks'}
                                items={slashItems}
                                activeIndex={slash.index}
                                onHover={index => setSlash(s => (s ? { ...s, index } : s))}
                                onPick={chooseBlock}
                            />
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-0.5 rounded-b-xl border-t border-border px-1.5 py-1">
                    <AIVoiceInput variant="tile" className={footerButton} disabled={disabled} onTranscript={handleVoice} onProblem={msg => { if (msg) setNotice({ tone: 'warn', text: msg }); }} />
                    {features.images && (
                        <>
                            <button type="button" className={footerButton} onClick={startCamera} disabled={disabled}><CameraIcon /> Camera</button>
                            <button type="button" className={footerButton} onClick={() => { rememberSelection(); fileRef.current?.click(); }} disabled={uploading || disabled}>
                                {uploading ? <Spinner className="h-4 w-4" /> : <UploadImageIcon />} {uploading ? 'Adding…' : 'Photo'}
                            </button>
                            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => insertImageFile(e.target.files?.[0])} />
                        </>
                    )}
                    <span className="ml-auto truncate pl-2 pr-1.5 text-[11px] tabular-nums text-muted-foreground">
                        <span className="hidden sm:inline">Type / for headings, lists, tables · </span>
                        {stats.words} {stats.words === 1 ? 'word' : 'words'}
                    </span>
                </div>
            </div>
            {notice && (
                <p role="status" className={`rounded-lg px-3 py-2 text-xs font-medium ${notice.tone === 'info' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>{notice.text}</p>
            )}

            {linkDialog && (
                <Modal title={linkDialog.editing ? 'Edit link' : 'Add link'} onClose={() => setLinkDialog(null)}>
                    <form onSubmit={e => { e.preventDefault(); applyLink(); }} className="space-y-4">
                        <div>
                            <label className="label" htmlFor="rte-link">Web address, email or phone</label>
                            <input
                                id="rte-link"
                                className={`input ${linkDialog.error ? 'border-destructive' : ''}`}
                                type="text"
                                inputMode="url"
                                autoCapitalize="off"
                                spellCheck={false}
                                value={linkDialog.url}
                                onChange={e => setLinkDialog({ ...linkDialog, url: e.target.value, error: undefined })}
                                placeholder="https://example.com"
                                autoFocus
                            />
                            {linkDialog.error && <p className="mt-1.5 text-xs font-medium text-destructive">{linkDialog.error}</p>}
                        </div>
                        {linkDialog.askText && (
                            <div>
                                <label className="label" htmlFor="rte-link-text">Text to show</label>
                                <input id="rte-link-text" className="input" value={linkDialog.text} onChange={e => setLinkDialog({ ...linkDialog, text: e.target.value })} placeholder="Leave empty to show the address" />
                            </div>
                        )}
                        <div className="flex flex-wrap justify-end gap-2">
                            {linkDialog.editing && linkTargetRef.current && (
                                <button type="button" className="btn btn-ghost mr-auto text-destructive" onClick={() => { const a = linkTargetRef.current; setLinkDialog(null); if (a) removeLink(a); }}>Remove link</button>
                            )}
                            <button type="button" className="btn btn-outline" onClick={() => setLinkDialog(null)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={!linkDialog.url.trim()}>{linkDialog.editing ? 'Save link' : 'Add link'}</button>
                        </div>
                    </form>
                </Modal>
            )}
            {tableOpen && (
                <Modal title="Insert table" onClose={() => setTableOpen(false)}>
                    <div className="grid grid-cols-2 gap-3">
                        <div><span className="label">Rows</span><NumberInput value={table.rows} min={1} max={30} decimals={0} onValueChange={v => setTable(t => ({ ...t, rows: Math.round(v) }))} /></div>
                        <div><span className="label">Columns</span><NumberInput value={table.cols} min={1} max={10} decimals={0} onValueChange={v => setTable(t => ({ ...t, cols: Math.round(v) }))} /></div>
                    </div>
                    {(['border', 'header'] as const).map(k => (
                        <div key={k} className="mt-4">
                            <span className="label">{k === 'border' ? 'Border color' : 'Header color'}</span>
                            <div className="flex flex-wrap gap-1.5">
                                {COLORS.map(c => (
                                    <button key={c} type="button" onClick={() => setTable(t => ({ ...t, [k]: c }))} className={`h-7 w-7 rounded-full border ${table[k] === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'border-border'}`} style={{ backgroundColor: c }} aria-label={c} />
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className="mt-5 flex justify-end gap-2">
                        <button type="button" className="btn btn-outline" onClick={() => setTableOpen(false)}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={insertTable} autoFocus>Insert</button>
                    </div>
                </Modal>
            )}
            {cameraOpen && (
                <Modal title="Take a photo" onClose={stopCamera} wide>
                    <video ref={videoCallback} autoPlay playsInline muted className="max-h-[60vh] w-full rounded-xl bg-black" />
                    <div className="mt-4 flex justify-end gap-2">
                        <button type="button" className="btn btn-outline" onClick={stopCamera}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={capturePhoto}><CameraIcon className="h-4 w-4" /> Capture</button>
                    </div>
                </Modal>
            )}
        </div>
    );
});
RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
