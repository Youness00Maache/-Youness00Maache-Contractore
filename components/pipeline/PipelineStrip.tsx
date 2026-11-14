/**
 * Dashboard entry to the pipeline board: one row with what is open, what needs you, and a bar of the jobs per stage
 * (widths follow the counts). Tapping it opens /pipeline. Renders nothing for an account with no jobs or requests.
 */
import React, { useMemo } from 'react';
import type { Job } from '../../types.ts';
import { buildPipeline } from '../../lib/pipeline.ts';
import { todayYMD } from '../../utils/localDates.ts';
import { ChevronRightIcon } from '../Icons.tsx';
import { usePipelineData } from './usePipelineData.ts';
import { STAGE_STYLE, shortMoney } from './pipelineUi.tsx';

const PipelineStrip: React.FC<{
    jobs: Array<Job & { clientId?: string | null }>;
    /** the app's document list (reload when it changes) */
    refreshKey?: unknown;
    onOpen: () => void;
}> = ({ jobs, refreshKey, onOpen }) => {
    const { data, loading } = usePipelineData(refreshKey);
    const today = todayYMD();
    const board = useMemo(() => buildPipeline({
        jobs: jobs.map(j => ({ id: j.id, name: j.name, clientName: j.clientName, clientId: j.clientId ?? null, status: j.status, createdAt: j.createdAt ?? null, startDate: j.startDate })),
        docs: data?.docs || [],
        requests: data?.requests ?? null,
        today,
    }), [jobs, data, today]);

    if (!data) {
        // first load only (offline / failed: nothing, the dashboard stays as it was)
        return jobs.length > 0 && loading ? <div className="skeleton mb-6 h-[74px] w-full rounded-2xl" aria-hidden /> : null;
    }
    if (board.cards.length === 0) return null;

    const counted = board.columns.filter(c => c.cards.length > 0);
    return (
        <button
            type="button"
            onClick={onOpen}
            className="group mb-6 flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-soft transition hover:border-primary/40 hover:shadow-card"
            aria-label={`Pipeline: ${board.cards.length} jobs and requests, ${board.attention} need you. Open the board.`}
        >
            <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">Pipeline</span>
                    <span className="truncate text-xs text-muted-foreground">
                        {board.attention > 0
                            ? <><span className="font-semibold text-warning">{board.attention} {board.attention === 1 ? 'needs' : 'need'} you</span> · </>
                            : null}
                        <span className="tabular-nums">{shortMoney(board.openValue)}</span> open
                    </span>
                </span>
                {/* jobs per stage, widths follow the counts */}
                <span className="mt-2 flex h-1.5 w-full gap-[3px] overflow-hidden rounded-full" aria-hidden>
                    {counted.map(c => (
                        <span key={c.stage} className={`h-full rounded-full ${STAGE_STYLE[c.stage].bar}`} style={{ flexGrow: c.cards.length, flexBasis: 0, minWidth: 6 }} />
                    ))}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {counted.map(c => (
                        <span key={c.stage} className="whitespace-nowrap">
                            <span className={`font-semibold tabular-nums ${STAGE_STYLE[c.stage].text}`}>{c.cards.length}</span> {c.meta.label.toLowerCase()}
                            {c.attention > 0 && <span className="ml-0.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-warning align-middle" />}
                        </span>
                    ))}
                </span>
            </span>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
        </button>
    );
};

export default PipelineStrip;
