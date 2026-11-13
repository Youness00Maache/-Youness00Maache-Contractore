import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { InventoryItem, UserProfile } from '../types.ts';
import { PrinterIcon } from './Icons.tsx';
import { Field, InlineError, Modal, NumberInput } from './viewKit.tsx';
import { LABEL_SHEETS, getSheet, labelsPerSheet, placeLabels, toInches, type LabelSheet } from '../utils/labelSheets.ts';
import { esc, safeUrl } from '../utils/escapeHtml.ts';
import { LABEL_SHEET_LOCAL_KEY } from '../lib/userDataSync.ts';
import { saveLabelSheetToAccount } from '../lib/userData.ts';

interface PrintTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The item to print (kept for backward compatibility). */
  item: InventoryItem;
  /** Several items: one block of labels per item. Overrides `item` when given. */
  items?: InventoryItem[];
  userProfile?: UserProfile;
}

/** Device copy of the chosen label sheet; the account copy is user_settings 'labels.sheet' (lib/userData.ts). */
const SHEET_KEY = LABEL_SHEET_LOCAL_KEY;
const MAX_LABELS = 2000;

/** What the QR encodes: a link that opens the item in the app (phone cameras can open it directly). */
export const inventoryItemLink = (id: string) => `${window.location.origin}/inventory?item=${encodeURIComponent(id)}`;

interface LabelOptions {
  showName: boolean;
  showDetails: boolean;
  showCompany: boolean;
  showLogo: boolean;
}

/** Font sizes (pt) and paddings (in) derived from the label height so every sheet looks balanced. */
const labelMetrics = (sheet: LabelSheet) => {
  const hIn = toInches(sheet, sheet.labelHeight);
  const wIn = toInches(sheet, sheet.labelWidth);
  const pad = Math.min(0.1, hIn * 0.09);
  const qr = Math.min(hIn - pad * 2, wIn * 0.46);
  const name = Math.min(16, 5.5 + 3.8 * hIn);
  return { hIn, wIn, pad, qr, gap: pad, name, meta: name * 0.78, company: name * 0.7, logo: hIn * 0.2 };
};

const detailsLine = (item: InventoryItem) => [item.category, item.location].filter(Boolean).join(' · ');

const buildPrintHtml = (
  sheet: LabelSheet,
  labels: InventoryItem[],
  startSlot: number,
  qrMarkup: Map<string, string>,
  opts: LabelOptions & { outlines: boolean },
  company: { name: string; logo: string },
) => {
  const u = sheet.unit;
  const m = labelMetrics(sheet);
  const pages = placeLabels(sheet, labels.length, startSlot);
  const logo = opts.showLogo ? safeUrl(company.logo) : '';
  const pageHtml = pages.map((pg) => {
    const cells = pg.labels.map((l) => {
      const it = labels[l.index];
      const details = detailsLine(it);
      return `<div class="label" style="left:${l.x}${u};top:${l.y}${u};width:${l.width}${u};height:${l.height}${u}">`
        + `<div class="qr">${qrMarkup.get(it.id) || ''}</div>`
        + '<div class="text">'
        + (logo ? `<img class="logo" src="${logo}" alt="">` : '')
        + (opts.showName ? `<div class="name">${esc(it.name)}</div>` : '')
        + (opts.showDetails && details ? `<div class="meta">${esc(details)}</div>` : '')
        + (opts.showCompany && company.name ? `<div class="company">${esc(company.name)}</div>` : '')
        + '</div></div>';
    }).join('');
    return `<section class="page">${cells}</section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Inventory labels</title><style>
@page { size: ${sheet.pageSize} portrait; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { position: relative; width: ${sheet.pageWidth}${u}; height: ${sheet.pageHeight}${u}; overflow: hidden; break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.label { position: absolute; display: flex; align-items: center; gap: ${m.gap}in; padding: ${m.pad}in; overflow: hidden; border-radius: ${sheet.cornerRadius}${u}; ${opts.outlines ? 'outline: 0.5pt dashed #999; outline-offset: -0.5pt;' : ''} }
.qr { flex: 0 0 auto; width: ${m.qr}in; height: ${m.qr}in; }
.qr svg { display: block; width: 100%; height: 100%; }
.text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 0.02in; }
.logo { max-height: ${m.logo}in; max-width: 100%; object-fit: contain; align-self: flex-start; margin-bottom: 0.02in; }
.name { font-weight: 700; font-size: ${m.name.toFixed(1)}pt; line-height: 1.12; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
.meta { font-size: ${m.meta.toFixed(1)}pt; line-height: 1.2; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.company { font-size: ${m.company.toFixed(1)}pt; line-height: 1.2; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media screen { body { background: #e5e7eb; padding: 16px 0; } .page { background: #fff; margin: 0 auto 16px; box-shadow: 0 1px 4px rgba(0,0,0,.2); } }
</style></head><body>${pageHtml}</body></html>`;
};

/** Prints an HTML document through a hidden iframe so ONLY the labels are printed (VIEW-025). */
const printThroughIframe = (html: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'Label print preview');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!win || !doc) {
      iframe.remove();
      reject(new Error('Printing is not available in this browser.'));
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    let printed = false;
    const remove = () => window.setTimeout(() => iframe.remove(), 500);
    const go = () => {
      if (printed) return;
      printed = true;
      try {
        win.addEventListener('afterprint', remove);
        win.focus();
        win.print();
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        window.setTimeout(() => iframe.remove(), 120_000);
      }
    };
    const pendingImages = Array.from(doc.images).filter((img) => !img.complete);
    if (!pendingImages.length) {
      window.setTimeout(go, 60);
    } else {
      let left = pendingImages.length;
      const one = () => { left -= 1; if (left <= 0) go(); };
      pendingImages.forEach((img) => { img.addEventListener('load', one); img.addEventListener('error', one); });
      window.setTimeout(go, 3000);
    }
  });

const PrintTagsModal: React.FC<PrintTagsModalProps> = ({ isOpen, onClose, item, items, userProfile }) => {
  const list = useMemo(() => (items && items.length ? items : item ? [item] : []), [items, item]);
  const single = list.length === 1;
  const [sheetId, setSheetId] = useState<string>(() => {
    try { return localStorage.getItem(SHEET_KEY) || LABEL_SHEETS[0].id; } catch { return LABEL_SHEETS[0].id; }
  });
  const sheet = getSheet(sheetId);
  const perSheet = labelsPerSheet(sheet);
  const [startPos, setStartPos] = useState(1);
  const [copies, setCopies] = useState<number>(() => (single ? perSheet : 1));
  const [opts, setOpts] = useState<LabelOptions>({ showName: true, showDetails: true, showCompany: !!userProfile?.companyName, showLogo: false });
  const [outlines, setOutlines] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrRefs = useRef(new Map<string, HTMLDivElement | null>());

  useEffect(() => {
    try { localStorage.setItem(SHEET_KEY, sheetId); } catch { /* private mode */ }
    setStartPos((p) => Math.min(p, perSheet));
    if (single) setCopies(perSheet);
  }, [sheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const perItem = Math.max(1, Math.floor(copies || 1));
  const total = Math.min(MAX_LABELS, list.length * perItem);
  const labels = useMemo(() => {
    const out: InventoryItem[] = [];
    for (const it of list) for (let i = 0; i < perItem && out.length < MAX_LABELS; i++) out.push(it);
    return out;
  }, [list, perItem]);
  const pages = useMemo(() => placeLabels(sheet, labels.length, startPos - 1), [sheet, labels.length, startPos]);
  const firstPageSlots = new Set(pages[0]?.labels.map((l) => l.slot) ?? []);

  const company = { name: userProfile?.companyName || '', logo: userProfile?.logoUrl || '' };
  const preview = list[0];
  const m = labelMetrics(sheet);
  const pxPerIn = 260 / m.wIn;

  const handlePrint = async () => {
    setError(null);
    if (!labels.length) { setError('Nothing to print.'); return; }
    const markup = new Map<string, string>();
    for (const it of list) markup.set(it.id, qrRefs.current.get(it.id)?.innerHTML || '');
    if (Array.from(markup.values()).some((v) => !v)) { setError('The QR codes are still being prepared. Try again in a second.'); return; }
    setPrinting(true);
    try {
      await printThroughIframe(buildPrintHtml(sheet, labels, startPos - 1, markup, { ...opts, outlines }, company));
    } catch (e: any) {
      setError(e?.message || 'Printing failed.');
    } finally {
      setPrinting(false);
    }
  };

  const toggle = (k: keyof LabelOptions) => setOpts((o) => ({ ...o, [k]: !o[k] }));

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      busy={printing}
      size="lg"
      title={single ? `Print labels · ${list[0]?.name ?? ''}` : `Print labels · ${list.length} items`}
      description="Prints only the labels, positioned for the sheet you choose."
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={printing}>Close</button>
          <button type="button" className="btn btn-primary" onClick={handlePrint} disabled={printing || !labels.length}>
            <PrinterIcon className="h-4 w-4" /> {printing ? 'Opening print dialog…' : `Print ${total} label${total === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          {error && <InlineError>{error}</InlineError>}
          <Field label="Label sheet" htmlFor="lbl-sheet" hint={sheet.description}>
            <select id="lbl-sheet" className="input" value={sheetId} onChange={(e) => { setSheetId(e.target.value); void saveLabelSheetToAccount(e.target.value); }}>
              {LABEL_SHEETS.map((s) => <option key={s.id} value={s.id}>{s.name} ({labelsPerSheet(s)}/sheet)</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={single ? 'Number of labels' : 'Labels per item'} htmlFor="lbl-copies">
              <NumberInput id="lbl-copies" value={copies} onValue={(n) => setCopies(Math.max(1, Math.min(MAX_LABELS, Math.floor(n))))} />
            </Field>
            <Field label="Start at label #" htmlFor="lbl-start" hint="Reuse a partly used sheet.">
              <NumberInput id="lbl-start" value={startPos} onValue={(n) => setStartPos(Math.max(1, Math.min(perSheet, Math.floor(n) || 1)))} />
            </Field>
          </div>
          <fieldset className="space-y-2 rounded-2xl border border-border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On each label</legend>
            {([
              ['showName', 'Item name'],
              ['showDetails', 'Category and location'],
              ['showCompany', 'Company name'],
              ['showLogo', 'Company logo'],
            ] as [keyof LabelOptions, string][]).map(([k, label]) => (
              <label key={k} className="flex min-h-[40px] cursor-pointer items-center justify-between gap-3 text-sm">
                <span>{label}</span>
                <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={opts[k]} onChange={() => toggle(k)} disabled={(k === 'showLogo' && !company.logo) || (k === 'showCompany' && !company.name)} />
              </label>
            ))}
            <label className="flex min-h-[40px] cursor-pointer items-center justify-between gap-3 border-t border-border pt-2 text-sm">
              <span>Outline labels <span className="text-muted-foreground">(test print on plain paper)</span></span>
              <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={outlines} onChange={() => setOutlines((v) => !v)} />
            </label>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            In the print dialog choose <strong>Scale: 100% / Actual size</strong> and <strong>Margins: None</strong>, and the paper size {sheet.pageSize === 'A4' ? 'A4' : 'Letter'}.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="label">Label preview</div>
            {preview && (
              <div className="flex justify-center rounded-2xl bg-muted p-4">
                <div
                  className="flex items-center overflow-hidden bg-white text-black shadow-soft ring-1 ring-black/10"
                  style={{ width: m.wIn * pxPerIn, height: m.hIn * pxPerIn, padding: m.pad * pxPerIn, gap: m.gap * pxPerIn, borderRadius: toInches(sheet, sheet.cornerRadius) * pxPerIn }}
                >
                  <QRCodeSVG value={inventoryItemLink(preview.id)} size={Math.round(m.qr * pxPerIn)} level="M" marginSize={0} style={{ flex: '0 0 auto' }} />
                  <div className="min-w-0 flex-1" style={{ lineHeight: 1.15 }}>
                    {opts.showLogo && company.logo && <img src={company.logo} alt="" style={{ maxHeight: m.logo * pxPerIn, maxWidth: '100%', objectFit: 'contain' }} />}
                    {opts.showName && <div className="font-bold" style={{ fontSize: (m.name / 72) * pxPerIn, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{preview.name}</div>}
                    {opts.showDetails && detailsLine(preview) && <div className="truncate" style={{ fontSize: (m.meta / 72) * pxPerIn, color: '#333' }}>{detailsLine(preview)}</div>}
                    {opts.showCompany && company.name && <div className="truncate" style={{ fontSize: (m.company / 72) * pxPerIn, color: '#555' }}>{company.name}</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <div className="label flex items-center justify-between">
              <span>Sheet 1 of {Math.max(1, pages.length)}</span>
              <span className="normal-case tracking-normal">Tap a label to start there</span>
            </div>
            <div
              className="mx-auto grid gap-[3px] rounded-xl border border-border bg-white p-2"
              style={{ gridTemplateColumns: `repeat(${sheet.columns}, minmax(0, 1fr))`, maxWidth: sheet.columns <= 2 ? 200 : 240 }}
            >
              {Array.from({ length: perSheet }).map((_, slot) => {
                const used = slot < startPos - 1;
                const filled = firstPageSlots.has(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setStartPos(slot + 1)}
                    aria-label={`Start at label ${slot + 1}`}
                    className={`rounded-[3px] border transition ${filled ? 'border-primary bg-primary/70' : used ? 'border-gray-300 bg-gray-200' : 'border-gray-300 bg-white hover:bg-primary/10'}`}
                    style={{ aspectRatio: `${sheet.labelWidth} / ${sheet.labelHeight}` }}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">{total} label{total === 1 ? '' : 's'} on {pages.length} sheet{pages.length === 1 ? '' : 's'}{total >= MAX_LABELS ? ` (limited to ${MAX_LABELS})` : ''}</p>
          </div>
        </div>
      </div>

      {/* Off-screen QR codes used to build the print document */}
      <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
        {list.map((it) => (
          <div key={it.id} ref={(el) => { qrRefs.current.set(it.id, el); }}>
            <QRCodeSVG value={inventoryItemLink(it.id)} size={256} level="M" marginSize={0} />
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default PrintTagsModal;
