
import React, { useState } from 'react';
import type { MaterialLogData, MaterialLogItem } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon } from './Icons.tsx';
import { generateMaterialLogPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';

interface Props {
  job: any;
  profile: any;
  data: MaterialLogData | null;
  onSave: (data: MaterialLogData) => void;
  onBack: () => void;
}

const MaterialLogForm: React.FC<Props> = ({ job, profile, data, onSave, onBack }) => {
  const [formData, setFormData] = useState<MaterialLogData>(data || {
    date: new Date().toISOString().split('T')[0],
    items: [{ id: crypto.randomUUID(), name: '', supplier: '', quantity: 1, unitCost: 0 }],
    templateId: 'standard',
    themeColors: { primary: '#000000', secondary: '#666666' }
  });
  const [isDownloading, setIsDownloading] = useState(false);

  const updateItem = (id: string, field: keyof MaterialLogItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  const addItem = () => {
    setFormData(prev => ({ ...prev, items: [...prev.items, { id: crypto.randomUUID(), name: '', supplier: '', quantity: 1, unitCost: 0 }] }));
  };
  
  const removeItem = (id: string) => {
       setFormData(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await generateMaterialLogPDF(profile, job, formData, formData.templateId || 'standard');
    } catch (e) { console.error(e); alert('Error'); }
    finally { setIsDownloading(false); }
  }

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
      <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
        <div className="flex justify-start">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center"><BackArrowIcon className="h-9 w-9" /></Button>
        </div>
        <h1 className="text-xl font-bold text-center">Material Log</h1>
        <div className="flex justify-end"></div>
      </header>
      <div className="flex-1 overflow-y-auto">
          <Card className="max-w-4xl mx-auto w-full">
            <CardHeader><CardTitle>Materials</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="w-48"><Label>Date</Label><Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
                <div className="space-y-2">
                    {formData.items.map((item, i) => (
                        <div key={item.id} className="grid grid-cols-12 gap-2 items-end border-b pb-2">
                            <div className="col-span-4"><Label className={i===0?"":"hidden"}>Item Name</Label><Input value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)} /></div>
                            <div className="col-span-3"><Label className={i===0?"":"hidden"}>Supplier</Label><Input value={item.supplier} onChange={e => updateItem(item.id, 'supplier', e.target.value)} /></div>
                            <div className="col-span-2"><Label className={i===0?"":"hidden"}>Qty</Label><Input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value))} /></div>
                            <div className="col-span-2"><Label className={i===0?"":"hidden"}>Unit Cost</Label><Input type="number" value={item.unitCost} onChange={e => updateItem(item.id, 'unitCost', parseFloat(e.target.value))} /></div>
                            <div className="col-span-1"><Button variant="ghost" size="sm" onClick={() => removeItem(item.id)}>x</Button></div>
                        </div>
                    ))}
                </div>
                <Button variant="outline" onClick={addItem}>+ Add Item</Button>

                <div className="pt-4 border-t border-border mt-4">
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
export default MaterialLogForm;
