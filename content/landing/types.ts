/**
 * High-intent landing pages: AI generators (/ai-…), trade pages (/for/<trade>) and comparison pages (/compare/<x>).
 *
 * - Metadata for every page lives in `content/landing/registry.ts` (small, bundled with the marketing site; used for
 *   <title>, sitemap, footer links and llms.txt).
 * - The body of each page lives in `content/landing/pages/<key>.ts` and is code-split like blog posts: it is only
 *   downloaded when somebody opens that page (the prerendered HTML already contains the full text).
 *
 * Text fields allow the same inline Markdown as blog posts: **bold**, *italic*, [link](/internal-path or https://…).
 * Keep every claim true to the product (lib/plans.ts, components/help/helpContent.ts). No invented stats, ratings or
 * testimonials.
 */
import type { FaqItem } from '../site.ts';

export type LandingKind = 'ai' | 'trade' | 'compare';

export interface LandingMeta {
  /** Module name: content/landing/pages/<key>.ts */
  key: string;
  /** Public URL path, e.g. "/for/electricians". */
  path: string;
  kind: LandingKind;
  /** Short link label used in the footer, related links and llms.txt. */
  label: string;
  /** <title> (unique, ideally ≤ 65 characters). */
  title: string;
  /** Meta description, 120–160 characters. */
  description: string;
  /** ISO date of the last meaningful update (sitemap lastmod). */
  updated: string;
}

export interface LineExample {
  description: string;
  qty: number;
  unit: string;
  /** Unit price in USD. Example figures only; labelled as examples on the page. */
  rate: number;
}

export interface SampleDocument {
  type: 'Estimate' | 'Invoice' | 'Change Order';
  /** e.g. "Panel upgrade, 100 A to 200 A" */
  title: string;
  lines: LineExample[];
  /** Percent, e.g. 7 for 7%. Omit for no tax line. */
  taxRate?: number;
  /** Short note / terms printed under the lines. */
  note?: string;
}

interface LandingBase {
  key: string;
  eyebrow: string;
  h1: string;
  subtitle: string;
  /** The short answer: 2–3 sentences shown first (answer engines quote this). */
  answer: string;
  /** 4–6 questions; rendered as an FAQ section and as FAQPage JSON-LD. */
  faq: FaqItem[];
  /** 2–4 related blog post slugs. */
  related: string[];
}

export interface TradeContent extends LandingBase {
  kind: 'trade';
  /** Plural trade name used in sentences: "electricians". */
  trade: string;
  /** The documents this trade sends most, and what each is for in this trade (4–6). */
  documents: { name: string; use: string }[];
  /** A realistic example estimate or invoice for this trade (example prices). */
  sample: SampleDocument;
  /** How ContractorDocs features fit this trade's week (3–5). */
  workflow: { title: string; text: string }[];
  /** Trade-specific paperwork tips (3–5). */
  tips: string[];
}

export interface CompareContent extends LandingBase {
  kind: 'compare';
  competitor: string;
  /** "November 2026" */
  asOf: string;
  /** Side-by-side facts (8–12). Competitor facts must come from a cited public source. */
  rows: { topic: string; us: string; them: string }[];
  /** When the competitor is the better fit (be fair). */
  pickThem: string[];
  /** When ContractorDocs is the better fit. */
  pickUs: string[];
  /** Public sources for every competitor fact on the page. */
  sources: { label: string; url: string }[];
}

export interface AiContent extends LandingBase {
  kind: 'ai';
  /** What the contractor types or says. */
  prompt: string;
  /** What the assistant drafts from that prompt (example prices from a price book). */
  sample: SampleDocument;
  /** How it works, step by step (also HowTo JSON-LD). */
  steps: { title: string; text: string }[];
  /** What the AI does in ContractorDocs (4–6). */
  can: { title: string; text: string }[];
  /** Honest limits (3–5). */
  limits: string[];
}

export type LandingContent = TradeContent | CompareContent | AiContent;
