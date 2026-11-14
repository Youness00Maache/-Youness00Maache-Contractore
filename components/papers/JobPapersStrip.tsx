/**
 * Job page: the permits (and other papers) linked to this job in the Papers vault, as one compact line each:
 * number, issuer, next inspection and expiry. Nothing when there are none or the vault isn't in the database.
 */
import React, { useEffect, useState } from 'react';
import { expiryPhrase, expiryState, paperKindShort, type CompanyPaper } from '../../lib/papers.ts';
import { listJobPapers } from './papersApi.ts';
import { formatYMD, todayYMD } from '../../utils/localDates.ts';

const JobPapersStrip: React.FC<{ jobId: string; onOpenPapers: () => void }> = ({ jobId, onOpenPapers }) => {
    const [papers, setPapers] = useState<CompanyPaper[]>([]);
    useEffect(() => {
        let cancelled = false;
        listJobPapers(jobId).then(list => { if (!cancelled && list) setPapers(list); }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [jobId]);
    if (!papers.length) return null;
    const today = todayYMD();
    return (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Permits and papers of this job">
            {papers.map(p => {
                const { state, days } = expiryState(p.expiresOn, today);
                const tone = state === 'expired' ? 'border-destructive/40 text-destructive' : state === 'urgent' || state === 'soon' ? 'border-warning/50' : 'border-border';
                const inspection = p.inspectionOn && p.inspectionOn >= today ? `inspection ${formatYMD(p.inspectionOn, { month: 'short', day: 'numeric' })}` : '';
                return (
                    <button key={p.id} type="button" onClick={onOpenPapers} className={`inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-left text-xs ${tone}`}>
                        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{paperKindShort(p.kind)}</span>
                        <span className="min-w-0 truncate">
                            <span className="font-semibold text-foreground">{p.number || p.title}</span>
                            {[p.issuer, inspection, p.expiresOn ? expiryPhrase(days) : ''].filter(Boolean).map(t => ` · ${t}`).join('')}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

export default JobPapersStrip;
