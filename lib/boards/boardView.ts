/**
 * Mood boards: the words and small rules the screens show (roadmap D5 phase B). Pure, no React / Supabase, tested by
 * scripts/selections-check.ts. Shapes: lib/boards/boardTypes.ts, logic: lib/boards/boardLogic.ts.
 *
 *   BOARD_SHARE_NOTE / BOARD_PRIVATE_NOTE        what the owner is told about sharing
 *   boardSummary(board)                          "12 items: 8 images, 2 links, 1 note, 1 colour"
 *   itemKindLabel(kind) / itemHeading(item)      the row words
 *   GalleryItem / toGalleryItems(items, urls)    the one shape the gallery draws (owner preview AND client portal)
 *   galleryColumns(items)                        images first, then colours, links, notes (how the client sees it)
 */
import type { BoardItem, BoardItemKind, JobBoard } from './boardTypes.ts';
import { countByKind } from './boardLogic.ts';

export const BOARDS_NEED_CONNECTION = "You're offline. Boards need a connection; they come back when you're online again.";
export const BOARD_SHARE_NOTE = 'Captions and notes you add to shared items are visible to your client. Your board notes stay private.';
export const BOARD_PRIVATE_NOTE = 'Only you can see this board.';
export const BOARD_SHARED_NOTE = 'Your client sees this board on their project link, as it looks in the preview.';

export const itemKindLabel = (k: BoardItemKind): string =>
    k === 'image' ? 'Image' : k === 'link' ? 'Link' : k === 'note' ? 'Note' : 'Colour';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "12 items: 8 images, 2 links, 1 note, 1 colour", "3 images" when all are one kind ("Empty" for none). */
export const boardSummary = (b: Pick<JobBoard, 'items'>): string => {
    const n = b.items.length;
    if (!n) return 'Empty';
    const c = countByKind(b.items);
    const parts = [
        c.image ? plural(c.image, 'image') : '', c.link ? plural(c.link, 'link') : '', c.note ? plural(c.note, 'note') : '',
        c.color ? plural(c.color, 'colour') : '',
    ].filter(Boolean);
    return parts.length === 1 ? parts[0] : `${plural(n, 'item')}: ${parts.join(', ')}`;
};

/** The first words of an item for lists ("Tile sample", the link host, the colour...). */
export const itemHeading = (i: Pick<BoardItem, 'kind' | 'title' | 'caption' | 'url' | 'color'>): string => {
    if (i.title) return i.title;
    if (i.kind === 'color') return i.color ? i.color.toUpperCase() : 'Colour';
    if (i.kind === 'link' || i.kind === 'image') {
        if (i.caption) return i.caption.length > 60 ? `${i.caption.slice(0, 57)}…` : i.caption;
        if (i.url) { try { return new URL(i.url).hostname.replace(/^www\./, ''); } catch { /* fall through */ } }
        return i.kind === 'image' ? 'Image' : 'Link';
    }
    if (i.caption) return i.caption.length > 60 ? `${i.caption.slice(0, 57)}…` : i.caption;
    return 'Note';
};

/** What the gallery draws: the same shape for the owner's preview and for the client portal (PortalBoardItem fits it). */
export interface GalleryItem {
    id: string;
    kind: BoardItemKind;
    title: string | null;
    caption: string | null;
    url: string | null;
    /** image items: the picture to show (public copy / signed URL / the pasted link) */
    imageUrl: string | null;
    color: string | null;
}

/** Board items as the gallery draws them. `imageUrls`: item id -> picture URL (an upload's signed URL / its public copy). */
export const toGalleryItems = (items: readonly BoardItem[], imageUrls: Readonly<Record<string, string | null | undefined>>): GalleryItem[] =>
    items.map(i => ({
        id: i.id,
        kind: i.kind,
        title: i.title,
        caption: i.caption,
        url: i.url,
        imageUrl: i.kind === 'image' ? (imageUrls[i.id] || i.url || null) : null,
        color: i.kind === 'color' ? i.color : null,
    })).filter(i => (i.kind !== 'image' || i.imageUrl) && (i.kind !== 'link' || i.url) && (i.kind !== 'color' || i.color));

export interface GalleryParts {
    images: GalleryItem[];
    swatches: GalleryItem[];
    links: GalleryItem[];
    notes: GalleryItem[];
}

/** The order the client reads a board: pictures, then colours, links and notes (each keeps the owner's order). */
export const galleryColumns = (items: readonly GalleryItem[]): GalleryParts => ({
    images: items.filter(i => i.kind === 'image'),
    swatches: items.filter(i => i.kind === 'color'),
    links: items.filter(i => i.kind === 'link'),
    notes: items.filter(i => i.kind === 'note'),
});

/** Black or white text for a swatch of this colour. */
export const readableOn = (hex: string): '#000000' | '#ffffff' => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return '#000000';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000000' : '#ffffff';
};
