import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { Input } from './ui/Input.tsx';
import { Label } from './ui/Label.tsx';
import { XCircleIcon, CheckIcon, ImageIcon, CalculatorIcon, AlertTriangleIcon, PlusIcon } from './Icons.tsx';
import { SavedItem } from '../types.ts';

interface PriceBookItemDetailsProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: any) => Promise<void>;
    item?: SavedItem | null; // If valid, we are editing
    categories: string[];
    savedItems?: SavedItem[];
}

const PriceBookItemDetails: React.FC<PriceBookItemDetailsProps> = ({ isOpen, onClose, onSave, item, categories, savedItems = [] }) => {
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
    const [activeTab, setActiveTab] = useState<'general' | 'pricing' | 'media' | 'components'>('general');
    const [componentSearch, setComponentSearch] = useState('');
    const [customComponentForm, setCustomComponentForm] = useState({ name: '', cost: 0, rate: 0, quantity: 1, show: false });

    const handleAddCustomComponent = () => {
        if (!customComponentForm.name) return;

        // Generate a random valid UUID for Postgres bypassing (Standard UUID v4)
        const customId = crypto.randomUUID();

        setFormData(prev => ({
            ...prev,
            assembly_items: [...(prev.assembly_items || []), {
                item_id: customId,
                quantity: customComponentForm.quantity || 1,
                is_custom: true,
                custom_name: customComponentForm.name,
                custom_cost: customComponentForm.cost,
                custom_rate: customComponentForm.rate
            }]
        }));
        setCustomComponentForm({ name: '', cost: 0, rate: 0, quantity: 1, show: false });
    };

    useEffect(() => {
        if (item) {
            setFormData({
                ...item,
                unit_cost: item.unit_cost ?? item.cost ?? 0,
                markup: item.markup ?? 50,
                type: item.type ?? 'service',
                category: item.category ?? 'General',
                images: item.images ?? [],
                sku: item.sku ?? '',
                is_assembly: item.is_assembly ?? false,
                assembly_items: item.assembly_items ?? []
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
                images: [],
                is_assembly: item?.is_assembly ?? false,
                assembly_items: []
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

    const handleAddComponent = (compItem: SavedItem) => {
        setFormData(prev => {
            const currentComponents = prev.assembly_items || [];
            const existing = currentComponents.find(c => c.item_id === compItem.id);
            if (existing) {
                return {
                    ...prev,
                    assembly_items: currentComponents.map(c =>
                        c.item_id === compItem.id ? { ...c, quantity: c.quantity + 1 } : c
                    )
                };
            } else {
                return {
                    ...prev,
                    assembly_items: [...currentComponents, { item_id: compItem.id, quantity: 1, override_price: null }]
                };
            }
        });
        setComponentSearch('');
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
            assembly_items: (prev.assembly_items || []).map(c =>
                c.item_id === itemId ? { ...c, quantity: qty } : c
            )
        }));
    };

    const calculateAssemblyCost = () => {
        if (!formData.assembly_items) return 0;
        return formData.assembly_items.reduce((acc, comp) => {
            if (comp.is_custom) {
                return acc + ((comp.custom_cost || 0) * comp.quantity);
            }
            const itemDef = savedItems.find(i => i.id === comp.item_id);
            if (itemDef) {
                return acc + ((itemDef.unit_cost || 0) * comp.quantity);
            }
            return acc;
        }, 0);
    };

    const calculateAssemblyPriceSum = () => {
        if (!formData.assembly_items) return 0;
        return formData.assembly_items.reduce((acc, comp) => {
            if (comp.is_custom) {
                return acc + ((comp.custom_rate || 0) * comp.quantity);
            }
            const itemDef = savedItems.find(i => i.id === comp.item_id);
            if (itemDef) {
                return acc + ((itemDef.rate || 0) * comp.quantity);
            }
            return acc;
        }, 0);
    };

    useEffect(() => {
        if (formData.is_assembly) {
            const newCost = calculateAssemblyCost();
            if (newCost !== formData.unit_cost) {
                setFormData(prev => ({ ...prev, unit_cost: newCost }));
            }
        }
    }, [formData.assembly_items, savedItems]);

    const filteredComponentSearch = savedItems.filter(i =>
        i.name.toLowerCase().includes(componentSearch.toLowerCase()) &&
        i.id !== formData.id // don't add self
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden rounded-2xl border-border/60">
                <CardHeader className="border-b border-border/50 bg-gradient-to-b from-muted/30 to-transparent flex flex-row items-center justify-between py-5 px-6">
                    <CardTitle className="text-2xl font-bold flex items-center gap-2">
                        {formData.is_assembly && <AlertTriangleIcon className="w-6 h-6 text-primary" />}
                        {item ? 'Edit Item' : (formData.is_assembly ? 'New Assembly/Kit' : 'New Price Book Item')}
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
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="mb-1.5">Item Name <span className="text-red-500">*</span></Label>
                                    <Input
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Faucet Installation"
                                        autoFocus={!item}
                                        className="h-11"
                                    />
                                </div>
                                <div>
                                    <Label className="mb-1.5">SKU / Code</Label>
                                    <Input
                                        value={formData.sku}
                                        onChange={e => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                                        placeholder="e.g. PLB-001"
                                        className="h-11 font-mono"
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
                                            className="h-11"
                                        />
                                        <datalist id="category-suggestions">
                                            {categories.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                    </div>
                                </div>
                                <div>
                                    <Label className="mb-1.5">Type</Label>
                                    <select
                                        className="w-full h-11 rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-medium"
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
                                    className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
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
                            <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-200/50 flex gap-4 items-start shadow-sm">
                                <div className="text-sm text-amber-900 dark:text-amber-200">
                                    <p className="font-bold mb-1">Kit Components</p>
                                    <p className="text-xs">Search and add items to build this assembly. The total unit cost will automatically sum the component costs.</p>
                                </div>
                            </div>

                            <div>
                                <Label className="mb-1.5">Add Component</Label>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Search existing price book items..."
                                        value={componentSearch}
                                        onChange={e => setComponentSearch(e.target.value)}
                                        className="h-11 flex-1"
                                    />
                                    <Button variant="outline" className="h-11 border-dashed text-primary" onClick={() => setCustomComponentForm(prev => ({ ...prev, show: !prev.show }))}>
                                        <PlusIcon className="w-4 h-4 mr-1" /> Custom Item
                                    </Button>
                                </div>
                                {componentSearch && filteredComponentSearch.length > 0 && (
                                    <div className="mt-2 border border-border rounded-lg max-h-40 overflow-y-auto bg-background shadow-md">
                                        {filteredComponentSearch.map(comp => (
                                            <div
                                                key={comp.id}
                                                className="px-3 py-2 border-b last:border-0 hover:bg-muted cursor-pointer flex justify-between items-center"
                                                onClick={() => handleAddComponent(comp)}
                                            >
                                                <div>
                                                    <p className="font-medium text-sm">{comp.name}</p>
                                                    <p className="text-xs text-muted-foreground">{comp.sku || 'No SKU'} - Cost: ${comp.unit_cost?.toFixed(2) || '0.00'}</p>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-8">Add</Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {customComponentForm.show && (
                                <div className="p-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 space-y-4 animate-in slide-in-from-top-2">
                                    <div>
                                        <Label className="text-xs text-primary mb-1">Custom Component Name *</Label>
                                        <Input
                                            value={customComponentForm.name}
                                            onChange={e => setCustomComponentForm(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="e.g. Unique Wall Bracket"
                                            className="h-9 bg-white"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <Label className="text-xs text-primary mb-1">Unit Cost ($)</Label>
                                            <Input
                                                type="number" min="0" step="0.01"
                                                value={customComponentForm.cost || ''}
                                                onChange={e => setCustomComponentForm(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                                                className="h-9 bg-white font-mono text-sm"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs text-primary mb-1">Retail Price ($)</Label>
                                            <Input
                                                type="number" min="0" step="0.01"
                                                value={customComponentForm.rate || ''}
                                                onChange={e => setCustomComponentForm(prev => ({ ...prev, rate: parseFloat(e.target.value) || 0 }))}
                                                className="h-9 bg-white font-mono text-sm"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs text-primary mb-1">Qty</Label>
                                            <Input
                                                type="number" min="1"
                                                value={customComponentForm.quantity}
                                                onChange={e => setCustomComponentForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 1 }))}
                                                className="h-9 bg-white text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-1 border-t border-primary/20">
                                        <Button size="sm" variant="ghost" onClick={() => setCustomComponentForm(prev => ({ ...prev, show: false, name: '' }))}>Cancel</Button>
                                        <Button size="sm" onClick={handleAddCustomComponent} disabled={!customComponentForm.name}>Add Custom Item</Button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <Label>Included Components</Label>
                                {(!formData.assembly_items || formData.assembly_items.length === 0) ? (
                                    <div className="text-center py-8 bg-muted/20 border-2 border-dashed border-border rounded-xl text-muted-foreground text-sm">
                                        No components added yet.
                                    </div>
                                ) : (
                                    <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                                        {formData.assembly_items.map((comp, idx) => {
                                            const itemDef = savedItems.find(i => i.id === comp.item_id);
                                            const isCustom = comp.is_custom;
                                            const displayName = isCustom ? comp.custom_name : (itemDef?.name || 'Unknown Item');
                                            const unitCost = isCustom ? (comp.custom_cost || 0) : (itemDef?.unit_cost || 0);
                                            const retailPrice = isCustom ? (comp.custom_rate || 0) : (itemDef?.rate || 0);

                                            return (
                                                <div key={`${comp.item_id}-${idx}`} className="flex items-center gap-3 p-3 bg-card hover:bg-muted/30 transition-colors">
                                                    <div className="flex-1">
                                                        <p className="font-semibold text-sm flex items-center gap-2">
                                                            {displayName}
                                                            {isCustom && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Custom</span>}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            Unit Cost: ${unitCost.toFixed(2)} | Retail: ${retailPrice.toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-20">
                                                            <Input
                                                                type="number"
                                                                min="1"
                                                                value={comp.quantity}
                                                                onChange={e => handleComponentQuantityChange(comp.item_id, parseFloat(e.target.value) || 1)}
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
                                )}
                            </div>

                            <div className="flex justify-between items-center py-4 border-t border-dashed bg-muted/10 px-4 rounded-xl">
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
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 p-5 rounded-xl border border-blue-200/50 dark:border-blue-700/50 flex gap-4 items-start shadow-sm">
                                <div className="p-2 bg-blue-500/10 rounded-lg">
                                    <CalculatorIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="text-sm">
                                    <p className="font-bold text-blue-900 dark:text-blue-100 mb-1">Smart Pricing Calculator</p>
                                    <p className="text-blue-700 dark:text-blue-300 text-xs">Enter your cost and desired markup to automatically calculate the client price. Or set the price directly.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <Label className="mb-1.5 text-muted-foreground text-xs uppercase font-bold tracking-wider">Unit Cost ($) {formData.is_assembly && <span className="text-primary normal-case font-normal">(Auto-summed)</span>}</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.unit_cost}
                                        onChange={e => handleCostChange(parseFloat(e.target.value) || 0)}
                                        className="font-mono h-12 text-base"
                                        disabled={formData.is_assembly}
                                    />
                                </div>
                                <div className="relative">
                                    <Label className="mb-1.5 text-muted-foreground text-xs uppercase font-bold tracking-wider">Markup (%)</Label>
                                    <Input
                                        type="number"
                                        value={formData.markup}
                                        onChange={e => handleMarkupChange(parseFloat(e.target.value) || 0)}
                                        className="font-mono pr-8 text-blue-600 font-bold h-12 text-base"
                                    />
                                    <span className="absolute right-3 top-10 text-muted-foreground text-sm font-bold">%</span>
                                </div>
                                <div>
                                    <Label className="mb-1.5 font-extrabold text-foreground text-xs uppercase tracking-wider">Client Price ($)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.rate}
                                        onChange={e => handlePriceChange(parseFloat(e.target.value) || 0)}
                                        className="font-mono text-lg font-extrabold bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10 border-green-300 dark:border-green-700 focus:ring-green-500 h-12"
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
                            <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-muted/50 transition-colors cursor-pointer bg-muted/10">
                                <ImageIcon className="w-10 h-10 text-muted-foreground mb-3 opacity-50" />
                                <p className="font-medium">Upload Image</p>
                                <p className="text-xs text-muted-foreground mt-1">Drag & drop or click to select</p>
                                <input type="file" className="hidden" accept="image/*" />
                                <Button variant="outline" size="sm" className="mt-4" onClick={(e) => { e.preventDefault(); alert("Image upload coming soon!"); }}>Choose File</Button>
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
                <CardFooter className="border-t border-border/50 bg-gradient-to-t from-muted/20 to-transparent py-5 px-6 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose} className="px-6">Cancel</Button>
                    <Button onClick={handleSave} disabled={loading || !formData.name} className="min-w-[140px] bg-gradient-to-r from-primary to-primary/90 hover:shadow-lg px-6">
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
