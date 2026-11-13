/**
 * Lints blog posts in content/blog/posts/*.ts against the content rules.
 * Usage: npx tsx scripts/seo-blog-lint.ts [slug ...]   (no args = all posts in the registry)
 * Exit code 1 when any post fails.
 */
import { BLOG_POSTS } from '../content/blog/registry.ts';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const STATIC_LINKS = new Set([
  '/', '/features', '/pricing', '/templates', '/invoice-generator', '/estimate-generator', '/about', '/contact',
  '/security', '/privacy', '/terms', '/blog', '/auth/signup', '/auth/login',
]);
const FEATURE_ANCHORS = new Set(['documents', 'ai-assistant', 'client-portal', 'gmail', 'inventory', 'profit-tracking', 'mobile']);
const slugs = new Set(BLOG_POSTS.map((p) => p.slug));

export const isValidInternalLink = (href: string): boolean => {
  const [pathPart, hash] = href.split('#');
  const clean = pathPart.split('?')[0] || '/';
  if (clean === '/features' && hash) return FEATURE_ANCHORS.has(hash);
  if (STATIC_LINKS.has(clean)) return true;
  const m = clean.match(/^\/blog\/([a-z0-9-]+)$/);
  return Boolean(m && slugs.has(m[1]));
};

export const countWords = (text: string): number =>
  text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*|`_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;

async function lint(slug: string): Promise<string[]> {
  const errors: string[] = [];
  const meta = BLOG_POSTS.find((p) => p.slug === slug);
  if (!meta) return [`${slug}: not in content/blog/registry.ts`];
  const file = path.resolve('content/blog/posts', `${slug}.ts`);
  if (!existsSync(file)) return [`${slug}: missing file content/blog/posts/${slug}.ts`];
  const mod = await import(pathToFileURL(file).href);
  const post = mod.default;
  if (!post || post.slug !== slug) errors.push('default export missing or slug mismatch');
  const body: string = post?.body || '';
  const words = countWords(body);
  if (words < 1200) errors.push(`body has ${words} words (min 1200)`);
  if (words > 2300) errors.push(`body has ${words} words (max ~2000, hard limit 2300)`);
  if (/^#\s/m.test(body)) errors.push('body must not contain an H1 ("# ")');
  const h2 = (body.match(/^## /gm) || []).length;
  if (h2 < 4) errors.push(`only ${h2} H2 sections (min 4)`);
  if (!/^\|.+\|\s*$/m.test(body)) errors.push('no table found');
  if (!/^- \[ \] /m.test(body)) errors.push('no checklist ("- [ ] ") found');
  if (/<[a-z/][^>]*>/i.test(body)) errors.push('raw HTML is not allowed');
  if (/\$\{/.test(body)) errors.push('"${" found in body');
  const links = [...body.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const faqText = (post?.faq || []).map((f: any) => `${f.q} ${f.a}`).join(' ');
  links.push(...[...faqText.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]));
  const internal = links.filter((l) => l.startsWith('/'));
  for (const l of internal) if (!isValidInternalLink(l)) errors.push(`invalid internal link: ${l}`);
  const postLinks = new Set(internal.filter((l) => l.startsWith('/blog/')).map((l) => l.split('#')[0]));
  if (postLinks.size < 2) errors.push(`links to ${postLinks.size} other posts in body/faq (min 2)`);
  const productLinks = internal.filter((l) => !l.startsWith('/blog'));
  if (productLinks.length < 2) errors.push(`only ${productLinks.length} links to product pages (min 2)`);
  if (!Array.isArray(post?.faq) || post.faq.length < 4) errors.push('faq needs at least 4 entries');
  if (!Array.isArray(post?.takeaways) || post.takeaways.length < 3) errors.push('takeaways needs at least 3 entries');
  if (!post?.cta?.href || !isValidInternalLink(post.cta.href)) errors.push('cta.href missing or invalid');
  const minutes = Math.max(1, Math.round(words / 230));
  if (Math.abs(minutes - meta.readingTime) > 2) errors.push(`registry readingTime ${meta.readingTime} vs computed ${minutes}`);
  return errors.map((e) => `${slug}: ${e}`).concat(errors.length ? [] : [`${slug}: OK (${words} words, ${h2} H2, ${internal.length} internal links)`]);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : BLOG_POSTS.map((p) => p.slug);
  let failed = false;
  for (const slug of targets) {
    const lines = await lint(slug);
    for (const line of lines) {
      if (!line.includes(': OK (')) failed = true;
      console.log(line);
    }
  }
  process.exit(failed ? 1 : 0);
}
