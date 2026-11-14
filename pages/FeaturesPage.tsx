import React from 'react';
import { Link } from 'react-router-dom';
import { Container, PageHero, ButtonLink, CheckList, CtaBand, Eyebrow } from './components/ui.tsx';
import { InvoicePaper, AiMockup, PortalMockup, EmailMockup, InventoryMockup, ProfitMockup, PhoneMockup } from './components/Mockups.tsx';
import { ArrowRight, Users, CalendarIcon, BarChart, Calculator, MessageCircle, LayoutGrid } from './components/icons.tsx';
import { SIGNUP_PATH } from '../content/site.ts';

interface Section {
  id: string;
  nav: string;
  eyebrow: string;
  title: string;
  text: string;
  bullets: string[];
  visual: React.ReactNode;
  related?: { to: string; label: string };
}

const SECTIONS: Section[] = [
  {
    id: 'documents',
    nav: 'Documents',
    eyebrow: 'Documents & templates',
    title: '12 document types that look professional and add up',
    text: 'Invoices, estimates, work orders, change orders, purchase orders, daily job reports, time sheets, material logs, expense logs, warranties, receipts and notes. Every document belongs to a job and a client, so you can find it in seconds.',
    bullets: [
      'Your logo, business details, license number and terms on every document',
      '26 professional designs with your own colors and fonts (11 free, 15 Premium you can customize); switch designs without retyping anything',
      'Line items, tax %, flat discounts, shipping, deposits and balance due',
      'Progress billing: bill by percent complete, minus what you already billed',
      'Clean PDF export for printing, emailing or attaching anywhere',
      'Duplicate a job or document to start the next one faster',
    ],
    visual: <InvoicePaper />,
    related: { to: '/templates', label: 'See the templates' },
  },
  {
    id: 'ai-assistant',
    nav: 'AI assistant',
    eyebrow: 'AI assistant',
    title: 'Tell it what happened. It drafts the paperwork.',
    text: 'Type or dictate a few sentences, the way you would describe the job to your office manager. The assistant picks the right document, fills in the client, line items, dates and notes, and hands you a draft to review. Nothing is sent or saved without you.',
    bullets: [
      'Drafts estimates, invoices, daily reports, change orders and more',
      'Uses your clients, jobs and price book, so prices are yours, not made up',
      'Asks a follow-up question when something important is missing',
      'Voice dictation from the job site',
      'AI-written batch emails to clients that you review before sending',
      'Powered by Google Gemini; see our Privacy Policy for how AI requests are handled',
    ],
    visual: <AiMockup />,
    related: { to: '/pricing', label: 'Compare AI allowances by plan' },
  },
  {
    id: 'client-portal',
    nav: 'Client portal',
    eyebrow: 'Client portal & e-signatures',
    title: 'Clients approve and sign from their phone',
    text: 'Share a secure link and your client sees their documents in a clean, branded page. They can approve an estimate or change order and sign it with a finger or mouse. You get the signature, the signer’s name and the time, stored with the document.',
    bullets: [
      'No account or app needed for your clients',
      'Approve estimates and change orders before work starts',
      'Client signatures are stored separately from your own signature',
      'Approval status on every document, so you know where things stand',
    ],
    visual: <PortalMockup />,
    related: { to: '/blog/e-signatures-for-contractors', label: 'Guide: e-signatures for contractors' },
  },
  {
    id: 'gmail',
    nav: 'Gmail sending',
    eyebrow: 'Gmail sending',
    title: 'Send documents from your own email address',
    text: 'Connect your Gmail account and send invoices, estimates and reports as PDF attachments, from your address, with your own message. Clients reply to you directly. Use saved email templates to keep wording consistent.',
    bullets: [
      'Emails come from your Gmail address, not a no-reply address',
      'PDF attached automatically, with a clear subject line',
      'We only request permission to send email; we cannot read your inbox',
      'Disconnect at any time from Settings or your Google Account',
    ],
    visual: <EmailMockup />,
    related: { to: '/privacy', label: 'How we handle Google data' },
  },
  {
    id: 'inventory',
    nav: 'Inventory',
    eyebrow: 'Inventory & price book',
    title: 'Price once, reuse everywhere',
    text: 'Keep your services, materials and prices in a price book and add them to documents in a couple of taps. Track stock for the materials you keep on hand and label bins or shelves with printable QR tags.',
    bullets: [
      'Reusable items and services with your prices and descriptions',
      'Stock levels with history, so you know what was used where',
      'Printable QR tags for shelves, bins and trailers',
      'Material logs connected to your inventory',
    ],
    visual: <InventoryMockup />,
    related: { to: '/blog/material-log-job-costing', label: 'Guide: material logs & job costing' },
  },
  {
    id: 'profit-tracking',
    nav: 'Profit tracking',
    eyebrow: 'Job profit tracking',
    title: 'Know what every job really earns',
    text: 'ContractorDocs compares what you invoiced on a job with the costs you logged: materials, labor and expenses. See the margin while the job is still running, not months later at tax time.',
    bullets: [
      'Invoiced vs. costs and margin per job',
      'Analytics across jobs and clients',
      'Profit calculator for pricing new work',
      'Expense logs and receipts tied to the right job',
    ],
    visual: <ProfitMockup />,
    related: { to: '/blog/how-to-calculate-job-profit-margin', label: 'Guide: job profit margin' },
  },
  {
    id: 'mobile',
    nav: 'Mobile',
    eyebrow: 'Mobile',
    title: 'Made for the truck, the site and the office',
    text: 'ContractorDocs runs in the browser on phones, tablets and computers. Start a daily report on site, dictate notes, snap photos, and finish the invoice at your desk. Add it to your home screen for one-tap access.',
    bullets: [
      'Works on iPhone, Android, tablets, Mac and Windows',
      'Large tap targets and layouts designed for small screens',
      'Photos and signatures captured on your phone',
      'Everything syncs to your account',
    ],
    visual: <PhoneMockup />,
  },
];

const ALSO = [
  { icon: Users, title: 'Clients', text: 'A client list with contact details and every job and document for each client.' },
  { icon: CalendarIcon, title: 'Calendar', text: 'Job dates and deadlines in a calendar view, so nothing slips.' },
  { icon: BarChart, title: 'Analytics', text: 'Revenue, outstanding balances and job performance at a glance.' },
  { icon: Calculator, title: 'Profit calculator', text: 'Work out price, markup and margin before you quote.' },
  { icon: MessageCircle, title: 'Community forum', text: 'Ask other contractors questions and share what works.' },
  { icon: LayoutGrid, title: 'Templates', text: 'Professional layouts for every document type, with your branding.' },
];

const FeaturesPage: React.FC = () => (
  <>
    <PageHero
      eyebrow="Features"
      title="Everything for the paperwork side of the job"
      subtitle="Create documents, let AI draft them, get them signed, send them from Gmail and keep an eye on profit. One app, built for contractors."
    >
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink to={SIGNUP_PATH} size="lg" arrow className="w-full sm:w-auto">Start free</ButtonLink>
        <ButtonLink to="/pricing" size="lg" variant="outline" className="w-full sm:w-auto">See pricing</ButtonLink>
      </div>
      <nav aria-label="Feature sections" className="mt-10">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-[40px] items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground/80 shadow-soft hover:border-brand-300 hover:text-brand-700">
                {s.nav}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </PageHero>

    <div className="py-8">
      {SECTIONS.map((s, i) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-20 py-14 sm:py-20">
          <Container>
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 ? 'lg:order-2' : ''}>
                <Eyebrow className="mb-3">{s.eyebrow}</Eyebrow>
                <h2 id={`${s.id}-title`} className="font-display text-3xl font-extrabold leading-tight tracking-[-0.01em] text-foreground sm:text-4xl">{s.title}</h2>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{s.text}</p>
                <CheckList items={s.bullets} className="mt-6" />
                {s.related ? (
                  <Link to={s.related.to} className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
                    {s.related.label} <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
              <div className={i % 2 ? 'lg:order-1' : ''}>
                <div className="rounded-3xl bg-gradient-to-br from-brand-50 via-white to-amber-50/60 p-5 ring-1 ring-border sm:p-10">{s.visual}</div>
              </div>
            </div>
          </Container>
        </section>
      ))}
    </div>

    <section aria-labelledby="also-heading" className="border-t border-border bg-card py-20">
      <Container>
        <h2 id="also-heading" className="text-center font-display text-3xl font-extrabold tracking-[-0.01em] text-foreground">Also included</h2>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALSO.map((a) => (
            <li key={a.title} className="flex gap-4 rounded-2xl border border-border bg-background p-5">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-700"><a.icon className="h-5 w-5" /></span>
              <div>
                <h3 className="font-semibold text-foreground">{a.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{a.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>

    <CtaBand title="See it on your own job" text="Create a job, add an estimate and send it in the next ten minutes. The Free plan includes every document type." />
  </>
);

export default FeaturesPage;
