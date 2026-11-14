/**
 * Folder layout and file names inside the "Export everything" ZIP (pure; tested by scripts/export-check.ts).
 *
 *   README.txt
 *   csv/jobs.csv, clients.csv, documents.csv, line_items.csv, payments.csv, time_sheets.csv, expense_logs.csv,
 *       inventory.csv, inventory_history.csv, price_book.csv, reminders_log.csv, quote_requests.csv
 *   data/documents.jsonl                       every document exactly as saved (one JSON object per line)
 *   jobs/<Job name>/<date> <Type> <number>.pdf  one folder per job
 *   errors.txt                                  only when some PDFs could not be created
 *
 * Names are safe on Windows, macOS and Linux (no <>:"/\|?* or control characters, no trailing dots, no reserved
 * names such as CON or LPT1), at most 80 characters, and unique per folder without regard to case (Windows and
 * macOS folders are case-insensitive): a second "Kitchen remodel" becomes "Kitchen remodel (2)".
 */

export const EXPORT_DIRS = { csv: 'csv', data: 'data', jobs: 'jobs' } as const;
export const README_PATH = 'README.txt';
export const ERRORS_PATH = 'errors.txt';
export const DOCUMENTS_JSONL_PATH = `${EXPORT_DIRS.data}/documents.jsonl`;
/** Folder for documents whose job no longer exists. */
export const NO_JOB_FOLDER = 'Documents without a job';

const MAX_SEGMENT = 80;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** One path segment (folder or file name without extension), safe on every OS. */
export const safeSegment = (raw: unknown, fallback = 'Untitled', max = MAX_SEGMENT): string => {
    let s = String(raw ?? '').normalize('NFC');
    s = s
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        // quotes and wildcards are dropped; separators become " - " ("Kitchen: Smith / phase 2" → "Kitchen - Smith - phase 2")
        .replace(/[<>"?*]+/g, '')
        .replace(/\s*[:/\\|]+\s*/g, ' - ')
        .replace(/\s+/g, ' ')
        .replace(/\s*-(\s*-)+\s*/g, ' - ')
        .replace(/^[\s.-]+|[\s.-]+$/g, '');
    if (!s) s = fallback;
    if (RESERVED.test(s)) s = `_${s}`;
    // cut by code points (never in the middle of an emoji / accented letter), then clean the end again
    const chars = Array.from(s);
    if (chars.length > max) s = chars.slice(0, max).join('').replace(/[\s.-]+$/g, '') || fallback;
    return s;
};

/** Keeps names unique inside one folder (case-insensitive): "Invoice", "Invoice (2)", "Invoice (3)". */
export class NameRegistry {
    private used = new Set<string>();

    claim(base: string, ext = ''): string {
        let name = `${base}${ext}`;
        for (let n = 2; this.used.has(name.toLowerCase()); n++) name = `${base} (${n})${ext}`;
        this.used.add(name.toLowerCase());
        return name;
    }

    get size(): number { return this.used.size; }
}

/** What the layout needs to know about a document. */
export interface LayoutDoc {
    id: string;
    jobId?: string | null;
    /** "Invoice", "Daily Job Report" … */
    type: string;
    /** reference number ("INV-1001"), may be empty */
    number?: string | null;
    /** business date "YYYY-MM-DD", may be empty */
    date?: string | null;
    title?: string | null;
}

/** "2026-03-04 Invoice INV-1001" (date first, so a job folder lists its paperwork in order). */
export const documentFileBase = (doc: LayoutDoc): string => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(doc.date || '')) ? String(doc.date) : '';
    const type = String(doc.type || 'Document').trim() || 'Document';
    const number = String(doc.number || '').trim();
    // a number already starting with the type ("Invoice 12") is not repeated
    const label = number ? (number.toLowerCase().startsWith(type.toLowerCase()) ? number : `${type} ${number}`)
        : (String(doc.title || '').trim() && String(doc.title).trim().toLowerCase() !== type.toLowerCase() ? `${type} - ${String(doc.title).trim()}` : type);
    return safeSegment([date, label].filter(Boolean).join(' '), 'Document');
};

/**
 * Assigns every job a folder and every document a PDF path, in the order they are added (the export adds them in
 * creation order, so the same account always gets the same names).
 */
export class FolderLayout {
    private jobFolders = new Map<string, string>();
    private folderNames = new NameRegistry();
    private filesByFolder = new Map<string, NameRegistry>();

    /** Folder of a job: "jobs/Kitchen remodel". */
    addJob(job: { id: string; name?: string | null }): string {
        const existing = this.jobFolders.get(job.id);
        if (existing) return existing;
        const folder = `${EXPORT_DIRS.jobs}/${this.folderNames.claim(safeSegment(job.name, 'Untitled job'))}`;
        this.jobFolders.set(job.id, folder);
        return folder;
    }

    /** The job's folder, or the "Documents without a job" folder. */
    folderFor(jobId: string | null | undefined): string {
        const known = jobId ? this.jobFolders.get(jobId) : undefined;
        if (known) return known;
        const key = '\u0000no-job';
        const existing = this.jobFolders.get(key);
        if (existing) return existing;
        const folder = `${EXPORT_DIRS.jobs}/${this.folderNames.claim(NO_JOB_FOLDER)}`;
        this.jobFolders.set(key, folder);
        return folder;
    }

    /** "jobs/Kitchen remodel/2026-03-04 Invoice INV-1001.pdf" (unique inside the folder). */
    pdfPathFor(doc: LayoutDoc): string {
        const folder = this.folderFor(doc.jobId);
        let names = this.filesByFolder.get(folder);
        if (!names) { names = new NameRegistry(); this.filesByFolder.set(folder, names); }
        return `${folder}/${names.claim(documentFileBase(doc), '.pdf')}`;
    }
}

/** "2026-11-13" of a Date in local time. */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ZIP file name: "ContractorDocs-export-2026-11-13.zip", or "…-part2.zip" when the export is split. */
export const exportArchiveName = (date: Date, part?: number, mode: 'full' | 'csv' = 'full'): string =>
    `ContractorDocs-${mode === 'csv' ? 'spreadsheets' : 'export'}-${ymd(date)}${part ? `-part${part}` : ''}.zip`;
