/**
 * In-form "Fill with AI" (AI-012 / DOC-003). Uses the same `master-ai-router` function as the chat
 * (scope "form"): one provider, one auth check, one usage meter. The legacy
 * `process-contractor-ai` function was removed.
 */
import { useCallback, useRef, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase.ts';
import type { FormType } from '../../types.ts';
import { resolveFormType, resolveMasterDocumentType } from '../config/docTypeMap.ts';
import { normalizePrefill, toLocalYmd, type DocKey } from '../config/documentFieldRequirements.ts';
import { inferTemplateIdFromIntent } from '../utils/aiTemplateUtils.ts';
import type { RouterResponse } from '../../supabase/functions/master-ai-router/shared/routerContract.ts';
import { dispatchUpgradeEvent } from '../ai/events.ts';

export { TEMPLATE_STYLE_MAP, resolveTemplateId, RICH_TEXT_FIELDS, extractRichTextField } from '../utils/aiTemplateUtils.ts';

export interface AIGeneratedDocument {
    id: string;
    type: FormType;
    document_type: DocKey;
    /** Partial<TypeData> with exact types.ts keys. */
    data: Record<string, unknown>;
    /** Same object (older form handlers read `form_payload`). */
    form_payload: Record<string, unknown>;
    missing_fields: string[];
    reply: string;
}

export const useContractorAI = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [generatedDocs, setGeneratedDocs] = useState<AIGeneratedDocument[]>([]);
    const abortRef = useRef<AbortController | null>(null);

    const processAIData = useCallback(async (
        inputData: string,
        formTypeRestriction?: string,
        jobId?: string,
        _saveToDb?: boolean,
    ): Promise<AIGeneratedDocument[] | null> => {
        const docType = resolveMasterDocumentType(formTypeRestriction || '');
        const formType = resolveFormType(formTypeRestriction || '');
        if (!docType || !formType) {
            setError('This form does not support AI fill.');
            return null;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setIsProcessing(true);
        setError(null);
        setErrorCode(null);
        setGeneratedDocs([]);
        try {
            const { data, error: fnError } = await supabase.functions.invoke<RouterResponse>('master-ai-router', {
                body: {
                    message: inputData.trim().slice(0, 4000),
                    scope: 'form',
                    context: { today: toLocalYmd(), form_document_type: docType, active_job_id: jobId },
                },
                signal: controller.signal,
                timeout: 60_000,
            });
            if (controller.signal.aborted) return null;
            if (fnError) {
                let message = 'The AI could not fill the form. Please try again.';
                let code = 'ERROR';
                if (fnError instanceof FunctionsHttpError) {
                    const res = (fnError as unknown as { context?: Response }).context;
                    try {
                        const body = res ? await res.clone().json() : null;
                        message = String(body?.error || message).replace(/^PLAN_LIMIT:\s*/, '');
                        code = String(body?.code || (res?.status === 402 ? 'PLAN_LIMIT' : code));
                    } catch { /* keep generic */ }
                } else {
                    message = 'You appear to be offline, or the AI service is unreachable. Please try again.';
                }
                if (code === 'PLAN_LIMIT') dispatchUpgradeEvent(message);
                setErrorCode(code);
                throw new Error(message);
            }
            const proposal = data?.proposal;
            if (!proposal || proposal.action_type !== 'GENERATE_DOCUMENT') {
                throw new Error(proposal?.reply_text || 'Tell me what to put in this form, for example the work done, items and prices.');
            }
            const prefill = normalizePrefill(docType, proposal.prefill || {}, {
                today: toLocalYmd(), resolveTemplate: inferTemplateIdFromIntent, userText: inputData,
            });
            if (!Object.keys(prefill).length) throw new Error('I could not find anything to fill in. Add a few details (work done, items, prices) and try again.');
            const doc: AIGeneratedDocument = {
                id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `ai-${Date.now()}`,
                type: formType,
                document_type: docType,
                data: prefill,
                form_payload: prefill,
                missing_fields: proposal.missing_fields || [],
                reply: proposal.reply_text,
            };
            setGeneratedDocs([doc]);
            return [doc];
        } catch (err) {
            if (controller.signal.aborted) return null;
            setError(err instanceof Error ? err.message : 'The AI could not fill the form. Please try again.');
            return null;
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setIsProcessing(false);
        }
    }, []);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsProcessing(false);
    }, []);

    return {
        processAIData,
        cancel,
        isProcessing,
        error,
        errorCode,
        generatedDocs,
        clearGeneratedDocs: () => setGeneratedDocs([]),
    };
};
