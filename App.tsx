
import React, { useState, useEffect } from 'react';
import { FormType } from './types.ts';
import type { UserProfile, Job, FormData as FormDataType, InvoiceData, DailyJobReportData, NoteData, WorkOrderData, TimeSheetData, MaterialLogData, EstimateData, ExpenseLogData, WarrantyData, ReceiptData } from './types.ts';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import Login from './components/Login.tsx';
import Signup from './components/Signup.tsx';
import SelectDocType from './components/SelectDocType.tsx';
import InvoiceForm from './components/InvoiceForm.tsx';
import DailyJobReportForm from './components/DailyJobReportForm.tsx';
import NoteForm from './components/NoteForm.tsx';
import WorkOrderForm from './components/WorkOrderForm.tsx';
import TimeSheetForm from './components/TimeSheetForm.tsx';
import MaterialLogForm from './components/MaterialLogForm.tsx';
import EstimateForm from './components/EstimateForm.tsx';
import ExpenseLogForm from './components/ExpenseLogForm.tsx';
import WarrantyForm from './components/WarrantyForm.tsx';
import ReceiptForm from './components/ReceiptForm.tsx';

import Settings from './components/Settings.tsx';
import ClientsView from './components/ClientsView.tsx';
import Dock from './components/Dock.tsx';
import JobForm from './components/JobForm.tsx';
import Welcome from './components/Welcome.tsx';
import { HomeIcon, SettingsIcon, PlusIcon, BackArrowIcon, UserIcon, AppLogo, SearchIcon, UsersIcon, CheckCircleIcon, XCircleIcon, ClockIcon, CreditCardIcon, InvoiceIcon, DailyReportIcon, TimeSheetIcon, MaterialLogIcon, EstimateIcon, ExpenseLogIcon, WarrantyIcon, NoteIcon, ReceiptIcon, WorkOrderIcon } from './components/Icons.tsx';
import { Button } from './components/ui/Button.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/Card.tsx';
import { Label } from './components/ui/Label.tsx';
import { Input } from './components/ui/Input.tsx';
import { translations } from './utils/translations.ts';

// --- IMPORTANT: CONFIGURE YOUR SUPABASE CREDENTIALS ---
// You can get these from your Supabase project dashboard at https://app.supabase.com
const supabaseUrl = 'https://iauteblvljppwzsxloyd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdXRlYmx2bGpwcHd6c3hsb3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1OTk0MTIsImV4cCI6MjA3NjE3NTQxMn0.W2Xu9TuO6odsnF5eK7iLPqV4KB0wVWXzmM2ofnKZw70';

// Initialize Supabase client
const supabase: SupabaseClient = (window as any).supabase.createClient(supabaseUrl, supabaseAnonKey);

const SQL_SETUP_SCRIPT = `-- This script sets up your database schema for the Contractor AI application.
-- Run this script in your Supabase SQL Editor.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- WARNING: Drops existing tables to fix schema mismatches (e.g. bigint vs uuid, missing columns). 
-- This will DELETE ALL DATA in these tables.
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.jobs CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS "public"."Users documents" CASCADE; -- Clean up conflicting table names
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;

-- 1. Create PROFILES table
-- This table stores user data and is linked to Supabase's built-in auth.users table.
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  company_name TEXT,
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  job_title TEXT,
  subscription_tier TEXT DEFAULT 'Basic',
  language TEXT DEFAULT 'English',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.profiles IS 'Stores public profile information for each user.';

-- 2. Set up Row Level Security (RLS) for the profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile." ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile." ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile." ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 3. Function to create a profile for a new user automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, company_name, language)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'company_name', (SPLIT_PART(NEW.email, '@', 1) || '''s Company')),
    'English'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger to call the function when a new user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. Create CLIENTS table
CREATE TABLE public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own clients" ON public.clients
  FOR ALL USING (auth.uid() = user_id);
  
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);

-- 6. Create JOBS table
-- This table stores job/project information.
CREATE TABLE public.jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_name TEXT,
  client_address TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.jobs IS 'Stores job or project information for users.';

-- 7. Set up RLS for the jobs table
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own jobs." ON public.jobs
  FOR ALL USING (auth.uid() = user_id);
  
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);

-- 8. Create DOCUMENTS table
-- This table stores all forms and documents related to jobs.
CREATE TABLE public.documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.documents IS 'Stores all documents like invoices, reports, etc., related to a job.';

-- 9. Set up RLS for the documents table
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Explicit policies for better control and debugging
CREATE POLICY "Users can select their own documents" ON public.documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents" ON public.documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents" ON public.documents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents" ON public.documents
  FOR DELETE USING (auth.uid() = user_id);
  
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_job_id ON public.documents(job_id);

-- 10. Create Storage bucket for logos
-- This part must be done from the Supabase Dashboard UI.
-- Go to Storage -> Create a new bucket.
-- Enter "logos" as the bucket name and mark it as a Public bucket.
-- After creating the bucket, run the policies below in the SQL Editor.

INSERT INTO storage.buckets (id, name, public) 
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- 11. Add RLS policies for the "logos" bucket
-- Drop existing policies first to prevent errors on re-run
DROP POLICY IF EXISTS "Allow authenticated view access to logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to upload their own logo" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own logo" ON storage.objects;

CREATE POLICY "Allow authenticated view access to logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

CREATE POLICY "Allow users to upload their own logo"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Allow users to update their own logo"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]);

`;

const DbSetupScreen: React.FC<{ sqlScript: string }> = ({ sqlScript }) => (
  <div className="flex items-center justify-center min-h-screen bg-background p-4 md:p-8">
    <Card className="max-w-4xl w-full animate-fade-in-down">
      <CardHeader>
        <CardTitle className="text-2xl text-destructive">Database Setup Required</CardTitle>
        <CardDescription>
          It looks like your database tables are missing, outdated, or have a schema mismatch (e.g., missing columns). 
          To fix this, please run the following SQL script in your Supabase project's SQL Editor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
            <div>
                <Label htmlFor="sql-script">SQL Setup Script</Label>
                <textarea
                    id="sql-script"
                    readOnly
                    value={sqlScript}
                    className="mt-1 w-full h-64 p-2 font-mono text-xs bg-muted rounded-md border focus:ring-2 focus:ring-primary"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
            </div>
             <div>
                <h4 className="font-semibold">How to Run This Script:</h4>
                <ol className="list-decimal list-inside text-sm text-muted-foreground mt-2 space-y-1">
                    <li>Go to your <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Supabase project dashboard</a>.</li>
                    <li>In the left sidebar, find and click the <strong>SQL Editor</strong> icon.</li>
                    <li>Click <strong>+ New query</strong>.</li>
                    <li>Copy the entire script from the text box above and paste it into the editor.</li>
                    <li>Click the <strong>Run</strong> button (or use Cmd/Ctrl + Enter).</li>
                    <li>Once the script finishes successfully, come back here and click the refresh button below.</li>
                </ol>
            </div>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-center gap-4">
        <Button onClick={() => window.location.reload()} className="w-full">
          I've run the script, Refresh Page
        </Button>
      </CardFooter>
    </Card>
  </div>
);


// Helper to upload a file to Supabase Storage
const uploadFile = async (bucket: string, file: File, userId: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });
    if (error) {
        console.error('Error uploading file:', error);
        throw error;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
};

const App: React.FC = () => {
  type AppView = 
    | { screen: 'welcome' }
    | { screen: 'auth'; authScreen: 'login' | 'signup' | 'checkEmail' }
    | { screen: 'dashboard' }
    | { screen: 'jobDetails'; jobId: string }
    | { screen: 'createJob' }
    | { screen: 'selectDocType'; jobId: string }
    | { screen: 'form'; formType: FormType; jobId: string; formId: string | null }
    | { screen: 'settings' }
    | { screen: 'profile' }
    | { screen: 'clients' }; 
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [view, setView] = useState<AppView>({ screen: 'welcome' });
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [forms, setForms] = useState<FormDataType[]>([]);

  const [dbSetupError, setDbSetupError] = useState<string | null>(null);
  
  // Theme Management
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
  });

  // Dashboard specific state
  const [searchQuery, setSearchQuery] = useState('');
  const [docSearchQuery, setDocSearchQuery] = useState('');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
          setLoading(false);
          // View stays as 'welcome' by default
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
       if (!session) {
        setProfile(null);
        setJobs([]);
        setForms([]);
        setView({ screen: 'welcome' });
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);
  
  useEffect(() => {
    const fetchData = async () => {
        if (!session) return;
        setLoading(true);

        const user = session.user;
        
        // 1. Fetch or create profile
        setLoadingMessage('Loading profile...');
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError && profileError.code !== 'PGRST116') { 
            console.error('Error fetching profile:', profileError.message);
            // Check for schema-related errors
            if (/relation "public.profiles" does not exist|invalid input syntax for type bigint|Could not find the table 'public.profiles'|schema cache/i.test(profileError.message)) {
                setDbSetupError(SQL_SETUP_SCRIPT);
                setLoading(false);
                return;
            }
        }

        let currentProfile: UserProfile | null = null;
        if (profileData) {
            currentProfile = {
                id: profileData.id,
                email: profileData.email,
                name: profileData.name,
                companyName: profileData.company_name,
                logoUrl: profileData.logo_url,
                address: profileData.address,
                phone: profileData.phone,
                website: profileData.website,
                jobTitle: profileData.job_title,
                subscriptionTier: profileData.subscription_tier as 'Basic' | 'Premium',
                language: profileData.language
            };
        } else if (!profileError || profileError.code === 'PGRST116') {
            setLoadingMessage('Creating your account...');
            
            // Try to get name from metadata (Google/OAuth), otherwise fallback to email
            const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
            const metaAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
            let nameToSet = metaName;

            if (!nameToSet) {
                const namePart = user.email!.split('@')[0];
                nameToSet = namePart.replace(/[._-]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            }
            
            const { data: newProfileData, error: createError } = await supabase
                .from('profiles')
                .insert({
                    id: user.id,
                    email: user.email,
                    name: nameToSet,
                    company_name: `${nameToSet}'s Company`,
                    logo_url: metaAvatar,
                })
                .select()
                .single();

            if (createError) {
                 console.error("Error creating profile:", createError.message);
                 if (/Could not find the 'email' column|relation "public.profiles" does not exist|invalid input syntax for type bigint|schema cache/i.test(createError.message)) {
                     setDbSetupError(SQL_SETUP_SCRIPT);
                     setLoading(false);
                     return;
                 }
            } else if (newProfileData) {
                currentProfile = {
                    id: newProfileData.id,
                    email: newProfileData.email,
                    name: newProfileData.name,
                    companyName: newProfileData.company_name,
                    logoUrl: newProfileData.logo_url,
                    address: newProfileData.address,
                    phone: newProfileData.phone,
                    website: newProfileData.website,
                    jobTitle: newProfileData.job_title,
                    subscriptionTier: newProfileData.subscription_tier as 'Basic' | 'Premium',
                    language: newProfileData.language
                };
            }
        }
        setProfile(currentProfile);

        // 2. Fetch or create jobs
        setLoadingMessage('Loading jobs...');
        const { data: jobsData, error: jobsError } = await supabase.from('jobs').select('*').eq('user_id', user.id);
        
        if (jobsError) {
             console.error('Error fetching jobs:', jobsError.message);
             if (/relation "public.jobs" does not exist|invalid input syntax for type bigint|Could not find the table 'public.jobs'|schema cache/i.test(jobsError.message)) {
                setDbSetupError(SQL_SETUP_SCRIPT);
                setLoading(false);
                return;
            }
        } else if (jobsData && jobsData.length > 0) {
            setJobs(jobsData.map(j => ({...j, startDate: j.start_date, endDate: j.end_date, clientName: j.client_name, clientAddress: j.client_address, userId: j.user_id})));
        } else {
            setLoadingMessage('Creating first project...');
            const { data: newJobData, error: createJobError } = await supabase
                .from('jobs')
                .insert({ user_id: user.id, name: 'My First Project', client_name: 'Jane Smith', client_address: '456 Oak Ave, Anytown, USA', start_date: new Date().toISOString().split('T')[0], status: 'active' })
                .select();
            if (createJobError) {
                 console.error('Error creating job:', createJobError.message);
                 if (/relation "public.jobs" does not exist|invalid input syntax for type bigint|schema cache/i.test(createJobError.message)) {
                    setDbSetupError(SQL_SETUP_SCRIPT);
                    setLoading(false);
                    return;
                 }
            }
            else if (newJobData) setJobs(newJobData.map(j => ({...j, startDate: j.start_date, endDate: j.end_date, clientName: j.client_name, clientAddress: j.client_address, userId: j.user_id})));
        }

        // 3. Fetch forms
        setLoadingMessage('Loading documents...');
        const { data: formsData, error: formsError } = await supabase.from('documents').select('*').eq('user_id', user.id);
        if (formsError) {
            console.error('Error fetching documents:', formsError.message);
            if (/relation "public.documents" does not exist|invalid input syntax for type bigint|Could not find the table 'public.documents'|schema cache/i.test(formsError.message)) {
                setDbSetupError(SQL_SETUP_SCRIPT);
                setLoading(false);
                return;
            }
        } else setForms(formsData?.map(f => ({...f, jobId: f.job_id, createdAt: f.created_at })) || []);
        
        // 4. Check for clients table (lightweight check)
        setLoadingMessage('Checking database...');
        const { error: clientsError } = await supabase.from('clients').select('id').limit(1);
        if (clientsError) {
            // If clients table missing, suggest setup
            if (/relation "public.clients" does not exist|schema cache/i.test(clientsError.message)) {
                setDbSetupError(SQL_SETUP_SCRIPT);
                setLoading(false);
                return;
            }
        }

        setView({ screen: 'dashboard' });
        setLoading(false);
    };
    fetchData();
  }, [session]);


  // --- Auth Handlers ---
  const handleLogin = async (email: string, pass: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email, password: pass });
    if (error) throw error;
  };
  
  const handleSignup = async (email: string, pass: string) => {
    const { error } = await supabase.auth.signUp({ email: email, password: pass });
    if (error) throw error;
    setView({ screen: 'auth', authScreen: 'checkEmail' });
  };
  
  const handleLoginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ 
        provider: 'google',
        options: {
            redirectTo: window.location.origin,
        },
    });
  };
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setView({ screen: 'welcome' });
  };

  // --- Navigation Handlers ---
  const navigateToDashboard = () => setView({ screen: 'dashboard' });
  const navigateToSettings = () => setView({ screen: 'settings' });
  const navigateToNewDoc = (jobId: string) => setView({ screen: 'selectDocType', jobId });
  const navigateToCreateJob = () => setView({ screen: 'createJob' });
  const navigateToClients = () => setView({ screen: 'clients' });
  
  // --- Data Handlers ---
  const handleSaveProfile = async (updatedProfile: UserProfile, logoFile?: File | null) => {
      if (!session) return;
      setLoading(true);
      setLoadingMessage('Saving profile...');

      let newLogoUrl = updatedProfile.logoUrl;
      if (logoFile) {
          try {
              newLogoUrl = await uploadFile('logos', logoFile, session.user.id) || newLogoUrl;
          } catch (error) {
              console.error('Logo upload failed:', error);
              setLoading(false);
              return;
          }
      }

      const profileForDb = {
          id: session.user.id,
          name: updatedProfile.name,
          company_name: updatedProfile.companyName,
          email: updatedProfile.email,
          phone: updatedProfile.phone,
          address: updatedProfile.address,
          website: updatedProfile.website,
          logo_url: newLogoUrl,
          job_title: updatedProfile.jobTitle,
          language: updatedProfile.language,
          updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('profiles').upsert(profileForDb).select().single();

      if (error) {
          console.error('Error saving profile:', JSON.stringify(error, null, 2));
           if (/Could not find the|relation "public.profiles" does not exist|invalid input syntax|schema cache|column.*does not exist/i.test(error.message)) {
              setDbSetupError(SQL_SETUP_SCRIPT);
           } else {
              alert(`Error saving profile: ${error.message}`);
           }
      } else if (data) {
          setProfile({
              id: data.id,
              email: data.email,
              name: data.name,
              companyName: data.company_name,
              logoUrl: data.logo_url,
              address: data.address,
              phone: data.phone,
              website: data.website,
              jobTitle: data.job_title,
              subscriptionTier: data.subscription_tier as 'Basic' | 'Premium',
              language: data.language
          });
          setView({ screen: 'dashboard' });
      }
      setLoading(false);
  };

  const handleSaveJob = async (jobData: Omit<Job, 'id' | 'userId' | 'endDate' | 'status'>) => {
    if (!session) return;
    setLoading(true);
    setLoadingMessage('Creating new job...');
    
    const { error } = await supabase.from('jobs').insert({
      user_id: session.user.id,
      name: jobData.name,
      client_name: jobData.clientName,
      client_address: jobData.clientAddress,
      start_date: jobData.startDate,
      status: 'active',
    });

    if (error) {
      console.error('Error creating job:', error);
    } else {
      const { data: jobsData, error: jobsError } = await supabase.from('jobs').select('*').eq('user_id', session.user.id);
      if (jobsError) console.error('Error refetching jobs:', jobsError.message);
      else if (jobsData) setJobs(jobsData.map(j => ({...j, startDate: j.start_date, endDate: j.end_date, clientName: j.client_name, clientAddress: j.client_address, userId: j.user_id})));
    }
    
    setView({ screen: 'dashboard' });
    setLoading(false);
  };

  const handleSaveForm = async (formData: any) => {
    if (view.screen !== 'form' || !session) return;
    
    setLoading(true);
    setLoadingMessage('Saving document...');

    const formRecord: any = {
      user_id: session.user.id,
      job_id: view.jobId,
      type: view.formType,
      data: formData,
    };

    if (view.formId) {
        formRecord.id = view.formId;
    }

    const { error } = await supabase.from('documents').upsert(formRecord);

    if (error) {
      console.error('Error saving document:', error);
      if (/policy|permission|relation|column/i.test(error.message)) {
          alert(`Error saving document: ${error.message}. Please check database setup.`);
      }
    } else {
      const { data: formsData, error: formsError } = await supabase.from('documents').select('*').eq('user_id', session.user.id);
      if (formsError) console.error(formsError);
      else setForms(formsData?.map(f => ({...f, jobId: f.job_id, createdAt: f.created_at })) || []);
    }
    
    setView({ screen: 'jobDetails', jobId: view.jobId });
    setLoading(false);
  };
  
  // Get translation helper
  const getTranslation = () => {
      const lang = profile?.language || 'English';
      return translations[lang] || translations['English'];
  }

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
    if (!profile) return null;
    const t = getTranslation();

    const filteredJobs = jobs.filter(j => 
        j.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        j.clientName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeJobsCount = jobs.filter(j => j.status === 'active').length;
    
    // Financial Analytics Calculation
    let totalInvoiced = 0;
    let outstandingPayments = 0;

    forms.forEach(form => {
        if (form.type === FormType.Invoice) {
            const data = form.data as InvoiceData;
            // Safe safe parsing
            const subtotal = data.lineItems ? data.lineItems.reduce((acc, item) => acc + (Number(item.quantity || 0) * Number(item.rate || 0)), 0) : 0;
            const discount = Number(data.discount || 0);
            const shipping = Number(data.shipping || 0);
            const taxRate = Number(data.taxRate || 0);
            const taxAmount = (subtotal - discount) * (taxRate / 100);
            const total = (subtotal - discount) + taxAmount + shipping;

            totalInvoiced += total;
            
            if (data.status !== 'Paid') {
                outstandingPayments += total;
            }
        }
    });
    
    // Currency formatter
    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

    return (
      <div className="w-full min-h-screen bg-background text-foreground p-4 md:p-8 pb-24">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
            <div className="flex items-center gap-4">
                <AppLogo className="w-12 h-12 drop-shadow-md" />
                <h1 className="text-2xl md:text-3xl font-bold">{t.welcome}, {profile.name.split(' ')[0]}!</h1>
            </div>
            <div className="flex items-center gap-4">
              <Button onClick={navigateToCreateJob}>+ {t.newJob}</Button>
              
              <Button variant="ghost" size="icon" onClick={() => setView({ screen: 'profile' })} className="rounded-full h-10 w-10 overflow-hidden border border-border">
                  {profile.logoUrl ? (
                      <img src={profile.logoUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                      <UserIcon className="h-6 w-6" />
                  )}
              </Button>
            </div>
        </header>

        {/* Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="p-4 flex items-center space-x-4 bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900">
                <div className="p-3 bg-green-100 text-green-600 rounded-full"><CreditCardIcon className="w-6 h-6" /></div>
                <div><p className="text-sm text-muted-foreground">Total Invoiced</p><p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(totalInvoiced)}</p></div>
            </Card>
             <Card className="p-4 flex items-center space-x-4 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900">
                <div className="p-3 bg-red-100 text-red-600 rounded-full"><ClockIcon className="w-6 h-6" /></div>
                <div><p className="text-sm text-muted-foreground">Outstanding</p><p className="text-2xl font-bold text-red-700 dark:text-red-400">{formatCurrency(outstandingPayments)}</p></div>
            </Card>
             <Card className="p-4 flex items-center space-x-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-full"><HomeIcon className="w-6 h-6" /></div>
                <div><p className="text-sm text-muted-foreground">Active Jobs</p><p className="text-2xl font-bold">{activeJobsCount}</p></div>
            </Card>
             <Card className="p-4 flex items-center space-x-4">
                <div className="p-3 bg-purple-100 text-purple-600 rounded-full"><CheckCircleIcon className="w-6 h-6" /></div>
                <div><p className="text-sm text-muted-foreground">Completed Jobs</p><p className="text-2xl font-bold">{jobs.length - activeJobsCount}</p></div>
            </Card>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input 
                placeholder="Search jobs..." 
                className="pl-10" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
        </div>
        
        <h2 className="text-xl font-semibold mb-4">{t.yourJobs}</h2>
        {filteredJobs.length === 0 ? (
          <Card className="text-center p-8">
            <CardTitle>{jobs.length === 0 ? t.noJobs : "No jobs found"}</CardTitle>
            <CardDescription className="mt-2">{jobs.length === 0 ? t.clickNewJob : "Try a different search term"}</CardDescription>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredJobs.map(job => (
              <Card key={job.id} className="flex flex-col transition-transform hover:-translate-y-1 hover:shadow-lg duration-200">
                <CardHeader>
                  <CardTitle className="truncate">{job.name}</CardTitle>
                  <CardDescription className="truncate">{job.clientName}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground truncate">{job.clientAddress}</p>
                  <div className="flex items-center gap-2 mt-2">
                      <span className={`w-2 h-2 rounded-full ${job.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                      <p className="text-sm text-muted-foreground capitalize">{job.status}</p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" onClick={() => setView({ screen: 'jobDetails', jobId: job.id })}>
                    {t.viewProject}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };
  
  const renderJobDetails = () => {
    if (view.screen !== 'jobDetails' || !profile) return null;
    const job = jobs.find(j => j.id === view.jobId);
    if (!job) return <div>Job not found!</div>;
    const t = getTranslation();

    // Helper to extract specific document titles for display and search
    const getDocTitle = (form: FormDataType) => {
      const d = form.data as any;
      switch (form.type) {
        case FormType.Invoice: return `Invoice #${d.invoiceNumber || '?'}`;
        case FormType.Estimate: return `Estimate #${d.estimateNumber || '?'}`;
        case FormType.WorkOrder: return d.title || 'Work Order';
        case FormType.DailyJobReport: return `Report #${d.reportNumber || ''} (${d.date})`;
        case FormType.Note: return d.title || 'Untitled Note';
        case FormType.TimeSheet: return `Time Sheet - ${d.workerName}`;
        case FormType.MaterialLog: return `Material Log - ${d.date}`;
        case FormType.ExpenseLog: return `Expense - ${d.item} ($${d.amount})`;
        case FormType.Warranty: return `Warranty - ${d.duration}`;
        case FormType.Receipt: return `Receipt - $${d.amount}`;
        default: return form.type;
      }
    };

    const jobForms = forms.filter(f => f.jobId === job.id).filter(f => {
        const title = getDocTitle(f).toLowerCase();
        const type = f.type.toLowerCase();
        const query = docSearchQuery.toLowerCase();
        return title.includes(query) || type.includes(query);
    });

    const getDocIcon = (type: FormType) => {
       switch(type) {
         case FormType.Invoice: return InvoiceIcon;
         case FormType.Estimate: return EstimateIcon;
         case FormType.DailyJobReport: return DailyReportIcon;
         case FormType.WorkOrder: return WorkOrderIcon;
         case FormType.Note: return NoteIcon;
         case FormType.TimeSheet: return TimeSheetIcon;
         case FormType.MaterialLog: return MaterialLogIcon;
         case FormType.ExpenseLog: return ExpenseLogIcon;
         case FormType.Warranty: return WarrantyIcon;
         case FormType.Receipt: return ReceiptIcon;
         default: return InvoiceIcon;
       }
    };

    const getStatusBadge = (form: FormDataType) => {
        const status = (form.data as any).status;
        if (!status) return null;
        
        let colorClass = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
        if (status === 'Paid' || status === 'Accepted') colorClass = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
        else if (status === 'Sent') colorClass = "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
        else if (status === 'Overdue' || status === 'Rejected' || status === 'Cancelled') colorClass = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

        return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>{status}</span>;
    };

    return (
      <div className="w-full min-h-screen bg-background text-foreground p-4 md:p-8 pb-24">
        <header className="flex items-center mb-8">
          <Button variant="ghost" size="icon" onClick={navigateToDashboard} className="mr-4 h-10 w-10">
            <BackArrowIcon className="h-6 w-6" />
          </Button>
          <div className="overflow-hidden">
            <h1 className="text-2xl md:text-3xl font-bold truncate">{job.name}</h1>
            <p className="text-muted-foreground truncate">{job.clientName}</p>
          </div>
        </header>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>{t.projectDocs}</CardTitle>
             {/* Document Search */}
             <div className="relative w-full max-w-xs">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3 w-3" />
                <Input 
                    placeholder="Search by title..." 
                    className="pl-8 h-9 text-sm"
                    value={docSearchQuery}
                    onChange={(e) => setDocSearchQuery(e.target.value)}
                />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {jobForms.length === 0 && (
                  <p className="text-muted-foreground py-8 text-center">{t.noDocsYet}</p>
              )}
              {jobForms.map(form => {
                  const Icon = getDocIcon(form.type);
                  return (
                    <div key={form.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-md bg-muted hover:bg-secondary/50 transition-colors gap-3">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="p-2 bg-background rounded-full text-primary shrink-0">
                               <Icon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-medium truncate">{getDocTitle(form)}</p>
                                <p className="text-xs text-muted-foreground">{form.type} • {new Date(form.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                            {getStatusBadge(form)}
                            <Button variant="ghost" size="sm" onClick={() => setView({ screen: 'form', formType: form.type, jobId: job.id, formId: form.id })}>{t.edit}</Button>
                        </div>
                    </div>
                  );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };
  
  const renderForm = () => {
    if (view.screen !== 'form' || !profile) return null;

    const { formType, jobId, formId } = view;
    const job = jobs.find(j => j.id === jobId);
    const form = forms.find(f => f.id === formId);

    if (!job) return <div>Job not found!</div>;

    const handleCloseForm = () => setView({ screen: 'jobDetails', jobId: jobId });

    switch (formType) {
      case FormType.Invoice:
        return <InvoiceForm job={job} userProfile={profile} invoice={form?.data as InvoiceData | null} onSave={handleSaveForm} onClose={handleCloseForm} />;
      case FormType.DailyJobReport:
        return <DailyJobReportForm profile={profile} report={form?.data as DailyJobReportData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.Note:
        return <NoteForm profile={profile} job={job} note={form?.data as NoteData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.WorkOrder:
        return <WorkOrderForm job={job} profile={profile} data={form?.data as WorkOrderData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.TimeSheet:
        return <TimeSheetForm job={job} profile={profile} data={form?.data as TimeSheetData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.MaterialLog:
        return <MaterialLogForm job={job} profile={profile} data={form?.data as MaterialLogData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.Estimate:
        return <EstimateForm job={job} profile={profile} data={form?.data as EstimateData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.ExpenseLog:
        return <ExpenseLogForm job={job} profile={profile} data={form?.data as ExpenseLogData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.Warranty:
        return <WarrantyForm job={job} profile={profile} data={form?.data as WarrantyData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.Receipt:
        return <ReceiptForm job={job} profile={profile} data={form?.data as ReceiptData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      default:
        return (
          <div className="p-8">
            <h2 className="text-2xl mb-4">{formType} form is not implemented.</h2>
            <Button onClick={navigateToDashboard}>Back to Dashboard</Button>
          </div>
        );
    }
  };

  const getDockItems = () => {
    const t = getTranslation();
    const items = [
      { icon: HomeIcon, label: t.dashboard, onClick: navigateToDashboard },
    ];
    if (view.screen === 'jobDetails') {
      items.push({ icon: PlusIcon, label: t.newDocument, onClick: () => navigateToNewDoc(view.jobId) });
    } else {
        items.push({ icon: UsersIcon, label: 'Clients', onClick: navigateToClients });
    }
    items.push({ icon: SettingsIcon, label: t.settings, onClick: navigateToSettings });
    return items;
  };
  
  const renderContent = () => {
    if (dbSetupError) {
      return <DbSetupScreen sqlScript={dbSetupError} />;
    }

    if (loading) {
      return <div className="flex items-center justify-center min-h-screen">{loadingMessage}</div>;
    }

    if (!session) {
        if (view.screen === 'welcome') {
            return (
                <Welcome 
                    onGetStarted={() => setView({ screen: 'auth', authScreen: 'signup' })}
                    onLogin={() => setView({ screen: 'auth', authScreen: 'login' })}
                />
            );
        }
        return renderAuth();
    }
    
    switch (view.screen) {
      case 'dashboard':
        return renderDashboard();
      case 'jobDetails':
        return renderJobDetails();
      case 'createJob':
        return <JobForm onSave={handleSaveJob} onCancel={navigateToDashboard} supabase={supabase} session={session} />;
      case 'selectDocType': {
        const activeJob = jobs.find(j => j.id === view.jobId);
        if (!activeJob) return <div>Error: Job not found</div>
        return <SelectDocType onSelect={(type) => setView({ screen: 'form', formType: type, jobId: activeJob.id, formId: null })} onBack={() => setView({ screen: 'jobDetails', jobId: view.jobId })} />;
      }
      case 'form':
        return renderForm();
      case 'settings':
        if (!profile) return null;
        return <Settings mode="settings" profile={profile} onSave={handleSaveProfile} onBack={navigateToDashboard} theme={theme} setTheme={setTheme} onLogout={handleLogout} />;
      case 'profile':
        if (!profile) return null;
        return <Settings mode="profile" profile={profile} onSave={handleSaveProfile} onBack={navigateToDashboard} theme={theme} setTheme={setTheme} onLogout={handleLogout} />;
      case 'clients':
        return <ClientsView onBack={navigateToDashboard} supabase={supabase} session={session} />;
      default:
        return renderDashboard();
    }
  };

  return (
    <main className="w-full min-h-screen bg-background">
      {renderContent()}
      {session && (view.screen === 'dashboard' || view.screen === 'jobDetails' || view.screen === 'clients') && (
        <Dock items={getDockItems()} />
      )}
    </main>
  );
};

export default App;
