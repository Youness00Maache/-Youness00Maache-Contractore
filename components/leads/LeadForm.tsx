/**
 * "Add lead" window and the fields it shares with "Edit lead" (the lead window swaps its body for these fields).
 * Validation is the pure validateLeadForm (the same contact rules as the public request page: a name and a phone or an
 * email); the save is createManualLead. Adding needs a connection like every lead write.
 */
import React, { useEffect, useState } from 'react';
import { Field, InlineError, Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { describeError } from '../../lib/account.ts';
import { todayYMD } from '../../utils/localDates.ts';
import { createManualLead } from '../../lib/leads/leadsApi.ts';
import { patchLead } from '../../lib/leads/leadsStore.ts';
import { EMPTY_LEAD_FORM, LEAD_STAGE_INFO, ORIGIN_LABELS, hasLeadErrors, validateLeadForm } from '../../lib/leads/leadLogic.ts';
import { followUpChips } from '../../lib/leads/leadViewLogic.ts';
import { LEAD_LIMITS, MANUAL_LEAD_ORIGINS, OPEN_LEAD_STAGES, type Lead, type LeadFormErrors, type LeadFormValues } from '../../lib/leads/leadTypes.ts';

export const LeadFormFields: React.FC<{
    values: LeadFormValues;
    errors: LeadFormErrors;
    onChange: (patch: Partial<LeadFormValues>) => void;
    mode: 'add' | 'edit';
    disabled?: boolean;
}> = ({ values, errors, onChange, mode, disabled }) => {
    const today = todayYMD();
    return (
        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
            <Field label="Name" htmlFor="lead-name" error={errors.name} className="col-span-2">
                <input id="lead-name" className="input" value={values.name} maxLength={LEAD_LIMITS.name} onChange={e => onChange({ name: e.target.value })} disabled={disabled} autoComplete="off" autoFocus={mode === 'add'} />
            </Field>
            <Field label="Phone" htmlFor="lead-phone" error={errors.phone} className="col-span-2 sm:col-span-1">
                <input id="lead-phone" className="input" type="tel" inputMode="tel" value={values.phone} maxLength={LEAD_LIMITS.phone} onChange={e => onChange({ phone: e.target.value })} disabled={disabled} autoComplete="off" />
            </Field>
            <Field label="Email" htmlFor="lead-email" error={errors.email} className="col-span-2 sm:col-span-1">
                <input id="lead-email" className="input" type="email" inputMode="email" value={values.email} maxLength={LEAD_LIMITS.email} onChange={e => onChange({ email: e.target.value })} disabled={disabled} autoComplete="off" />
            </Field>
            {errors.contact && <p className="col-span-2 -mt-2 text-xs font-medium text-destructive">{errors.contact}</p>}
            <Field label="Job address" htmlFor="lead-address" className="col-span-2">
                <input id="lead-address" className="input" value={values.address} maxLength={LEAD_LIMITS.address} onChange={e => onChange({ address: e.target.value })} disabled={disabled} autoComplete="off" />
            </Field>
            <Field label="What they need" htmlFor="lead-details" error={errors.details} className="col-span-2">
                <textarea id="lead-details" className="input min-h-[5rem]" rows={3} value={values.details} maxLength={LEAD_LIMITS.details} onChange={e => onChange({ details: e.target.value })} disabled={disabled} />
            </Field>
            {mode === 'add' && (
                <>
                    <Field label="Where did they come from?" htmlFor="lead-origin" error={errors.origin} className="col-span-2 sm:col-span-1">
                        <select id="lead-origin" className="input" value={values.origin} onChange={e => onChange({ origin: e.target.value as LeadFormValues['origin'] })} disabled={disabled}>
                            {MANUAL_LEAD_ORIGINS.map(o => <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>)}
                        </select>
                    </Field>
                    <Field label="Stage" htmlFor="lead-stage" error={errors.stage} className="col-span-2 sm:col-span-1">
                        <select id="lead-stage" className="input" value={values.stage} onChange={e => onChange({ stage: e.target.value as LeadFormValues['stage'] })} disabled={disabled}>
                            {OPEN_LEAD_STAGES.map(s => <option key={s} value={s}>{LEAD_STAGE_INFO[s].label}</option>)}
                        </select>
                    </Field>
                </>
            )}
            <Field label="Budget from" htmlFor="lead-budget-min" error={errors.budget} className="col-span-1">
                <input id="lead-budget-min" className="input" inputMode="decimal" placeholder="$" value={values.budgetMin} onChange={e => onChange({ budgetMin: e.target.value })} disabled={disabled} autoComplete="off" />
            </Field>
            <Field label="Budget to" htmlFor="lead-budget-max" className="col-span-1">
                <input id="lead-budget-max" className="input" inputMode="decimal" placeholder="$" value={values.budgetMax} onChange={e => onChange({ budgetMax: e.target.value })} disabled={disabled} autoComplete="off" />
            </Field>
            <Field label="Follow up on" htmlFor="lead-follow" error={errors.followUpOn} className="col-span-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <input id="lead-follow" type="date" className="input w-auto" value={values.followUpOn} onChange={e => onChange({ followUpOn: e.target.value })} disabled={disabled} />
                    {followUpChips(today).map(c => (
                        <button key={c.id} type="button" className="btn btn-outline btn-sm" onClick={() => onChange({ followUpOn: c.ymd })} disabled={disabled}>{c.label}</button>
                    ))}
                    {values.followUpOn && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ followUpOn: '' })} disabled={disabled}>Clear</button>}
                </div>
            </Field>
            <Field label="Notes" htmlFor="lead-notes" error={errors.notes} hint="Only you see these." className="col-span-2">
                <textarea id="lead-notes" className="input min-h-[4rem]" rows={2} value={values.notes} maxLength={LEAD_LIMITS.notes} onChange={e => onChange({ notes: e.target.value })} disabled={disabled} />
            </Field>
        </div>
    );
};

export const AddLeadModal: React.FC<{
    open: boolean;
    userId: string;
    onClose: () => void;
    /** the saved lead (already in the shared list) */
    onCreated: (lead: Lead) => void;
}> = ({ open, userId, onClose, onCreated }) => {
    const [values, setValues] = useState<LeadFormValues>(EMPTY_LEAD_FORM);
    const [errors, setErrors] = useState<LeadFormErrors>({});
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState('');

    useEffect(() => {
        if (open) { setValues(EMPTY_LEAD_FORM); setErrors({}); setProblem(''); setBusy(false); }
    }, [open]);

    const save = async () => {
        const found = validateLeadForm(values);
        setErrors(found);
        if (hasLeadErrors(found)) { setProblem('Please check the highlighted fields.'); return; }
        setProblem('');
        setBusy(true);
        try {
            const lead = await createManualLead(userId, values);
            patchLead(lead);
            toast.success(`${lead.name} added to your leads.`);
            onCreated(lead);
        } catch (e) {
            setProblem(describeError(e, 'The lead could not be saved.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            busy={busy}
            size="lg"
            title="Add a lead"
            description="Someone called, texted or stopped you on site? Keep them here so you remember to follow up."
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Add lead'}</button>
                </>
            )}
        >
            <div className="space-y-4">
                <LeadFormFields values={values} errors={errors} onChange={p => setValues(v => ({ ...v, ...p }))} mode="add" disabled={busy} />
                <InlineError>{problem}</InlineError>
            </div>
        </Modal>
    );
};

export default AddLeadModal;
