/**
 * Small helpers shared by the design modules (themes.ts and designs/*.ts). Import from here, never from
 * themes.ts (designs/*.ts are imported by themes.ts and registry.ts, so importing those back would be circular).
 */
import { parseColor } from './colors.ts';
import { block, type Parts, type RenderCtx } from './blocks.ts';

/** `rgba()` of any palette color. */
export const rgba = (color: string, a: number) => {
  const c = parseColor(color) || { r: 0, g: 0, b: 0 };
  return `rgba(${c.r},${c.g},${c.b},${a})`;
};

/** Meta items as a horizontal strip block (label above value). */
export const metaStrip = (ctx: RenderCtx, cls: string) =>
  ctx.m.meta.length
    ? block(cls, ctx.m.meta.map((i) => `<div class="cd-strip-item"><div class="cd-label">${i.label}</div><div class="cd-strip-value">${i.value}</div></div>`).join(''))
    : '';

/** Meta items as "Label: value" lines. */
export const metaLines = (ctx: RenderCtx, cls = 'cd-meta-lines') =>
  ctx.m.meta.length ? `<div class="${cls}">${ctx.m.meta.map((i) => `<div><span class="cd-ml-label">${i.label}:</span> <span class="cd-ml-value">${i.value}</span></div>`).join('')}</div>` : '';

/** Copy of the default parts with some of them emptied (for compose()). */
export const without = (p: Parts, ...keys: Array<keyof Parts>) => {
  const copy: Parts = { ...p };
  for (const k of keys) (copy as any)[k] = Array.isArray(copy[k]) ? [] : '';
  return copy;
};
