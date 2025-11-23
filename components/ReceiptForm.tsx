
import React, { useState, useEffect } from 'react';
import type { ReceiptData, UserProfile, Job, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, ReceiptIcon } from './Icons.tsx';
import { generateReceiptPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: Job;
  profile: UserProfile;
  data: ReceiptData | null;
  clients?: Client[];
  onSave: (data: ReceiptData) => void;
  onBack: () => void;
  onUploadImage?: (file: File) => Promise<string>;
}

const ReceiptForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage }) => {
  const [formData, setFormData] = useState<ReceiptData>(() => {
      const initialData = data || {
        title: '',
        receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        clientName: job.clientName || '',
        amount: 0,
        description: 'Payment for services rendered',
        paymentMethod: 'Check',
        companyName: profile.companyName,
        companyAddress: profile.address,
        companyPhone: profile.phone,
        companyWebsite: profile.website,
        logoUrl: profile.logoUrl,
        signatureUrl: '',
        templateId: 'standard',
        themeColors: { primary: '#000000', secondary: '#666666' }
      };

      // Backward compatibility: if 'from' exists but 'clientName' doesn't, map it.
      // Using 'any' cast because 'from' is no longer in the interface.
      if ((initialData as any).from && !initialData.clientName) {
          initialData.clientName = (initialData as any).from;
      }
      
      return initialData;
  });
  
  const [isDownloading, setIsDownloading] = useState(false);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) || 0 : value }));
  };

  const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const clientId = e.target.value;
      if (clientId === 'custom') return;
      const client = clients.find(c => c.id === clientId);
      if (client) setFormData(prev => ({ ...prev, clientName: client.name }));
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

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateReceiptPDF(profile, job, formData, formData.templateId || 'standard');
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
                    <ReceiptIcon className="w-6 h-6 text-primary" /> Receipt
                </h1>
            </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto pb-10">
          <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
            <CardHeader><CardTitle>Payment Receipt</CardTitle><CardDescription>Document received funds.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-border pb-6">
                  <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                      <Label className="text-xs text-muted-foreground uppercase font-bold">Company (Recipient)</Label>
                      <Input name="companyName" value={formData.companyName} onChange={handleChange} />
                      <Input name="companyAddress" value={formData.companyAddress} onChange={handleChange} />
                      <div className="flex items-center gap-3 mt-2">
                          {formData.logoUrl && <img src={formData.logoUrl} className="w-10 h-10 object-contain bg-white rounded border p-1" />}
                          <div className="flex-1"><Label htmlFor="logoUpload" className="text-xs cursor-pointer text-primary hover:underline">Logo</Label><Input id="logoUpload" type="file" className="h-8 text-xs" accept="image/*" onChange={handleLogoChange} /></div>
                      </div>
                  </div>
                  <div className="space-y-4">
                      <div><Label>Receipt #</Label><Input name="receiptNumber" value={formData.receiptNumber} onChange={handleChange} /></div>
                      <div><Label>Date</Label><Input type="date" name="date" value={formData.date} onChange={handleChange} /></div>
                  </div>
              </div>

              <div className="space-y-4">
                  <div className="flex flex-col space-y-1.5">
                      <Label>Received From</Label>
                      <div className="flex gap-2">
                          <select className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm w-1/3" onChange={handleClientSelect} defaultValue="custom">
                              <option value="custom">Manual</option>
                              {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                          </select>
                          <Input name="clientName" value={formData.clientName} onChange={handleChange} className="flex-1" placeholder="Client Name" />
                      </div>
                  </div>
                  
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                      <Label className="text-green-800 dark:text-green-300">Amount Received ($)</Label>
                      <Input type="number" name="amount" value={formData.amount} onChange={handleChange} className="text-2xl font-bold h-14 mt-2" />
                  </div>

                  <div><Label>For (Description)</Label><Input name="description" value={formData.description} onChange={handleChange} /></div>
                  <div><Label>Payment Method</Label><Input name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} placeholder="Cash, Check #123, etc." /></div>
              </div>

              <div className="pt-4">
                  <Label className="mb-2 block">Received By (Signature)</Label>
                  <div className="mt-1 border rounded-md overflow-hidden">
                      <SignaturePad onSave={(url) => setFormData(prev => ({...prev, signatureUrl: url}))} initialDataUrl={formData.signatureUrl} />
                  </div>
              </div>

              <div className="pt-4 border-t border-border">
                 <TemplateSelector selectedTemplateId={formData.templateId || 'standard'} onSelectTemplate={(id) => setFormData(prev => ({ ...prev, templateId: id }))} themeColors={formData.themeColors} onColorsChange={(colors) => setFormData(prev => ({ ...prev, themeColors: colors }))} />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-2 w-full justify-end bg-muted/20 p-6">
                <Button variant="outline" onClick={() => onSave(formData)} className="w-full sm:w-auto">Save Only</Button>
                <Button variant="secondary" onClick={handleDownload} disabled={isDownloading} className="w-full sm:w-auto"><ExportIcon className="h-4 w-4 mr-2"/> Download</Button>
                <Button onClick={async () => { onSave(formData); await handleDownload(); }} disabled={isDownloading} className="w-full sm:w-auto">Save & Download</Button>
            </CardFooter>
          </Card>
      </div>
    </div>
  );
};
export default ReceiptForm;