/**
 * Proposal builder sections (lib/proposal.ts) for the shared document model, so EVERY design prints them:
 *   before the items: Scope of work / Inclusions / Exclusions / Assumptions / Timeline (in the owner's order);
 *   after the totals: Optional add-ons (not in the total), Payment schedule, Project photos.
 * Each one is a normal model Section (rendered by blocks.ts sectionBlock: data-split="children", the paginator keeps
 * the title with its first row and splits between paragraphs / list items / table rows / photo rows).
 * Styles are inline (no new CSS), so documents without these fields render byte-identical.
 * Every string is escaped here.
 */
import { esc, escMultiline, safeUrl } from '../escapeHtml.ts';
import { lineItemScheduledValue, isExcludedOptionalLine, toNumber } from '../money.ts';
import { money, formatNumber, type FormatOptions } from './format.ts';
import { bulletItems, computeMilestones, filledSections, readProposal } from '../../lib/proposal.ts';
import type { Section } from './model.ts';

const R = 'text-align:right;white-space:nowrap;';

/** Scope sections, in the owner's order. */
export const proposalScopeSections = (data: unknown): Section[] =>
  filledSections(readProposal(data)).map((s) => {
    const html = s.style === 'bullets'
      ? `<ul>${bulletItems(s.text).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
      : s.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${escMultiline(p)}</p>`).join('');
    return { id: `proposal-${s.kind}`, title: esc(s.title), html, rich: true };
  });

/** "Optional add-ons": unselected optional lines with their price, clearly not in the total. */
export const optionalAddOnsSection = (lineItems: unknown, fmt: FormatOptions): Section | null => {
  const items = (Array.isArray(lineItems) ? lineItems : []).filter((li) => li && typeof li === 'object' && isExcludedOptionalLine(li)) as Array<Record<string, unknown>>;
  if (!items.length) return null;
  const rows = items.map((li) => {
    const qty = toNumber(li.quantity);
    const desc = String(li.description ?? '').trim();
    const unit = typeof li.unit === 'string' && li.unit.trim() ? ` ${esc(li.unit.trim().slice(0, 24))}` : '';
    const detail = qty !== 1 ? ` <span class="cd-muted">(${formatNumber(qty, 3)}${unit} × ${money(li.rate, fmt)})</span>` : '';
    return `<tr><td><span style="display:inline-block;margin-right:6px;padding:0 5px;border:1px solid currentColor;border-radius:3px;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.75;">Optional</span>${desc ? escMultiline(desc) : '<span class="cd-muted">Add-on</span>'}${detail}</td><td style="${R}">${money(lineItemScheduledValue(li as never), fmt)}</td></tr>`;
  }).join('');
  return {
    id: 'proposal-optional',
    title: 'Optional add-ons',
    html: `<p class="cd-muted">Not included in the total above. Ask us to add any of them.</p><table><thead><tr><th>Add-on</th><th style="${R}">Price</th></tr></thead><tbody>${rows}</tbody></table>`,
    rich: true,
  };
};

/** "Payment schedule": milestones with their share and amount of the document total. */
export const paymentScheduleSection = (data: unknown, total: number, fmt: FormatOptions): Section | null => {
  const sched = computeMilestones(readProposal(data).milestones, total);
  if (!sched.rows.length) return null;
  const rows = sched.rows.map((m) => `<tr><td>${esc(m.label)}${m.due ? ` <span class="cd-muted">· ${esc(m.due)}</span>` : ''}</td><td style="${R}">${formatNumber(m.percent, 2)}%</td><td style="${R}">${money(m.amount, fmt)}</td></tr>`).join('');
  const foot = `<tr><td><strong>Total</strong></td><td style="${R}">${sched.error ? '' : '100%'}</td><td style="${R}"><strong>${money(sched.error ? sched.sum : sched.total, fmt)}</strong></td></tr>`;
  return {
    id: 'proposal-payments',
    title: 'Payment schedule',
    html: `<table><thead><tr><th>Payment</th><th style="${R}">Share</th><th style="${R}">Amount</th></tr></thead><tbody>${rows}${foot}</tbody></table>`,
    rich: true,
  };
};

/** "Project photos": two per row with captions (each row splits across pages on its own). */
export const projectPhotosSection = (data: unknown): Section | null => {
  const imgs = readProposal(data).images.map((i) => ({ src: safeUrl(i.url), caption: i.caption })).filter((i) => i.src);
  if (!imgs.length) return null;
  const rows: string[] = [];
  for (let i = 0; i < imgs.length; i += 2) {
    const cells = imgs.slice(i, i + 2).map((im) => `<figure style="flex:1 1 0;min-width:0;margin:0;"><img src="${im.src}" crossorigin="anonymous" alt="" style="display:block;width:100%;height:190px;object-fit:cover;border-radius:4px;">${im.caption ? `<figcaption style="margin-top:4px;font-size:10.5px;line-height:1.35;">${esc(im.caption)}</figcaption>` : ''}</figure>`);
    if (cells.length === 1) cells.push('<div style="flex:1 1 0;"></div>');
    rows.push(`<div style="display:flex;gap:12px;margin:0 0 12px;">${cells.join('')}</div>`);
  }
  return { id: 'proposal-photos', title: 'Project photos', html: rows.join(''), rich: true };
};
