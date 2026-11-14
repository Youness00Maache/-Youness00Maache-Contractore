import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { isOffline, isOfflineFailure } from '../lib/offline/deviceCache.ts';
import { pendingEntityItems } from '../lib/offline/offlineEntities.ts';

/** Jobs created offline that haven't reached the account yet. */
const pendingJobIds = () => new Set(pendingEntityItems('job').filter((i) => i.kind === 'create').map((i) => i.docId));
import type { Job } from '../types.ts';
import { BriefcaseIcon, CalendarIcon, MapPinIcon, PlusIcon, UserIcon } from './Icons.tsx';
import { ChevronLeftIcon, ChevronRightIcon, EmptyState, InlineError, PageHeader, Segmented, fetchAllPages, friendlyError, getCurrentUserId, useIsMobile } from './viewKit.tsx';
import { agendaGroups, layoutWeek, monthGrid, scheduleStats, spansFor, spansInRange, spansOnDay, weekDays, type DaySpan } from '../utils/calendarLayout.ts';
import { addDaysLocal, addMonthsClamped, daysBetween, endOfMonthLocal, formatYMD, parseLocalDate, startOfMonthLocal, toLocalYMD, todayYMD } from '../utils/localDates.ts';

interface CalendarViewProps {
  /** Optional seed for the first paint; the view loads all jobs itself. */
  jobs?: Job[];
  onBack: () => void;
  onNavigateJob: (jobId: string) => void;
  onNewJob: () => void;
  /** Create a job starting on a given local day ("YYYY-MM-DD"). Falls back to onNewJob. */
  onNewJobOnDate?: (ymd: string) => void;
}

interface CalJob {
  id: string;
  name: string;
  clientName?: string;
  clientAddress?: string;
  startDate?: string | null;
  endDate?: string | null;
  status: Job['status'] | string;
  workerName?: string;
}

type ViewKey = 'month' | 'week' | 'list';
const WEEK_STARTS_ON = 0;
const MAX_LANES = 3;

const STATUS_STYLE: Record<string, { bar: string; dot: string; badge: string; label: string }> = {
  active: { bar: 'bg-primary text-primary-foreground', dot: 'bg-primary', badge: 'badge-primary', label: 'Active' },
  paused: { bar: 'bg-warning text-warning-foreground', dot: 'bg-warning', badge: 'badge-warning', label: 'Paused' },
  completed: { bar: 'bg-success text-success-foreground', dot: 'bg-success', badge: 'badge-success', label: 'Completed' },
  inactive: { bar: 'bg-muted-foreground/70 text-background', dot: 'bg-muted-foreground', badge: 'badge-muted', label: 'Inactive' },
};
const styleFor = (status: string) => STATUS_STYLE[status] || STATUS_STYLE.inactive;

const fromJob = (j: Job): CalJob => ({ id: j.id, name: j.name, clientName: j.clientName, clientAddress: j.clientAddress, startDate: j.startDate, endDate: j.endDate, status: j.status, workerName: j.workerName });
const fromRow = (r: any): CalJob => ({
  id: r.id, name: r.name || 'Untitled job', clientName: r.client_name || '', clientAddress: r.client_address || '',
  startDate: r.start_date ?? null, endDate: r.end_date ?? null, status: r.status || 'active', workerName: r.worker_name || undefined,
});

const dayHeading = (ymd: string) => {
  const today = todayYMD();
  const tomorrow = toLocalYMD(addDaysLocal(parseLocalDate(today)!, 1));
  const base = formatYMD(ymd, { weekday: 'long', month: 'long', day: 'numeric' });
  if (ymd === today) return `Today · ${base}`;
  if (ymd === tomorrow) return `Tomorrow · ${base}`;
  return formatYMD(ymd, { weekday: 'long', month: 'long', day: 'numeric', year: ymd.slice(0, 4) !== today.slice(0, 4) ? 'numeric' : undefined });
};

const rangeText = (s: DaySpan<CalJob>) =>
  s.days === 1 ? formatYMD(s.startYMD, { month: 'short', day: 'numeric' }) : `${formatYMD(s.startYMD, { month: 'short', day: 'numeric' })} – ${formatYMD(s.endYMD, { month: 'short', day: 'numeric' })} · ${s.days} days`;

const CalendarView: React.FC<CalendarViewProps> = ({ jobs: seed = [], onBack, onNavigateJob, onNewJob, onNewJobOnDate }) => {
  const isMobile = useIsMobile();
  const [jobs, setJobs] = useState<CalJob[]>(() => seed.map(fromJob));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** showing the app's own jobs (offline) instead of the account's list */
  const [offlineView, setOfflineView] = useState(false);
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const [view, setView] = useState<ViewKey>(() => (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? 'list' : 'month'));
  const [anchor, setAnchor] = useState<Date>(() => parseLocalDate(todayYMD())!);
  const [selected, setSelected] = useState<string | null>(todayYMD());
  const [showUnscheduled, setShowUnscheduled] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const uid = await getCurrentUserId();
    const run = (cols: string) => fetchAllPages<any>((from, to) => {
      let q = supabase.from('jobs').select(cols).order('start_date', { ascending: true, nullsFirst: false }).range(from, to);
      if (uid) q = q.eq('user_id', uid);
      return q;
    });
    if (isOffline()) {
      // offline (also after a reload): the app's jobs, i.e. this device's copy + the ones created offline
      setOfflineView(true);
      setJobs(seedRef.current.map(fromJob));
      setLoading(false);
      return;
    }
    let res = await run('id,name,client_name,client_address,start_date,end_date,status,worker_name');
    if (res.error && (res.error.code === '42703' || /does not exist/i.test(res.error.message || ''))) res = await run('*');
    if (res.error && isOfflineFailure(res.error)) { setOfflineView(true); setJobs(seedRef.current.map(fromJob)); }
    else if (res.error) setError(friendlyError(res.error, 'Could not load your jobs.'));
    else {
      setOfflineView(false);
      // jobs created offline that haven't synced yet stay on the calendar
      const loaded = res.rows.map(fromRow);
      const ids = new Set(loaded.map((j) => j.id));
      setJobs([...loaded, ...seedRef.current.filter((j) => !ids.has(j.id) && pendingJobIds().has(j.id)).map(fromJob)]);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // offline: follow the app's list (a job created or rescheduled offline shows at once); back online: reload
  useEffect(() => { if (offlineView) setJobs(seed.map(fromJob)); }, [seed, offlineView]);
  useEffect(() => {
    const onOnline = () => { void load(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load]);

  const spans = useMemo(() => spansFor(jobs), [jobs]);
  const today = todayYMD();
  const stats = useMemo(() => scheduleStats(jobs, today), [jobs, today]);
  const unscheduled = useMemo(() => jobs.filter((j) => !parseLocalDate(j.startDate)), [jobs]);

  const newJobOn = (ymd?: string | null) => {
    if (ymd && onNewJobOnDate) onNewJobOnDate(ymd);
    else onNewJob();
  };

  // ---- navigation
  const step = (dir: -1 | 1) => {
    setAnchor((a) => (view === 'week' ? addDaysLocal(a, 7 * dir) : addMonthsClamped(startOfMonthLocal(a), dir)));
  };
  const goToday = () => { const t = parseLocalDate(today)!; setAnchor(t); setSelected(today); };

  const title = useMemo(() => {
    if (view === 'week') {
      const days = weekDays(anchor, WEEK_STARTS_ON);
      const a = days[0];
      const b = days[6];
      const sameMonth = a.getMonth() === b.getMonth();
      return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, sameMonth ? { day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [anchor, view]);

  const weeks = useMemo(() => monthGrid(anchor, WEEK_STARTS_ON), [anchor]);
  const weekdayNames = useMemo(() => weeks[0].map((d) => d.toLocaleDateString(undefined, { weekday: isMobile ? 'narrow' : 'short' })), [weeks, isMobile]);
  const monthStart = toLocalYMD(startOfMonthLocal(anchor));
  const monthEnd = toLocalYMD(endOfMonthLocal(anchor));
  const selectedSpans = selected ? spansOnDay(spans, selected) : [];

  // ---- pieces
  const jobRow = (span: DaySpan<CalJob>, context?: string) => {
    const j = span.item;
    const st = styleFor(String(j.status));
    return (
      <button key={j.id} type="button" onClick={() => onNavigateJob(j.id)} className="card flex w-full items-start gap-3 p-3 text-left transition hover:border-primary/40 hover:shadow-card">
        <span className={`mt-1 h-10 w-1.5 shrink-0 rounded-full ${st.dot}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="truncate font-semibold text-foreground">{j.name}</span>
            <span className={`badge ${st.badge} shrink-0`}>{st.label}</span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">{[j.clientName, context || rangeText(span)].filter(Boolean).join(' · ')}</span>
          {(j.workerName || j.clientAddress) && (
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {j.workerName && <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" />{j.workerName}</span>}
              {j.clientAddress && <span className="inline-flex min-w-0 items-center gap-1"><MapPinIcon className="h-3 w-3 shrink-0" /><span className="truncate">{j.clientAddress}</span></span>}
            </span>
          )}
        </span>
      </button>
    );
  };

  const dayPanel = () => (
    selected ? (
      <section className="card card-pad" aria-live="polite">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">{dayHeading(selected)}</h2>
          <button type="button" className="btn btn-outline btn-sm h-10" onClick={() => newJobOn(selected)}><PlusIcon className="h-4 w-4" /> New job on this day</button>
        </div>
        {selectedSpans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs scheduled.</p>
        ) : (
          <div className="space-y-2">
            {selectedSpans.map((s) => {
              const dayIndex = daysBetween(parseLocalDate(s.startYMD)!, parseLocalDate(selected)!) + 1;
              return jobRow(s, s.days > 1 ? `Day ${Math.min(dayIndex, s.days)} of ${s.days}` : undefined);
            })}
          </div>
        )}
      </section>
    ) : null
  );

  const legend = () => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {Object.entries(STATUS_STYLE).map(([k, s]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${s.dot}`} />{s.label}</span>)}
    </div>
  );

  // ---- month (desktop: spanning bars; mobile: dots + day panel)
  const renderMonth = () => (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-muted/50">
        {weekdayNames.map((n, i) => <div key={i} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{n}</div>)}
      </div>
      {weeks.map((week, wi) => {
        const layout = layoutWeek(week, spans, MAX_LANES);
        return (
          <div key={wi} className="relative grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((day, di) => {
              const ymd = toLocalYMD(day);
              const inMonth = ymd >= monthStart && ymd <= monthEnd;
              const isToday = ymd === today;
              const isSel = ymd === selected;
              const count = isMobile ? spansOnDay(spans, ymd).length : 0;
              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => setSelected(ymd)}
                  onDoubleClick={() => newJobOn(ymd)}
                  aria-label={`${formatYMD(ymd, { weekday: 'long', month: 'long', day: 'numeric' })}${isMobile && count ? `, ${count} job${count === 1 ? '' : 's'}` : ''}`}
                  aria-pressed={isSel}
                  className={`relative flex flex-col items-center border-r border-border text-left last:border-r-0 sm:items-stretch ${isMobile ? 'h-14 pt-1.5' : 'min-h-[8.25rem] p-1.5'} ${inMonth ? 'bg-card' : 'bg-muted/40'} ${isSel ? 'ring-2 ring-inset ring-primary' : 'hover:bg-muted/50'}`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums sm:ml-auto ${isToday ? 'bg-primary font-bold text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground/70'}`}>{day.getDate()}</span>
                  {isMobile && count > 0 && (
                    <span className="mt-1 flex gap-0.5" aria-hidden="true">
                      {spansOnDay(spans, ymd).slice(0, 3).map((s) => <span key={s.id} className={`h-1.5 w-1.5 rounded-full ${styleFor(String(s.item.status)).dot}`} />)}
                    </span>
                  )}
                  {!isMobile && layout.hiddenPerDay[di] > 0 && (
                    <span className="absolute bottom-1 left-1.5 text-[11px] font-semibold text-muted-foreground">+{layout.hiddenPerDay[di]} more</span>
                  )}
                </button>
              );
            })}
            {!isMobile && layout.segments.map((seg) => {
              const st = styleFor(String(seg.span.item.status));
              return (
                <button
                  key={`${seg.span.id}-${wi}`}
                  type="button"
                  onClick={() => onNavigateJob(seg.span.id)}
                  title={`${seg.span.item.name}${seg.span.item.clientName ? ` · ${seg.span.item.clientName}` : ''} (${st.label}, ${rangeText(seg.span)})`}
                  className={`absolute h-[1.35rem] truncate px-2 text-left text-xs font-semibold shadow-soft transition hover:brightness-110 ${st.bar} ${seg.continuesBefore ? 'rounded-l-none' : 'rounded-l-md'} ${seg.continuesAfter ? 'rounded-r-none' : 'rounded-r-md'}`}
                  style={{
                    top: `calc(2.4rem + ${seg.lane} * 1.55rem)`,
                    left: `calc(${(seg.startCol / 7) * 100}% + ${seg.continuesBefore ? 0 : 3}px)`,
                    width: `calc(${((seg.endCol - seg.startCol + 1) / 7) * 100}% - ${(seg.continuesBefore ? 0 : 3) + (seg.continuesAfter ? 0 : 3)}px)`,
                  }}
                >
                  {seg.continuesBefore ? '… ' : ''}{seg.span.item.name}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  const renderWeek = () => {
    const days = weekDays(anchor, WEEK_STARTS_ON);
    return (
      <div className="grid gap-3 md:grid-cols-7 md:gap-2">
        {days.map((d) => {
          const ymd = toLocalYMD(d);
          const list = spansOnDay(spans, ymd);
          const isToday = ymd === today;
          return (
            <div key={ymd} className={`card flex min-h-[8rem] flex-col p-2.5 ${isToday ? 'border-primary/50 ring-1 ring-primary/30' : ''}`}>
              <div className="mb-2 flex items-center justify-between gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className={`flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>{d.getDate()}</span>
              </div>
              <div className="flex-1 space-y-1.5">
                {list.map((s) => {
                  const st = styleFor(String(s.item.status));
                  return (
                    <button key={s.id} type="button" onClick={() => onNavigateJob(s.id)} title={`${s.item.name} (${st.label})`} className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs font-semibold ${st.bar}`}>
                      {s.item.name}
                      {s.item.clientName && <span className="block truncate font-normal opacity-90">{s.item.clientName}</span>}
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => newJobOn(ymd)} className="mt-2 flex h-9 items-center justify-center gap-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`New job on ${formatYMD(ymd)}`}>
                <PlusIcon className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderList = () => {
    const groups = agendaGroups(spans, monthStart, monthEnd);
    if (!groups.length) {
      return (
        <EmptyState
          compact
          icon={<CalendarIcon />}
          title={`Nothing scheduled in ${anchor.toLocaleDateString(undefined, { month: 'long' })}`}
          description="Jobs with a start date in this month show up here."
          action={<button type="button" className="btn btn-primary" onClick={() => newJobOn(today >= monthStart && today <= monthEnd ? today : monthStart)}><PlusIcon className="h-4 w-4" /> New job</button>}
        />
      );
    }
    return (
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.key}>
            <h2 className={`mb-2 text-sm font-semibold ${g.key === today ? 'text-primary' : 'text-foreground'}`}>
              {g.key === 'ongoing' ? 'Already in progress' : dayHeading(g.key)}
            </h2>
            <div className="space-y-2">{g.spans.map((s) => jobRow(s))}</div>
          </section>
        ))}
      </div>
    );
  };

  const visibleCount = useMemo(() => {
    if (view === 'week') {
      const d = weekDays(anchor, WEEK_STARTS_ON);
      return spansInRange(spans, toLocalYMD(d[0]), toLocalYMD(d[6])).length;
    }
    return spansInRange(spans, monthStart, monthEnd).length;
  }, [view, anchor, spans, monthStart, monthEnd]);

  return (
    <div className="page">
      <PageHeader
        onBack={onBack}
        icon={<CalendarIcon className="h-7 w-7" />}
        title="Schedule"
        subtitle={loading ? 'Loading jobs…' : `${stats.active} active · ${stats.upcoming} upcoming · ${stats.completed} completed`}
        actions={<button type="button" className="btn btn-primary" onClick={() => newJobOn(selected)}><PlusIcon className="h-4 w-4" /> New job</button>}
      />

      <div className="card mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <div className="flex items-center gap-1">
            <button type="button" className="btn btn-outline h-10 w-10 p-0" onClick={() => step(-1)} aria-label={view === 'week' ? 'Previous week' : 'Previous month'}><ChevronLeftIcon className="h-4 w-4" /></button>
            <button type="button" className="btn btn-outline h-10 px-3" onClick={goToday}>Today</button>
            <button type="button" className="btn btn-outline h-10 w-10 p-0" onClick={() => step(1)} aria-label={view === 'week' ? 'Next week' : 'Next month'}><ChevronRightIcon className="h-4 w-4" /></button>
          </div>
          <h2 className="min-w-0 truncate text-lg font-bold tracking-tight text-foreground sm:ml-3">{title}</h2>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{visibleCount} job{visibleCount === 1 ? '' : 's'}</span>
          <Segmented<ViewKey> ariaLabel="Calendar view" value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'list', label: 'List' }]} />
        </div>
      </div>

      <InlineError onRetry={load}>{error}</InlineError>

      {loading && !jobs.length ? (
        <div className="card p-4" aria-busy="true" aria-label="Loading"><div className="skeleton h-96 w-full" /></div>
      ) : !jobs.length && !error ? (
        <EmptyState icon={<BriefcaseIcon />} title="No jobs yet" description="Create a job with a start date and it will appear on your schedule." action={<button type="button" className="btn btn-primary" onClick={() => newJobOn(today)}><PlusIcon className="h-4 w-4" /> Create a job</button>} />
      ) : (
        <div className="space-y-4">
          {view !== 'list' && legend()}
          {view === 'month' && renderMonth()}
          {view === 'week' && renderWeek()}
          {view === 'list' && renderList()}
          {view === 'month' && dayPanel()}
          {view === 'month' && !isMobile && <p className="text-xs text-muted-foreground">Tip: double-click a day to create a job starting that day.</p>}

          {unscheduled.length > 0 && (
            <section className="card card-pad">
              <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setShowUnscheduled((v) => !v)} aria-expanded={showUnscheduled}>
                <span className="text-sm font-semibold text-foreground">{unscheduled.length} job{unscheduled.length === 1 ? '' : 's'} without a start date</span>
                <span className="text-sm text-primary">{showUnscheduled ? 'Hide' : 'Show'}</span>
              </button>
              {showUnscheduled && (
                <div className="mt-3 space-y-2">
                  {unscheduled.map((j) => (
                    jobRow({ id: j.id, startYMD: '', endYMD: '', days: 0, item: j }, 'Not scheduled')
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default CalendarView;
