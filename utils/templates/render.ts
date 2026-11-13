/**
 * Document renderer: (document type, saved data, profile, job) → print-ready HTML in one of the designs.
 * The same HTML is used for the template gallery thumbnails, live previews and the PDF, so what users
 * see is exactly what they download.
 */
import type { Job, UserProfile } from '../../types.ts';
import { esc } from '../escapeHtml.ts';
import { ensureContrast, mix, normalizeColor, parseColor, readableOn } from './colors.ts';
import { buildDocumentModel, type DocModel, type ModelOptions } from './model.ts';
import {
  FONTS, PAPER, getTemplateMeta, googleFontsHref, pickPaperSize, pickUserFont, resolveTemplateId,
  type FontKey, type PaperSize, type TemplateId,
} from './registry.ts';
import { baseCss, defaultCompose, defaultParts, footerHtml, runHead, type Palette, type RenderCtx } from './blocks.ts';
import { THEMES } from './themes.ts';

export interface RenderOptions extends ModelOptions {
  /** Template to use; defaults to data.templateId (legacy ids are mapped). */
  templateId?: string | null;
  /** Paper size; defaults to data.paperSize / data.themeColors.paper, then Letter. */
  paper?: PaperSize;
  /** Return only `<link><style><div class="cd-root">…` (to embed in an existing page/iframe body). */
  fragment?: boolean;
  /** Full document without the grey preview background (used for PDF capture). */
  bare?: boolean;
  /** Skip the Google Fonts <link> (fonts fall back to local stacks). */
  noFontLink?: boolean;
  /** Override colors (used by the template gallery). */
  colors?: { primary?: string; secondary?: string } | null;
  /** Override font (FontKey or 'template'). */
  font?: string | null;
}

export interface RenderResult {
  html: string;
  model: DocModel;
  templateId: TemplateId;
  paper: PaperSize;
  page: { width: number; height: number };
  fonts: FontKey[];
  fontHref: string;
  /** e.g. "Invoice-INV-1001-Jane-Smith.pdf" */
  fileName: string;
  css: string;
}

const LEGACY_PRIMARY = /^#?(000000|000|0000bb)$/i;
const LEGACY_SECONDARY = /^#?(666666|666)$/i;

/** User colors from DocumentStyle.themeColors; the old form defaults (#000000/#0000bb + #666666) mean "template colors". */
export const pickUserColors = (data: any, override?: { primary?: string; secondary?: string } | null) => {
  const tc = override ?? data?.themeColors ?? {};
  const custom = tc?.custom === true || !!override;
  const p = String(tc?.primary ?? '').trim();
  const s = String(tc?.secondary ?? '').trim();
  const legacyPair = !custom && LEGACY_PRIMARY.test(p) && (!s || LEGACY_SECONDARY.test(s));
  const primary = !legacyPair && parseColor(p) ? normalizeColor(p, '') : '';
  const secondary = parseColor(s) && (custom || !LEGACY_SECONDARY.test(s)) ? normalizeColor(s, '') : '';
  return { primary, secondary };
};

export const buildPalette = (templateId: TemplateId, user: { primary: string; secondary: string }, ink?: string): Palette => {
  const meta = getTemplateMeta(templateId);
  const paper = meta.paper;
  const accent = user.primary || meta.accent;
  const secondary = user.secondary || meta.secondary;
  const inkColor = ink || '#1b1f24';
  return {
    paper,
    ink: inkColor,
    muted: mix(inkColor, paper, 0.42),
    faint: mix(inkColor, paper, 0.62),
    rule: mix(inkColor, paper, 0.86),
    ruleStrong: mix(inkColor, paper, 0.62),
    accent,
    accentInk: ensureContrast(accent, paper, 4.5),
    onAccent: readableOn(accent),
    accentSoft: mix(accent, paper, 0.93),
    accentTint: mix(accent, paper, 0.86),
    accentLine: mix(accent, paper, 0.6),
    secondary,
    secondaryInk: ensureContrast(secondary, paper, 3),
    onSecondary: readableOn(secondary, '#ffffff', mix(accent, '#000000', 0.2)),
    secondarySoft: mix(secondary, paper, 0.72),
    custom: !!user.primary,
  };
};

const fontKeys = (templateId: TemplateId, userFont: FontKey | null): { head: FontKey; body: FontKey } => {
  const meta = getTemplateMeta(templateId);
  return userFont ? { head: userFont, body: userFont } : { head: meta.headFont, body: meta.bodyFont };
};

export const renderDocument = (
  type: unknown,
  data: unknown,
  profile?: Partial<UserProfile> | null,
  job?: Partial<Job> | null,
  opts: RenderOptions = {},
): RenderResult => {
  const d: any = data && typeof data === 'object' ? data : {};
  const templateId = resolveTemplateId(opts.templateId ?? d.templateId);
  const theme = THEMES[templateId];
  const meta = getTemplateMeta(templateId);
  const paper = opts.paper || pickPaperSize(d);
  const page = { width: PAPER[paper].width, height: PAPER[paper].height };
  const model = buildDocumentModel(type, d, profile, job, opts);
  const palette = buildPalette(templateId, pickUserColors(d, opts.colors), theme.ink);
  const userFont = opts.font !== undefined && opts.font !== null ? pickUserFont({ fontFamily: opts.font }) : pickUserFont(d);
  const keys = fontKeys(templateId, userFont);
  const fonts = Array.from(new Set([keys.head, keys.body]));
  const fontHref = googleFontsHref(fonts);
  const ctx: RenderCtx = { m: model, meta, c: palette, paper, page };

  const parts = defaultParts(ctx, theme);
  const blocks = (theme.compose ? theme.compose(ctx, parts) : defaultCompose(parts)).filter(Boolean).join('');
  const css = baseCss(ctx, theme, { head: FONTS[keys.head].stack, body: FONTS[keys.body].stack }) + theme.css(ctx);
  const chrome = theme.chrome ? theme.chrome(ctx) : '';
  const footer = theme.footer ? theme.footer(ctx) : footerHtml(model);

  const root = `<div class="cd-root cd-t-${templateId} cd-k-${model.kind} cd-stack" data-template="${templateId}" data-paper="${paper}" data-page-height="${page.height}" data-page-width="${page.width}">`
    + `<div class="cd-page cd-first cd-last"><div class="cd-chrome">${chrome}</div><div class="cd-body">${runHead(model)}${blocks}</div>${footer}</div></div>`;

  const link = !opts.noFontLink && fontHref ? `<link rel="stylesheet" href="${esc(fontHref)}">` : '';
  const styleTag = `<style>${css}</style>`;
  const fileName = `${model.fileBaseName || 'Document'}.pdf`;
  let html: string;
  if (opts.fragment) {
    html = `${link}${styleTag}${root}`;
  } else {
    const pageCss = opts.bare
      ? 'html,body{margin:0;padding:0;background:#ffffff;}'
      : 'html,body{margin:0;padding:0;background:#e7e9ec;}body{padding:28px 0;}.cd-page{box-shadow:0 1px 3px rgba(16,24,40,.12),0 8px 24px rgba(16,24,40,.08);}';
    html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(fileName.replace(/\.pdf$/, ''))}</title>`
      + (link ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>${link}` : '')
      + `<style>${pageCss}</style>${styleTag}</head><body>${root}</body></html>`;
  }
  return { html, model, templateId, paper, page, fonts, fontHref, fileName, css };
};

/** Full standalone HTML document (preview iframes, QA, PDF capture with { bare: true }). */
export const renderDocumentHtml = (
  type: unknown,
  data: unknown,
  profile?: Partial<UserProfile> | null,
  job?: Partial<Job> | null,
  opts: RenderOptions = {},
): string => renderDocument(type, data, profile, job, opts).html;
