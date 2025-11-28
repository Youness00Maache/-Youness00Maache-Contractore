import React, { useState, useEffect, useMemo } from 'react';
import { Client, FormData as FormDataType, UserProfile, Job } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, MailIcon, PaperclipIcon, SearchIcon, CheckCircleIcon, CopyIcon, SendIcon, GoogleIcon, StarIcon, XCircleIcon } from './Icons.tsx';
import { Session } from '@supabase/supabase-js';
import { sendGmail } from '../services/gmailService.ts';
import { generateDocumentBase64 } from '../services/pdfGenerator.ts';
import UpgradeModal from './UpgradeModal.tsx';

interface CommunicationViewProps {
    clients: Client[];
    forms: FormDataType[];
    jobs: Job[];
    profile: UserProfile;
    onBack: () => void;
    session: Session;
    onConnectGmail?: () => void;
    onEmailSent?: () => void;
}

const CommunicationView: React.FC<CommunicationViewProps> = ({ clients, forms, jobs, profile, onBack, session, onConnectGmail, onEmailSent }) => {
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedDocId, setSelectedDocId] = useState<string>('');
    
    // Email Fields
    const [recipientEmail, setRecipientEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);
    const [hasGoogleToken, setHasGoogleToken] = useState(!!localStorage.getItem('google_provider_token'));
    const [showUpgrade, setShowUpgrade] = useState(false);
    const [showConnectModal, setShowConnectModal] = useState(false);
    const [limitMessage, setLimitMessage] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);

    useEffect(() => {
        // Check for token in session or local storage
        const token = session?.provider_token || localStorage.getItem('google_provider_token');
        const hasToken = !!token;
        setHasGoogleToken(hasToken);

        // Auto-show connect modal immediately if we don't have a token
        if (!hasToken) {
            setShowConnectModal(true);
        } else {
            setShowConnectModal(false);
        }
    }, [session]);

    const isPro = profile.subscriptionTier === 'Premium';
    const emailLimit = 10;
    const emailsSent = profile.emailUsage || 0;

    const clientDocs = useMemo(() => {
        if (!selectedClientId) return [];
        const client = clients.find(c => c.id === selectedClientId);
        if (!client) return [];
        
        return forms.filter(f => {
            const docData = f.data as any;
            return docData.clientName === client.name;
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [selectedClientId, clients, forms]);

    useEffect(() => {
        if (selectedClientId) {
            const client = clients.find(c => c.id === selectedClientId);
            if (client) {
                setRecipientEmail(client.email || '');
                setSelectedDocId('');
                setSubject('');
                setBody('');
                setSendSuccess(false);
            }
        }
    }, [selectedClientId, clients]);

    useEffect(() => {
        if (selectedDocId && selectedClientId) {
            const doc = forms.find(f => f.id === selectedDocId);
            const client = clients.find(c => c.id === selectedClientId);
            if (doc && client) {
                const docType = doc.type;
                const docData = doc.data as any;
                const template = {
                    subject: `${docType} [Document Number] from [My Company]`,
                    body: `Hi [Client Name],\n\nPlease find the attached ${docType} for your records.\n\nBest regards,\n[My Name]`
                };

                const replacements: Record<string, string> = {
                    '[Client Name]': client.name || 'Client',
                    '[My Company]': profile.companyName || 'Us',
                    '[My Name]': profile.name || 'Me',
                    '[Document Type]': docType,
                    '[Document Number]': docData.invoiceNumber || docData.estimateNumber || docData.workOrderNumber || docData.poNumber || doc.id.substring(0,8),
                };

                let compiledSubject = template.subject;
                let compiledBody = template.body;

                for (const [key, value] of Object.entries(replacements)) {
                    compiledSubject = compiledSubject.replace(new RegExp(key.replace(/\[/g, '\\[').replace(/\]/g, '\\]'), 'g'), value);
                    compiledBody = compiledBody.replace(new RegExp(key.replace(/\[/g, '\\[').replace(/\]/g, '\\]'), 'g'), value);
                }
                
                setSubject(compiledSubject);
                setBody(compiledBody);
            }
        }
    }, [selectedDocId, selectedClientId, forms, profile]);

    const handleCopy = () => {
        const fullText = `Subject: ${subject}\n\n${body}`;
        navigator.clipboard.writeText(fullText);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handleSend = async () => {
        if (!recipientEmail || !subject || !body) {
            alert("Please fill in all email fields.");
            return;
        }

        if (!isPro && emailsSent >= emailLimit) {
            setLimitMessage(`You've reached your limit of ${emailLimit} emails for this month on the free plan.`);
            setShowUpgrade(true);
            return;
        }

        setIsSending(true);
        setSendSuccess(false);

        try {
            let attachment;
            if (selectedDocId) {
                const doc = forms.find(f => f.id === selectedDocId);
                const job = jobs.find(j => j.id === doc?.jobId);
                if (doc && job && profile) {
                    const base64string = await generateDocumentBase64(doc.type, doc.data, profile, job);
                    const docData = doc.data as any;
                    const docNumber = docData.invoiceNumber || docData.estimateNumber || docData.workOrderNumber || doc.id.substring(0,8);
                    attachment = {
                        name: `${doc.type.replace(/ /g, '_')}-${docNumber}.pdf`,
                        data: base64string.split(',')[1], // remove dataURL prefix
                        type: 'application/pdf'
                    };
                }
            }

            await sendGmail(session, recipientEmail, subject, body, attachment);
            setSendSuccess(true);
            if(onEmailSent) onEmailSent();

        } catch (error: any) {
            console.error("Failed to send email", error);
            if (error.message.includes("GMAIL_AUTH_ERROR")) {
                alert("Authentication error with Google. Please reconnect your Gmail account.");
                setHasGoogleToken(false);
                setShowConnectModal(true);
            } else {
                alert(`Error: ${error.message}`);
            }
        } finally {
            setIsSending(false);
        }
    };
    
    return (
        <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
             <header className="flex items-center mb-8 gap-4">
                <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                    <BackArrowIcon className="h-6 w-6" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                        <MailIcon className="w-6 h-6 text-primary" /> Communication Center
                    </h1>
                </div>
            </header>

             <main className="flex-1 overflow-y-auto pb-10">
                <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
                    <CardHeader>
                        <CardTitle>Compose Email</CardTitle>
                        <CardDescription>Select a client and document to send via email.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="client-select">1. Select Client</Label>
                                <select id="client-select" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                    <option value="">-- Select a Client --</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="doc-select">2. Attach Document (Optional)</Label>
                                <select id="doc-select" value={selectedDocId} onChange={e => setSelectedDocId(e.target.value)} disabled={!selectedClientId} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                    <option value="">-- No Attachment --</option>
                                    {clientDocs.map(d => <option key={d.id} value={d.id}>{(d.data as any).title || d.type}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="recipient">To</Label>
                            <Input id="recipient" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="recipient@example.com" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="subject">Subject</Label>
                            <Input id="subject" value={subject} onChange={e => setSubject(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="body">Body</Label>
                            <textarea id="body" value={body} onChange={e => setBody(e.target.value)} className="w-full min-h-[150px] p-2 border rounded-md bg-background text-sm" />
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/30 p-4">
                        <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="text-xs text-muted-foreground">
                                {!isPro && `Emails sent: ${emailsSent}/${emailLimit} this month.`}
                            </div>
                            <div className="flex gap-2 flex-wrap justify-end">
                                <Button variant="outline" onClick={handleCopy}>
                                    <CopyIcon className="w-4 h-4 mr-2" /> {copySuccess ? 'Copied!' : 'Copy Email Text'}
                                </Button>
                                {hasGoogleToken ? (
                                    <Button onClick={handleSend} disabled={isSending || sendSuccess}>
                                        {isSending ? 'Sending...' : (sendSuccess ? <><CheckCircleIcon className="w-4 h-4 mr-2" /> Sent!</> : <><SendIcon className="w-4 h-4 mr-2" /> Send via Gmail</>)}
                                    </Button>
                                ) : (
                                    <Button onClick={onConnectGmail}>
                                        <GoogleIcon className="w-4 h-4 mr-2" /> Connect Gmail to Send
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardFooter>
                </Card>
            </main>

            {showConnectModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowConnectModal(false)}>
                    <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <CardHeader>
                            <CardTitle>Connect to Gmail</CardTitle>
                            <CardDescription>To send emails directly from the app, you need to connect your Google account.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">We only request permission to send emails on your behalf. We will never read your emails.</p>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setShowConnectModal(false)}>Later</Button>
                            <Button onClick={onConnectGmail}>
                                <GoogleIcon className="w-4 h-4 mr-2" /> Connect Now
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
            <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} featureName={limitMessage || "Direct Email Sending"} />
        </div>
    );
};

export default CommunicationView;
