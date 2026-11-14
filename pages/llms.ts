/**
 * /llms.txt and /llms-full.txt (https://llmstxt.org), generated at build time by scripts/prerender.mjs from the same
 * data as the site (plans, site copy, blog registry), so they never go stale. Plain text for AI assistants.
 */
import { SITE, DOCUMENT_TYPES, HOME_FAQ, PRICING_FAQ } from '../content/site.ts';
import { PLANS, FREE_LIMITS, PAID_AI_LIMITS } from '../lib/plans.ts';
import { BLOG_POSTS } from '../content/blog/registry.ts';
import type { BlogPostContent } from '../content/blog/types.ts';
import { STATIC_MARKETING_ROUTES } from './routes.ts';

const abs = (p: string) => (p === '/' ? `${SITE.url}/` : `${SITE.url}${p}`);
const strip = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|\*/g, '');
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

const KEY_PAGES: [string, string][] = [
  ['/', 'Home: what ContractorDocs is'],
  ['/features', 'Features'],
  ['/pricing', 'Pricing and plan limits'],
  ['/templates', 'Document templates'],
  ['/invoice-generator', 'Free contractor invoice generator (no sign-up)'],
  ['/estimate-generator', 'Free construction estimate generator (no sign-up)'],
  ['/help', 'Help center: step-by-step guides for every feature'],
  ['/blog', 'Blog: contractor paperwork guides'],
  ['/security', 'Security'],
  ['/about', 'About'],
];

const intro = (): string[] => [
  `# ${SITE.name}`,
  '',
  `> ${SITE.name} (${SITE.url}) is web-based paperwork software for contractors and small trade businesses: general contractors, remodelers, electricians, plumbers, HVAC, roofers, painters, landscapers and handymen. It creates invoices, estimates, change orders, work orders, daily job reports and more, with an AI assistant (powered by Google Gemini) that drafts documents from a typed or spoken description. Free plan available; paid plans cost ${money(PLANS.premium.monthlyPrice)} and ${money(PLANS.ai.monthlyPrice)} per month.`,
  '',
  '## Key facts',
  `- ${DOCUMENT_TYPES.length} document types: ${DOCUMENT_TYPES.map((d) => d.name).join(', ')}. Each belongs to a job and a client and exports to a PDF with the contractor's logo.`,
  "- AI document drafting: describe a job in a sentence (or dictate it) and the assistant drafts an estimate, invoice, change order, daily report or good/better/best estimate options. Lines that match the contractor's price book get its prices; it does not invent other prices. Nothing is saved or sent until the user reviews it.",
  '- Client portal with online approval and e-signatures on estimates and change orders; clients sign on their phone without creating an account.',
  "- Sends documents as PDF attachments from the contractor's own Gmail, plus automatic invoice and estimate reminders.",
  "- \"Pay now\" link to the contractor's own payment provider (PayPal, Square or a Stripe link) and one-tap Mark as paid with an automatic receipt. There is no built-in card processing.",
  '- Also: price book and kits, inventory with QR labels, purchase orders to suppliers, job photos with before/after reports, a request-a-quote link and QR code, a pipeline board, job costing (budget vs actual), time-and-materials invoices, a profit calculator and export of all data (PDFs + CSV) on every plan.',
  '- Runs in the browser on phones, tablets and computers (can be added to the home screen); it is not a native app-store app.',
  '',
  '## Plans (USD)',
  ...(['free', 'premium', 'ai'] as const).map((t) => {
    const p = PLANS[t];
    const price = t === 'free' ? '$0' : `${money(p.monthlyPrice)}/month or ${money(p.yearlyPrice)}/year`;
    return `- ${p.name} (${price}): ${p.features.join('; ')}.`;
  }),
  `- AI requests per month: ${FREE_LIMITS.ai} on Free, ${PAID_AI_LIMITS.premium} on ${PLANS.premium.name}, ${PAID_AI_LIMITS.ai} on ${PLANS.ai.name}. Payments are processed by Kelviq (merchant of record). Cancel anytime. Details: ${abs('/pricing')}`,
];

export function buildLlmsTxt(): string {
  return [
    ...intro(),
    '',
    '## Key pages',
    ...KEY_PAGES.map(([p, l]) => `- [${l}](${abs(p)})`),
    '',
    '## Guides',
    ...BLOG_POSTS.map((p) => `- [${p.title}](${abs(`/blog/${p.slug}`)}): ${p.description}`),
    '',
    '## Optional',
    `- [Full product description, FAQ and guide summaries](${abs('/llms-full.txt')})`,
    `- [Sitemap](${abs('/sitemap.xml')})`,
    '',
  ].join('\n');
}

export function buildLlmsFullTxt(posts: Map<string, BlogPostContent>): string {
  const out: string[] = [
    ...intro(),
    '',
    '## Frequently asked questions',
    ...[...HOME_FAQ, ...PRICING_FAQ].flatMap((f) => [`### ${f.q}`, strip(f.a), '']),
    '## Pages',
    ...STATIC_MARKETING_ROUTES.map((p) => `- ${abs(p)}`),
    '',
    '## Guides',
  ];
  for (const meta of BLOG_POSTS) {
    const c = posts.get(meta.slug);
    out.push('', `### ${meta.title}`, `URL: ${abs(`/blog/${meta.slug}`)}`, `Updated: ${meta.updated || meta.date}`, meta.description);
    if (c) out.push('', strip(c.answer), '', 'Key takeaways:', ...c.takeaways.map((t) => `- ${strip(t)}`));
  }
  out.push('');
  return out.join('\n');
}
