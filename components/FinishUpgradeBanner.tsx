import React from 'react';
import { SparklesIcon } from './Icons.tsx';

interface FinishUpgradeBannerProps {
    planName: string;
    period: 'monthly' | 'yearly';
    busy?: boolean;
    onUpgrade: () => void;
    onDismiss: () => void;
}

/**
 * Small, dismissible reminder for a plan picked on the website whose checkout was not completed
 * (lib/pendingPlan.ts decides when: at most once a day, for 7 days). Never forces checkout.
 */
const FinishUpgradeBanner: React.FC<FinishUpgradeBannerProps> = ({ planName, period, busy, onUpgrade, onDismiss }) => (
    <div role="status" className="border-b border-border bg-accent text-accent-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm sm:px-6">
            <SparklesIcon className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
            <p className="min-w-0 flex-1">
                Finish upgrading to <strong>{planName}</strong> <span className="text-muted-foreground">({period})</span>. Your account is on the Free plan until you complete checkout.
            </p>
            <div className="flex items-center gap-1">
                <button type="button" onClick={onUpgrade} disabled={busy} className="btn btn-primary h-9 px-3 text-sm">
                    {busy ? 'Opening checkout…' : 'Finish upgrading'}
                </button>
                <button
                    type="button"
                    onClick={onDismiss}
                    disabled={busy}
                    aria-label="Dismiss"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                        <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                </button>
            </div>
        </div>
    </div>
);

export default FinishUpgradeBanner;
