import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { Label } from './ui/Label.tsx';
import { DropdownMenu, DropdownItem } from './ui/DropdownMenu.tsx';
import { BackArrowIcon, PlusIcon, TrashIcon, BoxIcon, SearchIcon, AlertTriangleIcon, FilterIcon, TagIcon, DollarIcon, TruckIcon, MapPinIcon, ClockIcon, BriefcaseIcon, CalendarIcon, CameraIcon, PrinterIcon, UsersIcon, MinusIcon, MoreVerticalIcon, CopyIcon, ChevronDownIcon } from './Icons.tsx';
import { InventoryItem, InventoryHistoryItem, Job, UserProfile, Client } from '../types.ts';
import PrintTagsModal from './PrintTagsModal.tsx';
import QRScannerModal from './QRScannerModal.tsx';

interface InventoryViewProps {
    onBack: () => void;
    inventory: InventoryItem[];
    history?: InventoryHistoryItem[];
    jobs?: Job[];
    userProfile?: UserProfile;
    onUpdateItem: (item: InventoryItem) => Promise<void>;
    onAddItem: (item: Omit<InventoryItem, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
    onDuplicateItem: (item: InventoryItem) => Promise<void>;
    onDeleteItem: (id: string) => Promise<void>;
    onAllocate?: (itemId: string, jobId: string | null, quantity: number, notes?: string) => Promise<void>;
    clients?: Client[];
    onAddClient?: (client: Partial<Client>) => Promise<Client | null>;
    onAddJob?: (job: Partial<Job>) => Promise<Job | null>;
}

const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`;

const InventoryView: React.FC<InventoryViewProps> = ({ onBack, inventory, history = [], jobs = [], clients = [], userProfile, onUpdateItem, onAddItem, onDuplicateItem, onDeleteItem, onAllocate, onAddClient, onAddJob }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedKit, setSelectedKit] = useState<InventoryItem | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'name' | 'quantity' | 'value'>('name');

    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [allocateModalItem, setAllocateModalItem] = useState<InventoryItem | null>(null);
    const [historyModalItem, setHistoryModalItem] = useState<InventoryItem | null>(null);
    const [showGeneralHistory, setShowGeneralHistory] = useState(false);
    const [printModalItem, setPrintModalItem] = useState<InventoryItem | null>(null);
    const [showScanModal, setShowScanModal] = useState(false);

    // Form Strings
    const [newItem, setNewItem] = useState<{
        name: string;
        quantity: number;
        category: string;
        unit: string;
        cost_price: number;
        supplier: string;
        location: string;
        low_stock_threshold: number;
        is_assembly: boolean;
        assembly_items: any[];
    }>({
        name: '', quantity: 0, category: '', unit: '', cost_price: 0, supplier: '', location: '', low_stock_threshold: 5, is_assembly: false, assembly_items: []
    });

    const [allocateData, setAllocateData] = useState({ jobId: '', quantity: 1, notes: '' });
    const [loading, setLoading] = useState(false);

    // Quick creation states
    const [quickClientMode, setQuickClientMode] = useState(false);
    const [quickJobMode, setQuickJobMode] = useState(false);
    const [newQuickClient, setNewQuickClient] = useState({ name: '', phone: '', email: '', isTemporary: false });
    const [newQuickJob, setNewQuickJob] = useState({ name: '', clientId: '' });

    // Get unique categories for filter
    const categories = useMemo(() => {
        const cats = new Set(inventory.map(i => i.category).filter(Boolean));
        return Array.from(cats) as string[];
    }, [inventory]);

    const filteredInventory = useMemo(() => {
        return inventory.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.supplier?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
            return matchesSearch && matchesCategory;
        }).sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            if (sortBy === 'quantity') return a.quantity - b.quantity;
            if (sortBy === 'value') return ((b.cost_price || 0) * b.quantity) - ((a.cost_price || 0) * a.quantity);
            return 0;
        });
    }, [inventory, searchQuery, categoryFilter, sortBy]);

    const totalInventoryValue = useMemo(() => {
        return inventory.reduce((acc, item) => acc + ((item.cost_price || 0) * item.quantity), 0);
    }, [inventory]);

    const handleAddItem = async () => {
        if (!newItem.name) return;
        setLoading(true);
        await onAddItem(newItem);
        setNewItem({ name: '', quantity: 0, category: '', unit: '', cost_price: 0, supplier: '', location: '', low_stock_threshold: 5, is_assembly: false, assembly_items: [] });
        setShowAddModal(false);
        setLoading(false);
    };

    const adjustQuantity = async (item: InventoryItem, amount: number) => {
        const newQty = Math.max(0, item.quantity + amount);
        await onUpdateItem({ ...item, quantity: newQty });
    };

    const handleAllocate = async () => {
        if (!allocateModalItem || !onAllocate) return;
        setLoading(true);
        // Allow jobId to be empty for independent scanning
        const finalJobId = allocateData.jobId === 'none' || !allocateData.jobId ? null : allocateData.jobId;
        await onAllocate(allocateModalItem.id, finalJobId, allocateData.quantity, allocateData.notes || 'Independent Scan');
        setAllocateModalItem(null);
        setAllocateData({ jobId: '', quantity: 1, notes: '' });
        setLoading(false);
    };

    const handleCreateQuickClient = async () => {
        if (!newQuickClient.name || !onAddClient) return alert('Client name is required');
        setLoading(true);
        const notes = newQuickClient.isTemporary ? '[TEMPORARY]' : '';
        const created = await onAddClient({
            name: newQuickClient.name,
            phone: newQuickClient.phone,
            email: newQuickClient.email,
            notes
        });
        if (created) {
            setQuickClientMode(false);
            if (quickJobMode) {
                setNewQuickJob(prev => ({ ...prev, clientId: created.id }));
            } else {
                // created an independent client
                setAllocateData(prev => ({
                    ...prev,
                    jobId: 'none',
                    notes: prev.notes ? `${prev.notes} (Checked out to: ${created.name})` : `Checked out to: ${created.name}`
                }));
            }
        }
        setLoading(false);
    };

    const handleCreateQuickJob = async () => {
        if (!newQuickJob.name || !newQuickJob.clientId || !onAddJob) return alert('Job name and client are required');
        setLoading(true);
        const cl = clients.find(c => c.id === newQuickJob.clientId);
        if (!cl) {
            setLoading(false);
            return;
        }
        const created = await onAddJob({
            name: newQuickJob.name,
            clientName: cl.name,
            clientAddress: cl.address || '',
            status: 'active'
        });
        if (created) {
            setAllocateData(prev => ({ ...prev, jobId: created.id }));
            setQuickJobMode(false);
        }
        setLoading(false);
    };

    const handleScanSuccess = (decodedId: string) => {
        setShowScanModal(false);
        const item = inventory.find(i => i.id === decodedId);
        if (item) {
            setAllocateModalItem(item);
        } else {
            alert(`Item not found in inventory. Scanned ID: ${decodedId}`);
        }
    };

    const getItemHistory = (itemId: string) => {
        return history.filter(h => h.item_id === itemId).sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
    };

    return (
        <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8 pb-24">
            {/* Header */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div className="flex items-center">
                    <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                        <BackArrowIcon className="h-9 w-9" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                            <BoxIcon className="w-8 h-8 text-primary" /> Inventory Manager
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1 font-medium">Total Value: <span className="text-primary font-bold text-lg">{formatMoney(totalInventoryValue)}</span></p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setShowScanModal(true)} className="rounded-full shadow-md bg-card/80 px-4 md:px-6 py-2">
                        <CameraIcon className="w-5 h-5 md:mr-2" /> <span className="hidden md:inline">Scan QR</span>
                    </Button>
                    <Button variant="outline" onClick={() => setShowGeneralHistory(true)} className="rounded-full shadow-md bg-card/80 px-4 md:px-6 py-2">
                        <ClockIcon className="w-5 h-5 md:mr-2" /> <span className="hidden md:inline">History</span>
                    </Button>
                    <Button onClick={() => setShowAddModal(true)} className="rounded-full shadow-md shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground px-4 md:px-6 py-2">
                        <PlusIcon className="w-5 h-5 md:mr-2" /> <span className="hidden md:inline">Add New Item</span>
                    </Button>
                </div>
            </header>

            {/* Controls */}
            <div className="bg-card/50 p-4 rounded-xl border border-border/50 mb-6 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                        placeholder="Search items, suppliers, categories..."
                        className="pl-10 h-11 rounded-lg bg-background border-border shadow-sm focus:ring-2 focus:ring-primary/20"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-4">
                    <div className="relative min-w-[150px]">
                        <FilterIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <select
                            className="w-full h-11 pl-10 pr-4 rounded-lg bg-background border border-input text-sm focus:ring-2 focus:ring-primary/20"
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                        >
                            <option value="all">All Categories</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="relative min-w-[150px]">
                        <select
                            className="w-full h-11 px-4 rounded-lg bg-background border border-input text-sm focus:ring-2 focus:ring-primary/20"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                        >
                            <option value="name">Sort by Name</option>
                            <option value="quantity">Sort by Quantity</option>
                            <option value="value">Sort by Value ($)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredInventory.length === 0 ? (
                    <div className="col-span-full text-center py-20 bg-muted/10 rounded-2xl border-2 border-dashed border-border flex flex-col items-center">
                        <BoxIcon className="w-16 h-16 text-muted-foreground/30 mb-4" />
                        <h3 className="text-xl font-semibold text-muted-foreground">No Items Found</h3>
                        <p className="text-sm text-muted-foreground mt-2">Add items to start tracking your inventory.</p>
                    </div>
                ) : (
                    filteredInventory.map(item => {
                        const isLowStock = item.quantity <= (item.low_stock_threshold || 5);
                        const itemValue = (item.cost_price || 0) * item.quantity;

                        return (
                            <Card key={item.id} className={`flex flex-col justify-between transition-all hover:shadow-xl hover:-translate-y-1 duration-300 border ${isLowStock ? 'border-orange-500/50 bg-orange-50/40 dark:bg-orange-950/20 shadow-orange-500/10' : 'border-border shadow-sm'}`}>
                                <CardHeader className="pb-3 px-5 pt-5">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <div className="flex gap-2 mb-1 flex-wrap">
                                                {item.category && (
                                                    <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center">
                                                        <TagIcon className="w-3 h-3 mr-1" /> {item.category}
                                                    </span>
                                                )}
                                                {item.is_assembly && (
                                                    <span className="bg-purple-500/10 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center border border-purple-200">
                                                        <BoxIcon className="w-3 h-3 mr-1" /> Assembly
                                                    </span>
                                                )}
                                                {isLowStock && (
                                                    <span className="bg-orange-500/10 text-orange-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center border border-orange-200">
                                                        <AlertTriangleIcon className="w-3 h-3 mr-1" /> Low Stock
                                                    </span>
                                                )}
                                            </div>
                                            <CardTitle className="text-lg font-bold leading-tight">{item.name}</CardTitle>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {item.is_assembly && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedKit(item)}
                                                    className="h-9 w-9 p-0 text-purple-600 hover:text-purple-700 bg-purple-500/10 hover:bg-purple-500/20 rounded-full transition-colors shadow-sm border border-purple-500/20"
                                                    title="View Kit Components"
                                                >
                                                    <BoxIcon className="w-5 h-5" />
                                                </Button>
                                            )}
                                            <DropdownMenu trigger={
                                                <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground rounded-full transition-colors bg-white/50 dark:bg-zinc-800/50 shadow-sm border border-border/50">
                                                    <MoreVerticalIcon className="w-5 h-5" />
                                                </Button>
                                            }>
                                                <DropdownItem onClick={() => onDuplicateItem(item)}>
                                                    <div className="flex items-center gap-2">
                                                        <CopyIcon className="w-4 h-4" />
                                                        <span>Duplicate</span>
                                                    </div>
                                                </DropdownItem>
                                                <DropdownItem onClick={() => onDeleteItem(item.id)} destructive>
                                                    <div className="flex items-center gap-2">
                                                        <TrashIcon className="w-4 h-4" />
                                                        <span>Delete</span>
                                                    </div>
                                                </DropdownItem>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="px-5 pb-5 space-y-4">
                                    {/* Item Details */}
                                    <div className="grid grid-cols-2 gap-y-2 text-sm text-muted-foreground">
                                        <div className="flex items-center gap-2" title="Unit Cost">
                                            <DollarIcon className="w-4 h-4 opacity-70" />
                                            <span>{formatMoney(item.cost_price || 0)} / {item.unit || 'unit'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 justify-end font-medium text-foreground" title="Total Value">
                                            <span>Value: {formatMoney(itemValue)}</span>
                                        </div>
                                        {item.supplier && (
                                            <div className="flex items-center gap-2 col-span-2 truncate" title={`Supplier: ${item.supplier}`}>
                                                <TruckIcon className="w-4 h-4 opacity-70" />
                                                <span className="truncate">{item.supplier}</span>
                                            </div>
                                        )}
                                        {item.location && (
                                            <div className="flex items-center gap-2 col-span-2 truncate" title={`Location: ${item.location}`}>
                                                <MapPinIcon className="w-4 h-4 opacity-70" />
                                                <span className="truncate">{item.location}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Bar */}
                                    <div className="flex items-center justify-between bg-muted/30 border border-border/50 rounded-xl p-1.5 mt-2">
                                        <button
                                            onClick={() => adjustQuantity(item, -1)}
                                            className="w-10 h-10 flex items-center justify-center rounded-lg bg-background border border-border hover:bg-muted text-lg font-bold transition-colors shadow-sm"
                                        >-</button>
                                        <div className="text-center px-2">
                                            <span className="text-2xl font-mono font-bold tracking-tight">{item.quantity}</span>
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none">{item.unit || 'Units'}</p>
                                        </div>
                                        <button
                                            onClick={() => adjustQuantity(item, 1)}
                                            className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-lg font-bold transition-colors shadow-sm shadow-primary/20"
                                        >+</button>
                                    </div>

                                    {/* Footer Actions */}
                                    <div className="flex flex-col gap-2 pt-2">
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" className="flex-1 text-[11px] px-1 md:text-xs" onClick={() => setPrintModalItem(item)}>
                                                <PrinterIcon className="w-3 h-3 mr-1" /> Print Tags
                                            </Button>
                                            <Button variant="outline" size="sm" className="flex-1 text-[11px] px-1 md:text-xs" onClick={() => setHistoryModalItem(item)}>
                                                <ClockIcon className="w-3 h-3 mr-1" /> History
                                            </Button>
                                        </div>
                                        <Button size="sm" className="w-full text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setAllocateModalItem(item)}>
                                            <BriefcaseIcon className="w-3 h-3 mr-1" /> Use / Check Out
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowAddModal(false)}>
                    <Card className="w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 border-none ring-1 ring-white/10" onClick={e => e.stopPropagation()}>
                        <CardHeader className="bg-muted/30 border-b">
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <PlusIcon className="w-5 h-5 text-primary" /> Add Inventory Item
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-full">
                                    <Label>Item Name <span className="text-red-500">*</span></Label>
                                    <Input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="e.g. Copper Pipe 1/2 inch" autoFocus />
                                </div>
                                <div className="col-span-full flex items-center gap-2 bg-purple-50 dark:bg-purple-900/10 p-3 rounded-lg border border-purple-100 dark:border-purple-800">
                                    <input
                                        type="checkbox"
                                        id="is_assembly"
                                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                        checked={newItem.is_assembly}
                                        onChange={e => setNewItem({ ...newItem, is_assembly: e.target.checked })}
                                    />
                                    <Label htmlFor="is_assembly" className="mb-0 cursor-pointer text-purple-900 dark:text-purple-100">This is a Kit/Assembly</Label>
                                </div>

                                {!newItem.is_assembly && (
                                    <>
                                        <div>
                                            <Label>Category</Label>
                                            <Input value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} placeholder="e.g. Plumbing" list="categories" />
                                            <datalist id="categories">
                                                <option value="Electrical" />
                                                <option value="Plumbing" />
                                                <option value="HVAC" />
                                                <option value="Framing" />
                                                <option value="Tools" />
                                                <option value="Finish" />
                                            </datalist>
                                        </div>

                                        <div>
                                            <Label>Location</Label>
                                            <Input value={newItem.location} onChange={e => setNewItem({ ...newItem, location: e.target.value })} placeholder="e.g. Warehouse A" />
                                        </div>

                                        <div>
                                            <Label>Supplier</Label>
                                            <Input value={newItem.supplier} onChange={e => setNewItem({ ...newItem, supplier: e.target.value })} placeholder="e.g. Home Depot" />
                                        </div>
                                    </>
                                )}

                                <div className="grid grid-cols-2 gap-4 col-span-1">
                                    <div>
                                        <Label>Initial Qty</Label>
                                        <Input type="number" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })} />
                                    </div>
                                    <div>
                                        <Label>Unit</Label>
                                        <Input value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })} placeholder="e.g. pcs" />
                                    </div>
                                </div>

                                <div>
                                    <Label>Cost Price ($)</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                        <Input type="number" step="0.01" className="pl-7" value={newItem.cost_price} onChange={e => setNewItem({ ...newItem, cost_price: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                </div>

                                <div>
                                    <Label>Low Stock Alert</Label>
                                    <Input type="number" value={newItem.low_stock_threshold} onChange={e => setNewItem({ ...newItem, low_stock_threshold: parseInt(e.target.value) || 0 })} />
                                </div>

                                {newItem.is_assembly && (
                                    <div className="col-span-full mt-4 border-t pt-4 border-border">
                                        <h4 className="font-semibold mb-2 flex justify-between items-center text-sm">
                                            Components
                                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setNewItem({ ...newItem, assembly_items: [...newItem.assembly_items, { item_id: crypto.randomUUID(), quantity: 1, is_custom: true, custom_name: 'Custom Component' }] })}>
                                                <PlusIcon className="w-3 h-3 mr-1" /> Custom
                                            </Button>
                                        </h4>
                                        <div className="mb-3">
                                            <select
                                                className="w-full h-9 px-3 rounded-md border border-input text-sm bg-background"
                                                onChange={e => {
                                                    if (!e.target.value) return;
                                                    const existing = newItem.assembly_items.find(i => i.item_id === e.target.value);
                                                    if (existing) {
                                                        setNewItem({ ...newItem, assembly_items: newItem.assembly_items.map(i => i.item_id === e.target.value ? { ...i, quantity: i.quantity + 1 } : i) });
                                                    } else {
                                                        setNewItem({ ...newItem, assembly_items: [...newItem.assembly_items, { item_id: e.target.value, quantity: 1, is_custom: false }] });
                                                    }
                                                    e.target.value = "";
                                                }}
                                            >
                                                <option value="">-- Select Existing Inventory Item to Add --</option>
                                                {inventory.filter(i => !i.is_assembly).map(inv => (
                                                    <option key={inv.id} value={inv.id}>{inv.name} - {formatMoney(inv.cost_price || 0)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 bg-muted/10 p-2 rounded border border-border">
                                            {newItem.assembly_items.length === 0 && <p className="text-xs text-muted-foreground italic p-2 text-center">No components added yet.</p>}
                                            {newItem.assembly_items.map((comp) => {
                                                const def = inventory.find(i => i.id === comp.item_id);
                                                return (
                                                    <div key={comp.item_id} className="flex items-center justify-between gap-2 bg-white/50 dark:bg-card/50 p-2 rounded border border-border/50 text-sm">
                                                        <div className="flex-1 min-w-0">
                                                            {comp.is_custom ? (
                                                                <Input value={comp.custom_name || ''} onChange={e => setNewItem({ ...newItem, assembly_items: newItem.assembly_items.map(i => i.item_id === comp.item_id ? { ...i, custom_name: e.target.value } : i) })} className="h-7 text-sm px-2 w-full" placeholder="Custom component name" />
                                                            ) : (
                                                                <p className="font-medium truncate">{def?.name}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            Qty: <Input type="number" value={comp.quantity} onChange={e => setNewItem({ ...newItem, assembly_items: newItem.assembly_items.map(i => i.item_id === comp.item_id ? { ...i, quantity: parseInt(e.target.value) || 1 } : i) })} className="h-7 w-16 text-center px-1" min={1} />
                                                        </div>
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0" onClick={() => setNewItem({ ...newItem, assembly_items: newItem.assembly_items.filter(i => i.item_id !== comp.item_id) })}>
                                                            <TrashIcon className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-3 bg-muted/30 border-t p-4 rounded-b-xl">
                            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
                            <Button onClick={handleAddItem} disabled={!newItem.name || loading} className="px-8 shadow-lg shadow-primary/20">
                                {loading ? 'Adding...' : 'Save Item'}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            {/* Allocate Modal */}
            {allocateModalItem && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setAllocateModalItem(null)}>
                    <Card className="w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <CardHeader>
                            <CardTitle>Scan Out Item</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[70vh] overflow-y-auto">
                            <p className="text-sm text-muted-foreground">
                                You are removing stock from <strong>{allocateModalItem.name}</strong>.
                            </p>
                            <div>
                                <Label>Quantity to Remove</Label>
                                <Input type="number" value={allocateData.quantity} max={allocateModalItem.quantity} onChange={e => setAllocateData({ ...allocateData, quantity: parseInt(e.target.value) || 1 })} />
                                <p className="text-xs text-muted-foreground mt-1">Available: {allocateModalItem.quantity}</p>
                            </div>

                            {!quickJobMode && !quickClientMode && (
                                <>
                                    <div>
                                        <Label>Select Job (Optional)</Label>
                                        <div className="flex gap-2">
                                            <select
                                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                value={allocateData.jobId}
                                                onChange={e => setAllocateData({ ...allocateData, jobId: e.target.value })}
                                            >
                                                <option value="none">-- Independent Scan (No Job) --</option>
                                                {jobs.filter(j => j.status === 'active').map(j => (
                                                    <option key={j.id} value={j.id}>{j.name} ({j.clientName})</option>
                                                ))}
                                            </select>
                                            <Button variant="outline" size="sm" onClick={() => { setQuickClientMode(true); setQuickJobMode(false); }} className="px-3" title="Create New Client (No Job)">
                                                <UsersIcon className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div>
                                        <Label>Internal Notes (Visible in Audit Log)</Label>
                                        <Input value={allocateData.notes} onChange={e => setAllocateData({ ...allocateData, notes: e.target.value })} placeholder="e.g. Taken for van stock" />
                                    </div>
                                </>
                            )}

                            {quickJobMode && !quickClientMode && (
                                <div className="p-4 border rounded-lg bg-muted/20 space-y-3">
                                    <h4 className="font-semibold text-sm">Quick Create Job</h4>
                                    <div>
                                        <Label>Job Name</Label>
                                        <Input value={newQuickJob.name} onChange={e => setNewQuickJob({ ...newQuickJob, name: e.target.value })} placeholder="e.g. Main St Plumbing" />
                                    </div>
                                    <div>
                                        <Label>Select Client</Label>
                                        <div className="flex gap-2">
                                            <select
                                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                value={newQuickJob.clientId}
                                                onChange={e => setNewQuickJob({ ...newQuickJob, clientId: e.target.value })}
                                            >
                                                <option value="">-- Select Client --</option>
                                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                            <Button variant="outline" size="sm" onClick={() => setQuickClientMode(true)} className="px-3">
                                                <PlusIcon className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button variant="ghost" size="sm" onClick={() => setQuickJobMode(false)}>Cancel</Button>
                                        <Button size="sm" onClick={handleCreateQuickJob} disabled={loading}>Create Job</Button>
                                    </div>
                                </div>
                            )}

                            {quickClientMode && (
                                <div className="p-4 border border-primary/20 rounded-lg bg-primary/5 space-y-3">
                                    <h4 className="font-semibold text-sm text-primary">Quick Create Client</h4>
                                    <div>
                                        <Label>Client Name *</Label>
                                        <Input value={newQuickClient.name} onChange={e => setNewQuickClient({ ...newQuickClient, name: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label>Phone</Label>
                                            <Input value={newQuickClient.phone} onChange={e => setNewQuickClient({ ...newQuickClient, phone: e.target.value })} />
                                        </div>
                                        <div>
                                            <Label>Email</Label>
                                            <Input value={newQuickClient.email} onChange={e => setNewQuickClient({ ...newQuickClient, email: e.target.value })} />
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                        <input type="checkbox" checked={newQuickClient.isTemporary} onChange={e => setNewQuickClient({ ...newQuickClient, isTemporary: e.target.checked })} className="rounded text-primary" />
                                        <span className="text-sm font-medium">Mark as Temporary Client</span>
                                    </label>
                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button variant="ghost" size="sm" onClick={() => setQuickClientMode(false)}>Cancel</Button>
                                        <Button size="sm" onClick={handleCreateQuickClient} disabled={loading}>Create Client</Button>
                                    </div>
                                </div>
                            )}

                        </CardContent>
                        <CardFooter className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => {
                                setAllocateModalItem(null);
                                setQuickJobMode(false);
                                setQuickClientMode(false);
                            }}>Cancel</Button>
                            {!quickJobMode && !quickClientMode && (
                                <Button onClick={handleAllocate} disabled={loading}>Confirm Scan Out</Button>
                            )}
                        </CardFooter>
                    </Card>
                </div>
            )}

            {/* Kit Components Modal */}
            {selectedKit && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedKit(null)}>
                    <Card className="w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <CardHeader className="border-b bg-purple-50/30 dark:bg-purple-950/20">
                            <div className="flex justify-between items-center">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-purple-600 tracking-wider flex items-center">
                                        <BoxIcon className="w-3 h-3 mr-1" /> Kit Contents
                                    </p>
                                    <CardTitle className="text-xl font-bold">{selectedKit.name}</CardTitle>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedKit(null)} className="h-8 w-8 p-0 rounded-full">
                                    <PlusIcon className="w-4 h-4 rotate-45" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="max-h-[60vh] overflow-y-auto thin-scrollbar">
                                <div className="divide-y divide-border/50">
                                    {selectedKit.assembly_items?.map((comp, idx) => {
                                        const subItem = inventory.find(i => i.id === comp.item_id);
                                        return (
                                            <div key={idx} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 font-bold">
                                                        {idx + 1}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm leading-none">{comp.custom_name || subItem?.name || 'Unknown Item'}</p>
                                                        {subItem?.category && (
                                                            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tight">{subItem.category}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">Qty:</span>
                                                    <span className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-bold px-2 py-1 rounded-lg text-sm border border-purple-200/50">
                                                        {comp.quantity}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="p-4 bg-muted/20 border-t flex justify-end">
                            <Button onClick={() => setSelectedKit(null)} className="bg-purple-600 hover:bg-purple-700 text-white min-w-[100px]">
                                Done
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            {/* General History Modal */}
            {showGeneralHistory && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowGeneralHistory(false)}>
                    <Card className="w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <CardHeader className="border-b">
                            <CardTitle className="flex items-center gap-2">
                                <ClockIcon className="w-6 h-6 text-primary" /> Inventory Audit Log (General History)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto space-y-0 p-0">
                            {history.length === 0 ? (
                                <div className="p-20 text-center text-muted-foreground">
                                    <ClockIcon className="w-12 h-12 mx-auto opacity-20 mb-4" />
                                    <p>No inventory history records found.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border">
                                    {history.slice().sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()).map(log => {
                                        const isPositive = log.quantity_change > 0;
                                        const item = inventory.find(i => i.id === log.item_id);
                                        const job = jobs.find(j => j.id === log.job_id);

                                        return (
                                            <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors flex gap-4">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isPositive ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
                                                    {isPositive ? <PlusIcon className="w-5 h-5" /> : <MinusIcon className="w-5 h-5" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start mb-1 text-xs">
                                                        <span className="font-bold text-muted-foreground uppercase tracking-wider">
                                                            {log.action.replace('_', ' ')}
                                                        </span>
                                                        <span className="text-muted-foreground flex items-center gap-1">
                                                            <CalendarIcon className="w-3 h-3" />
                                                            {new Date(log.created_at!).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-2">
                                                        <h4 className="font-bold text-base truncate">{item?.name || 'Unknown Item'}</h4>
                                                        <div className={`font-mono font-bold text-lg whitespace-nowrap ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                                            {isPositive ? '+' : ''}{log.quantity_change}
                                                        </div>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mt-1 font-medium italic">
                                                        {log.notes}
                                                    </p>
                                                    {job && (
                                                        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                                                            <BriefcaseIcon className="w-3 h-3" /> {job.name} <span className="opacity-50 ml-1">({job.clientName})</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="border-t p-4">
                            <Button className="w-full" variant="outline" onClick={() => setShowGeneralHistory(false)}>Close Audit Log</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            {/* Per-Item History Modal */}
            {historyModalItem && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setHistoryModalItem(null)}>
                    <Card className="w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ClockIcon className="w-5 h-5 text-primary" /> History: {historyModalItem.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto space-y-4 pr-2">
                            {getItemHistory(historyModalItem.id).length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">No history records found for this item.</p>
                            ) : (
                                getItemHistory(historyModalItem.id).map(log => {
                                    const isPositive = log.quantity_change > 0;
                                    const job = jobs.find(j => j.id === log.job_id);
                                    return (
                                        <div key={log.id} className="flex gap-4 border-b pb-3 last:border-0 p-2 hover:bg-muted/30 rounded-lg transition-colors">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isPositive ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
                                                {isPositive ? <PlusIcon className="w-4 h-4" /> : <MinusIcon className="w-4 h-4" />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start">
                                                    <span className="font-bold text-sm uppercase tracking-tight text-muted-foreground">
                                                        {log.action.replace('_', ' ')}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">{new Date(log.created_at!).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-sm font-medium mt-0.5">
                                                    {log.notes}
                                                    {job && <span className="block font-bold text-blue-600 dark:text-blue-400 mt-1"><BriefcaseIcon className="w-3 h-3 inline mr-1" /> {job.name} <span className="text-xs opacity-70">({job.clientName})</span></span>}
                                                </p>
                                            </div>
                                            <div className={`font-mono font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                                {isPositive ? '+' : ''}{log.quantity_change}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                        <CardFooter className="border-t p-4">
                            <Button className="w-full" variant="outline" onClick={() => setHistoryModalItem(null)}>Close</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            {/* Print Tags Modal */}
            {printModalItem && (
                <PrintTagsModal
                    isOpen={!!printModalItem}
                    onClose={() => setPrintModalItem(null)}
                    item={printModalItem}
                    userProfile={userProfile}
                />
            )}

            {/* Scan QR Modal */}
            <QRScannerModal
                isOpen={showScanModal}
                onClose={() => setShowScanModal(false)}
                onScanSuccess={handleScanSuccess}
            />
        </div>
    );
};

export default InventoryView;
