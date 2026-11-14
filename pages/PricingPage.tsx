import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, FaqList, CtaBand, Eyebrow, GRID_BG } from './components/ui.tsx';
import { PlanCards, PeriodToggle, signupHref, type Period } from './components/PlanCards.tsx';
import { Check, Minus, CreditCard, ShieldCheck, Clock } from './components/icons.tsx';
import { FREE_LIMITS, PAID_AI_LIMITS, PLANS } from '../lib/plans.ts';
import { PRICE_PROMISE, PRICING_FAQ } from '../content/site.ts';

type Cell = boolean | string;
// Matches what the app does (owner decision 2026-11-13): everything but price book photos works on Free; paid plans remove the monthly
// limits, add photos on price book items and raise the AI allowance. Keep in sync with lib/plans.ts.
const ROWS: { group: string; rows: { label: string; free: Cell; premium: Cell; ai: Cell }[] }[] = [
  {
    group: 'Jobs & documents',
    rows: [
      { label: 'New jobs per month', free: String(FREE_LIMITS.jobs), premium: 'Unlimited', ai: 'Unlimited' },
      { label: 'New clients per month', free: String(FREE_LIMITS.clients), premium: 'Unlimited', ai: 'Unlimited' },
      { label: 'New documents per job each month', free: String(FREE_LIMITS.docs), premium: 'Unlimited', ai: 'Unlimited' },
      { label: 'All 12 document types', free: true, premium: true, ai: true },
      { label: 'PDF export with your logo', free: true, premium: true, ai: true },
      { label: 'Every PDF design, premium styles included', free: true, premium: true, ai: true },
      { label: 'Export all your data (PDFs + spreadsheets), even after cancelling', free: true, premium: true, ai: true },
      { label: 'Monthly bookkeeper CSV', free: true, premium: true, ai: true },
    ],
  },
  {
    group: 'Sending & clients',
    rows: [
      { label: 'Emails from your Gmail', free: `${FREE_LIMITS.emails} / month`, premium: 'Unlimited', ai: 'Unlimited' },
      { label: 'Client portal & approvals', free: true, premium: true, ai: true },
      { label: 'Client e-signatures', free: true, premium: true, ai: true },
    ],
  },
  {
    group: 'Business tools',
    rows: [
      { label: 'Inventory & price book', free: true, premium: true, ai: true },
      { label: 'Photos on price book items', free: false, premium: true, ai: true },
      { label: 'Job profit tracking & insights', free: true, premium: true, ai: true },
    ],
  },
  {
    group: 'AI assistant',
    rows: [
      { label: 'AI requests per month', free: String(FREE_LIMITS.ai), premium: String(PAID_AI_LIMITS.premium), ai: String(PAID_AI_LIMITS.ai) },
      { label: 'AI-drafted documents', free: true, premium: true, ai: true },
      { label: 'AI batch emails to clients', free: true, premium: true, ai: true },
      { label: 'Voice-to-document dictation', free: true, premium: true, ai: true },
    ],
  },
  {
    group: 'Support',
    rows: [
      { label: 'Email support', free: true, premium: true, ai: true },
      { label: 'Priority support', free: false, premium: false, ai: true },
    ],
  },
];

const CellView: React.FC<{ value: Cell }> = ({ value }) => {
  if (value === true) return <><Check className="mx-auto h-5 w-5 text-success" strokeWidth={2.6} /><span className="sr-only">Included</span></>;
  if (value === false) return <><Minus className="mx-auto h-5 w-5 text-muted-foreground/50" /><span className="sr-only">Not included</span></>;
  return <span className="font-semibold text-foreground">{value}</span>;
};

const PricingPage: React.FC = () => {
  const [period, setPeriod] = useState<Period>('monthly');

  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand-50/70 via-background to-background">
        <div aria-hidden="true" className={`${GRID_BG} pointer-events-none absolute inset-0 opacity-70`} />
        <Container className="relative pb-16 pt-14 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="mb-3">Pricing</Eyebrow>
            <h1 className="font-display text-4xl font-extrabold leading-[1.1] tracking-[-0.015em] text-foreground sm:text-5xl">
              Simple pricing for contractors
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Start free with every document type, the client portal and e-signatures. Upgrade for unlimited jobs, clients, documents and emails, or for a much bigger AI allowance.
            </p>
            <div className="mt-8 flex justify-center">
              <PeriodToggle period={period} onChange={setPeriod} />
            </div>
          </div>
          <div className="mt-12">
            <PlanCards period={period} headingLevel="h2" />
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-[15px] leading-relaxed text-foreground/80">
            Every plan, Free included, lets you export all your data, and it keeps working if you cancel. Existing subscribers’ prices are locked for 12 months.{' '}
            <a href="#price-promise" className="font-semibold text-brand-700 underline underline-offset-4">Read our price promise</a>
          </p>
          <ul className="mt-8 flex flex-col items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground sm:flex-row">
            <li className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-brand-600" /> Secure checkout by Kelviq (merchant of record)</li>
            <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-600" /> Cancel anytime from Settings</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-600" /> Prices in USD; tax added at checkout where applicable</li>
          </ul>
        </Container>
      </section>

      <section id="price-promise" aria-labelledby="promise-heading" className="scroll-mt-20 border-b border-border py-16 sm:py-20">
        <Container className="max-w-5xl">
          <div className="grid gap-8 rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:gap-14">
            <div>
              <Eyebrow>In writing</Eyebrow>
              <h2 id="promise-heading" className="mt-3 font-display text-3xl font-extrabold tracking-[-0.01em] text-foreground sm:text-4xl">Our price promise</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{PRICE_PROMISE.lead}</p>
            </div>
            <ol className="divide-y divide-border">
              {PRICE_PROMISE.points.map((p, i) => (
                <li key={p.title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 py-5 first:pt-0 last:pb-0">
                  <span aria-hidden="true" className="font-display text-2xl font-extrabold leading-7 tabular-nums text-brand-600">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="font-semibold leading-7 text-foreground">{p.title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{p.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>

      <section aria-labelledby="compare-heading" className="py-20 sm:py-24">
        <Container className="max-w-5xl">
          <h2 id="compare-heading" className="text-center font-display text-3xl font-extrabold tracking-[-0.01em] text-foreground sm:text-4xl">Compare plans</h2>
          <p className="mt-3 text-center text-muted-foreground">Paid plans remove the Free plan’s monthly limits, add photos on price book items and raise the AI allowance. Limits reset on the first day of each calendar month.</p>
          <div className="relative mt-10 overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <caption className="sr-only">Feature comparison of the Free, Premium and Premium + AI plans</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="w-[40%] px-5 py-4 text-sm font-semibold text-muted-foreground">Feature</th>
                  {(['free', 'premium', 'ai'] as const).map((t) => (
                    <th key={t} scope="col" className="w-[20%] px-4 py-4 text-center">
                      <span className="block font-display text-base font-extrabold text-foreground">{PLANS[t].name}</span>
                      <span className="block text-sm font-medium text-muted-foreground">
                        {t === 'free' ? '$0' : period === 'yearly' ? `$${PLANS[t].yearlyPrice}/yr` : `$${PLANS[t].monthlyPrice}/mo`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              {ROWS.map((g) => (
                <tbody key={g.group}>
                  <tr className="bg-muted/60">
                    <th scope="colgroup" colSpan={4} className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{g.group}</th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.label} className="border-t border-border/70">
                      <th scope="row" className="px-5 py-3.5 font-medium text-foreground/90">{r.label}</th>
                      <td className="px-4 py-3.5 text-center"><CellView value={r.free} /></td>
                      <td className="bg-brand-50/40 px-4 py-3.5 text-center"><CellView value={r.premium} /></td>
                      <td className="px-4 py-3.5 text-center"><CellView value={r.ai} /></td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr className="border-t border-border">
                  <td className="px-5 py-5" />
                  {(['free', 'premium', 'ai'] as const).map((t) => (
                    <td key={t} className="px-3 py-5 text-center">
                      <Link
                        to={signupHref(t, period)}
                        className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold ${
                          t === 'premium' ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-border bg-card text-foreground hover:bg-muted'
                        }`}
                      >
                        {t === 'free' ? 'Start free' : `Get ${PLANS[t].name}`}
                      </Link>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </Container>
      </section>

      <section aria-labelledby="pricing-faq-heading" className="border-t border-border bg-card py-20">
        <Container className="max-w-4xl">
          <h2 id="pricing-faq-heading" className="text-center font-display text-3xl font-extrabold tracking-[-0.01em] text-foreground sm:text-4xl">Billing questions</h2>
          <FaqList items={PRICING_FAQ} className="mt-10" />
          <p className="mt-8 text-center text-[15px] text-muted-foreground">
            Something else? Email <a className="font-semibold text-brand-700 underline underline-offset-4" href="mailto:support@contractordocs.app">support@contractordocs.app</a> or read the <Link to="/terms" className="font-semibold text-brand-700 underline underline-offset-4">Terms of Service</Link>.
          </p>
        </Container>
      </section>

      <CtaBand title="Try it free on your next job" text="Every document type is included on the Free plan. Upgrade in Settings whenever you need more." secondaryTo="/features" secondaryLabel="Explore features" />
    </>
  );
};

export default PricingPage;
