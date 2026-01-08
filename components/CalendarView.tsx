
import React, { useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Job } from '../types';
import { Button } from './ui/Button.tsx';
import { Card, CardContent } from './ui/Card.tsx';
import { BackArrowIcon, PlusIcon, CalendarIcon, ChevronDownIcon } from './Icons.tsx';

const locales = {
    'en-US': enUS,
};

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

interface CalendarViewProps {
    jobs: Job[];
    onBack: () => void;
    onNavigateJob: (jobId: string) => void;
    onNewJob: () => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ jobs, onBack, onNavigateJob, onNewJob }) => {

    const events = useMemo(() => {
        return jobs.map(job => {
            // Parse start date
            let start = new Date(job.startDate);
            // Default to 1 hour duration or end of day if no end date provided
            let end = job.endDate ? new Date(job.endDate) : new Date(start);

            // Ensure end is at least same as start
            if (end < start) end = start;

            return {
                id: job.id,
                title: `${job.name} - ${job.clientName}`,
                start,
                end,
                allDay: true,
                resource: job
            };
        });
    }, [jobs]);

    const eventStyleGetter = (event: any) => {
        let backgroundColor = '#3b82f6'; // default blue
        let borderLeftColor = '#2563eb';
        const status = event.resource.status;

        if (status === 'completed') {
            backgroundColor = '#10b981'; // green
            borderLeftColor = '#059669';
        }
        if (status === 'active') {
            backgroundColor = '#3b82f6'; // blue
            borderLeftColor = '#2563eb';
        }
        if (status === 'paused') {
            backgroundColor = '#f97316'; // orange
            borderLeftColor = '#ea580c';
        }
        if (status === 'inactive') {
            backgroundColor = '#6b7280'; // gray
            borderLeftColor = '#4b5563';
        }

        return {
            style: {
                backgroundColor,
                borderLeft: `4px solid ${borderLeftColor}`,
                borderRadius: '4px',
                opacity: 1,
                color: 'white',
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: '600',
                padding: '4px 8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'transform 0.1s ease',
            }
        };
    };

    return (
        <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8 pb-24">
            {/* Modern Header */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <div className="flex items-center">
                    <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                        <BackArrowIcon className="h-6 w-6" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                            Calendar
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Simple Legend */}
                    <div className="hidden md:flex items-center gap-4 text-xs font-medium bg-card border border-border/60 px-3 py-1.5 rounded-full shadow-sm mr-2">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500 ring-2 ring-blue-500/20"></span> Active
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-green-500/20"></span> Completed
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-orange-500 ring-2 ring-orange-500/20"></span> Paused
                        </div>
                    </div>
                    <Button onClick={onNewJob} className="shadow-md shadow-primary/20 rounded-full px-6">
                        <PlusIcon className="w-4 h-4 mr-2" /> New Job
                    </Button>
                </div>
            </header>

            {/* Main Calendar Card */}
            <Card className="flex-1 border-0 shadow-xl ring-1 ring-slate-900/5 overflow-hidden flex flex-col min-h-[600px] bg-card rounded-2xl">
                <CardContent className="p-0 flex-1 h-full">
                    <style>{`
                /* --- General Reset & Fonts --- */
                .rbc-calendar { 
                    font-family: var(--font-sans), system-ui, sans-serif; 
                    color: var(--foreground);
                }

                /* --- Toolbar (Header) --- */
                .rbc-toolbar {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 1rem;
                    align-items: center;
                    margin-bottom: 2rem;
                    padding: 0 1rem;
                }
                .rbc-toolbar-label {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--foreground);
                    order: 1;
                    width: 100%;
                    text-align: left;
                    margin-bottom: 1rem;
                }
                @media (min-width: 768px) {
                    .rbc-toolbar-label {
                        width: auto;
                        margin-bottom: 0;
                        order: 2; /* Title between buttons */
                        text-align: center;
                        flex: 1;
                    }
                    .rbc-btn-group:first-child { order: 1; }
                    .rbc-btn-group:last-child { order: 3; }
                }

                /* Button Groups */
                .rbc-btn-group {
                    display: inline-flex;
                    background-color: var(--secondary);
                    padding: 4px;
                    border-radius: 99px; /* Pill shape */
                }
                .rbc-btn-group button {
                    background-color: transparent;
                    border: none;
                    color: var(--muted-foreground);
                    padding: 6px 16px;
                    font-size: 0.875rem;
                    font-weight: 600;
                    border-radius: 99px !important; /* Pill shape buttons */
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: none !important;
                }
                .rbc-btn-group button:hover {
                    color: var(--foreground);
                    background-color: rgba(255,255,255,0.5);
                }
                .rbc-btn-group button.rbc-active {
                    background-color: var(--background);
                    color: var(--foreground);
                    box-shadow: 0 2px 5px rgba(0,0,0,0.05) !important;
                }
                .dark .rbc-btn-group button:hover { background-color: rgba(255,255,255,0.1); }

                /* --- Month View Grid --- */
                .rbc-month-view {
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    overflow: hidden;
                    background-color: var(--card);
                }
                .rbc-header {
                    padding: 12px 0;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--muted-foreground);
                    border-bottom: 1px solid var(--border);
                    background-color: var(--muted/30);
                }
                .rbc-header + .rbc-header { border-left: 1px solid var(--border); }
                .rbc-date-cell {
                    padding: 8px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    color: var(--muted-foreground);
                }
                .rbc-day-bg + .rbc-day-bg { border-left: 1px solid var(--border); }
                .rbc-month-row + .rbc-month-row { border-top: 1px solid var(--border); }
                .rbc-off-range-bg { background-color: var(--secondary); opacity: 0.3; }

                /* "Today" Highlight */
                .rbc-today { background-color: transparent; }
                .rbc-date-cell.rbc-now {
                    position: relative;
                    color: var(--primary-foreground);
                    z-index: 10;
                }
                .rbc-date-cell.rbc-now::before {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 28px;
                    height: 28px;
                    background-color: var(--primary);
                    border-radius: 50%;
                    z-index: -1;
                }

                /* --- Events --- */
                .rbc-event {
                    border-radius: 6px;
                    padding: 2px 6px;
                    font-size: 0.8rem;
                    font-weight: 500;
                    border: none !important;
                    margin: 1px 4px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }
                .rbc-event-content { text-overflow: ellipsis; }

                /* --- Agenda View Modernization --- */
                .rbc-agenda-view table.rbc-agenda-table {
                    border: none;
                    border-spacing: 0 8px; /* Gap between items */
                    border-collapse: separate;
                }
                .rbc-agenda-view table.rbc-agenda-table tbody > tr > td {
                    padding: 12px;
                    vertical-align: middle;
                    background-color: var(--card);
                    border: none;
                    border-top: 1px solid var(--border);
                    border-bottom: 1px solid var(--border);
                }
                .rbc-agenda-view table.rbc-agenda-table tbody > tr > td:first-child {
                    border-left: 1px solid var(--border);
                    border-top-left-radius: 8px;
                    border-bottom-left-radius: 8px;
                }
                .rbc-agenda-view table.rbc-agenda-table tbody > tr > td:last-child {
                    border-right: 1px solid var(--border);
                    border-top-right-radius: 8px;
                    border-bottom-right-radius: 8px;
                }
                .rbc-agenda-date-cell {
                    font-weight: 700;
                    color: var(--foreground);
                    white-space: nowrap;
                }
                .rbc-agenda-time-cell {
                    text-transform: lowercase;
                    font-size: 0.85rem;
                    color: var(--muted-foreground);
                }
                
                /* Dark Mode Fixes */
                .dark .rbc-off-range-bg { background-color: rgba(255,255,255,0.05); }
            `}</style>
                    <Calendar
                        localizer={localizer}
                        events={events}
                        startAccessor="start"
                        endAccessor="end"
                        style={{ height: '100%' }}
                        views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
                        defaultView={Views.MONTH}
                        onSelectEvent={(event) => onNavigateJob(event.id)}
                        eventPropGetter={eventStyleGetter}
                        popup
                        className="rounded-b-2xl"
                    />
                </CardContent>
            </Card>
        </div>
    );
};

export default CalendarView;
