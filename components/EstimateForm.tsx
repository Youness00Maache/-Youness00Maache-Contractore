import React, { useMemo, useState } from 'react';
import { FormType, type EstimateData, type UserProfile, type Job, type Client, type SavedItem, type InventoryItem } from '../types.ts';
import { generateEstimatePDF } from '../services/pdfGenerator.ts';
import { computeDocumentCost, computeDocumentTotals, formatMoney, roundMoney } from '../utils/money.ts';
import { EstimateIcon, FileTextIcon, TrendingUpIcon, EyeIcon, EyeOffIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import ShareButton from './forms/ShareButton.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, SelectField, TextAreaField, TextField } from './forms/Fields.tsx';
import { AIInsightsSection, ApprovalSection, ClientSection, CompanySection, SignatureSection, TemplateSection } from './forms/Sections.tsx';
import LineItemsEditor from './forms/LineItemsEditor.tsx';
import TotalsPanel from './forms/TotalsPanel.tsx';
import AIFillButton from './forms/AIFillButton.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { addDaysISO, blankLineItem, isISODate, normalizeLineItems, todayISO } from './forms/formUtils.ts';
import { STATUS_OPTIONS } from './forms/documentFields.ts';
import { makeStockLookup } from './forms/inventory.ts';

interface Props {
    job: Job;
    profile: UserProfile;
    data: EstimateData | null;
    clients?: Client[];
    savedItems?: SavedItem[];
    inventoryItems?: InventoryItem[];
    onSave: SaveHandler<EstimateData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    publicToken?: string | null;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
}

const EstimateForm: React.FC<Props> = ({
    job, profile, data, clients = [], savedItems = [], inventoryItems = [], onSave, onBack, onUploadImage, publicToken, prefillData, documentId, existingNumbers,
}) => {
    const [showCosts, setShowCosts] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const download = (d: EstimateData) => generateEstimatePDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID);
    const stockLookup = useMemo(() => makeStockLookup(inventoryItems, data), [inventoryItems, data]);

    const form = useDocumentForm<EstimateData>({
        formType: FormType.Estimate,
        initial: data,
        prefillData,
        onSave,
        download,
        existingNumbers,
        makeDefaults: () => {
            const issueDate = todayISO();
            return {
                title: '',
                estimateNumber: '',
                issueDate,
                expiryDate: addDaysISO(30, issueDate),
                status: 'Draft',
                lineItems: [{ ...blankLineItem(), unitCost: 0 }],
                notes: '',
                terms: 'This estimate is valid for 30 days. Payment schedule: 50% deposit, 50% upon completion.',
                companyName: profile.companyName || '',
                companyAddress: profile.address || '',
                companyPhone: profile.phone || '',
                companyWebsite: profile.website || '',
                clientName: job.clientName || '',
                clientAddress: job.clientAddress || '',
                logoUrl: profile.logoUrl || '',
                signatureUrl: '',
                templateId: DEFAULT_TEMPLATE_ID,
                themeColors: { ...DEFAULT_THEME },
            };
        },
        hydrate: d => backfillCompany({ ...d, lineItems: normalizeLineItems(d.lineItems, false), notes: d.notes ?? '', terms: d.terms ?? '', status: d.status || 'Draft' }, profile),
        validate: d => {
            if (!String(d.estimateNumber || '').trim()) return 'Add an estimate number.';
            if (!isISODate(d.issueDate)) return 'Add a valid issue date.';
            if (d.expiryDate && isISODate(d.expiryDate) && d.expiryDate < d.issueDate) return 'The expiry date is before the issue date.';
            // Short stock never blocks saving (a payment/approval must always be recordable): the database lets stock
            // go negative and flags it in the inventory history; line rows already show stock warnings.
            return null;
        },
    });
    const { data: d, update } = form;
    const totals = computeDocumentTotals(d);
    const cost = computeDocumentCost(d);
    const profit = roundMoney(totals.subtotal - cost);
    const margin = totals.subtotal > 0 ? (profit / totals.subtotal) * 100 : 0;
    const marginTone = margin >= 30 ? 'text-success' : margin >= 15 ? 'text-warning' : 'text-destructive';
    const token = publicToken ?? form.lastSaveResult?.public_token ?? null;

    return (
        <FormShell
            title="Estimate"
            subtitle={[d.estimateNumber, d.clientName].filter(Boolean).join(' · ') || 'New estimate'}
            icon={EstimateIcon}
            status={d.status}
            aiGenerated={Boolean((d as any).isAiGenerated)}
            isDirty={form.isDirty}
            saving={form.saving}
            downloading={form.downloading}
            justSaved={form.justSaved}
            feedback={form.feedback}
            onDismissFeedback={() => form.setFeedback(null)}
            onBack={onBack}
            onSave={form.save}
            onDownload={form.download}
            onSaveAndDownload={form.saveAndDownload}
            preview={{ formType: FormType.Estimate, data: d, profile, job }}
            actions={(
                <>
                    <AIFillButton jobId={job.id} formType={FormType.Estimate} onApply={form.applyDraft} compact />
                    <ShareButton ensureSaved={form.ensureSaved} onOpen={() => setShareOpen(true)} />
                </>
            )}
        >
            <FormSection title="Estimate details" icon={FileTextIcon}>
                <FieldGrid>
                    <TextField label="Estimate #" value={d.estimateNumber} onChange={v => update({ estimateNumber: v })} />
                    <SelectField label="Status" value={d.status} options={STATUS_OPTIONS.estimate} onChange={v => update({ status: v as EstimateData['status'] })} />
                    <DateField label="Issue date" value={d.issueDate} onChange={v => update({ issueDate: v })} />
                    <DateField
                        label="Valid until"
                        value={d.expiryDate}
                        onChange={v => update({ expiryDate: v })}
                        error={d.expiryDate && d.issueDate && d.expiryDate < d.issueDate ? 'Expiry is before the issue date.' : undefined}
                    />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Kitchen renovation quote" fieldClassName="sm:col-span-2" />
                </FieldGrid>
            </FormSection>

            <ClientSection
                clients={clients}
                job={job}
                clientId={(d as any).clientId}
                clientName={d.clientName}
                address={d.clientAddress}
                onChange={patch => update(patch as Partial<EstimateData>)}
                description="Who this estimate is for."
            />

            <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} />

            <FormSection
                title="Items"
                description="Prices the client will see. Turn on profit tools to track your costs (never printed)."
                icon={TrendingUpIcon}
                actions={(
                    <button type="button" className={`btn btn-sm min-h-[40px] ${showCosts ? 'btn-secondary' : 'btn-outline'}`} onClick={() => setShowCosts(s => !s)} aria-pressed={showCosts}>
                        {showCosts ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />} {showCosts ? 'Hide costs' : 'Profit tools'}
                    </button>
                )}
            >
                <LineItemsEditor
                    items={d.lineItems}
                    onChange={items => update({ lineItems: items })}
                    showCost={showCosts}
                    rateLabel="Price"
                    savedItems={savedItems}
                    inventoryItems={inventoryItems}
                    availableStock={stockLookup}
                />
                {showCosts && (
                    <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-4">
                        <div><p className="label mb-1">Revenue</p><p className="text-lg font-bold tabular-nums">{formatMoney(totals.subtotal)}</p></div>
                        <div><p className="label mb-1">Your cost</p><p className="text-lg font-bold tabular-nums">{formatMoney(cost)}</p></div>
                        <div><p className="label mb-1">Profit</p><p className={`text-lg font-bold tabular-nums ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatMoney(profit)}</p></div>
                        <div><p className="label mb-1">Margin</p><p className={`text-lg font-bold tabular-nums ${marginTone}`}>{margin.toFixed(1)}%</p></div>
                    </div>
                )}
                <TotalsPanel totals={totals} totalLabel="Estimate total" />
            </FormSection>

            <FormSection title="Notes & terms" description="Printed on the estimate.">
                <TextAreaField label="Notes" value={d.notes} onChange={v => update({ notes: v })} rows={3} placeholder="Scope, exclusions, schedule…" />
                <TextAreaField label="Terms & conditions" value={d.terms} onChange={v => update({ terms: v })} rows={4} />
            </FormSection>

            <ApprovalSection
                documentId={documentId ?? form.lastSaveResult?.id}
                docLabel="Estimate"
                publicToken={token}
                clientSignatureUrl={d.clientSignatureUrl}
                clientSignedAt={d.clientSignedAt}
                clientSignedBy={d.clientSignedBy}
                clientName={d.clientName}
            />

            <AIInsightsSection data={d.ai_visual_data} onRemove={() => update({ ai_visual_data: undefined })} />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} description="Your signature authorizes this estimate." />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.Estimate}
                profile={profile}
                documentId={documentId ?? form.lastSaveResult?.id}
                publicToken={token}
                clients={clients}
                job={job}
                hasUnsavedChanges={form.isDirty}
                onDownload={form.download}
                getPdfDataUri={async () => String(await generateEstimatePDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID, true) || '')}
            />
        </FormShell>
    );
};

export default EstimateForm;
