/**
 * Pure calendar layout for CalendarView (owned by VIEWS).
 * Jobs carry business dates ("YYYY-MM-DD"); every computation here is on LOCAL calendar days,
 * so a job dated the 10th is drawn on the 10th in every time zone (VIEW-035).
 */
import { addDaysLocal, daysBetween, endOfMonthLocal, normalizeYMD, parseLocalDate, startOfMonthLocal, startOfWeekLocal, toLocalYMD } from './localDates.ts';

export interface SpanInput {
  id: string;
  startDate?: string | null;
  endDate?: string | null;
}

/** A job reduced to an inclusive local-day span. */
export interface DaySpan<T = unknown> {
  id: string;
  startYMD: string;
  endYMD: string;
  /** inclusive number of days */
  days: number;
  item: T;
}

/** Converts a job to an inclusive day span. Null start → not scheduled (returns null). End before start → single day. */
export const toDaySpan = <T extends SpanInput>(job: T): DaySpan<T> | null => {
  const start = parseLocalDate(job.startDate);
  if (!start) return null;
  let end = parseLocalDate(job.endDate) ?? start;
  if (end < start) end = start;
  return { id: job.id, startYMD: toLocalYMD(start), endYMD: toLocalYMD(end), days: daysBetween(start, end) + 1, item: job };
};

export const spansFor = <T extends SpanInput>(jobs: T[]): DaySpan<T>[] =>
  jobs.map((j) => toDaySpan(j)).filter((s): s is DaySpan<T> => s !== null);

export const spanCoversDay = (span: DaySpan, ymd: string) => span.startYMD <= ymd && span.endYMD >= ymd;

export const spansOnDay = <T>(spans: DaySpan<T>[], ymd: string): DaySpan<T>[] =>
  spans
    .filter((s) => spanCoversDay(s, ymd))
    .sort((a, b) => (a.startYMD === b.startYMD ? b.days - a.days : a.startYMD < b.startYMD ? -1 : 1));

/** The weeks (rows of 7 local days) shown for a month view. */
export const monthGrid = (monthDate: Date, weekStartsOn = 0): Date[][] => {
  const first = startOfMonthLocal(monthDate);
  const last = endOfMonthLocal(monthDate);
  let cur = startOfWeekLocal(first, weekStartsOn);
  const weeks: Date[][] = [];
  while (cur <= last) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) week.push(addDaysLocal(cur, i));
    weeks.push(week);
    cur = addDaysLocal(cur, 7);
  }
  return weeks;
};

export const weekDays = (anyDay: Date, weekStartsOn = 0): Date[] => {
  const s = startOfWeekLocal(anyDay, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDaysLocal(s, i));
};

export interface WeekSegment<T = unknown> {
  span: DaySpan<T>;
  /** 0..6 */
  startCol: number;
  /** 0..6, inclusive */
  endCol: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface WeekLayout<T = unknown> {
  segments: WeekSegment<T>[];
  /** segments hidden because they fall in a lane >= maxLanes, counted per column */
  hiddenPerDay: number[];
  lanesUsed: number;
}

/**
 * Lays out multi-day bars inside one week row (greedy lane packing, longest/earliest first).
 * Only lanes < maxLanes are returned as visible segments; the rest are counted in hiddenPerDay.
 */
export const layoutWeek = <T>(week: Date[], spans: DaySpan<T>[], maxLanes = 3): WeekLayout<T> => {
  const weekStart = toLocalYMD(week[0]);
  const weekEnd = toLocalYMD(week[6]);
  const colOf = (ymd: string) => {
    const d = parseLocalDate(ymd)!;
    return daysBetween(week[0], d);
  };
  const overlapping = spans
    .filter((s) => s.startYMD <= weekEnd && s.endYMD >= weekStart)
    .map((span) => {
      const startCol = span.startYMD < weekStart ? 0 : colOf(span.startYMD);
      const endCol = span.endYMD > weekEnd ? 6 : colOf(span.endYMD);
      return { span, startCol, endCol, continuesBefore: span.startYMD < weekStart, continuesAfter: span.endYMD > weekEnd };
    })
    .sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol) || a.span.id.localeCompare(b.span.id));

  const laneEnds: number[] = []; // last occupied column per lane
  const segments: WeekSegment<T>[] = [];
  const hiddenPerDay = [0, 0, 0, 0, 0, 0, 0];
  for (const seg of overlapping) {
    let lane = laneEnds.findIndex((end) => end < seg.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.endCol);
    } else {
      laneEnds[lane] = seg.endCol;
    }
    if (lane < maxLanes) segments.push({ ...seg, lane });
    else for (let c = seg.startCol; c <= seg.endCol; c++) hiddenPerDay[c] += 1;
  }
  return { segments, hiddenPerDay, lanesUsed: Math.min(laneEnds.length, maxLanes) };
};

/** Jobs overlapping [fromYMD, toYMD], sorted by start date then name-ish id. */
export const spansInRange = <T>(spans: DaySpan<T>[], fromYMD: string, toYMD: string): DaySpan<T>[] =>
  spans
    .filter((s) => s.startYMD <= toYMD && s.endYMD >= fromYMD)
    .sort((a, b) => (a.startYMD === b.startYMD ? a.id.localeCompare(b.id) : a.startYMD < b.startYMD ? -1 : 1));

export interface AgendaGroup<T = unknown> {
  /** "YYYY-MM-DD", or "ongoing" for jobs that started before the range */
  key: string;
  spans: DaySpan<T>[];
}

/** Agenda: jobs grouped by their start day; jobs that began before the range go in an "ongoing" group first. */
export const agendaGroups = <T>(spans: DaySpan<T>[], fromYMD: string, toYMD: string): AgendaGroup<T>[] => {
  const groups = new Map<string, DaySpan<T>[]>();
  for (const s of spansInRange(spans, fromYMD, toYMD)) {
    const key = s.startYMD < fromYMD ? 'ongoing' : s.startYMD;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a === 'ongoing' ? -1 : b === 'ongoing' ? 1 : a < b ? -1 : 1))
    .map(([key, list]) => ({ key, spans: list }));
};

export interface ScheduleStats {
  active: number;
  upcoming: number;
  completed: number;
  unscheduled: number;
}

export const scheduleStats = <T extends SpanInput & { status?: string | null }>(jobs: T[], todayYMD: string): ScheduleStats => {
  let active = 0, upcoming = 0, completed = 0, unscheduled = 0;
  for (const j of jobs) {
    if (j.status === 'active') active++;
    if (j.status === 'completed') completed++;
    const start = normalizeYMD(j.startDate);
    if (!start) unscheduled++;
    else if (start > todayYMD && j.status !== 'completed') upcoming++;
  }
  return { active, upcoming, completed, unscheduled };
};
