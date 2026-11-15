/**
 * Client portal project dashboard (roadmap D9): what a client sees for one job, phone first. Pure view: it renders a
 * DashboardView (lib/portal/dashboardLogic.ts buildDashboardView) and owns no data.
 *
 * Order: the project card (name, address, status, dates, progress, contractor call / email), MILESTONES as a vertical
 * timeline (finished, the one coming next, later ones), "What happens next", the balance with the job's documents under
 * it, the shared photos (tap to enlarge) and a one-line punch list summary. A section with nothing to show is left out
 * (visibleSections); a project with nothing at all gets one friendly sentence.
 *
 * Used by components/PortalView.tsx (the client's page: `renderDocument` plugs in the portal's own document rows with
 * View / Review & sign / Pay / Download) and by components/portal/OwnerPortalPreview.tsx (`readOnly`: the contractor's
 * "What my client sees"; documents are plain rows, nothing is tappable except photos and the contractor links).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../commsKit.tsx';
import { CheckIcon, ChevronRightIcon, MailIcon, PhoneIcon } from '../Icons.tsx';
import { tagLabel } from '../photos/photoLogic.ts';
import { portalPhotoUrl } from '../photos/photosApi.ts';
import { mailHref, mapsHref, telHref } from '../requests/requestLogic.ts';
import {
    collapseTimeline, nextStepAction, paidPercent, stepActionLabel, timelineItems, visibleSections, type StepAction,
} from '../../lib/portal/dashboardLogic.ts';
import type {
    DashboardDocumentRow, DashboardJobSummary, DashboardPhoto, DashboardView, MilestoneView, NextStep,
} from '../../lib/portal/dashboardTypes.ts';

export interface PortalProjectDashboardProps {
    view: DashboardView;
    /** several jobs: tap one to switch (nothing is shown for a single job) */
    onSelectJob?: (id: string) => void;
    /** the portal's own document row for this document (null / missing = a plain row) */
    renderDocument?: (row: DashboardDocumentRow) => React.ReactNode;
    /** a "What happens next" row was tapped */
    onStepAction?: (step: NextStep, action: StepAction) => void;
    /** "See list" on the punch list line (the portal scrolls to its punch list section) */
    onOpenPunch?: () => void;
    /** the contractor's preview: nothing is tappable except photos and the contractor links */
    readOnly?: boolean;
    /** D5 (selections) renders here later; nothing is shown while there are none */
    renderSelections?: (selections: unknown[]) => React.ReactNode;
    className?: string;
}

const STATUS_TONE: Record<string, string> = { active: 'badge-primary', completed: 'badge-success', paused: 'badge-warning' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const SectionHeading: React.FC<{ id: string; children: React.ReactNode; aside?: React.ReactNode }> = ({ id, children, aside }) => (
    <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-lg font-bold">{children}</h2>
        {aside}
    </div>
);

// =============================================================================================== job switcher
export const JobSwitcher: React.FC<{ jobs: DashboardJobSummary[]; activeId: string | null; onSelect: (id: string) => void }> = ({ jobs, activeId, onSelect }) => (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Your projects">
        <div className="flex w-max gap-2">
            {jobs.map(j => {
                const active = j.id === activeId;
                return (
                    <button
                        key={j.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSelect(j.id)}
                        className={cx(
                            'min-h-[44px] max-w-[15rem] truncate rounded-full border px-4 text-sm font-semibold transition',
                            active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {j.name}
                    </button>
                );
            })}
        </div>
    </div>
);

/** Placeholder while a job loads (same width as the dashboard, so nothing jumps). */
export const ProjectSkeleton: React.FC = () => (
    <div className="animate-pulse space-y-4" aria-hidden>
        <div className="h-40 rounded-2xl bg-muted" />
        <div className="h-5 w-1/3 rounded bg-muted" />
        <div className="h-24 rounded-2xl bg-muted" />
    </div>
);

// =============================================================================================== project card
const ProjectCard: React.FC<{ view: DashboardView }> = ({ view }) => {
    const job = view.job!;
    const c = view.contractor;
    const tel = telHref(c.phone);
    const mail = mailHref(c.email);
    const maps = mapsHref(job.address);
    const company = c.companyName || c.name;
    const progress = view.progress;
    return (
        <section className="card overflow-hidden" aria-labelledby="portal-project-title">
            <div className="card-pad">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your project</p>
                <h2 id="portal-project-title" className="mt-1 text-2xl font-bold leading-tight">{job.name}</h2>
                {job.address && (maps
                    ? <a href={maps} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{job.address}</a>
                    : <p className="mt-1 text-sm text-muted-foreground">{job.address}</p>)}
                {(view.statusLabel || view.datesText) && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {view.statusLabel && <span className={cx('badge', STATUS_TONE[job.status] || 'badge-muted')}>{view.statusLabel}</span>}
                        {view.datesText && <span className="text-sm tabular-nums text-muted-foreground">{view.datesText}</span>}
                    </div>
                )}
                {progress && progress.total > 0 && (
                    <div className="mt-5">
                        <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-semibold">{view.progressLabel}</p>
                            <p className="text-sm font-semibold tabular-nums text-muted-foreground">{progress.percent}%</p>
                        </div>
                        <div
                            role="progressbar"
                            aria-label={view.progressLabel}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress.percent}
                            className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
                        >
                            <div
                                className={cx('h-full rounded-full transition-[width] duration-700', progress.percent >= 100 ? 'bg-success' : 'bg-primary')}
                                style={{ width: `${progress.percent}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>
            {(company || tel || mail) && (
                <div className="flex flex-col gap-2.5 border-t border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
                    <p className="min-w-0 truncate text-sm sm:mr-auto">
                        <span className="text-muted-foreground">Your contractor </span>
                        <span className="font-semibold">{company}</span>
                    </p>
                    {(tel || mail) && (
                        <div className="flex gap-2">
                            {tel && <a href={tel} className="btn btn-outline min-h-[44px] flex-1 sm:flex-none"><PhoneIcon className="h-4 w-4" /> Call</a>}
                            {mail && <a href={mail} className="btn btn-outline min-h-[44px] flex-1 sm:flex-none"><MailIcon className="h-4 w-4" /> Email</a>}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

// =============================================================================================== milestones
const whenTone = (m: MilestoneView) =>
    m.state === 'done' ? 'text-success' : m.state === 'overdue' ? 'text-warning' : m.state === 'due_soon' ? 'font-semibold text-foreground' : 'text-muted-foreground';

const Timeline: React.FC<{ view: DashboardView }> = ({ view }) => {
    const [expanded, setExpanded] = useState(false);
    const all = useMemo(() => timelineItems(view.milestones, view.nextMilestone), [view.milestones, view.nextMilestone]);
    const { items, hiddenCount } = collapseTimeline(all, expanded);
    return (
        <section aria-labelledby="portal-milestones-heading">
            <SectionHeading id="portal-milestones-heading">Milestones</SectionHeading>
            {hiddenCount > 0 && (
                <button type="button" className="mt-2 min-h-[40px] text-sm font-semibold text-primary" onClick={() => setExpanded(true)}>
                    Show {plural(hiddenCount, 'earlier finished step')}
                </button>
            )}
            <ol className="mt-3">
                {items.map(({ milestone: m, role }, i) => {
                    const last = i === items.length - 1;
                    return (
                        <li key={m.id} className="relative flex gap-3.5">
                            {/* the rail down to the next milestone */}
                            {!last && (
                                <span
                                    aria-hidden
                                    className={cx('absolute left-[11px] bottom-0 w-0.5 rounded-full', role === 'next' ? 'top-8' : 'top-6', role === 'done' ? 'bg-success/50' : 'bg-border')}
                                />
                            )}
                            <span className={cx('relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center', role === 'next' && 'mt-2')} aria-hidden>
                                {role === 'done' && (
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-white"><CheckIcon className="h-3.5 w-3.5" strokeWidth={3} /></span>
                                )}
                                {role === 'next' && (
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-background ring-4 ring-primary/15">
                                        <span className="h-2 w-2 rounded-full bg-primary" />
                                    </span>
                                )}
                                {role === 'upcoming' && <span className="h-6 w-6 rounded-full border-2 border-border bg-background" />}
                            </span>
                            <div
                                className={cx(
                                    'min-w-0 flex-1',
                                    role === 'next' ? 'rounded-xl bg-primary/5 px-3 py-2 ring-1 ring-primary/25' : '',
                                    !last && (role === 'next' ? 'mb-4' : 'pb-5'),
                                )}
                                aria-current={role === 'next' ? 'step' : undefined}
                            >
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    <p className={cx('text-sm font-semibold leading-6', role === 'done' && 'text-muted-foreground')}>{m.title}</p>
                                    {role === 'next' && <span className="badge badge-primary">Next</span>}
                                </div>
                                <p className={cx('text-xs leading-5', whenTone(m))}>{m.whenText}</p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
};

// =============================================================================================== what happens next
const NextSteps: React.FC<{ steps: NextStep[]; onStepAction?: (step: NextStep, action: StepAction) => void; readOnly?: boolean }> = ({ steps, onStepAction, readOnly }) => (
    <section aria-labelledby="portal-next-heading">
        <SectionHeading id="portal-next-heading">What happens next</SectionHeading>
        <ol className="mt-3 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
            {steps.map((s, i) => {
                const action = readOnly ? null : nextStepAction(s);
                const urgent = s.kind === 'sign' || s.kind === 'pay_overdue';
                return (
                    <li key={`${s.kind}-${s.refId || i}`} className="flex items-center gap-3 px-3.5 py-3">
                        <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-muted-foreground" aria-hidden>{i + 1}</span>
                        <p className={cx('min-w-0 flex-1 text-sm leading-5', urgent ? 'font-semibold' : 'font-medium')}>{s.text}</p>
                        {action && onStepAction && (
                            <button
                                type="button"
                                className={cx('btn btn-sm min-h-[40px] shrink-0', urgent ? 'btn-primary' : 'btn-outline')}
                                onClick={() => onStepAction(s, action)}
                            >
                                {stepActionLabel(action)}
                            </button>
                        )}
                    </li>
                );
            })}
        </ol>
    </section>
);

// =============================================================================================== money + documents
const PlainDocumentRow: React.FC<{ row: DashboardDocumentRow }> = ({ row }) => (
    <li className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
        <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{row.label}</p>
            <p className="truncate text-xs text-muted-foreground">
                {[row.type, row.status, row.awaitingSignature ? 'Waiting for the client to sign' : ''].filter(Boolean).join(' · ')}
            </p>
        </div>
        {row.totalText && (
            <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums">{row.totalText}</p>
                {row.balanceDue > 0 && <p className="text-xs text-warning">{row.overdue ? 'Past due' : 'Unpaid'}</p>}
            </div>
        )}
    </li>
);

const Money: React.FC<{ view: DashboardView }> = ({ view }) => {
    const b = view.balance;
    if (!b) return null;
    const pct = paidPercent(b);
    const owes = b.outstanding > 0;
    return (
        <div className={cx('card card-pad', b.overdueCount > 0 && 'border-warning/50 bg-warning/5')}>
            <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{owes ? 'Still to pay' : 'Paid in full'}</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums">{owes ? b.outstandingText : b.paidText}</p>
                    <p className={cx('mt-0.5 text-sm', b.overdueCount > 0 ? 'font-semibold text-warning' : 'text-muted-foreground')}>
                        {b.overdueCount > 0
                            ? `${plural(b.overdueCount, 'invoice')} past due`
                            : owes ? `${plural(b.unpaidCount, 'unpaid invoice')}` : 'Nothing due right now'}
                    </p>
                </div>
                {owes && (
                    <dl className="shrink-0 space-y-0.5 text-right text-sm">
                        <div><dt className="text-xs text-muted-foreground">Project total</dt><dd className="font-semibold tabular-nums">{b.totalText}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Paid</dt><dd className="font-semibold tabular-nums text-success">{b.paidText}</dd></div>
                    </dl>
                )}
            </div>
            {owes && (
                <div
                    role="progressbar"
                    aria-label={`${pct}% of the project total is paid`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                    <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                </div>
            )}
        </div>
    );
};

const Balance: React.FC<{ view: DashboardView; renderDocument?: (row: DashboardDocumentRow) => React.ReactNode }> = ({ view, renderDocument }) => {
    const hasDocs = view.documents.length > 0;
    return (
        <section aria-labelledby="portal-balance-heading">
            <SectionHeading id="portal-balance-heading">{view.balance ? 'Balance' : 'Documents'}</SectionHeading>
            <div className="mt-3">
                <Money view={view} />
            </div>
            {hasDocs && (
                <>
                    {view.balance && <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">Documents for this project</h3>}
                    <ul className={cx('space-y-3', !view.balance && 'mt-3')}>
                        {view.documents.map(row => {
                            const custom = renderDocument?.(row);
                            return custom ? <li key={row.id}>{custom}</li> : <PlainDocumentRow key={row.id} row={row} />;
                        })}
                    </ul>
                </>
            )}
        </section>
    );
};

// =============================================================================================== photos
const PhotoLightbox: React.FC<{ photos: DashboardPhoto[]; index: number; jobName: string; onIndex: (i: number) => void; onClose: () => void }> = ({
    photos, index, jobName, onIndex, onClose,
}) => {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight') onIndex(Math.min(photos.length - 1, index + 1));
            else if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [index, photos.length, onIndex, onClose]);
    const p = photos[index];
    if (!p) return null;
    const when = p.takenAt && !Number.isNaN(new Date(p.takenAt).getTime())
        ? new Date(p.takenAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
    return createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-950 text-white" role="dialog" aria-modal="true" aria-label="Photo">
            <div className="flex items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <button type="button" className="btn btn-ghost min-h-[44px] text-white hover:bg-white/10" onClick={onClose}>Close</button>
                <span className="text-sm tabular-nums text-white/70">{index + 1} / {photos.length}</span>
                <span className="w-16" />
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center">
                <img src={portalPhotoUrl(p.path)} alt={p.caption || `${tagLabel(p.tag)} photo`} className="max-h-full max-w-full object-contain" />
                {index > 0 && <button type="button" aria-label="Previous photo" onClick={() => onIndex(index - 1)} className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl">‹</button>}
                {index < photos.length - 1 && <button type="button" aria-label="Next photo" onClick={() => onIndex(index + 1)} className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl">›</button>}
            </div>
            <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-sm">
                <p className="font-semibold">{tagLabel(p.tag)}{p.caption ? ` · ${p.caption}` : ''}</p>
                <p className="text-white/60">{[jobName, when].filter(Boolean).join(' · ')}</p>
            </div>
        </div>,
        document.body,
    );
};

const PhotoStrip: React.FC<{ photos: DashboardPhoto[]; jobName: string }> = ({ photos, jobName }) => {
    const [open, setOpen] = useState<number | null>(null);
    return (
        <section aria-labelledby="portal-project-photos-heading">
            <SectionHeading id="portal-project-photos-heading" aside={<span className="text-xs text-muted-foreground">Tap to enlarge</span>}>Photos</SectionHeading>
            <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                <ul className="flex w-max snap-x gap-2">
                    {photos.map((p, i) => (
                        <li key={p.id} className="snap-start">
                            <button
                                type="button"
                                onClick={() => setOpen(i)}
                                className="relative block h-24 w-24 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-28"
                                aria-label={`${tagLabel(p.tag)} photo${p.caption ? `: ${p.caption}` : ''}`}
                            >
                                <img src={portalPhotoUrl(p.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
                                <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">{tagLabel(p.tag)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
            {open !== null && <PhotoLightbox photos={photos} index={open} jobName={jobName} onIndex={setOpen} onClose={() => setOpen(null)} />}
        </section>
    );
};

// =============================================================================================== punch list line
const PunchLine: React.FC<{ label: string; onOpen?: () => void }> = ({ label, onOpen }) => {
    const body = (
        <>
            <span className="min-w-0">
                <span className="block text-sm font-semibold">Punch list</span>
                <span className="block truncate text-xs text-muted-foreground">{label}</span>
            </span>
            {onOpen && <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">See list <ChevronRightIcon className="h-4 w-4" /></span>}
        </>
    );
    const cls = 'flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left';
    return onOpen
        ? <button type="button" onClick={onOpen} className={cx(cls, 'min-h-[52px] transition hover:bg-muted/60')}>{body}</button>
        : <div className={cls}>{body}</div>;
};

// =============================================================================================== the dashboard
export const PortalProjectDashboard: React.FC<PortalProjectDashboardProps> = ({
    view, onSelectJob, renderDocument, onStepAction, onOpenPunch, readOnly, renderSelections, className,
}) => {
    const sections = visibleSections(view);
    const has = (s: (typeof sections)[number]) => sections.includes(s);
    if (!view.job) return null;
    const company = view.contractor.companyName || view.contractor.name || 'Your contractor';
    const quiet = sections.length <= 1;
    return (
        <div className={cx('space-y-7 animate-fade-in', className)} data-testid="portal-project">
            {view.jobs.length > 1 && onSelectJob && <JobSwitcher jobs={view.jobs} activeId={view.job.id} onSelect={onSelectJob} />}
            <ProjectCard view={view} />
            {quiet && (
                <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                    Nothing to show here yet. {company} will add milestones, photos and documents as your project moves along.
                </p>
            )}
            {/* side by side on computers (the phone order stays: milestones, then what happens next) */}
            {(has('milestones') || has('next')) && (
                <div className={cx('space-y-7', has('milestones') && has('next') && 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-7 lg:space-y-0')}>
                    {has('milestones') && <Timeline view={view} />}
                    {has('next') && <NextSteps steps={view.nextSteps} onStepAction={onStepAction} readOnly={readOnly} />}
                </div>
            )}
            {(has('balance') || has('documents')) && <Balance view={view} renderDocument={readOnly ? undefined : renderDocument} />}
            {has('photos') && <PhotoStrip photos={view.photos} jobName={view.job.name} />}
            {has('punch') && <PunchLine label={view.punchLabel} onOpen={readOnly ? undefined : onOpenPunch} />}
            {has('selections') && renderSelections?.(view.selections)}
        </div>
    );
};

export default PortalProjectDashboard;
