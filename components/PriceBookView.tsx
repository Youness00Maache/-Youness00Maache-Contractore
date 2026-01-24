import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, PlusIcon, TrashIcon, SearchIcon, TagIcon, FolderIcon, MoreVerticalIcon, CheckIcon } from './Icons.tsx';
import { SavedItem } from '../types.ts';
import PriceBookItemDetails from './PriceBookItemDetails.tsx';

interface PriceBookViewProps {
    onBack: () => void;
    savedItems: SavedItem[];
    onUpdateItem: (item: SavedItem) => Promise<void>;
    onAddItem: (item: Omit<SavedItem, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
    onDeleteItem: (id: string) => Promise<void>;
    onUploadImage: (file: File) => Promise<string>;
    isPremium: boolean;
}

const PriceBookView: React.FC<PriceBookViewProps> = ({ onBack, savedItems, onUpdateItem, onAddItem, onDeleteItem, onUploadImage, isPremium }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All Items');
    const [showItemDetails, setShowItemDetails] = useState(false);
    const [editingItem, setEditingItem] = useState<SavedItem | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Extract unique categories
    const categories = useMemo(() => {
        const cats = new Set<string>();
        savedItems.forEach(item => {
            if (item.category) cats.add(item.category);
        });
        return Array.from(cats).sort();
    }, [savedItems]);

    const filteredItems = useMemo(() => {
        return savedItems.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesCategory = selectedCategory === 'All Items' || item.category === selectedCategory;

            return matchesSearch && matchesCategory;
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [savedItems, searchQuery, selectedCategory]);

    const handleEditClick = (item: SavedItem) => {
        setEditingItem(item);
        setShowItemDetails(true);
    };

    const handleAddNewClick = () => {
        setEditingItem(null);
        setShowItemDetails(true);
    };

    const handleSaveItem = async (itemData: any) => {
        if (editingItem) {
            await onUpdateItem({ ...editingItem, ...itemData });
        } else {
            await onAddItem(itemData);
        }
        setShowItemDetails(false);
    };

    return (
        <div className="w-full h-full bg-background flex text-foreground">
            {/* Sidebar */}
            <div className="w-64 border-r border-border/50 hidden md:flex flex-col bg-white/60 dark:bg-card/60 backdrop-blur-xl h-[calc(100vh-theme(spacing.16))] sticky top-0 shadow-sm">
                <div className="p-4 border-b flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={onBack} className="w-9 h-9 p-0 rounded-full mr-1">
                        <BackArrowIcon className="w-6 h-6" />
                    </Button>
                    <span className="font-bold text-lg tracking-tight">Price Book</span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Browser
                    </div>
                    <button
                        onClick={() => setSelectedCategory('All Items')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${selectedCategory === 'All Items' ? 'bg-gradient-to-r from-primary/20 to-primary/10 text-primary shadow-sm border-l-2 border-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}`}
                    >
                        <TagIcon className="w-4 h-4" />
                        All Items
                        <span className="ml-auto text-xs opacity-50">{savedItems.length}</span>
                    </button>

                    <div className="h-px bg-border my-2 mx-3" />

                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2">
                        Categories
                    </div>
                    {categories.length === 0 && (
                        <div className="px-3 text-xs text-muted-foreground italic">No categories yet</div>
                    )}
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${selectedCategory === cat ? 'bg-gradient-to-r from-primary/20 to-primary/10 text-primary shadow-sm border-l-2 border-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}`}
                        >
                            <FolderIcon className="w-4 h-4" />
                            {cat}
                            <span className="ml-auto text-xs opacity-50">{savedItems.filter(i => i.category === cat).length}</span>
                        </button>
                    ))}
                </div>

                <div className="p-4 border-t border-border/50 bg-gradient-to-b from-transparent to-muted/30">
                    <Button onClick={handleAddNewClick} className="w-full bg-gradient-to-r from-primary to-primary/90 hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
                        <PlusIcon className="w-4 h-4 mr-2" /> Add Item
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Mobile Header (visible only on small screens) */}
                <div className="md:hidden p-4 border-b flex items-center justify-between bg-white">
                    <Button variant="ghost" size="sm" onClick={onBack} className="mr-2">
                        <BackArrowIcon className="w-5 h-5" />
                    </Button>
                    <h1 className="font-bold text-lg">Price Book</h1>
                    <Button size="sm" onClick={handleAddNewClick} className="rounded-full w-8 h-8 p-0">
                        <PlusIcon className="w-5 h-5" />
                    </Button>
                </div>

                {/* Filter Bar */}
                <div className="p-4 md:p-6 border-b border-border/50 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white/80 dark:bg-card/80 backdrop-blur-xl sticky top-0 z-10 shadow-sm">
                    <div className="relative w-full sm:w-80">
                        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name, SKU, or tag..."
                            className="pl-9 bg-white/90 dark:bg-card/90 border-border/60 focus:border-primary/50 focus:ring-primary/20 h-11 rounded-xl shadow-sm"
                        />
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        <div className="bg-muted/50 p-1 rounded-lg flex text-xs">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`px-3 py-1.5 rounded-md font-medium transition-all ${viewMode === 'grid' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Grid
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-3 py-1.5 rounded-md font-medium transition-all ${viewMode === 'list' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                List
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="mb-4 text-sm text-muted-foreground">
                        Showing {filteredItems.length} items in <span className="font-semibold text-foreground">{selectedCategory}</span>
                    </div>

                    {filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl bg-muted/5">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                <SearchIcon className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium">No items found</h3>
                            <p className="text-muted-foreground max-w-sm mt-2">
                                Try adjusting your search query or select a different category.
                            </p>
                            <Button variant="outline" className="mt-6" onClick={handleAddNewClick}>
                                Create New Item
                            </Button>
                        </div>
                    ) : (
                        viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleEditClick(item)}
                                        className="group bg-white dark:bg-card border border-border/60 rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-primary/5 hover:scale-[1.02] hover:border-primary/30 transition-all duration-300 cursor-pointer relative"
                                    >
                                        <div className="h-32 bg-gradient-to-br from-muted/40 to-muted/20 relative flex items-center justify-center overflow-hidden">
                                            {item.images && item.images.length > 0 ? (
                                                <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="text-4xl opacity-20 select-none">
                                                    {item.type === 'service' ? '🛠️' : item.type === 'material' ? '📦' : item.type === 'labor' ? '👷' : '📄'}
                                                </div>
                                            )}
                                            {item.taxable && (
                                                <span className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">Tax</span>
                                            )}
                                        </div>
                                        <div className="p-4">
                                            <div className="flex justify-between items-start mb-1">
                                                <h3 className="font-bold text-base line-clamp-1 group-hover:text-primary transition-colors">{item.name}</h3>
                                            </div>
                                            <div className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
                                                {item.sku && <span className="font-mono bg-muted px-1 rounded">{item.sku}</span>}
                                                <span className="truncate">{item.category || 'Uncategorized'}</span>
                                            </div>

                                            <div className="flex items-end justify-between mt-3 pt-3 border-t border-dashed border-border/40">
                                                <div>
                                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Price</div>
                                                    <div className="font-extrabold text-xl text-foreground">${item.rate.toFixed(2)}</div>
                                                </div>
                                                {item.unit_cost && item.unit_cost > 0 && (
                                                    <div className="text-right">
                                                        <div className="text-[10px] text-muted-foreground uppercase font-bold">Profit</div>
                                                        <div className="font-medium text-sm text-green-600">${(item.rate - item.unit_cost).toFixed(2)}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-card border rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 border-b">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium text-muted-foreground w-16">Image</th>
                                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Item Name</th>
                                            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Category</th>
                                            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">SKU</th>
                                            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Start Price</th>
                                            <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden sm:table-cell">Cost</th>
                                            <th className="px-4 py-3 text-right font-medium text-muted-foreground w-16">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {filteredItems.map(item => (
                                            <tr key={item.id} onClick={() => handleEditClick(item)} className="hover:bg-muted/30 cursor-pointer transition-colors">
                                                <td className="px-4 py-2">
                                                    <div className="w-10 h-10 bg-muted rounded flex items-center justify-center overflow-hidden">
                                                        {item.images && item.images.length > 0 ? (
                                                            <img src={item.images[0]} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-xs">
                                                                {item.type === 'service' ? '🛠️' : item.type === 'material' ? '📦' : '📄'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2">
                                                    <div className="font-medium">{item.name}</div>
                                                    <div className="text-xs text-muted-foreground sm:hidden">{item.sku}</div>
                                                </td>
                                                <td className="px-4 py-2 hidden sm:table-cell text-muted-foreground">{item.category}</td>
                                                <td className="px-4 py-2 hidden sm:table-cell font-mono text-xs">{item.sku}</td>
                                                <td className="px-4 py-2 text-right font-medium">${item.rate.toFixed(2)}</td>
                                                <td className="px-4 py-2 text-right hidden sm:table-cell text-muted-foreground">
                                                    {item.unit_cost ? `$${item.unit_cost.toFixed(2)}` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
                                                    <Button variant="ghost" size="sm" onClick={() => onDeleteItem(item.id)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                                                        <TrashIcon className="w-4 h-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}
                </div>
            </div>

            <PriceBookItemDetails
                isOpen={showItemDetails}
                onClose={() => setShowItemDetails(false)}
                onSave={handleSaveItem}
                item={editingItem}
                categories={categories.length > 0 ? categories : ['General', 'Plumbing', 'Electrical', 'HVAC', 'Materials', 'Labor']}
                allItems={savedItems}
                onUploadImage={onUploadImage}
                isPremium={isPremium}
            />
        </div>
    );
};

export default PriceBookView;