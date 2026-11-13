import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormType } from './types.ts';
import type { Job, FormData as FormDataType, InvoiceData, DailyJobReportData, NoteData, WorkOrderData, TimeSheetData, MaterialLogData, EstimateData, ExpenseLogData, WarrantyData, ReceiptData, ChangeOrderData, PurchaseOrderData, Client, InventoryItem, SavedItem, UserProfile } from './types.ts';
import type { Session, User } from '@supabase/supabase-js';

// ── App shell (CORE) ─────────────────────────────────────────────────────────
import ConfirmationModal from './components/ConfirmationModal.tsx';
import SelectDocType from './components/SelectDocType.tsx';
import AppNav, { type NavDestination, type NavSection } from './components/AppNav.tsx';
import DashboardScreen from './components/DashboardScreen.tsx';
import JobDetailsScreen from './components/JobDetailsScreen.tsx';
import { DuplicateJobModal } from './components/DuplicateJobModal.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Toaster, toast } from './components/Toast.tsx';
import { AuthMessage, AppSplash, LoadErrorScreen } from './components/AppStates.tsx';
import { PageSkeleton } from './components/ui/Skeleton.tsx';
import { EmptyState } from './components/ui/EmptyState.tsx';
import { WifiOffIcon, AlertTriangleIcon, BriefcaseIcon, SparklesIcon } from './components/Icons.tsx';

// ── AI (owned by the AI engineer) ────────────────────────────────────────────
import { DashboardMasterAIButton, InlineAIButton } from './components/DashboardMasterAIButton.tsx';
import { useAIAssistant } from './src/hooks/useAIAssistant.ts';
const AIAssistantPanel = lazy(() => import('./src/ai/components/AssistantPanel.tsx'));

// ── Data & helpers ───────────────────────────────────────────────────────────
import { supabase, invokeFunction } from './lib/supabase.ts';
import {
    DOCUMENT_METADATA_COLUMNS, DOCUMENT_PAGE_SIZE, RECENT_DOCUMENTS_LIMIT, mapDocumentRow, isLightweightDocument,
    mergeDocuments, fetchFullDocument, fetchFullDocuments, primeDocumentCache, invalidateDocument, clearDocumentCache,
    isUnseenClientSignedDocument, buildDuplicateDocumentData, assertFullDocument, stripLightweightFlag,
} from './lib/documents.ts';
import {
    type AppProfile, type UsageSnapshot, type ThemeName, THEME_STORAGE_KEY, loadProfileRow, mapProfileRow, fetchUsage,
    limitsForTier, isPlanLimitError, planLimitMessage, describeError, clearUserBrowserStorage, rememberPostLoginRedirect,
    consumePostLoginRedirect, normalizeTheme, isMissingColumnError, usageMonthStart, fetchJobDocumentCount, fetchDocumentUsageByJob,
} from './lib/account.ts';
import { isPaidTier, normalizeTier } from './lib/plans.ts';
import { getBillingPortalUrl } from './lib/billing.ts';
import { getTranslations } from './utils/translations.ts';
import { parseView, type AppView } from './lib/routes.ts';
import { dbApi } from './utils/db.ts';
import { compressImage } from './utils/imageCompression.ts';

// ── Lazy screens (INFRA-005: keep the first load small) ──────────────────────
const Login = lazy(() => import('./components/Login.tsx'));
const Signup = lazy(() => import('./components/Signup.tsx'));
const UpdatePassword = lazy(() => import('./components/UpdatePassword.tsx'));
const JobForm = lazy(() => import('./components/JobForm.tsx'));
const Settings = lazy(() => import('./components/Settings.tsx'));
const BillingSuccess = lazy(() => import('./components/BillingSuccess.tsx'));
const UpgradeModal = lazy(() => import('./components/UpgradeModal.tsx'));
const JobFinancialsModal = lazy(() => import('./components/JobFinancialsModal.tsx'));
const InvoiceForm = lazy(() => import('./components/InvoiceForm.tsx'));
const DailyJobReportForm = lazy(() => import('./components/DailyJobReportForm.tsx'));
const NoteForm = lazy(() => import('./components/NoteForm.tsx'));
const WorkOrderForm = lazy(() => import('./components/WorkOrderForm.tsx'));
const TimeSheetForm = lazy(() => import('./components/TimeSheetForm.tsx'));
const MaterialLogForm = lazy(() => import('./components/MaterialLogForm.tsx'));
const EstimateForm = lazy(() => import('./components/EstimateForm.tsx'));
const ExpenseLogForm = lazy(() => import('./components/ExpenseLogForm.tsx'));
const WarrantyForm = lazy(() => import('./components/WarrantyForm.tsx'));
const ReceiptForm = lazy(() => import('./components/ReceiptForm.tsx'));
const ChangeOrderForm = lazy(() => import('./components/ChangeOrderForm.tsx'));
const PurchaseOrderForm = lazy(() => import('./components/PurchaseOrderForm.tsx'));
const ClientsView = lazy(() => import('./components/ClientsView.tsx'));
const AnalyticsView = lazy(() => import('./components/AnalyticsView.tsx'));
const ForumView = lazy(() => import('./components/ForumView.tsx'));
const CalendarView = lazy(() => import('./components/CalendarView.tsx'));
const CommunicationView = lazy(() => import('./components/CommunicationView.tsx'));
const GmailCallback = lazy(() => import('./components/GmailCallback.tsx'));
const InventoryView = lazy(() => import('./components/InventoryView.tsx'));
const PriceBookView = lazy(() => import('./components/PriceBookView.tsx'));
const ProfitCalculatorView = lazy(() => import('./components/ProfitCalculatorView.tsx'));
const PortalView = lazy(() => import('./components/PortalView.tsx'));
const DocumentApprovalView = lazy(() => import('./components/DocumentApprovalView.tsx'));
// AI mock test page (/qa-ai-documents): development builds only. In production `import.meta.env.DEV` is false, so the
// route resolves to notFound (lib/routes.ts) and this import is dropped from the bundle entirely.
const DocumentAIQAHarness = import.meta.env.DEV ? lazy(() => import('./components/DocumentAIQAHarness.tsx')) : null;

// ── Constants ────────────────────────────────────────────────────────────────
const JOB_COLUMN_SETS = [
    'id, user_id, name, client_name, client_address, start_date, end_date, status, worker_name, client_id, created_at',
    'id, user_id, name, client_name, client_address, start_date, end_date, status, worker_name, created_at',
    'id, user_id, name, client_name, client_address, start_date, end_date, status, created_at',
];
const JOBS_LIMIT = 1000;
const CLIENT_COLUMNS = 'id, user_id, name, email, phone, address, notes, portal_key, created_at';
const CLIENTS_LIMIT = 500;
const INVENTORY_COLUMN_SETS = [
    'id, user_id, name, quantity, category, unit, cost_price, supplier, location, low_stock_threshold, created_at, is_assembly, assembly_items',
    'id, user_id, name, quantity, category, unit, cost_price, supplier, location, low_stock_threshold, created_at',
];
const INVENTORY_LIMIT = 500;
const SAVED_ITEM_COLUMN_SETS = [
    'id, user_id, name, description, rate, unit_cost, category, category_id, type, images, taxable, sku, markup, is_assembly, assembly_items, is_favorite, last_used_at, use_count, created_at',
    'id, user_id, name, description, rate, unit_cost, category, created_at',
];
const SAVED_ITEMS_LIMIT = 300;
const JOB_STATUSES: Job['status'][] = ['active', 'paused', 'completed', 'inactive'];

type AppJob = Job & { clientId?: string | null };

const normalizeJobStatus = (s: unknown): Job['status'] => (JOB_STATUSES.includes(s as Job['status']) ? (s as Job['status']) : 'active');

const mapJobRow = (j: any): AppJob => ({
    id: j.id,
    userId: j.user_id,
    name: j.name || '',
    clientName: j.client_name || '',
    clientAddress: j.client_address || '',
    startDate: j.start_date || '',
    endDate: j.end_date || null,
    status: normalizeJobStatus(j.status),
    workerName: j.worker_name || undefined,
    createdAt: j.created_at,
    clientId: j.client_id ?? null,
});

const localYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const isThisMonth = (iso?: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

/** Runs a select, retrying with fewer columns while the database is missing optional ones. */
async function selectWithFallback<T = any>(table: string, columnSets: string[], build: (query: any) => PromiseLike<{ data: any; error: any }>): Promise<{ data: T[] | null; error: any }> {
    let lastError: any = null;
    for (const columns of columnSets) {
        const { data, error } = await build(supabase.from(table).select(columns));
        if (!error) return { data: (data || []) as T[], error: null };
        lastError = error;
        if (!isMissingColumnError(error)) break;
    }
    return { data: null, error: lastError };
}

/** Uploads to `<bucket>/<uid>/<prefix>-<time>.<ext>` (owner folder) and returns the public URL. */
const uploadFile = async (bucket: string, file: File, userId: string, prefix = 'file'): Promise<string> => {
    if (!navigator.onLine) throw new Error("You're offline. Reconnect to upload images.");
    const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${userId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined, cacheControl: '3600' });
    if (error) throw new Error(error.message || 'Upload failed');
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};

/** A save refused by a Free plan limit: the form shows this message and keeps everything typed (0b.4). */
class PlanLimitSaveError extends Error {}

/** React key of a not-yet-saved form; reused after its first save so the form isn't remounted. */
const newFormKey = (formType: string, prefillData: any, routeKey: string) => `new-${formType}-${prefillData?.__draftId ?? routeKey}`;

/** Reference-number field per document type (used to suggest the next number in forms). */
const DOC_NUMBER_FIELD: Partial<Record<FormType, string>> = {
    [FormType.Invoice]: 'invoiceNumber',
    [FormType.Estimate]: 'estimateNumber',
    [FormType.DailyJobReport]: 'reportNumber',
    [FormType.WorkOrder]: 'workOrderNumber',
    [FormType.Warranty]: 'warrantyNumber',
    [FormType.ChangeOrder]: 'changeOrderNumber',
    [FormType.PurchaseOrder]: 'poNumber',
    [FormType.Receipt]: 'receiptNumber',
};

const PUBLIC_SCREENS: AppView['screen'][] = ['root', 'welcome', 'auth', 'updatePassword', 'notFound', 'qaAiDocuments'];
const NO_NAV_SCREENS: AppView['screen'][] = ['form', 'gmailCallback', 'billingSuccess', 'updatePassword', 'qaAiDocuments'];
const TAB_BAR_SCREENS: AppView['screen'][] = ['dashboard', 'jobDetails', 'clients', 'communication', 'inventory', 'pricebook', 'calendar', 'analytics', 'profitCalculator', 'forum', 'settings', 'profile', 'selectDocType'];

const navSectionFor = (screen: AppView['screen']): NavSection => {
    switch (screen) {
        case 'dashboard': case 'jobDetails': case 'createJob': case 'selectDocType': return 'dashboard';
        case 'clients': return 'clients';
        case 'communication': return 'communication';
        case 'inventory': case 'pricebook': case 'calendar': case 'analytics': case 'profitCalculator': return 'tools';
        case 'forum': return 'forum';
        case 'settings': case 'profile': return 'settings';
        default: return 'none';
    }
};

const App: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // Public client links (no login): read straight from the URL, before any auth redirect (CORE-038).
    const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const portalKey = urlParams.get('portal');
    const approvalToken = urlParams.get('approval_token');

    const view: AppView = useMemo(
        () => parseView(location.pathname, location.search, location.state),
        [location.pathname, location.search, location.state],
    );

    const setView = (newView: AppView) => {
        switch (newView.screen) {
            case 'root': case 'welcome': navigate('/'); break;
            case 'notFound': navigate('/dashboard'); break;
            case 'updatePassword': navigate('/update-password'); break;
            case 'auth': navigate(`/auth/${newView.authScreen}`); break;
            case 'dashboard': navigate('/dashboard'); break;
            case 'settings': navigate('/settings'); break;
            case 'profile': navigate('/profile'); break;
            case 'clients': navigate('/clients'); break;
            case 'analytics': navigate('/analytics'); break;
            case 'calendar': navigate('/calendar'); break;
            case 'communication': navigate('/communication'); break;
            case 'inventory': navigate('/inventory'); break;
            case 'pricebook': navigate('/pricebook'); break;
            case 'profitCalculator': navigate('/calculator'); break;
            case 'forum': navigate(newView.postId ? `/forum/${encodeURIComponent(newView.postId)}` : '/forum'); break;
            case 'gmailCallback': navigate('/gmail-callback'); break;
            case 'billingSuccess': navigate('/billing/success'); break;
            case 'qaAiDocuments': navigate('/qa-ai-documents'); break;
            case 'createJob': navigate(`/jobs/create${newView.returnTo ? `?returnTo=${newView.returnTo}` : ''}`, newView.prefillData ? { state: { prefillData: newView.prefillData } } : undefined); break;
            case 'selectDocType': navigate(`/jobs/${newView.jobId}/select-doc`); break;
            case 'form': {
                const encodedType = encodeURIComponent(newView.formType);
                const path = `/jobs/${newView.jobId}/forms/${encodedType}${newView.formId ? `/${newView.formId}` : ''}`;
                navigate(path, { state: { prefillData: newView.prefillData } });
                break;
            }
            case 'jobDetails': navigate(`/jobs/${newView.jobId}`); break;
        }
    };

    // ── Session & account state ──────────────────────────────────────────────
    const [session, setSession] = useState<Session | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [profile, setProfile] = useState<AppProfile | null>(null);
    const [profileStatus, setProfileStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [loadError, setLoadError] = useState<string | null>(null);
    const [usage, setUsage] = useState<UsageSnapshot | null>(null);
    /** Free plan: documents CREATED this month per job, read from the server's usage_events (null = unknown). */
    const [docUsage, setDocUsage] = useState<Record<string, number> | null>(null);
    /**
     * "New invoice/estimate" from a client with no job yet: the "<Client> - General" job exists only in memory until
     * the document is saved (0b.15), so a discarded document doesn't use one of the Free plan's jobs.
     */
    const [draftJob, setDraftJob] = useState<AppJob | null>(null);
    const [jobs, setJobs] = useState<AppJob[]>([]);
    const [jobsLoaded, setJobsLoaded] = useState(false);
    const [forms, setForms] = useState<FormDataType[]>([]);
    const [clients, setClients] = useState<Client[]>([]);

    // AI assistant state lives in useAIAssistant (called with the AI-owned render helpers below).

    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
    const [documentPagination, setDocumentPagination] = useState<Record<string, { offset: number; hasMore: boolean; loading: boolean; loaded: boolean }>>({});
    const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    const [usingCachedData, setUsingCachedData] = useState(false);
    const [notificationCount, setNotificationCount] = useState(0);
    const [formLoad, setFormLoad] = useState<{ id: string; error: string | null } | null>(null);
    const [formReloadNonce, setFormReloadNonce] = useState(0);

    const [theme, setThemeState] = useState<ThemeName>(() => {
        try { return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)) || 'light'; } catch { return 'light'; }
    });
    const deviceThemeChosenRef = useRef<boolean>((() => { try { return !!normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)); } catch { return false; } })());

    // Upgrade / subscription
    const [showGlobalUpgrade, setShowGlobalUpgrade] = useState(false);
    const [upgradeFeature, setUpgradeFeature] = useState('');

    // Delete confirmations
    const [jobToDelete, setJobToDelete] = useState<string | null>(null);
    const [docToDelete, setDocToDelete] = useState<string | null>(null);
    const showDeleteJobModal = jobToDelete !== null;
    const showDeleteDocModal = docToDelete !== null;
    const [showJobFinancials, setShowJobFinancials] = useState(false);

    // Refs that callbacks read (avoid stale closures in long-lived listeners)
    const sessionUserIdRef = useRef<string | null>(null);
    sessionUserIdRef.current = session?.user?.id ?? null;
    const loadedUserIdRef = useRef<string | null>(null);
    const loadSeqRef = useRef(0);
    const loggingOutRef = useRef(false);
    const docPagRef = useRef(documentPagination);
    docPagRef.current = documentPagination;
    const savingFormPromiseRef = useRef<Promise<false | { id: string; public_token: string | null }> | null>(null);
    /** Saved new documents keep the React key they had while new, so the form doesn't remount after its first save. */
    const formKeyAliasRef = useRef<Record<string, string>>({});
    const newFormIdRef = useRef<{ key: string; id: string } | null>(null);

    const plan = profile?.plan ?? 'free';
    const paid = isPaidTier(plan);

    const openUpgrade = useCallback((reason?: string) => {
        setUpgradeFeature(reason || '');
        setShowGlobalUpgrade(true);
    }, []);

    /** Shows the upgrade modal for DB `PLAN_LIMIT:` errors; returns true when handled. */
    const handlePlanLimit = (error: unknown): boolean => {
        if (!isPlanLimitError(error)) return false;
        openUpgrade(planLimitMessage(error));
        return true;
    };

    const clientNotificationCount = useMemo(() => forms.filter(isUnseenClientSignedDocument).length, [forms]);
    const lowStockCount = useMemo(
        () => inventory.filter(item => !(item as any).is_assembly && Number(item.quantity || 0) <= Number(item.low_stock_threshold ?? 5)).length,
        [inventory],
    );

    /** Usage for meters: server numbers when `get_my_usage()` exists, otherwise counted locally (display only). */
    const effectiveUsage: UsageSnapshot = useMemo(() => {
        if (usage) return usage;
        return {
            tier: plan,
            status: profile?.subscriptionStatus ?? 'none',
            jobsThisMonth: jobs.filter(j => isThisMonth(j.createdAt)).length,
            clientsTotal: clients.length,
            clientsThisMonth: clients.filter(c => isThisMonth((c as any).created_at)).length,
            emailsThisMonth: profile?.emailUsage ?? 0,
            aiThisMonth: 0,
            limits: limitsForTier(plan),
            fromServer: false,
        };
    }, [usage, plan, profile?.subscriptionStatus, profile?.emailUsage, jobs, clients.length]);

    /**
     * Documents created this month for a job, counted like the server (usage_events: creations, so deleting a
     * document does not give the slot back). Falls back to the loaded documents only when usage_events can't be read.
     */
    const docsUsedThisMonth = (jobId: string): number => {
        if (docUsage) return docUsage[jobId] ?? 0;
        return forms.filter(f => f.jobId === jobId && isThisMonth(f.createdAt)).length;
    };

    const docLimitMessage = (count: number, limit: number) =>
        `This job has used ${Math.min(count, limit)} of its ${limit} new documents this month on the Free plan (deleted documents still count).`;

    /**
     * UX pre-check only; the database enforces the same limits (PLAN_LIMIT errors open the upgrade modal).
     * Job/client counts block only when they come from `get_my_usage()`; local counts are for display.
     * Per-job document counts come from the server's usage_events (see docsUsedThisMonth).
     */
    const checkLimit = (type: 'jobs' | 'clients' | 'docs', contextId?: string): boolean => {
        if (paid) return true;
        if (type !== 'docs' && !effectiveUsage.fromServer) return true;
        const limits = effectiveUsage.limits;
        let count = 0;
        let limit: number | null = null;
        let message = '';
        if (type === 'jobs') {
            count = effectiveUsage.jobsThisMonth;
            limit = limits.jobs;
            message = `You've created ${count} of ${limit} jobs this month on the Free plan.`;
        } else if (type === 'clients') {
            count = effectiveUsage.clientsThisMonth;
            limit = limits.clients;
            message = `You've added ${count} of ${limit} new clients this month on the Free plan.`;
        } else {
            count = contextId ? docsUsedThisMonth(contextId) : 0;
            limit = limits.docs;
            message = limit !== null ? docLimitMessage(count, limit) : '';
        }
        if (limit !== null && count >= limit) {
            openUpgrade(message);
            return false;
        }
        return true;
    };

    /**
     * Before a new document form opens (or a document is duplicated): re-reads this job's count from the server, so
     * the form never opens when the save would be refused. Offline/unknown falls back to the cached count.
     */
    const ensureDocSlot = async (jobId: string): Promise<boolean> => {
        if (paid) return true;
        const limit = effectiveUsage.limits.docs;
        if (limit === null) return true;
        const fresh = navigator.onLine
            ? await fetchJobDocumentCount(jobId, usageMonthStart(usage?.monthStart)).catch(() => null)
            : null;
        if (fresh === null) return checkLimit('docs', jobId);
        setDocUsage(prev => ({ ...(prev || {}), [jobId]: fresh }));
        if (fresh >= limit) {
            openUpgrade(docLimitMessage(fresh, limit));
            return false;
        }
        return true;
    };

    /** A new document (or copies) was created on a job: count it right away (refreshUsage re-reads the server). */
    const bumpDocUsage = (jobId: string, by = 1) => {
        setDocUsage(prev => (prev ? { ...prev, [jobId]: (prev[jobId] ?? 0) + by } : prev));
    };

    // Duplicate Job State
    const [showDuplicateJobModal, setShowDuplicateJobModal] = useState(false);
    const [jobToDuplicate, setJobToDuplicate] = useState<Job | null>(null);

    // ── Theme (light | dark | blue), persisted in localStorage `theme` ─────────
    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark', 'blue');
        root.classList.add(theme);
        if (theme === 'dark' || theme === 'blue') root.classList.add('dark');
        root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* ignore */ }
    }, [theme]);

    const handleThemeChange = (next: ThemeName) => {
        deviceThemeChosenRef.current = true;
        setThemeState(next);
        setProfile(prev => (prev ? { ...prev, theme: next } : prev));
        const uid = sessionUserIdRef.current;
        if (uid && navigator.onLine) {
            supabase.from('profiles').update({ theme: next }).eq('id', uid).then(() => undefined, () => undefined);
        }
    };

    // ── Online / offline (read-only cache; nothing is queued, CORE-016) ───────
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            const user = session?.user;
            if (user && sessionUserIdRef.current === user.id) {
                toast.success('Back online.');
                loadAccountData(user, { silent: true });
            }
        };
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]);

    // ── Auth bootstrap: one listener, reads refs (no stale closures) ──────────
    const resetUserState = useCallback(() => {
        loadSeqRef.current++;
        loadedUserIdRef.current = null;
        setProfile(null);
        setProfileStatus('idle');
        setLoadError(null);
        setUsage(null);
        setDocUsage(null);
        setDraftJob(null);
        setJobs([]);
        setJobsLoaded(false);
        setForms([]);
        setClients([]);
        setInventory([]);
        setSavedItems([]);
        setDocumentPagination({});
        setNotificationCount(0);
        // (AI assistant resets itself when the signed-in user changes.)
        clearDocumentCache();
    }, []);

    useEffect(() => {
        let mounted = true;
        supabase.auth.getSession()
            .then(({ data }) => {
                if (!mounted) return;
                setSession(data.session);
            })
            .catch(() => undefined)
            .finally(() => { if (mounted) setAuthReady(true); });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
            if (!mounted) return;
            if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/update-password') {
                navigate('/update-password', { replace: true });
            }
            setSession(prev => (prev && nextSession && prev.access_token === nextSession.access_token && prev.user.id === nextSession.user.id ? prev : nextSession));
            setAuthReady(true);
            if (event === 'SIGNED_OUT') {
                resetUserState();
                if (!loggingOutRef.current) toast.info('You have been signed out.');
            }
        });
        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Routing guards (aliases, login redirect with return path, `/` → dashboard) ─
    useEffect(() => {
        const path = location.pathname.replace(/\/+$/, '');
        if (path === '/login' || path === '/signup') {
            navigate({ pathname: `/auth${path}`, search: location.search }, { replace: true });
        }
    }, [location.pathname, location.search, navigate]);

    useEffect(() => {
        if (!authReady || portalKey || approvalToken || loggingOutRef.current) return;
        const fullPath = location.pathname + location.search;
        if (session) {
            if (view.screen === 'auth' || view.screen === 'root' || view.screen === 'welcome') {
                navigate(consumePostLoginRedirect() || '/dashboard', { replace: true });
            } else if (view.screen === 'notFound') {
                navigate('/dashboard', { replace: true });
            }
        } else if (!PUBLIC_SCREENS.includes(view.screen)) {
            rememberPostLoginRedirect(fullPath);
            navigate('/auth/login', { replace: true });
        } else if (view.screen === 'root' || view.screen === 'welcome' || view.screen === 'notFound') {
            // `/` belongs to the marketing site; if the app is rendered there without a session, show login.
            navigate('/auth/login', { replace: true });
        }
    }, [authReady, session, view.screen, portalKey, approvalToken, location.pathname, location.search, navigate]);

    // ── Data loading ─────────────────────────────────────────────────────────
    const loadJobs = async (userId: string) => {
        const { data, error } = await selectWithFallback('jobs', JOB_COLUMN_SETS, q => q.eq('user_id', userId).order('created_at', { ascending: false }).limit(JOBS_LIMIT));
        if (error) throw error;
        return (data || []).map(mapJobRow);
    };

    const loadClients = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('clients').select(CLIENT_COLUMNS).eq('user_id', userId).order('name').range(0, CLIENTS_LIMIT - 1);
        if (error) throw error;
        if (sessionUserIdRef.current === userId) setClients((data || []) as Client[]);
        return (data || []) as Client[];
    }, []);

    const loadInventory = useCallback(async (userId: string) => {
        const { data, error } = await selectWithFallback<InventoryItem>('inventory', INVENTORY_COLUMN_SETS, q => q.eq('user_id', userId).order('name').limit(INVENTORY_LIMIT));
        if (!error && data && sessionUserIdRef.current === userId) setInventory(data);
        return data || [];
    }, []);

    const loadSavedItems = useCallback(async (userId: string) => {
        const { data, error } = await selectWithFallback<SavedItem>('saved_items', SAVED_ITEM_COLUMN_SETS, q => q.eq('user_id', userId).order('name').limit(SAVED_ITEMS_LIMIT));
        if (!error && data && sessionUserIdRef.current === userId) setSavedItems(data);
        return data || [];
    }, []);

    const loadRecentDocuments = useCallback(async (userId: string) => {
        const { data, error } = await supabase
            .from('documents')
            .select(DOCUMENT_METADATA_COLUMNS)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(0, RECENT_DOCUMENTS_LIMIT - 1);
        if (error) throw error;
        const mapped = (data || []).map((row: any) => mapDocumentRow(row));
        // Merge, never replace: keeps per-job pages and full documents that are open (CORE-007).
        if (sessionUserIdRef.current === userId) setForms(prev => mergeDocuments(prev, mapped));
        return mapped;
    }, []);

    const refreshUsage = useCallback(async () => {
        const uid = sessionUserIdRef.current;
        const snap = await fetchUsage().catch(() => null);
        if (!uid || sessionUserIdRef.current !== uid) return;
        setUsage(snap);
        if (snap) setProfile(prev => (prev ? { ...prev, emailUsage: snap.emailsThisMonth } : prev));
        // Free plan "documents per job": the same creation counts the database enforces (paid plans have no limit).
        if (snap && snap.limits.docs === null) { setDocUsage(null); return; }
        const perJob = await fetchDocumentUsageByJob(usageMonthStart(snap?.monthStart)).catch(() => null);
        if (sessionUserIdRef.current === uid) setDocUsage(perJob);
    }, []);

    const writeCache = (userId: string, payload: { profile?: AppProfile; jobs?: AppJob[]; clients?: Client[]; documents?: FormDataType[] }) => {
        // Best effort, never blocks the UI. Read-only offline cache (no secrets are stored).
        (async () => {
            try {
                if (payload.profile) await dbApi.replaceAll('profile', [{ ...payload.profile, id: userId }]);
                if (payload.jobs) await dbApi.replaceAll('jobs', payload.jobs);
                if (payload.clients) await dbApi.replaceAll('clients', payload.clients);
                if (payload.documents) await dbApi.putMany('documents', payload.documents.filter(d => isLightweightDocument(d)));
            } catch { /* cache is optional */ }
        })();
    };

    const loadFromCache = async (userId: string): Promise<boolean> => {
        try {
            const [cachedProfiles, cachedJobs, cachedClients, cachedDocs] = await Promise.all([
                dbApi.getAll('profile'), dbApi.getAll('jobs'), dbApi.getAll('clients'), dbApi.getAll('documents'),
            ]);
            const cachedProfile = cachedProfiles.find(p => p?.id === userId);
            if (!cachedProfile) return false;
            const myJobs = cachedJobs.filter(j => j?.userId === userId) as AppJob[];
            const jobIds = new Set(myJobs.map(j => j.id));
            setProfile({ ...mapProfileRow({ id: userId }), ...cachedProfile });
            setJobs(myJobs);
            setJobsLoaded(true);
            setClients(cachedClients.filter(c => c?.user_id === userId));
            setForms(mergeDocuments([], cachedDocs.filter(d => d && !String(d.id).startsWith('full:') && jobIds.has(d.jobId))));
            setUsingCachedData(true);
            return true;
        } catch {
            return false;
        }
    };

    const loadAccountData = async (user: User, options: { silent?: boolean } = {}) => {
        const seq = ++loadSeqRef.current;
        const isCurrent = () => loadSeqRef.current === seq && sessionUserIdRef.current === user.id;
        if (!options.silent) {
            setProfileStatus(prev => (prev === 'ready' ? 'ready' : 'loading'));
            setLoadError(null);
        }

        if (!navigator.onLine) {
            const ok = await loadFromCache(user.id);
            if (!isCurrent()) return;
            if (ok) setProfileStatus('ready');
            else {
                setProfileStatus('error');
                setLoadError("You're offline and this device has no saved copy of your account yet. Reconnect to continue.");
            }
            return;
        }

        let loadedProfile: AppProfile;
        try {
            loadedProfile = await loadProfileRow(user, theme);
        } catch (err) {
            if (!isCurrent()) return;
            if (!options.silent && await loadFromCache(user.id)) {
                if (!isCurrent()) return;
                setProfileStatus('ready');
                toast.error(`Could not reach the server, showing saved data. ${describeError(err)}`);
                return;
            }
            setProfileStatus(prev => (options.silent && prev === 'ready' ? 'ready' : 'error'));
            setLoadError(describeError(err, 'We could not load your account. Please try again.'));
            return;
        }
        if (!isCurrent()) return;
        setProfile(prev => ({ ...loadedProfile, emailUsage: prev?.emailUsage ?? loadedProfile.emailUsage }));
        setProfileStatus('ready');
        setUsingCachedData(false);
        if (!deviceThemeChosenRef.current && loadedProfile.theme) setThemeState(loadedProfile.theme);

        const [jobsRes, docsRes, clientsRes] = await Promise.allSettled([
            loadJobs(user.id),
            loadRecentDocuments(user.id),
            loadClients(user.id),
            loadInventory(user.id),
            loadSavedItems(user.id),
            refreshUsage(),
        ]);
        if (!isCurrent()) return;

        if (jobsRes.status === 'fulfilled') {
            setJobs(jobsRes.value);
        } else {
            toast.error(`Could not load your jobs. ${describeError(jobsRes.reason)}`, { action: { label: 'Retry', onClick: () => loadAccountData(user) } });
        }
        setJobsLoaded(true);
        if (docsRes.status === 'rejected') toast.error(`Could not load recent documents. ${describeError(docsRes.reason)}`);

        writeCache(user.id, {
            profile: loadedProfile,
            jobs: jobsRes.status === 'fulfilled' ? jobsRes.value : undefined,
            clients: clientsRes.status === 'fulfilled' ? clientsRes.value : undefined,
            documents: docsRes.status === 'fulfilled' ? docsRes.value : undefined,
        });
    };

    useEffect(() => {
        const user = session?.user;
        if (!user) return;
        if (loadedUserIdRef.current === user.id) return;
        if (loadedUserIdRef.current) resetUserState(); // a different account signed in: drop the previous user's data
        loadedUserIdRef.current = user.id;
        loadAccountData(user);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]);

    // Background jobs once per session: recurring invoices (VIEW-039) and community unread badge (VIEW-043).
    useEffect(() => {
        const uid = session?.user?.id;
        if (!uid || profileStatus !== 'ready' || !navigator.onLine) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const mod: any = await import('./services/recurringService.ts');
                const run = mod.runDueRecurringInvoices || mod.generateDueRecurringInvoices;
                const result = typeof run === 'function' ? await run() : 0;
                const created = typeof result === 'number' ? result : Number(result?.created ?? result?.count ?? 0);
                if (!cancelled && created > 0 && sessionUserIdRef.current === uid) {
                    toast.info(`${created} recurring ${created === 1 ? 'invoice was' : 'invoices were'} created.`);
                    loadRecentDocuments(uid).catch(() => undefined);
                }
            } catch { /* optional feature */ }
        }, 1500);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [session?.user?.id, profileStatus, loadRecentDocuments]);

    const refreshForumBadge = useCallback(async () => {
        if (!sessionUserIdRef.current || !navigator.onLine) return;
        try {
            const mod: any = await import('./components/ForumView.tsx');
            if (typeof mod.fetchForumUnreadCount === 'function') {
                const n = await mod.fetchForumUnreadCount();
                if (sessionUserIdRef.current) setNotificationCount(Number(n) || 0);
            }
        } catch { /* optional */ }
    }, []);

    useEffect(() => {
        if (profileStatus !== 'ready') return;
        const timer = setTimeout(refreshForumBadge, 2500);
        return () => clearTimeout(timer);
    }, [profileStatus, view.screen, refreshForumBadge]);

    // ── Documents per job / full document loading ─────────────────────────────
    const loadDocumentsForJob = useCallback(async (jobId: string, reset = false) => {
        if (!sessionUserIdRef.current || !jobId) return;
        if (!navigator.onLine) {
            setDocumentPagination(prev => ({ ...prev, [jobId]: { offset: prev[jobId]?.offset || 0, hasMore: false, loading: false, loaded: true } }));
            return;
        }
        const current = docPagRef.current[jobId];
        if (current?.loading) return;
        const from = reset ? 0 : (current?.offset || 0);
        setDocumentPagination(prev => ({ ...prev, [jobId]: { offset: from, hasMore: prev[jobId]?.hasMore ?? true, loading: true, loaded: prev[jobId]?.loaded ?? false } }));
        const { data, error } = await supabase
            .from('documents')
            .select(DOCUMENT_METADATA_COLUMNS)
            .eq('job_id', jobId)
            .order('created_at', { ascending: false })
            .range(from, from + DOCUMENT_PAGE_SIZE - 1);
        if (error) {
            toast.error(`Could not load documents. ${describeError(error)}`);
            setDocumentPagination(prev => ({ ...prev, [jobId]: { offset: from, hasMore: true, loading: false, loaded: true } }));
            return;
        }
        const mapped = (data || []).map((row: any) => mapDocumentRow(row));
        setForms(prev => {
            let base = prev;
            if (reset && mapped.length < DOCUMENT_PAGE_SIZE) {
                // The first page is the whole list: drop documents of this job that were deleted elsewhere.
                const fresh = new Set(mapped.map(d => d.id));
                base = prev.filter(f => f.jobId !== jobId || fresh.has(f.id));
            }
            return mergeDocuments(base, mapped);
        });
        setDocumentPagination(prev => ({ ...prev, [jobId]: { offset: from + mapped.length, hasMore: mapped.length === DOCUMENT_PAGE_SIZE, loading: false, loaded: true } }));
    }, []);

    const viewJobId = view.screen === 'jobDetails' || view.screen === 'selectDocType' || view.screen === 'form' ? view.jobId : null;
    useEffect(() => {
        if (viewJobId && session?.user?.id && profileStatus === 'ready') loadDocumentsForJob(viewJobId, true);
    }, [viewJobId, session?.user?.id, profileStatus, loadDocumentsForJob]);

    const openFormId = view.screen === 'form' ? view.formId : null;
    const openForm = openFormId ? forms.find(f => f.id === openFormId) : undefined;
    const openFormIsFull = !!openForm && !isLightweightDocument(openForm);

    useEffect(() => {
        if (!openFormId || openFormIsFull || !session?.user?.id) return;
        let cancelled = false;
        setFormLoad({ id: openFormId, error: null });
        (async () => {
            try {
                let full: FormDataType | null = null;
                if (navigator.onLine) {
                    full = await fetchFullDocument(openFormId, { force: formReloadNonce > 0 });
                    dbApi.put('documents', { ...full, id: `full:${full.id}`, docId: full.id }).catch(() => undefined);
                } else {
                    const cached = await dbApi.get('documents', `full:${openFormId}`).catch(() => undefined);
                    if (cached) full = { ...cached, id: cached.docId } as FormDataType;
                }
                if (cancelled) return;
                if (!full) throw new Error("This document isn't saved on this device. Reconnect to open it.");
                const loaded = full;
                setForms(prev => mergeDocuments(prev.filter(f => f.id !== loaded.id), [loaded]));
                setFormLoad(null);
            } catch (err) {
                if (!cancelled) setFormLoad({ id: openFormId, error: describeError(err, 'Could not open this document.') });
            }
        })();
        return () => { cancelled = true; };
    }, [openFormId, openFormIsFull, session?.user?.id, formReloadNonce]);

    // Deep links to "new document" respect the free plan (CORE-024); the DB enforces it too. Checked once per
    // visit: a later usage refresh never closes a form the user is typing in (the save keeps the work, see below).
    const newDocCheckedRef = useRef<string | null>(null);
    useEffect(() => {
        if (profileStatus !== 'ready' || paid) return;
        const isNewDoc = view.screen === 'selectDocType' || (view.screen === 'form' && !view.formId && !view.prefillData);
        if (!isNewDoc || !viewJobId || newDocCheckedRef.current === location.key) return;
        if (!docUsage && !docPagRef.current[viewJobId]?.loaded) return; // wait for a count
        newDocCheckedRef.current = location.key;
        if (checkLimit('docs', viewJobId)) return;
        // The type picker goes back to the job; an open form stays (it can't be saved, but nothing typed is lost).
        if (view.screen === 'selectDocType') navigate(`/jobs/${viewJobId}`, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view.screen, viewJobId, location.key, profileStatus, paid, docUsage, documentPagination[viewJobId || '']?.loaded]);

    // Duplicate-job modal: make sure the job's documents are loaded (CORE-026).
    const duplicateCandidateForms = useMemo(
        () => (jobToDuplicate ? forms.filter(f => f.jobId === jobToDuplicate.id) : []),
        [forms, jobToDuplicate?.id],
    );
    useEffect(() => {
        if (showDuplicateJobModal && jobToDuplicate && !docPagRef.current[jobToDuplicate.id]?.loaded) {
            loadDocumentsForJob(jobToDuplicate.id, true);
        }
    }, [showDuplicateJobModal, jobToDuplicate?.id, loadDocumentsForJob]);

    // ── Auth handlers ────────────────────────────────────────────────────────
    const handleLogin = async (email: string, pass: string) => {
        if (!navigator.onLine) throw new Error("You're offline. Connect to the internet to log in.");
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
        if (error) throw error;
    };

    const handleSignup = async (email: string, pass: string) => {
        if (!navigator.onLine) throw new Error("You're offline. Connect to the internet to sign up.");
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password: pass,
            options: { emailRedirectTo: `${window.location.origin}/auth/login` },
        });
        if (error) throw error;
        try { sessionStorage.setItem('signup_email', email.trim()); } catch { /* ignore */ }
        // With email confirmation off, Supabase returns a session and the route guard opens the dashboard.
        if (!data.session) navigate('/auth/checkEmail', { replace: true });
    };

    const handleResendConfirmation = async () => {
        let email = '';
        try { email = sessionStorage.getItem('signup_email') || ''; } catch { /* ignore */ }
        if (!email) { navigate('/auth/signup'); return; }
        const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/login` } });
        if (error) toast.error(describeError(error));
        else toast.success(`We sent a new link to ${email}.`);
    };

    const handleResetPassword = async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/update-password`,
        });
        if (error) throw error;
    };

    const handleUpdatePassword = async (password: string) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success('Your password was updated.');
        navigate('/dashboard', { replace: true });
    };

    const handleLoginWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/login` } });
        if (error) throw error;
    };

    /** Logout clears everything the previous user left on this device (CORE-008, CORE-028). */
    const handleLogout = async () => {
        loggingOutRef.current = true;
        try {
            await supabase.auth.signOut({ scope: navigator.onLine ? 'global' : 'local' });
        } catch {
            try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
        }
        clearDocumentCache();
        clearUserBrowserStorage();
        try { await dbApi.clearAll(); } catch { /* ignore */ }
        // Full reload: drops every in-memory cache (AI conversations included) and shows the marketing site.
        window.location.replace('/');
    };

    // ── Navigation helpers (also used by the AI action handler) ──────────────
    const navigateToDashboard = () => setView({ screen: 'dashboard' });
    const navigateToSettings = () => setView({ screen: 'settings' });
    const navigateToNewDoc = async (jobId: string) => {
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to create documents."); return; }
        if (await ensureDocSlot(jobId)) setView({ screen: 'selectDocType', jobId });
    };
    const navigateToCreateJob = (returnTo: 'dashboard' | 'calendar' = 'dashboard', prefillData?: Record<string, unknown>) => {
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to create jobs."); return; }
        if (checkLimit('jobs')) setView({ screen: 'createJob', returnTo: returnTo === 'calendar' ? 'calendar' : undefined, prefillData });
    };
    const navigateToPriceBook = () => setView({ screen: 'pricebook' });
    const navigateToCalculator = () => setView({ screen: 'profitCalculator' });
    const navigateToAnalytics = () => setView({ screen: 'analytics' });
    const navigateToCalendar = () => setView({ screen: 'calendar' });

    const canGoBack = () => ((window.history.state as any)?.idx ?? 0) > 0;

    /** Opens a saved document; `fromJob` lets its Back button return to the job page with history.back(). */
    const openDocument = (form: FormDataType, fromJob = false) => {
        navigate(`/jobs/${form.jobId}/forms/${encodeURIComponent(form.type)}/${form.id}`, { state: { fromJob } });
    };

    const handleNavDestination = (dest: NavDestination) => {
        switch (dest) {
            case 'dashboard': navigate('/dashboard'); break;
            case 'clients': navigate('/clients'); break;
            case 'communication': navigate('/communication'); break;
            case 'inventory': navigate('/inventory'); break;
            case 'pricebook': navigate('/pricebook'); break;
            case 'calendar': navigate('/calendar'); break;
            case 'calculator': navigate('/calculator'); break;
            case 'analytics': navigate('/analytics'); break;
            case 'forum': navigate('/forum'); break;
            case 'settings': navigate('/settings'); break;
            case 'profile': navigate('/profile'); break;
            case 'billing': navigate('/settings#billing'); break;
        }
    };

    // ── Profile / settings handlers ──────────────────────────────────────────
    const handleUploadDocumentImage = async (file: File): Promise<string> => {
        const uid = sessionUserIdRef.current;
        if (!uid) return '';
        try {
            const compressed = await compressImage(file);
            return await uploadFile('logos', compressed, uid, 'doc');
        } catch (e) {
            toast.error(`Image upload failed. ${describeError(e)}`);
            return '';
        }
    };

    /** Saves profile fields. Throws so Settings keeps the edits and shows the error (CORE-021, VIEW-010). */
    const handleSaveProfile = async (updated: UserProfile, logoFile?: File | null, profilePicFile?: File | null) => {
        const uid = sessionUserIdRef.current;
        if (!uid) throw new Error('Please sign in again.');
        if (!navigator.onLine) throw new Error("You're offline. Your changes are still here; save again when you reconnect.");
        let logoUrl = updated.logoUrl || '';
        let pictureUrl = updated.profilePictureUrl || '';
        try {
            if (logoFile) logoUrl = await uploadFile('logos', logoFile, uid, 'logo');
            if (profilePicFile) pictureUrl = await uploadFile('logos', profilePicFile, uid, 'avatar');
        } catch (err) {
            throw new Error(`Image upload failed: ${describeError(err)}`);
        }
        const row = {
            name: (updated.name || '').trim(),
            company_name: (updated.companyName || '').trim(),
            email: (updated.email || '').trim(),
            phone: (updated.phone || '').trim(),
            address: (updated.address || '').trim(),
            website: (updated.website || '').trim(),
            logo_url: logoUrl || null,
            profile_picture_url: pictureUrl || null,
            job_title: (updated.jobTitle || '').trim(),
            language: updated.language || 'English',
            email_templates: updated.emailTemplates ?? {},
            theme,
            updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('profiles').update(row).eq('id', uid);
        if (error) throw new Error(describeError(error, 'Your changes could not be saved.'));
        setProfile(prev => (prev ? { ...prev, ...updated, logoUrl, profilePictureUrl: pictureUrl, theme } : prev));
        toast.success('Settings saved.');
    };

    const handleSaveSignature = async (dataUrl: string | null) => {
        const uid = sessionUserIdRef.current;
        if (!uid || !navigator.onLine) return;
        const { error } = await supabase.from('profiles').update({ default_signature_url: dataUrl }).eq('id', uid);
        if (error && !isMissingColumnError(error)) toast.error(`Signature saved on this device only. ${describeError(error)}`);
        else if (!error) setProfile(prev => (prev ? { ...prev, defaultSignatureUrl: dataUrl || undefined } : prev));
        toast.success(dataUrl ? 'Default signature saved.' : 'Default signature removed.');
    };

    const handleManageBilling = async () => {
        const url = await getBillingPortalUrl();
        if (!url) throw new Error('The billing portal is not available right now. Please contact support to change or cancel your plan.');
        window.location.assign(url);
    };

    const handleDeleteAccount = async () => {
        if (!navigator.onLine) throw new Error("You're offline.");
        try {
            await invokeFunction('delete-account', {});
        } catch {
            throw new Error("Automatic account deletion isn't available right now.");
        }
        loggingOutRef.current = true;
        try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
        clearDocumentCache();
        clearUserBrowserStorage();
        try { await dbApi.clearAll(); } catch { /* ignore */ }
        window.location.replace('/');
    };

    const handleEmailSent = () => {
        // The gmail function records email usage server-side; just refresh the meters.
        refreshUsage();
    };

    // ── Jobs ─────────────────────────────────────────────────────────────────
    const insertJobRow = async (row: Record<string, unknown>): Promise<AppJob> => {
        let payload = { ...row };
        for (let attempt = 0; attempt < 3; attempt++) {
            const { data, error } = await supabase.from('jobs').insert(payload).select(JOB_COLUMN_SETS[2]).single();
            if (!error) return mapJobRow({ ...payload, ...((data as any) || {}) });
            if (isMissingColumnError(error)) {
                if ('client_id' in payload && /client_id/i.test(error.message || '')) { const { client_id, ...rest } = payload as any; payload = rest; continue; }
                if ('worker_name' in payload && /worker_name/i.test(error.message || '')) { const { worker_name, ...rest } = payload as any; payload = rest; continue; }
            }
            throw error;
        }
        throw new Error('Could not create the job.');
    };

    const findClientIdByName = (name?: string | null): string | null => {
        if (!name) return null;
        const n = name.trim().toLowerCase();
        return clients.find(c => (c.name || '').trim().toLowerCase() === n)?.id ?? null;
    };

    const byClientName = (a: Client, b: Client) => (a.name || '').localeCompare(b.name || '');

    /** A saved client with this name (case-insensitive): the loaded list first, then the database. */
    const findClientByName = async (name: string): Promise<Client | null> => {
        const n = name.trim().toLowerCase();
        if (!n) return null;
        const local = clients.find(c => (c.name || '').trim().toLowerCase() === n);
        if (local || !navigator.onLine) return local || null;
        const pattern = name.trim().replace(/[\\%_]/g, c => `\\${c}`); // ilike without wildcards = case-insensitive equality
        const { data, error } = await supabase.from('clients').select(CLIENT_COLUMNS).ilike('name', pattern).limit(5);
        // (PostgREST also treats `*` as a wildcard: keep only a true case-insensitive match.)
        const found = !error && Array.isArray(data)
            ? ((data as Client[]).find(c => (c.name || '').trim().toLowerCase() === n) ?? null)
            : null;
        if (found) setClients(prev => (prev.some(c => c.id === found.id) ? prev : [...prev, found].sort(byClientName)));
        return found;
    };

    /**
     * 0b.8: a job created with a client name that isn't a saved client adds that client to Clients and links it.
     * Goes through the Clients screen's save path (insertClient), so the database applies the Free plan's client
     * limit; the job itself is never blocked by this: on a limit or an error the user is told and the job keeps
     * the typed name.
     */
    const createClientForJob = async (jobId: string, name: string, address: string): Promise<string | null> => {
        const uid = sessionUserIdRef.current;
        if (!uid || !name.trim()) return null;
        let client: Client;
        try {
            const { insertClient } = await import('./components/ClientDetails.tsx');
            client = await insertClient({ name, email: '', phone: '', address, notes: '' }, uid);
        } catch (error) {
            if (isPlanLimitError(error)) {
                const reason = planLimitMessage(error);
                toast.info(`The job was created, but "${name}" was not added to your clients. ${reason}`, {
                    duration: 10000,
                    action: { label: 'Upgrade', onClick: () => openUpgrade(reason) },
                });
            } else {
                toast.error(`The job was created, but "${name}" could not be added to your clients. ${describeError(error)}`);
            }
            return null;
        }
        if (sessionUserIdRef.current !== uid) return null;
        setClients(prev => [...prev.filter(c => c.id !== client.id), client].sort(byClientName));
        const { error } = await supabase.from('jobs').update({ client_id: client.id }).eq('id', jobId);
        if (!error) setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, clientId: client.id } : j)));
        refreshUsage();
        toast.success(`"${client.name}" was added to your clients.`);
        return client.id;
    };

    const handleUpdateJobStatus = async (jobId: string, newStatus: Job['status']) => {
        if (!JOB_STATUSES.includes(newStatus)) return;
        const prevJob = jobs.find(j => j.id === jobId);
        if (!prevJob || prevJob.status === newStatus) return;
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to change the job status."); return; }
        setJobs(p => p.map(j => (j.id === jobId ? { ...j, status: newStatus } : j)));
        const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId);
        if (error) {
            setJobs(p => p.map(j => (j.id === jobId ? { ...j, status: prevJob.status } : j)));
            toast.error(`Could not update the job status. ${describeError(error)}`);
        }
    };

    /**
     * Creates a job (snake_case columns, CORE-005). Throws on failure (JobForm shows the message).
     * Called with an existing job (`id` + `status`) it updates that job's status instead (CORE-006).
     */
    const handleSaveJob = async (jobData: any, skipNavigation: boolean = false): Promise<string> => {
        const uid = sessionUserIdRef.current;
        if (!uid) throw new Error('Please sign in again.');
        if (jobData?.id && jobs.some(j => j.id === jobData.id)) {
            if (jobData.status) await handleUpdateJobStatus(jobData.id, normalizeJobStatus(jobData.status));
            return jobData.id;
        }
        if (!navigator.onLine) throw new Error("You're offline. Reconnect to create the job.");
        if (!checkLimit('jobs')) throw new Error('You have reached the Free plan job limit for this month.');

        const name = String(jobData?.name || '').trim();
        if (!name) throw new Error('Please enter a job name.');

        // Worker double-booking: checked BEFORE saving, like the old app (which refused to save). Now the user
        // can still go ahead on purpose.
        const workerName = String(jobData?.workerName || '').trim();
        if (workerName) {
            const start = jobData?.startDate || localYmd();
            const end = jobData?.endDate || start;
            const conflict = jobs.find(j => j.status === 'active' && j.workerName && j.workerName.toLowerCase() === workerName.toLowerCase()
                && (j.startDate || '') <= end && ((j.endDate || j.startDate) || '') >= start);
            if (conflict && !window.confirm(`Scheduling conflict: ${workerName} is already scheduled on "${conflict.name}" during these dates.\n\nCreate this job anyway?`)) {
                throw new Error(`Not saved: ${workerName} is already scheduled on "${conflict.name}" during these dates. Change the dates or the worker.`);
            }
        }

        const clientName = String(jobData?.clientName || '').trim();
        const clientAddress = String(jobData?.clientAddress || '').trim();
        const row: Record<string, unknown> = {
            id: crypto.randomUUID(),
            user_id: uid,
            name,
            client_name: clientName || null,
            client_address: clientAddress || null,
            start_date: jobData?.startDate || localYmd(),
            end_date: jobData?.endDate || null,
            status: 'active',
            worker_name: String(jobData?.workerName || '').trim() || null,
        };
        // Link a saved client: the one picked, else one with the same name (case-insensitive).
        const clientId: string | null = jobData?.clientId || (clientName ? (await findClientByName(clientName))?.id ?? null : null);
        if (clientId) row.client_id = clientId;

        let created: AppJob;
        try {
            created = await insertJobRow(row);
        } catch (error) {
            if (handlePlanLimit(error)) throw new Error(planLimitMessage(error));
            throw new Error(`Could not create the job. ${describeError(error)}`);
        }
        setJobs(prev => [created, ...prev.filter(j => j.id !== created.id)]);
        refreshUsage();
        toast.success(`Job "${created.name}" created.`);
        // A new client name becomes a saved client (in the background: the job is already created).
        if (!clientId && clientName) void createClientForJob(created.id, clientName, clientAddress);

        if (!skipNavigation) {
            if (view.screen === 'createJob' && view.returnTo === 'calendar') navigate('/calendar', { replace: true });
            else navigate(`/jobs/${created.id}`, { replace: true });
        }
        return created.id;
    };

    const handleDeleteJob = async () => {
        const id = jobToDelete;
        if (!id) return;
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to delete jobs."); throw new Error('offline'); }
        const { error } = await supabase.from('jobs').delete().eq('id', id);
        if (error) {
            toast.error(`Could not delete the job. ${describeError(error)}`);
            throw error;
        }
        const job = jobs.find(j => j.id === id);
        setJobs(prev => prev.filter(j => j.id !== id));
        setForms(prev => {
            prev.filter(f => f.jobId === id).forEach(f => invalidateDocument(f.id));
            return prev.filter(f => f.jobId !== id);
        });
        setDocumentPagination(prev => { const next = { ...prev }; delete next[id]; return next; });
        dbApi.delete('jobs', id).catch(() => undefined);
        refreshUsage();
        toast.success(job ? `Job "${job.name}" deleted.` : 'Job deleted.');
        if (viewJobId === id) navigate('/dashboard', { replace: true });
    };

    const handleDuplicateJob = async (jobName: string, clientId: string | null, clientName: string, selectedDocIds: string[]) => {
        const uid = sessionUserIdRef.current;
        const source = jobToDuplicate;
        if (!uid || !source) return;
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to duplicate jobs."); throw new Error('offline'); }
        if (!checkLimit('jobs')) throw new Error('limit');

        const client = clientId ? clients.find(c => c.id === clientId) : undefined;
        const row: Record<string, unknown> = {
            id: crypto.randomUUID(),
            user_id: uid,
            name: jobName.trim() || `${source.name} (Copy)`,
            client_name: clientName || source.clientName || null,
            client_address: client ? (client.address || null) : (source.clientAddress || null),
            start_date: localYmd(),
            end_date: null,
            status: 'active',
            worker_name: source.workerName || null,
        };
        const newClientName = String(row.client_name || '').trim();
        const linkedClientId = clientId || (source as AppJob).clientId || (newClientName ? (await findClientByName(newClientName))?.id ?? null : null);
        if (linkedClientId) row.client_id = linkedClientId;

        let created: AppJob;
        try {
            created = await insertJobRow(row);
        } catch (error) {
            if (!handlePlanLimit(error)) toast.error(`Could not duplicate the job. ${describeError(error)}`);
            throw error;
        }
        setJobs(prev => [created, ...prev]);
        if (!linkedClientId && newClientName) void createClientForJob(created.id, newClientName, String(row.client_address || ''));

        let copied = 0;
        if (selectedDocIds.length) {
            try {
                const fullDocs = await fetchFullDocuments(selectedDocIds);
                const records = fullDocs.map(doc => ({
                    id: crypto.randomUUID(),
                    user_id: uid,
                    job_id: created.id,
                    type: doc.type,
                    data: buildDuplicateDocumentData(doc.data as Record<string, any>, {
                        ...('clientName' in (doc.data as any) ? { clientName: created.clientName } : {}),
                        ...('clientAddress' in (doc.data as any) ? { clientAddress: created.clientAddress } : {}),
                        ...('projectName' in (doc.data as any) ? { projectName: created.name } : {}),
                    }),
                }));
                if (records.length) {
                    const { error } = await supabase.from('documents').insert(records);
                    if (error) throw error;
                    copied = records.length;
                    const now = new Date().toISOString();
                    const mapped = records.map(r => mapDocumentRow({ ...r, created_at: now }, true));
                    mapped.forEach(primeDocumentCache);
                    setForms(prev => mergeDocuments(prev, mapped));
                    bumpDocUsage(created.id, records.length);
                }
            } catch (error) {
                if (!handlePlanLimit(error)) toast.error(`The job was copied, but its documents were not. ${describeError(error)}`);
            }
        }
        refreshUsage();
        setShowDuplicateJobModal(false);
        setJobToDuplicate(null);
        toast.success(copied ? `Job duplicated with ${copied} ${copied === 1 ? 'document' : 'documents'}.` : 'Job duplicated.');
        navigate(`/jobs/${created.id}`);
    };

    // ── Documents ────────────────────────────────────────────────────────────
    const handleDocumentsViewed = (ids: string[]) => {
        const idSet = new Set(ids);
        setForms(prev => prev.map(f => (idSet.has(f.id) ? { ...f, data: { ...(f.data as any), viewedByProvider: true } } : f)));
    };

    const handleDuplicateDoc = async (form: FormDataType) => {
        const uid = sessionUserIdRef.current;
        if (!uid) return;
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to duplicate documents."); return; }
        if (!(await ensureDocSlot(form.jobId))) return;
        try {
            const full = await fetchFullDocument(form.id);
            const record = {
                id: crypto.randomUUID(),
                user_id: uid,
                job_id: full.jobId,
                type: full.type,
                data: buildDuplicateDocumentData(full.data as Record<string, any>),
            };
            const { error } = await supabase.from('documents').insert(record);
            if (error) throw error;
            const mapped = mapDocumentRow({ ...record, created_at: new Date().toISOString() }, true);
            primeDocumentCache(mapped);
            setForms(prev => mergeDocuments(prev, [mapped]));
            bumpDocUsage(full.jobId);
            toast.success('Copied as a new draft.');
        } catch (error) {
            if (!handlePlanLimit(error)) toast.error(`Could not duplicate the document. ${describeError(error)}`);
        }
    };

    const handleDeleteDoc = async () => {
        const id = docToDelete;
        if (!id) return;
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to delete documents."); throw new Error('offline'); }
        const { error } = await supabase.from('documents').delete().eq('id', id);
        if (error) {
            toast.error(`Could not delete the document. ${describeError(error)}`);
            throw error;
        }
        invalidateDocument(id);
        setForms(prev => prev.filter(f => f.id !== id));
        dbApi.delete('documents', id).catch(() => undefined);
        dbApi.delete('documents', `full:${id}`).catch(() => undefined);
        toast.success('Document deleted.');
        if (view.screen === 'form' && view.formId === id) navigate(`/jobs/${view.jobId}`, { replace: true });
    };

    /**
     * A "<Client> - General" job that so far only exists in memory (see handleNavigateToNewDoc) is created now, right
     * before its first document is saved. Throws PlanLimitSaveError on the Free plan's job limit.
     */
    const createDraftJob = async (draft: AppJob): Promise<AppJob> => {
        const uid = sessionUserIdRef.current;
        if (!uid) throw new Error('Please sign in again.');
        let created: AppJob;
        try {
            created = await insertJobRow({
                id: draft.id,
                user_id: uid,
                name: draft.name,
                client_name: draft.clientName || null,
                client_address: draft.clientAddress || null,
                start_date: draft.startDate || localYmd(),
                status: 'active',
                ...(draft.clientId ? { client_id: draft.clientId } : {}),
            });
        } catch (error) {
            if (isPlanLimitError(error)) {
                const reason = planLimitMessage(error);
                openUpgrade(reason);
                throw new PlanLimitSaveError(`Not saved yet: ${reason} Everything you typed is still here.`);
            }
            // An earlier attempt may have created it before its answer got lost.
            if (/duplicate key/i.test(String((error as any)?.message || ''))) created = { ...draft };
            else throw new Error(`Could not create the job "${draft.name}". ${describeError(error)}`);
        }
        setJobs(prev => [created, ...prev.filter(j => j.id !== created.id)]);
        refreshUsage();
        toast.success(`Job "${created.name}" created.`);
        return created;
    };

    /**
     * `onSave` for the 12 forms. Resolves `false` when nothing was saved (offline, DB error: a toast says why) and
     * `{ id, public_token }` when saved. When a Free plan limit refuses the save it REJECTS with the reason (and
     * opens the upgrade modal): the form shows the message and keeps everything typed, so nothing is lost (0b.4).
     * The form stays open on the saved document (its URL is replaced, so Back/refresh reopen it instead of
     * replaying an AI draft, CORE-010).
     */
    const handleSaveForm = async (formData: any): Promise<false | { id: string; public_token: string | null }> => {
        if (!session || view.screen !== 'form') return false;
        if (savingFormPromiseRef.current) return savingFormPromiseRef.current; // auto-save + click share one save (CORE-034)
        if (!navigator.onLine) {
            toast.error("You're offline. Your document is still open; save again when you're back online.");
            return false;
        }
        const run = async (): Promise<false | { id: string; public_token: string | null }> => {
            // A new document keeps one id for its whole route visit, so retries/double saves update the same row.
            if (!view.formId && (!newFormIdRef.current || newFormIdRef.current.key !== location.key)) {
                newFormIdRef.current = { key: location.key, id: crypto.randomUUID() };
            }
            const docId = view.formId || newFormIdRef.current!.id;
            const existing = forms.find(f => f.id === docId);
            // Inventory: the database moves stock for Material Logs (while data.deductInventory is true), accepted
            // estimates/change orders and paid invoices, idempotently per document line. The browser never adjusts it.
            const touchesStock = view.formType === FormType.MaterialLog
                ? Boolean(formData?.deductInventory) || Boolean((existing?.data as any)?.deductInventory)
                : [FormType.Invoice, FormType.Estimate, FormType.ChangeOrder].includes(view.formType);

            const dataToSave = stripLightweightFlag({
                ...formData,
                ...((formData as any).isAiDrafted || (formData as any).isAiGenerated || view.prefillData?.isAiDrafted
                    ? { isAiGenerated: true }
                    : {}),
            });
            assertFullDocument({ data: dataToSave });

            let job = jobs.find(j => j.id === view.jobId);
            if (!job && draftJob && draftJob.id === view.jobId) job = await createDraftJob(draftJob);
            const record: Record<string, unknown> = {
                id: docId,
                user_id: session.user.id,
                job_id: view.jobId,
                type: view.formType,
                data: dataToSave,
            };
            const linkedClientId = job?.clientId || findClientIdByName((dataToSave as any).clientName || job?.clientName);
            if (linkedClientId) record.client_id = linkedClientId;

            let { data: savedRow, error: saveError } = await supabase.from('documents').upsert(record).select('public_token').maybeSingle();
            if (saveError && 'client_id' in record && isMissingColumnError(saveError)) {
                delete record.client_id;
                ({ data: savedRow, error: saveError } = await supabase.from('documents').upsert(record).select('public_token').maybeSingle());
            }
            if (saveError) {
                if (isPlanLimitError(saveError)) {
                    const reason = planLimitMessage(saveError);
                    openUpgrade(reason);
                    throw new PlanLimitSaveError(`Not saved yet: ${reason} Everything you typed is still here: upgrade, then press Save again.`);
                }
                const message = saveError.message || 'Document could not be saved.';
                toast.error(/insufficient stock/i.test(message)
                    ? 'Not enough stock for one or more inventory items. Reduce the quantity and try again.'
                    : `Save failed. ${describeError(saveError)}`);
                return false;
            }

            const publicToken: string | null = (savedRow as any)?.public_token ?? existing?.public_token ?? null;
            const savedForm = mapDocumentRow({ ...record, created_at: existing?.createdAt ?? new Date().toISOString(), public_token: publicToken }, true);
            primeDocumentCache(savedForm);
            setForms(prev => mergeDocuments(prev.filter(f => f.id !== savedForm.id), [savedForm]));
            dbApi.put('documents', { ...savedForm, id: `full:${savedForm.id}`, docId: savedForm.id }).catch(() => undefined);
            toast.success(existing ? `${view.formType} saved.` : `${view.formType} created.`);
            if (!existing) bumpDocUsage(view.jobId);
            if (touchesStock && sessionUserIdRef.current) loadInventory(sessionUserIdRef.current).catch(() => undefined);

            // Swap the "new document" history entry (and its AI prefill state) for the saved document. The form keeps
            // its React key, so it stays mounted with its "Saved" state and the new approval link (CORE-010).
            if (!view.formId || view.prefillData) {
                formKeyAliasRef.current[docId] = newFormKey(view.formType, view.prefillData, location.key);
                navigate(`/jobs/${view.jobId}/forms/${encodeURIComponent(view.formType)}/${docId}`, { replace: true, state: { fromJob: (location.state as any)?.fromJob ?? true } });
            }
            newFormIdRef.current = null;
            // (AI drafts are opened one at a time from the assistant; there is no AI queue to drain.)
            return { id: docId, public_token: publicToken };
        };
        const pending = run().catch((err): false => {
            if (err instanceof PlanLimitSaveError) throw err; // the form shows it and keeps the typed work
            toast.error(describeError(err, 'Document could not be saved.'));
            return false;
        });
        savingFormPromiseRef.current = pending;
        try {
            return await pending;
        } finally {
            savingFormPromiseRef.current = null;
        }
    };

    /**
     * Quick "new document for client" from the Clients screen. Reuses the client's active job, else the client's
     * existing "<Client> - General" job. Otherwise the General job is only prepared in memory and created when the
     * document is saved (createDraftJob), so a discarded document doesn't use up one of the Free plan's jobs (0b.15).
     */
    const handleNavigateToNewDoc = async (type: FormType, clientId: string) => {
        const uid = sessionUserIdRef.current;
        if (!uid) return;
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to create documents."); return; }
        let client = clients.find(c => c.id === clientId);
        if (!client) {
            try { const { fetchClientById } = await import('./utils/clientLinks.ts'); client = (await fetchClientById(clientId)) || undefined; } catch { client = undefined; }
        }
        if (!client) { toast.error('Client not found.'); return; }
        const c = client;
        const sameName = (a?: string | null, b?: string | null) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
        const isClientsJob = (j: AppJob) => j.clientId === c.id || (!j.clientId && sameName(j.clientName, c.name));
        const generalName = `${c.name} - General`;
        const existingJob = jobs.find(j => j.status === 'active' && isClientsJob(j))
            || jobs.find(j => isClientsJob(j) && sameName(j.name, generalName));
        if (existingJob) {
            if (!(await ensureDocSlot(existingJob.id))) return;
            setView({ screen: 'form', formType: type, jobId: existingJob.id, formId: null });
            return;
        }
        // A job will be needed on save: check the Free plan's job limit now, before anything is typed.
        if (!checkLimit('jobs')) return;
        const draft: AppJob = {
            id: crypto.randomUUID(),
            userId: uid,
            name: generalName,
            clientName: c.name,
            clientAddress: c.address || '',
            startDate: localYmd(),
            endDate: null,
            status: 'active',
            createdAt: new Date().toISOString(),
            clientId: c.id,
        };
        setDraftJob(draft);
        navigate(`/jobs/${draft.id}/forms/${encodeURIComponent(type)}`, { state: { fromJob: true } });
    };

    const handleAddJobFromInventory = async (data: Partial<Job>): Promise<Job | null> => {
        try {
            const id = await handleSaveJob(data, true);
            return jobs.find(j => j.id === id) || ({ id, name: data.name || '', clientName: data.clientName || '', clientAddress: data.clientAddress || '', startDate: data.startDate || localYmd(), endDate: null, status: 'active', userId: sessionUserIdRef.current || '' } as Job);
        } catch (error) {
            toast.error(describeError(error));
            return null;
        }
    };

    const t = getTranslations(profile?.language);

    // ── AI-OWNED (AI engineer): assistant hook + render helpers placed by CORE in the page headers. ──
    // The assistant only proposes; every side effect runs from an explicit click inside the panel.
    const ai = useAIAssistant({
        session,
        profile,
        jobs,
        clients,
        forms,
        inventory,
        checkLimit,
        onUpgrade: openUpgrade,
        updateJobStatus: handleUpdateJobStatus,
        onDuplicateJob: (job: Job) => { setJobToDuplicate(job); setShowDuplicateJobModal(true); },
        onEmailsSent: () => handleEmailSent(),
        uploadImage: handleUploadDocumentImage,
        refreshData: () => { const uid = sessionUserIdRef.current; if (uid) { loadInventory(uid).catch(() => undefined); loadClients(uid).catch(() => undefined); loadRecentDocuments(uid).catch(() => undefined); refreshUsage(); } },
        createJob: (values) => handleSaveJob(values, true),
    });

    const renderDashboardAI = () => <DashboardMasterAIButton onOpen={ai.openDashboard} />;

    const renderJobAIButton = (job: Job) => <InlineAIButton onClick={() => ai.openForJob(job)} />;

    // The assistant panel is mounted once at the root (see <AIAssistantPanel>), for dashboard and job mode.
    const renderJobAIModal = (_job: Job) => null;
    // ── end AI-owned render helpers ──

    // ── Screens ──────────────────────────────────────────────────────────────
    const renderNotFoundJob = () => (
        <div className="page">
            <EmptyState
                icon={BriefcaseIcon}
                title="Job not found"
                description="It may have been deleted, or the link is wrong."
                action={<button type="button" className="btn btn-primary" onClick={navigateToDashboard}>Back to dashboard</button>}
            />
        </div>
    );

    const renderDashboard = () => (
        <DashboardScreen
            userName={profile?.name || ''}
            plan={plan}
            jobs={jobs}
            forms={forms}
            clientsCount={clients.length}
            lowStockCount={lowStockCount}
            usage={effectiveUsage}
            loading={!jobsLoaded}
            t={t}
            aiSlot={renderDashboardAI()}
            onNewJob={() => navigateToCreateJob('dashboard')}
            onOpenJob={(jobId) => setView({ screen: 'jobDetails', jobId })}
            onOpenDocument={openDocument}
            onDuplicateJob={(job) => { setJobToDuplicate(job); setShowDuplicateJobModal(true); }}
            onDeleteJob={(job) => setJobToDelete(job.id)}
            onUpgrade={() => openUpgrade()}
            onOpenClients={() => navigate('/clients')}
            onOpenInventory={() => navigate('/inventory')}
            onOpenCalendar={() => navigate('/calendar')}
        />
    );

    const renderJobDetails = () => {
        if (view.screen !== 'jobDetails') return null;
        const job = jobs.find(j => j.id === view.jobId);
        if (!job) return jobsLoaded ? renderNotFoundJob() : <PageSkeleton rows={3} />;
        const jobDocs = forms.filter(f => f.jobId === job.id);
        const pag = documentPagination[job.id];
        const client = (job.clientId ? clients.find(c => c.id === job.clientId) : undefined) || clients.find(c => c.name === job.clientName) || null;
        return (
            <JobDetailsScreen
                key={job.id}
                job={job}
                client={client}
                documents={jobDocs}
                loadingDocuments={!pag?.loaded}
                hasMoreDocuments={Boolean(pag?.hasMore && pag?.loaded)}
                loadingMoreDocuments={Boolean(pag?.loading && pag?.loaded)}
                docsThisMonth={docsUsedThisMonth(job.id)}
                docLimit={paid ? null : effectiveUsage.limits.docs}
                isOnline={isOnline}
                t={t}
                aiButton={renderJobAIButton(job)}
                aiModal={renderJobAIModal(job)}
                onBack={navigateToDashboard}
                onNewDocument={() => navigateToNewDoc(job.id)}
                onOpenDocument={(form) => openDocument(form, true)}
                onDuplicateDocument={handleDuplicateDoc}
                onDeleteDocument={(form) => setDocToDelete(form.id)}
                onStatusChange={(status) => handleUpdateJobStatus(job.id, status)}
                onLoadMore={() => loadDocumentsForJob(job.id)}
                onOpenFinancials={() => setShowJobFinancials(true)}
                onUpgrade={() => openUpgrade(`Free plan: ${effectiveUsage.limits.docs} documents per job each month.`)}
            />
        );
    };

    const renderForm = () => {
        if (view.screen !== 'form' || !profile) return null;
        const { formType, jobId, formId, prefillData } = view;
        // A client's "General" job that is created on the first save (handleNavigateToNewDoc).
        const isDraftJob = !jobs.some(j => j.id === jobId) && draftJob?.id === jobId;
        const job = jobs.find(j => j.id === jobId) || (isDraftJob ? draftJob : undefined);
        if (!job) return jobsLoaded ? renderNotFoundJob() : <PageSkeleton rows={2} />;
        const form = formId ? forms.find(f => f.id === formId) : undefined;
        if (formId && (!form || isLightweightDocument(form))) {
            const failed = formLoad?.id === formId && formLoad.error;
            if (failed) {
                return (
                    <div className="page">
                        <EmptyState
                            icon={isOnline ? AlertTriangleIcon : WifiOffIcon}
                            title="We couldn't open this document"
                            description={formLoad?.error}
                            action={
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button type="button" className="btn btn-primary" onClick={() => { setFormLoad(null); setFormReloadNonce(n => n + 1); }}>Try again</button>
                                    <button type="button" className="btn btn-outline" onClick={() => navigate(`/jobs/${jobId}`)}>Back to job</button>
                                </div>
                            }
                        />
                    </div>
                );
            }
            return <PageSkeleton rows={2} label="Loading document" />;
        }
        const handleCloseForm = () => {
            if ((location.state as any)?.fromJob && canGoBack()) navigate(-1);
            else if (isDraftJob) navigate('/clients', { replace: true }); // never saved: there is no job page yet
            else navigate(`/jobs/${jobId}`, { replace: true });
        };

        const componentKey = formId ? (formKeyAliasRef.current[formId] ?? formId) : newFormKey(formType, prefillData, location.key);
        const publicToken = form?.public_token ?? null;
        const pf = prefillData;
        const numberField = DOC_NUMBER_FIELD[formType];
        const existingNumbers = numberField
            ? forms.filter(f => f.type === formType && f.id !== formId).map(f => String((f.data as any)?.[numberField] || '')).filter(Boolean)
            : undefined;
        const common = {
            job,
            clients,
            onSave: handleSaveForm,
            onUploadImage: handleUploadDocumentImage,
            prefillData: pf,
            documentId: formId ?? undefined,
            existingNumbers,
        };

        switch (formType) {
            case FormType.Invoice: return <InvoiceForm key={componentKey} {...common} userProfile={profile} invoice={form?.data as InvoiceData | null} onClose={handleCloseForm} savedItems={savedItems} inventoryItems={inventory} publicToken={publicToken} />;
            case FormType.DailyJobReport: return <DailyJobReportForm key={componentKey} {...common} profile={profile} report={form?.data as DailyJobReportData | null} onBack={handleCloseForm} />;
            case FormType.Note: return <NoteForm key={componentKey} {...common} profile={profile} note={form?.data as NoteData | null} createdAt={form?.createdAt} onBack={handleCloseForm} />;
            case FormType.WorkOrder: return <WorkOrderForm key={componentKey} {...common} profile={profile} data={form?.data as WorkOrderData | null} onBack={handleCloseForm} />;
            case FormType.TimeSheet: return <TimeSheetForm key={componentKey} {...common} profile={profile} data={form?.data as TimeSheetData | null} onBack={handleCloseForm} />;
            case FormType.MaterialLog: return <MaterialLogForm key={componentKey} {...common} profile={profile} inventory={inventory} data={form?.data as MaterialLogData | null} onBack={handleCloseForm} />;
            case FormType.Estimate: return <EstimateForm key={componentKey} {...common} profile={profile} data={form?.data as EstimateData | null} onBack={handleCloseForm} savedItems={savedItems} inventoryItems={inventory} publicToken={publicToken} />;
            case FormType.ExpenseLog: return <ExpenseLogForm key={componentKey} {...common} profile={profile} data={form?.data as ExpenseLogData | null} onBack={handleCloseForm} />;
            case FormType.Warranty: return <WarrantyForm key={componentKey} {...common} profile={profile} data={form?.data as WarrantyData | null} onBack={handleCloseForm} />;
            case FormType.Receipt: return <ReceiptForm key={componentKey} {...common} profile={profile} data={form?.data as ReceiptData | null} onBack={handleCloseForm} publicToken={publicToken} />;
            case FormType.ChangeOrder: return <ChangeOrderForm key={componentKey} {...common} profile={profile} data={form?.data as ChangeOrderData | null} onBack={handleCloseForm} publicToken={publicToken} savedItems={savedItems} inventoryItems={inventory} />;
            case FormType.PurchaseOrder: return <PurchaseOrderForm key={componentKey} {...common} profile={profile} data={form?.data as PurchaseOrderData | null} onBack={handleCloseForm} savedItems={savedItems} inventoryItems={inventory} />;
            default: return renderNotFoundJob();
        }
    };

    const renderAuth = () => {
        if (view.screen !== 'auth') return null;
        switch (view.authScreen) {
            case 'signup':
                return <Signup onSignup={handleSignup} onLoginWithGoogle={handleLoginWithGoogle} onSwitchToLogin={() => navigate('/auth/login', { replace: true })} />;
            case 'checkEmail': {
                let email = '';
                try { email = sessionStorage.getItem('signup_email') || ''; } catch { /* ignore */ }
                return (
                    <AuthMessage
                        title="Check your email"
                        body={<>We sent a confirmation link to {email ? <strong className="text-foreground">{email}</strong> : 'your inbox'}. Open it to activate your account, then log in.</>}
                        actionLabel="Back to login"
                        onAction={() => navigate('/auth/login', { replace: true })}
                        secondary={email ? { label: 'Resend the email', onClick: handleResendConfirmation } : undefined}
                    />
                );
            }
            default:
                return <Login onLogin={handleLogin} onLoginWithGoogle={handleLoginWithGoogle} onSwitchToSignup={() => navigate('/auth/signup', { replace: true })} onResetPassword={handleResetPassword} />;
        }
    };

    const renderContent = () => {
        // 1. Public client links (no login).
        if (portalKey) return <PortalView supabase={supabase} portalKey={portalKey} />;
        if (approvalToken) return <DocumentApprovalView supabase={supabase} approvalToken={approvalToken} />;

        if (!authReady) return <AppSplash />;
        if (view.screen === 'qaAiDocuments' && import.meta.env.DEV && DocumentAIQAHarness) return <DocumentAIQAHarness />;

        if (!session) {
            if (view.screen === 'auth') return renderAuth();
            if (view.screen === 'updatePassword') {
                const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                const description = hash.get('error_description');
                return (
                    <AuthMessage
                        icon="warning"
                        title="This link has expired"
                        body={description ? `${description.replace(/\+/g, ' ')}. Request a new password reset link from the login page.` : 'Password reset links can only be used once and expire after a while. Request a new one from the login page.'}
                        actionLabel="Back to login"
                        onAction={() => navigate('/auth/login', { replace: true })}
                    />
                );
            }
            return <AppSplash />; // redirecting to /auth/login
        }

        if (view.screen === 'updatePassword') return <UpdatePassword onUpdatePassword={handleUpdatePassword} />;
        // The OAuth code is single-use: exchange it as soon as the session exists (no profile wait, no redirect).
        if (view.screen === 'gmailCallback') return <GmailCallback />;
        if (view.screen === 'auth' || view.screen === 'root' || view.screen === 'welcome' || view.screen === 'notFound') return <AppSplash />;

        if (profileStatus === 'error' || (profileStatus === 'ready' && !profile)) {
            return (
                <LoadErrorScreen
                    message={loadError || 'Please try again in a moment.'}
                    offline={!isOnline}
                    onRetry={() => session?.user && loadAccountData(session.user)}
                    onLogout={handleLogout}
                />
            );
        }
        if (profileStatus !== 'ready' || !profile) return <PageSkeleton />;

        switch (view.screen) {
            case 'dashboard': return renderDashboard();
            case 'jobDetails': return renderJobDetails();
            case 'createJob':
                return (
                    <JobForm
                        onSave={(values) => handleSaveJob(values)}
                        onCancel={() => {
                            if (view.returnTo === 'calendar') navigate('/calendar');
                            else if (canGoBack()) navigate(-1);
                            else navigateToDashboard();
                        }}
                        clients={clients}
                        jobCount={effectiveUsage.jobsThisMonth}
                        jobLimit={paid || !effectiveUsage.fromServer ? null : effectiveUsage.limits.jobs}
                        profile={profile}
                        onUpgradeClick={() => openUpgrade(`Free plan: ${effectiveUsage.limits.jobs} new jobs per month.`)}
                        prefillData={view.prefillData as Record<string, any> | undefined}
                    />
                );
            case 'selectDocType': {
                const activeJob = jobs.find(j => j.id === view.jobId);
                if (!activeJob) return jobsLoaded ? renderNotFoundJob() : <PageSkeleton rows={3} />;
                return (
                    <SelectDocType
                        jobName={activeJob.name}
                        profile={profile}
                        onSelect={(type) => navigate(`/jobs/${activeJob.id}/forms/${encodeURIComponent(type)}`, { replace: true, state: { fromJob: true } })}
                        onBack={() => navigate(`/jobs/${activeJob.id}`, { replace: true })}
                    />
                );
            }
            case 'form': return renderForm();
            case 'settings':
            case 'profile':
                return (
                    <Settings
                        mode={view.screen}
                        profile={profile}
                        onSave={handleSaveProfile}
                        onBack={() => (canGoBack() ? navigate(-1) : navigateToDashboard())}
                        theme={theme}
                        setTheme={handleThemeChange}
                        onLogout={handleLogout}
                        onUpgradeClick={() => openUpgrade()}
                        usage={effectiveUsage}
                        onManageBilling={handleManageBilling}
                        onSaveSignature={handleSaveSignature}
                        onDeleteAccount={handleDeleteAccount}
                        initialSection={location.hash === '#billing' ? 'billing' : undefined}
                    />
                );
            case 'billingSuccess':
                return (
                    <BillingSuccess
                        userId={session.user.id}
                        onActivated={() => { if (session?.user) loadAccountData(session.user, { silent: true }); }}
                        onGoToDashboard={() => navigate('/dashboard', { replace: true })}
                    />
                );
            case 'clients':
                return <ClientsView
                    onBack={navigateToDashboard}
                    supabase={supabase}
                    session={session}
                    clients={clients}
                    forms={forms}
                    jobs={jobs}
                    userProfile={profile}
                    openCreateModal={view.openCreateModal}
                    prefillData={view.prefillData}
                    onUpgradeClick={() => openUpgrade(`Free plan: ${effectiveUsage.limits.clients} new clients per month.`)}
                    freeLimit={effectiveUsage.limits.clients ?? undefined}
                    isOnline={isOnline}
                    onNavigateToNewDoc={handleNavigateToNewDoc}
                    onNavigateToJob={(jobId) => setView({ screen: 'jobDetails', jobId })}
                    onNavigateToDoc={(formId, jobId, formType) => setView({ screen: 'form', formId, jobId, formType })}
                    onClientsChanged={() => { const uid = sessionUserIdRef.current; if (uid) { loadClients(uid).catch(() => undefined); refreshUsage(); } }}
                    onDocumentsViewed={handleDocumentsViewed}
                />;
            case 'inventory':
                return <InventoryView
                    openAddModal={view.openAddModal}
                    prefillData={view.prefillData}
                    userProfile={profile}
                    onBack={navigateToDashboard}
                    inventory={inventory}
                    jobs={jobs}
                    clients={clients}
                    onAddJob={handleAddJobFromInventory}
                    onUpgrade={openUpgrade}
                    onClientsChanged={() => { const uid = sessionUserIdRef.current; if (uid) { loadClients(uid).catch(() => undefined); refreshUsage(); } }}
                    onDataChanged={() => { const uid = sessionUserIdRef.current; if (uid) loadInventory(uid).catch(() => undefined); }}
                />;
            case 'pricebook':
                return <PriceBookView
                    onBack={navigateToDashboard}
                    savedItems={savedItems}
                    isPremium={paid}
                    onDataChanged={() => { const uid = sessionUserIdRef.current; if (uid) loadSavedItems(uid).catch(() => undefined); }}
                    openAddModal={(view as any).openAddModal}
                    prefillData={(view as any).prefillData}
                />;
            case 'profitCalculator':
                return <ProfitCalculatorView onBack={navigateToDashboard} profile={profile} />;
            case 'analytics':
                return <AnalyticsView jobs={jobs} defaultLaborRate={profile?.defaultLaborRate} onBack={navigateToDashboard} />;
            case 'calendar':
                return <CalendarView
                    jobs={jobs}
                    onBack={navigateToDashboard}
                    onNavigateJob={(jobId) => setView({ screen: 'jobDetails', jobId })}
                    onNewJob={() => navigateToCreateJob('calendar')}
                    onNewJobOnDate={(ymd: string) => navigateToCreateJob('calendar', { startDate: ymd })}
                />;
            case 'communication':
                return <CommunicationView clients={clients} forms={forms} jobs={jobs} profile={profile} session={session} onBack={navigateToDashboard} onEmailSent={handleEmailSent} onUpgrade={() => openUpgrade(`Free plan: ${effectiveUsage.limits.emails} emails per month.`)} prefillData={view.prefillData} />;
            case 'forum':
                return (
                    <ForumView
                        onBack={navigateToDashboard}
                        session={session}
                        initialPostId={view.postId}
                        onNavigate={(postId) => setView({ screen: 'forum', postId: postId || undefined })}
                        onUnreadCountChange={setNotificationCount}
                    />
                );
            default:
                return renderDashboard();
        }
    };

    const showNav = Boolean(session && profile && profileStatus === 'ready' && !portalKey && !approvalToken && !PUBLIC_SCREENS.includes(view.screen) && !NO_NAV_SCREENS.includes(view.screen));
    const showTabBar = showNav && TAB_BAR_SCREENS.includes(view.screen);
    const viewJob = viewJobId ? jobs.find(j => j.id === viewJobId) : undefined;
    const tabPrimary = view.screen === 'dashboard'
        ? { label: 'New job', onClick: () => navigateToCreateJob('dashboard') }
        : view.screen === 'jobDetails' && viewJob
            ? { label: 'New doc', onClick: () => navigateToNewDoc(viewJob.id) }
            : undefined;

    return (
        <div className="min-h-screen bg-background text-foreground">
            {showNav && profile && (
                <AppNav
                    active={navSectionFor(view.screen)}
                    userName={profile.name || profile.companyName || ''}
                    userEmail={session?.user?.email || profile.email}
                    avatarUrl={profile.profilePictureUrl}
                    plan={plan}
                    onNavigate={handleNavDestination}
                    onUpgrade={() => openUpgrade()}
                    onLogout={handleLogout}
                    primaryAction={tabPrimary}
                    clientBadge={clientNotificationCount}
                    forumBadge={notificationCount}
                    lowStockCount={lowStockCount}
                    isOnline={isOnline}
                    showTabBar={showTabBar}
                />
            )}
            {showNav && (!isOnline || usingCachedData) && (
                <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-foreground" role="status">
                    <WifiOffIcon className="mr-1.5 inline h-4 w-4 align-[-3px] text-warning" />
                    {!isOnline
                        ? "You're offline. Showing data saved on this device; changes can't be saved until you reconnect."
                        : 'Showing data saved on this device. Some information may be out of date.'}
                </div>
            )}

            <main className={`overflow-x-clip ${showTabBar ? 'pb-24 md:pb-0' : ''}`}>
                <ErrorBoundary resetKey={location.pathname} onHome={() => navigate('/dashboard')}>
                    <Suspense fallback={view.screen === 'auth' || !session ? <AppSplash /> : <PageSkeleton />}>
                        {renderContent()}
                    </Suspense>
                </ErrorBoundary>
            </main>

            {/* AI-OWNED: the assistant panel (dashboard + job mode), lazy-loaded on first open. */}
            {session && ai.isOpen && (
                <ErrorBoundary resetKey="ai-assistant" onHome={ai.close}>
                    <Suspense fallback={null}>
                        <AIAssistantPanel assistant={ai} />
                    </Suspense>
                </ErrorBoundary>
            )}

            {showGlobalUpgrade && (
                <Suspense fallback={null}>
                    <UpgradeModal
                        isOpen={showGlobalUpgrade}
                        onClose={() => setShowGlobalUpgrade(false)}
                        featureName={upgradeFeature}
                        userId={session?.user?.id}
                        currentTier={plan}
                    />
                </Suspense>
            )}

            <ConfirmationModal
                isOpen={showDeleteJobModal}
                onClose={() => setJobToDelete(null)}
                onConfirm={handleDeleteJob}
                title="Delete job?"
                message={<>This permanently deletes <strong className="text-foreground">{jobs.find(j => j.id === jobToDelete)?.name || 'this job'}</strong> and all of its documents (invoices, estimates, reports). This can't be undone.</>}
                confirmLabel="Delete job"
                isDestructive={true}
            />

            <ConfirmationModal
                isOpen={showDeleteDocModal}
                onClose={() => setDocToDelete(null)}
                onConfirm={handleDeleteDoc}
                title="Delete document?"
                message="This permanently deletes the document. This can't be undone."
                confirmLabel="Delete"
                isDestructive={true}
            />

            <DuplicateJobModal
                isOpen={showDuplicateJobModal}
                onClose={() => { setShowDuplicateJobModal(false); setJobToDuplicate(null); }}
                onDuplicate={handleDuplicateJob}
                job={jobToDuplicate}
                forms={duplicateCandidateForms}
                clients={clients}
                loadingDocuments={Boolean(jobToDuplicate && !documentPagination[jobToDuplicate.id]?.loaded)}
            />

            {showJobFinancials && viewJob && (
                <Suspense fallback={null}>
                    <JobFinancialsModal job={viewJob} defaultLaborRate={profile?.defaultLaborRate} onClose={() => setShowJobFinancials(false)} />
                </Suspense>
            )}

            <Toaster />
        </div>
    );
};

export default App;
