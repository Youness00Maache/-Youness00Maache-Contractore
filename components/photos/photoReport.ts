/**
 * "Before & after photo report" PDF through the app's ONE PDF pipeline (services/pdfGenerator.ts): the photos are
 * laid out as rich text in a Note document, so the report gets the same header (logo, company, project, client),
 * fonts, footer and page breaks as every other document. Images are embedded as small JPEG data URLs, so the PDF
 * never depends on expiring links or cross-origin rules.
 */
import { FormType, type Job, type UserProfile } from '../../types.ts';
import { generateDocumentPDF } from '../../services/pdfGenerator.ts';
import { buildPhotoReportHtml, pairBeforeAfter, type JobPhoto, type ReportPhoto } from './photoLogic.ts';
import { blobToJpegDataUrl, downloadPhoto } from './photosApi.ts';

const REPORT_IMAGE_MAX = 1000;

const fileSafe = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
const localYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Downloads the PDF. `photos` = the selection (or every photo of the job). Before/after photos are paired;
 * with `includeOthers`, During / Issue photos follow as progress photos.
 */
export const downloadPhotoReport = async (input: {
    photos: JobPhoto[];
    job: Partial<Job>;
    profile: Partial<UserProfile> | null;
    includeOthers?: boolean;
    onProgress?: (done: number, total: number) => void;
}): Promise<{ pairs: number; photos: number }> => {
    const pairs = pairBeforeAfter(input.photos);
    const pairedIds = new Set(pairs.flatMap(p => [p.before?.id, p.after?.id]).filter(Boolean) as string[]);
    const others = input.includeOthers
        ? input.photos.filter(p => !pairedIds.has(p.id) && (p.tag === 'during' || p.tag === 'issue'))
            .sort((a, b) => String(a.takenAt).localeCompare(String(b.takenAt)))
        : [];
    const wanted = [...pairs.flatMap(p => [p.before, p.after]).filter(Boolean) as JobPhoto[], ...others];
    if (!wanted.length) throw new Error('Tag at least one photo as Before or After (or select some photos) to make a report.');

    const srcById = new Map<string, string>();
    let done = 0;
    for (const p of wanted) {
        try {
            const blob = await downloadPhoto(p.storagePath);
            srcById.set(p.id, await blobToJpegDataUrl(blob, REPORT_IMAGE_MAX, 0.8));
        } catch { /* a missing photo leaves an empty cell */ }
        done++;
        input.onProgress?.(done, wanted.length);
    }
    const toReport = (p: JobPhoto | null): ReportPhoto | null => {
        if (!p) return null;
        const src = srcById.get(p.id);
        return src ? { src, caption: p.caption, takenAt: p.takenAt, tag: p.tag } : null;
    };

    const content = buildPhotoReportHtml({
        pairs: pairs.map(p => ({ before: toReport(p.before), after: toReport(p.after) })).filter(p => p.before || p.after),
        extra: others.map(toReport).filter(Boolean) as ReportPhoto[],
    });
    const job = input.job || {};
    const data = {
        title: 'Before & after photo report',
        date: localYmd(),
        projectName: job.name || '',
        clientName: job.clientName || '',
        content,
    };
    await generateDocumentPDF(FormType.Note, data, input.profile, job, null, false, {
        fileName: `Photo-report-${fileSafe(job.name || 'job') || 'job'}.pdf`,
    });
    return { pairs: pairs.length, photos: srcById.size };
};
