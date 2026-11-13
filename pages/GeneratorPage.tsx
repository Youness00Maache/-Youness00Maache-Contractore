import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, PageHero, ButtonLink, FaqList, CtaBand, CheckList } from './components/ui.tsx';
import { Plus, Trash, Printer, ArrowRight, Info, BookOpen } from './components/icons.tsx';
import { computeDocumentTotals, formatMoney } from '../utils/money.ts';
import { SIGNUP_PATH, type FaqItem } from '../content/site.ts';
import { getPostMeta } from '../content/blog/registry.ts';

export type GeneratorKind = 'invoice' | 'estimate';

interface Line { id: number; description: string; quantity: string; rate: string }

const SAMPLE: Record<GeneratorKind, { number: string; lines: Omit<Line, 'id'>[]; notes: string; tax: string; extra: string }> = {
  invoice: {
    number: 'INV-1001',
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
      title: 'Contractor invoice generator',
      subtitle: 'Fill in the form and watch your invoice build itself. Print it or save it as a PDF for free, no account needed. When you want to email it, track payments and keep it with the job, create it in ContractorDocs.',
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
      { q: 'Is this invoice generator really free?', a: 'Yes. You can build and print an invoice, or save it as a PDF from the print dialog, without creating an account. Nothing you type is uploaded; it stays in your browser.' },
      { q: 'How do I save the invoice as a PDF?', a: 'Click “Print / Save as PDF” and choose “Save as PDF” (or “Microsoft Print to PDF”) as the printer. For a branded PDF with your logo that you can email directly, create the invoice in ContractorDocs.' },
      { q: 'What should a contractor invoice include?', a: 'Your business details, the client and job address, a unique invoice number, invoice and due dates, itemized work and materials, tax, deposits received, the balance due and your payment terms. See our [construction invoice guide](/blog/how-to-write-a-construction-invoice) for a full checklist.' },
      { q: 'Can I bill a job in stages?', a: 'Yes. In ContractorDocs you can use progress billing to bill a percentage of each line item, and the app subtracts what you already billed so the balance is always right.' },
      { q: 'Can clients pay the invoice online?', a: 'ContractorDocs does not process payments itself. Add your payment link or instructions in the notes, and record payments in the app so the balance due stays accurate.' },
    ],
    cta: { title: 'Send real invoices from your own Gmail', text: 'Your logo, saved clients, price book, progress billing and payment tracking. Free plan, no credit card.' },
  },
  estimate: {
    hero: {
      eyebrow: 'Free estimate generator',
      title: 'Construction estimate generator',
      subtitle: 'Build a clean, itemized estimate in your browser and print it or save it as a PDF, free and without an account. When you want clients to approve and sign online, create it in ContractorDocs.',
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
      { q: 'Is the estimate generator free?', a: 'Yes. Build the estimate, then print it or choose “Save as PDF” in the print dialog. No account is needed and nothing you type leaves your browser.' },
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

const GeneratorTool: React.FC<{ kind: GeneratorKind }> = ({ kind }) => {
  const sample = SAMPLE[kind];
  const [company, setCompany] = useState('Your Company LLC');
  const [client, setClient] = useState('Client name');
  const [number, setNumber] = useState(sample.number);
  const [date, setDate] = useState('2026-11-12');
  const [lines, setLines] = useState<Line[]>(() => sample.lines.map((l, i) => ({ ...l, id: i + 1 })));
  const [tax, setTax] = useState(sample.tax);
  const [extra, setExtra] = useState(sample.extra); // invoice: deposit received; estimate: valid days
  const [notes, setNotes] = useState(sample.notes);

  const totals = useMemo(
    () => computeDocumentTotals({ lineItems: lines, taxRate: tax, amountPaid: kind === 'invoice' ? extra : 0 }),
    [lines, tax, extra, kind],
  );

  const update = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { id: Math.max(0, ...ls.map((l) => l.id)) + 1, description: '', quantity: '1', rate: '0' }]);
  const removeLine = (id: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));
  const title = kind === 'invoice' ? 'Invoice' : 'Estimate';

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr]">
      <form className="card card-pad space-y-5 print:hidden" onSubmit={(e) => e.preventDefault()} aria-label={`${title} details`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="g-company" className={labelCls}>Your business</label><input id="g-company" className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div><label htmlFor="g-client" className={labelCls}>Client</label><input id="g-client" className={inputCls} value={client} onChange={(e) => setClient(e.target.value)} /></div>
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
        <p className="flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 h-4 w-4 flex-none" /> Nothing you type here is uploaded. It stays in this browser tab.</p>
      </form>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <article aria-label={`${title} preview`} className="rounded-2xl bg-white p-6 text-slate-800 shadow-[0_20px_50px_-24px_rgba(16,24,40,.4)] ring-1 ring-slate-200 print:shadow-none print:ring-0 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <p className="text-lg font-extrabold">{company || 'Your Company'}</p>
              <p className="mt-1 text-sm text-slate-500">Prepared for <span className="font-semibold text-slate-700">{client || 'Client'}</span></p>
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
                  <td className="py-2.5 text-right tabular-nums text-slate-600">{l.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-600">{formatMoney(l.rate)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{formatMoney(computeDocumentTotals({ lineItems: [l] }).subtotal)}</td>
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
        <div className="mt-5 flex flex-col gap-3 sm:flex-row print:hidden">
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 font-semibold text-foreground shadow-soft hover:bg-muted">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
          <ButtonLink to={SIGNUP_PATH} size="lg" arrow className="flex-1">Create it in ContractorDocs</ButtonLink>
        </div>
      </div>
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
            {['Free, no sign-up', 'Totals calculated for you', 'Print or save as PDF'].map((t) => (
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
