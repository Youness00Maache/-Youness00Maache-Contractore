/**
 * Client portal: the client's service plans (what is done, how often, price, next and last visit). Reads
 * get_portal_service_plans(portal key); nothing when there is none or the database doesn't have service plans yet.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.ts';
import { parsePortalPlans, type PortalPlan } from '../../lib/servicePlans.ts';

const fmt = (ymd: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
};

const PortalServicePlans: React.FC<{ portalKey: string; className?: string }> = ({ portalKey, className = '' }) => {
    const [plans, setPlans] = useState<PortalPlan[]>([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase.rpc('get_portal_service_plans', { p_key: portalKey });
            if (!cancelled && !error) setPlans(parsePortalPlans(data));
        })().catch(() => undefined);
        return () => { cancelled = true; };
    }, [portalKey]);
    if (!plans.length) return null;
    return (
        <section aria-labelledby="portal-plans-heading" className={className}>
            <h2 id="portal-plans-heading" className="text-lg font-bold">Your service plan{plans.length > 1 ? 's' : ''}</h2>
            <div className="mt-3 space-y-3">
                {plans.map(p => (
                    <div key={p.id} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
                        <span className={`w-1 shrink-0 rounded-full ${p.status === 'active' ? 'bg-primary' : 'bg-warning'}`} aria-hidden />
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold">{p.name}{p.status === 'paused' && <span className="ml-2 badge badge-warning">Paused</span>}</p>
                            <p className="text-sm text-muted-foreground">{[p.frequency, p.priceLabel !== 'Not invoiced here' ? p.priceLabel : ''].filter(Boolean).join(' · ')}</p>
                            {p.service && <p className="mt-1 text-sm">{p.service}</p>}
                            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                <div><dt className="text-xs text-muted-foreground">Next visit</dt><dd className="font-semibold">{p.status === 'active' && p.nextVisit ? fmt(p.nextVisit) : '—'}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Last visit</dt><dd className="font-semibold">{p.lastVisit ? fmt(p.lastVisit) : '—'}</dd></div>
                            </dl>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default PortalServicePlans;
