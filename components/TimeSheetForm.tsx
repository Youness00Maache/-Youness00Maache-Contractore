import React, { useState, useEffect } from 'react';
import type { TimeSheetData, UserProfile, Job, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, TimeSheetIcon } from './Icons.tsx';
import { generateTimeSheetPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: Job;
  profile: UserProfile;
  data: TimeSheetData | null;
  clients?: Client[];
  onSave: (data: TimeSheetData) => void;
  onBack: () => void;
  onUploadImage?: (file: File) => Promise<string>;
}

const TimeSheetForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage }) => {
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState<TimeSheetData>(data || {
    title: '',
    workerName: profile.name,
    date: new Date().toISOString().split('T')[0],
    hoursWorked: 8,
    overtimeHours: 0,
    notes: '',
    companyName: profile.companyName,
    companyAddress: profile.address,
    companyPhone: profile.phone,
    companyWebsite: profile.website,
    clientName: job.clientName,
    clientAddress: job.clientAddress,
    logoUrl: profile.logoUrl,
    signatureUrl: '',
    status: 'Draft',
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  // Sync company details and logo from profile if it changes and document is Draft/New
  useEffect(() => {
      if (!data) {
          // New Document: Sync everything available
          setFormData(prev => ({
              ...prev,
              companyName: profile.companyName || prev.companyName,
              companyAddress: profile.address || prev.companyAddress,
              companyPhone: profile.phone || prev.companyPhone,
              companyWebsite: profile.website || prev.companyWebsite,
              logoUrl: profile.logoUrl || prev.logoUrl
          }));
      } else if (formData.status === 'Draft') {
          // Existing draft - update logo if changed, and fill company info if empty in the form
          setFormData(prev => ({
              ...prev,
              logoUrl: (profile.logoUrl && profile.logoUrl !== prev.logoUrl && !data.logoUrl) ? profile.logoUrl : prev.logoUrl,
              companyName: prev.companyName ? prev.companyName : profile.companyName,
              companyAddress: prev.companyAddress ? prev.companyAddress : profile.address,
              companyPhone: prev.companyPhone ? prev.companyPhone : profile.phone,
              companyWebsite: prev.companyWebsite ? prev.companyWebsite : profile.website,
          }));
      }
  }, [profile, data, formData.status]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name.includes('Hours') || name === 'hoursWorked' ? parseFloat(value) || 0 : value }));
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
          } catch (e) {
              console.error(e);
          }
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
        await generateTimeSheetPDF(profile, job, formData, formData.templateId || 'standard');
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
              <CardTitle>Time Sheet Setup</CardTitle>
              <CardDescription>Worker and Job Information</CardDescription>
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
                    placeholder="e.g. Week 4 Timesheet" 
                    className="font-medium"
                  />
              </div>

              {/* Company & Client Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3 p-3 bg-muted/20 rounded-md border border-border/50">
                      <Label className="text-xs text-muted-foreground uppercase font-bold">Employer / Company</Label>
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

                  <div className="space-y-3 p-3 bg-muted/20 rounded-md border border-border/50">
                      <div className="flex flex-col space-y-1.5">
                          <Label htmlFor="clientSelect" className="text-xs text-muted-foreground uppercase font-bold">Client / Job Site</Label>
                          <select 
                            id="clientSelect" 
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
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
                        <Input name="clientAddress" value={formData.clientAddress} onChange={handleChange} placeholder="Job Site Address" />
                      </div>
                  </div>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-1.5">
                      <Label htmlFor="workerName">Worker Name</Label>
                      <Input id="workerName" name="workerName" value={formData.workerName} onChange={handleChange} />
                  </div>
                  <div className="space-y-1.5">
                      <Label htmlFor="date">Date</Label>
                      <Input type="date" id="date" name="date" value={formData.date} onChange={handleChange} />
                  </div>
              </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={onBack}>Cancel</Button>
              <Button onClick={() => setPage(2)}>Next: Hours & Sign</Button>
          </CardFooter>
      </Card>
  );

  const renderPageTwo = () => (
      <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
          <CardHeader>
              <CardTitle>Hours & Details</CardTitle>
              <CardDescription>Log time and sign off.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg border border-border/50">
                <div className="space-y-1.5">
                    <Label htmlFor="hoursWorked">Regular Hours</Label>
                    <Input type="number" id="hoursWorked" name="hoursWorked" value={formData.hoursWorked} onChange={handleChange} className="font-bold text-lg" />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="overtimeHours">Overtime Hours</Label>
                    <Input type="number" id="overtimeHours" name="overtimeHours" value={formData.overtimeHours} onChange={handleChange} className="font-bold text-lg" />
                </div>
              </div>

              <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes / Description of Work</Label>
                  <textarea 
                    id="notes" 
                    name="notes" 
                    className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
                    value={formData.notes} 
                    onChange={handleChange} 
                    placeholder="Describe work performed..."
                  />
              </div>
              
              <div className="pt-2">
                <Label className="mb-2 block">Worker Signature</Label>
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
                    <TimeSheetIcon className="w-6 h-6 text-primary" /> Time Sheet
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
export default TimeSheetForm;