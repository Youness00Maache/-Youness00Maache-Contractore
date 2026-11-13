import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.ts';
import { PLANS, isPaidTier, normalizeTier, type PlanTier } from '../lib/plans.ts';
import { CheckCircleIcon, ClockIcon, SparklesIcon } from './Icons.tsx';
import { SUPPORT_EMAIL } from '../lib/account.ts';

interface BillingSuccessProps {
    userId: string;
    /** Called once the paid plan is visible, so the app can refresh its profile. */
    onActivated?: (tier: PlanTier) => void;
    onGoToDashboard: () => void;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

type Phase = 'checking' | 'active' | 'timeout';

/**
 * `/billing/success`: Kelviq sends the customer here after checkout. Access is granted only by the
 * signature-verified webhook, so we poll the profile until the tier flips (never write it from here).
 */
const BillingSuccess: React.FC<BillingSuccessProps> = ({ userId, onActivated, onGoToDashboard }) => {
    const [phase, setPhase] = useState<Phase>('checking');
    const [tier, setTier] = useState<PlanTier>('free');
    const [attempt, setAttempt] = useState(0);
    const activatedRef = useRef(false);

    const check = useCallback(async (): Promise<PlanTier | null> => {
        const { data, error } = await supabase.from('profiles').select('subscription_tier').eq('id', userId).maybeSingle();
        if (error || !data) return null;
        const t = normalizeTier((data as any).subscription_tier);
        return isPaidTier(t) ? t : null;
    }, [userId]);

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const startedAt = Date.now();
        setPhase('checking');

        const tick = async () => {
            const paid = await check().catch(() => null);
            if (cancelled) return;
            if (paid) {
                setTier(paid);
                setPhase('active');
                if (!activatedRef.current) {
                    activatedRef.current = true;
                    onActivated?.(paid);
                }
                return;
            }
            if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
                setPhase('timeout');
                return;
            }
            timer = setTimeout(tick, POLL_INTERVAL_MS);
        };
        tick();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt, check]);

    return (
        <div className="page flex min-h-[80vh] items-center justify-center">
            <div className="card card-pad w-full max-w-md text-center animate-fade-in-up">
                {phase === 'checking' && (
                    <>
                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                            <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary border-r-transparent" aria-hidden />
                        </div>
                        <h1 className="text-xl font-bold">Activating your plan...</h1>
                        <p className="mt-2 text-sm text-muted-foreground" role="status" aria-live="polite">
                            Thanks for your purchase! We're confirming your payment. This usually takes a few seconds.
                        </p>
                    </>
                )}

                {phase === 'active' && (
                    <>
                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success">
                            <CheckCircleIcon className="h-8 w-8" />
                        </div>
                        <h1 className="text-2xl font-bold">You're on {PLANS[tier].name}!</h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Your account is upgraded. Unlimited jobs, clients and documents are unlocked
                            {tier === 'ai' ? ', plus the full AI assistant.' : '.'}
                        </p>
                        <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm">
                            {PLANS[tier].features.slice(0, 4).map(f => (
                                <li key={f} className="flex items-start gap-2">
                                    <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>{f}</span>
                                </li>
                            ))}
                        </ul>
                        <button type="button" className="btn btn-primary btn-lg mt-6 w-full" onClick={onGoToDashboard}>
                            Go to dashboard
                        </button>
                    </>
                )}

                {phase === 'timeout' && (
                    <>
                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/15 text-warning">
                            <ClockIcon className="h-8 w-8" />
                        </div>
                        <h1 className="text-xl font-bold">Almost there</h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Your payment went through, but activation hasn't reached your account yet. It can take a minute,
                            and you'll also get a confirmation email. You can keep working in the meantime.
                        </p>
                        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                            <button type="button" className="btn btn-primary flex-1" onClick={() => setAttempt(a => a + 1)}>
                                Check again
                            </button>
                            <button type="button" className="btn btn-outline flex-1" onClick={onGoToDashboard}>
                                Go to dashboard
                            </button>
                        </div>
                        <p className="mt-4 text-xs text-muted-foreground">
                            Still not active after a few minutes? Email{' '}
                            <a className="font-medium text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Plan not activated')}`}>{SUPPORT_EMAIL}</a>.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default BillingSuccess;
