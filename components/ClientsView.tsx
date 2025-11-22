
import React, { useState, useEffect } from 'react';
import type { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { BackArrowIcon, SearchIcon, PlusIcon, TrashIcon } from './Icons.tsx';

interface ClientsViewProps {
  onBack: () => void;
  supabase: any;
  session: any;
  // New props for offline handling
  clients?: Client[];
  onAddClient?: (client: any) => Promise<void>;
  onDeleteClient?: (id: string) => Promise<void>;
  isOnline?: boolean;
}

const ClientsView: React.FC<ClientsViewProps> = ({ onBack, supabase, session, clients: propClients, onAddClient, onDeleteClient, isOnline }) => {
  // Fallback to local state if props aren't provided (backwards compatibility)
  const [localClients, setLocalClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newClient, setNewClient] = useState<Partial<Client>>({
      name: '',
      email: '',
      phone: '',
      address: '',
      notes: ''
  });

  // Use props if available, otherwise local state (legacy mode)
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
          if (!error.message.includes('relation "public.clients" does not exist')) {
             // alert(`Error fetching clients: ${error.message}`);
          }
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
          // Legacy direct call
          const { error } = await supabase
              .from('clients')
              .insert([{ ...newClient, user_id: session.user.id }]);
          
          if (error) {
              console.error('Error adding client:', error);
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
              console.error('Error deleting client:', error);
              alert(`Failed to delete client: ${error.message}`);
          }
          else fetchClients();
      }
  };

  const filteredClients = activeClients.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8 pb-24">
        <header className="flex justify-between items-center mb-8 border-b border-border pb-4 gap-4">
             <div className="flex items-center gap-4">
                 <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center" aria-label="Back">
                    <BackArrowIcon className="h-9 w-9" />
                </Button>
                <h1 className="text-2xl md:text-3xl font-bold">Clients</h1>
            </div>
            {isOnline === false && <div className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-bold">Offline</div>}
            <Button onClick={() => setShowAddModal(true)}><PlusIcon className="w-4 h-4 mr-2"/> Add Client</Button>
        </header>

        {/* Search Bar */}
        <div className="relative mb-6 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input 
                placeholder="Search clients..." 
                className="pl-10" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
        </div>

        {/* Client List */}
        {loading && activeClients.length === 0 ? (
            <div className="text-center p-10">Loading...</div>
        ) : filteredClients.length === 0 ? (
            <div className="text-center p-10 text-muted-foreground">No clients found.</div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredClients.map(client => (
                    <Card key={client.id} className="relative group">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{client.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-1">
                            {client.email && <p className="text-muted-foreground">{client.email}</p>}
                            {client.phone && <p className="text-muted-foreground">{client.phone}</p>}
                            {client.address && <p className="text-muted-foreground truncate">{client.address}</p>}
                        </CardContent>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)} className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0">
                                <TrashIcon className="w-4 h-4" />
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>
        )}

        {/* Add Client Modal */}
        {showAddModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
                <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
                    <CardHeader>
                        <CardTitle>Add New Client</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div><Label>Name</Label><Input value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} /></div>
                        <div><Label>Email</Label><Input value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} /></div>
                        <div><Label>Phone</Label><Input value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})} /></div>
                        <div><Label>Address</Label><Input value={newClient.address} onChange={e => setNewClient({...newClient, address: e.target.value})} /></div>
                        <div><Label>Notes</Label><Input value={newClient.notes} onChange={e => setNewClient({...newClient, notes: e.target.value})} /></div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
                        <Button onClick={handleAdd} disabled={loading}>{loading ? 'Saving...' : 'Add Client'}</Button>
                    </CardFooter>
                </Card>
            </div>
        )}
    </div>
  );
};

export default ClientsView;
