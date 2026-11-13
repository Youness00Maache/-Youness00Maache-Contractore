/**
 * Small color toolkit used by the document templates so that ANY accent color a user (or the AI)
 * picks still produces readable, print-friendly output: text drawn in the accent color is darkened
 * until it has enough contrast on the paper, and text drawn on accent fills is black or white.
 */
export interface RGB { r: number; g: number; b: number }

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#dc2626', green: '#15803d', blue: '#1d4ed8', navy: '#1e2a5a',
  teal: '#0f766e', orange: '#ea580c', purple: '#7e22ce', gray: '#6b7280', grey: '#6b7280', maroon: '#7f1d1d',
  olive: '#4d5b1f', gold: '#b8860b', yellow: '#facc15', pink: '#ec4899', brown: '#7c4a2d', silver: '#9ca3af',
  crimson: '#be123c', indigo: '#4338ca', darkblue: '#1e3a8a', darkgreen: '#14532d', darkred: '#991b1b',
  slategray: '#475569', slategrey: '#475569', royalblue: '#2563eb', steelblue: '#4682b4', tomato: '#ef4444',
  coral: '#f97316', lime: '#65a30d', aqua: '#06b6d4', fuchsia: '#c026d3',
};

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export const parseColor = (input: unknown): RGB | null => {
  if (typeof input !== 'string') return null;
  let v = input.trim().toLowerCase();
  if (!v) return null;
  if (NAMED[v]) v = NAMED[v];
  let m = /^#?([0-9a-f]{3,4})$/.exec(v);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (m) return { r: clamp255(+m[1]), g: clamp255(+m[2]), b: clamp255(+m[3]) };
  return null;
};

export const toHex = ({ r, g, b }: RGB): string =>
  '#' + [r, g, b].map((n) => clamp255(n).toString(16).padStart(2, '0')).join('');

/** Normalizes any supported color to #rrggbb, or returns the fallback. */
export const normalizeColor = (input: unknown, fallback: string): string => {
  const c = parseColor(input);
  return c ? toHex(c) : fallback;
};

export const mix = (a: string, b: string, t: number): string => {
  const ca = parseColor(a) || { r: 0, g: 0, b: 0 };
  const cb = parseColor(b) || { r: 255, g: 255, b: 255 };
  return toHex({ r: ca.r + (cb.r - ca.r) * t, g: ca.g + (cb.g - ca.g) * t, b: ca.b + (cb.b - ca.b) * t });
};

/** Lighter version of a color (t = 0 → color, t = 1 → white / paper). */
export const tint = (color: string, t: number, paper = '#ffffff') => mix(color, paper, t);
/** Darker version of a color (t = 0 → color, t = 1 → black). */
export const shade = (color: string, t: number) => mix(color, '#000000', t);

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export const luminance = (color: string): number => {
  const c = parseColor(color) || { r: 0, g: 0, b: 0 };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
};

export const contrastRatio = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Best text color (near-white or near-black) on top of a filled background. */
export const readableOn = (bg: string, light = '#ffffff', dark = '#111418'): string =>
  contrastRatio(light, bg) >= contrastRatio(dark, bg) ? light : dark;

/** Darkens (or lightens on dark paper) `fg` until it reaches `min` contrast against `bg`. */
export const ensureContrast = (fg: string, bg: string, min = 4.5): string => {
  let out = normalizeColor(fg, '#111418');
  const towards = luminance(bg) > 0.4 ? '#000000' : '#ffffff';
  for (let i = 0; i < 20 && contrastRatio(out, bg) < min; i++) out = mix(out, towards, 0.12);
  return out;
};

export const isLight = (color: string) => luminance(color) > 0.6;
