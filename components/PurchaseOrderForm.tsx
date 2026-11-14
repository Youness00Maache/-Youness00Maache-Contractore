import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { FormType, type PurchaseOrderData, type UserProfile, type Job, type Client, type SavedItem, type InventoryItem, type FormData as FormDataType } from '../types.ts';
import { generatePurchaseOrderPDF } from '../services/pdfGenerator.ts';
import { computeDocumentTotals, toNumber } from '../utils/money.ts';
import { TruckIcon, FileTextIcon, MapPinIcon, BoxIcon, BriefcaseIcon, ReceiptIcon } from './Icons.tsx';
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
import { SHIP_TO_TYPES } from './forms/documentFields.ts';
import { isPaidTier, normalizeTier, type PlanTier } from '../lib/plans.ts';
import { RECEIPT_KEY, findSupplierByName, supplierToVendor, upsertSupplier, vendorSaveState, vendorToSupplierInput, withAccountNumberNote, type Supplier } from '../lib/suppliers.ts';
import {
    DELIVERIES_KEY, SUPPLIER_INVOICE_FILE_KEY, parseSupplierInvoiceFile, poStatusOptions, statusAfterSupplierInvoice, supplierInvoiceFileProblem,
    withStatusDates,
} from '../lib/poLifecycle.ts';
import type { DeliveryResult, ReceiveResult } from '../lib/suppliersApi.ts';
import { OrderStatusStrip, SaveVendorLine, SavedSupplierPicker } from './suppliers/PurchaseOrderSupplier.tsx';
import { DeliveriesLog, SupplierInvoiceFields, type SupplierInvoicePatch } from './suppliers/PurchaseOrderLifecycle.tsx';
import { syncNote, useSuppliers } from './suppliers/useSuppliers.ts';
import { errorText } from '../lib/offline/connection.ts';
import { listSupplierItems } from '../lib/suppliers/suppliersDb.ts';
import { prefillPoForm } from '../lib/suppliers/libraryView.ts';
// dialogs load when opened
const SuppliersModal = lazy(() => import('./suppliers/SuppliersModal.tsx'));
const ReceiveOrderDialog = lazy(() => import('./suppliers/ReceiveOrderDialog.tsx'));
const RecordDeliveryDialog = lazy(() => import('./suppliers/RecordDeliveryDialog.tsx'));

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
    /** the user's plan: "Send to supplier" is Premium (manual POs and Share stay on every plan) */
    plan?: PlanTier;
    onUpgrade?: (reason?: string) => void;
    /** "Mark received" changed stock (the App refreshes its inventory) */
    onInventoryChanged?: () => void;
    /** the PO was updated outside a form save ("Mark received"): the App refreshes its document list */
    onDocumentUpdated?: (doc: FormDataType) => void;
}

/** One address, `name@domain.tld` (same rule as the share window's "To"). */
const VENDOR_EMAIL_RE = /^[^\s@?&,;]+@[^\s@?&,;]+\.[^\s@?&,;]{2,}$/;
const vendorEmailProblem = (value: string | undefined | null): string | null => {
    const v = String(value || '').trim();
    return v && !VENDOR_EMAIL_RE.test(v) ? 'This email doesn’t look right (example: orders@supplier.com).' : null;
};

const PurchaseOrderForm: React.FC<Props> = ({
    job, profile, data, clients = [], savedItems = [], inventoryItems = [], onSave, onBack, onUploadImage, prefillData, documentId, existingNumbers,
    plan, onUpgrade, onInventoryChanged, onDocumentUpdated,
}) => {
    const [shareOpen, setShareOpen] = useState(false);
    const [vendorEmailTouched, setVendorEmailTouched] = useState(false);
    // supplier ordering (lib/suppliers.ts): saved suppliers, "Send to supplier", "Mark received"
    const { suppliers, persist: persistSuppliers, table: suppliersTable } = useSuppliers();
    const [suppliersOpen, setSuppliersOpen] = useState(false);
    const [supplierMode, setSupplierMode] = useState(false);
    const [vendorNote, setVendorNote] = useState<string | null>(null);
    const [savingVendor, setSavingVendor] = useState(false);
    const [stripBusy, setStripBusy] = useState(false);
    const paid = isPaidTier(normalizeTier(plan || (profile as UserProfile & { plan?: string }).plan || (profile.subscriptionTier === 'Premium' ? 'premium' : 'free')));
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

    // ---- supplier ordering ----
    const savedId = documentId ?? form.lastSaveResult?.id;
    const savedSupplier = findSupplierByName(suppliers, d.vendorName);
    const [receiveOpen, setReceiveOpen] = useState(false);

    // Suppliers table + Premium (roadmap D4): the supplier's catalogue fills the unit, price and SKU of matching lines.
    // Only empty fields are filled, nothing is removed, and every line stays editable. Without the table: nothing happens.
    const catalogueFill = suppliersTable !== null && paid;
    const [fillNote, setFillNote] = useState<string | null>(null);
    const dataRef = useRef(d);
    dataRef.current = d;
    const fillFromCatalogue = async (s: Supplier) => {
        if (!catalogueFill) return;
        try {
            const items = await listSupplierItems({ supplierId: s.id });
            if (!items.length) { setFillNote(null); return; }
            const { lines, filled } = prefillPoForm(dataRef.current.lineItems, items, s.id);
            if (filled > 0) update({ lineItems: lines });
            setFillNote(filled > 0
                ? `${filled} line${filled === 1 ? '' : 's'} filled from ${s.name}’s catalogue (unit, price, SKU). Change anything you like.`
                : `No line matches ${s.name}’s catalogue yet.`);
        } catch {
            setFillNote(null);
        }
    };

    const pickSupplier = (s: Supplier) => {
        update({ ...supplierToVendor(s), notes: withAccountNumberNote(d.notes, s.accountNumber) });
        setVendorEmailTouched(false);
        setVendorNote(null);
        setFillNote(null);
        void fillFromCatalogue(s);
    };

    const saveVendor = async () => {
        const { list, supplier } = upsertSupplier(suppliers, vendorToSupplierInput(d));
        if (!supplier) return;
        setSavingVendor(true);
        try {
            const mode = await persistSuppliers(list);
            setVendorNote(syncNote(mode) || `“${supplier.name}” is in your saved suppliers.`);
        } catch (e) {
            setVendorNote(e instanceof Error ? e.message : 'The supplier could not be saved.');
        } finally {
            setSavingVendor(false);
        }
    };

    /** Premium: the same Share window, addressed to the supplier, with the "Confirm order" link when available. */
    const sendToSupplier = async () => {
        if (!paid) {
            onUpgrade?.('Sending purchase orders to your suppliers from the order is part of Premium. Share still works on every plan.');
            return;
        }
        setStripBusy(true);
        try {
            if (!String(d.vendorEmail || '').trim() && savedSupplier?.email) update({ vendorEmail: savedSupplier.email });
            if ((await form.ensureSaved()) === 'invalid') return;
            setSupplierMode(true);
            setShareOpen(true);
        } finally {
            setStripBusy(false);
        }
    };

    /** Every plan: saves first (the lines on the server are what gets received), then shows what goes into stock. */
    const startReceive = async () => {
        setStripBusy(true);
        try {
            if ((await form.ensureSaved()) === 'saved') setReceiveOpen(true);
        } finally {
            setStripBusy(false);
        }
    };

    // ---- deliveries, supplier invoice, paid (roadmap N2, lib/poLifecycle.ts) ----
    const [deliverOpen, setDeliverOpen] = useState<{ deliveryId?: string } | null>(null);
    const [invoiceNote, setInvoiceNote] = useState<string | null>(null);
    const [fileBusy, setFileBusy] = useState(false);
    const [pendingInvoiceFile, setPendingInvoiceFile] = useState<File | null>(null);

    /** Saves first (the lines on the server are what gets delivered), then opens Record delivery. */
    const startDelivery = async (deliveryId?: string) => {
        setStripBusy(true);
        try {
            if ((await form.ensureSaved()) === 'saved') setDeliverOpen({ deliveryId });
        } finally {
            setStripBusy(false);
        }
    };

    const handleDelivered = (result: DeliveryResult) => {
        setDeliverOpen(null);
        const saved = (result.doc.data || {}) as unknown as Record<string, unknown>;
        if (saved[DELIVERIES_KEY]) {
            // the claim may have given id-less lines an id: the form keeps the saved lines (it was saved just before)
            form.replaceSilently(prev => ({
                ...prev,
                status: (saved.status as PurchaseOrderData['status']) || prev.status,
                [DELIVERIES_KEY]: saved[DELIVERIES_KEY],
                lineItems: Array.isArray(saved.lineItems) ? normalizeLineItems(saved.lineItems, false) : prev.lineItems,
            } as PurchaseOrderData));
        }
        onDocumentUpdated?.(result.doc);
        if (result.added.length) onInventoryChanged?.();
        const n = result.added.length;
        const message = result.saveWarning
            || (result.status === 'already' ? 'This delivery was already recorded. Nothing was added twice.'
                : result.status === 'partial' ? `${n} item${n === 1 ? '' : 's'} added to stock; ${result.failed.length} could not be added. Use Finish delivery to try again.`
                    : `Delivery recorded${n ? `: ${n} item${n === 1 ? '' : 's'} added to stock` : ''}.${result.unmatched.length ? ` ${result.unmatched.length} line${result.unmatched.length === 1 ? ' is' : 's are'} tracked on the order only.` : ''}`);
        form.setFeedback({ tone: result.status === 'partial' || result.saveWarning ? 'error' : 'success', message });
    };

    const hasInvoice = (x: { supplierInvoiceNumber?: unknown; supplierInvoiceAmount?: unknown }) =>
        Boolean(String(x.supplierInvoiceNumber || '').trim()) || toNumber(x.supplierInvoiceAmount) > 0;

    /** The supplier's invoice number / amount "feed" Invoiced: the first time one is entered, the status follows. */
    const changeInvoice = (patch: SupplierInvoicePatch) => {
        update(prev => {
            const next = { ...prev, ...patch } as PurchaseOrderData;
            if (!hasInvoice(prev) && hasInvoice(next)) {
                const status = statusAfterSupplierInvoice(prev.status, next);
                if (status !== prev.status) {
                    setInvoiceNote('Status set to Invoiced.');
                    return { ...next, status: status as PurchaseOrderData['status'] };
                }
            }
            return next;
        });
    };

    const changeStatus = (status: string) => {
        update(prev => withStatusDates(prev as unknown as Record<string, unknown>, status, todayISO()) as unknown as PurchaseOrderData);
    };

    const markPaid = async () => {
        changeStatus('Paid');
        await form.save();
    };

    /** Attach: the order is saved first (the file goes in its folder), then uploaded and the order saved with it. */
    const attachInvoiceFile = async (file: File) => {
        const problem = supplierInvoiceFileProblem(file);
        if (problem) { setInvoiceNote(problem); return; }
        setInvoiceNote(null);
        setFileBusy(true);
        if ((await form.ensureSaved()) !== 'saved') { setFileBusy(false); return; }
        setPendingInvoiceFile(file);
    };

    useEffect(() => {
        if (!pendingInvoiceFile || !savedId) return;
        const file = pendingInvoiceFile;
        setPendingInvoiceFile(null);
        let alive = true;
        (async () => {
            try {
                const api = await import('../lib/suppliersApi.ts');
                const meta = await api.uploadSupplierInvoiceFile(savedId, file);
                const old = parseSupplierInvoiceFile(form.data as unknown as Record<string, unknown>)?.path;
                update(prev => ({ ...prev, [SUPPLIER_INVOICE_FILE_KEY]: meta } as PurchaseOrderData));
                const ok = await form.save();
                if (ok && old && old !== meta.path) void api.removeSupplierInvoiceFile(old);
                if (alive) setInvoiceNote(ok ? 'Invoice attached.' : 'The file is uploaded; save the order to keep it.');
            } catch (e) {
                if (alive) setInvoiceNote(errorText(e, 'The file could not be attached.'));
            } finally {
                if (alive) setFileBusy(false);
            }
        })();
        return () => { alive = false; };
    }, [pendingInvoiceFile, savedId]); // eslint-disable-line react-hooks/exhaustive-deps

    const openInvoiceFile = async (path: string) => {
        // open the tab first (pop-up blockers), then point it at the 1-hour signed link
        const w = window.open('', '_blank');
        try {
            const api = await import('../lib/suppliersApi.ts');
            const url = await api.supplierInvoiceFileUrl(path);
            if (w) { w.opener = null; w.location.href = url; } else window.open(url, '_blank', 'noopener');
        } catch (e) {
            w?.close();
            setInvoiceNote(errorText(e, 'The file could not be opened.'));
        }
    };

    const removeInvoiceFile = async () => {
        const old = parseSupplierInvoiceFile(d as unknown as Record<string, unknown>)?.path;
        update(prev => ({ ...prev, [SUPPLIER_INVOICE_FILE_KEY]: null } as PurchaseOrderData));
        if (await form.save()) {
            if (old) void import('../lib/suppliersApi.ts').then(api => api.removeSupplierInvoiceFile(old));
            setInvoiceNote('Invoice file removed.');
        }
    };

    const handleReceived = (result: ReceiveResult) => {
        setReceiveOpen(false);
        const saved = (result.doc.data || {}) as unknown as Record<string, unknown>;
        if (saved[RECEIPT_KEY]) {
            form.replaceSilently(prev => ({ ...prev, status: (saved.status as PurchaseOrderData['status']) || prev.status, [RECEIPT_KEY]: saved[RECEIPT_KEY] } as PurchaseOrderData));
        }
        onDocumentUpdated?.(result.doc);
        if (result.added.length) onInventoryChanged?.();
        const n = result.added.length;
        const message = result.saveWarning
            || (result.status === 'already' ? 'This order was already received. Nothing was added twice.'
                : result.status === 'partial' ? `${n} item${n === 1 ? '' : 's'} added to stock; ${result.failed.length} could not be added. Use Finish receiving to try again.`
                    : `Received: ${n} item${n === 1 ? '' : 's'} added to stock.${result.unmatched.length ? ` ${result.unmatched.length} line${result.unmatched.length === 1 ? ' is' : 's are'} not in your inventory.` : ''}`);
        form.setFeedback({ tone: result.status === 'partial' || result.saveWarning ? 'error' : 'success', message });
    };

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
            <OrderStatusStrip
                data={d as unknown as Record<string, unknown>}
                paid={paid}
                onSend={sendToSupplier}
                onReceive={startReceive}
                onDeliver={startDelivery}
                onMarkPaid={markPaid}
                today={todayISO()}
                busy={stripBusy || form.saving}
            />

            <FormSection title="Order details" icon={FileTextIcon}>
                <FieldGrid>
                    <TextField label="PO #" value={d.poNumber} onChange={v => update({ poNumber: v })} />
                    <SelectField label="Status" value={d.status} options={poStatusOptions(d.status)} onChange={changeStatus} />
                    <DateField label="Order date" value={d.date} onChange={v => update({ date: v })} />
                    <DateField
                        label="Required by"
                        value={d.deliveryDate}
                        onChange={v => update({ deliveryDate: v })}
                        error={d.deliveryDate && d.date && d.deliveryDate < d.date ? 'Before the order date.' : undefined}
                        hint="Also the expected delivery: a late order is flagged above."
                    />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Lumber order – Home Depot" fieldClassName="sm:col-span-2" />
                </FieldGrid>
            </FormSection>

            <FormSection
                title="Vendor"
                description="The supplier you’re ordering from."
                icon={BriefcaseIcon}
                actions={<SavedSupplierPicker suppliers={suppliers} onPick={pickSupplier} onManage={() => setSuppliersOpen(true)} />}
            >
                <FieldGrid>
                    <TextField label="Vendor name" value={d.vendorName} onChange={v => { update({ vendorName: v }); setVendorNote(null); }} placeholder="e.g. Home Depot Pro" />
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
                <SaveVendorLine state={vendorSaveState(suppliers, d)} busy={savingVendor} note={vendorNote} onSave={saveVendor} />
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
                {catalogueFill && savedSupplier && (
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <button type="button" className="font-semibold text-primary hover:underline" onClick={() => void fillFromCatalogue(savedSupplier)}>Fill unit, price and SKU from {savedSupplier.name}’s catalogue</button>
                        {fillNote && <span role="status">{fillNote}</span>}
                    </p>
                )}
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

            <FormSection
                title="Deliveries & supplier invoice"
                description="What arrived so far, and the supplier’s bill. Not printed on the order."
                icon={ReceiptIcon}
            >
                <DeliveriesLog data={d as unknown as Record<string, unknown>} onFinish={id => startDelivery(id)} busy={stripBusy || form.saving} />
                <SupplierInvoiceFields
                    data={d as unknown as Record<string, unknown>}
                    onChange={changeInvoice}
                    onAttach={attachInvoiceFile}
                    onOpenFile={openInvoiceFile}
                    onRemoveFile={removeInvoiceFile}
                    fileBusy={fileBusy || form.saving}
                    note={invoiceNote}
                />
            </FormSection>

            <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} title="Ordered by" />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} title="Authorized signature" />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            <ShareModal
                isOpen={shareOpen}
                onClose={() => { setShareOpen(false); setSupplierMode(false); }}
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
                supplierConfirm={supplierMode && paid}
            />

            {suppliersOpen && (
                <Suspense fallback={null}>
                    <SuppliersModal open onClose={() => setSuppliersOpen(false)} suppliers={suppliers} onSave={persistSuppliers} table={suppliersTable} paid={paid} onUpgrade={onUpgrade} />
                </Suspense>
            )}
            {receiveOpen && savedId && (
                <Suspense fallback={null}>
                    <ReceiveOrderDialog
                        documentId={savedId}
                        poLabel={[d.poNumber || 'Purchase order', d.vendorName].filter(Boolean).join(' · ')}
                        onClose={() => setReceiveOpen(false)}
                        onReceived={handleReceived}
                    />
                </Suspense>
            )}
            {deliverOpen && savedId && (
                <Suspense fallback={null}>
                    <RecordDeliveryDialog
                        documentId={savedId}
                        deliveryId={deliverOpen.deliveryId}
                        poLabel={[d.poNumber || 'Purchase order', d.vendorName].filter(Boolean).join(' · ')}
                        onClose={() => setDeliverOpen(null)}
                        onRecorded={handleDelivered}
                    />
                </Suspense>
            )}
        </FormShell>
    );
};

export default PurchaseOrderForm;
