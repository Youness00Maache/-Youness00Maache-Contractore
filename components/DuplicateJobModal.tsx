import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card';
import { Button } from './ui/Button';
import { XCircleIcon, CopyIcon } from './Icons';
import { Job, Client, FormData, FormType } from '../types';

interface DuplicateJobModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDuplicate: (jobName: string, clientId: string | null, clientName: string, selectedDocIds: string[]) => void;
    job: Job | null;
    forms: FormData[];
    clients: Client[];
}

export const DuplicateJobModal: React.FC<DuplicateJobModalProps> = ({
    isOpen,
    onClose,
    onDuplicate,
    job,
    forms,
    clients
}) => {
    const [jobName, setJobName] = useState('');
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen && job) {
            setJobName(`${job.name} (Copy)`);
            const clientMatch = clients.find(c => c.name === job.clientName);
            setSelectedClientId(clientMatch ? clientMatch.id : '');
            setSelectedDocIds(new Set(forms.map(f => f.id)));
        }
    }, [isOpen, job, forms, clients]);

    if (!isOpen || !job) return null;

    const handleToggleDoc = (docId: string) => {
        const next = new Set(selectedDocIds);
        if (next.has(docId)) {
            next.delete(docId);
        } else {
            next.add(docId);
        }
        setSelectedDocIds(next);
    };

    const handleSubmit = () => {
        const client = clients.find(c => c.id === selectedClientId);
        onDuplicate(
            jobName,
            client ? client.id : null,
            client ? client.name : job.clientName, // Fallback if no matching client found but still want original
            Array.from(selectedDocIds)
        );
    };

    const handleSelectAll = (selectAll: boolean) => {
        if (selectAll) {
            setSelectedDocIds(new Set(forms.map(f => f.id)));
        } else {
            setSelectedDocIds(new Set());
        }
    };

    const getDocTitle = (form: FormData) => {
        const d = form.data as any;
        return d.title || d.invoiceNumber || d.estimateNumber || d.reportNumber || d.workOrderNumber || d.warrantyNumber || d.changeOrderNumber || d.poNumber || form.type;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <Card className="w-full max-w-lg shadow-2xl overflow-hidden rounded-2xl border-border/60">
                <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between pb-4">
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <CopyIcon className="w-5 h-5 text-primary" />
                        Duplicate Job
                    </CardTitle>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <XCircleIcon className="w-6 h-6" />
                    </button>
                </CardHeader>
                <CardContent className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div>
                        <label className="block text-sm font-medium mb-1">New Job Name</label>
                        <input
                            type="text"
                            value={jobName}
                            onChange={(e) => setJobName(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 bg-background flex h-10 border-input text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Client</label>
                        <select
                            value={selectedClientId}
                            onChange={(e) => setSelectedClientId(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 bg-background flex h-10 border-input text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <option value="">Select a Client...</option>
                            {clients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {forms.length > 0 && (
                        <div className="mt-4 border-t pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-medium">Include Documents</label>
                                <div className="text-xs space-x-2">
                                    <button onClick={() => handleSelectAll(true)} className="text-primary hover:underline">Select All</button>
                                    <span>|</span>
                                    <button onClick={() => handleSelectAll(false)} className="text-muted-foreground hover:underline">None</button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {forms.map(form => (
                                    <label key={form.id} className="flex items-center gap-3 p-2 bg-secondary/30 rounded-lg cursor-pointer hover:bg-secondary/50">
                                        <input
                                            type="checkbox"
                                            checked={selectedDocIds.has(form.id)}
                                            onChange={() => handleToggleDoc(form.id)}
                                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <div>
                                            <p className="text-sm font-medium">{form.type}</p>
                                            <p className="text-xs text-muted-foreground">{getDocTitle(form)}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="bg-muted/10 border-t p-4 flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!jobName.trim()}>Duplicate</Button>
                </CardFooter>
            </Card>
        </div>
    );
};
