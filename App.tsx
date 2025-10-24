import React, { useState } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage.ts';
import type { UserProfile, Job, FormData, FormType } from './types.ts';
import Settings from './components/Settings.tsx';
import SelectDocType from './components/SelectDocType.tsx';
import InvoiceForm from './components/InvoiceForm.tsx';
import DailyJobReportForm from './components/DailyJobReportForm.tsx';
import NoteForm from './components/NoteForm.tsx';
import Dock from './components/Dock.tsx';
import { HomeIcon, PlusIcon, SettingsIcon, DocumentIcon } from './components/Icons.tsx';

// Dummy data for initial state
const initialProfile: UserProfile = {
  id: 'user1', email: 'contractor@example.com', name: 'John Doe', companyName: 'JD Contracting', logoUrl: '',
  address: '123 Main St, Anytown, USA', phone: '555-123-4567', website: 'www.jdcontracting.com'
};
const initialJobs: Job[] = [];
const initialForms: FormData[] = [];


const App: React.FC = () => {
  const [profile, setProfile] = useLocalStorage<UserProfile>('user-profile', initialProfile);
  const [jobs, setJobs] = useLocalStorage<Job[]>('jobs', initialJobs);
  const [forms, setForms] = useLocalStorage<FormData[]>('forms', initialForms);

  const [screen, setScreen] = useState<'documents' | 'settings' | 'selectDoc' | 'editForm'>('documents');
  const [activeForm, setActiveForm] = useState<FormData | null>(null);
  const [newFormType, setNewFormType] = useState<FormType | null>(null);
  
  // A dummy job for context, since the job layer was removed but forms still need a job ID.
  const getDummyJob = (): Job => {
    if (jobs.length > 0) return jobs[0];
    const newJob: Job = { 
      id: 'job1', userId: profile.id, name: 'General Work', clientName: 'Default Client', 
      clientAddress: '123 Client St', startDate: new Date().toISOString().split('T')[0], endDate: null, status: 'active' 
    };
    setJobs([newJob]);
    return newJob;
  };

  const handleSaveForm = (formData: FormData['data']) => {
    if (activeForm) { // Editing existing form
      setForms(forms.map(f => f.id === activeForm.id ? { ...f, data: formData } : f));
    } else if (newFormType) { // Creating new form
      const newForm: FormData = {
        id: crypto.randomUUID(),
        jobId: getDummyJob().id,
        type: newFormType,
        createdAt: new Date().toISOString(),
        data: formData,
      };
      setForms([...forms, newForm]);
    }
    setActiveForm(null);
    setNewFormType(null);
    setScreen('documents');
  };

  const handleSelectDocType = (type: FormType) => {
    setNewFormType(type);
    setActiveForm(null);
    setScreen('editForm');
  };

  const handleEditForm = (form: FormData) => {
    setActiveForm(form);
    setNewFormType(form.type);
    setScreen('editForm');
  };
  
  const renderForm = () => {
    const formType = activeForm?.type || newFormType;
    if (!formType) return <p>Error: No form type selected.</p>;
    
    const job = jobs.find(j => j.id === activeForm?.jobId) || getDummyJob();

    switch (formType) {
        case 'Invoice':
            return <InvoiceForm 
                        job={job} 
                        userProfile={profile} 
                        invoice={activeForm?.data as any} 
                        onSave={handleSaveForm} 
                        onClose={() => setScreen('documents')} 
                    />
        case 'Daily Job Report':
            return <DailyJobReportForm 
                        profile={profile}
                        report={activeForm?.data as any}
                        onSave={handleSaveForm}
                        onBack={() => setScreen('documents')}
                    />
        case 'Note':
            return <NoteForm
                        profile={profile}
                        job={job}
                        note={activeForm?.data as any}
                        onSave={handleSaveForm}
                        onBack={() => setScreen('documents')}
                    />
        default:
            // Placeholder for other forms
            return (
                <div className="w-full h-full flex flex-col items-center justify-center bg-background text-foreground">
                    <h2 className="text-2xl font-bold mb-4">{formType}</h2>
                    <p className="text-muted-foreground mb-8">This form is coming soon!</p>
                    <button onClick={() => setScreen('documents')} className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                        Back to Documents
                    </button>
                </div>
            )
    }
  }

  const renderScreen = () => {
    switch (screen) {
      case 'settings':
        return <Settings profile={profile} setProfile={setProfile} onBack={() => setScreen('documents')} />;
      case 'selectDoc':
        return <SelectDocType onSelect={handleSelectDocType} onBack={() => setScreen('documents')} />;
      case 'editForm':
        return renderForm();
      case 'documents':
      default:
        return (
          <div className="p-4 md:p-8 w-full">
            <header className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold text-foreground">{profile.companyName}</h1>
            </header>
            {forms.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center h-[60vh]">
                <DocumentIcon className="w-24 h-24 text-muted-foreground/50 mb-4" />
                <h2 className="text-xl font-semibold text-foreground">No documents yet</h2>
                <p className="text-muted-foreground">Tap + to create your first document</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {forms.map(form => (
                  <button key={form.id} onClick={() => handleEditForm(form)} className="bg-card p-4 rounded-lg shadow-md text-left border border-border hover:border-primary transition-colors">
                    <h3 className="font-bold text-card-foreground">{form.type}</h3>
                    <p className="text-sm text-muted-foreground">{new Date(form.createdAt).toLocaleDateString()}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="w-full h-screen font-sans bg-background text-foreground flex flex-col">
      <main className="flex-1 pb-24">
        {renderScreen()}
      </main>
      {screen === 'documents' && <Dock items={[
        { icon: HomeIcon, label: 'Home', onClick: () => setScreen('documents') },
        { icon: PlusIcon, label: 'Add New', onClick: () => setScreen('selectDoc') },
        { icon: SettingsIcon, label: 'Settings', onClick: () => setScreen('settings') }
      ]} />}
    </div>
  );
};

export default App;