/**
 * App routes (owned by CORE): URL -> screen. Pure, so Back/forward/refresh always show the screen of the URL.
 */
import { FormType } from '../types.ts';
import { resolveFormType } from '../src/config/docTypeMap.ts';

export const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export const resolveRouteFormType = (raw: string): FormType | null => {
    if (!raw) return null;
    const direct = resolveFormType(raw);
    if (direct && direct !== FormType.ProfitReport) return direct;
    const norm = raw.toLowerCase().replace(/[-_\s]+/g, '');
    const match = (Object.values(FormType) as string[]).find(v => v.toLowerCase().replace(/\s+/g, '') === norm);
    return match && match !== FormType.ProfitReport ? (match as FormType) : null;
};

export type AppView =
    | { screen: 'root' }
    | { screen: 'welcome' }
    | { screen: 'notFound' }
    | { screen: 'auth'; authScreen: 'login' | 'signup' | 'checkEmail' }
    | { screen: 'updatePassword' }
    | { screen: 'dashboard' }
    | { screen: 'jobDetails'; jobId: string }
    | { screen: 'createJob'; returnTo?: 'dashboard' | 'calendar'; prefillData?: Record<string, unknown> }
    | { screen: 'selectDocType'; jobId: string }
    | { screen: 'form'; formType: FormType; jobId: string; formId: string | null; prefillData?: Record<string, unknown> }
    | { screen: 'settings' }
    | { screen: 'profile' }
    | { screen: 'clients'; openCreateModal?: boolean; prefillData?: any }
    | { screen: 'analytics' }
    | { screen: 'calendar' }
    | { screen: 'communication'; prefillData?: any }
    | { screen: 'inventory'; openAddModal?: boolean; prefillData?: any }
    | { screen: 'pricebook'; openAddModal?: boolean; prefillData?: any }
    | { screen: 'profitCalculator' }
    | { screen: 'pipeline' }
    | { screen: 'help' }
    | { screen: 'forum'; postId?: string }
    | { screen: 'gmailCallback' }
    | { screen: 'billingSuccess' }
    | { screen: 'qaAiDocuments' };

/** URL → screen (pure; Back/forward/refresh work because the screen is derived from the URL). */
export const parseView = (pathname: string, search: string, state: any): AppView => {
    const params = new URLSearchParams(search);
    const path = pathname.replace(/\/+$/, '') || '/';
    const parts = path.split('/').map(safeDecode);
    switch (path) {
        case '/':
        case '/welcome': return { screen: 'root' };
        case '/login': return { screen: 'auth', authScreen: 'login' };
        case '/signup': return { screen: 'auth', authScreen: 'signup' };
        case '/update-password': return { screen: 'updatePassword' };
        case '/dashboard': return { screen: 'dashboard' };
        case '/settings': return { screen: 'settings' };
        case '/profile': return { screen: 'profile' };
        case '/clients': return { screen: 'clients', openCreateModal: state?.openCreateModal, prefillData: state?.prefillData };
        case '/analytics': return { screen: 'analytics' };
        case '/calendar': return { screen: 'calendar' };
        case '/communication': return { screen: 'communication', prefillData: state?.prefillData };
        case '/inventory': return { screen: 'inventory', openAddModal: state?.openAddModal, prefillData: state?.prefillData };
        case '/pricebook': return { screen: 'pricebook', openAddModal: state?.openAddModal, prefillData: state?.prefillData };
        case '/calculator': return { screen: 'profitCalculator' };
        case '/pipeline': return { screen: 'pipeline' };
        case '/tutorials': return { screen: 'help' };
        case '/forum': return { screen: 'forum', postId: state?.postId || undefined };
        case '/gmail-callback': return { screen: 'gmailCallback' };
        case '/billing/success': return { screen: 'billingSuccess' };
        case '/qa-ai-documents': return (import.meta as any).env?.DEV ? { screen: 'qaAiDocuments' } : { screen: 'notFound' };
        default: break;
    }
    if (parts[1] === 'auth') {
        const a = (parts[2] || '').toLowerCase();
        if (a === 'signup') return { screen: 'auth', authScreen: 'signup' };
        if (a === 'checkemail' || a === 'check-email') return { screen: 'auth', authScreen: 'checkEmail' };
        return { screen: 'auth', authScreen: 'login' };
    }
    if (parts[1] === 'forum' && parts[2]) return { screen: 'forum', postId: parts[2] };
    if (parts[1] === 'jobs') {
        if (parts[2] === 'create' || parts[2] === 'new') {
            const rt = params.get('returnTo');
            return { screen: 'createJob', returnTo: rt === 'calendar' ? 'calendar' : undefined, prefillData: state?.prefillData };
        }
        if (!parts[2]) return { screen: 'dashboard' };
        if (parts[3] === 'select-doc' || parts[3] === 'new') return { screen: 'selectDocType', jobId: parts[2] };
        if (parts[3] === 'forms') {
            const formType = resolveRouteFormType(parts[4] || '');
            if (!formType) return { screen: 'jobDetails', jobId: parts[2] };
            return { screen: 'form', jobId: parts[2], formType, formId: parts[5] || null, prefillData: state?.prefillData };
        }
        return { screen: 'jobDetails', jobId: parts[2] };
    }
    return { screen: 'notFound' };
};

