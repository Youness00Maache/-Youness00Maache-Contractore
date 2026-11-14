/**
 * Per-route SEO: titles, descriptions, canonical URLs, Open Graph / Twitter tags and JSON-LD.
 * Used by the prerenderer (static <head>) and by the marketing site on client-side navigation.
 */
import { SITE, HOME_FAQ, PRICING_FAQ, type FaqItem } from '../content/site.ts';
import { BLOG_POSTS, getPostMeta } from '../content/blog/registry.ts';
import type { BlogPostContent } from '../content/blog/types.ts';
import { PLANS } from '../lib/plans.ts';
import { normalizePath } from './routes.ts';
import { GENERATOR_FAQ } from './GeneratorPage.tsx';

export interface PageSeo {
  path: string;
  title: string;
  description: string;
  canonical: string;
  ogType: 'website' | 'article';
  noindex?: boolean;
  jsonLd: Record<string, unknown>[];
  article?: { published: string; modified: string; section: string; tags: string[] };
  lastmod: string;
}

const abs = (path: string) => (path === '/' ? `${SITE.url}/` : `${SITE.url}${path}`);

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;

const organization = () => ({
  '@type': 'Organization',
  '@id': ORG_ID,
  name: SITE.name,
  url: `${SITE.url}/`,
  logo: { '@type': 'ImageObject', url: SITE.logo, width: 512, height: 512 },
  email: SITE.email,
  contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: SITE.email, availableLanguage: ['English'] }],
});

const website = () => ({
  '@type': 'WebSite',
  '@id': SITE_ID,
  url: `${SITE.url}/`,
  name: SITE.name,
  description: SITE.description,
  publisher: { '@id': ORG_ID },
  inLanguage: 'en-US',
});

const softwareApp = () => ({
  '@type': 'SoftwareApplication',
  '@id': `${SITE.url}/#software`,
  name: SITE.name,
  url: `${SITE.url}/`,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Invoicing and estimating software for contractors',
  operatingSystem: 'Web browser (Windows, macOS, iOS, Android)',
  description: SITE.description,
  image: SITE.ogImage,
  publisher: { '@id': ORG_ID },
  offers: (['free', 'premium', 'ai'] as const).flatMap((tier) => {
    const plan = PLANS[tier];
    if (tier === 'free') {
      return [{ '@type': 'Offer', name: plan.name, price: '0', priceCurrency: 'USD', url: `${SITE.url}/pricing`, availability: 'https://schema.org/InStock' }];
    }
    return [
      {
        '@type': 'Offer',
        name: `${plan.name} (monthly)`,
        price: plan.monthlyPrice.toFixed(2),
        priceCurrency: 'USD',
        url: `${SITE.url}/pricing`,
        availability: 'https://schema.org/InStock',
        priceSpecification: { '@type': 'UnitPriceSpecification', price: plan.monthlyPrice.toFixed(2), priceCurrency: 'USD', billingDuration: 'P1M', unitCode: 'MON' },
      },
      {
        '@type': 'Offer',
        name: `${plan.name} (yearly)`,
        price: plan.yearlyPrice.toFixed(2),
        priceCurrency: 'USD',
        url: `${SITE.url}/pricing`,
        availability: 'https://schema.org/InStock',
        priceSpecification: { '@type': 'UnitPriceSpecification', price: plan.yearlyPrice.toFixed(2), priceCurrency: 'USD', billingDuration: 'P1Y', unitCode: 'ANN' },
      },
    ];
  }),
});

const stripMd = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|\*/g, '');

const faqPage = (path: string, items: FaqItem[]) => ({
  '@type': 'FAQPage',
  '@id': `${abs(path)}#faq`,
  mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: stripMd(f.a) } })),
});

const breadcrumbs = (items: { name: string; path: string }[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) })),
});

const webPage = (path: string, title: string, description: string, type = 'WebPage') => ({
  '@type': type,
  '@id': `${abs(path)}#webpage`,
  url: abs(path),
  name: title,
  description,
  isPartOf: { '@id': SITE_ID },
  inLanguage: 'en-US',
});

interface StaticDef { title: string; description: string; extra?: (path: string) => Record<string, unknown>[]; type?: string; crumb?: string }

const STATIC: Record<string, StaticDef> = {
  '/': {
    title: 'Contractor Invoice & Estimate App | ContractorDocs',
    description: 'Create invoices, estimates, change orders and daily job reports in minutes. AI drafting, e-signatures, a client portal and Gmail sending, built for contractors.',
    extra: (p) => [organization(), website(), softwareApp(), faqPage(p, HOME_FAQ)],
  },
  '/features': {
    title: 'Features: Documents, AI, E-Signatures & Gmail | ContractorDocs',
    description: 'Everything ContractorDocs does: 12 document types, an AI assistant that drafts paperwork, client portal e-signatures, Gmail sending, price book and job profit tracking.',
    crumb: 'Features',
  },
  '/pricing': {
    title: 'Pricing: Free, Premium & Premium + AI Plans | ContractorDocs',
    description: 'Start free with all 12 document types. Premium is $5/month and Premium + AI is $10/month, or save two months with yearly billing. Cancel anytime.',
    extra: (p) => [softwareApp(), faqPage(p, PRICING_FAQ)],
    crumb: 'Pricing',
  },
  '/templates': {
    title: 'Contractor Templates: Invoices, Estimates, Change Orders & More',
    description: 'Professional templates for invoices, estimates, work orders, change orders, purchase orders, daily reports, time sheets, warranties and more, in 13 designs.',
    type: 'CollectionPage',
    crumb: 'Templates',
  },
  '/invoice-generator': {
    title: 'Free Contractor Invoice Generator (No Sign-Up) | ContractorDocs',
    description: 'Build a professional contractor invoice in your browser: line items, tax and deposits calculated for you. Print or save as PDF free, no account required.',
    extra: (p) => [faqPage(p, GENERATOR_FAQ.invoice)],
    crumb: 'Invoice generator',
  },
  '/estimate-generator': {
    title: 'Free Construction Estimate Generator | ContractorDocs',
    description: 'Create an itemized construction estimate in minutes with automatic totals. Print or save it as a PDF for free, then get it approved and signed online.',
    extra: (p) => [faqPage(p, GENERATOR_FAQ.estimate)],
    crumb: 'Estimate generator',
  },
  '/blog': {
    title: 'Contractor Guides: Invoicing, Estimating & Paperwork | ContractorDocs Blog',
    description: 'Practical guides for contractors: how to write invoices and estimates, change orders, daily reports, lien waivers, job costing and getting paid faster.',
    type: 'CollectionPage',
    extra: (p) => [
      {
        '@type': 'Blog',
        '@id': `${abs(p)}#blog`,
        name: 'ContractorDocs Blog',
        url: abs(p),
        publisher: { '@id': ORG_ID },
        blogPost: BLOG_POSTS.map((post) => ({ '@type': 'BlogPosting', headline: post.title, url: abs(`/blog/${post.slug}`), datePublished: post.date })),
      },
    ],
    crumb: 'Blog',
  },
  '/about': {
    title: 'About ContractorDocs: Paperwork Software for the Trades',
    description: 'Why we built ContractorDocs, what we care about and the trusted infrastructure behind it. Paperwork software for contractors who would rather be on site.',
    type: 'AboutPage',
    extra: () => [organization()],
    crumb: 'About',
  },
  '/contact': {
    title: 'Contact ContractorDocs Support',
    description: 'Questions about ContractorDocs, billing, privacy or security? Email support@contractordocs.app and a real person will get back to you.',
    type: 'ContactPage',
    extra: () => [organization()],
    crumb: 'Contact',
  },
  '/privacy': {
    title: 'Privacy Policy | ContractorDocs',
    description: 'How ContractorDocs collects, uses and protects your data, including Google API Limited Use, AI processing with Google Gemini, sub-processors and account deletion.',
    crumb: 'Privacy Policy',
  },
  '/terms': {
    title: 'Terms of Service | ContractorDocs',
    description: 'The terms for using ContractorDocs: accounts, Free and paid plans, billing, cancellation, acceptable use, your content and the AI assistant.',
    crumb: 'Terms of Service',
  },
  '/help': {
    title: 'Help Center: Step-by-Step Guides | ContractorDocs',
    description: 'Step-by-step guides for every ContractorDocs feature: jobs, invoices and estimates, e-signatures, client portal, Gmail, reminders, inventory and AI.',
    type: 'CollectionPage',
    crumb: 'Help center',
  },
  '/security': {
    title: 'Security at ContractorDocs: How We Protect Your Data',
    description: 'Encryption in transit and at rest, per-account data isolation, encrypted Gmail tokens, strict security headers and how to report a vulnerability.',
    crumb: 'Security',
  },
};

export const NOT_FOUND_SEO = (path: string): PageSeo => ({
  path,
  title: 'Page not found | ContractorDocs',
  description: 'The page you were looking for could not be found.',
  canonical: abs(path),
  ogType: 'website',
  noindex: true,
  jsonLd: [],
  lastmod: SITE.lastUpdated,
});

/** SEO for a marketing path, or null when the path is not a known marketing page. */
export function getPageSeo(pathname: string, post?: BlogPostContent | null): PageSeo | null {
  const path = normalizePath(pathname);
  const def = STATIC[path];
  if (def) {
    const jsonLd: Record<string, unknown>[] = [webPage(path, def.title, def.description, def.type)];
    if (def.crumb) jsonLd.push(breadcrumbs([{ name: 'Home', path: '/' }, { name: def.crumb, path }]));
    if (def.extra) jsonLd.push(...def.extra(path));
    return { path, title: def.title, description: def.description, canonical: abs(path), ogType: 'website', jsonLd, lastmod: SITE.lastUpdated };
  }
  const m = path.match(/^\/blog\/([a-z0-9-]+)$/);
  const meta = m ? getPostMeta(m[1]) : undefined;
  if (meta) {
    const title = `${meta.title}`.length <= 58 ? `${meta.title} | ContractorDocs` : meta.title;
    const modified = meta.updated || meta.date;
    const jsonLd: Record<string, unknown>[] = [
      {
        '@type': 'BlogPosting',
        '@id': `${abs(path)}#article`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': abs(path) },
        headline: meta.title,
        description: meta.description,
        image: [SITE.ogImage],
        datePublished: meta.date,
        dateModified: modified,
        author: { '@type': 'Organization', name: meta.author, url: `${SITE.url}/about` },
        publisher: { '@id': ORG_ID, '@type': 'Organization', name: SITE.name, logo: { '@type': 'ImageObject', url: SITE.logo } },
        articleSection: meta.category,
        keywords: meta.keywords.join(', '),
        inLanguage: 'en-US',
        isPartOf: { '@id': `${SITE.url}/blog#blog` },
      },
      breadcrumbs([
        { name: 'Home', path: '/' },
        { name: 'Blog', path: '/blog' },
        { name: meta.title, path },
      ]),
      organization(),
    ];
    if (post?.faq?.length) jsonLd.push(faqPage(path, post.faq));
    if (post?.howTo?.steps?.length) {
      jsonLd.push({
        '@type': 'HowTo',
        '@id': `${abs(path)}#howto`,
        name: post.howTo.name,
        ...(post.howTo.totalTime ? { totalTime: post.howTo.totalTime } : {}),
        step: post.howTo.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.name, text: stripMd(s.text) })),
      });
    }
    return {
      path,
      title,
      description: meta.description,
      canonical: abs(path),
      ogType: 'article',
      jsonLd,
      article: { published: meta.date, modified, section: meta.category, tags: meta.keywords },
      lastmod: modified,
    };
  }
  return null;
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Serialized <head> tags for the prerendered HTML (between <!--SEO:START--> and <!--SEO:END-->). */
export function renderHeadTags(seo: PageSeo): string {
  const tags: string[] = [
    `<title>${escText(seo.title)}</title>`,
    `<meta name="description" content="${escAttr(seo.description)}">`,
    `<meta name="robots" content="${seo.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">`,
    `<link rel="canonical" href="${escAttr(seo.canonical)}">`,
    `<meta property="og:type" content="${seo.ogType}">`,
    `<meta property="og:site_name" content="${SITE.name}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:title" content="${escAttr(seo.title)}">`,
    `<meta property="og:description" content="${escAttr(seo.description)}">`,
    `<meta property="og:url" content="${escAttr(seo.canonical)}">`,
    `<meta property="og:image" content="${SITE.ogImage}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="ContractorDocs: professional contractor paperwork in minutes">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escAttr(seo.title)}">`,
    `<meta name="twitter:description" content="${escAttr(seo.description)}">`,
    `<meta name="twitter:image" content="${SITE.ogImage}">`,
  ];
  if (seo.article) {
    tags.push(
      `<meta property="article:published_time" content="${seo.article.published}">`,
      `<meta property="article:modified_time" content="${seo.article.modified}">`,
      `<meta property="article:section" content="${escAttr(seo.article.section)}">`,
      ...seo.article.tags.map((t) => `<meta property="article:tag" content="${escAttr(t)}">`),
    );
  }
  if (seo.jsonLd.length) {
    const graph = { '@context': 'https://schema.org', '@graph': seo.jsonLd };
    tags.push(`<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n  ');
}

/** Client-side: keep <title>, description, canonical and OG tags in sync after SPA navigation. */
export function applySeoToDocument(seo: PageSeo): void {
  if (typeof document === 'undefined') return;
  document.title = seo.title;
  const setMeta = (selector: string, attr: 'name' | 'property', key: string, value: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', value);
  };
  setMeta('meta[name="description"]', 'name', 'description', seo.description);
  setMeta('meta[name="robots"]', 'name', 'robots', seo.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1');
  setMeta('meta[property="og:title"]', 'property', 'og:title', seo.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', seo.canonical);
  setMeta('meta[property="og:type"]', 'property', 'og:type', seo.ogType);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = seo.canonical;
}
