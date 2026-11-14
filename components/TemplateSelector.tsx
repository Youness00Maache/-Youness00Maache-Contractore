import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, EyeIcon, PaletteIcon, FontIcon, XCircleIcon, LockIcon } from './Icons.tsx';
import { FormType } from '../types.ts';
import type { Job, UserProfile } from '../types.ts';
import {
  DESIGN_GROUPS, DOC_TITLES, FONT_OPTIONS, PAPER, SAMPLE_JOB, SAMPLE_PROFILE, TEMPLATES, docKindFromType, getSampleDocument,
  getTemplateMeta, paginateDocument, pickPaperSize, pickUserFont, renderDocument, resolveTemplateId,
  type DesignTier, type PaperSize, type TemplateId,
} from '../utils/templates/index.ts';
import {
  DENSITIES, FONT_PAIRS, HEADER_LAYOUTS, HIDE_OPTIONS, LOGO_SIZES, TABLE_STYLES, carryOverOptions, normalizeDesignOptions,
  type DesignOptions, type FontPairId, type HideKey,
} from '../utils/templates/designOptions.ts';
import { canUsePremiumDesigns, designAllowedFor, isGrandfathered, requestDesignUpgrade } from '../lib/designAccess.ts';

/**
 * Document design picker: a gallery of live thumbnails in two groups, Basic (free on every plan) and Premium
 * (paid plans; Free users see them with a lock, can preview them, and choosing one opens the upgrade window),
 * accent color, font and paper size controls, a "Customize" panel for Premium designs (fonts, header, logo size,
 * table, spacing, sections) with a live preview, and a full-size preview.
 *
 * Thumbnails and previews are the real PDF renderer on the document being edited (the user's own data, company and
 * logo, laid out page by page like the PDF), so what is picked is what is downloaded. Only while the form is still
 * empty do thumbnails show a sample document of the same type.
 *
 * Colors, font and paper are stored in `themeColors` ({ primary, secondary, custom, font, paper }) unless
 * the parent passes `onFontChange`. Empty colors (or the old #000000/#666666 defaults) = the template's palette.
 * Premium customization is stored in `designOptions` (utils/templates/designOptions.ts).
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
  /** The user's plan ('free' | 'premium' | 'ai'); Premium designs are locked on Free. */
  plan?: string | null;
  /** The design the document had when it was opened: a Free user may keep it even when it is Premium. */
  baselineTemplateId?: string | null;
  /** Premium customization of this document (null/undefined = the design's own layout). */
  designOptions?: DesignOptions | null;
  onDesignOptionsChange?: (options: DesignOptions | null) => void;
  /** The user's default design for new documents (shows a "Default" tag). */
  defaultTemplateId?: string | null;
  /** "Use for new documents": saves the current design as the user's default; resolves to a short status. */
  onMakeDefault?: () => Promise<string | void> | void;
}

const SWATCHES = ['#1f3a5f', '#0b4aa8', '#1f6b6b', '#2f6b3a', '#263238', '#7a2e3a', '#d9480f', '#6d28d9'];

const isHex = (v?: string) => !!v && /^#[0-9a-f]{6}$/i.test(v);

/** Company identity fields copied from the document being edited onto the sample thumbnails. */
const BRAND_KEYS = ['companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'logoUrl'] as const;

/** Keys every new document gets automatically (number, dates, design, company defaults): not "content". */
const BOILERPLATE = /^(templateId|themeColors|fontFamily|paperSize|designOptions|status|clientId|isAiGenerated|currency|recurrence|\w*Number|issueDate|dueDate|expiryDate|date|completedDate|deliveryDate|company\w*|logoUrl|signatureUrl|shipToType|deductInventory|id|createdAt|updatedAt)$/;

/** Part of the first page a gallery card shows: the top, where designs differ (header, parties, table head). */
const CARD_CROP = 0.7;

/** true once the user typed something of their own (client, items, text, amounts…). */
const hasOwnContent = (data: Record<string, any> | null | undefined): boolean => {
  if (!data) return false;
  return Object.entries(data).some(([k, v]) => {
    if (BOILERPLATE.test(k) || v === null || v === undefined || v === '' || v === false) return false;
    if (Array.isArray(v)) return v.some((row) => row && typeof row === 'object' ? Object.entries(row).some(([rk, rv]) => !/^(id|item_id|isExpanded)$/.test(rk) && rv !== '' && rv !== 0 && rv !== null && rv !== undefined && rv !== false) : !!row);
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'object') return false;
    return String(v).replace(/<[^>]+>/g, '').trim() !== '';
  });
};

/** `value`, updated at most every `ms` (thumbnails re-render while the user types, not on every key). */
const useDebounced = <T,>(value: T, ms: number): T => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

/** Keeps a thumbnail unmounted until it scrolls into view (26 iframes at once is wasteful on phones). */
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

interface ThumbProps { html: string; pageWidth: number; pageHeight: number; title: string; crop?: number }

/** Lays the thumbnail out in pages exactly like the PDF (first page shown), once its fonts are in. */
const paginateFrame = (frame: HTMLIFrameElement | null) => {
  const doc = frame?.contentDocument;
  if (!doc) return;
  try {
    const fonts = (doc as any).fonts;
    const run = () => { try { paginateDocument(doc); } catch { /* thumbnail stays a single long page */ } };
    if (fonts?.ready) Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 2500))]).then(run); else run();
  } catch {
    /* ignore */
  }
};

/**
 * The real page drawn by the browser (vector text, so it stays crisp at any size), scaled to the card width.
 * `crop` < 1 shows only the top of the page, a little larger.
 */
const Thumbnail = React.memo(({ html, pageWidth, pageHeight, title, crop = 1 }: ThumbProps) => {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [viewRef, inView] = useInView<HTMLDivElement>();
  const setRefs = useCallback((el: HTMLDivElement | null) => { boxRef.current = el; viewRef.current = el; }, [boxRef, viewRef]);
  const scale = width ? width / pageWidth : 0;
  return (
    <div ref={setRefs} className="relative w-full overflow-hidden bg-white" style={{ aspectRatio: `${pageWidth} / ${Math.round(pageHeight * crop)}` }}>
      {inView && scale > 0 ? (
        <iframe
          title={title}
          srcDoc={html}
          sandbox="allow-same-origin"
          onLoad={(e) => paginateFrame(e.currentTarget)}
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

interface PreviewAction { label: string; onClick: () => void; locked?: boolean }

const PreviewModal: React.FC<{ html: string; title: string; subtitle?: string; action?: PreviewAction | null; onClose: () => void }> = ({ html, title, subtitle, action, onClose }) => {
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
            <p className="text-xs text-muted-foreground">{subtitle || 'This is exactly how the PDF will look.'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action && (
              <button type="button" className="btn btn-primary btn-sm h-10" onClick={action.onClick}>
                {action.locked && <LockIcon className="h-4 w-4" />} {action.label}
              </button>
            )}
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm h-10 w-10 p-0" aria-label="Close preview">
              <XCircleIcon className="h-5 w-5" />
            </button>
          </div>
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

/** A row of small toggle buttons (one choice). */
const Segmented = <T extends string,>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void; disabled?: boolean;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <div className="inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={`h-8 rounded-md px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed ${value === o.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

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
  plan,
  baselineTemplateId,
  designOptions,
  onDesignOptionsChange,
  defaultTemplateId,
  onMakeDefault,
}) => {
  const selected = resolveTemplateId(selectedTemplateId);
  const selectedMeta = getTemplateMeta(selected);
  const kind = docKindFromType(documentType);
  /** design shown in the full-size preview (null = closed) */
  const [previewId, setPreviewId] = useState<TemplateId | null>(null);
  const [defaultStatus, setDefaultStatus] = useState('');

  const paid = canUsePremiumDesigns(plan);
  const isLocked = useCallback((id: string) => !designAllowedFor(plan, id, baselineTemplateId), [plan, baselineTemplateId]);
  const keeping = isGrandfathered(plan, selected);
  const selectedPremium = selectedMeta.tier === 'premium';
  const defaultId = defaultTemplateId ? resolveTemplateId(defaultTemplateId) : null;

  const tc: TemplateThemeColors = { primary: '', secondary: '', ...(themeColors || {}) };
  const legacyDefault = !tc.custom && /^#?(000000|000|0000bb)$/i.test(tc.primary || '') && (!tc.secondary || /^#?(666666|666)$/i.test(tc.secondary));
  const usesTemplateColors = !tc.primary || legacyDefault;
  const font = pickUserFont({ fontFamily: fontFamily ?? tc.font }) || 'template';
  const paper: PaperSize = pickPaperSize({ paperSize: paperSize ?? tc.paper });
  const opts = useMemo(() => normalizeDesignOptions(designOptions), [designOptions]);
  const optsKey = JSON.stringify(opts || {});

  const colorsForRender = useDeferredValue(usesTemplateColors ? null : { primary: tc.primary, secondary: tc.secondary });
  const deferredFont = useDeferredValue(font);
  const deferredOpts = useDeferredValue(optsKey);

  const sample = useMemo(() => getSampleDocument(kind), [kind]);
  const ownProfile = !!profile && !!(profile.companyName || profile.logoUrl || profile.name);
  const thumbProfile = ownProfile ? profile! : SAMPLE_PROFILE;
  // thumbnails show the document being edited (what the PDF will be); while the form is empty, a sample of the
  // same type branded with the user's company (a company typed on the form replaces the sample one entirely)
  const liveData = useDebounced(previewData || null, 450);
  const useOwn = hasOwnContent(liveData);
  const thumbData = useMemo(() => {
    if (useOwn) return liveData as Record<string, any>;
    const base: Record<string, any> = { ...sample.data };
    const typed = BRAND_KEYS.some((k) => String(liveData?.[k] ?? '').trim());
    if (typed) BRAND_KEYS.forEach((k) => { base[k] = String(liveData?.[k] ?? '').trim(); });
    else if (ownProfile) BRAND_KEYS.forEach((k) => { delete base[k]; }); // the profile's company and logo
    return base;
  }, [useOwn, liveData, sample, ownProfile]);
  const thumbJob = useOwn ? job : SAMPLE_JOB;

  const [tab, setTab] = useState<DesignTier>(() => selectedMeta.tier || 'basic');
  const visible = useMemo(() => TEMPLATES.filter((t) => (t.tier || 'basic') === tab), [tab]);

  // each card shows what choosing it gives: the selected design with this document's customization, the others
  // with what carries over to them (sections, spacing, logo size) and their own layout
  const thumbs = useMemo(() => {
    const own = JSON.parse(deferredOpts) as DesignOptions;
    const carried = carryOverOptions(own);
    return visible.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      descriptor: t.descriptor || '',
      accent: t.accent,
      html: renderDocument(sample.type, { ...thumbData, templateId: t.id }, thumbProfile, thumbJob, {
        templateId: t.id, bare: true, paper, colors: colorsForRender, font: deferredFont, designOptions: t.id === selected ? own : carried,
      }).html,
    }));
  }, [visible, sample, thumbData, thumbProfile, thumbJob, paper, colorsForRender, deferredFont, deferredOpts, selected]);

  // live preview next to the Customize controls: page 1 of this document in the selected design
  const customHtml = useMemo(() => (selectedPremium && onDesignOptionsChange
    ? renderDocument(sample.type, { ...thumbData, templateId: selected }, thumbProfile, thumbJob, {
      templateId: selected, bare: true, paper, colors: colorsForRender, font: deferredFont, designOptions: JSON.parse(deferredOpts) as DesignOptions,
    }).html
    : ''), [selectedPremium, onDesignOptionsChange, sample, thumbData, thumbProfile, thumbJob, selected, paper, colorsForRender, deferredFont, deferredOpts]);

  // the full-size preview shows the document being edited (falls back to the sample while the form is empty)
  const ownData = hasOwnContent(previewData);
  const previewHtml = useMemo(() => {
    if (!previewId) return '';
    const data = ownData ? previewData! : sample.data;
    return renderDocument(sample.type, { ...data, templateId: previewId }, ownData ? (profile || {}) : thumbProfile, ownData ? job : SAMPLE_JOB, {
      templateId: previewId, paper, colors: usesTemplateColors ? null : { primary: tc.primary, secondary: tc.secondary }, font,
      designOptions: previewId === selected ? opts : carryOverOptions(opts),
    }).html;
  }, [previewId, ownData, previewData, sample, profile, thumbProfile, job, paper, usesTemplateColors, tc.primary, tc.secondary, font, opts, selected]);

  /** Picks a design: Premium designs on Free open the upgrade window; switching keeps what carries over. */
  const choose = (id: TemplateId) => {
    if (id === selected) return;
    if (isLocked(id)) { requestDesignUpgrade(getTemplateMeta(id).name); return; }
    if (onDesignOptionsChange && opts) onDesignOptionsChange(carryOverOptions(opts));
    onSelectTemplate(id);
    setDefaultStatus('');
  };

  const emit = (patch: Partial<TemplateThemeColors>) => {
    if (!onColorsChange) return;
    onColorsChange({ ...tc, ...patch } as TemplateThemeColors);
  };
  const setPrimary = (hex: string) => emit({ primary: hex, secondary: usesTemplateColors ? '' : tc.secondary, custom: true });
  const setSecondary = (hex: string) => emit({ primary: usesTemplateColors ? selectedMeta.accent : tc.primary, secondary: hex, custom: true });
  const resetColors = () => emit({ primary: '', secondary: '', custom: false });
  const setFont = (f: string) => (onFontChange ? onFontChange(f) : emit({ font: f }));
  const setPaper = (p: PaperSize) => (onPaperChange ? onPaperChange(p) : emit({ paper: p }));

  // --- customization (Premium designs) ---
  const canCustomize = paid;
  const setOption = (patch: Partial<DesignOptions>) => {
    if (!onDesignOptionsChange) return;
    if (!paid) { requestDesignUpgrade(); return; }
    onDesignOptionsChange(normalizeDesignOptions({ ...(opts || {}), ...patch }));
    setDefaultStatus('');
  };
  const hidden = new Set<HideKey>(opts?.hide || []);
  const toggleHide = (id: HideKey) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id); else next.add(id);
    setOption({ hide: [...next] });
  };
  const setPair = (pair: 'design' | FontPairId) => {
    setOption({ fonts: pair });
    if (paid && pair !== 'design' && font !== 'template') setFont('template'); // the pairing replaces a single font
  };

  const makeDefault = async () => {
    if (!onMakeDefault) return;
    if (isLocked(selected) || (selectedPremium && !paid)) { requestDesignUpgrade(selectedMeta.name); return; }
    setDefaultStatus('Saving…');
    try {
      const r = await onMakeDefault();
      setDefaultStatus(typeof r === 'string' ? r : 'New documents will use this design.');
    } catch {
      setDefaultStatus('Could not save the default. Try again.');
    }
  };

  const accentShown = usesTemplateColors ? selectedMeta.accent : (isHex(tc.primary) ? tc.primary : selectedMeta.accent);
  const secondaryShown = usesTemplateColors || !isHex(tc.secondary) ? selectedMeta.secondary : tc.secondary;
  const page = PAPER[paper];
  const previewMeta = previewId ? getTemplateMeta(previewId) : null;
  const previewAction: PreviewAction | null = previewMeta && previewMeta.id !== selected
    ? (isLocked(previewMeta.id)
      ? { label: 'Upgrade to use', locked: true, onClick: () => { setPreviewId(null); requestDesignUpgrade(previewMeta.name); } }
      : { label: 'Use this design', onClick: () => { choose(previewMeta.id); setPreviewId(null); } })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-foreground">Document design</p>
          <p className="text-xs text-muted-foreground">Shown on {useOwn ? `your ${DOC_TITLES[kind].toLowerCase()}, exactly as the PDF will look` : `a sample ${DOC_TITLES[kind].toLowerCase()} until you fill in the form`}.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm h-10" onClick={() => setPreviewId(selected)}>
          <EyeIcon className="h-4 w-4" /> Preview
        </button>
      </div>

      <div>
        <div className="inline-flex rounded-xl bg-muted p-1" role="tablist" aria-label="Design groups">
          {DESIGN_GROUPS.map((g) => {
            const count = TEMPLATES.filter((t) => (t.tier || 'basic') === g.id).length;
            const on = tab === g.id;
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(g.id)}
                className={`flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition ${on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {g.id === 'premium' && !paid && <LockIcon className="h-3 w-3" />}
                {g.label} <span className="font-normal opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {tab === 'basic'
            ? 'Free on every plan.'
            : paid
              ? 'Included in your plan. Pick one, then adjust it under Customize.'
              : <>Included in Premium and Premium + AI. Preview any of them, or <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => requestDesignUpgrade()}>upgrade</button> to use them.</>}
        </p>
      </div>

      {keeping && (
        <div className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-xs text-foreground" role="note">
          This document uses <strong>{selectedMeta.name}</strong>, a Premium design. You can keep it on the Free plan; choosing another Premium design or customizing it needs an upgrade.
        </div>
      )}

      <div className="max-h-[600px] overflow-y-auto overscroll-contain rounded-2xl p-1">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Document design">
          {thumbs.map((t) => {
            const active = t.id === selected;
            const locked = isLocked(t.id);
            return (
              <div key={t.id} className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all ${active ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary/50 hover:shadow-md'}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={locked ? `${t.name} (Premium, upgrade to use)` : t.name}
                  onClick={() => choose(t.id)}
                  title={t.description}
                  className="flex flex-col text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
                >
                  <Thumbnail html={t.html} pageWidth={page.width} pageHeight={page.height} title={`${t.name} preview`} crop={CARD_CROP} />
                  <span className="flex min-h-[50px] flex-col justify-center gap-0.5 border-t border-border px-2.5 py-2">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 flex-none rounded-full border border-border" style={{ background: usesTemplateColors ? t.accent : accentShown }} />
                      <span className={`truncate text-xs font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{t.name}</span>
                      {defaultId === t.id && <span className="ml-auto flex-none rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Default</span>}
                    </span>
                    {t.descriptor && <span className="truncate text-[11px] leading-tight text-muted-foreground">{t.descriptor}</span>}
                  </span>
                </button>
                {active && (
                  <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                    <CheckIcon className="h-4 w-4" />
                  </span>
                )}
                {locked && (
                  <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-foreground/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-background">
                    <LockIcon className="h-3 w-3" /> Premium
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewId(t.id)}
                  className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-sm transition hover:text-foreground focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
                  style={{ top: active ? 42 : 8 }}
                  aria-label={`Preview ${t.name}`}
                  title="Preview"
                >
                  <EyeIcon className="h-4 w-4" />
                </button>
              </div>
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
            {!(selectedPremium && onDesignOptionsChange) && (
              <div>
                <label className="label flex items-center gap-1" htmlFor="cd-template-font"><FontIcon className="h-3.5 w-3.5" /> Font</label>
                <select id="cd-template-font" className="input h-10 py-2" value={font} onChange={(e) => setFont(e.target.value)}>
                  {FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
            )}
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
            {onMakeDefault && (
              <div>
                <button type="button" className="btn btn-outline btn-sm h-10" onClick={makeDefault}>
                  {defaultId === selected && !defaultStatus ? <><CheckIcon className="h-4 w-4" /> Default for new documents</> : 'Use for new documents'}
                </button>
                {defaultStatus && <p className="mt-1.5 text-xs text-muted-foreground" role="status">{defaultStatus}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedPremium && onDesignOptionsChange && (
        <div className="border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Customize {selectedMeta.name}</p>
              <p className="text-xs text-muted-foreground">{canCustomize ? 'Changes show on the preview and on the PDF.' : 'Customizing is part of Premium and Premium + AI.'}</p>
            </div>
            {canCustomize
              ? opts && <button type="button" className="btn btn-ghost btn-sm h-9" onClick={() => onDesignOptionsChange(null)}>Reset to design</button>
              : <button type="button" className="btn btn-primary btn-sm h-9" onClick={() => requestDesignUpgrade()}><LockIcon className="h-4 w-4" /> Upgrade</button>}
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
            <fieldset className={`space-y-3 ${canCustomize ? '' : 'opacity-60'}`} disabled={!canCustomize}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cd-font-pair">Fonts</label>
                <select id="cd-font-pair" className="input h-9 w-auto min-w-[200px] py-1.5 text-xs" value={opts?.fonts || 'design'} onChange={(e) => setPair(e.target.value as 'design' | FontPairId)}>
                  <option value="design">Design fonts</option>
                  {(Object.keys(FONT_PAIRS) as FontPairId[]).map((k) => <option key={k} value={k}>{FONT_PAIRS[k].label}: {FONT_PAIRS[k].hint}</option>)}
                </select>
              </div>
              <Segmented label="Header" value={(opts?.header as string) || 'design'} options={[{ id: 'design', label: 'Design' }, ...HEADER_LAYOUTS]} onChange={(v) => setOption({ header: v as DesignOptions['header'] })} disabled={!canCustomize} />
              <Segmented label="Logo size" value={opts?.logoSize || ''} options={[{ id: '', label: 'Design' }, ...LOGO_SIZES.map((l) => ({ id: l.id, label: l.label }))]} onChange={(v) => setOption({ logoSize: (v || undefined) as DesignOptions['logoSize'] })} disabled={!canCustomize} />
              <Segmented label="Table" value={(opts?.table as string) || 'design'} options={[{ id: 'design', label: 'Design' }, ...TABLE_STYLES]} onChange={(v) => setOption({ table: v as DesignOptions['table'] })} disabled={!canCustomize} />
              <Segmented label="Spacing" value={opts?.density || ''} options={[{ id: '', label: 'Design' }, ...DENSITIES]} onChange={(v) => setOption({ density: (v || undefined) as DesignOptions['density'] })} disabled={!canCustomize} />
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Print on the PDF</p>
                <div className="flex flex-wrap gap-2">
                  {HIDE_OPTIONS.map((h) => {
                    const shown = !hidden.has(h.id);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        role="checkbox"
                        aria-checked={shown}
                        title={h.hint}
                        onClick={() => toggleHide(h.id)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${shown ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border text-muted-foreground line-through decoration-1'}`}
                      >
                        {shown && <CheckIcon className="h-3.5 w-3.5 text-primary" />} {h.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </fieldset>
            <div className="hidden sm:block">
              <div className="overflow-hidden rounded-lg border border-border shadow-sm">
                {customHtml && <Thumbnail html={customHtml} pageWidth={page.width} pageHeight={page.height} title={`${selectedMeta.name} customized preview`} />}
              </div>
              <p className="mt-1 text-center text-[11px] text-muted-foreground">Page 1, live</p>
            </div>
          </div>
        </div>
      )}

      {previewMeta && previewHtml && (
        <PreviewModal
          html={previewHtml}
          title={`${previewMeta.name} · ${ownData ? 'your' : 'sample'} ${DOC_TITLES[kind].toLowerCase()}`}
          subtitle={isLocked(previewMeta.id) ? 'Premium design: preview only on the Free plan.' : undefined}
          action={previewAction}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
};

export type { TemplateId };
export default TemplateSelector;
