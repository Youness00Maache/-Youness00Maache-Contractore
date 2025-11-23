
import React, { useState, useEffect, useMemo } from 'react';
import { Client, FormData as FormDataType, UserProfile, Job } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, MailIcon, PaperclipIcon, SearchIcon, CheckCircleIcon, CopyIcon, SendIcon } from './Icons.tsx';
import { Session } from '@supabase/supabase-js';
import { sendGmail } from '../services/gmailService.ts';
import { generateDocumentBase64 } from '../services/pdfGenerator.ts';

interface CommunicationViewProps {
    clients: Client[];
    forms: FormDataType[];
    jobs: Job[];
    profile: UserProfile;
    onBack: () => void;
    session: Session;
}

const CommunicationView: React.FC<CommunicationViewProps> = ({ clients, forms, jobs, profile, onBack, session }) => {
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedDocId, setSelectedDocId] = useState<string>('');
    
    // Email Fields
    const [recipientEmail, setRecipientEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);

    // Filtering Logic
    const clientDocs = useMemo(() => {
        if (!selectedClientId) return [];
        const client = clients.find(c => c.id === selectedClientId);
        if (!client) return [];
        
        return forms.filter(f => {
            const docData = f.data as any;
            // Match by client name if ID isn't explicit, or use job linkage if available
            return docData.clientName === client.name;
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [selectedClientId, clients, forms]);

    // Effect: Auto-fill email when client selected
    useEffect(() => {
        if (selectedClientId) {
            const client = clients.find(c => c.id === selectedClientId);
            if (client) {
                setRecipientEmail(client.email || '');
                // Reset doc selection
                setSelectedDocId('');
                setSubject('');
                setBody('');
                setSendSuccess(false);
            }
        }
    }, [selectedClientId, clients]);

    // Effect: Auto-fill template when document selected
    useEffect(() => {
        if (selectedDocId && selectedClientId) {
            const doc = forms.find(f => f.id === selectedDocId);
            const client = clients.find(c => c.id === selectedClientId);
            
            if (doc && client) {
                applyTemplate(doc, client);
            }
        }
    }, [selectedDocId]);

    const getJobName = (doc: FormDataType) => {
        // Try to find the job object first
        const job = jobs.find(j => j.id === doc.jobId);
        if (job) return job.name;
        
        // Fallback to data inside document
        const data = doc.data as any;
        return data.projectName || data.title || 'Project';
    };

    const applyTemplate = (doc: FormDataType, client: Client) => {
        const docType = doc.type;
        const data = doc.data as any;
        
        // Get template key
        const templateKey = `${docType.toLowerCase().replace(' ', '_')}_default`;
        const template = profile.emailTemplates?.[templateKey] || getDefaultTemplate(docType);

        const replacements: Record<string, string> = {
            '[Client Name]': client.name,
            '[Job Name]': getJobName(doc), 
            '[My Company]': profile.companyName || 'Us',
            '[My Name]': profile.name || 'Me',
            '[Document Number]': data.invoiceNumber || data.estimateNumber || data.workOrderNumber || data.poNumber || 'Doc',
            '[Total Amount]': data.lineItems ? `$${data.lineItems.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0).toFixed(2)}` : ''
        };

        let subj = template.subject;
        let bod = template.body;

        for (const [key, value] of Object.entries(replacements)) {
            subj = subj.split(key).join(value);
            bod = bod.split(key).join(value);
        }

        setSubject(subj);
        setBody(bod);
    };

    const getDefaultTemplate = (type: string) => {
        switch (type.toLowerCase()) {
            case 'invoice':
                return {
                    subject: `Invoice [Document Number] from [My Company]`,
                    body: `Hi [Client Name],\n\nPlease find attached invoice [Document Number] for [Total Amount].\n\nLet me know if you have any questions.\n\nBest regards,\n[My Name]\n[My Company]`
                };
            case 'estimate':
                return {
                    subject: `Estimate [Document Number] for [Job Name]`,
                    body: `Hi [Client Name],\n\nHere is the estimate for [Job Name]. We look forward to working with you.\n\nBest,\n[My Name]\n[My Company]`
                };
            default:
                return {
                    subject: `${type} from [My Company]`,
                    body: `Hi [Client Name],\n\nPlease find the attached ${type}.\n\nBest,\n[My Name]`
                };
        }
    };

    const insertVariable = (v: string) => {
        let valueToInsert = v;
        const client = clients.find(c => c.id === selectedClientId);
        const doc = forms.find(f => f.id === selectedDocId);
        const data = doc?.data as any;

        if (v === '[Client Name]' && client) {
            valueToInsert = client.name;
        }
        else if (v === '[My Company]') {
            valueToInsert = profile.companyName;
        }
        else if (v === '[My Name]') {
            valueToInsert = profile.name;
        }
        else if (doc) {
             if (v === '[Job Name]') {
                 valueToInsert = getJobName(doc);
             }
             else if (data) {
                if (v === '[Document Number]') {
                    valueToInsert = data.invoiceNumber || data.estimateNumber || data.workOrderNumber || data.poNumber || data.receiptNumber || '';
                }
                else if (v === '[Total Amount]') {
                     const total = data.lineItems 
                        ? data.lineItems.reduce((acc: number, item: any) => acc + (Number(item.quantity) * Number(item.rate)), 0)
                        : (data.amount || 0);
                     valueToInsert = `$${Number(total).toFixed(2)}`;
                }
             }
        }

        setBody(prev => prev + valueToInsert);
    };

    const handleSendEmail = async () => {
        setIsSending(true);
        setSendSuccess(false);
        
        try {
            let attachment = undefined;
            
            // Generate attachment if document is selected
            if (selectedDocId) {
                const doc = forms.find(f => f.id === selectedDocId);
                if (doc) {
                    const job = jobs.find(j => j.id === doc.jobId);
                    // Assuming generateDocumentBase64 is exported from pdfGenerator
                    const base64Data = await generateDocumentBase64(doc.type, doc.data, profile, job!);
                    
                    if (base64Data) {
                        const docData = doc.data as any;
                        const filename = `${doc.type}-${docData.invoiceNumber || docData.estimateNumber || docData.poNumber || 'Doc'}.pdf`;
                        attachment = {
                            name: filename,
                            data: base64Data,
                            type: 'application/pdf'
                        };
                    }
                }
            }

            await sendGmail(session, recipientEmail, subject, body, attachment);
            
            setSendSuccess(true);
            // Clear selection after delay or keep for reference? Let's keep but show success state.
            setTimeout(() => setSendSuccess(false), 3000);
            
        } catch (error: any) {
            console.error("Email send failed", error);
            alert(`Failed to send email: ${error.message}. \n\nMake sure you signed in with Google and granted email permissions.`);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="w-full min-h-screen bg-background text-foreground flex flex-col p-4 md:p-8 pb-24">
            <header className="flex items-center mb-8 gap-4">
                <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center mr-2 hover:bg-secondary/80 rounded-full" aria-label="Back">
                    <BackArrowIcon className="h-9 w-9" />
                </Button>
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 tracking-tight">
                        <MailIcon className="w-8 h-8 text-primary" /> Communication
                    </h1>
                    <p className="text-muted-foreground text-sm">Compose emails and share documents via Gmail.</p>
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-6 flex-1">
                {/* Left Column: Selection */}
                <Card className="w-full lg:w-1/3 flex flex-col shadow-md h-fit">
                    <CardHeader className="bg-muted/10 border-b border-border pb-4">
                        <CardTitle className="text-lg">1. Select Recipient</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-6">
                        <div className="space-y-2">
                            <Label>Client</Label>
                            <div className="relative">
                                <select 
                                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={selectedClientId}
                                    onChange={(e) => setSelectedClientId(e.target.value)}
                                >
                                    <option value="">-- Choose a Client --</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {selectedClientId && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                <Label>Select Document to Attach (Optional)</Label>
                                {clientDocs.length === 0 ? (
                                    <div className="text-sm text-muted-foreground italic p-4 border border-dashed border-border rounded-md text-center">
                                        No documents found for this client.
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                                        {clientDocs.map(doc => {
                                            const data = doc.data as any;
                                            const title = data.title || data.invoiceNumber || data.estimateNumber || doc.type;
                                            const date = new Date(doc.createdAt).toLocaleDateString();
                                            const isSelected = selectedDocId === doc.id;

                                            return (
                                                <div 
                                                    key={doc.id}
                                                    onClick={() => setSelectedDocId(doc.id)}
                                                    className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-secondary/50'}`}
                                                >
                                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center mr-3 ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                                                        {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>{title}</p>
                                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                            <span>{doc.type}</span>
                                                            <span>•</span>
                                                            <span>{date}</span>
                                                        </div>
                                                    </div>
                                                    {isSelected && <PaperclipIcon className="w-4 h-4 text-primary" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Right Column: Compose */}
                <Card className="w-full lg:w-2/3 flex flex-col shadow-md h-fit">
                    <CardHeader className="bg-muted/10 border-b border-border pb-4">
                        <CardTitle className="text-lg">2. Compose Message</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-5">
                        <div className="space-y-1.5">
                            <Label>To</Label>
                            <Input 
                                value={recipientEmail} 
                                onChange={e => setRecipientEmail(e.target.value)} 
                                placeholder="client@example.com" 
                                className="font-medium"
                            />
                        </div>
                        
                        <div className="space-y-1.5">
                            <Label>Subject</Label>
                            <Input 
                                value={subject} 
                                onChange={e => setSubject(e.target.value)} 
                                placeholder="Email Subject" 
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label>Message Body</Label>
                                <span className="text-xs text-muted-foreground">Supports plain text</span>
                            </div>
                            <textarea 
                                className="flex min-h-[250px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                placeholder="Type your message here..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground uppercase font-bold">Insert Info</Label>
                            <div className="flex flex-wrap gap-2">
                                {['[Client Name]', '[Job Name]', '[My Company]', '[Document Number]', '[Total Amount]'].map(v => (
                                    <button 
                                        key={v}
                                        onClick={() => insertVariable(v)}
                                        className="px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-full border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-sm"
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/20 border-t border-border p-4 flex justify-end items-center gap-3">
                        {sendSuccess ? (
                            <div className="flex items-center text-green-600 font-bold animate-in fade-in slide-in-from-right-2">
                                <CheckCircleIcon className="w-5 h-5 mr-2" /> Sent successfully!
                            </div>
                        ) : (
                            <Button 
                                onClick={handleSendEmail} 
                                disabled={!recipientEmail || isSending} 
                                className="px-8 shadow-md bg-primary hover:bg-primary/90"
                            >
                                {isSending ? 'Sending...' : (
                                    <>
                                        <SendIcon className="w-4 h-4 mr-2" /> Send via Gmail
                                    </>
                                )}
                            </Button>
                        )}
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
};

export default CommunicationView;
