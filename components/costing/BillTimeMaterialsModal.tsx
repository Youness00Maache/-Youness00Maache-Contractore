/**
 * "Bill time & materials": the job's unbilled time sheets and material-log lines (and, if wanted, expense logs) since
 * the last T&M invoice become one Draft invoice, priced with the billing rate, the price book and a markup. The
 * entries are then marked billed (lib/tmInvoice.ts, lib/costingApi.ts). Free plan: the job needs a free document slot.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { Job, UserProfile } from '../../types.ts';
import { formatMoney } from '../../utils/money.ts';
import { OVERTIME_MULTIPLIER, resolveLaborRate } from '../../lib/finance.ts';
import type { CostingDoc, InventoryLite, PriceBookLite } from '../../lib/costing.ts';
import {
    buildTmLines, collectUnbilled, defaultTmPrefs, materialPrice, shortDay, tmRecordFor, type TmPrefs,
} from '../../lib/tmInvoice.ts';
import { TmPlanLimitError, createTmInvoice, fetchJobCostingDocs, type TmInvoiceResult } from '../../lib/costingApi.ts';
import { loadTmRates, saveTmRates } from '../../lib/userData.ts';
import { todayISO } from '../forms/formUtils.ts';
import { DateField, NumberField, NumberInput, Segmented } from '../forms/Fields.tsx';
import { Modal, Notice, Spinner, cx, getErrorMessage } from '../commsKit.tsx';
import { errorText } from '../../lib/offline/connection.ts';

export interface BillTimeMaterialsModalProps {
    job: Job & { clientId?: string | null };
    userId: string;
    profile: UserProfile | null;
    savedItems?: PriceBookLite[];
    inventory?: InventoryLite[];
    isOnline: boolean;
    /** Free plan: resolves true when the job can take one more document (opens the upgrade window when not) */
    ensureDocSlot: () => Promise<boolean>;
    onUpgrade: (reason?: string) => void;
    /** invoice numbers the app already knows */
    knownInvoiceNumbers?: string[];
    onClose: () => void;
    onCreated: (result: TmInvoiceResult) => void;
}

const hoursText = (h: number, ot: number) => `${h} h${ot ? ` + ${ot} h OT` : ''}`;

const Row: React.FC<{
    checked: boolean; onToggle: () => void; title: React.ReactNode; detail?: React.ReactNode; amount: number; warn?: boolean;
}> = ({ checked, onToggle, title, detail, amount, warn }) => (
    <label className={cx('flex cursor-pointer items-start gap-3 px-3 py-2.5 transition hover:bg-muted/40', !checked && 'opacity-60')}>
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={checked} onChange={onToggle} />
        <span className="min-w-0 flex-1 text-sm">
            <span className="block truncate font-medium">{title}</span>
            {detail && <span className={cx('block text-xs', warn ? 'text-warning' : 'text-muted-foreground')}>{detail}</span>}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(amount)}</span>
    </label>
);

const Group: React.FC<{ title: string; summary: string; allOn: boolean; onAll: (on: boolean) => void; children: React.ReactNode; extra?: React.ReactNode }> = ({ title, summary, allOn, onAll, children, extra }) => (
    <fieldset className="overflow-hidden rounded-2xl border border-border">
        <legend className="sr-only">{title}</legend>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
            <p className="text-sm"><span className="font-semibold">{title}</span> <span className="text-muted-foreground">· {summary}</span></p>
            <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => onAll(!allOn)}>{allOn ? 'None' : 'All'}</button>
        </div>
        {extra}
        <div className="divide-y divide-border/70">{children}</div>
    </fieldset>
);

const BillTimeMaterialsModal: React.FC<BillTimeMaterialsModalProps> = ({
    job, userId, profile, savedItems, inventory, isOnline, ensureDocSlot, onUpgrade, knownInvoiceNumbers, onClose, onCreated,
}) => {
    const costRate = resolveLaborRate(profile?.defaultLaborRate);
    const [docs, setDocs] = useState<CostingDoc[] | null>(null);
    const [loadError, setLoadError] = useState('');
    const [reload, setReload] = useState(0);
    const [prefs, setPrefs] = useState<TmPrefs | null>(null);
    const [laborSource, setLaborSource] = useState('');
    const [through, setThrough] = useState(todayISO());
    const [off, setOff] = useState<Set<string>>(() => new Set());
    const [withExpenses, setWithExpenses] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        setLoadError('');
        setDocs(null);
        Promise.all([fetchJobCostingDocs(job.id), loadTmRates().catch(() => null)])
            .then(([rows, saved]) => {
                if (!active) return;
                setDocs(rows);
                setPrefs(prev => {
                    if (prev) return prev;
                    const d = defaultTmPrefs({ saved, priceBook: savedItems, accountLaborRate: costRate });
                    setLaborSource(d.laborSource);
                    return d.prefs;
                });
            })
            .catch(err => { if (active) setLoadError(getErrorMessage(err, 'Could not load this job’s time sheets and material logs.')); });
        return () => { active = false; };
    }, [job.id, reload]); // eslint-disable-line react-hooks/exhaustive-deps

    const candidates = useMemo(
        () => (docs ? collectUnbilled(docs, { through, priceBook: savedItems, inventory }) : null),
        [docs, through, savedItems, inventory],
    );
    const selected = useMemo(() => {
        const s = new Set<string>();
        if (!candidates) return s;
        for (const e of [...candidates.labor, ...candidates.materials]) if (!off.has(e.key)) s.add(e.key);
        if (withExpenses) for (const e of candidates.expenses) if (!off.has(e.key)) s.add(e.key);
        return s;
    }, [candidates, off, withExpenses]);
    const build = useMemo(
        () => (candidates && prefs ? buildTmLines(candidates, selected, prefs, costRate) : null),
        [candidates, selected, prefs, costRate],
    );

    const toggle = (key: string) => setOff(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
    const setAll = (keys: string[], on: boolean) => setOff(prev => {
        const next = new Set(prev);
        keys.forEach(k => (on ? next.delete(k) : next.add(k)));
        return next;
    });
    const patch = (p: Partial<TmPrefs>) => setPrefs(prev => (prev ? { ...prev, ...p } : prev));

    const nothing = Boolean(candidates && !candidates.labor.length && !candidates.materials.length && !candidates.expenses.length);
    const canCreate = Boolean(build && build.lines.length > 0 && isOnline && !busy);

    const create = async () => {
        if (!candidates || !prefs || !build || !build.lines.length) return;
        if (!navigator.onLine) { setError("You're offline. Reconnect, then create the invoice."); return; }
        setBusy(true);
        setError('');
        try {
            // Free plan: one more document on this job (re-read from the server; the upgrade window opens when full)
            if (!(await ensureDocSlot())) {
                setError('This job has no free document left this month on the Free plan.');
                return;
            }
            const record = tmRecordFor(candidates, selected, prefs, build, through);
            const result = await createTmInvoice({ userId, job, profile, lines: build.lines, record, knownNumbers: knownInvoiceNumbers });
            void saveTmRates({ laborRate: prefs.laborRate, materialMarkup: prefs.materialMarkup, expenseMarkup: prefs.expenseMarkup, groupLabor: prefs.groupLabor });
            onCreated(result);
        } catch (err) {
            if (err instanceof TmPlanLimitError) {
                setError(errorText(err, 'Something went wrong. Please try again.'));
                onUpgrade(err.message);
            } else {
                setError(getErrorMessage(err, 'The invoice could not be created.'));
            }
        } finally {
            setBusy(false);
        }
    };

    const laborKeys = candidates?.labor.map(e => e.key) || [];
    const materialKeys = candidates?.materials.map(e => e.key) || [];
    const expenseKeys = candidates?.expenses.map(e => e.key) || [];
    const allOn = (keys: string[]) => keys.length > 0 && keys.every(k => !off.has(k));

    return (
        <Modal
            open
            onClose={onClose}
            locked={busy}
            size="lg"
            title="Bill time & materials"
            description={<>{job.name} · unbilled time sheets and material lines become a <strong className="font-semibold text-foreground">Draft</strong> invoice you can check before sending.</>}
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={create} disabled={!canCreate}>
                        {busy ? <Spinner label="Creating…" /> : `Create draft invoice${build && build.lines.length ? ` · ${formatMoney(build.totals.total)}` : ''}`}
                    </button>
                </>
            )}
        >
            {loadError ? (
                <Notice tone="danger" title="Couldn't load the job's entries" action={<button type="button" className="btn btn-outline btn-sm" onClick={() => setReload(n => n + 1)}>Try again</button>}>{loadError}</Notice>
            ) : !candidates || !prefs || !build ? (
                <div className="space-y-3" aria-busy="true">
                    <div className="skeleton h-16 w-full rounded-2xl" />
                    <div className="skeleton h-40 w-full rounded-2xl" />
                </div>
            ) : (
                <div className="space-y-4">
                    {!isOnline && <Notice tone="warning">You're offline. You can look, but the invoice can only be created online.</Notice>}

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <NumberField label="Labor $/h" value={prefs.laborRate} onValueChange={v => patch({ laborRate: v })} prefix="$" decimals={2} hint={laborSource} />
                        <NumberField label="Materials markup" value={prefs.materialMarkup} onValueChange={v => patch({ materialMarkup: v })} suffix="%" decimals={0} hint="Items not in your price book" />
                        <DateField label="Bill through" value={through} onChange={v => setThrough(v || todayISO())} hint={candidates.later ? `${candidates.later} later entr${candidates.later === 1 ? 'y waits' : 'ies wait'}` : undefined} />
                        <div className="min-w-0">
                            <span className="label">Labor lines</span>
                            <Segmented
                                value={prefs.groupLabor}
                                onChange={v => patch({ groupLabor: v === 'entry' ? 'entry' : 'worker' })}
                                options={[{ value: 'worker', label: 'Per worker' }, { value: 'entry', label: 'Per day' }]}
                                ariaLabel="Labor lines"
                            />
                        </div>
                    </div>

                    {candidates.lastInvoice && (
                        <p className="text-xs text-muted-foreground">
                            Last T&amp;M invoice: <span className="font-semibold text-foreground">{candidates.lastInvoice.number || 'Invoice'}</span>
                            {candidates.lastInvoice.to ? ` (through ${shortDay(candidates.lastInvoice.to)})` : ''}. Everything on it stays billed; only newer entries are listed.
                        </p>
                    )}

                    {nothing ? (
                        <Notice tone="info" title="Nothing to bill">
                            Every time sheet and material line on this job{candidates.later ? ' up to this date' : ''} is already on an invoice. Add a Time Sheet or a Material Log to the job, then come back.
                        </Notice>
                    ) : (
                        <>
                            {candidates.labor.length > 0 && (
                                <Group
                                    title="Labor"
                                    summary={`${candidates.labor.length} time sheet${candidates.labor.length === 1 ? '' : 's'} · ${hoursText(build.hours, build.overtime)} selected`}
                                    allOn={allOn(laborKeys)}
                                    onAll={on => setAll(laborKeys, on)}
                                >
                                    {candidates.labor.map(e => (
                                        <Row
                                            key={e.key}
                                            checked={!off.has(e.key)}
                                            onToggle={() => toggle(e.key)}
                                            title={`${shortDay(e.date) || 'No date'} · ${e.worker || 'Crew'}`}
                                            detail={hoursText(e.hours, e.overtime)}
                                            amount={e.hours * prefs.laborRate + e.overtime * prefs.laborRate * OVERTIME_MULTIPLIER}
                                        />
                                    ))}
                                </Group>
                            )}

                            {candidates.materials.length > 0 && (
                                <Group
                                    title="Materials"
                                    summary={`${candidates.materials.length} line${candidates.materials.length === 1 ? '' : 's'} from material logs`}
                                    allOn={allOn(materialKeys)}
                                    onAll={on => setAll(materialKeys, on)}
                                >
                                    {candidates.materials.map(e => {
                                        const price = materialPrice(e, prefs.materialMarkup);
                                        return (
                                            <Row
                                                key={e.key}
                                                checked={!off.has(e.key)}
                                                onToggle={() => toggle(e.key)}
                                                title={`${e.name} × ${e.quantity}`}
                                                detail={!(price > 0)
                                                    ? 'No cost or price yet: set it on the invoice'
                                                    : `${shortDay(e.date) || 'No date'} · ${formatMoney(price)} each ${e.bookPrice !== null && e.bookPrice > 0 ? '(price book)' : `(cost ${formatMoney(e.unitCost)} + ${prefs.materialMarkup}%)`}`}
                                                warn={!(price > 0)}
                                                amount={price * e.quantity}
                                            />
                                        );
                                    })}
                                </Group>
                            )}

                            {candidates.expenses.length > 0 && (
                                <Group
                                    title="Expense logs"
                                    summary={withExpenses ? `${candidates.expenses.length} · billed at cost + markup` : `${candidates.expenses.length} not included`}
                                    allOn={withExpenses && allOn(expenseKeys)}
                                    onAll={on => { setWithExpenses(on); setAll(expenseKeys, on); }}
                                    extra={(
                                        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
                                            <label className="flex cursor-pointer items-center gap-2">
                                                <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={withExpenses} onChange={e => setWithExpenses(e.target.checked)} />
                                                Bill expense logs too
                                            </label>
                                            {withExpenses && (
                                                <label className="flex items-center gap-2 text-muted-foreground">
                                                    Markup
                                                    <span className="w-24"><NumberInput value={prefs.expenseMarkup} onValueChange={v => patch({ expenseMarkup: v })} suffix="%" decimals={0} aria-label="Expense markup (%)" className="h-9 py-1.5" /></span>
                                                </label>
                                            )}
                                        </div>
                                    )}
                                >
                                    {withExpenses && candidates.expenses.map(e => (
                                        <Row
                                            key={e.key}
                                            checked={!off.has(e.key)}
                                            onToggle={() => toggle(e.key)}
                                            title={e.label}
                                            detail={`${shortDay(e.date) || 'No date'} · cost ${formatMoney(e.amount)}`}
                                            amount={e.amount * (1 + prefs.expenseMarkup / 100)}
                                        />
                                    ))}
                                </Group>
                            )}

                            <section aria-labelledby="tm-preview" className="rounded-2xl border border-border bg-background/60">
                                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                                    <h3 id="tm-preview" className="text-sm font-semibold">Invoice preview</h3>
                                    <span className="text-xs text-muted-foreground">{build.lines.length} line{build.lines.length === 1 ? '' : 's'} · Draft</span>
                                </div>
                                {build.lines.length === 0 ? (
                                    <p className="px-3 py-4 text-sm text-muted-foreground">Tick at least one entry.</p>
                                ) : (
                                    <ul className="divide-y divide-border/70">
                                        {build.lines.map(li => (
                                            <li key={li.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                                                <span className="min-w-0">
                                                    <span className="block break-words">{li.description}</span>
                                                    <span className="block text-xs tabular-nums text-muted-foreground">{li.quantity} × {formatMoney(li.rate)}</span>
                                                </span>
                                                <span className="shrink-0 font-medium tabular-nums">{formatMoney(li.quantity * li.rate)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="flex items-baseline justify-between border-t border-border px-3 py-2.5">
                                    <span className="text-sm font-semibold">Total <span className="font-normal text-muted-foreground">(tax can be added on the invoice)</span></span>
                                    <span className="text-lg font-bold tabular-nums">{formatMoney(build.totals.total)}</span>
                                </div>
                            </section>
                            {build.unpriced > 0 && (
                                <p className="text-xs text-warning">{build.unpriced} material line{build.unpriced === 1 ? ' has' : 's have'} no cost or price: it is added at $0 so you can set it on the invoice.</p>
                            )}
                        </>
                    )}

                    {error && <Notice tone="danger">{error}</Notice>}
                </div>
            )}
        </Modal>
    );
};

export default BillTimeMaterialsModal;
