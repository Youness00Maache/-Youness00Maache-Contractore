import React, { useState } from 'react';
import { FormType, type PurchaseOrderData, type UserProfile, type Job, type Client, type SavedItem, type InventoryItem } from '../types.ts';
import { generatePurchaseOrderPDF } from '../services/pdfGenerator.ts';
import { computeDocumentTotals } from '../utils/money.ts';
import { TruckIcon, FileTextIcon, MapPinIcon, BoxIcon, BriefcaseIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import ShareButton from './forms/ShareButton.tsx';
import AIFillButton from './forms/AIFillButton.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, Segmented, SelectField, TextAreaField, TextField } from './forms/Fields.tsx';
import { CompanySection, SignatureSection, TemplateSection } from './forms/Sections.tsx';
import LineItemsEditor from './forms/LineItemsEditor.tsx';
import TotalsPanel from './forms/TotalsPanel.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { addDaysISO, blankLineItem, isISODate, normalizeLineItems, todayISO } from './forms/formUtils.ts';
import { SHIP_TO_TYPES, STATUS_OPTIONS } from './forms/documentFields.ts';

interface Props {
    job: Job;
    profile: UserProfile;
    data?: PurchaseOrderData | null;
    clients?: Client[];
    savedItems?: SavedItem[];
    inventoryItems?: InventoryItem[];
    onSave: SaveHandler<PurchaseOrderData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
}

/** One address, `name@domain.tld` (same rule as the share window's "To"). */
const VENDOR_EMAIL_RE = /^[^\s@?&,;]+@[^\s@?&,;]+\.[^\s@?&,;]{2,}$/;
const vendorEmailProblem = (value: string | undefined | null): string | null => {
    const v = String(value || '').trim();
    return v && !VENDOR_EMAIL_RE.test(v) ? 'This email doesn’t look right (example: orders@supplier.com).' : null;
};

const PurchaseOrderForm: React.FC<Props> = ({ job, profile, data, clients = [], savedItems = [], inventoryItems = [], onSave, onBack, onUploadImage, prefillData, documentId, existingNumbers }) => {
    const [shareOpen, setShareOpen] = useState(false);
    const [vendorEmailTouched, setVendorEmailTouched] = useState(false);
    const form = useDocumentForm<PurchaseOrderData>({
        formType: FormType.PurchaseOrder,
        initial: data ?? null,
        prefillData,
        onSave,
        existingNumbers,
        download: d => generatePurchaseOrderPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID),
        makeDefaults: () => {
            const date = todayISO();
            return {
                title: '',
                poNumber: '',
                date,
                deliveryDate: addDaysISO(3, date),
                status: 'Draft',
                vendorName: '',
                vendorAddress: '',
                vendorPhone: '',
                vendorEmail: '',
                shipToType: 'Job Site',
                shipToName: job.clientName || job.name || profile.companyName || '',
                shipToAddress: job.clientAddress || '',
                shipToPhone: '',
                deliveryInstructions: '',
                lineItems: [blankLineItem()],
                notes: '',
                companyName: profile.companyName || '',
                companyAddress: profile.address || '',
                companyPhone: profile.phone || '',
                companyWebsite: profile.website || '',
                logoUrl: profile.logoUrl || '',
                signatureUrl: '',
                templateId: DEFAULT_TEMPLATE_ID,
                themeColors: { ...DEFAULT_THEME },
            };
        },
        hydrate: d => backfillCompany({
            ...d,
            lineItems: normalizeLineItems(d.lineItems, false),
            status: d.status || 'Draft',
            shipToType: d.shipToType || 'Job Site',
            vendorEmail: d.vendorEmail ?? '',
            notes: d.notes ?? '',
            deliveryInstructions: d.deliveryInstructions ?? '',
        }, profile),
        validate: d => {
            if (!String(d.poNumber || '').trim()) return 'Add a PO number.';
            // new POs only: an already saved one without a vendor (original app) can still be edited (PARITY_V2 D10)
            if (!data && !String(d.vendorName || '').trim()) return 'Add the vendor (supplier) name.';
            if (!isISODate(d.date)) return 'Add a valid order date.';
            if (d.deliveryDate && isISODate(d.deliveryDate) && d.deliveryDate < d.date) return 'The required-by date is before the order date.';
            if (vendorEmailProblem(d.vendorEmail)) return 'The vendor email doesn’t look right.';
            return null;
        },
    });
    const { data: d, update } = form;
    const totals = computeDocumentTotals({ lineItems: d.lineItems });
    // checked while typing (once the address has an "@" or the box was left), not only on Save (QA 0b.16)
    const emailProblem = vendorEmailProblem(d.vendorEmail);
    const showEmailProblem = Boolean(emailProblem) && (vendorEmailTouched || String(d.vendorEmail || '').includes('@'));

    const setShipTo = (type: string) => {
        if (type === 'Job Site') {
            update({ shipToType: 'Job Site', shipToName: job.clientName || job.name || '', shipToAddress: job.clientAddress || '' });
        } else if (type === 'Company Office') {
            update({ shipToType: 'Company Office', shipToName: d.companyName || profile.companyName || '', shipToAddress: d.companyAddress || profile.address || '', shipToPhone: d.companyPhone || profile.phone || '' });
        } else {
            update({ shipToType: 'Custom' });
        }
    };

    return (
        <FormShell
            title="Purchase order"
            subtitle={[d.poNumber, d.vendorName].filter(Boolean).join(' · ') || 'New purchase order'}
            icon={TruckIcon}
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
            preview={{ formType: FormType.PurchaseOrder, data: d, profile, job }}
            actions={(
                <>
                    <AIFillButton jobId={job.id} formType={FormType.PurchaseOrder} onApply={form.applyDraft} compact />
                    <ShareButton ensureSaved={form.ensureSaved} onOpen={() => setShareOpen(true)} />
                </>
            )}
        >
            <FormSection title="Order details" icon={FileTextIcon}>
                <FieldGrid>
                    <TextField label="PO #" value={d.poNumber} onChange={v => update({ poNumber: v })} />
                    <SelectField label="Status" value={d.status} options={STATUS_OPTIONS.purchaseOrder} onChange={v => update({ status: v as PurchaseOrderData['status'] })} />
                    <DateField label="Order date" value={d.date} onChange={v => update({ date: v })} />
                    <DateField
                        label="Required by"
                        value={d.deliveryDate}
                        onChange={v => update({ deliveryDate: v })}
                        error={d.deliveryDate && d.date && d.deliveryDate < d.date ? 'Before the order date.' : undefined}
                    />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Lumber order – Home Depot" fieldClassName="sm:col-span-2" />
                </FieldGrid>
            </FormSection>

            <FormSection title="Vendor" description="The supplier you’re ordering from." icon={BriefcaseIcon}>
                <FieldGrid>
                    <TextField label="Vendor name" value={d.vendorName} onChange={v => update({ vendorName: v })} placeholder="e.g. Home Depot Pro" />
                    <TextField
                        label="Vendor email"
                        type="email"
                        inputMode="email"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={d.vendorEmail}
                        onChange={v => update({ vendorEmail: v })}
                        onBlur={() => setVendorEmailTouched(true)}
                        placeholder="orders@supplier.com"
                        error={showEmailProblem ? emailProblem : undefined}
                        hint="Used as “To” when you share this order."
                    />
                    <TextField label="Vendor phone" type="tel" value={d.vendorPhone} onChange={v => update({ vendorPhone: v })} />
                    <TextField label="Vendor address" value={d.vendorAddress} onChange={v => update({ vendorAddress: v })} />
                </FieldGrid>
            </FormSection>

            <FormSection
                title="Ship to"
                description="Where the order should be delivered."
                icon={MapPinIcon}
                actions={<Segmented ariaLabel="Ship to" value={d.shipToType} onChange={setShipTo} options={SHIP_TO_TYPES.map(t => ({ value: t, label: t }))} />}
            >
                <FieldGrid>
                    <TextField label="Attention / site name" value={d.shipToName} onChange={v => update({ shipToName: v, shipToType: 'Custom' })} />
                    <TextField label="Site contact phone" type="tel" value={d.shipToPhone} onChange={v => update({ shipToPhone: v })} />
                    <TextField label="Delivery address" value={d.shipToAddress} onChange={v => update({ shipToAddress: v, shipToType: 'Custom' })} fieldClassName="sm:col-span-2" />
                    <TextAreaField label="Delivery instructions" value={d.deliveryInstructions} onChange={v => update({ deliveryInstructions: v })} rows={3} placeholder="Gate code, call on arrival, drop in driveway…" fieldClassName="sm:col-span-2" />
                </FieldGrid>
            </FormSection>

            <FormSection title="Items" description="Products and quantities to order." icon={BoxIcon}>
                <LineItemsEditor
                    items={d.lineItems}
                    onChange={items => update({ lineItems: items })}
                    savedItems={savedItems}
                    inventoryItems={inventoryItems}
                    rateLabel="Unit price"
                    descriptionPlaceholder="Product name or SKU"
                    inventoryPrice="cost"
                />
                <TotalsPanel totals={totals} totalLabel="Order total" />
                <TextAreaField label="Notes to vendor" value={d.notes} onChange={v => update({ notes: v })} rows={3} placeholder="Substitutions allowed? Invoice to…" />
            </FormSection>

            <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} title="Ordered by" />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} title="Authorized signature" />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.PurchaseOrder}
                profile={profile}
                documentId={documentId ?? form.lastSaveResult?.id}
                clients={clients}
                job={job}
                defaultRecipient={emailProblem ? '' : d.vendorEmail}
                recipientName={d.vendorName || 'there'}
                hasUnsavedChanges={form.isDirty}
                onDownload={form.download}
                getPdfDataUri={async () => String(await generatePurchaseOrderPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID, true) || '')}
            />
        </FormShell>
    );
};

export default PurchaseOrderForm;
