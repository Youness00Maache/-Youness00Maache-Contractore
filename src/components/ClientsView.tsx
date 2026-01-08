import React, { useState, useEffect, useMemo } from 'react';
import { Client, FormData as FormDataType, FormType, Job } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, SearchIcon, PlusIcon, TrashIcon, UsersIcon, GlobeIcon, CheckIcon, PenIcon, EstimateIcon, ChangeOrderIcon, CopyIcon } from './Icons.tsx';

interface ClientsViewProps {
  onBack: () => void;
  supabase: any;
  session: any;
  clients?: Client[];
  forms?: FormDataType[]; // Added forms for document lookup
  jobs?: Job[];
  onAddClient?: (client: any) => Promise<void>;
  onDeleteClient?: (id: string) => Promise<void>;
  isOnline?: boolean;
  onNavigateToNewDoc?: (type: FormType, clientId: string) => void;
}

const ClientsView: React.FC<ClientsViewProps> = ({ 
    onBack, 
    supabase, 
    session, 
    clients: propClients, 
    forms = [],
    jobs = [],
    onAddClient, 
    onDeleteClient, 
    isOnline,
    onNavigateToNewDoc
}) => {
  const [localClients, setLocalClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Approval Hub Modal State
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedClientForApproval, setSelectedClientForApproval] = useState<Client | null>(null);
  const [approvalCopiedDocId, setApprovalCopiedDocId] = useState<string | null>(null);

  const [newClient, setNewClient] = useState<Partial<Client>>({
      name: '',
      email: '',
      phone: '',
      address: '',
      notes: ''
  });

  const activeClients = propClients || localClients;

  useEffect(() => {
      if(session && !propClients) fetchClients();
  }, [session, propClients]);

  const fetchClients = async () => {
      setLoading(true);
      const { data, error } = await supabase
          .from('clients')
          .select('*')
          .eq('user_id', session.user.id)
          .order('name');
      
      if (error) {
          console.error('Error fetching clients:', error);
      }
      else setLocalClients(data || []);
      setLoading(false);
  };

  const handleAdd = async () => {
      if (!newClient.name) return alert('Client Name is required');
      
      setLoading(true);
      if (onAddClient) {
          await onAddClient(newClient);
          setShowAddModal(false);
          setNewClient({ name: '', email: '', phone: '', address: '', notes: '' });
      } else {
          const { error } = await supabase
              .from('clients')
              .insert([{ ...newClient, user_id: session.user.id }]);
          
          if (error) {
              alert(`Failed to add client: ${error.message}`);
          } else {
              setShowAddModal(false);
              setNewClient({ name: '', email: '', phone: '', address: '', notes: '' });
              fetchClients();
          }
      }
      setLoading(false);
  };

  const handleDelete = async (id: string) => {
      if (!confirm('Are you sure you want to delete this client?')) return;
      
      if (onDeleteClient) {
          await onDeleteClient(id);
      } else {
          const { error } = await supabase
              .from('clients')
              .delete()
              .eq('id', id);
          
          if (error) {
              alert(`Failed to delete client: ${error.message}`);
          }
          else fetchClients();
      }
  };

  const copyPortalLink = (client: Client) => {
      if (!client.portal_key) {
          alert("This client does not have a portal key yet. Please refresh or update the client.");
          return;
      }
      const url = `${window.location.origin}?portal=${client.portal_key}`;
      navigator.clipboard.writeText(url);
      setCopiedId(client.id);
      setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to open Approval Modal
  const openApprovalModal = (client: Client) => {
      setSelectedClientForApproval(client);
      setShowApprovalModal(true);
  };

  // Filter docs for the selected client in the modal
  const clientApprovalDocs = useMemo(() => {
      if (!selectedClientForApproval) return [];
      
      return forms.filter(f => {
          // Filter for Estimates and Change Orders only
          if (f.type !== FormType.Estimate && f.type !== FormType.ChangeOrder) return false;
          
          // Match by Client Name (Standard app behavior)
          const data = f.data as any;
          return data.clientName === selectedClientForApproval.name;
      }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [selectedClientForApproval, forms]);

  const copyApprovalLink = (doc: FormDataType) => {
      if (!doc.public_token) {
          alert("This document cannot be shared securely yet. Please open and save it again to generate a token.");
          return;
      }
      const url = `${window.location.origin}?approval_token=${doc.public_token}`;
      navigator.clipboard.writeText(url);
      setApprovalCopiedDocId(doc.id);
      setTimeout(() => setApprovalCopiedDocId(null), 2000);
  };

  const handleCreateNew = (type: FormType) => {
      if (onNavigateToNewDoc && selectedClientForApproval) {
          onNavigateToNewDoc(type, selectedClientForApproval.id);
          setShowApprovalModal(false); // Close modal
      }
  };

  const filteredClients = activeClients.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8 pb-24">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
             <div className="flex items-center">
                 <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                    <BackArrowIcon className="h-6 w-6" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                        Client Directory
                    </h1>
                </div>
            </div>
            <div className="flex items-center gap-3">
                {isOnline === false && <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-bold animate-pulse">Offline</div>}
                <Button onClick={() => setShowAddModal(true)} className="rounded-full shadow-md shadow-primary/20"><PlusIcon className="w-4 h-4 mr-2"/> Add Client</Button>
            </div>
        </header>

        <div className="relative mb-8 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input 
                placeholder="Search clients by name or email..." 
                className="pl-10 h-11 rounded-full bg-card border-border shadow-sm focus:ring-2 focus:ring-primary/20" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
        </div>

        {loading && activeClients.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">Loading clients...</div>
        ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 bg-muted/10 rounded-2xl border border-dashed border-border">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                    <UsersIcon className="w-6 h-6" />
                </div>
                <p className="text-lg font-medium text-foreground">No clients found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or add a new client.</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClients.map(client => (
                    <Card key={client.id} className="relative group hover:shadow-lg transition-all duration-200 border-blue-200 dark:border-border hover:border-blue-300 overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-card dark:to-card">
                        <CardHeader className="pb-3 flex flex-row gap-4 items-center bg-white/40 dark:bg-secondary/10 border-b border-blue-200 dark:border-border/50">
                            <div className="w-12 h-12 rounded-full bg-white dark:bg-primary/10 flex items-center justify-center text-blue-600 dark:text-primary text-lg font-bold shrink-0 shadow-sm">
                                {client.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                                <CardTitle className="text-lg truncate text-blue-950 dark:text-foreground">{client.name}</CardTitle>
                                <p className="text-xs text-blue-600/70 dark:text-muted-foreground truncate mt-0.5">Added {client.created_at ? new Date(client.created_at).toLocaleDateString() : 'Recently'}</p>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4 pb-4 space-y-3 text-sm">
                            {client.email ? (
                                <div className="flex items-center gap-3 text-blue-700 dark:text-muted-foreground group-hover:text-blue-900 dark:group-hover:text-foreground transition-colors">
                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-secondary flex items-center justify-center shrink-0 shadow-sm">
                                        <span className="text-xs">@</span>
                                    </div>
                                    <span className="truncate">{client.email}</span>
                                </div>
                            ) : (
                                <div className="h-8 flex items-center text-blue-400/50 dark:text-muted-foreground/40 italic pl-11">No email</div>
                            )}
                            
                            {client.phone ? (
                                <div className="flex items-center gap-3 text-blue-700 dark:text-muted-foreground group-hover:text-blue-900 dark:group-hover:text-foreground transition-colors">
                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-secondary flex items-center justify-center shrink-0 shadow-sm">
                                        <span className="text-xs">#</span>
                                    </div>
                                    <span>{client.phone}</span>
                                </div>
                            ) : (
                                <div className="h-8 flex items-center text-blue-400/50 dark:text-muted-foreground/40 italic pl-11">No phone</div>
                            )}

                            <div className="pt-4 grid grid-cols-2 gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => copyPortalLink(client)} 
                                    className="text-xs h-9 bg-white/50 hover:bg-white text-blue-700 border-blue-200"
                                    title="Copy Magic Portal Link"
                                >
                                    {copiedId === client.id ? <CheckIcon className="w-3 h-3 mr-1" /> : <GlobeIcon className="w-3 h-3 mr-1" />}
                                    {copiedId === client.id ? 'Copied' : 'Portal'}
                                </Button>
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => openApprovalModal(client)}
                                    className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                    title="Get Approval Link"
                                >
                                    <PenIcon className="w-3 h-3 mr-1" /> Get Approval
                                </Button>
                            </div>
                        </CardContent>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)} className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0 rounded-full">
                                <TrashIcon className="w-4 h-4" />
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>
        )}

        {/* Add Client Modal */}
        {showAddModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
                <Card className="w-full max-w-md animate-in zoom-in-95 shadow-2xl" onClick={e => e.stopPropagation()}>
                    <CardHeader>
                        <CardTitle>Add New Client</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div><Label>Name</Label><Input value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} placeholder="Full Name or Company" /></div>
                        <div><Label>Email</Label><Input value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} placeholder="client@example.com" /></div>
                        <div><Label>Phone</Label><Input value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})} placeholder="(555) 123-4567" /></div>
                        <div><Label>Address</Label><Input value={newClient.address} onChange={e => setNewClient({...newClient, address: e.target.value})} placeholder="Street Address" /></div>
                        <div><Label>Notes</Label><Input value={newClient.notes} onChange={e => setNewClient({...newClient, notes: e.target.value})} placeholder="Additional details..." /></div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2 bg-muted/20 rounded-b-lg">
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
                        <Button onClick={handleAdd} disabled={loading}>{loading ? 'Saving...' : 'Add Client'}</Button>
                    </CardFooter>
                </Card>
            </div>
        )}

        {/* Approval Link Modal */}
        {showApprovalModal && selectedClientForApproval && (
             <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm" onClick={() => setShowApprovalModal(false)}>
                <Card className="w-full max-w-lg animate-in zoom-in-95 shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <CardHeader className="border-b border-border bg-muted/20 pb-4">
                        <CardTitle className="text-xl">Get Approval Link</CardTitle>
                        <CardDescription>Select a document to send to <span className="font-semibold text-foreground">{selectedClientForApproval.name}</span> for signature.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-0">
                        {clientApprovalDocs.length > 0 ? (
                            <div className="divide-y divide-border">
                                {clientApprovalDocs.map(doc => {
                                    const data = doc.data as any;
                                    const title = data.title || data.estimateNumber || data.changeOrderNumber || doc.type;
                                    const date = new Date(doc.createdAt).toLocaleDateString();
                                    const status = data.status || 'Draft';
                                    
                                    return (
                                        <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`p-2 rounded-lg shrink-0 ${doc.type === FormType.Estimate ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {doc.type === FormType.Estimate ? <EstimateIcon className="w-5 h-5" /> : <ChangeOrderIcon className="w-5 h-5" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-sm truncate">{title}</p>
                                                    <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                                                        <span>{date}</span>
                                                        <span className={`font-medium ${status === 'Accepted' ? 'text-green-600' : 'text-slate-500'}`}>{status}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <Button 
                                                size="sm" 
                                                variant="outline" 
                                                onClick={() => copyApprovalLink(doc)}
                                                className={`text-xs ml-2 shrink-0 ${approvalCopiedDocId === doc.id ? 'border-green-500 text-green-600 bg-green-50' : ''}`}
                                            >
                                                {approvalCopiedDocId === doc.id ? <CheckIcon className="w-3.5 h-3.5 mr-1" /> : <CopyIcon className="w-3.5 h-3.5 mr-1" />}
                                                {approvalCopiedDocId === doc.id ? 'Copied' : 'Copy Link'}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-8 text-center text-muted-foreground">
                                <p>No Estimates or Change Orders found for this client.</p>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="bg-muted/20 border-t border-border p-4 flex flex-col sm:flex-row gap-3">
                        <Button className="flex-1 w-full" onClick={() => handleCreateNew(FormType.Estimate)}>
                            <PlusIcon className="w-4 h-4 mr-2" /> New Estimate
                        </Button>
                        <Button className="flex-1 w-full" variant="secondary" onClick={() => handleCreateNew(FormType.ChangeOrder)}>
                            <PlusIcon className="w-4 h-4 mr-2" /> New Change Order
                        </Button>
                    </CardFooter>
                </Card>
             </div>
        )}
    </div>
  );
};

export default ClientsView;
