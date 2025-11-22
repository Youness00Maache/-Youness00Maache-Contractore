

import React, { useState, useEffect } from 'react';
import type { ExpenseLogData, UserProfile, Job, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, ExpenseLogIcon } from './Icons.tsx';
import { generateExpenseLogPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: Job;
  profile: UserProfile;
  data: ExpenseLogData | null;
  clients?: Client[];
  onSave: (data: ExpenseLogData) => void;
  onBack: () => void;
  onUpdateLogo?: (file: File) => Promise<string>;
}

const ExpenseLogForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUpdateLogo }) => {
  const [formData, setFormData] = useState<ExpenseLogData>(data || {
    title: '',
    date: new Date().toISOString().split('T')[0],
    item: '',
    vendor: '',
    category: 'Material',
    amount: 0,
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) || 0 : value }));
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (onUpdateLogo) {
          try {
              const newUrl = await onUpdateLogo(file);
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

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateExpenseLogPDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) { console.error(e); alert('Error generating PDF'); }
    finally { setIsDownloading(false); }
  }

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
        <div className="flex justify-start">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center"><BackArrowIcon className="h-9 w-9" /></Button>
        </div>
        <h1 className="text-xl font-bold text-center flex items-center gap-2 justify-center"><ExpenseLogIcon className="w-5 h-5 text-primary"/> Expense Log</h1>
        <div className="flex justify-end"></div>
      </header>
      <div className="flex-1 overflow-y-auto pb-10">
          <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
            <CardHeader><CardTitle>Track Expense</CardTitle><CardDescription>Record project costs.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1.5">
                  <Label>Title (Dashboard)</Label>
                  <Input name="title" value={formData.title || ''} onChange={handleChange} placeholder="e.g. Hardware Store Trip" className="font-medium"/>
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
                  <div>
                      <Label>Category</Label>
                      <select name="category" value={formData.category} onChange={handleChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                          <option value="Material">Material</option>
                          <option value="Fuel">Fuel</option>
                          <option value="Food">Food</option>
                          <option value="Other">Other</option>
                      </select>
                  </div>
                  <div className="md:col-span-2"><Label>Item / Description</Label><Input name="item" value={formData.item} onChange={handleChange} placeholder="e.g. 2x4 Lumber Bundle" /></div>
                  <div><Label>Vendor / Store</Label><Input name="vendor" value={formData.vendor} onChange={handleChange} placeholder="e.g. Home Depot" /></div>
                  <div><Label>Amount ($)</Label><Input type="number" name="amount" value={formData.amount} onChange={handleChange} className="font-bold text-lg" /></div>
                  <div className="md:col-span-2"><Label>Notes</Label><textarea className="w-full p-2 border rounded-md bg-background text-sm" rows={2} name="notes" value={formData.notes} onChange={handleChange} /></div>
              </div>

              <div className="pt-4">
                  <Label className="mb-2 block">Approver Signature (Optional)</Label>
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
export default ExpenseLogForm;