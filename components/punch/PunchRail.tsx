/** Three-colour progress rail of a punch list: verified (green) · done (blue) · open (amber). */
import React from 'react';
import type { PunchProgress } from '../../lib/punchList.ts';

export const PunchRail: React.FC<{ progress: PunchProgress; className?: string }> = ({ progress, className = '' }) => {
    const w = (n: number) => (progress.total ? `${(n / progress.total) * 100}%` : '0%');
    return (
        <span className={`flex h-1.5 overflow-hidden rounded-full bg-muted ${className}`} aria-hidden>
            <span className="bg-success" style={{ width: w(progress.verified) }} />
            <span className="bg-primary" style={{ width: w(progress.done) }} />
            <span className="bg-warning/60" style={{ width: w(progress.open) }} />
        </span>
    );
};

export default PunchRail;
