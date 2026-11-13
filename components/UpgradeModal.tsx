import React, { useEffect, useState } from 'react';
import { CheckIcon, LockIcon } from './Icons.tsx';
import { PLANS, isPaidTier, normalizeTier, type BillingPeriod, type PlanTier } from '../lib/plans.ts';
import { startCheckout, getBillingPortalUrl } from '../lib/billing.ts';
import { supabase } from '../lib/supabase.ts';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Why the modal opened (e.g. "You've used 6 of 6 jobs this month."). Optional. */
    featureName?: string;
    /** Legacy prop, kept for compatibility. Access is granted only by the billing webhook. */
    onUpgrade?: () => void;
    /** Signed-in user id. If omitted the modal reads it from the current session. */
    userId?: string;
    /** The user's current plan (free | premium | ai, legacy 'Basic' | 'Premium' accepted). */
    currentTier?: PlanTier | string | null;
}

const ORDER: PlanTier[] = ['free', 'premium', 'ai'];

/** Yearly discount vs paying monthly, rounded (e.g. 17). */
const yearlySavingsPercent = (() => {
    const p = PLANS.premium;
    if (!p.monthlyPrice) return 0;
    return Math.round((1 - p.yearlyPrice / (p.monthlyPrice * 12)) * 100);
})();

const formatPrice = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, featureName, userId, currentTier }) => {
    const [period, setPeriod] = useState<BillingPeriod>('YEARLY');
    const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [resolvedTier, setResolvedTier] = useState<PlanTier>(normalizeTier(currentTier));

    useEffect(() => {
        if (!isOpen) return;
        setError(null);
        setBusyTier(null);
        setResolvedTier(normalizeTier(currentTier === 'Premium' ? 'premium' : currentTier));
    }, [isOpen, currentTier]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyTier) onClose(); };
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [isOpen, busyTier, onClose]);

    if (!isOpen) return null;

    const isPaid = isPaidTier(resolvedTier);

    const handleUpgrade = async (tier: Exclude<PlanTier, 'free'>) => {
        setError(null);
        setBusyTier(tier);
        try {
            let uid = userId;
            if (!uid) {
                const { data } = await supabase.auth.getSession();
                uid = data.session?.user?.id;
            }
            if (!uid) throw new Error('Please sign in again to upgrade.');
            const { url } = await startCheckout(tier, period, uid);
            window.location.assign(url);
        } catch (err: any) {
            setError(err?.message || 'Could not start checkout. Please try again.');
            setBusyTier(null);
        }
    };

    const handleManageBilling = async (tier: PlanTier) => {
        setError(null);
        setBusyTier(tier);
        try {
            const url = await getBillingPortalUrl();
            if (!url) throw new Error('The billing portal is not available right now. Please contact support to change your plan.');
            window.location.assign(url);
        } catch (err: any) {
            setError(err?.message || 'Could not open the billing portal.');
            setBusyTier(null);
        }
    };

    const billingSwitch = (
        <div className="flex w-full items-center rounded-full border border-border bg-muted/60 p-1 sm:w-auto" role="radiogroup" aria-label="Billing period">
            {(['MONTHLY', 'YEARLY'] as BillingPeriod[]).map(p => (
                <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={period === p}
                    onClick={() => setPeriod(p)}
                    className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition sm:flex-none ${period === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    {p === 'MONTHLY' ? 'Monthly' : 'Yearly'}
                    {p === 'YEARLY' && yearlySavingsPercent > 0 && (
                        <span className="text-xs font-semibold text-success">−{yearlySavingsPercent}%</span>
                    )}
                </button>
            ))}
        </div>
    );

    return (
        <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
            onClick={() => { if (!busyTier) onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
        >
            <div
                className="relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card text-card-foreground shadow-lift animate-zoom-in sm:max-w-[1040px] sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header: title on the left; the billing switch and the close button on the right, with room around them. */}
                <div className="flex items-start gap-4 px-5 pt-5 sm:px-7 sm:pt-6">
                    <div className="min-w-0 flex-1">
                        <h2 id="upgrade-title" className="text-xl font-bold tracking-tight sm:text-[22px]">
                            {isPaid ? 'Your plan' : 'Upgrade ContractorDocs'}
                        </h2>
                        {featureName ? (
                            <p className="mt-1 flex items-start gap-1.5 text-sm font-medium text-foreground">
                                <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> {featureName}
                            </p>
                        ) : (
                            <p className="mt-1 text-sm text-muted-foreground">
                                {isPaid ? 'Change or manage your subscription.' : 'Unlimited jobs, clients and documents. Cancel anytime.'}
                            </p>
                        )}
                    </div>
                    <div className="hidden pt-0.5 sm:block">{billingSwitch}</div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={!!busyTier}
                        className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40 sm:ml-2 sm:mt-0"
                        aria-label="Close"
                        title="Close"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                </div>

                {/* Sized to fit a laptop screen without scrolling; only small phones scroll. */}
                <div className="overflow-y-auto px-5 pb-5 pt-4 [scrollbar-width:thin] sm:px-7 sm:pb-6 sm:pt-5">
                    <div className="mb-4 sm:hidden">{billingSwitch}</div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
                        {ORDER.map(tier => {
                            const plan = PLANS[tier];
                            const isCurrent = tier === resolvedTier;
                            const price = period === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
                            const perMonth = period === 'YEARLY' && plan.yearlyPrice ? plan.yearlyPrice / 12 : null;
                            const highlighted = tier === 'premium' && !isPaid;
                            const busy = busyTier === tier;

                            let button: React.ReactNode;
                            if (tier === 'free') {
                                button = (
                                    <button type="button" className="btn btn-outline w-full" disabled>
                                        {isCurrent ? 'Current plan' : 'Free forever'}
                                    </button>
                                );
                            } else if (isCurrent) {
                                button = (
                                    <button type="button" className="btn btn-outline w-full" disabled={!!busyTier} onClick={() => handleManageBilling(tier)}>
                                        {busy ? 'Opening...' : 'Current plan · Manage'}
                                    </button>
                                );
                            } else if (isPaid) {
                                button = (
                                    <button type="button" className="btn btn-secondary w-full" disabled={!!busyTier} onClick={() => handleManageBilling(tier)}>
                                        {busy ? 'Opening...' : 'Change plan'}
                                    </button>
                                );
                            } else {
                                button = (
                                    <button
                                        type="button"
                                        className={`btn w-full ${highlighted ? 'btn-primary' : 'btn-outline border-primary/40 text-primary'}`}
                                        disabled={!!busyTier}
                                        onClick={() => handleUpgrade(tier)}
                                    >
                                        {busy && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
                                        {busy ? 'Redirecting to checkout...' : `Upgrade to ${plan.name}`}
                                    </button>
                                );
                            }

                            return (
                                <div
                                    key={tier}
                                    className={`flex flex-col rounded-xl border p-5 ${highlighted || (isCurrent && isPaid) ? 'border-primary/60 shadow-card' : 'border-border'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="text-base font-semibold">{plan.name}</h3>
                                        {highlighted && <span className="text-xs font-semibold text-primary">Most popular</span>}
                                    </div>
                                    {/* two lines reserved on desktop so the prices line up across the cards */}
                                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground md:min-h-[36px]">{plan.tagline}</p>
                                    <div className="mt-3.5 flex items-baseline gap-1">
                                        <span className="text-[28px] font-bold leading-none tracking-tight">{formatPrice(price)}</span>
                                        <span className="text-sm text-muted-foreground">{tier === 'free' ? '' : period === 'YEARLY' ? '/year' : '/month'}</span>
                                    </div>
                                    <p className="mt-1.5 h-4 text-xs text-muted-foreground">
                                        {perMonth ? `About ${formatPrice(Math.round(perMonth * 100) / 100)}/month, billed yearly` : tier === 'free' ? 'No credit card needed' : 'Billed monthly'}
                                    </p>
                                    <div className="mt-3.5">{button}</div>
                                    <ul className="mt-4 flex-1 space-y-1.5 border-t border-border pt-3.5">
                                        {plan.features.map(f => (
                                            <li key={f} className="flex items-start gap-2 text-[13px] leading-snug text-foreground/85">
                                                <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>

                    {error && (
                        <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </p>
                    )}

                    <p className="mt-4 text-center text-xs text-muted-foreground sm:text-left">
                        Secure checkout by Kelviq. Prices in USD; taxes may apply. Cancel anytime from Settings → Plan &amp; billing.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default UpgradeModal;
