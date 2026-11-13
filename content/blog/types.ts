/**
 * Blog content model.
 *
 * - Metadata for every post lives in `content/blog/registry.ts` (small, bundled with the marketing site).
 * - The long-form body of each post lives in `content/blog/posts/<slug>.ts` and is code-split: it is only
 *   downloaded when somebody opens that post (the prerendered HTML already contains the full text for SEO).
 *
 * Body format: a small, safe Markdown subset rendered by `pages/components/Markdown.tsx` (no raw HTML):
 *   ## Heading 2 / ### Heading 3
 *   paragraphs separated by a blank line
 *   - bullet item            1. numbered item          - [ ] checklist item
 *   | table | header |  followed by  | --- | --- |  and rows
 *   > blockquote / callout (a line starting with "> ")
 *   inline: **bold**, *italic*, [link text](/internal-path or https://...)
 */

export type BlogCategory =
  | 'Invoicing & Payments'
  | 'Estimating & Profit'
  | 'Project Paperwork'
  | 'Field Reports & Crews'
  | 'Running Your Business';

export interface BlogPostMeta {
  slug: string;
  /** H1 and <title> (the page appends " | ContractorDocs" to <title> when it fits). */
  title: string;
  /** Meta description, 140–160 characters. */
  description: string;
  /** ISO date (YYYY-MM-DD) of first publication. */
  date: string;
  /** ISO date of the last meaningful update. */
  updated?: string;
  author: string;
  category: BlogCategory;
  /** Minutes, computed from the body word count (≈ 230 wpm). */
  readingTime: number;
  keywords: string[];
  /** 2–3 related post slugs. */
  related: string[];
}

export interface BlogFaq {
  q: string;
  /** Plain text; inline Markdown links/bold allowed. */
  a: string;
}

export interface BlogCta {
  heading: string;
  text: string;
  href: string;
  label: string;
}

export interface BlogPostContent {
  slug: string;
  /** 3–5 short "key takeaways" shown in a box under the H1. */
  takeaways: string[];
  /** Markdown subset (see top of file). Starts with the intro paragraphs; never contains an H1. */
  body: string;
  /** 4–6 questions; rendered as an FAQ section and as FAQPage JSON-LD. */
  faq: BlogFaq[];
  cta: BlogCta;
}

export type BlogPost = BlogPostMeta & BlogPostContent;
