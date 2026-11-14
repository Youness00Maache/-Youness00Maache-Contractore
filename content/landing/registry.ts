import type { LandingKind, LandingMeta } from './types.ts';

const UPDATED = '2026-11-14';

/**
 * Metadata for every landing page. The body of each page is in ./pages/<key>.ts.
 * Order = display order in the footer and llms.txt.
 */
export const LANDING_PAGES: LandingMeta[] = [
  {
    key: 'ai-estimate-generator',
    path: '/ai-estimate-generator',
    kind: 'ai',
    label: 'AI estimate generator',
    title: 'AI Estimate Generator for Contractors | ContractorDocs',
    description: 'Describe the job in a sentence and ContractorDocs drafts the estimate: line items, your price book prices and good/better/best options. You review before it sends.',
    updated: UPDATED,
  },
  {
    key: 'ai-invoice-generator',
    path: '/ai-invoice-generator',
    kind: 'ai',
    label: 'AI invoice generator',
    title: 'AI Invoice Generator for Contractors | ContractorDocs',
    description: 'Type or say what you did and ContractorDocs drafts the invoice, change order or daily report, with tax, deposits and your prices. Free plan includes AI requests.',
    updated: UPDATED,
  },
  {
    key: 'for-electricians',
    path: '/for/electricians',
    kind: 'trade',
    label: 'Electricians',
    title: 'Electrician Estimate & Invoice Software | ContractorDocs',
    description: 'Estimates, invoices, change orders and work orders for electricians: panel upgrades, service calls and rough-in, with e-signatures and your own price book.',
    updated: UPDATED,
  },
  {
    key: 'for-plumbers',
    path: '/for/plumbers',
    kind: 'trade',
    label: 'Plumbers',
    title: 'Plumbing Estimate & Invoice Software | ContractorDocs',
    description: 'Plumbing estimates and invoices from your phone: water heaters, repipes and service calls, with good/better/best options, e-signatures and payment links.',
    updated: UPDATED,
  },
  {
    key: 'for-hvac',
    path: '/for/hvac',
    kind: 'trade',
    label: 'HVAC',
    title: 'HVAC Estimate & Invoice Software | ContractorDocs',
    description: 'HVAC estimates with good/better/best system options, maintenance invoices, work orders and photo reports, signed by the homeowner on their phone.',
    updated: UPDATED,
  },
  {
    key: 'for-roofers',
    path: '/for/roofers',
    kind: 'trade',
    label: 'Roofers',
    title: 'Roofing Estimate & Invoice Software | ContractorDocs',
    description: 'Roofing estimates priced by the square, before/after photo reports, change orders for rotten decking and invoices with deposits, for small roofing crews.',
    updated: UPDATED,
  },
  {
    key: 'for-remodelers',
    path: '/for/remodelers',
    kind: 'trade',
    label: 'Remodelers',
    title: 'Remodeling Estimate & Change Order Software | ContractorDocs',
    description: 'Estimates, signed change orders, progress billing, daily reports and budget vs actual job costing for kitchen, bath and whole-home remodelers.',
    updated: UPDATED,
  },
  {
    key: 'for-handyman',
    path: '/for/handyman',
    kind: 'trade',
    label: 'Handymen',
    title: 'Handyman Invoice & Estimate App | ContractorDocs',
    description: 'A handyman invoice and estimate app for many small jobs: quick quotes from your price book, one invoice per visit, a quote-request link and Mark as paid.',
    updated: UPDATED,
  },
  {
    key: 'for-painters',
    path: '/for/painters',
    kind: 'trade',
    label: 'Painters',
    title: 'Painting Estimate & Invoice Software | ContractorDocs',
    description: 'Painting estimates measured by the square foot, good/better/best paint options, color sign-off on change orders and progress invoices for painting contractors.',
    updated: UPDATED,
  },
  {
    key: 'for-landscapers',
    path: '/for/landscapers',
    kind: 'trade',
    label: 'Landscapers',
    title: 'Landscaping Estimate & Invoice Software | ContractorDocs',
    description: 'Landscaping estimates by the yard and square foot, recurring maintenance invoices, material logs and crew time sheets for small landscaping companies.',
    updated: UPDATED,
  },
  {
    key: 'compare-joist-alternative',
    path: '/compare/joist-alternative',
    kind: 'compare',
    label: 'Joist alternative',
    title: 'Joist Alternative for Contractors (2026) | ContractorDocs',
    description: 'ContractorDocs vs Joist as of November 2026: prices, change orders, e-signatures, payments and data export, with sources, and when Joist is the better fit.',
    updated: UPDATED,
  },
  {
    key: 'compare-invoice2go-alternative',
    path: '/compare/invoice2go-alternative',
    kind: 'compare',
    label: 'Invoice2go alternative',
    title: 'Invoice2go Alternative for Contractors | ContractorDocs',
    description: 'ContractorDocs vs Invoice2go as of November 2026: construction documents, e-signatures, payments, reminders and price, with sources and a fair verdict.',
    updated: UPDATED,
  },
  {
    key: 'compare-jobber-alternative',
    path: '/compare/jobber-alternative',
    kind: 'compare',
    label: 'Jobber alternative',
    title: 'Jobber Alternative for Small Contractors | ContractorDocs',
    description: 'ContractorDocs vs Jobber as of November 2026: what each costs for one to five people, paperwork, payments, scheduling and when Jobber is the better choice.',
    updated: UPDATED,
  },
  {
    key: 'compare-housecall-pro-alternative',
    path: '/compare/housecall-pro-alternative',
    kind: 'compare',
    label: 'Housecall Pro alternative',
    title: 'Housecall Pro Alternative for Small Contractors | ContractorDocs',
    description: 'ContractorDocs vs Housecall Pro as of November 2026: plan prices, documents, payments, financing, reviews and dispatch, with sources and a fair verdict.',
    updated: UPDATED,
  },
];

export const getLandingMeta = (path: string): LandingMeta | undefined => LANDING_PAGES.find((p) => p.path === path);

export const getLandingMetaByKey = (key: string): LandingMeta | undefined => LANDING_PAGES.find((p) => p.key === key);

export const landingPagesOf = (kind: LandingKind): LandingMeta[] => LANDING_PAGES.filter((p) => p.kind === kind);
