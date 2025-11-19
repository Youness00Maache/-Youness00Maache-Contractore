
import React, { useState } from 'react';
import type { TimeSheetData } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon } from './Icons.tsx';
import { generateTimeSheetPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';

interface Props {
  job: any;
  profile: any;
  data: TimeSheetData | null;
  onSave: (data: TimeSheetData) => void;
  onBack: () => void;
}

const TimeSheetForm: React.FC<Props> = ({ job, profile, data, onSave, onBack }) => {
  const [formData, setFormData] = useState<TimeSheetData>(data || {
    workerName: profile.name,
    date: new Date().toISOString().split('T')[0],
    hoursWorked: 8,
    overtimeHours: 0,
    notes: '',
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name.includes('Hours') || name === 'hoursWorked' ? parseFloat(value) || 0 : value }));
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

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
        <div className="flex justify-start">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center"><BackArrowIcon className="h-9 w-9" /></Button>
        </div>
        <h1 className="text-xl font-bold text-center">Time Sheet</h1>
        <div className="flex justify-end"></div>
      </header>
      <div className="flex-1 overflow-y-auto">
          <Card className="max-w-2xl mx-auto w-full">
            <CardHeader><CardTitle>Log Hours</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Worker Name</Label><Input name="workerName" value={formData.workerName} onChange={handleChange} /></div>
              <div><Label>Date</Label><Input type="date" name="date" value={formData.date} onChange={handleChange} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Regular Hours</Label><Input type="number" name="hoursWorked" value={formData.hoursWorked} onChange={handleChange} /></div>
                <div><Label>Overtime Hours</Label><Input type="number" name="overtimeHours" value={formData.overtimeHours} onChange={handleChange} /></div>
              </div>
              <div><Label>Notes</Label><textarea name="notes" className="w-full p-2 border rounded-md bg-background" rows={3} value={formData.notes} onChange={handleChange} /></div>
              
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
export default TimeSheetForm;
