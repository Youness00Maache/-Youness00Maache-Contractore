

import React, { useState, useEffect } from 'react';
import type { EstimateData, LineItem, UserProfile, Job, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, EstimateIcon } from './Icons.tsx';
import { generateEstimatePDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: Job;
  profile: UserProfile;
  data: EstimateData | null;
  clients?: Client[];
  onSave: (data: EstimateData) => void;
  onBack: () => void;
  onUpdateLogo?: (file: File) => Promise<string>;
}

const EstimateForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUpdateLogo }) => {
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState<EstimateData>(data || {
    title: '',
    estimateNumber: `EST-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 1000)}`,
    issueDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    lineItems: [{ id: crypto.randomUUID(), description: '', quantity: 1, rate: 0 }],
    terms: 'This estimate is valid for 30 days. Payment schedule: 50% deposit, 50% upon completion.',
    notes: '',
    status: 'Draft',
    companyName: profile.companyName,
    companyAddress: profile.address,
    companyPhone: profile.phone,
    companyWebsite: profile.website,
    clientName: job.clientName,
    clientAddress: job.clientAddress,
    logoUrl: profile.logoUrl,
    signatureUrl: '',
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  // Sync company details and logo from profile
  useEffect(() => {
      if (!data) {
          // New Document
          setFormData(prev => ({
              ...prev,
              companyName: profile.companyName || prev.companyName,
              companyAddress: profile.address || prev.companyAddress,
              companyPhone: profile.phone || prev.companyPhone,
              companyWebsite: profile.website || prev.companyWebsite,
              logoUrl: profile.logoUrl || prev.logoUrl
          }));
      } else if (formData.status === 'Draft') {
          // Existing Draft: Sync missing info
          setFormData(prev => ({
              ...prev,
              logoUrl: (profile.logoUrl && profile.logoUrl !== prev.logoUrl) ? profile.logoUrl : prev.logoUrl,
              companyName: prev.companyName || profile.companyName,
              companyAddress: prev.companyAddress || profile.address,
              companyPhone: prev.companyPhone || profile.phone,
              companyWebsite: prev.companyWebsite || profile.website,
          }));
      }
  }, [profile, data, formData.status]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const clientId = e.target.value;
      if (clientId === 'custom') return;
      const client = clients.find(c => c.id === clientId);
      if (client) {
          setFormData(prev => ({
              ...prev,
              clientName: client.name,
              clientAddress: client.address || prev.clientAddress
          }));
      }
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

  const updateItem = (id: string, field: keyof LineItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };
  
  const addItem = () => setFormData(prev => ({ ...prev, lineItems: [...prev.lineItems, { id: crypto.randomUUID(), description: '', quantity: 1, rate: 0 }] }));
  const removeItem = (id: string) => setFormData(prev => ({ ...prev, lineItems: prev.lineItems.filter(i => i.id !== id) }));

  const total = formData.lineItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
  
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateEstimatePDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) { console.error(e); alert('Error generating PDF'); }
    finally { setIsDownloading(false); }
  }

  const renderPageOne = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader>
              <CardTitle>Estimate Setup</CardTitle>
              <CardDescription>Project details and client information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              <div className="space-y-1.5">
                  <Label htmlFor="title">Document Title (Dashboard)</Label>
                  <Input id="title" name="title" value={formData.title || ''} onChange={handleChange} placeholder="e.g. Kitchen Renovation Quote" className="font-medium"/>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
                  <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                      <Label className="text-xs text-muted-foreground uppercase font-bold">From (You)</Label>
                      <Input name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Company Name" />
                      <Input name="companyAddress" value={formData.companyAddress} onChange={handleChange} placeholder="Address" />
                      <div className="flex items-center gap-3 mt-2">
                          {formData.logoUrl && <img src={formData.logoUrl} className="w-10 h-10 object-contain bg-white rounded border p-1" />}
                          <div className="flex-1">
                              <Label htmlFor="logoUpload" className="text-xs cursor-pointer text-primary hover:underline">Update Logo</Label>
                              <Input id="logoUpload" type="file" className="h-8 text-xs" accept="image/*" onChange={handleLogoChange} />
                          </div>
                      </div>
                  </div>

                  <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                      <div className="flex flex-col space-y-1.5">
                          <Label className="text-xs text-muted-foreground uppercase font-bold">To (Client)</Label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" onChange={handleClientSelect} defaultValue="custom">
                              <option value="custom">-- Manual Entry --</option>
                              {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                          </select>
                      </div>
                      <Input name="clientName" value={formData.clientName} onChange={handleChange} placeholder="Client Name" />
                      <Input name="clientAddress" value={formData.clientAddress} onChange={handleChange} placeholder="Client Address" />
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-1.5"><Label>Estimate #</Label><Input name="estimateNumber" value={formData.estimateNumber} onChange={handleChange} /></div>
                  <div className="space-y-1.5"><Label>Status</Label><select name="status" value={formData.status} onChange={handleChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="Draft">Draft</option><option value="Sent">Sent</option><option value="Accepted">Accepted</option><option value="Rejected">Rejected</option></select></div>
                  <div className="space-y-1.5"><Label>Issue Date</Label><Input type="date" name="issueDate" value={formData.issueDate} onChange={handleChange} /></div>
                  <div className="space-y-1.5"><Label>Expiry Date</Label><Input type="date" name="expiryDate" value={formData.expiryDate} onChange={handleChange} /></div>
              </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={onBack}>Cancel</Button>
              <Button onClick={() => setPage(2)}>Next: Items</Button>
          </CardFooter>
      </Card>
  );

  const renderPageTwo = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader><CardTitle>Line Items & Terms</CardTitle></CardHeader>
          <CardContent className="space-y-6">
              <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground px-2"><div className="col-span-6">Description</div><div className="col-span-2">Qty</div><div className="col-span-3">Rate</div></div>
                  {formData.lineItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-6"><Input value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} placeholder="Item description" /></div>
                          <div className="col-span-2"><Input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value))} /></div>
                          <div className="col-span-3"><Input type="number" value={item.rate} onChange={e => updateItem(item.id, 'rate', parseFloat(e.target.value))} /></div>
                          <div className="col-span-1"><Button variant="ghost" size="sm" onClick={() => removeItem(item.id)} className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10">×</Button></div>
                      </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addItem} className="mt-2">+ Add Item</Button>
              </div>
              
              <div className="flex justify-end border-t border-border pt-4">
                  <div className="text-right">
                      <span className="text-muted-foreground mr-4">Total Estimate:</span>
                      <span className="text-2xl font-bold">${total.toFixed(2)}</span>
                  </div>
              </div>

              <div className="space-y-4 pt-4">
                  <div className="space-y-1.5"><Label>Notes</Label><textarea className="w-full p-2 border rounded-md bg-background text-sm" rows={2} name="notes" value={formData.notes} onChange={handleChange} placeholder="Additional notes..." /></div>
                  <div className="space-y-1.5"><Label>Terms & Conditions</Label><textarea className="w-full p-2 border rounded-md bg-background text-sm" rows={3} name="terms" value={formData.terms} onChange={handleChange} /></div>
              </div>

              <div className="pt-4">
                  <Label className="mb-2 block">Client Acceptance (Optional)</Label>
                  <div className="mt-1 border rounded-md overflow-hidden">
                      <SignaturePad onSave={(url) => setFormData(prev => ({...prev, signatureUrl: url}))} initialDataUrl={formData.signatureUrl} />
                  </div>
              </div>

              <div className="pt-4 border-t border-border">
                   <TemplateSelector selectedTemplateId={formData.templateId || 'standard'} onSelectTemplate={(id) => setFormData(prev => ({ ...prev, templateId: id }))} themeColors={formData.themeColors} onColorsChange={(colors) => setFormData(prev => ({ ...prev, themeColors: colors }))} />
              </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-2 w-full">
                <Button variant="outline" onClick={() => setPage(1)} className="w-full sm:w-auto order-2 sm:order-1">Back</Button>
                <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:order-2 sm:ml-auto sm:justify-end">
                    <Button variant="outline" onClick={() => onSave(formData)} className="w-full sm:w-auto">Save Draft</Button>
                    <Button variant="secondary" onClick={handleDownload} disabled={isDownloading} className="w-full sm:w-auto"><ExportIcon className="h-4 w-4 mr-2"/> Download</Button>
                    <Button onClick={async () => { onSave(formData); await handleDownload(); }} disabled={isDownloading} className="col-span-2 sm:col-span-1 w-full sm:w-auto">Save & Download</Button>
                </div>
            </CardFooter>
      </Card>
  );

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
        <div className="flex justify-start"><Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center"><BackArrowIcon className="h-9 w-9" /></Button></div>
        <h1 className="text-xl font-bold text-center flex items-center gap-2 justify-center"><EstimateIcon className="w-5 h-5 text-primary" /> Estimate</h1>
        <div className="flex justify-end"></div>
      </header>
      <div className="flex-1 overflow-y-auto pb-10">{page === 1 ? renderPageOne() : renderPageTwo()}</div>
    </div>
  );
};
export default EstimateForm;