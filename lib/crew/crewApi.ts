/**
 * Owner side of crew clock-in (signed in): crew members, their links, job assignments, job site pins and punches.
 * Plain owner-RLS reads and writes plus two RPCs (crew_links, crew_member_link). Every read reports
 * CrewUnavailableError when the migration 20261115000100_crew_clock_in.sql is not applied yet, so the app hides the
 * feature instead of failing (lib/crew/crewFeature.ts).
 */
import { supabase } from '../supabase.ts';
import {
    CREW_LIMITS, DEFAULT_SITE_RADIUS_M, buildSessions, classifyCrewError, isCrewBackendMissing, isValidLatLng, mapPunchRow, missedClockOutAt,
    newClientId, type JobSite, type Punch, type PunchKind,
} from './crewLogic.ts';
import { CREW_PHOTOS_BUCKET } from './crewPublicApi.ts';

export class CrewUnavailableError extends Error {
    constructor() {
        super('Crew clock-in is not available yet.');
        this.name = 'CrewUnavailableError';
    }
}

export class CrewActionError extends Error {
    readonly kind: string;
    constructor(kind: string, message: string) {
        super(message);
        this.name = 'CrewActionError';
        this.kind = kind;
    }
}

const raise = (error: unknown): never => {
    if (isCrewBackendMissing(error as any)) throw new CrewUnavailableError();
    const c = classifyCrewError(error as any);
    throw new CrewActionError(c.kind, c.message);
};

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------
export interface CrewMember {
    id: string;
    name: string;
    phone: string;
    email: string;
    costRate: number | null;
    active: boolean;
    linkOn: boolean;
    linkCreatedAt: string | null;
    lastSeenAt: string | null;
    createdAt: string | null;
}

export interface CrewAssignment {
    id: string;
    memberId: string;
    jobId: string;
    startsOn: string | null;
    endsOn: string | null;
}

export interface CrewData {
    members: CrewMember[];
    assignments: CrewAssignment[];
    /** member id → link token (active members with the link on) */
    links: Record<string, string>;
    sites: Record<string, JobSite>;
}

const MEMBER_COLUMNS = 'id, name, phone, email, cost_rate, active, link_nonce, link_created_at, last_seen_at, created_at';
const PUNCH_COLUMNS = 'id, client_id, member_id, job_id, kind, at, original_at, lat, lng, accuracy_m, location_status, distance_m, note, photo_path, source, edited_at, approved_at, timesheet_id';

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const n = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
};

export const mapMemberRow = (r: Record<string, unknown>): CrewMember => ({
    id: s(r.id),
    name: s(r.name),
    phone: s(r.phone),
    email: s(r.email),
    costRate: n(r.cost_rate),
    active: r.active !== false,
    linkOn: Boolean(r.link_nonce),
    linkCreatedAt: s(r.link_created_at) || null,
    lastSeenAt: s(r.last_seen_at) || null,
    createdAt: s(r.created_at) || null,
});

const mapAssignment = (r: Record<string, unknown>): CrewAssignment => ({
    id: s(r.id), memberId: s(r.member_id), jobId: s(r.job_id), startsOn: s(r.starts_on) || null, endsOn: s(r.ends_on) || null,
});

const mapSite = (r: Record<string, unknown>): JobSite | null => {
    const v = { lat: n(r.lat) ?? NaN, lng: n(r.lng) ?? NaN };
    return isValidLatLng(v) ? { ...v, radiusM: n(r.radius_m) ?? DEFAULT_SITE_RADIUS_M, label: s(r.label) || null } : null;
};

// ---------------------------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------------------------
/** 'ready' when the crew tables exist, 'missing' when they don't (feature hidden), 'error' when unknown (offline…). */
export async function probeCrewBackend(): Promise<'ready' | 'missing' | 'error'> {
    try {
        const { error } = await supabase.from('crew_members').select('id').limit(1);
        if (!error) return 'ready';
        return isCrewBackendMissing(error as any) ? 'missing' : 'error';
    } catch {
        return 'error';
    }
}

export async function loadCrewData(): Promise<CrewData> {
    const [m, a, l, st] = await Promise.all([
        supabase.from('crew_members').select(MEMBER_COLUMNS).order('name', { ascending: true }).limit(CREW_LIMITS.members + 50),
        supabase.from('crew_assignments').select('id, member_id, job_id, starts_on, ends_on').limit(5000),
        supabase.rpc('crew_links'),
        supabase.from('crew_job_sites').select('job_id, lat, lng, radius_m, label').limit(5000),
    ]);
    if (m.error) raise(m.error);
    if (a.error) raise(a.error);
    const links: Record<string, string> = {};
    if (!l.error && Array.isArray(l.data)) {
        for (const row of l.data as Array<{ member_id?: string; token?: string }>) if (row?.member_id && row?.token) links[row.member_id] = row.token;
    }
    const sites: Record<string, JobSite> = {};
    if (!st.error) for (const row of (st.data || []) as Array<Record<string, unknown>>) { const site = mapSite(row); if (site) sites[s(row.job_id)] = site; }
    return {
        members: ((m.data || []) as Array<Record<string, unknown>>).map(mapMemberRow),
        assignments: ((a.data || []) as Array<Record<string, unknown>>).map(mapAssignment),
        links,
        sites,
    };
}

/** Punches between two instants (ISO), oldest first; optionally one worker / one job. */
export async function loadPunches(range: { from: string; to: string; memberId?: string; jobId?: string }): Promise<Punch[]> {
    const out: Punch[] = [];
    const PAGE = 1000;
    for (let page = 0; page < 10; page++) {
        let q = supabase.from('time_punches').select(PUNCH_COLUMNS).gte('at', range.from).lt('at', range.to);
        if (range.memberId) q = q.eq('member_id', range.memberId);
        if (range.jobId) q = q.eq('job_id', range.jobId);
        const { data, error } = await q.order('at', { ascending: true }).order('id', { ascending: true }).range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) raise(error);
        const rows = (data || []) as Array<Record<string, unknown>>;
        out.push(...rows.map(mapPunchRow));
        if (rows.length < PAGE) break;
    }
    return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Members + links
// ---------------------------------------------------------------------------------------------------------------------
export interface MemberInput {
    name: string;
    phone?: string;
    email?: string;
    costRate?: number | null;
    active?: boolean;
}

const memberPayload = (input: MemberInput) => ({
    name: input.name.trim().slice(0, CREW_LIMITS.name),
    phone: (input.phone || '').trim().slice(0, CREW_LIMITS.phone) || null,
    email: (input.email || '').trim().toLowerCase().slice(0, CREW_LIMITS.email) || null,
    cost_rate: input.costRate === null || input.costRate === undefined || !Number.isFinite(input.costRate) ? null : Math.min(CREW_LIMITS.maxRate, Math.max(0, input.costRate)),
    ...(input.active === undefined ? {} : { active: input.active }),
});

export async function createMember(input: MemberInput): Promise<{ member: CrewMember; token: string | null }> {
    const { data, error } = await supabase.from('crew_members').insert(memberPayload(input)).select(MEMBER_COLUMNS).single();
    if (error) raise(error);
    const member = mapMemberRow(data as Record<string, unknown>);
    const links = await supabase.rpc('crew_links');
    const token = !links.error && Array.isArray(links.data)
        ? String((links.data as Array<{ member_id?: string; token?: string }>).find(r => r?.member_id === member.id)?.token || '') || null
        : null;
    return { member, token };
}

export async function updateMember(id: string, input: MemberInput): Promise<CrewMember> {
    const { data, error } = await supabase.from('crew_members').update(memberPayload(input)).eq('id', id).select(MEMBER_COLUMNS).single();
    if (error) raise(error);
    return mapMemberRow(data as Record<string, unknown>);
}

/** 'new' = a new link (the old one stops working at once); 'off' = no link. Returns the new token (null when off). */
export async function setMemberLink(id: string, action: 'new' | 'off'): Promise<string | null> {
    const { data, error } = await supabase.rpc('crew_member_link', { p_member_id: id, p_action: action });
    if (error) raise(error);
    const token = (data as { token?: string | null } | null)?.token;
    return token ? String(token) : null;
}

/** Removes the worker, their assignments, their punches and their photos (time sheets already made stay). */
export async function deleteMember(id: string, ownerId: string): Promise<void> {
    try {
        const folder = `${ownerId}/${id}`;
        const { data } = await supabase.storage.from(CREW_PHOTOS_BUCKET).list(folder, { limit: 1000 });
        const paths = (data || []).map(f => `${folder}/${f.name}`);
        if (paths.length) await supabase.storage.from(CREW_PHOTOS_BUCKET).remove(paths);
    } catch { /* photos are best effort */ }
    const { error } = await supabase.from('crew_members').delete().eq('id', id);
    if (error) raise(error);
}

// ---------------------------------------------------------------------------------------------------------------------
// Assignments + job sites
// ---------------------------------------------------------------------------------------------------------------------
export async function assignJob(memberId: string, jobId: string): Promise<CrewAssignment> {
    const { data, error } = await supabase.from('crew_assignments')
        .upsert({ member_id: memberId, job_id: jobId }, { onConflict: 'member_id,job_id', ignoreDuplicates: false })
        .select('id, member_id, job_id, starts_on, ends_on').single();
    if (error) raise(error);
    return mapAssignment(data as Record<string, unknown>);
}

export async function unassignJob(memberId: string, jobId: string): Promise<void> {
    const { error } = await supabase.from('crew_assignments').delete().eq('member_id', memberId).eq('job_id', jobId);
    if (error) raise(error);
}

/** Saves (or with null removes) a job's site pin. */
export async function saveJobSite(jobId: string, site: JobSite | null): Promise<JobSite | null> {
    if (!site) {
        const { error } = await supabase.from('crew_job_sites').delete().eq('job_id', jobId);
        if (error) raise(error);
        return null;
    }
    const radius = Math.min(CREW_LIMITS.siteRadiusMax, Math.max(CREW_LIMITS.siteRadiusMin, Math.round(site.radiusM || DEFAULT_SITE_RADIUS_M)));
    const { data, error } = await supabase.from('crew_job_sites')
        .upsert({ job_id: jobId, lat: site.lat, lng: site.lng, radius_m: radius, label: site.label || null }, { onConflict: 'job_id' })
        .select('job_id, lat, lng, radius_m, label').single();
    if (error) raise(error);
    return mapSite(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------------------------------------------------
// Punches (owner fixes)
// ---------------------------------------------------------------------------------------------------------------------
/** A punch the owner adds (a forgotten clock-out, a whole missed day). Saved as an owner punch, no location. */
export async function addOwnerPunch(input: { memberId: string; jobId: string; kind: PunchKind; at: string; note?: string }): Promise<Punch> {
    const { data, error } = await supabase.from('time_punches').insert({
        member_id: input.memberId, job_id: input.jobId, kind: input.kind, at: input.at, note: input.note?.trim() || null,
        client_id: `o${newClientId()}`.slice(0, 64),
    }).select(PUNCH_COLUMNS).single();
    if (error) raise(error);
    return mapPunchRow(data as Record<string, unknown>);
}

/** Changes the time, kind or job of a punch (the worker's original time is kept by the database). */
export async function updatePunch(id: string, patch: { at?: string; kind?: PunchKind; jobId?: string; note?: string | null }): Promise<Punch> {
    const body: Record<string, unknown> = {};
    if (patch.at !== undefined) body.at = patch.at;
    if (patch.kind !== undefined) body.kind = patch.kind;
    if (patch.jobId !== undefined) body.job_id = patch.jobId;
    if (patch.note !== undefined) body.note = patch.note?.trim() || null;
    const { data, error } = await supabase.from('time_punches').update(body).eq('id', id).select(PUNCH_COLUMNS).single();
    if (error) raise(error);
    return mapPunchRow(data as Record<string, unknown>);
}

export async function deletePunch(p: Pick<Punch, 'id' | 'photoPath'>): Promise<void> {
    if (p.photoPath) { try { await supabase.storage.from(CREW_PHOTOS_BUCKET).remove([p.photoPath]); } catch { /* best effort */ } }
    const { error } = await supabase.from('time_punches').delete().eq('id', p.id);
    if (error) raise(error);
}

const chunks = <T,>(list: readonly T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
};

/** Approves (or un-approves) punches; returns the approval time written (null when cleared). */
export async function setPunchesApproved(ids: readonly string[], approved: boolean): Promise<string | null> {
    const at = approved ? new Date().toISOString() : null;
    for (const part of chunks(ids.filter(id => !id.startsWith('local:')), 150)) {
        const { error } = await supabase.from('time_punches').update({ approved_at: at }).in('id', part);
        if (error) raise(error);
    }
    return at;
}

export async function linkPunchesToTimesheet(ids: readonly string[], docId: string): Promise<void> {
    for (const part of chunks(ids.filter(id => !id.startsWith('local:')), 150)) {
        const { error } = await supabase.from('time_punches').update({ timesheet_id: docId }).in('id', part);
        if (error) raise(error);
    }
}

/** A short-lived link to a punch photo (null when it never arrived). */
export async function punchPhotoUrl(path: string): Promise<string | null> {
    try {
        const { data, error } = await supabase.storage.from(CREW_PHOTOS_BUCKET).createSignedUrl(path, 3600);
        if (error) return null;
        return data?.signedUrl || null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Missed clock-outs (notification bell)
// ---------------------------------------------------------------------------------------------------------------------
export interface MissedClockOut {
    punchId: string;
    memberId: string;
    memberName: string;
    jobId: string;
    jobName: string;
    /** clock-in time (ISO) */
    since: string;
    /** when it became a missed clock-out (ISO) */
    overdueAt: string;
}

/** Workers still clocked in when they shouldn't be (last 3 days). Null = feature not in the database / not readable. */
export async function fetchMissedClockOuts(now = Date.now()): Promise<MissedClockOut[] | null> {
    try {
        const from = new Date(now - 3 * 86_400_000).toISOString();
        const { data, error } = await supabase.from('time_punches').select('id, member_id, job_id, kind, at, source, edited_at')
            .gte('at', from).order('at', { ascending: true }).limit(3000);
        if (error) return null;
        const punches = ((data || []) as Array<Record<string, unknown>>).map(mapPunchRow);
        const open = buildSessions(punches, { now }).filter(x => x.open && x.flags.includes('missing_out') && x.inPunch);
        if (!open.length) return [];
        const memberIds = Array.from(new Set(open.map(x => x.memberId)));
        const jobIds = Array.from(new Set(open.map(x => x.jobId)));
        const [m, j] = await Promise.all([
            supabase.from('crew_members').select('id, name').in('id', memberIds),
            supabase.from('jobs').select('id, name').in('id', jobIds),
        ]);
        const names = new Map(((m.data || []) as Array<{ id: string; name: string }>).map(r => [r.id, r.name]));
        const jobs = new Map(((j.data || []) as Array<{ id: string; name: string }>).map(r => [r.id, r.name]));
        return open.map(x => ({
            punchId: x.inPunch!.id,
            memberId: x.memberId,
            memberName: names.get(x.memberId) || 'A crew member',
            jobId: x.jobId,
            jobName: jobs.get(x.jobId) || '',
            since: new Date(x.start).toISOString(),
            overdueAt: new Date(missedClockOutAt(x.start)).toISOString(),
        }));
    } catch {
        return null;
    }
}
