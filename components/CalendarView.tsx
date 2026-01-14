
import React, { useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, parse, startOfWeek, getDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Job } from '../types';
import { Button } from './ui/Button.tsx';
import { Card, CardContent } from './ui/Card.tsx';
import {
    BackArrowIcon, PlusIcon, CalendarIcon, ChevronDownIcon,
    BriefcaseIcon, CheckCircleIcon, ClockIcon
} from './Icons.tsx';

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
    const [currentDate, setCurrentDate] = useState(new Date());
    const [currentView, setCurrentView] = useState(Views.MONTH);

    // --- Data Processing ---
    const events = useMemo(() => {
        return jobs.map(job => {
            let start = new Date(job.startDate);
            let end = job.endDate ? new Date(job.endDate) : new Date(start);
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

    const stats = useMemo(() => {
        const active = jobs.filter(j => j.status === 'active').length;
        const upcoming = jobs.filter(j => new Date(j.startDate) > new Date()).length;
        const complete = jobs.filter(j => j.status === 'completed').length;
        return { active, upcoming, complete };
    }, [jobs]);

    // --- Navigation Logic ---
    const handleNavigate = (action: 'PREV' | 'NEXT' | 'TODAY') => {
        if (action === 'TODAY') {
            setCurrentDate(new Date());
            return;
        }

        if (currentView === Views.MONTH) {
            setCurrentDate(d => action === 'NEXT' ? addMonths(d, 1) : subMonths(d, 1));
        } else if (currentView === Views.WEEK) {
            setCurrentDate(d => action === 'NEXT' ? addWeeks(d, 1) : subWeeks(d, 1));
        } else {
            setCurrentDate(d => action === 'NEXT' ? addDays(d, 1) : subDays(d, 1));
        }
    };

    const handleViewChange = (view: any) => setCurrentView(view);

    // --- Styling ---
    const eventStyleGetter = (event: any) => {
        let backgroundColor = '#3b82f6';
        let borderLeftColor = '#2563eb';
        const status = event.resource.status;

        if (status === 'completed') {
            backgroundColor = '#10b981';
            borderLeftColor = '#059669';
        } else if (status === 'active') {
            backgroundColor = '#3b82f6';
            borderLeftColor = '#2563eb';
        } else if (status === 'paused') {
            backgroundColor = '#f97316';
            borderLeftColor = '#ea580c';
        } else if (status === 'inactive') {
            backgroundColor = '#6b7280';
            borderLeftColor = '#4b5563';
        }

        return {
            style: {
                backgroundColor,
                borderLeft: `4px solid ${borderLeftColor}`,
                borderRadius: '4px',
                opacity: 0.9,
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

    const StatBadge = ({ icon: Icon, label, value }: any) => (
        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-2 text-white shadow-sm hover:bg-white/15 transition-colors cursor-default">
            <div className={`p-2 rounded-full bg-white/20`}>
                <Icon className="w-4 h-4 text-white" />
            </div>
            <div>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-wider">{label}</p>
                <p className="text-xl font-bold leading-none">{value}</p>
            </div>
        </div>
    );

    return (
        <div className="w-full h-full bg-background text-foreground flex flex-col animate-in fade-in slide-in-from-right-4 duration-300 overflow-x-hidden">

            {/* --- Premium Header --- */}
            <header className="relative overflow-hidden rounded-b-3xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-xl -mx-4 md:-mx-8 md:-mt-8 p-6 md:p-10 mb-6 min-h-[160px] flex items-center">
                <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 p-24 bg-black/10 rounded-full blur-2xl -ml-12 -mb-12 pointer-events-none"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 w-full">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onBack}
                            className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md shadow-lg rounded-full w-12 h-12 p-0 flex items-center justify-center transition-transform hover:scale-105"
                        >
                            <BackArrowIcon className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                                <CalendarIcon className="w-8 h-8 opacity-90" />
                                Schedule
                            </h1>
                            <p className="text-blue-100/80 text-sm font-medium mt-1">Manage your team and projects efficiently</p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                        <div className="grid grid-cols-3 gap-3 mr-2">
                            <StatBadge icon={BriefcaseIcon} label="Active" value={stats.active} />
                            <StatBadge icon={ClockIcon} label="Upcoming" value={stats.upcoming} />
                            <StatBadge icon={CheckCircleIcon} label="Done" value={stats.complete} />
                        </div>
                        <Button
                            onClick={onNewJob}
                            className="bg-white text-blue-700 hover:bg-blue-50 hover:text-blue-800 shadow-xl border-none font-bold px-6 py-0 h-14 rounded-xl transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                        >
                            <PlusIcon className="w-5 h-5" /> New Job
                        </Button>
                    </div>
                </div>
            </header>

            {/* --- Floating Calendar Card --- */}
            <div className="px-4 md:px-8 pb-12 w-full max-w-7xl mx-auto mt-4 relative z-20">
                <Card className="border-0 shadow-2xl ring-1 ring-black/5 overflow-hidden flex flex-col min-h-[650px] bg-card rounded-3xl">

                    {/* --- Custom Toolbar --- */}
                    <div className="p-4 md:p-6 border-b flex flex-col md:flex-row justify-between items-center gap-4 bg-muted/5 backdrop-blur-sm">
                        <div className="flex items-center bg-muted/50 p-1 rounded-xl border shadow-sm">
                            <button
                                onClick={() => handleNavigate('PREV')}
                                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-background hover:shadow-sm transition-all text-muted-foreground hover:text-primary"
                            >
                                <ChevronDownIcon className="w-5 h-5 rotate-90" />
                            </button>
                            <button
                                onClick={() => handleNavigate('TODAY')}
                                className="px-5 h-10 text-sm font-bold hover:bg-background hover:shadow-sm rounded-lg transition-all text-muted-foreground hover:text-primary"
                            >
                                Today
                            </button>
                            <button
                                onClick={() => handleNavigate('NEXT')}
                                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-background hover:shadow-sm transition-all text-muted-foreground hover:text-primary"
                            >
                                <ChevronDownIcon className="w-5 h-5 -rotate-90" />
                            </button>
                        </div>

                        <span className="text-2xl font-bold text-foreground tracking-tight ml-2">
                            {format(currentDate, 'MMMM yyyy')}
                        </span>

                        <div className="flex items-center bg-muted/50 p-1 rounded-xl border shadow-sm">
                            {[Views.MONTH, Views.WEEK, Views.AGENDA].map((view) => (
                                <button
                                    key={view}
                                    onClick={() => handleViewChange(view)}
                                    className={`px-5 py-2 text-sm font-bold rounded-lg transition-all ${currentView === view
                                        ? 'bg-background text-primary shadow-sm ring-1 ring-black/5'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                        }`}
                                >
                                    {view === Views.AGENDA ? 'List' : view}
                                </button>
                            ))}
                        </div>
                    </div>

                    <CardContent className="p-0 flex-1 h-full relative">
                        <style>{`
                            .rbc-calendar { font-family: var(--font-sans), system-ui, sans-serif; height: 100%; }
                            .rbc-month-view { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; height: 100%; }
                            .rbc-header { padding: 18px 0; font-weight: 700; font-size: 0.75rem; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); background-color: var(--muted); }
                            .rbc-header + .rbc-header { border-left: 1px solid var(--border); }
                            .rbc-day-bg { border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); min-height: 80px; }
                            .rbc-day-bg:last-child { border-right: none; }
                            .rbc-row-bg { border-bottom: none; }
                            .rbc-month-row { border-top: 1px solid var(--border); min-height: 100px; }
                            .rbc-month-row:first-child { border-top: none; }
                            .rbc-row-content { border-bottom: none; overflow: hidden; }
                            .rbc-row { overflow: hidden; }
                            .rbc-off-range-bg { background-color: var(--muted); opacity: 0.3; }
                            .rbc-today { background-color: rgba(59, 130, 246, 0.08); }
                            .rbc-date-cell { padding: 8px 12px; font-weight: 600; color: var(--muted-foreground); text-align: right; font-size: 0.85rem; }
                            .rbc-date-cell.rbc-now { color: var(--primary); font-weight: 800; }
                            .rbc-event { 
                                border: none !important; 
                                border-radius: 4px !important;
                                margin: 2px 4px !important; 
                                padding: 2px 6px !important;
                                font-size: 0.7rem !important;
                                white-space: nowrap !important;
                                overflow: hidden !important;
                                text-overflow: ellipsis !important;
                                max-width: calc(100% - 8px) !important;
                                display: block !important;
                            }
                            .rbc-event-content { 
                                white-space: nowrap !important; 
                                overflow: hidden !important; 
                                text-overflow: ellipsis !important;
                            }
                            .rbc-row-segment { padding: 0 !important; }
                            .rbc-toolbar { display: none; } 
                            .rbc-agenda-view table.rbc-agenda-table tbody > tr > td { padding: 16px; font-weight: 500; font-size: 0.95rem; }
                            /* Dark mode compatibility */
                            @media (prefers-color-scheme: dark) {
                                .rbc-off-range-bg { background-color: rgba(255,255,255,0.05); }
                            }
                        `}</style>
                        <Calendar
                            localizer={localizer}
                            events={events}
                            startAccessor="start"
                            endAccessor="end"
                            style={{ height: '100%', minHeight: '600px' }}
                            views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
                            view={currentView}
                            date={currentDate}
                            onNavigate={setCurrentDate}
                            onView={setCurrentView}
                            onSelectEvent={(event) => onNavigateJob(event.id)}
                            eventPropGetter={eventStyleGetter}
                            popup
                            className="bg-card"
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default CalendarView;
