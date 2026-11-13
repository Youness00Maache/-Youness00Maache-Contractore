import React, { useEffect, useState } from 'react';
import { CheckIcon, StarIcon, SparklesIcon, XCircleIcon, LockIcon } from './Icons.tsx';
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

    return (
        <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
            onClick={() => { if (!busyTier) onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
        >
            <div
                className="relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card text-card-foreground shadow-lift animate-zoom-in sm:max-w-5xl sm:rounded-3xl"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={onClose}
                    disabled={!!busyTier}
                    className="absolute right-3 top-3 z-10 rounded-xl p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
                    aria-label="Close"
                >
                    <XCircleIcon className="h-6 w-6" />
                </button>

                <div className="overflow-y-auto px-4 pb-6 pt-8 sm:px-8">
                    <div className="mx-auto max-w-2xl text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <StarIcon className="h-6 w-6" />
                        </div>
                        <h2 id="upgrade-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
                            {isPaid ? 'Your plan' : 'Upgrade ContractorDocs'}
                        </h2>
                        {featureName ? (
                            <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-warning/15 px-3 py-1 text-sm font-medium text-foreground">
                                <LockIcon className="h-4 w-4 text-warning" /> {featureName}
                            </p>
                        ) : (
                            <p className="mt-2 text-sm text-muted-foreground">Unlimited jobs, clients and documents. Cancel anytime.</p>
                        )}

                        <div className="mt-6 inline-flex items-center rounded-full border border-border bg-muted p-1" role="radiogroup" aria-label="Billing period">
                            {(['MONTHLY', 'YEARLY'] as BillingPeriod[]).map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    role="radio"
                                    aria-checked={period === p}
                                    onClick={() => setPeriod(p)}
                                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${period === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    {p === 'MONTHLY' ? 'Monthly' : 'Yearly'}
                                    {p === 'YEARLY' && yearlySavingsPercent > 0 && (
                                        <span className="badge badge-success">Save ~{yearlySavingsPercent}%</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
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
                                    className={`relative flex flex-col rounded-2xl border p-5 ${highlighted ? 'border-primary bg-primary/[0.04] shadow-card' : 'border-border bg-card'} ${isCurrent ? 'ring-2 ring-primary/30' : ''}`}
                                >
                                    {highlighted && (
                                        <span className="badge badge-primary absolute -top-3 left-5 bg-primary text-primary-foreground">Most popular</span>
                                    )}
                                    <div className="flex items-center gap-2">
                                        {tier === 'ai' ? <SparklesIcon className="h-5 w-5 text-primary" /> : tier === 'premium' ? <StarIcon className="h-5 w-5 text-primary" /> : null}
                                        <h3 className="text-lg font-bold">{plan.name}</h3>
                                        {isCurrent && <span className="badge badge-success ml-auto">Current</span>}
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                                    <div className="mt-4 flex items-baseline gap-1">
                                        <span className="text-3xl font-bold tracking-tight">{formatPrice(price)}</span>
                                        <span className="text-sm text-muted-foreground">{tier === 'free' ? '' : period === 'YEARLY' ? '/year' : '/month'}</span>
                                    </div>
                                    <p className="mt-1 h-4 text-xs text-muted-foreground">
                                        {perMonth ? `About ${formatPrice(Math.round(perMonth * 100) / 100)}/month, billed yearly` : tier === 'free' ? 'No credit card needed' : 'Billed monthly'}
                                    </p>
                                    <ul className="mt-4 flex-1 space-y-2.5">
                                        {plan.features.map(f => (
                                            <li key={f} className="flex items-start gap-2 text-sm text-foreground/90">
                                                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-5">{button}</div>
                                </div>
                            );
                        })}
                    </div>

                    {error && (
                        <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </p>
                    )}

                    <p className="mt-5 text-center text-xs text-muted-foreground">
                        Secure checkout by Kelviq. Prices in USD; taxes may apply. Cancel anytime from Settings → Plan &amp; billing.
                    </p>
                    <div className="mt-3 text-center">
                        <button type="button" onClick={onClose} disabled={!!busyTier} className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">
                            Maybe later
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UpgradeModal;
