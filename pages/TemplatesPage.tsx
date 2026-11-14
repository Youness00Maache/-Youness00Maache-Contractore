import React from 'react';
import { Link } from 'react-router-dom';
import { Container, PageHero, ButtonLink, CtaBand, SectionHeader } from './components/ui.tsx';
import { DocThumb, type ThumbStyle } from './components/Mockups.tsx';
import { ArrowRight, Check } from './components/icons.tsx';
import { DOCUMENT_TYPES, SIGNUP_PATH } from '../content/site.ts';
import { TEMPLATE_PREVIEWS } from '../content/templatePreviews.ts';

const STYLE_FOR_DOC: ThumbStyle[] = ['modern', 'classic', 'bold', 'minimal', 'warm', 'blueprint'];

const BASIC_PREVIEWS = TEMPLATE_PREVIEWS.filter((p) => !p.premium);
const PREMIUM_PREVIEWS = TEMPLATE_PREVIEWS.filter((p) => p.premium);
const PREVIEW_GROUPS = [
  { id: 'basic', title: 'Basic designs', note: 'Free on every plan.', items: BASIC_PREVIEWS },
  { id: 'premium', title: 'Premium designs', note: 'Premium plans: choose the fonts, header, table style and which sections print.', items: PREMIUM_PREVIEWS },
];

const STYLES: { style: ThumbStyle; name: string; text: string }[] = [
  { style: 'modern', name: 'Modern Blue', text: 'Clean header band and clear totals. A safe default for any trade.' },
  { style: 'classic', name: 'Elegant', text: 'Serif type and fine rules for high-end remodels and custom work.' },
  { style: 'bold', name: 'Industrial', text: 'Dark header with a safety-amber accent. Strong and easy to scan.' },
  { style: 'minimal', name: 'Minimal', text: 'Lots of white space and quiet type. Prints well in black and white.' },
  { style: 'warm', name: 'Warm', text: 'Soft cream paper and terracotta accents for residential clients.' },
  { style: 'blueprint', name: 'Blueprint Tech', text: 'Monospace details and blueprint blues for technical trades.' },
];

const TemplatesPage: React.FC = () => (
  <>
    <PageHero
      eyebrow="Templates"
      title="Contractor document templates that look the part"
      subtitle={`Invoices, estimates, change orders, daily reports and eight more document types, each in ${TEMPLATE_PREVIEWS.length} professional designs with your logo, colors and details filled in automatically.`}
    >
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink to={SIGNUP_PATH} size="lg" arrow className="w-full sm:w-auto">Use these templates free</ButtonLink>
        <ButtonLink to="/invoice-generator" size="lg" variant="outline" className="w-full sm:w-auto">Try the invoice generator</ButtonLink>
      </div>
    </PageHero>

    <section aria-labelledby="types-heading" className="py-20 sm:py-24">
      <Container>
        <SectionHeader
          id="types-heading"
          eyebrow="12 document types"
          title="A template for every step of the job"
          subtitle="Every template is fillable in the app, calculates its own totals and exports to PDF. The thumbnails below are simplified illustrations; see real designs further down."
        />
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DOCUMENT_TYPES.map((d, i) => (
            <li key={d.id} className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
              <div className="flex justify-center bg-gradient-to-b from-muted/40 to-muted px-10 pb-0 pt-8">
                <DocThumb title={d.name} icon={d.id} styleName={STYLE_FOR_DOC[i % STYLE_FOR_DOC.length]} className="max-w-[230px] translate-y-3" />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="text-lg font-bold text-foreground">{d.name} template</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{d.summary}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {d.fields.map((f) => (
                    <li key={f} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground/75">
                      <Check className="h-3 w-3 text-success" strokeWidth={3} /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-5">
                  <Link to={SIGNUP_PATH} className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
                    Use template <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link to={d.href} className="inline-flex min-h-[40px] items-center text-sm font-medium text-muted-foreground hover:text-foreground">
                    {d.hrefLabel}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>

    <section aria-labelledby="styles-heading" className="border-y border-border bg-card py-20 sm:py-24">
      <Container>
        <SectionHeader
          id="styles-heading"
          eyebrow="Styles"
          title="Pick a look that fits your brand"
          subtitle={`${TEMPLATE_PREVIEWS.length} designs in your own brand colors: ${BASIC_PREVIEWS.length} free on every plan, ${PREMIUM_PREVIEWS.length} Premium designs you can customize. Switch at any time without retyping anything.`}
        />
        {TEMPLATE_PREVIEWS.length ? (
          PREVIEW_GROUPS.filter((g) => g.items.length).map((g) => (
            <div key={g.id} className="mt-14">
              <div className="flex flex-col gap-1 border-b border-border pb-3 sm:flex-row sm:items-baseline sm:justify-between">
                <h3 className="text-lg font-bold text-foreground">{g.title}</h3>
                <p className="text-sm text-muted-foreground">{g.note}</p>
              </div>
              <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
                {g.items.map((p) => (
                  <li key={p.id}>
                    <figure>
                      <img src={p.src} alt={`${p.name} invoice template preview`} width={640} height={828} loading="lazy" decoding="async" className="h-auto w-full rounded-lg bg-white shadow-card ring-1 ring-border" />
                      <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm font-semibold text-foreground">
                        {p.name}
                        {p.premium ? <span className="badge badge-primary">Premium</span> : null}
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <ul className="mt-14 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-6">
            {STYLES.map((s) => (
              <li key={s.style}>
                <DocThumb title="Invoice" icon="invoice" styleName={s.style} />
                <p className="mt-4 font-semibold text-foreground">{s.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>

    <section aria-labelledby="why-heading" className="py-20 sm:py-24">
      <Container className="max-w-5xl">
        <SectionHeader id="why-heading" title="Why use templates in an app instead of Word or Excel?" />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { t: 'Math you can trust', d: 'Line totals, tax, discounts, deposits and progress billing are calculated for you, the same way on screen and in the PDF.' },
            { t: 'Always on brand', d: 'Your logo, business details, license number and terms appear on every document automatically.' },
            { t: 'Organized by job', d: 'Every document is filed under its job and client, ready to email, sign or find again in seconds.' },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h3 className="font-bold text-foreground">{c.t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{c.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-[15px] text-muted-foreground">
          Not sure what goes on each document? Start with the{' '}
          <Link to="/blog/contractor-paperwork-checklist" className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4">contractor paperwork checklist</Link>.
        </p>
      </Container>
    </section>

    <CtaBand title="Make your first document in minutes" text="All 12 document types are included on the Free plan." />
  </>
);

export default TemplatesPage;
