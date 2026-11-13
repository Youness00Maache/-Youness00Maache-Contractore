import React from 'react';
import { Container, Breadcrumbs } from './ui.tsx';
import { ArrowLeft } from './icons.tsx';
import { Logo } from './Logo.tsx';

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/**
 * Shared layout for Privacy / Terms / Security.
 * - Inside the marketing site it renders as page content (header/footer come from SiteLayout).
 * - When the app renders it standalone (legacy `onBack` prop), it adds a minimal top bar.
 */
export const LegalDocument: React.FC<{
  title: string;
  intro: React.ReactNode;
  updated: string;
  sections: LegalSection[];
  onBack?: () => void;
}> = ({ title, intro, updated, sections, onBack }) => {
  const content = (
    <>
      <header className="border-b border-border bg-gradient-to-b from-brand-50/60 to-background">
        <Container className="max-w-5xl py-12 sm:py-16">
          {onBack ? null : <Breadcrumbs items={[{ name: 'Home', to: '/' }, { name: title }]} className="mb-6" />}
          <h1 className="font-display text-4xl font-extrabold tracking-[-0.01em] text-foreground sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            Last updated: <time dateTime={updated}>{new Date(`${updated}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</time>
          </p>
          <div className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">{intro}</div>
        </Container>
      </header>
      <Container className="max-w-5xl py-12 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Sections" className="hidden lg:block">
            <ol className="sticky top-24 space-y-1 border-l border-border text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-muted-foreground hover:border-brand-500 hover:text-foreground">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="prose-cd min-w-0 [&>section:first-child>h2]:mt-0">
            {sections.map((s, i) => (
              <section key={s.id} aria-labelledby={s.id}>
                <h2 id={s.id} className="scroll-mt-24">{i + 1}. {s.title}</h2>
                {s.body}
              </section>
            ))}
          </div>
        </div>
      </Container>
    </>
  );

  if (!onBack) return content;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <Container className="flex h-14 items-center justify-between">
          <button type="button" onClick={onBack} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm font-semibold text-foreground/80 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <Logo markClassName="h-7 w-7" />
        </Container>
      </div>
      {content}
    </div>
  );
};

export default LegalDocument;
