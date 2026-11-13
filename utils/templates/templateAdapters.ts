/**
 * LEGACY ENTRY POINT. Content documents (Daily Job Report, Note) used to be forced into invoice templates
 * with regex surgery, which dropped content in 4 designs and duplicated AI visuals in 4 others (DOC-010).
 * The shared engine renders content documents natively, so the adapter simply calls the template function
 * (all exported template functions are engine-backed and detect the document type from `title`/data).
 */
import type { LegacyLabels, LegacyTemplateFn } from './legacy.ts';
import { sanitizeRichText } from '../escapeHtml.ts';

export const adaptTemplateForContentDocument = (
  templateFn: LegacyTemplateFn | ((data: any, profile: any, title: string, labels: any) => string),
  data: any,
  profile: any,
  title: string,
  labels: LegacyLabels,
): string => templateFn(data, profile, title, labels);

/** Appends sanitized content before the closing tag of a simple HTML string. */
export const injectContentIntoSimpleTemplate = (html: string, content: string): string => {
  const safe = `<div style="padding:20px 30px">${sanitizeRichText(content)}</div>`;
  const i = html.lastIndexOf('</div>');
  return i > -1 ? html.slice(0, i) + safe + html.slice(i) : html + safe;
};
