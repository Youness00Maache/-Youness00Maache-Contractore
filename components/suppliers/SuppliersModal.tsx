/**
 * Saved suppliers: name, email, phone, account #, address, notes (public.user_settings 'suppliers.list').
 * Opened from Inventory ([[Suppliers]]) and from a purchase order's Vendor section ([[Manage]]). Every plan.
 */
import React, { useEffect, useState } from 'react';
import { ConfirmDialog, Field, InlineError, Modal } from '../viewKit.tsx';
import { EditIcon, PlusIcon, TrashIcon } from '../Icons.tsx';
import { SUPPLIER_LIMITS, isValidEmail, removeSupplier, upsertSupplier, type Supplier } from '../../lib/suppliers.ts';
import type { SyncMode } from '../../lib/userData.ts';
import { syncNote } from './useSuppliers.ts';

type DraftSupplier = Pick<Supplier, 'name' | 'email' | 'phone' | 'address' | 'accountNumber' | 'notes'> & { id?: string };
const EMPTY: DraftSupplier = { name: '', email: '', phone: '', address: '', accountNumber: '', notes: '' };

const SuppliersModal: React.FC<{
    open: boolean;
    onClose: () => void;
    suppliers: Supplier[];
    onSave: (list: Supplier[]) => Promise<SyncMode>;
    /** opens straight on the editor, prefilled (e.g. "Save as supplier" with changes) */
    startWith?: Partial<DraftSupplier> | null;
}> = ({ open, onClose, suppliers, onSave, startWith }) => {
    const [editing, setEditing] = useState<DraftSupplier | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [deleteFor, setDeleteFor] = useState<Supplier | null>(null);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setNote(null);
        setEditing(startWith ? { ...EMPTY, ...startWith } : null);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = <K extends keyof DraftSupplier>(k: K, v: DraftSupplier[K]) => setEditing((e) => (e ? { ...e, [k]: v } : e));
    const emailProblem = editing && editing.email.trim() && !isValidEmail(editing.email) ? 'This email doesn’t look right (example: orders@supplier.com).' : null;
    const duplicate = editing && !editing.id
        ? suppliers.find((s) => s.name.trim().toLowerCase() === editing.name.trim().toLowerCase())
        : undefined;

    const save = async () => {
        if (!editing) return;
        if (!editing.name.trim()) { setError('Give the supplier a name.'); return; }
        if (emailProblem) { setError(emailProblem); return; }
        setBusy(true);
        setError(null);
        try {
            const { list, supplier } = upsertSupplier(suppliers, editing);
            if (!supplier) throw new Error('Give the supplier a name.');
            const mode = await onSave(list);
            setNote(syncNote(mode) || `“${supplier.name}” saved.`);
            setEditing(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'The supplier could not be saved.');
        } finally {
            setBusy(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteFor) return;
        setBusy(true);
        setError(null);
        try {
            const mode = await onSave(removeSupplier(suppliers, deleteFor.id));
            setNote(syncNote(mode) || `“${deleteFor.name}” removed. Purchase orders already made keep its details.`);
            setDeleteFor(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'The supplier could not be removed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                busy={busy}
                size="md"
                title={editing ? (editing.id ? 'Edit supplier' : 'New supplier') : 'Suppliers'}
                description={editing ? undefined : 'Pick one on a purchase order to fill the vendor. Inventory items whose Supplier has the same name are reordered from it.'}
                footer={editing ? (
                    <>
                        <button type="button" className="btn btn-outline" onClick={() => (startWith && !suppliers.length ? onClose() : setEditing(null))} disabled={busy}>Back</button>
                        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !editing.name.trim()}>{busy ? 'Saving…' : 'Save supplier'}</button>
                    </>
                ) : (
                    <>
                        <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
                        <button type="button" className="btn btn-primary" onClick={() => { setNote(null); setError(null); setEditing({ ...EMPTY }); }}><PlusIcon className="h-4 w-4" /> Add supplier</button>
                    </>
                )}
            >
                <div className="space-y-4">
                    {error && <InlineError>{error}</InlineError>}
                    {note && !editing && <p role="status" className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground">{note}</p>}
                    {editing ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Field label="Name *" htmlFor="sup-name" className="sm:col-span-2" error={duplicate ? `“${duplicate.name}” is already saved: saving updates it.` : undefined}>
                                <input id="sup-name" className="input" value={editing.name} onChange={(e) => set('name', e.target.value)} maxLength={SUPPLIER_LIMITS.name} placeholder="e.g. Home Depot Pro" autoFocus />
                            </Field>
                            <Field label="Email for orders" htmlFor="sup-email" error={emailProblem || undefined} hint="Purchase orders are sent here.">
                                <input id="sup-email" className="input" type="email" inputMode="email" autoCapitalize="off" spellCheck={false} value={editing.email} onChange={(e) => set('email', e.target.value)} maxLength={SUPPLIER_LIMITS.email} placeholder="orders@supplier.com" />
                            </Field>
                            <Field label="Phone" htmlFor="sup-phone">
                                <input id="sup-phone" className="input" type="tel" inputMode="tel" value={editing.phone} onChange={(e) => set('phone', e.target.value)} maxLength={SUPPLIER_LIMITS.phone} />
                            </Field>
                            <Field label="Your account #" htmlFor="sup-acct" hint="Added to the notes of new purchase orders.">
                                <input id="sup-acct" className="input" value={editing.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} maxLength={SUPPLIER_LIMITS.accountNumber} placeholder="Optional" />
                            </Field>
                            <Field label="Address" htmlFor="sup-addr">
                                <input id="sup-addr" className="input" value={editing.address} onChange={(e) => set('address', e.target.value)} maxLength={SUPPLIER_LIMITS.address} placeholder="Optional" />
                            </Field>
                            <Field label="Notes" htmlFor="sup-notes" className="sm:col-span-2">
                                <textarea id="sup-notes" className="input min-h-[72px] resize-y" value={editing.notes} onChange={(e) => set('notes', e.target.value)} maxLength={SUPPLIER_LIMITS.notes} placeholder="Branch, rep name, delivery days…" />
                            </Field>
                        </div>
                    ) : suppliers.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                            No saved suppliers yet. Add the places you buy from, or use <span className="font-medium text-foreground">Save as supplier</span> on a purchase order.
                        </p>
                    ) : (
                        <ul className="divide-y divide-border rounded-xl border border-border">
                            {suppliers.map((s) => (
                                <li key={s.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {[s.email || 'No email', s.phone, s.accountNumber ? `Acct ${s.accountNumber}` : ''].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <button type="button" className="btn btn-ghost h-9 w-9 p-0" aria-label={`Edit ${s.name}`} onClick={() => { setNote(null); setError(null); setEditing({ ...s }); }}><EditIcon className="h-4 w-4" /></button>
                                        <button type="button" className="btn btn-ghost h-9 w-9 p-0 text-muted-foreground hover:text-destructive" aria-label={`Remove ${s.name}`} onClick={() => setDeleteFor(s)}><TrashIcon className="h-4 w-4" /></button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </Modal>
            <ConfirmDialog
                open={!!deleteFor}
                title={`Remove “${deleteFor?.name ?? ''}”?`}
                message="It disappears from your saved suppliers. Purchase orders already made keep its details, and inventory items keep their supplier name."
                confirmLabel="Remove supplier"
                destructive
                busy={busy}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteFor(null)}
            />
        </>
    );
};

export default SuppliersModal;
