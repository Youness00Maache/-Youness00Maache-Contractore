
import React, { useState, useEffect } from 'react';
import type { Job, Client } from '../types.ts';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon } from './Icons.tsx';

interface JobFormProps {
  onSave: (jobData: Omit<Job, 'id' | 'userId' | 'endDate' | 'status'>) => void;
  onCancel: () => void;
  supabase: any;
  session: any;
}

const JobForm: React.FC<JobFormProps> = ({ onSave, onCancel, supabase, session }) => {
  const [jobName, setJobName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);

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
      <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
        <div className="flex justify-start">
          <Button variant="ghost" size="sm" onClick={onCancel} className="w-12 h-12 p-0 flex items-center justify-center" aria-label="Back">
            <BackArrowIcon className="h-9 w-9" />
          </Button>
        </div>
        <h1 className="text-xl font-bold text-center whitespace-nowrap">Create New Job</h1>
        <div className="flex items-center gap-2 justify-end"></div>
      </header>
      <main className="flex-1 flex items-start justify-center overflow-y-auto">
        <Card className="w-full max-w-2xl animate-fade-in-down my-8">
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
            <CardDescription>Enter the details for the new project or job.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="jobName">Job/Project Name</Label>
              <Input id="jobName" value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="e.g., Kitchen Remodel" />
            </div>
            
            <div className="flex flex-col space-y-1.5">
                <Label>Select Client</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" onChange={handleClientSelect} defaultValue="new">
                    <option value="new">-- New Client --</option>
                    {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="clientName">Client Name</Label>
              <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g., John Doe" />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="clientAddress">Client Address</Label>
              <Input id="clientAddress" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="e.g., 123 Main St, Anytown, USA" />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button onClick={handleSave} disabled={!jobName || !clientName || loading}>
              {loading ? 'Saving...' : 'Save Job'}
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
};

export default JobForm;
