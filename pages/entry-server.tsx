/**
 * SSR entry used only at build time (vite build --ssr pages/entry-server.tsx) by scripts/prerender.mjs.
 * Renders a marketing route to static HTML + its <head> tags. Never imports the app or Supabase.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import MarketingSite from './MarketingSite.tsx';
import { getPageSeo, renderHeadTags, NOT_FOUND_SEO, type PageSeo } from './seo.ts';
import { getPrerenderRoutes, normalizePath } from './routes.ts';
import { loadPost } from './blogLoader.ts';
import { SITE } from '../content/site.ts';
import { BLOG_POSTS } from '../content/blog/registry.ts';
import { buildLlmsTxt, buildLlmsFullTxt } from './llms.ts';
import type { BlogPostContent } from '../content/blog/types.ts';

export interface RenderResult {
  path: string;
  html: string;
  head: string;
  seo: PageSeo;
}

export async function render(url: string): Promise<RenderResult> {
  const path = normalizePath(url);
  const slug = path.startsWith('/blog/') ? path.slice('/blog/'.length) : '';
  const post = slug ? await loadPost(slug) : null;
  const seo = getPageSeo(path, post) || NOT_FOUND_SEO(path);
  const html = renderToString(
    <React.StrictMode>
      <StaticRouter location={path}>
        <MarketingSite />
      </StaticRouter>
    </React.StrictMode>,
  );
  return { path, html, head: renderHeadTags(seo), seo };
}

export const routes = (): string[] => getPrerenderRoutes();

export const site = SITE;

/** Plain data for scripts (sitemap / checks). */
export const blogPosts = () => BLOG_POSTS.map((p) => ({ slug: p.slug, title: p.title, date: p.date, updated: p.updated || p.date }));

/** /llms.txt and /llms-full.txt text (written to dist/ by scripts/prerender.mjs). */
export async function llms(): Promise<{ short: string; full: string }> {
  const posts = new Map<string, BlogPostContent>();
  for (const p of BLOG_POSTS) {
    const c = await loadPost(p.slug);
    if (c) posts.set(p.slug, c);
  }
  return { short: buildLlmsTxt(), full: buildLlmsFullTxt(posts) };
}
