/**
 * Mood boards (roadmap D5): shapes and limits. Database: public.job_boards
 * (supabase/migrations/20261116000600_selections_boards.sql, NOT applied until the owner's OK: keep the feature hidden
 * until useBoardsFeature(...) === 'ready'). Premium. Lives inside the job page; a shared board is read-only in the
 * client portal (lib/portal/selectionsApi.ts loadPortalBoards).
 *
 *   JobBoard
 *   {
 *     id, userId, jobId, title, notes: string | null (owner-only, never in the portal),
 *     items: BoardItem[]   (max 60, in display order)
 *     sharedInPortal: boolean,
 *     createdAt, updatedAt
 *   }
 *   BoardItem
 *   {
 *     id: string ([A-Za-z0-9_-]{6,40}), kind: 'image' | 'link' | 'note' | 'color',
 *     title: string | null, caption: string | null,
 *     url: string | null          (https; required for 'link'; an 'image' may be a link to a picture instead of an upload)
 *     imagePath: string | null    ('image' upload: document-assets/<user>/boards/<job>/<rand>-<name>.<jpg|jpeg|png|webp>)
 *     portalPath: string | null   (public copy in portal-photos while the board is shared; the database clears it on unshare)
 *     color: string | null        ('#rrggbb', required for 'color')
 *   }
 *   Item shapes: image = imagePath or url; link = url; note = title or caption; color = color.
 */

export type BoardItemKind = 'image' | 'link' | 'note' | 'color';

export interface BoardItem {
    id: string;
    kind: BoardItemKind;
    title: string | null;
    caption: string | null;
    url: string | null;
    imagePath: string | null;
    portalPath: string | null;
    color: string | null;
}

/** An item being written (id optional). */
export type BoardItemInput = Partial<BoardItem> & { kind: BoardItemKind };

export interface JobBoard {
    id: string;
    userId: string;
    jobId: string;
    title: string;
    notes: string | null;
    items: BoardItem[];
    sharedInPortal: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface BoardDraft {
    title: string;
    notes?: string | null;
    items?: readonly BoardItemInput[];
}

export type BoardPatch = Partial<BoardDraft>;

/** Keep in sync with the migration (column checks, guard_job_board). */
export const BOARD_LIMITS = {
    perJob: 50,
    items: 60,
    title: 120,
    notes: 2000,
    itemTitle: 120,
    caption: 1000,
    url: 2000,
    maxImageBytes: 5 * 1024 * 1024,
} as const;
