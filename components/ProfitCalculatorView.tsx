import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { Label } from './ui/Label.tsx';
import { BackArrowIcon, PlusIcon, TrashIcon, RefreshCwIcon, CalculatorIcon, DownloadIcon, SaveIcon, FolderIcon, MoreVerticalIcon, SettingsIcon, CheckIcon, XCircleIcon, TrendingUpIcon } from './Icons.tsx';
import { generateDocumentBase64 } from '../services/pdfGenerator.ts';
import { UserProfile, FormType } from '../types';

interface ProfitItem {
    id: string;
    description: string;
    cost: number;
    charge: number;
}

interface SavedCalculation {
    id: string;
    name: string;
    date: string;
    items: ProfitItem[];
    vatRate: number;
    vatEnabled: boolean;
    margin: number;
}

interface ProfitCalculatorViewProps {
    onBack: () => void;
    profile?: UserProfile;
}

const ProfitCalculatorView: React.FC<ProfitCalculatorViewProps> = ({ onBack, profile }) => {
    // Basic State
    const [items, setItems] = useState<ProfitItem[]>([
        { id: crypto.randomUUID(), description: 'Materials', cost: 0, charge: 0 },
        { id: crypto.randomUUID(), description: 'Labor', cost: 0, charge: 0 }
    ]);

    // Advanced State
    const [isAdvanced, setIsAdvanced] = useState(false);
    const [vatEnabled, setVatEnabled] = useState(false);
    const [vatRate, setVatRate] = useState(20);

    // Target Margin State
    const [targetMarginMode, setTargetMarginMode] = useState(false);
    const [targetMargin, setTargetMargin] = useState(30);

    // Saving State
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [calcName, setCalcName] = useState('');
    const [savedCalcs, setSavedCalcs] = useState<SavedCalculation[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem('profit_calcs');
        if (saved) {
            try {
                setSavedCalcs(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load saved calculations", e);
            }
        }
    }, []);

    const addItem = () => {
        setItems([...items, { id: crypto.randomUUID(), description: '', cost: 0, charge: 0 }]);
    };

    const updateItem = (id: string, field: keyof ProfitItem, value: string | number) => {
        setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };

    const reset = () => {
        setItems([
            { id: crypto.randomUUID(), description: 'Materials', cost: 0, charge: 0 },
            { id: crypto.randomUUID(), description: 'Labor', cost: 0, charge: 0 }
        ]);
        setTargetMarginMode(false);
    };

    // Calculations
    const totalCost = items.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    const totalCharge = items.reduce((sum, item) => sum + (Number(item.charge) || 0), 0);
    const profit = totalCharge - totalCost;
    const margin = totalCharge > 0 ? (profit / totalCharge) * 100 : 0;
    const markup = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    const taxAmount = vatEnabled ? totalCharge * (vatRate / 100) : 0;
    const totalWithTax = totalCharge + taxAmount;

    const getMarginColor = (m: number) => {
        if (m >= 30) return 'text-green-600 bg-green-100 dark:bg-green-900/30 border-green-200';
        if (m >= 15) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200';
        return 'text-red-600 bg-red-100 dark:bg-red-900/30 border-red-200';
    };

    // Advanced Handlers
    const calculateTargetPrice = () => {
        if (!targetMargin || targetMargin >= 100) return;

        const multiplier = 1 / (1 - (targetMargin / 100));

        setItems(prev => prev.map(item => ({
            ...item,
            charge: Number((item.cost * multiplier).toFixed(2))
        })));
    };

    const handleSave = () => {
        if (!calcName) return;
        const newCalc: SavedCalculation = {
            id: crypto.randomUUID(),
            name: calcName,
            date: new Date().toISOString(),
            items,
            vatRate,
            vatEnabled,
            margin
        };
        const updated = [newCalc, ...savedCalcs];
        setSavedCalcs(updated);
        localStorage.setItem('profit_calcs', JSON.stringify(updated));
        setShowSaveModal(false);
        setCalcName('');
    };

    const handleLoad = (calc: SavedCalculation) => {
        setItems(calc.items);
        setVatEnabled(calc.vatEnabled);
        setVatRate(calc.vatRate);
        setShowLoadModal(false);
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = savedCalcs.filter(c => c.id !== id);
        setSavedCalcs(updated);
        localStorage.setItem('profit_calcs', JSON.stringify(updated));
    };

    const handleExportPdf = async () => {
        if (!profile) return alert('Profile not loaded');

        const profitReportData = {
            title: calcName || 'Profit & Margin Report',
            reportNumber: `RPT-${Math.floor(Math.random() * 10000)}`,
            date: new Date().toLocaleDateString(),

            items: items.map(item => ({
                id: item.id,
                description: item.description || 'Item',
                cost: item.cost,
                charge: item.charge
            })),

            vatEnabled,
            vatRate,

            totalCost,
            totalRevenue: totalCharge,
            grossProfit: profit,
            margin,
            markup,
            taxAmount,
            totalWithTax,

            notes: `Generated from Profit Calculator. \nTotal Cost: $${totalCost.toFixed(2)} | Revenue: $${totalCharge.toFixed(2)} | Profit: $${profit.toFixed(2)}`
        };

        const fakeJob = {
            id: 'temp',
            name: calcName || 'Profit Calc',
            clientName: 'Internal',
            address: '',
            status: 'active',
            startDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            clientId: 'temp',
            userId: profile.id
        };

        try {
            const base64 = await generateDocumentBase64(FormType.ProfitReport, profitReportData, profile, fakeJob as any);
            if (base64) {
                const link = document.createElement('a');
                link.href = base64; // generateProfitReportPDF returns datauristring directly
                link.download = `Profit-Calc-${new Date().toISOString().split('T')[0]}.pdf`;
                link.click();
            }
        } catch (e) {
            console.error(e);
            alert('Failed to generate PDF');
        }
    };

    return (
        <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8 pb-24">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div className="flex items-center">
                    <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                        <BackArrowIcon className="h-9 w-9" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                            <CalculatorIcon className="w-8 h-8 text-primary" /> Profit Calculator
                        </h1>
                        <p className="text-sm text-muted-foreground">Quickly estimate job profitability.</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant={isAdvanced ? "default" : "outline"}
                        onClick={() => setIsAdvanced(!isAdvanced)}
                        className={`rounded-full transition-all ${isAdvanced ? 'bg-primary text-primary-foreground' : ''}`}
                    >
                        <SettingsIcon className="w-4 h-4 mr-2" /> {isAdvanced ? 'Advanced Mode' : 'Simple Mode'}
                    </Button>

                    <Button variant="outline" onClick={() => setShowLoadModal(true)} className="rounded-full hidden sm:flex">
                        <FolderIcon className="w-4 h-4 mr-2" /> Load
                    </Button>
                    <Button variant="outline" onClick={() => setShowSaveModal(true)} className="rounded-full hidden sm:flex">
                        <SaveIcon className="w-4 h-4 mr-2" /> Save
                    </Button>
                    <Button variant="outline" onClick={handleExportPdf} className="rounded-full text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 hidden sm:flex">
                        <DownloadIcon className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <Button variant="outline" onClick={reset} className="rounded-full">
                        <RefreshCwIcon className="w-4 h-4 mr-2" /> Reset
                    </Button>
                </div>
            </header>

            {/* Advanced Toolbar (Mobile or extra features) */}
            {isAdvanced && (
                <div className="mb-6 p-4 rounded-xl bg-card border border-primary/20 shadow-sm animate-in slide-in-from-top-2">
                    <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                        {/* Target Profit Section */}
                        <div className="flex flex-wrap items-end gap-3 flex-1">
                            <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                                <Label className="text-xs font-bold uppercase text-primary">Target Margin Mode</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        value={targetMargin}
                                        onChange={e => setTargetMargin(Number(e.target.value))}
                                        className="w-24 bg-background"
                                        min="0" max="99"
                                    />
                                    <span className="font-bold text-muted-foreground">%</span>
                                </div>
                            </div>
                            <Button onClick={calculateTargetPrice} disabled={totalCost === 0} className="bg-primary hover:bg-primary/90 text-white shadow-md">
                                <TrendingUpIcon className="w-4 h-4 mr-2" /> Calculate Pricing
                            </Button>
                            <p className="text-xs text-muted-foreground max-w-xs leading-tight">
                                Automatically sets prices to achieve {targetMargin}% margin based on your costs.
                            </p>
                        </div>

                        {/* VAT Section */}
                        <div className="flex flex-col gap-2 border-l pl-6 border-border w-full md:w-auto">
                            <div className="flex items-center justify-between gap-4">
                                <Label className="text-sm font-medium">Tx / VAT</Label>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setVatEnabled(!vatEnabled)}
                                        className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${vatEnabled ? 'bg-primary' : 'bg-input'}`}
                                    >
                                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${vatEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            </div>
                            {vatEnabled && (
                                <div className="flex items-center gap-2 animate-in fade-in">
                                    <Input
                                        type="number"
                                        value={vatRate}
                                        onChange={e => setVatRate(Number(e.target.value))}
                                        className="w-16 h-8 text-sm"
                                    />
                                    <span className="text-sm">%</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-8 flex-1">
                {/* Input Section */}
                <Card className="flex-1 border-gray-400 dark:border-gray-600 flex flex-col">
                    <CardHeader>
                        <CardTitle>Line Items</CardTitle>
                        <CardDescription>Enter your costs {isAdvanced ? 'and let us calculate the price, or enter manually' : 'and charges'}.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1 overflow-y-auto">
                        <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground px-1">
                            <div className="col-span-5">Description</div>
                            <div className="col-span-3">Your Cost</div>
                            <div className="col-span-3">Client Charge</div>
                            <div className="col-span-1"></div>
                        </div>

                        {items.map((item) => (
                            <div key={item.id} className="grid grid-cols-12 gap-2 items-center animate-in slide-in-from-left-1">
                                <div className="col-span-5">
                                    <Input
                                        value={item.description}
                                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                                        placeholder="Item name"
                                    />
                                </div>
                                <div className="col-span-3">
                                    <Input
                                        type="number"
                                        value={item.cost || ''}
                                        onChange={(e) => updateItem(item.id, 'cost', parseFloat(e.target.value))}
                                        className="bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/30 text-red-700 dark:text-red-400"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="col-span-3">
                                    <Input
                                        type="number"
                                        value={item.charge || ''}
                                        onChange={(e) => updateItem(item.id, 'charge', parseFloat(e.target.value))}
                                        className="bg-green-50/50 dark:bg-green-950/10 border-green-100 dark:border-green-900/30 text-green-700 dark:text-green-400"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="col-span-1 flex justify-center">
                                    <Button variant="ghost" size="sm" onClick={() => removeItem(item.id)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                                        <TrashIcon className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}

                        <Button variant="outline" onClick={addItem} className="w-full mt-2 border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-primary">
                            <PlusIcon className="w-4 h-4 mr-2" /> Add Item
                        </Button>
                    </CardContent>
                </Card>

                {/* Summary Section */}
                <div className="lg:w-96 space-y-6">
                    <Card className={`border-2 ${getMarginColor(margin)} bg-card shadow-lg`}>
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-lg">Financial Summary</CardTitle>
                                {isAdvanced && vatEnabled && <span className="text-xs bg-muted px-2 py-1 rounded">Tax Included</span>}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Total Revenue</span>
                                <span className="font-bold text-lg">${totalCharge.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Total Cost</span>
                                <span className="font-bold text-lg text-red-500">-${totalCost.toFixed(2)}</span>
                            </div>

                            {isAdvanced && vatEnabled && (
                                <div className="flex justify-between items-center text-sm animate-in fade-in">
                                    <span className="text-muted-foreground">Tax ({vatRate}%)</span>
                                    <span className="font-medium text-amber-600">+${taxAmount.toFixed(2)}</span>
                                </div>
                            )}

                            <div className="h-px bg-border my-2"></div>

                            {isAdvanced && vatEnabled ? (
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold">Net Profit</span>
                                        <span className={`font-bold text-xl ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ${profit.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center bg-secondary/30 p-2 rounded mt-2">
                                        <span className="font-bold text-sm">Total w/ Tax</span>
                                        <span className="font-bold text-xl">${totalWithTax.toFixed(2)}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex justify-between items-center">
                                    <span className="font-bold">Net Profit</span>
                                    <span className={`font-bold text-2xl ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        ${profit.toFixed(2)}
                                    </span>
                                </div>
                            )}

                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-4">
                        <Card className="bg-card">
                            <CardContent className="pt-6 text-center">
                                <div className="text-3xl font-bold mb-1">{margin.toFixed(1)}%</div>
                                <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Gross Margin</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-card">
                            <CardContent className="pt-6 text-center">
                                <div className="text-3xl font-bold mb-1 text-blue-600">{markup.toFixed(1)}%</div>
                                <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Markup</div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-800 dark:text-blue-200 border border-blue-100 dark:border-blue-800">
                        <p className="font-bold mb-1">💡 Margin vs Markup</p>
                        <p><strong>Margin</strong> is the percentage of revenue that is profit.</p>
                        <p className="mt-1"><strong>Markup</strong> is the percentage added to cost to get the selling price.</p>
                    </div>
                </div>
            </div>

            {/* Save Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowSaveModal(false)}>
                    <Card className="w-full max-w-sm animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <CardHeader>
                            <CardTitle>Save Calculation</CardTitle>
                            <CardDescription>Save this for later reference.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Input
                                value={calcName}
                                onChange={e => setCalcName(e.target.value)}
                                placeholder="Calculation Name (e.g. Kitchen Reno)"
                                autoFocus
                            />
                        </CardContent>
                        <CardFooter className="justify-end gap-2">
                            <Button variant="ghost" onClick={() => setShowSaveModal(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={!calcName}>Save</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            {/* Load Modal */}
            {showLoadModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowLoadModal(false)}>
                    <Card className="w-full max-w-md animate-in zoom-in-95 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <CardHeader className="border-b pb-3">
                            <CardTitle>Saved Calculations</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 overflow-y-auto flex-1">
                            {savedCalcs.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">No saved calculations yet.</div>
                            ) : (
                                <div className="divide-y">
                                    {savedCalcs.map(calc => (
                                        <div key={calc.id} className="p-4 hover:bg-muted/50 transition-colors flex justify-between items-center cursor-pointer" onClick={() => handleLoad(calc)}>
                                            <div>
                                                <p className="font-bold">{calc.name}</p>
                                                <p className="text-xs text-muted-foreground">{new Date(calc.date).toLocaleDateString()} • {calc.margin.toFixed(0)}% Margin</p>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={(e) => handleDelete(calc.id, e)} className="text-destructive hover:bg-destructive/10">
                                                <TrashIcon className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="justify-end pt-3 border-t">
                            <Button variant="ghost" onClick={() => setShowLoadModal(false)}>Close</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default ProfitCalculatorView;