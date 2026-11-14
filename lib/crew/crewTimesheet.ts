/**
 * Crew hours → the existing Time Sheet document (one per worker, job and week), so job costing, Insights, the
 * profit numbers and "Bill time & materials" pick the hours up like any typed time sheet
 * (lib/finance.ts: time-sheet hours × labor rate, overtime 1.5×). Pure; scripts/crew-clock-check.ts tests it.
 *
 * The sheet keeps a `crewTimesheet` record (worker, job, week, the punches it was made from) so "Update time sheet"
 * rewrites the same document after punches are fixed, and the punches point back at it (time_punches.timesheet_id).
 */
import { FormType, type Job, type UserProfile } from '../../types.ts';
import { makeDocumentDefaults } from '../../src/ai/planDocuments.ts';
import {
    OVERTIME_RULES, clockLabel, durationLabel, localDayOf, msToHours, sessionApproved, sessionCounts, shortDayLabel, weekRangeLabel,
    type MemberWeek, type OvertimeRule, type WorkSession,
} from './crewLogic.ts';

export const CREW_TIMESHEET_SOURCE = 'crew-clock';
const NOTES_HEAD = 'From crew clock-in';

export interface CrewTimesheetRecord {
    source: typeof CREW_TIMESHEET_SOURCE;
    memberId: string;
    jobId: string;
    weekStart: string;
    punchIds: string[];
    regularHours: number;
    overtimeHours: number;
    rule: OvertimeRule;
    /** the notes this feature wrote (an update replaces them only when the owner hasn't rewritten them) */
    notes: string;
    generatedAt: string;
}

export interface TimeSheetPlan {
    memberId: string;
    memberName: string;
    jobId: string;
    weekStart: string;
    /** last day worked on this job that week (YYYY-MM-DD): "Bill time & materials … through" stays honest */
    date: string;
    regularHours: number;
    overtimeHours: number;
    totalHours: number;
    punchIds: string[];
    shifts: number;
    /** the time sheet these punches already belong to (update it instead of making another) */
    existingTimesheetId: string | null;
    /** every counted punch already points at existingTimesheetId */
    upToDate: boolean;
    approved: boolean;
    title: string;
    notes: string;
    /** shifts left out: still open / missing a clock-in or clock-out */
    skippedOpen: number;
    skippedMissing: number;
}

const sessionLine = (s: WorkSession): string => {
    const end = s.end ?? s.start;
    const overnight = localDayOf(end) !== s.day;
    const range = `${clockLabel(s.start)} – ${overnight ? `${shortDayLabel(localDayOf(end)).split(' ')[0]} ` : ''}${clockLabel(end)}`;
    const brk = s.breakMs >= 60_000 ? `  (${durationLabel(s.breakMs)} break)` : '';
    const edited = s.flags.includes('edited') ? '  (edited)' : '';
    return `${shortDayLabel(s.day)}  ${range}${brk}  ${durationLabel(s.workedMs)}${edited}`;
};

/** The notes of a generated sheet: one line per shift, then the overtime rule when there is overtime. */
export const timeSheetNotes = (sessions: readonly WorkSession[], weekStart: string, overtimeHours: number, rule: OvertimeRule): string => {
    const lines = [`${NOTES_HEAD}, ${weekRangeLabel(weekStart)}:`, ...[...sessions].sort((a, b) => a.start - b.start).map(sessionLine)];
    if (overtimeHours > 0) {
        const label = OVERTIME_RULES.find(r => r.id === rule)?.label.replace(/^Overtime /, '') || '';
        lines.push(`Overtime: ${overtimeHours} h (${label}).`);
    }
    return lines.join('\n');
};

/** One time sheet per job the worker has counted hours on that week. */
export const planTimeSheets = (
    week: MemberWeek,
    member: { name: string },
    opts: { weekStart: string; rule: OvertimeRule },
): TimeSheetPlan[] => {
    const plans: TimeSheetPlan[] = [];
    for (const j of week.jobs) {
        const counted = j.sessions.filter(sessionCounts);
        if (!counted.length) continue;
        const punches = counted.flatMap(s => s.punches).filter(p => !p.pending && !String(p.id).startsWith('local:'));
        const linked = Array.from(new Set(punches.map(p => p.timesheetId).filter((v): v is string => Boolean(v))));
        const existing = linked[0] || null;
        const regularHours = msToHours(j.regularMs);
        const overtimeHours = msToHours(j.overtimeMs);
        plans.push({
            memberId: week.memberId,
            memberName: member.name,
            jobId: j.jobId,
            weekStart: opts.weekStart,
            date: counted.reduce((max, s) => (s.day > max ? s.day : max), counted[0].day),
            regularHours,
            overtimeHours,
            totalHours: Math.round((regularHours + overtimeHours) * 100) / 100,
            punchIds: punches.map(p => p.id),
            shifts: counted.length,
            existingTimesheetId: existing,
            upToDate: Boolean(existing) && linked.length === 1 && punches.every(p => p.timesheetId === existing),
            approved: counted.every(sessionApproved),
            title: `${member.name || 'Crew'} · ${weekRangeLabel(opts.weekStart)}`,
            notes: timeSheetNotes(counted, opts.weekStart, overtimeHours, opts.rule),
            skippedOpen: j.sessions.filter(s => s.open).length,
            skippedMissing: j.sessions.filter(s => !s.open && !sessionCounts(s)).length,
        });
    }
    return plans;
};

const record = (plan: TimeSheetPlan, rule: OvertimeRule, nowIso: string): CrewTimesheetRecord => ({
    source: CREW_TIMESHEET_SOURCE,
    memberId: plan.memberId,
    jobId: plan.jobId,
    weekStart: plan.weekStart,
    punchIds: plan.punchIds,
    regularHours: plan.regularHours,
    overtimeHours: plan.overtimeHours,
    rule,
    notes: plan.notes,
    generatedAt: nowIso,
});

/** Data of a new Time Sheet document (same defaults as the form, company details from the profile). */
export const crewTimeSheetData = (
    plan: TimeSheetPlan, job: Job, profile: UserProfile | null | undefined, opts: { rule: OvertimeRule; today: string; nowIso: string },
): Record<string, unknown> => ({
    ...makeDocumentDefaults(FormType.TimeSheet, job, profile, opts.today),
    title: plan.title,
    workerName: plan.memberName,
    date: plan.date,
    hoursWorked: plan.regularHours,
    overtimeHours: plan.overtimeHours,
    notes: plan.notes,
    status: plan.approved ? 'Approved' : 'Draft',
    crewTimesheet: record(plan, opts.rule, opts.nowIso),
});

/**
 * An existing generated sheet with the new hours. Everything the owner added (signature, design, status) stays;
 * the notes are replaced only if they are still the ones this feature wrote; a Draft becomes Approved once the week is.
 */
export const updatedCrewTimeSheetData = (
    existing: Record<string, unknown>, plan: TimeSheetPlan, opts: { rule: OvertimeRule; nowIso: string },
): Record<string, unknown> => {
    const prev = (existing.crewTimesheet && typeof existing.crewTimesheet === 'object' ? existing.crewTimesheet : {}) as Partial<CrewTimesheetRecord>;
    const notes = typeof existing.notes === 'string' ? existing.notes : '';
    const ownNotes = !notes.trim() || (typeof prev.notes === 'string' && notes.trim() === prev.notes.trim()) || notes.startsWith(NOTES_HEAD);
    const status = String(existing.status || 'Draft');
    return {
        ...existing,
        workerName: existing.workerName || plan.memberName,
        date: plan.date,
        hoursWorked: plan.regularHours,
        overtimeHours: plan.overtimeHours,
        notes: ownNotes ? plan.notes : notes,
        status: plan.approved && status === 'Draft' ? 'Approved' : status,
        crewTimesheet: record(plan, opts.rule, opts.nowIso),
    };
};

/** Is this document a time sheet made from crew hours? */
export const isCrewTimeSheet = (data: unknown): boolean =>
    Boolean(data && typeof data === 'object' && (data as { crewTimesheet?: { source?: unknown } }).crewTimesheet?.source === CREW_TIMESHEET_SOURCE);
