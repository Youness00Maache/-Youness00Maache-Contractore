import React from 'react';
import { ZapIcon, ClockIcon, ShieldCheckIcon, TrendingIcon, BarChartIcon, CheckCircleIcon, SparklesIcon } from './Icons.tsx';
import type { AIVisualData } from '../types.ts';

interface Metric {
    label: string;
    value: string | number;
    icon?: string;
}

const getIcon = (iconName?: string) => {
    const props = { className: 'h-5 w-5' };
    switch (String(iconName || '').toLowerCase()) {
        case 'zap': return <ZapIcon {...props} />;
        case 'clock': return <ClockIcon {...props} />;
        case 'shield-check': return <ShieldCheckIcon {...props} />;
        case 'trending-up': return <TrendingIcon {...props} />;
        case 'bar-chart': return <BarChartIcon {...props} />;
        default: return <CheckCircleIcon {...props} />;
    }
};

export const MetricGrid: React.FC<{ metrics: Metric[] }> = ({ metrics }) => (
    <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-3 print:gap-2">
        {metrics.filter(m => m && m.label != null).map((metric, index) => (
            <div key={index} className="flex min-h-[110px] flex-col items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 p-4 text-center">
                <div className="mb-2 rounded-xl bg-card p-2 text-primary shadow-soft">{getIcon(metric.icon)}</div>
                <span className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{String(metric.label)}</span>
                <span className="text-xl font-bold text-foreground">{String(metric.value ?? '')}</span>
            </div>
        ))}
    </div>
);

export const ProgressTracker: React.FC<{ percentage: number }> = ({ percentage }) => {
    const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
    return (
        <div className="my-4 rounded-2xl border border-border bg-muted/40 p-4 print:p-3">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Project completion</span>
                <span className="text-sm font-bold text-primary">{pct}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

export const DataChart: React.FC<{ data: Array<{ name: string; value: number }> }> = ({ data }) => {
    const rows = data.filter(d => d && Number.isFinite(Number(d.value)));
    const maxValue = Math.max(...rows.map(d => Number(d.value)), 1);
    return (
        <div className="my-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <BarChartIcon className="h-4 w-4" /> Breakdown
            </h4>
            <div className="flex h-32 items-end justify-between gap-3 px-1 pt-4">
                {rows.map((item, index) => (
                    <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground">{item.value}</span>
                        <div className="w-full max-w-[40px] rounded-t-lg bg-primary" style={{ height: `${Math.max((Number(item.value) / maxValue) * 100, 5)}%` }} />
                        <span className="w-full truncate text-center text-[10px] font-medium text-muted-foreground">{item.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

/** Legacy `ai_visual_data` block (older AI documents). Renders nothing for empty/malformed data. */
export const AIVisualDisplay: React.FC<{ data?: AIVisualData | null }> = ({ data }) => {
    if (!data || typeof data !== 'object') return null;
    const metrics = Array.isArray(data.metrics) ? data.metrics : [];
    const chart = Array.isArray(data.chart_data) ? data.chart_data : [];
    const progress = typeof data.progress_percentage === 'number' ? data.progress_percentage : undefined;
    if (!metrics.length && !chart.length && progress === undefined) return null;
    return (
        <div className="space-y-3 print:space-y-2">
            <div className="flex items-center gap-2">
                <SparklesIcon className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Project insights</h3>
            </div>
            {metrics.length > 0 && <MetricGrid metrics={metrics} />}
            {progress !== undefined && <ProgressTracker percentage={progress} />}
            {chart.length > 0 && <DataChart data={chart} />}
        </div>
    );
};
