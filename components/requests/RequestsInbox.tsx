/**
 * Dashboard: quote requests from the public request page. New requests show as a short list with a count;
 * otherwise a one-line bar links to the inbox and to the link / QR settings. Renders nothing until the
 * database has the feature (migration 20261113000400), so the dashboard is unchanged before that.
 * Refreshes when the tab gets focus and every 3 minutes while visible.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Segmented } from '../viewKit.tsx';
import { ChevronRightIcon } from '../Icons.tsx';
import { relativeTime, requestSnippet, sourceLabel, type QuoteRequest } from './requestLogic.ts';
import { flushStorageCleanup, listQuoteRequests } from './requestsApi.ts';
import RequestDetailModal, { type RequestActionsProps } from './RequestDetailModal.tsx';
import RequestLinkSettings from './RequestLinkSettings.tsx';
import { OPEN_REQUEST_EVENT, takePendingQuoteRequest } from '../../lib/notifications/intents.ts';

export interface RequestsInboxProps extends RequestActionsProps {
    companyName?: string;
    logoUrl?: string;
    phone?: string;
}

const REFRESH_MS = 3 * 60 * 1000;

const STATUS_TEXT: Record<QuoteRequest['status'], string> = {
    new: 'New',
    seen: 'Not answered',
    converted: 'Job created',
    archived: 'Archived',
};

const RequestRow: React.FC<{ req: QuoteRequest; onOpen: () => void; showStatus?: boolean }> = ({ req, onOpen, showStatus }) => {
    const meta = [
        req.photoPaths.length ? `${req.photoPaths.length} ${req.photoPaths.length === 1 ? 'photo' : 'photos'}` : '',
        req.address ? req.address.split(/\r?\n|,/)[0].trim() : '',
        sourceLabel(req.source),
    ].filter(Boolean).join(' · ');
    return (
        <li>
            <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/60">
                <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${req.status === 'new' ? 'bg-primary' : 'bg-transparent'}`} />
                <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate ${req.status === 'new' ? 'font-semibold' : 'font-medium'} text-foreground`}>{req.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(req.createdAt)}</span>
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">{requestSnippet(req.details, 90) || 'No description'}</span>
                    {(meta || showStatus) && (
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {showStatus && <span className={req.status === 'converted' ? 'font-medium text-success' : req.status === 'new' ? 'font-medium text-primary' : ''}>{STATUS_TEXT[req.status]}</span>}
                            {meta && <span className="truncate">{meta}</span>}
                        </span>
                    )}
                </span>
                <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
        </li>
    );
};

const RequestsInbox: React.FC<RequestsInboxProps> = ({ companyName, logoUrl, phone, ...actions }) => {
    /** undefined = loading, null = feature not in the database yet */
    const [items, setItems] = useState<QuoteRequest[] | null | undefined>(undefined);
    const [openId, setOpenId] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [showLink, setShowLink] = useState(false);
    const [view, setView] = useState<'open' | 'archived'>('open');

    const load = useCallback(async () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        try {
            const list = await listQuoteRequests({ view: 'all', limit: 200 });
            setItems(list);
        } catch {
            setItems(prev => (prev === undefined ? [] : prev));
        }
    }, []);

    useEffect(() => {
        void load();
        // files of deleted jobs / photos / requests that are still in storage
        const t = window.setTimeout(() => { flushStorageCleanup().catch(() => undefined); }, 4000);
        const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, REFRESH_MS);
        return () => {
            window.clearTimeout(t);
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [load]);

    // a notification asked to open a request (lib/notifications/intents.ts): opened once the list has it; given up
    // when a fresh load doesn't have it either
    const [wanted, setWanted] = useState<{ id: string; seen: QuoteRequest[] | null | undefined } | null>(null);
    const itemsRef = useRef(items);
    itemsRef.current = items;
    useEffect(() => {
        const pending = takePendingQuoteRequest();
        if (pending) setWanted({ id: pending, seen: undefined });
        const on = (e: Event) => {
            const id = (e as CustomEvent<string>).detail;
            takePendingQuoteRequest();
            if (!id) return;
            setWanted({ id, seen: itemsRef.current });
            void load();
        };
        window.addEventListener(OPEN_REQUEST_EVENT, on);
        return () => window.removeEventListener(OPEN_REQUEST_EVENT, on);
    }, [load]);
    useEffect(() => {
        if (!wanted || !items) return;
        if (items.some(r => r.id === wanted.id)) { setShowAll(false); setOpenId(wanted.id); setWanted(null); }
        else if (items !== wanted.seen) setWanted(null);
    }, [wanted, items]);

    const list = items || [];
    const fresh = useMemo(() => list.filter(r => r.status === 'new'), [list]);
    const open = useMemo(() => list.filter(r => r.status !== 'archived'), [list]);
    const archived = useMemo(() => list.filter(r => r.status === 'archived'), [list]);
    const waiting = useMemo(() => list.filter(r => r.status === 'seen').length, [list]);
    const selected = openId ? list.find(r => r.id === openId) || null : null;

    const update = (req: QuoteRequest) => setItems(prev => (prev ? prev.map(r => (r.id === req.id ? req : r)) : prev));
    const removeLocal = (id: string) => setItems(prev => (prev ? prev.filter(r => r.id !== id) : prev));

    if (items === undefined || items === null) return null;

    const modals = (
        <>
            <RequestDetailModal
                request={selected}
                onClose={() => setOpenId(null)}
                onChanged={update}
                onDeleted={removeLocal}
                {...actions}
                onOpenJob={(jobId) => { setShowAll(false); actions.onOpenJob(jobId); }}
            />
            <Modal open={showAll && !selected} onClose={() => setShowAll(false)} size="lg" title="Quote requests"
                description="Everything sent from your request page, newest first." bodyClassName="px-0 sm:px-0">
                <div className="px-5 pb-3 sm:px-6">
                    <Segmented<'open' | 'archived'>
                        ariaLabel="Show"
                        value={view}
                        onChange={(v) => setView(v)}
                        options={[{ value: 'open', label: `Inbox (${open.length})` }, { value: 'archived', label: `Archived (${archived.length})` }]}
                    />
                </div>
                {(view === 'open' ? open : archived).length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-6">
                        {view === 'open' ? 'No requests yet. Share your link or print the QR code to get some.' : 'Nothing archived.'}
                    </p>
                ) : (
                    <ul className="divide-y divide-border border-t border-border">
                        {(view === 'open' ? open : archived).map(r => <RequestRow key={r.id} req={r} showStatus onOpen={() => setOpenId(r.id)} />)}
                    </ul>
                )}
            </Modal>
            <Modal open={showLink} onClose={() => setShowLink(false)} size="lg" title="Request-a-quote link">
                <RequestLinkSettings embedded plan={actions.plan} companyName={companyName} logoUrl={logoUrl} phone={phone} onUpgrade={(r) => { setShowLink(false); actions.onUpgrade(r); }} />
            </Modal>
        </>
    );

    if (fresh.length === 0) {
        return (
            <>
                <section aria-label="Quote requests" className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Quote requests</p>
                        <p className="text-xs text-muted-foreground">
                            {waiting > 0
                                ? `${waiting} ${waiting === 1 ? 'request is' : 'requests are'} waiting for a reply.`
                                : list.length > 0
                                    ? 'No new requests.'
                                    : 'Get new work from your Google profile, website, truck and yard signs with your own request link.'}
                        </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        {list.length > 0 && <button type="button" className="btn btn-sm btn-outline flex-1 sm:flex-none" onClick={() => { setView('open'); setShowAll(true); }}>Inbox</button>}
                        <button type="button" className="btn btn-sm btn-outline flex-1 sm:flex-none" onClick={() => setShowLink(true)}>Link &amp; QR code</button>
                    </div>
                </section>
                {modals}
            </>
        );
    }

    return (
        <>
            <section aria-labelledby="quote-requests-heading" className="card mb-6 overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <h2 id="quote-requests-heading" className="flex items-center gap-2 text-sm font-semibold">
                        New quote requests <span className="badge badge-primary tabular-nums">{fresh.length}</span>
                    </h2>
                    <div className="flex shrink-0 gap-1">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setView('open'); setShowAll(true); }}>Inbox</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLink(true)}>Link &amp; QR</button>
                    </div>
                </div>
                <ul className="divide-y divide-border">
                    {fresh.slice(0, 3).map(r => <RequestRow key={r.id} req={r} onOpen={() => setOpenId(r.id)} />)}
                </ul>
                {fresh.length > 3 && (
                    <button type="button" className="w-full border-t border-border px-4 py-2.5 text-sm font-semibold text-primary hover:bg-muted/60" onClick={() => { setView('open'); setShowAll(true); }}>
                        See all {fresh.length} new requests
                    </button>
                )}
            </section>
            {modals}
        </>
    );
};

export default RequestsInbox;
