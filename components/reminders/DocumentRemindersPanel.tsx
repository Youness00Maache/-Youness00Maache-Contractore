/**
 * "Reminders" section for the Invoice and Estimate forms: on/off switch for this document, the planned dates
 * (from the live form, so changing the due date or status updates them at once) and why nothing goes out when
 * it doesn't (draft, paid, Gmail not connected, client without email...).
 * Renders nothing until the reminders migration is applied.
 *
 *   <DocumentRemindersPanel type="Invoice" documentId={documentId} data={d} />
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BellIcon, GoogleIcon } from '../Icons.tsx';
import { FormSection } from '../forms/Fields.tsx';
import { startGmailConnect } from '../../services/gmailService.ts';
import {
    formatShortDate, loadDocumentReminderContext, planDocumentReminders, RemindersUnavailableError, setReminderOverride, STOP_LABELS,
    type DocumentReminderContext,
} from '../../lib/reminders.ts';
import { InlineNote, StepRail, Switch } from './ui.tsx';

interface Props {
    type: 'Invoice' | 'Estimate';
    /** id of the saved document (undefined while it is new) */
    documentId?: string | null;
    /** the form's current data */
    data: Record<string, any>;
    /** client chosen in the form, when the data has no clientId */
    clientId?: string | null;
}

const DocumentRemindersPanel: React.FC<Props> = ({ type, documentId, data, clientId }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [ctx, setCtx] = useState<DocumentReminderContext | null>(null);
    const [hidden, setHidden] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [now, setNow] = useState(() => new Date());

    const noun = type === 'Invoice' ? 'invoice' : 'estimate';
    const formClientId = (data?.clientId as string | undefined) || clientId || null;
    const clientName = String(data?.clientName || '').trim();

    const load = useCallback(async () => {
        try {
            const next = await loadDocumentReminderContext(type, documentId, { clientId: formClientId, clientName });
            setCtx(next);
            setError(null);
            setNow(new Date());
        } catch (e) {
            if (e instanceof RemindersUnavailableError) setHidden(true);
            else setError((e as Error)?.message || 'Could not load reminders.');
        }
    }, [type, documentId, formClientId, clientName]);

    // reload when the document is saved for the first time or the client changes (typing a name: debounced)
    useEffect(() => {
        const t = window.setTimeout(load, ctx ? 500 : 0);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const view = useMemo(() => (ctx ? planDocumentReminders(type, documentId, data || {}, ctx, now) : null), [ctx, type, documentId, data, now]);

    if (hidden) return null;

    if (!ctx || !view) {
        return (
            <FormSection title="Reminders" icon={BellIcon}>
                {error ? (
                    <InlineNote tone="danger" action={<button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={load}>Retry</button>}>{error}</InlineNote>
                ) : (
                    <div className="space-y-2" aria-hidden><div className="skeleton h-4 w-2/3" /><div className="skeleton h-4 w-1/2" /></div>
                )}
            </FormSection>
        );
    }

    const { basics } = ctx;
    const { plan, recipient, defaultOn } = view;
    const elig = plan.eligibility;
    const paused = !basics.settings.enabled;
    const on = elig.on;
    const sender = basics.sender;
    const clientLabel = ctx.client?.name || clientName || 'This client';

    const toggle = async (next: boolean) => {
        if (!ctx.saved || !documentId) return;
        setBusy(true);
        setError(null);
        try {
            // back to the default when it already gives what the user wants; otherwise an explicit switch
            await setReminderOverride({ documentId }, next === defaultOn ? null : next);
            await load();
        } catch (e) {
            setError((e as Error)?.message || 'Could not change reminders.');
        } finally {
            setBusy(false);
        }
    };

    const clientSwitch = async (enabled: boolean | null) => {
        if (!ctx.client) return;
        setBusy(true);
        setError(null);
        try {
            await setReminderOverride({ clientId: ctx.client.id }, enabled);
            await load();
        } catch (e) {
            setError((e as Error)?.message || 'Could not change reminders.');
        } finally {
            setBusy(false);
        }
    };

    const connect = async (hint?: string) => {
        setConnecting(true);
        try {
            await startGmailConnect({ returnTo: `${location.pathname}${location.search}`, loginHint: hint });
        } catch (e) {
            setConnecting(false);
            setError((e as Error)?.message || 'Could not start the Google connection.');
        }
    };

    let summary: string;
    if (paused) summary = 'Paused for all documents in Settings.';
    else if (!on) {
        summary = elig.source === 'document' ? `Off for this ${noun}.`
            : elig.source === 'client' ? `Off for all of ${clientLabel}'s documents.`
            : elig.source === 'account' ? `${type} reminders are off in Settings.`
            : `Older ${noun}s aren't chased automatically. Switch on to start.`;
    } else if (plan.stop) {
        summary = plan.stop === 'not_sent' ? `Starts when the status is Sent.` : `Stopped: ${STOP_LABELS[plan.stop].toLowerCase()}.`;
    } else if (plan.next) {
        summary = `Next ${formatShortDate(plan.next.sendDate)}${sender ? ` from ${sender.gmail_address}` : ''}.`;
    } else {
        summary = plan.steps.length ? 'No more reminders planned.' : type === 'Invoice' ? 'Add a due date to plan reminders.' : 'Plans follow-ups once it is sent.';
    }

    const showProblems = on && !paused && (!plan.stop || plan.stop === 'not_sent');
    const cap = basics.usage?.limits.emails ?? null;

    return (
        <FormSection
            title="Reminders"
            icon={BellIcon}
            description={summary}
            actions={(
                <Switch
                    checked={on}
                    onChange={toggle}
                    label={on ? `Turn off reminders for this ${noun}` : `Turn on reminders for this ${noun}`}
                    disabled={paused || !ctx.saved || !documentId}
                    busy={busy}
                />
            )}
        >
            {!ctx.saved && <p className="-mt-2 text-xs text-muted-foreground">Save the {noun} to change this switch.</p>}

            {error && <InlineNote tone="danger">{error}</InlineNote>}

            {showProblems && !sender && (
                <InlineNote
                    tone="warning"
                    action={<button type="button" className="btn btn-sm btn-primary min-h-[36px]" onClick={() => connect()} disabled={connecting}><GoogleIcon className="h-4 w-4" /> {connecting ? 'Opening…' : 'Connect Gmail'}</button>}
                >
                    Connect Gmail so reminders go out from your own address. Nothing is sent until you do.
                </InlineNote>
            )}
            {showProblems && sender?.needs_reconnect && (
                <InlineNote
                    tone="warning"
                    action={<button type="button" className="btn btn-sm btn-primary min-h-[36px]" onClick={() => connect(sender.gmail_address)} disabled={connecting}>Reconnect</button>}
                >
                    Google access for {sender.gmail_address} expired. Reconnect it so reminders can be sent.
                </InlineNote>
            )}
            {showProblems && sender && !recipient && (
                <InlineNote tone="warning">{clientLabel} has no email address. Add one to the client so reminders can be sent.</InlineNote>
            )}

            {plan.steps.length > 0 && <StepRail kind={type === 'Invoice' ? 'invoice' : 'estimate'} steps={plan.steps} muted={!plan.active} mutedLabel={on && !paused && plan.stop === 'not_sent' ? 'Waiting' : on && !paused && plan.stop ? 'Stopped' : 'Off'} />}

            {elig.source === 'client' && ctx.client && !paused && (
                <InlineNote action={<button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={() => clientSwitch(null)} disabled={busy}>Turn on for {ctx.client.name}</button>}>
                    Reminders are off for every document of {ctx.client.name}.
                </InlineNote>
            )}

            <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                <span>
                    {type === 'Invoice'
                        ? 'Stops by itself when the invoice is paid or the client reports a payment.'
                        : 'Stops by itself when the client approves or declines.'}
                    {!basics.paid && cap !== null && ` Free plan: each reminder uses 1 of your ${cap} emails a month.`}
                </span>
                <span className="flex flex-wrap gap-x-3">
                    {recipient && on && !paused && <span>To {recipient}</span>}
                    <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/settings#reminders')}>Schedule &amp; wording</button>
                    {ctx.client && !ctx.clientOverride && !paused && (
                        <button type="button" className="font-semibold text-muted-foreground hover:text-foreground hover:underline" onClick={() => clientSwitch(false)} disabled={busy}>
                            Never remind {ctx.client.name}
                        </button>
                    )}
                </span>
            </div>
        </FormSection>
    );
};

export default DocumentRemindersPanel;
