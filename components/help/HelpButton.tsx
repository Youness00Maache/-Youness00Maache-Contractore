/**
 * "How it works" button for a screen header, and the step-by-step panel it opens
 * (bottom sheet on phones, side panel from `sm`). Content: components/help/helpContent.ts.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getGuide, type HelpTopicId } from './helpContent.ts';
import { GuideSteps, GuideTips, GuideWhere, HelpCircleIcon } from './HelpText.tsx';
import { openAppPath, requestAppTour } from './helpNav.ts';

/** Guides worth reading next, per screen. */
const RELATED: Partial<Record<HelpTopicId, HelpTopicId[]>> = {
  dashboard: ['jobs', 'ai', 'documents'],
  jobs: ['documents', 'photos', 'payments'],
  documents: ['estimates', 'payments', 'ai'],
  estimates: ['clients', 'reminders'],
  payments: ['reminders', 'documents'],
  ai: ['documents', 'clients'],
  clients: ['estimates', 'payments', 'messages'],
  messages: ['reminders', 'clients'],
  reminders: ['messages', 'payments'],
  'quote-link': ['leads', 'clients', 'photos'],
  leads: ['appointments', 'quote-link', 'clients'],
  appointments: ['leads', 'calendar'],
  photos: ['clients', 'jobs'],
  inventory: ['suppliers', 'pricebook', 'documents'],
  suppliers: ['inventory', 'documents'],
  pricebook: ['inventory', 'documents'],
  calculator: ['pricebook', 'estimates'],
  calendar: ['jobs', 'business-overview'],
  'business-overview': ['job-costing', 'pipeline', 'calendar'],
  settings: ['payments', 'reminders', 'quote-link', 'notifications', 'automations'],
  notifications: ['settings', 'reminders', 'inventory', 'automations'],
  automations: ['notifications', 'reminders', 'settings'],
  crew: ['job-costing', 'jobs', 'notifications'],
  'job-files': ['job-questions', 'photos', 'clients'],
  'job-questions': ['job-files', 'clients', 'job-tasks'],
  'client-questions-view': ['job-questions', 'job-files', 'clients'],
  'job-selections': ['client-selections-view', 'job-boards', 'suppliers'],
  'job-boards': ['job-selections', 'client-selections-view', 'photos'],
  'client-selections-view': ['job-selections', 'job-boards', 'clients'],
  subcontractors: ['compare-quotes', 'sub-link', 'job-costing'],
  'compare-quotes': ['subcontractors', 'suppliers', 'job-costing'],
  'sub-link': ['subcontractors', 'crew', 'job-tasks'],
};

export const HelpPanel: React.FC<{ topic: HelpTopicId; open: boolean; onClose: () => void }> = ({ topic, open, onClose }) => {
  const [current, setCurrent] = useState<HelpTopicId>(topic);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const navigate = useNavigate();

  useEffect(() => { if (open) setCurrent(topic); }, [open, topic]);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); } };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => panelRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open]);

  useEffect(() => { panelRef.current?.scrollTo?.({ top: 0 }); }, [current]);

  if (!open) return null;
  const guide = getGuide(current);
  const related = (RELATED[current] || []).map(getGuide);
  const go = (path: string) => { onClose(); openAppPath(navigate, path); };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-stretch sm:justify-end" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-panel-title"
        tabIndex={-1}
        className="flex max-h-[88vh] w-full flex-col rounded-t-3xl border border-border bg-card text-card-foreground shadow-2xl outline-none sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-3xl sm:border-y-0 sm:border-r-0"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-4 sm:pt-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"><HelpCircleIcon className="h-3.5 w-3.5" /> How this works</p>
            <h2 id="help-panel-title" className="mt-1 text-lg font-bold leading-tight text-foreground">{guide.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{guide.summary}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close help" className="btn btn-ghost -mr-2 h-10 w-10 shrink-0 rounded-full p-0">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <GuideWhere where={guide.where} />
          <GuideSteps steps={guide.steps} dense />
          <GuideTips tips={guide.tips} />
          {related.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Related guides</p>
              <div className="flex flex-wrap gap-1.5">
                {related.map((g) => (
                  <button key={g.id} type="button" onClick={() => setCurrent(g.id)} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/50 hover:text-primary">
                    {g.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {current === 'dashboard' && (
            <button type="button" className="btn btn-primary btn-sm h-10" onClick={() => { onClose(); navigate('/dashboard'); requestAppTour(); }}>Take the app tour</button>
          )}
          {current !== topic && (
            <button type="button" className="btn btn-outline btn-sm h-10" onClick={() => go(guide.appPath)}>Open</button>
          )}
          <button type="button" className="btn btn-ghost btn-sm h-10" onClick={() => go(`/tutorials#${current}`)}>All guides</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Small header button: "?" on phones (or always with `iconOnly`), "How it works" from `sm`. */
const HelpButton: React.FC<{ topic: HelpTopicId; className?: string; label?: string; iconOnly?: boolean }> = ({ topic, className = '', label = 'How it works', iconOnly }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${getGuide(topic).title}`}
        title={label}
        className={`btn btn-ghost h-10 w-10 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground ${iconOnly ? '' : 'sm:w-auto sm:rounded-xl sm:px-3'} ${className}`}
      >
        <HelpCircleIcon className="h-[18px] w-[18px]" />
        {!iconOnly && <span className="hidden sm:inline">{label}</span>}
      </button>
      <HelpPanel topic={topic} open={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default HelpButton;
