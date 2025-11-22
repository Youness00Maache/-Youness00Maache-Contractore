
import React, { useState } from 'react';
import type { WorkOrderData } from '../types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon } from './Icons.tsx';
import { generateWorkOrderPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
  job: any;
  profile: any;
  data: WorkOrderData | null;
  onSave: (data: WorkOrderData) => void;
  onBack: () => void;
}

const WorkOrderForm: React.FC<Props> = ({ job, profile, data, onSave, onBack }) => {
  const [formData, setFormData] = useState<WorkOrderData>(data || {
    title: 'New Work Order',
    date: new Date().toISOString().split('T')[0],
    description: '',
    materialsUsed: '',
    hours: 0,
    cost: 0,
    signatureUrl: '',
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'hours' || name === 'cost' ? parseFloat(value) || 0 : value }));
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

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
        <div className="flex justify-start">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center">
                <BackArrowIcon className="h-9 w-9" />
            </Button>
        </div>
        <h1 className="text-xl font-bold text-center whitespace-nowrap">Work Order</h1>
        <div className="flex items-center gap-2 justify-end">
            {/* Actions are in footer for mobile friendliness, but can be here too */}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
          <Card className="max-w-3xl mx-auto w-full">
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>Title</Label><Input name="title" value={formData.title} onChange={handleChange} /></div>
                  <div><Label>Date</Label><Input type="date" name="date" value={formData.date} onChange={handleChange} /></div>
              </div>
              <div><Label>Description of Work</Label><textarea name="description" className="w-full p-2 border rounded-md bg-background" rows={4} value={formData.description} onChange={handleChange} /></div>
              <div><Label>Materials Used</Label><textarea name="materialsUsed" className="w-full p-2 border rounded-md bg-background" rows={3} value={formData.materialsUsed} onChange={handleChange} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Hours</Label><Input type="number" name="hours" value={formData.hours} onChange={handleChange} /></div>
                <div><Label>Total Cost ($)</Label><Input type="number" name="cost" value={formData.cost} onChange={handleChange} /></div>
              </div>
              
              <div className="mt-4">
                <Label>Customer Signature</Label>
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
            <CardFooter className="flex flex-col sm:flex-row gap-2 w-full">
                <Button variant="outline" onClick={() => onSave(formData)} className="w-full sm:w-auto order-2 sm:order-1">Save Only</Button>
                <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:order-2 sm:ml-auto sm:justify-end">
                    <Button variant="secondary" onClick={handleDownload} disabled={isDownloading} className="w-full sm:w-auto">
                        <ExportIcon className="h-4 w-4 mr-2"/> Download PDF
                    </Button>
                    <Button onClick={async () => { onSave(formData); await handleDownload(); }} disabled={isDownloading} className="col-span-2 sm:col-span-1 w-full sm:w-auto">
                        Save & Download
                    </Button>
                </div>
            </CardFooter>
          </Card>
      </div>
    </div>
  );
};
export default WorkOrderForm;
