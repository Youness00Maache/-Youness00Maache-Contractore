import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import AIVoiceInput from '../AIVoiceInput.tsx';
import { CameraIcon, EditIcon, ExternalLinkIcon, TrashIcon, UploadImageIcon, XCircleIcon } from '../Icons.tsx';
import { assertUsableImage, compressImage, describeImageError, fileToDataUrl } from '../../utils/imageCompression.ts';
import { cleanPastedHtml, sanitizeEditorHtml } from './formUtils.ts';
import { NumberInput } from './Fields.tsx';
import { Spinner } from './Spinner.tsx';
import RichTextToolbar, { EMPTY_ACTIVE, type Align, type BlockStyle, type EditorActiveState, type EditorCommand } from './RichTextToolbar.tsx';
import {
    changeIndent, checklistItemAt, checklistItemText, clearChecklist, closestIn, dropRedundantSpanStyles, getSelectionOffsets, hitsCheckbox, isChecklistItem,
    liftListsOutOfParagraphs, normalizeChecklists, openLinkSafely, placeCaretAfterBox, placeCaretAtEnd, setSelectionOffsets, tableAddColumn, tableAddRow,
    tableDeleteRow, textStats, toggleChecklist, toggleChecklistItem, toSafeLink, unwrapElement, type TextOffsets,
} from './richTextDom.ts';

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
}

const COLORS = ['#000000', '#374151', '#9ca3af', '#ffffff', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#db2777', '#fee2e2', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe', '#f3f4f6'];
const ALIGN_COMMAND: Record<Align, string> = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' };
const EMBEDDABLE = /^data:image\/(png|jpe?g|gif|webp);base64,/i;
const HISTORY_LIMIT = 150;

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
const preventFocusLoss = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault();
const selectionInside = (el: HTMLElement | null): boolean => {
    const sel = window.getSelection();
    return Boolean(el && sel && sel.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer));
};

type Snapshot = { html: string; sel: TextOffsets | null };

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

const miniButton = 'flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-foreground hover:bg-muted';

/**
 * Rich text editor of the Daily Report and Note bodies (contentEditable + execCommand, no dependency).
 * - own undo/redo history (also covers checklist, indent, link, image and table changes the browser can't undo)
 * - paragraph styles, B/I/U/S, colors, highlight, fonts/sizes, lists, checklists, indent, alignment
 * - links: add / edit / remove, open with a click on the link bubble or Ctrl/⌘+click
 * - photos: upload, camera, paste, drop; embedded as a compressed data URL when the upload fails or offline
 * - tables, horizontal line, clear formatting, clean paste from Word / Google Docs, word count, sticky toolbar
 * Output is plain HTML kept by `sanitizeEditorHtml` and by the PDF sanitizer (`sanitizeRichText`).
 */
const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(({
    value, onChange, onUploadImage, placeholder = 'Start writing…', minHeight = 320, ariaLabel = 'Document body',
}, ref) => {
    const shellRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const lastEmitted = useRef<string>('');
    const savedRange = useRef<Range | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const [active, setActive] = useState<EditorActiveState>(EMPTY_ACTIVE);
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
    const [stickyTop, setStickyTop] = useState(0);
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
        });
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

    useEffect(() => {
        let timer = 0;
        const onSelectionChange = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                if (!selectionInside(editorRef.current)) return;
                rememberSelection();
                refreshActive();
                updateBubble();
            }, 30);
        };
        document.addEventListener('selectionchange', onSelectionChange);
        return () => {
            document.removeEventListener('selectionchange', onSelectionChange);
            window.clearTimeout(timer);
        };
    }, [rememberSelection, refreshActive, updateBubble]);

    // ---------------------------------------------------------------- commands
    /** Runs one editing step: selection back in the editor, change, then save to history and to the parent. */
    const run = (fn: (el: HTMLDivElement) => void) => {
        const el = editorRef.current;
        if (!el) return;
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
    };

    const travel = (step: 1 | -1) => {
        const el = editorRef.current;
        if (!el) return;
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
        emit();
        syncHistory();
        refreshActive();
    };

    const openLinkDialog = () => {
        const el = editorRef.current;
        if (!el) return;
        restoreSelection();
        rememberSelection();
        const sel = window.getSelection();
        const anchor = closestIn<HTMLAnchorElement>(sel?.anchorNode, 'a', el);
        linkTargetRef.current = anchor;
        setBubble(null);
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
        switch (cmd.type) {
            case 'undo': travel(-1); return;
            case 'redo': travel(1); return;
            case 'link': openLinkDialog(); return;
            case 'table': rememberSelection(); setTableOpen(true); return;
            case 'image': rememberSelection(); fileRef.current?.click(); return;
            case 'block': run(() => { exec('formatBlock', `<${cmd.value}>`); }); return;
            case 'inline': run(() => { exec(cmd.value); }); return;
            case 'color': run(() => withCss(() => { exec('foreColor', cmd.value); })); return;
            case 'highlight': run(() => withCss(() => { if (!exec('hiliteColor', cmd.value)) exec('backColor', cmd.value); })); return;
            case 'font': run(() => withCss(() => { exec('fontName', cmd.value); })); return;
            case 'size': run(() => withCss(() => { exec('fontSize', String(cmd.value)); })); return;
            case 'indent': run(el => changeIndent(el, cmd.value)); return;
            case 'align': run(() => { exec(ALIGN_COMMAND[cmd.value]); }); return;
            case 'hr': run(() => { exec('insertHorizontalRule'); }); return;
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
                });
                return;
            default:
        }
    };

    // ---------------------------------------------------------------- keyboard, clicks, input
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const el = editorRef.current;
        if (!el) return;
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
        if (e.key === 'Escape') { setBubble(null); setSelectedEl(null); }
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        const el = editorRef.current;
        if (!el) return;
        if ((e.nativeEvent as InputEvent).inputType === 'insertParagraph') {
            // a new line in a checklist gets its own box
            normalizeChecklists(el);
            const item = checklistItemAt(window.getSelection()?.anchorNode, el);
            if (item && !checklistItemText(item)) placeCaretAfterBox(item);
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
            rememberSelection();
            void (async () => { for (const f of images.slice(0, 5)) await insertImageFile(f); })();
            return;
        }
        if (!html && !text) return;
        e.preventDefault();
        run(() => {
            const clean = html ? cleanPastedHtml(html) : '';
            if (clean) exec('insertHTML', clean);
            else exec('insertText', text);
        });
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        const images = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
        if (!images.length) return;
        e.preventDefault();
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
        if (!file) return;
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
            insertHtml(`<img src="${attr(url)}" alt="Photo" style="max-width:100%;height:auto;border-radius:8px;display:inline-block;margin:4px 0" />`);
            if (embedded && onUploadImage) {
                setNotice({ tone: 'info', text: 'The photo couldn’t be uploaded (offline?), so it was saved inside the document. It still appears in the PDF.' });
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

    const startCamera = async () => {
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
    };

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

    // ---------------------------------------------------------------- sticky toolbar under the form header
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

    const toolButton = 'flex h-14 w-full flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60 sm:h-12 sm:flex-row sm:gap-2';
    const isImgSelected = selectedEl?.tagName === 'IMG';
    const bubbleHref = bubble?.anchor.getAttribute('href') || '';

    return (
        <div className="space-y-3">
            <style>{`
                .cd-editor h1{font-size:1.75em;font-weight:700;margin:.4em 0}
                .cd-editor h2{font-size:1.4em;font-weight:700;margin:.4em 0}
                .cd-editor h3{font-size:1.15em;font-weight:700;margin:.4em 0}
                .cd-editor p{margin:.35em 0}
                .cd-editor ul{list-style:disc;padding-left:1.5em;margin:.5em 0}
                .cd-editor ol{list-style:decimal;padding-left:1.5em;margin:.5em 0}
                .cd-editor ul ul{list-style-type:circle}
                .cd-editor ol ol{list-style-type:lower-alpha}
                .cd-editor li{margin:.15em 0}
                .cd-editor blockquote{border-left:4px solid hsl(var(--border));padding-left:1em;color:hsl(var(--muted-foreground));font-style:italic}
                .cd-editor pre{font-family:ui-monospace,monospace;white-space:pre-wrap;background:hsl(var(--muted));padding:.5em .75em;border-radius:8px}
                .cd-editor a{color:hsl(var(--primary));text-decoration:underline;cursor:pointer}
                .cd-editor img{max-width:100%;height:auto}
                .cd-editor table{max-width:100%;border-collapse:collapse;margin:.5em 0}
                .cd-editor th,.cd-editor td{border:1px solid hsl(var(--border));padding:6px 8px;vertical-align:top}
                .cd-editor hr{border-color:hsl(var(--border));margin:1em 0}
                .cd-editor mark{background:#fef08a;color:inherit}
            `}</style>
            <div ref={shellRef} className="rounded-xl border border-input bg-card shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                <div className="sticky z-20 rounded-t-xl border-b border-border bg-card" style={{ top: stickyTop }}>
                    <RichTextToolbar active={active} canUndo={history.canUndo} canRedo={history.canRedo} onCommand={handleCommand} />
                </div>
                <div ref={wrapperRef} className="relative">
                    {isEmpty && <div className="pointer-events-none absolute left-4 top-3 text-sm text-muted-foreground/70">{placeholder}</div>}
                    <div
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        role="textbox"
                        aria-multiline="true"
                        aria-label={ariaLabel}
                        spellCheck
                        className="cd-editor w-full overflow-x-auto rounded-b-xl px-4 py-3 text-sm leading-relaxed text-foreground focus:outline-none"
                        style={{ minHeight }}
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        onClick={handleClick}
                        onFocus={() => exec('defaultParagraphSeparator', 'p')}
                        onBlur={() => { rememberSelection(); flushRecord(); setBubble(null); }}
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
                    {box && selectedEl && (
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

                    {bubble && (
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
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{stats.words} {stats.words === 1 ? 'word' : 'words'} · {stats.chars} {stats.chars === 1 ? 'character' : 'characters'}</span>
                    <span className="hidden sm:inline">Tap a link to open or edit it · Ctrl/⌘+click opens it directly</span>
                </div>
            </div>
            {notice && (
                <p role="status" className={`rounded-lg px-3 py-2 text-xs font-medium ${notice.tone === 'info' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>{notice.text}</p>
            )}
            <div className="grid grid-cols-3 gap-2">
                <button type="button" className={toolButton} onClick={startCamera}><CameraIcon className="h-5 w-5" /> Camera</button>
                <div className="flex items-center justify-center rounded-xl border border-border bg-card"><AIVoiceInput onTranscript={handleVoice} /></div>
                <button type="button" className={toolButton} onClick={() => { rememberSelection(); fileRef.current?.click(); }} disabled={uploading}>
                    {uploading ? <Spinner className="h-5 w-5" /> : <UploadImageIcon className="h-5 w-5" />} {uploading ? 'Adding…' : 'Photo'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => insertImageFile(e.target.files?.[0])} />
            </div>

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
                        <button type="button" className="btn btn-primary" onClick={insertTable}>Insert</button>
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
