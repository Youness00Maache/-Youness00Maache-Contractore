/**
 * Warranty form > "Coverage period": when the warranty starts, how long it lasts (a length, an exact end date, or
 * lifetime), a plain status line ("Active, ends 12 Mar 2028 (4 months left)") and "Void this warranty".
 *
 * Everything is written into the form's own data (documents.data.warrantyTracking + the printed `duration` text) and
 * saved by the form's normal Save, so it works offline like the rest of the form. A warranty saved before this existed
 * opens exactly as before: its end date is worked out from the work-completed day + the Duration text, and nothing is
 * stored until the person changes something here.
 *
 *   <WarrantyCoverageSection data={d} createdAt={...} update={form.update} />
 */
import React, { useState } from 'react';
import { FormSection, DateField } from '../forms/Fields.tsx';
import { Segmented } from '../forms/Fields.tsx';
import ConfirmationModal from '../ConfirmationModal.tsx';
import { todayISO } from '../forms/formUtils.ts';
import { cn } from '../../lib/utils.ts';
import { isFailure, readWarrantyTracking, unvoidWarranty, voidWarranty, withWarrantyTracking } from '../../lib/warranty/warrantyLogic.ts';
import {
    applyCoverage, coverageMode, formatDay, lengthOf, overviewOfDocument, TERM_UNITS, warrantySummary,
    type CoverageEdit, type CoverageMode, type SummaryTone,
} from '../../lib/warranty/warrantyView.ts';
import type { TermUnit } from '../../lib/warranty/types.ts';

type Data = Record<string, unknown>;
export type FormUpdate = (updater: (prev: any) => any) => void;

const TONE_RULE: Record<SummaryTone, string> = {
    good: 'border-success',
    warn: 'border-warning',
    bad: 'border-destructive',
    muted: 'border-border',
};

interface Props {
    data: Data;
    /** documents.created_at when the warranty is saved (fallback start day) */
    createdAt?: string | null;
    update: FormUpdate;
}

const WarrantyCoverageSection: React.FC<Props> = ({ data, createdAt, update }) => {
    const today = todayISO();
    const overview = overviewOfDocument(data, createdAt, today);
    const tracking = overview.tracking;
    const summary = warrantySummary(overview);
    const [mode, setMode] = useState<CoverageMode>(() => coverageMode(overview));
    const length = lengthOf(overview);
    // the boxes keep what is being typed (an empty box or a half-typed number must not snap back to the saved value)
    const [lengthText, setLengthText] = useState(() => String(length.value ?? ''));
    const [unit, setUnit] = useState<TermUnit>(length.unit);
    const [error, setError] = useState<string | null>(null);
    const [confirmVoid, setConfirmVoid] = useState(false);
    const isVoid = !!tracking.voidedAt;
    const startDefault = formatDay(overview.startDate);
    const lengthValue = () => (Number.isInteger(Number(lengthText)) && lengthText.trim() !== '' ? Number(lengthText) : null);

    const apply = (edit: CoverageEdit) => {
        const r = applyCoverage(data, edit);
        if (isFailure(r)) { setError(r.message); return false; }
        setError(null);
        update(prev => {
            const again = applyCoverage(prev as Data, edit);
            return isFailure(again) ? prev : (again as { data: Data }).data;
        });
        return true;
    };

    const chooseMode = (next: CoverageMode) => {
        setMode(next);
        if (next === 'length') {
            const value = length.value ?? 1;
            const u = length.value ? length.unit : 'years';
            setLengthText(String(value));
            setUnit(u);
            apply({ mode: 'length', value, unit: u });
        } else if (next === 'date') {
            apply({ mode: 'date', expiresOn: overview.expiresOn });
        } else {
            apply({ mode: 'lifetime' });
        }
    };

    const onLength = (text: string, nextUnit: TermUnit = unit) => {
        setLengthText(text);
        setUnit(nextUnit);
        const n = Number(text);
        if (text.trim() === '' || !Number.isInteger(n)) {
            setError(text.trim() === '' ? null : 'Enter a whole number.');
            return;
        }
        apply({ mode: 'length', value: n, unit: nextUnit });
    };

    const setVoid = (on: boolean) =>
        update(prev => withWarrantyTracking(prev as Data, on ? voidWarranty(readWarrantyTracking(prev as Data), new Date()) : unvoidWarranty(readWarrantyTracking(prev as Data))));

    return (
        <FormSection title="Coverage period" description="When the warranty starts and ends. The reminder emails and the status below follow these dates.">
            <div className={cn('rounded-xl border-l-4 bg-muted/40 px-3.5 py-2.5', TONE_RULE[summary.tone])} role="status">
                <p className="text-sm font-semibold text-foreground">{summary.text}</p>
                {overview.startDate && !isVoid && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Started {formatDay(overview.startDate)}
                        {overview.source === 'duration_text' ? ', end date worked out from the Duration above' : ''}
                    </p>
                )}
            </div>

            {isVoid ? (
                <div className="flex flex-col gap-2 rounded-xl bg-muted/60 px-3.5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-muted-foreground">This warranty is void. No warranty emails go out. Its claims history stays here.</span>
                    <button type="button" className="btn btn-sm btn-outline min-h-[36px] self-start sm:self-auto" onClick={() => setVoid(false)}>Restore warranty</button>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <DateField
                            label="Starts on"
                            value={tracking.startDate ?? ''}
                            onChange={v => apply({ mode, startDate: v, value: mode === 'length' ? lengthValue() : null, unit, expiresOn: tracking.expiresOn ?? null })}
                            hint={tracking.startDate
                                ? <button type="button" className="font-semibold text-primary hover:underline" onClick={() => apply({ mode, startDate: null, value: mode === 'length' ? lengthValue() : null, unit, expiresOn: tracking.expiresOn ?? null })}>Use the work-completed day instead</button>
                                : `Left empty, it starts on the day the work was completed${startDefault ? ` (${startDefault})` : ''}.`}
                        />
                        <div className="min-w-0">
                            <span className="label">Lasts</span>
                            <Segmented
                                ariaLabel="How the end of the warranty is set"
                                value={mode}
                                onChange={v => chooseMode(v as CoverageMode)}
                                options={[{ value: 'length', label: 'A length' }, { value: 'date', label: 'Until a date' }, { value: 'lifetime', label: 'Lifetime' }]}
                            />
                        </div>
                    </div>

                    {mode === 'length' && (
                        <div className="max-w-sm">
                            <label className="label" htmlFor="warranty-length">Length</label>
                            <div className="flex gap-2">
                                <input
                                    id="warranty-length"
                                    className="input w-24 tabular-nums"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={lengthText}
                                    onChange={e => onLength(e.target.value.replace(/[^0-9]/g, ''))}
                                    aria-label="How long the warranty lasts"
                                />
                                <select className="input w-auto pr-8" value={unit} onChange={e => onLength(lengthText, e.target.value as TermUnit)} aria-label="Days, months or years">
                                    {TERM_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                            </div>
                            <p className="mt-1.5 text-xs text-muted-foreground">The certificate prints this as the Duration.</p>
                        </div>
                    )}
                    {mode === 'date' && (
                        <div className="max-w-sm">
                            <DateField
                                label="Last day covered"
                                value={tracking.expiresOn ?? ''}
                                onChange={v => apply({ mode: 'date', startDate: tracking.startDate ?? undefined, expiresOn: v })}
                                hint="An exact end date wins over the Duration text, which still prints as you wrote it."
                            />
                        </div>
                    )}
                    {mode === 'lifetime' && <p className="text-sm text-muted-foreground">No end date, so no ending-soon emails. The certificate prints “Lifetime”.</p>}

                    {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}

                    <div className="border-t border-border pt-3">
                        <button type="button" className="text-sm font-semibold text-destructive hover:underline" onClick={() => setConfirmVoid(true)}>Void this warranty</button>
                    </div>
                </>
            )}

            <ConfirmationModal
                isOpen={confirmVoid}
                onClose={() => setConfirmVoid(false)}
                onConfirm={() => setVoid(true)}
                title="Void this warranty?"
                message="It stops counting as active and no warranty emails go out for it. The claims history is kept, and you can restore it later. Save the warranty to keep this change."
                confirmLabel="Void warranty"
                isDestructive
            />
        </FormSection>
    );
};

export default WarrantyCoverageSection;
