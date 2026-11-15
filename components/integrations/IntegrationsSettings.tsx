/**
 * Settings > Integrations & data (id settings-integrations). One list of plain rows, each with a one-line "what it does",
 * a real state word and one action:
 *
 *   Gmail            connected / needs reconnect / not connected, which address; Connect, Reconnect, Disconnect through
 *                    the EXISTING Gmail flow (services/gmailService.ts). Tokens never reach this screen.
 *   Calendar         a downloadable .ics file of jobs, appointments, follow-ups, task and due dates (CalendarFilePanel)
 *   Accounting       QuickBooks Online and Xero import files, CSV (AccountingExportPanel)
 *   Price list       CSV price list into the price book, Premium (PriceListImportPanel)
 *   Backup           the full export and the bookkeeper CSV already live in Settings > Your data: a link, not a copy
 *
 * A row's tool opens under it (one at a time) and is loaded only then. Nothing here writes to the account except the
 * price list import, which uses the price book's own save path.
 */
import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { UserProfile } from '../../types.ts';
import HelpButton from '../help/HelpButton.tsx';
import { isPaidTier, type PlanTier } from '../../lib/plans.ts';
import { isBrowserOffline } from '../../lib/offline/connection.ts';
import {
    GmailError, disconnectGmailAccount, getPreferredSender, listGmailAccounts, setPreferredSender, startGmailConnect, type GmailAccount, type GmailUsage,
} from '../../services/gmailService.ts';
import { StateTag, cx, plural } from './ui.tsx';

const CalendarFilePanel = lazy(() => import('./CalendarFilePanel.tsx'));
const AccountingExportPanel = lazy(() => import('./AccountingExportPanel.tsx'));
const PriceListImportPanel = lazy(() => import('./PriceListImportPanel.tsx'));

type PanelId = 'calendar' | 'accounting' | 'pricelist';

const Row: React.FC<{
    title: string;
    state: React.ReactNode;
    blurb: React.ReactNode;
    action?: React.ReactNode;
    children?: React.ReactNode;
}> = ({ title, state, blurb, action, children }) => (
    <li className="py-4 first:pt-0 last:pb-0">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    {state}
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{blurb}</p>
            </div>
            {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
        </div>
        {children}
    </li>
);

const OpenButton: React.FC<{ open: boolean; panel: string; onClick: () => void; children: React.ReactNode }> = ({ open, panel, onClick, children }) => (
    <button type="button" className="btn btn-sm btn-outline min-h-[40px]" aria-expanded={open} aria-controls={`integrations-${panel}`} onClick={onClick}>
        {open ? 'Close' : children}
    </button>
);

const PanelFallback: React.FC = () => <div className="skeleton mt-4 h-28 w-full rounded-xl" aria-label="Loading" />;

const IntegrationsSettings: React.FC<{
    profile: UserProfile;
    plan: PlanTier;
    onUpgradeClick?: () => void;
    /** the app's copy of the price book should reload (a price list was applied) */
    onPriceBookChanged?: () => void;
}> = ({ profile, plan, onUpgradeClick, onPriceBookChanged }) => {
    const paid = isPaidTier(plan);
    const [open, setOpen] = useState<PanelId | null>(null);
    const toggle = (id: PanelId) => setOpen((cur) => (cur === id ? null : id));

    // ---------------------------------------------------------------------------------------------------- Gmail
    const [accounts, setAccounts] = useState<GmailAccount[] | null>(null);
    const [usage, setUsage] = useState<GmailUsage | null>(null);
    const [gmailError, setGmailError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<GmailAccount | null>(null);

    const loadGmail = useCallback(async () => {
        setGmailError(null);
        try {
            const res = await listGmailAccounts();
            setAccounts(res.accounts);
            setUsage(res.usage);
        } catch (e) {
            setAccounts((prev) => prev);
            setGmailError(e instanceof GmailError || e instanceof Error ? e.message : 'Could not check Gmail.');
        }
    }, []);
    useEffect(() => { void loadGmail(); }, [loadGmail]);

    const connect = async (loginHint?: string) => {
        setBusy('connect');
        setGmailError(null);
        try {
            await startGmailConnect({ returnTo: '/settings#integrations', loginHint });
        } catch (e) {
            setBusy(null);
            setGmailError((e as Error).message);
        }
    };

    const disconnect = async (a: GmailAccount) => {
        setBusy(a.id);
        setGmailError(null);
        try {
            await disconnectGmailAccount(a.id);
            if (getPreferredSender() === a.id) setPreferredSender(null);
            setConfirm(null);
            await loadGmail();
        } catch (e) {
            setGmailError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const offline = isBrowserOffline();
    let gmailState: React.ReactNode;
    if (accounts === null && !gmailError) gmailState = <StateTag tone="quiet">Checking</StateTag>;
    else if (accounts === null) gmailState = <StateTag tone="bad">{offline ? 'Needs a connection' : 'Could not check'}</StateTag>;
    else if (!accounts.length) gmailState = <StateTag tone="quiet">Not connected</StateTag>;
    else if (accounts.some((a) => a.needs_reconnect)) gmailState = <StateTag tone="warn">Reconnect needed</StateTag>;
    else gmailState = <StateTag tone="good">Connected</StateTag>;

    const gmailAction = accounts === null
        ? (gmailError ? <button type="button" className="btn btn-sm btn-outline min-h-[40px]" onClick={() => { void loadGmail(); }}>Try again</button> : null)
        : !accounts.length
            ? <button type="button" className="btn btn-sm btn-primary min-h-[40px]" onClick={() => { void connect(); }} disabled={busy === 'connect' || offline}>{busy === 'connect' ? 'Opening Google…' : 'Connect Gmail'}</button>
            : <button type="button" className="btn btn-sm btn-ghost min-h-[40px]" onClick={() => { void connect(); }} disabled={busy === 'connect' || offline}>Add another address</button>;

    // ------------------------------------------------------------------------------------------------ the rows
    const calendarOpen = open === 'calendar';
    const accountingOpen = open === 'accounting';
    const priceOpen = open === 'pricelist';
    const openYourData = () => document.getElementById('settings-data')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    return (
        <section id="settings-integrations" className="card scroll-mt-24" aria-labelledby="settings-integrations-title">
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
                <div className="min-w-0">
                    <h2 id="settings-integrations-title" className="text-base font-semibold">Integrations &amp; data</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Connect your Gmail, put your schedule in your phone’s calendar, and hand your numbers to your accountant’s software.
                    </p>
                </div>
                <HelpButton topic="integrations" iconOnly />
            </div>

            <ul className="divide-y divide-border p-4 sm:p-6">
                <Row
                    title="Gmail"
                    state={gmailState}
                    blurb="Sends your documents, reminders and the bookkeeper CSV from your own address."
                    action={gmailAction}
                >
                    {gmailError && <p role="alert" className="mt-2 text-xs text-destructive">{gmailError}</p>}
                    {accounts && accounts.length > 0 && (
                        <ul className="mt-3 divide-y divide-border/70 rounded-xl border border-border">
                            {accounts.map((a) => (
                                <li key={a.id} className="px-3 py-2">
                                    <p className="break-all text-sm font-medium text-foreground">{a.gmail_address}</p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                        {a.is_default && <span className="text-[11px] font-medium text-muted-foreground">Default sender</span>}
                                        {a.needs_reconnect && <span className="text-[11px] font-semibold text-warning">Needs to be reconnected</span>}
                                        <span className="flex gap-2 sm:ml-auto">
                                            {a.needs_reconnect && (
                                                <button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={() => { void connect(a.gmail_address); }} disabled={busy !== null || offline}>Reconnect</button>
                                            )}
                                            <button type="button" className="btn btn-sm btn-ghost min-h-[36px] text-destructive" onClick={() => setConfirm(confirm?.id === a.id ? null : a)} disabled={busy !== null || offline}>Disconnect</button>
                                        </span>
                                    </div>
                                    {confirm?.id === a.id && (
                                        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-destructive/5 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                                            <span className="text-foreground">Disconnect {a.gmail_address}? Documents and reminders can’t be emailed from it until you connect it again.</span>
                                            <span className="flex shrink-0 gap-2">
                                                <button type="button" className="btn btn-sm btn-danger min-h-[36px]" onClick={() => { void disconnect(a); }} disabled={busy === a.id}>{busy === a.id ? 'Disconnecting…' : 'Disconnect'}</button>
                                                <button type="button" className="btn btn-sm btn-ghost min-h-[36px]" onClick={() => setConfirm(null)} disabled={busy === a.id}>Keep it</button>
                                            </span>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {accounts && accounts.length > 0 && usage && usage.limit !== null && (
                        <p className="mt-2 text-xs text-muted-foreground">Free plan: {plural(usage.emails_this_month, 'email')} sent this month of {usage.limit}.</p>
                    )}
                    {accounts && !accounts.length && (
                        <p className="mt-2 text-xs text-muted-foreground">Send-only permission: ContractorDocs can’t read your inbox. You can disconnect any time.</p>
                    )}
                </Row>

                <Row
                    title="Calendar"
                    state={<StateTag tone="plain">File download</StateTag>}
                    blurb="Your jobs, appointments and due dates as a calendar file for Google, Apple or Outlook Calendar."
                    action={<OpenButton open={calendarOpen} panel="calendar" onClick={() => toggle('calendar')}>Set up the file</OpenButton>}
                >
                    {calendarOpen && (
                        <div id="integrations-calendar" className="mt-3 border-t border-border">
                            <Suspense fallback={<PanelFallback />}><CalendarFilePanel userId={profile.id} /></Suspense>
                        </div>
                    )}
                </Row>

                <Row
                    title="Accounting"
                    state={<StateTag tone="plain">CSV files</StateTag>}
                    blurb="Import files for QuickBooks Online and Xero: invoices, customers, expenses and payments received."
                    action={<OpenButton open={accountingOpen} panel="accounting" onClick={() => toggle('accounting')}>Make a file</OpenButton>}
                >
                    {accountingOpen && (
                        <div id="integrations-accounting" className="mt-3 border-t border-border">
                            <Suspense fallback={<PanelFallback />}><AccountingExportPanel userId={profile.id} onOpenYourData={openYourData} /></Suspense>
                        </div>
                    )}
                </Row>

                <Row
                    title="Price list"
                    state={paid ? <StateTag tone="plain">CSV import</StateTag> : <StateTag tone="warn">Premium</StateTag>}
                    blurb="Update your price book from a CSV price list. You review every change before anything is saved."
                    action={<OpenButton open={priceOpen} panel="pricelist" onClick={() => toggle('pricelist')}>{paid ? 'Import price list' : 'See what it does'}</OpenButton>}
                >
                    {priceOpen && (
                        <div id="integrations-pricelist" className="mt-3 border-t border-border">
                            <Suspense fallback={<PanelFallback />}><PriceListImportPanel paid={paid} onUpgradeClick={onUpgradeClick} onChanged={onPriceBookChanged} /></Suspense>
                        </div>
                    )}
                </Row>

                <Row
                    title="Full backup"
                    state={<StateTag tone="good">Every plan</StateTag>}
                    blurb="Everything you have made as one backup, and the monthly bookkeeper CSV, are in Your data."
                    action={<button type="button" className={cx('btn btn-sm btn-outline min-h-[40px]')} onClick={openYourData}>Open Your data</button>}
                />
            </ul>
        </section>
    );
};

export default IntegrationsSettings;
