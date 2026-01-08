import React, { useState, useEffect } from 'react';
import type { ChangeOrderData, LineItem, UserProfile, Job, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, ChangeOrderIcon, GlobeIcon, CheckIcon } from './Icons.tsx';
import { generateChangeOrderPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: Job;
  profile: UserProfile;
  data: ChangeOrderData | null;
  clients?: Client[];
  onSave: (data: ChangeOrderData) => void;
  onBack: () => void;
  onUploadImage?: (file: File) => Promise<string>;
  publicToken?: string;
}

const ChangeOrderForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage, publicToken }) => {
  const [page, setPage] = useState(1);
  const [copiedLink, setCopiedLink] = useState(false);
  const [formData, setFormData] = useState<ChangeOrderData>(data || {
    title: '',
    changeOrderNumber: `CO-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-001`,
    date: new Date().toISOString().split('T')[0],
    reason: '',
    description: '',
    currentContractSum: 0,
    lineItems: [{ id: crypto.randomUUID(), description: '', quantity: 1, rate: 0 }],
    terms: 'The Contract Time will be increased by 0 days. The date of Substantial Completion as of the date of this Change Order therefore is unchanged. All other terms and conditions of the original contract remain in full force and effect.',
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
          setFormData(prev => ({
              ...prev,
              companyName: profile.companyName || prev.companyName,
              companyAddress: profile.address || prev.companyAddress,
              companyPhone: profile.phone || prev.companyPhone,
              companyWebsite: profile.website || prev.companyWebsite,
              logoUrl: profile.logoUrl || prev.logoUrl
          }));
      }
  }, [profile, data]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setFormData(prev => ({ ...prev, [name]: name === 'currentContractSum' ? parseFloat(value) || 0 : value }));
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

  const updateItem = (id: string, field: keyof LineItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };
  
  const addItem = () => setFormData(prev => ({ ...prev, lineItems: [...prev.lineItems, { id: crypto.randomUUID(), description: '', quantity: 1, rate: 0 }] }));
  const removeItem = (id: string) => setFormData(prev => ({ ...prev, lineItems: prev.lineItems.filter(i => i.id !== id) }));

  const changeTotal = formData.lineItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
  const newTotal = (formData.currentContractSum || 0) + changeTotal;
  
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateChangeOrderPDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) { console.error(e); alert('Error generating PDF'); }
    finally { setIsDownloading(false); }
  }

  const handleGetApprovalLink = () => {
      if (!publicToken) {
          alert("Please save the document first to generate a link.");
          onSave(formData);
          return;
      }
      
      const link = `${window.location.origin}?approval_token=${publicToken}`;
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
  };

  const renderPageOne = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader>
              <CardTitle>Change Order Setup</CardTitle>
              <CardDescription>Identify the change and its reason.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              <div className="space-y-1.5">
                  <Label htmlFor="title">Document Title (Dashboard)</Label>
                  <Input id="title" name="title" value={formData.title || ''} onChange={handleChange} placeholder="e.g. Additional Outlets" className="font-medium"/>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
                  <div className="space-y-3">
                      <div className="space-y-1.5">
                          <Label>Change Order #</Label>
                          <Input name="changeOrderNumber" value={formData.changeOrderNumber} onChange={handleChange} />
                      </div>
                      <div className="space-y-1.5">
                          <Label>Date</Label>
                          <Input type="date" name="date" value={formData.date} onChange={handleChange} />
                      </div>
                  </div>
                  <div className="space-y-3">
                      <div className="space-y-1.5">
                          <Label>Reason for Change</Label>
                          <select name="reason" value={formData.reason} onChange={handleChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                              <option value="">-- Select Reason --</option>
                              <option value="Client Request">Client Request</option>
                              <option value="Unforeseen Condition">Unforeseen Condition</option>
                              <option value="Design Change">Design Change</option>
                              <option value="Code Requirement">Code Requirement</option>
                              <option value="Other">Other</option>
                          </select>
                      </div>
                      <div className="space-y-1.5">
                          <Label>Description</Label>
                          <textarea className="w-full p-2 border rounded-md bg-background text-sm" rows={2} name="description" value={formData.description} onChange={handleChange} placeholder="Briefly describe the change..." />
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
                  <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                      <Label className="text-xs text-muted-foreground uppercase font-bold">From (Contractor)</Label>
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
                          <select 
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" 
                            onChange={handleClientSelect} 
                            defaultValue="custom"
                          >
                              <option value="custom">-- Select Saved Client --</option>
                              {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                          </select>
                      </div>
                      <Input name="clientName" value={formData.clientName} onChange={handleChange} placeholder="Client Name" />
                      <Input name="clientAddress" value={formData.clientAddress} onChange={handleChange} placeholder="Client Address" />
                  </div>
              </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={onBack}>Cancel</Button>
              <Button onClick={() => setPage(2)}>Next: Financials</Button>
          </CardFooter>
      </Card>
  );

  const renderPageTwo = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader><CardTitle>Financial Impact</CardTitle><CardDescription>Calculate the new contract total.</CardDescription></CardHeader>
          <CardContent className="space-y-6">
              
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                  <Label className="text-blue-800 dark:text-blue-300 mb-1 block">Current Contract Value ($)</Label>
                  <Input 
                    type="number" 
                    name="currentContractSum" 
                    value={formData.currentContractSum} 
                    onChange={handleChange} 
                    className="font-bold text-lg bg-white dark:bg-slate-950"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Enter the total contract sum BEFORE this change.</p>
              </div>

              <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground px-2"><div className="col-span-6">Item Description</div><div className="col-span-2">Qty</div><div className="col-span-3">Rate</div></div>
                  {formData.lineItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-6"><Input value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} placeholder="Material or Labor" /></div>
                          <div className="col-span-2"><Input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value))} /></div>
                          <div className="col-span-3"><Input type="number" value={item.rate} onChange={e => updateItem(item.id, 'rate', parseFloat(e.target.value))} /></div>
                          <div className="col-span-1"><Button variant="ghost" size="sm" onClick={() => removeItem(item.id)} className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10">×</Button></div>
                      </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addItem} className="mt-2">+ Add Line Item</Button>
              </div>
              
              <div className="flex flex-col items-end border-t border-border pt-4 gap-2">
                  <div className="flex justify-between w-full max-w-xs text-sm">
                      <span className="text-muted-foreground">Current Contract:</span>
                      <span>${Number(formData.currentContractSum).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between w-full max-w-xs text-sm">
                      <span className="text-muted-foreground">Net Change:</span>
                      <span className="font-bold text-primary">{changeTotal >= 0 ? '+' : ''}${changeTotal.toFixed(2)}</span>
                  </div>
                  <div className="w-full max-w-xs border-t border-dashed border-border my-1"></div>
                  <div className="flex justify-between w-full max-w-xs text-lg font-bold">
                      <span>New Contract Total:</span>
                      <span>${newTotal.toFixed(2)}</span>
                  </div>
              </div>

              <div className="space-y-4 pt-4">
                  <div className="space-y-1.5"><Label>Terms & Conditions</Label><textarea className="w-full p-2 border rounded-md bg-background text-sm" rows={3} name="terms" value={formData.terms} onChange={handleChange} /></div>
              </div>

              <div className="pt-4 border-t border-border mt-4">
                   <div className="flex flex-col gap-2">
                       <h4 className="text-sm font-bold flex items-center gap-2"><GlobeIcon className="w-4 h-4 text-blue-600" /> Digital Sign-off (Quick Close)</h4>
                       <p className="text-xs text-muted-foreground">Share a public link. Client signs on their phone. Status updates to 'Accepted' automatically.</p>
                       <div className="flex gap-2">
                           <Button 
                                variant="outline" 
                                size="sm" 
                                className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 w-full sm:w-auto"
                                onClick={handleGetApprovalLink}
                            >
                                <GlobeIcon className="w-4 h-4 mr-2" /> 
                                {copiedLink ? <span className="flex items-center gap-1"><CheckIcon className="w-4 h-4"/> Copied Link</span> : 'Get Approval Link'}
                            </Button>
                       </div>
                   </div>
              </div>

              <div className="pt-4">
                  <Label className="mb-2 block">Client Approval Signature (Manual)</Label>
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
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
         <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                <BackArrowIcon className="h-6 w-6" />
            </Button>
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                    <ChangeOrderIcon className="w-6 h-6 text-primary" /> Change Order
                </h1>
            </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto pb-10">{page === 1 ? renderPageOne() : renderPageTwo()}</div>
    </div>
  );
};
export default ChangeOrderForm;