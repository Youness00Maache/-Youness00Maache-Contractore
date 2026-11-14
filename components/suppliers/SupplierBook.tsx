/**
 * The Suppliers screen once the database has the suppliers table (roadmap D4). It replaces the old list + editor inside
 * SuppliersModal (which is unchanged and still used until then):
 *   list     compact rows (preferred star, name, contact / terms / lead time), search, archived ones on request
 *   details  contact, email for orders, phone, account #, payment terms, lead time, website, address, notes, preferred,
 *            archive instead of delete (purchase orders already made keep the supplier's name and details)
 *   catalogue / price list   Premium: what the supplier sells with price history and the CSV price-list import
 * Every write goes through the suppliers table API from useSuppliers.ts and needs a connection.
 */
import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, Field, InlineError, Modal, NumberInput, Segmented } from '../viewKit.tsx';
import { PlusIcon, SearchIcon, StarIcon } from '../Icons.tsx';
import { cx } from '../commsKit.tsx';
import { errorText } from '../../lib/offline/connection.ts';
import { SUPPLIER_RECORD_LIMITS } from '../../lib/suppliers/libraryLogic.ts';
import { urlProblem } from '../../lib/suppliers/libraryView.ts';
import { isValidEmail, normName } from '../../lib/suppliers.ts';
import type { SupplierInput, SupplierRecord } from '../../lib/suppliers/types.ts';
import type { SuppliersTable } from './useSuppliers.ts';
import { useOnline } from './supplierHooks.ts';
import { OfflineLine, PremiumPrompt } from './supplierUi.tsx';

const SupplierCatalogue = lazy(() => import('./SupplierCatalogue.tsx'));
const PriceListImport = lazy(() => import('./PriceListImport.tsx'));

const TERMS = ['Due on receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'COD', 'Prepaid'];
const PREMIUM_REASON = 'Supplier catalogues, price history and price-list import are part of Premium.';

interface Draft {
    name: string;
    contactName: string;
    email: string;
    phone: string;
    address: string;
    website: string;
    accountNumber: string;
    paymentTerms: string;
    notes: string;
    leadTimeDays: string;
    preferred: boolean;
}

const EMPTY: Draft = { name: '', contactName: '', email: '', phone: '', address: '', website: '', accountNumber: '', paymentTerms: '', notes: '', leadTimeDays: '', preferred: false };
const fromRecord = (r: SupplierRecord): Draft => ({
    name: r.name, contactName: r.contactName, email: r.email, phone: r.phone, address: r.address, website: r.website,
    accountNumber: r.accountNumber, paymentTerms: r.paymentTerms, notes: r.notes, leadTimeDays: r.leadTimeDays === null ? '' : String(r.leadTimeDays), preferred: r.preferred,
});

type Tab = 'details' | 'catalogue' | 'import';

const subline = (s: SupplierRecord): string =>
    [s.contactName, s.phone || s.email, s.paymentTerms, s.leadTimeDays !== null ? `${s.leadTimeDays} day lead time` : ''].filter(Boolean).join(' · ') || 'No contact details yet';

const SupplierBook: React.FC<{
    open: boolean;
    onClose: () => void;
    table: SuppliersTable;
    paid: boolean;
    onUpgrade?: (reason?: string) => void;
    /** opens straight on a new supplier, prefilled (e.g. "Save as supplier" with changes) */
    startWith?: Partial<Draft> | null;
}> = ({ open, onClose, table, paid, onUpgrade, startWith }) => {
    const online = useOnline();
    const [selected, setSelected] = useState<string | 'new' | null>(null);
    const [tab, setTab] = useState<Tab>('details');
    const [draft, setDraft] = useState<Draft>(EMPTY);
    const [query, setQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [askArchive, setAskArchive] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setNote(null);
        setTab('details');
        if (startWith) { setDraft({ ...EMPTY, ...startWith }); setSelected('new'); } else setSelected(null);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const records = table.records;
    const active = useMemo(() => records.filter((r) => !r.archived).sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [records]);
    const archived = useMemo(() => records.filter((r) => r.archived).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [records]);
    const q = query.trim().toLowerCase();
    const visible = (showArchived ? archived : active).filter((r) => !q || [r.name, r.contactName, r.email, r.phone, r.accountNumber].some((v) => v.toLowerCase().includes(q)));
    const current = selected && selected !== 'new' ? records.find((r) => r.id === selected) || null : null;

    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
    const emailProblem = draft.email.trim() && !isValidEmail(draft.email) ? 'This email doesn’t look right (example: orders@supplier.com).' : null;
    const websiteProblem = urlProblem(draft.website);
    const leadText = draft.leadTimeDays.trim();
    const leadProblem = leadText && !(Number.isInteger(Number(leadText)) && Number(leadText) >= 0 && Number(leadText) <= 365) ? 'Enter a whole number of days, 0 to 365.' : null;
    const sameName = records.find((r) => r.id !== selected && normName(r.name) === normName(draft.name) && draft.name.trim());
    const nameProblem = sameName ? (sameName.archived ? `“${sameName.name}” is archived. Use Show archived to bring it back.` : `“${sameName.name}” is already in your suppliers.`) : null;

    const openSupplier = (r: SupplierRecord, nextTab: Tab = 'details') => {
        setError(null);
        setNote(null);
        setDraft(fromRecord(r));
        setTab(nextTab);
        setSelected(r.id);
    };
    const startNew = () => { setError(null); setNote(null); setDraft({ ...EMPTY }); setTab('details'); setSelected('new'); };
    const backToList = () => {
        setError(null);
        if (startWith && !records.length) { onClose(); return; }
        setSelected(null);
    };

    const toInput = (): SupplierInput => ({
        name: draft.name, contactName: draft.contactName, email: draft.email, phone: draft.phone, address: draft.address, website: draft.website,
        accountNumber: draft.accountNumber, paymentTerms: draft.paymentTerms, notes: draft.notes,
        leadTimeDays: leadText ? Number(leadText) : null, preferred: draft.preferred,
    });

    const save = async () => {
        if (!draft.name.trim()) { setError('Give the supplier a name.'); return; }
        const problem = nameProblem || emailProblem || websiteProblem || leadProblem;
        if (problem) { setError(problem); return; }
        setBusy(true);
        setError(null);
        try {
            const saved = current ? await table.update(current.id, toInput()) : await table.create(toInput());
            setDraft(fromRecord(saved));
            setSelected(saved.id);
            setNote(`“${saved.name}” saved.`);
        } catch (e) {
            setError(errorText(e, 'The supplier could not be saved.'));
        } finally {
            setBusy(false);
        }
    };

    const togglePreferred = async (r: SupplierRecord) => {
        setBusy(true);
        setError(null);
        setNote(null);
        try { await table.update(r.id, { preferred: !r.preferred }); } catch (e) { setError(errorText(e, 'The supplier could not be saved.')); } finally { setBusy(false); }
    };

    const archive = async (r: SupplierRecord, on: boolean) => {
        setBusy(true);
        setError(null);
        try {
            await table.archive(r.id, on);
            setAskArchive(false);
            setNote(on ? `“${r.name}” archived. Purchase orders already made keep its details.` : `“${r.name}” is back in your suppliers.`);
            setSelected(null);
            if (!on) setShowArchived(false);
        } catch (e) {
            setAskArchive(false);
            setError(errorText(e, 'The supplier could not be changed.'));
        } finally {
            setBusy(false);
        }
    };

    // ---------------------------------------------------------------------------------------------- footer / title
    const inDetail = selected !== null;
    const footer = !inDetail ? (
        <>
            <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" onClick={startNew} disabled={!online}><PlusIcon className="h-4 w-4" /> Add supplier</button>
        </>
    ) : tab === 'details' ? (
        <>
            <button type="button" className="btn btn-outline" onClick={backToList} disabled={busy}>Back</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !online || !draft.name.trim()}>{busy ? 'Saving…' : 'Save supplier'}</button>
        </>
    ) : (
        <button type="button" className="btn btn-outline" onClick={backToList}>Back to suppliers</button>
    );

    const tabs = (
        <Segmented<Tab>
            ariaLabel="Supplier sections"
            value={tab}
            onChange={setTab}
            options={[
                { value: 'details', label: 'Details' },
                { value: 'catalogue', label: <span className="inline-flex items-center gap-1">Catalogue{!paid && <StarIcon className="h-3 w-3" />}</span> },
                { value: 'import', label: <span className="inline-flex items-center gap-1">Price list{!paid && <StarIcon className="h-3 w-3" />}</span> },
            ]}
        />
    );

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                busy={busy}
                size="lg"
                title={inDetail ? (current ? current.name : draft.name.trim() || 'New supplier') : showArchived ? 'Archived suppliers' : 'Suppliers'}
                description={inDetail ? undefined : 'Pick one on a purchase order to fill the vendor. Inventory items whose Supplier has the same name are reordered from it.'}
                footer={footer}
            >
                <div className="space-y-4">
                    {error && <InlineError>{error}</InlineError>}
                    {/* one sentence for every tab (the price-list import shows it next to its Apply button) */}
                    {!online && !(tab === 'import' && inDetail) && <OfflineLine />}
                    {note && <p role="status" className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground">{note}</p>}

                    {!inDetail ? (
                        <>
                            {(records.length > 6 || query) && (
                                <div className="relative">
                                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <input className="input h-10 pl-9" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search suppliers" aria-label="Search suppliers" />
                                </div>
                            )}
                            {visible.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                                    {q ? 'No supplier matches.' : showArchived ? 'No archived suppliers.' : <>No saved suppliers yet. Add the places you buy from, or use <span className="font-medium text-foreground">Save as supplier</span> on a purchase order.</>}
                                </p>
                            ) : (
                                <ul className="divide-y divide-border rounded-xl border border-border">
                                    {visible.map((s) => (
                                        <li key={s.id} className="flex items-center gap-1 pr-2">
                                            <button
                                                type="button"
                                                className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50', s.preferred ? 'text-warning' : 'text-muted-foreground/50 hover:text-warning')}
                                                aria-label={s.preferred ? `${s.name} is preferred: tap to clear` : `Make ${s.name} preferred`} aria-pressed={s.preferred}
                                                title="Preferred suppliers are suggested first when you reorder" disabled={busy || !online || s.archived}
                                                onClick={() => void togglePreferred(s)}
                                            >
                                                <StarIcon className="h-5 w-5" fill={s.preferred ? 'currentColor' : 'none'} />
                                            </button>
                                            <button type="button" className="min-w-0 flex-1 py-2.5 text-left" onClick={() => openSupplier(s)}>
                                                <span className="block truncate text-sm font-semibold text-foreground">{s.name}</span>
                                                <span className="block truncate text-xs text-muted-foreground">{subline(s)}</span>
                                            </button>
                                            {s.archived && <button type="button" className="btn btn-outline btn-sm min-h-[36px] shrink-0" onClick={() => void archive(s, false)} disabled={busy || !online}>Restore</button>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {archived.length > 0 && (
                                <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setShowArchived((v) => !v)}>
                                    {showArchived ? 'Back to active suppliers' : `Show archived (${archived.length})`}
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            {current && tabs}

                            {tab === 'details' && (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Field label="Name *" htmlFor="sb-name" className="sm:col-span-2" error={nameProblem || undefined}>
                                        <input id="sb-name" className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={SUPPLIER_RECORD_LIMITS.name} placeholder="e.g. Home Depot Pro" autoFocus={!current} />
                                    </Field>
                                    <Field label="Contact person" htmlFor="sb-contact">
                                        <input id="sb-contact" className="input" value={draft.contactName} onChange={(e) => set('contactName', e.target.value)} maxLength={SUPPLIER_RECORD_LIMITS.contactName} placeholder="Optional" />
                                    </Field>
                                    <Field label="Phone" htmlFor="sb-phone">
                                        <input id="sb-phone" className="input" type="tel" inputMode="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} maxLength={SUPPLIER_RECORD_LIMITS.phone} />
                                    </Field>
                                    <Field label="Email for orders" htmlFor="sb-email" error={emailProblem || undefined} hint="Purchase orders are sent here.">
                                        <input id="sb-email" className="input" type="email" inputMode="email" autoCapitalize="off" spellCheck={false} value={draft.email} onChange={(e) => set('email', e.target.value)} maxLength={SUPPLIER_RECORD_LIMITS.email} placeholder="orders@supplier.com" />
                                    </Field>
                                    <Field label="Your account #" htmlFor="sb-acct" hint="Added to the notes of new purchase orders.">
                                        <input id="sb-acct" className="input" value={draft.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} maxLength={SUPPLIER_RECORD_LIMITS.accountNumber} placeholder="Optional" />
                                    </Field>
                                    <Field label="Payment terms" htmlFor="sb-terms">
                                        <input id="sb-terms" className="input" list="sb-terms-list" value={draft.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} maxLength={SUPPLIER_RECORD_LIMITS.paymentTerms} placeholder="e.g. Net 30" />
                                        <datalist id="sb-terms-list">{TERMS.map((t) => <option key={t} value={t} />)}</datalist>
                                    </Field>
                                    <Field label="Delivery lead time (days)" htmlFor="sb-lead" error={leadProblem || undefined} hint="Usually how many days from order to delivery.">
                                        <NumberInput id="sb-lead" value={leadText === '' ? null : Number(leadText)} onValue={(n) => set('leadTimeDays', String(Math.round(n)))} onEmpty={() => set('leadTimeDays', '')} placeholder="Optional" />
                                    </Field>
                                    <Field label="Website" htmlFor="sb-web" error={websiteProblem || undefined}>
                                        <input id="sb-web" className="input" type="url" inputMode="url" autoCapitalize="off" spellCheck={false} value={draft.website} onChange={(e) => set('website', e.target.value)} maxLength={SUPPLIER_RECORD_LIMITS.website} placeholder="https://" />
                                    </Field>
                                    <Field label="Address" htmlFor="sb-addr">
                                        <input id="sb-addr" className="input" value={draft.address} onChange={(e) => set('address', e.target.value)} maxLength={SUPPLIER_RECORD_LIMITS.address} placeholder="Optional" />
                                    </Field>
                                    <Field label="Notes" htmlFor="sb-notes" className="sm:col-span-2">
                                        <textarea id="sb-notes" className="input min-h-[72px] resize-y" value={draft.notes} onChange={(e) => set('notes', e.target.value)} maxLength={SUPPLIER_RECORD_LIMITS.notes} placeholder="Branch, rep name, delivery days…" />
                                    </Field>
                                    <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm sm:col-span-2">
                                        <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={draft.preferred} onChange={(e) => set('preferred', e.target.checked)} />
                                        <span>Preferred supplier <span className="text-muted-foreground">(suggested first when you reorder)</span></span>
                                    </label>
                                    {current && (
                                        <div className="border-t border-border pt-3 sm:col-span-2">
                                            <button type="button" className="text-sm font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50" onClick={() => setAskArchive(true)} disabled={busy || !online}>Archive this supplier</button>
                                            <p className="mt-0.5 text-xs text-muted-foreground">It disappears from your lists. Purchase orders already made keep its details, and you can bring it back any time.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {current && tab === 'catalogue' && (paid ? (
                                <Suspense fallback={<div className="skeleton h-24 w-full rounded-xl" />}>
                                    <SupplierCatalogue supplier={current} online={online} onImport={() => setTab('import')} reloadKey={reloadKey} />
                                </Suspense>
                            ) : (
                                <PremiumPrompt
                                    title="Know what every supplier charges, and when it changes"
                                    lines={[
                                        ['A catalogue per supplier.', 'SKU, unit and price for what you buy, linked to your price book.'],
                                        ['Price history.', 'Every change is remembered, with an up or down badge so a rise doesn’t surprise you.'],
                                        ['Cheapest supplier.', 'See who is cheapest for an item when you set its cost or reorder.'],
                                    ]}
                                    onUpgrade={() => onUpgrade?.(PREMIUM_REASON)}
                                />
                            ))}

                            {current && tab === 'import' && (paid ? (
                                <Suspense fallback={<div className="skeleton h-24 w-full rounded-xl" />}>
                                    <PriceListImport supplier={current} online={online} onApplied={() => setReloadKey((k) => k + 1)} onBackToCatalogue={() => setTab('catalogue')} />
                                </Suspense>
                            ) : (
                                <PremiumPrompt
                                    title="Update prices from the supplier’s own price list"
                                    lines={[
                                        ['Upload a CSV.', 'SKU, description, unit and price: no retyping.'],
                                        ['Review before anything changes.', 'Old price, new price and the percent, with big changes highlighted.'],
                                        ['You choose.', 'Tick what to apply; the rest is left alone.'],
                                    ]}
                                    onUpgrade={() => onUpgrade?.(PREMIUM_REASON)}
                                />
                            ))}
                        </>
                    )}
                </div>
            </Modal>
            <ConfirmDialog
                open={askArchive && !!current}
                title={`Archive “${current?.name ?? ''}”?`}
                message="It disappears from your supplier lists and from reorder suggestions. Purchase orders already made keep its details, inventory items keep their supplier name, and you can restore it any time."
                confirmLabel="Archive supplier"
                busy={busy}
                onConfirm={() => current && void archive(current, true)}
                onCancel={() => setAskArchive(false)}
            />
        </>
    );
};

export default SupplierBook;
