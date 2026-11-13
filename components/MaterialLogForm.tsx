import React, { useState } from 'react';
import { FormType, type MaterialLogData, type MaterialLogItem, type UserProfile, type Job, type Client, type InventoryItem } from '../types.ts';
import { generateMaterialLogPDF } from '../services/pdfGenerator.ts';
import { formatMoney, roundMoney, toNumber } from '../utils/money.ts';
import { MaterialLogIcon, BoxIcon, PlusIcon, TrashIcon, FileTextIcon } from './Icons.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, NumberInput, TextField, Toggle } from './forms/Fields.tsx';
import { ClientSection, CompanySection, SignatureSection, SummaryRow, TemplateSection } from './forms/Sections.tsx';
import ItemPickerModal from './forms/ItemPickerModal.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { blankMaterialItem, formatDisplayDate, isISODate, normalizeMaterialItems, todayISO } from './forms/formUtils.ts';

interface Props {
    job: Job;
    profile: UserProfile;
    data: MaterialLogData | null;
    clients?: Client[];
    inventory?: InventoryItem[];
    inventoryItems?: InventoryItem[];
    onSave: SaveHandler<MaterialLogData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
}

/** Set by the database/app when stock was actually deducted for this log (read-only for the form). */
type MaterialLogState = MaterialLogData & { inventoryDeductedAt?: string; clientId?: string };

const ROW = 'relative rounded-xl border border-border bg-background/60 p-3 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_84px_120px_112px_40px] md:items-start md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:p-0';
const HEADER = 'hidden md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_84px_120px_112px_40px] md:gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const mobileLabel = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden';

const MaterialLogForm: React.FC<Props> = ({ job, profile, data, clients = [], inventory, inventoryItems, onSave, onBack, onUploadImage, prefillData }) => {
    const stock = inventory || inventoryItems || [];
    const [pickerFor, setPickerFor] = useState<string | null>(null);

    const stockOf = (item: MaterialLogItem): number | null => {
        if (!item.inventoryItemId) return null;
        const inv = stock.find(i => i.id === item.inventoryItemId);
        return inv ? toNumber(inv.quantity) : null;
    };

    const form = useDocumentForm<MaterialLogState>({
        formType: FormType.MaterialLog,
        initial: data as MaterialLogState | null,
        prefillData,
        onSave: onSave as SaveHandler<MaterialLogState>,
        download: d => generateMaterialLogPDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID),
        makeDefaults: () => ({
            title: '',
            date: todayISO(),
            projectName: job.name || '',
            items: [blankMaterialItem()],
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
            deductInventory: false,
        }),
        hydrate: d => backfillCompany({ ...d, items: normalizeMaterialItems(d.items, false), projectName: d.projectName ?? '' }, profile),
        validate: d => {
            if (!isISODate(d.date)) return 'Add a valid date.';
            // Stock is moved by the database (idempotent, edits apply only the difference). Short stock is allowed:
            // it goes negative and is flagged in the inventory history, so it is a warning below, never a save blocker.
            return null;
        },
    });
    const { data: d, update } = form;
    const items = d.items || [];
    const total = roundMoney(items.reduce((s, it) => s + toNumber(it.quantity) * toNumber(it.unitCost), 0));
    const linkedCount = items.filter(i => i.inventoryItemId).length;
    const shortItems = items
        .filter(it => { const available = stockOf(it); return available !== null && toNumber(it.quantity) > available; })
        .map(it => it.name || 'item');

    const patchItem = (id: string, patch: Partial<MaterialLogItem>) => update(prev => ({ ...prev, items: prev.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }));
    const removeItem = (id: string) => update(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
    const addItem = () => update(prev => ({ ...prev, items: [...prev.items, blankMaterialItem()] }));
    const pickInventory = (inv: InventoryItem) => {
        if (!pickerFor) return;
        patchItem(pickerFor, {
            name: inv.name,
            supplier: inv.supplier || '',
            unitCost: toNumber(inv.cost_price),
            inventoryItemId: inv.id,
        });
        setPickerFor(null);
    };

    return (
        <FormShell
            title="Material log"
            subtitle={[d.projectName, d.date ? formatDisplayDate(d.date) : ''].filter(Boolean).join(' · ') || 'New material log'}
            icon={MaterialLogIcon}
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
            preview={{ formType: FormType.MaterialLog, data: d, profile, job }}
        >
            <FormSection title="Log details" icon={FileTextIcon}>
                <FieldGrid>
                    <TextField label="Project" value={d.projectName} onChange={v => update({ projectName: v })} />
                    <DateField label="Date" value={d.date} onChange={v => update({ date: v })} />
                    <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Lumber delivery – week 3" fieldClassName="sm:col-span-2" />
                </FieldGrid>
            </FormSection>

            <FormSection title="Materials" description="What was delivered or used on site." icon={BoxIcon}>
                <div className="space-y-3">
                    <div className={HEADER}>
                        <span>Material</span><span>Supplier</span><span>Qty</span><span>Unit cost</span><span className="text-right">Total</span><span />
                    </div>
                    <div className="space-y-3 md:space-y-2">
                        {items.length === 0 && <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No materials yet.</div>}
                        {items.map((it, index) => {
                            const available = stockOf(it);
                            const over = available !== null && toNumber(it.quantity) > available;
                            return (
                                <div key={it.id} className={ROW}>
                                    <div className="min-w-0 pr-11 md:pr-0">
                                        <label className={mobileLabel} htmlFor={`ml-name-${it.id}`}>Material {index + 1}</label>
                                        <div className="flex gap-1.5">
                                            <input id={`ml-name-${it.id}`} className="input" value={it.name} placeholder="e.g. 2x4 studs" onChange={e => patchItem(it.id, { name: e.target.value })} aria-label={`Material ${index + 1} name`} />
                                            {stock.length > 0 && (
                                                <button type="button" className="btn btn-outline h-[42px] w-[42px] shrink-0 p-0" onClick={() => setPickerFor(it.id)} title="Pick from inventory" aria-label="Pick from inventory">
                                                    <BoxIcon className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                        {it.inventoryItemId && (
                                            <p className={`mt-1 text-xs ${over ? 'font-medium text-warning' : 'text-muted-foreground'}`}>
                                                Linked to inventory{available !== null ? ` · ${over ? `only ${available}` : available} in stock` : ''}
                                                <button type="button" className="ml-2 underline" onClick={() => patchItem(it.id, { inventoryItemId: undefined })}>Unlink</button>
                                            </p>
                                        )}
                                    </div>
                                    <div className="mt-3 min-w-0 md:mt-0">
                                        <label className={mobileLabel} htmlFor={`ml-sup-${it.id}`}>Supplier</label>
                                        <input id={`ml-sup-${it.id}`} className="input" value={it.supplier} placeholder="Supplier" onChange={e => patchItem(it.id, { supplier: e.target.value })} aria-label={`Material ${index + 1} supplier`} />
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 md:mt-0 md:contents">
                                        <div className="min-w-0">
                                            <span className={mobileLabel}>Qty</span>
                                            <NumberInput value={it.quantity} onValueChange={v => patchItem(it.id, { quantity: v })} className="px-2.5 text-center" aria-label={`Material ${index + 1} quantity`} />
                                        </div>
                                        <div className="min-w-0">
                                            <span className={mobileLabel}>Unit cost</span>
                                            <NumberInput value={it.unitCost} onValueChange={v => patchItem(it.id, { unitCost: v })} decimals={2} prefix="$" aria-label={`Material ${index + 1} unit cost`} />
                                        </div>
                                        <div className="col-span-2 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm md:col-span-1 md:block md:bg-transparent md:px-0 md:py-2.5 md:text-right">
                                            <span className="text-muted-foreground md:hidden">Total</span>
                                            <span className="font-semibold tabular-nums">{formatMoney(toNumber(it.quantity) * toNumber(it.unitCost))}</span>
                                        </div>
                                    </div>
                                    <div className="absolute right-2 top-2 md:static">
                                        <button type="button" onClick={() => removeItem(it.id)} className="btn btn-ghost h-10 w-10 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove material ${index + 1}`}>
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={addItem}><PlusIcon className="h-4 w-4" /> Add material</button>
                </div>
                <div className="ml-auto w-full rounded-xl border border-border bg-muted/40 p-4 sm:max-w-sm">
                    <SummaryRow label="Total materials cost" value={formatMoney(total)} strong />
                </div>

                <Toggle
                    checked={Boolean(d.deductInventory)}
                    disabled={linkedCount === 0 && !d.deductInventory}
                    onChange={on => update({ deductInventory: on })}
                    label="Deduct linked items from inventory"
                    description={linkedCount === 0
                        ? 'Link a row to an inventory item (box button) to use this.'
                        : `${linkedCount} linked item${linkedCount === 1 ? '' : 's'}. Stock is updated when you save; editing quantities later only moves the difference, and turning this off returns the items to stock.`}
                />
                {d.deductInventory && shortItems.length > 0 && (
                    <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
                        Low stock: {shortItems.join(', ')}. You can still save; the inventory will show these items as oversold.
                    </p>
                )}
            </FormSection>

            <ClientSection
                clients={clients}
                job={job}
                clientId={d.clientId}
                clientName={d.clientName}
                address={d.clientAddress}
                onChange={patch => update(patch as Partial<MaterialLogState>)}
            />

            <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} />

            <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} title="Signature" description="Received / verified by." />

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            <ItemPickerModal
                open={pickerFor !== null}
                onClose={() => setPickerFor(null)}
                title="Pick from inventory"
                savedItems={[]}
                inventoryItems={stock}
                showPriceBook={false}
                onPickSaved={() => undefined}
                onPickInventory={pickInventory}
            />
        </FormShell>
    );
};

export default MaterialLogForm;
