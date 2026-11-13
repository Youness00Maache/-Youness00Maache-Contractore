import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, SectionHeader, ButtonLink, CheckList, FaqList, CtaBand, Eyebrow, GRID_BG } from './components/ui.tsx';
import { AppMockup, AiMockup, PortalMockup, InvoicePaper, EmailMockup, InventoryMockup, ProfitMockup, PhoneMockup, StatusStrip } from './components/Mockups.tsx';
import { PlanCards, PeriodToggle, type Period } from './components/PlanCards.tsx';
import {
  ArrowRight, Check, DocIcon, TradeIcon, Sparkles, PenLine, Mail, Package, TrendingUp, Smartphone, Briefcase,
  FileText, Send, Lock, ShieldCheck, Key, CreditCard,
} from './components/icons.tsx';
import { DOCUMENT_TYPES, TRADES, HOME_FAQ, SIGNUP_PATH } from '../content/site.ts';

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
      <CheckList items={bullets} className="mt-6" />
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

const WEEK = [
  { day: 'Mon', title: 'Estimate before you leave the driveway', text: 'Walk the job, dictate the scope and let the assistant draft the estimate from your price book. Review it, send it from your phone.', icon: Sparkles },
  { day: 'Tue', title: 'Approved and signed online', text: 'Your client opens the portal link, approves the estimate and signs. The deposit invoice goes out from your own Gmail.', icon: PenLine },
  { day: 'Wed', title: 'Scope change? Change order first', text: 'The client wants pantry pull-outs. Price the change, add the extra day, get it signed before the crew touches it.', icon: FileText },
  { day: 'Thu', title: 'Daily report in five minutes', text: 'Crew, hours, weather, work completed, deliveries and photos, logged on site and stored with the job.', icon: Briefcase },
  { day: 'Fri', title: 'Progress invoice and real numbers', text: 'Bill the percent complete, record the payment, and see invoiced vs. costs and your margin so far.', icon: TrendingUp },
];

const TRUST = [
  { icon: Lock, title: 'Encrypted connections', text: 'HTTPS everywhere, with strict security headers.' },
  { icon: ShieldCheck, title: 'Your data stays yours', text: 'Per-account access rules in the database.' },
  { icon: Key, title: 'Send-only Gmail access', text: 'We can send for you, never read your inbox.' },
  { icon: CreditCard, title: 'Payments by Kelviq', text: 'Merchant of record; we never see your card.' },
];

const LandingPage: React.FC = () => {
  const [period, setPeriod] = useState<Period>('monthly');

  return (
    <>
      {/* ------------------------------------------------------------ Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className={`${GRID_BG} pointer-events-none absolute inset-0 opacity-80`} />
        <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" />
        <Container className="relative pb-20 pt-10 sm:pt-16 lg:pb-28 lg:pt-20">
          <div className="grid items-center gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1.5 text-[13px] font-semibold text-brand-700 shadow-soft">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white"><Check className="h-3 w-3" strokeWidth={3.2} /></span>
                Built for contractors · Free plan available
              </p>
              <h1 className="mt-6 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-6xl">
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
                  <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-success" strokeWidth={2.6} /> {t}</li>
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
          <ul className="mx-auto mt-6 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4">
            {TRADES.map((t) => (
              <li key={t.id} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-center text-sm font-semibold text-foreground/80">
                <TradeIcon name={t.id} className="h-4 w-4 flex-none text-brand-600" /> {t.name}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ------------------------------------------------------------ Document types */}
      <section aria-labelledby="docs-heading" className="py-20 sm:py-28">
        <Container>
          <SectionHeader
            id="docs-heading"
            eyebrow="12 document types"
            title="Every document a job needs, in one place"
            subtitle="From the first estimate to the final warranty. Each document is tied to a job and a client, uses your logo, and exports to a clean PDF."
          />
          <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {DOCUMENT_TYPES.map((d) => (
              <li key={d.id} className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                  <DocIcon name={d.id} className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-bold text-foreground">{d.name}</h3>
                <p className="mt-1.5 flex-1 text-[14.5px] leading-relaxed text-muted-foreground">{d.summary}</p>
                <Link to={d.href} className="mt-4 inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
                  {d.hrefLabel} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-10 text-center">
            <Link to="/templates" className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
              Browse all templates <ArrowRight className="h-4 w-4" />
            </Link>
          </p>
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
                '13 professional designs in your brand colors',
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
              visual={<AiMockup />}
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
          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {[
              { icon: Mail, title: 'Send from your own Gmail', text: 'Connect Gmail once and send documents as PDF attachments from your address. Replies land in your inbox, not ours.', visual: <EmailMockup />, to: '/features#gmail' },
              { icon: Package, title: 'Inventory & price book', text: 'Save your items, services and prices once and reuse them in every estimate and invoice. Track stock and print QR tags.', visual: <InventoryMockup />, to: '/features#inventory' },
              { icon: TrendingUp, title: 'Job profit tracking', text: 'Compare what you invoiced with materials, labor and expenses for each job, and see your margin while the job is still running.', visual: <ProfitMockup />, to: '/features#profit-tracking' },
              { icon: Smartphone, title: 'Built for the job site', text: 'Runs in the browser on any phone, tablet or computer. Add it to your home screen and dictate reports with your voice.', visual: <PhoneMockup />, to: '/features#mobile' },
            ].map((card) => (
              <article key={card.title} className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
                <div className="p-6 sm:p-8">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm"><card.icon className="h-5 w-5" /></span>
                  <h3 className="mt-5 text-xl font-bold text-foreground">{card.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{card.text}</p>
                  <Link to={card.to} className="mt-3 inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
                    Learn more <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="flex flex-1 items-end justify-center bg-gradient-to-b from-muted/40 to-muted/80 px-5 pb-0 pt-6 sm:px-10">
                  <div className="w-full max-w-md translate-y-2">{card.visual}</div>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------ How it works */}
      <section aria-labelledby="how-heading" className="border-y border-border bg-card py-20 sm:py-28">
        <Container>
          <SectionHeader id="how-heading" eyebrow="How it works" title="Up and running in three steps" subtitle="No setup project, no training day." />
          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              { n: 1, title: 'Add a job and your client', text: 'Create a job with the client and site address. Add your logo and business details once; they appear on every document.', icon: Briefcase },
              { n: 2, title: 'Create documents', text: 'Pick a document type and fill it in, reuse price-book items, or let the AI assistant draft it from your notes or voice.', icon: FileText },
              { n: 3, title: 'Send, sign and get paid', text: 'Email the PDF from Gmail or share a portal link. Clients approve and sign online; you record payments and watch the margin.', icon: Send },
            ].map((s) => (
              <li key={s.n} className="relative rounded-3xl border border-border bg-background p-6 sm:p-8">
                <span className="font-display text-5xl font-extrabold text-brand-100">0{s.n}</span>
                <span className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 sm:right-8 sm:top-8"><s.icon className="h-5 w-5" /></span>
                <h3 className="mt-3 text-lg font-bold text-foreground">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* ------------------------------------------------------------ A week with ContractorDocs */}
      <section aria-labelledby="week-heading" className="py-20 sm:py-28">
        <Container>
          <SectionHeader
            id="week-heading"
            eyebrow="What you can do"
            title="One week on a remodel, without the paper chase"
            subtitle="An example of how the pieces fit together on a typical job."
          />
          <ol className="relative mx-auto mt-14 max-w-4xl space-y-4">
            {WEEK.map((w) => (
              <li key={w.day} className="flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft sm:gap-6 sm:p-6">
                <div className="flex w-14 flex-none flex-col items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{w.day}</span>
                  <span className="mt-2 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><w.icon className="h-5 w-5" /></span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground sm:text-lg">{w.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{w.text}</p>
                </div>
              </li>
            ))}
          </ol>
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
            <PlanCards period={period} />
          </div>
          <p className="mt-8 text-center text-[15px] text-muted-foreground">
            Compare every feature on the{' '}
            <Link to="/pricing" className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-600">pricing page</Link>.
          </p>
        </Container>
      </section>

      {/* ------------------------------------------------------------ Trust */}
      <section aria-labelledby="trust-heading" className="py-16">
        <Container>
          <h2 id="trust-heading" className="sr-only">Security and trust</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t) => (
              <li key={t.title} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><t.icon className="h-5 w-5" /></span>
                <div>
                  <p className="font-semibold text-foreground">{t.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-sm">
            <Link to="/security" className="inline-flex min-h-[40px] items-center gap-1 font-semibold text-brand-700 hover:text-brand-800">How we protect your data <ArrowRight className="h-3.5 w-3.5" /></Link>
          </p>
        </Container>
      </section>

      {/* ------------------------------------------------------------ FAQ */}
      <section aria-labelledby="faq-heading" className="pb-8 pt-12 sm:pt-16">
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
