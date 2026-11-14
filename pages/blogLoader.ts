/**
 * Code-split loader for blog post bodies. Each post is its own chunk, so the landing page doesn't
 * download ~15 long articles. The client preloads the current post before hydrating; the SSR entry
 * loads posts before rendering them.
 */
import type { BlogPostContent } from '../content/blog/types.ts';
import { normalizePath } from './routes.ts';
import { preloadLanding } from './landingLoader.ts';

const loaders = import.meta.glob<{ default: BlogPostContent }>('../content/blog/posts/*.ts');
const cache = new Map<string, BlogPostContent>();

const keyFor = (slug: string) => `../content/blog/posts/${slug}.ts`;

export const hasPostBody = (slug: string): boolean => Boolean(loaders[keyFor(slug)]);

export const getLoadedPost = (slug: string): BlogPostContent | undefined => cache.get(slug);

export async function loadPost(slug: string): Promise<BlogPostContent | null> {
  const cached = cache.get(slug);
  if (cached) return cached;
  const loader = loaders[keyFor(slug)];
  if (!loader) return null;
  const mod = await loader();
  cache.set(slug, mod.default);
  return mod.default;
}

/** Loads whatever data the marketing route needs before the first render (hydration must match). */
export async function preloadRouteData(pathname: string): Promise<void> {
  const m = normalizePath(pathname).match(/^\/blog\/([a-z0-9-]+)$/);
  if (m) {
    try { await loadPost(m[1]); } catch { /* the page shows a retry state */ }
    return;
  }
  await preloadLanding(pathname);
}
