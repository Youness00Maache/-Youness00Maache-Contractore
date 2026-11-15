/**
 * Job timeline: the small marks on the rail. Each group has its own shape AND colour (so the rail reads without text
 * and colour is never the only cue): money = dot, documents = square, photos = ring, field = triangle, client = diamond,
 * team = target, notes = bar. The same marks sit in the filter chips, so the chips are also the legend.
 */
import React from 'react';
import type { TimelineActor, TimelineGroup } from '../../lib/timeline/timelineTypes.ts';

const TONE: Record<TimelineGroup, string> = {
    money: 'text-success', documents: 'text-primary', photos: 'text-warning', field: 'text-foreground/75',
    client: 'text-accent-foreground', team: 'text-muted-foreground', notes: 'text-foreground/50',
};

export const GroupMark: React.FC<{ group: TimelineGroup; size?: number; className?: string }> = ({ group, size = 12, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className={`shrink-0 ${TONE[group]} ${className}`} focusable="false">
        {group === 'money' && <circle cx="6" cy="6" r="4.5" fill="currentColor" />}
        {group === 'documents' && <rect x="2" y="2" width="8" height="8" rx="1.6" fill="currentColor" />}
        {group === 'photos' && <circle cx="6" cy="6" r="3.8" fill="none" stroke="currentColor" strokeWidth="2" />}
        {group === 'field' && <path d="M6 1.6 11 10.4H1z" fill="currentColor" strokeLinejoin="round" stroke="currentColor" strokeWidth="1" />}
        {group === 'client' && <rect x="2.6" y="2.6" width="6.8" height="6.8" rx="1" fill="currentColor" transform="rotate(45 6 6)" />}
        {group === 'team' && (<><circle cx="6" cy="6" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="6" cy="6" r="1.5" fill="currentColor" /></>)}
        {group === 'notes' && <rect x="1" y="4.2" width="10" height="3.6" rx="1.8" fill="currentColor" />}
    </svg>
);

/** Who did it, as a short word under the title (nothing for "you": most entries are yours). */
export const ACTOR_WORD: Partial<Record<TimelineActor, string>> = { client: 'Client', crew: 'Crew', sub: 'Subcontractor', system: 'Automatic' };
