/**
 * Warranty form > "Warranty emails": the switch for THIS warranty and what goes out next. Mirrors the Reminders section of
 * the invoice / estimate forms. The switch can only turn the warranty emails OFF for this document (the account switch in
 * Settings > Automations is what turns them on); switching it back removes the document's own switch.
 *
 * Premium only, like the emails themselves. Hidden until the reminders migration is applied. Needs a connection to
 * change; offline it shows nothing new.
 *
 *   <WarrantyEmailsSection documentId={id} clientId={d.clientId} data={d} createdAt={...} />
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormSection } from '../forms/Fields.tsx';
import { InlineNote, Switch } from '../reminders/ui.tsx';
import { todayISO } from '../forms/formUtils.ts';
import { RemindersUnavailableError } from '../../lib/reminders.ts';
import { loadWarrantyEmailContext, setWarrantyEmailsOff, warrantyEmailPlan, type WarrantyEmailContext } from '../../lib/warranty/warrantyEmails.ts';
import { postJobStepLabel } from '../../lib/warranty/postJobSettings.ts';
import { AUDIENCE_LABELS, formatDay, overviewOfDocument, warrantyScheduleText } from '../../lib/warranty/warrantyView.ts';
import { errorText } from '../../lib/offline/connection.ts';
import { isOfflineFailure } from '../../lib/offline/deviceCache.ts';

interface Props {
    documentId?: string | null;
    clientId?: string | null;
    data: Record<string, unknown>;
    createdAt?: string | null;
}

const OFF_TEXT: Record<string, string> = {
    paused: 'Reminder emails are paused for all documents in Settings.',
    kind_off: 'Warranty emails are switched off in Settings > Automations.',
    switched_off: 'Off for this warranty.',
    client_off: 'Off for all of this client’s documents.',
    no_anchor: 'Nothing to send yet: this warranty has no end date to count down to.',
    before_since: 'Warranty emails only start with warranties that end after you switched them on.',
};

const WarrantyEmailsSection: React.FC<Props> = ({ documentId, clientId, data, createdAt }) => {
    const navigate = useNavigate();
    const [ctx, setCtx] = useState<WarrantyEmailContext | null>(null);
    const [hidden, setHidden] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setCtx(await loadWarrantyEmailContext(documentId, clientId));
            setError(null);
        } catch (e) {
            if (e instanceof RemindersUnavailableError) setHidden(true);
            else if (isOfflineFailure(e)) setError("You're offline. This shows once you're back online.");
            else setError(errorText(e, 'Could not load the warranty emails.'));
        }
    }, [documentId, clientId]);
    useEffect(() => { void load(); }, [load]);

    if (hidden) return null;

    const overview = overviewOfDocument(data, createdAt, todayISO());
    const facts = {
        kind: 'warranty' as const,
        id: documentId || 'new',
        anchor: overview.expiresOn,
        inactive: overview.status === 'void' || overview.status === 'lifetime' || !overview.expiresOn,
    };
    const plan = ctx ? warrantyEmailPlan(ctx, facts) : null;
    const paid = ctx?.basics.paid ?? true;
    // the switch shows what will happen: off when this warranty is switched off, or when the account setting is off / paused
    const accountOff = plan?.off === 'kind_off' || plan?.off === 'paused';
    const on = !!ctx && !ctx.documentOff && !accountOff;

    const toggle = async (next: boolean) => {
        if (!documentId) return;
        setBusy(true);
        setError(null);
        try {
            await setWarrantyEmailsOff(documentId, !next);
            await load();
        } catch (e) {
            setError(errorText(e, 'Could not change the warranty emails.'));
        } finally {
            setBusy(false);
        }
    };

    let summary: React.ReactNode = 'Checking…';
    if (ctx && plan) {
        if (!paid) summary = 'The emails that go out around a warranty (to the client and to you) are part of Premium.';
        else if (plan.off === 'no_anchor') summary = overview.status === 'void' ? 'A void warranty sends no emails.' : overview.status === 'lifetime' ? 'A lifetime warranty has no end to count down to, so no emails go out.' : OFF_TEXT.no_anchor;
        else if (plan.off && plan.off !== 'plan') summary = OFF_TEXT[plan.off] ?? 'Nothing is planned.';
        else if (plan.next.length) summary = 'Planned from the end date above.';
        else summary = 'Nothing more is planned for this warranty.';
    }

    return (
        <FormSection
            title="Warranty emails"
            description={summary}
            actions={ctx && paid ? (
                <Switch
                    checked={on}
                    onChange={toggle}
                    label={on ? 'Turn off warranty emails for this warranty' : 'Turn on warranty emails for this warranty'}
                    disabled={!documentId || (accountOff && !ctx.documentOff)}
                    busy={busy}
                />
            ) : undefined}
        >
            {!documentId && <p className="-mt-2 text-xs text-muted-foreground">Save the warranty to change this switch.</p>}
            {error && <InlineNote tone="danger" action={<button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={() => { void load(); }}>Retry</button>}>{error}</InlineNote>}

            {ctx && !paid && (
                <InlineNote tone="info" action={<button type="button" className="btn btn-sm btn-primary min-h-[36px]" onClick={() => navigate('/settings#billing')}>See Premium</button>}>
                    Warranty emails are a Premium feature. Your warranties and claims work on every plan.
                </InlineNote>
            )}

            {ctx && paid && plan && plan.next.length > 0 && (
                <ol className="relative ml-1.5 border-l border-border">
                    {plan.next.map(step => (
                        <li key={step.stepKey} className="relative flex min-h-[40px] items-center gap-3 py-1.5 pl-4">
                            <span aria-hidden className="absolute -left-[5px] h-2.5 w-2.5 rounded-full border-2 border-primary bg-card" />
                            <span className="w-[104px] shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatDay(step.date)}</span>
                            <span className="min-w-0 flex-1 text-sm text-foreground">
                                <span className="font-semibold">{AUDIENCE_LABELS[step.audience]}</span>
                                <span className="text-muted-foreground">: {postJobStepLabel('warranty', step.offset).toLowerCase()}</span>
                            </span>
                        </li>
                    ))}
                </ol>
            )}

            {ctx && paid && plan?.off === 'kind_off' && (
                <InlineNote action={<button type="button" className="btn btn-sm btn-outline min-h-[36px]" onClick={() => navigate('/settings#automations')}>Open Automations</button>}>
                    Switch “Warranty ending” on there to start. It then covers warranties that end after the day you switch it on.
                </InlineNote>
            )}

            {(!ctx || paid) && (
                <p className="text-xs text-muted-foreground">
                    {ctx ? warrantyScheduleText(ctx.settings) : 'The client is emailed before the warranty ends.'} Sent from your Gmail. A void or lifetime warranty sends nothing.{' '}
                    <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/settings#automations')}>Days and wording</button>
                </p>
            )}
        </FormSection>
    );
};

export default WarrantyEmailsSection;
