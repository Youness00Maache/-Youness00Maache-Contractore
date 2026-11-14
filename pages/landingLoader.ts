/**
 * Code-split loader for landing page bodies (content/landing/pages/<key>.ts), like blogLoader.ts for posts.
 * The marketing bundle only carries the small registry; each page body is its own chunk. The client preloads the
 * current page before hydrating; the SSR entry loads it before rendering.
 */
import type { LandingContent } from '../content/landing/types.ts';
import { LANDING_PAGES, getLandingMeta } from '../content/landing/registry.ts';
import { normalizePath } from './routes.ts';

const loaders = import.meta.glob<{ default: LandingContent }>('../content/landing/pages/*.ts');
const cache = new Map<string, LandingContent>();

const fileFor = (key: string) => `../content/landing/pages/${key}.ts`;

export const hasLandingBody = (key: string): boolean => Boolean(loaders[fileFor(key)]);

export const getLoadedLanding = (key: string): LandingContent | undefined => cache.get(key);

export async function loadLanding(key: string): Promise<LandingContent | null> {
  const cached = cache.get(key);
  if (cached) return cached;
  const loader = loaders[fileFor(key)];
  if (!loader) return null;
  const mod = await loader();
  cache.set(key, mod.default);
  return mod.default;
}

/** The landing content already loaded for a path (client-side SEO sync), if any. */
export const getLoadedLandingForPath = (pathname: string): LandingContent | undefined => {
  const meta = getLandingMeta(normalizePath(pathname));
  return meta ? cache.get(meta.key) : undefined;
};

/** Loads the landing body for a path when the path is a landing page (no-op otherwise). */
export async function preloadLanding(pathname: string): Promise<void> {
  const meta = getLandingMeta(normalizePath(pathname));
  if (!meta) return;
  try { await loadLanding(meta.key); } catch { /* the page shows a retry state */ }
}

/** Every landing body (build time only: llms-full.txt). */
export async function loadAllLanding(): Promise<Map<string, LandingContent>> {
  const out = new Map<string, LandingContent>();
  for (const meta of LANDING_PAGES) {
    const c = await loadLanding(meta.key);
    if (c) out.set(meta.key, c);
  }
  return out;
}
