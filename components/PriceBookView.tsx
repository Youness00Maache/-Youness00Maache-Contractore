import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { Label } from './ui/Label.tsx';
import { BackArrowIcon, PlusIcon, TrashIcon, SearchIcon, TagIcon } from './Icons.tsx';
import { SavedItem } from '../types.ts';

interface PriceBookViewProps {
    onBack: () => void;
    savedItems: SavedItem[];
    onUpdateItem: (item: SavedItem) => Promise<void>;
    onAddItem: (item: Omit<SavedItem, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
    onDeleteItem: (id: string) => Promise<void>;
}

const PriceBookView: React.FC<PriceBookViewProps> = ({ onBack, savedItems, onUpdateItem, onAddItem, onDeleteItem }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', description: '', rate: 0, unit_cost: 0 });
    const [loading, setLoading] = useState(false);

    const filteredItems = savedItems.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
    ).sort((a, b) => a.name.localeCompare(b.name));

    const handleAddItem = async () => {
        if (!newItem.name) return;
        setLoading(true);
        await onAddItem(newItem);
        setNewItem({ name: '', description: '', rate: 0, unit_cost: 0 });
        setShowAddModal(false);
        setLoading(false);
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
                            <TagIcon className="w-8 h-8 text-primary" /> Price Book
                        </h1>
                        <p className="text-sm text-muted-foreground">Manage your standard services and pricing.</p>
                    </div>
                </div>
                <Button onClick={() => setShowAddModal(true)} className="rounded-full shadow-md shadow-primary/20">
                    <PlusIcon className="w-4 h-4 mr-2" /> Add Service
                </Button>
            </header>

            <div className="relative mb-6 max-w-md">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input 
                    placeholder="Search services..." 
                    className="pl-10 h-11 rounded-full bg-card border-border shadow-sm focus:ring-2 focus:ring-primary/20" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredItems.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-muted/10 rounded-xl border border-dashed border-border">
                        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground mx-auto">
                            <TagIcon className="w-6 h-6" />
                        </div>
                        <p className="text-muted-foreground">No services found. Add commonly used items to speed up your estimates.</p>
                    </div>
                ) : (
                    filteredItems.map(item => (
                        <Card key={item.id} className="flex flex-col justify-between transition-all hover:shadow-md border-gray-400 dark:border-gray-600">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-lg font-semibold">{item.name}</CardTitle>
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => onDeleteItem(item.id)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                                        <TrashIcon className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="pb-4 pt-2">
                                <div className="flex items-center gap-4 text-sm">
                                    <div className="flex-1">
                                        <span className="text-muted-foreground text-xs uppercase font-bold block">Charge</span>
                                        <span className="text-lg font-bold text-primary">${item.rate.toFixed(2)}</span>
                                    </div>
                                    <div className="flex-1">
                                        <span className="text-muted-foreground text-xs uppercase font-bold block">Cost</span>
                                        <span className="text-base font-medium text-orange-600 dark:text-orange-400">${(item.unit_cost || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
                    <Card className="w-full max-w-md animate-in zoom-in-95 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <CardHeader>
                            <CardTitle>Add Service Item</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Service Name</Label>
                                <Input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="e.g. Install Fan" autoFocus />
                            </div>
                            <div>
                                <Label>Description</Label>
                                <Input value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} placeholder="Details about the service..." />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Client Rate ($)</Label>
                                    <Input type="number" value={newItem.rate} onChange={e => setNewItem({...newItem, rate: parseFloat(e.target.value) || 0})} />
                                </div>
                                <div>
                                    <Label>Your Cost ($)</Label>
                                    <Input type="number" value={newItem.unit_cost} onChange={e => setNewItem({...newItem, unit_cost: parseFloat(e.target.value) || 0})} />
                                    <p className="text-[10px] text-muted-foreground mt-1">Used for profit calculation.</p>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2 bg-muted/20 rounded-b-lg">
                            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
                            <Button onClick={handleAddItem} disabled={!newItem.name || loading}>{loading ? 'Adding...' : 'Add Service'}</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default PriceBookView;