/**
 * Setup assistant screens 1-4 and 7: business, contact, tax and terms, what you do, get paid. Each one saves through
 * the path the same fields already use (Settings save, user_settings, the labor rate field), never a second copy.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UploadImageIcon } from '../Icons.tsx';
import { compressImage } from '../../utils/imageCompression.ts';
import { errorText } from '../../lib/offline/connection.ts';
import { StepFrame, SField, inputCls } from './StepFrame.tsx';
import type { SetupCtx } from './ctx.ts';
import { DUE_DAY_CHOICES, hasMoneyDefaults, moneyEntryProblem, normalizeMoneyDefaults } from '../../lib/setup/moneyDefaults.ts';
import { currentMoneyDefaults, loadMoneyDefaults, saveMoneyDefaults } from '../../lib/setup/moneyStore.ts';
import { SETUP_TRADES, toggleTrade } from '../../lib/setup/trades.ts';
import { parseRate } from '../../lib/userDataSync.ts';
import { rememberLaborRate } from '../../lib/finance.ts';
import { saveLaborRateToAccount } from '../../lib/userData.ts';
import { PAY_SERVICES, mapPaymentSettings, paymentSettingsOf, paymentSettingsProblem, paymentSettingsRow, type PaymentSettings } from '../../lib/payments.ts';
import { savePaymentSettings } from '../../lib/paymentsApi.ts';

const failText = (e: unknown) => errorText(e, 'That could not be saved. Please try again.');

// ------------------------------------------------------------------------------------------ 1. business
export const BusinessStep: React.FC<{ ctx: SetupCtx }> = ({ ctx }) => {
    const p = ctx.profile;
    const [name, setName] = useState(p.companyName || '');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [preview, setPreview] = useState(p.logoUrl || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const blobRef = useRef<string | null>(null);
    useEffect(() => () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); }, []);

    const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setError(null);
        if (!file.type.startsWith('image/')) { setError('Please choose an image file (PNG, JPG or WebP).'); return; }
        if (file.size > 10 * 1024 * 1024) { setError('That image is larger than 10 MB. Please choose a smaller one.'); return; }
        try {
            const compressed = await compressImage(file);
            if (blobRef.current) URL.revokeObjectURL(blobRef.current);
            blobRef.current = URL.createObjectURL(compressed);
            setLogoFile(compressed);
            setPreview(blobRef.current);
        } catch { setError('We could not read that image. Try a different file.'); }
    };

    const save = async () => {
        const n = name.trim();
        if (!n && !(p.companyName || '').trim()) { setError('Add your company name, or skip this step.'); return; }
        // a name without a logo is a finished step: leaving the logo out on purpose counts as skipping that part
        const finish = () => { if (!preview) ctx.markSkipped('business'); ctx.next(); };
        if (n === (p.companyName || '').trim() && !logoFile) { finish(); return; }
        setBusy(true); setError(null);
        try {
            await ctx.saveProfile({ ...p, companyName: n }, logoFile);
            await ctx.refresh();
            finish();
        } catch (e) { setError(failText(e)); } finally { setBusy(false); }
    };

    return (
        <StepFrame ctx={ctx} id="business" busy={busy} error={error} onPrimary={save}>
            <SField label="Company name" htmlFor="setup-company" hint="Printed at the top of every estimate and invoice.">
                <input id="setup-company" className={inputCls} value={name} onChange={e => setName(e.target.value)} autoComplete="organization" placeholder="e.g. Rivera Home Repair" maxLength={120} />
            </SField>
            <div>
                <span className="label">Logo</span>
                <div className="flex items-center gap-4 rounded-2xl border border-dashed border-border p-3">
                    <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
                        {preview ? <img src={preview} alt="Your logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-zinc-400">No logo yet</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                        <label className="btn btn-outline h-11 cursor-pointer">
                            <UploadImageIcon className="h-4 w-4" /> {preview ? 'Replace logo' : 'Upload logo'}
                            <input type="file" accept="image/*" className="sr-only" onChange={pick} />
                        </label>
                        <p className="mt-1.5 text-xs text-muted-foreground">No logo? Documents still show your company name. Add one any time.</p>
                    </div>
                </div>
            </div>
        </StepFrame>
    );
};

// ------------------------------------------------------------------------------------------ 2. contact
export const ContactStep: React.FC<{ ctx: SetupCtx }> = ({ ctx }) => {
    const p = ctx.profile;
    const [v, setV] = useState({ name: p.name || '', phone: p.phone || '', email: p.email || '', address: p.address || '', website: p.website || '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV(prev => ({ ...prev, [k]: e.target.value }));

    const save = async () => {
        const changed = (['name', 'phone', 'email', 'address', 'website'] as const).some(k => v[k].trim() !== (p[k] || '').trim());
        if (!changed) { ctx.next(); return; }
        setBusy(true); setError(null);
        try {
            await ctx.saveProfile({ ...p, name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim(), address: v.address.trim(), website: v.website.trim() });
            await ctx.refresh();
            ctx.next();
        } catch (e) { setError(failText(e)); } finally { setBusy(false); }
    };

    return (
        <StepFrame ctx={ctx} id="contact" busy={busy} error={error} onPrimary={save}>
            <div className="grid gap-4 sm:grid-cols-2">
                <SField label="Your name" htmlFor="setup-name"><input id="setup-name" className={inputCls} value={v.name} onChange={set('name')} autoComplete="name" /></SField>
                <SField label="Phone" htmlFor="setup-phone"><input id="setup-phone" type="tel" className={inputCls} value={v.phone} onChange={set('phone')} autoComplete="tel" /></SField>
                <SField label="Email on documents" htmlFor="setup-email"><input id="setup-email" type="email" className={inputCls} value={v.email} onChange={set('email')} autoComplete="email" /></SField>
                <SField label="Website (optional)" htmlFor="setup-website"><input id="setup-website" className={inputCls} value={v.website} onChange={set('website')} placeholder="https://" autoComplete="url" /></SField>
            </div>
            <SField label="Business address" htmlFor="setup-address" hint="Shown under your company name on documents.">
                <input id="setup-address" className={inputCls} value={v.address} onChange={set('address')} autoComplete="street-address" />
            </SField>
        </StepFrame>
    );
};

// ------------------------------------------------------------------------------------ 3. tax and terms
const DEPOSIT_TEXT = 'A 50% deposit is due to schedule the work. The balance is due when the work is finished.';
const LATE_FEE_TEXT = 'A late fee of 1.5% per month applies to balances unpaid after the due date.';

export const MoneyStep: React.FC<{ ctx: SetupCtx }> = ({ ctx }) => {
    const saved = useMemo(() => currentMoneyDefaults(), []);
    const [tax, setTax] = useState(saved?.taxRate != null ? String(saved.taxRate) : '');
    const [due, setDue] = useState<number | null>(saved?.dueDays ?? null);
    const [terms, setTerms] = useState(saved?.estimateTerms ?? '');
    const [note, setNote] = useState(saved?.invoiceNote ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const touched = useRef(false);
    const mark = () => { touched.current = true; };

    // the account's copy (another device) fills in when nothing was typed yet
    useEffect(() => {
        let live = true;
        loadMoneyDefaults().then(d => {
            if (!live || !d || touched.current) return;
            setTax(d.taxRate != null ? String(d.taxRate) : ''); setDue(d.dueDays); setTerms(d.estimateTerms); setNote(d.invoiceNote);
        }).catch(() => undefined);
        return () => { live = false; };
    }, []);

    const save = async () => {
        const problem = moneyEntryProblem({ taxRate: tax, dueDays: due === null ? '' : String(due) });
        if (problem) { setError(problem); return; }
        const next = normalizeMoneyDefaults({ taxRate: tax, dueDays: due, estimateTerms: terms, invoiceNote: note });
        if (!hasMoneyDefaults(next) && !hasMoneyDefaults(saved)) { ctx.next(); return; }
        setBusy(true); setError(null);
        try {
            const mode = await saveMoneyDefaults(next);
            if (mode === 'failed') { setError('This browser would not keep the settings. Free some space or allow site data, then try again.'); return; }
            if (mode !== 'account') setNotice('Saved on this device. It reaches your account when you are back online.');
            await ctx.refresh();
            ctx.next();
        } catch (e) { setError(failText(e)); } finally { setBusy(false); }
    };

    return (
        <StepFrame ctx={ctx} id="money" busy={busy} error={error} notice={notice} onPrimary={save}>
            <div className="grid gap-4 sm:grid-cols-2">
                <SField label="Sales tax (%)" htmlFor="setup-tax" hint="New estimates and invoices start with this. Leave empty if you do not charge tax. Change it on any document.">
                    <input id="setup-tax" inputMode="decimal" className={inputCls} value={tax} onChange={e => { mark(); setTax(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6)); }} placeholder="e.g. 8.25" />
                </SField>
                <div>
                    <span className="label">Invoices are due</span>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Invoices are due">
                        {DUE_DAY_CHOICES.map(c => (
                            <button key={c.days} type="button" aria-pressed={due === c.days} onClick={() => { mark(); setDue(due === c.days ? null : c.days); }}
                                className={`h-11 rounded-full border px-3.5 text-sm font-medium transition ${due === c.days ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}`}>
                                {c.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{due === null ? 'Not chosen: invoices are due in 30 days, as before.' : 'Sets the due date of new invoices.'}</p>
                </div>
            </div>
            <SField label="Deposit and payment terms on estimates" htmlFor="setup-terms">
                <textarea id="setup-terms" rows={3} className={`${inputCls} h-auto py-3`} value={terms} onChange={e => { mark(); setTerms(e.target.value); }} maxLength={1500}
                    placeholder="This estimate is valid for 30 days. Payment schedule: 50% deposit, 50% upon completion." />
                <button type="button" className="mt-2 h-9 rounded-full border border-border px-3 text-xs font-medium hover:bg-muted" onClick={() => { mark(); setTerms(DEPOSIT_TEXT); }}>Use 50% deposit wording</button>
            </SField>
            <SField label="Note on invoices" htmlFor="setup-note" hint="Thank-you, how to pay, late fees. Edit it freely on each invoice.">
                <textarea id="setup-note" rows={3} className={`${inputCls} h-auto py-3`} value={note} onChange={e => { mark(); setNote(e.target.value); }} maxLength={1500} placeholder="Thank you for your business." />
                <button type="button" className="mt-2 h-9 rounded-full border border-border px-3 text-xs font-medium hover:bg-muted" onClick={() => { mark(); setNote(n => (n.trim() ? `${n.trim()}\n${LATE_FEE_TEXT}` : LATE_FEE_TEXT)); }}>Add late-fee wording</button>
            </SField>
        </StepFrame>
    );
};

// -------------------------------------------------------------------------------------- 4. what you do
export const TradeStep: React.FC<{ ctx: SetupCtx }> = ({ ctx }) => {
    const [trades, setTradesLocal] = useState<string[]>(ctx.state.trades);
    const current = ctx.profile.defaultLaborRate && ctx.profile.defaultLaborRate > 0 ? ctx.profile.defaultLaborRate : null;
    const [rate, setRate] = useState(current !== null ? String(current) : '');
    const [error, setError] = useState<string | null>(null);

    const save = () => {
        const typed = rate.trim();
        const value = typed === '' ? null : parseRate(typed.replace(',', '.'));
        if (typed !== '' && value === null) { setError('Type your hourly rate as a number, like 65.'); return; }
        ctx.setTrades(trades);
        if (value !== null && value !== current) {
            rememberLaborRate(value);
            saveLaborRateToAccount(value);
            ctx.patchProfile({ defaultLaborRate: value });
        }
        ctx.next();
    };

    return (
        <StepFrame ctx={ctx} id="trade" error={error} onPrimary={save}>
            <div>
                <span className="label">Your trades (pick any)</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Your trades">
                    {SETUP_TRADES.map(t => {
                        const on = trades.includes(t.id);
                        return (
                            <button key={t.id} type="button" aria-pressed={on} onClick={() => setTradesLocal(toggleTrade(trades, t.id))}
                                className={`h-12 rounded-full border px-4 text-sm font-semibold transition ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}`}>
                                {t.label}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">Your trades decide which ready-made kits are offered in the next step.</p>
            </div>
            <SField label="Hourly labor rate ($/hour)" htmlFor="setup-rate" hint="Kits, job profit tracking and time-and-materials bills use this. Change it any time in Job financials.">
                <input id="setup-rate" inputMode="decimal" className={`${inputCls} sm:max-w-[12rem]`} value={rate} onChange={e => { setRate(e.target.value.replace(/[^\d.,]/g, '').slice(0, 8)); setError(null); }} placeholder="e.g. 65" />
            </SField>
        </StepFrame>
    );
};

// ----------------------------------------------------------------------------------------- 7. get paid
const PAY_PLACEHOLDER: Record<string, string> = {
    PayPal: 'https://paypal.me/yourname', Venmo: 'https://venmo.com/yourname', Square: 'https://square.link/u/…', Stripe: 'https://buy.stripe.com/…',
    'Cash App': 'https://cash.app/$yourname', Zelle: 'https://', 'Bank transfer': 'https://',
};

export const GetPaidStep: React.FC<{ ctx: SetupCtx }> = ({ ctx }) => {
    const p = ctx.profile;
    const baseline = useMemo(() => paymentSettingsOf(p), []); // eslint-disable-line react-hooks/exhaustive-deps
    const [pay, setPay] = useState<PaymentSettings>(baseline);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const update = (patch: Partial<PaymentSettings>) => { setError(null); setPay(prev => ({ ...prev, ...patch })); };

    const save = async () => {
        const changed = pay.payLinkDefault !== baseline.payLinkDefault || pay.payLinkLabel !== baseline.payLinkLabel || pay.googleReviewLink !== baseline.googleReviewLink;
        if (!changed) { ctx.next(); return; }
        const problem = paymentSettingsProblem(pay);
        if (problem) { setError(problem); return; }
        setBusy(true); setError(null);
        try {
            // the same two steps as Settings > Payments & reviews: the payment columns, then the settings save (offline: the outbox)
            let savedPay: PaymentSettings | null = null;
            if (typeof navigator !== 'undefined' && navigator.onLine === false) savedPay = mapPaymentSettings(paymentSettingsRow(pay));
            else if (await savePaymentSettings(ctx.userId, pay) === 'saved') savedPay = mapPaymentSettings(paymentSettingsRow(pay));
            else { setNotice('Payment links need a one-time database update before they can be saved here. Nothing was lost.'); return; }
            await ctx.saveProfile({ ...p, ...(savedPay || {}) }, null, { paymentSettings: savedPay ? pay : null });
            await ctx.refresh();
            ctx.next();
        } catch (e) { setError(failText(e)); } finally { setBusy(false); }
    };

    return (
        <StepFrame ctx={ctx} id="getpaid" busy={busy} error={error} notice={notice} onPrimary={save}>
            <div>
                <span className="label">How do clients pay you?</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Payment service">
                    {PAY_SERVICES.map(s => (
                        <button key={s} type="button" aria-pressed={pay.payLinkLabel === s} onClick={() => update({ payLinkLabel: pay.payLinkLabel === s ? '' : s })}
                            className={`h-11 rounded-full border px-3.5 text-sm font-medium transition ${pay.payLinkLabel === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}`}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>
            <SField label="Payment link" htmlFor="setup-paylink" hint="New invoices get a Pay now button and a scan-to-pay code with this link. The money goes straight to you.">
                <input id="setup-paylink" type="url" inputMode="url" className={inputCls} value={pay.payLinkDefault} onChange={e => update({ payLinkDefault: e.target.value })} placeholder={PAY_PLACEHOLDER[pay.payLinkLabel] || 'https://paypal.me/yourcompany'} autoComplete="off" />
            </SField>
            <SField label="Google review link (optional)" htmlFor="setup-review" hint="Used for the thank-you message after an invoice is paid. Find it in your Google Business Profile under Ask for reviews.">
                <input id="setup-review" type="url" inputMode="url" className={inputCls} value={pay.googleReviewLink} onChange={e => update({ googleReviewLink: e.target.value })} placeholder="https://g.page/r/…/review" autoComplete="off" />
            </SField>
        </StepFrame>
    );
};
