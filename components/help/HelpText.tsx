/**
 * Rendering for the guides in helpContent.ts, shared by the app (help panels, /tutorials) and the public /help page.
 * Marketing-safe: React only. [[Label]] becomes a chip drawn like the app's own buttons, so a step shows the exact
 * control to look for instead of an icon.
 */
import React from 'react';
import type { HelpGuide, HelpStep } from './helpContent.ts';

export const HelpCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
);

/** A control label drawn like a real button. */
export const UiChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="mx-px inline-flex items-center whitespace-nowrap rounded-md border border-border bg-card px-1.5 py-px align-baseline text-[0.86em] font-semibold leading-snug text-foreground shadow-[0_1px_0_hsl(var(--border))]">
    {children}
  </span>
);

/** Text with [[Label]] chips. */
export const HelpText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\[\[[^\]]+\]\])/g).map((part, i) =>
      part.startsWith('[[') && part.endsWith(']]') ? <UiChip key={i}>{part.slice(2, -2)}</UiChip> : <React.Fragment key={i}>{part}</React.Fragment>,
    )}
  </>
);

/** "Tools › Profit calculator": the clicks to get there. */
export const GuideWhere: React.FC<{ where: string[]; className?: string }> = ({ where, className = '' }) => (
  <p className={`flex flex-wrap items-center gap-1 text-xs text-muted-foreground ${className}`}>
    <span className="mr-0.5 font-semibold uppercase tracking-wide">Where</span>
    {where.map((w, i) => (
      <React.Fragment key={w + i}>
        {i > 0 && <span aria-hidden="true">›</span>}
        <UiChip>{w}</UiChip>
      </React.Fragment>
    ))}
  </p>
);

/** Numbered steps on a rail. */
export const GuideSteps: React.FC<{ steps: HelpStep[]; dense?: boolean }> = ({ steps, dense }) => (
  <ol className="relative">
    {steps.map((s, i) => (
      <li key={s.title} className={`relative flex gap-3 ${i < steps.length - 1 ? (dense ? 'pb-4' : 'pb-5') : ''}`}>
        {i < steps.length - 1 && <span aria-hidden="true" className="absolute left-[11px] top-7 bottom-1 w-px bg-border" />}
        <span className="relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold tabular-nums text-primary-foreground">
          {i + 1}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-foreground">{s.title}</p>
          <p className={`mt-0.5 text-sm leading-relaxed text-muted-foreground ${dense ? '' : 'sm:text-[15px]'}`}><HelpText text={s.text} /></p>
        </div>
      </li>
    ))}
  </ol>
);

export const GuideTips: React.FC<{ tips?: string[] }> = ({ tips }) =>
  tips && tips.length ? (
    <div className="rounded-xl border border-dashed border-border px-3.5 py-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Good to know</p>
      <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
        {tips.map((t) => <li key={t} className="flex gap-2"><span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" /><span><HelpText text={t} /></span></li>)}
      </ul>
    </div>
  ) : null;

/** One full guide (used by both help pages). `headingLevel` keeps the page outline right. */
export const GuideArticle: React.FC<{ guide: HelpGuide; headingLevel?: 'h2' | 'h3'; actions?: React.ReactNode }> = ({ guide, headingLevel = 'h2', actions }) => {
  const H = headingLevel;
  return (
    <article id={guide.id} className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <H className="text-lg font-bold tracking-tight text-foreground">{guide.title}</H>
          <p className="mt-1 text-sm text-muted-foreground">{guide.summary}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      <GuideWhere where={guide.where} className="mt-3" />
      <div className="mt-5"><GuideSteps steps={guide.steps} /></div>
      {guide.tips?.length ? <div className="mt-5"><GuideTips tips={guide.tips} /></div> : null}
    </article>
  );
};
