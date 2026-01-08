import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { AppLogo, InvoiceIcon, EstimateIcon, DailyReportIcon, ExportIcon, GlobeIcon, PenIcon, ChangeOrderIcon } from './Icons.tsx';
import { generateInvoicePDF, generateEstimatePDF, generateDailyJobReportPDF, generateChangeOrderPDF } from '../services/pdfGenerator.ts';
import { FormType } from '../types.ts';
import SignaturePad from './SignaturePad.tsx';

interface PortalViewProps {
    supabase: any;
    portalKey: string;
}

const PortalView: React.FC<PortalViewProps> = ({ supabase, portalKey }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'Invoices' | 'Estimates' | 'Reports'>('Invoices');
    
    // Signing State
    const [signingDocId, setSigningDocId] = useState<string | null>(null);
    const [signature, setSignature] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchData = async () => {
        try {
            const { data: result, error: rpcError } = await supabase.rpc('get_portal_data', { p_key: portalKey });
            
            if (rpcError) throw rpcError;
            if (result.error) throw new Error(result.error);
            
            setData(result);
        } catch (err: any) {
            console.error("Portal Error:", err);
            setError(err.message || "Failed to load portal. Invalid link or expired.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [portalKey, supabase]);

    const handleSignDocument = async () => {
        if (!signingDocId || !signature) return;
        setIsSubmitting(true);
        try {
            const { error } = await supabase.rpc('sign_document_via_portal', {
                p_key: portalKey,
                p_doc_id: signingDocId,
                p_signature: signature
            });

            if (error) throw error;
            
            alert("Document signed successfully!");
            setSigningDocId(null);
            setSignature('');
            await fetchData(); // Refresh data
        } catch (e: any) {
            alert("Failed to sign document: " + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground font-medium">Loading Portal...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                <Card className="max-w-md w-full text-center p-8">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <GlobeIcon className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                    <p className="text-muted-foreground mb-6">{error}</p>
                    <Button onClick={() => window.location.href = '/'}>Go Home</Button>
                </Card>
            </div>
        );
    }

    const { client, contractor, documents } = data;
    
    const invoices = documents.filter((d: any) => d.type === FormType.Invoice);
    const estimates = documents.filter((d: any) => d.type === FormType.Estimate || d.type === FormType.ChangeOrder);
    const reports = documents.filter((d: any) => d.type === FormType.DailyJobReport);

    const activeDocs = activeTab === 'Invoices' ? invoices : activeTab === 'Estimates' ? estimates : reports;

    const handleDownload = async (doc: any) => {
        try {
            const commonProps = { clientName: client.name, ...doc.data } as any;
            if (doc.type === FormType.Invoice) {
                await generateInvoicePDF(contractor, commonProps, doc.data, doc.data.templateId || 'standard');
            } else if (doc.type === FormType.Estimate) {
                await generateEstimatePDF(contractor, commonProps, doc.data, doc.data.templateId || 'standard');
            } else if (doc.type === FormType.ChangeOrder) {
                await generateChangeOrderPDF(contractor, commonProps, doc.data, doc.data.templateId || 'standard');
            } else if (doc.type === FormType.DailyJobReport) {
                await generateDailyJobReportPDF(contractor, doc.data, doc.data.templateId || 'standard');
            }
        } catch (e) {
            alert("Error generating PDF. Please try again.");
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {contractor.logo_url ? (
                            <img src={contractor.logo_url} alt="Logo" className="h-10 w-auto object-contain" />
                        ) : (
                            <div className="bg-primary/10 p-2 rounded-lg"><AppLogo className="w-6 h-6" /></div>
                        )}
                        <div>
                            <h1 className="font-bold text-lg leading-none">{contractor.company_name || 'Contractor Portal'}</h1>
                            <p className="text-xs text-muted-foreground mt-1">Client: {client.name}</p>
                        </div>
                    </div>
                    <div className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full hidden sm:block">
                        Secure Client Portal
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Signing Modal */}
                {signingDocId && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSigningDocId(null)}>
                        <Card className="w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                            <CardHeader>
                                <CardTitle>Sign Document</CardTitle>
                                <CardDescription>Please provide your signature to accept this document.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-md overflow-hidden bg-white">
                                    <SignaturePad onSave={setSignature} />
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-end gap-2 bg-slate-50">
                                <Button variant="ghost" onClick={() => setSigningDocId(null)}>Cancel</Button>
                                <Button onClick={handleSignDocument} disabled={!signature || isSubmitting}>
                                    {isSubmitting ? 'Signing...' : 'Submit Signature'}
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-6 mb-8">
                    {/* Welcome Card */}
                    <Card className="flex-1 bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-0 shadow-lg">
                        <CardHeader>
                            <CardTitle className="text-2xl">Welcome back, {client.name.split(' ')[0]}</CardTitle>
                            <CardDescription className="text-blue-100">
                                View your documents, track project status, and download reports anytime.
                            </CardDescription>
                        </CardHeader>
                    </Card>
                    
                    {/* Stats Card */}
                    <Card className="sm:w-64 border-blue-100 bg-white shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Outstanding</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-slate-900">
                                ${invoices
                                    .filter((i: any) => i.data.status !== 'Paid')
                                    .reduce((acc: number, i: any) => {
                                        const items = i.data.lineItems || [];
                                        const sub = items.reduce((s: number, item: any) => s + (item.quantity * item.rate), 0);
                                        return acc + sub;
                                    }, 0).toFixed(2)}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Unpaid Invoice Balance</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Navigation Tabs */}
                <div className="flex space-x-1 rounded-xl bg-slate-200/50 p-1 mb-6 max-w-md">
                    {(['Invoices', 'Estimates', 'Reports'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all
                                ${activeTab === tab 
                                    ? 'bg-white text-blue-700 shadow' 
                                    : 'text-slate-600 hover:bg-white/[0.12] hover:text-blue-600'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Document List */}
                <div className="space-y-4">
                    {activeDocs.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                                {activeTab === 'Invoices' ? <InvoiceIcon className="w-6 h-6" /> : activeTab === 'Estimates' ? <EstimateIcon className="w-6 h-6" /> : <DailyReportIcon className="w-6 h-6" />}
                            </div>
                            <h3 className="text-lg font-medium text-slate-900">No {activeTab} Found</h3>
                            <p className="text-slate-500">Documents will appear here once shared.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {activeDocs.map((doc: any) => {
                                const d = doc.data;
                                const date = new Date(doc.created_at).toLocaleDateString();
                                const title = d.title || d.invoiceNumber || d.estimateNumber || d.reportNumber || d.changeOrderNumber || 'Untitled Document';
                                const amount = d.lineItems ? d.lineItems.reduce((acc: number, i: any) => acc + (i.quantity * i.rate), 0) : 0;
                                
                                // Check if document supports signing
                                const canSign = (doc.type === FormType.Estimate || doc.type === FormType.ChangeOrder) && d.status !== 'Accepted';

                                return (
                                    <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-start gap-4">
                                            <div className={`p-3 rounded-lg shrink-0 ${
                                                activeTab === 'Invoices' ? 'bg-green-100 text-green-700' : 
                                                activeTab === 'Estimates' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                                                {doc.type === FormType.ChangeOrder ? <ChangeOrderIcon className="w-6 h-6" /> :
                                                 activeTab === 'Invoices' ? <InvoiceIcon className="w-6 h-6" /> : 
                                                 activeTab === 'Estimates' ? <EstimateIcon className="w-6 h-6" /> : <DailyReportIcon className="w-6 h-6" />}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-slate-900">{title}</h3>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 mt-1">
                                                    <span>{date}</span>
                                                    {d.status && (
                                                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase
                                                            ${d.status === 'Paid' || d.status === 'Accepted' ? 'bg-green-100 text-green-700' : 
                                                              d.status === 'Overdue' || d.status === 'Rejected' ? 'bg-red-100 text-red-700' : 
                                                              'bg-slate-100 text-slate-700'}`
                                                        }>
                                                            {d.status}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                                            {amount > 0 && (
                                                <div className="text-right">
                                                    <p className="text-xs text-slate-500 font-medium uppercase">Total</p>
                                                    <p className="text-lg font-bold text-slate-900">${amount.toFixed(2)}</p>
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                {canSign && (
                                                    <Button size="sm" onClick={() => setSigningDocId(doc.id)} className="bg-green-600 hover:bg-green-700 text-white">
                                                        <PenIcon className="w-4 h-4 mr-2" /> Review & Sign
                                                    </Button>
                                                )}
                                                <Button variant="outline" size="sm" onClick={() => handleDownload(doc)}>
                                                    <ExportIcon className="w-4 h-4 mr-2" /> Download
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
            
            <footer className="text-center py-8 text-xs text-slate-400">
                Powered by ContractorDocs Portal
            </footer>
        </div>
    );
};

export default PortalView;