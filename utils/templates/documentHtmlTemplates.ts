/**
 * LEGACY ENTRY POINT (kept so older imports keep working).
 * These functions used to contain five hand-written HTML templates that re-implemented money math and
 * printed unescaped data. They now delegate to the shared template engine (./render.ts); each old design
 * maps to its closest current design via LEGACY_TEMPLATE_MAP. New code: `renderDocument()` from './index.ts'.
 */
import type { AIVisualData } from '../../types.ts';
import { FormType } from '../../types.ts';
import { safeColor } from '../escapeHtml.ts';
import { renderDocument } from './render.ts';
import { renderVisualsHtml } from './widgets.ts';
import { legacyTemplate, type LegacyLabels } from './legacy.ts';

export const getAdvancedHtmlTemplate = legacyTemplate('template_html');
export const getHighEndHtmlTemplate = legacyTemplate('template_html_2');
export const getGlassmorphismModernHtmlTemplate = legacyTemplate('template_html_2_new');
export const getPremiumMinimalistHtmlTemplate = legacyTemplate('template_html_3');
export const getGradientBorderPremiumHtmlTemplate = legacyTemplate('template_html_4');

export const getProfitReportHtmlTemplate = (data: any, profile: any, _title?: string, _labels?: LegacyLabels): string =>
  renderDocument(FormType.ProfitReport, data, profile, null, { templateId: data?.templateId || 'classic', fragment: true }).html;

/** AI visual data (metrics, progress, chart, widgets) as print-friendly HTML. */
export const getAIVisualHtml = (data: AIVisualData, primaryColor: string): string => {
  const body = renderVisualsHtml(data);
  if (!body) return '';
  const accent = safeColor(primaryColor, '#1f3a5f');
  return `<div class="cd-root" style="--accent:${accent};--accent-ink:${accent};--accent-soft:#f3f5f8;--rule:#e5e7eb;--rule-strong:#9ca3af;--muted:#6b7280;--font-head:inherit;">${body}</div>`;
};
