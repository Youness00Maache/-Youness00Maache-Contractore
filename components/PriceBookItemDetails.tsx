import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { Input } from './ui/Input.tsx';
import { Label } from './ui/Label.tsx';
import { XCircleIcon, CheckIcon, ImageIcon, CalculatorIcon, AlertTriangleIcon, SearchIcon, PlusIcon } from './Icons.tsx';
import { SavedItem } from '../types.ts';

interface PriceBookItemDetailsProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: any) => Promise<void>;
    item?: SavedItem | null; // If valid, we are editing
    categories: string[];
    allItems: SavedItem[];
    onUploadImage?: (file: File) => Promise<string>;
    isPremium: boolean;
}

const PriceBookItemDetails: React.FC<PriceBookItemDetailsProps> = ({ isOpen, onClose, onSave, item, categories, allItems, onUploadImage, isPremium }) => {
    if (!isOpen) return null;

    const [formData, setFormData] = useState<Partial<SavedItem>>({
        name: '',
        description: '',
        rate: 0,
        unit_cost: 0,
        markup: 50, // Default 50% markup
        type: 'service',
        category: 'General',
        taxable: true,
        sku: '',
        images: []
    });

    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'general' | 'pricing' | 'components' | 'media'>('general');
    const [componentSearch, setComponentSearch] = useState('');
    const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            if (!onUploadImage) {
                alert("Upload function not provided");
                return;
            }
            setLoading(true);
            try {
                const url = await onUploadImage(e.target.files[0]);
                setFormData(prev => ({ ...prev, images: [...(prev.images || []), url] }));
            } catch (err) {
                console.error("Upload failed", err);
                alert("Failed to upload image.");
            } finally {
                setLoading(false);
            }
        }
    };

    // Duplicate Detection
    useEffect(() => {
        if (!formData.name && !formData.sku) {
            setDuplicateWarning(null);
            return;
        }
        if (!allItems) return;
        const duplicate = allItems.find(i =>
            (i.id !== item?.id) &&
            (
                (i.name && formData.name && i.name.toLowerCase() === formData.name.toLowerCase()) ||
                (formData.sku && i.sku && i.sku === formData.sku)
            )
        );
        if (duplicate) {
            setDuplicateWarning(`Warning: Similar item "${duplicate.name}" already exists.`);
        } else {
            setDuplicateWarning(null);
        }
    }, [formData.name, formData.sku, allItems, item]);

    useEffect(() => {
        if (item) {
            setFormData({
                ...item,
                unit_cost: item.unit_cost ?? item.cost ?? 0,
                markup: item.markup ?? 50,
                type: item.type ?? 'service',
                category: item.category ?? 'General',
                images: item.images ?? [],
                sku: item.sku ?? ''
            });
        } else {
            // Reset for new item
            setFormData({
                name: '',
                description: '',
                rate: 0,
                unit_cost: 0,
                markup: 50,
                type: 'service',
                category: 'General',
                taxable: true,
                sku: '',
                images: []
            });
        }
    }, [item, isOpen]);

    // Profit Calc Logic
    // If Cost changes, update Rate based on Markup? Or inverse?
    // Let's assume standard Contractor workflow: Cost + Markup = Price
    const handleCostChange = (val: number) => {
        const cost = val;
        const markup = formData.markup || 0;
        const price = cost * (1 + (markup / 100));
        setFormData(prev => ({ ...prev, unit_cost: cost, rate: parseFloat(price.toFixed(2)) }));
    };

    const handleMarkupChange = (val: number) => {
        const markup = val;
        const cost = formData.unit_cost || 0;
        const price = cost * (1 + (markup / 100));
        setFormData(prev => ({ ...prev, markup: markup, rate: parseFloat(price.toFixed(2)) }));
    };

    const handlePriceChange = (val: number) => {
        // Reverse calc markup
        const price = val;
        const cost = formData.unit_cost || 0;
        let markup = 0;
        if (cost > 0) {
            markup = ((price - cost) / cost) * 100;
        }
        setFormData(prev => ({ ...prev, rate: price, markup: parseFloat(markup.toFixed(1)) }));
    };

    const handleSave = async () => {
        if (!formData.name) return;
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Components Logic
    const handleAddComponent = (compItem: SavedItem) => {
        const currentComponents = formData.assembly_items || [];
        const exists = currentComponents.find(c => c.item_id === compItem.id && !c.is_custom);
        if (exists) {
            setFormData(prev => ({
                ...prev,
                assembly_items: currentComponents.map(c => c.item_id === compItem.id && !c.is_custom ? { ...c, quantity: c.quantity + 1 } : c)
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                assembly_items: [...currentComponents, { item_id: compItem.id, quantity: 1, override_price: null }]
            }));
        }
    };

    const handleAddCustomComponent = () => {
        setFormData(prev => ({
            ...prev,
            assembly_items: [...(prev.assembly_items || []), { item_id: crypto.randomUUID(), quantity: 1, override_price: 0, is_custom: true, custom_name: 'Custom Item' }]
        }));
    };

    const handleUpdateCustomComponent = (itemId: string, field: 'custom_name' | 'override_price', value: any) => {
        setFormData(prev => ({
            ...prev,
            assembly_items: (prev.assembly_items || []).map(c => c.item_id === itemId ? { ...c, [field]: value } : c)
        }));
    };

    const handleRemoveComponent = (itemId: string) => {
        setFormData(prev => ({
            ...prev,
            assembly_items: (prev.assembly_items || []).filter(c => c.item_id !== itemId)
        }));
    };

    const handleComponentQuantityChange = (itemId: string, qty: number) => {
        setFormData(prev => ({
            ...prev,
            assembly_items: (prev.assembly_items || []).map(c => c.item_id === itemId ? { ...c, quantity: qty } : c)
        }));
    };

    const calculateAssemblyCost = () => {
        if (!formData.assembly_items || !allItems) return 0;
        return formData.assembly_items.reduce((sum, comp) => {
            const itemDef = allItems.find(i => i.id === comp.item_id);
            if (!itemDef) return sum;
            return sum + ((itemDef.unit_cost || 0) * comp.quantity);
        }, 0);
    };

    const calculateAssemblyPriceSum = () => {
        if (!formData.assembly_items || !allItems) return 0;
        return formData.assembly_items.reduce((sum, comp) => {
            if (comp.is_custom) {
                return sum + ((comp.override_price || 0) * comp.quantity);
            }
            const itemDef = allItems.find(i => i.id === comp.item_id);
            if (!itemDef) return sum;
            return sum + ((comp.override_price ?? itemDef.rate) * comp.quantity);
        }, 0);
    };

    // Auto-update price/cost when components change
    useEffect(() => {
        if (formData.is_assembly && formData.assembly_items && formData.assembly_items.length > 0) {
            const cost = calculateAssemblyCost();
            const price = calculateAssemblyPriceSum();
            let markup = formData.markup || 0;
            if (cost > 0) {
                markup = ((price - cost) / cost) * 100;
            }
            setFormData(prev => ({
                ...prev,
                unit_cost: cost,
                rate: price,
                markup: parseFloat(markup.toFixed(1))
            }));
        }
    }, [formData.assembly_items, allItems]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden rounded-2xl border-border/60">
                <CardHeader className="border-b border-border/50 bg-gradient-to-b from-muted/30 to-transparent flex flex-row items-center justify-between py-5 px-6">
                    <CardTitle className="text-2xl font-bold">
                        {item ? 'Edit Item' : 'New Price Book Item'}
                    </CardTitle>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <XCircleIcon className="w-6 h-6" />
                    </button>
                </CardHeader>

                <div className="flex gap-1 p-1 bg-muted/30 mx-6 mt-4 rounded-xl">
                    <button onClick={() => setActiveTab('general')} className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === 'general' ? 'bg-white dark:bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>General</button>
                    {formData.is_assembly && (
                        <button onClick={() => setActiveTab('components')} className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === 'components' ? 'bg-white dark:bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>Components</button>
                    )}
                    <button onClick={() => setActiveTab('pricing')} className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === 'pricing' ? 'bg-white dark:bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>Pricing</button>
                    <button onClick={() => setActiveTab('media')} className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === 'media' ? 'bg-white dark:bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>Media</button>
                </div>

                <CardContent className="flex-1 overflow-y-auto p-6 space-y-6">

                    {activeTab === 'general' && (
                        <div className="space-y-4 animate-in slide-in-from-left-4 fade-in duration-200">
                            {duplicateWarning && (
                                <div className="bg-yellow-50 dark:bg-yellow-900/10 text-yellow-800 dark:text-yellow-200 p-3 rounded-md flex items-center gap-2 mb-4 text-sm font-medium animate-in slide-in-from-top-2 border border-yellow-200 dark:border-yellow-800">
                                    <AlertTriangleIcon className="w-4 h-4" />
                                    {duplicateWarning}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="mb-1.5">Item Name <span className="text-red-500">*</span></Label>
                                    <Input
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Faucet Installation"
                                        autoFocus={!item}
                                    />
                                </div>
                                <div>
                                    <Label className="mb-1.5">SKU / Code</Label>
                                    <Input
                                        value={formData.sku}
                                        onChange={e => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                                        placeholder="e.g. PLB-001"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="mb-1.5">Category</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            list="category-suggestions"
                                            value={formData.category}
                                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                                            placeholder="Select or Type new..."
                                        />
                                        <datalist id="category-suggestions">
                                            {categories.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                    </div>
                                </div>
                                <div>
                                    <Label className="mb-1.5">Type</Label>
                                    <select
                                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                                    >
                                        <option value="service" className="text-blue-600 font-medium">Service • 🛠️</option>
                                        <option value="material" className="text-green-600 font-medium">Material • 📦</option>
                                        <option value="labor" className="text-orange-600 font-medium">Labor • 👷</option>
                                        <option value="bundle" className="text-purple-600 font-medium">Bundle • 📦+🛠️</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <Label className="mb-1.5">Description</Label>
                                <textarea
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Detailed description for proposals..."
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="taxable"
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    checked={formData.taxable}
                                    onChange={e => setFormData({ ...formData, taxable: e.target.checked })}
                                />
                                <Label htmlFor="taxable" className="mb-0 cursor-pointer">Taxable Item</Label>
                            </div>
                        </div>
                    )}

                    {activeTab === 'components' && formData.is_assembly && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-200">
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-100 dark:border-purple-800">
                                <h3 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">Kit Components</h3>
                                <p className="text-purple-700 dark:text-purple-300 text-sm">Add items to build this assembly. The total cost and price will be calculated automatically.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[300px]">
                                {/* Component Search/Select */}
                                <div className="border border-border rounded-lg flex flex-col overflow-hidden">
                                    <div className="p-3 border-b bg-muted/30">
                                        <div className="relative">
                                            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search catalog..."
                                                className="pl-9 bg-white"
                                                value={componentSearch}
                                                onChange={e => setComponentSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-muted/10">
                                        {(allItems || []).filter(i => i.id !== formData.id && !i.is_assembly && i.name.toLowerCase().includes(componentSearch.toLowerCase())).slice(0, 20).map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
                                                <div className="min-w-0 pr-2">
                                                    <div className="text-sm font-medium truncate">{item.name}</div>
                                                    <div className="text-xs text-muted-foreground">${item.rate.toFixed(2)}</div>
                                                </div>
                                                <Button size="sm" variant="secondary" className="h-7 px-2 shrink-0" onClick={() => handleAddComponent(item)}>
                                                    <PlusIcon className="h-3 w-3 mr-1" /> Add
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Selected Components */}
                                <div className="border border-border rounded-lg flex flex-col overflow-hidden bg-white dark:bg-card">
                                    <div className="p-3 border-b bg-muted/30 font-semibold text-sm flex justify-between items-center">
                                        <span>Included Items ({(formData.assembly_items || []).length})</span>
                                        <Button variant="outline" size="sm" onClick={handleAddCustomComponent} className="h-7 text-xs">
                                            <PlusIcon className="w-3 h-3 mr-1" /> Custom Item
                                        </Button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                        {!(formData.assembly_items?.length) && (
                                            <div className="h-full flex items-center justify-center text-sm text-muted-foreground italic">
                                                No items added yet.
                                            </div>
                                        )}
                                        {(formData.assembly_items || []).map(comp => {
                                            const itemDef = (allItems || []).find(i => i.id === comp.item_id);
                                            return (
                                                <div key={comp.item_id} className="flex items-start justify-between p-2 border rounded-md bg-muted/10">
                                                    <div className="min-w-0 flex-1 pr-3">
                                                        {comp.is_custom ? (
                                                            <div className="space-y-1 mb-1">
                                                                <Input
                                                                    value={comp.custom_name || ''}
                                                                    onChange={e => handleUpdateCustomComponent(comp.item_id, 'custom_name', e.target.value)}
                                                                    className="h-7 text-sm px-2 font-medium bg-white"
                                                                    placeholder="Custom item name"
                                                                />
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs text-muted-foreground mr-1">Price/ea: $</span>
                                                                    <Input
                                                                        type="number"
                                                                        value={comp.override_price || 0}
                                                                        onChange={e => handleUpdateCustomComponent(comp.item_id, 'override_price', parseFloat(e.target.value) || 0)}
                                                                        className="h-7 w-20 text-xs px-2 bg-white"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <p className="text-sm font-medium truncate">{itemDef?.name || 'Unknown Item'}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    Unit Cost: ${itemDef?.unit_cost?.toFixed(2) || '0.00'} | Retail: ${itemDef?.rate.toFixed(2) || '0.00'}
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-20">
                                                            <Input
                                                                type="number"
                                                                min="1"
                                                                value={comp.quantity}
                                                                onChange={e => handleComponentQuantityChange(comp.item_id, parseInt(e.target.value) || 1)}
                                                                className="h-8 text-center text-sm"
                                                            />
                                                        </div>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveComponent(comp.item_id)}>
                                                            <XCircleIcon className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center py-4 border-t border-dashed bg-muted/10 px-4 rounded-lg">
                                <div className="text-sm font-medium">Calculated Kit Cost:</div>
                                <div className="text-lg font-bold text-primary">${calculateAssemblyCost().toFixed(2)}</div>
                            </div>
                            <div className="flex justify-between items-center py-1 px-4">
                                <div className="text-xs text-muted-foreground">Sum of Retail Prices:</div>
                                <div className="text-sm font-medium text-muted-foreground">${calculateAssemblyPriceSum().toFixed(2)}</div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-200">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 flex gap-4 items-start">
                                <CalculatorIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                                <div className="text-sm">
                                    <p className="font-semibold text-blue-900 dark:text-blue-100">Smart Pricing</p>
                                    <p className="text-blue-700 dark:text-blue-300">Enter your cost and desired markup to automatically calculate the client price. Or set the price directly.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <Label className="mb-1.5 text-muted-foreground">Unit Cost ($)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.unit_cost}
                                        onChange={e => handleCostChange(parseFloat(e.target.value) || 0)}
                                        className="font-mono"
                                        disabled={formData.is_assembly}
                                    />
                                </div>
                                <div className="relative">
                                    <Label className="mb-1.5 text-muted-foreground">Markup (%)</Label>
                                    <Input
                                        type="number"
                                        value={formData.markup}
                                        onChange={e => handleMarkupChange(parseFloat(e.target.value) || 0)}
                                        className="font-mono pr-8 text-blue-600 font-semibold"
                                        disabled={formData.is_assembly}
                                    />
                                    <span className="absolute right-3 top-8 text-muted-foreground text-sm">%</span>
                                </div>
                                <div>
                                    <Label className="mb-1.5 font-bold text-foreground">Client Price ($)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.rate}
                                        onChange={e => handlePriceChange(parseFloat(e.target.value) || 0)}
                                        className="font-mono text-lg font-bold bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 focus:ring-green-500"
                                        disabled={formData.is_assembly}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-between items-center py-4 border-t border-dashed">
                                <div className="text-sm text-muted-foreground">
                                    Profit per unit:
                                </div>
                                <div className="text-xl font-bold text-green-600 dark:text-green-400">
                                    ${((formData.rate || 0) - (formData.unit_cost || 0)).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'media' && (
                        <div className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-200">
                            <div className={`border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors bg-muted/10 ${!isPremium ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'}`}>
                                <ImageIcon className="w-10 h-10 text-muted-foreground mb-3 opacity-50" />
                                <p className="font-medium">Upload Image</p>
                                {!isPremium ? (
                                    <div className="mt-2">
                                        <p className="text-xs text-amber-600 font-semibold mb-2">My Premium Feature 👑</p>
                                        <Button variant="outline" size="sm" disabled className="opacity-50">Choose File</Button>
                                        <p className="text-[10px] text-muted-foreground mt-2">Upgrade to upload images</p>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-xs text-muted-foreground mt-1">Drag & drop or click to select</p>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            ref={fileInputRef}
                                            onChange={handleImageUpload}
                                        />
                                        <Button variant="outline" size="sm" className="mt-4" onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }} disabled={loading}>
                                            {loading ? 'Uploading...' : 'Choose File'}
                                        </Button>
                                    </>
                                )}
                            </div>

                            {/* Placeholder for images list */}
                            {formData.images && formData.images.length > 0 && (
                                <div className="grid grid-cols-4 gap-2">
                                    {formData.images.map((img, i) => (
                                        <div key={i} className="aspect-square bg-muted rounded-md relative overflow-hidden group">
                                            <img src={img} className="w-full h-full object-cover" />
                                            <button className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <XCircleIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="text-xs text-muted-foreground flex gap-2 items-center p-2 bg-yellow-50 dark:bg-yellow-900/10 text-yellow-800 dark:text-yellow-200 rounded">
                                <AlertTriangleIcon className="w-4 h-4" />
                                <span>Images help generic items be easily identified by your team in the field.</span>
                            </div>
                        </div>
                    )}

                </CardContent>
                <CardFooter className="border-t bg-muted/30 py-4 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={loading || !formData.name} className="min-w-[120px]">
                        {loading ? 'Saving...' : (
                            <>
                                <CheckIcon className="w-4 h-4 mr-2" />
                                Save Item
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};

export default PriceBookItemDetails;
