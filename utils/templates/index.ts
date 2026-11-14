/**
 * Public API of the document template engine.
 *
 *   renderDocument(type, data, profile, job, opts)      → { html, model, templateId, fileName, ... }
 *   renderDocumentHtml(type, data, profile, job, opts)  → standalone HTML (preview iframes)
 *   paginateDocument(document)                          → splits a rendered document into pages (browser only)
 *   TEMPLATES / resolveTemplateId / LEGACY_TEMPLATE_MAP → template registry and backward compatibility
 */
export { renderDocument, renderDocumentHtml, pickUserColors, buildPalette, type RenderOptions, type RenderResult } from './render.ts';
export { paginateDocument } from './paginate.ts';
export { buildDocumentModel, docKindFromType, DOC_KINDS, DOC_TITLES, KIND_TO_FORM_TYPE, type DocKind, type DocModel } from './model.ts';
export {
  TEMPLATES, FONTS, FONT_OPTIONS, PAPER, LEGACY_TEMPLATE_MAP, RETIRED_TEMPLATE_MAP, TEMPLATE_KEYWORDS, DEFAULT_TEMPLATE_ID, DESIGN_GROUPS, BASIC_TEMPLATE_IDS, PREMIUM_TEMPLATE_IDS, ALL_TEMPLATE_IDS,
  resolveTemplateId, getTemplateMeta, isTemplateId, isPremiumDesign, pickUserFont, pickPaperSize, googleFontsHref,
  type TemplateId, type TemplateMeta, type FontKey, type PaperSize, type TemplateCollection, type DesignTier,
} from './registry.ts';
export { renderVisualsHtml, renderWidgetHtml } from './widgets.ts';
export { SAMPLE_DOCUMENTS, SAMPLE_PROFILE, SAMPLE_JOB, SAMPLE_LOGO, SAMPLE_SIGNATURE, getSampleDocument } from './sampleData.ts';
