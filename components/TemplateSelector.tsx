import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, EyeIcon, PaletteIcon, FontIcon, XCircleIcon } from './Icons.tsx';
import { FormType } from '../types.ts';
import type { Job, UserProfile } from '../types.ts';
import {
  COLLECTIONS, DOC_TITLES, FONT_OPTIONS, PAPER, SAMPLE_JOB, SAMPLE_PROFILE, TEMPLATES, docKindFromType, getSampleDocument,
  getTemplateMeta, paginateDocument, pickPaperSize, pickUserFont, renderDocument, resolveTemplateId,
  type PaperSize, type TemplateCollection, type TemplateId,
} from '../utils/templates/index.ts';

/**
 * Document design picker: a gallery of live thumbnails (the real templates rendered with a sample document of
 * the form's own type, branded with the user's company), grouped in collections (Featured, New, and the
 * original Standard and Premium designs), plus accent color, font and paper size controls and a full-size
 * preview of the document being edited.
 *
 * Colors, font and paper are stored in `themeColors` ({ primary, secondary, custom, font, paper }) unless
 * the parent passes `onFontChange`. Empty colors (or the old #000000/#666666 defaults) = the template's palette.
 */
export interface TemplateThemeColors {
  primary: string;
  secondary: string;
  /** true once the user picked colors explicitly */
  custom?: boolean;
  /** FontKey ('inter', 'lora', ...) or 'template' */
  font?: string;
  /** 'letter' | 'a4' */
  paper?: string;
}

interface TemplateSelectorProps {
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  themeColors?: { primary: string; secondary: string } & Partial<TemplateThemeColors>;
  onColorsChange?: (colors: { primary: string; secondary: string }) => void;
  /** Document type of the form (thumbnails show this type). Defaults to Invoice. */
  documentType?: FormType | string;
  /** The document being edited: used by the full-size preview so users see their own data. */
  previewData?: Record<string, any> | null;
  profile?: Partial<UserProfile> | null;
  job?: Partial<Job> | null;
  fontFamily?: string;
  onFontChange?: (font: string) => void;
  /** 'letter' | 'a4'; when omitted the choice is stored in themeColors.paper */
  paperSize?: string;
  onPaperChange?: (paper: 'letter' | 'a4') => void;
}

const SWATCHES = ['#1f3a5f', '#0b4aa8', '#1f6b6b', '#2f6b3a', '#263238', '#7a2e3a', '#d9480f', '#6d28d9'];

const isHex = (v?: string) => !!v && /^#[0-9a-f]{6}$/i.test(v);

/** Company identity fields copied from the document being edited onto the sample thumbnails. */
const BRAND_KEYS = ['companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'logoUrl'] as const;
type CollectionTab = 'all' | TemplateCollection;

/** Keeps a thumbnail unmounted until it scrolls into view (13 iframes at once is wasteful on phones). */
const useInView = <T extends Element>(rootMargin = '200px') => {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView] as const;
};

const useWidth = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
};

interface ThumbProps { html: string; pageWidth: number; pageHeight: number; title: string }

const Thumbnail = React.memo(({ html, pageWidth, pageHeight, title }: ThumbProps) => {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [viewRef, inView] = useInView<HTMLDivElement>();
  const setRefs = useCallback((el: HTMLDivElement | null) => { boxRef.current = el; viewRef.current = el; }, [boxRef, viewRef]);
  const scale = width ? width / pageWidth : 0;
  return (
    <div ref={setRefs} className="relative w-full overflow-hidden bg-white" style={{ aspectRatio: `${pageWidth} / ${pageHeight}` }}>
      {inView && scale > 0 ? (
        <iframe
          title={title}
          srcDoc={html}
          sandbox=""
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 border-0 select-none"
          style={{ width: pageWidth, height: pageHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
      ) : (
        <div className="skeleton absolute inset-0" />
      )}
    </div>
  );
});
Thumbnail.displayName = 'TemplateThumbnail';

const PreviewModal: React.FC<{ html: string; title: string; onClose: () => void }> = ({ html, title, onClose }) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(1200);
  // panel is max 896px wide (sm:max-w-4xl) with up to 32px of padding; never measure the content itself
  const available = () => (typeof window === 'undefined' ? 880 : Math.min(window.innerWidth, 896) - (window.innerWidth >= 640 ? 34 : 18));
  const [avail, setAvail] = useState(available);
  useEffect(() => {
    const onResize = () => setAvail(available());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const scale = Math.min(1, avail / 880);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onLoad = () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    try {
      const run = () => {
        paginateDocument(doc);
        setHeight(Math.ceil(doc.documentElement.scrollHeight) + 8);
      };
      const fonts = (doc as any).fonts;
      if (fonts?.ready) Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 2500))]).then(run); else run();
    } catch {
      /* preview stays as a single long page */
    }
  };

  const modal = (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, height: '100dvh' }} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal-panel flex flex-col sm:max-w-4xl" style={{ maxHeight: '92dvh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">This is exactly how the PDF will look.</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm h-10 w-10 p-0" aria-label="Close preview">
            <XCircleIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted p-2 sm:p-4">
          <div style={{ width: 880 * scale, height: height * scale, margin: '0 auto', overflow: 'hidden' }}>
            <iframe
              ref={frameRef}
              title={title}
              srcDoc={html}
              sandbox="allow-same-origin"
              onLoad={onLoad}
              className="border-0 bg-transparent"
              style={{ width: 880, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
};

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  selectedTemplateId,
  onSelectTemplate,
  themeColors,
  onColorsChange,
  documentType = FormType.Invoice,
  previewData,
  profile,
  job,
  fontFamily,
  onFontChange,
  paperSize,
  onPaperChange,
}) => {
  const selected = resolveTemplateId(selectedTemplateId);
  const selectedMeta = getTemplateMeta(selected);
  const kind = docKindFromType(documentType);
  const [showPreview, setShowPreview] = useState(false);

  const tc: TemplateThemeColors = { primary: '', secondary: '', ...(themeColors || {}) };
  const legacyDefault = !tc.custom && /^#?(000000|000|0000bb)$/i.test(tc.primary || '') && (!tc.secondary || /^#?(666666|666)$/i.test(tc.secondary));
  const usesTemplateColors = !tc.primary || legacyDefault;
  const font = pickUserFont({ fontFamily: fontFamily ?? tc.font }) || 'template';
  const paper: PaperSize = pickPaperSize({ paperSize: paperSize ?? tc.paper });

  const colorsForRender = useDeferredValue(usesTemplateColors ? null : { primary: tc.primary, secondary: tc.secondary });
  const deferredFont = useDeferredValue(font);

  const sample = useMemo(() => getSampleDocument(kind), [kind]);
  const thumbProfile = profile && (profile.companyName || profile.logoUrl) ? profile : SAMPLE_PROFILE;
  // thumbnails show a sample document of this form's type, branded with the company on the form (when filled in)
  const brandKey = BRAND_KEYS.map((k) => String(previewData?.[k] ?? '')).join('\u0001');
  const brand = useDeferredValue(brandKey);
  const thumbData = useMemo(() => {
    const own = brand.split('\u0001');
    const patch: Record<string, string> = {};
    BRAND_KEYS.forEach((k, i) => { if (own[i]?.trim()) patch[k] = own[i]; });
    // a company typed on the form replaces the whole sample company (never mix two companies)
    const base = { ...sample.data };
    if (patch.companyName || patch.logoUrl) BRAND_KEYS.forEach((k) => { base[k] = patch[k] || ''; });
    return base;
  }, [sample, brand]);

  const [tab, setTab] = useState<CollectionTab>(() => getTemplateMeta(selected).collection || 'featured');
  const visible = useMemo(() => TEMPLATES.filter((t) => tab === 'all' || (t.collection || 'featured') === tab), [tab]);

  const thumbs = useMemo(() => visible.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    accent: t.accent,
    html: renderDocument(sample.type, { ...thumbData, templateId: t.id }, thumbProfile, SAMPLE_JOB, {
      templateId: t.id, bare: true, paper, colors: colorsForRender, font: deferredFont,
    }).html,
  })), [visible, sample, thumbData, thumbProfile, paper, colorsForRender, deferredFont]);

  // the full-size preview shows the document being edited (falls back to the sample when the form is empty)
  const ownData = !!previewData && Object.keys(previewData).length > 0;
  const previewHtml = useMemo(() => {
    if (!showPreview) return '';
    const data = ownData ? previewData! : sample.data;
    return renderDocument(sample.type, { ...data, templateId: selected }, ownData ? (profile || {}) : thumbProfile, ownData ? job : SAMPLE_JOB, {
      templateId: selected, paper, colors: usesTemplateColors ? null : { primary: tc.primary, secondary: tc.secondary }, font,
    }).html;
  }, [showPreview, ownData, previewData, sample, selected, profile, thumbProfile, job, paper, usesTemplateColors, tc.primary, tc.secondary, font]);

  const emit = (patch: Partial<TemplateThemeColors>) => {
    if (!onColorsChange) return;
    onColorsChange({ ...tc, ...patch } as TemplateThemeColors);
  };
  const setPrimary = (hex: string) => emit({ primary: hex, secondary: usesTemplateColors ? '' : tc.secondary, custom: true });
  const setSecondary = (hex: string) => emit({ primary: usesTemplateColors ? selectedMeta.accent : tc.primary, secondary: hex, custom: true });
  const resetColors = () => emit({ primary: '', secondary: '', custom: false });
  const setFont = (f: string) => (onFontChange ? onFontChange(f) : emit({ font: f }));
  const setPaper = (p: PaperSize) => (onPaperChange ? onPaperChange(p) : emit({ paper: p }));

  const accentShown = usesTemplateColors ? selectedMeta.accent : (isHex(tc.primary) ? tc.primary : selectedMeta.accent);
  const secondaryShown = usesTemplateColors || !isHex(tc.secondary) ? selectedMeta.secondary : tc.secondary;
  const page = PAPER[paper];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-foreground">Document design</p>
          <p className="text-xs text-muted-foreground">{TEMPLATES.length} designs, shown on a sample {DOC_TITLES[kind].toLowerCase()}. Preview shows your own {DOC_TITLES[kind].toLowerCase()} exactly as the PDF.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm h-10" onClick={() => setShowPreview(true)}>
          <EyeIcon className="h-4 w-4" /> Preview
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist" aria-label="Design collections">
        {([{ id: 'all' as CollectionTab, label: 'All', description: 'Every design.' }, ...COLLECTIONS] as Array<{ id: CollectionTab; label: string; description: string }>).map((c) => {
          const count = c.id === 'all' ? TEMPLATES.length : TEMPLATES.filter((t) => (t.collection || 'featured') === c.id).length;
          if (!count) return null;
          const on = tab === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(c.id)}
              className={`h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition ${on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {c.label} <span className="ml-0.5 font-normal opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="max-h-[560px] overflow-y-auto overscroll-contain rounded-2xl p-1">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label="Document design">
          {thumbs.map((t) => {
            const active = t.id === selected;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t.name}
                onClick={() => onSelectTemplate(t.id)}
                title={t.description}
                className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 ${active ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary/50 hover:shadow-md'}`}
              >
                <Thumbnail html={t.html} pageWidth={page.width} pageHeight={page.height} title={`${t.name} preview`} />
                {active && (
                  <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                    <CheckIcon className="h-4 w-4" />
                  </span>
                )}
                <span className="flex min-h-[44px] items-center gap-2 border-t border-border px-2.5 py-2">
                  <span className="h-3 w-3 flex-none rounded-full border border-border" style={{ background: usesTemplateColors ? t.accent : accentShown }} />
                  <span className={`truncate text-xs font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{t.name}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {onColorsChange && (
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <p className="label flex items-center gap-1"><PaletteIcon className="h-3.5 w-3.5" /> Accent color</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetColors}
                className={`h-10 rounded-full border px-3 text-xs font-semibold transition ${usesTemplateColors ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                aria-pressed={usesTemplateColors}
              >
                Template colors
              </button>
              {SWATCHES.map((hex) => {
                const on = !usesTemplateColors && tc.primary?.toLowerCase() === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setPrimary(hex)}
                    aria-label={`Accent ${hex}`}
                    aria-pressed={on}
                    className={`h-10 w-10 rounded-full border-2 transition ${on ? 'border-foreground scale-105' : 'border-transparent hover:scale-105'}`}
                    style={{ background: hex }}
                  />
                );
              })}
              <label className="relative flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border" title="Custom accent color">
                <span className="absolute inset-0" style={{ background: accentShown }} />
                <input type="color" value={accentShown} onChange={(e) => setPrimary(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Custom accent color" />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <label className="relative flex h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-border" title="Secondary color">
                <span className="absolute inset-0" style={{ background: secondaryShown }} />
                <input type="color" value={secondaryShown} onChange={(e) => setSecondary(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Secondary color" />
              </label>
              <span className="text-xs text-muted-foreground">Secondary color <span className="font-mono uppercase">{secondaryShown}</span></span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label flex items-center gap-1" htmlFor="cd-template-font"><FontIcon className="h-3.5 w-3.5" /> Font</label>
              <select id="cd-template-font" className="input h-10 py-2" value={font} onChange={(e) => setFont(e.target.value)}>
                {FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <p className="label">Paper size</p>
              <div className="inline-flex rounded-xl bg-muted p-1" role="radiogroup" aria-label="Paper size">
                {(['letter', 'a4'] as PaperSize[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={paper === p}
                    onClick={() => setPaper(p)}
                    className={`h-9 rounded-lg px-4 text-xs font-semibold transition ${paper === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {PAPER[p].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showPreview && previewHtml && (
        <PreviewModal html={previewHtml} title={`${selectedMeta.name} · ${ownData ? 'your' : 'sample'} ${DOC_TITLES[kind].toLowerCase()}`} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
};

export type { TemplateId };
export default TemplateSelector;
