
import React, { useState, useEffect } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage.ts';
// FIX: Removed 'type' from import to allow 'FormType' enum to be used as a value.
import { UserProfile, Job, FormData as FormDataType, FormType, InvoiceData, DailyJobReportData, NoteData } from './types.ts';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import Login from './components/Login.tsx';
import Signup from './components/Signup.tsx';
import SelectDocType from './components/SelectDocType.tsx';
import InvoiceForm from './components/InvoiceForm.tsx';
import DailyJobReportForm from './components/DailyJobReportForm.tsx';
import NoteForm from './components/NoteForm.tsx';
import Settings from './components/Settings.tsx';
import Dock from './components/Dock.tsx';
import { HomeIcon, SettingsIcon, PlusIcon, GoogleIcon } from './components/Icons.tsx';
import { Button } from './components/ui/Button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/Card.tsx';

// --- IMPORTANT: CONFIGURE YOUR SUPABASE CREDENTIALS ---
// You can get these from your Supabase project dashboard at https://app.supabase.com
const supabaseUrl = 'https://iauteblvljppwzsxloyd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdXRlYmx2bGpwcHd6c3hsb3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1OTk0MTIsImV4cCI6MjA3NjE3NTQxMn0.W2Xu9TuO6odsnF5eK7iLPqV4KB0wVWXzmM2ofnKZw70';

// Helper to check if credentials are placeholders
const areCredentialsPlaceholders = !supabaseAnonKey || supabaseAnonKey.includes('YOUR_SUPABASE');

// Initialize Supabase client
const supabase: SupabaseClient | null = areCredentialsPlaceholders ? null : (window as any).supabase.createClient(supabaseUrl, supabaseAnonKey);

const initialProfile: UserProfile = {
  id: 'user123',
  email: 'contractor@example.com',
  name: 'John Doe',
  companyName: 'Doe Construction',
  logoUrl: '',
  address: '123 Main St, Anytown, USA',
  phone: '555-123-4567',
  website: 'www.doeconstruction.com'
};

const initialJobs: Job[] = [
  {
    id: 'job1',
    userId: 'user123',
    name: 'Kitchen Remodel',
    clientName: 'Jane Smith',
    clientAddress: '456 Oak Ave, Anytown, USA',
    startDate: '2023-10-01',
    endDate: null,
    status: 'active'
  }
];

const ConfigurationWarning = () => (
  <div className="flex items-center justify-center min-h-screen bg-background p-4">
    <Card className="max-w-lg w-full">
      <CardHeader>
        <CardTitle className="text-destructive">Configuration Needed</CardTitle>
        <CardDescription>
          You need to add your Supabase credentials to get started.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>Please open the file <code className="bg-muted px-2 py-1 rounded-md text-sm">App.tsx</code> in your editor.</p>
        <p>Find the following lines and replace the placeholder values with your actual Supabase Project URL and Anon Key:</p>
        <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
          <code>
            const supabaseUrl = 'YOUR_SUPABASE_URL';<br />
            const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
          </code>
        </pre>
        <p>You can find these in your Supabase project's dashboard under <span className="font-semibold">Project Settings &gt; API</span>.</p>
      </CardContent>
    </Card>
  </div>
);

const App: React.FC = () => {
  type AppView = 
    | { screen: 'auth'; authScreen: 'login' | 'signup' | 'checkEmail' }
    | { screen: 'dashboard' }
    | { screen: 'selectDocType'; jobId: string }
    | { screen: 'form'; formType: FormType; jobId: string; formId: string | null }
    | { screen: 'settings' };
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AppView>({ screen: 'auth', authScreen: 'login' });
  
  const [profile, setProfile] = useLocalStorage<UserProfile>('userProfile', initialProfile);
  const [jobs, setJobs] = useLocalStorage<Job[]>('jobs', initialJobs);
  const [forms, setForms] = useLocalStorage<FormDataType[]>('forms', []);

  useEffect(() => {
    if (!supabase) return;

    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session) {
        setView({ screen: 'dashboard' });
      }
      setLoading(false);
    };
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setView({ screen: 'dashboard' });
      } else {
        setView({ screen: 'auth', authScreen: 'login' });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Auth Handlers ---
  const handleLogin = async (email: string, pass: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email: email, password: pass });
    if (error) throw error;
  };
  
  const handleSignup = async (email: string, pass: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signUp({ email: email, password: pass });
    if (error) throw error;
    setView({ screen: 'auth', authScreen: 'checkEmail' });
  };
  
  const handleLoginWithGoogle = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };
  
  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  // --- Navigation Handlers ---
  const navigateToDashboard = () => setView({ screen: 'dashboard' });
  const navigateToSettings = () => setView({ screen: 'settings' });
  const navigateToNewDoc = (jobId: string) => setView({ screen: 'selectDocType', jobId });
  
  // --- Data Handlers ---
  const handleSaveForm = (formData: any) => {
    if (view.screen !== 'form') return;
    
    let formToSave = forms.find(f => f.id === view.formId);
    if (formToSave) {
        const updatedForms = forms.map(f => f.id === view.formId ? {...f, data: formData} : f);
        setForms(updatedForms);
    } else {
        const newForm: FormDataType = {
            id: crypto.randomUUID(),
            jobId: view.jobId,
            type: view.formType,
            createdAt: new Date().toISOString(),
            data: formData,
        };
        setForms(prev => [...prev, {...newForm, data: formData}]);
    }
    
    navigateToDashboard();
  };
  
  // --- Render Logic ---
  const renderAuth = () => {
    if (view.screen !== 'auth') return null;
    switch(view.authScreen) {
      case 'login':
        return <Login onLogin={handleLogin} onLoginWithGoogle={handleLoginWithGoogle} onSwitchToSignup={() => setView({ screen: 'auth', authScreen: 'signup' })} />;
      case 'signup':
        return <Signup onSignup={handleSignup} onLoginWithGoogle={handleLoginWithGoogle} onSwitchToLogin={() => setView({ screen: 'auth', authScreen: 'login' })} />;
      case 'checkEmail':
        return (
          <div className="flex items-center justify-center min-h-screen bg-background">
            <Card className="w-full max-w-sm text-center">
              <CardHeader>
                <CardTitle>Check your email</CardTitle>
              </CardHeader>
              <CardContent>
                <p>We've sent a confirmation link to your email address. Please click the link to complete your registration.</p>
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  const renderDashboard = () => {
    const activeJob = jobs[0]; // For simplicity, always use the first job
    return (
      <div className="w-full min-h-screen bg-background text-foreground p-4 md:p-8">
        <header className="flex justify-between items-center mb-8">
            <h1 className="text-2xl md:text-3xl font-bold">Welcome, {profile.name}!</h1>
            <Button onClick={handleLogout} variant="outline">Logout</Button>
        </header>

        <Card>
            <CardHeader>
                <CardTitle>{activeJob.name}</CardTitle>
                <CardDescription>{activeJob.clientName} - {activeJob.clientAddress}</CardDescription>
            </CardHeader>
            <CardContent>
                <h3 className="font-semibold mb-4">Project Documents</h3>
                <div className="space-y-2">
                    {forms.filter(f => f.jobId === activeJob.id).length === 0 && (
                        <p className="text-muted-foreground">No documents yet. Click the '+' icon to create one.</p>
                    )}
                    {forms.filter(f => f.jobId === activeJob.id).map(form => (
                        <div key={form.id} className="flex justify-between items-center p-3 rounded-md bg-muted">
                            <span>{form.type} - {new Date(form.createdAt).toLocaleDateString()}</span>
                            <Button variant="ghost" size="sm" onClick={() => setView({ screen: 'form', formType: form.type, jobId: activeJob.id, formId: form.id })}>Edit</Button>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
      </div>
    );
  };
  
  const renderForm = () => {
    if (view.screen !== 'form') return null;

    const { formType, jobId, formId } = view;
    const job = jobs.find(j => j.id === jobId);
    const form = forms.find(f => f.id === formId);

    if (!job) return <div>Job not found!</div>;

    switch (formType) {
      case FormType.Invoice:
        return <InvoiceForm job={job} userProfile={profile} invoice={form?.data as InvoiceData | null} onSave={handleSaveForm} onClose={navigateToDashboard} />;
      case FormType.DailyJobReport:
        return <DailyJobReportForm profile={profile} report={form?.data as DailyJobReportData | null} onSave={handleSaveForm} onBack={navigateToDashboard} />;
      case FormType.Note:
        return <NoteForm profile={profile} job={job} note={form?.data as NoteData | null} onSave={handleSaveForm} onBack={navigateToDashboard} />;
      default:
        return (
          <div className="p-8">
            <h2 className="text-2xl mb-4">{formType} form is not implemented.</h2>
            <Button onClick={navigateToDashboard}>Back to Dashboard</Button>
          </div>
        );
    }
  };
  
  const renderContent = () => {
    if (areCredentialsPlaceholders) {
      return <ConfigurationWarning />;
    }
    
    if (loading) {
      return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!session) {
      return renderAuth();
    }
    
    switch (view.screen) {
      case 'dashboard':
        return renderDashboard();
      case 'selectDocType': {
        const activeJob = jobs.find(j => j.id === view.jobId);
        if (!activeJob) return <div>Error: Job not found</div>
        return <SelectDocType onSelect={(type) => setView({ screen: 'form', formType: type, jobId: activeJob.id, formId: null })} onBack={navigateToDashboard} />;
      }
      case 'form':
        return renderForm();
      case 'settings':
        return <Settings profile={profile} setProfile={setProfile} onBack={navigateToDashboard} />;
      default:
        return renderDashboard();
    }
  };

  return (
    <main className="w-full min-h-screen bg-background">
      {renderContent()}
      {session && view.screen === 'dashboard' && (
        <Dock items={[
          { icon: HomeIcon, label: 'Dashboard', onClick: navigateToDashboard },
          { icon: PlusIcon, label: 'New Document', onClick: () => navigateToNewDoc(jobs[0].id) },
          { icon: SettingsIcon, label: 'Settings', onClick: navigateToSettings },
        ]} />
      )}
    </main>
  );
};

export default App;
