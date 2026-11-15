/**
 * Client portal (/?portal=<key>): client selections and shared mood boards (roadmap D5). Wrappers for the SQL
 * functions of supabase/migrations/20261116000600_selections_boards.sql. Same fallback as lib/portal/questionsApi.ts:
 * while a function does not exist (migration not applied) the call answers { status: 'missing' } and the portal
 * renders NOTHING new (stays exactly as today). Remembered until reload. Never throws.
 *
 *   loadPortalSelections(key, jobId?)  -> PortalResult<PortalSelection[]>
 *   choosePortalSelection(key, selectionId, { optionId, comment?, name? })
 *                                      -> { status: 'ready', data: PortalSelection } | { status: 'already' }
 *                                         | { status: 'invalid' } | { status: 'missing' } | { status: 'error', message }
 *        'already': a choice was made before (the contractor must "ask again" first): reload the list
 *   loadPortalBoards(key, jobId?)      -> PortalResult<PortalBoard[]>
 *   portalSelectionsFeature() / portalBoardsFeature()   'unknown' | 'ready' | 'missing'
 *   canChoose(selection)               -> boolean   (status 'sent')
 *
 *   PortalSelection {
 *     id, jobId, jobName, title, category, room, body, dueDate, sentAt,
 *     status: 'sent' | 'chosen' | 'approved' | 'changes_requested' | 'ordered',
 *     allowance: number | null,
 *     chosenOptionId, clientComment, chosenBy, chosenAt, approvedAt,
 *     options: {
 *       id, name, description, path (public image copy), imageUrl (its public URL), url (https product link),
 *       unit, qty, unitPrice, total (unitPrice × qty),
 *       difference: number | null   (total − allowance: > 0 upgrade the client pays, < 0 credit; null = no allowance)
 *     }[]
 *     history: { at, by: 'owner' | 'client', action: 'sent' | 'reopened' | 'chosen' | 'approved' | 'changes_requested' | 'ordered', note }[]
 *   }
 *   PortalBoard { id, jobId, jobName, title,
 *     items: { id, kind: 'image' | 'link' | 'note' | 'color', title, caption, url, path, imageUrl, color }[] }
 *        (image: imageUrl = the public copy, else its https link; link: url; note: title / caption; color: '#rrggbb')
 *
 * Reads are stable SQL functions (lib/offline/writePathScan.ts READ_ONLY_RPCS); the choice is a public write
 * (lib/offline/writePathAudit.ts 'public').
 */
import { supabase } from '../supabase.ts';
import { isMissingBackendError } from '../../components/requests/requestLogic.ts';
import type { PortalFeatureState, PortalResult } from './questionsApi.ts';

export type { PortalFeatureState, PortalResult } from './questionsApi.ts';

export type PortalSelectionStatus = 'sent' | 'chosen' | 'approved' | 'changes_requested' | 'ordered';
export type PortalChooseResult = PortalResult<PortalSelection> | { status: 'already' };

export interface PortalSelectionOption {
    id: string;
    name: string;
    description: string | null;
    path: string | null;
    imageUrl: string | null;
    url: string | null;
    unit: string | null;
    qty: number;
    unitPrice: number;
    total: number;
    difference: number | null;
}

export interface PortalSelectionHistoryEntry {
    at: string;
    by: 'owner' | 'client';
    action: string;
    note: string | null;
}

export interface PortalSelection {
    id: string;
    jobId: string;
    jobName: string;
    title: string;
    category: string | null;
    room: string | null;
    body: string | null;
    dueDate: string | null;
    sentAt: string | null;
    status: PortalSelectionStatus;
    allowance: number | null;
    chosenOptionId: string | null;
    clientComment: string | null;
    chosenBy: string | null;
    chosenAt: string | null;
    approvedAt: string | null;
    options: PortalSelectionOption[];
    history: PortalSelectionHistoryEntry[];
}

export interface PortalBoardItem {
    id: string;
    kind: 'image' | 'link' | 'note' | 'color';
    title: string | null;
    caption: string | null;
    url: string | null;
    path: string | null;
    imageUrl: string | null;
    color: string | null;
}

export interface PortalBoard {
    id: string;
    jobId: string;
    jobName: string;
    title: string;
    items: PortalBoardItem[];
}

const PORTAL_PUBLIC_BUCKET = 'portal-photos';
const PORTAL_KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTION_ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
const STATUSES: readonly PortalSelectionStatus[] = ['sent', 'chosen', 'approved', 'changes_requested', 'ordered'];
const ITEM_KINDS = ['image', 'link', 'note', 'color'] as const;

let selectionsFeature: PortalFeatureState = 'unknown';
let boardsFeature: PortalFeatureState = 'unknown';
export const portalSelectionsFeature = (): PortalFeatureState => selectionsFeature;
export const portalBoardsFeature = (): PortalFeatureState => boardsFeature;

type ErrLike = { code?: string; message?: string; hint?: string } | null | undefined;
const isInvalidLink = (e: ErrLike): boolean => !!e && (e.code === '28000' || /invalid portal link/i.test(String(e.message || '')));
const isAlready = (e: ErrLike): boolean => !!e && (e.hint === 'already_chosen' || /ALREADY_CHOSEN/.test(String(e.message || '')));
const readable = (e: ErrLike, fallback: string): string =>
    String(e?.message || fallback).replace(/^[A-Z_]+:\s*/, '') || fallback;

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const publicUrl = (path: string | null): string | null =>
    path ? supabase.storage.from(PORTAL_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl : null;
const safeHref = (url: string | null): string | null => (url && /^https:\/\//i.test(url) ? url : null);
const safeColor = (c: unknown): string | null => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);

export const canChoose = (s: Pick<PortalSelection, 'status'>): boolean => s.status === 'sent';

export const parsePortalSelection = (raw: unknown): PortalSelection | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string') return null;
    return {
        id: r.id,
        jobId: String(r.job_id ?? ''),
        jobName: String(r.job_name ?? ''),
        title: String(r.title ?? ''),
        category: str(r.category),
        room: str(r.room),
        body: str(r.body),
        dueDate: str(r.due_date),
        sentAt: str(r.sent_at),
        status: STATUSES.includes(r.status as PortalSelectionStatus) ? (r.status as PortalSelectionStatus) : 'sent',
        allowance: num(r.allowance),
        chosenOptionId: str(r.chosen_option_id),
        clientComment: str(r.client_comment),
        chosenBy: str(r.chosen_by),
        chosenAt: str(r.chosen_at),
        approvedAt: str(r.approved_at),
        options: (Array.isArray(r.options) ? r.options : []).filter(o => o && typeof o === 'object' && typeof (o as Record<string, unknown>).id === 'string').map((o) => {
            const x = o as Record<string, unknown>;
            const path = str(x.path);
            const qty = num(x.qty) ?? 1;
            const unitPrice = num(x.unit_price) ?? 0;
            return {
                id: String(x.id),
                name: String(x.name ?? ''),
                description: str(x.description),
                path,
                imageUrl: publicUrl(path),
                url: safeHref(str(x.url)),
                unit: str(x.unit),
                qty,
                unitPrice,
                total: num(x.total) ?? Math.round(unitPrice * qty * 100) / 100,
                difference: num(x.difference),
            };
        }),
        history: (Array.isArray(r.history) ? r.history : []).filter(h => h && typeof h === 'object').map((h) => {
            const o = h as Record<string, unknown>;
            return { at: String(o.at ?? ''), by: o.by === 'client' ? 'client' : 'owner', action: String(o.action ?? ''), note: str(o.note) } as PortalSelectionHistoryEntry;
        }),
    };
};

export const parsePortalBoard = (raw: unknown): PortalBoard | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string') return null;
    return {
        id: r.id,
        jobId: String(r.job_id ?? ''),
        jobName: String(r.job_name ?? ''),
        title: String(r.title ?? ''),
        items: (Array.isArray(r.items) ? r.items : [])
            .filter(i => i && typeof i === 'object' && (ITEM_KINDS as readonly unknown[]).includes((i as Record<string, unknown>).kind))
            .map((i) => {
                const o = i as Record<string, unknown>;
                const kind = o.kind as PortalBoardItem['kind'];
                const url = safeHref(str(o.url));
                const path = str(o.path);
                return {
                    id: String(o.id ?? ''),
                    kind,
                    title: str(o.title),
                    caption: str(o.caption),
                    url,
                    path,
                    imageUrl: kind === 'image' ? (publicUrl(path) ?? url) : null,
                    color: kind === 'color' ? safeColor(o.color) : null,
                };
            })
            .filter(i => (i.kind !== 'image' || i.imageUrl) && (i.kind !== 'link' || i.url) && (i.kind !== 'color' || i.color)),
    };
};

const listOf = <T>(data: unknown, parse: (x: unknown) => T | null): T[] =>
    (Array.isArray(data) ? data : []).map(parse).filter((x): x is T => x !== null);

/** Selections sent to this client (optionally one job). */
export async function loadPortalSelections(portalKey: string, jobId?: string | null): Promise<PortalResult<PortalSelection[]>> {
    if (selectionsFeature === 'missing') return { status: 'missing' };
    if (!PORTAL_KEY_RE.test(portalKey || '')) return { status: 'invalid' };
    if (jobId && !UUID_RE.test(jobId)) return { status: 'invalid' };
    try {
        const { data, error } = await supabase.rpc('get_portal_selections', { p_key: portalKey, p_job_id: jobId || null });
        if (error) {
            if (isMissingBackendError(error)) { selectionsFeature = 'missing'; return { status: 'missing' }; }
            if (isInvalidLink(error)) return { status: 'invalid' };
            return { status: 'error', message: readable(error, 'Could not load the selections.') };
        }
        selectionsFeature = 'ready';
        return { status: 'ready', data: listOf(data, parsePortalSelection) };
    } catch (e) {
        if (isMissingBackendError(e as any)) { selectionsFeature = 'missing'; return { status: 'missing' }; }
        return { status: 'error', message: e instanceof Error ? e.message : 'Could not load the selections.' };
    }
}

/** The client's choice: one option, an optional comment and name. */
export async function choosePortalSelection(
    portalKey: string,
    selectionId: string,
    input: { optionId: string; comment?: string | null; name?: string | null },
): Promise<PortalChooseResult> {
    if (selectionsFeature === 'missing') return { status: 'missing' };
    if (!PORTAL_KEY_RE.test(portalKey || '') || !UUID_RE.test(selectionId || '')) return { status: 'invalid' };
    if (!OPTION_ID_RE.test(input?.optionId || '')) return { status: 'error', message: 'Please choose one of the options.' };
    try {
        const { data, error } = await supabase.rpc('choose_portal_selection', {
            p_key: portalKey,
            p_selection_id: selectionId,
            p_option_id: input.optionId,
            p_comment: (input.comment ?? '').slice(0, 2000) || null,
            p_name: (input.name ?? '').slice(0, 120) || null,
        });
        if (error) {
            if (isMissingBackendError(error)) { selectionsFeature = 'missing'; return { status: 'missing' }; }
            if (isInvalidLink(error)) return { status: 'invalid' };
            if (isAlready(error)) return { status: 'already' };
            return { status: 'error', message: readable(error, 'Your choice could not be sent.') };
        }
        const s = parsePortalSelection(data);
        return s ? { status: 'ready', data: s } : { status: 'error', message: 'Your choice could not be sent.' };
    } catch (e) {
        if (isMissingBackendError(e as any)) { selectionsFeature = 'missing'; return { status: 'missing' }; }
        return { status: 'error', message: e instanceof Error ? e.message : 'Your choice could not be sent.' };
    }
}

/** Mood boards the contractor shared. */
export async function loadPortalBoards(portalKey: string, jobId?: string | null): Promise<PortalResult<PortalBoard[]>> {
    if (boardsFeature === 'missing') return { status: 'missing' };
    if (!PORTAL_KEY_RE.test(portalKey || '')) return { status: 'invalid' };
    if (jobId && !UUID_RE.test(jobId)) return { status: 'invalid' };
    try {
        const { data, error } = await supabase.rpc('get_portal_boards', { p_key: portalKey, p_job_id: jobId || null });
        if (error) {
            if (isMissingBackendError(error)) { boardsFeature = 'missing'; return { status: 'missing' }; }
            if (isInvalidLink(error)) return { status: 'invalid' };
            return { status: 'error', message: readable(error, 'Could not load the mood boards.') };
        }
        boardsFeature = 'ready';
        return { status: 'ready', data: listOf(data, parsePortalBoard) };
    } catch (e) {
        if (isMissingBackendError(e as any)) { boardsFeature = 'missing'; return { status: 'missing' }; }
        return { status: 'error', message: e instanceof Error ? e.message : 'Could not load the mood boards.' };
    }
}
