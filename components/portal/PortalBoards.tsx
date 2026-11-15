/**
 * Client portal › Project › "Ideas board": the mood boards the contractor chose to share, read-only. Pictures can be
 * enlarged, links open in a new tab, colours show as swatches and notes as quotes. Renders NOTHING when there is nothing
 * to show, so a portal without shared boards looks exactly like before. The gallery is the same one the contractor previews
 * (components/boards/BoardGallery.tsx). Data: lib/portal/selectionsApi.ts loadPortalBoards.
 */
import React from 'react';
import type { PortalBoard } from '../../lib/portal/selectionsApi.ts';
import { boardsForJob } from '../../lib/portal/selectionView.ts';
import { cx } from '../commsKit.tsx';
import BoardGallery from '../boards/BoardGallery.tsx';

const PortalBoards: React.FC<{ boards: PortalBoard[]; jobId: string | null; className?: string }> = ({ boards, jobId, className }) => {
    const shown = boardsForJob(boards, jobId);
    if (shown.length === 0) return null;
    return (
        <section aria-labelledby="portal-boards-heading" className={cx(className)} data-testid="portal-boards">
            <h2 id="portal-boards-heading" className="text-lg font-bold">{shown.length === 1 ? 'Ideas board' : 'Ideas boards'}</h2>
            <div className="mt-3 space-y-7">
                {shown.map(b => (
                    <div key={b.id}>
                        {(shown.length > 1 || b.title) && <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{b.title}{b.jobName && shown.some(x => x.jobName !== b.jobName) ? ` · ${b.jobName}` : ''}</h3>}
                        <BoardGallery items={b.items} />
                    </div>
                ))}
            </div>
        </section>
    );
};

export default PortalBoards;
