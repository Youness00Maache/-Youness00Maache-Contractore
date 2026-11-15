/**
 * Job page › Subs › Quotes › "Add a quote" / "Edit": one price for a scope of work. Quotes with the same scope (spaces and
 * capitals ignored) are compared side by side. From: one of your crew subcontractors, a saved supplier or a name you type.
 * Optional: what is included and excluded, lead time, how long the price holds, a link, and a PDF or photo of the quote.
 * Data: lib/subs/subsApi.ts (createQuote with the file, updateQuote, attachQuoteFile, removeQuoteFile).
 */
import React, { useRef, useState } from 'react';
import { planLimitMessage } from '../../lib/account.ts';
import { isPlanLimitError } from '../../lib/jobFiles/jobFilesApi.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { attachQuoteFile, createQuote, removeQuoteFile, updateQuote } from '../../lib/subs/subsApi.ts';
import { scopeKeyOf, validateHttpsUrl, validateQuoteDraft, validateQuoteFile } from '../../lib/subs/quoteCompare.ts';
import { parseAmount, subDisplayName, subNameOf, todayISO } from '../../lib/subs/subLogic.ts';
import { SUB_LIMITS, type JobQuote, type QuoteDraft, type SubMember } from '../../lib/subs/subTypes.ts';
import type { SupplierRecord } from '../../lib/suppliers/types.ts';
import { Modal } from '../viewKit.tsx';

const OTHER = 'other';

export interface QuoteEditorProps {
    quote?: JobQuote;
    jobId: string;
    userId: string;
    /** scope text to start with (adding another quote to a group) */
    presetScope?: string;
    /** the scopes already on this job: typing one of them puts the quote in that group */
    scopes: readonly string[];
    subs: readonly SubMember[];
    /** saved suppliers (null = the suppliers list is not in the database: no supplier choice) */
    suppliers: readonly SupplierRecord[] | null;
    isOnline: boolean;
    onClose: () => void;
    onSaved: (saved: JobQuote) => void;
    onUpgrade: (reason?: string) => void;
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const QuoteEditorModal: React.FC<QuoteEditorProps> = ({ quote: q, jobId, userId, presetScope, scopes, subs, suppliers, isOnline, onClose, onSaved, onUpgrade }) => {
    const [scope, setScope] = useState(q?.scope || presetScope || '');
    const [from, setFrom] = useState<string>(() => (q?.crewMemberId ? `sub:${q.crewMemberId}` : q?.supplierId ? `sup:${q.supplierId}` : OTHER));
    const [vendor, setVendor] = useState(q && !q.crewMemberId && !q.supplierId ? q.vendorName : '');
    const [amount, setAmount] = useState(q ? String(q.amount) : '');
    const [inclusions, setInclusions] = useState(q?.inclusions || '');
    const [exclusions, setExclusions] = useState(q?.exclusions || '');
    const [notes, setNotes] = useState(q?.notes || '');
    const [lead, setLead] = useState(q?.leadTimeDays !== null && q?.leadTimeDays !== undefined ? String(q.leadTimeDays) : '');
    const [validUntil, setValidUntil] = useState(q?.validUntil || '');
    const [receivedOn, setReceivedOn] = useState(q?.receivedOn || todayISO());
    const [url, setUrl] = useState(q?.url || '');
    const [file, setFile] = useState<File | null>(null);
    const [dropFile, setDropFile] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const sub = from.startsWith('sub:') ? subs.find(m => m.id === from.slice(4)) || null : null;
    const supplier = from.startsWith('sup:') ? (suppliers || []).find(s => s.id === from.slice(4)) || null : null;
    const keptSub = q?.crewMemberId && !sub && from === `sub:${q.crewMemberId}`;
    const keptSupplier = q?.supplierId && !supplier && from === `sup:${q.supplierId}`;

    // typing the scope of a group that exists (spaces and capitals ignored) uses that group's own wording, so they stay together
    const tidyScope = (): string => scopes.find(s => scopeKeyOf(s) === scopeKeyOf(scope)) || scope.trim().replace(/\s+/g, ' ');

    const draft = (): QuoteDraft => ({
        scope: tidyScope(),
        vendorName: sub ? subNameOf(sub) : supplier ? supplier.name : keptSub || keptSupplier ? q?.vendorName || '' : vendor.trim(),
        crewMemberId: from.startsWith('sub:') ? from.slice(4) : null,
        supplierId: from.startsWith('sup:') ? from.slice(4) : null,
        amount: parseAmount(amount) ?? Number.NaN,
        inclusions: inclusions.trim() || null,
        exclusions: exclusions.trim() || null,
        notes: notes.trim() || null,
        leadTimeDays: lead.trim() === '' ? null : Number(lead),
        validUntil: validUntil || null,
        receivedOn: receivedOn || null,
        url: url.trim() || null,
    });

    const pickFile = (f: File | undefined) => {
        setErr('');
        if (!f) return;
        const problem = validateQuoteFile({ name: f.name, size: f.size, type: f.type });
        if (problem) { setErr(problem); if (fileRef.current) fileRef.current.value = ''; return; }
        setFile(f);
        setDropFile(false);
    };

    const save = async () => {
        setErr('');
        if (!isOnline) { setErr(NEEDS_CONNECTION); return; }
        const d = draft();
        const problem = validateQuoteDraft(d);
        if (problem) { setErr(problem); return; }
        setBusy(true);
        try {
            let saved: JobQuote;
            if (q) {
                saved = await updateQuote(q.id, d);
                if (file) saved = await attachQuoteFile(saved, userId, file);
                else if (dropFile && q.filePath) saved = await removeQuoteFile(saved);
            } else {
                saved = await createQuote(userId, jobId, d, file);
            }
            onSaved(saved);
            onClose();
        } catch (e) {
            if (isPlanLimitError(e)) { onClose(); onUpgrade(planLimitMessage(e)); return; }
            setErr((e as Error)?.message || 'The quote could not be saved.');
        } finally {
            setBusy(false);
        }
    };

    const hasFile = !!file || (!!q?.filePath && !dropFile);

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            size="lg"
            title={q ? 'Edit quote' : 'Add a quote'}
            description={q ? undefined : 'One price for one scope of work. Add the other prices for the same scope to compare them side by side.'}
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !isOnline}>{busy ? 'Saving…' : q ? 'Save' : 'Add quote'}</button>
                </>
            )}
        >
            <div className="space-y-4">
                {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="status">{NEEDS_CONNECTION}</p>}

                <label className="block">
                    <span className="label">Scope of work</span>
                    <input className="input" list="sub-quote-scopes" value={scope} onChange={e => setScope(e.target.value.slice(0, SUB_LIMITS.scope))} placeholder="e.g. Electrical rough-in" autoComplete="off" disabled={busy} autoFocus={!q && !presetScope} />
                    <datalist id="sub-quote-scopes">{scopes.map(s => <option key={s} value={s} />)}</datalist>
                    <span className="mt-1 block text-xs text-muted-foreground">Quotes with the same scope are compared together.</span>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="label">Quote from</span>
                        <select className="input" value={from} onChange={e => setFrom(e.target.value)} disabled={busy}>
                            <option value={OTHER}>A name I type</option>
                            {keptSub && <option value={from}>{q?.vendorName} (no longer on your subs list)</option>}
                            {keptSupplier && <option value={from}>{q?.vendorName} (no longer in your suppliers)</option>}
                            {subs.length > 0 && <optgroup label="Your subcontractors">{subs.map(m => <option key={m.id} value={`sub:${m.id}`}>{subDisplayName(m)}</option>)}</optgroup>}
                            {suppliers && suppliers.length > 0 && <optgroup label="Your suppliers">{suppliers.map(s => <option key={s.id} value={`sup:${s.id}`}>{s.name}</option>)}</optgroup>}
                        </select>
                    </label>
                    {from === OTHER ? (
                        <label className="block">
                            <span className="label">Name</span>
                            <input className="input" value={vendor} onChange={e => setVendor(e.target.value.slice(0, SUB_LIMITS.vendorName))} placeholder="e.g. Bay Electric" autoComplete="off" disabled={busy} />
                        </label>
                    ) : <span className="hidden sm:block" />}
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <label className="block">
                        <span className="label">Quoted amount</span>
                        <span className="relative block">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <input className="input pl-7 tabular-nums" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))} placeholder="4,800" disabled={busy} />
                        </span>
                    </label>
                    <label className="block">
                        <span className="label">Lead time <span className="font-normal text-muted-foreground">(days)</span></span>
                        <input className="input tabular-nums" inputMode="numeric" value={lead} onChange={e => setLead(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 14" disabled={busy} />
                    </label>
                    <label className="block">
                        <span className="label">Price valid until</span>
                        <input className="input" type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} disabled={busy} />
                    </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="label">What is included</span>
                        <textarea className="input min-h-[84px]" rows={3} value={inclusions} onChange={e => setInclusions(e.target.value.slice(0, SUB_LIMITS.longText))} placeholder="Labor, wire, devices, permit, cleanup…" disabled={busy} />
                    </label>
                    <label className="block">
                        <span className="label">What is not included</span>
                        <textarea className="input min-h-[84px]" rows={3} value={exclusions} onChange={e => setExclusions(e.target.value.slice(0, SUB_LIMITS.longText))} placeholder="Fixtures, patching, trenching…" disabled={busy} />
                    </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="label">Received on</span>
                        <input className="input" type="date" value={receivedOn} max={todayISO()} onChange={e => setReceivedOn(e.target.value)} disabled={busy} />
                    </label>
                    <label className="block">
                        <span className="label">Link to the quote <span className="font-normal text-muted-foreground">(optional)</span></span>
                        <input className="input" inputMode="url" value={url} onChange={e => setUrl(e.target.value.slice(0, SUB_LIMITS.url))} onBlur={() => { const v = url.trim(); if (v) { const r = validateHttpsUrl(v); if (r.ok) setUrl(r.url); } }} placeholder="https://…" autoComplete="off" disabled={busy} />
                    </label>
                </div>

                <div>
                    <span className="label">The quote itself <span className="font-normal text-muted-foreground">(optional PDF or photo, up to 15 MB)</span></span>
                    <div className="flex flex-wrap items-center gap-3">
                        {hasFile && (
                            <span className="min-w-0 truncate rounded-lg bg-muted px-2.5 py-1.5 text-sm">
                                {file ? `${file.name} · ${kb(file.size)}` : q?.fileName || 'File attached'}
                            </span>
                        )}
                        <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={() => fileRef.current?.click()} disabled={busy}>{hasFile ? 'Replace file' : 'Attach a file'}</button>
                        {hasFile && <button type="button" className="min-h-[40px] text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => { setFile(null); setDropFile(true); if (fileRef.current) fileRef.current.value = ''; }} disabled={busy}>Remove</button>}
                        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => pickFile(e.target.files?.[0])} />
                    </div>
                </div>

                <label className="block">
                    <span className="label">Private notes <span className="font-normal text-muted-foreground">(only you see these)</span></span>
                    <textarea className="input min-h-[64px]" rows={2} value={notes} onChange={e => setNotes(e.target.value.slice(0, SUB_LIMITS.longText))} disabled={busy} />
                </label>

                {err && <p className="text-sm font-medium text-destructive" role="alert">{err}</p>}
            </div>
        </Modal>
    );
};

export default QuoteEditorModal;
