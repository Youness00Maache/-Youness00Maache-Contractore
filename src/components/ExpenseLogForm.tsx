import React, { useState, useEffect, useRef } from 'react';
import type { ExpenseLogData, UserProfile, Job, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, ExpenseLogIcon } from './Icons.tsx';
import { generateExpenseLogPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';
import { processReceiptImage, type OCRResult } from '../utils/ocr.ts';

interface Props {
  job: Job;
  profile: UserProfile;
  data: ExpenseLogData | null;
  clients?: Client[];
  onSave: (data: ExpenseLogData) => void;
  onBack: () => void;
  onUploadImage?: (file: File) => Promise<string>;
}

const ExpenseLogForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage }) => {
  // Generate a random ID for new items
  const generateId = () => Math.random().toString(36).substr(2, 9);
  // const cameraInputRef = useRef<HTMLInputElement>(null); // Removed per user request
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<ExpenseLogData>(data || {
    title: '',
    date: new Date().toISOString().split('T')[0],
    item: '',
    lineItems: [{ id: generateId(), description: '', quantity: 1, rate: 0 }], // Initialize with one empty item
    vendor: '',
    category: 'Material',
    amount: 0,
    tax: 0,
    notes: '',
    companyName: profile.companyName,
    companyAddress: profile.address,
    companyPhone: profile.phone,
    companyWebsite: profile.website,
    clientName: job.clientName,
    logoUrl: profile.logoUrl,
    signatureUrl: '',
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [scanNotification, setScanNotification] = useState<{ type: 'success' | 'error', message: string, details?: string } | null>(null);

  // Auto-calculate total amount when line items change
  useEffect(() => {
    if (formData.lineItems && formData.lineItems.length > 0) {
      const subtotal = formData.lineItems.reduce((sum, item) => sum + ((item.rate || 0) * (item.quantity || 1)), 0);
      const total = subtotal + (formData.tax || 0);
      setFormData(prev => ({ ...prev, amount: total }));
    }
  }, [formData.lineItems, formData.tax]);

  useEffect(() => {
    if (!data) {
      setFormData(prev => ({
        ...prev,
        companyName: profile.companyName || prev.companyName,
        companyAddress: profile.address || prev.companyAddress,
        logoUrl: profile.logoUrl || prev.logoUrl
      }));
    }
  }, [profile, data]);

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev,
      lineItems: [...(prev.lineItems || []), { id: generateId(), description: '', quantity: 1, rate: 0 }]
    }));
  };

  const removeLineItem = (index: number) => {
    setFormData(prev => {
      const newItems = [...(prev.lineItems || [])];
      newItems.splice(index, 1);
      return { ...prev, lineItems: newItems };
    });
  };

  const updateLineItem = (index: number, field: 'description' | 'rate' | 'quantity', value: string | number) => {
    setFormData(prev => {
      const newItems = [...(prev.lineItems || [])];
      if (!newItems[index]) return prev;

      if (field === 'rate') {
        newItems[index] = { ...newItems[index], rate: parseFloat(value as string) || 0 };
      } else if (field === 'quantity') {
        newItems[index] = { ...newItems[index], quantity: parseFloat(value as string) || 1 };
      } else {
        newItems[index] = { ...newItems[index], description: value as string };
      }

      return { ...prev, lineItems: newItems };
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    // Fix crash: parse tax as number just like amount
    const val = (name === 'amount' || name === 'tax') ? parseFloat(value) || 0 : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (onUploadImage) {
        try {
          const newUrl = await onUploadImage(file);
          if (newUrl) setFormData(prev => ({ ...prev, logoUrl: newUrl }));
        } catch (e) { console.error(e); }
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          setFormData(prev => ({ ...prev, logoUrl: event.target?.result as string }));
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const clientId = e.target.value;
    if (clientId === 'custom') return;
    const client = clients.find(c => c.id === clientId);
    if (client) setFormData(prev => ({ ...prev, clientName: client.name }));
  };

  const handleReceiptScan = async (file: File) => {
    setIsProcessingOCR(true);
    try {
      const ocrResult: OCRResult = await processReceiptImage(file);

      if (ocrResult.vendor) {
        setFormData(prev => ({ ...prev, vendor: ocrResult.vendor || '' }));
      }

      if (ocrResult.date) {
        setFormData(prev => ({ ...prev, date: ocrResult.date || '' }));
      }

      if (ocrResult.amount) {
        setFormData(prev => ({ ...prev, amount: ocrResult.amount || 0 }));
      }

      if (ocrResult.tax) {
        setFormData(prev => ({ ...prev, tax: ocrResult.tax || 0 }));
      }

      // Populate Client Info if found
      if (ocrResult.client) {
        setFormData(prev => ({ ...prev, clientName: ocrResult.client || '' }));
      }

      // Populate Company Info from Vendor if found (per user request to "take it from document")
      if (ocrResult.vendor) {
        setFormData(prev => ({ ...prev, companyName: ocrResult.vendor || prev.companyName }));
      }
      if (ocrResult.companyAddress) {
        setFormData(prev => ({ ...prev, companyAddress: ocrResult.companyAddress || prev.companyAddress }));
      }
      if (ocrResult.companyPhone) {
        setFormData(prev => ({ ...prev, companyPhone: ocrResult.companyPhone || prev.companyPhone }));
      }

      const autoTitle = `${ocrResult.vendor || 'Receipt'} - ${ocrResult.date || new Date().toLocaleDateString()}`;
      setFormData(prev => ({ ...prev, title: autoTitle }));

      // Handle Line Items
      if (ocrResult.lineItems && ocrResult.lineItems.length > 0) {
        // Map OCR items to our LineItem format
        const newItems = ocrResult.lineItems.map(item => ({
          id: generateId(),
          description: item.description,
          quantity: 1, // Quantity column hidden, force 1
          rate: item.price // Store extracted price directly as rate, ignoring quantity per user request
        }));

        setFormData(prev => ({ ...prev, lineItems: newItems }));
      }

      // Put footer notes in notes field
      if (ocrResult.notes) {
        setFormData(prev => ({ ...prev, notes: ocrResult.notes || '' }));
      }

      setScanNotification({
        type: 'success',
        message: '⚠ Note: OCR is not perfect. Please verify extracted data.',
      });

    } catch (error) {
      console.error('OCR error:', error);
      setScanNotification({ type: 'error', message: 'Failed to scan receipt. Please enter manually.' });
    } finally {
      setIsProcessingOCR(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateExpenseLogPDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) { console.error(e); alert('Error generating PDF'); }
    finally { setIsDownloading(false); }
  }

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
            <BackArrowIcon className="h-6 w-6" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
              <ExpenseLogIcon className="w-6 h-6 text-primary" /> Expense Log
            </h1>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto pb-10">
        <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader><CardTitle>Track Expense</CardTitle><CardDescription>Record project costs.</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">Scan Receipt</h3>
                  <p className="text-sm text-muted-foreground">Auto-extract vendor, date, and amount</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={isProcessingOCR}
                    size="lg"
                    className="shadow-lg w-full sm:w-auto" // Made full width or specific style
                  >
                    {isProcessingOCR ? 'Processing...' : 'Upload Receipt'}
                  </Button>
                </div>
              </div>
            </div>

            {scanNotification && (
              <div className={`text-sm p-3 rounded-md border ${scanNotification.type === 'success' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-red-50 border-red-200 text-red-800'} mb-4 animate-in fade-in slide-in-from-top-1`}>
                <div className="flex justify-between items-center w-full">
                  <p className="font-semibold text-sm">
                    {scanNotification.message}
                  </p>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:bg-black/5 rounded-full ml-auto" onClick={() => setScanNotification(null)}>✕</Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Title (Dashboard)</Label>
              <Input name="title" value={formData.title || ''} onChange={handleChange} placeholder="e.g. Hardware Store Trip" className="font-medium" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
              <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                <Label className="text-xs text-muted-foreground uppercase font-bold">Company Info</Label>
                <Input name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Your Company" />
                <Input name="companyAddress" value={formData.companyAddress} onChange={handleChange} placeholder="Address" />
                <div className="flex items-center gap-3 mt-2">
                  {formData.logoUrl && <img src={formData.logoUrl} className="w-10 h-10 object-contain bg-white rounded border p-1" />}
                  <div className="flex-1"><Label htmlFor="logoUpload" className="text-xs cursor-pointer text-primary hover:underline">Logo</Label><Input id="logoUpload" type="file" className="h-8 text-xs" accept="image/*" onChange={handleLogoChange} /></div>
                </div>
              </div>
              <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                <div className="flex flex-col space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase font-bold">Client / Job</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" onChange={handleClientSelect} defaultValue="custom">
                    <option value="custom">-- Manual Entry --</option>
                    {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
                <Input name="clientName" value={formData.clientName} onChange={handleChange} placeholder="Client Name" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" name="date" value={formData.date} onChange={handleChange} /></div>
              <div><Label>Vendor / Store</Label><Input name="vendor" value={formData.vendor} onChange={handleChange} placeholder="e.g. Home Depot" /></div>
              <div><Label>Category</Label>
                <select name="category" value={formData.category} onChange={handleChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="Material">Material</option>
                  <option value="Fuel">Fuel</option>
                  <option value="Food">Food</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="text-xs h-7">+ Add Item</Button>
              </div>

              <div className="space-y-2 border rounded-md p-3 bg-muted/10">
                {(formData.lineItems || []).map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-start group">
                    <div className="flex-1">
                      <Input
                        placeholder="Item Description"
                        value={item.description}
                        onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    {/* Quantity field removed per user request */}
                    <div className="w-24">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={item.rate}
                        onChange={(e) => updateLineItem(idx, 'rate', e.target.value)}
                        className="h-8 text-sm text-right font-mono"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => removeLineItem(idx)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                    </Button>
                  </div>
                ))}

                {(!formData.lineItems || formData.lineItems.length === 0) && (
                  <div className="text-center py-4 text-muted-foreground text-sm cursor-pointer" onClick={addLineItem}>
                    Click "Add Item" to add line items
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Tax:</span>
                    <Input
                      type="number"
                      name="tax"
                      value={formData.tax || 0}
                      onChange={handleChange}
                      className="w-24 h-8 text-right bg-background"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">Total</span>
                    <span className="font-bold text-lg">${formData.amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2"><Label>Notes</Label><textarea className="w-full p-2 border rounded-md bg-background text-sm" rows={2} name="notes" value={formData.notes} onChange={handleChange} /></div>
            </div>

            <div className="pt-4">
              <Label className="mb-2 block">Approver Signature (Optional)</Label>
              <div className="mt-1 border rounded-md overflow-hidden">
                <SignaturePad onSave={(url) => setFormData(prev => ({ ...prev, signatureUrl: url }))} initialDataUrl={formData.signatureUrl} />
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <TemplateSelector selectedTemplateId={formData.templateId || 'standard'} onSelectTemplate={(id) => setFormData(prev => ({ ...prev, templateId: id }))} themeColors={formData.themeColors} onColorsChange={(colors) => setFormData(prev => ({ ...prev, themeColors: colors }))} />
            </div>
          </CardContent>
          {/* Hidden input for upload handling */}
          <input
            type="file"
            ref={uploadInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleReceiptScan(file);
              e.target.value = '';
            }}
          />
          <CardFooter className="flex flex-col sm:flex-row gap-2 w-full justify-end bg-muted/20 p-6">
            <Button variant="outline" onClick={() => onSave(formData)} className="w-full sm:w-auto">Save Only</Button>
            <Button variant="secondary" onClick={handleDownload} disabled={isDownloading} className="w-full sm:w-auto"><ExportIcon className="h-4 w-4 mr-2" /> Download</Button>
            <Button onClick={async () => { onSave(formData); await handleDownload(); }} disabled={isDownloading} className="w-full sm:w-auto">Save & Download</Button>
          </CardFooter>
        </Card >
      </div >
    </div >
  );
};
export default ExpenseLogForm;