/**
 * Client portal: "Licensed & insured" line from the contractor's Papers vault (only papers marked "Show in client
 * portal" that have not expired; no files). Reads get_portal_credentials(portal key); nothing when there is none or
 * the vault isn't in the database yet.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.ts';
import { ShieldCheckIcon } from '../Icons.tsx';

interface Credential { kind: string; title: string; number: string; issuer: string; expiresOn: string; coverage: number | null }

const KIND: Record<string, string> = { coi: 'Insured', license: 'Licensed', bond: 'Bonded' };

const fmt = (ymd: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};
const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const PortalCredentials: React.FC<{ portalKey: string; className?: string }> = ({ portalKey, className = '' }) => {
    const [items, setItems] = useState<Credential[]>([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase.rpc('get_portal_credentials', { p_key: portalKey });
            if (cancelled || error || !Array.isArray(data)) return;
            setItems(data.filter((r: any) => r && KIND[r.kind]).map((r: any) => ({
                kind: String(r.kind), title: String(r.title || ''), number: String(r.number || ''), issuer: String(r.issuer || ''),
                expiresOn: String(r.expires_on || ''), coverage: r.coverage_amount === null || r.coverage_amount === undefined ? null : Number(r.coverage_amount),
            })));
        })().catch(() => undefined);
        return () => { cancelled = true; };
    }, [portalKey]);
    if (!items.length) return null;
    const headline = Array.from(new Set(items.map(i => KIND[i.kind]))).join(' & ');
    return (
        <section aria-labelledby="portal-credentials-heading" className={`rounded-2xl border border-success/30 bg-success/5 p-4 ${className}`}>
            <h2 id="portal-credentials-heading" className="flex items-center gap-2 font-semibold"><ShieldCheckIcon className="h-5 w-5 text-success" /> {headline}</h2>
            <ul className="mt-2 space-y-1 text-sm">
                {items.map((c, i) => (
                    <li key={i} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{c.title}</span>
                        {[c.number && `No. ${c.number}`, c.issuer, c.coverage ? money(c.coverage) : '', c.expiresOn && `valid until ${fmt(c.expiresOn)}`].filter(Boolean).map(t => ` · ${t}`).join('')}
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default PortalCredentials;
