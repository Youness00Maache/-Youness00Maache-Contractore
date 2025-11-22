
import React, { useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import enUS from 'date-fns/locale/en-US';
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
                    Schedule
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
                /* General Container */
                .rbc-calendar { 
                    font-family: var(--font-sans), system-ui, sans-serif; 
                    color: var(--foreground);
                }
                
                /* Toolbar Styling */
                .rbc-toolbar { 
                    padding: 1.5rem; 
                    margin-bottom: 0; 
                    border-bottom: 1px solid var(--border);
                    background-color: var(--card);
                    display: flex;
                    flex-wrap: wrap;
                    gap: 1rem;
                }
                .rbc-toolbar-label { 
                    font-weight: 800; 
                    font-size: 1.5rem; 
                    color: var(--foreground);
                    text-transform: capitalize;
                    letter-spacing: -0.025em;
                    order: 1;
                }
                .rbc-btn-group {
                    display: inline-flex;
                    border-radius: 0.5rem;
                    background-color: var(--muted);
                    padding: 0.25rem;
                    gap: 0.25rem;
                    order: 2;
                }
                /* Navigation Buttons */
                .rbc-btn-group:first-child {
                    order: 2; /* Move Nav to right of title on desktop if needed, or keep left */
                }
                /* View Toggle Buttons */
                .rbc-btn-group:last-child {
                    order: 3;
                    margin-left: auto;
                }

                .rbc-btn-group button { 
                    border: none; 
                    color: var(--muted-foreground); 
                    background: transparent;
                    cursor: pointer; 
                    font-size: 0.875rem;
                    font-weight: 600;
                    padding: 0.375rem 0.75rem;
                    border-radius: 0.375rem;
                    transition: all 0.2s ease;
                    box-shadow: none;
                }
                .rbc-btn-group button:hover { 
                    background-color: var(--background); 
                    color: var(--foreground); 
                }
                .rbc-btn-group .rbc-active { 
                    background-color: var(--background); 
                    color: var(--foreground); 
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }
                
                /* Grid Styling */
                .rbc-month-view { 
                    border: none; 
                }
                .rbc-header { 
                    padding: 1rem 0; 
                    font-weight: 600; 
                    font-size: 0.75rem; 
                    text-transform: uppercase; 
                    letter-spacing: 0.1em;
                    color: var(--muted-foreground);
                    border-bottom: 1px solid var(--border);
                    border-left: none;
                }
                .rbc-header + .rbc-header { border-left: none; }
                
                .rbc-day-bg { border-left: 1px solid var(--border); }
                .rbc-month-row { border-top: 1px solid var(--border); }
                
                /* Date Cells */
                .rbc-date-cell {
                    padding: 0.5rem;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: var(--muted-foreground);
                }
                .rbc-off-range-bg { background-color: var(--secondary); opacity: 0.3; }
                .rbc-today { background-color: transparent; } /* Remove default */
                .rbc-date-cell.rbc-now {
                    font-weight: 800;
                    color: var(--primary);
                }
                
                /* Events */
                .rbc-event { 
                    margin: 1px 6px;
                    padding: 2px 4px;
                }
                .rbc-event:focus { outline: none; }
                
                /* Current Time Indicator (Day/Week view) */
                .rbc-current-time-indicator {
                    background-color: var(--primary);
                }

                /* Popup / Overlay Styling (Fix for White Background) */
                .rbc-overlay {
                    background-color: var(--card);
                    border: 1px solid var(--border);
                    border-radius: 0.5rem;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                    padding: 8px;
                    color: var(--foreground);
                    z-index: 50;
                }
                .rbc-overlay-header {
                    border-bottom: 1px solid var(--border);
                    margin: -8px -8px 8px -8px;
                    padding: 8px;
                    font-weight: 600;
                    color: var(--foreground);
                    font-size: 0.875rem;
                }

                /* Dark mode adjustments if not handled by vars */
                .dark .rbc-off-range-bg { background-color: #000; opacity: 0.2; }
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
