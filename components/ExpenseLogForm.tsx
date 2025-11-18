
import React, { useState } from 'react';
import type { ExpenseLogData } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon } from './Icons.tsx';
import { generateExpenseLogPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';

interface Props {
  job: any;
  profile: any;
  data: ExpenseLogData | null;
  onSave: (data: ExpenseLogData) => void;
  onBack: () => void;
}

const ExpenseLogForm: React.FC<Props> = ({ job, profile, data, onSave, onBack }) => {
  const [formData, setFormData] = useState<ExpenseLogData>(data || {
    date: new Date().toISOString().split('T')[0],
    item: '',
    vendor: '',
    category: 'Material',
    amount: 0,
  });
  const [templateId, setTemplateId] = useState('standard');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) || 0 : value }));
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateExpenseLogPDF(profile, job, formData, templateId);
    } catch (e) { console.error(e); alert('Error'); }
    finally { setIsDownloading(false); }
  }

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
        <div className="flex justify-start">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center"><BackArrowIcon className="h-9 w-9" /></Button>
        </div>
        <h1 className="text-xl font-bold text-center">Expense Log</h1>
        <div className="flex justify-end"></div>
      </header>
      <div className="flex-1 overflow-y-auto">
          <Card className="max-w-lg mx-auto w-full">
            <CardHeader><CardTitle>New Expense</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Date</Label><Input type="date" name="date" value={formData.date} onChange={handleChange} /></div>
              <div><Label>Item/Description</Label><Input name="item" value={formData.item} onChange={handleChange} /></div>
              <div><Label>Vendor</Label><Input name="vendor" value={formData.vendor} onChange={handleChange} /></div>
              <div>
                  <Label>Category</Label>
                  <select name="category" value={formData.category} onChange={handleChange} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="Material">Material</option>
                      <option value="Fuel">Fuel</option>
                      <option value="Food">Food</option>
                      <option value="Other">Other</option>
                  </select>
              </div>
              <div><Label>Amount ($)</Label><Input type="number" name="amount" value={formData.amount} onChange={handleChange} /></div>

              <div className="pt-4 border-t border-border">
                 <TemplateSelector selected={templateId} onSelect={setTemplateId} />
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
export default ExpenseLogForm;
