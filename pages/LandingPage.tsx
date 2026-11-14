import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, SectionHeader, ButtonLink, CheckList, FaqList, CtaBand, Eyebrow, GRID_BG, MarkerTick } from './components/ui.tsx';
import { AppMockup, AiMockup, PortalMockup, InvoicePaper, EmailMockup, InventoryMockup, ProfitMockup, StatusStrip } from './components/Mockups.tsx';
import {
  DocumentShelf, PostStamp, StockTag, MarginDial, RecordingPill, PhoneTodayMockup, TradesTape,
  HttpsProof, AccountProof, GmailScopeProof, CardProof,
} from './components/LandingVisuals.tsx';
import { PlanCards, PeriodToggle, type Period } from './components/PlanCards.tsx';
import { ArrowRight } from './components/icons.tsx';
import { TRADES, HOME_FAQ, SIGNUP_PATH } from '../content/site.ts';

const FeatureRow: React.FC<{
  eyebrow: string;
  title: string;
  text: string;
  bullets: React.ReactNode[];
  visual: React.ReactNode;
  reverse?: boolean;
  link?: { to: string; label: string };
  extra?: React.ReactNode;
}> = ({ eyebrow, title, text, bullets, visual, reverse, link, extra }) => (
  <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
    <div className={reverse ? 'lg:order-2' : ''}>
      <Eyebrow className="mb-3">{eyebrow}</Eyebrow>
      <h3 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.01em] text-foreground sm:text-3xl">{title}</h3>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{text}</p>
      <CheckList items={bullets} className="mt-6" variant="tick" />
      {extra ? <div className="mt-6">{extra}</div> : null}
      {link ? (
        <Link to={link.to} className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
          {link.label} <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
    <div className={`relative ${reverse ? 'lg:order-1' : ''}`}>
      <div className="relative rounded-3xl bg-gradient-to-br from-brand-50 via-white to-amber-50/60 p-5 ring-1 ring-border sm:p-10">{visual}</div>
    </div>
  </div>
);

const MoreCard: React.FC<{
  title: string;
  text: string;
  to: string;
  mark: React.ReactNode;
  visual: React.ReactNode;
  className?: string;
}> = ({ title, text, to, mark, visual, className = '' }) => (
  <article className={`flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft ${className}`}>
    <div className="flow-root p-6 sm:p-8">
      <div aria-hidden="true" className="float-right -mr-2 -mt-3 mb-1 ml-4">{mark}</div>
      <h3 className="text-xl font-bold text-foreground">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
      <Link to={to} className="mt-3 inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
        Learn more<span className="sr-only"> about {title.toLowerCase()}</span> <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
    <div className="flex flex-1 items-end justify-center bg-gradient-to-b from-muted/40 to-muted/80 px-5 pb-0 pt-6 sm:px-10">
      <div className="w-full max-w-md translate-y-2">{visual}</div>
    </div>
  </article>
);

const TRUST = [
  { title: 'Encrypted connections', text: 'HTTPS everywhere, with strict security headers.', proof: <HttpsProof /> },
  { title: 'Your data stays yours', text: 'Per-account access rules in the database.', proof: <AccountProof /> },
  { title: 'Send-only Gmail access', text: 'We can send for you, never read your inbox.', proof: <GmailScopeProof /> },
  { title: 'Secure checkout', text: 'Card details go to a secure checkout; we never see your card.', proof: <CardProof /> },
];

const LandingPage: React.FC = () => {
  const [period, setPeriod] = useState<Period>('monthly');

  return (
    <>
      {/* ------------------------------------------------------------ Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className={`${GRID_BG} pointer-events-none absolute inset-0 opacity-80`} />
        <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" />
        <Container className="relative pb-20 pt-8 sm:pt-12 lg:pb-28 lg:pt-12">
          <div className="grid items-center gap-14 lg:items-start lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
            <div className="max-w-xl">
              <h1 className="font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-6xl">
                Professional contractor paperwork{' '}
                <span className="relative whitespace-nowrap text-brand-600">
                  in minutes
                  <svg aria-hidden="true" viewBox="0 0 220 12" className="absolute -bottom-2 left-0 h-3 w-full" preserveAspectRatio="none">
                    <path d="M2 9c40-6 120-9 216-4" fill="none" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Invoices, estimates, change orders and daily reports that look professional, add up correctly and get signed.
                Send them from your own Gmail, let clients approve online, and see what every job really earns.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink to={SIGNUP_PATH} size="lg" arrow className="w-full sm:w-auto">Start free</ButtonLink>
                <ButtonLink to="/pricing" size="lg" variant="outline" className="w-full sm:w-auto">See pricing</ButtonLink>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {['Free plan, no credit card', 'Phone, tablet & desktop', 'Cancel anytime'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><MarkerTick className="h-4 w-4 flex-none text-amber-500" /> {t}</li>
                ))}
              </ul>
            </div>
            <AppMockup />
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------ Trades */}
      <section aria-labelledby="trades-heading" className="border-y border-border bg-card">
        <Container className="py-10">
          <h2 id="trades-heading" className="text-center text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Made for the trades
          </h2>
          <TradesTape trades={TRADES} />
        </Container>
      </section>

      {/* ------------------------------------------------------------ Document types */}
      <section aria-labelledby="docs-heading" className="py-14 sm:py-16">
        <Container>
          <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr] lg:items-end lg:gap-16">
            <div>
              <Eyebrow className="mb-3">12 document types</Eyebrow>
              <h2 id="docs-heading" className="font-display text-3xl font-extrabold leading-tight tracking-[-0.01em] text-foreground sm:text-4xl">
                Every document a job needs, in one place
              </h2>
            </div>
            <div>
              <p className="text-lg leading-relaxed text-muted-foreground">
                From the first estimate to the final warranty. Each document is tied to a job and a client, uses your logo, and exports to a clean PDF.
              </p>
              <Link to="/templates" className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
                Browse all templates <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <DocumentShelf />
        </Container>
      </section>

      {/* ------------------------------------------------------------ Feature rows */}
      <section aria-labelledby="features-heading" className="border-t border-border bg-gradient-to-b from-muted/50 to-background py-20 sm:py-28">
        <Container>
          <SectionHeader
            id="features-heading"
            eyebrow="Why contractors switch"
            title="Less time on paperwork. Fewer disputes. Faster payment."
            subtitle="ContractorDocs handles the boring parts of running jobs, so your documents are done before the day ends."
          />
          <div className="mt-16 space-y-24">
            <FeatureRow
              eyebrow="Documents"
              title="Documents that look professional and always add up"
              text="Pick a document type, add line items from your price book and choose a template. Taxes, discounts, deposits and progress billing are calculated the same way on screen, in the PDF and in the client portal."
              bullets={[
                'Your logo, license number and terms on every document',
                '26 professional designs in your brand colors',
                'Deposits, amount paid and balance due tracked per invoice',
                'Progress billing by percent complete per line item',
              ]}
              visual={<InvoicePaper />}
              link={{ to: '/features#documents', label: 'More about documents' }}
            />
            <FeatureRow
              reverse
              eyebrow="AI assistant"
              title="Describe the job. Get a draft you can send."
              text="Type or dictate what happened, the way you would tell your office manager. The assistant turns it into an estimate, invoice, daily report or change order, using your clients and price book. You review every draft before anything is saved or sent."
              bullets={[
                'Works with voice dictation from the job site',
                'Drafts all 12 document types',
                'Asks for anything important that is missing',
                'Powered by Google Gemini',
              ]}
              visual={<AiMockup variant="paper" />}
              link={{ to: '/features#ai-assistant', label: 'How the AI assistant works' }}
            />
            <FeatureRow
              eyebrow="Client portal & e-signatures"
              title="Approvals and signatures without the back-and-forth"
              text="Send your client a secure link. They can view the estimate, change order or invoice on their phone, approve it and sign. No account, no printing, no scanning."
              bullets={[
                'Signature, signer name and time saved with the document',
                'Approval status visible on every document',
                'Your own signature stays separate from the client’s',
              ]}
              extra={<StatusStrip />}
              visual={<PortalMockup />}
              link={{ to: '/features#client-portal', label: 'More about the client portal' }}
            />
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------ Bento */}
      <section aria-labelledby="more-heading" className="py-20 sm:py-28">
        <Container>
          <SectionHeader id="more-heading" eyebrow="And the rest of the job" title="Send, stock, track, and work from anywhere" />
          <div className="mt-14 grid gap-6 lg:grid-cols-12">
            <MoreCard
              className="lg:col-span-7"
              mark={<PostStamp />}
              title="Send from your own Gmail"
              text="Connect Gmail once and send documents as PDF attachments from your address. Replies land in your inbox, not ours."
              to="/features#gmail"
              visual={<EmailMockup />}
            />
            <MoreCard
              className="lg:col-span-5"
              mark={<StockTag />}
              title="Inventory & price book"
              text="Save your items, services and prices once and reuse them in every estimate and invoice. Track stock and print QR tags."
              to="/features#inventory"
              visual={<InventoryMockup />}
            />
            <MoreCard
              className="lg:col-span-5"
              mark={<MarginDial className="pt-1" />}
              title="Job profit tracking"
              text="Compare what you invoiced with materials, labor and expenses for each job, and see your margin while the job is still running."
              to="/features#profit-tracking"
              visual={<ProfitMockup />}
            />
            <article className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,272px)] lg:col-span-7">
              <div className="flex flex-col p-6 sm:p-8">
                <h3 className="text-xl font-bold text-foreground">Built for the job site</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  Runs in the browser on any phone, tablet or computer. Add it to your home screen and dictate reports with your voice.
                </p>
                <Link to="/features#mobile" className="mt-3 inline-flex min-h-[40px] items-center gap-1 self-start text-sm font-semibold text-brand-700 hover:text-brand-800">
                  Learn more<span className="sr-only"> about using ContractorDocs on the job site</span> <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <div className="mt-5 sm:mt-auto sm:pt-6">
                  <RecordingPill />
                </div>
              </div>
              <div className="flex items-end justify-center bg-gradient-to-b from-muted/40 to-muted/80 px-5 pt-8 sm:px-4">
                <div className="translate-y-6">
                  <PhoneTodayMockup />
                </div>
              </div>
            </article>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------ Pricing preview */}
      <section aria-labelledby="pricing-heading" className="border-t border-border bg-gradient-to-b from-brand-50/60 to-background py-20 sm:py-28">
        <Container>
          <SectionHeader
            id="pricing-heading"
            eyebrow="Pricing"
            title="Start free. Upgrade when you’re busy."
            subtitle="Simple plans with no setup fees or per-user surprises. Prices in USD."
          />
          <div className="mt-8 flex justify-center">
            <PeriodToggle period={period} onChange={setPeriod} />
          </div>
          <div className="mt-10">
            <PlanCards period={period} listVariant="tick" />
          </div>
          <p className="mt-8 text-center text-[15px] text-muted-foreground">
            Compare every feature on the{' '}
            <Link to="/pricing" className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-600">pricing page</Link>.
          </p>
        </Container>
      </section>

      {/* ------------------------------------------------------------ Trust */}
      <section aria-labelledby="trust-heading" className="border-y border-border bg-card">
        <Container className="py-12 sm:py-14">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
            <div>
              <Eyebrow className="mb-2">Security and trust</Eyebrow>
              <h2 id="trust-heading" className="font-display text-2xl font-extrabold leading-tight tracking-[-0.01em] text-foreground sm:text-3xl">
                What we can and can’t see
              </h2>
            </div>
            <Link to="/security" className="inline-flex min-h-[44px] flex-none items-center gap-1.5 self-start font-semibold text-brand-700 hover:text-brand-800 sm:self-auto">
              How we protect your data <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ul className="mt-6 grid gap-x-6 gap-y-6 sm:mt-8 sm:grid-cols-2 sm:gap-y-8 lg:grid-cols-4">
            {TRUST.map((t) => (
              <li key={t.title}>
                <div aria-hidden="true" className="flex h-[68px] items-center justify-center rounded-2xl sm:h-[76px] bg-gradient-to-b from-muted/40 to-muted/90 px-4 ring-1 ring-inset ring-border/60">
                  {t.proof}
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{t.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.text}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ------------------------------------------------------------ FAQ */}
      <section aria-labelledby="faq-heading" className="pb-8 pt-16 sm:pt-20">
        <Container className="max-w-4xl">
          <SectionHeader id="faq-heading" eyebrow="FAQ" title="Questions contractors ask us" />
          <FaqList items={HOME_FAQ} className="mt-10" />
        </Container>
      </section>

      <CtaBand />
    </>
  );
};

export default LandingPage;
