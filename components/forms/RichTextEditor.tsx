import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Toolbar from '../Toolbar.tsx';
import AIVoiceInput from '../AIVoiceInput.tsx';
import { CameraIcon, UploadImageIcon, XCircleIcon } from '../Icons.tsx';
import { assertUsableImage, compressImage, describeImageError, fileToDataUrl } from '../../utils/imageCompression.ts';
import { sanitizeEditorHtml } from './formUtils.ts';
import { NumberInput } from './Fields.tsx';
import { Spinner } from './Spinner.tsx';

export interface RichTextEditorHandle {
    /** current sanitized HTML (use it right before saving / downloading) */
    getHtml: () => string;
    focus: () => void;
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

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
    <div className="modal-backdrop" onClick={onClose}>
        <div className={`modal-panel p-5 ${wide ? 'sm:max-w-2xl' : ''}`} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{title}</h3>
                <button type="button" className="btn btn-ghost h-10 w-10 p-0" onClick={onClose} aria-label="Close"><XCircleIcon className="h-5 w-5" /></button>
            </div>
            {children}
        </div>
    </div>
);

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(({
    value, onChange, onUploadImage, placeholder = 'Start writing…', minHeight = 320, ariaLabel = 'Document body',
}, ref) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const lastEmitted = useRef<string>('');
    const savedRange = useRef<Range | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const [active, setActive] = useState<string[]>([]);
    const [isEmpty, setIsEmpty] = useState(!value);
    const [notice, setNotice] = useState('');
    const [uploading, setUploading] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [tableOpen, setTableOpen] = useState(false);
    const [table, setTable] = useState({ rows: 3, cols: 3, border: '#d1d5db', header: '#f3f4f6' });
    const [cameraOpen, setCameraOpen] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
    const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

    const emit = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        const html = el.innerHTML;
        lastEmitted.current = html;
        setIsEmpty(!el.textContent?.trim() && !el.querySelector('img,table,hr'));
        onChangeRef.current(html);
    }, []);

    // initial content + external updates (AI prefill) while the user isn't typing
    useEffect(() => {
        const el = editorRef.current;
        if (!el) return;
        if (value === lastEmitted.current) return;
        if (document.activeElement === el && lastEmitted.current) return;
        const clean = sanitizeEditorHtml(value || '');
        el.innerHTML = clean;
        lastEmitted.current = value || '';
        setIsEmpty(!el.textContent?.trim() && !el.querySelector('img,table,hr'));
    }, [value]);

    useImperativeHandle(ref, () => ({
        getHtml: () => sanitizeEditorHtml(editorRef.current?.innerHTML ?? value ?? ''),
        focus: () => editorRef.current?.focus(),
    }), [value]);

    // selection bookkeeping so toolbar clicks / modals insert at the caret
    const rememberSelection = useCallback(() => {
        const sel = window.getSelection();
        const el = editorRef.current;
        if (sel && sel.rangeCount && el && el.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
    }, []);

    const restoreSelection = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        el.focus();
        const sel = window.getSelection();
        if (!sel) return;
        if (savedRange.current && el.contains(savedRange.current.startContainer)) {
            sel.removeAllRanges();
            sel.addRange(savedRange.current);
        } else {
            const r = document.createRange();
            r.selectNodeContents(el);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
        }
    }, []);

    const refreshActive = useCallback(() => {
        rememberSelection();
        if (!editorRef.current?.contains(document.activeElement)) return;
        const cmds = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight'];
        const list = cmds.filter(c => { try { return document.queryCommandState(c); } catch { return false; } });
        try { const block = document.queryCommandValue('formatBlock'); if (block) list.push(block); } catch { /* ignore */ }
        setActive(list);
    }, [rememberSelection]);

    const insertHtml = useCallback((html: string) => {
        restoreSelection();
        document.execCommand('insertHTML', false, html);
        rememberSelection();
        emit();
    }, [emit, restoreSelection, rememberSelection]);

    const handleCommand = (command: string, val?: any) => {
        setNotice('');
        if (command === 'createLink') {
            rememberSelection();
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !editorRef.current?.contains(sel.anchorNode)) {
                setNotice('Select the text you want to turn into a link first.');
                return;
            }
            setLinkUrl('');
            setLinkOpen(true);
            return;
        }
        if (command === 'insertTable') { rememberSelection(); setTableOpen(true); return; }
        restoreSelection();
        if (command === 'formatBlock' && val === 'blockquote') {
            document.execCommand('formatBlock', false, 'blockquote');
        } else if (command === 'insertColumns') {
            document.execCommand('insertHTML', false, '<div style="display:flex;gap:16px;margin:12px 0"><div style="flex:1;min-width:0"><p><br></p></div><div style="flex:1;min-width:0"><p><br></p></div></div><p><br></p>');
        } else {
            document.execCommand(command, false, val);
        }
        refreshActive();
        emit();
    };

    const applyLink = () => {
        let url = linkUrl.trim();
        if (!url) return;
        if (!/^(https?:|mailto:|tel:)/i.test(url)) url = `https://${url}`;
        if (!/^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d\s()-]+)$/i.test(url)) { setNotice('That link doesn’t look valid.'); return; }
        restoreSelection();
        document.execCommand('createLink', false, url);
        const anchor = window.getSelection()?.anchorNode?.parentElement?.closest('a');
        if (anchor) { anchor.setAttribute('target', '_blank'); anchor.setAttribute('rel', 'noopener noreferrer'); }
        setLinkOpen(false);
        emit();
    };

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

    const insertImageFile = async (file?: File | null) => {
        if (!file) return;
        setNotice('');
        setUploading(true);
        try {
            assertUsableImage(file);
            const compressed = await compressImage(file);
            const url = onUploadImage ? await onUploadImage(compressed) : await fileToDataUrl(compressed);
            if (!url) throw new Error('The photo did not upload. Check your connection and try again.');
            insertHtml(`<img src="${attr(url)}" alt="Photo" style="max-width:100%;height:auto;border-radius:8px;display:inline-block;margin:4px 0" />`);
        } catch (e) {
            setNotice(describeImageError(e));
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
        setNotice('');
        rememberSelection();
        if (!navigator.mediaDevices?.getUserMedia) { setNotice('The camera isn’t available in this browser. Use “Photo” to upload instead.'); return; }
        try {
            let stream: MediaStream;
            try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
            catch { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
            streamRef.current = stream;
            setCameraOpen(true);
        } catch (e: any) {
            setNotice(e?.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings, or upload a photo instead.' : 'Could not open the camera. Upload a photo instead.');
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

    const handleVoice = useCallback((transcript: string) => {
        restoreSelection();
        document.execCommand('insertText', false, `${transcript} `);
        rememberSelection();
        emit();
    }, [emit, restoreSelection, rememberSelection]);

    // ---- paste: keep formatting but sanitize ----
    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const html = e.clipboardData.getData('text/html');
        const text = e.clipboardData.getData('text/plain');
        if (!html && !text) return;
        e.preventDefault();
        if (html) document.execCommand('insertHTML', false, sanitizeEditorHtml(html));
        else document.execCommand('insertText', false, text);
        emit();
    };

    // ---- image / table resizing (pointer events: mouse, touch, pen) ----
    const handleEditorPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const img = target.closest('img');
        const tbl = target.closest('table');
        const el = (img || tbl) as HTMLElement | null;
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
            if (t.closest('[data-resize-handle]') || selectedEl.contains(t)) return;
            setSelectedEl(null);
        };
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
    }, [selectedEl]);

    const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!selectedEl || !editorRef.current) return;
        e.preventDefault();
        e.stopPropagation();
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
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
    };

    const toolButton = 'flex h-14 w-full flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60 sm:h-12 sm:flex-row sm:gap-2';

    return (
        <div className="space-y-3">
            <style>{`
                .cd-editor h1{font-size:1.75em;font-weight:700;margin:.4em 0}
                .cd-editor h2{font-size:1.4em;font-weight:700;margin:.4em 0}
                .cd-editor h3{font-size:1.15em;font-weight:700;margin:.4em 0}
                .cd-editor p{margin:.35em 0}
                .cd-editor ul{list-style:disc;padding-left:1.5em;margin:.5em 0}
                .cd-editor ol{list-style:decimal;padding-left:1.5em;margin:.5em 0}
                .cd-editor blockquote{border-left:4px solid hsl(var(--border));padding-left:1em;color:hsl(var(--muted-foreground));font-style:italic}
                .cd-editor a{color:hsl(var(--primary));text-decoration:underline}
                .cd-editor img{max-width:100%;height:auto}
                .cd-editor table{max-width:100%}
                .cd-editor hr{border-color:hsl(var(--border));margin:1em 0}
            `}</style>
            <div className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-2">
                <Toolbar activeButtons={active} onCommand={handleCommand} toggleActiveButton={b => setActive(a => (a.includes(b) ? a.filter(x => x !== b) : [...a, b]))} />
            </div>
            <div ref={wrapperRef} className="relative">
                {isEmpty && <div className="pointer-events-none absolute left-4 top-3.5 text-sm text-muted-foreground/70">{placeholder}</div>}
                <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    aria-label={ariaLabel}
                    className="cd-editor w-full overflow-x-auto rounded-xl border border-input bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
                    style={{ minHeight }}
                    onInput={emit}
                    onKeyUp={refreshActive}
                    onMouseUp={refreshActive}
                    onBlur={rememberSelection}
                    onPaste={handlePaste}
                    onPointerDown={handleEditorPointerDown}
                />
                {box && (
                    <div className="pointer-events-none absolute rounded-sm ring-2 ring-primary" style={{ top: box.top, left: box.left, width: box.width, height: box.height }}>
                        <div
                            data-resize-handle
                            onPointerDown={startResize}
                            className="pointer-events-auto absolute -bottom-3 -right-3 h-6 w-6 cursor-se-resize rounded-full border-2 border-primary bg-card shadow"
                            style={{ touchAction: 'none' }}
                            aria-label="Drag to resize"
                        />
                    </div>
                )}
            </div>
            {notice && <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">{notice}</p>}
            <div className="grid grid-cols-3 gap-2">
                <button type="button" className={toolButton} onClick={startCamera}><CameraIcon className="h-5 w-5" /> Camera</button>
                <div className="flex items-center justify-center rounded-xl border border-border bg-card"><AIVoiceInput onTranscript={handleVoice} /></div>
                <button type="button" className={toolButton} onClick={() => { rememberSelection(); fileRef.current?.click(); }} disabled={uploading}>
                    {uploading ? <Spinner className="h-5 w-5" /> : <UploadImageIcon className="h-5 w-5" />} {uploading ? 'Uploading…' : 'Photo'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => insertImageFile(e.target.files?.[0])} />
            </div>

            {linkOpen && (
                <Modal title="Add link" onClose={() => setLinkOpen(false)}>
                    <label className="label" htmlFor="rte-link">Web address</label>
                    <input id="rte-link" className="input" type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://example.com" autoFocus onKeyDown={e => { if (e.key === 'Enter') applyLink(); }} />
                    <div className="mt-5 flex justify-end gap-2">
                        <button type="button" className="btn btn-outline" onClick={() => setLinkOpen(false)}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={applyLink} disabled={!linkUrl.trim()}>Add link</button>
                    </div>
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
