import React, { useState, useEffect } from 'react';
import type { WarrantyData, UserProfile, Job, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, ShieldIcon } from './Icons.tsx';
import { generateWarrantyPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: Job;
  profile: UserProfile;
  data: WarrantyData | null;
  clients?: Client[];
  onSave: (data: WarrantyData) => void;
  onBack: () => void;
  onUploadImage?: (file: File) => Promise<string>;
}

const WarrantyForm: React.FC<Props> = ({ job, profile, data, clients = [], onSave, onBack, onUploadImage }) => {
  const [formData, setFormData] = useState<WarrantyData>(data || {
    title: '',
    warrantyNumber: `WAR-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 1000)}`,
    clientName: job.clientName || '',
    projectAddress: job.clientAddress || '',
    completedDate: new Date().toISOString().split('T')[0],
    duration: '1 Year',
    coverage: 'This warranty covers defects in workmanship and materials provided by the contractor for the duration specified above. We will repair or replace any defective work at no cost to the owner.',
    conditions: 'This warranty does not cover damage resulting from normal wear and tear, negligence, abuse, natural disasters, or modifications made by others. Notification of any defect must be made in writing within the warranty period.',
    signatureUrl: '',
    logoUrl: profile.logoUrl, // Default to profile logo
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  // Ensure logo syncs if profile logo changes, unless user manually changed it in this session
  useEffect(() => {
      if (profile.logoUrl && !data?.logoUrl) {
          setFormData(prev => ({ ...prev, logoUrl: profile.logoUrl }));
      }
  }, [profile.logoUrl]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
              projectAddress: client.address || prev.projectAddress
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
      await generateWarrantyPDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) { 
        console.error(e); 
        alert('Error generating PDF. Please try again.'); 
    } finally { 
        setIsDownloading(false); 
    }
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
                    <ShieldIcon className="w-6 h-6 text-primary" /> Warranty
                </h1>
            </div>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto">
          <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
            <CardHeader>
                <CardTitle>Certificate of Warranty</CardTitle>
                <CardDescription>Create a formal guarantee for your work.</CardDescription>
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
                    placeholder="e.g. Roof Warranty - Smith" 
                    className="font-medium"
                  />
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                      <Label htmlFor="warrantyNumber">Warranty ID</Label>
                      <Input id="warrantyNumber" name="warrantyNumber" value={formData.warrantyNumber} onChange={handleChange} />
                  </div>
                  <div className="space-y-1.5">
                      <Label htmlFor="completedDate">Date of Completion</Label>
                      <Input type="date" id="completedDate" name="completedDate" value={formData.completedDate} onChange={handleChange} />
                  </div>
              </div>

              <div className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-4">
                  <div className="flex flex-col space-y-1.5">
                      <Label htmlFor="clientSelect">Select Client (Auto-fill)</Label>
                      <select 
                        id="clientSelect" 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        onChange={handleClientSelect}
                        defaultValue="custom"
                      >
                          <option value="custom">-- Manual Entry --</option>
                          {clients.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                      </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                          <Label htmlFor="clientName">Issued To (Client)</Label>
                          <Input id="clientName" name="clientName" value={formData.clientName} onChange={handleChange} />
                      </div>
                      <div className="space-y-1.5">
                          <Label htmlFor="projectAddress">Project Location</Label>
                          <Input id="projectAddress" name="projectAddress" value={formData.projectAddress} onChange={handleChange} />
                      </div>
                  </div>
              </div>

              <div className="space-y-1.5">
                  <Label htmlFor="duration">Warranty Duration</Label>
                  <Input id="duration" name="duration" value={formData.duration} onChange={handleChange} placeholder="e.g. 1 Year from Completion Date" className="font-medium" />
              </div>

              <div className="space-y-1.5">
                  <Label htmlFor="coverage">Scope of Coverage</Label>
                  <textarea 
                    id="coverage" 
                    name="coverage" 
                    className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
                    value={formData.coverage} 
                    onChange={handleChange} 
                    placeholder="Describe what is covered..."
                  />
              </div>

              <div className="space-y-1.5">
                  <Label htmlFor="conditions">Terms, Conditions & Exclusions</Label>
                  <textarea 
                    id="conditions" 
                    name="conditions" 
                    className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" 
                    value={formData.conditions} 
                    onChange={handleChange} 
                    placeholder="Describe exceptions or conditions..."
                  />
              </div>

              <div className="mt-6 border-t border-border pt-6 space-y-6">
                <div className="flex flex-col space-y-1.5">
                      <Label htmlFor="logoUrl">Company Logo</Label>
                      <div className="flex items-start gap-4">
                          {formData.logoUrl && (
                              <div className="border p-2 rounded bg-muted/20">
                                  <img src={formData.logoUrl} alt="Logo Preview" className="h-16 w-auto object-contain" />
                              </div>
                          )}
                          <div className="flex-1">
                              <Input id="logoUrl" type="file" accept="image/*" onChange={handleLogoChange} />
                              <p className="text-xs text-muted-foreground mt-1">Defaults to your settings logo. Upload here to override for this document only.</p>
                          </div>
                      </div>
                </div>

                <div>
                    <Label className="mb-3 block">Authorized Signature</Label>
                    <div className="border rounded-md overflow-hidden">
                        <SignaturePad 
                            onSave={(url) => setFormData(prev => ({...prev, signatureUrl: url}))}
                            initialDataUrl={formData.signatureUrl}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Sign above to validate this certificate.</p>
                </div>
              </div>

               <div className="pt-4 border-t border-border mt-4">
                    <TemplateSelector 
                         selectedTemplateId={formData.templateId || 'standard'} 
                         onSelectTemplate={(id) => setFormData(prev => ({ ...prev, templateId: id }))} 
                         themeColors={formData.themeColors}
                         onColorsChange={(colors) => setFormData(prev => ({ ...prev, themeColors: colors }))}
                     />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-3 justify-end bg-muted/20 p-6">
                <Button variant="outline" onClick={() => onSave(formData)} className="w-full sm:w-auto">Save Draft</Button>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="secondary" onClick={handleDownload} disabled={isDownloading} className="flex-1 sm:flex-none">
                        <ExportIcon className="h-4 w-4 mr-2"/> {isDownloading ? 'Generating...' : 'Download PDF'}
                    </Button>
                    <Button onClick={async () => { onSave(formData); await handleDownload(); }} disabled={isDownloading} className="flex-1 sm:flex-none">
                        Save & Download
                    </Button>
                </div>
            </CardFooter>
          </Card>
      </div>
    </div>
  );
};
export default WarrantyForm;