/**
 * Work orders -> job tasks (pure; tested by scripts/job-tasks-check.ts). A Work Order document (types.ts
 * WorkOrderData: title, workOrderNumber, date, status, assignedTo, description, materialsUsed, hours) becomes a list of
 * PROPOSED tasks the contractor reviews before saving (lib/tasks/tasksApi.ts createTasks):
 *   - one task per line / bullet / numbered step of the description (HTML lists and paragraphs too); a description
 *     that is one paragraph becomes one task named after the work order
 *   - "Get materials" first when materials are listed (the others wait for it)
 *   - assignee: the work order's "Assigned to", matched against the crew (matchCrewName)
 *   - start date: the work order's date (when it is a real date); source 'work_order', workOrderDocId = the document
 *
 * Exports: workOrderToProposedTasks, tasksForWorkOrder, workOrderTaskProgress, isWorkOrderDocument
 */
import { matchCrewName, type CrewRef } from '../../supabase/functions/ai-assistant/shared/taskExtraction.ts';
import { isYmd, taskProgress, type TaskLike, type TaskProgress } from './taskLogic.ts';
import { TASK_LIMITS, type ProposedTask } from './taskTypes.ts';

/** The work order fields used here (a FormData row's `data`, plus the document id and type). */
export interface WorkOrderLike {
    id: string;
    type?: string;
    data: {
        title?: string;
        workOrderNumber?: string;
        date?: string;
        status?: string;
        assignedTo?: string;
        description?: string;
        materialsUsed?: string;
    };
}

/** Same string as FormType.WorkOrder in types.ts (not imported: keeps this file free of the app's types module). */
export const WORK_ORDER_TYPE = 'Work Order';
export const isWorkOrderDocument = (doc: { type?: string } | null | undefined): boolean => doc?.type === WORK_ORDER_TYPE;

/** At most this many tasks from one work order. */
export const WORK_ORDER_TASK_MAX = 40;

const decodeEntities = (s: string) => s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

/** HTML or plain text -> lines (list items, paragraphs, line breaks become separate lines). */
export function textLines(value: unknown): string[] {
    let s = typeof value === 'string' ? value : '';
    if (/<[a-z!/][^>]*>/i.test(s)) {
        s = s.replace(/<\s*(?:br|\/p|\/li|\/h[1-6]|\/div|\/tr)\s*\/?>/gi, '\n').replace(/<\s*li[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
    }
    return decodeEntities(s).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const BULLET_RE = /^(?:[-*•·◦▪–—]|\(?\d{1,3}[.)]|\[\s?[xX ]?\s?\]|[a-zA-Z][.)])\s+/;

/** A long line: the first ~120 characters (cut at a word) as the title, the whole line in the notes. */
const splitTitle = (line: string): { title: string; notes: string | null } => {
    const clean = line.replace(BULLET_RE, '').replace(/[.;:,]+$/, '').trim();
    if (clean.length <= 120) return { title: clean.charAt(0).toUpperCase() + clean.slice(1), notes: null };
    const cut = clean.slice(0, 120);
    const at = cut.lastIndexOf(' ');
    const title = `${(at > 60 ? cut.slice(0, at) : cut).trim()}…`;
    return { title: title.charAt(0).toUpperCase() + title.slice(1), notes: clean.slice(0, TASK_LIMITS.notes) };
};

/**
 * Proposed tasks for a work order (nothing saved). `crew` = the account's crew members (for the assignee),
 * `existingTitles` = tasks already on the job (skipped, case-insensitive).
 */
export function workOrderToProposedTasks(
    doc: WorkOrderLike,
    opts: { crew?: readonly CrewRef[]; existingTitles?: readonly string[]; includeMaterials?: boolean } = {},
): ProposedTask[] {
    const d = doc.data || {};
    const label = [d.title?.trim() || 'Work order', d.workOrderNumber?.trim() ? `#${d.workOrderNumber.trim()}` : ''].filter(Boolean).join(' ');
    const from = `From work order ${d.workOrderNumber?.trim() || d.title?.trim() || ''}`.trim();
    const assigned = (d.assignedTo || '').trim();
    const member = assigned ? matchCrewName(assigned, opts.crew || []) : null;
    const start = isYmd((d.date || '').slice(0, 10)) ? (d.date || '').slice(0, 10) : null;
    const existing = new Set((opts.existingTitles || []).map(t => t.trim().toLowerCase()));
    const seen = new Set<string>();

    const base = (title: string, notes: string | null): ProposedTask => ({
        title: title.slice(0, TASK_LIMITS.title),
        notes: [notes, from].filter(Boolean).join('\n\n').slice(0, TASK_LIMITS.notes) || null,
        startDate: start,
        dueDate: null,
        isMilestone: false,
        crewMemberId: member ? member.id : null,
        assigneeName: member ? member.name : assigned || null,
        dependsOnIndex: [],
        source: 'work_order',
        workOrderDocId: doc.id || null,
    });

    const out: ProposedTask[] = [];
    const push = (t: ProposedTask) => {
        const key = t.title.trim().toLowerCase();
        if (!key || seen.has(key) || existing.has(key) || out.length >= WORK_ORDER_TASK_MAX) return;
        seen.add(key);
        out.push(t);
    };

    const materials = textLines(d.materialsUsed).join('\n');
    const withMaterials = opts.includeMaterials !== false && !!materials;
    if (withMaterials) push(base('Get materials', materials));
    const materialsAt = out.length ? 0 : -1;

    const lines = textLines(d.description);
    const isList = lines.length > 1 || (lines.length === 1 && BULLET_RE.test(lines[0]));
    if (isList) {
        for (const l of lines) {
            const { title, notes } = splitTitle(l);
            if (title) push(base(title, notes));
        }
    } else if (lines.length === 1) {
        push(base(label, lines[0]));
    } else if (!withMaterials) {
        push(base(label, null));
    }
    if (materialsAt === 0) for (let i = 1; i < out.length; i++) out[i].dependsOnIndex = [0];
    return out;
}

/** The tasks made from this work order. */
export const tasksForWorkOrder = <T extends TaskLike & { workOrderDocId: string | null }>(tasks: readonly T[], docId: string): T[] =>
    tasks.filter(t => !!docId && t.workOrderDocId === docId);

/** Progress of a work order's tasks (null when it has none). */
export function workOrderTaskProgress(tasks: readonly (TaskLike & { workOrderDocId: string | null })[], docId: string, today?: string): TaskProgress | null {
    const mine = tasksForWorkOrder(tasks, docId);
    return mine.length ? taskProgress(mine, today) : null;
}
