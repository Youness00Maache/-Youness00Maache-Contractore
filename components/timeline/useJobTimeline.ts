/**
 * Job timeline: loads the data when the tab opens (lib/timeline/timelineApi.ts). The last result of each job is kept in
 * memory, so coming back to the tab shows it at once while a fresh read runs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadTimelineData, type TimelineFeatures, type TimelineLoad } from '../../lib/timeline/timelineApi.ts';
import type { TimelineDoc } from '../../lib/timeline/timelineTypes.ts';

const cache = new Map<string, TimelineLoad>();

export function useJobTimeline(args: {
    jobId: string;
    userId: string;
    features: TimelineFeatures;
    online: boolean;
    /** documents the page already has (used offline, or when the read fails) */
    fallbackDocs: readonly TimelineDoc[];
}): { load: TimelineLoad | null; loading: boolean; reload: () => Promise<void> } {
    const { jobId, userId, features, online } = args;
    const [load, setLoad] = useState<TimelineLoad | null>(() => cache.get(jobId) ?? null);
    const [loading, setLoading] = useState(true);
    const fallbackRef = useRef(args.fallbackDocs);
    fallbackRef.current = args.fallbackDocs;
    const alive = useRef(true);
    const featureKey = Object.entries(features).map(([k, v]) => `${k}:${v ? 1 : 0}`).join(',');

    const run = useCallback(async () => {
        setLoading(true);
        const result = await loadTimelineData({ jobId, userId, features, online, fallbackDocs: fallbackRef.current });
        if (!alive.current) return;
        cache.set(jobId, result);
        setLoad(result);
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobId, userId, featureKey, online]);

    useEffect(() => {
        alive.current = true;
        void run();
        return () => { alive.current = false; };
    }, [run]);

    return { load, loading, reload: run };
}
