
import React, { useState } from 'react';
import type { WarrantyData } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon } from './Icons.tsx';
import { generateWarrantyPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: any;
  profile: any;
  data: WarrantyData | null;
  onSave: (data: WarrantyData) => void;
  onBack: () => void;
}

const WarrantyForm: React.FC<Props> = ({ job, profile, data, onSave, onBack }) => {
  const [formData, setFormData] = useState<WarrantyData>(data || {
    completedDate: new Date().toISOString().split('T')[0],
    duration: '1 Year',
    coverage: 'Labor and materials for installation defects.',
    conditions: 'Warranty void if damage caused by negligence or natural disasters.',
    signatureUrl: '',
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateWarrantyPDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) { console.error(e); alert('Error'); }
    finally { setIsDownloading(false); }
  }

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
        <div className="flex justify-start">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center"><BackArrowIcon className="h-9 w-9" /></Button>
        </div>
        <h1 className="text-xl font-bold text-center">Warranty</h1>
        <div className="flex justify-end"></div>
      </header>
      <div className="flex-1 overflow-y-auto">
          <Card className="max-w-2xl mx-auto w-full">
            <CardHeader><CardTitle>Warranty Certificate</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Completion Date</Label><Input type="date" name="completedDate" value={formData.completedDate} onChange={handleChange} /></div>
              <div><Label>Warranty Duration</Label><Input name="duration" value={formData.duration} onChange={handleChange} placeholder="e.g. 1 Year" /></div>
              <div><Label>Coverage</Label><textarea name="coverage" className="w-full p-2 border rounded-md bg-background" rows={4} value={formData.coverage} onChange={handleChange} /></div>
              <div><Label>Conditions</Label><textarea name="conditions" className="w-full p-2 border rounded-md bg-background" rows={4} value={formData.conditions} onChange={handleChange} /></div>

              <div className="mt-4">
                <Label>Authorized Signature</Label>
                <div className="mt-2">
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
            <CardFooter className="flex justify-end gap-2 flex-wrap">
                <Button variant="outline" onClick={() => onSave(formData)}>Save Only</Button>
                <Button variant="secondary" onClick={handleDownload} disabled={isDownloading}>
                    <ExportIcon className="h-4 w-4 mr-2"/> Download PDF
                </Button>
                <Button onClick={async () => { onSave(formData); await handleDownload(); }} disabled={isDownloading}>
                    Save & Download
                </Button>
            </CardFooter>
          </Card>
      </div>
    </div>
  );
};
export default WarrantyForm;
