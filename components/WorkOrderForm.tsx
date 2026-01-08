import React, { useState, useEffect } from 'react';
import type { WorkOrderData, UserProfile, Job, Client } from '../types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, WorkOrderIcon } from './Icons.tsx';
import { generateWorkOrderPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: Job;
  profile: UserProfile;
  data: WorkOrderData | null;
  clients?: Client[];
  onSave: (data: WorkOrderData) => void;
  onBack: () => void;
  onUploadImage?: (file: File) => Promise<string>;
}

const WorkOrderForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage }) => {
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState<WorkOrderData>(data || {
    title: '',
    workOrderNumber: `WO-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 1000)}`,
    date: new Date().toISOString().split('T')[0],
    status: 'Scheduled',
    description: '',
    materialsUsed: '',
    hours: 0,
    cost: 0,
    terms: 'Payment is due upon completion of work. Any changes to the scope of work must be approved in writing.',
    companyName: profile.companyName,
    companyAddress: profile.address,
    companyPhone: profile.phone,
    companyWebsite: profile.website,
    clientName: job.clientName,
    clientAddress: job.clientAddress,
    signatureUrl: '',
    logoUrl: profile.logoUrl,
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  // Sync company details and logo from profile
  useEffect(() => {
      if (!data) {
          // New Document: aggressively sync with profile
          setFormData(prev => ({
              ...prev,
              companyName: profile.companyName || prev.companyName,
              companyAddress: profile.address || prev.companyAddress,
              companyPhone: profile.phone || prev.companyPhone,
              companyWebsite: profile.website || prev.companyWebsite,
              logoUrl: profile.logoUrl || prev.logoUrl
          }));
      } else {
          // Existing Document: Only fill if empty to preserve history
          setFormData(prev => ({
              ...prev,
              companyName: prev.companyName || profile.companyName,
              companyAddress: prev.companyAddress || profile.address,
              companyPhone: prev.companyPhone || profile.phone,
              companyWebsite: prev.companyWebsite || profile.website,
              logoUrl: prev.logoUrl || profile.logoUrl
          }));
      }
  }, [profile, data]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'hours' || name === 'cost' ? parseFloat(value) || 0 : value }));
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

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateWorkOrderPDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) {
      console.error(e);
      alert('Error generating PDF');
    } finally {
      setIsDownloading(false);
    }
  }

  const renderPageOne = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader>
              <CardTitle>Work Order Setup</CardTitle>
              <CardDescription>Details, branding, and client info.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              {/* Title for Dashboard */}
              <div className="space-y-1.5">
                  <Label htmlFor="title">Document Title (For Dashboard)</Label>
                  <Input 
                    id="title" 
                    name="title" 
                    value={formData.title || ''} 
                    onChange={handleChange} 
                    placeholder="e.g. Master Bath Repair" 
                    className="font-medium"
                  />
              </div>

              {/* Meta Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                      <Label htmlFor="workOrderNumber">Work Order #</Label>
                      <Input id="workOrderNumber" name="workOrderNumber" value={formData.workOrderNumber} onChange={handleChange} />
                  </div>
                  <div className="space-y-1.5">
                      <Label htmlFor="date">Date</Label>
                      <Input type="date" id="date" name="date" value={formData.date} onChange={handleChange} />
                  </div>
                  <div className="space-y-1.5">
                      <Label htmlFor="status">Status</Label>
                      <select 
                        id="status" 
                        name="status" 
                        value={formData.status} 
                        onChange={handleChange}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                          <option value="Scheduled">Scheduled</option>
                          <option value="In Progress">In Progress</option>
                          <option value="On Hold">On Hold</option>
                          <option value="Completed">Completed</option>
                      </select>
                  </div>
              </div>

              <div className="border-t border-border pt-4">
                  <h3 className="font-semibold mb-3">Company & Client</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Company (Left) */}
                      <div className="space-y-3 p-3 bg-muted/20 rounded-md border border-border/50">
                          <Label className="text-xs text-muted-foreground uppercase">Service Provider</Label>
                          <Input name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Your Company" />
                          <Input name="companyAddress" value={formData.companyAddress} onChange={handleChange} placeholder="Address" />
                          <div className="flex items-start gap-3 mt-2">
                              {formData.logoUrl && <img src={formData.logoUrl} className="w-12 h-12 object-contain bg-white rounded border p-1" />}
                              <div className="flex-1">
                                  <Label htmlFor="logoUpload" className="text-xs cursor-pointer text-primary hover:underline">Change Logo</Label>
                                  <Input id="logoUpload" type="file" className="h-8 text-xs" accept="image/*" onChange={handleLogoChange} />
                              </div>
                          </div>
                      </div>

                      {/* Client (Right) */}
                      <div className="space-y-3 p-3 bg-muted/20 rounded-md border border-border/50">
                          <div className="flex flex-col space-y-1.5">
                              <Label htmlFor="clientSelect" className="text-xs text-muted-foreground uppercase">Select Saved Client</Label>
                              <select 
                                id="clientSelect" 
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                onChange={handleClientSelect}
                                defaultValue="custom"
                              >
                                  <option value="custom">-- Manual Entry --</option>
                                  {clients.map(c => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                              </select>
                          </div>
                          <div className="space-y-2 pt-1">
                            <Input name="clientName" value={formData.clientName} onChange={handleChange} placeholder="Client Name" />
                            <Input name="clientAddress" value={formData.clientAddress} onChange={handleChange} placeholder="Client Address" />
                          </div>
                      </div>
                  </div>
              </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={onBack}>Cancel</Button>
              <Button onClick={() => setPage(2)}>Next: Job Details</Button>
          </CardFooter>
      </Card>
  );

  const renderPageTwo = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader>
              <CardTitle>Job Details</CardTitle>
              <CardDescription>Work description, materials, and totals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              <div className="space-y-1.5">
                  <Label htmlFor="description">Description of Work</Label>
                  <textarea 
                    id="description" 
                    name="description" 
                    className="w-full min-h-[120px] p-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
                    value={formData.description} 
                    onChange={handleChange} 
                    placeholder="Detailed description of services performed or to be performed..."
                  />
              </div>

              <div className="space-y-1.5">
                  <Label htmlFor="materialsUsed">Materials / Parts</Label>
                  <textarea 
                    id="materialsUsed" 
                    name="materialsUsed" 
                    className="w-full min-h-[80px] p-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
                    value={formData.materialsUsed} 
                    onChange={handleChange} 
                    placeholder="List of materials used..."
                  />
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border/50">
                  <div>
                      <Label htmlFor="hours">Labor Hours</Label>
                      <Input type="number" id="hours" name="hours" value={formData.hours} onChange={handleChange} />
                  </div>
                  <div>
                      <Label htmlFor="cost">Total Cost Estimate ($)</Label>
                      <Input type="number" id="cost" name="cost" value={formData.cost} onChange={handleChange} className="font-bold" />
                  </div>
              </div>

              <div className="space-y-1.5">
                  <Label htmlFor="terms">Terms & Conditions</Label>
                  <textarea 
                    id="terms" 
                    name="terms" 
                    className="w-full min-h-[60px] p-3 rounded-md border border-input bg-background text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
                    value={formData.terms} 
                    onChange={handleChange} 
                  />
              </div>

              <div className="pt-4">
                <Label className="mb-2 block">Authorized Signature</Label>
                <div className="mt-1">
                    <SignaturePad 
                        onSave={(url) => setFormData(prev => ({...prev, signatureUrl: url}))}
                        initialDataUrl={formData.signatureUrl}
                    />
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                  <TemplateSelector 
                     selectedTemplateId={formData.templateId || 'standard'} 
                     onSelectTemplate={(id) => setFormData(prev => ({ ...prev, templateId: id }))} 
                     themeColors={formData.themeColors}
                     onColorsChange={(colors) => setFormData(prev => ({ ...prev, themeColors: colors }))}
                 />
              </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-2 w-full">
                <Button variant="outline" onClick={() => setPage(1)} className="w-full sm:w-auto order-2 sm:order-1">Back</Button>
                <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:order-2 sm:ml-auto sm:justify-end">
                    <Button variant="outline" onClick={() => onSave(formData)} className="w-full sm:w-auto">Save Draft</Button>
                    <Button variant="secondary" onClick={handleDownload} disabled={isDownloading} className="w-full sm:w-auto">
                        <ExportIcon className="h-4 w-4 mr-2"/> {isDownloading ? '...' : 'Download PDF'}
                    </Button>
                    <Button onClick={async () => { onSave(formData); await handleDownload(); }} disabled={isDownloading} className="col-span-2 sm:col-span-1 w-full sm:w-auto">
                        Save & Download
                    </Button>
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
                    <WorkOrderIcon className="w-6 h-6 text-primary" /> Work Order
                </h1>
            </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto pb-10">
          {page === 1 ? renderPageOne() : renderPageTwo()}
      </div>
    </div>
  );
};
export default WorkOrderForm;