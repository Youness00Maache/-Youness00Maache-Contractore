


import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { CopyIcon, MailIcon, XCircleIcon } from './Icons.tsx';
import { UserProfile, EmailTemplate } from '../types.ts';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: any; // Document data (InvoiceData, EstimateData, etc.)
    docType: string; // 'invoice', 'estimate', 'work_order', etc.
    profile: UserProfile;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, data, docType, profile }) => {
    const [recipientEmail, setRecipientEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Load Template or Default
            const templateKey = `${docType.toLowerCase().replace(' ', '_')}_default`;
            const template = profile.emailTemplates?.[templateKey] || getDefaultTemplate(docType);
            
            // Compile
            setSubject(compileText(template.subject, data, profile));
            setBody(compileText(template.body, data, profile));
            setRecipientEmail('');
            setCopied(false);
        }
    }, [isOpen, docType, data, profile]);

    const getDefaultTemplate = (type: string): EmailTemplate => {
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

    const compileText = (text: string, data: any, profile: UserProfile) => {
        let compiled = text;
        const replacements: Record<string, string> = {
            '[Client Name]': data.clientName || 'Client',
            '[Job Name]': data.projectName || 'Project', // Some docs might not have job name directly, fallback needed
            '[My Company]': profile.companyName || 'Us',
            '[My Name]': profile.name || 'Me',
            '[Document Number]': data.invoiceNumber || data.estimateNumber || data.workOrderNumber || data.poNumber || 'Doc',
            '[Total Amount]': data.lineItems ? `$${data.lineItems.reduce((acc: number, item: any) => acc + (item.quantity * item.rate), 0).toFixed(2)}` : ''
        };

        for (const [key, value] of Object.entries(replacements)) {
            compiled = compiled.split(key).join(value);
        }
        return compiled;
    };

    const handleCopy = () => {
        const fullText = `Subject: ${subject}\n\n${body}`;
        navigator.clipboard.writeText(fullText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleOpenEmail = () => {
        const mailtoLink = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoLink, '_blank');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
            <Card className="w-full max-w-lg animate-in fade-in zoom-in-95 shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <CardHeader className="border-b border-border flex flex-row items-center justify-between py-4">
                    <div>
                        <CardTitle className="text-xl">Share Document</CardTitle>
                        <CardDescription>Review and send email to client.</CardDescription>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-destructive transition-colors">
                        <XCircleIcon className="w-6 h-6" />
                    </button>
                </CardHeader>
                <CardContent className="space-y-4 pt-6 overflow-y-auto">
                    <div className="space-y-1.5">
                        <Label htmlFor="recipient">To (Email)</Label>
                        <Input 
                            id="recipient" 
                            value={recipientEmail} 
                            onChange={(e) => setRecipientEmail(e.target.value)} 
                            placeholder="client@example.com" 
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="subject">Subject</Label>
                        <Input 
                            id="subject" 
                            value={subject} 
                            onChange={(e) => setSubject(e.target.value)} 
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="body">Message Body</Label>
                        <textarea 
                            id="body" 
                            className="w-full min-h-[150px] p-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
                            value={body} 
                            onChange={(e) => setBody(e.target.value)} 
                        />
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-3 border-t border-border bg-muted/20 py-4">
                    <Button variant="outline" className="flex-1" onClick={handleCopy}>
                        <CopyIcon className="w-4 h-4 mr-2" /> {copied ? 'Copied!' : 'Copy Text'}
                    </Button>
                    <Button className="flex-1" onClick={handleOpenEmail}>
                        <MailIcon className="w-4 h-4 mr-2" /> Open Email App
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};

export default ShareModal;