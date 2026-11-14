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
import { CopyToJobModal } from './components/CopyToJobModal.tsx';
import { buildCopyToJobData, copyDoneMessage } from './lib/copyToJob.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Toaster, toast } from './components/Toast.tsx';
import { AuthMessage, AppSplash, LoadErrorScreen } from './components/AppStates.tsx';
import { PageSkeleton } from './components/ui/Skeleton.tsx';
import { EmptyState } from './components/ui/EmptyState.tsx';
import { WifiOffIcon, AlertTriangleIcon, BriefcaseIcon, SparklesIcon, FileTextIcon } from './components/Icons.tsx';

// ── AI (owned by the AI engineer) ────────────────────────────────────────────
import { DashboardMasterAIButton, InlineAIButton } from './components/DashboardMasterAIButton.tsx';
import { useAIAssistant } from './src/hooks/useAIAssistant.ts';
const AIAssistantPanel = lazy(() => import('./src/ai/components/AssistantPanel.tsx'));

// ── Data & helpers ───────────────────────────────────────────────────────────
import { supabase, invokeFunction } from './lib/supabase.ts';
import {
    DOCUMENT_METADATA_COLUMNS, DOCUMENT_PAGE_SIZE, RECENT_DOCUMENTS_LIMIT, mapDocumentRow, isLightweightDocument,
    mergeDocuments, fetchFullDocument, fetchFullDocuments, primeDocumentCache, invalidateDocument, clearDocumentCache,
    isUnseenClientDecision, buildDuplicateDocumentData, assertFullDocument, stripLightweightFlag,
    fetchUnseenClientDecisions, fetchAllJobDocumentSummaries, planDuplicateCopies, chunk, ID_CHUNK,
} from './lib/documents.ts';
import { fetchAllRows } from './lib/listLoading.ts';
import {
    type AppProfile, type UsageSnapshot, type ThemeName, THEME_STORAGE_KEY, loadProfileRow, mapProfileRow, fetchUsage,
    limitsForTier, isPlanLimitError, planLimitMessage, describeError, clearUserBrowserStorage, rememberPostLoginRedirect,
    consumePostLoginRedirect, normalizeTheme, isMissingColumnError, usageMonthStart, fetchJobDocumentCount, fetchDocumentUsageByJob,
} from './lib/account.ts';
import { PLANS, isPaidTier, normalizeTier } from './lib/plans.ts';
import { captureIntentFromSearch, clearIntent, decideIntentAction, intentLabel, intentSearch, readIntent, setLoginPrefill, signupOutcome, toBillingPeriod, updateIntent, type PlanIntent } from './lib/pendingPlan.ts';
import FinishUpgradeBanner from './components/FinishUpgradeBanner.tsx';
import { setDesignPlan } from './lib/designPlan.ts';
import { getBillingPortalUrl, startCheckout } from './lib/billing.ts';
import { getTranslations } from './utils/translations.ts';
import { parseView, type AppView } from './lib/routes.ts';
import { dbApi } from './utils/db.ts';
import { saveDefaultSignatureToAccount, saveUiPreferencesToAccount, syncUiPreferencesAfterLogin, syncUserDataAfterLogin } from './lib/userData.ts';
import { compressImage } from './utils/imageCompression.ts';
import { DOC_NUMBER_CONFIG, nextDocumentNumber } from './components/forms/formUtils.ts';
// Offline create / edit (competitor gap #14): outbox on this device, synced through the same document save
import { upsertDocumentRecord, fetchDocumentForSync, fetchDocumentNumbers } from './lib/documentSave.ts';
import { useOutbox, type OutboxDeps } from './lib/offline/useOutbox.ts';
import type { SyncReport } from './lib/offline/syncEngine.ts';
import { OFFLINE_CREATE_TYPES, ENTITY_TYPE, applyEntityOverlay, applyOutboxOverlay, canCreateOffline, contentHash, entityOf, numberRuleFor, offlineSavePolicy, pendingCreatesByJob, pendingEntityCreates, type OutboxItem, type OutboxKind } from './lib/offline/outboxModel.ts';
import { setOfflineEntityQueue } from './lib/offline/offlineEntities.ts';
import { setDeviceCacheUser } from './lib/offline/deviceCache.ts';
import { NEEDS_CONNECTION } from './lib/offline/connection.ts';
import { DocSlotContext } from './components/forms/DocSlotContext.ts';
import type { PaymentSettings } from './lib/payments.ts';
import { applyProfileOverlay, offlineProfilePatch, pendingProfileItem, profileBaseFor, profileFieldsFromRow, comparableProfileRow, withoutPaymentColumns } from './lib/offline/offlineProfile.ts';
import { offlinePhotoRow, photoEditPatch, photoItems, uploadQueuedPhoto, PHOTO_FILE_MAIN, PHOTO_FILE_THUMB, type OfflinePhotoInput } from './lib/offline/offlineJobPhotos.ts';
import { PUNCH_SYNCED_EVENT, type PunchProgress } from './lib/punchList.ts';
import { todayYMD } from './utils/localDates.ts';
import { TEMP_TAG } from './utils/clientPortalRules.ts';
import { dataUrlToBlob, extensionForType, rememberOfflinePhoto } from './lib/offline/offlinePhotos.ts';
import { registerOfflineShell, warmOfflineShell } from './lib/offline/offlineShell.ts';
import { useCrewFeature } from './lib/crew/crewFeature.ts';
import { OfflineDocContext, OutboxStatusContext, sendBlockedReasonFor } from './components/offline/OfflineContext.tsx';
import SyncStatusBar from './components/offline/SyncStatusBar.tsx';
import InstallAppBanner, { DOCUMENT_SAVED_EVENT } from './components/InstallAppBanner.tsx';
import OutboxPanel from './components/offline/OutboxPanel.tsx';
import LogoutGuardDialog from './components/offline/LogoutGuardDialog.tsx';
import type { EstimateHandoff } from './components/requests/RequestDetailModal.tsx';
import type { ConvertResult } from './components/requests/requestsApi.ts';

// ── Lazy screens (INFRA-005: keep the first load small) ──────────────────────
const Login = lazy(() => import('./components/Login.tsx'));
const Signup = lazy(() => import('./components/Signup.tsx'));
const UpdatePassword = lazy(() => import('./components/UpdatePassword.tsx'));
const JobForm = lazy(() => import('./components/JobForm.tsx'));
const Settings = lazy(() => import('./components/Settings.tsx'));
const BillingSuccess = lazy(() => import('./components/BillingSuccess.tsx'));
const UpgradeModal = lazy(() => import('./components/UpgradeModal.tsx'));
const JobFinancialsModal = lazy(() => import('./components/JobFinancialsModal.tsx'));
// "Bill time & materials" (job page / Job financials): NEXT_STEPS 0c #12
const BillTimeMaterialsModal = lazy(() => import('./components/costing/BillTimeMaterialsModal.tsx'));
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
const HelpCenter = lazy(() => import('./components/help/HelpCenter.tsx'));
const TourHost = lazy(() => import('./components/help/TourHost.tsx'));
const PortalView = lazy(() => import('./components/PortalView.tsx'));
const DocumentApprovalView = lazy(() => import('./components/DocumentApprovalView.tsx'));
// "get paid" (NEXT_STEPS 0c): Mark as paid dialog + "payments reported by clients" dashboard card
const MarkPaidDialog = lazy(() => import('./components/payments/MarkPaidDialog.tsx'));
const PaymentReportsCard = lazy(() => import('./components/payments/PaymentReportsCard.tsx'));
// Request-a-quote inbox (dashboard) and job photo timeline (job page): NEXT_STEPS 0c #5 / #11
const RequestsInbox = lazy(() => import('./components/requests/RequestsInbox.tsx'));
const JobPhotos = lazy(() => import('./components/photos/JobPhotos.tsx'));
// Punch lists (#18): job page tab; hidden until migration 20261115000200 is applied
const PunchList = lazy(() => import('./components/punch/PunchList.tsx'));
// Papers vault + lien waivers (#17): /papers, the job page's permits line and its Lien waiver button
const PapersView = lazy(() => import('./components/papers/PapersView.tsx'));
const JobPapersStrip = lazy(() => import('./components/papers/JobPapersStrip.tsx'));
const LienWaiverModal = lazy(() => import('./components/papers/LienWaiverModal.tsx'));
// Recurring service plans (#15): /service-plans
const ServicePlansView = lazy(() => import('./components/service/ServicePlansView.tsx'));
// Pipeline board (/pipeline) and its dashboard strip: NEXT_STEPS 0c #8
const PipelineView = lazy(() => import('./components/pipeline/PipelineView.tsx'));
const PipelineStrip = lazy(() => import('./components/pipeline/PipelineStrip.tsx'));
// Crew clock-in links (/crew + the job page's Crew tab): NEXT_STEPS 0c #13. Hidden until the database has it.
const CrewView = lazy(() => import('./components/crew/CrewView.tsx'));
const JobCrewPanel = lazy(() => import('./components/crew/JobCrewPanel.tsx'));
// AI mock test page (/qa-ai-documents): development builds only. In production `import.meta.env.DEV` is false, so the
// route resolves to notFound (lib/routes.ts) and this import is dropped from the bundle entirely.
const DocumentAIQAHarness = import.meta.env.DEV ? lazy(() => import('./components/DocumentAIQAHarness.tsx')) : null;
// "Export everything" progress on screens other than Settings (lib/export/exportStore.ts)
const ExportProgressDock = lazy(() => import('./components/export/ExportProgressDock.tsx'));
// Notification bell engine (renders nothing; the bell itself is in AppNav): components/notifications
const NotificationCenter = lazy(() => import('./components/notifications/NotificationCenter.tsx'));

// ── Constants ────────────────────────────────────────────────────────────────
const JOB_COLUMN_SETS = [
    'id, user_id, name, client_name, client_address, start_date, end_date, status, worker_name, client_id, created_at',
    'id, user_id, name, client_name, client_address, start_date, end_date, status, worker_name, created_at',
    'id, user_id, name, client_name, client_address, start_date, end_date, status, created_at',
];
const CLIENT_COLUMNS = 'id, user_id, name, email, phone, address, notes, portal_key, created_at';
const INVENTORY_COLUMN_SETS = [
    'id, user_id, name, quantity, category, unit, cost_price, supplier, location, low_stock_threshold, created_at, is_assembly, assembly_items',
    'id, user_id, name, quantity, category, unit, cost_price, supplier, location, low_stock_threshold, created_at',
];
// The first set adds `unit` (price book unit, also sent to the AI assistant with its drafting requests); the next ones are
// the fallbacks for databases without optional columns.
const SAVED_ITEM_COLUMN_SETS = [
    'id, user_id, name, description, rate, unit_cost, unit, category, category_id, type, images, taxable, sku, markup, is_assembly, assembly_items, is_favorite, last_used_at, use_count, created_at',
    'id, user_id, name, description, rate, unit_cost, category, category_id, type, images, taxable, sku, markup, is_assembly, assembly_items, is_favorite, last_used_at, use_count, created_at',
    'id, user_id, name, description, rate, unit_cost, category, created_at',
];
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

/**
 * Runs a select, retrying with fewer columns while the database is missing optional ones, and loads EVERY row page by
 * page (PARITY_V2 C2: the old 300/500/1000 caps hid saved items from the pickers). `build` adds filters and a stable
 * order; the paging range is added here.
 */
async function selectAllWithFallback<T = any>(table: string, columnSets: string[], build: (query: any) => any): Promise<{ data: T[] | null; error: any }> {
    let lastError: any = null;
    for (const columns of columnSets) {
        const res = await fetchAllRows<T>((from, to) => build(supabase.from(table).select(columns)).range(from, to));
        if (!res.error) return { data: res.rows, error: null };
        lastError = res.error;
        if (res.rows.length) return { data: res.rows, error: null }; // a later page failed: keep what loaded
        if (!isMissingColumnError(res.error as any)) break;
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

/** File → data URL (a photo picked offline is kept inside the document until it syncs). */
const fileToDataUrl = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the image.'));
    reader.readAsDataURL(file);
});

/**
 * Field-document forms, loaded ahead of time on a job page while online, so "New document" still opens them after
 * the connection drops (lazy chunks can't be fetched offline). Same modules as the lazy() imports above.
 */
const prefetchOfflineForms = () => Promise.allSettled([
    import('./components/DailyJobReportForm.tsx'), import('./components/TimeSheetForm.tsx'), import('./components/MaterialLogForm.tsx'),
    import('./components/ExpenseLogForm.tsx'), import('./components/NoteForm.tsx'), import('./components/ReceiptForm.tsx'),
    import('./components/EstimateForm.tsx'), import('./components/InvoiceForm.tsx'),
]);

/**
 * The main screens, loaded in the background once per session after sign-in (online, not in data-saver mode), so the
 * installed app opens them offline after one online visit (public/sw.js keeps the files). Same modules as the lazy()
 * imports above; screens that only work online (AI, Gmail, community, billing) are left out.
 */
const prefetchOfflineScreens = () => Promise.allSettled([
    import('./components/InventoryView.tsx'), import('./components/PriceBookView.tsx'), import('./components/CalendarView.tsx'),
    import('./components/ClientsView.tsx'), import('./components/Settings.tsx'), import('./components/JobForm.tsx'),
    import('./components/photos/JobPhotos.tsx'), import('./components/photos/PhotoMarkupEditor.tsx'),
    import('./components/pipeline/PipelineView.tsx'), import('./components/AnalyticsView.tsx'), import('./components/ProfitCalculatorView.tsx'),
    import('./components/JobFinancialsModal.tsx'), import('./components/help/HelpCenter.tsx'),
    import('./components/WorkOrderForm.tsx'), import('./components/WarrantyForm.tsx'), import('./components/ChangeOrderForm.tsx'),
    import('./components/PurchaseOrderForm.tsx'),
]);

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
const TAB_BAR_SCREENS: AppView['screen'][] = ['dashboard', 'jobDetails', 'clients', 'communication', 'inventory', 'pricebook', 'calendar', 'analytics', 'profitCalculator', 'forum', 'settings', 'profile', 'selectDocType', 'help', 'pipeline', 'crew', 'papers', 'servicePlans'];

const navSectionFor = (screen: AppView['screen']): NavSection => {
    switch (screen) {
        case 'dashboard': case 'jobDetails': case 'createJob': case 'selectDocType': return 'dashboard';
        case 'clients': return 'clients';
        case 'communication': return 'communication';
        case 'inventory': case 'pricebook': case 'calendar': case 'analytics': case 'profitCalculator': case 'pipeline': case 'crew': case 'papers': case 'servicePlans': return 'tools';
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
            case 'pipeline': navigate('/pipeline'); break;
            case 'crew': navigate('/crew'); break;
            case 'papers': navigate('/papers'); break;
            case 'servicePlans': navigate('/service-plans'); break;
            case 'help': navigate('/tutorials'); break;
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
    /** The account's profile (or the device copy); `profile` below adds settings saved offline (outbox) on top. */
    const [accountProfile, setProfile] = useState<AppProfile | null>(null);
    const [profileStatus, setProfileStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    /** Plan picked on the website whose checkout wasn't completed (lib/pendingPlan.ts): small dismissible banner. */
    const [upgradeBanner, setUpgradeBanner] = useState<PlanIntent | null>(null);
    const [intentCheckoutBusy, setIntentCheckoutBusy] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [usage, setUsage] = useState<UsageSnapshot | null>(null);
    /** Free plan: documents CREATED this month per job, read from the server's usage_events (null = unknown). */
    const [docUsage, setDocUsage] = useState<Record<string, number> | null>(null);
    /**
     * "New invoice/estimate" from a client with no job yet: the "<Client> - General" job exists only in memory until
     * the document is saved (0b.15), so a discarded document doesn't use one of the Free plan's jobs.
     */
    const [draftJob, setDraftJob] = useState<AppJob | null>(null);
    /** Jobs loaded from the account; `jobs` below adds the ones created / changed offline (outbox). */
    const [serverJobs, setJobs] = useState<AppJob[]>([]);
    const [jobsLoaded, setJobsLoaded] = useState(false);
    /** Documents loaded from the account (or the read cache). `forms` below adds the offline outbox on top. */
    const [serverForms, setForms] = useState<FormDataType[]>([]);
    const serverFormsRef = useRef(serverForms);
    serverFormsRef.current = serverForms;
    /** Clients loaded from the account; `clients` below adds the ones created / edited offline (outbox). */
    const [serverClients, setClients] = useState<Client[]>([]);

    // ── Offline outbox (lib/offline): documents saved without a connection, per user, synced in order ─────────
    const outboxDepsRef = useRef<() => OutboxDeps | null>(() => null);
    const outboxReportRef = useRef<(report: SyncReport, trigger: string) => void>(() => undefined);
    // screens read / keep their last list copy for this user (lib/offline/deviceCache.ts)
    setDeviceCacheUser(session?.user?.id ?? null);
    const outbox = useOutbox(session?.user?.id ?? null, {
        buildDeps: () => outboxDepsRef.current(),
        onReport: (report, opts) => outboxReportRef.current(report, opts.trigger),
        autoSync: profileStatus === 'ready',
    });
    /** The profile every screen shows: the account's, with settings saved offline (waiting to sync) on top. */
    const profile = useMemo(
        () => applyProfileOverlay(accountProfile, outbox.items, session?.user?.id),
        [accountProfile, outbox.items, session?.user?.id],
    );
    /** Every document the screens show: the account's, with the versions waiting in the outbox on top. */
    const forms = useMemo(
        () => applyOutboxOverlay(serverForms, outbox.items, session?.user?.id),
        [serverForms, outbox.items, session?.user?.id],
    );
    const pendingCreates = useMemo(() => pendingCreatesByJob(outbox.items, session?.user?.id), [outbox.items, session?.user?.id]);
    /** Jobs and clients the screens show: the account's, with the ones created / changed offline on top. */
    const jobs = useMemo(() => applyEntityOverlay(serverJobs, outbox.items, session?.user?.id, 'job', (row, prev) => (prev
        ? { ...prev, ...(row.status ? { status: normalizeJobStatus(row.status as string) } : {}), ...('client_id' in row ? { clientId: (row.client_id as string | null) ?? null } : {}) }
        : mapJobRow({ created_at: new Date().toISOString(), ...row }))), [serverJobs, outbox.items, session?.user?.id]);
    const clients = useMemo(() => applyEntityOverlay(serverClients, outbox.items, session?.user?.id, 'client', (row, prev) => (
        { ...(prev || { created_at: new Date().toISOString() }), ...row } as Client)), [serverClients, outbox.items, session?.user?.id]);
    const outboxRef = useRef(outbox);
    outboxRef.current = outbox;
    // insertClient / updateClient (Clients screen, inventory...) keep offline saves in this outbox (lib/offline/offlineEntities)
    useEffect(() => {
        const uid = session?.user?.id;
        if (!uid) { setOfflineEntityQueue(null); return; }
        setOfflineEntityQueue({
            queue: async (entity, kind, id, row) => {
                // a punch item keeps its job (outbox panel, and its job id is remapped if the job was created offline)
                const jobId = entity === 'job' ? id : entity === 'punch_item' ? String(row.job_id || '') : '';
                await outboxRef.current.queue({ entity, userId: uid, docId: id, jobId, type: ENTITY_TYPE[entity], kind, data: row });
            },
            isWaiting: id => outboxRef.current.items.some(i => i.docId === id && entityOf(i) !== 'document'),
            items: () => outboxRef.current.items,
            discard: id => outboxRef.current.discard(id),
        });
        return () => setOfflineEntityQueue(null);
    }, [session?.user?.id]);
    /** Job photos taken / changed offline (Photos tab): files + row wait on this device (lib/offline/offlineJobPhotos.ts). */
    const outboxPhotoItems = useMemo(() => photoItems(outbox.items, session?.user?.id), [outbox.items, session?.user?.id]);
    const jobPhotoOffline = useMemo(() => {
        const uid = session?.user?.id;
        if (!uid) return null;
        const syncSoon = (id: string) => { if (navigator.onLine) void outboxRef.current.sync({ trigger: 'save', onlyDocIds: [id] }); };
        return {
            userId: uid,
            items: outboxPhotoItems,
            stateOf: (id: string) => outboxRef.current.stateOf(id),
            add: async (input: OfflinePhotoInput, files: { main: Blob; thumb: Blob }) => {
                await outboxRef.current.queue(
                    { entity: 'job_photo', userId: uid, docId: input.id, jobId: input.jobId, type: ENTITY_TYPE.job_photo, kind: 'create', data: offlinePhotoRow({ ...input, userId: uid }) },
                    { [PHOTO_FILE_MAIN]: files.main, [PHOTO_FILE_THUMB]: files.thumb },
                );
                syncSoon(input.id);
            },
            edit: async (photoId: string, jobId: string, patch: Parameters<typeof photoEditPatch>[0]) => {
                await outboxRef.current.queue({ entity: 'job_photo', userId: uid, docId: photoId, jobId, type: ENTITY_TYPE.job_photo, kind: 'edit', data: photoEditPatch(patch) });
                syncSoon(photoId);
            },
            discard: (photoId: string) => outboxRef.current.discard(photoId),
            filesOf: (photoId: string) => outboxRef.current.filesOf(photoId),
            fileUsage: () => outboxRef.current.fileUsage(),
        };
        // stateOf reads the current outbox; re-created when the photo items change
    }, [session?.user?.id, outboxPhotoItems, outbox.syncingDocId]);
    const [outboxOpen, setOutboxOpen] = useState(false);
    const [logoutGuard, setLogoutGuard] = useState<{ count: number; problem: string | null } | null>(null);

    // AI assistant state lives in useAIAssistant (called with the AI-owned render helpers below).

    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
    const [documentPagination, setDocumentPagination] = useState<Record<string, { offset: number; hasMore: boolean; loading: boolean; loaded: boolean }>>({});
    const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    // crew clock-in tables in the database? (the Crew menu item, job tab and page stay hidden until they are)
    const crewFeature = useCrewFeature(session?.user?.id ?? null, isOnline);
    const [usingCachedData, setUsingCachedData] = useState(false);
    const [notificationCount, setNotificationCount] = useState(0);
    // Punch lists: which jobs have items and how far they are (job page tab, pipeline cards); hidden until the database has them
    const [punchState, setPunchState] = useState<{ available: boolean; map: Map<string, PunchProgress> }>(() => {
        let available = false;
        try { available = window.localStorage.getItem('cd.punch.available') === '1'; } catch { /* storage blocked */ }
        return { available, map: new Map() };
    });
    const [formLoad, setFormLoad] = useState<{ id: string; error: string | null } | null>(null);
    const [formReloadNonce, setFormReloadNonce] = useState(0);

    // The device copy of jobs / clients / stock / price book follows the account during the session (not only at login),
    // so the app opens offline with what was last seen (jobs added online later included). Not while showing that copy.
    useEffect(() => {
        const uid = session?.user?.id;
        if (!uid || profileStatus !== 'ready' || usingCachedData || !jobsLoaded) return;
        const t = window.setTimeout(() => {
            if (sessionUserIdRef.current !== uid) return;
            dbApi.replaceAll('jobs', serverJobs.filter(j => j && j.id)).catch(() => undefined);
            dbApi.replaceAll('clients', serverClients.filter(c => c && c.id)).catch(() => undefined);
            if (inventory.length) dbApi.replaceAll('inventory', inventory.filter(i => i && (i as any).id)).catch(() => undefined);
            if (savedItems.length) dbApi.replaceAll('saved_items', savedItems.filter(i => i && (i as any).id)).catch(() => undefined);
        }, 1500);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverJobs, serverClients, inventory, savedItems, profileStatus, usingCachedData, jobsLoaded]);

    const [theme, setThemeState] = useState<ThemeName>(() => {
        try { return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)) || 'light'; } catch { return 'light'; }
    });
    // The device copy only paints the first screen: the account's theme is applied at every login, unless the user picks
    // one in this session (PARITY_V2 C1, like the original app).
    const deviceThemeChosenRef = useRef<boolean>(false);

    // Upgrade / subscription
    const [showGlobalUpgrade, setShowGlobalUpgrade] = useState(false);
    const [upgradeFeature, setUpgradeFeature] = useState('');

    // Delete confirmations
    const [jobToDelete, setJobToDelete] = useState<string | null>(null);
    const [docToDelete, setDocToDelete] = useState<string | null>(null);
    const showDeleteJobModal = jobToDelete !== null;
    const showDeleteDocModal = docToDelete !== null;
    const [showJobFinancials, setShowJobFinancials] = useState(false);
    const [showBillTimeMaterials, setShowBillTimeMaterials] = useState(false);
    /** job id of an open Lien waiver window (job page) */
    const [lienWaiverJobId, setLienWaiverJobId] = useState<string | null>(null);
    const [markPaidDoc, setMarkPaidDoc] = useState<FormDataType | null>(null);

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
    // forms read the plan when they open/save a design (lib/designAccess.ts); set during render, before any form mounts
    setDesignPlan(profile ? plan : null);

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

    // signed AND declined documents the contractor hasn't seen (PARITY_V2 A6)
    const clientNotificationCount = useMemo(() => forms.filter(isUnseenClientDecision).length, [forms]);
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
        // new documents waiting in the offline outbox take their slot when they sync
        if (docUsage) return (docUsage[jobId] ?? 0) + (pendingCreates.get(jobId) ?? 0);
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
            // jobs / clients created offline take their slot when they sync
            count = effectiveUsage.jobsThisMonth + pendingEntityCreates(outbox.items, session?.user?.id, 'job');
            limit = limits.jobs;
            message = `You've created ${count} of ${limit} jobs this month on the Free plan.`;
        } else if (type === 'clients') {
            count = effectiveUsage.clientsThisMonth + pendingEntityCreates(outbox.items, session?.user?.id, 'client');
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
        const used = fresh + (pendingCreates.get(jobId) ?? 0);
        if (used >= limit) {
            openUpgrade(docLimitMessage(used, limit));
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
    // "Copy to another job": the document being copied (the job picker is open while set)
    const [docToCopy, setDocToCopy] = useState<FormDataType | null>(null);
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
        // account (user_settings + profiles.theme); offline it is queued and uploaded at the next login
        if (sessionUserIdRef.current) void saveUiPreferencesToAccount({ theme: next, language: profile?.language });
    };

    // ── Online / offline (read cache + the offline outbox, which syncs by itself on `online`: lib/offline) ───
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
        deviceThemeChosenRef.current = false; // the next account's own theme applies
        setProfile(null);
        setUpgradeBanner(null);
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
                // ?plan=&period= (plan clicked on the website while signed in, or back from email confirmation / Google)
                if (view.screen === 'auth') captureIntentFromSearch(location.search);
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
        const { data, error } = await selectAllWithFallback('jobs', JOB_COLUMN_SETS, q => q.eq('user_id', userId).order('created_at', { ascending: false }).order('id'));
        if (error) throw error;
        return (data || []).map(mapJobRow);
    };

    const loadClients = useCallback(async (userId: string) => {
        const { data, error } = await selectAllWithFallback<Client>('clients', [CLIENT_COLUMNS], q => q.eq('user_id', userId).order('name').order('id'));
        if (error) throw error;
        if (sessionUserIdRef.current === userId) setClients((data || []) as Client[]);
        return (data || []) as Client[];
    }, []);

    const loadInventory = useCallback(async (userId: string) => {
        const { data, error } = await selectAllWithFallback<InventoryItem>('inventory', INVENTORY_COLUMN_SETS, q => q.eq('user_id', userId).order('name').order('id'));
        if (!error && data && sessionUserIdRef.current === userId) setInventory(data);
        return data || [];
    }, []);

    const loadSavedItems = useCallback(async (userId: string) => {
        const { data, error } = await selectAllWithFallback<SavedItem>('saved_items', SAVED_ITEM_COLUMN_SETS, q => q.eq('user_id', userId).order('name').order('id'));
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

    /** Unseen signed/declined documents of ANY age (the list above only has the 50 newest): Clients badge (PARITY_V2 A6). */
    const decisionsCheckedAtRef = useRef(0);
    const loadUnseenDecisions = useCallback(async (userId: string) => {
        decisionsCheckedAtRef.current = Date.now();
        const docs = await fetchUnseenClientDecisions(userId);
        if (sessionUserIdRef.current === userId && docs.length) setForms(prev => mergeDocuments(prev, docs));
        return docs;
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

    const writeCache = (userId: string, payload: { profile?: AppProfile; jobs?: AppJob[]; clients?: Client[]; documents?: FormDataType[]; inventory?: InventoryItem[]; savedItems?: SavedItem[] }) => {
        // Best effort, never blocks the UI. Read-only offline cache (no secrets are stored).
        (async () => {
            try {
                if (payload.profile) await dbApi.replaceAll('profile', [{ ...payload.profile, id: userId }]);
                if (payload.jobs) await dbApi.replaceAll('jobs', payload.jobs);
                if (payload.clients) await dbApi.replaceAll('clients', payload.clients);
                if (payload.documents) await dbApi.putMany('documents', payload.documents.filter(d => isLightweightDocument(d)));
                // price book + stock for documents drafted offline (line-item pickers)
                if (payload.inventory) await dbApi.replaceAll('inventory', payload.inventory.filter(i => i && (i as any).id));
                if (payload.savedItems) await dbApi.replaceAll('saved_items', payload.savedItems.filter(i => i && (i as any).id));
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
            // price book + stock (optional: older caches don't have them)
            void Promise.all([dbApi.getAll('inventory'), dbApi.getAll('saved_items')]).then(([inv, saved]) => {
                if (sessionUserIdRef.current !== userId) return;
                const mineInv = inv.filter(i => i?.user_id === userId);
                const mineSaved = saved.filter(i => i?.user_id === userId);
                if (mineInv.length) setInventory(prev => (prev.length ? prev : mineInv));
                if (mineSaved.length) setSavedItems(prev => (prev.length ? prev : mineSaved));
            }).catch(() => undefined);
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
        // theme + language from the account (user_settings, else the profile columns; a change made offline wins)
        void syncUiPreferencesAfterLogin(user.id, { theme: loadedProfile.theme, language: loadedProfile.language }).then(prefs => {
            if (!isCurrent()) return;
            const accountTheme = normalizeTheme(prefs.theme) || loadedProfile.theme;
            if (!deviceThemeChosenRef.current && accountTheme) setThemeState(accountTheme);
            if (prefs.language && prefs.language !== loadedProfile.language) {
                setProfile(prev => (prev ? { ...prev, language: prefs.language } : prev));
            }
        });

        const [jobsRes, docsRes, clientsRes, inventoryRes, savedItemsRes] = await Promise.allSettled([
            loadJobs(user.id),
            loadRecentDocuments(user.id),
            loadClients(user.id),
            loadInventory(user.id),
            loadSavedItems(user.id),
            refreshUsage(),
            loadUnseenDecisions(user.id),
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
            inventory: inventoryRes.status === 'fulfilled' && Array.isArray(inventoryRes.value) && inventoryRes.value.length ? inventoryRes.value as InventoryItem[] : undefined,
            savedItems: savedItemsRes.status === 'fulfilled' && Array.isArray(savedItemsRes.value) && savedItemsRes.value.length ? savedItemsRes.value as SavedItem[] : undefined,
        });
    };

    useEffect(() => {
        const user = session?.user;
        if (!user) return;
        if (loadedUserIdRef.current === user.id) return;
        if (loadedUserIdRef.current) resetUserState(); // a different account signed in: drop the previous user's data
        loadedUserIdRef.current = user.id;
        loadAccountData(user);
        void syncUserDataAfterLogin(user.id); // browser-only items → account (one time), device copies refreshed
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]);

    // ── Plan picked on the website before signing in (lib/pendingPlan.ts) ─────────────────────────────────
    const launchIntentCheckout = useCallback(async (intent: PlanIntent, userId: string) => {
        setIntentCheckoutBusy(true);
        updateIntent({ checkoutStartedAt: Date.now() }); // closing the checkout → banner next time, never a forced loop
        try {
            const { url } = await startCheckout(intent.plan, toBillingPeriod(intent.period), userId);
            window.location.assign(url);
        } catch (err) {
            setIntentCheckoutBusy(false);
            const message = describeError(err, 'Could not start checkout. Please try again.');
            if (/already have an active subscription/i.test(message)) {
                clearIntent();
                setUpgradeBanner(null);
                toast.info("You're already on a paid plan.");
            } else {
                toast.error(message);
            }
        }
    }, []);

    /** Once per (user, plan) per page load, when the session AND the server's plan are known. */
    const intentCheckedRef = useRef<string | null>(null);
    useEffect(() => {
        const user = session?.user;
        if (!user || !profile || profileStatus !== 'ready' || usingCachedData || !isOnline) return;
        if (view.screen === 'auth' || view.screen === 'root' || view.screen === 'welcome' || view.screen === 'updatePassword') return;
        if (view.screen === 'billingSuccess') { // paid: the webhook activates the plan
            clearIntent();
            setUpgradeBanner(null);
            return;
        }
        const key = `${user.id}:${plan}`;
        if (intentCheckedRef.current === key) return;
        intentCheckedRef.current = key;
        const action = decideIntentAction(readIntent(), plan);
        if (action.type === 'banner') {
            setUpgradeBanner(updateIntent({ bannerShownAt: Date.now() }) || action.intent);
            return;
        }
        setUpgradeBanner(null);
        if (action.type === 'clear') clearIntent();
        else if (action.type === 'alreadyOnPlan') {
            clearIntent();
            toast.info(`You're already on ${PLANS[action.current].name}.`);
        } else if (action.type === 'checkout') {
            toast.info(`Taking you to secure checkout for ${intentLabel(action.intent)}…`);
            void launchIntentCheckout(action.intent, user.id);
        }
    }, [session?.user, profile, profileStatus, usingCachedData, isOnline, view.screen, plan, launchIntentCheckout]);

    // Paid in another tab / closed the tab before returning: the webhook upgraded the account, so refresh the
    // plan when the app regains focus (throttled; login already loads it).
    const planRef = useRef(plan);
    planRef.current = plan;
    useEffect(() => {
        const user = session?.user;
        if (!user) return;
        let last = Date.now();
        const refresh = () => {
            if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - last < 60_000) return;
            last = Date.now();
            void loadProfileRow(user, theme).then(fresh => {
                if (sessionUserIdRef.current !== user.id || fresh.plan === planRef.current) return;
                loadAccountData(user, { silent: true }); // plan + usage limits
                if (isPaidTier(fresh.plan)) toast.success(`You're on ${PLANS[fresh.plan].name} now.`);
            }).catch(() => undefined);
        };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
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
                const run = mod.generateDueRecurringInvoices || mod.runDueRecurringInvoices;
                const result = typeof run === 'function' ? await run() : 0;
                const created = typeof result === 'number' ? result : Number(result?.created ?? result?.count ?? 0);
                // at most one draft per series is created; skipped older periods are reported (PARITY_V2 D2)
                const message = typeof mod.describeRecurringResult === 'function' && typeof result === 'object' ? mod.describeRecurringResult(result) : null;
                if (!cancelled && (created > 0 || message) && sessionUserIdRef.current === uid) {
                    toast.info(message || `${created} recurring ${created === 1 ? 'invoice was' : 'invoices were'} created.`, { duration: message ? 12000 : undefined });
                    if (created > 0) loadRecentDocuments(uid).catch(() => undefined);
                }
            } catch { /* optional feature */ }
        }, 1500);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [session?.user?.id, profileStatus, loadRecentDocuments]);

    // Punch lists: progress of every job, once per session and after an offline item synced.
    useEffect(() => {
        const uid = session?.user?.id;
        if (!uid || profileStatus !== 'ready') return;
        let cancelled = false;
        const run = () => import('./components/punch/punchApi.ts')
            .then(m => m.fetchPunchProgress(todayYMD()).then(r => {
                if (cancelled || sessionUserIdRef.current !== uid || r.available === null) return;
                m.rememberPunchAvailable(r.available);
                setPunchState({ available: r.available, map: r.map });
            }))
            .catch(() => undefined);
        const timer = setTimeout(() => { if (navigator.onLine) void run(); }, 1200);
        const onSynced = () => { void run(); };
        window.addEventListener(PUNCH_SYNCED_EVENT, onSynced);
        return () => { cancelled = true; clearTimeout(timer); window.removeEventListener(PUNCH_SYNCED_EVENT, onSynced); };
    }, [session?.user?.id, profileStatus]);
    // Service plans: visits that came due since the last run (the server also runs this every hour).
    useEffect(() => {
        const uid = session?.user?.id;
        if (!uid || profileStatus !== 'ready' || !paid || !navigator.onLine) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const { generateDueVisits } = await import('./components/service/servicePlansApi.ts');
                const created = await generateDueVisits();
                if (cancelled || !created || sessionUserIdRef.current !== uid) return;
                toast.info(`${created} service ${created === 1 ? 'visit was' : 'visits were'} scheduled, with ${created === 1 ? 'its work order' : 'their work orders'}.`);
                loadRecentDocuments(uid).catch(() => undefined);
                loadJobs(uid).catch(() => undefined);
            } catch { /* optional feature */ }
        }, 2500);
        return () => { cancelled = true; clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id, profileStatus, paid, loadRecentDocuments]);

    const handlePunchProgress = useCallback((jobId: string, progress: PunchProgress) => {
        setPunchState(prev => {
            const cur = prev.map.get(jobId);
            if (cur && cur.total === progress.total && cur.closed === progress.closed && cur.verified === progress.verified && cur.overdue === progress.overdue && cur.sentBack === progress.sentBack) return prev;
            const map = new Map(prev.map);
            map.set(jobId, progress);
            return { available: true, map };
        });
    }, []);

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

    // A signature or decline that arrives while the app is open shows up on the next screen change (at most once a minute).
    useEffect(() => {
        const uid = session?.user?.id;
        if (profileStatus !== 'ready' || !uid) return;
        const timer = setTimeout(() => {
            if (!navigator.onLine || Date.now() - decisionsCheckedAtRef.current < 60_000) return;
            loadUnseenDecisions(uid).catch(() => undefined);
        }, 3000);
        return () => clearTimeout(timer);
    }, [profileStatus, view.screen, session?.user?.id, loadUnseenDecisions]);

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
        // the job's document list opens offline too (also after a reload): keep the list rows on this device
        dbApi.putMany('documents', mapped.filter(d => isLightweightDocument(d))).catch(() => undefined);
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

    // On a job page (online, once per session, not in data-saver mode) the field-document forms are loaded in the
    // background, so "New document" still opens them if the connection drops on site.
    const offlineFormsPrefetchedRef = useRef(false);
    useEffect(() => {
        if (view.screen !== 'jobDetails' || profileStatus !== 'ready' || offlineFormsPrefetchedRef.current) return;
        if (!navigator.onLine || (navigator as any).connection?.saveData) return;
        offlineFormsPrefetchedRef.current = true;
        const idle: (cb: () => void) => void = (window as any).requestIdleCallback
            ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 5000 })
            : (cb) => { setTimeout(cb, 2000); };
        idle(() => { void prefetchOfflineForms().then(() => warmOfflineShell()); });
    }, [view.screen, profileStatus]);

    // The app opens without a connection (public/sw.js, production builds only). Signed-in users only: the marketing
    // site and the clients' portal / approval pages never register it.
    useEffect(() => { if (session?.user?.id) registerOfflineShell(); }, [session?.user?.id]);

    // Once per session (online, not in data-saver mode, a few seconds after the account is loaded): the main screens'
    // files in the background, so they open offline later (the worker keeps them).
    const offlineScreensPrefetchedRef = useRef(false);
    useEffect(() => {
        if (profileStatus !== 'ready' || offlineScreensPrefetchedRef.current) return;
        if (!navigator.onLine || (navigator as any).connection?.saveData) return;
        const timer = window.setTimeout(() => {
            if (offlineScreensPrefetchedRef.current || !navigator.onLine) return;
            offlineScreensPrefetchedRef.current = true;
            const idle: (cb: () => void) => void = (window as any).requestIdleCallback
                ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 8000 })
                : (cb) => { setTimeout(cb, 1000); };
            idle(() => {
                void prefetchOfflineForms()
                    .then(() => prefetchOfflineScreens())
                    .then(() => warmOfflineShell());
            });
        }, 6000);
        return () => window.clearTimeout(timer);
    }, [profileStatus]);

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

    // Duplicate-job modal: loads EVERY document of the job (not only the first page of 20), like the original app
    // (CORE-026, PARITY_V2 D4).
    const duplicateCandidateForms = useMemo(
        () => (jobToDuplicate ? forms.filter(f => f.jobId === jobToDuplicate.id) : []),
        [forms, jobToDuplicate?.id],
    );
    /** job whose complete document list is loaded for the modal (the modal pre-selects them all once it is) */
    const [duplicateDocsReadyFor, setDuplicateDocsReadyFor] = useState<string | null>(null);
    useEffect(() => {
        if (!showDuplicateJobModal || !jobToDuplicate) return;
        const jobId = jobToDuplicate.id;
        if (!navigator.onLine) {
            // offline: show what this device has (duplicating needs a connection anyway)
            setDuplicateDocsReadyFor(jobId);
            return;
        }
        let cancelled = false;
        fetchAllJobDocumentSummaries(jobId)
            .then(docs => { if (!cancelled && sessionUserIdRef.current) setForms(prev => mergeDocuments(prev, docs)); })
            .catch(err => { if (!cancelled) toast.error(`Could not load all documents of this job. ${describeError(err)}`); })
            .finally(() => { if (!cancelled) setDuplicateDocsReadyFor(jobId); });
        return () => { cancelled = true; setDuplicateDocsReadyFor(null); };
    }, [showDuplicateJobModal, jobToDuplicate?.id]);

    // ── Auth handlers ────────────────────────────────────────────────────────
    const handleLogin = async (email: string, pass: string) => {
        if (!navigator.onLine) throw new Error("You're offline. Connect to the internet to log in.");
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
        if (error) throw error;
    };

    const handleSignup = async (email: string, pass: string) => {
        if (!navigator.onLine) throw new Error("You're offline. Connect to the internet to sign up.");
        // A paid plan picked on the website rides along in the confirmation link too (other browser/device).
        const intent = readIntent();
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password: pass,
            options: { emailRedirectTo: `${window.location.origin}/auth/login${intentSearch(intent)}` },
        });
        if (signupOutcome(data, error) === 'alreadyRegistered') {
            // That email already has an account: log in with it prefilled (keeping a picked plan, if any).
            setLoginPrefill(email.trim());
            navigate({ pathname: '/auth/login', search: intentSearch(intent) }, { replace: true });
            return;
        }
        if (error) throw error;
        try { sessionStorage.setItem('signup_email', email.trim()); } catch { /* ignore */ }
        // With email confirmation off, Supabase returns a session and the route guard opens the dashboard.
        if (!data.session) navigate('/auth/checkEmail', { replace: true });
    };

    const handleResendConfirmation = async () => {
        let email = '';
        try { email = sessionStorage.getItem('signup_email') || ''; } catch { /* ignore */ }
        if (!email) { navigate('/auth/signup'); return; }
        const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/login${intentSearch(readIntent())}` } });
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
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/login${intentSearch(readIntent())}` } });
        if (error) throw error;
    };

    /** Logout clears everything the previous user left on this device (CORE-008, CORE-028). */
    const performLogout = async () => {
        loggingOutRef.current = true;
        // this user's offline outbox + its 7-day history (only reached after the "not synced yet" warning)
        await outbox.clearAll(sessionUserIdRef.current);
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

    /** Logout asks first when documents saved offline haven't reached the account yet ("Sync first"). */
    const handleLogout = async () => {
        const waiting = await outbox.countUnsynced();
        if (waiting > 0) { setLogoutGuard({ count: waiting, problem: null }); return; }
        await performLogout();
    };

    const handleLogoutSyncFirst = async () => {
        const report = await outbox.sync({ trigger: 'manual', includeBlocked: true });
        const left = await outbox.countUnsynced();
        if (left === 0) {
            setLogoutGuard(null);
            await performLogout();
            return;
        }
        const problem = report?.refused[0]?.message
            || (report?.networkStopped ? 'the connection dropped. Try again in a moment.' : report ? 'try again in a moment.' : 'another tab is syncing. Try again in a moment.');
        setLogoutGuard({ count: left, problem });
    };

    // ── Navigation helpers (also used by the AI action handler) ──────────────
    const navigateToDashboard = () => setView({ screen: 'dashboard' });
    const navigateToSettings = () => setView({ screen: 'settings' });
    const navigateToNewDoc = async (jobId: string) => {
        // offline: field documents and estimate / invoice drafts go to the outbox (the picker greys out the rest);
        // ensureDocSlot then checks the Free plan with the counts on this device
        if (await ensureDocSlot(jobId)) setView({ screen: 'selectDocType', jobId });
    };
    const navigateToCreateJob = (returnTo: 'dashboard' | 'calendar' = 'dashboard', prefillData?: Record<string, unknown>) => {
        // offline too: the new job (and a new client typed in it) waits on this device and syncs later (createJob);
        // the Free plan check counts the jobs waiting there
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
            case 'export': navigate('/settings#data'); break;
            case 'pipeline': navigate('/pipeline'); break;
            case 'crew': navigate('/crew'); break;
            case 'papers': navigate('/papers'); break;
            case 'servicePlans': navigate('/service-plans'); break;
            case 'help': navigate('/tutorials'); break;
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

    /**
     * Image fields of the document forms (logo...). Online: the upload above, unchanged. Offline: the compressed photo is
     * kept inside the document and uploaded when the document syncs (lib/offline/offlinePhotos.ts).
     */
    const handleUploadFormImage = async (file: File): Promise<string> => {
        if (navigator.onLine) return handleUploadDocumentImage(file);
        try {
            const dataUrl = await fileToDataUrl(await compressImage(file));
            void rememberOfflinePhoto(dataUrl);
            return dataUrl;
        } catch (e) {
            toast.error(`The image couldn't be added. ${describeError(e)}`);
            return '';
        }
    };

    /**
     * Settings saved offline (or while an earlier offline save still waits): one outbox item per user, a patch of the
     * profiles row, synced like the rest (lib/offline/offlineProfile.ts). A logo / picture picked offline waits inside
     * it as a compressed image and is uploaded when it syncs.
     */
    const saveProfileToOutbox = async (uid: string, updated: UserProfile, logoFile?: File | null, profilePicFile?: File | null, payment?: PaymentSettings | null) => {
        let logoUrl = updated.logoUrl || '';
        let pictureUrl = updated.profilePictureUrl || '';
        try {
            if (logoFile) { logoUrl = await fileToDataUrl(logoFile); void rememberOfflinePhoto(logoUrl); }
            if (profilePicFile) { pictureUrl = await fileToDataUrl(profilePicFile); void rememberOfflinePhoto(pictureUrl); }
        } catch (err) {
            throw new Error(`The image couldn't be kept on this device. ${describeError(err)}`);
        }
        const patch = offlineProfilePatch(updated, { logoUrl, pictureUrl }, payment ?? null);
        const waiting = pendingProfileItem(outbox.items, uid);
        try {
            await outbox.queue({
                entity: 'profile', userId: uid, docId: uid, jobId: '', type: ENTITY_TYPE.profile, kind: 'edit', data: patch,
                base: waiting ? null : profileBaseFor(accountProfile || updated, patch),
            });
        } catch (err) {
            throw new Error(`Your settings couldn't be kept on this device (storage full?). ${describeError(err)}`);
        }
        if (navigator.onLine) {
            void outbox.sync({ trigger: 'save', onlyDocIds: [uid] });
            toast.success('Settings saved.');
        } else {
            toast.success("Settings saved on this device. They're added to your account when you're back online.");
        }
    };

    /** Saves profile fields. Throws so Settings keeps the edits and shows the error (CORE-021, VIEW-010). */
    const handleSaveProfile = async (updated: UserProfile, logoFile?: File | null, profilePicFile?: File | null, extras?: { paymentSettings?: PaymentSettings | null }) => {
        const uid = sessionUserIdRef.current;
        if (!uid) throw new Error('Please sign in again.');
        // offline, or settings saved offline still waiting: the outbox keeps the order (the newest save wins)
        if (!navigator.onLine || pendingProfileItem(outbox.items, uid)) {
            await saveProfileToOutbox(uid, updated, logoFile, profilePicFile, extras?.paymentSettings ?? null);
            return;
        }
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
        // keep the account preferences (user_settings) in step with the language just saved (profile columns are done)
        void saveUiPreferencesToAccount({ theme, language: row.language }, { skipProfile: true });
        toast.success('Settings saved.');
    };

    const handleSaveSignature = async (dataUrl: string | null) => {
        const uid = sessionUserIdRef.current;
        if (!uid) return;
        // A save that can't reach the account (offline …) is kept on this device and uploaded at the next login.
        const mode = await saveDefaultSignatureToAccount(uid, dataUrl);
        if (mode === 'account') {
            setProfile(prev => (prev ? { ...prev, defaultSignatureUrl: dataUrl || undefined } : prev));
            toast.success(dataUrl ? 'Default signature saved.' : 'Default signature removed.');
        } else {
            toast.info('Signature saved on this device. It will be added to your account when you are back online.');
        }
    };

    const handleManageBilling = async () => {
        const url = await getBillingPortalUrl();
        if (!url) throw new Error('The billing portal is not available right now. Please contact support to change or cancel your plan.');
        window.location.assign(url);
    };

    const handleDeleteAccount = async () => {
        if (!navigator.onLine) throw new Error(NEEDS_CONNECTION);
        try {
            await invokeFunction('delete-account', {});
        } catch {
            throw new Error("Automatic account deletion isn't available right now.");
        }
        loggingOutRef.current = true;
        await outbox.clearAll(sessionUserIdRef.current);
        try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
        clearDocumentCache();
        clearUserBrowserStorage();
        try { await dbApi.clearAll(); } catch { /* ignore */ }
        window.location.replace('/');
    };

    /** A lien waiver (Note) was saved on a job: show it in the job's documents and open it. */
    const handleWaiverCreated = (form: FormDataType, jobId: string | null) => {
        setForms(prev => mergeDocuments(prev.filter(f => f.id !== form.id), [form]));
        if (jobId) void loadDocumentsForJob(jobId, true);
        bumpDocUsage(form.jobId);
        openDocument(form, true);
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
    const createClientForJob = async (jobId: string, name: string, address: string, temporary = false): Promise<string | null> => {
        const uid = sessionUserIdRef.current;
        if (!uid || !name.trim()) return null;
        let client: Client;
        try {
            const { insertClient, TEMP_TAG } = await import('./components/ClientDetails.tsx');
            client = await insertClient({ name, email: '', phone: '', address, notes: temporary ? TEMP_TAG : '' }, uid);
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
        toast.success(`"${client.name}" was added to your ${temporary ? 'temporary ' : ''}clients.`);
        return client.id;
    };

    const handleUpdateJobStatus = async (jobId: string, newStatus: Job['status']) => {
        if (!JOB_STATUSES.includes(newStatus)) return;
        const prevJob = jobs.find(j => j.id === jobId);
        if (!prevJob || prevJob.status === newStatus) return;
        // offline (or a job still waiting to sync): the change waits in the outbox and syncs later
        if (!navigator.onLine || outbox.itemFor(jobId)) {
            const uid = sessionUserIdRef.current;
            if (!uid) return;
            await outbox.queue({ entity: 'job', userId: uid, docId: jobId, jobId, type: ENTITY_TYPE.job, kind: 'edit', data: { status: newStatus } });
            toast.success("Status saved on this device. It syncs when you're back online.");
            return;
        }
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
        const offline = !navigator.onLine;
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

        // Offline: the job (and a new client typed in it) wait on this device and sync later, in that order. Its id is
        // final already, so documents created in it offline land in it on the account.
        if (offline) {
            try {
                let linkId = clientId;
                if (!linkId && clientName) {
                    const clientRow = {
                        id: crypto.randomUUID(), user_id: uid, name: clientName.replace(/\s+/g, ' '), email: '', phone: '', address: clientAddress,
                        notes: jobData?.clientTemporary === true ? TEMP_TAG : '',
                    };
                    await outbox.queue({ entity: 'client', userId: uid, docId: clientRow.id, jobId: '', type: ENTITY_TYPE.client, kind: 'create', data: clientRow });
                    linkId = clientRow.id;
                }
                if (linkId) row.client_id = linkId;
                await outbox.queue({ entity: 'job', userId: uid, docId: row.id as string, jobId: row.id as string, type: ENTITY_TYPE.job, kind: 'create', data: row, clientId: linkId });
            } catch (error) {
                throw new Error(`The job couldn't be kept on this device. ${describeError(error)}`);
            }
            toast.success(`Job "${name}" saved on this device. It syncs when you're back online.`);
            if (!skipNavigation) {
                if (view.screen === 'createJob' && view.returnTo === 'calendar') navigate('/calendar', { replace: true });
                else navigate(`/jobs/${row.id}`, { replace: true });
            }
            return row.id as string;
        }

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
        if (!clientId && clientName) void createClientForJob(created.id, clientName, clientAddress, jobData?.clientTemporary === true);

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
        // Free plan: a job can get `limits.docs` new documents a month and the database refuses a whole insert past it,
        // so copy what fits (in the order the user saw) and say what was left out (PARITY_V2 D4).
        const docLimit = paid ? null : effectiveUsage.limits.docs;
        const { copy: idsToCopy, left: idsLeft } = planDuplicateCopies(selectedDocIds, docLimit === null ? null : Math.max(0, docLimit - docsUsedThisMonth(created.id)));
        let limitHit = idsLeft.length > 0;
        if (idsToCopy.length) {
            try {
                const fullDocs = await fetchFullDocuments(idsToCopy);
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
                const now = new Date().toISOString();
                // in batches, so a long job never makes one huge request; a plan limit stops after what was saved
                for (const batch of chunk(records, ID_CHUNK)) {
                    const { error } = await supabase.from('documents').insert(batch);
                    if (error) {
                        if (isPlanLimitError(error)) { limitHit = true; break; }
                        throw error;
                    }
                    copied += batch.length;
                    const mapped = batch.map(r => mapDocumentRow({ ...r, created_at: now }, true));
                    mapped.forEach(primeDocumentCache);
                    setForms(prev => mergeDocuments(prev, mapped));
                    bumpDocUsage(created.id, batch.length);
                }
            } catch (error) {
                if (!handlePlanLimit(error)) {
                    toast.error(copied
                        ? `The job was copied with ${copied} of ${selectedDocIds.length} documents; the others could not be copied. ${describeError(error)}`
                        : `The job was copied, but its documents were not. ${describeError(error)}`);
                }
            }
        }
        refreshUsage();
        setShowDuplicateJobModal(false);
        setJobToDuplicate(null);
        if (limitHit && copied < selectedDocIds.length) {
            toast.info(
                `Job duplicated with ${copied} of ${selectedDocIds.length} documents: the Free plan allows ${docLimit ?? copied} new documents per job each month. Upgrade to copy the rest.`,
                { duration: 12000, action: { label: 'Upgrade', onClick: () => openUpgrade('Copy every document when you duplicate a job') } },
            );
        } else {
            toast.success(copied ? `Job duplicated with ${copied} ${copied === 1 ? 'document' : 'documents'}.` : 'Job duplicated.');
        }
        navigate(`/jobs/${created.id}`);
    };

    // ── Documents ────────────────────────────────────────────────────────────
    const handleDocumentsViewed = (ids: string[]) => {
        const idSet = new Set(ids);
        setForms(prev => prev.map(f => (idSet.has(f.id) ? { ...f, data: { ...(f.data as any), viewedByProvider: true } } : f)));
    };

    /** "Mark as paid" saved documents (the invoice and the receipt it created): keep lists, usage and stock in step. */
    const handlePaymentRecorded = (docs: FormDataType[]) => {
        const known = new Set(forms.map(f => f.id));
        const saved = docs.map(doc => ({ ...doc, createdAt: doc.createdAt || forms.find(f => f.id === doc.id)?.createdAt || new Date().toISOString() }));
        saved.forEach(primeDocumentCache);
        setForms(prev => mergeDocuments(prev.filter(f => !saved.some(s => s.id === f.id)), saved));
        saved.filter(doc => !known.has(doc.id) && doc.type === FormType.Receipt).forEach(doc => bumpDocUsage(doc.jobId));
        refreshUsage();
        const uid = sessionUserIdRef.current;
        if (uid && saved.some(doc => doc.type === FormType.Invoice)) loadInventory(uid).catch(() => undefined);
    };

    /** "Bill time & materials" created a Draft invoice and marked its entries billed: update the lists, then open it. */
    const handleTimeMaterialsBilled = ({ invoice, updated, markFailed }: { invoice: FormDataType; updated: FormDataType[]; markFailed: number }) => {
        const saved = [invoice, ...updated].map(doc => ({ ...doc, createdAt: doc.createdAt || forms.find(f => f.id === doc.id)?.createdAt || new Date().toISOString() }));
        saved.forEach(primeDocumentCache);
        setForms(prev => mergeDocuments(prev.filter(f => !saved.some(s => s.id === f.id)), saved));
        bumpDocUsage(invoice.jobId);
        refreshUsage();
        setShowBillTimeMaterials(false);
        toast.success(`Draft invoice ${(invoice.data as any)?.invoiceNumber || ''} created. Check it, then send it.`);
        if (markFailed) toast.error(`${markFailed} entr${markFailed === 1 ? 'y' : 'ies'} could not be marked as billed. The invoice keeps the list, so ${markFailed === 1 ? 'it' : 'they'} won't be billed twice.`);
        openDocument(invoice, true);
    };

    /**
     * Supplier ordering (lib/suppliersApi.ts): reorder purchase orders created from Inventory, or a PO updated by
     * "Mark received" outside a form save. The full documents join the list (job page, pipeline, costing).
     */
    const handleSupplierDocuments = (docs: FormDataType[], created = false) => {
        if (!docs.length) return;
        const saved = docs.map(doc => ({ ...doc, createdAt: doc.createdAt || forms.find(f => f.id === doc.id)?.createdAt || new Date().toISOString() }));
        saved.forEach(primeDocumentCache);
        setForms(prev => mergeDocuments(prev.filter(f => !saved.some(s => s.id === f.id)), saved));
        if (created) refreshUsage();
    };

    const handleDuplicateDoc = async (form: FormDataType) => {
        const uid = sessionUserIdRef.current;
        if (!uid) return;
        if (outbox.itemFor(form.id)) { toast.info('This document is still waiting to sync. Duplicate it once it has synced.'); return; }
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

    /** Copy a document into another job as a draft with the target job's client / job boxes (same guards as Duplicate). */
    const handleCopyDocToJob = async (form: FormDataType, target: AppJob) => {
        const uid = sessionUserIdRef.current;
        if (!uid) return;
        if (outbox.itemFor(form.id)) { toast.info('This document is still waiting to sync. Copy it once it has synced.'); return; }
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to copy documents."); return; }
        if (!(await ensureDocSlot(target.id))) return;
        try {
            const full = await fetchFullDocument(form.id);
            const client = (target.clientId ? clients.find(c => c.id === target.clientId) : undefined)
                || clients.find(c => (c.name || '').trim().toLowerCase() === (target.clientName || '').trim().toLowerCase());
            const record = {
                id: crypto.randomUUID(),
                user_id: uid,
                job_id: target.id,
                type: full.type,
                data: buildCopyToJobData(full.data as Record<string, any>, target, client),
            };
            const { error } = await supabase.from('documents').insert(record);
            if (error) throw error;
            const mapped = mapDocumentRow({ ...record, created_at: new Date().toISOString() }, true);
            primeDocumentCache(mapped);
            setForms(prev => mergeDocuments(prev, [mapped]));
            bumpDocUsage(target.id);
            setDocToCopy(null);
            toast.success(copyDoneMessage(target), { duration: 8000, action: { label: 'Open', onClick: () => openDocument(mapped, false) } });
        } catch (error) {
            if (!handlePlanLimit(error)) toast.error(`Could not copy the document. ${describeError(error)}`);
        }
    };

    const copyPickerActivity = useMemo(() => {
        const latest: Record<string, string> = {};
        for (const f of forms) if (f.createdAt && (!latest[f.jobId] || f.createdAt > latest[f.jobId])) latest[f.jobId] = f.createdAt;
        return latest;
    }, [forms]);

    const handleDeleteDoc = async () => {
        const id = docToDelete;
        if (!id) return;
        const waiting = outbox.itemFor(id);
        if (waiting?.kind === 'create') {
            // never reached the account: it only leaves the outbox (kept 7 days under "Saved on this device")
            await outbox.discard(id);
            toast.success('Document deleted.');
            if (view.screen === 'form' && view.formId === id) navigate(`/jobs/${view.jobId}`, { replace: true });
            return;
        }
        if (!navigator.onLine) { toast.error("You're offline. Reconnect to delete documents."); throw new Error('offline'); }
        const { error } = await supabase.from('documents').delete().eq('id', id);
        if (error) {
            toast.error(`Could not delete the document. ${describeError(error)}`);
            throw error;
        }
        if (waiting) await outbox.discard(id); // its offline edit goes with it
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
     * A save that goes to the offline outbox (lib/offline): no connection, or a document that is still waiting there.
     * It is listed at once with a "Waiting to sync" chip; online it is sent right away through the same document save.
     * Resolves like handleSaveForm (the form shows "Saved"; the chip says whether it reached the account).
     */
    const saveFormToOutbox = async (formData: any, kind: OutboxKind): Promise<false | { id: string; public_token: string | null }> => {
        if (!session || view.screen !== 'form') return false;
        try {
            if (!view.formId && (!newFormIdRef.current || newFormIdRef.current.key !== location.key)) {
                newFormIdRef.current = { key: location.key, id: crypto.randomUUID() };
            }
            const docId = view.formId || newFormIdRef.current!.id;
            const job = jobs.find(j => j.id === view.jobId);
            if (!job) {
                toast.error("This job isn't on your account yet, so the document can't wait offline. Reconnect, then save again.");
                return false;
            }
            const existing = forms.find(f => f.id === docId);
            const waiting = outbox.itemFor(docId);
            const dataToSave = stripLightweightFlag({
                ...formData,
                ...((formData as any).isAiDrafted || (formData as any).isAiGenerated || view.prefillData?.isAiDrafted ? { isAiGenerated: true } : {}),
            });
            assertFullDocument({ data: dataToSave });
            const clientId = job.clientId || findClientIdByName((dataToSave as any).clientName || job.clientName) || null;
            // an edit remembers the version it started from (conflict check on sync); a new document its number rule
            const base = kind === 'edit' && !waiting && existing && !isLightweightDocument(existing)
                ? { hash: contentHash(existing.data as unknown as Record<string, unknown>), updatedAt: null }
                : null;
            const cfg = DOC_NUMBER_CONFIG[view.formType];
            const suggested = cfg && kind === 'create' && !waiting
                ? nextDocumentNumber(cfg.prefix, forms.filter(f => f.type === view.formType && f.id !== docId).map(f => String((f.data as any)?.[cfg.field] || '')).filter(Boolean))
                : null;
            const number = kind === 'create' && !waiting && cfg ? numberRuleFor(view.formType, (dataToSave as any)[cfg.field], suggested) : null;
            await outbox.queue({ userId: session.user.id, docId, jobId: view.jobId, type: view.formType, kind, data: dataToSave, clientId, base, number });

            // like an online save: the form stays on the document (its URL is replaced), Back/refresh reopen it
            if (!view.formId || view.prefillData) {
                formKeyAliasRef.current[docId] = newFormKey(view.formType, view.prefillData, location.key);
                navigate(`/jobs/${view.jobId}/forms/${encodeURIComponent(view.formType)}/${docId}`, { replace: true, state: { fromJob: (location.state as any)?.fromJob ?? true } });
            }
            newFormIdRef.current = null;
            const token = existing?.public_token ?? null;

            if (!navigator.onLine) {
                toast.success(`${view.formType} saved on this device. It syncs when you're back online.`);
                return { id: docId, public_token: token };
            }
            // online (a document that was waiting): send it now
            const report = await outbox.sync({ trigger: 'save', onlyDocIds: [docId], includeBlocked: true });
            const synced = report?.synced.find(s => s.docId === docId);
            if (synced) {
                toast.success(synced.created ? `${view.formType} created.` : `${view.formType} saved.`);
                return { id: docId, public_token: synced.publicToken ?? token };
            }
            const refused = report?.refused.find(r => r.docId === docId);
            if (refused?.kind === 'plan_limit') {
                openUpgrade(refused.message);
                toast.info(`Saved on this device, not on your account yet: ${refused.message}`, { duration: 10000 });
            } else if (refused) {
                toast.error(`Saved on this device, but it couldn't sync: ${refused.message}`, { duration: 10000 });
            } else {
                toast.info('Saved on this device. It syncs in a moment.');
            }
            return { id: docId, public_token: token };
        } catch (err) {
            toast.error(`It couldn't be kept on this device. ${describeError(err)}`);
            return false;
        }
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
        // Offline, or a document still waiting in the outbox: the save goes through the outbox (lib/offline).
        const knownId = view.formId || (newFormIdRef.current?.key === location.key ? newFormIdRef.current.id : null);
        const waitingItem = outbox.itemFor(knownId);
        // a document of a job created offline that isn't on the account yet waits with it
        const jobWaiting = outbox.itemFor(view.jobId)?.kind === 'create';
        if (!navigator.onLine || waitingItem || jobWaiting) {
            const kind: OutboxKind = waitingItem ? waitingItem.kind : view.formId ? 'edit' : 'create';
            const policy = offlineSavePolicy(view.formType, kind);
            if (!policy.ok && !waitingItem && !(jobWaiting && navigator.onLine)) {
                toast.error(policy.reason);
                return false;
            }
            const pending = saveFormToOutbox(formData, kind);
            savingFormPromiseRef.current = pending;
            try {
                const result = await pending;
                if (result) window.dispatchEvent(new Event(DOCUMENT_SAVED_EVENT)); // phones: may offer "Add to home screen"
                return result;
            } finally {
                savingFormPromiseRef.current = null;
            }
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

            // the same upsert the offline outbox uses when it syncs (lib/documentSave.ts)
            const { row: savedRow, error: saveError } = await upsertDocumentRecord(record);
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
            const result = await pending;
            if (result) window.dispatchEvent(new Event(DOCUMENT_SAVED_EVENT)); // phones: may offer "Add to home screen"
            return result;
        } finally {
            savingFormPromiseRef.current = null;
        }
    };

    // ── Offline outbox sync: the network side (same save, photo upload and number lookup as online) ───────────
    outboxDepsRef.current = () => {
        const uid = sessionUserIdRef.current;
        if (!uid) return null;
        return {
            upsert: upsertDocumentRecord,
            fetchServer: fetchDocumentForSync,
            fetchNumbers: fetchDocumentNumbers,
            uploadPhoto: async (dataUrl: string) => {
                const blob = dataUrlToBlob(dataUrl);
                const file = new File([blob], `photo.${extensionForType(blob.type)}`, { type: blob.type });
                return uploadFile('logos', file, uid, 'doc');
            },
            isOnline: () => navigator.onLine !== false,
            fetchEntity: async (entity, id) => {
                if (entity !== 'profile') return null;
                const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
                if (error) throw error;
                return data ? comparableProfileRow(data as Record<string, unknown>) : null;
            },
            saveEntity: async (entity, kind, row, files) => {
                const duplicate = (e: unknown) => String((e as { code?: unknown } | null)?.code || '') === '23505';
                // a stock change made offline: the same stock RPC as online (it logs the history row)
                if (entity === 'stock_move') {
                    const { error } = await supabase.rpc('adjust_inventory', { p_item_id: row.p_item_id, p_delta: row.p_delta, p_reason: row.p_reason, p_job_id: row.p_job_id ?? null });
                    return { error };
                }
                // settings saved offline: the same profiles update as online (without the payment columns when the
                // database doesn't have them yet, as online)
                if (entity === 'profile') {
                    const { id: _id, ...patch } = row;
                    const stamp = { updated_at: new Date().toISOString() };
                    let res = await supabase.from('profiles').update({ ...patch, ...stamp }).eq('id', uid);
                    if (res.error && isMissingColumnError(res.error)) res = await supabase.from('profiles').update({ ...withoutPaymentColumns(patch), ...stamp }).eq('id', uid);
                    return { error: res.error };
                }
                // reminder settings saved offline: the same upsert as the Reminders card online
                if (entity === 'reminder_settings') {
                    const { id: _id, ...settingsRow } = row;
                    const { error } = await supabase.from('reminder_settings').upsert({ ...settingsRow, user_id: uid }, { onConflict: 'user_id' });
                    return { error };
                }
                // a job photo taken offline: the same row + upload + portal copy as "Add photos" online
                if (entity === 'job_photo') {
                    const api = await import('./components/photos/photosApi.ts');
                    return uploadQueuedPhoto(api.queuedPhotoUploadDeps(uid), kind, row, files);
                }
                const table = { job: 'jobs', client: 'clients', inventory: 'inventory', price_item: 'saved_items', punch_item: 'punch_items' }[entity];
                if (kind === 'create') {
                    if (entity === 'job') {
                        try { return { id: (await insertJobRow(row)).id, error: null }; } catch (e) { return { error: duplicate(e) ? null : e }; }
                    }
                    const { error } = await supabase.from(table).insert(row);
                    return { error: error && !duplicate(error) ? error : null };
                }
                const { id, user_id: _owner, created_at: _created, ...patch } = row;
                const { error } = await supabase.from(table).update(patch).eq('id', id as string);
                return { error };
            },
            onSynced: (doc) => {
                if (sessionUserIdRef.current !== uid) return;
                if (doc.entity === 'profile') {
                    // the uploaded logo / picture URLs replace the device copies
                    setProfile(prev => (prev ? { ...prev, ...profileFieldsFromRow(doc.data) } : prev));
                    return;
                }
                if (doc.entity === 'job_photo') return; // the Photos tab reloads its list when its photos leave the outbox
                if (doc.entity === 'job') {
                    const status = doc.data.status ? normalizeJobStatus(doc.data.status as string) : null;
                    setJobs(prev => (prev.some(j => j.id === doc.docId)
                        ? prev.map(j => (j.id === doc.docId ? { ...j, ...(status ? { status } : {}) } : j))
                        : [mapJobRow({ created_at: new Date().toISOString(), ...doc.data }), ...prev]));
                    return;
                }
                if (doc.entity === 'inventory' || doc.entity === 'stock_move') { loadInventory(uid).catch(() => undefined); return; }
                if (doc.entity === 'price_item') { loadSavedItems(uid).catch(() => undefined); return; }
                if (doc.entity === 'punch_item') { window.dispatchEvent(new CustomEvent(PUNCH_SYNCED_EVENT, { detail: { jobId: doc.jobId } })); return; }
                if (doc.entity === 'client') {
                    setClients(prev => (prev.some(c => c.id === doc.docId)
                        ? prev.map(c => (c.id === doc.docId ? { ...c, ...doc.data } as Client : c))
                        : [...prev, { created_at: new Date().toISOString(), ...doc.data } as Client].sort(byClientName)));
                    return;
                }
                const known = serverFormsRef.current.find(f => f.id === doc.docId);
                const savedForm = mapDocumentRow({
                    id: doc.docId, job_id: doc.jobId, type: doc.type, data: doc.data,
                    created_at: known?.createdAt ?? new Date().toISOString(), public_token: doc.publicToken ?? known?.public_token ?? null,
                }, true);
                primeDocumentCache(savedForm);
                setForms(prev => mergeDocuments(prev.filter(f => f.id !== savedForm.id), [savedForm]));
                dbApi.put('documents', { ...savedForm, id: `full:${savedForm.id}`, docId: savedForm.id }).catch(() => undefined);
                if (doc.created) bumpDocUsage(doc.jobId);
                const touchesStock = doc.type === FormType.MaterialLog ? Boolean((doc.data as any)?.deductInventory) : [FormType.Invoice, FormType.Estimate].includes(doc.type as FormType);
                if (touchesStock) loadInventory(uid).catch(() => undefined);
            },
        };
    };

    outboxReportRef.current = (report, trigger) => {
        if (report.synced.length) refreshUsage();
        if (trigger === 'save') return; // the form's own save shows the outcome
        const n = report.synced.length;
        const noun = (k: number) => (report.synced.every(s => s.entity === 'document') ? (k === 1 ? 'document' : 'documents') : (k === 1 ? 'change' : 'changes'));
        if (n && !report.refused.length) toast.success(`${n} ${noun(n)} saved offline ${n === 1 ? 'is' : 'are'} now on your account.`);
        if (report.refused.length) {
            const first = report.refused[0];
            toast.error(`${report.refused.length} ${report.refused.length === 1 ? 'item' : 'items'} couldn't sync: ${first.message}`, {
                duration: 10000, action: { label: 'View', onClick: () => setOutboxOpen(true) },
            });
        }
        const conflict = report.notices.find(e => e.reason === 'conflict');
        if (conflict) toast.info(`${conflict.title}: changed on another device — your offline version was saved.`, { duration: 10000, action: { label: 'View', onClick: () => setOutboxOpen(true) } });
    };

    /** "Open" in the outbox panel: the document form (it opens from the outbox, online or not). */
    const openOutboxDocument = (item: OutboxItem) => {
        setOutboxOpen(false);
        if (entityOf(item) === 'job') { navigate(`/jobs/${item.docId}`); return; }
        if (entityOf(item) === 'client') { navigate('/clients'); return; }
        if (entityOf(item) === 'job_photo') { navigate(`/jobs/${item.jobId}#photos`); return; }
        if (entityOf(item) === 'profile') { navigate('/settings'); return; }
        if (entityOf(item) === 'reminder_settings') { navigate('/settings#reminders'); return; }
        if (entityOf(item) === 'inventory' || entityOf(item) === 'stock_move') { navigate('/inventory'); return; }
        if (entityOf(item) === 'price_item') { navigate('/pricebook'); return; }
        navigate(`/jobs/${item.jobId}/forms/${encodeURIComponent(item.type)}/${item.docId}`, { state: { fromJob: false } });
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
        savedItems,
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

    // ── Request-a-quote (NEXT_STEPS 0c #5): a converted request's job and client join the lists; "Draft estimate
    //    with AI" opens the job, then sends the request text + photos to the job's assistant as one message (the
    //    assistant only proposes a draft estimate; nothing is saved until the contractor opens and saves it).
    const aiHandoffRef = useRef<EstimateHandoff | null>(null);
    const [aiHandoffTick, setAiHandoffTick] = useState(0);
    useEffect(() => {
        const h = aiHandoffRef.current;
        if (!h || !ai.isOpen || ai.mode !== 'job' || ai.job?.id !== h.jobId) return;
        aiHandoffRef.current = null;
        void ai.send(h.prompt, { images: h.images });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ai.isOpen, ai.mode, ai.job?.id, aiHandoffTick]);

    const handleRequestConverted = (res: ConvertResult) => {
        const created = mapJobRow(res.job);
        setJobs(prev => [created, ...prev.filter(j => j.id !== created.id)]);
        const uid = sessionUserIdRef.current;
        if (uid) loadClients(uid).catch(() => undefined);
        refreshUsage();
    };

    const handleDraftEstimate = (h: EstimateHandoff) => {
        aiHandoffRef.current = h;
        navigate(`/jobs/${h.jobId}`);
        ai.openForJob({ id: h.jobId } as Job); // the hook keeps only the id; the job itself comes from `jobs`
        setAiHandoffTick(n => n + 1);
    };

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
            paymentsSlot={(
                <Suspense fallback={null}>
                    <PaymentReportsCard refreshKey={forms} jobNameById={new Map(jobs.map(j => [j.id, j.name]))} onOpen={openDocument} onMarkPaid={setMarkPaidDoc} />
                </Suspense>
            )}
            requestsSlot={(
                <Suspense fallback={null}>
                    <RequestsInbox
                        plan={plan}
                        companyName={profile?.companyName || profile?.name}
                        logoUrl={profile?.logoUrl}
                        phone={profile?.phone}
                        checkJobLimit={() => checkLimit('jobs')}
                        onConverted={handleRequestConverted}
                        onOpenJob={(jobId) => setView({ screen: 'jobDetails', jobId })}
                        onUpgrade={openUpgrade}
                        onDraftEstimate={handleDraftEstimate}
                    />
                </Suspense>
            )}
            pipelineSlot={(
                <Suspense fallback={null}>
                    <PipelineStrip jobs={jobs} refreshKey={forms} onOpen={() => navigate('/pipeline')} />
                </Suspense>
            )}
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
                canCreateOffline
                t={t}
                aiButton={renderJobAIButton(job)}
                aiModal={renderJobAIModal(job)}
                onBack={navigateToDashboard}
                onNewDocument={() => navigateToNewDoc(job.id)}
                onOpenDocument={(form) => openDocument(form, true)}
                onDuplicateDocument={handleDuplicateDoc}
                onCopyDocumentToJob={jobs.length > 1 ? (form) => setDocToCopy(form) : undefined}
                onDeleteDocument={(form) => setDocToDelete(form.id)}
                onStatusChange={(status) => handleUpdateJobStatus(job.id, status)}
                onLoadMore={() => loadDocumentsForJob(job.id)}
                onOpenFinancials={() => setShowJobFinancials(true)}
                onBillTimeMaterials={() => setShowBillTimeMaterials(true)}
                onUpgrade={() => openUpgrade(`Free plan: ${effectiveUsage.limits.docs} documents per job each month.`)}
                onMarkPaid={setMarkPaidDoc}
                photosSlot={(
                    <Suspense fallback={<div className="skeleton h-40 w-full" aria-busy="true" />}>
                        <JobPhotos
                            job={job} profile={profile} plan={plan} isOnline={isOnline} onUpgrade={openUpgrade}
                            client={client} clients={clients} uploadImage={handleUploadDocumentImage} onEmailSent={handleEmailSent}
                            onDocumentsChanged={() => { void loadDocumentsForJob(job.id, true); }}
                            offline={jobPhotoOffline ? { ...jobPhotoOffline, jobWaiting: outbox.itemFor(job.id)?.kind === 'create' } : null}
                        />
                    </Suspense>
                )}
                crewSlot={crewFeature === 'ready' ? (
                    <Suspense fallback={<div className="skeleton h-40 w-full" aria-busy="true" />}>
                        <JobCrewPanel
                            job={job} jobs={jobs} profile={profile} plan={plan} isOnline={isOnline} onUpgrade={openUpgrade}
                            onOpenCrew={() => navigate('/crew')}
                        />
                    </Suspense>
                ) : undefined}
                punchSlot={punchState.available && session ? (
                    <Suspense fallback={<div className="skeleton h-40 w-full" aria-busy="true" />}>
                        <PunchList
                            job={job} userId={session.user.id} profile={profile} client={client} isOnline={isOnline}
                            outboxItems={outbox.items} onUpgrade={openUpgrade} onProgress={handlePunchProgress}
                            onDocumentsChanged={() => { void loadDocumentsForJob(job.id, true); }}
                        />
                    </Suspense>
                ) : undefined}
                punchLabel={(() => { const p = punchState.map.get(job.id); return p && p.total ? `${p.closed}/${p.total}` : undefined; })()}
                toolsSlot={(
                    <button type="button" onClick={() => (isOnline ? setLienWaiverJobId(job.id) : toast.error(NEEDS_CONNECTION))} className="btn btn-outline h-10" title="Lien waiver from this job's invoice and payment">
                        <FileTextIcon className="h-4 w-4" /> <span className="hidden sm:inline">Lien waiver</span><span className="sm:hidden">Waiver</span>
                    </button>
                )}
                papersSlot={isOnline ? (
                    <Suspense fallback={null}>
                        <JobPapersStrip jobId={job.id} onOpenPapers={() => navigate('/papers')} />
                    </Suspense>
                ) : undefined}
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
            onUploadImage: handleUploadFormImage,
            prefillData: pf,
            documentId: formId ?? undefined,
            existingNumbers,
        };

        // Offline state of this document: header chip, and why sending / links / payments wait (OfflineContext.tsx)
        const waitingItem = outbox.itemFor(formId);
        const offlineKind: OutboxKind = waitingItem ? waitingItem.kind : formId ? 'edit' : 'create';
        const offlineDoc = {
            online: isOnline,
            pending: outbox.stateOf(formId),
            canSaveOffline: Boolean(waitingItem) || offlineSavePolicy(formType, offlineKind).ok,
            sendBlockedReason: sendBlockedReasonFor(isOnline, Boolean(waitingItem)),
        };
        const body = (() => {
        switch (formType) {
            case FormType.Invoice: return <InvoiceForm key={componentKey} {...common} userProfile={profile} invoice={form?.data as InvoiceData | null} onClose={handleCloseForm} savedItems={savedItems} inventoryItems={inventory} publicToken={publicToken} onPaymentRecorded={handlePaymentRecorded} onUpgrade={openUpgrade} onEmailSent={handleEmailSent} onOpenReceipt={(r) => openDocument(r, true)} onOpenSettings={() => navigate('/settings#payments')} />;
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
            case FormType.PurchaseOrder: return (
                <PurchaseOrderForm
                    key={componentKey}
                    {...common}
                    profile={profile}
                    data={form?.data as PurchaseOrderData | null}
                    onBack={handleCloseForm}
                    savedItems={savedItems}
                    inventoryItems={inventory}
                    plan={plan}
                    onUpgrade={openUpgrade}
                    onInventoryChanged={() => { const uid = sessionUserIdRef.current; if (uid) loadInventory(uid).catch(() => undefined); }}
                    onDocumentUpdated={(doc) => handleSupplierDocuments([doc])}
                />
            );
            default: return renderNotFoundJob();
        }
        })();
        return (
            <OfflineDocContext.Provider value={offlineDoc}>
                <DocSlotContext.Provider value={() => ensureDocSlot(job.id)}>{body}</DocSlotContext.Provider>
            </OfflineDocContext.Provider>
        );
    };

    const renderAuth = () => {
        if (view.screen !== 'auth') return null;
        switch (view.authScreen) {
            case 'signup':
                return <Signup onSignup={handleSignup} onLoginWithGoogle={handleLoginWithGoogle} onSwitchToLogin={() => navigate({ pathname: '/auth/login', search: intentSearch(readIntent()) }, { replace: true })} />;
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
                return <Login onLogin={handleLogin} onLoginWithGoogle={handleLoginWithGoogle} onSwitchToSignup={() => navigate({ pathname: '/auth/signup', search: intentSearch(readIntent()) }, { replace: true })} onResetPassword={handleResetPassword} />;
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
                        offlineTypes={isOnline ? undefined : OFFLINE_CREATE_TYPES}
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
                        initialSection={location.hash === '#billing' ? 'billing' : location.hash === '#payments' ? 'payments' : location.hash === '#data' ? 'data' : undefined}
                        syncState={session?.user?.id ? outbox.stateOf(session.user.id) : null}
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
                    plan={plan}
                    savedItems={savedItems}
                    onDocumentsCreated={(docs) => handleSupplierDocuments(docs, true)}
                    onOpenDocument={(doc) => openDocument(doc)}
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
            case 'crew':
                return <CrewView
                    userId={session?.user?.id || ''}
                    jobs={jobs}
                    profile={profile}
                    plan={plan}
                    isOnline={isOnline}
                    feature={crewFeature}
                    onBack={() => (canGoBack() ? navigate(-1) : navigateToDashboard())}
                    onUpgrade={openUpgrade}
                    onOpenJob={(jobId) => setView({ screen: 'jobDetails', jobId })}
                    onTimeSheetsSaved={(docs) => { handleSupplierDocuments(docs, true); docs.forEach(d => bumpDocUsage(d.jobId)); }}
                    onOpenTimeSheet={(jobId, docId) => setView({ screen: 'form', formType: FormType.TimeSheet, jobId, formId: docId })}
                />;
            case 'pipeline':
                return <PipelineView
                    jobs={jobs}
                    clients={clients}
                    profile={profile}
                    plan={plan}
                    isOnline={isOnline}
                    refreshKey={forms}
                    onBack={() => (canGoBack() ? navigate(-1) : navigateToDashboard())}
                    onNewJob={() => navigateToCreateJob('dashboard')}
                    onOpenJob={(jobId) => setView({ screen: 'jobDetails', jobId })}
                    onOpenDocument={(form) => openDocument(form, true)}
                    onMarkPaid={setMarkPaidDoc}
                    onJobStatusChange={handleUpdateJobStatus}
                    checkJobLimit={() => checkLimit('jobs')}
                    onRequestConverted={handleRequestConverted}
                    onUpgrade={openUpgrade}
                    onDraftEstimate={handleDraftEstimate}
                    punchProgress={punchState.available ? punchState.map : undefined}
                />;
            case 'papers':
                return <PapersView
                    userId={session.user.id}
                    profile={profile}
                    plan={plan}
                    jobs={jobs}
                    clients={clients}
                    isOnline={isOnline}
                    onBack={() => (canGoBack() ? navigate(-1) : navigateToDashboard())}
                    onUpgrade={openUpgrade}
                    onOpenJob={(jobId) => setView({ screen: 'jobDetails', jobId })}
                    onEmailSent={handleEmailSent}
                    onWaiverCreated={(form) => handleWaiverCreated(form, form.jobId)}
                />;
            case 'servicePlans':
                return <ServicePlansView
                    userId={session.user.id}
                    profile={profile}
                    plan={plan}
                    clients={clients}
                    jobs={jobs}
                    isOnline={isOnline}
                    existingInvoiceNumbers={forms.filter(f => f.type === FormType.Invoice).map(f => String((f.data as any)?.invoiceNumber || '')).filter(Boolean)}
                    onBack={() => (canGoBack() ? navigate(-1) : navigateToDashboard())}
                    onUpgrade={openUpgrade}
                    onOpenJob={(jobId) => setView({ screen: 'jobDetails', jobId })}
                    onOpenDocument={(formId, jobId, formType) => setView({ screen: 'form', formId, jobId, formType: formType as FormType })}
                    onDataChanged={({ invoice, jobId }) => {
                        const uid = sessionUserIdRef.current;
                        if (uid) void loadJobs(uid).catch(() => undefined);
                        if (invoice) setForms(prev => mergeDocuments(prev.filter(f => f.id !== invoice.id), [invoice]));
                        if (jobId) void loadDocumentsForJob(jobId, true);
                    }}
                />;
            case 'help':
                return <HelpCenter onBack={() => (canGoBack() ? navigate(-1) : navigateToDashboard())} />;
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

    const outboxStatus = useMemo(() => ({ stateOf: (docId: string) => outbox.stateOf(docId) }), [outbox.stateOf]);
    const jobNameById = useMemo(() => new Map(jobs.map(j => [j.id, j.name])), [jobs]);

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
                    crewEnabled={crewFeature === 'ready'}
                />
            )}
            {showNav && (
                // offline state, documents waiting to sync, "changed on another device" (replaces the offline banner)
                <SyncStatusBar
                    online={isOnline}
                    usingCachedData={usingCachedData}
                    items={outbox.items}
                    notices={outbox.notices}
                    syncing={outbox.syncing}
                    onSyncNow={() => { void outbox.sync({ trigger: 'manual', includeBlocked: true }); }}
                    onOpen={() => setOutboxOpen(true)}
                    onDismissNotices={() => { void outbox.dismiss(); }}
                />
            )}
            {/* phones: "Add ContractorDocs to your home screen" (2nd visit or after a saved document; dismissible) */}
            {showNav && session?.user && <InstallAppBanner aboveTabBar={showTabBar} />}
            {showNav && upgradeBanner && session?.user && !paid && (
                <FinishUpgradeBanner
                    planName={PLANS[upgradeBanner.plan].name}
                    period={upgradeBanner.period}
                    busy={intentCheckoutBusy}
                    onUpgrade={() => { void launchIntentCheckout(upgradeBanner, session.user.id); }}
                    onDismiss={() => setUpgradeBanner(null)}
                />
            )}

            <main className={`overflow-x-clip ${showTabBar ? 'pb-24 md:pb-0' : ''}`}>
                <ErrorBoundary resetKey={location.pathname} onHome={() => navigate('/dashboard')}>
                    <Suspense fallback={view.screen === 'auth' || !session ? <AppSplash /> : <PageSkeleton />}>
                        <OutboxStatusContext.Provider value={outboxStatus}>
                            {renderContent()}
                        </OutboxStatusContext.Provider>
                    </Suspense>
                </ErrorBoundary>
            </main>

            <OutboxPanel
                open={outboxOpen && Boolean(session)}
                onClose={() => setOutboxOpen(false)}
                online={isOnline}
                items={outbox.items}
                history={outbox.history}
                syncing={outbox.syncing}
                syncingDocId={outbox.syncingDocId}
                storeKind={outbox.storeKind}
                jobNameById={jobNameById}
                onSyncNow={() => { void outbox.sync({ trigger: 'manual', includeBlocked: true }); }}
                onOpenDocument={openOutboxDocument}
                onDiscard={outbox.discard}
                onRestore={async (id) => { await outbox.restore(id); if (navigator.onLine) void outbox.sync({ trigger: 'manual' }); }}
                onRemoveHistory={outbox.removeHistory}
                onDismiss={(id) => outbox.dismiss(id)}
                onUpgrade={(reason) => { setOutboxOpen(false); openUpgrade(reason); }}
            />

            <LogoutGuardDialog
                open={Boolean(logoutGuard)}
                count={logoutGuard?.count ?? 0}
                online={isOnline}
                problem={logoutGuard?.problem ?? null}
                onSyncFirst={handleLogoutSyncFirst}
                onLogoutAnyway={performLogout}
                onCancel={() => setLogoutGuard(null)}
            />

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

            <CopyToJobModal
                form={docToCopy}
                jobs={jobs}
                lastActivity={copyPickerActivity}
                onClose={() => setDocToCopy(null)}
                onCopy={(target) => docToCopy ? handleCopyDocToJob(docToCopy, target as AppJob) : undefined}
            />

            <DuplicateJobModal
                isOpen={showDuplicateJobModal}
                onClose={() => { setShowDuplicateJobModal(false); setJobToDuplicate(null); }}
                onDuplicate={handleDuplicateJob}
                job={jobToDuplicate}
                forms={duplicateCandidateForms}
                clients={clients}
                loadingDocuments={Boolean(jobToDuplicate && duplicateDocsReadyFor !== jobToDuplicate.id)}
                copyLimit={paid ? null : effectiveUsage.limits.docs}
            />

            {showJobFinancials && viewJob && (
                <Suspense fallback={null}>
                    <JobFinancialsModal
                        job={viewJob}
                        defaultLaborRate={profile?.defaultLaborRate}
                        savedItems={savedItems}
                        onBillTimeMaterials={() => { setShowJobFinancials(false); setShowBillTimeMaterials(true); }}
                        onClose={() => setShowJobFinancials(false)}
                    />
                </Suspense>
            )}

            {lienWaiverJobId && session && profile && (
                <Suspense fallback={null}>
                    <LienWaiverModal
                        userId={session.user.id}
                        profile={profile}
                        jobs={jobs}
                        clients={clients}
                        jobId={lienWaiverJobId}
                        isOnline={isOnline}
                        onClose={() => setLienWaiverJobId(null)}
                        onCreated={(form) => { const jobId = lienWaiverJobId; setLienWaiverJobId(null); handleWaiverCreated(form, jobId); }}
                    />
                </Suspense>
            )}

            {showBillTimeMaterials && viewJob && session && (
                <Suspense fallback={null}>
                    <BillTimeMaterialsModal
                        job={viewJob}
                        userId={session.user.id}
                        profile={profile}
                        savedItems={savedItems}
                        inventory={inventory}
                        isOnline={isOnline}
                        ensureDocSlot={() => ensureDocSlot(viewJob.id)}
                        onUpgrade={openUpgrade}
                        knownInvoiceNumbers={forms.filter(f => f.type === FormType.Invoice).map(f => String((f.data as any)?.invoiceNumber || '')).filter(Boolean)}
                        onClose={() => setShowBillTimeMaterials(false)}
                        onCreated={handleTimeMaterialsBilled}
                    />
                </Suspense>
            )}

            {/* "Mark as paid" from the job page menu or the dashboard (the invoice form opens its own) */}
            {markPaidDoc && profile && (
                <Suspense fallback={null}>
                    <MarkPaidDialog
                        invoice={markPaidDoc}
                        onClose={() => setMarkPaidDoc(null)}
                        onRecorded={handlePaymentRecorded}
                        profile={profile}
                        job={jobs.find(j => j.id === markPaidDoc.jobId) || null}
                        clients={clients}
                        clientId={jobs.find(j => j.id === markPaidDoc.jobId)?.clientId ?? null}
                        onUpgrade={openUpgrade}
                        onEmailSent={handleEmailSent}
                        onOpenReceipt={(r) => openDocument(r, true)}
                        onOpenSettings={() => navigate('/settings#payments')}
                    />
                </Suspense>
            )}

            {/* First-run app tour (once per account; replay from Help & tutorials) */}
            {showNav && session && (
                <Suspense fallback={null}>
                    <TourHost userId={session.user.id} onDashboard={view.screen === 'dashboard'} />
                </Suspense>
            )}

            {/* "Export everything" keeps running while the user works elsewhere (Settings → Your data) */}
            {showNav && session && (
                <Suspense fallback={null}>
                    <ExportProgressDock userId={session.user.id} />
                </Suspense>
            )}

            {/* Notifications: reads + read state for the bell in the app bar (client activity, stock, community…) */}
            {session && profileStatus === 'ready' && !portalKey && !approvalToken && (
                <Suspense fallback={null}>
                    <NotificationCenter
                        userId={session.user.id}
                        online={isOnline}
                        forms={forms}
                        jobs={jobs}
                        inventory={inventory}
                        usage={usage}
                        docUsage={docUsage}
                        outboxItems={outbox.items}
                        navigate={navigate}
                        openOutbox={() => setOutboxOpen(true)}
                        onForumUnread={setNotificationCount}
                    />
                </Suspense>
            )}

            <Toaster />
        </div>
    );
};

export default App;
