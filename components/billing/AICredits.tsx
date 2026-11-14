/**
 * AI credit top-ups (lib/aiCredits.ts). Three small pieces, all hidden while the server says the feature is off:
 *   <AICreditsRow />                 Settings › Plan & billing: balance, Buy credits, automatic top-up
 *   <BuyCreditsButton />             AI panel at the monthly limit (CREDITS_EMPTY): "Buy more credits" → pack → checkout
 *   <AICreditsStrip reason={…} />    upgrade window opened by an AI limit: the packs under the plans
 * Design-system classes only (light / dark / blue themes).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
    AUTO_RECHARGE, creditsText, getAiCreditsStatus, isCreditsCheckoutReturn, lastRechargeNote, MIN_CREDIT_PURCHASE_USD, packById,
    saveAutoRecharge, startCreditsCheckout, type AiCreditPack, type AiCreditsStatus,
} from '../../lib/aiCredits.ts';
import { Switch, InlineNote, cx } from '../reminders/ui.tsx';

/** "$10" over "220 credits": one segmented control, the pack is the choice. */
export const PackPicker: React.FC<{
    packs: AiCreditPack[];
    value: string;
    onChange: (packId: string) => void;
    disabled?: boolean;
    label?: string;
}> = ({ packs, value, onChange, disabled, label = 'Credit pack' }) => (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-4 overflow-hidden rounded-xl border border-border">
        {packs.map((p, i) => {
            const on = p.id === value;
            return (
                <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={disabled}
                    onClick={() => onChange(p.id)}
                    className={cx(
                        'flex min-h-[48px] flex-col items-center justify-center px-1 py-1.5 leading-tight transition disabled:opacity-50',
                        i > 0 && 'border-l border-border',
                        on ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted',
                    )}
                >
                    <span className="text-[15px] font-bold tabular-nums">${p.price}</span>
                    <span className={cx('text-[11px] tabular-nums', on ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{p.credits.toLocaleString('en-US')} credits</span>
                </button>
            );
        })}
    </div>
);

const useCheckout = () => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const buy = useCallback(async (packId: string) => {
        setBusy(true);
        setError(null);
        try {
            window.location.assign(await startCreditsCheckout(packId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start checkout. Please try again.');
            setBusy(false);
        }
    }, []);
    return { busy, error, buy };
};

const shortDate = (iso: string | null | undefined) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
};

// ───────────────────────────── Settings row ─────────────────────────────

export const AICreditsRow: React.FC = () => {
    const location = useLocation();
    const returning = isCreditsCheckoutReturn(location.search);
    const [status, setStatus] = useState<AiCreditsStatus | null>(null);
    const [pack, setPack] = useState<string>(AUTO_RECHARGE.defaultPack);
    const [waiting, setWaiting] = useState(returning);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const checkout = useCheckout();
    const startBalance = useRef<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        getAiCreditsStatus({ fresh: returning }).then(s => {
            if (cancelled) return;
            setStatus(s);
            setPack(s.autoRecharge.pack);
            startBalance.current = s.balance;
        });
        return () => { cancelled = true; };
    }, [returning]);

    // Back from checkout: the webhook adds the credits a few seconds later; poll up to a minute.
    useEffect(() => {
        if (!waiting || !status?.enabled) return;
        let tries = 0;
        const timer = setInterval(async () => {
            tries++;
            const s = await getAiCreditsStatus({ fresh: true });
            setStatus(s);
            const bought = s.recent.some(r => r.reason === 'purchase' && Date.now() - Date.parse(r.at) < 10 * 60_000);
            if (bought || (startBalance.current !== null && s.balance > startBalance.current) || tries >= 20) {
                setWaiting(false);
                clearInterval(timer);
            }
        }, 3000);
        return () => clearInterval(timer);
    }, [waiting, status?.enabled]);

    const saveAuto = async (next: { enabled: boolean; threshold: number; pack: string }) => {
        if (!status) return;
        const before = status;
        setSaving(true);
        setSaveError(null);
        setStatus({ ...status, autoRecharge: next });
        try {
            setStatus(await saveAutoRecharge(next));
        } catch (err) {
            setStatus(before);
            setSaveError(err instanceof Error ? err.message : 'Could not save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    if (!status?.enabled) return null;
    const auto = status.autoRecharge;
    const autoPack = packById(auto.pack) || packById(AUTO_RECHARGE.defaultPack)!;
    const note = lastRechargeNote(status);
    const recent = status.recent.slice(0, 3);

    return (
        <div id="ai-credits" className="mt-6 border-t border-border pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h4 className="text-sm font-semibold">AI credits</h4>
                <p className="text-sm">
                    <span className="text-lg font-bold tabular-nums">{status.balance.toLocaleString('en-US')}</span>
                    <span className="text-muted-foreground"> {status.balance === 1 ? 'credit' : 'credits'} left</span>
                    {status.usedThisMonth > 0 && <span className="text-muted-foreground"> · {status.usedThisMonth} used this month</span>}
                </p>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
                Used only after your plan’s monthly AI requests run out. 1 credit = 1 AI request. Credits never expire. From ${MIN_CREDIT_PURCHASE_USD}.
            </p>

            {waiting && (
                <div className="mt-3"><InlineNote tone="info">Payment received. Your credits appear here in a few seconds…</InlineNote></div>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <div className="sm:w-[340px]"><PackPicker packs={status.packs} value={pack} onChange={setPack} disabled={checkout.busy} /></div>
                <button type="button" className="btn btn-primary sm:self-stretch" onClick={() => checkout.buy(pack)} disabled={checkout.busy}>
                    {checkout.busy ? 'Opening checkout…' : 'Buy credits'}
                </button>
            </div>
            {checkout.error && <p role="alert" className="mt-2 text-sm text-destructive">{checkout.error}</p>}

            <div className="mt-4 rounded-xl bg-muted/50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-medium">Automatic top-up</p>
                        <p className="text-[13px] text-muted-foreground">
                            {status.hasPurchase
                                ? <>When fewer than <b className="font-semibold text-foreground">{auto.threshold}</b> credits are left, we charge <b className="font-semibold text-foreground">${autoPack.price}</b> for {creditsText(autoPack.credits)} to the card you paid with. At most {status.maxPerDay} times a day.</>
                                : 'Buy a pack once to save your card, then you can turn this on.'}
                        </p>
                    </div>
                    <Switch
                        checked={auto.enabled}
                        label="Automatic top-up"
                        disabled={!status.hasPurchase}
                        busy={saving}
                        onChange={(on) => saveAuto({ ...auto, enabled: on })}
                    />
                </div>
                {status.hasPurchase && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
                        <label className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Below</span>
                            <select
                                className="input h-9 w-auto py-0 pr-8 text-sm"
                                value={auto.threshold}
                                disabled={saving}
                                onChange={(e) => saveAuto({ ...auto, threshold: Number(e.target.value) })}
                                aria-label="Top up when fewer credits than this are left"
                            >
                                {[...new Set([...status.thresholds, auto.threshold])].sort((a, b) => a - b).map(t => <option key={t} value={t}>{t} credits</option>)}
                            </select>
                        </label>
                        <label className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">buy</span>
                            <select
                                className="input h-9 w-auto py-0 pr-8 text-sm"
                                value={auto.pack}
                                disabled={saving}
                                onChange={(e) => saveAuto({ ...auto, pack: e.target.value })}
                                aria-label="Pack bought automatically"
                            >
                                {status.packs.map(p => <option key={p.id} value={p.id}>${p.price} · {p.credits.toLocaleString('en-US')} credits</option>)}
                            </select>
                        </label>
                    </div>
                )}
                {saveError && <p role="alert" className="mt-2 text-sm text-destructive">{saveError}</p>}
                {note && <div className="mt-2"><InlineNote tone={note.tone}>{note.text}</InlineNote></div>}
            </div>

            {recent.length > 0 && (
                <ul className="mt-3 space-y-1 text-[13px]">
                    {recent.map((r, i) => (
                        <li key={`${r.at}-${i}`} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-muted-foreground">{shortDate(r.at)} · {r.note || r.reason}</span>
                            <span className={cx('shrink-0 font-semibold tabular-nums', r.delta > 0 ? 'text-success' : 'text-foreground')}>{r.delta > 0 ? '+' : ''}{r.delta.toLocaleString('en-US')}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// ───────────────────────────── AI panel at the limit ─────────────────────────────

/** "Buy more credits" next to "See plans" when the AI answered CREDITS_EMPTY: pick a pack, go to checkout. */
export const BuyCreditsButton: React.FC<{ className?: string }> = ({ className }) => {
    const [open, setOpen] = useState(false);
    const [pack, setPack] = useState<string>(AUTO_RECHARGE.defaultPack);
    const [packs, setPacks] = useState<AiCreditPack[] | null>(null);
    const checkout = useCheckout();

    useEffect(() => {
        if (!open || packs) return;
        getAiCreditsStatus().then(s => setPacks(s.packs));
    }, [open, packs]);

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className={cx('inline-flex min-h-[40px] items-center rounded-xl border border-primary/40 px-4 text-sm font-semibold text-primary hover:bg-primary/5', className)}>
                Buy more credits
            </button>
        );
    }
    const list = packs || [];
    return (
        <div className={cx('w-full space-y-2', className)}>
            {list.length > 0 ? <PackPicker packs={list} value={pack} onChange={setPack} disabled={checkout.busy} /> : <p className="text-[13px] text-muted-foreground">Loading packs…</p>}
            <div className="flex items-center gap-2">
                <button type="button" className="btn btn-primary btn-sm" disabled={checkout.busy || !list.length} onClick={() => checkout.buy(pack)}>
                    {checkout.busy ? 'Opening checkout…' : `Buy ${creditsText(packById(pack)?.credits || 0)}`}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={checkout.busy} onClick={() => setOpen(false)}>Cancel</button>
            </div>
            {checkout.error && <p role="alert" className="text-[13px] text-destructive">{checkout.error}</p>}
        </div>
    );
};

// ───────────────────────────── upgrade window ─────────────────────────────

/** Under the plans when the window opened because of the AI limit (and credits are on). */
export const AICreditsStrip: React.FC<{ reason?: string }> = ({ reason }) => {
    const aiLimit = useMemo(() => /\bAI (?:requests?|credits?)\b/i.test(reason || ''), [reason]);
    const [status, setStatus] = useState<AiCreditsStatus | null>(null);
    const [pack, setPack] = useState<string>(AUTO_RECHARGE.defaultPack);
    const checkout = useCheckout();

    useEffect(() => {
        if (!aiLimit) return;
        let cancelled = false;
        getAiCreditsStatus().then(s => { if (!cancelled) setStatus(s); });
        return () => { cancelled = true; };
    }, [aiLimit]);

    if (!aiLimit || !status?.enabled) return null;
    return (
        <div className="mt-4 rounded-xl border border-border px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:flex-1">
                    <p className="text-sm font-semibold">Or top up with AI credits</p>
                    <p className="text-[13px] text-muted-foreground">One-time payment, no subscription. 1 credit = 1 AI request; credits never expire.{status.balance > 0 ? ` You have ${creditsText(status.balance)}.` : ''}</p>
                </div>
                <div className="sm:w-[300px]"><PackPicker packs={status.packs} value={pack} onChange={setPack} disabled={checkout.busy} /></div>
                <button type="button" className="btn btn-primary" disabled={checkout.busy} onClick={() => checkout.buy(pack)}>
                    {checkout.busy ? 'Opening…' : 'Buy credits'}
                </button>
            </div>
            {checkout.error && <p role="alert" className="mt-2 text-sm text-destructive">{checkout.error}</p>}
        </div>
    );
};
