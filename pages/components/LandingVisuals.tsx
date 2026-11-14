import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { DocPaper, PAPER_SHADOW } from './DocPapers.tsx';
import { LogoMark } from './Logo.tsx';
import { ArrowRight } from './icons.tsx';
import { Waveform } from './Waveform.tsx';
import { MarkerTick } from './ui.tsx';
import { DOCUMENT_TYPES, type DocIconName, type DocumentTypeInfo } from '../../content/site.ts';

/*
 * Landing-page-only visuals. Everything here is product-specific (papers, stamps, tags, UI snippets)
 * instead of generic line icons, and renders deterministically for prerendering + hydration.
 */

/* =================================================================== Document shelf */

const PHASES: { n: string; label: string; ids: DocIconName[] }[] = [
  { n: '01', label: 'Price & plan', ids: ['estimate', 'workOrder', 'purchaseOrder'] },
  { n: '02', label: 'On site, every day', ids: ['dailyReport', 'timeSheet', 'materialLog'] },
  { n: '03', label: 'Changes & costs', ids: ['changeOrder', 'expenseLog', 'note'] },
  { n: '04', label: 'Get paid & hand over', ids: ['invoice', 'receipt', 'warranty'] },
];

/** Hand-placed look: each sheet is tilted and nudged a little differently. */
const TILT = [-4, 1.5, -1.5];
const NUDGE = [5, 0, 3];

const DOCS_BY_ID = new Map<DocIconName, DocumentTypeInfo>(DOCUMENT_TYPES.map((d) => [d.id, d]));

/**
 * The 12 document types as a job timeline: four phases, each with its three papers on top and a
 * compact text index below (names + one-line purpose stay real text, each name links to its page).
 * Hovering or focusing a document lifts its paper.
 */
export const DocumentShelf: React.FC = () => {
  const [active, setActive] = useState<DocIconName | null>(null);

  return (
    <ol className="mt-9 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
      {PHASES.map((phase, pi) => (
        <li key={phase.n} className="flex flex-col">
          <div aria-hidden="true" className="flex items-end px-3" onMouseLeave={() => setActive(null)}>
            {phase.ids.map((id, i) => {
              const on = active === id;
              return (
                <div
                  key={id}
                  onMouseEnter={() => setActive(id)}
                  className={`relative w-[36%] flex-none transition-transform duration-300 ease-out ${i ? '-ml-[4%]' : ''}`}
                  style={{
                    zIndex: on ? 10 : i + 1,
                    transform: on ? 'translateY(-12px) rotate(0deg) scale(1.08)' : `translateY(${NUDGE[i]}px) rotate(${TILT[i]}deg)`,
                  }}
                >
                  <DocPaper id={id} className={`block h-auto w-full ${PAPER_SHADOW}`} />
                </div>
              );
            })}
          </div>

          <p className="mt-6 flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.14em] text-foreground/70">
            <span className="font-mono text-[11px] font-medium tracking-normal text-brand-600">{phase.n}</span>
            <span className="whitespace-nowrap">{phase.label}</span>
            <span aria-hidden="true" className={`h-px flex-1 bg-gradient-to-r from-brand-300 to-border ${pi < PHASES.length - 1 ? 'lg:-mr-8' : ''}`} />
          </p>

          <ul className="mt-2">
            {phase.ids.map((id) => {
              const d = DOCS_BY_ID.get(id);
              if (!d) return null;
              const on = active === id;
              return (
                <li
                  key={id}
                  onMouseEnter={() => setActive(id)}
                  onMouseLeave={() => setActive(null)}
                  className={`relative -mx-3 rounded-xl px-3 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${on ? 'bg-brand-50/80' : ''}`}
                >
                  <h3 className="font-display text-[15.5px] font-bold leading-snug text-foreground">
                    <Link
                      to={d.href}
                      onFocus={() => setActive(id)}
                      onBlur={() => setActive(null)}
                      className={`outline-none after:absolute after:inset-0 after:rounded-xl ${on ? 'text-brand-700' : ''}`}
                    >
                      {d.name}
                      <span className="sr-only"> ({d.hrefLabel})</span>
                    </Link>
                    <ArrowRight
                      className={`ml-1 inline-block h-3.5 w-3.5 align-[-2px] text-brand-600 transition duration-200 ${on ? 'translate-x-0.5 opacity-100' : '-translate-x-1 opacity-0'}`}
                    />
                  </h3>
                  <p className="mt-0.5 text-[13.5px] leading-[1.45] text-muted-foreground">{d.summary}</p>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
};

/* =================================================================== Small marks for the feature cards */

/** A postage stamp + postmark: "sent from your own address". */
export const PostStamp: React.FC<{ className?: string }> = ({ className = 'h-[78px] w-[96px]' }) => {
  const holesX = Array.from({ length: 11 }, (_, i) => 28 + i * 5.4);
  const holesY = Array.from({ length: 13 }, (_, i) => Number((6 + i * 5.333).toFixed(2)));
  return (
    <svg viewBox="0 0 96 78" className={className} aria-hidden="true" focusable="false">
      <defs>
        <mask id="cd-stamp-perforation" maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width="96" height="78" fill="#fff" />
          {holesX.map((x) => (
            <React.Fragment key={`x${x}`}>
              <circle cx={x} cy={6} r={2} fill="#000" />
              <circle cx={x} cy={70} r={2} fill="#000" />
            </React.Fragment>
          ))}
          {holesY.map((y) => (
            <React.Fragment key={`y${y}`}>
              <circle cx={28} cy={y} r={2} fill="#000" />
              <circle cx={82} cy={y} r={2} fill="#000" />
            </React.Fragment>
          ))}
        </mask>
        <filter id="cd-stamp-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#101828" floodOpacity="0.18" />
        </filter>
      </defs>
      <g transform="rotate(5 55 38)">
        <g filter="url(#cd-stamp-shadow)">
          <rect x={28} y={6} width={54} height={64} fill="#ffffff" mask="url(#cd-stamp-perforation)" />
        </g>
        <rect x={33} y={11} width={44} height={54} rx={1} fill="#2148ed" />
        <text x={55} y={21} fontSize={6} fontWeight={800} fill="#fcd34d" textAnchor="middle" letterSpacing={1.5} fontFamily="Inter, sans-serif">SENT</text>
        <text x={55} y={49} fontSize={28} fontWeight={800} fill="#ffffff" textAnchor="middle" fontFamily='"Plus Jakarta Sans", Inter, sans-serif'>@</text>
      </g>
      <g fill="none" stroke="#1e293b" strokeOpacity="0.5">
        <circle cx={20} cy={54} r={13.5} strokeWidth={1.3} />
        <circle cx={20} cy={54} r={10} strokeWidth={0.6} />
        {[50, 56, 62].map((y) => (
          <path key={y} d={`M38 ${y}q4-3 8 0t8 0 8 0 8 0 8 0 8 0 8 0`} strokeWidth={1.2} strokeLinecap="round" />
        ))}
      </g>
      <text x={20} y={56} fontSize={5.5} fontWeight={800} fill="#1e293b" fillOpacity="0.7" textAnchor="middle" fontFamily="Inter, sans-serif">NOV 12</text>
    </svg>
  );
};

const QR_ROWS = ['111010111', '101011101', '111001111', '000110000', '110101011', '001011010', '111010110', '101001011', '111011100'];

/** A swinging stock tag with a QR code. */
export const StockTag: React.FC<{ className?: string }> = ({ className = 'h-[92px] w-[80px]' }) => (
  <svg viewBox="0 0 84 96" className={className} aria-hidden="true" focusable="false">
    <defs>
      <filter id="cd-tag-shadow" x="-30%" y="-20%" width="160%" height="150%">
        <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#101828" floodOpacity="0.16" />
      </filter>
    </defs>
    <path d="M56 0C55 9 48 14 46.5 21" fill="none" stroke="#94a3b8" strokeWidth={1.3} strokeLinecap="round" />
    <g transform="rotate(9 46 24)">
      <path d="M25 32 36 16h20l11 16v56a4 4 0 0 1-4 4H29a4 4 0 0 1-4-4Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth={1} filter="url(#cd-tag-shadow)" />
      <circle cx={46} cy={24} r={3.6} fill="#f1f5f9" stroke="#f59e0b" strokeWidth={1.6} />
      {QR_ROWS.flatMap((row, ri) =>
        row.split('').map((v, ci) => (v === '1' ? <rect key={`${ri}-${ci}`} x={Number((30.7 + ci * 3.4).toFixed(2))} y={Number((36 + ri * 3.4).toFixed(2))} width={3.4} height={3.4} fill="#0f172a" /> : null)),
      )}
      <text x={46} y={77} fontSize={5} fill="#64748b" textAnchor="middle" fontFamily='"JetBrains Mono", monospace'>SKU 0142</text>
      <text x={46} y={86} fontSize={6.2} fontWeight={800} fill="#047857" textAnchor="middle" fontFamily="Inter, sans-serif">6 in stock</text>
    </g>
  </svg>
);

/** A margin dial at 34%. */
export const MarginDial: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`} aria-hidden="true">
    <svg viewBox="0 0 80 48" className="h-12 w-20" focusable="false">
      <path d="M10 42a30 30 0 0 1 60 0" fill="none" stroke="#e2e8f0" strokeWidth={7} strokeLinecap="round" />
      <path d="M10 42a30 30 0 0 1 15.55-26.29" fill="none" stroke="#10b981" strokeWidth={7} strokeLinecap="round" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const a = Math.PI * (1 - t);
        const x1 = (40 + 22 * Math.cos(a)).toFixed(2);
        const y1 = (42 - 22 * Math.sin(a)).toFixed(2);
        const x2 = (40 + 25 * Math.cos(a)).toFixed(2);
        const y2 = (42 - 25 * Math.sin(a)).toFixed(2);
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#cbd5e1" strokeWidth={1.2} />;
      })}
      <line x1={40} y1={42} x2={29.88} y2={23.6} stroke="#0f172a" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={40} cy={42} r={3.6} fill="#0f172a" />
    </svg>
    <span className="leading-none">
      <span className="block font-display text-2xl font-extrabold tabular-nums text-foreground">34%</span>
      <span className="mt-1 block font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">margin</span>
    </span>
  </span>
);

/** "Recording" pill: voice dictation on the job site. */
export const RecordingPill: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span aria-hidden="true" className={`inline-flex items-center gap-2.5 rounded-full bg-slate-900 py-2 pl-3 pr-3.5 text-white shadow-lift ${className}`}>
    <span className="h-2.5 w-2.5 flex-none rounded-full bg-red-500 ring-4 ring-red-500/20" />
    <Waveform className="h-5 text-white/90" />
    <span className="font-mono text-xs tabular-nums text-slate-300">0:18</span>
  </span>
);

/** Phone showing today's documents as real paper thumbnails. */
export const PhoneTodayMockup: React.FC = () => (
  <div className="mx-auto w-[240px] rounded-[2rem] border-[7px] border-slate-900 bg-slate-50 shadow-[0_30px_60px_-25px_rgba(16,24,40,.5)]" aria-hidden="true">
    <div className="mx-auto mt-2 h-1.5 w-14 rounded-full bg-slate-300" />
    <div className="p-3.5">
      <div className="flex items-center gap-2">
        <LogoMark className="h-6 w-6" />
        <p className="text-xs font-bold text-slate-800">Today</p>
        <span className="ml-auto font-mono text-[10px] text-slate-400">Thu, Nov 12</span>
      </div>
      <div className="mt-3 space-y-2">
        {(
          [
            { id: 'dailyReport', t: 'Daily report', s: 'Maple St. · draft', tag: 'Draft', c: 'bg-violet-50 text-violet-700' },
            { id: 'changeOrder', t: 'Change order #3', s: 'Signed · 2:14 PM', tag: 'Signed', c: 'bg-emerald-50 text-emerald-700' },
            { id: 'invoice', t: 'Invoice #1042', s: 'Sent via Gmail', tag: 'Sent', c: 'bg-brand-50 text-brand-700' },
            { id: 'timeSheet', t: 'Time sheet', s: '22.5 h this week', tag: '', c: '' },
          ] as { id: DocIconName; t: string; s: string; tag: string; c: string }[]
        ).map((i) => (
          <div key={i.t} className="flex items-center gap-2.5 rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-100">
            <DocPaper id={i.id} className="h-9 w-7 flex-none drop-shadow-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-slate-800">{i.t}</p>
              <p className="truncate text-[10px] text-slate-500">{i.s}</p>
            </div>
            {i.tag ? <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${i.c}`}>{i.tag}</span> : null}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-[11px] font-bold text-white">
        <span className="h-2 w-2 rounded-full bg-red-400 ring-2 ring-red-400/30" /> Dictate a report
      </div>
    </div>
  </div>
);

/* =================================================================== Trades tape */

const TAPE_STYLE: React.CSSProperties = {
  backgroundColor: '#fcd34d',
  backgroundImage: [
    'linear-gradient(to right, rgba(41,37,36,.85) 0 2px, transparent 2px)',
    'repeating-linear-gradient(to right, rgba(41,37,36,.55) 0 1px, transparent 1px 7px)',
    'repeating-linear-gradient(to right, rgba(41,37,36,.7) 0 1px, transparent 1px 28px)',
    'repeating-linear-gradient(to right, rgba(41,37,36,.45) 0 1px, transparent 1px 7px)',
    'linear-gradient(to bottom, rgba(255,255,255,.35), rgba(255,255,255,0) 45%, rgba(120,53,15,.08))',
  ].join(', '),
  backgroundSize: '100% 20px, 100% 6px, 100% 11px, 100% 5px, 100% 100%',
  backgroundPosition: 'left top, left top, left top, left bottom, left top',
  backgroundRepeat: 'no-repeat',
};

/** "Made for the trades" as a strip of measuring tape. */
export const TradesTape: React.FC<{ trades: { id: string; name: string; to?: string }[] }> = ({ trades }) => (
  <div className="relative mx-auto mt-6 max-w-6xl">
    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:flex lg:gap-0 lg:pr-2.5 lg:shadow-[0_8px_18px_-12px_rgba(120,53,15,.55)]">
      {trades.map((t, i) => (
        <li
          key={t.id}
          style={TAPE_STYLE}
          className="relative flex min-h-[46px] items-end rounded-[4px] pb-2 pl-3 pr-3 pt-6 text-[13px] font-semibold sm:min-h-[58px] sm:pb-2.5 sm:pr-4 sm:pt-7 sm:text-[13.5px] leading-tight text-stone-900 shadow-[0_6px_14px_-10px_rgba(120,53,15,.6)] lg:flex-auto lg:rounded-none lg:shadow-none lg:first:rounded-l-[4px]"
        >
          <span aria-hidden="true" className="absolute left-[6px] top-[7px] font-mono text-[11px] font-bold leading-none text-stone-800">
            {i + 1}
          </span>
          {t.to ? (
            <Link to={t.to} className="after:absolute after:inset-0 hover:underline hover:decoration-stone-700/60 hover:underline-offset-4 focus-visible:outline-none focus-visible:after:rounded-[4px] focus-visible:after:ring-2 focus-visible:after:ring-brand-500">{t.name}</Link>
          ) : t.name}
        </li>
      ))}
    </ul>
    <span aria-hidden="true" className="absolute -bottom-1 -top-1 right-0 hidden w-2.5 rounded-[3px] bg-gradient-to-r from-slate-300 via-slate-400 to-slate-500 shadow-sm lg:block" />
  </div>
);

/* =================================================================== Security & trust "proofs" */

/** Hand-drawn cross, the counterpart of the marker tick. */
const MarkerCross: React.FC<{ className?: string }> = ({ className = 'h-4 w-4 text-red-400' }) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
    <path d="M5.2 5.4c3.1 2.9 6.3 6.1 9.5 9.5M14.9 5.1c-3.3 3-6.4 6.3-9.7 9.8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

/** The address bar: every connection is HTTPS. */
export const HttpsProof: React.FC = () => (
  <span className="flex min-w-0 max-w-full items-center rounded-full bg-white py-1.5 pl-3 pr-3.5 font-mono text-[11.5px] shadow-sm ring-1 ring-slate-200">
    <span className="font-semibold text-emerald-700">https://</span>
    <span className="truncate text-slate-600">www.contractordocs.app</span>
  </span>
);

/** Per-account access: your rows, nobody else's. */
export const AccountProof: React.FC = () => (
  <span className="flex w-full max-w-[236px] flex-col gap-1 text-[11.5px]">
    <span className="flex items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200">
      <span className="truncate font-semibold text-slate-800">Your jobs, clients &amp; docs</span>
      <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-brand-700">You</span>
    </span>
    <span className="flex items-center justify-between gap-2 rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-slate-400">
      <span className="truncate">Any other account</span>
      <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider">No access</span>
    </span>
  </span>
);

/** The Gmail permission we ask for (send) and the one we don't (read). */
export const GmailScopeProof: React.FC = () => (
  <span className="flex flex-col gap-1 text-[12px]">
    <span className="flex items-center gap-1.5 font-semibold text-slate-800">
      <MarkerTick className="h-4 w-4 flex-none text-emerald-600" /> Send email for you
    </span>
    <span className="flex items-center gap-1.5 text-slate-400">
      <MarkerCross className="h-4 w-4 flex-none text-red-400" /> <span className="line-through decoration-red-300">Read your inbox</span>
    </span>
  </span>
);

/** Card details are entered at the secure checkout, not with us. */
export const CardProof: React.FC = () => (
  <span className="flex items-center gap-3">
    <span className="relative h-[40px] w-[64px] flex-none overflow-hidden rounded-md bg-gradient-to-br from-slate-600 to-slate-900 shadow-sm">
      <span className="absolute left-2 top-2 h-[9px] w-3 rounded-[2px] bg-gradient-to-br from-amber-200 to-amber-400" />
      <span className="absolute bottom-1.5 left-2 font-mono text-[7px] tracking-[0.12em] text-white/70">•••• ••••</span>
    </span>
    <span className="leading-tight">
      <span className="block font-mono text-[11px] tracking-[0.1em] text-slate-400">•••• •••• ••••</span>
      <span className="mt-0.5 block text-[12px] font-semibold text-slate-800">Entered at secure checkout</span>
    </span>
  </span>
);
