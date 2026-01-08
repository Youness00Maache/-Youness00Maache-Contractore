
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { Label } from './ui/Label.tsx';
import { BackArrowIcon, PlusIcon, TrashIcon, BoxIcon, SearchIcon, AlertTriangleIcon } from './Icons.tsx';
import { InventoryItem } from '../types.ts';

interface InventoryViewProps {
    onBack: () => void;
    inventory: InventoryItem[];
    onUpdateItem: (item: InventoryItem) => Promise<void>;
    onAddItem: (item: Omit<InventoryItem, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
    onDeleteItem: (id: string) => Promise<void>;
}

const InventoryView: React.FC<InventoryViewProps> = ({ onBack, inventory, onUpdateItem, onAddItem, onDeleteItem }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', quantity: 0, low_stock_threshold: 5 });
    const [loading, setLoading] = useState(false);

    const filteredInventory = inventory.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));

    const handleAddItem = async () => {
        if (!newItem.name) return;
        setLoading(true);
        await onAddItem(newItem);
        setNewItem({ name: '', quantity: 0, low_stock_threshold: 5 });
        setShowAddModal(false);
        setLoading(false);
    };

    const adjustQuantity = async (item: InventoryItem, amount: number) => {
        const newQty = Math.max(0, item.quantity + amount);
        await onUpdateItem({ ...item, quantity: newQty });
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
                            <BoxIcon className="w-8 h-8 text-primary" /> Inventory Tracker
                        </h1>
                    </div>
                </div>
                <Button onClick={() => setShowAddModal(true)} className="rounded-full shadow-md shadow-primary/20">
                    <PlusIcon className="w-4 h-4 mr-2" /> Add Item
                </Button>
            </header>

            <div className="relative mb-6 max-w-md">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input 
                    placeholder="Search stock..." 
                    className="pl-10 h-11 rounded-full bg-card border-border shadow-sm focus:ring-2 focus:ring-primary/20" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredInventory.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-muted/10 rounded-xl border border-dashed border-border">
                        <p className="text-muted-foreground">No inventory items found.</p>
                    </div>
                ) : (
                    filteredInventory.map(item => {
                        const isLowStock = item.quantity <= (item.low_stock_threshold || 5);
                        return (
                            <Card key={item.id} className={`flex flex-col justify-between transition-all hover:shadow-md ${isLowStock ? 'border-orange-500 bg-orange-50/30 dark:bg-orange-950/10' : 'border-gray-400 dark:border-gray-600'}`}>
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg font-semibold">{item.name}</CardTitle>
                                            {isLowStock && (
                                                <div className="flex items-center gap-1 text-xs font-bold text-orange-600 mt-1">
                                                    <AlertTriangleIcon className="w-3 h-3" /> Low Stock
                                                </div>
                                            )}
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => onDeleteItem(item.id)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                                            <TrashIcon className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="pb-4">
                                    <div className="flex items-center justify-between bg-background border rounded-lg p-2">
                                        <button 
                                            onClick={() => adjustQuantity(item, -1)}
                                            className="w-8 h-8 flex items-center justify-center rounded-md bg-secondary hover:bg-secondary/80 text-lg font-bold"
                                        >-</button>
                                        <span className="text-xl font-mono font-bold">{item.quantity}</span>
                                        <button 
                                            onClick={() => adjustQuantity(item, 1)}
                                            className="w-8 h-8 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-lg font-bold"
                                        >+</button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
                    <Card className="w-full max-w-md animate-in zoom-in-95 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <CardHeader>
                            <CardTitle>Add Inventory Item</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Item Name</Label>
                                <Input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="e.g. Electrical Outlet" autoFocus />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Initial Quantity</Label>
                                    <Input type="number" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: parseInt(e.target.value) || 0})} />
                                </div>
                                <div>
                                    <Label>Low Stock Alert</Label>
                                    <Input type="number" value={newItem.low_stock_threshold} onChange={e => setNewItem({...newItem, low_stock_threshold: parseInt(e.target.value) || 0})} />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2 bg-muted/20 rounded-b-lg">
                            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
                            <Button onClick={handleAddItem} disabled={!newItem.name || loading}>{loading ? 'Adding...' : 'Add Item'}</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default InventoryView;
