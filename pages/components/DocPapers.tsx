import React from 'react';
import type { DocIconName } from '../../content/site.ts';

/*
 * Miniature, document-specific paper thumbnails for the marketing site (decorative, sample data).
 * Each one is a tiny SVG "sheet" in a 170 x 220 box that shows what makes that document recognisable:
 * the approved stamp on an estimate, the +/- lines on a change order, the hours grid on a time sheet…
 * Everything is static and deterministic so it prerenders and hydrates identically.
 */

const SANS = 'Inter, ui-sans-serif, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace';
const SERIF = 'Georgia, "Times New Roman", serif';

const C = {
  ink: '#0f172a',
  s700: '#334155',
  s600: '#475569',
  s500: '#64748b',
  s400: '#94a3b8',
  s300: '#cbd5e1',
  s200: '#e2e8f0',
  s100: '#f1f5f9',
  s50: '#f8fafc',
  brand: '#2148ed',
  brand400: '#5c8dfd',
  brand700: '#1a36d9',
  brand900: '#1d2d8a',
  brand50: '#eef4ff',
  sig: '#1c2eb0',
  em: '#059669',
  emBg: '#d1fae5',
  red: '#dc2626',
  amber: '#f59e0b',
  amber100: '#fef3c7',
  amber800: '#92400e',
};

type TProps = {
  x: number;
  y: number;
  s?: number;
  w?: number;
  c?: string;
  a?: 'start' | 'middle' | 'end';
  f?: string;
  ls?: number;
  it?: boolean;
  children: React.ReactNode;
};

const T = ({ x, y, s = 6.5, w = 500, c = C.s600, a, f, ls, it, children }: TProps) => (
  <text x={x} y={y} fontSize={s} fontWeight={w} fill={c} textAnchor={a} fontFamily={f} letterSpacing={ls} fontStyle={it ? 'italic' : undefined}>
    {children}
  </text>
);

const Bar = ({ x, y, w, h = 3.4, c = C.s200 }: { x: number; y: number; w: number; h?: number; c?: string }) => (
  <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={c} />
);

const Rule = ({ y, x = 12, w = 146, h = 0.8, c = C.s200 }: { y: number; x?: number; w?: number; h?: number; c?: string }) => (
  <rect x={x} y={y} width={w} height={h} fill={c} />
);

const Label = ({ x, y, a, children }: { x: number; y: number; a?: 'start' | 'middle' | 'end'; children: React.ReactNode }) => (
  <T x={x} y={y} s={5.5} w={700} c={C.s400} a={a} ls={0.6}>{children}</T>
);

const SIG_D = 'M4 26c8-14 14-20 18-18s-6 18-2 19 10-16 14-15-2 13 2 13 8-9 12-9 2 7 6 7 7-6 11-6 3 5 7 5 9-4 14-4 10 2 16 1';
const Sig = ({ x, y, s = 0.45 }: { x: number; y: number; s?: number }) => (
  <path d={SIG_D} transform={`translate(${x} ${y}) scale(${s})`} fill="none" stroke={C.sig} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
);

const Sheet = ({ fill = '#ffffff', stroke = C.s200 }: { fill?: string; stroke?: string }) => (
  <rect x={0.75} y={0.75} width={168.5} height={218.5} rx={5} fill={fill} stroke={stroke} strokeWidth={1.5} />
);

/** Company block (sample contractor "Northline Renovations") + document title. */
const Head = ({ title, no, size = 12 }: { title: string; no?: string; size?: number }) => (
  <>
    <rect x={12} y={12} width={17} height={17} rx={4} fill={C.ink} />
    <T x={20.5} y={23.2} s={7} w={900} c="#fbbf24" a="middle">NR</T>
    <Bar x={34} y={13.5} w={40} h={4} c={C.s300} />
    <Bar x={34} y={22} w={28} h={3} />
    {no ? <T x={158} y={21} s={6.5} w={600} c={C.s500} a="end" f={MONO}>{no}</T> : null}
    <T x={12} y={47} s={size} w={800} c={C.brand} ls={0.6}>{title}</T>
  </>
);

const Amount = ({ y, children, c = C.s600 }: { y: number; children: React.ReactNode; c?: string }) => (
  <T x={158} y={y} s={6} w={600} c={c} a="end" f={MONO}>{children}</T>
);

/* ---------- deterministic geometry (rounded so server and browser output match) ---------- */

const r2 = (n: number) => Number(n.toFixed(2));

const BARCODE = (() => {
  const widths = [2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 1, 1, 2, 1, 1, 3, 2, 1, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1];
  const out: { x: number; w: number }[] = [];
  let x = 12;
  widths.forEach((w, i) => {
    const px = r2(w * 1.45);
    if (i % 2 === 0) out.push({ x: r2(x), w: px });
    x += px;
  });
  return out;
})();

const QR = [
  '111010111',
  '101011101',
  '111001111',
  '000110000',
  '110101011',
  '001011010',
  '111010110',
  '101001011',
  '111011100',
];

const QrCells = ({ x, y, cell }: { x: number; y: number; cell: number }) => (
  <>
    {QR.flatMap((row, ri) =>
      row.split('').map((v, ci) =>
        v === '1' ? <rect key={`${ri}-${ci}`} x={r2(x + ci * cell)} y={r2(y + ri * cell)} width={cell} height={cell} fill={C.ink} /> : null,
      ),
    )}
  </>
);

const zigzag = (x0: number, x1: number, top: number, bottom: number, tooth: number) => {
  const pts: string[] = [`${x0},${top}`, `${x1},${top}`, `${x1},${bottom}`];
  let down = true;
  for (let x = x1 - tooth / 2; x > x0; x -= tooth / 2) {
    pts.push(`${r2(x)},${down ? bottom + tooth / 2 : bottom}`);
    down = !down;
  }
  pts.push(`${x0},${bottom}`);
  return pts.join(' ');
};

const ROSETTE = Array.from({ length: 28 }, (_, i) => {
  const r = i % 2 ? 16.5 : 19.5;
  const a = (i * Math.PI) / 14;
  return `${r2(85 + r * Math.sin(a))},${r2(140 - r * Math.cos(a))}`;
}).join(' ');

/* ---------- the twelve documents ---------- */

const estimate = (
  <>
    <Sheet />
    <Head title="ESTIMATE" no="#1038" />
    <Label x={12} y={62}>PREPARED FOR</Label>
    <T x={12} y={71} s={7} w={700} c={C.s700}>Dana Whitfield</T>
    <Label x={158} y={62} a="end">VALID UNTIL</Label>
    <T x={158} y={71} s={6.5} w={600} c={C.s700} a="end">Dec 12</T>
    <Rule y={80} h={1.2} c={C.brand} />
    {([[92, 74, '1,200.00'], [104, 60, '2,450.00'], [116, 82, '3,150.00'], [128, 52, '1,040.00']] as const).map(([y, w, a]) => (
      <g key={y}>
        <Bar x={12} y={y - 3.6} w={w} />
        <Amount y={y}>{a}</Amount>
      </g>
    ))}
    <Rule y={136} />
    <T x={78} y={148} s={7} w={700} c={C.s700}>Total</T>
    <T x={158} y={148} s={8.5} w={800} c={C.ink} a="end">$7,840.00</T>
    <g transform="rotate(-11 56 176)">
      <rect x={18} y={163} width={78} height={26} rx={4} fill="none" stroke={C.em} strokeWidth={2.2} opacity={0.9} />
      <rect x={21.5} y={166.5} width={71} height={19} rx={2.5} fill="none" stroke={C.em} strokeWidth={0.7} opacity={0.7} />
      <T x={57} y={179.3} s={9.5} w={900} c={C.em} a="middle" ls={1.2}>APPROVED</T>
    </g>
    <Sig x={104} y={176} s={0.45} />
    <Rule x={104} y={197} w={54} c={C.s300} />
    <T x={104} y={206} s={5} c={C.s400}>Client signature</T>
  </>
);

const workOrder = (
  <>
    <Sheet />
    <Head title="WORK ORDER" no="#WO-311" />
    <rect x={12} y={56} width={60} height={13} rx={6.5} fill={C.brand50} />
    <T x={42} y={64.8} s={6} w={700} c={C.brand700} a="middle">Thu · 7:00 AM</T>
    <T x={158} y={64.8} s={6} w={600} c={C.s500} a="end">Crew: Luis, Sam</T>
    {([[84, 96, true], [100, 78, true], [116, 104, false], [132, 70, false]] as const).map(([y, w, done]) => (
      <g key={y}>
        <rect x={12} y={y - 6.5} width={9} height={9} rx={2} fill={done ? C.em : '#ffffff'} stroke={done ? C.em : C.s300} strokeWidth={1.2} />
        {done ? <path d={`M14.2 ${y - 2.2}l2 2 3.6-4`} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
        <Bar x={27} y={y - 3.7} w={w} c={done ? C.s200 : C.s300} />
      </g>
    ))}
    <Label x={12} y={154}>LOCATION</Label>
    <T x={12} y={163} s={6.5} w={600} c={C.s700}>214 Maple St. · Kitchen</T>
    <Sig x={14} y={174} s={0.42} />
    <Rule y={195} w={70} c={C.s300} />
    <T x={12} y={204} s={5} c={C.s400}>Completed · sign-off</T>
    <T x={158} y={204} s={5} c={C.s400} a="end">2 of 4 done</T>
  </>
);

const purchaseOrder = (
  <>
    <Sheet />
    <Head title="PURCHASE ORDER" no="PO-2207" size={11} />
    <Label x={12} y={64}>SUPPLIER</Label>
    <T x={12} y={73} s={7} w={700} c={C.s700}>Valley Supply Co.</T>
    <rect x={106} y={60} width={52} height={14} rx={7} fill={C.amber100} />
    <T x={132} y={69.2} s={6} w={700} c={C.amber800} a="middle">Deliver Tue</T>
    <Rule y={82} h={1.2} c={C.brand} />
    {([[94, '×18', 64, '1,530.00'], [106, '×4', 50, '98.00'], [118, '×120', 70, '50.40'], [130, '×2', 44, '280.00']] as const).map(([y, q, w, a]) => (
      <g key={y}>
        <T x={12} y={y} s={6} w={700} c={C.s700} f={MONO}>{q}</T>
        <Bar x={36} y={y - 3.6} w={w} />
        <Amount y={y}>{a}</Amount>
      </g>
    ))}
    <Rule y={138} />
    <T x={78} y={150} s={7} w={700} c={C.s700}>Total</T>
    <T x={158} y={150} s={8.5} w={800} c={C.ink} a="end">$1,958.40</T>
    {BARCODE.map((b) => <rect key={b.x} x={b.x} y={166} width={b.w} height={22} fill={C.ink} />)}
    <T x={12} y={198} s={5} c={C.s400} f={MONO}>PO-2207 · MAPLE ST</T>
  </>
);

const dailyReport = (
  <>
    <Sheet />
    <Head title="DAILY JOB REPORT" no="Nov 12" size={11} />
    <circle cx={16.5} cy={59.5} r={3.6} fill="#fbbf24" />
    <circle cx={19} cy={64.5} r={3.4} fill={C.s300} />
    <circle cx={23.5} cy={62.8} r={4.2} fill={C.s300} />
    <rect x={15.6} y={64} width={13} height={4} rx={2} fill={C.s300} />
    <T x={33} y={66.5} s={6} w={600} c={C.s600}>54°F · Rain after 2 PM</T>
    <T x={12} y={82} s={6} w={700} c={C.s700}>Crew 3 · 22.5 h</T>
    <T x={158} y={82} s={6} w={700} c={C.em} a="end">Inspection passed</T>
    <Label x={12} y={97}>WORK COMPLETED</Label>
    <Bar x={12} y={102} w={140} />
    <Bar x={12} y={109} w={124} />
    <Bar x={12} y={116} w={96} />
    <Label x={12} y={132}>PHOTOS (3)</Label>
    {([[12, '#dbeafe', '#94a3b8'], [63, '#e0e7ff', '#a8a29e'], [114, '#fef3c7', '#78716c']] as const).map(([x, sky, ground]) => (
      <g key={x}>
        <rect x={x} y={137} width={44} height={38} rx={2} fill={sky} />
        <path d={`M${x} 175v-11l10-9 8 6 12-12 14 13v13z`} fill={ground} />
      </g>
    ))}
    <circle cx={22} cy={146} r={3.2} fill="#fbbf24" />
    <T x={12} y={192} s={5.5} c={C.s500}>Delivered: quartz slabs (2)</T>
    <T x={12} y={202} s={5.5} c={C.s500}>Delay: none</T>
  </>
);

const DAY_X = [64, 79, 94, 109, 124];
const timeSheet = (
  <>
    <Sheet />
    <Head title="TIME SHEET" no="Week 46" />
    <Label x={12} y={63}>CREW</Label>
    {['M', 'T', 'W', 'T', 'F'].map((d, i) => <Label key={i} x={DAY_X[i]} y={63} a="middle">{d}</Label>)}
    <Label x={158} y={63} a="end">TOTAL</Label>
    {([
      ['Luis', ['8', '8', '7.5', '8', '6'], '37.5'],
      ['Sam', ['8', '8', '8', '8', '6'], '38.0'],
      ['Ana', ['7.5', '8', '8', '7', '4'], '34.5'],
    ] as const).map(([name, hours, total], ri) => {
      const y = 78 + ri * 14;
      return (
        <g key={name}>
          {ri % 2 === 0 ? <rect x={12} y={y - 9} width={146} height={13} rx={2} fill={C.s50} /> : null}
          <T x={15} y={y} s={6.3} w={600} c={C.s700}>{name}</T>
          {hours.map((h, i) => <T key={i} x={DAY_X[i]} y={y} s={5.8} c={C.s600} a="middle" f={MONO}>{h}</T>)}
          <T x={156} y={y} s={6.2} w={700} c={C.ink} a="end" f={MONO}>{total}</T>
        </g>
      );
    })}
    <rect x={12} y={114} width={146} height={15} rx={3} fill={C.brand50} />
    <T x={16} y={124} s={6.5} w={700} c={C.brand700}>Week total</T>
    <T x={155} y={124} s={7} w={800} c={C.brand700} a="end" f={MONO}>110.0 h</T>
    <Label x={12} y={146}>JOB</Label>
    <T x={12} y={155} s={6.5} w={600} c={C.s700}>Maple St. kitchen remodel</T>
    <Bar x={12} y={162} w={84} />
    <Sig x={96} y={174} s={0.42} />
    <Rule x={96} y={195} w={62} c={C.s300} />
    <T x={96} y={204} s={5} c={C.s400}>Approved for payroll</T>
  </>
);

const materialLog = (
  <>
    <Sheet />
    <Head title="MATERIAL LOG" no="Maple St." />
    <Label x={12} y={63}>ITEM</Label>
    <Label x={158} y={63} a="end">USED / IN</Label>
    {([
      ['Drywall 4×8 sheet', 32, 40],
      ['1/2" PEX, 100 ft', 3, 6],
      ['GFCI outlet, 20A', 5, 8],
      ['Quartz slab', 2, 2],
    ] as const).map(([name, used, total], i) => {
      const y = 77 + i * 17;
      return (
        <g key={name}>
          <T x={12} y={y} s={6.3} w={600} c={C.s700}>{name}</T>
          <T x={158} y={y} s={6} c={C.s600} a="end" f={MONO}>{`${used}/${total}`}</T>
          <rect x={12} y={y + 3.5} width={146} height={2.6} rx={1.3} fill={C.s100} />
          <rect x={12} y={y + 3.5} width={r2((146 * used) / total)} height={2.6} rx={1.3} fill={C.brand400} />
        </g>
      );
    })}
    <Label x={12} y={160}>LINKED TO INVENTORY</Label>
    <T x={12} y={170} s={6.5} w={600} c={C.s700}>Stock updated</T>
    <T x={12} y={180} s={6} c={C.s500} f={MONO}>SKU 0142</T>
    <rect x={120} y={146} width={40} height={40} rx={3} fill="#ffffff" stroke={C.s200} />
    <QrCells x={123.7} y={149.7} cell={3.6} />
    <T x={140} y={197} s={5} c={C.s400} a="middle" f={MONO}>SCAN</T>
  </>
);

const changeOrder = (
  <>
    <Sheet />
    <Head title="CHANGE ORDER" no="#3" />
    <T x={12} y={60} s={6} c={C.s500}>Maple St. kitchen remodel</T>
    <T x={12} y={78} s={6.5} w={600} c={C.s700}>+ Pantry pull-outs (4)</T>
    <T x={158} y={78} s={6.8} w={800} c={C.em} a="end" f={MONO}>+$860.00</T>
    <T x={12} y={92} s={6.5} w={600} c={C.s700}>− Crown molding</T>
    <T x={158} y={92} s={6.8} w={800} c={C.red} a="end" f={MONO}>−$240.00</T>
    <Rule y={100} c={C.s300} />
    <T x={12} y={113} s={7} w={700} c={C.ink}>Net change</T>
    <T x={158} y={113} s={8.5} w={800} c={C.ink} a="end" f={MONO}>+$620.00</T>
    <rect x={12} y={122} width={40} height={13} rx={6.5} fill={C.amber100} />
    <T x={32} y={130.6} s={6} w={700} c={C.amber800} a="middle">+1 day</T>
    <rect x={57} y={122} width={70} height={13} rx={6.5} fill={C.s100} />
    <T x={92} y={130.6} s={6} w={600} c={C.s700} a="middle">New total $8,460</T>
    <Label x={12} y={158}>CLIENT SIGNATURE</Label>
    <Sig x={12} y={163} s={0.5} />
    <Rule y={186} w={80} c={C.s300} />
    <T x={12} y={195} s={5.5} c={C.s500}>Dana Whitfield · Nov 12</T>
    <rect x={116} y={180} width={42} height={14} rx={7} fill={C.emBg} />
    <T x={137} y={189.2} s={6} w={700} c={C.em} a="middle">Signed</T>
  </>
);

const expenseLog = (
  <>
    <Sheet />
    <Head title="EXPENSE LOG" no="Maple St." />
    {([
      ['Valley Supply', 'Materials', '184.20', C.brand],
      ['Fuel, truck 2', 'Vehicle', '62.75', C.amber],
      ['County landfill', 'Dump fee', '95.00', '#10b981'],
      ['Tile Depot', 'Materials', '410.00', C.brand],
    ] as const).map(([vendor, cat, amt, color], i) => {
      const y = 64 + i * 16;
      return (
        <g key={vendor}>
          <circle cx={15} cy={y - 2} r={2.4} fill={color} />
          <T x={21} y={y} s={6.3} w={600} c={C.s700}>{vendor}</T>
          <T x={21} y={y + 6.5} s={5} c={C.s400}>{cat}</T>
          <T x={158} y={y} s={6.2} w={700} c={C.s700} a="end" f={MONO}>{amt}</T>
        </g>
      );
    })}
    <Rule y={128} c={C.s300} />
    <T x={12} y={140} s={7} w={700} c={C.ink}>Total</T>
    <T x={158} y={140} s={8.5} w={800} c={C.ink} a="end">$751.95</T>
    <Label x={12} y={164}>RECEIPTS</Label>
    <T x={12} y={174} s={6.5} w={600} c={C.s700}>4 attached</T>
    <g transform="rotate(7 118 178)">
      <polygon points={zigzag(94, 146, 152, 200, 5)} fill="#ffffff" stroke={C.s300} strokeWidth={0.8} />
      <Bar x={100} y={160} w={30} h={3} />
      <Bar x={100} y={167} w={40} h={3} />
      <T x={120} y={183} s={6.5} w={700} c={C.s700} a="middle" f={MONO}>$62.75</T>
      <Bar x={106} y={189} w={28} h={2.5} />
      <rect x={110} y={149.5} width={18} height={2.8} rx={1} fill={C.s400} />
    </g>
  </>
);

const NOTE_LINES = Array.from({ length: 14 }, (_, i) => 46 + i * 12);
const note = (
  <>
    <Sheet fill="#fffbeb" stroke="#fde68a" />
    {NOTE_LINES.map((y) => <rect key={y} x={1.5} y={y} width={167} height={0.7} fill="#bfdbfe" />)}
    <rect x={24} y={1.5} width={0.9} height={217} fill="#fca5a5" />
    <T x={30} y={24} s={9} w={800} c={C.s700}>Site note</T>
    <T x={30} y={35} s={6} c={C.s500}>Nov 12 · Maple St.</T>
    <T x={30} y={56} s={8.2} c="#1e3a8a" f={SERIF} it>Dana wants matte black</T>
    <T x={30} y={68} s={8.2} c="#1e3a8a" f={SERIF} it>pulls on all uppers.</T>
    <T x={30} y={80} s={8.2} c="#1e3a8a" f={SERIF} it>Confirm finish by Fri.</T>
    <path d="M90 83.5q5 2.6 10 0t10 0 10 0" fill="none" stroke={C.amber} strokeWidth={1.3} strokeLinecap="round" />
    <T x={30} y={104} s={8.2} c="#1e3a8a" f={SERIF} it>– order 24 pulls</T>
    <T x={30} y={116} s={8.2} c="#1e3a8a" f={SERIF} it>– patch hallway wall</T>
    <path d="M136 6v24a5 5 0 0 0 10 0V9a3 3 0 0 0-6 0v18" fill="none" stroke={C.s400} strokeWidth={1.6} strokeLinecap="round" />
  </>
);

const invoice = (
  <>
    <Sheet />
    <Head title="INVOICE" no="#1042" />
    <Label x={12} y={62}>BILL TO</Label>
    <T x={12} y={71} s={7} w={700} c={C.s700}>Dana Whitfield</T>
    <Label x={158} y={62} a="end">DUE</Label>
    <T x={158} y={71} s={6.5} w={600} c={C.s700} a="end">Nov 26</T>
    <Rule y={80} h={1.2} c={C.brand} />
    {([[92, 70, '1,200.00'], [104, 56, '1,530.00'], [116, 84, '3,150.00'], [128, 62, '640.00']] as const).map(([y, w, a]) => (
      <g key={y}>
        <Bar x={12} y={y - 3.6} w={w} />
        <Amount y={y}>{a}</Amount>
      </g>
    ))}
    <Rule y={136} />
    {([[147, 'Subtotal', '6,520.00'], [156, 'Tax 8%', '521.60'], [165, 'Deposit', '−2,000.00']] as const).map(([y, k, v]) => (
      <g key={y}>
        <T x={82} y={y} s={5.5} c={C.s500}>{k}</T>
        <T x={158} y={y} s={5.5} c={C.s600} a="end" f={MONO}>{v}</T>
      </g>
    ))}
    <rect x={78} y={171} width={80} height={16} rx={3} fill={C.brand} />
    <T x={83} y={181.6} s={6} w={700} c="#ffffff">Balance</T>
    <T x={154} y={181.6} s={6.8} w={800} c="#ffffff" a="end" f={MONO}>$5,041.60</T>
    <Label x={12} y={197}>PROGRESS BILL 2 OF 3</Label>
    <T x={12} y={206} s={5.5} c={C.s400} it>Thank you for your business</T>
  </>
);

const receipt = (
  <>
    <polygon points={zigzag(24, 146, 4, 208, 6)} fill="#ffffff" stroke={C.s200} strokeWidth={1.5} strokeLinejoin="round" />
    <rect x={76.5} y={14} width={17} height={17} rx={4} fill={C.ink} />
    <T x={85} y={25.2} s={7} w={900} c="#fbbf24" a="middle">NR</T>
    <T x={85} y={43} s={6} w={700} c={C.s700} a="middle">Northline Renovations</T>
    <T x={85} y={57} s={8.5} w={800} c={C.brand} a="middle" ls={1.4}>RECEIPT</T>
    <T x={85} y={66} s={5.5} c={C.s500} a="middle" f={MONO}>#R-0457</T>
    <line x1={32} x2={138} y1={74} y2={74} stroke={C.s300} strokeWidth={0.8} strokeDasharray="2 2" />
    {([[86, 'Date', 'Nov 12, 2026'], [97, 'Method', 'Check #2231'], [108, 'Invoice', '#1042']] as const).map(([y, k, v]) => (
      <g key={y}>
        <T x={32} y={y} s={5.5} c={C.s500}>{k}</T>
        <T x={138} y={y} s={5.5} w={600} c={C.s700} a="end" f={MONO}>{v}</T>
      </g>
    ))}
    <line x1={32} x2={138} y1={116} y2={116} stroke={C.s300} strokeWidth={0.8} strokeDasharray="2 2" />
    <T x={85} y={135} s={13} w={800} c={C.ink} a="middle" f={MONO}>$2,000.00</T>
    <T x={85} y={146} s={5.5} w={700} c={C.em} a="middle" ls={1}>PAYMENT RECEIVED</T>
    <line x1={32} x2={138} y1={155} y2={155} stroke={C.s300} strokeWidth={0.8} strokeDasharray="2 2" />
    <T x={32} y={167} s={5.5} c={C.s500}>Balance</T>
    <T x={138} y={167} s={5.8} w={700} c={C.s700} a="end" f={MONO}>$5,041.60</T>
    <T x={85} y={190} s={7} c={C.s500} a="middle" f={SERIF} it>Thank you!</T>
  </>
);

const warranty = (
  <>
    <Sheet fill="#fffdf7" />
    <rect x={7} y={7} width={156} height={206} rx={2} fill="none" stroke={C.brand900} strokeWidth={1.4} />
    <rect x={11} y={11} width={148} height={198} rx={1.5} fill="none" stroke={C.amber} strokeWidth={0.6} />
    <T x={85} y={33} s={5.5} w={700} c={C.s500} a="middle" ls={1.6}>CERTIFICATE OF</T>
    <T x={85} y={52} s={16} w={700} c={C.brand900} a="middle" f={SERIF} ls={1.2}>WARRANTY</T>
    <T x={85} y={65} s={6.5} c={C.s600} a="middle" f={SERIF} it>2-year workmanship warranty</T>
    <Bar x={30} y={76} w={110} />
    <Bar x={38} y={84} w={94} />
    <Bar x={50} y={92} w={70} />
    <T x={85} y={107} s={5.5} c={C.s500} a="middle">214 Maple St. · Kitchen remodel</T>
    <polygon points="78,152 71,180 76.5,177 80.5,182 85,156" fill={C.brand700} />
    <polygon points="92,152 99,180 93.5,177 89.5,182 85,156" fill={C.brand700} />
    <polygon points={ROSETTE} fill={C.amber} />
    <circle cx={85} cy={140} r={13.5} fill="#d97706" />
    <circle cx={85} cy={140} r={11} fill="none" stroke="#fde68a" strokeWidth={0.7} strokeDasharray="1.6 1.2" />
    <T x={85} y={142.8} s={7.5} w={900} c="#ffffff" a="middle">2 YR</T>
    <Sig x={18} y={168} s={0.36} />
    <Rule x={18} y={188} w={46} c={C.s300} />
    <T x={18} y={197} s={5} c={C.s400}>Contractor</T>
    <T x={152} y={185} s={6} c={C.s600} a="end" f={MONO}>Nov 2026</T>
    <Rule x={106} y={188} w={46} c={C.s300} />
    <T x={152} y={197} s={5} c={C.s400} a="end">Date issued</T>
  </>
);

const PAPERS: Record<DocIconName, React.ReactNode> = {
  invoice,
  estimate,
  workOrder,
  changeOrder,
  purchaseOrder,
  dailyReport,
  timeSheet,
  materialLog,
  expenseLog,
  warranty,
  receipt,
  note,
};

/** A tiny, document-specific sheet of paper. Decorative: pair it with real text elsewhere. */
export const DocPaper: React.FC<{ id: DocIconName; className?: string; style?: React.CSSProperties }> = ({ id, className = '', style }) => (
  <svg viewBox="0 0 170 220" className={className} style={style} fontFamily={SANS} aria-hidden="true" focusable="false">
    {PAPERS[id]}
  </svg>
);

/** Soft paper shadow that follows the sheet's outline (works for the receipt's torn edge too). */
export const PAPER_SHADOW = '[filter:drop-shadow(0_1px_1px_rgba(16,24,40,.08))_drop-shadow(0_10px_14px_rgba(16,24,40,.14))]';

export default DocPaper;
