import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { Label } from './ui/Label.tsx';
import { BackArrowIcon, PlusIcon, TrashIcon, TrendingUpIcon, RefreshCwIcon, CalculatorIcon } from './Icons.tsx';

interface ProfitItem {
    id: string;
    description: string;
    cost: number;
    charge: number;
}

interface ProfitCalculatorViewProps {
    onBack: () => void;
}

const ProfitCalculatorView: React.FC<ProfitCalculatorViewProps> = ({ onBack }) => {
    const [items, setItems] = useState<ProfitItem[]>([
        { id: crypto.randomUUID(), description: 'Materials', cost: 0, charge: 0 },
        { id: crypto.randomUUID(), description: 'Labor', cost: 0, charge: 0 }
    ]);

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
    };

    const totalCost = items.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    const totalCharge = items.reduce((sum, item) => sum + (Number(item.charge) || 0), 0);
    const profit = totalCharge - totalCost;
    const margin = totalCharge > 0 ? (profit / totalCharge) * 100 : 0;
    const markup = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    const getMarginColor = (m: number) => {
        if (m >= 30) return 'text-green-600 bg-green-100 dark:bg-green-900/30 border-green-200';
        if (m >= 15) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200';
        return 'text-red-600 bg-red-100 dark:bg-red-900/30 border-red-200';
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
                <Button variant="outline" onClick={reset} className="rounded-full">
                    <RefreshCwIcon className="w-4 h-4 mr-2" /> Reset
                </Button>
            </header>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Input Section */}
                <Card className="flex-1 border-gray-400 dark:border-gray-600">
                    <CardHeader>
                        <CardTitle>Line Items</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
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
                            <CardTitle className="text-lg">Financial Summary</CardTitle>
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
                            <div className="h-px bg-border my-2"></div>
                            <div className="flex justify-between items-center">
                                <span className="font-bold">Net Profit</span>
                                <span className={`font-bold text-2xl ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    ${profit.toFixed(2)}
                                </span>
                            </div>
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
        </div>
    );
};

export default ProfitCalculatorView;