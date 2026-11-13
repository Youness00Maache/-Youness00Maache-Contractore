import React, { useEffect, useRef, useState } from 'react';
import { FormType, type ExpenseLogData, type UserProfile, type Job, type Client, type LineItem } from '../types.ts';
import { generateExpenseLogPDF } from '../services/pdfGenerator.ts';
import { computeDocumentTotals, formatMoney, roundMoney, toNumber } from '../utils/money.ts';
import { ExpenseLogIcon, ScanIcon, FileTextIcon, DollarIcon } from './Icons.tsx';
import { FormShell, Spinner } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField, Toggle } from './forms/Fields.tsx';
import { ClientSection, CompanySection, SignatureSection, SummaryRow, TemplateSection } from './forms/Sections.tsx';
import LineItemsEditor from './forms/LineItemsEditor.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { blankLineItem, formatDisplayDate, isISODate, normalizeLineItems, todayISO } from './forms/formUtils.ts';
import { EXPENSE_CATEGORIES } from './forms/documentFields.ts';
import { processReceiptImage, terminateOCRWorker, type OCRResult } from '../utils/ocr.ts';
import { assertUsableImage, compressImage, describeImageError } from '../utils/imageCompression.ts';

interface Props {
    job: Job;
    profile: UserProfile;
    data: ExpenseLogData | null;
    clients?: Client[];
    onSave: SaveHandler<ExpenseLogData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
}

type ExpenseState = ExpenseLogData & { clientId?: string };

const FUEL = /shell|chevron|exxon|mobil|bp\b|texaco|sunoco|valero|citgo|marathon|speedway|wawa|gas|fuel/i;
const FOOD = /restaurant|cafe|coffee|pizza|grill|diner|burger|subway|mcdonald|starbucks|taco|deli|bakery/i;
const MATERIAL = /depot|lowe|menards|hardware|lumber|supply|ferguson|grainger|sherwin|benjamin moore|electric|plumbing/i;

const itemsSubtotal = (items?: LineItem[]) => computeDocumentTotals({ lineItems: items || [] }).subtotal;
const nearlyEqual = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.01);

/** Legacy expense logs stored `items: [{description, amount}]`; current ones use `lineItems`. */
const legacyItems = (d: ExpenseLogData): LineItem[] => {
    if (Array.isArray(d.lineItems) && d.lineItems.length) return normalizeLineItems(d.lineItems, false);
    if (Array.isArray(d.items) && d.items.length) return normalizeLineItems(d.items.map(i => ({ id: i.id, description: i.description, quantity: 1, rate: i.amount })), false);
    if (d.item) return normalizeLineItems([{ description: d.item, quantity: 1, rate: d.amount }], false);
    return [blankLineItem()];
};

const ExpenseLogForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage, prefillData }) => {
    const uploadRef = useRef<HTMLInputElement>(null);
    const [scanning, setScanning] = useState(false);
    const [scanNote, setScanNote] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
    const [autoTotal, setAutoTotal] = useState<boolean>(() => {
        if (!data) return true;
        const items = legacyItems(data);
        const sub = itemsSubtotal(items);
        return sub === 0 || nearlyEqual(sub + toNumber(data.tax), toNumber(data.amount));
    });

    useEffect(() => () => { void terminateOCRWorker(); }, []);

    const withTotal = (d: ExpenseState): ExpenseState => {
        const sub = itemsSubtotal(d.lineItems);
        return autoTotal && sub > 0 ? { ...d, amount: roundMoney(sub + toNumber(d.tax)) } : d;
    };

    const form = useDocumentForm<ExpenseState>({
        formType: FormType.ExpenseLog,
        initial: data as ExpenseState | null,
        prefillData,
        onSave: onSave as SaveHandler<ExpenseState>,
        download: d => generateExpenseLogPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID),
        makeDefaults: () => ({
            title: '',
            date: todayISO(),
            item: '',
            lineItems: [blankLineItem()],
            vendor: '',
            category: 'Material',
            amount: 0,
            tax: 0,
            notes: '',
            companyName: profile.companyName || '',
            companyAddress: profile.address || '',
            companyPhone: profile.phone || '',
            companyWebsite: profile.website || '',
            clientName: job.clientName || '',
            logoUrl: profile.logoUrl || '',
            signatureUrl: '',
            templateId: DEFAULT_TEMPLATE_ID,
            themeColors: { ...DEFAULT_THEME },
        }),
        hydrate: d => backfillCompany({ ...d, lineItems: legacyItems(d), amount: toNumber(d.amount), tax: toNumber(d.tax), notes: d.notes ?? '', category: d.category || 'Other' }, profile),
        prepare: withTotal,
        validate: d => (isISODate(d.date) ? null : 'Add a valid date.'),
    });
    const { data: d, update } = form;

    // an AI draft with an explicit total that doesn't match its items keeps the given total visible/editable
    useEffect(() => {
        if (!form.draft.version || !form.draft.appliedKeys.includes('amount')) return;
        const s = itemsSubtotal(form.data.lineItems);
        if (s > 0 && !nearlyEqual(s + toNumber(form.data.tax), toNumber(form.data.amount))) setAutoTotal(false);
    }, [form.draft.version]); // eslint-disable-line react-hooks/exhaustive-deps

    const sub = itemsSubtotal(d.lineItems);
    const computedTotal = roundMoney(sub + toNumber(d.tax));
    const usingItems = autoTotal && sub > 0;
    const shownTotal = usingItems ? computedTotal : toNumber(d.amount);

    const applyScan = (r: OCRResult) => {
        const found: string[] = [];
        const items = r.lineItems.map(li => ({
            description: li.quantity > 1 ? `${li.quantity} × ${li.description}` : li.description,
            quantity: 1,
            rate: li.price,
        }));
        const scannedSub = items.reduce((s, i) => s + i.rate, 0);
        const tax = r.tax ?? 0;
        const totalMatches = r.amount !== null && items.length > 0 && nearlyEqual(scannedSub + tax, r.amount);

        update(prev => {
            const next: ExpenseState = { ...prev };
            if (r.vendor) { next.vendor = r.vendor; found.push('vendor'); }
            if (r.date) { next.date = r.date; found.push('date'); }
            if (r.tax !== null) { next.tax = r.tax; found.push('tax'); }
            if (items.length) { next.lineItems = normalizeLineItems(items); found.push(`${items.length} item${items.length === 1 ? '' : 's'}`); }
            if (r.amount !== null) { next.amount = r.amount; found.push('total'); }
            if (r.notes && !prev.notes) next.notes = r.notes;
            // the store's address/phone go in the notes (printed), never in "Your company" (that is the contractor)
            const contact = [r.vendorAddress, r.vendorPhone].filter(Boolean).join(' · ');
            if (contact && !String(next.notes || '').includes(contact)) {
                next.notes = [next.notes, `${r.vendor || 'Vendor'}: ${contact}`].filter(Boolean).join('\n');
                found.push('vendor address');
            }
            // "Bill to / Sold to / Customer" on the receipt fills the client, as in the original app
            if (r.client) {
                const known = clients.find(c => c.name.trim().toLowerCase() === r.client!.trim().toLowerCase());
                next.clientName = known?.name || r.client;
                next.clientId = known?.id;
                found.push('client');
            }
            if (!prev.title && r.vendor) next.title = `${r.vendor} receipt`;
            const vendor = r.vendor || '';
            if (FUEL.test(vendor)) next.category = 'Fuel';
            else if (FOOD.test(vendor)) next.category = 'Food';
            else if (MATERIAL.test(vendor)) next.category = 'Material';
            return next;
        });

        // the scanned total wins unless the scanned items add up to it
        setAutoTotal(r.amount === null ? true : totalMatches);
        if (!found.length) {
            setScanNote({ tone: 'error', text: 'We couldn’t read this receipt. Try a sharper, well-lit photo, or enter the details by hand.' });
        } else if (r.amount !== null && items.length && !totalMatches) {
            setScanNote({ tone: 'warn', text: `Found ${found.join(', ')}. The items add up to ${formatMoney(scannedSub + tax)} but the receipt total is ${formatMoney(r.amount)}; the receipt total is kept. Please check the items.` });
        } else {
            setScanNote({ tone: 'ok', text: `Found ${found.join(', ')}. Scanning isn’t perfect, so please check the details.` });
        }
    };

    const handleScan = async (file?: File | null) => {
        if (!file) return;
        setScanning(true);
        setScanNote(null);
        try {
            assertUsableImage(file);
            const image = await compressImage(file);
            applyScan(await processReceiptImage(image));
        } catch (e) {
            const msg = describeImageError(e);
            setScanNote({ tone: 'error', text: /image|heic|file/i.test(msg) ? msg : 'Receipt scanning isn’t available right now (it needs an internet connection the first time). Enter the details by hand.' });
        } finally {
            setScanning(false);
            if (uploadRef.current) uploadRef.current.value = '';
        }
    };

    return (
        <FormShell
            title="Expense"
            subtitle={[d.vendor, d.date ? formatDisplayDate(d.date) : ''].filter(Boolean).join(' · ') || 'New expense'}
            icon={ExpenseLogIcon}
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
            preview={{ formType: FormType.ExpenseLog, data: withTotal(d), profile, job }}
        >
            <FormSection
                title="Scan a receipt"
                description="Take or upload a photo and we’ll fill in the vendor, date, items, tax, total and the customer printed on it."
                icon={ScanIcon}
                actions={(
                    <button type="button" className="btn btn-primary min-h-[40px]" onClick={() => uploadRef.current?.click()} disabled={scanning}>
                        {scanning ? <><Spinner /> Reading receipt…</> : <><ScanIcon className="h-4 w-4" /> Scan receipt</>}
                    </button>
                )}
            >
                <input ref={uploadRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleScan(e.target.files?.[0])} />
                {scanNote && (
                    <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium ${scanNote.tone === 'ok' ? 'bg-success/10 text-success' : scanNote.tone === 'warn' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'}`}>
                        {scanNote.text}
                    </p>
                )}
            </FormSection>

            <FormSection title="Expense details" icon={FileTextIcon}>
                <FieldGrid>
                    <TextField label="Vendor / store" value={d.vendor} onChange={v => update({ vendor: v })} placeholder="e.g. Home Depot" />
                    <DateField label="Date" value={d.date} onChange={v => update({ date: v })} />
                    <SelectField label="Category" value={d.category} options={EXPENSE_CATEGORIES} onChange={v => update({ category: v as ExpenseLogData['category'] })} />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Fuel – week 12" />
                </FieldGrid>
            </FormSection>

            <FormSection title="Items" description="What you paid for." icon={DollarIcon}>
                <LineItemsEditor
                    items={d.lineItems || []}
                    onChange={items => update({ lineItems: items })}
                    enablePicker={false}
                    enableQuickAdd={false}
                    rateLabel="Price"
                    descriptionPlaceholder="Item or service"
                />
                <div className="ml-auto w-full space-y-3 rounded-xl border border-border bg-muted/40 p-4 sm:max-w-sm">
                    <SummaryRow label="Items" value={formatMoney(sub)} />
                    <MoneyField label="Tax paid" value={d.tax ?? 0} onValueChange={v => update({ tax: v })} />
                    {sub > 0 && (
                        <Toggle checked={autoTotal} onChange={setAutoTotal} label="Calculate total from items + tax" description={autoTotal ? undefined : `Items + tax = ${formatMoney(computedTotal)}`} />
                    )}
                    {usingItems ? (
                        <SummaryRow label="Total paid" value={formatMoney(shownTotal)} strong className="border-t border-border pt-3" />
                    ) : (
                        <MoneyField label="Total paid" value={d.amount} onValueChange={v => update({ amount: v })} hint={sub > 0 && !nearlyEqual(computedTotal, toNumber(d.amount)) ? `Differs from items + tax (${formatMoney(computedTotal)}).` : undefined} />
                    )}
                </div>
                <TextAreaField label="Notes" value={d.notes} onChange={v => update({ notes: v })} rows={3} placeholder="What it was for, who paid…" />
            </FormSection>

            <ClientSection
                clients={clients}
                job={job}
                clientId={d.clientId}
                clientName={d.clientName}
                addressKey={null}
                onChange={patch => update(patch as Partial<ExpenseState>)}
                description="Client or job this expense is billed to (optional)."
            />

            <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} title="Signature" description="Approved by (optional)." />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />
        </FormShell>
    );
};

export default ExpenseLogForm;
