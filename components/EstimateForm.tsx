import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormType, type EstimateData, type UserProfile, type Job, type Client, type SavedItem, type InventoryItem } from '../types.ts';
import { generateEstimatePDF } from '../services/pdfGenerator.ts';
import { computeDocumentCost, computeDocumentTotals, formatMoney, roundMoney, toNumber } from '../utils/money.ts';
import { EstimateIcon, FileTextIcon, TrendingUpIcon, EyeIcon, EyeOffIcon, InvoiceIcon, AlertTriangleIcon } from './Icons.tsx';
import ShareModal from './ShareModal.tsx';
import ShareButton from './forms/ShareButton.tsx';
import { FormShell } from './forms/FormShell.tsx';
import { DateField, FieldGrid, FormSection, MoneyField, SelectField, TextAreaField, TextField, Toggle } from './forms/Fields.tsx';
import { financingFor, normalizeHttpsUrl } from '../lib/payments.ts';
import DocumentRemindersPanel from './reminders/DocumentRemindersPanel.tsx';
import { AIInsightsSection, ApprovalSection, ClientSection, CompanySection, SignatureSection, TemplateSection } from './forms/Sections.tsx';
import LineItemsEditor from './forms/LineItemsEditor.tsx';
import TotalsPanel from './forms/TotalsPanel.tsx';
import AIFillButton from './forms/AIFillButton.tsx';
import { Spinner } from './forms/Spinner.tsx';
import { backfillCompany, DEFAULT_TEMPLATE_ID, DEFAULT_THEME, makeSeedPrefill, useDocumentForm, type SaveHandler } from './forms/useDocumentForm.ts';
import { addDaysISO, blankLineItem, isISODate, normalizeLineItems, todayISO } from './forms/formUtils.ts';
import { STATUS_OPTIONS } from './forms/documentFields.ts';
import { makeStockLookup } from './forms/inventory.ts';
import { buildInvoiceSeedFromEstimate, isClientSigned, signedChangeProblem } from './forms/signedLock.ts';
import { LockedFieldset, SignedLockBanner, makeSignatureCheck, useSignedLock } from './forms/SignedLock.tsx';
import { useEnsureDocSlot } from './forms/DocSlotContext.ts';
import { fetchInvoicesFromEstimate } from './forms/jobDocuments.ts';
import {
    applyAiOptionsDraft, applyChosenOption, canUndoApply, createOptionSet, effectiveOption, packOptionsForSave, readOptionSet,
    recordContractorChoice, removeOptions, syncMirror, undoApply, unpackOptionsForEdit, type OptionSet,
} from '../lib/estimateOptions.ts';
import { AppliedOptionStrip, EstimateOptionsEditor, OptionChoiceBar, optionTitle } from './options/EstimateOptionsEditor.tsx';
import { EstimateReviewPanel, ReviewShareNotice, useEstimateReview } from './review/EstimateReview.tsx';
import { addSuggestedLine, suggestionToLine, type ReviewFinding } from '../lib/estimateReview.ts';
import { isPaidTier, normalizeTier } from '../lib/plans.ts';
import { mergeLines, optionalLines, regularLines } from '../lib/proposal.ts';
import { clientAddonChoiceOf } from '../lib/addonChoice.ts';
import { buildMilestoneInvoiceSeed } from './forms/signedLock.ts';
import { MilestonePicker, OptionalAddOns, ProposalSection } from './proposal/ProposalBuilder.tsx';

interface Props {
    job: Job;
    profile: UserProfile;
    data: EstimateData | null;
    clients?: Client[];
    savedItems?: SavedItem[];
    inventoryItems?: InventoryItem[];
    onSave: SaveHandler<EstimateData>;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
    publicToken?: string | null;
    prefillData?: unknown;
    documentId?: string;
    existingNumbers?: string[];
    /** plan of the account (proposal templates: Free keeps one) */
    plan?: string | null;
    onUpgrade?: (reason?: string) => void;
}

/** "Convert to invoice": deposit already received + a warning when an invoice was already made from this estimate. */
const ConvertDialog: React.FC<{
    open: boolean;
    estimate: EstimateData;
    total: number;
    jobId: string;
    estimateId?: string;
    busy: boolean;
    onCancel: () => void;
    onConvert: (deposit: number, milestoneId?: string) => void;
    onOpenInvoice: (id: string) => void;
}> = ({ open, estimate, total, jobId, estimateId, busy, onCancel, onConvert, onOpenInvoice }) => {
    const [deposit, setDeposit] = useState(0);
    // payment schedule (proposal builder): '' = the whole estimate, as before
    const [milestoneId, setMilestoneId] = useState('');
    const [existing, setExisting] = useState<Array<{ id: string; number: string }>>([]);
    React.useEffect(() => {
        if (!open || !estimateId) { setExisting([]); return; }
        let active = true;
        fetchInvoicesFromEstimate(jobId, estimateId).then(list => { if (active) setExisting(list); });
        return () => { active = false; };
    }, [open, jobId, estimateId]);
    if (!open) return null;
    const lines = (estimate.lineItems || []).filter(li => String(li.description || '').trim() || toNumber(li.rate)).length;
    // good/better/best: the invoice gets the option that counts (applied / chosen / Recommended / lowest)
    const set = readOptionSet(estimate);
    const eff = set && !set.appliedId ? effectiveOption(estimate, set) : null;
    return (
        <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
            <div className="modal-panel p-6" role="dialog" aria-modal="true" aria-labelledby="convert-title" onClick={e => e.stopPropagation()}>
                <h3 id="convert-title" className="text-lg font-semibold text-foreground">Convert {estimate.estimateNumber || 'this estimate'} to an invoice</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                    Opens a new draft invoice{estimate.clientName ? ` for ${estimate.clientName}` : ''} with the {lines} line{lines === 1 ? '' : 's'}, tax and discount of this estimate ({formatMoney(total)}). You can review it before saving.
                </p>
                {set && eff && (
                    <p className="mt-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                        Uses option <span className="font-semibold">{optionTitle(set, eff.id)}</span>
                        {eff.reason === 'chosen' ? ', the client’s choice.' : eff.reason === 'recommended' ? ' (Recommended): no choice recorded yet.' : ' (lowest total): no choice recorded yet.'}
                    </p>
                )}
                {existing.length > 0 && (
                    <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
                        <p className="flex items-start gap-2 font-medium"><AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> Already converted: {existing.map(i => i.number || 'an invoice').join(', ')}.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {existing.slice(0, 3).map(i => (
                                <button key={i.id} type="button" className="btn btn-outline btn-sm min-h-[36px]" onClick={() => onOpenInvoice(i.id)}>Open {i.number || 'invoice'}</button>
                            ))}
                        </div>
                    </div>
                )}
                <MilestonePicker data={estimate as unknown as Record<string, any>} total={total} value={milestoneId} onChange={setMilestoneId} />
                {!milestoneId && (
                    <div className="mt-4">
                        <MoneyField
                            label="Deposit already received (optional)"
                            value={deposit}
                            onValueChange={v => setDeposit(Math.min(v, total))}
                            hint="Shown on the invoice as paid; the balance due is the rest."
                            fieldClassName="sm:max-w-xs"
                        />
                    </div>
                )}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => onConvert(milestoneId ? 0 : deposit, milestoneId || undefined)} disabled={busy}>
                        {busy ? <><Spinner /> Opening…</> : <><InvoiceIcon className="h-4 w-4" /> {existing.length ? 'Create another invoice' : 'Create invoice'}</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

const EstimateForm: React.FC<Props> = ({
    job, profile, data, clients = [], savedItems = [], inventoryItems = [], onSave, onBack, onUploadImage, publicToken, prefillData, documentId, existingNumbers,
    plan, onUpgrade,
}) => {
    const paidPlan = isPaidTier(normalizeTier(plan || (profile as { plan?: string }).plan || profile.subscriptionTier));
    const navigate = useNavigate();
    const ensureDocSlot = useEnsureDocSlot();
    const [showCosts, setShowCosts] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [convertOpen, setConvertOpen] = useState(false);
    const [converting, setConverting] = useState(false);
    const [financingOpen, setFinancingOpen] = useState(false);
    const download = (d: EstimateData) => generateEstimatePDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID);
    const stockLookup = useMemo(() => makeStockLookup(inventoryItems, data), [inventoryItems, data]);
    const idRef = useRef<string | undefined>(documentId);

    const form = useDocumentForm<EstimateData>({
        formType: FormType.Estimate,
        initial: data,
        prefillData,
        onSave,
        download,
        existingNumbers,
        makeDefaults: () => {
            const issueDate = todayISO();
            return {
                title: '',
                estimateNumber: '',
                issueDate,
                expiryDate: addDaysISO(30, issueDate),
                status: 'Draft',
                lineItems: [{ ...blankLineItem(), unitCost: 0 }],
                discount: 0,
                taxRate: 0,
                notes: '',
                terms: 'This estimate is valid for 30 days. Payment schedule: 50% deposit, 50% upon completion.',
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
                // financing partner link from Settings → Payments & reviews (shown when the total reaches the amount)
                ...(profile.financingLink ? { financingLink: profile.financingLink, financingMinAmount: toNumber(profile.financingMinAmount) } : {}),
            };
        },
        // good/better/best options (unpackOptionsForEdit): private line fields back on the option lines, lineItems =
        // the option that counts
        hydrate: d => unpackOptionsForEdit(backfillCompany({
            ...d,
            lineItems: normalizeLineItems(d.lineItems, false),
            discount: toNumber(d.discount),
            taxRate: toNumber(d.taxRate),
            notes: d.notes ?? '',
            terms: d.terms ?? '',
            status: d.status || 'Draft',
            // estimates made before the financing link was set get it too (never added to a signed one)
            ...(d.financingLink === undefined && profile.financingLink && !isClientSigned(d)
                ? { financingLink: profile.financingLink, financingMinAmount: toNumber(profile.financingMinAmount) }
                : {}),
        }, profile), lines => normalizeLineItems(lines, false)),
        // saved: option lines without private fields (estimateOptionsInternal), lineItems mirroring the option that counts
        prepare: d => packOptionsForSave(d),
        validate: d => {
            if (!String(d.estimateNumber || '').trim()) return 'Add an estimate number.';
            if (!isISODate(d.issueDate)) return 'Add a valid issue date.';
            if (d.expiryDate && isISODate(d.expiryDate) && d.expiryDate < d.issueDate) return 'The expiry date is before the issue date.';
            if (d.financingLink && !normalizeHttpsUrl(d.financingLink)) return 'The financing link must be a web address (https://…).';
            // Short stock never blocks saving (a payment/approval must always be recordable): the database lets stock
            // go negative and flags it in the inventory history; line rows already show stock warnings.
            return null;
        },
        // a signed estimate keeps what the client signed (QA 0b.1); "Revise" makes a new version
        guard: (next, lastSaved) => signedChangeProblem(lastSaved, next, 'estimate'),
        beforeSave: makeSignatureCheck('estimate', () => idRef.current),
    });
    const { data: d, update } = form;
    idRef.current = documentId ?? form.lastSaveResult?.id;
    const lock = useSignedLock({ form, kind: 'estimate', formType: FormType.Estimate, job, documentId: idRef.current, numberKey: 'estimateNumber' });
    const locked = lock.locked;
    // "Review estimate" (lib/estimateReview.ts): checks + AI findings; a suggested line is added only on "Add line"
    const review = useEstimateReview({ data: d, savedItems, documentId: idRef.current, jobName: job.name, clientName: d.clientName || job.clientName, language: profile.language });
    const addReviewLine = (f: ReviewFinding) => {
        if (!f.suggested) return;
        const line = suggestionToLine(f.suggested, savedItems);
        update(prev => syncMirror(addSuggestedLine(prev, line, f.optionId)));
        form.setFeedback({ tone: 'info', message: `Added “${line.description}”${toNumber(line.rate) > 0 ? '' : ' without a price: add its price'}. Review, then save.` });
    };
    const totals = computeDocumentTotals(d);
    const cost = computeDocumentCost(d);
    // revenue is what the client pays for the work (after the discount, before tax)
    const revenue = roundMoney(totals.subtotal - totals.discount);
    const profit = roundMoney(revenue - cost);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const marginTone = margin >= 30 ? 'text-success' : margin >= 15 ? 'text-warning' : 'text-destructive';
    const token = lock.newToken ?? publicToken ?? form.lastSaveResult?.public_token ?? null;
    const accepted = isClientSigned(d) || d.status === 'Accepted';
    const showFinancing = financingOpen || Boolean(d.financingLink);
    const financing = financingFor(d);
    const optionSet = readOptionSet(d);
    const optionsOn = !!optionSet && !optionSet.appliedId;

    // good/better/best options (lib/estimateOptions.ts): every option edit re-syncs lineItems to the option that counts
    const changeOptions = (fn: (set: OptionSet) => OptionSet) => update(prev => {
        const set = readOptionSet(prev);
        return set ? syncMirror({ ...prev, estimateOptions: fn(set) }) : prev;
    });
    const turnOnOptions = () => {
        update(prev => syncMirror({ ...prev, estimateOptions: createOptionSet(prev.lineItems) }));
        form.setFeedback({ tone: 'info', message: 'Options on: Good, Better and Best start with your current lines. Change each one, then send it. The client picks one when they sign.' });
    };
    const applyChoice = async () => {
        const next = applyChosenOption(form.data);
        if (!next) return;
        update(next);
        if (await form.save()) form.setFeedback({ tone: 'success', message: 'Chosen option applied: this estimate now has one total.' });
    };
    // AI fill: plain lines go into the option that counts; options drafted from this estimate's lines ("turn this into
    // good / better / best", "add a premium option") keep the user's own lines and options (applyAiOptionsDraft)
    const applyAiDraft = (payload: unknown) => {
        const before = form.data;
        const hadOptions = !!readOptionSet(before) && !readOptionSet(before)!.appliedId;
        const n = form.applyDraft(payload);
        if (!n) return n;
        const outcome = { drafted: false, added: [] as string[] };
        update(prev => {
            outcome.drafted = prev.estimateOptions !== before.estimateOptions;
            const result = applyAiOptionsDraft(prev, before);
            outcome.added = result.added;
            return result.data;
        });
        const { drafted, added } = outcome;
        if (drafted) {
            const list = added.length > 1 ? `${added.slice(0, -1).join(', ')} and ${added[added.length - 1]}` : added[0];
            form.setFeedback(!added.length
                ? { tone: 'info', message: 'This estimate already has these options, so none were added. Your options are unchanged.' }
                : hadOptions
                    ? { tone: 'info', message: `Added ${list}. Your other options are unchanged. Review, then save.` }
                    : { tone: 'info', message: `Options on: ${list}, built from your lines. Lines without a price are empty: add them, then save.` });
        }
        return n;
    };

    const openConvert = async () => {
        // the invoice links back to the SAVED estimate
        if ((await form.ensureSaved()) !== 'saved') return;
        // Free plan: the invoice is a new document on this job; check the slot before the form opens
        if (ensureDocSlot && !(await ensureDocSlot())) return;
        setConvertOpen(true);
    };
    const convert = (deposit: number, milestoneId?: string) => {
        setConverting(true);
        // one payment of the schedule (deposit invoice / progress billing), else the whole estimate as before
        const seed = (milestoneId ? buildMilestoneInvoiceSeed(form.data, idRef.current, milestoneId) : null)
            ?? buildInvoiceSeedFromEstimate(form.data, idRef.current, { deposit });
        setConvertOpen(false);
        setConverting(false);
        navigate(`/jobs/${job.id}/forms/${encodeURIComponent(FormType.Invoice)}`, { state: { prefillData: makeSeedPrefill(seed), fromJob: true } });
    };
    const convertButton = (
        <button type="button" className="btn btn-primary btn-sm min-h-[40px]" onClick={() => void openConvert()} disabled={form.busy}>
            <InvoiceIcon className="h-4 w-4" /> Convert to invoice
        </button>
    );

    return (
        <FormShell
            title="Estimate"
            subtitle={[d.estimateNumber, d.clientName].filter(Boolean).join(' · ') || 'New estimate'}
            icon={EstimateIcon}
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
            preview={{ formType: FormType.Estimate, data: d, profile, job }}
            actions={(
                <>
                    {!locked && <AIFillButton jobId={job.id} formType={FormType.Estimate} onApply={applyAiDraft} formData={d} compact />}
                    {!locked && accepted && convertButton}
                    <ShareButton ensureSaved={form.ensureSaved} onOpen={() => setShareOpen(true)} />
                </>
            )}
        >
            {locked && <SignedLockBanner data={d} kind="estimate" onRevise={lock.openRevise} actions={convertButton} />}

            <LockedFieldset locked={locked} className="space-y-6">
                <FormSection title="Estimate details" icon={FileTextIcon}>
                    <FieldGrid>
                        <TextField label="Estimate #" value={d.estimateNumber} onChange={v => update({ estimateNumber: v })} />
                        <SelectField label="Status" value={d.status} options={STATUS_OPTIONS.estimate} onChange={v => update({ status: v as EstimateData['status'] })} />
                        <DateField label="Issue date" value={d.issueDate} onChange={v => update({ issueDate: v })} />
                        <DateField
                            label="Valid until"
                            value={d.expiryDate}
                            onChange={v => update({ expiryDate: v })}
                            error={d.expiryDate && d.issueDate && d.expiryDate < d.issueDate ? 'Expiry is before the issue date.' : undefined}
                        />
                        <TextField label="Title (optional)" value={d.title} onChange={v => update({ title: v })} placeholder="e.g. Kitchen renovation quote" fieldClassName="sm:col-span-2" />
                    </FieldGrid>
                </FormSection>

                <ClientSection
                    clients={clients}
                    job={job}
                    clientId={(d as any).clientId}
                    clientName={d.clientName}
                    address={d.clientAddress}
                    onChange={patch => update(patch as Partial<EstimateData>)}
                    description="Who this estimate is for."
                />

                <CompanySection data={d} onChange={patch => update(patch)} onUploadImage={onUploadImage} />
            </LockedFieldset>

            <FormSection
                title="Items"
                description={optionsOn
                    ? 'Good / better / best: the client picks one option when they sign. Profit tools track your costs (never printed).'
                    : 'Prices the client will see. Turn on profit tools to track your costs (never printed).'}
                icon={TrendingUpIcon}
                actions={(
                    <>
                        {!locked && !optionSet && (
                            <button type="button" className="btn btn-outline btn-sm min-h-[40px]" onClick={turnOnOptions} title="Offer 2 to 4 options (Good / Better / Best); the client picks one">
                                Good / better / best
                            </button>
                        )}
                        <button type="button" className={`btn btn-sm min-h-[40px] ${showCosts ? 'btn-secondary' : 'btn-outline'}`} onClick={() => setShowCosts(s => !s)} aria-pressed={showCosts}>
                            {showCosts ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />} {showCosts ? 'Hide costs' : 'Profit tools'}
                        </button>
                    </>
                )}
            >
                {optionsOn && optionSet ? (
                    <>
                        <EstimateOptionsEditor
                            data={d}
                            set={optionSet}
                            onSetChange={changeOptions}
                            onAdjust={patch => update(prev => syncMirror({ ...prev, ...patch }))}
                            onTurnOff={() => update(prev => removeOptions(prev))}
                            locked={locked}
                            showCosts={showCosts}
                            savedItems={savedItems}
                            inventoryItems={inventoryItems}
                            availableStock={stockLookup}
                            quickMeasure={{ jobId: job.id }}
                        />
                        <OptionChoiceBar
                            data={d}
                            set={optionSet}
                            canRecord={!locked}
                            onRecord={id => changeOptions(set => recordContractorChoice(set, id))}
                            onApply={() => void applyChoice()}
                            busy={form.busy}
                        />
                    </>
                ) : (
                <LockedFieldset locked={locked} className="space-y-5">
                    {optionSet?.appliedId && (
                        <AppliedOptionStrip data={d} onUndo={!locked && canUndoApply(d) ? () => update(prev => undoApply(prev)) : undefined} />
                    )}
                    {/* regular lines here; optional add-ons (lib/proposal.ts) in their own block below */}
                    <LineItemsEditor
                        items={regularLines(d.lineItems)}
                        onChange={items => update(prev => ({ ...prev, lineItems: mergeLines(items, optionalLines(prev.lineItems)) }))}
                        showCost={showCosts}
                        rateLabel="Price"
                        savedItems={savedItems}
                        inventoryItems={inventoryItems}
                        availableStock={stockLookup}
                        quickMeasure={{ jobId: job.id }}
                    />
                    <OptionalAddOns
                        items={d.lineItems}
                        onChange={items => update({ lineItems: items })}
                        savedItems={savedItems}
                        inventoryItems={inventoryItems}
                        showCost={showCosts}
                        jobId={job.id}
                        clientChoice={clientAddonChoiceOf(d)}
                    />
                    {showCosts && (
                        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-4">
                            <div><p className="label mb-1">Revenue</p><p className="text-lg font-bold tabular-nums">{formatMoney(revenue)}</p></div>
                            <div><p className="label mb-1">Your cost</p><p className="text-lg font-bold tabular-nums">{formatMoney(cost)}</p></div>
                            <div><p className="label mb-1">Profit</p><p className={`text-lg font-bold tabular-nums ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatMoney(profit)}</p></div>
                            <div><p className="label mb-1">Margin</p><p className={`text-lg font-bold tabular-nums ${marginTone}`}>{margin.toFixed(1)}%</p></div>
                        </div>
                    )}
                    <TotalsPanel
                        totals={totals}
                        totalLabel="Estimate total"
                        adjustments={{ discount: d.discount, taxRate: d.taxRate, fields: ['discount', 'taxRate'], onChange: patch => update(patch) }}
                    />
                </LockedFieldset>
                )}
                {!locked && <EstimateReviewPanel review={review} canEdit={!locked} onAddLine={addReviewLine} />}
            </FormSection>

            {/* proposal builder: scope, payment schedule, photos, templates (lib/proposal.ts) */}
            <ProposalSection
                data={d}
                update={fn => update(prev => fn(prev))}
                total={totals.total}
                paid={paidPlan}
                jobId={job.id}
                locked={locked}
                isNew={!documentId && !data}
                onUploadImage={onUploadImage}
                onUpgrade={onUpgrade}
                onFeedback={(tone, message) => form.setFeedback({ tone, message })}
            />

            {/* automatic estimate follow-ups (components/reminders); outside the signed lock */}
            <DocumentRemindersPanel type="Estimate" documentId={idRef.current} data={d} clientId={(d as any).clientId} />

            <LockedFieldset locked={locked} className="space-y-6">
                <FormSection title="Notes & terms" description="Printed on the estimate.">
                    <TextAreaField label="Notes" value={d.notes} onChange={v => update({ notes: v })} rows={3} placeholder="Scope, exclusions, schedule…" />
                    <TextAreaField label="Terms & conditions" value={d.terms} onChange={v => update({ terms: v })} rows={4} />
                </FormSection>

                <FormSection title="Financing" description="Offer your financing partner on larger jobs. The client sees “Financing available” in the portal and on the PDF; the lender shows the terms.">
                    <Toggle
                        checked={showFinancing}
                        onChange={on => {
                            setFinancingOpen(on);
                            if (!on) update({ financingLink: '' });
                            else if (!d.financingLink && profile.financingLink) update({ financingLink: profile.financingLink, financingMinAmount: toNumber(profile.financingMinAmount) });
                        }}
                        label="Show “Financing available”"
                        description="Paste the application link from Wisetack, Hearth, GoodLeap or your lender (save it once in Settings → Payments & reviews)."
                    />
                    {showFinancing && (
                        <FieldGrid>
                            <TextField
                                label="Financing link"
                                type="url"
                                inputMode="url"
                                value={d.financingLink || ''}
                                onChange={v => update({ financingLink: v })}
                                onBlur={() => { const n = normalizeHttpsUrl(d.financingLink); if (n && n !== d.financingLink) update({ financingLink: n }); }}
                                placeholder="https://"
                                error={d.financingLink && !normalizeHttpsUrl(d.financingLink) ? 'Enter a web address starting with https://' : undefined}
                            />
                            <MoneyField
                                label="Show when the total is at least"
                                value={toNumber(d.financingMinAmount)}
                                onValueChange={v => update({ financingMinAmount: v })}
                                hint={financing
                                    ? `Shown: this estimate (${formatMoney(totals.total)}) qualifies.`
                                    : d.financingLink && normalizeHttpsUrl(d.financingLink) ? `Hidden: the total is below ${formatMoney(toNumber(d.financingMinAmount))}.` : undefined}
                            />
                        </FieldGrid>
                    )}
                </FormSection>
            </LockedFieldset>

            <ApprovalSection
                key={lock.newToken || 'approval'}
                documentId={idRef.current}
                docLabel="Estimate"
                publicToken={token}
                clientSignatureUrl={d.clientSignatureUrl}
                clientSignedAt={d.clientSignedAt}
                clientSignedBy={d.clientSignedBy}
                clientName={d.clientName}
            />

            <LockedFieldset locked={locked} className="space-y-6">
                <AIInsightsSection data={d.ai_visual_data} onRemove={() => update({ ai_visual_data: undefined })} />

                <SignatureSection value={d.signatureUrl} onChange={url => update({ signatureUrl: url })} profile={profile} description="Your signature authorizes this estimate." />
            </LockedFieldset>

            <TemplateSection templateId={d.templateId} themeColors={d.themeColors} onChange={patch => update(patch)} />

            {lock.dialogs}
            <ConvertDialog
                open={convertOpen}
                estimate={d}
                total={totals.total}
                jobId={job.id}
                estimateId={idRef.current}
                busy={converting}
                onCancel={() => setConvertOpen(false)}
                onConvert={convert}
                onOpenInvoice={id => { setConvertOpen(false); navigate(`/jobs/${job.id}/forms/${encodeURIComponent(FormType.Invoice)}/${id}`, { state: { fromJob: true } }); }}
            />

            <ShareModal
                isOpen={shareOpen}
                onClose={() => setShareOpen(false)}
                data={d}
                docType={FormType.Estimate}
                profile={profile}
                documentId={idRef.current}
                publicToken={token}
                clients={clients}
                job={job}
                hasUnsavedChanges={form.isDirty}
                onDownload={form.download}
                getPdfDataUri={async () => String(await generateEstimatePDF(profile, job, d, d.templateId || DEFAULT_TEMPLATE_ID, true) || '')}
                topNotice={!locked ? <ReviewShareNotice review={review} onReview={() => { setShareOpen(false); review.openReview(true); }} /> : undefined}
            />
        </FormShell>
    );
};

export default EstimateForm;
