import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, PageHero, FaqList, CtaBand, CheckList } from './components/ui.tsx';
import { Plus, Trash, Eye, ArrowRight, Info, BookOpen, XIcon, Lock } from './components/icons.tsx';
import { computeDocumentTotals, formatMoney } from '../utils/money.ts';
import { SIGNUP_PATH, type FaqItem } from '../content/site.ts';
import { getPostMeta } from '../content/blog/registry.ts';
import { buildGeneratorDraft, saveGeneratorDraft } from '../lib/generatorHandoff.ts';
import { hasStoredSession } from './routes.ts';

export type GeneratorKind = 'invoice' | 'estimate';

interface Line { id: number; description: string; quantity: string; rate: string }

const SAMPLE: Record<GeneratorKind, { number: string; jobName: string; lines: Omit<Line, 'id'>[]; notes: string; tax: string; extra: string }> = {
  invoice: {
    number: 'INV-1001',
    jobName: 'Bathroom remodel',
    lines: [
      { description: 'Bathroom demolition & disposal', quantity: '1', rate: '850' },
      { description: 'Tile installation (sq ft)', quantity: '120', rate: '12' },
      { description: 'Vanity & faucet install', quantity: '1', rate: '420' },
    ],
    notes: 'Payment due within 14 days. Thank you for your business!',
    tax: '7',
    extra: '1000',
  },
  estimate: {
    number: 'EST-2001',
    jobName: 'Deck replacement',
    lines: [
      { description: 'Remove existing deck boards & railing', quantity: '1', rate: '900' },
      { description: 'Composite decking, supply & install (sq ft)', quantity: '240', rate: '18' },
      { description: 'New aluminum railing (lf)', quantity: '36', rate: '55' },
    ],
    notes: 'Price includes materials, labor and cleanup. Permit fees, if required, are billed at cost.',
    tax: '0',
    extra: '30',
  },
};

interface Copy {
  hero: { eyebrow: string; title: string; subtitle: string };
  includeTitle: string;
  include: { field: string; why: string }[];
  stepsTitle: string;
  steps: { title: string; text: string }[];
  tipsTitle: string;
  tips: string[];
  guides: string[];
  faq: FaqItem[];
  cta: { title: string; text: string };
}

const COPY: Record<GeneratorKind, Copy> = {
  invoice: {
    hero: {
      eyebrow: 'Free invoice generator',
      title: 'Free invoice generator for contractors',
      subtitle: 'Fill in the form and watch your invoice build itself, with tax, deposits and the balance due calculated for you. Preview it free, no sign-up. When it looks right, create it in ContractorDocs: everything you typed opens in the editor, ready to download as a PDF and send.',
    },
    includeTitle: 'What to include on a contractor invoice',
    include: [
      { field: 'Your business details', why: 'Company name, address, phone, email and license number where your state requires it. It makes the invoice look legitimate and tells the client who to pay.' },
      { field: 'Client and job address', why: 'Who is being billed and where the work happened. On jobs with several properties this prevents mix-ups.' },
      { field: 'Invoice number and dates', why: 'A unique, sequential number, the invoice date and a due date. Numbers make payments and disputes easy to trace.' },
      { field: 'Itemized line items', why: 'Each task or material with quantity, unit price and amount. Clients pay itemized invoices with fewer questions than a single lump sum.' },
      { field: 'Tax, discounts and deposits', why: 'Show sales tax where it applies, any agreed discount, and deposits already received so the balance due is unambiguous.' },
      { field: 'Payment terms and methods', why: 'When payment is due, accepted payment methods and any late-fee terms you agreed in the contract.' },
      { field: 'Reference to the estimate or contract', why: 'Link the invoice to the signed estimate, contract or change orders it bills for.' },
    ],
    stepsTitle: 'How to create and send an invoice in ContractorDocs',
    steps: [
      { title: 'Open the job', text: 'Every invoice belongs to a job and a client, so the address, contact and history are already there.' },
      { title: 'Add line items', text: 'Type them, pick saved items from your price book, or let the AI assistant draft them. Use progress billing to bill a percentage of each line.' },
      { title: 'Check the totals', text: 'Tax, discount, shipping, deposits and balance due are calculated for you and match the PDF exactly.' },
      { title: 'Send it from Gmail', text: 'Email the PDF from your own address, or share a client-portal link. Record payments as they come in.' },
    ],
    tipsTitle: 'Invoice tips that help you get paid faster',
    tips: [
      'Invoice the day the work (or the billing milestone) is done, while it is fresh in the client’s mind.',
      'Put the due date and balance due at the top, in large type.',
      'Use the same line-item wording as the approved estimate so clients can match them.',
      'Attach or reference signed change orders for any extra work.',
      'State payment methods clearly and include your payment link or instructions.',
    ],
    guides: ['how-to-write-a-construction-invoice', 'how-contractors-get-paid-faster', 'lien-waivers-explained'],
    faq: [
      { q: 'Is this invoice generator really free?', a: 'Yes. Building and previewing the invoice is free and needs no account. Nothing you type is uploaded while you work; it stays in your browser.' },
      { q: 'How do I download the invoice as a PDF?', a: 'Click “Create it in ContractorDocs” and create a free account (or log in). Your invoice opens in the editor with everything you typed, inside a new job with the client saved, and you can download the PDF, add your logo and email it from your own Gmail.' },
      { q: 'Do I have to type everything again after signing up?', a: 'No. Your business name, client, job, line items, tax, deposit, notes and dates carry over. ContractorDocs creates the job and the client for you and saves the invoice as a draft you can change.' },
      { q: 'What should a contractor invoice include?', a: 'Your business details, the client and job address, a unique invoice number, invoice and due dates, itemized work and materials, tax, deposits received, the balance due and your payment terms. See our [construction invoice guide](/blog/how-to-write-a-construction-invoice) for a full checklist.' },
      { q: 'Can I bill a job in stages?', a: 'Yes. In ContractorDocs you can use progress billing to bill a percentage of each line item, and the app subtracts what you already billed so the balance is always right.' },
      { q: 'Can clients pay the invoice online?', a: 'ContractorDocs does not process payments itself. Add your payment link or instructions in the notes, and record payments in the app so the balance due stays accurate.' },
    ],
    cta: { title: 'Send real invoices from your own Gmail', text: 'Your logo, saved clients, price book, progress billing and payment tracking. Free plan, no credit card.' },
  },
  estimate: {
    hero: {
      eyebrow: 'Free estimate maker',
      title: 'Free estimate generator for contractors',
      subtitle: 'Build a clean, itemized construction estimate in your browser, with tax and totals calculated as you type. Preview it free, no sign-up. When it looks right, create it in ContractorDocs: everything you typed opens in the editor, ready to download as a PDF and get approved and signed online.',
    },
    includeTitle: 'What to include in a construction estimate',
    include: [
      { field: 'Scope of work', why: 'What is included, in plain language, line by line. A clear scope is the single best protection against disputes later.' },
      { field: 'Itemized pricing', why: 'Labor, materials, subcontractors and equipment, with quantities and unit prices where it helps the client understand the number.' },
      { field: 'Exclusions and allowances', why: 'What is not included (permits, hidden damage, finish selections) and allowance amounts for items the client has not chosen yet.' },
      { field: 'Valid-until date', why: 'Material prices move. An expiry date, often 15 to 30 days, protects you from honoring an old price.' },
      { field: 'Schedule and payment terms', why: 'Expected start and duration, deposit amount and the payment schedule for the job.' },
      { field: 'Approval and signature', why: 'A place for the client to accept the estimate. In ContractorDocs they can approve and sign online.' },
    ],
    stepsTitle: 'How to create an estimate in ContractorDocs',
    steps: [
      { title: 'Create the job', text: 'Add the client and site address once; every document for the job uses them.' },
      { title: 'Build the line items', text: 'Pick saved services and materials from your price book, or dictate the scope and let the AI assistant draft it.' },
      { title: 'Add terms and exclusions', text: 'Set the valid-until date, deposit, schedule and what is not included.' },
      { title: 'Get it approved', text: 'Send a client-portal link. The client approves and signs on their phone, and the signed estimate stays with the job.' },
    ],
    tipsTitle: 'Estimate tips that win more jobs',
    tips: [
      'Send the estimate within a day or two of the site visit; speed is often what clients remember.',
      'Use good, better, best options when the client has choices to make.',
      'Name exclusions explicitly instead of leaving them out silently.',
      'Include a contingency or clear change-order terms for unknown conditions.',
      'Follow up a few days after sending, and again before the estimate expires.',
    ],
    guides: ['construction-estimate-template', 'how-to-calculate-job-profit-margin', 'change-order-form-guide'],
    faq: [
      { q: 'Is the estimate generator free?', a: 'Yes. Building and previewing the estimate is free and needs no account. Nothing you type is uploaded while you work; it stays in your browser.' },
      { q: 'How do I download the estimate as a PDF?', a: 'Click “Create it in ContractorDocs” and create a free account (or log in). Your estimate opens in the editor with everything you typed, inside a new job with the client saved, and you can download the PDF or send a link your client signs on their phone.' },
      { q: 'Do I have to type everything again after signing up?', a: 'No. Your business name, client, job, line items, tax, notes, valid-until date and number carry over. ContractorDocs creates the job and the client for you and saves the estimate as a draft you can change.' },
      { q: 'What is the difference between an estimate and a quote?', a: 'People use the words loosely. An estimate is usually an informed approximation that can change if conditions change; a quote or bid is usually a fixed price for a defined scope. Whatever you call it, spell out the scope, exclusions and how changes are priced.' },
      { q: 'How long should an estimate be valid?', a: 'Many contractors use 15 to 30 days, shorter when material prices are volatile. Put the expiry date on the estimate so there is no argument later.' },
      { q: 'How do I price a job without guessing?', a: 'Start from a takeoff of quantities, price labor hours and materials, add subcontractors and equipment, then overhead, profit and contingency. Our [estimating guide](/blog/construction-estimate-template) walks through it step by step.' },
      { q: 'Can clients sign the estimate online?', a: 'In ContractorDocs, yes. Share a client-portal link and your client can approve and sign the estimate on any device; the signature, name and time are saved with the document.' },
    ],
    cta: { title: 'Get estimates approved and signed online', text: 'Price-book items, AI drafting from your notes and client-portal approvals with e-signatures. Free plan, no credit card.' },
  },
};

const inputCls = 'block w-full rounded-xl border border-input bg-card px-3 py-2.5 text-[15px] text-foreground shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15';
const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

interface PaperProps {
  kind: GeneratorKind;
  company: string;
  client: string;
  jobName: string;
  jobAddress: string;
  number: string;
  date: string;
  lines: Line[];
  extra: string;
  notes: string;
  totals: ReturnType<typeof computeDocumentTotals>;
  large?: boolean;
}

/** The document as the client would see it (side preview and the full-size Preview). */
const DocPaper: React.FC<PaperProps> = ({ kind, company, client, jobName, jobAddress, number, date, lines, extra, notes, totals, large }) => {
  const title = kind === 'invoice' ? 'Invoice' : 'Estimate';
  return (
    <article
      aria-label={`${title} preview`}
      className={`select-none rounded-2xl bg-white text-slate-800 ring-1 ring-slate-200 ${large ? 'p-6 shadow-2xl sm:p-12' : 'p-6 shadow-[0_20px_50px_-24px_rgba(16,24,40,.4)] sm:p-8'}`}
      onCopy={(e) => e.preventDefault()}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className={`${large ? 'text-2xl' : 'text-lg'} font-extrabold`}>{company || 'Your Company'}</p>
          <p className="mt-1 text-sm text-slate-500">Prepared for <span className="font-semibold text-slate-700">{client || 'Client'}</span></p>
          {jobName || jobAddress ? (
            <p className="mt-0.5 text-sm text-slate-500">{[jobName, jobAddress].filter(Boolean).join(' · ')}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{title}</p>
          <p className="text-base font-bold">{number}</p>
          <p className="text-sm text-slate-500">{date}</p>
        </div>
      </header>
      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="pb-2 font-semibold">Description</th>
            <th className="pb-2 text-right font-semibold">Qty</th>
            <th className="pb-2 text-right font-semibold">Rate</th>
            <th className="pb-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-100 align-top">
              <td className="py-2.5 pr-3">{l.description || <span className="text-slate-400">—</span>}</td>
              <td className="py-2.5 pl-2 text-right tabular-nums text-slate-600">{l.quantity}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums text-slate-600">{formatMoney(l.rate)}</td>
              <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">{formatMoney(computeDocumentTotals({ lineItems: [l] }).subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-5 w-full max-w-[260px] space-y-1.5 text-sm tabular-nums">
        <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{formatMoney(totals.subtotal)}</dd></div>
        <div className="flex justify-between text-slate-600"><dt>Tax ({totals.taxRate}%)</dt><dd>{formatMoney(totals.tax)}</dd></div>
        {kind === 'invoice' ? (
          <>
            <div className="flex justify-between text-slate-600"><dt>Total</dt><dd>{formatMoney(totals.total)}</dd></div>
            <div className="flex justify-between text-slate-600"><dt>Deposit received</dt><dd>−{formatMoney(totals.amountPaid)}</dd></div>
            <div className="mt-2 flex justify-between rounded-lg bg-brand-600 px-3 py-2 font-bold text-white"><dt>Balance due</dt><dd>{formatMoney(totals.balanceDue)}</dd></div>
          </>
        ) : (
          <div className="mt-2 flex justify-between rounded-lg bg-brand-600 px-3 py-2 font-bold text-white"><dt>Estimate total</dt><dd>{formatMoney(totals.total)}</dd></div>
        )}
      </dl>
      {notes ? <p className="mt-6 whitespace-pre-line border-t border-slate-200 pt-4 text-sm leading-relaxed text-slate-600">{notes}</p> : null}
      {kind === 'estimate' ? <p className="mt-3 text-sm text-slate-500">Valid for {extra || '30'} days from the date above.</p> : null}
      <div className="mt-8 grid grid-cols-2 gap-6 text-xs text-slate-400">
        <div className="border-t border-slate-300 pt-2">{kind === 'estimate' ? 'Client approval' : 'Authorized signature'}</div>
        <div className="border-t border-slate-300 pt-2">Date</div>
      </div>
    </article>
  );
};

/** Full-size preview: look only. Downloading, sending and signing happen in the app. */
const PreviewDialog: React.FC<{ title: string; onClose: () => void; onCreate: () => void; children: React.ReactNode }> = ({ title, onClose, onCreate, children }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`${title} preview`} className="fixed inset-0 z-[100] flex flex-col bg-slate-900/80 backdrop-blur-sm print:hidden" onClick={onClose}>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-slate-950/70 px-4 py-3 text-white sm:px-6" onClick={(e) => e.stopPropagation()}>
        <p className="flex min-w-0 flex-1 basis-60 items-center gap-2 text-sm">
          <Lock className="h-4 w-4 flex-none text-amber-300" />
          <span><strong>Preview only.</strong> Create it in ContractorDocs to download the PDF, send it and get it signed.</span>
        </p>
        <button type="button" onClick={onCreate} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
          Create it in ContractorDocs <ArrowRight className="h-4 w-4" />
        </button>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close preview" className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white">
          <XIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-[816px]" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
          {children}
          <p className="mt-4 text-center text-xs text-white/70">Your free ContractorDocs account adds your logo, the PDF download, e-signatures and payment tracking.</p>
        </div>
      </div>
    </div>
  );
};

const GeneratorTool: React.FC<{ kind: GeneratorKind }> = ({ kind }) => {
  const sample = SAMPLE[kind];
  const navigate = useNavigate();
  const [company, setCompany] = useState('Your Company LLC');
  const [client, setClient] = useState('Client name');
  const [jobName, setJobName] = useState(sample.jobName);
  const [jobAddress, setJobAddress] = useState('');
  const [number, setNumber] = useState(sample.number);
  const [date, setDate] = useState('2026-11-12');
  const [lines, setLines] = useState<Line[]>(() => sample.lines.map((l, i) => ({ ...l, id: i + 1 })));
  const [tax, setTax] = useState(sample.tax);
  const [extra, setExtra] = useState(sample.extra); // invoice: deposit received; estimate: valid days
  const [notes, setNotes] = useState(sample.notes);
  const [previewOpen, setPreviewOpen] = useState(false);

  // today's date in the visitor's time zone (the prerendered HTML keeps a fixed sample date)
  useEffect(() => {
    const d = new Date();
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }, []);

  const totals = useMemo(
    () => computeDocumentTotals({ lineItems: lines, taxRate: tax, amountPaid: kind === 'invoice' ? extra : 0 }),
    [lines, tax, extra, kind],
  );

  const update = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { id: Math.max(0, ...ls.map((l) => l.id)) + 1, description: '', quantity: '1', rate: '0' }]);
  const removeLine = (id: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));
  const title = kind === 'invoice' ? 'Invoice' : 'Estimate';

  /** Keeps what was typed for the app (lib/generatorHandoff.ts), then: sign up, or straight in when signed in. */
  const createInApp = () => {
    saveGeneratorDraft(buildGeneratorDraft({
      kind, source: `/${kind}-generator`, company, client, jobName, jobAddress, number, date, lines, tax, extra, notes,
    }));
    setPreviewOpen(false);
    navigate(hasStoredSession() ? '/dashboard' : `${SIGNUP_PATH}?from=${kind}-generator`);
  };

  const paper = { kind, company, client, jobName, jobAddress, number, date, lines, extra, notes, totals };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr] print:hidden">
      <form className="card card-pad space-y-5" onSubmit={(e) => e.preventDefault()} aria-label={`${title} details`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="g-company" className={labelCls}>Your business</label><input id="g-company" className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div><label htmlFor="g-client" className={labelCls}>Client</label><input id="g-client" className={inputCls} value={client} onChange={(e) => setClient(e.target.value)} /></div>
          <div><label htmlFor="g-job" className={labelCls}>Job</label><input id="g-job" className={inputCls} placeholder="e.g. Kitchen remodel" value={jobName} onChange={(e) => setJobName(e.target.value)} /></div>
          <div><label htmlFor="g-address" className={labelCls}>Job address</label><input id="g-address" className={inputCls} placeholder="Street, city" value={jobAddress} onChange={(e) => setJobAddress(e.target.value)} autoComplete="street-address" /></div>
          <div><label htmlFor="g-number" className={labelCls}>{title} #</label><input id="g-number" className={inputCls} value={number} onChange={(e) => setNumber(e.target.value)} /></div>
          <div><label htmlFor="g-date" className={labelCls}>Date</label><input id="g-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <fieldset>
          <legend className={labelCls}>Line items</legend>
          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={l.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-border bg-background p-3 sm:grid-cols-[1fr_72px_96px_auto] sm:items-center sm:border-0 sm:bg-transparent sm:p-0">
                <input aria-label={`Line ${i + 1} description`} className={`${inputCls} col-span-2 sm:col-span-1`} placeholder="Description" value={l.description} onChange={(e) => update(l.id, { description: e.target.value })} />
                <input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" className={inputCls} placeholder="Qty" value={l.quantity} onChange={(e) => update(l.id, { quantity: e.target.value })} />
                <input aria-label={`Line ${i + 1} rate`} inputMode="decimal" className={`${inputCls} max-sm:col-start-1`} placeholder="Rate" value={l.rate} onChange={(e) => update(l.id, { rate: e.target.value })} />
                <button type="button" onClick={() => removeLine(l.id)} disabled={lines.length <= 1} className="row-start-2 inline-flex h-11 w-11 items-center justify-center justify-self-end rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40 sm:row-start-auto" aria-label={`Remove line ${i + 1}`}>
                  <Trash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addLine} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-dashed border-brand-300 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            <Plus className="h-4 w-4" /> Add line
          </button>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="g-tax" className={labelCls}>Tax rate (%)</label><input id="g-tax" inputMode="decimal" className={inputCls} value={tax} onChange={(e) => setTax(e.target.value)} /></div>
          <div>
            <label htmlFor="g-extra" className={labelCls}>{kind === 'invoice' ? 'Deposit received ($)' : 'Valid for (days)'}</label>
            <input id="g-extra" inputMode="decimal" className={inputCls} value={extra} onChange={(e) => setExtra(e.target.value)} />
          </div>
        </div>
        <div><label htmlFor="g-notes" className={labelCls}>Notes & terms</label><textarea id="g-notes" rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <p className="flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 h-4 w-4 flex-none" /> Nothing is uploaded while you type. It stays in this browser until you create the {title.toLowerCase()} in ContractorDocs.</p>
      </form>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <DocPaper {...paper} />
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 font-semibold text-foreground shadow-soft hover:bg-muted">
            <Eye className="h-4 w-4" /> Preview
          </button>
          <button type="button" onClick={createInApp} className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
            Create it in ContractorDocs <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Free account. Your {title.toLowerCase()} opens in the editor with everything above, inside a new job, ready to download as a PDF, send and get signed.
        </p>
      </div>

      {previewOpen ? (
        <PreviewDialog title={title} onClose={() => setPreviewOpen(false)} onCreate={createInApp}>
          <DocPaper {...paper} large />
        </PreviewDialog>
      ) : null}
    </div>
  );
};

const GeneratorPage: React.FC<{ kind: GeneratorKind }> = ({ kind }) => {
  const copy = COPY[kind];
  return (
    <>
      <div className="print:hidden">
        <PageHero
          eyebrow={copy.hero.eyebrow}
          title={copy.hero.title}
          subtitle={copy.hero.subtitle}
          breadcrumbs={[{ name: 'Home', to: '/' }, { name: copy.hero.title }]}
        >
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {['Free, no sign-up to start', 'Totals calculated as you type', 'Full-size preview'].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" /> {t}</li>
            ))}
          </ul>
        </PageHero>
      </div>

      <section aria-label={`${kind === 'invoice' ? 'Invoice' : 'Estimate'} generator`} className="py-12 sm:py-16 print:py-0">
        <Container>
          <GeneratorTool kind={kind} />
        </Container>
      </section>

      <div className="print:hidden">
        <section aria-labelledby="include-heading" className="border-t border-border bg-card py-16 sm:py-20">
          <Container className="max-w-5xl">
            <h2 id="include-heading" className="font-display text-3xl font-extrabold tracking-[-0.01em] text-foreground">{copy.includeTitle}</h2>
            <div className="mt-8 overflow-hidden rounded-2xl border border-border">
              <dl className="divide-y divide-border">
                {copy.include.map((row) => (
                  <div key={row.field} className="grid gap-1 bg-background px-5 py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
                    <dt className="font-semibold text-foreground">{row.field}</dt>
                    <dd className="text-[15px] leading-relaxed text-muted-foreground">{row.why}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Container>
        </section>

        <section aria-labelledby="steps-heading" className="py-16 sm:py-20">
          <Container className="max-w-5xl">
            <h2 id="steps-heading" className="font-display text-3xl font-extrabold tracking-[-0.01em] text-foreground">{copy.stepsTitle}</h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2">
              {copy.steps.map((s, i) => (
                <li key={s.title} className="flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                  <div>
                    <h3 className="font-bold text-foreground">{s.title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-14 grid gap-10 lg:grid-cols-2">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground">{copy.tipsTitle}</h2>
                <CheckList items={copy.tips} className="mt-6" tone="success" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-[-0.01em] text-foreground">Related guides</h2>
                <ul className="mt-6 space-y-3">
                  {copy.guides.map((slug) => {
                    const meta = getPostMeta(slug);
                    if (!meta) return null;
                    return (
                      <li key={slug}>
                        <Link to={`/blog/${slug}`} className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft hover:border-brand-200">
                          <BookOpen className="mt-0.5 h-5 w-5 flex-none text-brand-600" />
                          <span>
                            <span className="block font-semibold text-foreground group-hover:text-brand-700">{meta.title}</span>
                            <span className="mt-0.5 block text-sm text-muted-foreground">{meta.readingTime} min read</span>
                          </span>
                          <ArrowRight className="ml-auto mt-0.5 h-4 w-4 flex-none text-muted-foreground group-hover:text-brand-700" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </Container>
        </section>

        <section aria-labelledby="gen-faq-heading" className="border-t border-border bg-card py-16 sm:py-20">
          <Container className="max-w-4xl">
            <h2 id="gen-faq-heading" className="text-center font-display text-3xl font-extrabold tracking-[-0.01em] text-foreground">Frequently asked questions</h2>
            <FaqList items={copy.faq} className="mt-10" />
          </Container>
        </section>

        <CtaBand title={copy.cta.title} text={copy.cta.text} />
      </div>
    </>
  );
};

export const GENERATOR_FAQ: Record<GeneratorKind, FaqItem[]> = { invoice: COPY.invoice.faq, estimate: COPY.estimate.faq };

export default GeneratorPage;
