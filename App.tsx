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
import AnalyticsView from './components/AnalyticsView.tsx';
import ForumView from './components/ForumView.tsx';
import Dock from './components/Dock.tsx';
import JobForm from './components/JobForm.tsx';
import Welcome from './components/Welcome.tsx';
import { HomeIcon, SettingsIcon, PlusIcon, BackArrowIcon, UserIcon, AppLogo, SearchIcon, UsersIcon, CheckCircleIcon, XCircleIcon, ClockIcon, CreditCardIcon, InvoiceIcon, DailyReportIcon, TimeSheetIcon, MaterialLogIcon, EstimateIcon, ExpenseLogIcon, WarrantyIcon, NoteIcon, ReceiptIcon, WorkOrderIcon, BarChartIcon, MessageSquareIcon } from './components/Icons.tsx';
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

const SQL_SETUP_SCRIPT = `-- This script sets up and fixes your database schema.
-- Run this script in your Supabase SQL Editor.
-- SAFE MODE: This script will NOT delete existing data.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE & POLICIES (CRITICAL FIX FOR FORUM VISIBILITY)
CREATE TABLE IF NOT EXISTS public.profiles (
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
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- FIX: Allow ALL authenticated users to view ALL profiles (so they can see who commented)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);


-- 2. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS public.clients (
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

-- 3. JOBS TABLE
CREATE TABLE IF NOT EXISTS public.jobs (
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
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- 4. DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 5. FORUM TABLES
-- Posts
CREATE TABLE IF NOT EXISTS public.forum_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, -- FK added below
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL, 
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CRITICAL FIX: Ensure image_url column exists (This fixes the PGRST204 error)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_posts' AND column_name = 'image_url') THEN
        ALTER TABLE public.forum_posts ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- Comments
CREATE TABLE IF NOT EXISTS public.forum_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- FK added below
  content TEXT NOT NULL,
  image_url TEXT, -- Added for comment images
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix: Add image_url to forum_comments if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_comments' AND column_name = 'image_url') THEN
        ALTER TABLE public.forum_comments ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- Votes
CREATE TABLE IF NOT EXISTS public.forum_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- FK added below
  vote_type TEXT NOT NULL,
  UNIQUE(post_id, user_id)
);

-- 6. FIX FOREIGN KEYS (Critical for Joins)
-- This links forum posts to user profiles instead of auth users
DO $$
BEGIN
  -- Fix Posts FK
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_posts_user_id_fkey') THEN
    ALTER TABLE public.forum_posts DROP CONSTRAINT forum_posts_user_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_posts_user_id_fkey_profiles') THEN
      ALTER TABLE public.forum_posts ADD CONSTRAINT forum_posts_user_id_fkey_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  -- Fix Comments FK
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_comments_user_id_fkey') THEN
    ALTER TABLE public.forum_comments DROP CONSTRAINT forum_comments_user_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_comments_user_id_fkey_profiles') THEN
      ALTER TABLE public.forum_comments ADD CONSTRAINT forum_comments_user_id_fkey_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  
  -- Fix Votes FK
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_votes_user_id_fkey') THEN
    ALTER TABLE public.forum_votes DROP CONSTRAINT forum_votes_user_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_votes_user_id_fkey_profiles') THEN
      ALTER TABLE public.forum_votes ADD CONSTRAINT forum_votes_user_id_fkey_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 7. ENABLE RLS AND POLICIES
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;

-- Re-apply policies safely
DROP POLICY IF EXISTS "Authenticated read posts" ON public.forum_posts;
CREATE POLICY "Authenticated read posts" ON public.forum_posts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert posts" ON public.forum_posts;
CREATE POLICY "Authenticated insert posts" ON public.forum_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own posts" ON public.forum_posts;
CREATE POLICY "Users update own posts" ON public.forum_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated read comments" ON public.forum_comments;
CREATE POLICY "Authenticated read comments" ON public.forum_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert comments" ON public.forum_comments;
CREATE POLICY "Authenticated insert comments" ON public.forum_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated read votes" ON public.forum_votes;
CREATE POLICY "Authenticated read votes" ON public.forum_votes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert votes" ON public.forum_votes;
CREATE POLICY "Authenticated insert votes" ON public.forum_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated update votes" ON public.forum_votes;
CREATE POLICY "Authenticated update votes" ON public.forum_votes FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated delete votes" ON public.forum_votes;
CREATE POLICY "Authenticated delete votes" ON public.forum_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 8. STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('forum', 'forum', true) ON CONFLICT (id) DO NOTHING;

-- Storage Policies
DROP POLICY IF EXISTS "Allow authenticated view access to logos" ON storage.objects;
CREATE POLICY "Allow authenticated view access to logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Allow users to upload their own logo" ON storage.objects;
CREATE POLICY "Allow users to upload their own logo" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Allow authenticated view access to forum" ON storage.objects;
CREATE POLICY "Allow authenticated view access to forum" ON storage.objects FOR SELECT USING (bucket_id = 'forum' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Allow users to upload forum images" ON storage.objects;
CREATE POLICY "Allow users to upload forum images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'forum' AND auth.role() = 'authenticated');
`;

const DbSetupScreen: React.FC<{ sqlScript: string }> = ({ sqlScript }) => (
  <div className="flex items-center justify-center min-h-screen bg-background p-4 md:p-8">
    <Card className="max-w-4xl w-full animate-fade-in-down">
      <CardHeader>
        <CardTitle className="text-2xl text-destructive">Database Update Required</CardTitle>
        <CardDescription>
          To fix the error you are seeing (missing columns, tables, or permission issues), please run this script.
          <br/><br/>
          <strong>This script is safe and will NOT delete your data.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
            <div>
                <Label htmlFor="sql-script">SQL Script</Label>
                <textarea
                    id="sql-script"
                    readOnly
                    value={sqlScript}
                    className="mt-1 w-full h-96 p-3 font-mono text-xs bg-muted rounded-md border focus:ring-2 focus:ring-primary"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
            </div>
             <div>
                <h4 className="font-semibold">Instructions:</h4>
                <ol className="list-decimal list-inside text-sm text-muted-foreground mt-2 space-y-1">
                    <li>Go to your <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Supabase Dashboard</a>.</li>
                    <li>Click on <strong>SQL Editor</strong> (left sidebar).</li>
                    <li>Click <strong>+ New query</strong>.</li>
                    <li>Paste the script above and click <strong>Run</strong>.</li>
                    <li>Come back here and refresh the page.</li>
                </ol>
            </div>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-center gap-4">
        <Button onClick={() => window.location.reload()} className="w-full">
          Refresh Page
        </Button>
      </CardFooter>
    </Card>
  </div>
);


// Helper to upload a file to Supabase Storage
const uploadFile = async (bucket: string, file: File, userId: string, isPublicUpload: boolean = false): Promise<string> => {
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
    | { screen: 'clients' }
    | { screen: 'analytics' }
    | { screen: 'forum' };
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [view, setView] = useState<AppView>({ screen: 'welcome' });
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [forms, setForms] = useState<FormDataType[]>([]);

  const [dbSetupError, setDbSetupError] = useState<string | null>(null);
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [docSearchQuery, setDocSearchQuery] = useState('');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (view.screen !== 'welcome' && view.screen !== 'auth' && !loading) {
      localStorage.setItem('app_view_state', JSON.stringify(view));
    }
  }, [view, loading]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
          setLoading(false);
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
            if (/relation "public.profiles" does not exist|invalid input syntax|schema cache/i.test(profileError.message)) {
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
                 if (/relation "public.profiles" does not exist/i.test(createError.message)) {
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

        // 2. Fetch jobs
        const { data: jobsData, error: jobsError } = await supabase.from('jobs').select('*').eq('user_id', user.id);
        if (jobsError) {
             if (/relation "public.jobs" does not exist/i.test(jobsError.message)) {
                setDbSetupError(SQL_SETUP_SCRIPT);
                setLoading(false);
                return;
            }
        } else if (jobsData) {
            setJobs(jobsData.map(j => ({...j, startDate: j.start_date, endDate: j.end_date, clientName: j.client_name, clientAddress: j.client_address, userId: j.user_id})));
        }

        // 3. Fetch docs
        const { data: formsData } = await supabase.from('documents').select('*').eq('user_id', user.id);
        if (formsData) setForms(formsData.map(f => ({...f, jobId: f.job_id, createdAt: f.created_at })));
        
        // 4. Check for Forum Tables & Columns
        const { error: forumError } = await supabase.from('forum_posts').select('id, image_url').limit(1);
        if (forumError) {
             if (
                 forumError.code === 'PGRST204' || 
                 /relation "public.forum_posts" does not exist|schema cache|column "image_url" does not exist|Could not find the 'image_url' column/i.test(forumError.message)
             ) {
                 setDbSetupError(SQL_SETUP_SCRIPT);
                 setLoading(false);
                 return;
             }
        }
        
        // Check Relationship (Joins)
        const { error: joinError } = await supabase.from('forum_posts').select('id, profiles:user_id(name)').limit(1);
        if (joinError) {
             if (/PGRST200|foreign key relationship/i.test(joinError.message || joinError.code || '')) {
                 setDbSetupError(SQL_SETUP_SCRIPT);
                 setLoading(false);
                 return;
             }
        }

        // 5. Restore View
        const savedViewStr = localStorage.getItem('app_view_state');
        if (savedViewStr) {
            try {
                const savedView = JSON.parse(savedViewStr);
                if (savedView.screen !== 'welcome' && savedView.screen !== 'auth') {
                    setView(savedView);
                }
            } catch (e) {}
        } else {
            setView({ screen: 'dashboard' });
        }
        setLoading(false);
    };
    fetchData();
  }, [session]);


  // ... (Handlers for auth, profile, jobs, forms - mostly unchanged)
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
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  };
  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('app_view_state'); 
    setView({ screen: 'welcome' });
  };

  const navigateToDashboard = () => setView({ screen: 'dashboard' });
  const navigateToSettings = () => setView({ screen: 'settings' });
  const navigateToNewDoc = (jobId: string) => setView({ screen: 'selectDocType', jobId });
  const navigateToCreateJob = () => setView({ screen: 'createJob' });
  const navigateToClients = () => setView({ screen: 'clients' });
  const navigateToAnalytics = () => setView({ screen: 'analytics' });
  const navigateToForum = () => setView({ screen: 'forum' });

  const handleSaveProfile = async (updatedProfile: UserProfile, logoFile?: File | null) => {
      if (!session) return;
      setLoading(true);
      let newLogoUrl = updatedProfile.logoUrl;
      if (logoFile) {
          try {
              newLogoUrl = await uploadFile('logos', logoFile, session.user.id) || newLogoUrl;
          } catch (error) { setLoading(false); return; }
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
           if (/relation "public.profiles" does not exist/i.test(error.message)) setDbSetupError(SQL_SETUP_SCRIPT);
           else alert(`Error saving profile: ${error.message}`);
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

  const handleUploadForumImage = async (file: File): Promise<string> => {
      if (!session) throw new Error("Not authenticated");
      return uploadFile('forum', file, session.user.id, true);
  }

  const handleSaveJob = async (jobData: any) => {
    if (!session) return;
    setLoading(true);
    const { error } = await supabase.from('jobs').insert({
      user_id: session.user.id,
      name: jobData.name,
      client_name: jobData.clientName,
      client_address: jobData.clientAddress,
      start_date: jobData.startDate,
      status: 'active',
    });
    if (!error) {
      const { data } = await supabase.from('jobs').select('*').eq('user_id', session.user.id);
      if(data) setJobs(data.map(j => ({...j, startDate: j.start_date, endDate: j.end_date, clientName: j.client_name, clientAddress: j.client_address, userId: j.user_id})));
    }
    setView({ screen: 'dashboard' });
    setLoading(false);
  };

  const handleUpdateJobStatus = async (jobId: string, newStatus: any) => {
      if (!session) return;
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
      await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId);
  };

  const handleSaveForm = async (formData: any) => {
    if (view.screen !== 'form' || !session) return;
    setLoading(true);
    const formRecord: any = { user_id: session.user.id, job_id: view.jobId, type: view.formType, data: formData };
    if (view.formId) formRecord.id = view.formId;
    const { error } = await supabase.from('documents').upsert(formRecord);
    if (!error) {
      const { data } = await supabase.from('documents').select('*').eq('user_id', session.user.id);
      if (data) setForms(data.map(f => ({...f, jobId: f.job_id, createdAt: f.created_at })));
    }
    setView({ screen: 'jobDetails', jobId: view.jobId });
    setLoading(false);
  };
  
  const getTranslation = () => {
      const lang = profile?.language || 'English';
      return translations[lang] || translations['English'];
  }

  // --- Render Logic (Same as before) ---
  const renderAuth = () => {
    if (view.screen !== 'auth') return null;
    switch(view.authScreen) {
      case 'login': return <Login onLogin={handleLogin} onLoginWithGoogle={handleLoginWithGoogle} onSwitchToSignup={() => setView({ screen: 'auth', authScreen: 'signup' })} />;
      case 'signup': return <Signup onSignup={handleSignup} onLoginWithGoogle={handleLoginWithGoogle} onSwitchToLogin={() => setView({ screen: 'auth', authScreen: 'login' })} />;
      case 'checkEmail': return <div className="flex items-center justify-center min-h-screen bg-background"><Card className="w-full max-w-sm text-center"><CardHeader><CardTitle>Check your email</CardTitle></CardHeader><CardContent><p>We've sent a confirmation link.</p></CardContent></Card></div>;
    }
  };

  const renderDashboard = () => {
    if (!profile) return null;
    const t = getTranslation();
    const filteredJobs = jobs.filter(j => j.name.toLowerCase().includes(searchQuery.toLowerCase()) || j.clientName.toLowerCase().includes(searchQuery.toLowerCase()));
    const getStatusColor = (status: string) => {
        switch(status) { case 'active': return 'bg-green-500'; case 'completed': return 'bg-blue-500'; case 'paused': return 'bg-orange-500'; default: return 'bg-gray-400'; }
    }
    return (
      <div className="w-full min-h-screen bg-background text-foreground p-4 md:p-8 pb-24">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
            <div className="flex items-center gap-4"><AppLogo className="w-12 h-12 drop-shadow-md" /><h1 className="text-2xl md:text-3xl font-bold">{t.welcome}, {profile.name.split(' ')[0]}!</h1></div>
            <div className="flex items-center gap-4 flex-wrap">
              <Button onClick={navigateToCreateJob}>+ {t.newJob}</Button>
              <Button variant="outline" onClick={navigateToForum} className="flex items-center gap-2"><MessageSquareIcon className="w-4 h-4" /> Community</Button>
              <Button variant="outline" onClick={navigateToAnalytics} className="flex items-center gap-2"><BarChartIcon className="w-4 h-4" /> Insights</Button>
              <Button variant="ghost" size="icon" onClick={() => setView({ screen: 'profile' })} className="rounded-full h-10 w-10 overflow-hidden border border-border">{profile.logoUrl ? <img src={profile.logoUrl} alt="Profile" className="h-full w-full object-cover" /> : <UserIcon className="h-6 w-6" />}</Button>
            </div>
        </header>
        <div className="relative mb-6"><SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" /><Input placeholder="Search jobs..." className="pl-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
        <h2 className="text-xl font-semibold mb-4">{t.yourJobs}</h2>
        {filteredJobs.length === 0 ? <Card className="text-center p-8"><CardTitle>{jobs.length === 0 ? t.noJobs : "No jobs found"}</CardTitle><CardDescription className="mt-2">{jobs.length === 0 ? t.clickNewJob : "Try a different search term"}</CardDescription></Card> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{filteredJobs.map(job => (<Card key={job.id} className="flex flex-col transition-transform hover:-translate-y-1 hover:shadow-lg duration-200"><CardHeader><CardTitle className="truncate">{job.name}</CardTitle><CardDescription className="truncate">{job.clientName}</CardDescription></CardHeader><CardContent className="flex-grow"><p className="text-sm text-muted-foreground">{job.clientAddress}</p><div className="flex items-center gap-2 mt-2"><span className={`w-2 h-2 rounded-full ${getStatusColor(job.status)}`}></span><p className="text-sm text-muted-foreground capitalize">{job.status}</p></div></CardContent><CardFooter><Button className="w-full" onClick={() => setView({ screen: 'jobDetails', jobId: job.id })}>{t.viewProject}</Button></CardFooter></Card>))}</div>}
      </div>
    );
  };
  
  const renderJobDetails = () => {
    if (view.screen !== 'jobDetails' || !profile) return null;
    const job = jobs.find(j => j.id === view.jobId);
    if (!job) return <div>Job not found!</div>;
    const t = getTranslation();
    const getDocTitle = (form: FormDataType) => { const d = form.data as any; return d.invoiceNumber || d.estimateNumber || d.title || d.reportNumber || form.type; };
    const jobForms = forms.filter(f => f.jobId === job.id).filter(f => getDocTitle(f).toLowerCase().includes(docSearchQuery.toLowerCase()) || f.type.toLowerCase().includes(docSearchQuery.toLowerCase()));
    const getDocIcon = (type: FormType) => { switch(type) { case FormType.Invoice: return InvoiceIcon; case FormType.Estimate: return EstimateIcon; default: return InvoiceIcon; }}; 
    const getStatusBadge = (form: FormDataType) => { const status = (form.data as any).status; return status ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">{status}</span> : null; };

    return (
      <div className="w-full min-h-screen bg-background text-foreground p-4 md:p-8 pb-24">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center overflow-hidden"><Button variant="ghost" size="icon" onClick={navigateToDashboard} className="mr-4 h-10 w-10 shrink-0"><BackArrowIcon className="h-6 w-6" /></Button><div className="overflow-hidden"><h1 className="text-2xl md:text-3xl font-bold truncate">{job.name}</h1><p className="text-muted-foreground truncate">{job.clientName}</p></div></div>
          <div className="flex items-center gap-2"><select value={job.status} onChange={(e) => handleUpdateJobStatus(job.id, e.target.value as any)} className="h-9 rounded-md border px-3 text-sm"><option value="active">Active</option><option value="inactive">Inactive</option><option value="paused">Paused</option><option value="completed">Completed</option></select></div>
        </header>
        <Card><CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><CardTitle>{t.projectDocs}</CardTitle><div className="relative w-full max-w-xs"><SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3 w-3" /><Input placeholder="Search by title..." className="pl-8 h-9 text-sm" value={docSearchQuery} onChange={(e) => setDocSearchQuery(e.target.value)} /></div></CardHeader><CardContent><div className="space-y-2">{jobForms.length === 0 && <p className="text-muted-foreground py-8 text-center">{t.noDocsYet}</p>}{jobForms.map(form => { const Icon = getDocIcon(form.type); return (<div key={form.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-md bg-muted hover:bg-secondary/50 transition-colors gap-3"><div className="flex items-center gap-3 overflow-hidden"><div className="p-2 bg-background rounded-full text-primary shrink-0"><Icon className="w-5 h-5" /></div><div className="min-w-0"><p className="font-medium truncate">{getDocTitle(form)}</p><p className="text-xs text-muted-foreground">{form.type} • {new Date(form.createdAt).toLocaleDateString()}</p></div></div><div className="flex items-center gap-2 justify-end">{getStatusBadge(form)}<Button variant="ghost" size="sm" onClick={() => setView({ screen: 'form', formType: form.type, jobId: job.id, formId: form.id })}>{t.edit}</Button></div></div>); })}</div></CardContent></Card>
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
      case FormType.Invoice: return <InvoiceForm job={job} userProfile={profile} invoice={form?.data as InvoiceData | null} onSave={handleSaveForm} onClose={handleCloseForm} />;
      case FormType.DailyJobReport: return <DailyJobReportForm profile={profile} report={form?.data as DailyJobReportData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.Note: return <NoteForm profile={profile} job={job} note={form?.data as NoteData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.WorkOrder: return <WorkOrderForm job={job} profile={profile} data={form?.data as WorkOrderData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.TimeSheet: return <TimeSheetForm job={job} profile={profile} data={form?.data as TimeSheetData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.MaterialLog: return <MaterialLogForm job={job} profile={profile} data={form?.data as MaterialLogData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.Estimate: return <EstimateForm job={job} profile={profile} data={form?.data as EstimateData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.ExpenseLog: return <ExpenseLogForm job={job} profile={profile} data={form?.data as ExpenseLogData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.Warranty: return <WarrantyForm job={job} profile={profile} data={form?.data as WarrantyData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.Receipt: return <ReceiptForm job={job} profile={profile} data={form?.data as ReceiptData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      default: return <div className="p-8"><h2 className="text-2xl mb-4">{formType} not implemented.</h2><Button onClick={navigateToDashboard}>Back</Button></div>;
    }
  };

  const getDockItems = () => {
    const t = getTranslation();
    const items = [{ icon: HomeIcon, label: t.dashboard, onClick: navigateToDashboard }];
    if (view.screen === 'jobDetails') items.push({ icon: PlusIcon, label: t.newDocument, onClick: () => navigateToNewDoc(view.jobId) });
    else if (view.screen === 'dashboard' || view.screen === 'clients') items.push({ icon: UsersIcon, label: 'Clients', onClick: navigateToClients });
    items.push({ icon: SettingsIcon, label: t.settings, onClick: navigateToSettings });
    return items;
  };
  
  const renderContent = () => {
    if (dbSetupError) return <DbSetupScreen sqlScript={dbSetupError} />;
    if (loading) return <div className="flex items-center justify-center min-h-screen">{loadingMessage}</div>;
    if (!session) {
        if (view.screen === 'welcome') return <Welcome onGetStarted={() => setView({ screen: 'auth', authScreen: 'signup' })} onLogin={() => setView({ screen: 'auth', authScreen: 'login' })} />;
        return renderAuth();
    }
    switch (view.screen) {
      case 'dashboard': return renderDashboard();
      case 'jobDetails': return renderJobDetails();
      case 'createJob': return <JobForm onSave={handleSaveJob} onCancel={navigateToDashboard} supabase={supabase} session={session} />;
      case 'selectDocType': { const activeJob = jobs.find(j => j.id === view.jobId); if (!activeJob) return <div>Error</div>; return <SelectDocType onSelect={(type) => setView({ screen: 'form', formType: type, jobId: activeJob.id, formId: null })} onBack={() => setView({ screen: 'jobDetails', jobId: view.jobId })} />; }
      case 'form': return renderForm();
      case 'settings': if (!profile) return null; return <Settings mode="settings" profile={profile} onSave={handleSaveProfile} onBack={navigateToDashboard} theme={theme} setTheme={setTheme} onLogout={handleLogout} />;
      case 'profile': if (!profile) return null; return <Settings mode="profile" profile={profile} onSave={handleSaveProfile} onBack={navigateToDashboard} theme={theme} setTheme={setTheme} onLogout={handleLogout} />;
      case 'clients': return <ClientsView onBack={navigateToDashboard} supabase={supabase} session={session} />;
      case 'analytics': return <AnalyticsView jobs={jobs} forms={forms} onBack={navigateToDashboard} />;
      case 'forum': return <ForumView onBack={navigateToDashboard} supabase={supabase} session={session} onUploadImage={handleUploadForumImage} />;
      default: return renderDashboard();
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