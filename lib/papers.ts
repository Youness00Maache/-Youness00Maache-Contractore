/**
 * Papers vault (competitor gap #17): the app side of company papers (insurance certificates, licenses, permits, bonds,
 * W-9). Pure, no React / Supabase (scripts/field-features-check.ts). The reminder schedule itself is shared with the
 * reminders edge function: supabase/functions/reminders/shared/papers.ts.
 */
import {
    PAPER_KINDS, PAPER_REMINDER_OFFSETS, expiryPhrase, expiryState, nextPaperStep, normalizePaperOffsets, paperKindLabel, paperKindShort,
    type ExpiryState, type PaperKind,
} from '../supabase/functions/reminders/shared/papers.ts';

export { PAPER_KINDS, PAPER_REMINDER_OFFSETS, expiryPhrase, expiryState, nextPaperStep, normalizePaperOffsets, paperKindLabel, paperKindShort };
export type { ExpiryState, PaperKind };

export interface CompanyPaper {
    id: string;
    kind: PaperKind;
    title: string;
    number: string;
    issuer: string;
    /** YYYY-MM-DD or '' */
    issuedOn: string;
    expiresOn: string;
    jobId: string | null;
    inspectionOn: string;
    coverageAmount: number | null;
    filePath: string | null;
    fileName: string;
    fileType: string;
    fileSize: number;
    notes: string;
    remind: boolean;
    reminderOffsets: number[];
    showInPortal: boolean;
    lastSentAt: string | null;
    lastSentTo: string;
    createdAt: string;
}

export const PAPER_COLUMNS = 'id, kind, title, number, issuer, issued_on, expires_on, job_id, inspection_on, coverage_amount, file_path, file_name, file_type, file_size, notes, remind, reminder_offsets, show_in_portal, last_sent_at, last_sent_to, created_at';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const ymd = (v: unknown): string => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(str(v)); return m ? m[1] : ''; };
const isKind = (v: unknown): v is PaperKind => PAPER_KINDS.some(k => k.value === v);

export const mapPaperRow = (r: any): CompanyPaper => ({
    id: str(r?.id),
    kind: isKind(r?.kind) ? r.kind : 'other',
    title: str(r?.title) || paperKindLabel(r?.kind),
    number: str(r?.number),
    issuer: str(r?.issuer),
    issuedOn: ymd(r?.issued_on),
    expiresOn: ymd(r?.expires_on),
    jobId: r?.job_id ? String(r.job_id) : null,
    inspectionOn: ymd(r?.inspection_on),
    coverageAmount: r?.coverage_amount === null || r?.coverage_amount === undefined || r?.coverage_amount === '' || !Number.isFinite(Number(r.coverage_amount)) ? null : Number(r.coverage_amount),
    filePath: r?.file_path ? String(r.file_path) : null,
    fileName: str(r?.file_name),
    fileType: str(r?.file_type),
    fileSize: Number(r?.file_size) || 0,
    notes: str(r?.notes),
    remind: r?.remind !== false,
    reminderOffsets: Array.isArray(r?.reminder_offsets) ? normalizePaperOffsets(r.reminder_offsets) : [...PAPER_REMINDER_OFFSETS],
    showInPortal: r?.show_in_portal === true,
    lastSentAt: r?.last_sent_at ? String(r.last_sent_at) : null,
    lastSentTo: str(r?.last_sent_to),
    createdAt: str(r?.created_at),
});

/** Columns the browser writes (insert / update). */
export const paperRowOf = (p: CompanyPaper, userId: string): Record<string, unknown> => ({
    id: p.id,
    user_id: userId,
    kind: p.kind,
    title: p.title.trim().slice(0, 200) || paperKindLabel(p.kind),
    number: p.number.trim().slice(0, 120) || null,
    issuer: p.issuer.trim().slice(0, 200) || null,
    issued_on: p.issuedOn || null,
    expires_on: p.expiresOn || null,
    job_id: p.jobId || null,
    inspection_on: p.inspectionOn || null,
    coverage_amount: p.coverageAmount === null || !Number.isFinite(p.coverageAmount) ? null : Math.max(0, Math.round(p.coverageAmount * 100) / 100),
    file_path: p.filePath,
    file_name: p.fileName.slice(0, 200) || null,
    file_type: p.fileType || null,
    file_size: p.fileSize || null,
    notes: p.notes.trim().slice(0, 2000) || null,
    remind: p.remind,
    reminder_offsets: normalizePaperOffsets(p.reminderOffsets),
    show_in_portal: p.showInPortal && ['coi', 'license', 'bond'].includes(p.kind),
});

/** A new, empty paper of a kind. */
export const blankPaper = (id: string, kind: PaperKind = 'coi', jobId: string | null = null): CompanyPaper => ({
    id, kind, title: defaultPaperTitle(kind), number: '', issuer: '', issuedOn: '', expiresOn: '', jobId, inspectionOn: '', coverageAmount: null,
    filePath: null, fileName: '', fileType: '', fileSize: 0, notes: '', remind: kind !== 'w9', reminderOffsets: [...PAPER_REMINDER_OFFSETS],
    showInPortal: kind === 'coi' || kind === 'license', lastSentAt: null, lastSentTo: '', createdAt: '',
});

export const defaultPaperTitle = (kind: PaperKind): string => ({
    coi: 'General liability insurance', license: 'Contractor license', permit: 'Building permit', bond: 'License bond', w9: 'W-9', other: 'Certificate',
}[kind]);

/** Problems that stop a save (empty = fine). */
export const paperProblems = (p: CompanyPaper): string[] => {
    const out: string[] = [];
    if (!p.title.trim()) out.push('Give it a name.');
    if (p.issuedOn && p.expiresOn && p.issuedOn > p.expiresOn) out.push('The expiry date is before the issue date.');
    if (p.remind && !p.expiresOn && p.kind !== 'w9') out.push('Add the expiry date, or switch reminders off.');
    if (p.coverageAmount !== null && (!Number.isFinite(p.coverageAmount) || p.coverageAmount < 0)) out.push('The coverage amount is not a number.');
    return out;
};

// ---------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------
const STATE_RANK: Record<ExpiryState, number> = { expired: 0, urgent: 1, soon: 2, ok: 3, none: 4 };

/** Most urgent first: expired, then by expiry date; papers without a date last (by name). */
export const sortPapers = (papers: readonly CompanyPaper[], today: string): CompanyPaper[] =>
    [...papers].sort((a, b) => {
        const sa = expiryState(a.expiresOn, today).state;
        const sb = expiryState(b.expiresOn, today).state;
        return STATE_RANK[sa] - STATE_RANK[sb] || (a.expiresOn || '9999').localeCompare(b.expiresOn || '9999') || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    });

export interface PapersSummary { expired: number; expiring: number; valid: number; noDate: number; total: number }

/** "2 expired · 1 expiring in 30 days · 6 valid". */
export const papersSummary = (papers: readonly CompanyPaper[], today: string): PapersSummary => {
    const out: PapersSummary = { expired: 0, expiring: 0, valid: 0, noDate: 0, total: papers.length };
    for (const p of papers) {
        const s = expiryState(p.expiresOn, today).state;
        if (s === 'expired') out.expired++;
        else if (s === 'soon' || s === 'urgent') out.expiring++;
        else if (s === 'ok') out.valid++;
        else out.noDate++;
    }
    return out;
};

/** Storage path in the document-assets bucket (checked by guard_company_paper / the bucket's owner-folder policy). */
export const paperFilePath = (userId: string, paperId: string, random: string, fileName: string, mime: string): string => {
    const fromMime: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const fromName = /\.(pdf|jpe?g|png|webp)$/i.exec(fileName)?.[1]?.toLowerCase();
    const ext = fromMime[mime] || (fromName === 'jpeg' ? 'jpg' : fromName) || 'pdf';
    return `${userId}/papers/${paperId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}-${random.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20)}.${ext}`;
};

export const PAPER_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const PAPER_FILE_MAX_BYTES = 15 * 1024 * 1024;

/** Why a file can't be stored ('' = fine). */
export const paperFileProblem = (file: { type: string; size: number; name: string }): string => {
    const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
    if (!(PAPER_FILE_TYPES as readonly string[]).includes(type)) return 'Use a PDF or a photo (JPG, PNG, WebP).';
    if (file.size > PAPER_FILE_MAX_BYTES) return 'The file is larger than 15 MB.';
    if (file.size <= 0) return 'The file is empty.';
    return '';
};

// ---------------------------------------------------------------------------------------------
// "Send COI" email
// ---------------------------------------------------------------------------------------------
export const sendPaperEmail = (p: CompanyPaper, company: string, recipientName = ''): { subject: string; body: string } => {
    const label = p.kind === 'coi' ? 'certificate of insurance' : p.kind === 'w9' ? 'W-9' : paperKindLabel(p.kind).toLowerCase();
    const who = company.trim() || 'us';
    const subject = `${p.kind === 'coi' ? 'Certificate of insurance' : p.kind === 'w9' ? 'W-9' : p.title} · ${company.trim() || 'ContractorDocs'}`.slice(0, 200);
    const lines = [
        `Hi${recipientName ? ` ${recipientName.split(/\s+/)[0]}` : ''},`,
        '',
        `Attached is our ${label}${p.title && p.kind !== 'w9' ? ` (${p.title})` : ''}.`,
        [p.number ? `Number: ${p.number}` : '', p.issuer ? `Issued by: ${p.issuer}` : '', p.expiresOn ? `Valid until: ${p.expiresOn}` : ''].filter(Boolean).join(' · '),
        '',
        'Let me know if you need anything else.',
        '',
        `Thanks,`,
        who === 'us' ? '' : who,
    ];
    return { subject, body: lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() };
};
