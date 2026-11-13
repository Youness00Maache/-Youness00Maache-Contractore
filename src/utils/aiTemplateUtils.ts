import { FormType } from '../../types.ts';

/** Template resolution lives in the shared router module so the edge function uses the same rules. */
export {
    TEMPLATE_STYLE_MAP,
    inferTemplateIdFromIntent,
    resolveTemplateId,
} from '../../supabase/functions/ai-assistant/shared/templates.ts';

export const RICH_TEXT_FIELDS: Record<string, string[]> = {
    [FormType.DailyJobReport]: ['content'],
    [FormType.Note]: ['content'],
};

/** Returns the rich-text (HTML) body field of a form, if it has one. */
export const extractRichTextField = (
    formType: string,
    payload: Record<string, unknown>
): { field: string; html: string } | null => {
    const richFields = RICH_TEXT_FIELDS[formType] ?? [];
    for (const field of richFields) {
        const raw = payload[field];
        if (typeof raw === 'string' && raw.trim().length > 0) {
            const isHtml = /<[a-z][\s\S]*>/i.test(raw);
            return { field, html: isHtml ? raw : `<p>${raw}</p>` };
        }
    }
    return null;
};
