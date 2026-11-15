/**
 * Mood boards: pure logic (no Supabase, no React). Shapes: lib/boards/boardTypes.ts.
 *
 *   parseColor(input)          -> '#rrggbb' | null   ('#abc', 'abc', '#AABBCC', 'rgb(1, 2, 3)' accepted)
 *   makeItemId()               -> 'i_xxxxxxxxxxxx'
 *   normalizeItems(list)       -> BoardItem[]   (valid, max 60, ids kept / made, each kind's shape; throws a readable Error)
 *   validateItem(item)         -> string | null
 *   moveItem(items, id, delta) -> BoardItem[]   (ordering: up / down by delta, clamped)
 *   reorderItems(items, ids)   -> BoardItem[]   (the given order; unknown ids ignored, missing ones kept at the end)
 *   addItem(items, input)      -> BoardItem[]   (appended; throws when full)
 *   removeItem(items, id)      -> BoardItem[]
 *   boardImagePath(userId, jobId, fileName, mime, random?)   private upload path
 *   countByKind(items)         -> Record<BoardItemKind, number>
 *   validateBoardDraft(draft)  -> string | null
 *   mapBoardRow(row) / boardInsertRow(...) / boardPatchRow(patch) / itemsToJson(items) / parseItems(json)
 */
import { privateImagePath, validateHttpsLink, type OptionImageMime } from '../selections/selectionLogic.ts';
import { BOARD_LIMITS, type BoardDraft, type BoardItem, type BoardItemInput, type BoardItemKind, type BoardPatch, type JobBoard } from './boardTypes.ts';

export const BOARD_ITEM_KINDS: readonly BoardItemKind[] = ['image', 'link', 'note', 'color'];

const cleanLine = (s: unknown, max: number): string => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const cleanBlock = (s: unknown, max: number): string | null => {
    const t = String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, max);
    return t || null;
};

// ------------------------------------------------------------------------------------------------ colours
/** A colour as '#rrggbb' (lower case), or null. */
export const parseColor = (input: unknown): string | null => {
    const s = String(input ?? '').trim().toLowerCase();
    if (!s) return null;
    let m = /^#?([0-9a-f]{6})$/.exec(s);
    if (m) return `#${m[1]}`;
    m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
    if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
    const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(s);
    if (rgb) {
        const parts = rgb.slice(1, 4).map(Number);
        if (parts.some(n => n > 255)) return null;
        return `#${parts.map(n => n.toString(16).padStart(2, '0')).join('')}`;
    }
    return null;
};

// ------------------------------------------------------------------------------------------------ items
const ITEM_ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
const IMAGE_PATH_RE = /^[0-9a-f-]{36}\/boards\/[0-9a-f-]{36}\/[a-z0-9]{8,32}-[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$/;
const PORTAL_PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{6,80}\.(jpg|png|webp)$/;

export const makeItemId = (): string => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(12);
    const c = globalThis.crypto;
    if (c?.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return `i_${Array.from(bytes, b => alphabet[b % alphabet.length]).join('')}`;
};

/** One item checked and cleaned (the same rules as guard_job_board). Throws a readable Error. */
const normalizeItem = (raw: BoardItemInput): BoardItem => {
    if (!raw || !BOARD_ITEM_KINDS.includes(raw.kind)) throw new Error('Choose what to add: image, link, note or colour.');
    const id = String(raw.id ?? '').trim() || makeItemId();
    if (!ITEM_ID_RE.test(id)) throw new Error('Invalid item id.');
    const title = cleanLine(raw.title, BOARD_LIMITS.itemTitle) || null;
    const caption = cleanBlock(raw.caption, BOARD_LIMITS.caption);
    let url: string | null = null;
    if (raw.url && String(raw.url).trim()) {
        const v = validateHttpsLink(String(raw.url));
        if (!v.ok) throw new Error(v.error);
        url = v.url;
    }
    let imagePath = raw.imagePath ? String(raw.imagePath) : null;
    if (imagePath && !IMAGE_PATH_RE.test(imagePath)) throw new Error('Invalid image.');
    let portalPath = raw.portalPath && PORTAL_PATH_RE.test(raw.portalPath) ? raw.portalPath : null;
    let color = raw.color ? parseColor(raw.color) : null;
    if (raw.color && !color) throw new Error('Write the colour as #RRGGBB.');
    switch (raw.kind) {
        case 'image':
            if (!imagePath && !url) throw new Error('Upload an image or paste an https link to one.');
            color = null;
            break;
        case 'link':
            if (!url) throw new Error('Paste an https link.');
            imagePath = null; color = null;
            break;
        case 'note':
            if (!title && !caption) throw new Error('Write the note.');
            imagePath = null; url = null; color = null;
            break;
        case 'color':
            if (!color) throw new Error('Pick a colour.');
            imagePath = null; url = null;
            break;
    }
    if (!imagePath) portalPath = null;
    return { id, kind: raw.kind, title, caption, url, imagePath, portalPath, color };
};

export const validateItem = (item: BoardItemInput): string | null => {
    try { normalizeItem(item); return null; } catch (e) { return e instanceof Error ? e.message : 'Check the item.'; }
};

export const normalizeItems = (list: readonly BoardItemInput[] | null | undefined): BoardItem[] => {
    const out: BoardItem[] = [];
    for (const raw of list || []) {
        if (!raw) continue;
        const item = normalizeItem(raw);
        if (out.some(x => x.id === item.id)) throw new Error('Two items have the same id.');
        out.push(item);
    }
    if (out.length > BOARD_LIMITS.items) throw new Error(`A board holds up to ${BOARD_LIMITS.items} items.`);
    return out;
};

export const addItem = (items: readonly BoardItem[], input: BoardItemInput): BoardItem[] => {
    if (items.length >= BOARD_LIMITS.items) throw new Error(`A board holds up to ${BOARD_LIMITS.items} items.`);
    return normalizeItems([...items, input]);
};

export const removeItem = (items: readonly BoardItem[], id: string): BoardItem[] => items.filter(i => i.id !== id);

export const moveItem = (items: readonly BoardItem[], id: string, delta: number): BoardItem[] => {
    const from = items.findIndex(i => i.id === id);
    if (from < 0 || !delta) return [...items];
    const to = Math.max(0, Math.min(items.length - 1, from + Math.trunc(delta)));
    const list = [...items];
    const [x] = list.splice(from, 1);
    list.splice(to, 0, x);
    return list;
};

export const reorderItems = (items: readonly BoardItem[], ids: readonly string[]): BoardItem[] => {
    const byId = new Map(items.map(i => [i.id, i]));
    const seen = new Set<string>();
    const out: BoardItem[] = [];
    for (const id of ids) {
        const it = byId.get(id);
        if (it && !seen.has(id)) { out.push(it); seen.add(id); }
    }
    for (const it of items) if (!seen.has(it.id)) out.push(it);
    return out;
};

export const countByKind = (items: readonly Pick<BoardItem, 'kind'>[]): Record<BoardItemKind, number> => {
    const out: Record<BoardItemKind, number> = { image: 0, link: 0, note: 0, color: 0 };
    for (const i of items) if (i.kind in out) out[i.kind] += 1;
    return out;
};

export const boardImagePath = (userId: string, jobId: string, fileName: string, mime: OptionImageMime, random?: string): string =>
    privateImagePath('boards', userId, jobId, fileName, mime, random);

export const validateBoardDraft = (d: Partial<BoardDraft>): string | null => {
    if (!cleanLine(d.title, BOARD_LIMITS.title)) return 'Give the board a name.';
    if (d.notes && String(d.notes).length > BOARD_LIMITS.notes) return `Keep the notes under ${BOARD_LIMITS.notes} characters.`;
    try { normalizeItems(d.items); } catch (e) { return e instanceof Error ? e.message : 'Check the items.'; }
    return null;
};

// ------------------------------------------------------------------------------------------------ rows
export const BOARD_COLUMNS = 'id, user_id, job_id, title, notes, items, shared_in_portal, created_at, updated_at';

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export const parseItems = (json: unknown): BoardItem[] => {
    if (!Array.isArray(json)) return [];
    return json
        .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object' && typeof (o as Record<string, unknown>).id === 'string'
            && BOARD_ITEM_KINDS.includes((o as Record<string, unknown>).kind as BoardItemKind))
        .map(o => ({
            id: String(o.id), kind: o.kind as BoardItemKind, title: str(o.title), caption: str(o.caption), url: str(o.url),
            imagePath: str(o.image_path), portalPath: str(o.portal_path), color: str(o.color),
        }));
};

export const mapBoardRow = (r: Record<string, unknown>): JobBoard => ({
    id: String(r.id),
    userId: String(r.user_id ?? ''),
    jobId: String(r.job_id ?? ''),
    title: String(r.title ?? ''),
    notes: str(r.notes),
    items: parseItems(r.items),
    sharedInPortal: r.shared_in_portal === true,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? r.created_at ?? ''),
});

export const itemsToJson = (items: readonly BoardItem[]): Record<string, unknown>[] =>
    items.map(i => ({
        id: i.id, kind: i.kind, title: i.title, caption: i.caption, url: i.url, image_path: i.imagePath, portal_path: i.portalPath, color: i.color,
    }));

export const boardInsertRow = (draft: BoardDraft, userId: string, jobId: string): Record<string, unknown> => {
    const problem = validateBoardDraft(draft);
    if (problem) throw new Error(problem);
    return {
        user_id: userId,
        job_id: jobId,
        title: cleanLine(draft.title, BOARD_LIMITS.title),
        notes: cleanBlock(draft.notes, BOARD_LIMITS.notes),
        // a new board is private; share it with setBoardShared (makes the public image copies)
        items: itemsToJson(normalizeItems(draft.items).map(i => ({ ...i, portalPath: null }))),
        shared_in_portal: false,
    };
};

export const boardPatchRow = (patch: BoardPatch): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) {
        const t = cleanLine(patch.title, BOARD_LIMITS.title);
        if (!t) throw new Error('Give the board a name.');
        row.title = t;
    }
    if (patch.notes !== undefined) row.notes = cleanBlock(patch.notes, BOARD_LIMITS.notes);
    if (patch.items !== undefined) row.items = itemsToJson(normalizeItems(patch.items));
    return row;
};
