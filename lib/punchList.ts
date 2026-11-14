/**
 * Punch lists (competitor gap #18): pure rules, no React or Supabase (scripts/field-features-check.ts tests them).
 *
 *  - an item is open -> done -> verified. The contractor (or crew) checks it off (done), and verifies it, or the client
 *    does from the portal ("Looks good"). The client can also send a done item back ("Needs work", with a note).
 *    The same rules are enforced by public.guard_punch_item() / punch_item_feedback_via_portal()
 *    (supabase/migrations/20261115000200_punch_lists.sql).
 *  - progress, grouping by area, the quick-add shortcut "Kitchen: touch up paint @Mike", the portal payload and the
 *    "Punch list" section printed through the Note document.
 */
import { esc } from '../utils/escapeHtml.ts';

export type PunchStatus = 'open' | 'done' | 'verified';
export type PunchActor = 'contractor' | 'client';

export const PUNCH_STATUSES: { value: PunchStatus; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'done', label: 'Done' },
    { value: 'verified', label: 'Verified' },
];

export const punchStatusLabel = (s: string): string => PUNCH_STATUSES.find(x => x.value === s)?.label || 'Open';

export interface PunchItem {
    id: string;
    jobId: string;
    title: string;
    area: string;
    assignee: string;
    /** YYYY-MM-DD or '' */
    dueOn: string;
    status: PunchStatus;
    position: number;
    notes: string;
    beforePhotoId: string | null;
    afterPhotoId: string | null;
    doneAt: string | null;
    verifiedAt: string | null;
    verifiedBy: PunchActor | null;
    clientNote: string;
    clientNoteAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export const PUNCH_COLUMNS = 'id, job_id, title, area, assignee, due_on, status, position, notes, before_photo_id, after_photo_id, done_at, verified_at, verified_by, client_note, client_note_at, created_at, updated_at';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const isStatus = (v: unknown): v is PunchStatus => v === 'open' || v === 'done' || v === 'verified';
const ymd = (v: unknown): string => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(str(v)); return m ? m[1] : ''; };

/** A punch_items row (or an offline outbox row) → PunchItem. Never throws on odd data. */
export const mapPunchRow = (r: any): PunchItem => ({
    id: str(r?.id),
    jobId: str(r?.job_id ?? r?.jobId),
    title: str(r?.title) || 'Untitled item',
    area: str(r?.area),
    assignee: str(r?.assignee),
    dueOn: ymd(r?.due_on ?? r?.dueOn),
    status: isStatus(r?.status) ? r.status : 'open',
    position: Number.isFinite(Number(r?.position)) ? Number(r.position) : 0,
    notes: str(r?.notes),
    beforePhotoId: r?.before_photo_id ? String(r.before_photo_id) : null,
    afterPhotoId: r?.after_photo_id ? String(r.after_photo_id) : null,
    doneAt: r?.done_at ? String(r.done_at) : null,
    verifiedAt: r?.verified_at ? String(r.verified_at) : null,
    verifiedBy: r?.verified_by === 'client' || r?.verified_by === 'contractor' ? r.verified_by : null,
    clientNote: str(r?.client_note),
    clientNoteAt: r?.client_note_at ? String(r.client_note_at) : null,
    createdAt: str(r?.created_at) || new Date(0).toISOString(),
    updatedAt: str(r?.updated_at ?? r?.created_at),
});

/** Table row for an insert / a full update (what the browser may write). */
export const punchRowOf = (item: PunchItem, userId: string): Record<string, unknown> => ({
    id: item.id,
    user_id: userId,
    job_id: item.jobId,
    title: item.title.trim().slice(0, 300) || 'Untitled item',
    area: item.area.trim().slice(0, 120) || null,
    assignee: item.assignee.trim().slice(0, 120) || null,
    due_on: item.dueOn || null,
    status: item.status,
    position: Math.round(item.position) || 0,
    notes: item.notes.trim().slice(0, 2000) || null,
    before_photo_id: item.beforePhotoId,
    after_photo_id: item.afterPhotoId,
    done_at: item.doneAt,
    verified_at: item.verifiedAt,
    verified_by: item.verifiedBy === 'contractor' ? 'contractor' : item.verifiedBy,
});

// ---------------------------------------------------------------------------------------------
// State rules
// ---------------------------------------------------------------------------------------------

/**
 * May `actor` move an item from `item.status` to `to`?
 *   contractor: open -> done, done -> open, done -> verified, verified -> open (reopen), verified -> done (unverify)
 *   client:     done -> verified ("Looks good"), done -> open ("Needs work"), and change their mind on an item THEY
 *               verified (verified by client -> open)
 * Nothing skips "done": an open item can't be verified in one step.
 */
export const canTransition = (item: Pick<PunchItem, 'status' | 'verifiedBy'>, to: PunchStatus, actor: PunchActor): boolean => {
    const from = item.status;
    if (from === to) return false;
    if (actor === 'client') {
        if (from === 'done') return to === 'verified' || to === 'open';
        if (from === 'verified') return to === 'open' && item.verifiedBy === 'client';
        return false;
    }
    if (from === 'open') return to === 'done';
    if (from === 'done') return to === 'open' || to === 'verified';
    return to === 'open' || to === 'done';
};

/**
 * The item after a status change (timestamps as the database sets them). Throws when the move isn't allowed.
 * A client "Needs work" must carry a note.
 */
export const applyPunchStatus = (item: PunchItem, to: PunchStatus, actor: PunchActor, nowIso: string, note?: string): PunchItem => {
    if (!canTransition(item, to, actor)) throw new Error(`A ${punchStatusLabel(item.status).toLowerCase()} item can't be marked ${punchStatusLabel(to).toLowerCase()}.`);
    const clean = str(note).slice(0, 1000);
    if (actor === 'client' && to === 'open' && !clean) throw new Error('Say what still needs work.');
    const next: PunchItem = { ...item, status: to, updatedAt: nowIso };
    if (to === 'open') {
        next.doneAt = null;
        next.verifiedAt = null;
        next.verifiedBy = null;
    } else if (to === 'done') {
        next.doneAt = item.status === 'verified' ? item.doneAt || nowIso : nowIso;
        next.verifiedAt = null;
        next.verifiedBy = null;
    } else {
        next.doneAt = item.doneAt || nowIso;
        next.verifiedAt = nowIso;
        next.verifiedBy = actor;
    }
    if (actor === 'client' && clean) {
        next.clientNote = clean;
        next.clientNoteAt = nowIso;
    }
    return next;
};

/** The check circle: open -> done, done -> open. A verified item stays (reopen it from its menu). */
export const toggleTarget = (item: Pick<PunchItem, 'status'>): PunchStatus | null =>
    item.status === 'open' ? 'done' : item.status === 'done' ? 'open' : null;

// ---------------------------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------------------------
export interface PunchProgress {
    total: number;
    open: number;
    done: number;
    verified: number;
    /** done + verified */
    closed: number;
    /** 0-100, closed / total */
    pct: number;
    /** open items past their due date */
    overdue: number;
    /** the client sent something back ("Needs work") and it is still open */
    sentBack: number;
}

export const punchProgress = (items: ReadonlyArray<Pick<PunchItem, 'status' | 'dueOn' | 'clientNote'>>, today = ''): PunchProgress => {
    const out: PunchProgress = { total: items.length, open: 0, done: 0, verified: 0, closed: 0, pct: 0, overdue: 0, sentBack: 0 };
    for (const i of items) {
        out[i.status] += 1;
        if (i.status === 'open' && today && i.dueOn && i.dueOn < today) out.overdue += 1;
        if (i.status === 'open' && i.clientNote) out.sentBack += 1;
    }
    out.closed = out.done + out.verified;
    out.pct = out.total ? Math.round((out.closed / out.total) * 100) : 0;
    return out;
};

/** "5 of 8 done" / "All 8 verified" / "No items". */
export const progressLabel = (p: PunchProgress): string => {
    if (!p.total) return 'No items';
    if (p.verified === p.total) return `All ${p.total} verified`;
    if (p.closed === p.total) return `All ${p.total} done`;
    return `${p.closed} of ${p.total} done`;
};

/** Per-job progress from summary rows (job_id + status + due_on), for the job page and the pipeline. */
export const progressByJob = (rows: ReadonlyArray<{ job_id?: string | null; jobId?: string; status?: string; due_on?: string | null; dueOn?: string; client_note?: string | null }>, today = ''): Map<string, PunchProgress> => {
    const groups = new Map<string, Array<Pick<PunchItem, 'status' | 'dueOn' | 'clientNote'>>>();
    for (const r of rows) {
        const job = str(r.job_id ?? r.jobId);
        if (!job) continue;
        const list = groups.get(job) || [];
        list.push({ status: isStatus(r.status) ? r.status : 'open', dueOn: ymd(r.due_on ?? r.dueOn), clientNote: str(r.client_note) });
        groups.set(job, list);
    }
    const out = new Map<string, PunchProgress>();
    groups.forEach((list, job) => out.set(job, punchProgress(list, today)));
    return out;
};

// ---------------------------------------------------------------------------------------------
// Ordering and grouping
// ---------------------------------------------------------------------------------------------
const STATUS_RANK: Record<PunchStatus, number> = { open: 0, done: 1, verified: 2 };

/** Open first (sent back, then overdue, then by due date), then done, then verified; then the list order. */
export const sortPunchItems = (items: readonly PunchItem[], today = ''): PunchItem[] =>
    [...items].sort((a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status]
        || (a.status === 'open' ? Number(!!b.clientNote) - Number(!!a.clientNote) : 0)
        || (a.status === 'open' && today ? Number(!!b.dueOn && b.dueOn < today) - Number(!!a.dueOn && a.dueOn < today) : 0)
        || (a.status === 'open' ? (a.dueOn || '9999').localeCompare(b.dueOn || '9999') : 0)
        || a.position - b.position
        || a.createdAt.localeCompare(b.createdAt)
        || a.id.localeCompare(b.id));

export type PunchFilter = 'open' | 'done' | 'verified' | 'all';

export const filterPunchItems = (items: readonly PunchItem[], filter: PunchFilter): PunchItem[] =>
    filter === 'all' ? [...items] : items.filter(i => i.status === filter);

export const GENERAL_AREA = 'General';

/** Items by room / area (areas in first-seen order of the sorted list, "General" last). */
export const groupByArea = (items: readonly PunchItem[]): Array<{ area: string; items: PunchItem[] }> => {
    const map = new Map<string, PunchItem[]>();
    for (const i of items) {
        const key = i.area || GENERAL_AREA;
        const list = map.get(key) || [];
        list.push(i);
        map.set(key, list);
    }
    const groups = Array.from(map.entries()).map(([area, list]) => ({ area, items: list }));
    return [...groups.filter(g => g.area !== GENERAL_AREA), ...groups.filter(g => g.area === GENERAL_AREA)];
};

/** Areas already used on the job (suggestions for the next item), most used first. */
export const knownAreas = (items: readonly PunchItem[]): string[] => {
    const count = new Map<string, number>();
    for (const i of items) if (i.area) count.set(i.area, (count.get(i.area) || 0) + 1);
    return Array.from(count.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([a]) => a);
};

/** Position for a new item: after the last one. */
export const nextPosition = (items: readonly Pick<PunchItem, 'position'>[]): number =>
    items.reduce((max, i) => Math.max(max, i.position), 0) + 10;

// ---------------------------------------------------------------------------------------------
// Quick add: "Kitchen: touch up paint @Mike"
// ---------------------------------------------------------------------------------------------
/**
 * One line typed on a phone → title, area and assignee. "Area: title" sets the area (up to 40 characters before the
 * colon, no digits-only prefix like "10:30"); a trailing "@Name" sets the assignee. Without an area prefix the last
 * area used is kept (`stickyArea`), so a walk through one room is quick.
 */
export const parseQuickAdd = (text: string, stickyArea = ''): { title: string; area: string; assignee: string } | null => {
    let t = str(text).replace(/\s+/g, ' ');
    if (!t) return null;
    let assignee = '';
    const at = /\s@([\p{L}][\p{L}\p{N}.'-]*(?:\s[\p{L}][\p{L}\p{N}.'-]*)?)$/u.exec(t);
    if (at) {
        assignee = at[1].trim();
        t = t.slice(0, at.index).trim();
    }
    if (/^[^:]{1,40}:$/.test(t)) return null; // only a room, nothing to add yet
    let area = stickyArea;
    const colon = /^([^:]{1,40}):\s*(.+)$/.exec(t);
    if (colon && !/^\d+$/.test(colon[1].trim())) {
        area = colon[1].trim();
        t = colon[2].trim();
    }
    if (!t) return null;
    return { title: t.slice(0, 300), area: area.slice(0, 120), assignee: assignee.slice(0, 120) };
};

// ---------------------------------------------------------------------------------------------
// Client portal
// ---------------------------------------------------------------------------------------------
export interface PortalPunchItem {
    id: string;
    title: string;
    area: string;
    status: PunchStatus;
    dueOn: string;
    verifiedBy: PunchActor | null;
    verifiedAt: string | null;
    clientNote: string;
    beforePath: string | null;
    afterPath: string | null;
}

export interface PortalPunchJob {
    jobId: string;
    jobName: string;
    items: PortalPunchItem[];
    progress: PunchProgress;
}

/** get_portal_punch_list() → jobs with items (bad rows are dropped, never throws). */
export const parsePortalPunch = (data: unknown): PortalPunchJob[] => {
    if (!Array.isArray(data)) return [];
    const out: PortalPunchJob[] = [];
    for (const j of data) {
        if (!j || typeof j !== 'object') continue;
        const raw = Array.isArray((j as any).items) ? (j as any).items : [];
        const items: PortalPunchItem[] = raw
            .filter((i: any) => i && typeof i === 'object' && str(i.id) && str(i.title))
            .map((i: any) => ({
                id: str(i.id),
                title: str(i.title),
                area: str(i.area),
                status: isStatus(i.status) ? i.status : 'open',
                dueOn: ymd(i.due_on),
                verifiedBy: i.verified_by === 'client' || i.verified_by === 'contractor' ? i.verified_by : null,
                verifiedAt: i.verified_at ? String(i.verified_at) : null,
                clientNote: str(i.client_note),
                beforePath: typeof i.before_path === 'string' && i.before_path ? i.before_path : null,
                afterPath: typeof i.after_path === 'string' && i.after_path ? i.after_path : null,
            }));
        if (!items.length) continue;
        out.push({
            jobId: str((j as any).job_id),
            jobName: str((j as any).job_name) || 'Job',
            items,
            progress: punchProgress(items.map(i => ({ status: i.status, dueOn: i.dueOn, clientNote: i.clientNote }))),
        });
    }
    return out;
};

/** What the client can do with an item in the portal. */
export const portalActionsFor = (item: Pick<PortalPunchItem, 'status' | 'verifiedBy'>): { looksGood: boolean; needsWork: boolean } => ({
    looksGood: canTransition(item, 'verified', 'client'),
    needsWork: canTransition(item, 'open', 'client'),
});

// ---------------------------------------------------------------------------------------------
// "Punch list" section (rich text for the Note document of the PDF pipeline)
// ---------------------------------------------------------------------------------------------
export interface PunchReportPhotos { before?: string | null; after?: string | null }

const fmtDay = (v: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (!m) return '';
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const STATUS_COLOR: Record<PunchStatus, string> = { open: '#b45309', done: '#2148ed', verified: '#15803d' };

/**
 * Body of the "Punch list" Note: a progress line, then one table per area (No., item, assignee, due, status) and,
 * under an item, its before / after photos when given (data: or https: sources only; anything else is left out).
 * Every text is escaped.
 */
export const buildPunchListHtml = (input: {
    items: readonly PunchItem[];
    photos?: Record<string, PunchReportPhotos>;
    today?: string;
    intro?: string;
}): string => {
    const today = input.today || '';
    const sorted = sortPunchItems(input.items, today);
    const p = punchProgress(sorted, today);
    const parts: string[] = [];
    if (input.intro) parts.push(`<p>${esc(input.intro)}</p>`);
    parts.push(`<p><strong>${esc(progressLabel(p))}</strong> · ${p.open} open · ${p.done} done · ${p.verified} verified${p.overdue ? ` · ${p.overdue} overdue` : ''}</p>`);
    if (!sorted.length) {
        parts.push('<p>No items on this punch list.</p>');
        return parts.join('');
    }
    const okSrc = (s: string | null | undefined) => (s && /^(data:image\/(png|jpe?g|webp);base64,|https:\/\/)/i.test(s) ? s : '');
    let n = 0;
    for (const group of groupByArea(sorted)) {
        parts.push(`<h3>${esc(group.area)}</h3>`);
        const rows = group.items.map(i => {
            n += 1;
            const status = i.status === 'verified' && i.verifiedBy === 'client' ? 'Verified by client' : punchStatusLabel(i.status);
            const ph = input.photos?.[i.id];
            const before = okSrc(ph?.before);
            const after = okSrc(ph?.after);
            const sub = [
                i.notes ? `<br><span style="font-size: 11px; color: #475569;">${esc(i.notes)}</span>` : '',
                i.clientNote ? `<br><span style="font-size: 11px; color: #b45309;">Client: ${esc(i.clientNote)}</span>` : '',
            ].join('');
            const photoRow = before || after
                ? `<tr><td></td><td colspan="4" style="padding: 4px 6px 10px;">${[before ? `<img src="${esc(before)}" alt="Before" style="width: 46%; max-width: 46%; border-radius: 4px; margin-right: 2%;" />` : '', after ? `<img src="${esc(after)}" alt="After" style="width: 46%; max-width: 46%; border-radius: 4px;" />` : ''].join('')}</td></tr>`
                : '';
            return `<tr><td style="padding: 4px 6px; width: 6%; vertical-align: top;">${n}</td><td style="padding: 4px 6px; vertical-align: top;">${esc(i.title)}${sub}</td><td style="padding: 4px 6px; width: 16%; vertical-align: top;">${esc(i.assignee)}</td><td style="padding: 4px 6px; width: 16%; vertical-align: top;">${esc(fmtDay(i.dueOn))}</td><td style="padding: 4px 6px; width: 18%; vertical-align: top; color: ${STATUS_COLOR[i.status]}; font-weight: 600;">${esc(status)}</td></tr>${photoRow}`;
        }).join('');
        parts.push(`<table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;"><thead><tr><th style="text-align: left; padding: 4px 6px;">No.</th><th style="text-align: left; padding: 4px 6px;">Item</th><th style="text-align: left; padding: 4px 6px;">Assigned</th><th style="text-align: left; padding: 4px 6px;">Due</th><th style="text-align: left; padding: 4px 6px;">Status</th></tr></thead><tbody>${rows}</tbody></table>`);
    }
    return parts.join('');
};

/** App event after an offline punch item reached the account (App.tsx onSynced → the open punch list reloads). */
export const PUNCH_SYNCED_EVENT = 'cd:punch-synced';

/** Tag on the Note documents saved from the punch list (so they can be told apart). */
export const PUNCH_NOTE_TAG = 'Punch list';
