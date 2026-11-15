/**
 * Setup assistant screens 5, 6, 8 and the summary: price book kits, document look, your team, and "what next".
 */
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { CheckIcon, CopyIcon } from '../Icons.tsx';
import { money } from '../viewKit.tsx';
import { errorText, NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { StepFrame, SField, inputCls } from './StepFrame.tsx';
import type { SetupCtx } from './ctx.ts';
import { STARTER_KITS, STARTER_PRICES_NOTE, starterTradeLabel } from '../../lib/assemblies/starterKits.ts';
import { planStarterImport, starterPreview, usableLaborRate } from '../../lib/assemblies/starterImport.ts';
import { resolveLaborRate } from '../../lib/finance.ts';
import { kitIdsForTrades, tradesWithKits } from '../../lib/setup/trades.ts';
import { importStarterKitsFor, priceBookNames } from './setupApi.ts';
import DocumentDesignSettings, { defaultWithDesign } from '../settings/DocumentDesignSettings.tsx';
import { DEFAULT_TEMPLATE_ID } from '../../utils/templates/registry.ts';
import { currentDesignDefault, saveDesignDefault } from '../../lib/designDefaults.ts';
import { crewInviteText, crewLinkUrl } from '../../lib/crew/crewLogic.ts';
import { hasExample } from '../../lib/setup/example.ts';
import { stepDef } from '../../lib/setup/steps.ts';

const StarterKitsModal = lazy(() => import('../assemblies/StarterKitsModal.tsx'));

const failText = (e: unknown) => errorText(e, 'That could not be saved. Please try again.');

// ------------------------------------------------------------------------------------------ 5. price book
export const PricebookStep: React.FC<{ ctx: SetupCtx }> = ({ ctx }) => {
    const trades = tradesWithKits(ctx.state.trades);
    const kitIds = useMemo(() => kitIdsForTrades(ctx.state.trades), [ctx.state.trades]);
    const laborRate = usableLaborRate(resolveLaborRate(ctx.profile.defaultLaborRate));
    const [names, setNames] = useState<string[]>([]);
    const [pickOpen, setPickOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { let live = true; priceBookNames().then(n => { if (live) setNames(n); }).catch(() => undefined); return () => { live = false; }; }, []);

    const plan = useMemo(() => planStarterImport(kitIds, names, { laborRate, newId: () => 'x' }), [kitIds, names, laborRate]);
    const takenIds = new Set(plan.skipped.map(k => k.id));
    const kits = STARTER_KITS.filter(k => kitIds.includes(k.id));
    const shown = kits.slice(0, 6);

    const done = async () => { await ctx.refresh(); ctx.next(); };
    const importAll = async () => {
        if (!plan.rows.length) { ctx.next(); return; }
        setBusy(true); setError(null);
        try { await importStarterKitsFor(kitIds, laborRate); await done(); }
        catch (e) { setError(failText(e)); } finally { setBusy(false); }
    };

    return (
        <>
            <StepFrame ctx={ctx} id="pricebook" busy={busy} error={error} onPrimary={importAll}
                primaryLabel={!trades.length ? 'Continue' : plan.rows.length ? `Import ${plan.rows.length} kit${plan.rows.length === 1 ? '' : 's'}` : 'Continue'}>
                {!trades.length ? (
                    <div className="space-y-3 text-sm">
                        <p className="text-muted-foreground">Kits are ready-made price book entries per trade (materials, labor, markup). Pick your trades first and the matching kits show up here.</p>
                        <button type="button" className="btn btn-outline h-11" onClick={() => ctx.go('trade')}>Pick my trades</button>
                    </div>
                ) : (
                    <>
                        <p className="rounded-xl border-l-4 border-l-warning bg-warning/10 px-3 py-2 text-sm text-foreground">
                            <strong>{STARTER_PRICES_NOTE}</strong> <span className="text-muted-foreground">Labor uses your rate ({money(laborRate)}/h). Check every price before you use a kit on a client's estimate.</span>
                        </p>
                        <div>
                            <p className="text-sm font-semibold text-foreground">{kits.length} kit{kits.length === 1 ? '' : 's'} for {trades.map(starterTradeLabel).join(', ')}</p>
                            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
                                {shown.map(k => {
                                    const taken = takenIds.has(k.id);
                                    return (
                                        <li key={k.id} className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm">
                                            <span className={`min-w-0 ${taken ? 'text-muted-foreground' : 'text-foreground'}`}>
                                                {k.name}{taken && <span className="ml-2 text-xs">already in your price book</span>}
                                            </span>
                                            <span className="shrink-0 tabular-nums text-muted-foreground">{money(starterPreview(k, laborRate).price)}</span>
                                        </li>
                                    );
                                })}
                                {kits.length > shown.length && <li className="px-3 py-2 text-xs text-muted-foreground">and {kits.length - shown.length} more</li>}
                            </ul>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" className="btn btn-outline h-11" onClick={() => setPickOpen(true)} disabled={busy}>Choose which ones, with details</button>
                            {plan.skipped.length > 0 && <span className="text-xs text-muted-foreground">{plan.skipped.length} already in your price book will be skipped.</span>}
                        </div>
                    </>
                )}
            </StepFrame>
            {pickOpen && (
                <Suspense fallback={null}>
                    <StarterKitsModal
                        open
                        onClose={() => setPickOpen(false)}
                        existingNames={names}
                        laborRate={laborRate}
                        onImport={async (ids) => { await importStarterKitsFor(ids, laborRate); setPickOpen(false); await done(); }}
                    />
                </Suspense>
            )}
        </>
    );
};

// ------------------------------------------------------------------------------------------- 6. look
export const LookStep: React.FC<{ ctx: SetupCtx }> = ({ ctx }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const status = ctx.progress.steps.find(s => s.id === 'look')?.status;

    // the design picker saves by itself: once it has, the rail and the hint follow without waiting for Continue
    useEffect(() => {
        if (status === 'done') return;
        const timer = window.setInterval(() => { if (currentDesignDefault()) { window.clearInterval(timer); void ctx.refresh(); } }, 1000);
        return () => window.clearInterval(timer);
    }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

    const proceed = async () => { setBusy(true); try { await ctx.refresh(); } finally { setBusy(false); } ctx.next(); };
    const keepClassic = async () => {
        setBusy(true); setError(null);
        try {
            const r = await saveDesignDefault(defaultWithDesign(null, DEFAULT_TEMPLATE_ID), ctx.plan);
            if (r === 'failed') { setError('Could not save the design. Try again.'); return; }
            await ctx.refresh();
            ctx.next();
        } catch (e) { setError(failText(e)); } finally { setBusy(false); }
    };

    return (
        <StepFrame ctx={ctx} id="look" busy={busy} error={error} onPrimary={proceed} primaryLabel="Continue">
            <p className="text-sm text-muted-foreground">Free accounts use the Basic designs. Premium designs are shown with a lock and can be tried after upgrading.</p>
            <DocumentDesignSettings plan={ctx.plan} />
            {status !== 'done' && (
                <button type="button" className="btn btn-outline h-11" onClick={keepClassic} disabled={busy}>Keep Classic (Basic) for now</button>
            )}
        </StepFrame>
    );
};

// ------------------------------------------------------------------------------------------ 8. team
export const TeamStep: React.FC<{ ctx: SetupCtx }> = ({ ctx }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [link, setLink] = useState<{ url: string; text: string; name: string; phone: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const add = async () => {
        if (!name.trim()) { setError('Add their name.'); return; }
        if (!ctx.isOnline) { setError(NEEDS_CONNECTION); return; }
        setBusy(true); setError(null);
        try {
            const { createMember } = await import('../../lib/crew/crewApi.ts');
            const { member, token } = await createMember({ name, phone });
            if (!token) { setError(`${member.name} was added, but the link could not be read here. Open Crew in the menu to get it.`); await ctx.refresh(); return; }
            const url = crewLinkUrl(window.location.origin, token);
            setLink({ url, text: crewInviteText(member.name, ctx.profile.companyName || '', url), name: member.name, phone: phone.trim() });
            await ctx.refresh();
        } catch (e) {
            if ((e as { kind?: string })?.kind === 'premium') { ctx.upgrade('Crew clock-in links are part of Premium.'); return; }
            setError(errorText(e, 'Could not add them. Please try again.'));
        } finally { setBusy(false); }
    };
    const copy = async () => {
        if (!link) return;
        try { await navigator.clipboard.writeText(link.url); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { setError('Copy did not work. Press and hold the link to copy it.'); }
    };

    return (
        <StepFrame ctx={ctx} id="team" busy={busy} error={error} onPrimary={link ? () => ctx.next() : add}
            primaryLabel={link ? 'Continue' : 'Add and get link'}>
            {!link ? (
                <>
                    <p className="text-sm text-muted-foreground">They get a private clock-in link for their phone. No login, no app, no seat fee. You can add more people later under Crew.</p>
                    {!ctx.isOnline && <p className="text-sm text-muted-foreground">{NEEDS_CONNECTION}</p>}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <SField label="Their name" htmlFor="setup-crew-name"><input id="setup-crew-name" className={inputCls} value={name} onChange={e => setName(e.target.value.slice(0, 80))} placeholder="e.g. Maria Lopez" autoComplete="off" /></SField>
                        <SField label="Phone (optional)" htmlFor="setup-crew-phone" hint="Lets you text them the link."><input id="setup-crew-phone" type="tel" className={inputCls} value={phone} onChange={e => setPhone(e.target.value.slice(0, 30))} autoComplete="off" /></SField>
                    </div>
                </>
            ) : (
                <div className="space-y-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-success"><CheckIcon className="h-4 w-4" /> {link.name} is on your crew.</p>
                    <p className="text-sm text-muted-foreground">Send them this link. They open it on their phone to clock in and out.</p>
                    <input readOnly className={`${inputCls} font-mono text-xs`} value={link.url} onFocus={e => e.currentTarget.select()} aria-label="Clock-in link" />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-outline h-11" onClick={() => void copy()}><CopyIcon className="h-4 w-4" /> {copied ? 'Copied' : 'Copy link'}</button>
                        {link.phone && <a className="btn btn-outline h-11" href={`sms:${link.phone}?&body=${encodeURIComponent(link.text)}`}>Text it</a>}
                    </div>
                </div>
            )}
        </StepFrame>
    );
};

// ----------------------------------------------------------------------------------------- the summary
export const FinishStep: React.FC<{ ctx: SetupCtx }> = ({ ctx }) => {
    const [busy, setBusy] = useState<'add' | 'remove' | null>(null);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
    const left = ctx.progress.steps.filter(s => s.required && s.status === 'todo').length;
    const example = ctx.example;
    const run = async (kind: 'add' | 'remove') => {
        setBusy(kind); setMessage(null);
        try { setMessage({ tone: 'ok', text: await (kind === 'add' ? ctx.addExample() : ctx.removeExample()) }); }
        catch (e) { setMessage({ tone: 'error', text: errorText(e, 'That did not work. Please try again.') }); }
        finally { setBusy(null); }
    };
    const go = (path: string) => { ctx.navigate(path); ctx.close(); };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{ctx.t.setupDone || 'All set'}</p>
                <h2 className="mt-1.5 text-xl font-bold leading-tight sm:text-2xl">{left === 0 ? 'Your business is set up' : `${left} thing${left === 1 ? '' : 's'} still to do`}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{left === 0 ? 'Everything below is saved. Change any of it later in Settings.' : 'Open any line to finish it, or leave it for later: the Setup reminder on your dashboard keeps your place.'}</p>

                <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {ctx.progress.steps.map(s => (
                        <li key={s.id}>
                            <button type="button" onClick={() => ctx.go(s.id)} className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/60">
                                <span className="flex items-center gap-2.5">
                                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${s.status === 'done' ? 'bg-primary text-primary-foreground' : 'border border-dashed border-muted-foreground/60 text-muted-foreground'}`}>
                                        {s.status === 'done' ? <CheckIcon className="h-3 w-3" /> : ''}
                                    </span>
                                    <span className="font-medium text-foreground">{stepDef(s.id).title}</span>
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {s.id === 'business' && s.status === 'skipped' && (ctx.profile.companyName || '').trim() ? 'Name saved, no logo'
                                        : s.status === 'done' ? 'Done' : s.status === 'skipped' ? 'Skipped' : s.status === 'unknown' ? 'Not checked' : 'To do'}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>

                <h3 className="mt-6 text-sm font-bold text-foreground">Next</h3>
                <ol className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border text-sm">
                    <li><button type="button" className="flex min-h-[52px] w-full items-center gap-3 px-3 text-left hover:bg-muted/60" onClick={() => go(example.jobId ? `/jobs/${example.jobId}` : '/jobs/create')}><span className="w-5 text-center font-bold text-primary">1</span><span><span className="block font-semibold">Create your first estimate</span><span className="block text-xs text-muted-foreground">Start a job, then add an estimate to it.</span></span></button></li>
                    <li><button type="button" className="flex min-h-[52px] w-full items-center gap-3 px-3 text-left hover:bg-muted/60" onClick={() => go('/clients')}><span className="w-5 text-center font-bold text-primary">2</span><span><span className="block font-semibold">Add a client</span><span className="block text-xs text-muted-foreground">Each client gets a private portal for approvals and payments.</span></span></button></li>
                    <li><button type="button" className="flex min-h-[52px] w-full items-center gap-3 px-3 text-left hover:bg-muted/60" onClick={() => go('/settings#requests')}><span className="w-5 text-center font-bold text-primary">3</span><span><span className="block font-semibold">Send a request link</span><span className="block text-xs text-muted-foreground">New customers ask you for a quote from a page and QR code.</span></span></button></li>
                </ol>

                <div className="mt-6 rounded-xl border border-dashed border-border p-3.5">
                    <p className="text-sm font-bold text-foreground">{hasExample(example) ? 'Example project is added' : 'Want to look around first?'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {hasExample(example)
                            ? 'A sample client, job and draft estimate, all marked Example. One tap removes exactly those and nothing else.'
                            : 'Add an example project: a sample client, job and draft estimate, all marked Example. It is never added by itself, and one tap removes it again.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {hasExample(example) ? (
                            <>
                                {example.jobId && <button type="button" className="btn btn-outline h-11" onClick={() => go(`/jobs/${example.jobId}`)}>Open the example</button>}
                                {confirmRemove ? (
                                    <>
                                        <button type="button" className="btn btn-danger h-11" onClick={() => { setConfirmRemove(false); void run('remove'); }} disabled={busy !== null || !ctx.isOnline}>Yes, remove it</button>
                                        <button type="button" className="btn btn-ghost h-11" onClick={() => setConfirmRemove(false)}>Keep it</button>
                                    </>
                                ) : (
                                    <button type="button" className="btn btn-outline h-11" onClick={() => setConfirmRemove(true)} disabled={busy !== null || !ctx.isOnline}>{busy === 'remove' ? 'Removing…' : 'Remove example data'}</button>
                                )}
                            </>
                        ) : (
                            <button type="button" className="btn btn-outline h-11" onClick={() => void run('add')} disabled={busy !== null || !ctx.isOnline}>{busy === 'add' ? 'Adding…' : 'Add an example project'}</button>
                        )}
                    </div>
                    {!ctx.isOnline && <p className="mt-2 text-xs text-muted-foreground">{NEEDS_CONNECTION}</p>}
                    {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-sm ${message.tone === 'error' ? 'text-destructive' : 'text-foreground'}`}>{message.text}</p>}
                </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border bg-card px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-8">
                {ctx.back && <button type="button" className="btn btn-ghost h-11 sm:mr-auto" onClick={ctx.back}>{ctx.t.setupBack || 'Back'}</button>}
                <button type="button" className="btn btn-primary h-12 sm:h-11 sm:min-w-[11rem]" onClick={ctx.close}>Close</button>
            </div>
        </div>
    );
};
