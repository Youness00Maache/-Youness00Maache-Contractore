import React, { useState, useEffect, useMemo } from 'react';
import type { Client, UserProfile } from '../types.ts';
import { BriefcaseIcon, UserIcon, CalendarIcon, StarIcon } from './Icons.tsx';
import { PageHeader } from './ui/PageHeader.tsx';
import { FREE_LIMITS, isPaidTier, normalizeTier } from '../lib/plans.ts';

export interface JobFormValues {
  name: string;
  clientName: string;
  clientAddress: string;
  startDate: string;
  endDate?: string | null;
  workerName?: string;
  /** Set when an existing client was picked (jobs.client_id). */
  clientId?: string | null;
  /** A new client name becomes a saved client: true = a temporary one (walk-in, `[TEMPORARY]` in its notes). */
  clientTemporary?: boolean;
}

interface JobFormProps {
  /** Should throw (or reject) on failure so the form can show the error and re-enable. */
  onSave: (jobData: JobFormValues) => Promise<unknown> | void;
  onCancel: () => void;
  /** Legacy: only used to load clients when `clients` is not provided. */
  supabase?: any;
  session?: any;
  clients?: Client[];
  /** Jobs created this calendar month (free-plan meter). */
  jobCount?: number;
  jobLimit?: number | null;
  profile?: UserProfile | null;
  onUpgradeClick?: () => void;
  /** Values to start with (e.g. from the AI assistant). */
  prefillData?: Record<string, any> | null;
}

const todayLocal = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const pick = (obj: Record<string, any> | null | undefined, ...keys: string[]): string => {
  if (!obj) return '';
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
};

const JobForm: React.FC<JobFormProps> = ({ onSave, onCancel, supabase, session, clients: clientsProp, jobCount = 0, jobLimit, profile, onUpgradeClick, prefillData }) => {
  const [jobName, setJobName] = useState(() => pick(prefillData, 'name', 'jobName', 'projectName', 'title'));
  const [clientName, setClientName] = useState(() => pick(prefillData, 'clientName', 'client_name', 'client'));
  const [clientAddress, setClientAddress] = useState(() => pick(prefillData, 'clientAddress', 'client_address', 'address', 'projectAddress'));
  const [startDate, setStartDate] = useState(() => pick(prefillData, 'startDate', 'start_date') || todayLocal());
  const [endDate, setEndDate] = useState(() => pick(prefillData, 'endDate', 'end_date'));
  const [workerName, setWorkerName] = useState(() => pick(prefillData, 'workerName', 'worker_name', 'worker'));
  const [selectedClientId, setSelectedClientId] = useState<string>('new');
  const [clientTemporary, setClientTemporary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedClients, setFetchedClients] = useState<Client[]>([]);

  const clients = clientsProp ?? fetchedClients;

  useEffect(() => {
    if (clientsProp || !supabase || !session?.user?.id) return;
    let cancelled = false;
    supabase
      .from('clients')
      .select('id, user_id, name, email, phone, address, notes, portal_key, created_at')
      .eq('user_id', session.user.id)
      .order('name')
      .range(0, 199)
      .then(({ data }: { data: Client[] | null }) => { if (!cancelled && data) setFetchedClients(data); });
    return () => { cancelled = true; };
  }, [clientsProp, supabase, session?.user?.id]);

  // If the prefilled client name matches a saved client, select it.
  useEffect(() => {
    if (selectedClientId !== 'new' || !clientName) return;
    const match = clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
    if (match) {
      setSelectedClientId(match.id);
      if (!clientAddress && match.address) setClientAddress(match.address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  const paid = isPaidTier(normalizeTier((profile as any)?.plan || profile?.subscriptionTier));
  const limit = paid ? null : (jobLimit === undefined ? FREE_LIMITS.jobs : jobLimit);
  const atLimit = limit !== null && jobCount >= limit;

  const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedClientId(id);
    if (id === 'new') {
      setClientName('');
      setClientAddress('');
      return;
    }
    const client = clients.find(c => c.id === id);
    if (client) {
      setClientName(client.name);
      setClientAddress(client.address || '');
    }
  };

  // a typed name that isn't a saved client becomes a new client when the job is created (it can be a temporary one)
  const isNewClientName = selectedClientId === 'new' && !!clientName.trim()
    && !clients.some(c => c.name.trim().toLowerCase() === clientName.trim().toLowerCase());

  const dateError = useMemo(() => (endDate && startDate && endDate < startDate ? 'End date must be on or after the start date.' : null), [startDate, endDate]);
  const canSubmit = jobName.trim() && clientName.trim() && !loading && !dateError;

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    if (atLimit) { onUpgradeClick?.(); return; }
    setError(null);
    setLoading(true);
    try {
      await onSave({
        name: jobName.trim(),
        clientName: clientName.trim(),
        clientAddress: clientAddress.trim(),
        startDate,
        endDate: endDate || null,
        workerName: workerName.trim(),
        clientId: selectedClientId !== 'new' ? selectedClientId : null,
        clientTemporary: isNewClientName && clientTemporary,
      });
    } catch (err: any) {
      setError(err?.message || 'Could not create the job. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page max-w-3xl">
      <PageHeader title="New job" subtitle="A job groups the invoices, estimates and reports for one project." onBack={onCancel} />

      <form onSubmit={handleSave} className="card" noValidate>
        {limit !== null && (
          <div className={`flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${atLimit ? 'bg-warning/10' : 'bg-muted/40'}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium">Free plan: {Math.min(jobCount, limit)} of {limit} new jobs used this month</p>
              <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border">
                <div className={`h-full rounded-full ${atLimit ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${Math.min(100, (jobCount / Math.max(1, limit)) * 100)}%` }} />
              </div>
            </div>
            {onUpgradeClick && (
              <button type="button" onClick={onUpgradeClick} className="btn btn-sm btn-outline shrink-0">
                <StarIcon className="h-3.5 w-3.5" /> Upgrade for unlimited
              </button>
            )}
          </div>
        )}

        <div className="space-y-6 p-4 sm:p-6">
          <div>
            <label htmlFor="jobName" className="label">Job / project name</label>
            <div className="relative">
              <BriefcaseIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input id="jobName" className="input pl-10" value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="e.g. Kitchen remodel" autoFocus required />
            </div>
          </div>

          <fieldset className="space-y-4 rounded-2xl border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-foreground">Client</legend>
            {clients.length > 0 && (
              <div>
                <label htmlFor="clientSelect" className="label">Saved client</label>
                <select id="clientSelect" className="input" value={selectedClientId} onChange={handleClientSelect}>
                  <option value="new">New client (type below)</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="clientName" className="label">Client name</label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="clientName"
                    className="input pl-10"
                    value={clientName}
                    onChange={(e) => { setClientName(e.target.value); if (selectedClientId !== 'new') setSelectedClientId('new'); }}
                    placeholder="e.g. Jane Smith"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="clientAddress" className="label">Job site address</label>
                <input id="clientAddress" className="input" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="e.g. 123 Main St" />
              </div>
            </div>
            {isNewClientName && (
              <label className="flex min-h-[40px] cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={clientTemporary} onChange={(e) => setClientTemporary(e.target.checked)} />
                <span>
                  <span className="font-medium text-foreground">Mark as temporary client</span>
                  <span className="block text-xs text-muted-foreground">“{clientName.trim()}” is added to your clients. Temporary ones (walk-ins) stay under “Temporary” until you convert them.</span>
                </span>
              </label>
            )}
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="startDate" className="label">Start date</label>
              <input id="startDate" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="endDate" className="label">End date <span className="normal-case font-normal">(optional)</span></label>
              <input id="endDate" type="date" className="input" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="workerName" className="label">Assigned worker <span className="normal-case font-normal">(optional)</span></label>
              <input id="workerName" className="input" value={workerName} onChange={(e) => setWorkerName(e.target.value)} placeholder="e.g. John" />
            </div>
          </div>
          {dateError && <p className="flex items-center gap-1.5 text-sm text-destructive"><CalendarIcon className="h-4 w-4" />{dateError}</p>}

          {error && (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={loading}>Cancel</button>
          {atLimit ? (
            <button type="button" className="btn btn-primary" onClick={onUpgradeClick}>
              <StarIcon className="h-4 w-4" /> Upgrade to add more jobs
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {loading && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
              {loading ? 'Creating...' : 'Create job'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default JobForm;
