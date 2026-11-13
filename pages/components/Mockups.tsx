import React from 'react';
import { LogoMark } from './Logo.tsx';
import {
  Briefcase, Users, FileText, Package, BarChart, CalendarIcon, Mail, Sparkles, Mic, Check, QrCode,
  ClipboardList, Send, DocIcon, TrendingUp,
} from './icons.tsx';
import { DocPaper } from './DocPapers.tsx';
import { Waveform } from './Waveform.tsx';
import type { DocIconName } from '../../content/site.ts';

/* All mockups are decorative illustrations of the product UI built in HTML/CSS (sample data). */

const Signature: React.FC<{ className?: string }> = ({ className = 'h-8 w-28' }) => (
  <svg viewBox="0 0 120 36" className={className} aria-hidden="true" focusable="false">
    <path
      d="M4 26c8-14 14-20 18-18s-6 18-2 19 10-16 14-15-2 13 2 13 8-9 12-9 2 7 6 7 7-6 11-6 3 5 7 5 9-4 14-4 10 2 16 1"
      fill="none"
      stroke="#1c2eb0"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const INVOICE_LINES = [
  { d: 'Demolition & haul-away', q: '1', r: '1,200.00', a: '1,200.00' },
  { d: 'Cabinet installation', q: '18 lf', r: '85.00', a: '1,530.00' },
  { d: 'Quartz countertop, supply & install', q: '42 sq ft', r: '75.00', a: '3,150.00' },
  { d: 'Under-cabinet LED lighting', q: '1', r: '640.00', a: '640.00' },
];

export const InvoicePaper: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <div className="rounded-xl bg-white p-4 text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.06),0_12px_32px_-16px_rgba(16,24,40,.35)] ring-1 ring-slate-200 sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-xs font-black text-amber-400">NR</span>
        <div>
          <p className="text-sm font-bold leading-tight">Northline Renovations</p>
          <p className="text-[11px] text-slate-500"><span className="hidden sm:inline">License #R-20418 · </span>(555) 014-2290</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">Invoice</p>
        <p className="text-sm font-bold">#1042</p>
        <p className="text-[11px] text-slate-500">Due Nov 26, 2026</p>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed">
      <div>
        <p className="font-semibold uppercase tracking-wide text-slate-400">Bill to</p>
        <p className="font-semibold text-slate-700">Dana Whitfield</p>
        <p className="text-slate-500">214 Maple St.</p>
      </div>
      <div>
        <p className="font-semibold uppercase tracking-wide text-slate-400">Job</p>
        <p className="font-semibold text-slate-700">Maple St. kitchen remodel</p>
        <p className="text-slate-500">Progress bill 2 of 3</p>
      </div>
    </div>
    <table className="mt-4 w-full text-[11px]">
      <thead>
        <tr className="border-b border-slate-200 text-left text-slate-400">
          <th className="pb-2 font-semibold">Description</th>
          <th className="hidden pb-2 text-right font-semibold sm:table-cell">Qty</th>
          <th className="hidden pb-2 text-right font-semibold sm:table-cell">Rate</th>
          <th className="pb-2 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {(compact ? INVOICE_LINES.slice(0, 3) : INVOICE_LINES).map((l) => (
          <tr key={l.d} className="border-b border-slate-100">
            <td className="py-2 pr-2 font-medium text-slate-700">{l.d}</td>
            <td className="hidden py-2 text-right text-slate-500 sm:table-cell">{l.q}</td>
            <td className="hidden py-2 text-right text-slate-500 sm:table-cell">{l.r}</td>
            <td className="py-2 text-right font-semibold tabular-nums">{l.a}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="mt-3 flex justify-end">
      <dl className="w-full max-w-[220px] space-y-1 text-[11px] tabular-nums">
        <div className="flex justify-between text-slate-500"><dt>Subtotal</dt><dd>$6,520.00</dd></div>
        <div className="flex justify-between text-slate-500"><dt>Sales tax (8%)</dt><dd>$521.60</dd></div>
        <div className="flex justify-between text-slate-500"><dt>Deposit received</dt><dd>−$2,000.00</dd></div>
        <div className="mt-1 flex justify-between rounded-md bg-brand-600 px-2 py-1.5 text-xs font-bold text-white"><dt>Balance due</dt><dd>$5,041.60</dd></div>
      </dl>
    </div>
  </div>
);

/** Hero illustration: the app window showing a job with an invoice, plus floating status cards. */
export const AppMockup: React.FC = () => (
  <div className="relative mx-auto w-full max-w-[640px] lg:max-w-none" aria-hidden="true">
    <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-brand-200/60 via-brand-100/30 to-amber-100/60 blur-2xl" />
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_-30px_rgba(22,29,84,.45)]">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 hidden flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] text-slate-400 ring-1 ring-slate-200 sm:block">
          contractordocs.app/jobs/maple-st-kitchen
        </span>
      </div>
      <div className="flex">
        <aside className="hidden w-44 flex-none flex-col gap-1 border-r border-slate-200 bg-slate-50/70 p-3 sm:flex">
          <div className="mb-3 flex items-center gap-2 px-1">
            <LogoMark className="h-6 w-6" />
            <span className="text-xs font-extrabold text-slate-800">ContractorDocs</span>
          </div>
          {[
            { icon: Briefcase, label: 'Jobs', active: true },
            { icon: Users, label: 'Clients' },
            { icon: Mail, label: 'Communication' },
            { icon: Package, label: 'Inventory' },
            { icon: BarChart, label: 'Analytics' },
            { icon: CalendarIcon, label: 'Calendar' },
          ].map(({ icon: Icon, label, active }) => (
            <span
              key={label}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${active ? 'bg-brand-600 text-white' : 'text-slate-500'}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </span>
          ))}
        </aside>
        <div className="min-w-0 flex-1 bg-slate-100/70 p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">Maple St. kitchen remodel</p>
              <p className="text-[11px] text-slate-500">Dana Whitfield · 6 documents</p>
            </div>
            <div className="flex gap-1.5">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Estimate signed</span>
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">Invoice sent</span>
            </div>
          </div>
          <InvoicePaper />
        </div>
      </div>
    </div>

    <div className="absolute -top-12 right-4 hidden w-56 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl sm:block lg:-right-6">
      <p className="text-[11px] font-bold text-slate-800">Estimate #1038 approved</p>
      <p className="text-[10px] text-slate-500">Signed in the client portal</p>
      <div className="relative mt-2.5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-1">
        <Signature className="h-7 w-full" />
        <span className="absolute -top-2.5 right-1.5 -rotate-[8deg] rounded-[3px] border-2 border-emerald-600 bg-white/90 px-1.5 py-px text-[9px] font-black uppercase tracking-[0.14em] text-emerald-600">
          Approved
        </span>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500">Dana Whitfield · Today, 2:14 PM</p>
    </div>

    <div className="relative mx-auto mt-4 w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl sm:absolute sm:-bottom-6 sm:-left-6 sm:mx-0 sm:mt-0 sm:w-64 lg:-left-10">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-slate-800">AI drafted your daily report</p>
        <span className="flex items-center gap-1.5 rounded-full bg-violet-50 px-2 py-1">
          <Waveform className="h-3 text-violet-500" bars={9} scale={0.6} />
          <span className="font-mono text-[9px] text-violet-700">0:42</span>
        </span>
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-slate-600">
        Crew of 3 · 7.5 h each · Upper cabinets set, sink rough-in inspected and passed. Rain after 2 PM.
      </p>
      <div className="mt-2 flex gap-1.5">
        <span className="rounded-md bg-brand-600 px-2 py-1 text-[10px] font-bold text-white">Review & save</span>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">Edit</span>
      </div>
    </div>
  </div>
);

/** AI assistant illustration. */
export const AiMockup: React.FC<{ variant?: 'default' | 'paper' }> = ({ variant = 'default' }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5" aria-hidden="true">
    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
      {variant === 'paper' ? (
        <span className="flex h-8 items-center rounded-full bg-violet-50 px-2.5"><Waveform className="h-4 text-violet-500" bars={10} scale={0.75} /></span>
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-brand-600 text-white"><Sparkles className="h-4 w-4" /></span>
      )}
      <p className="text-sm font-bold text-slate-800">AI assistant</p>
      <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Maple St. kitchen</span>
    </div>
    <div className="mt-4 flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
        Estimate for Dana: replace 2 bathroom vanities, new faucets, re-tile the backsplash, about 2 days for 2 guys.
        <span className="mt-1.5 flex items-center gap-1 text-[10px] text-brand-100"><Mic className="h-3 w-3" /> Dictated · 0:18</span>
      </div>
    </div>
    <div className="mt-3 rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 p-3.5">
      <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-800">
        {variant === 'paper' ? <DocPaper id="estimate" className="mr-0.5 h-5 w-4 flex-none drop-shadow-sm" /> : <FileText className="h-3.5 w-3.5 text-brand-600" />} Draft estimate ready for review
      </p>
      <ul className="mt-2 space-y-1.5 text-[12px] text-slate-600">
        {[
          ['Remove & dispose of 2 vanities', 'Labor'],
          ['Install 2 vanities with tops', 'Labor + materials'],
          ['2 faucets, supply lines & drains', 'Materials'],
          ['Backsplash tile, 24 sq ft', 'Labor + materials'],
        ].map(([d, t]) => (
          <li key={d} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-600" strokeWidth={3} /> {d}</span>
            <span className="hidden text-[10px] text-slate-400 sm:inline">{t}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11px] text-slate-500">Prices come from your price book. Review them before you send.</p>
      <div className="mt-3 flex gap-2">
        <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white">Open draft</span>
        <span className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">Ask for changes</span>
      </div>
    </div>
  </div>
);

/** Client portal / e-signature illustration (phone). */
export const PortalMockup: React.FC = () => (
  // A realistic phone: metal edge, side buttons, black bezel, dynamic island, status bar, home indicator.
  <div className="relative mx-auto w-[272px]" aria-hidden="true">
    <span className="absolute -left-[3px] top-[92px] h-7 w-[3px] rounded-l-sm bg-slate-500" />
    <span className="absolute -left-[3px] top-[136px] h-12 w-[3px] rounded-l-sm bg-slate-500" />
    <span className="absolute -left-[3px] top-[196px] h-12 w-[3px] rounded-l-sm bg-slate-500" />
    <span className="absolute -right-[3px] top-[150px] h-16 w-[3px] rounded-r-sm bg-slate-500" />
    <div className="rounded-[3rem] bg-gradient-to-br from-slate-400 via-slate-700 to-slate-500 p-[2.5px] shadow-[0_40px_70px_-30px_rgba(16,24,40,.65)]">
      <div className="rounded-[2.85rem] bg-slate-950 p-[9px]">
        <div className="relative overflow-hidden rounded-[2.3rem] bg-white">
          {/* Status bar laid out like a real phone: time centred in the left "ear", icons in the right one, island in between. */}
          <div className="grid h-[38px] grid-cols-[minmax(0,1fr)_78px_minmax(0,1fr)] items-center text-slate-900">
            <span className="pl-2 text-center text-[11.5px] font-semibold tabular-nums tracking-[-0.01em]">9:41</span>
            <span className="h-[23px] w-[78px] rounded-full bg-slate-950" />
            <span className="flex items-center justify-center gap-[4px] pr-2">
              <svg viewBox="0 0 18 12" className="h-[9px] w-[13px]" fill="currentColor">
                <rect x="0" y="8" width="3" height="4" rx="1" />
                <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                <rect x="10" y="3" width="3" height="9" rx="1" />
                <rect x="15" y="0" width="3" height="12" rx="1" />
              </svg>
              <svg viewBox="0 0 16 12" className="h-[9px] w-[12px]" fill="currentColor">
                <path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.8 10.8 0 0 0 8 .4 10.8 10.8 0 0 0 .5 3.4l1.2 1.3A9 9 0 0 1 8 2.2Zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3A7.2 7.2 0 0 0 8 4a7.2 7.2 0 0 0-4.9 1.9l1.2 1.3c1-.9 2.3-1.4 3.7-1.4Zm0 3.5c-.5 0-1 .2-1.4.5L8 11.6l1.4-1.8c-.4-.3-.9-.5-1.4-.5Z" />
              </svg>
              <span className="relative ml-[1px] flex h-[10px] w-[20px] items-center rounded-[3px] border border-slate-900/45 p-[1.5px]">
                <span className="h-full w-[75%] rounded-[1.5px] bg-slate-900" />
                <span className="absolute -right-[3px] top-1/2 h-[4px] w-[1.5px] -translate-y-1/2 rounded-r bg-slate-900/45" />
              </span>
            </span>
          </div>
          <div className="px-4 pb-4 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Northline Renovations</p>
            <p className="mt-1 text-sm font-bold text-slate-800">Change Order #3</p>
            <p className="text-[11px] text-slate-500">Maple St. kitchen remodel</p>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px]">
              <p className="font-semibold text-slate-700">Add pantry pull-out shelves (4)</p>
              <div className="mt-2 flex justify-between text-slate-500"><span>Price change</span><span className="font-bold text-slate-800">+$860.00</span></div>
              <div className="flex justify-between text-slate-500"><span>Schedule</span><span className="font-semibold text-slate-700">+1 day</span></div>
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-2">
              <p className="text-[9px] uppercase tracking-wider text-slate-400">Signature</p>
              <Signature className="h-9 w-full" />
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">Dana Whitfield · Nov 12, 2026, 2:14 PM</p>
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-[12px] font-bold text-white">
              <Check className="h-3.5 w-3.5" strokeWidth={3} /> Approved & signed
            </div>
          </div>
          <div className="mx-auto mb-2 h-[5px] w-28 rounded-full bg-slate-900" />
        </div>
      </div>
    </div>
  </div>
);

/** Gmail sending illustration. */
export const EmailMockup: React.FC = () => (
  <div className="rounded-2xl border border-slate-200 bg-white shadow-card" aria-hidden="true">
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
      <p className="text-sm font-bold text-slate-800">Send invoice</p>
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Gmail connected</span>
    </div>
    <dl className="space-y-0 px-4 text-[12px]">
      {[
        ['From', 'office@northlinereno.com'],
        ['To', 'dana.whitfield@example.com'],
        ['Subject', 'Invoice #1042 for your kitchen remodel'],
      ].map(([k, v]) => (
        <div key={k} className="flex gap-3 border-b border-slate-100 py-2.5">
          <dt className="w-14 flex-none text-slate-400">{k}</dt>
          <dd className="min-w-0 truncate font-medium text-slate-700">{v}</dd>
        </div>
      ))}
    </dl>
    <div className="px-4 py-3 text-[12px] leading-relaxed text-slate-600">
      Hi Dana, attached is progress invoice #1042. The balance due is $5,041.60 by Nov 26. Thanks again!
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
      <span className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-100">
        <FileText className="h-3.5 w-3.5" /> Invoice-1042.pdf
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white"><Send className="h-3.5 w-3.5" /> Send</span>
    </div>
  </div>
);

/** Inventory & price book illustration. */
export const InventoryMockup: React.FC = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card" aria-hidden="true">
    <div className="flex items-center justify-between">
      <p className="text-sm font-bold text-slate-800">Price book</p>
      <span className="flex items-center gap-1 text-[11px] font-semibold text-brand-600"><QrCode className="h-3.5 w-3.5" /> Print tags</span>
    </div>
    <ul className="mt-3 divide-y divide-slate-100 text-[12px]">
      {[
        { n: '1/2" PEX tubing, 100 ft', p: '$54.00', s: '6 in stock', low: false },
        { n: 'GFCI outlet, 20A', p: '$24.50', s: '3 in stock', low: true },
        { n: 'Cabinet install (per lf)', p: '$85.00', s: 'Service', low: false },
        { n: 'Drywall sheet 4×8, 1/2"', p: '$16.75', s: '40 in stock', low: false },
      ].map((i) => (
        <li key={i.n} className="flex items-center justify-between gap-3 py-2.5">
          <span className="min-w-0 truncate font-medium text-slate-700">{i.n}</span>
          <span className="flex flex-none items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${i.low ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{i.s}</span>
            <span className="w-14 text-right font-bold tabular-nums text-slate-800">{i.p}</span>
          </span>
        </li>
      ))}
    </ul>
  </div>
);

/** Job profit illustration. */
export const ProfitMockup: React.FC = () => {
  const rows = [
    { label: 'Materials', value: 2310, color: 'bg-brand-500' },
    { label: 'Labor', value: 1560, color: 'bg-brand-300' },
    { label: 'Subs & expenses', value: 420, color: 'bg-amber-400' },
  ];
  const revenue = 6520;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card" aria-hidden="true">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">Job financials</p>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><TrendingUp className="h-3 w-3" /> 34% margin</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['Invoiced', '$6,520'],
          ['Costs', '$4,290'],
          ['Profit', '$2,230'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-slate-50 px-2 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k}</p>
            <p className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-800">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-emerald-100">
        {rows.map((r) => (
          <span key={r.label} className={r.color} style={{ width: `${(r.value / revenue) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-[11px] text-slate-600">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${r.color}`} /> {r.label}</span>
            <span className="font-semibold tabular-nums">${r.value.toLocaleString('en-US')}</span>
          </li>
        ))}
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Profit</span>
          <span className="font-semibold tabular-nums">$2,230</span>
        </li>
      </ul>
    </div>
  );
};

/** Phone illustration for the mobile section. */
export const PhoneMockup: React.FC = () => (
  <div className="mx-auto w-[240px] rounded-[2rem] border-[7px] border-slate-900 bg-slate-50 shadow-[0_30px_60px_-25px_rgba(16,24,40,.5)]" aria-hidden="true">
    <div className="mx-auto mt-2 h-1.5 w-14 rounded-full bg-slate-300" />
    <div className="p-3.5">
      <div className="flex items-center gap-2">
        <LogoMark className="h-6 w-6" />
        <p className="text-xs font-bold text-slate-800">Today</p>
      </div>
      <div className="mt-3 space-y-2">
        {[
          { icon: 'dailyReport' as DocIconName, t: 'Daily report', s: 'Maple St. · draft', c: 'text-violet-600 bg-violet-50' },
          { icon: 'changeOrder' as DocIconName, t: 'Change order #3', s: 'Signed · 2:14 PM', c: 'text-emerald-600 bg-emerald-50' },
          { icon: 'invoice' as DocIconName, t: 'Invoice #1042', s: 'Sent via Gmail', c: 'text-brand-600 bg-brand-50' },
          { icon: 'timeSheet' as DocIconName, t: 'Time sheet', s: '22.5 h this week', c: 'text-amber-700 bg-amber-50' },
        ].map((i) => (
          <div key={i.t} className="flex items-center gap-2.5 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-100">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${i.c}`}><DocIcon name={i.icon} className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold text-slate-800">{i.t}</p>
              <p className="truncate text-[10px] text-slate-500">{i.s}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-[11px] font-bold text-white">
        <Mic className="h-3.5 w-3.5" /> Dictate a report
      </div>
    </div>
  </div>
);

/** Small portal status track used in the landing page feature rows. */
export const StatusStrip: React.FC = () => (
  <ol className="flex flex-wrap items-center gap-y-2 text-xs font-semibold" aria-hidden="true">
    {[
      { t: 'Sent', dot: 'bg-brand-500', c: 'text-brand-700' },
      { t: 'Approved', dot: 'bg-sky-500', c: 'text-sky-700' },
      { t: 'Signed', dot: 'bg-emerald-500', c: 'text-emerald-700' },
      { t: 'Due in 14 days', dot: 'bg-amber-400', c: 'text-amber-800' },
    ].map((step, i, all) => (
      <li key={step.t} className="flex items-center">
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 ring-1 ring-border ${step.c}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${step.dot}`} />
          {step.t}
        </span>
        {i < all.length - 1 ? <span className="mx-1.5 h-px w-4 bg-border" /> : null}
      </li>
    ))}
  </ol>
);

/* ---------- Document thumbnails for the templates gallery ---------- */

export type ThumbStyle = 'classic' | 'modern' | 'bold' | 'minimal' | 'warm' | 'blueprint';

const THUMB_THEMES: Record<ThumbStyle, { accent: string; header: string; headerText: string; paper: string; rule: string; font: string }> = {
  classic: { accent: '#1d2d8a', header: 'transparent', headerText: '#1d2d8a', paper: '#ffffff', rule: '#e2e8f0', font: 'Georgia, serif' },
  modern: { accent: '#2148ed', header: '#2148ed', headerText: '#ffffff', paper: '#ffffff', rule: '#e2e8f0', font: 'Inter, sans-serif' },
  bold: { accent: '#f59e0b', header: '#0f172a', headerText: '#ffffff', paper: '#ffffff', rule: '#e5e7eb', font: 'Inter, sans-serif' },
  minimal: { accent: '#111827', header: 'transparent', headerText: '#111827', paper: '#ffffff', rule: '#f1f5f9', font: 'Inter, sans-serif' },
  warm: { accent: '#c2410c', header: '#fff7ed', headerText: '#9a3412', paper: '#fffdf9', rule: '#fde7d4', font: 'Georgia, serif' },
  blueprint: { accent: '#0ea5e9', header: '#0c4a6e', headerText: '#e0f2fe', paper: '#f8fbff', rule: '#dbeafe', font: '"JetBrains Mono", monospace' },
};

export const DocThumb: React.FC<{ title: string; styleName?: ThumbStyle; icon?: DocIconName; className?: string }> = ({
  title,
  styleName = 'modern',
  icon = 'invoice',
  className = '',
}) => {
  const t = THUMB_THEMES[styleName];
  const filledHeader = t.header !== 'transparent';
  return (
    <div
      className={`relative aspect-[8.5/11] w-full overflow-hidden rounded-lg shadow-[0_1px_2px_rgba(16,24,40,.08),0_10px_24px_-14px_rgba(16,24,40,.35)] ring-1 ring-slate-200 ${className}`}
      style={{ background: t.paper, fontFamily: t.font }}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between px-[8%] py-[7%]" style={{ background: t.header, color: t.headerText }}>
        <div className="flex items-center gap-[6%]">
          <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: filledHeader ? 'rgba(255,255,255,.18)' : t.accent, color: '#fff' }}>
            <DocIcon name={icon} className="h-3.5 w-3.5" />
          </span>
          <span className="h-1.5 w-12 rounded-full" style={{ background: filledHeader ? 'rgba(255,255,255,.55)' : '#cbd5e1' }} />
        </div>
        <span className="text-[9px] font-extrabold uppercase tracking-[0.12em]" style={{ color: filledHeader ? t.headerText : t.accent }}>
          {title}
        </span>
      </div>
      <div className="px-[8%] pt-[5%]">
        <div className="grid grid-cols-2 gap-[6%]">
          <div className="space-y-1">
            <span className="block h-1 w-1/2 rounded-full bg-slate-300" />
            <span className="block h-1 w-3/4 rounded-full bg-slate-200" />
            <span className="block h-1 w-2/3 rounded-full bg-slate-200" />
          </div>
          <div className="space-y-1">
            <span className="ml-auto block h-1 w-1/2 rounded-full bg-slate-300" />
            <span className="ml-auto block h-1 w-2/3 rounded-full bg-slate-200" />
          </div>
        </div>
        <div className="mt-[9%] h-[3px] w-full rounded-full" style={{ background: t.accent, opacity: 0.85 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between py-[3.2%]" style={{ borderBottom: `1px solid ${t.rule}` }}>
            <span className="h-1 rounded-full bg-slate-300" style={{ width: `${46 - i * 5}%` }} />
            <span className="h-1 w-[14%] rounded-full bg-slate-300" />
          </div>
        ))}
        <div className="mt-[6%] flex justify-end">
          <div className="w-[46%] space-y-1">
            <div className="flex justify-between"><span className="h-1 w-1/3 rounded-full bg-slate-200" /><span className="h-1 w-1/4 rounded-full bg-slate-200" /></div>
            <div className="flex justify-between"><span className="h-1 w-1/3 rounded-full bg-slate-200" /><span className="h-1 w-1/4 rounded-full bg-slate-200" /></div>
            <div className="mt-1 h-3 rounded" style={{ background: t.accent }} />
          </div>
        </div>
        <div className="mt-[10%] flex items-end justify-between">
          <Signature className="h-5 w-16 opacity-80" />
          <span className="block h-1 w-1/4 rounded-full bg-slate-200" />
        </div>
      </div>
    </div>
  );
};

export const ClipboardBadge: React.FC = () => (
  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><ClipboardList className="h-5 w-5" /></span>
);
