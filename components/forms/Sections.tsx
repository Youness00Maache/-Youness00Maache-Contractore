import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import type { Client, FormType, Job, UserProfile, AIVisualData, DocumentDesignOptions } from '../../types.ts';
import { cn } from '../../lib/utils.ts';
import { BriefcaseIcon, UserIcon, PaletteIcon, PenIcon, SparklesIcon, GlobeIcon, CopyIcon, CheckIcon, CheckCircleIcon, UploadImageIcon, TrashIcon } from '../Icons.tsx';
import TemplateSelector from '../TemplateSelector.tsx';
import SignaturePad from '../SignaturePad.tsx';
import { AIVisualDisplay } from '../AIVisualComponents.tsx';
import { assertUsableImage, compressImage, describeImageError, fileToDataUrl } from '../../utils/imageCompression.ts';
import { FormSection, FieldGrid, SelectField, TextField } from './Fields.tsx';
import { Spinner } from './Spinner.tsx';
import { DEFAULT_TEMPLATE_ID, DEFAULT_THEME } from './useDocumentForm.ts';
import { approvalUrl, copyToClipboard, ensureApprovalToken } from '../../utils/clientLinks.ts';
import { designDefaultFromDocument, designPlan } from '../../lib/designAccess.ts';
import { currentDesignDefault, saveDesignDefault } from '../../lib/designDefaults.ts';

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------
export const LogoField: React.FC<{
    value?: string | null;
    onChange: (url: string) => void;
    onUploadImage?: (file: File) => Promise<string>;
    label?: string;
    hint?: string;
}> = ({ value, onChange, onUploadImage, label = 'Logo', hint = 'PNG with a transparent background looks best. Max 25 MB.' }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const handleFile = async (file?: File | null) => {
        if (!file) return;
        setError('');
        setBusy(true);
        try {
            assertUsableImage(file);
            const compressed = await compressImage(file);
            const url = onUploadImage ? await onUploadImage(compressed) : await fileToDataUrl(compressed);
            if (!url) throw new Error('The upload did not complete. Check your connection and try again.');
            onChange(url);
        } catch (e) {
            setError(describeImageError(e));
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div>
            <span className="label">{label}</span>
            <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white dark:bg-zinc-100">
                    {value ? <img src={value} alt="Logo preview" className="h-full w-full object-contain p-1.5" /> : <UploadImageIcon className="h-6 w-6 text-zinc-400" />}
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => inputRef.current?.click()} disabled={busy}>
                        {busy ? <><Spinner /> Uploading…</> : value ? 'Change logo' : 'Upload logo'}
                    </button>
                    {value && !busy && (
                        <button type="button" className="btn btn-ghost btn-sm min-h-[40px] text-destructive hover:bg-destructive/10" onClick={() => onChange('')}>
                            <TrashIcon className="h-3.5 w-3.5" /> Remove
                        </button>
                    )}
                </div>
                <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
            </div>
            {error ? <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p> : <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Your company
// ---------------------------------------------------------------------------
export interface CompanyFieldsData {
    companyName?: string;
    companyAddress?: string;
    companyPhone?: string;
    companyWebsite?: string;
    logoUrl?: string;
}

export const CompanySection: React.FC<{
    data: CompanyFieldsData;
    onChange: (patch: CompanyFieldsData) => void;
    onUploadImage?: (file: File) => Promise<string>;
    showContact?: boolean;
    title?: string;
}> = ({ data, onChange, onUploadImage, showContact = true, title = 'Your company' }) => (
    <FormSection title={title} description="Shown in the document header. Defaults come from your profile." icon={BriefcaseIcon}>
        <FieldGrid>
            <TextField label="Company name" value={data.companyName} onChange={v => onChange({ companyName: v })} autoComplete="organization" />
            <TextField label="Address" value={data.companyAddress} onChange={v => onChange({ companyAddress: v })} autoComplete="street-address" />
            {showContact && <TextField label="Phone" type="tel" value={data.companyPhone} onChange={v => onChange({ companyPhone: v })} autoComplete="tel" />}
            {showContact && <TextField label="Website" value={data.companyWebsite} onChange={v => onChange({ companyWebsite: v })} placeholder="www.example.com" />}
        </FieldGrid>
        <LogoField value={data.logoUrl} onChange={url => onChange({ logoUrl: url })} onUploadImage={onUploadImage} hint="Upload a logo for this document only. Your profile logo is used by default." />
    </FormSection>
);

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
const JOB_CLIENT = '__job__';
const norm = (s?: string | null) => (s || '').trim().toLowerCase();

export const ClientSection: React.FC<{
    clients?: Client[];
    job?: Job;
    clientId?: string;
    clientName?: string;
    address?: string;
    /** key written when a saved client is picked (null hides the address input) */
    addressKey?: string | null;
    addressLabel?: string;
    onChange: (patch: Record<string, unknown>) => void;
    title?: string;
    description?: string;
    nameLabel?: string;
    children?: React.ReactNode;
}> = ({
    clients = [], job, clientId, clientName, address, addressKey = 'clientAddress', addressLabel = 'Client address', onChange,
    title = 'Client', description = 'Who this document is for.', nameLabel = 'Client name', children,
}) => {
    const jobClientListed = !job?.clientName || clients.some(c => norm(c.name) === norm(job.clientName));
    const selected = useMemo(() => {
        if (clientId && clients.some(c => c.id === clientId)) return clientId;
        const byName = clients.find(c => norm(c.name) && norm(c.name) === norm(clientName));
        if (byName) return byName.id;
        if (!jobClientListed && job && norm(job.clientName) === norm(clientName)) return JOB_CLIENT;
        return '';
    }, [clientId, clientName, clients, job, jobClientListed]);

    const options = [
        ...(!jobClientListed && job?.clientName ? [{ value: JOB_CLIENT, label: `${job.clientName} (this job)` }] : []),
        ...clients.map(c => ({ value: c.id, label: c.name })),
    ];

    const pick = (value: string) => {
        if (value === JOB_CLIENT && job) {
            onChange({ clientId: undefined, clientName: job.clientName || '', ...(addressKey ? { [addressKey]: job.clientAddress || address || '' } : {}) });
            return;
        }
        const client = clients.find(c => c.id === value);
        if (!client) return;
        onChange({ clientId: client.id, clientName: client.name, ...(addressKey ? { [addressKey]: client.address || address || '' } : {}) });
    };

    return (
        <FormSection title={title} description={description} icon={UserIcon}>
            <FieldGrid>
                {options.length > 0 && (
                    <SelectField label="Saved client" value={selected} placeholder="Type a new client below…" options={options} onChange={pick} fieldClassName="sm:col-span-2" />
                )}
                <TextField
                    label={nameLabel}
                    value={clientName}
                    onChange={v => {
                        const linked = clients.find(c => c.id === clientId);
                        onChange({ clientName: v, clientId: linked && norm(linked.name) === norm(v) ? clientId : undefined });
                    }}
                    autoComplete="off"
                />
                {addressKey && <TextField label={addressLabel} value={address} onChange={v => onChange({ [addressKey]: v })} autoComplete="off" />}
                {children}
            </FieldGrid>
        </FormSection>
    );
};

// ---------------------------------------------------------------------------
// Design (template + colors)
// ---------------------------------------------------------------------------
/** The document being edited (same shape as FormShell's `preview` prop). */
export interface DocumentDesignContextValue {
    formType: FormType | string;
    data?: unknown;
    profile?: Partial<UserProfile> | null;
    job?: Partial<Job> | null;
}

/**
 * Lets the design picker know which document it belongs to without every form passing props:
 * FormShell wraps its children in <DocumentDesignContext.Provider value={preview}>.
 */
export const DocumentDesignContext = createContext<DocumentDesignContextValue | null>(null);

export const TemplateSection: React.FC<{
    templateId?: string;
    themeColors?: { primary: string; secondary: string };
    onChange: (patch: { templateId?: string; themeColors?: { primary: string; secondary: string }; designOptions?: DocumentDesignOptions }) => void;
    /** Document type of the form; falls back to DocumentDesignContext, then Invoice. */
    documentType?: FormType | string;
    /** The form's current data (the full-size preview shows it instead of sample data). */
    data?: unknown;
    profile?: Partial<UserProfile> | null;
    job?: Partial<Job> | null;
}> = ({ templateId, themeColors, onChange, documentType, data, profile, job }) => {
    const ctx = useContext(DocumentDesignContext);
    const type = documentType ?? ctx?.formType;
    const doc = (data ?? ctx?.data) as Record<string, any> | null | undefined;
    const who = (profile ?? ctx?.profile ?? null) as (Partial<UserProfile> & { plan?: string }) | null;
    const plan = who?.plan ?? designPlan();
    // the design the document opened with: a Free user may keep it even when it is Premium (lib/designAccess.ts)
    const baseline = useRef(templateId || DEFAULT_TEMPLATE_ID).current;
    const [defaultId, setDefaultId] = useState(() => currentDesignDefault()?.templateId ?? DEFAULT_TEMPLATE_ID);
    const makeDefault = async () => {
        const value = designDefaultFromDocument({ ...(doc || {}), templateId: templateId || DEFAULT_TEMPLATE_ID, themeColors });
        const r = await saveDesignDefault(value, plan);
        if (r === 'locked') return 'Premium designs need the Premium plan.';
        if (r === 'failed') return 'Could not save the default. Try again.';
        setDefaultId(value?.templateId ?? DEFAULT_TEMPLATE_ID);
        return r === 'account' ? 'Saved: new documents will use this design.' : 'Saved on this device: new documents will use this design.';
    };
    return (
        <FormSection title="Design" description="Pick a design for the PDF, then its colors and layout." icon={PaletteIcon}>
            <TemplateSelector
                selectedTemplateId={templateId || DEFAULT_TEMPLATE_ID}
                onSelectTemplate={id => onChange({ templateId: id })}
                themeColors={themeColors || DEFAULT_THEME}
                onColorsChange={colors => onChange({ themeColors: colors })}
                documentType={type}
                previewData={doc && typeof doc === 'object' ? doc : null}
                profile={who}
                job={job ?? ctx?.job ?? null}
                plan={plan}
                baselineTemplateId={baseline}
                designOptions={doc && typeof doc === 'object' ? (doc.designOptions as DocumentDesignOptions | undefined) ?? null : null}
                onDesignOptionsChange={o => onChange({ designOptions: o ?? undefined })}
                defaultTemplateId={defaultId}
                onMakeDefault={makeDefault}
            />
        </FormSection>
    );
};

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------
export const SignatureSection: React.FC<{
    value?: string;
    onChange: (url: string) => void;
    profile: UserProfile;
    title?: string;
    description?: string;
}> = ({ value, onChange, profile, title = 'Your signature', description = 'Optional. Draw with a finger, stylus or mouse.' }) => (
    <FormSection title={title} description={description} icon={PenIcon}>
        <SignaturePad initialDataUrl={value || ''} onSave={onChange} defaultSignatureKey={profile?.id} defaultSignatureUrl={(profile as { defaultSignatureUrl?: string } | undefined)?.defaultSignatureUrl} />
    </FormSection>
);

// ---------------------------------------------------------------------------
// AI visuals
// ---------------------------------------------------------------------------
export const AIInsightsSection: React.FC<{ data?: AIVisualData; onRemove: () => void }> = ({ data, onRemove }) => {
    const hasContent = !!data && Boolean(data.metrics?.length || data.chart_data?.length || typeof data.progress_percentage === 'number' || data.widgets?.length);
    if (!hasContent) return null;
    return (
        <FormSection
            title="AI insights"
            description="Metrics and charts added by the AI assistant."
            icon={SparklesIcon}
            actions={<button type="button" className="btn btn-ghost btn-sm text-destructive hover:bg-destructive/10" onClick={onRemove}><TrashIcon className="h-3.5 w-3.5" /> Remove</button>}
        >
            <div className="overflow-hidden rounded-xl border border-border bg-background p-4">
                <AIVisualDisplay data={data} />
            </div>
        </FormSection>
    );
};

// ---------------------------------------------------------------------------
// Client approval (Estimate, Change Order)
// Links come from utils/clientLinks.ts (COMMS): expired tokens are reissued, never "save again to get a link".
// ---------------------------------------------------------------------------
export const ApprovalSection: React.FC<{
    docLabel: string;
    /** saved document id; without it there is no link yet */
    documentId?: string;
    /** current share token if the parent already knows it (shown immediately) */
    publicToken?: string | null;
    clientSignatureUrl?: string;
    clientSignedAt?: string;
    clientSignedBy?: string;
    clientName?: string;
}> = ({ docLabel, documentId, publicToken, clientSignatureUrl, clientSignedAt, clientSignedBy, clientName }) => {
    const [link, setLink] = useState(publicToken ? approvalUrl(publicToken) : '');
    const [state, setState] = useState<'idle' | 'working' | 'copied' | 'copy-failed' | 'error'>('idle');
    const [error, setError] = useState('');
    const signedOn = clientSignedAt ? new Date(clientSignedAt) : null;

    const handleCopy = async () => {
        if (!documentId || state === 'working') return;
        setState('working');
        setError('');
        try {
            const token = await ensureApprovalToken(documentId);
            const url = approvalUrl(token);
            setLink(url);
            setState((await copyToClipboard(url)) ? 'copied' : 'copy-failed');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create the approval link.');
            setState('error');
        }
        window.setTimeout(() => setState(s => (s === 'copied' ? 'idle' : s)), 2500);
    };

    return (
        <FormSection title="Client approval" description={`Send a link so the client can review and sign this ${docLabel.toLowerCase()} on their phone.`} icon={GlobeIcon}>
            {clientSignatureUrl ? (
                <div className="rounded-xl border border-success/30 bg-success/10 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-success"><CheckCircleIcon className="h-4 w-4" /> Approved by the client</p>
                    <div className="mt-3 inline-block rounded-lg bg-white p-2 dark:bg-zinc-100">
                        <img src={clientSignatureUrl} alt="Client signature" className="h-16 max-w-[240px] object-contain" />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Signed by {clientSignedBy || clientName || 'the client'}{signedOn && !Number.isNaN(signedOn.getTime()) ? ` on ${signedOn.toLocaleString()}` : ''}.
                    </p>
                </div>
            ) : documentId ? (
                <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                        {link && <input className="input font-mono text-xs" readOnly value={link} onFocus={e => e.currentTarget.select()} aria-label="Approval link" />}
                        <button type="button" className={cn('btn shrink-0', link ? 'btn-outline' : 'btn-primary')} onClick={handleCopy} disabled={state === 'working'}>
                            {state === 'working' ? <><Spinner /> Preparing…</> : state === 'copied' ? <><CheckIcon className="h-4 w-4" /> Copied</> : <><CopyIcon className="h-4 w-4" /> Copy approval link</>}
                        </button>
                    </div>
                    {state === 'copy-failed' && <p className="text-xs text-destructive">Copy isn’t available here. Select the link above and copy it manually.</p>}
                    {state === 'error' && <p className="text-xs text-destructive">{error}</p>}
                    <p className="text-xs text-muted-foreground">The link keeps working (no end date); copying always gives a working link. When the client signs, the status changes automatically.</p>
                </div>
            ) : (
                <p className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                    Save this {docLabel.toLowerCase()} to create its approval link.
                </p>
            )}
        </FormSection>
    );
};

/** Small read-only key/value row used in summary panels. */
export const SummaryRow: React.FC<{ label: React.ReactNode; value: React.ReactNode; strong?: boolean; className?: string }> = ({ label, value, strong, className }) => (
    <div className={cn('flex items-center justify-between gap-4 text-sm', strong && 'text-base font-bold', className)}>
        <span className={strong ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
        <span className="tabular-nums">{value}</span>
    </div>
);
