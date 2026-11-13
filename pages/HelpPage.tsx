/**
 * Public help center (/help, prerendered): the same step-by-step guides as the in-app Help & tutorials page
 * (components/help/helpContent.ts), so the two never disagree.
 */
import React from 'react';
import { Container, PageHero, CtaBand } from './components/ui.tsx';
import { HELP_GROUPS, HELP_GUIDES } from '../components/help/helpContent.ts';
import { GuideArticle, UiChip } from '../components/help/HelpText.tsx';
import { SITE } from '../content/site.ts';

/** The first invoice, as the clicks you actually make. */
const QUICK_START: { label: string; text: string }[] = [
  { label: 'New Job', text: 'Name the job and pick or type the client.' },
  { label: 'New Document', text: 'Choose Invoice (or any of the 12 types) and add your lines.' },
  { label: 'Save', text: 'Your company details, totals and tax are filled in for you.' },
  { label: 'Share', text: 'Send it from your Gmail or copy the client’s portal link.' },
];

const HelpPage: React.FC = () => (
  <>
    <PageHero
      eyebrow="Help center"
      title="How ContractorDocs works"
      subtitle="Short, step-by-step guides for every feature, written with the exact buttons you will see in the app."
      breadcrumbs={[{ name: 'Home', to: '/' }, { name: 'Help center' }]}
    />

    <section className="border-b border-border bg-card py-10 sm:py-12" aria-labelledby="quick-start">
      <Container>
        <h2 id="quick-start" className="font-display text-2xl font-extrabold tracking-tight text-foreground">Your first invoice in four clicks</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_START.map((s, i) => (
            <li key={s.label} className="relative rounded-2xl border border-border bg-background p-4">
              <span className="text-xs font-bold tabular-nums text-brand-600">Step {i + 1}</span>
              <p className="mt-2"><UiChip>{s.label}</UiChip></p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>

    <section className="py-12 sm:py-16">
      <Container>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Guides" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <p className="mb-3 text-sm font-semibold text-foreground">All guides</p>
            <div className="space-y-4">
              {HELP_GROUPS.map((group) => (
                <div key={group}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                  <ul className="flex flex-wrap gap-1.5 lg:block lg:space-y-0.5">
                    {HELP_GUIDES.filter((g) => g.group === group).map((g) => (
                      <li key={g.id}>
                        <a href={`#${g.id}`} className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-2.5 text-sm text-foreground/85 hover:text-foreground lg:min-h-[32px] lg:border-0 lg:px-2 lg:hover:bg-muted">
                          {g.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <div className="min-w-0 space-y-12">
            {HELP_GROUPS.map((group) => (
              <section key={group} aria-labelledby={`group-${group.replace(/[^a-z]+/gi, '-').toLowerCase()}`} className="space-y-4">
                <h2 id={`group-${group.replace(/[^a-z]+/gi, '-').toLowerCase()}`} className="font-display text-xl font-extrabold tracking-tight text-foreground">{group}</h2>
                {HELP_GUIDES.filter((g) => g.group === group).map((g) => <GuideArticle key={g.id} guide={g} headingLevel="h3" />)}
              </section>
            ))}
            <p className="text-[15px] text-muted-foreground">
              Can&rsquo;t find what you need? Email <a className="font-semibold text-brand-700 hover:underline" href={`mailto:${SITE.email}`}>{SITE.email}</a> and a real person will answer.
              Signed in already? The same guides are in the app under your account menu, Help &amp; tutorials, with a one-minute tour.
            </p>
          </div>
        </div>
      </Container>
    </section>

    <CtaBand />
  </>
);

export default HelpPage;
