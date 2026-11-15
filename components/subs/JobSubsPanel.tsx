/**
 * Job page › Subs (Premium): who you hired for this job and what you agreed, and the prices you are comparing.
 *  - Subcontracts: the agreed scope and amount with each sub, sent to them on their crew link to accept, payments recorded against
 *    it, retainage held; it counts as committed cost on the job (Job financials › Subcontracts).
 *  - Quotes: prices for the same scope side by side, with plain-word flags; choosing one drafts the subcontract.
 * Hidden until the database has it (lib/subs/subsApi.ts useSubsFeature). Free plan: readable, changes ask to upgrade.
 * Every change needs a connection (it says so); the lists are read again when the connection is back.
 */
import React, { useMemo, useState } from 'react';
import type { Job } from '../../types.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { isPlanLimitError } from '../../lib/jobFiles/jobFilesApi.ts';
import { SUBS_PREMIUM_REASON } from '../../lib/subs/subView.ts';
import { toast } from '../Toast.tsx';
import { Segmented } from '../viewKit.tsx';
import { StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import { useSelectionSuppliers } from '../selections/useSelectionSuppliers.ts';
import QuotesSection from './QuotesSection.tsx';
import SubcontractsSection from './SubcontractsSection.tsx';
import type { SubsGuards } from './subsShared.ts';
import { useJobCommitments, useJobQuotes, useSubMembers } from './useJobSubs.ts';

export interface JobSubsPanelProps {
    job: Job;
    userId: string;
    /** the contractor's company name (in the message that goes with a sub's link) */
    companyName?: string;
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason?: string) => void;
}

type Section = 'subcontracts' | 'quotes';

const JobSubsPanel: React.FC<JobSubsPanelProps> = ({ job, userId, companyName = '', plan, isOnline, onUpgrade }) => {
    const paid = isPaidTier(plan);
    const commitments = useJobCommitments(job.id, isOnline);
    const quotes = useJobQuotes(job.id, isOnline);
    const members = useSubMembers(true, isOnline);
    const [section, setSection] = useState<Section>('subcontracts');
    const sup = useSelectionSuppliers(userId, section === 'quotes');

    const guards = useMemo<SubsGuards>(() => ({
        paid,
        isOnline,
        onUpgrade,
        needPremium: () => {
            if (paid) return true;
            onUpgrade(SUBS_PREMIUM_REASON);
            return false;
        },
        needOnline: () => {
            if (isOnline) return true;
            toast.error(NEEDS_CONNECTION);
            return false;
        },
        fail: (e, fallback) => {
            if (isPlanLimitError(e)) onUpgrade(planLimitMessage(e));
            else toast.error(describeError(e, fallback));
        },
    }), [paid, isOnline, onUpgrade]);

    const cList = Array.isArray(commitments.items) ? commitments.items : [];
    const qList = Array.isArray(quotes.items) ? quotes.items : [];

    // ------------------------------------------------------------------------------ states
    if (commitments.items === undefined || quotes.items === undefined) return <div className="skeleton h-40 w-full rounded-2xl" aria-busy="true" />;
    if (commitments.items === null || quotes.items === null) {
        return (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Subcontractors and quote comparison are being switched on for your account. Check back soon.
            </div>
        );
    }
    if (!commitments.ready && !quotes.ready && (commitments.error || quotes.error)) {
        return (
            <div className="rounded-2xl border border-border bg-card p-5 text-sm" role="alert">
                <p className="font-semibold">{isOnline ? commitments.error || quotes.error : NEEDS_CONNECTION}</p>
                <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => { void commitments.reload(); void quotes.reload(); }} disabled={!isOnline}>Try again</button>
            </div>
        );
    }
    if (!paid && cList.length === 0 && qList.length === 0) {
        return (
            <section className="rounded-2xl border border-primary/30 bg-card p-5" aria-labelledby="subs-premium">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Premium</p>
                <h3 id="subs-premium" className="mt-1 text-lg font-bold">Know what you owe your subs, and who to hire</h3>
                <p className="mt-1 text-sm text-muted-foreground">Write down each subcontract with its scope, amount and retainage, and send it to the sub on their crew link to accept. Record every payment against it. Put two or three quotes for the same work side by side, see what is lowest and what is missing, and turn the one you pick into a subcontract.</p>
                <button type="button" className="btn btn-primary mt-4" onClick={() => onUpgrade(SUBS_PREMIUM_REASON)}><StarIcon className="h-4 w-4" /> Upgrade to Premium</button>
            </section>
        );
    }

    const loadError = commitments.error || quotes.error;

    return (
        <section aria-labelledby="subs-heading" className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="subs-heading" className="text-base font-bold leading-tight">Subcontractors</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">Who you hired for this job and what you agreed, and the prices you are comparing.</p>
                    </div>
                    <HelpButton topic={section === 'quotes' ? 'compare-quotes' : 'subcontractors'} />
                </div>
                <div className="mt-3">
                    <Segmented<Section>
                        ariaLabel="Subcontractors sections"
                        value={section}
                        onChange={setSection}
                        options={[
                            { value: 'subcontracts', label: <>Subcontracts <span className="ml-0.5 tabular-nums opacity-70">{cList.length}</span></> },
                            { value: 'quotes', label: <>Quotes <span className="ml-0.5 tabular-nums opacity-70">{qList.length}</span></> },
                        ]}
                    />
                </div>
            </div>

            {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm" role="status">{NEEDS_CONNECTION}</p>}
            {!paid && <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">Subcontractors and quote comparison are part of Premium. You can still read these; <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onUpgrade(SUBS_PREMIUM_REASON)}>upgrade</button> to send and change them.</p>}
            {loadError && <p className="text-sm text-destructive" role="alert">{loadError} <button type="button" className="underline" onClick={() => { void commitments.reload(); void quotes.reload(); }}>Try again</button></p>}

            {section === 'subcontracts' ? (
                <SubcontractsSection jobId={job.id} userId={userId} company={companyName} commitments={commitments} members={members} guards={guards} />
            ) : (
                <QuotesSection
                    jobId={job.id}
                    userId={userId}
                    quotes={quotes}
                    commitments={commitments}
                    members={members}
                    suppliers={sup.available ? sup.suppliers : null}
                    guards={guards}
                    onShowSubcontracts={() => setSection('subcontracts')}
                />
            )}
        </section>
    );
};

export default JobSubsPanel;
