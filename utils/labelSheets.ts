/**
 * Label sheet geometry for PrintTagsModal (owned by VIEWS).
 * Values are the manufacturers' published layouts. Units are the sheet's own unit (inches or mm),
 * and the printed page must be printed at 100% scale with no margins for the labels to line up.
 */

export type SheetUnit = 'in' | 'mm';

export interface LabelSheet {
  id: string;
  name: string;
  description: string;
  unit: SheetUnit;
  pageWidth: number;
  pageHeight: number;
  /** CSS @page size keyword */
  pageSize: 'letter' | 'A4';
  columns: number;
  rows: number;
  labelWidth: number;
  labelHeight: number;
  /** distance from the page's top edge to the first label's top edge */
  marginTop: number;
  /** distance from the page's left edge to the first label's left edge */
  marginLeft: number;
  /** horizontal distance between the left edges of two neighbouring labels */
  pitchX: number;
  /** vertical distance between the top edges of two neighbouring labels */
  pitchY: number;
  cornerRadius: number;
}

export const LABEL_SHEETS: LabelSheet[] = [
  {
    id: 'avery-5160',
    name: 'Avery 5160 / 8160',
    description: '30 per sheet · 1" × 2⅝" · US Letter',
    unit: 'in', pageWidth: 8.5, pageHeight: 11, pageSize: 'letter',
    columns: 3, rows: 10, labelWidth: 2.625, labelHeight: 1,
    marginTop: 0.5, marginLeft: 0.1875, pitchX: 2.75, pitchY: 1, cornerRadius: 0.0625,
  },
  {
    id: 'avery-5163',
    name: 'Avery 5163 / 8163',
    description: '10 per sheet · 2" × 4" · US Letter',
    unit: 'in', pageWidth: 8.5, pageHeight: 11, pageSize: 'letter',
    columns: 2, rows: 5, labelWidth: 4, labelHeight: 2,
    marginTop: 0.5, marginLeft: 0.15625, pitchX: 4.1875, pitchY: 2, cornerRadius: 0.125,
  },
  {
    id: 'avery-5164',
    name: 'Avery 5164 / 8164',
    description: '6 per sheet · 3⅓" × 4" · US Letter',
    unit: 'in', pageWidth: 8.5, pageHeight: 11, pageSize: 'letter',
    columns: 2, rows: 3, labelWidth: 4, labelHeight: 3.3333,
    marginTop: 0.5, marginLeft: 0.15625, pitchX: 4.1875, pitchY: 3.3333, cornerRadius: 0.125,
  },
  {
    id: 'avery-l7160',
    name: 'Avery L7160',
    description: '21 per sheet · 63.5 × 38.1 mm · A4',
    unit: 'mm', pageWidth: 210, pageHeight: 297, pageSize: 'A4',
    columns: 3, rows: 7, labelWidth: 63.5, labelHeight: 38.1,
    marginTop: 15.15, marginLeft: 7.21, pitchX: 66.04, pitchY: 38.1, cornerRadius: 2.5,
  },
  {
    id: 'avery-l7163',
    name: 'Avery L7163',
    description: '14 per sheet · 99.1 × 38.1 mm · A4',
    unit: 'mm', pageWidth: 210, pageHeight: 297, pageSize: 'A4',
    columns: 2, rows: 7, labelWidth: 99.1, labelHeight: 38.1,
    marginTop: 15.15, marginLeft: 4.65, pitchX: 101.6, pitchY: 38.1, cornerRadius: 2.5,
  },
  {
    // The original app's only layout (old PrintTagsModal): 10 mm page padding, 3 columns of 60 × 25.4 mm
    // labels with a 7 mm column gap and no row gap.
    id: 'a4-30',
    name: 'A4 30 per sheet',
    description: '30 per sheet · 60 × 25.4 mm · A4',
    unit: 'mm', pageWidth: 210, pageHeight: 297, pageSize: 'A4',
    columns: 3, rows: 10, labelWidth: 60, labelHeight: 25.4,
    marginTop: 10, marginLeft: 10, pitchX: 67, pitchY: 25.4, cornerRadius: 0,
  },
];

export const getSheet = (id: string): LabelSheet => LABEL_SHEETS.find((s) => s.id === id) ?? LABEL_SHEETS[0];

export const labelsPerSheet = (sheet: LabelSheet) => sheet.columns * sheet.rows;

export interface PlacedLabel {
  /** index into the caller's label list */
  index: number;
  /** 0-based slot on the page (row-major) */
  slot: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedPage {
  labels: PlacedLabel[];
}

/** Position of a slot (row-major) on a sheet, in sheet units. */
export const slotPosition = (sheet: LabelSheet, slot: number) => {
  const row = Math.floor(slot / sheet.columns);
  const col = slot % sheet.columns;
  return {
    row,
    col,
    x: round(sheet.marginLeft + col * sheet.pitchX),
    y: round(sheet.marginTop + row * sheet.pitchY),
  };
};

const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Places `count` labels starting at slot `startSlot` (0-based, lets users reuse a partly used sheet).
 * Subsequent pages start at slot 0.
 */
export const placeLabels = (sheet: LabelSheet, count: number, startSlot = 0): PlacedPage[] => {
  const perPage = labelsPerSheet(sheet);
  const first = Math.min(Math.max(0, Math.floor(startSlot)), perPage - 1);
  const pages: PlacedPage[] = [];
  let slot = first;
  let page: PlacedPage = { labels: [] };
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    if (slot >= perPage) {
      pages.push(page);
      page = { labels: [] };
      slot = 0;
    }
    const pos = slotPosition(sheet, slot);
    page.labels.push({ index: i, slot, ...pos, width: sheet.labelWidth, height: sheet.labelHeight });
    slot++;
  }
  if (page.labels.length) pages.push(page);
  return pages;
};

/** Sanity check used by tests: every label must lie inside the page. */
export const sheetFitsPage = (sheet: LabelSheet): boolean => {
  const last = slotPosition(sheet, labelsPerSheet(sheet) - 1);
  const right = last.x + sheet.labelWidth;
  const bottom = last.y + sheet.labelHeight;
  return sheet.marginLeft >= 0 && sheet.marginTop >= 0 && right <= sheet.pageWidth + 1e-6 && bottom <= sheet.pageHeight + 1e-6;
};

/** Converts a length in sheet units to inches (for scaling fonts and QR sizes). */
export const toInches = (sheet: LabelSheet, value: number) => (sheet.unit === 'in' ? value : value / 25.4);
