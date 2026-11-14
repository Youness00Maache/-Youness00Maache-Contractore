/**
 * High-intent landing pages: /ai-estimate-generator, /ai-invoice-generator, /for/<trade> and /compare/<x>.
 * Metadata comes from content/landing/registry.ts, the body from content/landing/pages/<key>.ts (code-split, preloaded
 * before hydration and loaded by the SSR entry, so the prerendered HTML has the full text).
 *
 * Layout notes: answer first (data-answer box, quoted by answer engines), real <table>s for example documents and
 * comparisons, numbered ledgers and timelines instead of icon card grids.
 */
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Container, Breadcrumbs, ButtonLink, Eyebrow, FaqList, CtaBand, GRID_BG, MarkerTick } from './components/ui.tsx';
import { renderInline } from './components/Markdown.tsx';
import { ArrowRight, Mic } from './components/icons.tsx';
import { getLandingMeta, landingPagesOf, landingCrumb } from '../content/landing/registry.ts';
import type { AiContent, CompareContent, LandingContent, LandingMeta, SampleDocument, TradeContent } from '../content/landing/types.ts';
import { getPostMeta } from '../content/blog/registry.ts';
import type { BlogPostMeta } from '../content/blog/types.ts';
import { PLANS, FREE_LIMITS, PAID_AI_LIMITS } from '../lib/plans.ts';
import { SIGNUP_PATH } from '../content/site.ts';
import { getLoadedLanding, loadLanding } from './landingLoader.ts';
import { normalizePath } from './routes.ts';
import NotFoundPage from './NotFoundPage.tsx';

/* ------------------------------------------------------------------ helpers */

const money = (n: number): string => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const qtyText = (n: number): string => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));
const pad = (i: number): string => String(i + 1).padStart(2, '0');

const H2: React.FC<{ id: string; children: React.ReactNode; className?: string; size?: 'lg' | 'md' }> = ({ id, children, className = '', size = 'lg' }) => (
  <h2 id={id} className={`scroll-mt-24 font-display font-extrabold leading-tight tracking-[-0.01em] text-foreground ${size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'} ${className}`}>{children}</h2>
);

const LINK_CLASS = 'font-semibold text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline';

/* ------------------------------------------------------------------ shared blocks */

const LandingHero: React.FC<{
  meta: LandingMeta;
  content: LandingContent;
  visual?: React.ReactNode;
  aside?: React.ReactNode;
  secondary?: { to: string; label: string };
}> = ({ meta, content, visual, aside, secondary = { to: '/pricing', label: 'See pricing' } }) => (
  <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand-50/70 via-background to-background">
    <div aria-hidden="true" className={`${GRID_BG} pointer-events-none absolute inset-0 opacity-70`} />
    <Container className="relative py-12 sm:py-16 lg:py-20">
      <Breadcrumbs items={[{ name: 'Home', to: '/' }, { name: landingCrumb(meta) }]} className="mb-6" />
      <div className={visual ? 'grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-14' : 'grid items-start gap-10 lg:grid-cols-[1fr_auto]'}>
        <div className="max-w-2xl">
          <Eyebrow className="mb-3">{content.eyebrow}</Eyebrow>
          <h1 className="font-display text-[2.15rem] font-extrabold leading-[1.08] tracking-[-0.015em] text-foreground sm:text-5xl">{content.h1}</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground sm:text-xl">{content.subtitle}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to={SIGNUP_PATH} size="lg" arrow className="w-full sm:w-auto">Start free</ButtonLink>
            <ButtonLink to={secondary.to} size="lg" variant="outline" className="w-full sm:w-auto">{secondary.label}</ButtonLink>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {['Free plan, no credit card', `Paid plans $${PLANS.premium.monthlyPrice}–$${PLANS.ai.monthlyPrice}/month`, 'Phone, tablet & desktop'].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><MarkerTick className="h-4 w-4 flex-none text-amber-500" /> {t}</li>
            ))}
          </ul>
        </div>
        {visual ? <div className="relative">{visual}</div> : aside ? <div className="hidden lg:block">{aside}</div> : null}
      </div>
    </Container>
  </section>
);

const AnswerBox: React.FC<{ text: string }> = ({ text }) => (
  <section aria-label="Short answer" data-answer="" className="py-10 sm:py-12">
    <Container className="max-w-4xl">
      <div className="rounded-2xl border-l-4 border-brand-600 bg-card p-5 shadow-soft sm:p-7">
        <h2 className="text-sm font-bold uppercase tracking-wider text-brand-700">Short answer</h2>
        <p className="mt-2 text-[17px] leading-8 text-foreground sm:text-lg sm:leading-8">{renderInline(text, 'answer')}</p>
      </div>
    </Container>
  </section>
);

/** An example document as a sheet of paper, with a real table (example prices are labelled as such). */
const SampleSheet: React.FC<{ doc: SampleDocument; badge?: string; className?: string }> = ({ doc, badge = 'Example prices', className = '' }) => {
  const subtotal = doc.lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const tax = doc.taxRate ? Math.round(subtotal * doc.taxRate) / 100 : 0;
  const total = subtotal + tax;
  return (
    <figure className={`relative rounded-[6px] bg-white text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.06),0_24px_40px_-24px_rgba(16,24,40,.35)] ring-1 ring-slate-200 ${className}`}>
      <div className="h-1.5 rounded-t-[6px] bg-brand-600" aria-hidden="true" />
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">{doc.type}</p>
            <figcaption className="mt-1 font-display text-base font-extrabold leading-snug text-slate-900 sm:text-lg">{doc.title}</figcaption>
          </div>
          <span className="flex-none -rotate-3 rounded border-2 border-amber-500/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">{badge}</span>
        </div>
        <table className="mt-4 w-full border-collapse text-left text-[13px] sm:text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-[11px] uppercase tracking-wider text-slate-500">
              <th scope="col" className="py-2 pr-2 font-semibold">Description</th>
              <th scope="col" className="py-2 px-2 text-right font-semibold">Qty</th>
              <th scope="col" className="py-2 px-2 text-right font-semibold">Rate</th>
              <th scope="col" className="py-2 pl-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-2 leading-snug">{l.description}</td>
                <td className="whitespace-nowrap py-2 px-1.5 text-right font-mono text-[11px] tabular-nums text-slate-600 sm:px-2 sm:text-[12px]">{qtyText(l.qty)} {l.unit}</td>
                <td className="whitespace-nowrap py-2 px-1.5 text-right font-mono text-[11px] tabular-nums text-slate-600 sm:px-2 sm:text-[12px]">{money(l.rate)}</td>
                <td className="whitespace-nowrap py-2 pl-1.5 text-right font-mono text-[11px] tabular-nums sm:pl-2 sm:text-[12px]">{money(l.qty * l.rate)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-mono text-[12px] tabular-nums sm:text-[13px]">
            <tr>
              <th scope="row" colSpan={3} className="pt-3 pr-2 text-right font-sans font-semibold text-slate-500">Subtotal</th>
              <td className="pt-3 pl-2 text-right">{money(subtotal)}</td>
            </tr>
            {doc.taxRate ? (
              <tr>
                <th scope="row" colSpan={3} className="pt-1 pr-2 text-right font-sans font-semibold text-slate-500">Tax {doc.taxRate}%</th>
                <td className="pt-1 pl-2 text-right">{money(tax)}</td>
              </tr>
            ) : null}
            <tr className="text-[14px] font-bold text-slate-900">
              <th scope="row" colSpan={3} className="pt-2 pr-2 text-right font-sans">Total</th>
              <td className="pt-2 pl-2 text-right">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
        {doc.note ? <p className="mt-4 border-t border-dashed border-slate-200 pt-3 text-[12.5px] leading-relaxed text-slate-500">{doc.note}</p> : null}
      </div>
    </figure>
  );
};

const RelatedGuides: React.FC<{ slugs: string[]; title: string }> = ({ slugs, title }) => {
  const posts = slugs.map(getPostMeta).filter(Boolean) as BlogPostMeta[];
  if (!posts.length) return null;
  return (
    <div>
      <h2 id="guides" className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground">{title}</h2>
      <ul className="mt-5 divide-y divide-border border-y border-border">
        {posts.map((p) => (
          <li key={p.slug}>
            <Link to={`/blog/${p.slug}`} className="group flex min-h-[56px] items-center gap-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug text-foreground group-hover:text-brand-700">{p.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{p.readingTime} min read</span>
              </span>
              <ArrowRight className="h-4 w-4 flex-none text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

const SiblingLinks: React.FC<{ title: string; pages: LandingMeta[]; currentKey: string; labelOf?: (m: LandingMeta) => string }> = ({ title, pages, currentKey, labelOf = (m) => m.label }) => (
  <div>
    <h2 className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground">{title}</h2>
    <ul className="mt-5 flex flex-wrap gap-2">
      {pages.filter((p) => p.key !== currentKey).map((p) => (
        <li key={p.key}>
          <Link to={p.path} className="inline-flex min-h-[40px] items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground/80 shadow-soft hover:border-brand-300 hover:text-brand-700">
            {labelOf(p)}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

const FaqSection: React.FC<{ items: LandingContent['faq'] }> = ({ items }) => (
  <section aria-labelledby="faq" className="border-t border-border bg-card py-16 sm:py-20">
    <Container className="max-w-4xl">
      <H2 id="faq" className="text-center">Frequently asked questions</H2>
      <FaqList items={items} className="mt-10" />
    </Container>
  </section>
);

/* ------------------------------------------------------------------ trade pages */

const TradeView: React.FC<{ meta: LandingMeta; c: TradeContent }> = ({ meta, c }) => (
  <>
    <LandingHero meta={meta} content={c} visual={<SampleSheet doc={c.sample} className="lg:rotate-[0.8deg]" />} secondary={{ to: '/templates', label: 'See the templates' }} />
    <AnswerBox text={c.answer} />

    <section aria-labelledby="documents" className="pb-16 sm:pb-20">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
          <div>
            <Eyebrow className="mb-3">The paperwork</Eyebrow>
            <H2 id="documents">What {c.trade} send most, and what each one is for</H2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Every document belongs to a job and a client, uses your logo and license number, and exports to a clean PDF.
            </p>
            <Link to="/templates" className={`mt-4 inline-flex min-h-[44px] items-center gap-1.5 ${LINK_CLASS}`}>Browse all 12 templates <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <dl className="border-t-2 border-foreground/80">
            {c.documents.map((d, i) => (
              <div key={d.name} className="grid gap-1 border-b border-border py-5 sm:grid-cols-[200px_1fr] sm:gap-6">
                <dt className="flex items-baseline gap-3 font-display text-lg font-extrabold text-foreground">
                  <span aria-hidden="true" className="font-mono text-xs font-medium text-brand-600">{pad(i)}</span>{d.name}
                </dt>
                <dd className="text-[15.5px] leading-relaxed text-foreground/80">{renderInline(d.use, `doc-${i}`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>

    <section aria-labelledby="workflow" className="border-t border-border bg-gradient-to-b from-muted/50 to-background py-16 sm:py-24">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Eyebrow className="mb-3">Your week</Eyebrow>
            <H2 id="workflow">How ContractorDocs fits the way {c.trade} work</H2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              The same app on your phone in the truck and on the computer at night. Field documents keep saving without a signal and sync later.
            </p>
            <Link to="/features" className={`mt-4 inline-flex min-h-[44px] items-center gap-1.5 ${LINK_CLASS}`}>See every feature <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <ol className="relative ml-4 space-y-10 border-l-2 border-dashed border-brand-200 pl-8 sm:ml-0 sm:pl-10">
            {c.workflow.map((w, i) => (
              <li key={w.title} className="relative">
                <span aria-hidden="true" className="absolute -left-[3.05rem] top-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 font-mono text-sm font-bold text-white ring-4 ring-background sm:-left-[3.55rem]">{i + 1}</span>
                <h3 className="font-display text-xl font-extrabold text-foreground">{w.title}</h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-foreground/80 [&_strong]:text-foreground">{renderInline(w.text, `wf-${i}`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>

    <section aria-labelledby="tips" className="py-16 sm:py-20">
      <Container className="max-w-5xl">
        <div className="relative overflow-hidden rounded-[10px] bg-amber-50/80 px-5 py-8 ring-1 ring-amber-200/70 sm:px-12 sm:py-10 [background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,rgba(217,119,6,.13)_31px,rgba(217,119,6,.13)_32px)]">
          <span aria-hidden="true" className="absolute inset-y-0 left-3 w-px bg-red-300/70 sm:left-8" />
          <H2 id="tips" size="md">Paperwork tips for {c.trade}</H2>
          <ul className="mt-6 space-y-4">
            {c.tips.map((t, i) => (
              <li key={i} className="flex gap-3 text-[15.5px] leading-[1.9] text-stone-800">
                <MarkerTick className="mt-1.5 h-5 w-5 flex-none text-amber-600" />
                <span>{renderInline(t, `tip-${i}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>

    <FaqSection items={c.faq} />

    <section aria-label="Related pages" className="py-16 sm:py-20">
      <Container className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <RelatedGuides slugs={c.related} title={`Guides for ${c.trade}`} />
        <div className="space-y-10">
          <SiblingLinks title="Other trades" pages={landingPagesOf('trade')} currentKey={meta.key} />
          <SiblingLinks title="Let AI draft it" pages={landingPagesOf('ai')} currentKey={meta.key} />
        </div>
      </Container>
    </section>

    <CtaBand
      title={`Send your next estimate before you leave the job`}
      text={`Free plan with every document type, client e-signatures and ${FREE_LIMITS.ai} AI requests a month. No credit card.`}
    />
  </>
);

/* ------------------------------------------------------------------ AI pages */

const PromptToDraft: React.FC<{ c: AiContent }> = ({ c }) => (
  <div className="relative mx-auto max-w-xl">
    <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-3 text-[14px] leading-relaxed text-white shadow-lift sm:text-[15px]">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-100">You say</p>
      <p className="mt-1">“{c.prompt}”</p>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-brand-100"><Mic className="h-3.5 w-3.5" /> Typed or dictated</p>
    </div>
    <div aria-hidden="true" className="my-2 ml-10 h-8 w-px border-l-2 border-dashed border-brand-300" />
    <p className="mb-2 ml-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">The assistant drafts · nothing is saved yet</p>
    <SampleSheet doc={c.sample} badge="Draft" />
  </div>
);

const AiPlansTable: React.FC = () => {
  const rows = [
    { plan: PLANS.free.name, price: '$0', ai: FREE_LIMITS.ai, note: `All 12 document types, ${FREE_LIMITS.jobs} new jobs and ${FREE_LIMITS.emails} emails a month` },
    { plan: PLANS.premium.name, price: `$${PLANS.premium.monthlyPrice}/month or $${PLANS.premium.yearlyPrice}/year`, ai: PAID_AI_LIMITS.premium, note: 'Unlimited jobs, clients, documents and Gmail sending' },
    { plan: PLANS.ai.name, price: `$${PLANS.ai.monthlyPrice}/month or $${PLANS.ai.yearlyPrice}/year`, ai: PAID_AI_LIMITS.ai, note: 'Everything in Premium, plus photo client updates and AI walkthroughs' },
  ];
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">AI requests included in each ContractorDocs plan</caption>
      <thead>
        <tr className="border-b-2 border-foreground/80 text-xs uppercase tracking-wider text-muted-foreground">
          <th scope="col" className="py-3 pr-3 font-semibold">Plan</th>
          <th scope="col" className="py-3 px-3 text-right font-semibold">AI requests a month</th>
          <th scope="col" className="hidden py-3 pl-3 font-semibold md:table-cell">Also included</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.plan} className="border-b border-border align-top">
            <th scope="row" className="py-4 pr-3 font-normal">
              <span className="block font-display text-lg font-extrabold text-foreground">{r.plan}</span>
              <span className="block text-sm text-muted-foreground">{r.price}</span>
              <span className="mt-1 block text-sm text-muted-foreground md:hidden">{r.note}</span>
            </th>
            <td className="py-4 px-3 text-right font-mono text-2xl font-bold tabular-nums text-brand-700">{r.ai}</td>
            <td className="hidden py-4 pl-3 text-[15px] leading-relaxed text-foreground/80 md:table-cell">{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const AiView: React.FC<{ meta: LandingMeta; c: AiContent }> = ({ meta, c }) => {
  const other = landingPagesOf('ai').find((p) => p.key !== meta.key);
  const free = meta.key === 'ai-invoice-generator' ? { to: '/invoice-generator', label: 'free invoice generator' } : { to: '/estimate-generator', label: 'free estimate generator' };
  return (
    <>
      <LandingHero meta={meta} content={c} visual={<PromptToDraft c={c} />} secondary={{ to: '/features#ai-assistant', label: 'How the assistant works' }} />
      <AnswerBox text={c.answer} />

      <section aria-labelledby="how" className="pb-16 sm:pb-20">
        <Container>
          <Eyebrow className="mb-3">Step by step</Eyebrow>
          <H2 id="how">How it works</H2>
          <ol className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-5">
            {c.steps.map((s, i) => (
              <li key={s.title} className="border-t-2 border-brand-600 pt-4">
                <span aria-hidden="true" className="font-mono text-sm font-bold text-brand-600">{pad(i)}</span>
                <h3 className="mt-1 font-display text-lg font-extrabold leading-snug text-foreground">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-foreground/80 [&_strong]:text-foreground">{renderInline(s.text, `st-${i}`)}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="does" className="border-t border-border bg-gradient-to-b from-muted/50 to-background py-16 sm:py-24">
        <Container>
          <div className="max-w-3xl">
            <Eyebrow className="mb-3">What it really does</Eyebrow>
            <H2 id="does">The AI in ContractorDocs, feature by feature</H2>
          </div>
          <dl className="mt-10 grid gap-x-14 sm:grid-cols-2">
            {c.can.map((x, i) => (
              <div key={x.title} className="border-t border-border py-6">
                <dt className="font-display text-xl font-extrabold text-foreground">{x.title}</dt>
                <dd className="mt-2 text-[15.5px] leading-relaxed text-foreground/80 [&_strong]:text-foreground">{renderInline(x.text, `can-${i}`)}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section aria-labelledby="plans" className="py-16 sm:py-20">
        <Container className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <Eyebrow className="mb-3">Plans</Eyebrow>
            <H2 id="plans" size="md">AI is on every plan</H2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
              Every plan can draft estimates, invoices, change orders and reports with AI; the allowance resets at the start of each calendar month. Photo client updates and AI walkthroughs are part of {PLANS.ai.name}.
            </p>
            <div className="mt-6"><AiPlansTable /></div>
            <Link to="/pricing" className={`mt-5 inline-flex min-h-[44px] items-center gap-1.5 ${LINK_CLASS}`}>Compare plans <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div>
            <Eyebrow className="mb-3">Honest limits</Eyebrow>
            <h2 id="limits" className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground sm:text-3xl">What it won’t do</h2>
            <ul className="mt-6 divide-y divide-border border-y border-border">
              {c.limits.map((t, i) => (
                <li key={i} className="flex gap-4 py-4 text-[15.5px] leading-relaxed text-foreground/85 [&_strong]:text-foreground">
                  <span aria-hidden="true" className="mt-[0.7rem] h-0.5 w-4 flex-none rounded bg-amber-500" />
                  <span>{renderInline(t, `lim-${i}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <FaqSection items={c.faq} />

      <section aria-label="Related pages" className="py-16 sm:py-20">
        <Container className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <RelatedGuides slugs={c.related} title="Guides" />
          <div className="space-y-6">
            <h2 className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground">Also useful</h2>
            <ul className="space-y-3 text-[16px] leading-relaxed text-foreground/85">
              {other ? <li><Link to={other.path} className={LINK_CLASS}>{other.label}</Link>: {other.description}</li> : null}
              <li>No account yet? Try the <Link to={free.to} className={LINK_CLASS}>{free.label}</Link>, which works in your browser without signing up.</li>
              <li>Pricing a job with tiers? Read <Link to="/blog/good-better-best-pricing-for-contractors" className={LINK_CLASS}>good, better, best pricing for contractors</Link>.</li>
            </ul>
            <SiblingLinks title="By trade" pages={landingPagesOf('trade')} currentKey={meta.key} />
          </div>
        </Container>
      </section>

      <CtaBand
        title="Let the assistant write your next draft"
        text={`Start free with ${FREE_LIMITS.ai} AI requests a month and every document type. You review everything before it is saved or sent.`}
      />
    </>
  );
};

/* ------------------------------------------------------------------ compare pages */

const CheckedStamp: React.FC<{ asOf: string }> = ({ asOf }) => (
  <div aria-hidden="true" className="relative mr-6 mt-4 flex h-40 w-40 rotate-[-8deg] flex-col items-center justify-center rounded-full border-[3px] border-double border-brand-600/80 text-center text-brand-700">
    <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Facts checked</span>
    <span className="mt-1 font-display text-xl font-extrabold leading-tight">{asOf.split(' ')[0]}</span>
    <span className="font-mono text-sm font-bold">{asOf.split(' ')[1]}</span>
    <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.25em]">With sources</span>
  </div>
);

const CompareTable: React.FC<{ c: CompareContent }> = ({ c }) => (
  <table className="w-full border-collapse text-left text-[15px]">
    <caption className="mb-3 text-left text-sm text-muted-foreground">ContractorDocs vs {c.competitor}, as of {c.asOf}. {c.competitor} facts come from the sources listed below.</caption>
    <thead className="hidden sm:table-header-group">
      <tr className="border-b-2 border-foreground/80 text-xs uppercase tracking-wider text-muted-foreground">
        <th scope="col" className="w-[22%] py-3 pr-4 font-semibold">Topic</th>
        <th scope="col" className="bg-brand-50/70 px-4 py-3 font-semibold text-brand-700">ContractorDocs</th>
        <th scope="col" className="px-4 py-3 font-semibold">{c.competitor}</th>
      </tr>
    </thead>
    <tbody>
      {c.rows.map((r, i) => (
        <tr key={r.topic} className="block border-b border-border py-4 sm:table-row sm:py-0">
          <th scope="row" className="block pb-2 font-display text-base font-extrabold text-foreground sm:table-cell sm:py-4 sm:pr-4 sm:align-top">{r.topic}</th>
          <td className="block rounded-lg bg-brand-50/70 px-3 py-2 leading-relaxed text-foreground/90 sm:table-cell sm:rounded-none sm:px-4 sm:py-4 sm:align-top">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-brand-700 sm:hidden">ContractorDocs</span>
            {renderInline(r.us, `us-${i}`)}
          </td>
          <td className="block px-3 py-2 leading-relaxed text-foreground/80 sm:table-cell sm:px-4 sm:py-4 sm:align-top">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:hidden">{c.competitor}</span>
            {renderInline(r.them, `them-${i}`)}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const FitList: React.FC<{ title: string; items: string[]; tone: 'them' | 'us'; id: string }> = ({ title, items, tone, id }) => (
  <div className={`border-l-4 pl-5 sm:pl-7 ${tone === 'us' ? 'border-brand-600' : 'border-slate-400'}`}>
    <h3 id={id} className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground">{title}</h3>
    <ul className="mt-5 space-y-4">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[15.5px] leading-relaxed text-foreground/85">
          <MarkerTick className={`mt-0.5 h-5 w-5 flex-none ${tone === 'us' ? 'text-amber-500' : 'text-slate-500'}`} />
          <span>{renderInline(t, `${id}-${i}`)}</span>
        </li>
      ))}
    </ul>
  </div>
);

const CompareView: React.FC<{ meta: LandingMeta; c: CompareContent }> = ({ meta, c }) => (
  <>
    <LandingHero meta={meta} content={c} aside={<CheckedStamp asOf={c.asOf} />} />
    <AnswerBox text={c.answer} />

    <section aria-labelledby="compare" className="pb-16 sm:pb-20">
      <Container className="max-w-5xl">
        <Eyebrow className="mb-3">Side by side</Eyebrow>
        <H2 id="compare">ContractorDocs vs {c.competitor} at a glance</H2>
        <div className="mt-8"><CompareTable c={c} /></div>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          Prices are in US dollars before tax. Plans and prices change, so check {c.competitor}’s own site before you decide. ContractorDocs facts come from our <Link to="/pricing" className={LINK_CLASS}>pricing page</Link> and <Link to="/help" className={LINK_CLASS}>help center</Link>.
        </p>
      </Container>
    </section>

    <section aria-labelledby="fit" className="border-t border-border bg-gradient-to-b from-muted/50 to-background py-16 sm:py-24">
      <Container className="max-w-6xl">
        <Eyebrow className="mb-3">A fair verdict</Eyebrow>
        <H2 id="fit">Which one fits your business?</H2>
        <div className="mt-10 grid gap-12 lg:grid-cols-2">
          <FitList id="fit-them" title={`Choose ${c.competitor} if…`} items={c.pickThem} tone="them" />
          <FitList id="fit-us" title="Choose ContractorDocs if…" items={c.pickUs} tone="us" />
        </div>
      </Container>
    </section>

    <section aria-labelledby="sources" className="py-16 sm:py-20">
      <Container className="max-w-5xl">
        <h2 id="sources" className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground">Sources (checked {c.asOf})</h2>
        <ol className="mt-5 list-decimal space-y-2 pl-6 text-[15.5px] leading-relaxed text-foreground/85 marker:font-mono marker:text-sm marker:text-muted-foreground">
          {c.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className={`${LINK_CLASS} break-words`}>{s.label}</a>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          {c.competitor} is a trademark of its owner. ContractorDocs is not affiliated with or endorsed by {c.competitor}. Spotted something out of date? Email <a href="mailto:support@contractordocs.app" className={LINK_CLASS}>support@contractordocs.app</a> and we will correct it.
        </p>
      </Container>
    </section>

    <FaqSection items={c.faq} />

    <section aria-label="Related pages" className="py-16 sm:py-20">
      <Container className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <RelatedGuides slugs={c.related} title="Guides" />
        <div className="space-y-10">
          <SiblingLinks title="Other comparisons" pages={landingPagesOf('compare')} currentKey={meta.key} />
          <SiblingLinks title="By trade" pages={landingPagesOf('trade')} currentKey={meta.key} />
        </div>
      </Container>
    </section>

    <CtaBand
      title={`Try ContractorDocs next to ${c.competitor}`}
      text="The Free plan has every document type, client e-signatures and AI drafting. No credit card, and you can export everything at any time."
    />
  </>
);

/* ------------------------------------------------------------------ route */

const LandingSkeleton: React.FC = () => (
  <Container className="max-w-4xl py-16" >
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      {[60, 92, 80, 0, 96, 88, 70].map((w, i) => (w ? <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} /> : <div key={i} className="h-4" />))}
    </div>
  </Container>
);

const LandingView: React.FC<{ meta: LandingMeta; content: LandingContent }> = ({ meta, content }) => {
  if (content.kind === 'trade') return <TradeView meta={meta} c={content} />;
  if (content.kind === 'ai') return <AiView meta={meta} c={content} />;
  return <CompareView meta={meta} c={content} />;
};

const LandingRoute: React.FC = () => {
  const { pathname } = useLocation();
  const meta = getLandingMeta(normalizePath(pathname));
  const key = meta?.key || '';
  const [content, setContent] = useState<LandingContent | undefined>(() => (key ? getLoadedLanding(key) : undefined));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const shown = content && content.key === key ? content : key ? getLoadedLanding(key) : undefined;

  useEffect(() => {
    if (!key || getLoadedLanding(key)) return;
    let alive = true;
    setFailed(false);
    loadLanding(key)
      .then((c) => { if (alive) { if (c) setContent(c); else setFailed(true); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [key, attempt]);

  if (!meta) return <NotFoundPage />;
  if (shown) return <LandingView meta={meta} content={shown} />;
  if (failed) {
    return (
      <Container className="max-w-3xl py-20">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="font-semibold text-foreground">This page could not be loaded.</p>
          <p className="mt-1 text-muted-foreground">Check your connection and try again.</p>
          <button type="button" onClick={() => { setFailed(false); setAttempt((a) => a + 1); }} className="btn btn-primary mt-5">Try again</button>
        </div>
      </Container>
    );
  }
  return <LandingSkeleton />;
};

export default LandingRoute;
