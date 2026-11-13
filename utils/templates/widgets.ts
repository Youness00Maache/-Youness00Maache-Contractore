/**
 * Print-friendly rendering of AI visual data (metrics, progress, chart) and AI widgets
 * (components/DocumentWidgets/*) for the document templates and the PDF.
 * Pure string building, no React, no scripts. Every value is escaped; numbers are coerced.
 */
import type { AIVisualData } from '../../types.ts';
import { esc, safeColor, safeUrl } from '../escapeHtml.ts';
import { toNumber } from '../money.ts';
import { formatDate, formatNumber, humanize, money, str } from './format.ts';

type AnyRec = Record<string, any>;

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const pct = (v: unknown) => Math.max(0, Math.min(100, toNumber(v)));
const txt = (v: unknown) => esc(str(v));

const bar = (percent: number, color = 'var(--accent)') =>
  `<div class="cd-bar"><div class="cd-bar-fill" style="width:${percent.toFixed(1)}%;background:${color}"></div></div>`;

const kvGrid = (pairs: Array<[string, string]>) => {
  const items = pairs.filter(([, v]) => v !== '');
  if (!items.length) return '';
  return `<div class="cd-w-kv">${items.map(([k, v]) => `<div class="cd-w-kv-item"><div class="cd-w-kv-label">${esc(k)}</div><div class="cd-w-kv-value">${v}</div></div>`).join('')}</div>`;
};

const simpleTable = (headers: string[], rows: string[][]) => {
  if (!rows.length) return '';
  return `<table class="cd-w-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
};

const toneClass = (v: unknown) => {
  const s = String(v ?? '').toLowerCase();
  if (/pass|safe|healthy|verified|approved|complete|good|low|done/.test(s)) return 'cd-tone-good';
  if (/fail|critical|high|reject|blocked|danger|overdue/.test(s)) return 'cd-tone-bad';
  if (/pend|warn|caution|mod|current|progress|hold/.test(s)) return 'cd-tone-warn';
  return 'cd-tone-neutral';
};
const pill = (v: unknown) => (str(v) ? `<span class="cd-pill ${toneClass(v)}">${txt(v)}</span>` : '');

const metricsGrid = (metrics: any[]) => {
  const items = arr(metrics).filter((m) => m && (str(m.label) || str(m.value)));
  if (!items.length) return '';
  return `<div class="cd-w-metrics">${items
    .map((m) => `<div class="cd-w-metric"><div class="cd-w-metric-value">${txt(m.value)}</div><div class="cd-w-metric-label">${txt(m.label)}</div></div>`)
    .join('')}</div>`;
};

const progressBlock = (label: string, percent: unknown, sub?: unknown) => {
  const p = pct(percent);
  return `<div class="cd-w-progress"><div class="cd-w-progress-head"><span>${esc(label)}</span><strong>${formatNumber(p, 1)}%</strong></div>${bar(p)}${str(sub) ? `<div class="cd-w-sub">${txt(sub)}</div>` : ''}</div>`;
};

const barChart = (points: any[], title = 'Overview') => {
  const items = arr(points).filter((d) => d && str(d.name ?? d.label));
  if (!items.length) return '';
  const max = Math.max(1, ...items.map((d) => Math.abs(toNumber(d.value ?? d.amount))));
  return `<div class="cd-w-chart"><div class="cd-w-title">${esc(title)}</div>${items
    .map((d) => {
      const v = toNumber(d.value ?? d.amount);
      return `<div class="cd-w-chart-row"><div class="cd-w-chart-label">${txt(d.name ?? d.label)}</div><div class="cd-w-chart-bar">${bar((Math.abs(v) / max) * 100)}</div><div class="cd-w-chart-value">${formatNumber(v)}</div></div>`;
    })
    .join('')}</div>`;
};

type WidgetRenderer = (d: AnyRec) => string;

const WIDGETS: Record<string, WidgetRenderer> = {
  MetricsGrid: (d) => metricsGrid(d.metrics),
  ProgressBar: (d) => progressBlock(str(d.label) || 'Progress', d.percentage, d.subLabel),
  WeatherCard: (d) => kvGrid([
    ['Conditions', txt(humanize(str(d.condition)))],
    ['Temperature', str(d.temp) !== '' ? `${formatNumber(d.temp, 1)}${esc(str(d.unit) || '°F')}` : ''],
    ['Impact on work', txt(d.impact)],
  ]),
  LaborShiftLog: (d) => {
    const rows = arr(d.shifts).map((s) => [txt(s?.worker), txt(s?.role), formatNumber(s?.hours, 2), esc(arr(s?.tasks).map(str).filter(Boolean).join(', '))]);
    const total = str(d.total_hours) !== '' ? toNumber(d.total_hours) : arr(d.shifts).reduce((a, s) => a + toNumber(s?.hours), 0);
    return simpleTable(['Worker', 'Role', 'Hours', 'Tasks'], rows) + (rows.length ? `<div class="cd-w-foot">Total labor: <strong>${formatNumber(total, 2)} h</strong></div>` : '');
  },
  PhaseTimeline: (d) => {
    const phases = arr(d.phases).filter((p) => p && str(p.name));
    if (!phases.length) return '';
    return `<ol class="cd-w-timeline">${phases
      .map((p) => `<li class="cd-w-step cd-w-step--${esc(str(p.status) || 'upcoming')}"><span class="cd-w-dot"></span><span class="cd-w-step-name">${txt(p.name)}</span>${str(p.date) ? `<span class="cd-w-step-date">${esc(formatDate(p.date))}</span>` : ''}${pill(p.status)}</li>`)
      .join('')}</ol>`;
  },
  DailyBlockersList: (d) => simpleTable(['Type', 'Description', 'Impact'], arr(d.blockers).map((b) => [txt(b?.type), txt(b?.description), pill(b?.impact)])),
  SafetyGauge: (d) => kvGrid([
    ['Status', pill(d.status)],
    ['Incidents', str(d.incidents) !== '' ? formatNumber(d.incidents, 0) : ''],
    ['Compliance score', str(d.compliance_score) !== '' ? `${formatNumber(d.compliance_score, 1)}%` : ''],
    ['Last inspection', esc(formatDate(d.last_inspection))],
  ]) + (str(d.compliance_score) !== '' ? bar(pct(d.compliance_score)) : ''),
  BudgetDonut: (d) => {
    const slices = arr(d.slices).filter((s) => s && str(s.label));
    const total = toNumber(d.total) || slices.reduce((a, s) => a + toNumber(s.amount), 0);
    if (!slices.length) return '';
    return `<div class="cd-w-chart">${slices
      .map((s) => {
        const amount = toNumber(s.amount);
        const p = total ? (amount / total) * 100 : 0;
        return `<div class="cd-w-chart-row"><div class="cd-w-chart-label">${txt(s.label)}</div><div class="cd-w-chart-bar">${bar(p, safeColor(s.color, 'var(--accent)'))}</div><div class="cd-w-chart-value">${money(amount)}</div></div>`;
      })
      .join('')}<div class="cd-w-foot">Total budget: <strong>${money(total)}</strong></div></div>`;
  },
  RoomByRoomProgress: (d) => arr(d.rooms).filter((r) => r && str(r.name)).map((r) => progressBlock(str(r.name), r.progress)).join(''),
  SubcontractorSplit: (d) => arr(d.splits).filter((s) => s && str(s.team)).map((s) => progressBlock(str(s.team), s.percentage)).join(''),
  PermitInspectionStatus: (d) => simpleTable(['Inspection', 'Status', 'Date'], arr(d.inspections).map((i) => [txt(i?.name), pill(i?.status), esc(formatDate(i?.date))])),
  CodeComplianceChecklist: (d) => simpleTable(['Code / item', 'Status', 'Date'], arr(d.items).map((i) => [txt(i?.code), pill(i?.status), esc(formatDate(i?.date))])),
  ToolsDeployedRoster: (d) => simpleTable(['Tool / equipment', 'Category', 'Qty'], arr(d.tools).map((t) => [txt(t?.name), txt(t?.category), formatNumber(t?.quantity, 2)])),
  DisturbanceLog: (d) => simpleTable(['Activity', 'Hours', 'Level'], arr(d.periods).map((p) => [txt(p?.type), txt(p?.hours), pill(p?.level)])),
  ChangeOrderAlert: (d) => kvGrid([
    ['Reason', txt(d.reason)],
    ['Cost impact', str(d.impact_cost) !== '' ? money(d.impact_cost) : ''],
    ['Schedule impact', str(d.impact_days) !== '' ? `${formatNumber(d.impact_days, 1)} days` : ''],
    ['Status', pill(d.status)],
    ['Reference', txt(d.reference_id)],
  ]),
  MaterialBurnRate: (d) => {
    const allocated = toNumber(d.allocated);
    const used = toNumber(d.used);
    return progressBlock(`${str(d.material) || 'Material'} used`, allocated ? (used / allocated) * 100 : 0, `${formatNumber(used)} of ${formatNumber(allocated)} ${str(d.unit)}`);
  },
  ProjectHealthSummary: (d) => {
    const facets = d.facets && typeof d.facets === 'object' ? d.facets : {};
    return kvGrid([['Overall score', str(d.score) !== '' ? formatNumber(d.score, 0) : ''], ['Status', pill(d.status)]])
      + Object.entries(facets).map(([k, v]) => progressBlock(humanize(k), v)).join('');
  },
  WarrantyRibbon: (d) => kvGrid([
    ['Warranty', str(d.years) !== '' ? `${formatNumber(d.years, 1)} years` : ''],
    ['Coverage', txt(d.coverage)],
    ['Expires', esc(formatDate(d.expiry_date))],
  ]),
  BeforeAfterGrid: (d) => {
    const before = safeUrl(d.before_url);
    const after = safeUrl(d.after_url);
    if (!before && !after) return '';
    const fig = (src: string, cap: string) => (src ? `<figure class="cd-w-photo"><img src="${src}" crossorigin="anonymous" alt="${cap}"><figcaption>${cap}</figcaption></figure>` : '');
    return `<div class="cd-w-photos">${fig(before, 'Before')}${fig(after, 'After')}</div>`;
  },
  FinishSwatchBlock: (d) => {
    const sw = arr(d.swatches).filter((s) => s && str(s.name));
    if (!sw.length) return '';
    return `<div class="cd-w-swatches">${sw
      .map((s) => `<div class="cd-w-swatch"><span class="cd-w-chip" style="background:${safeColor(s.hex, '#cccccc')}"></span><div><div class="cd-w-swatch-name">${txt(s.name)}</div><div class="cd-w-sub">${txt(s.manufacturer)} ${txt(s.hex)}</div></div></div>`)
      .join('')}</div>`;
  },
  EquipmentRentalTracker: (d) => {
    const total = toNumber(d.total_days);
    const left = toNumber(d.days_remaining);
    return kvGrid([
      ['Equipment', txt(d.equipment)],
      ['Rental period', [formatDate(d.start_date), formatDate(d.end_date)].filter(Boolean).map(esc).join(' → ')],
      ['Days remaining', str(d.days_remaining) !== '' ? formatNumber(left, 0) : ''],
    ]) + (total ? bar(((total - left) / total) * 100) : '');
  },
  MaintenanceTimeline: (d) => simpleTable(['Period', 'Date', 'Tasks'], arr(d.next_services).map((s) => [txt(s?.period), esc(formatDate(s?.date)), esc(arr(s?.tasks).map(str).filter(Boolean).join(', '))])),
  DigitalApprovalBlock: (d) => kvGrid([
    ['Approved by', txt(d.signatory)],
    ['Date', esc(formatDate(d.timestamp))],
    ['Verification code', txt(d.verification_code)],
  ]),
};

/** Generic, readable fallback for any widget type we don't have a dedicated layout for. */
const genericWidget = (data: AnyRec): string => {
  const scalars: Array<[string, string]> = [];
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data || {})) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object') {
        const keys = Array.from(new Set(v.flatMap((row) => (row && typeof row === 'object' ? Object.keys(row) : [])))).slice(0, 5);
        parts.push(`<div class="cd-w-subtitle">${esc(humanize(k))}</div>` + simpleTable(keys.map(humanize), v.map((row) => keys.map((key) => {
          const cell = row?.[key];
          return Array.isArray(cell) ? esc(cell.map(str).filter(Boolean).join(', ')) : txt(cell);
        }))));
      } else {
        scalars.push([humanize(k), esc(v.map(str).filter(Boolean).join(', '))]);
      }
    } else if (typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) if (typeof v2 !== 'object') scalars.push([humanize(k2), txt(v2)]);
    } else if (/_url$|url$/i.test(k)) {
      continue;
    } else {
      scalars.push([humanize(k), txt(v)]);
    }
  }
  return kvGrid(scalars) + parts.join('');
};

export const renderWidgetHtml = (type: string, data: AnyRec): string => {
  const fn = WIDGETS[type];
  let body = '';
  try {
    body = fn ? fn(data || {}) : genericWidget(data || {});
  } catch {
    body = '';
  }
  if (!body.trim()) return '';
  return `<div class="cd-widget" data-widget="${esc(type)}"><div class="cd-w-title">${esc(humanize(type))}</div>${body}</div>`;
};

/** Full "Project insights" body for ai_visual_data; '' when there is nothing to show. */
export const renderVisualsHtml = (visual: AIVisualData | null | undefined): string => {
  if (!visual || typeof visual !== 'object') return '';
  const blocks: string[] = [];
  const m = metricsGrid(visual.metrics as any[]);
  if (m) blocks.push(`<div class="cd-widget">${m}</div>`);
  if (visual.progress_percentage !== undefined && visual.progress_percentage !== null && str(visual.progress_percentage) !== '') {
    blocks.push(`<div class="cd-widget">${progressBlock('Project progress', visual.progress_percentage)}</div>`);
  }
  const chart = barChart(visual.chart_data as any[]);
  if (chart) blocks.push(`<div class="cd-widget">${chart}</div>`);
  const widgets = arr(visual.widgets)
    .filter((w) => w && typeof w.type === 'string')
    .sort((a, b) => toNumber(a.order) - toNumber(b.order));
  for (const w of widgets) {
    const html = renderWidgetHtml(w.type, w.data as AnyRec);
    if (html) blocks.push(html);
  }
  return blocks.join('');
};
