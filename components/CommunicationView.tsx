
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
import EmailTemplateSelector from './EmailTemplateSelector.tsx';
import { EMAIL_TEMPLATES, EmailTemplateDefinition, applyTemplateVariables } from '../utils/emailTemplates.ts';

interface CommunicationViewProps {
    clients: Client[];
    forms: FormDataType[];
    jobs: Job[];
    profile: UserProfile;
    onBack: () => void;
    session: Session;
    onConnectGmail?: () => void;
    onEmailSent?: () => void;
    onUpgrade?: () => void;
}

const CommunicationView: React.FC<CommunicationViewProps> = ({ clients, forms, jobs, profile, onBack, session, onConnectGmail, onEmailSent, onUpgrade }) => {
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedDocId, setSelectedDocId] = useState<string>('');

    // Email Fields
    const [recipientEmail, setRecipientEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);

    // Initialize hasGoogleToken from profile or localStorage
    const [hasGoogleToken, setHasGoogleToken] = useState(() => !!(profile.gmailAccessToken || localStorage.getItem('google_provider_token')));
    // Only show connect modal on mount if we definitively don't have a token
    const [showConnectModal, setShowConnectModal] = useState(() => !(profile.gmailAccessToken || localStorage.getItem('google_provider_token')));

    const [showUpgrade, setShowUpgrade] = useState(false);
    const [limitMessage, setLimitMessage] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);

    // Template System State
    const [showTemplateSelector, setShowTemplateSelector] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplateDefinition | null>(null);
    const [primaryColor, setPrimaryColor] = useState('#3b82f6'); // Default blue
    const [secondaryColor, setSecondaryColor] = useState('#8b5cf6'); // Default purple
    const [showPreview, setShowPreview] = useState(false);

    // Watch for session/profile updates
    useEffect(() => {
        if (session?.provider_token || profile.gmailAccessToken) {
            setHasGoogleToken(true);
            setShowConnectModal(false);
        } else {
            const hasToken = !!localStorage.getItem('google_provider_token');
            setHasGoogleToken(hasToken);
        }
    }, [session, profile.gmailAccessToken]);

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
                applyTemplate(doc, client);
            }
        }
    }, [selectedDocId]);

    const getJobName = (doc: FormDataType) => {
        const job = jobs.find(j => j.id === doc.jobId);
        if (job) return job.name;
        const data = doc.data as any;
        return data.projectName || data.title || 'Project';
    };

    const applyTemplate = (doc: FormDataType, client: Client) => {
        const docType = doc.type;
        const data = doc.data as any;
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

    const handleCopyEmail = () => {
        const text = `Subject: ${subject}\n\n${body}`;
        navigator.clipboard.writeText(text);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handleSendEmail = async () => {
        // Check for Gmail connection first
        if (!hasGoogleToken) {
            setShowConnectModal(true);
            return;
        }

        if (!isPro && emailsSent >= emailLimit) {
            setLimitMessage(`You have reached the limit of ${emailLimit} emails for the free plan.`);
            setShowUpgrade(true);
            return;
        }

        setIsSending(true);
        setSendSuccess(false);

        try {
            let attachment = undefined;
            if (selectedDocId) {
                const doc = forms.find(f => f.id === selectedDocId);
                if (doc) {
                    const job = jobs.find(j => j.id === doc.jobId);
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

            // Generate HTML email if template is selected
            const htmlEmail = generateHtmlEmail();

            await sendGmail(session, recipientEmail, subject, body, attachment, profile.gmailAccessToken, htmlEmail);

            setSendSuccess(true);
            if (onEmailSent) onEmailSent();

            setTimeout(() => setSendSuccess(false), 3000);

        } catch (error: any) {
            console.error("Email send failed", error);
            if (error.message.includes("GMAIL_AUTH_ERROR") || error.message.includes("provider token found")) {
                setHasGoogleToken(false);
                setShowConnectModal(true); // Prompt to reconnect if token is invalid
            } else {
                alert(`Failed to send email: ${error.message}`);
            }
        } finally {
            setIsSending(false);
        }
    };

    // Generate HTML email from template
    const generateHtmlEmail = (): string | undefined => {
        if (!selectedTemplate) return undefined;

        const variables: Record<string, string> = {
            body: body.replace(/\n/g, '<br>'),
            logo_url: profile.logoUrl || '',
            company_name: profile.companyName || '',
            company_address: profile.address || '',
            company_phone: profile.phone || '',
            company_website: profile.website || '',
            user_name: profile.name || '',
            user_job_title: profile.jobTitle || '',
            user_phone: profile.phone || '',
            user_website: profile.website || '',
            primary_color: primaryColor,
            secondary_color: secondaryColor,
        };

        // Simple template variable replacement (basic version)
        let html = selectedTemplate.html;
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            html = html.split(placeholder).join(value);
        }

        // Handle conditional blocks (basic #if support)
        const ifPattern = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
        html = html.replace(ifPattern, (match, varName, content) => {
            return variables[varName] ? content : '';
        });

        return html;
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
                    <div className="flex gap-2 items-center">
                        <p className="text-muted-foreground text-sm">Compose emails via Gmail.</p>
                        {!isPro && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">
                                {emailsSent}/{emailLimit} Free Emails Used
                            </span>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-6 flex-1">
                {/* Left Column: Selection */}
                <Card className="w-full lg:w-1/3 flex flex-col shadow-md h-fit bg-card border-border">
                    <CardHeader className="border-b border-border pb-4">
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
                                                    className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${isSelected ? 'border-primary bg-background ring-1 ring-primary shadow-sm' : 'border-border hover:bg-secondary/50'}`}
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
                <Card className="w-full lg:w-2/3 flex flex-col shadow-md h-fit bg-card border-border">
                    <CardHeader className="border-b border-border pb-4 flex flex-row justify-between items-center">
                        <CardTitle className="text-lg">2. Compose Message</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-5">
                        {/* Template Selection & Customization */}
                        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <Label className="text-sm font-bold">📧 Email Template</Label>
                                    <p className="text-xs text-muted-foreground mt-1">Choose a professional design for your email</p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowTemplateSelector(true)}
                                    className="bg-white hover:bg-primary hover:text-primary-foreground"
                                >
                                    <StarIcon className="w-4 h-4 mr-2" />
                                    {selectedTemplate ? 'Change Template' : 'Browse Templates'}
                                </Button>
                            </div>

                            {selectedTemplate && (
                                <div className="mt-3 p-3 bg-white dark:bg-gray-900 rounded-lg border border-border space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <CheckCircleIcon className="w-4 h-4 text-green-600" />
                                            <span className="text-sm font-medium">{selectedTemplate.name}</span>
                                            <span className="text-xs text-muted-foreground capitalize">({selectedTemplate.category})</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedTemplate(null)}
                                            className="h-7 text-xs"
                                        >
                                            <XCircleIcon className="w-3 h-3 mr-1" />
                                            Remove
                                        </Button>
                                    </div>

                                    {/* Color Customization */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs mb-1 block">Primary Color</Label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={primaryColor}
                                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                                    className="w-10 h-10 rounded border border-border cursor-pointer"
                                                />
                                                <Input
                                                    value={primaryColor}
                                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                                    className="h-10 text-xs font-mono"
                                                    placeholder="#3b82f6"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs mb-1 block">Secondary Color</Label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={secondaryColor}
                                                    onChange={(e) => setSecondaryColor(e.target.value)}
                                                    className="w-10 h-10 rounded border border-border cursor-pointer"
                                                />
                                                <Input
                                                    value={secondaryColor}
                                                    onChange={(e) => setSecondaryColor(e.target.value)}
                                                    className="h-10 text-xs font-mono"
                                                    placeholder="#8b5cf6"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowPreview(true)}
                                        className="w-full"
                                    >
                                        👁️ Preview Email
                                    </Button>
                                </div>
                            )}
                        </div>

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
                    <CardFooter className="border-t border-border p-4 flex justify-end items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={handleCopyEmail} className="h-10" title="Copy subject and body">
                            <CopyIcon className="w-4 h-4 mr-2" /> {copySuccess ? 'Copied!' : 'Copy Email'}
                        </Button>
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

            <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} featureName={limitMessage || "Email Limit Reached"} onUpgrade={onUpgrade} />

            {showConnectModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShowConnectModal(false)}>
                    <Card className="w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                        <CardHeader>
                            <CardTitle>Connect Gmail</CardTitle>
                            <CardDescription>Permission required to send emails.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-sm rounded-md">
                                To send emails from your address, please authorize Gmail access. This is a one-time setup.
                            </div>
                            <Button onClick={onConnectGmail} className="w-full flex gap-2">
                                <GoogleIcon className="w-5 h-5" /> Connect Gmail
                            </Button>
                        </CardContent>
                        <CardFooter className="justify-end">
                            <Button variant="ghost" onClick={() => setShowConnectModal(false)}>Cancel</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            {/* Template Selector Modal */}
            {showTemplateSelector && (
                <EmailTemplateSelector
                    onSelect={(template) => {
                        setSelectedTemplate(template);
                        setShowTemplateSelector(false);
                    }}
                    onClose={() => setShowTemplateSelector(false)}
                    selectedTemplateId={selectedTemplate?.id}
                />
            )}

            {/* Preview Modal */}
            {showPreview && selectedTemplate && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShowPreview(false)}>
                    <div className="w-full max-w-4xl max-h-[90vh] bg-background rounded-xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="border-b border-border p-4 flex justify-between items-center">
                            <h3 className="text-lg font-bold">Email Preview</h3>
                            <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                                <XCircleIcon className="w-5 h-5" />
                            </Button>
                        </div>
                        <div className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-gray-900">
                            <div className="max-w-2xl mx-auto bg-white shadow-lg">
                                <iframe
                                    srcDoc={generateHtmlEmail()}
                                    className="w-full h-full min-h-[600px] border-0"
                                    title="Email Preview"
                                    sandbox="allow-same-origin"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CommunicationView;

