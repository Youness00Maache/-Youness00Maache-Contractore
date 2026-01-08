import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { AppLogo, CheckCircleIcon, XCircleIcon, PenIcon } from './Icons.tsx';
import SignaturePad from './SignaturePad.tsx';

interface DocumentApprovalViewProps {
    supabase: any;
    approvalToken: string;
}

const DocumentApprovalView: React.FC<DocumentApprovalViewProps> = ({ supabase, approvalToken }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);
    const [signature, setSignature] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const fetchData = async () => {
        try {
            const { data: result, error: rpcError } = await supabase.rpc('get_document_by_token', { doc_token: approvalToken });
            
            if (rpcError) throw rpcError;
            if (result.error) throw new Error(result.error);
            
            setData(result);
        } catch (err: any) {
            console.error("Approval Error:", err);
            setError(err.message || "Failed to load document. Invalid link or expired.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [approvalToken, supabase]);

    const handleApprove = async () => {
        if (!signature) return alert("Please sign the document before approving.");
        setIsSubmitting(true);
        try {
            const { error } = await supabase.rpc('approve_document_by_token', {
                doc_token: approvalToken,
                p_signature: signature
            });

            if (error) throw error;
            setSuccess(true);
        } catch (e: any) {
            alert("Failed to approve: " + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
    
    if (error) return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4"><Card className="max-w-md w-full text-center p-8"><h2 className="text-xl font-bold mb-2 text-red-600">Document Unavailable</h2><p className="text-muted-foreground">{error}</p></Card></div>;

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-green-50 p-4">
                <Card className="max-w-md w-full text-center p-8 animate-in zoom-in-95">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircleIcon className="w-12 h-12" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2 text-green-900">Approved!</h2>
                    <p className="text-green-700">The document has been successfully signed and the status has been updated. You can close this window.</p>
                </Card>
            </div>
        );
    }

    const { document: doc, contractor } = data;
    const docData = doc.data;
    const type = doc.type;
    const total = docData.lineItems 
        ? docData.lineItems.reduce((acc: number, item: any) => acc + (Number(item.quantity) * Number(item.rate)), 0)
        : (docData.amount || 0);

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {contractor.logo_url ? <img src={contractor.logo_url} alt="Logo" className="h-8 w-auto" /> : <AppLogo className="w-8 h-8" />}
                        <span className="font-bold text-sm hidden sm:inline">{contractor.company_name}</span>
                    </div>
                    <div className="text-xs font-medium bg-blue-100 text-blue-700 px-3 py-1 rounded-full uppercase tracking-wide">
                        Review & Sign
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                <Card className="shadow-lg border-0">
                    <CardHeader className="bg-slate-900 text-white rounded-t-lg pt-8 pb-8">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-blue-200 text-sm font-medium uppercase tracking-wider mb-1">{type}</p>
                                <CardTitle className="text-3xl">{docData.title || type}</CardTitle>
                                <CardDescription className="text-slate-400 mt-2">
                                    Reference: {docData.estimateNumber || docData.changeOrderNumber || docData.invoiceNumber || 'N/A'}
                                </CardDescription>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-slate-400">Total Value</p>
                                <p className="text-3xl font-bold">${total.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-8">
                        {/* Parties */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pb-6 border-b border-slate-100">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">From</h3>
                                <p className="font-semibold">{contractor.company_name}</p>
                                <p className="text-sm text-slate-600 whitespace-pre-wrap">{docData.companyAddress}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">To</h3>
                                <p className="font-semibold">{docData.clientName}</p>
                                <p className="text-sm text-slate-600 whitespace-pre-wrap">{docData.clientAddress}</p>
                            </div>
                        </div>

                        {/* Line Items */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-900 mb-4">Line Items</h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium">
                                        <tr>
                                            <th className="px-4 py-3">Description</th>
                                            <th className="px-4 py-3 w-20 text-center">Qty</th>
                                            <th className="px-4 py-3 w-32 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {docData.lineItems?.map((item: any, i: number) => (
                                            <tr key={i}>
                                                <td className="px-4 py-3">{item.description}</td>
                                                <td className="px-4 py-3 text-center">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right font-medium">${(item.quantity * item.rate).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 font-bold">
                                        <tr>
                                            <td colSpan={2} className="px-4 py-3 text-right">Total</td>
                                            <td className="px-4 py-3 text-right text-blue-700">${total.toFixed(2)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* Terms */}
                        {docData.terms && (
                            <div className="bg-slate-50 p-4 rounded-lg text-sm text-slate-600">
                                <h3 className="font-bold text-slate-900 mb-2">Terms & Conditions</h3>
                                <p className="whitespace-pre-wrap">{docData.terms}</p>
                            </div>
                        )}

                        {/* Signing Area */}
                        <div>
                            <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                                <PenIcon className="w-4 h-4 text-primary" /> Sign Below to Accept
                            </h3>
                            <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50">
                                <SignaturePad onSave={setSignature} />
                            </div>
                            <p className="text-xs text-slate-500 mt-2 text-center">
                                By signing above, you agree to the terms outlined in this document.
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                        <Button 
                            onClick={handleApprove} 
                            disabled={!signature || isSubmitting}
                            size="lg"
                            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20"
                        >
                            {isSubmitting ? 'Processing...' : 'Approve & Sign'}
                        </Button>
                    </CardFooter>
                </Card>
            </main>
        </div>
    );
};

export default DocumentApprovalView;