/**
 * Lints blog posts in content/blog/posts/*.ts and landing pages in content/landing/pages/*.ts against the content rules.
 * Usage: npx tsx scripts/seo-blog-lint.ts [slug-or-landing-key ...]   (no args = every post and landing page)
 * Exit code 1 when any post fails.
 */
import { BLOG_POSTS } from '../content/blog/registry.ts';
import { LANDING_PAGES } from '../content/landing/registry.ts';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const STATIC_LINKS = new Set([
  '/', '/features', '/pricing', '/templates', '/invoice-generator', '/estimate-generator', '/about', '/contact',
  '/security', '/privacy', '/terms', '/blog', '/auth/signup', '/auth/login', '/help',
  ...LANDING_PAGES.map((p) => p.path),
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
  const answer: string = post?.answer || '';
  if (answer.length < 150 || answer.length > 480) errors.push(`answer is ${answer.length} chars (want 150–480: 2–3 sentences)`);
  if (post?.howTo) {
    const steps = post.howTo.steps || [];
    if (steps.length < 3 || steps.length > 10) errors.push(`howTo has ${steps.length} steps (want 3–10)`);
    for (const s of steps) if (!s.name || !s.text) errors.push('howTo step without name or text');
  }
  if (!post?.cta?.href || !isValidInternalLink(post.cta.href)) errors.push('cta.href missing or invalid');
  const minutes = Math.max(1, Math.round(words / 230));
  if (Math.abs(minutes - meta.readingTime) > 2) errors.push(`registry readingTime ${meta.readingTime} vs computed ${minutes}`);
  return errors.map((e) => `${slug}: ${e}`).concat(errors.length ? [] : [`${slug}: OK (${words} words, ${h2} H2, ${internal.length} internal links)`]);
}

/** Landing pages (content/landing/pages/*.ts): structure, length, links and the comparison rules. */
async function lintLanding(key: string): Promise<string[]> {
  const errors: string[] = [];
  const meta = LANDING_PAGES.find((p) => p.key === key);
  if (!meta) return [`landing ${key}: not in content/landing/registry.ts`];
  const file = path.resolve('content/landing/pages', `${key}.ts`);
  if (!existsSync(file)) return [`landing ${key}: missing file content/landing/pages/${key}.ts`];
  const page = (await import(pathToFileURL(file).href)).default;
  if (!page || page.key !== key) errors.push('default export missing or key mismatch');
  if (page?.kind !== meta.kind) errors.push(`kind "${page?.kind}" != registry kind "${meta.kind}"`);
  if (meta.description.length < 120 || meta.description.length > 160) errors.push(`registry description is ${meta.description.length} chars (want 120–160)`);
  if (meta.title.length > 65) errors.push(`registry title is ${meta.title.length} chars (max 65)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) errors.push(`registry updated "${meta.updated}" is not YYYY-MM-DD`);
  const answer: string = page?.answer || '';
  if (answer.length < 150 || answer.length > 640) errors.push(`answer is ${answer.length} chars (want 150–640: 2–3 sentences)`);
  const faq = page?.faq || [];
  if (faq.length < 4 || faq.length > 6) errors.push(`faq has ${faq.length} entries (want 4–6)`);
  const related: string[] = page?.related || [];
  if (related.length < 2 || related.length > 4) errors.push(`related has ${related.length} posts (want 2–4)`);
  for (const slug of related) if (!slugs.has(slug)) errors.push(`related post "${slug}" does not exist`);
  const text = JSON.stringify(page);
  for (const m of text.matchAll(/\]\((\/[^)\s]*)\)/g)) if (!isValidInternalLink(m[1])) errors.push(`invalid internal link: ${m[1]}`);
  if (/kelviq|merchant of record/i.test(text)) errors.push('mentions the billing provider / merchant of record (owner rule)');
  const count = (arr: unknown[] | undefined, name: string, min: number, max: number) => {
    const n = Array.isArray(arr) ? arr.length : 0;
    if (n < min || n > max) errors.push(`${name} has ${n} entries (want ${min}–${max})`);
  };
  if (page?.kind === 'trade') {
    count(page.documents, 'documents', 4, 6);
    count(page.workflow, 'workflow', 3, 5);
    count(page.tips, 'tips', 3, 5);
    count(page.sample?.lines, 'sample.lines', 3, 10);
  } else if (page?.kind === 'ai') {
    count(page.steps, 'steps', 3, 10);
    count(page.can, 'can', 4, 6);
    count(page.limits, 'limits', 3, 5);
    count(page.sample?.lines, 'sample.lines', 3, 10);
    if (!page.prompt) errors.push('prompt missing');
  } else if (page?.kind === 'compare') {
    count(page.rows, 'rows', 8, 12);
    count(page.pickThem, 'pickThem', 2, 6);
    count(page.pickUs, 'pickUs', 2, 6);
    count(page.sources, 'sources', 1, 8);
    if (page.asOf !== 'November 2026') errors.push(`asOf is "${page.asOf}" (want "November 2026")`);
    if (!String(page.answer).includes(`As of ${page.asOf}`)) errors.push('answer must date the competitor facts ("As of November 2026")');
    for (const src of page.sources || []) if (!/^https:\/\//.test(src.url) || !src.label) errors.push(`bad source ${JSON.stringify(src)}`);
    for (const r of page.rows || []) if (!r.topic || !r.us || !r.them) errors.push(`incomplete row ${JSON.stringify(r).slice(0, 80)}`);
  }
  return errors.map((e) => `landing ${key}: ${e}`).concat(errors.length ? [] : [`landing ${key}: OK (${meta.path})`]);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const targets = argv.length ? argv.filter((a) => slugs.has(a)) : BLOG_POSTS.map((p) => p.slug);
  const landingTargets = argv.length ? argv.filter((a) => LANDING_PAGES.some((p) => p.key === a)) : LANDING_PAGES.map((p) => p.key);
  for (const a of argv) if (!slugs.has(a) && !LANDING_PAGES.some((p) => p.key === a)) targets.push(a);
  let failed = false;
  for (const slug of targets) {
    const lines = await lint(slug);
    for (const line of lines) {
      if (!line.includes(': OK (')) failed = true;
      console.log(line);
    }
  }
  for (const key of landingTargets) {
    const lines = await lintLanding(key);
    for (const line of lines) {
      if (!line.includes(': OK (')) failed = true;
      console.log(line);
    }
  }
  process.exit(failed ? 1 : 0);
}
