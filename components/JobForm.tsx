
import React, { useState, useEffect } from 'react';
import type { Job, Client, UserProfile } from '../types.ts';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, BriefcaseIcon } from './Icons.tsx';
import UpgradeModal from './UpgradeModal.tsx';

interface JobFormProps {
  onSave: (jobData: Omit<Job, 'id' | 'userId' | 'endDate' | 'status'>) => void;
  onCancel: () => void;
  supabase: any;
  session: any;
  jobCount?: number;
  profile?: UserProfile | null;
}

const JobForm: React.FC<JobFormProps> = ({ onSave, onCancel, supabase, session, jobCount = 0, profile }) => {
  const [jobName, setJobName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    const fetchClients = async () => {
        if(!session) return;
        const { data } = await supabase.from('clients').select('*').eq('user_id', session.user.id).order('name');
        if(data) setClients(data);
    };
    fetchClients();
  }, [session]);

  const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const clientId = e.target.value;
      if (clientId === 'new') {
          setClientName('');
          setClientAddress('');
      } else {
          const client = clients.find(c => c.id === clientId);
          if (client) {
              setClientName(client.name);
              setClientAddress(client.address);
          }
      }
  };

  const handleSave = () => {
    // Check limits
    const isPro = profile?.subscriptionTier === 'Premium';
    const limit = isPro ? Infinity : 6; // Basic limit is 6 active jobs

    if (jobCount >= limit) {
        setShowUpgrade(true);
        return;
    }

    setLoading(true);
    onSave({
      name: jobName,
      clientName,
      clientAddress,
      startDate,
    });
  };

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="flex items-center mb-8 gap-4">
        <Button variant="ghost" size="sm" onClick={onCancel} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
            <BackArrowIcon className="h-6 w-6" />
        </Button>
        <div>
            <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                Create New Job
            </h1>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center overflow-y-auto">
        <Card className="w-full max-w-2xl animate-fade-in-down shadow-xl border-blue-200 dark:border-border/50 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-card dark:to-card">
          <CardHeader className="bg-white/40 dark:bg-muted/20 border-b border-blue-200 dark:border-border">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <BriefcaseIcon className="w-6 h-6" />
                </div>
                <div>
                    <CardTitle className="text-xl text-blue-950 dark:text-foreground">Job Details</CardTitle>
                    <CardDescription>Enter the details for the new project or job.</CardDescription>
                </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Limit Warning */}
            {profile?.subscriptionTier !== 'Premium' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex justify-between items-center">
                    <span>Active Jobs: {jobCount} / 6 (Free Plan Limit)</span>
                    {jobCount >= 6 && <span className="font-bold text-red-600">Limit Reached</span>}
                </div>
            )}

            <div className="flex flex-col space-y-2">
              <Label htmlFor="jobName" className="text-base font-semibold">Job/Project Name</Label>
              <Input id="jobName" value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="e.g., Kitchen Remodel" className="h-12 text-lg" />
            </div>
            
            <div className="p-4 bg-white/50 dark:bg-secondary/20 rounded-xl border border-blue-200 dark:border-border/50 space-y-4">
                <h3 className="font-semibold text-sm text-blue-600 dark:text-muted-foreground uppercase tracking-wider">Client Information</h3>
                <div className="flex flex-col space-y-1.5">
                    <Label>Select Existing Client</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20" onChange={handleClientSelect} defaultValue="new">
                        <option value="new">-- Create New Client --</option>
                        {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="clientName">Client Name</Label>
                    <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g., John Doe" />
                    </div>
                    <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="clientAddress">Client Address</Label>
                    <Input id="clientAddress" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="e.g., 123 Main St" />
                    </div>
                </div>
            </div>

            <div className="flex flex-col space-y-1.5 w-full md:w-1/2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3 bg-white/40 dark:bg-muted/20 border-t border-blue-200 dark:border-border p-6">
            <Button variant="outline" onClick={onCancel} className="h-11 px-6">Cancel</Button>
            <Button onClick={handleSave} disabled={!jobName || !clientName || loading} className="h-11 px-8 shadow-lg shadow-primary/20">
              {loading ? 'Saving...' : 'Create Job'}
            </Button>
          </CardFooter>
        </Card>
      </main>

      <UpgradeModal 
        isOpen={showUpgrade} 
        onClose={() => setShowUpgrade(false)} 
        featureName="Unlimited Jobs" 
      />
    </div>
  );
};

export default JobForm;
