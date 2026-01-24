import React, { useState, useEffect } from 'react';
import type { MaterialLogData, MaterialLogItem, UserProfile, Job, Client, InventoryItem } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, ExportIcon, BoxIcon, MaterialLogIcon } from './Icons.tsx';
import { generateMaterialLogPDF } from '../services/pdfGenerator.ts';
import TemplateSelector from './TemplateSelector.tsx';
import SignaturePad from './SignaturePad.tsx';

interface Props {
    job: Job;
    profile: UserProfile;
    data: MaterialLogData | null;
    clients?: Client[];
    inventory?: InventoryItem[];
    onSave: (data: MaterialLogData) => void;
    onBack: () => void;
    onUploadImage?: (file: File) => Promise<string>;
}

const MaterialLogForm: React.FC<Props> = ({ job, profile, data, clients = [], inventory = [], onSave, onBack, onUploadImage }) => {
    const [page, setPage] = useState(1);
    const [formData, setFormData] = useState<MaterialLogData>(data || {
        title: '',
        date: new Date().toISOString().split('T')[0],
        projectName: job.name || '',
        items: [{ id: crypto.randomUUID(), name: '', supplier: '', quantity: 1, unitCost: 0 }],
        companyName: profile.companyName,
        companyAddress: profile.address,
        companyPhone: profile.phone,
        companyWebsite: profile.website,
        clientName: job.clientName,
        clientAddress: job.clientAddress,
        logoUrl: profile.logoUrl,
        signatureUrl: '',
        templateId: 'standard',
        themeColors: { primary: '#000000', secondary: '#666666' },
        deductInventory: false
    });
    const [isDownloading, setIsDownloading] = useState(false);
    const [showInventoryPicker, setShowInventoryPicker] = useState<string | null>(null); // itemId to populate

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
        } else {
            setFormData(prev => ({
                ...prev,
                companyName: prev.companyName || profile.companyName,
                companyAddress: prev.companyAddress || profile.address,
                logoUrl: prev.logoUrl || profile.logoUrl
            }));
        }
    }, [profile, data]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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

    // Inventory Integration
    const handleSelectFromInventory = (logItemId: string, invItem: InventoryItem) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item => item.id === logItemId ? {
                ...item,
                name: invItem.name,
                supplier: invItem.supplier || item.supplier,
                unitCost: invItem.cost_price || item.unitCost,
                inventoryItemId: invItem.id
            } : item)
        }));
        setShowInventoryPicker(null);
    };

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            await generateMaterialLogPDF(profile, job, formData, formData.templateId || 'standard');
        } catch (e) { console.error(e); alert('Error generating PDF'); }
        finally { setIsDownloading(false); }
    }

    const renderPageOne = () => (
        <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
            <CardHeader><CardTitle>Material Log Setup</CardTitle><CardDescription>Project and branding details.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-1.5">
                    <Label>Document Title</Label>
                    <Input name="title" value={formData.title || ''} onChange={handleChange} placeholder="e.g. Rough-in Materials" className="font-medium" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
                    <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                        <Label className="text-xs text-muted-foreground uppercase font-bold">Company</Label>
                        <Input name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Company Name" />
                        <Input name="companyAddress" value={formData.companyAddress} onChange={handleChange} placeholder="Address" />
                        <div className="flex items-center gap-3 mt-2">
                            {formData.logoUrl && <img src={formData.logoUrl} className="w-10 h-10 object-contain bg-white rounded border p-1" />}
                            <div className="flex-1"><Label htmlFor="logoUpload" className="text-xs cursor-pointer text-primary hover:underline">Logo</Label><Input id="logoUpload" type="file" className="h-8 text-xs" accept="image/*" onChange={handleLogoChange} /></div>
                        </div>
                    </div>
                    <div className="space-y-3 bg-muted/20 p-3 rounded-md border border-border/50">
                        <div className="flex flex-col space-y-1.5">
                            <Label className="text-xs text-muted-foreground uppercase font-bold">Client / Project</Label>
                            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" onChange={handleClientSelect} defaultValue="custom">
                                <option value="custom">-- Manual Entry --</option>
                                {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                            </select>
                        </div>
                        <Input name="clientName" value={formData.clientName} onChange={handleChange} placeholder="Client Name" />
                        <Input name="projectName" value={formData.projectName} onChange={handleChange} placeholder="Project Name" />
                    </div>
                </div>
                <div className="w-full md:w-1/2"><Label>Log Date</Label><Input type="date" name="date" value={formData.date} onChange={handleChange} /></div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2"><Button variant="outline" onClick={onBack}>Cancel</Button><Button onClick={() => setPage(2)}>Next: Items</Button></CardFooter>
        </Card>
    );

    const renderPageTwo = () => (
        <Card className="max-w-3xl mx-auto w-full animate-fade-in-down">
            <CardHeader><CardTitle>Materials List</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    {formData.items.map((item, i) => (
                        <div key={item.id} className="border-b pb-4 mb-2 last:border-0 last:mb-0">
                            <div className="flex justify-between items-center mb-2">
                                {inventory.length > 0 && (
                                    <div className="relative">
                                        <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => setShowInventoryPicker(item.id)}>
                                            <BoxIcon className="w-3 h-3 mr-1" /> Load from Inventory
                                        </Button>
                                        {showInventoryPicker === item.id && (
                                            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border shadow-xl rounded-md w-64 max-h-60 overflow-y-auto p-1">
                                                {inventory.map(inv => (
                                                    <div key={inv.id} className="p-2 hover:bg-muted text-sm cursor-pointer rounded-sm" onClick={() => handleSelectFromInventory(item.id, inv)}>
                                                        <p className="font-medium">{inv.name}</p>
                                                        <p className="text-xs text-muted-foreground">Qty: {inv.quantity} | Cost: ${inv.cost_price}</p>
                                                    </div>
                                                ))}
                                                {inventory.length === 0 && <p className="p-2 text-xs text-muted-foreground">No items in inventory.</p>}
                                                <div className="border-t mt-1 pt-1 text-center"><span className="text-xs text-red-500 cursor-pointer" onClick={() => setShowInventoryPicker(null)}>Cancel</span></div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => removeItem(item.id)} className="text-destructive h-6 w-6 p-0 hover:bg-destructive/10 rounded-full">x</Button>
                            </div>
                            <div className="grid grid-cols-12 gap-3 items-end">
                                <div className="col-span-5"><Label className={i === 0 ? "mb-1 block" : "hidden"}>Item</Label><Input value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)} placeholder="Name" /></div>
                                <div className="col-span-3"><Label className={i === 0 ? "mb-1 block" : "hidden"}>Supplier</Label><Input value={item.supplier} onChange={e => updateItem(item.id, 'supplier', e.target.value)} placeholder="Supplier" /></div>
                                <div className="col-span-2"><Label className={i === 0 ? "mb-1 block" : "hidden"}>Qty</Label><Input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value))} /></div>
                                <div className="col-span-2"><Label className={i === 0 ? "mb-1 block" : "hidden"}>Cost</Label><Input type="number" value={item.unitCost} onChange={e => updateItem(item.id, 'unitCost', parseFloat(e.target.value))} /></div>
                            </div>
                            {item.inventoryItemId && <p className="text-xs text-green-600 mt-1 flex items-center"><BoxIcon className="w-3 h-3 mr-1" /> Linked to Inventory Item</p>}
                        </div>
                    ))}
                    <Button variant="outline" onClick={addItem}>+ Add Material</Button>
                </div>

                <div className="pt-4 border-t border-border mt-4">
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="deductInv"
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            checked={formData.deductInventory || false}
                            onChange={(e) => setFormData(prev => ({ ...prev, deductInventory: e.target.checked }))}
                        />
                        <Label htmlFor="deductInv" className="cursor-pointer">Deduct used quantities from Inventory on save</Label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6 mt-1">This will decrease the stock of any linked items in your inventory.</p>
                </div>

                <div className="pt-4">
                    <Label className="mb-2 block">Signature (Optional)</Label>
                    <div className="mt-1 border rounded-md overflow-hidden">
                        <SignaturePad onSave={(url) => setFormData(prev => ({ ...prev, signatureUrl: url }))} initialDataUrl={formData.signatureUrl} />
                    </div>
                </div>

                <div className="pt-4 border-t border-border mt-4">
                    <TemplateSelector selectedTemplateId={formData.templateId || 'standard'} onSelectTemplate={(id) => setFormData(prev => ({ ...prev, templateId: id }))} themeColors={formData.themeColors} onColorsChange={(colors) => setFormData(prev => ({ ...prev, themeColors: colors }))} />
                </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-2 w-full">
                <Button variant="outline" onClick={() => setPage(1)} className="w-full sm:w-auto order-2 sm:order-1">Back</Button>
                <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:order-2 sm:ml-auto sm:justify-end">
                    <Button variant="outline" onClick={() => onSave(formData)} className="w-full sm:w-auto">Save Only</Button>
                    <Button variant="secondary" onClick={handleDownload} disabled={isDownloading} className="w-full sm:w-auto"><ExportIcon className="h-4 w-4 mr-2" /> Download</Button>
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
                    <h1 className="text-2xl font-bold flex items-center gap-2"><MaterialLogIcon className="w-6 h-6" /> Material Log</h1>
                </div>
            </header>
            {page === 1 ? renderPageOne() : renderPageTwo()}
        </div>
    );
};

export default MaterialLogForm;