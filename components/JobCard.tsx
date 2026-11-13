import React from 'react';
import { DropdownMenu, DropdownItem, DropdownSeparator } from './ui/DropdownMenu';
import { MoreVerticalIcon, TrashIcon, CopyIcon, MapPinIcon, CalendarIcon, UserIcon, ChevronRightIcon, BriefcaseIcon } from './Icons';
import { Job } from '../types';

interface JobCardProps {
    job: Job;
    onClick: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    /** Translation dictionary (optional; English labels are used when missing). */
    t?: Record<string, string>;
}

export const JOB_STATUS_META: Record<Job['status'], { label: string; badge: string; dot: string }> = {
    active: { label: 'Active', badge: 'badge-success', dot: 'bg-success' },
    paused: { label: 'Paused', badge: 'badge-warning', dot: 'bg-warning' },
    completed: { label: 'Completed', badge: 'badge-primary', dot: 'bg-primary' },
    inactive: { label: 'Inactive', badge: 'badge-muted', dot: 'bg-muted-foreground' },
};

export const JobStatusBadge: React.FC<{ status: Job['status'] | string | undefined; label?: string }> = ({ status, label }) => {
    const meta = JOB_STATUS_META[(status as Job['status']) || 'active'] || JOB_STATUS_META.inactive;
    return (
        <span className={`badge ${meta.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
            {label || meta.label}
        </span>
    );
};

export const formatShortDate = (value?: string | null): string => {
    if (!value) return '';
    // Plain dates (YYYY-MM-DD) are calendar days: don't shift them through UTC.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};

export const JobCard: React.FC<JobCardProps> = ({ job, onClick, onDelete, onDuplicate, t = {} }) => {
    const start = formatShortDate(job.startDate);
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
            className="card group relative flex cursor-pointer flex-col p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
            aria-label={`${t.viewProject || 'Open job'}: ${job.name}`}
        >
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <BriefcaseIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 pr-8">
                    <h3 className="truncate text-base font-semibold text-foreground">{job.name || 'Untitled job'}</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                        <UserIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{job.clientName || 'No client'}</span>
                    </p>
                </div>
                <div className="absolute right-2 top-2">
                    <DropdownMenu
                        asButton
                        label="Job actions"
                        trigger={
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground">
                                <MoreVerticalIcon className="h-4 w-4" />
                            </span>
                        }
                    >
                        <DropdownItem onClick={onDuplicate}>
                            <CopyIcon className="h-4 w-4" />
                            Duplicate job
                        </DropdownItem>
                        <DropdownSeparator />
                        <DropdownItem onClick={onDelete} destructive>
                            <TrashIcon className="h-4 w-4" />
                            Delete job
                        </DropdownItem>
                    </DropdownMenu>
                </div>
            </div>

            <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                {job.clientAddress && (
                    <p className="flex items-center gap-1.5 truncate">
                        <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{job.clientAddress}</span>
                    </p>
                )}
                {(start || job.workerName) && (
                    <p className="flex items-center gap-1.5 truncate">
                        <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                            {start ? `Starts ${start}` : ''}{start && job.workerName ? ' · ' : ''}{job.workerName ? job.workerName : ''}
                        </span>
                    </p>
                )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <JobStatusBadge status={job.status} />
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    {t.viewProject || 'Open'}
                    <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
            </div>
        </div>
    );
};
