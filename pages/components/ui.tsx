import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, ChevronRight } from './icons.tsx';
import { SIGNUP_PATH, type FaqItem } from '../../content/site.ts';
import { renderInline } from './Markdown.tsx';

export const GRID_BG =
  "bg-[linear-gradient(to_right,hsl(var(--border)/0.8)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.8)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]";

export const Container: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <p className={`text-sm font-semibold uppercase tracking-[0.14em] text-brand-600 ${className}`}>{children}</p>
);

export const SectionHeader: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'center' | 'left';
  id?: string;
  as?: 'h1' | 'h2';
}> = ({ eyebrow, title, subtitle, align = 'center', id, as = 'h2' }) => {
  const H = as;
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      {eyebrow ? <Eyebrow className="mb-3">{eyebrow}</Eyebrow> : null}
      <H id={id} className="font-display text-3xl font-extrabold leading-tight tracking-[-0.01em] text-foreground sm:text-4xl">
        {title}
      </H>
      {subtitle ? <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
};

type ButtonLinkProps = {
  to: string;
  variant?: 'primary' | 'outline' | 'ghost' | 'white' | 'dark';
  size?: 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
  arrow?: boolean;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

const VARIANTS: Record<NonNullable<ButtonLinkProps['variant']>, string> = {
  primary: 'bg-brand-600 text-white shadow-[0_8px_20px_-8px_rgba(33,72,237,.6)] hover:bg-brand-700',
  outline: 'border border-border bg-card text-foreground shadow-soft hover:border-brand-300 hover:bg-brand-50/60',
  ghost: 'text-foreground hover:bg-muted',
  white: 'bg-white text-brand-700 shadow-lg hover:bg-brand-50',
  dark: 'border border-white/25 bg-white/10 text-white hover:bg-white/20',
};

export const ButtonLink: React.FC<ButtonLinkProps> = ({ to, variant = 'primary', size = 'md', className = '', children, arrow, ...rest }) => (
  <Link
    to={to}
    className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
      size === 'lg' ? 'px-6 py-3 text-base' : 'px-4 py-2.5 text-sm'
    } ${VARIANTS[variant]} ${className}`}
    {...rest}
  >
    {children}
    {arrow ? <ArrowRight className="h-4 w-4" /> : null}
  </Link>
);

export const CheckList: React.FC<{ items: React.ReactNode[]; className?: string; tone?: 'brand' | 'success' }> = ({ items, className = '', tone = 'brand' }) => (
  <ul className={`space-y-3 ${className}`}>
    {items.map((item, i) => (
      <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed text-foreground/85">
        <span className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full ${tone === 'success' ? 'bg-success/15 text-success' : 'bg-brand-100 text-brand-700'}`}>
          <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
        </span>
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

export const FaqList: React.FC<{ items: FaqItem[]; className?: string }> = ({ items, className = '' }) => (
  <div className={`divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft ${className}`}>
    {items.map((item, i) => (
      <details key={i} className="group" {...(i === 0 ? { open: true } : {})}>
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-foreground hover:bg-muted/50 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span>{item.q}</span>
          <ChevronDown className="h-5 w-5 flex-none text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground sm:px-6">{renderInline(item.a, `faq-${i}`)}</div>
      </details>
    ))}
  </div>
);

export const Breadcrumbs: React.FC<{ items: { name: string; to?: string }[]; className?: string }> = ({ items, className = '' }) => (
  <nav aria-label="Breadcrumb" className={className}>
    <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-1.5">
          {i > 0 ? <ChevronRight className="h-3.5 w-3.5 opacity-60" /> : null}
          {item.to ? (
            <Link to={item.to} className="hover:text-foreground hover:underline">{item.name}</Link>
          ) : (
            <span aria-current="page" className="text-foreground/80">{item.name}</span>
          )}
        </li>
      ))}
    </ol>
  </nav>
);

export const PageHero: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  breadcrumbs?: { name: string; to?: string }[];
}> = ({ eyebrow, title, subtitle, children, breadcrumbs }) => (
  <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand-50/70 via-background to-background">
    <div aria-hidden="true" className={`${GRID_BG} pointer-events-none absolute inset-0 opacity-70`} />
    <Container className="relative py-14 sm:py-20">
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} className="mb-6" /> : null}
      <div className="max-w-3xl">
        {eyebrow ? <Eyebrow className="mb-3">{eyebrow}</Eyebrow> : null}
        <h1 className="font-display text-4xl font-extrabold leading-[1.1] tracking-[-0.015em] text-foreground sm:text-5xl">{title}</h1>
        {subtitle ? <p className="mt-5 text-lg leading-relaxed text-muted-foreground sm:text-xl">{subtitle}</p> : null}
        {children}
      </div>
    </Container>
  </section>
);

export const CtaBand: React.FC<{ title?: string; text?: string; primaryTo?: string; primaryLabel?: string; secondaryTo?: string; secondaryLabel?: string }> = ({
  title = 'Get your paperwork off your plate',
  text = 'Create your first invoice, estimate or daily report in a few minutes. Free plan, no credit card.',
  primaryTo = SIGNUP_PATH,
  primaryLabel = 'Start free',
  secondaryTo = '/pricing',
  secondaryLabel = 'See pricing',
}) => (
  <section className="py-16 sm:py-24">
    <Container>
      <div className="relative overflow-hidden rounded-3xl bg-brand-700 px-6 py-12 text-center shadow-lift sm:px-12 sm:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-400/40 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-amber-400/25 blur-3xl" />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="font-display text-3xl font-extrabold tracking-[-0.01em] text-white sm:text-4xl">{title}</h2>
          <p className="mt-4 text-lg text-brand-100">{text}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink to={primaryTo} variant="white" size="lg" arrow className="w-full sm:w-auto">{primaryLabel}</ButtonLink>
            {secondaryTo ? <ButtonLink to={secondaryTo} variant="dark" size="lg" className="w-full sm:w-auto">{secondaryLabel}</ButtonLink> : null}
          </div>
        </div>
      </div>
    </Container>
  </section>
);
