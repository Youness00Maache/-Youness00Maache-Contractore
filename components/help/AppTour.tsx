/**
 * First-run guided tour of the dashboard: 8 short steps that spotlight the real controls (jobs, New job,
 * documents, AI assistant, clients & portal, tools, account menu). Skippable (Esc / Skip), keyboard friendly.
 * Targets are found from existing markup (ids, aria-labels, headings), so no shared screen needs tour hooks;
 * a step whose control isn't on screen (e.g. hidden on phones) is shown in the middle instead.
 * Started by TourHost.tsx; "seen" is stored in the account (lib/userData.ts saveAppTourSeen).
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TourTarget {
  selector: string;
  /** element text must match */
  text?: RegExp;
  /** highlight this ancestor of the match instead */
  closest?: string;
}

interface TourStep {
  title: string;
  text: string;
  targets?: TourTarget[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to ContractorDocs',
    text: 'A one-minute tour of where everything is. Skip it any time and replay it later from your account menu, under Help & tutorials.',
  },
  {
    title: 'Your jobs',
    text: 'Every project is a job. Search, filter by client or status, and open a job to see its documents and photos.',
    targets: [{ selector: 'section[aria-labelledby="jobs-heading"]' }, { selector: '#jobs-heading' }],
  },
  {
    title: 'Start a new job',
    text: 'Name the job, pick the client and set the dates. Everything you create for it stays together.',
    targets: [
      { selector: '[data-tour="new-job"]' },
      { selector: '.page-header button', text: /^\+?\s*new job$/i },
      { selector: 'button[aria-label="New job"]' },
    ],
  },
  {
    title: 'Documents',
    text: 'Open a job and click New Document for any of 12 types: invoices, estimates, change orders, daily reports and more. Your latest ones are listed here.',
    targets: [{ selector: 'h2, h3', text: /^recent documents$/i, closest: '.card, section' }],
  },
  {
    title: 'AI assistant',
    text: 'Describe the work in plain words. The assistant drafts documents, clients, jobs and emails, and nothing is created or sent until you click.',
    targets: [{ selector: '#dashboard-master-ai-btn-desktop' }, { selector: '#dashboard-master-ai-btn-mobile' }],
  },
  {
    title: 'Clients and their portal',
    text: 'Save a client once. Each client gets a private portal link where they view, sign and pay your documents.',
    targets: [{ selector: 'nav[aria-label="Main"] button', text: /^clients/i }],
  },
  {
    title: 'Tools',
    text: 'Inventory, price book, calendar, insights and the profit calculator. On a phone they are under More.',
    targets: [{ selector: 'button[aria-label="Tools"]' }, { selector: 'nav[aria-label="Main"] button', text: /^more/i }],
  },
  {
    title: 'Settings and help',
    text: 'Your account menu: Settings (company details, logo, signature, payment link, reminders, quote link), your plan, and Help & tutorials with a guide for every feature.',
    targets: [{ selector: 'button[aria-label="Account menu"]' }],
  },
];

const isVisible = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const cs = window.getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
};

export const findTourTarget = (targets?: TourTarget[]): HTMLElement | null => {
  for (const t of targets || []) {
    let els: HTMLElement[] = [];
    try { els = Array.from(document.querySelectorAll<HTMLElement>(t.selector)); } catch { continue; }
    for (const el of els) {
      if (t.text && !t.text.test((el.textContent || '').replace(/\s+/g, ' ').trim())) continue;
      const pick = (t.closest ? el.closest<HTMLElement>(t.closest) : null) || el;
      if (isVisible(pick)) return pick;
    }
  }
  return null;
};

interface Box { top: number; left: number; width: number; height: number }
const PAD = 6;
const GUTTER = 16;

const AppTour: React.FC<{ onClose: (reason: 'done' | 'skip') => void }> = ({ onClose }) => {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;

  const measure = useCallback(() => {
    const el = targetRef.current;
    if (!el || !el.isConnected || !isVisible(el)) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, []);

  // Find this step's control, bring it into view, then measure.
  useEffect(() => {
    const el = findTourTarget(step.targets);
    targetRef.current = el;
    if (el) {
      const r = el.getBoundingClientRect();
      const offscreen = r.top < 72 || r.bottom > window.innerHeight - 96;
      if (offscreen && r.height < window.innerHeight * 0.7) el.scrollIntoView({ block: 'center', behavior: 'auto' });
      else if (offscreen) el.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    measure();
  }, [index, step.targets, measure]);

  useEffect(() => {
    let raf = 0;
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [measure]);

  // Card goes below the control when it fits, else above, else at the bottom; always inside the screen.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    if (!box) { setCardPos({ top: Math.max(GUTTER, (vh - h) / 2), left: Math.max(GUTTER, (vw - w) / 2) }); return; }
    const left = Math.min(Math.max(GUTTER, box.left + box.width / 2 - w / 2), vw - w - GUTTER);
    let top: number;
    if (box.top + box.height + 12 + h <= vh - GUTTER) top = box.top + box.height + 12;
    else if (box.top - 12 - h >= GUTTER) top = box.top - 12 - h;
    else top = vh - h - GUTTER;
    setCardPos({ top, left: Math.max(GUTTER, left) });
  }, [box, index]);

  useEffect(() => { cardRef.current?.focus(); }, [index]);

  const next = useCallback(() => { if (last) onClose('done'); else setIndex((i) => i + 1); }, [last, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose('skip'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [next, back, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      {/* blocks clicks on the page while the tour is open */}
      <div className={`absolute inset-0 ${box ? '' : 'bg-black/50'}`} onMouseDown={(e) => e.preventDefault()} />
      {box && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl ring-2 ring-primary transition-all duration-200 ease-out"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-tour-title"
        aria-describedby="app-tour-text"
        tabIndex={-1}
        className="absolute w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl outline-none sm:p-5"
        style={cardPos ? { top: cardPos.top, left: cardPos.left } : { visibility: 'hidden', top: 0, left: 0 }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tabular-nums text-primary" aria-live="polite">Step {index + 1} of {TOUR_STEPS.length}</p>
          <button type="button" onClick={() => onClose('skip')} className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">Skip tour</button>
        </div>
        <h2 id="app-tour-title" className="mt-1.5 text-base font-bold text-foreground">{step.title}</h2>
        <p id="app-tour-text" className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1" aria-hidden="true">
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-primary' : i < index ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-border'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && <button type="button" onClick={back} className="btn btn-ghost btn-sm h-9">Back</button>}
            <button type="button" onClick={next} className="btn btn-primary btn-sm h-9">{last ? 'Done' : index === 0 ? 'Show me' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AppTour;
