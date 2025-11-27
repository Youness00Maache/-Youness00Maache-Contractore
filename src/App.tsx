
import React, { useState, useEffect } from 'react';
import { FormType } from './types.ts';
import type { UserProfile, Job, FormData as FormDataType, InvoiceData, DailyJobReportData, NoteData, WorkOrderData, TimeSheetData, MaterialLogData, EstimateData, ExpenseLogData, WarrantyData, ReceiptData, ChangeOrderData, PurchaseOrderData, Client, Notification, InventoryItem } from './types.ts';
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
import ChangeOrderForm from './components/ChangeOrderForm.tsx';
import PurchaseOrderForm from './components/PurchaseOrderForm.tsx';

import Settings from './components/Settings.tsx';
import ClientsView from './components/ClientsView.tsx';
import AnalyticsView from './components/AnalyticsView.tsx';
import ForumView from './components/ForumView.tsx';
import CalendarView from './components/CalendarView.tsx';
import CommunicationView from './components/CommunicationView.tsx';
import InventoryView from './components/InventoryView.tsx';
import Dock from './components/Dock.tsx';
import JobForm from './components/JobForm.tsx';
import Welcome from './components/Welcome.tsx';
import PrivacyPolicy from './components/PrivacyPolicy.tsx';
import TermsOfService from './components/TermsOfService.tsx';
import Security from './components/Security.tsx';
import { HomeIcon, SettingsIcon, PlusIcon, BackArrowIcon, UserIcon, AppLogo, SearchIcon, UsersIcon, CheckCircleIcon, XCircleIcon, ClockIcon, CreditCardIcon, InvoiceIcon, DailyReportIcon, TimeSheetIcon, MaterialLogIcon, EstimateIcon, ExpenseLogIcon, WarrantyIcon, NoteIcon, ReceiptIcon, WorkOrderIcon, BarChartIcon, MessageSquareIcon, CalendarIcon, ChangeOrderIcon, TruckIcon, BriefcaseIcon, MailIcon, BoxIcon } from './components/Icons.tsx';
import { Button } from './components/ui/Button.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/Card.tsx';
import { Label } from './components/ui/Label.tsx';
import { Input } from './components/ui/Input.tsx';
import { translations } from './utils/translations.ts';
import { dbApi } from './utils/db.ts';
import { compressImage } from './utils/imageCompression.ts';

// Initialize Supabase client with provided credentials
const supabaseUrl = 'https://iauteblvljppwzsxloyd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdXRlYmx2bGpwcHd6c3hsb3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1OTk0MTIsImV4cCI6MjA3NjE3NTQxMn0.W2Xu9TuO6odsnF5eK7iLPqV4KB0wVWXzmM2ofnKZw70';

const supabase: SupabaseClient = (window as any).supabase.createClient(supabaseUrl, supabaseAnonKey);

const SQL_SETUP_SCRIPT = `-- This script sets up and fixes your database schema.
-- Run this script in your Supabase SQL Editor.
-- SAFE MODE: This script will NOT delete existing data.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE & POLICIES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  company_name TEXT,
  logo_url TEXT,
  profile_picture_url TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  job_title TEXT,
  subscription_tier TEXT DEFAULT 'Basic',
  language TEXT DEFAULT 'English',
  email_templates JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'profile_picture_url') THEN
        ALTER TABLE public.profiles ADD COLUMN profile_picture_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email_templates') THEN
        ALTER TABLE public.profiles ADD COLUMN email_templates JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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
DROP POLICY IF EXISTS "Users can manage their own clients" ON public.clients;
CREATE POLICY "Users can manage their own clients" ON public.clients FOR ALL USING (auth.uid() = user_id);

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
DROP POLICY IF EXISTS "Users can manage their own jobs" ON public.jobs;
CREATE POLICY "Users can manage their own jobs" ON public.jobs FOR ALL USING (auth.uid() = user_id);

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
DROP POLICY IF EXISTS "Users can manage their own documents" ON public.documents;
CREATE POLICY "Users can manage their own documents" ON public.documents FOR ALL USING (auth.uid() = user_id);

-- 5. FORUM TABLES
CREATE TABLE IF NOT EXISTS public.forum_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, 
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL, 
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  image_url TEXT,
  youtube_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_posts' AND column_name = 'image_url') THEN
        ALTER TABLE public.forum_posts ADD COLUMN image_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_posts' AND column_name = 'youtube_url') THEN
        ALTER TABLE public.forum_posts ADD COLUMN youtube_url TEXT;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.forum_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_comments' AND column_name = 'image_url') THEN
        ALTER TABLE public.forum_comments ADD COLUMN image_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_comments' AND column_name = 'upvotes') THEN
        ALTER TABLE public.forum_comments ADD COLUMN upvotes INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_comments' AND column_name = 'downvotes') THEN
        ALTER TABLE public.forum_comments ADD COLUMN downvotes INT DEFAULT 0;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.forum_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vote_type TEXT NOT NULL,
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.forum_comment_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vote_type TEXT NOT NULL,
  UNIQUE(comment_id, user_id)
);

-- 6. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Recipient
  source_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Who triggered it
  type TEXT NOT NULL, -- 'like', 'comment'
  post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE
);

-- 7. INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  category TEXT,
  low_stock_threshold INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist for inventory if updated from older schema
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'low_stock_threshold') THEN
        ALTER TABLE public.inventory ADD COLUMN low_stock_threshold INTEGER DEFAULT 5;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'category') THEN
        ALTER TABLE public.inventory ADD COLUMN category TEXT;
    END IF;
END $$;

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own inventory" ON public.inventory;
-- IMPORTANT: RLS Policy must include WITH CHECK for inserts to work properly in some configs
CREATE POLICY "Users can manage their own inventory" 
ON public.inventory 
FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_posts_user_id_fkey') THEN
    ALTER TABLE public.forum_posts DROP CONSTRAINT forum_posts_user_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_posts_user_id_fkey_profiles') THEN
      ALTER TABLE public.forum_posts ADD CONSTRAINT forum_posts_user_id_fkey_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_comments_user_id_fkey') THEN
    ALTER TABLE public.forum_comments DROP CONSTRAINT forum_comments_user_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_comments_user_id_fkey_profiles') THEN
      ALTER TABLE public.forum_comments ADD CONSTRAINT forum_comments_user_id_fkey_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_votes_user_id_fkey') THEN
    ALTER TABLE public.forum_votes DROP CONSTRAINT forum_votes_user_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_votes_user_id_fkey_profiles') THEN
      ALTER TABLE public.forum_votes ADD CONSTRAINT forum_votes_user_id_fkey_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'forum_comment_votes_user_id_fkey_profiles') THEN
      ALTER TABLE public.forum_comment_votes ADD CONSTRAINT forum_comment_votes_user_id_fkey_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  -- Enable joining notifications to profiles to get sender info
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'notifications_source_user_id_fkey_profiles') THEN
      ALTER TABLE public.notifications ADD CONSTRAINT notifications_source_user_id_fkey_profiles FOREIGN KEY (source_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 8. ENABLE RLS AND POLICIES
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read posts" ON public.forum_posts;
CREATE POLICY "Authenticated read posts" ON public.forum_posts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated insert posts" ON public.forum_posts;
CREATE POLICY "Authenticated insert posts" ON public.forum_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own posts" ON public.forum_posts;
CREATE POLICY "Users update own posts" ON public.forum_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own posts" ON public.forum_posts;
CREATE POLICY "Users delete own posts" ON public.forum_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated read comments" ON public.forum_comments;
CREATE POLICY "Authenticated read comments" ON public.forum_comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated insert comments" ON public.forum_comments;
CREATE POLICY "Authenticated insert comments" ON public.forum_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own comments" ON public.forum_comments;
CREATE POLICY "Users update own comments" ON public.forum_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own comments" ON public.forum_comments;
CREATE POLICY "Users delete own comments" ON public.forum_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated read votes" ON public.forum_votes;
CREATE POLICY "Authenticated read votes" ON public.forum_votes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated insert votes" ON public.forum_votes;
CREATE POLICY "Authenticated insert votes" ON public.forum_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Authenticated update votes" ON public.forum_votes;
CREATE POLICY "Authenticated update votes" ON public.forum_votes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Authenticated delete votes" ON public.forum_votes;
CREATE POLICY "Authenticated delete votes" ON public.forum_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated read comment votes" ON public.forum_comment_votes;
CREATE POLICY "Authenticated read comment votes" ON public.forum_comment_votes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated insert comment votes" ON public.forum_comment_votes;
CREATE POLICY "Authenticated insert comment votes" ON public.forum_comment_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Authenticated update comment votes" ON public.forum_comment_votes;
CREATE POLICY "Authenticated update comment votes" ON public.forum_comment_votes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Authenticated delete comment votes" ON public.forum_comment_votes;
CREATE POLICY "Authenticated delete comment votes" ON public.forum_comment_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Notifications Policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
-- Allow inserting notifications for others (e.g. when liking a post)
DROP POLICY IF EXISTS "Authenticated insert notifications" ON public.notifications;
CREATE POLICY "Authenticated insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);


-- 9. STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('forum', 'forum', true) ON CONFLICT (id) DO NOTHING;

-- IMPORTANT: Ensure LOGOS are public so PDF generator can read them
UPDATE storage.buckets SET public = true WHERE id = 'logos';

DROP POLICY IF EXISTS "Allow authenticated view access to logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public view access to logos" ON storage.objects;

-- Create a truly public read policy for logos
CREATE POLICY "Allow public view access to logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "Allow users to upload their own logo" ON storage.objects;
CREATE POLICY "Allow users to upload their own logo" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated view access to forum" ON storage.objects;
CREATE POLICY "Allow authenticated view access to forum" ON storage.objects FOR SELECT USING (bucket_id = 'forum' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Allow users to upload forum images" ON storage.objects;
CREATE POLICY "Allow users to upload forum images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'forum' AND auth.role() = 'authenticated');

-- Force PostgREST to refresh schema cache to pick up new columns
NOTIFY pgrst, 'reload config';
`;

const DbSetupScreen: React.FC<{ sqlScript: string }> = ({ sqlScript }) => {
  return (
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
};


// Helper to upload a file to Supabase Storage
const uploadFile = async (bucket: string, file: File, userId: string, isPublicUpload: boolean = false): Promise<string> => {
    if (!navigator.onLine) {
        throw new Error("Cannot upload file while offline");
    }
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
    | { screen: 'createJob'; returnTo?: 'dashboard' | 'calendar' }
    | { screen: 'selectDocType'; jobId: string }
    | { screen: 'form'; formType: FormType; jobId: string; formId: string | null }
    | { screen: 'settings' }
    | { screen: 'profile' }
    | { screen: 'clients' }
    | { screen: 'analytics' }
    | { screen: 'calendar' }
    | { screen: 'communication' }
    | { screen: 'inventory' }
    | { screen: 'forum'; postId?: string }
    | { screen: 'privacy' }
    | { screen: 'terms' }
    | { screen: 'security' };
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [view, setView] = useState<AppView>(() => {
      const path = window.location.pathname;
      if (path === '/privacy') return { screen: 'privacy' };
      if (path === '/terms') return { screen: 'terms' };
      if (path === '/security') return { screen: 'security' };
      return { screen: 'welcome' };
  });
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [forms, setForms] = useState<FormDataType[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [notificationCount, setNotificationCount] = useState(0);

  const [dbSetupError, setDbSetupError] = useState<string | null>(null);
  
  const [theme, setTheme] = useState<'light' | 'dark' | 'blue'>(() => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'blue') ? (savedTheme as 'light' | 'dark' | 'blue') : 'dark';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [docSearchQuery, setDocSearchQuery] = useState('');

  useEffect(() => {
      const handleOnline = () => {
          setIsOnline(true);
          syncOfflineData();
      };
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
      };
  }, [session]);

  const syncOfflineData = async () => {
      const queue = await dbApi.getAll('offline_queue');
      if (queue.length === 0) return;
      
      if (!session) return;

      console.log("Syncing offline data...", queue.length, "items");
      
      for (const action of queue) {
          try {
              if (action.type === 'create_job') {
                  const { error } = await supabase.from('jobs').insert(action.payload);
                  if (error) throw error;
              } else if (action.type === 'create_form') {
                  const { error } = await supabase.from('documents').upsert(action.payload);
                  if (error) throw error;
              } else if (action.type === 'create_client') {
                  const { error } = await supabase.from('clients').insert(action.payload);
                  if (error) throw error;
              } else if (action.type === 'delete_client') {
                  const { error } = await supabase.from('clients').delete().eq('id', action.payload.id);
                  if (error) throw error;
              } else if (action.type === 'create_inventory') {
                  const { error } = await supabase.from('inventory').insert(action.payload);
                  if (error) throw error;
              } else if (action.type === 'update_inventory') {
                  const { error } = await supabase.from('inventory').update(action.payload).eq('id', action.payload.id);
                  if (error) throw error;
              } else if (action.type === 'delete_inventory') {
                  const { error } = await supabase.from('inventory').delete().eq('id', action.payload.id);
                  if (error) throw error;
              }
              await dbApi.delete('offline_queue', action.id);
          } catch (e) {
              console.error("Failed to sync item:", action, e);
          }
      }
      fetchData();
  };

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark', 'blue');
    root.classList.add(theme);
    if (theme === 'dark' || theme === 'blue') root.classList.add('dark');
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
      if (session) {
          if (session.provider_token) {
              localStorage.setItem('google_provider_token', session.provider_token);
          }
      } else {
          setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
          if (session.provider_token) {
              localStorage.setItem('google_provider_token', session.provider_token);
          }
      } else {
        setProfile(null);
        setJobs([]);
        setForms([]);
        setClients([]);
        setInventory([]);
        
        // Don't redirect if on a public page
        const path = window.location.pathname;
        if (!['/privacy', '/terms', '/security'].includes(path)) {
            setView({ screen: 'welcome' });
        }
        
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);
  
  const fetchData = async () => {
    if (!session) return;
    
    if (!profile) {
        setLoading(true);
        setLoadingMessage('Loading profile...');
    }

    const user = session.user;
    let currentProfile: UserProfile | null = null;

    if (navigator.onLine) {
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError && profileError.code !== 'PGRST116') { 
            if (/relation "public.profiles" does not exist|invalid input syntax|schema cache/i.test(profileError.message)) {
                setDbSetupError(SQL_SETUP_SCRIPT);
                setLoading(false);
                return;
            }
        }

        if (profileData) {
            const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
            let profilePicUrl = profileData.profile_picture_url;

            if (!profilePicUrl && googleAvatar) {
                profilePicUrl = googleAvatar;
                supabase.from('profiles').update({ profile_picture_url: googleAvatar }).eq('id', user.id).then();
            }

            currentProfile = {
                id: profileData.id,
                email: profileData.email,
                name: profileData.name,
                companyName: profileData.company_name,
                logoUrl: profileData.logo_url,
                profilePictureUrl: profilePicUrl,
                address: profileData.address,
                phone: profileData.phone,
                website: profileData.website,
                jobTitle: profileData.job_title,
                subscriptionTier: profileData.subscription_tier as 'Basic' | 'Premium',
                language: profileData.language,
                emailTemplates: profileData.email_templates,
                theme: profileData.theme
            };
            if (profileData.theme) {
                setTheme(profileData.theme as 'light' | 'dark' | 'blue');
            }
            await dbApi.put('profile', currentProfile);
        } else if (!profileError || profileError.code === 'PGRST116') {
            const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
            const metaAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
            let nameToSet = metaName;
            if (!nameToSet) {
                const namePart = user.email!.split('@')[0];
                nameToSet = namePart.replace(/[._-]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            }
            const { data: newProfileData } = await supabase
                .from('profiles')
                .insert({
                    id: user.id,
                    email: user.email,
                    name: nameToSet,
                    company_name: `${nameToSet}'s Company`,
                    logo_url: '', 
                    profile_picture_url: metaAvatar || '', 
                    theme: theme, // Save current theme on creation
                })
                .select()
                .single();

            if (newProfileData) {
                currentProfile = {
                    id: newProfileData.id,
                    email: newProfileData.email,
                    name: newProfileData.name,
                    companyName: newProfileData.company_name,
                    logoUrl: newProfileData.logo_url,
                    profilePictureUrl: newProfileData.profile_picture_url,
                    address: newProfileData.address,
                    phone: newProfileData.phone,
                    website: newProfileData.website,
                    jobTitle: newProfileData.job_title,
                    subscriptionTier: newProfileData.subscription_tier as 'Basic' | 'Premium',
                    language: newProfileData.language,
                    emailTemplates: newProfileData.email_templates,
                    theme: newProfileData.theme
                };
                await dbApi.put('profile', currentProfile);
            }
        }
    } else {
        const cachedProfiles = await dbApi.getAll('profile');
        if (cachedProfiles.length > 0) {
            currentProfile = cachedProfiles[0];
            if (currentProfile?.theme) setTheme(currentProfile.theme);
        }
    }
    setProfile(currentProfile);

    if (navigator.onLine) {
        const { data: jobsData } = await supabase.from('jobs').select('*').eq('user_id', user.id);
        if (jobsData) {
            const mappedJobs = jobsData.map(j => ({...j, startDate: j.start_date, endDate: j.end_date, clientName: j.client_name, clientAddress: j.client_address, userId: j.user_id}));
            setJobs(mappedJobs);
            await dbApi.clear('jobs');
            for (const j of mappedJobs) await dbApi.put('jobs', j);
        }
    } else {
        const cachedJobs = await dbApi.getAll('jobs');
        setJobs(cachedJobs);
    }

    if (navigator.onLine) {
        const { data: formsData } = await supabase.from('documents').select('*').eq('user_id', user.id);
        if (formsData) {
            const mappedForms = formsData.map(f => ({...f, jobId: f.job_id, createdAt: f.created_at }));
            setForms(mappedForms);
            await dbApi.clear('documents');
            for (const f of mappedForms) await dbApi.put('documents', f);
        }
    } else {
        const cachedForms = await dbApi.getAll('documents');
        setForms(cachedForms);
    }

    if (navigator.onLine) {
        const { data: clientsData } = await supabase.from('clients').select('*').eq('user_id', user.id);
        if (clientsData) {
            setClients(clientsData);
            await dbApi.clear('clients');
            for (const c of clientsData) await dbApi.put('clients', c);
        }
    } else {
        const cachedClients = await dbApi.getAll('clients');
        setClients(cachedClients);
    }

    if (navigator.onLine) {
        const { data: invData, error: invError } = await supabase.from('inventory').select('*').eq('user_id', user.id).order('name');
        if (invData) {
            setInventory(invData);
            await dbApi.clear('inventory');
            for (const i of invData) await dbApi.put('inventory', i);
        } else if (invError && (/relation.*does not exist/i.test(invError.message))) {
             setDbSetupError(SQL_SETUP_SCRIPT);
        }
    } else {
        const cachedInventory = await dbApi.getAll('inventory');
        setInventory(cachedInventory);
    }
    
    if (navigator.onLine) {
        const { count, error: notifError } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false);
        
        if (!notifError) {
            setNotificationCount(count || 0);
        } else if (notifError.code === '42P01' || /relation "public.notifications" does not exist/i.test(notifError.message)) {
             setDbSetupError(SQL_SETUP_SCRIPT);
        }
    }
    
    if (navigator.onLine) {
        const { error: forumError } = await supabase.from('forum_posts').select('id, image_url, youtube_url').limit(1);
        if (forumError) {
             if (forumError.code === 'PGRST204' || 
                 forumError.code === '42703' || 
                 /relation "public.forum_posts" does not exist|schema cache|column "image_url" does not exist|column "youtube_url" does not exist|Could not find the 'youtube_url' column/i.test(forumError.message)) {
                 setDbSetupError(SQL_SETUP_SCRIPT);
                 setLoading(false);
                 return;
             }
        }
    }

    const savedViewStr = localStorage.getItem('app_view_state');
    const path = window.location.pathname;
    
    // Only restore from localStorage if NOT visiting a direct public URL
    if (savedViewStr && !['/privacy', '/terms', '/security'].includes(path)) {
        try {
            const savedView = JSON.parse(savedViewStr);
            if (savedView.screen !== 'welcome' && savedView.screen !== 'auth') {
                setView(savedView);
            }
        } catch (e) {}
    } else if (!['/privacy', '/terms', '/security'].includes(path)) {
        // Only set default dashboard if not on a public page
        setView({ screen: 'dashboard' });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  const handleLogin = async (email: string, pass: string) => {
    if (!navigator.onLine) { alert("You must be online to log in."); return; }
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
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            }
        } 
    });
  };

  const handleConnectGmail = async () => {
      await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
              redirectTo: window.location.origin,
              scopes: 'https://www.googleapis.com/auth/gmail.send',
              queryParams: {
                  access_type: 'offline',
                  prompt: 'consent',
              }
          }
      });
  };

  const handleLogout = async () => {
    if (navigator.onLine) await supabase.auth.signOut();
    localStorage.removeItem('app_view_state');
    localStorage.removeItem('google_provider_token');
    setSession(null);
    setView({ screen: 'welcome' });
  };

  const markNotificationsAsRead = async () => {
      if (!session || !navigator.onLine) return;
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', session.user.id);
      if (!error) setNotificationCount(0);
  };

  const navigateToDashboard = () => setView({ screen: 'dashboard' });
  const navigateToSettings = () => setView({ screen: 'settings' });
  const navigateToNewDoc = (jobId: string) => setView({ screen: 'selectDocType', jobId });
  const navigateToCreateJob = (returnTo: 'dashboard' | 'calendar' = 'dashboard') => setView({ screen: 'createJob', returnTo });
  const navigateToClients = () => setView({ screen: 'clients' });
  const navigateToInventory = () => setView({ screen: 'inventory' });
  const navigateToAnalytics = () => setView({ screen: 'analytics' });
  const navigateToCalendar = () => setView({ screen: 'calendar' });
  const navigateToCommunication = () => setView({ screen: 'communication' });
  const navigateToForum = (postId?: string) => {
      markNotificationsAsRead();
      setView({ screen: 'forum', postId });
  };

  const handleUpdateAppLogo = async (file: File): Promise<string> => {
     if (!session || !profile) return '';
     try {
         const compressed = await compressImage(file);
         const url = await uploadFile('logos', compressed, session.user.id, true);
         await supabase.from('profiles').update({ logo_url: url }).eq('id', session.user.id);
         const updatedProfile = { ...profile, logoUrl: url };
         setProfile(updatedProfile);
         await dbApi.put('profile', updatedProfile);
         return url;
     } catch(e) {
         console.error("Failed to sync logo globally", e);
         alert("Failed to update logo globally.");
         return '';
     }
  };

  const handleUploadDocumentImage = async (file: File): Promise<string> => {
      if (!session) return '';
      try {
          const compressed = await compressImage(file);
          return await uploadFile('logos', compressed, session.user.id, true);
      } catch (e) {
          console.error("Failed to upload image", e);
          return '';
      }
  };

  const handleSaveProfile = async (updatedProfile: UserProfile, logoFile?: File | null, profilePicFile?: File | null) => {
      if (!session) return;
      if (!navigator.onLine) { alert("You must be online to update your profile."); return; }
      setLoading(true);
      
      let newLogoUrl = updatedProfile.logoUrl;
      let newProfilePicUrl = updatedProfile.profilePictureUrl;
      
      try {
          if (logoFile) {
              const uploadedUrl = await uploadFile('logos', logoFile, session.user.id, true);
              if (uploadedUrl) newLogoUrl = uploadedUrl;
          }
          
          if (profilePicFile) {
              const uploadedUrl = await uploadFile('logos', profilePicFile, session.user.id, true);
              if (uploadedUrl) newProfilePicUrl = uploadedUrl;
          }
      } catch (error) { 
          console.error("Failed to upload image", error);
          setLoading(false); 
          return; 
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
          profile_picture_url: newProfilePicUrl,
          job_title: updatedProfile.jobTitle,
          language: updatedProfile.language,
          email_templates: updatedProfile.emailTemplates,
          theme: theme, // Save current theme on creation
          updated_at: new Date().toISOString(),
      };
      
      const { data, error } = await supabase.from('profiles').upsert(profileForDb).select().single();
      
      if (!error && data) {
          const updated = {
              id: data.id, 
              email: data.email, 
              name: data.name, 
              companyName: data.company_name, 
              logoUrl: data.logo_url,
              profilePictureUrl: data.profile_picture_url,
              address: data.address, 
              phone: data.phone, 
              website: data.website, 
              jobTitle: data.job_title,
              subscriptionTier: data.subscription_tier as 'Basic' | 'Premium', 
              language: data.language,
              emailTemplates: data.email_templates,
              theme: data.theme
          };
          
          setProfile(updated);
          await dbApi.put('profile', updated);
          setView({ screen: 'dashboard' });
      } else {
          console.error("Error updating profile:", JSON.stringify(error, null, 2));
          if (error.code === 'PGRST204' || error.message.includes('profile_picture_url') || error.message.includes('email_templates') || error.message.includes('schema cache')) {
              setDbSetupError(SQL_SETUP_SCRIPT);
          } else {
              alert(`Failed to save profile: ${error.message}`);
          }
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
    
    const jobId = crypto.randomUUID(); 
    const newJob = {
      id: jobId,
      user_id: session.user.id,
      name: jobData.name,
      client_name: jobData.clientName,
      client_address: jobData.clientAddress,
      start_date: jobData.startDate,
      status: 'active',
    };

    if (navigator.onLine) {
        const { error } = await supabase.from('jobs').insert(newJob);
        if (!error) {
          const { data } = await supabase.from('jobs').select('*').eq('user_id', session.user.id);
          if(data) {
              const mapped = data.map(j => ({...j, startDate: j.start_date, endDate: j.end_date, clientName: j.client_name, clientAddress: j.client_address, userId: j.user_id}));
              setJobs(mapped);
              await dbApi.clear('jobs');
              for(const j of mapped) await dbApi.put('jobs', j);
          }
        }
    } else {
        await dbApi.put('offline_queue', { id: crypto.randomUUID(), type: 'create_job', payload: newJob, timestamp: Date.now() });
        const optimisticJob = {
            ...newJob,
            startDate: newJob.start_date,
            clientName: newJob.client_name,
            clientAddress: newJob.client_address,
            userId: session.user.id
        };
        const updatedJobs = [...jobs, optimisticJob as unknown as Job];
        setJobs(updatedJobs);
        await dbApi.put('jobs', optimisticJob);
        alert("You are offline. Job saved locally.");
    }
    
    const currentView = view as any;
    if (currentView.screen === 'createJob' && currentView.returnTo === 'calendar') {
        setView({ screen: 'calendar' });
    } else {
        setView({ screen: 'dashboard' });
    }
    setLoading(false);
  };

  const handleUpdateJobStatus = async (jobId: string, newStatus: any) => {
      if (!session) return;
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
      
      const job = jobs.find(j => j.id === jobId);
      if (job) await dbApi.put('jobs', { ...job, status: newStatus });

      if (navigator.onLine) {
          await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId);
      } else {
          alert("Status updated locally.");
      }
  };

  const handleSaveForm = async (formData: any) => {
    if (view.screen !== 'form' || !session) return;
    setLoading(true);
    const formId = view.formId || crypto.randomUUID();
    
    const formRecord: any = { 
        id: formId,
        user_id: session.user.id, 
        job_id: view.jobId, 
        type: view.formType, 
        data: formData 
    };

    if (navigator.onLine) {
        const { error } = await supabase.from('documents').upsert(formRecord);
        if (!error) {
          const { data } = await supabase.from('documents').select('*').eq('user_id', session.user.id);
          if (data) {
              const mapped = data.map(f => ({...f, jobId: f.job_id, createdAt: f.created_at }));
              setForms(mapped);
              await dbApi.clear('documents');
              for(const f of mapped) await dbApi.put('documents', f);
          }
        }
    } else {
        if (!view.formId) {
            await dbApi.put('offline_queue', { id: crypto.randomUUID(), type: 'create_form', payload: formRecord, timestamp: Date.now() });
        } else {
            alert("Offline editing existing docs is risky. Saved locally only.");
        }
        
        const newForm = { 
            ...formRecord, 
            jobId: view.jobId, 
            createdAt: new Date().toISOString() 
        };
        
        const updatedForms = view.formId 
            ? forms.map(f => f.id === view.formId ? newForm : f)
            : [...forms, newForm];
            
        setForms(updatedForms);
        await dbApi.put('documents', newForm);
        alert("You are offline. Document saved locally.");
    }

    setView({ screen: 'jobDetails', jobId: view.jobId });
    setLoading(false);
  };

  const handleAddClient = async (clientData: any) => {
      if (!session) return;
      setLoading(true);
      const newClient = { id: crypto.randomUUID(), user_id: session.user.id, ...clientData };
      
      if (navigator.onLine) {
          await supabase.from('clients').insert(newClient);
          const { data } = await supabase.from('clients').select('*').eq('user_id', session.user.id).order('name');
          if(data) {
              setClients(data);
              await dbApi.clear('clients');
              for(const c of data) await dbApi.put('clients', c);
          }
      } else {
          await dbApi.put('offline_queue', { id: crypto.randomUUID(), type: 'create_client', payload: newClient, timestamp: Date.now() });
          const updatedClients = [...clients, newClient];
          setClients(updatedClients);
          await dbApi.put('clients', newClient);
          alert("Client saved offline.");
      }
      setLoading(false);
  };

  const handleDeleteClient = async (id: string) => {
      if (!session) return;
      setLoading(true);
      
      if (navigator.onLine) {
          await supabase.from('clients').delete().eq('id', id);
          const { data } = await supabase.from('clients').select('*').eq('user_id', session.user.id).order('name');
          if(data) {
              setClients(data);
              await dbApi.clear('clients');
              for(const c of data) await dbApi.put('clients', c);
          }
      } else {
          await dbApi.put('offline_queue', { id: crypto.randomUUID(), type: 'delete_client', payload: { id }, timestamp: Date.now() });
          const updatedClients = clients.filter(c => c.id !== id);
          setClients(updatedClients);
          await dbApi.delete('clients', id);
          alert("Client deleted locally.");
      }
      setLoading(false);
  };

  // Inventory Handlers
  const handleAddInventoryItem = async (itemData: any) => {
      if (!session) return;
      setLoading(true);
      const newItem = { id: crypto.randomUUID(), user_id: session.user.id, ...itemData, created_at: new Date().toISOString() };
      
      if (navigator.onLine) {
          await supabase.from('inventory').insert(newItem);
          const { data } = await supabase.from('inventory').select('*').eq('user_id', session.user.id).order('name');
          if (data) {
              setInventory(data);
              await dbApi.clear('inventory');
              for(const i of data) await dbApi.put('inventory', i);
          }
      } else {
          await dbApi.put('offline_queue', { id: crypto.randomUUID(), type: 'create_inventory', payload: newItem, timestamp: Date.now() });
          const updatedInventory = [...inventory, newItem];
          setInventory(updatedInventory);
          await dbApi.put('inventory', newItem);
          alert("Item saved offline.");
      }
      setLoading(false);
  };

  const handleUpdateInventoryItem = async (item: InventoryItem) => {
      if (!session) return;
      // Optimistic update
      setInventory(prev => prev.map(i => i.id === item.id ? item : i));
      
      if (navigator.onLine) {
          await supabase.from('inventory').update({ quantity: item.quantity, low_stock_threshold: item.low_stock_threshold, name: item.name }).eq('id', item.id);
          await dbApi.put('inventory', item);
      } else {
          await dbApi.put('offline_queue', { id: crypto.randomUUID(), type: 'update_inventory', payload: item, timestamp: Date.now() });
          await dbApi.put('inventory', item);
      }
  };

  const handleDeleteInventoryItem = async (id: string) => {
      if (!session) return;
      
      if (navigator.onLine) {
          await supabase.from('inventory').delete().eq('id', id);
          const { data } = await supabase.from('inventory').select('*').eq('user_id', session.user.id).order('name');
          if (data) {
              setInventory(data);
              await dbApi.clear('inventory');
              for(const i of data) await dbApi.put('inventory', i);
          }
      } else {
          await dbApi.put('offline_queue', { id: crypto.randomUUID(), type: 'delete_inventory', payload: { id }, timestamp: Date.now() });
          const updatedInventory = inventory.filter(i => i.id !== id);
          setInventory(updatedInventory);
          await dbApi.delete('inventory', id);
      }
  };
  
  const getTranslation = () => {
      const lang = profile?.language || 'English';
      return translations[lang] || translations['English'];
  }

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
            <div className="flex items-center gap-4"><AppLogo className="w-12 h-12 drop-shadow-md" /><h1 className="text-2xl md:text-3xl font-bold">{t.welcome} {profile.name.split(' ')[0]}!</h1></div>
            {!isOnline && <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-bold animate-pulse">OFFLINE MODE</div>}
            <div className="flex items-center gap-4 flex-wrap">
              <Button onClick={() => navigateToCreateJob('dashboard')}>+ {t.newJob}</Button>
              
              {/* Inventory Button */}
              <Button 
                variant="outline" 
                onClick={navigateToInventory} 
                className="flex items-center gap-2 animate-in fade-in zoom-in duration-300"
              >
                  <BoxIcon className="w-4 h-4" /> Inventory
              </Button>

              <Button variant="outline" onClick={navigateToCalendar} className="flex items-center gap-2"><CalendarIcon className="w-4 h-4" /> Schedule</Button>
              
              <Button variant="outline" onClick={() => navigateToForum()} className="flex items-center gap-2 relative">
                  <MessageSquareIcon className="w-4 h-4" /> Community
                  {notificationCount > 0 && (
                      <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold shadow-sm animate-pulse">
                          {notificationCount > 9 ? '9+' : notificationCount}
                      </span>
                  )}
              </Button>
              
              <Button variant="outline" onClick={navigateToAnalytics} className="flex items-center gap-2"><BarChartIcon className="w-4 h-4" /> Insights</Button>
              <Button variant="ghost" size="icon" onClick={() => setView({ screen: 'profile' })} className="rounded-full h-10 w-10 overflow-hidden border border-border">{profile.profilePictureUrl ? <img src={profile.profilePictureUrl} alt="Profile" className="h-full w-full object-cover" /> : <UserIcon className="h-6 w-6" />}</Button>
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
    const getDocTitle = (form: FormDataType) => { const d = form.data as any; return d.title || d.invoiceNumber || d.estimateNumber || d.reportNumber || d.workOrderNumber || d.warrantyNumber || d.changeOrderNumber || d.poNumber || form.type; };
    const jobForms = forms.filter(f => f.jobId === job.id).filter(f => getDocTitle(f).toLowerCase().includes(docSearchQuery.toLowerCase()) || f.type.toLowerCase().includes(docSearchQuery.toLowerCase()));
    const getDocIcon = (type: FormType) => { switch(type) { case FormType.Invoice: return InvoiceIcon; case FormType.Estimate: return EstimateIcon; case FormType.ChangeOrder: return ChangeOrderIcon; case FormType.PurchaseOrder: return TruckIcon; default: return InvoiceIcon; }}; 
    const getStatusBadge = (form: FormDataType) => { const status = (form.data as any).status; return status ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground border border-border">{status}</span> : null; };

    return (
      <div className="w-full min-h-screen bg-background text-foreground p-4 md:p-8 pb-24">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 border-b border-border pb-4 gap-4">
          <div className="flex items-center">
              <Button variant="ghost" size="sm" onClick={navigateToDashboard} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                <BackArrowIcon className="h-6 w-6" />
              </Button>
              <div>
                  <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 tracking-tight truncate max-w-xs md:max-w-md">
                      {job.name}
                  </h1>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <UsersIcon className="w-4 h-4" />
                      {job.clientName}
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-3">
              <select 
                value={job.status} 
                onChange={(e) => handleUpdateJobStatus(job.id, e.target.value as any)} 
                className="h-9 rounded-full border bg-card px-3 py-1 text-sm font-medium shadow-sm hover:bg-secondary focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer"
              >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
              </select>
              <Button onClick={() => navigateToNewDoc(job.id)} className="rounded-full shadow-md shadow-primary/20">
                  <PlusIcon className="w-4 h-4 mr-2" /> {t.newDocument}
              </Button>
          </div>
        </header>

        {!isOnline && <div className="bg-orange-100 text-orange-800 px-4 py-2 rounded-md mb-4 text-center text-sm font-bold animate-pulse">You are OFFLINE. Documents created will sync later.</div>}
        
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t.projectDocs}</h2>
                <div className="relative w-full max-w-xs">
                    <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
                    <Input 
                        placeholder="Search docs..." 
                        className="pl-9 h-9 text-sm rounded-full bg-secondary/30 border-transparent hover:bg-secondary/50 focus:bg-background focus:border-primary transition-all" 
                        value={docSearchQuery} 
                        onChange={(e) => setDocSearchQuery(e.target.value)} 
                    />
                </div>
            </div>

            {jobForms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-muted/10 rounded-xl border border-dashed border-border">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                        <BriefcaseIcon className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">No documents yet</h3>
                    <p className="text-muted-foreground max-w-sm mt-1 mb-6">{t.noDocsYet}</p>
                    <Button variant="outline" onClick={() => navigateToNewDoc(job.id)} className="rounded-full">
                        Create First Document
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {jobForms.map(form => { 
                        const Icon = getDocIcon(form.type); 
                        return (
                            <Card 
                                key={form.id} 
                                className="group hover:shadow-lg transition-all duration-200 border-border hover:border-primary/30 cursor-pointer bg-card overflow-hidden"
                                onClick={() => setView({ screen: 'form', formType: form.type, jobId: job.id, formId: form.id })}
                            >
                                <div className="p-4 flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 overflow-hidden">
                                        <div className="p-2.5 bg-primary/10 text-primary rounded-xl shrink-0 group-hover:scale-110 transition-transform duration-300">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-semibold truncate pr-2 text-foreground group-hover:text-primary transition-colors">{getDocTitle(form)}</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5 font-medium">{form.type}</p>
                                            <p className="text-[10px] text-muted-foreground/70 mt-1">Created {new Date(form.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        {getStatusBadge(form)}
                                    </div>
                                </div>
                                <div className="px-4 pb-3 pt-0 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity -translate-y-2 group-hover:translate-y-0 duration-200">
                                    <span className="text-xs font-bold text-primary flex items-center">
                                        Edit Document <BackArrowIcon className="w-3 h-3 ml-1 rotate-180" />
                                    </span>
                                </div>
                            </Card>
                        ); 
                    })}
                </div>
            )}
        </div>
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

    const componentKey = formId || `new-${formType}`;

    switch (formType) {
      case FormType.Invoice: return <InvoiceForm key={componentKey} job={job} userProfile={profile} invoice={form?.data as InvoiceData | null} onSave={handleSaveForm} onClose={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.DailyJobReport: return <DailyJobReportForm key={componentKey} profile={profile} job={job} clients={clients} report={form?.data as DailyJobReportData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.Note: return <NoteForm key={componentKey} profile={profile} job={job} note={form?.data as NoteData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.WorkOrder: return <WorkOrderForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as WorkOrderData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.TimeSheet: return <TimeSheetForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as TimeSheetData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.MaterialLog: return <MaterialLogForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as MaterialLogData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.Estimate: return <EstimateForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as EstimateData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.ExpenseLog: return <ExpenseLogForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as ExpenseLogData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.Warranty: return <WarrantyForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as WarrantyData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.Receipt: return <ReceiptForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as ReceiptData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.ChangeOrder: return <ChangeOrderForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as ChangeOrderData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.PurchaseOrder: return <PurchaseOrderForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as PurchaseOrderData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      default: return <div className="p-8"><h2 className="text-2xl mb-4">{formType} not implemented.</h2><Button onClick={navigateToDashboard}>Back</Button></div>;
    }
  };

  const getDockItems = () => {
    const t = getTranslation();
    const items = [{ icon: HomeIcon, label: t.dashboard, onClick: navigateToDashboard }];
    
    if (view.screen === 'dashboard' || view.screen === 'calendar') {
        items.push({ icon: CalendarIcon, label: 'Schedule', onClick: navigateToCalendar });
    }

    if (view.screen === 'jobDetails') items.push({ icon: PlusIcon, label: t.newDocument, onClick: () => navigateToNewDoc(view.jobId) });
    else if (view.screen === 'dashboard' || view.screen === 'clients') items.push({ icon: UsersIcon, label: 'Clients', onClick: navigateToClients });
    
    items.push({ icon: MailIcon, label: 'Communication', onClick: navigateToCommunication });

    items.push({ icon: SettingsIcon, label: t.settings, onClick: navigateToSettings });
    return items;
  };
  
  const renderContent = () => {
    if (dbSetupError) return <DbSetupScreen sqlScript={dbSetupError} />;
    if (loading) return <div className="flex items-center justify-center min-h-screen">{loadingMessage}</div>;
    if (!session) {
        if (view.screen === 'welcome') return <Welcome onGetStarted={() => setView({ screen: 'auth', authScreen: 'signup' })} onLogin={() => setView({ screen: 'auth', authScreen: 'login' })} />;
        // Explicitly check for public pages to render them even if not logged in
        if (view.screen === 'privacy') return <PrivacyPolicy onBack={() => setView({ screen: 'welcome' })} />;
        if (view.screen === 'terms') return <TermsOfService onBack={() => setView({ screen: 'welcome' })} />;
        if (view.screen === 'security') return <Security onBack={() => setView({ screen: 'welcome' })} />;
        
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
      case 'clients': 
        return <ClientsView 
                  onBack={navigateToDashboard} 
                  supabase={supabase} 
                  session={session}
                  clients={clients}
                  onAddClient={handleAddClient}
                  onDeleteClient={handleDeleteClient}
                  isOnline={isOnline}
               />;
      case 'inventory':
        return <InventoryView 
                  onBack={navigateToDashboard}
                  inventory={inventory}
                  onAddItem={handleAddInventoryItem}
                  onUpdateItem={handleUpdateInventoryItem}
                  onDeleteItem={handleDeleteInventoryItem}
               />;
      case 'analytics': return <AnalyticsView jobs={jobs} forms={forms} onBack={navigateToDashboard} />;
      case 'calendar': return <CalendarView jobs={jobs} onBack={navigateToDashboard} onNavigateJob={(jobId) => setView({ screen: 'jobDetails', jobId })} onNewJob={() => navigateToCreateJob('calendar')} />;
      case 'communication': if (!profile) return null; return <CommunicationView clients={clients} forms={forms} jobs={jobs} profile={profile} onBack={navigateToDashboard} session={session} onConnectGmail={handleConnectGmail} />;
      case 'forum': 
        return (
            <ForumView 
                onBack={navigateToDashboard} 
                supabase={supabase} 
                session={session} 
                onUploadImage={handleUploadForumImage} 
                initialPostId={view.postId}
                onNavigate={(postId) => setView({ screen: 'forum', postId: postId || undefined })}
                onDbSetupNeeded={() => setDbSetupError(SQL_SETUP_SCRIPT)}
            />
        );
      case 'privacy': return <PrivacyPolicy onBack={() => setView({ screen: 'dashboard' })} />;
      case 'terms': return <TermsOfService onBack={() => setView({ screen: 'dashboard' })} />;
      case 'security': return <Security onBack={() => setView({ screen: 'dashboard' })} />;
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
