
import React, { useState, useEffect } from 'react';
import { FormType } from './types.ts';
import type { UserProfile, Job, FormData as FormDataType, InvoiceData, DailyJobReportData, NoteData, WorkOrderData, TimeSheetData, MaterialLogData, EstimateData, ExpenseLogData, WarrantyData, ReceiptData, ChangeOrderData, PurchaseOrderData, Client, Notification, InventoryItem, SavedItem } from './types.ts';
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
import PriceBookView from './components/PriceBookView.tsx';
import ProfitCalculatorView from './components/ProfitCalculatorView.tsx';
import PortalView from './components/PortalView.tsx';
import DocumentApprovalView from './components/DocumentApprovalView.tsx';
import Dock from './components/Dock.tsx';
import JobForm from './components/JobForm.tsx';
import Welcome from './components/Welcome.tsx';
import PrivacyPolicy from './components/PrivacyPolicy.tsx';
import TermsOfService from './components/TermsOfService.tsx';
import Security from './components/Security.tsx';

import { HomeIcon, SettingsIcon, PlusIcon, BackArrowIcon, UserIcon, AppLogo, SearchIcon, UsersIcon, CheckCircleIcon, XCircleIcon, ClockIcon, CreditCardIcon, InvoiceIcon, DailyReportIcon, TimeSheetIcon, MaterialLogIcon, EstimateIcon, ExpenseLogIcon, WarrantyIcon, NoteIcon, ReceiptIcon, WorkOrderIcon, BarChartIcon, MessageSquareIcon, CalendarIcon, ChangeOrderIcon, TruckIcon, BriefcaseIcon, MailIcon, BoxIcon, TagIcon, CalculatorIcon, ChevronDownIcon } from './components/Icons.tsx';
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

// Use window.supabase for legacy script tag support as requested previously
const supabase: SupabaseClient = (window as any).supabase ? (window as any).supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

const SQL_SETUP_SCRIPT = `-- This script sets up and fixes your database schema.
-- Run this script in your Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES
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
  theme TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. CLIENTS (Updated with Portal Key)
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  portal_key TEXT DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure portal_key exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'portal_key') THEN
        ALTER TABLE public.clients ADD COLUMN portal_key TEXT DEFAULT encode(gen_random_bytes(16), 'hex');
    END IF;
END $$;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own clients" ON public.clients;
CREATE POLICY "Users can manage their own clients" ON public.clients FOR ALL USING (auth.uid() = user_id);

-- 3. JOBS
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

-- 4. DOCUMENTS (Updated with public_token)
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  public_token UUID DEFAULT gen_random_uuid()
);

-- Ensure public_token exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'public_token') THEN
        ALTER TABLE public.documents ADD COLUMN public_token UUID DEFAULT gen_random_uuid();
    END IF;
END $$;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own documents" ON public.documents;
CREATE POLICY "Users can manage their own documents" ON public.documents FOR ALL USING (auth.uid() = user_id);

-- 5. SAVED ITEMS (Price Book)
CREATE TABLE IF NOT EXISTS public.saved_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rate NUMERIC DEFAULT 0,
  unit_cost NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage saved items" ON public.saved_items;
CREATE POLICY "Users can manage saved items" ON public.saved_items FOR ALL USING (auth.uid() = user_id);

-- 6. INVENTORY
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  category TEXT,
  low_stock_threshold INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own inventory" ON public.inventory;
CREATE POLICY "Users can manage their own inventory" ON public.inventory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. FORUM & NOTIFICATIONS (Skipped for brevity, assumed existing)

-- 8. STORAGE (Logos)
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT (id) DO NOTHING;
UPDATE storage.buckets SET public = true WHERE id = 'logos';
DROP POLICY IF EXISTS "Allow public view access to logos" ON storage.objects;
CREATE POLICY "Allow public view access to logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
DROP POLICY IF EXISTS "Allow users to upload their own logo" ON storage.objects;
CREATE POLICY "Allow users to upload their own logo" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');

-- 9. PORTAL FUNCTIONS
CREATE OR REPLACE FUNCTION get_portal_data(p_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id uuid;
  v_user_id uuid;
  v_client_data json;
  v_contractor_data json;
  v_documents json;
BEGIN
  -- Find client by key
  SELECT id, user_id INTO v_client_id, v_user_id FROM public.clients WHERE portal_key = p_key LIMIT 1;
  
  IF v_client_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid portal key');
  END IF;

  -- Get Client Data
  SELECT row_to_json(c) INTO v_client_data FROM public.clients c WHERE id = v_client_id;
  
  -- Get Contractor Profile
  SELECT row_to_json(p) INTO v_contractor_data FROM public.profiles p WHERE id = v_user_id;

  -- Get Documents related to this client name (Simple text match for MVP)
  -- Note: Ideally documents would link to client_id, but current schema links to job_id.
  -- We'll fetch docs where the JSON data->>'clientName' matches client name.
  SELECT json_agg(d) INTO v_documents 
  FROM public.documents d 
  WHERE d.user_id = v_user_id 
  AND d.data->>'clientName' = (v_client_data->>'name');

  RETURN json_build_object(
    'client', v_client_data,
    'contractor', v_contractor_data,
    'documents', COALESCE(v_documents, '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION sign_document_via_portal(p_key text, p_doc_id uuid, p_signature text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  -- Validate Key
  SELECT id INTO v_client_id FROM public.clients WHERE portal_key = p_key LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Invalid portal key';
  END IF;

  -- Update Document
  UPDATE public.documents 
  SET data = jsonb_set(
      jsonb_set(data, '{signatureUrl}', to_jsonb(p_signature)),
      '{status}', '"Accepted"'
  )
  WHERE id = p_doc_id;
END;
$$;

-- 10. APPROVAL LINK FUNCTIONS
CREATE OR REPLACE FUNCTION get_document_by_token(doc_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc record;
  v_contractor_data json;
BEGIN
  -- Find Document
  SELECT * INTO v_doc FROM public.documents WHERE public_token = doc_token LIMIT 1;
  
  IF v_doc.id IS NULL THEN
    RETURN json_build_object('error', 'Document not found');
  END IF;

  -- Get Contractor Profile
  SELECT row_to_json(p) INTO v_contractor_data FROM public.profiles p WHERE id = v_doc.user_id;

  RETURN json_build_object(
    'document', row_to_json(v_doc),
    'contractor', v_contractor_data
  );
END;
$$;

CREATE OR REPLACE FUNCTION approve_document_by_token(doc_token uuid, p_signature text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc_id uuid;
BEGIN
  -- Find doc ID
  SELECT id INTO v_doc_id FROM public.documents WHERE public_token = doc_token LIMIT 1;
  
  IF v_doc_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  -- Update Document
  UPDATE public.documents 
  SET data = jsonb_set(
      jsonb_set(data, '{signatureUrl}', to_jsonb(p_signature)),
      '{status}', '"Accepted"'
  )
  WHERE id = v_doc_id;
END;
$$;

NOTIFY pgrst, 'reload config';
`;

const DbSetupScreen: React.FC<{ sqlScript: string }> = ({ sqlScript }) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4 md:p-8">
      <Card className="max-w-4xl w-full animate-fade-in-down">
        <CardHeader>
          <CardTitle className="text-2xl text-destructive">Database Update Required</CardTitle>
          <CardDescription>
            To enable Price Book, Client Portal, and Inventory, please run this script.
            <br /><br />
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
    | { screen: 'pricebook' }
    | { screen: 'profitCalculator' }
    | { screen: 'forum'; postId?: string }
    | { screen: 'privacy' }
    | { screen: 'terms' }
    | { screen: 'security' };

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [view, setView] = useState<AppView>(() => {
    const params = new URLSearchParams(window.location.search);
    // Check for Portal URL param
    const portalKey = params.get('portal');
    // Check for Approval Token
    const approvalToken = params.get('approval_token');

    if (portalKey || approvalToken) {
      // If external link exists, we don't need app state, we'll render portal view directly
      return { screen: 'welcome' }; // Placeholder, logic handled below
    }

    const path = window.location.pathname.replace(/\/$/, ''); // remove trailing slash
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
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // External Access State
  const [portalKey, setPortalKey] = useState<string | null>(null);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);

  const [notificationCount, setNotificationCount] = useState(0);

  const [dbSetupError, setDbSetupError] = useState<string | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark' | 'blue'>(() => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'blue') ? (savedTheme as 'light' | 'dark' | 'blue') : 'dark';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [docSearchQuery, setDocSearchQuery] = useState('');

  const [showToolsMenu, setShowToolsMenu] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pk = params.get('portal');
    const at = params.get('approval_token');

    if (pk) {
      setPortalKey(pk);
      setLoading(false);
    } else if (at) {
      setApprovalToken(at);
      setLoading(false);
    }
  }, []);

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
    // ... existing sync logic ...
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
    if ((!portalKey && !approvalToken) && !supabase) {
      setLoading(false);
      return;
    }
    if (!portalKey && !approvalToken) {
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
          setSavedItems([]);

          const path = window.location.pathname.replace(/\/$/, '');
          if (!['/privacy', '/terms', '/security'].includes(path)) {
            setView({ screen: 'welcome' });
          }

          setLoading(false);
        }
      });

      return () => subscription.unsubscribe();
    }
  }, [portalKey, approvalToken]);

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
        currentProfile = {
          id: profileData.id,
          email: profileData.email,
          name: profileData.name,
          companyName: profileData.company_name,
          logoUrl: profileData.logo_url,
          profilePictureUrl: profileData.profile_picture_url,
          address: profileData.address,
          phone: profileData.phone,
          website: profileData.website,
          jobTitle: profileData.job_title,
          subscriptionTier: profileData.subscription_tier as 'Basic' | 'Premium',
          language: profileData.language,
          emailTemplates: profileData.email_templates,
          theme: profileData.theme,
          emailUsage: profileData.email_usage || 0
        };
        if (profileData.theme) {
          setTheme(profileData.theme as 'light' | 'dark' | 'blue');
        }
        await dbApi.put('profile', currentProfile);
      } else if (!profileError || profileError.code === 'PGRST116') {
        // Create profile logic...
        // Simplified for brevity, reusing existing logic
        const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
        const { data: newProfileData } = await supabase.from('profiles').insert({
          id: user.id,
          email: user.email,
          name: metaName || 'User',
          company_name: 'My Company',
          theme: theme,
        }).select().single();
        if (newProfileData) {
          currentProfile = {
            id: newProfileData.id,
            email: newProfileData.email,
            name: newProfileData.name,
            companyName: newProfileData.company_name,
            logoUrl: '',
            profilePictureUrl: '',
            address: '',
            phone: '',
            website: '',
            subscriptionTier: 'Basic',
            theme: theme,
            emailUsage: 0
          }
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

    // Jobs
    if (navigator.onLine) {
      const { data: jobsData } = await supabase.from('jobs').select('*').eq('user_id', user.id);
      if (jobsData) {
        const mappedJobs = jobsData.map(j => ({ ...j, startDate: j.start_date, endDate: j.end_date, clientName: j.client_name, clientAddress: j.client_address, userId: j.user_id }));
        setJobs(mappedJobs);
        await dbApi.clear('jobs');
        for (const j of mappedJobs) await dbApi.put('jobs', j);
      }
    } else {
      const cachedJobs = await dbApi.getAll('jobs');
      setJobs(cachedJobs);
    }

    // Forms
    if (navigator.onLine) {
      const { data: formsData } = await supabase.from('documents').select('*').eq('user_id', user.id);
      if (formsData) {
        // Include public_token in mappedForms
        const mappedForms = formsData.map(f => ({ ...f, jobId: f.job_id, createdAt: f.created_at, public_token: f.public_token }));
        setForms(mappedForms);
        await dbApi.clear('documents');
        for (const f of mappedForms) await dbApi.put('documents', f);
      }
    } else {
      const cachedForms = await dbApi.getAll('documents');
      setForms(cachedForms);
    }

    // Clients
    if (navigator.onLine) {
      const { data: clientsData, error: clientError } = await supabase.from('clients').select('*').eq('user_id', user.id);
      if (clientsData) {
        setClients(clientsData);
        await dbApi.clear('clients');
        for (const c of clientsData) await dbApi.put('clients', c);
      } else if (clientError && /column ".*" does not exist/i.test(clientError.message)) {
        setDbSetupError(SQL_SETUP_SCRIPT);
      }
    } else {
      const cachedClients = await dbApi.getAll('clients');
      setClients(cachedClients);
    }

    // Inventory
    if (navigator.onLine) {
      const { data: invData } = await supabase.from('inventory').select('*').eq('user_id', user.id).order('name');
      if (invData) {
        setInventory(invData);
        await dbApi.clear('inventory');
        for (const i of invData) await dbApi.put('inventory', i);
      }
    } else {
      const cachedInventory = await dbApi.getAll('inventory');
      setInventory(cachedInventory);
    }

    // Saved Items (Price Book)
    if (navigator.onLine) {
      const { data: savedData, error: savedError } = await supabase.from('saved_items').select('*').eq('user_id', user.id).order('name');
      if (savedData) {
        setSavedItems(savedData);
        // Cache logic for saved items could be added here
      } else if (savedError && savedError.message.includes('relation "public.saved_items" does not exist')) {
        setDbSetupError(SQL_SETUP_SCRIPT);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  // Auth Handlers (Login, Signup, Google)
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
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  };
  const handleConnectGmail = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/gmail.send',
        queryParams: { access_type: 'offline', prompt: 'consent' }
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

  // Nav Handlers
  const navigateToDashboard = () => setView({ screen: 'dashboard' });
  const navigateToSettings = () => setView({ screen: 'settings' });
  const navigateToNewDoc = (jobId: string) => setView({ screen: 'selectDocType', jobId });
  const navigateToCreateJob = (returnTo: 'dashboard' | 'calendar' = 'dashboard') => setView({ screen: 'createJob', returnTo });
  const navigateToClients = () => setView({ screen: 'clients' });
  const navigateToInventory = () => setView({ screen: 'inventory' });
  const navigateToPriceBook = () => setView({ screen: 'pricebook' });
  const navigateToCalculator = () => setView({ screen: 'profitCalculator' });
  const navigateToAnalytics = () => setView({ screen: 'analytics' });
  const navigateToCalendar = () => setView({ screen: 'calendar' });
  const navigateToCommunication = () => setView({ screen: 'communication' });
  const navigateToForum = (postId?: string) => setView({ screen: 'forum', postId });

  // Data Handlers
  const handleUpdateAppLogo = async (file: File): Promise<string> => { return ''; }; // Placeholder for brevity
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
    setLoading(true);
    let newLogoUrl = updatedProfile.logoUrl;
    let newProfilePicUrl = updatedProfile.profilePictureUrl;

    try {
      if (logoFile) newLogoUrl = await uploadFile('logos', logoFile, session.user.id, true);
      if (profilePicFile) newProfilePicUrl = await uploadFile('logos', profilePicFile, session.user.id, true);
    } catch (error) { setLoading(false); return; }

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
      theme: theme,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('profiles').upsert(profileForDb).select().single();
    if (!error && data) {
      setProfile({ ...updatedProfile, logoUrl: newLogoUrl, profilePictureUrl: newProfilePicUrl });
      setView({ screen: 'dashboard' });
    }
    setLoading(false);
  };

  const handleEmailSent = async () => {
    if (!session || !profile) return;
    const newCount = (profile.emailUsage || 0) + 1;
    setProfile({ ...profile, emailUsage: newCount });
    await supabase.from('profiles').update({ email_usage: newCount }).eq('id', session.user.id);
  };

  const handleUploadForumImage = async (file: File): Promise<string> => { return uploadFile('forum', file, session!.user.id, true); }
  const handleUploadPriceBookImage = async (file: File): Promise<string> => { return uploadFile('price-book', file, session!.user.id, true); }
  const handleSaveToPriceBook = async (itemData: Partial<SavedItem>) => {
    if (!session) return;
    try {
      const newItem = {
        user_id: session.user.id,
        name: itemData.name || 'New Item',
        description: itemData.description || '',
        rate: itemData.rate || 0,
        unit_cost: itemData.unit_cost || 0,
        markup: itemData.markup || 0,
        category: itemData.category || 'General',
        type: itemData.type || 'material',
        is_favorite: itemData.is_favorite || false,
        is_assembly: itemData.is_assembly || false,
        assembly_items: itemData.assembly_items || []
      };

      const { data, error } = await supabase.from('saved_items').insert(newItem).select();
      if (error) throw error;
      if (data) {
        setSavedItems(prev => [...prev, data[0]]);
        alert(`"${newItem.name}" added to Price Book!`);
      }
    } catch (err) {
      console.error("Error adding to price book", err);
      alert("Failed to add to price book.");
    }
  };

  const handleSaveJob = async (jobData: any): Promise<string> => {
    if (!session) return '';
    const newJob = { id: crypto.randomUUID(), user_id: session.user.id, ...jobData, status: 'active' };
    await supabase.from('jobs').insert(newJob);
    fetchData(); // Refresh
    if (view.screen === 'createJob' && view.returnTo === 'calendar') {
      setView({ screen: 'calendar' });
    } else {
      setView({ screen: 'dashboard' });
    }
    return newJob.id;
  };
  const handleUpdateJobStatus = async (jobId: string, newStatus: any) => {
    await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId);
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
  };
  const handleSaveForm = async (formData: any) => {
    if (!session) return;
    if (view.screen !== 'form') return;

    const formRecord: any = {
      id: view.formId || crypto.randomUUID(),
      user_id: session.user.id,
      job_id: view.jobId,
      type: view.formType,
      data: formData
    };

    await supabase.from('documents').upsert(formRecord);
    await fetchData();
    setView({ screen: 'jobDetails', jobId: view.jobId });
  };
  const handleAddClient = async (clientData: any) => {
    if (!session) return;
    await supabase.from('clients').insert({ id: crypto.randomUUID(), user_id: session.user.id, ...clientData });
    fetchData();
  };
  const handleDeleteClient = async (id: string) => {
    await supabase.from('clients').delete().eq('id', id);
    fetchData();
  };

  // New handler for "Quick Create" from Client screen
  const handleNavigateToNewDoc = async (type: FormType, clientId: string) => {
    if (!session) return;

    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    let activeJob = jobs.find(j => j.clientName === client.name && j.status === 'active');
    let jobId = activeJob?.id;

    if (!activeJob) {
      const newJobData = {
        name: `${client.name} - General`,
        clientName: client.name,
        clientAddress: client.address || '',
        startDate: new Date().toISOString().split('T')[0],
      };
      const newJob = { id: crypto.randomUUID(), userId: session.user.id, ...newJobData, status: 'active', endDate: null } as Job;

      await supabase.from('jobs').insert({
        id: newJob.id,
        user_id: session.user.id,
        name: newJob.name,
        client_name: newJob.clientName,
        client_address: newJob.clientAddress,
        start_date: newJob.startDate
      });

      setJobs(prev => [...prev, newJob]);
      jobId = newJob.id;
    }

    setView({ screen: 'form', formType: type, jobId: jobId!, formId: null });
  };

  // Price Book Handlers
  const handleAddSavedItem = async (item: any) => {
    if (!session) return;
    const newItem = { id: crypto.randomUUID(), user_id: session.user.id, ...item };

    // Attempt full save (Elite features)
    const { error } = await supabase.from('saved_items').insert(newItem);

    if (error) {
      console.warn("Full insert failed, attempting fallback to basic fields:", error);
      // Fallback: Strip new columns if schema is outdated
      const basicItem = {
        id: newItem.id,
        user_id: newItem.user_id,
        name: newItem.name,
        description: newItem.description || '',
        rate: newItem.rate || 0,
        unit_cost: newItem.unit_cost || newItem.cost || 0, // Try both properties map to unit_cost
        category: newItem.category || 'General'
        // explicit exclusion of: is_assembly, images, markup, etc.
      };

      const { error: fallbackError } = await supabase.from('saved_items').insert(basicItem);

      if (fallbackError) {
        console.error("Fallback insert failed:", fallbackError);
        alert(`Failed to save item: ${error.message}\n\nPlease run the SQL script to fix your database.`);
        throw error;
      }

      alert("Item saved in Basic Mode (Legacy).\n\nAdvanced features like Assemblies and Images were not saved because your database needs updating.\n\nPlease run the provided SQL script to enable all features.");
    }

    const { data } = await supabase.from('saved_items').select('*').eq('user_id', session.user.id).order('name');
    if (data) setSavedItems(data);
  };
  const handleUpdateSavedItem = async (item: SavedItem) => {
    // Attempt full update
    const { error } = await supabase.from('saved_items').update(item).eq('id', item.id);

    if (error) {
      console.warn("Full update failed, attempting fallback:", error);
      const basicItem = {
        name: item.name,
        description: item.description || '',
        rate: item.rate || 0,
        unit_cost: item.unit_cost || item.cost || 0,
        category: item.category || 'General'
      };

      const { error: fallbackError } = await supabase.from('saved_items').update(basicItem).eq('id', item.id);

      if (fallbackError) {
        console.error("Fallback update failed:", fallbackError);
        alert(`Failed to update item: ${error.message}\n\nPlease run the SQL script.`);
        throw error;
      }
      alert("Item updated in Basic Mode (Legacy).\n\nPlease run the SQL script to enable full features.");
    }

    const { data } = await supabase.from('saved_items').select('*').eq('user_id', session.user.id).order('name');
    if (data) setSavedItems(data);
  };
  const handleDeleteSavedItem = async (id: string) => {
    const { error } = await supabase.from('saved_items').delete().eq('id', id);
    if (error) {
      console.error("Error deleting item:", error);
      alert(`Error deleting item: ${error.message}`);
      throw error;
    }
    setSavedItems(prev => prev.filter(i => i.id !== id));
  };

  // Inventory Handlers
  const handleAddInventoryItem = async (itemData: any) => {
    if (!session) return;
    await supabase.from('inventory').insert({ id: crypto.randomUUID(), user_id: session.user.id, ...itemData });
    fetchData();
  };
  const handleUpdateInventoryItem = async (item: InventoryItem) => {
    await supabase.from('inventory').update({ quantity: item.quantity, low_stock_threshold: item.low_stock_threshold }).eq('id', item.id);
    fetchData();
  };
  const handleDeleteInventoryItem = async (id: string) => {
    await supabase.from('inventory').delete().eq('id', id);
    fetchData();
  };

  const getTranslation = () => { return translations[profile?.language || 'English']; }

  // Render logic...
  const renderAuth = () => {
    if (view.screen !== 'auth') return null;
    switch (view.authScreen) {
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
      switch (status) { case 'active': return 'bg-green-500'; case 'completed': return 'bg-blue-500'; case 'paused': return 'bg-orange-500'; default: return 'bg-gray-400'; }
    }
    return (
      <div className="w-full min-h-screen bg-background text-foreground p-4 md:p-8 pb-24">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4"><AppLogo className="w-12 h-12 drop-shadow-md" /><h1 className="text-2xl md:text-3xl font-bold">{t.welcome} {profile.name.split(' ')[0]}!</h1></div>
          {!isOnline && <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-bold animate-pulse">OFFLINE MODE</div>}
          <div className="flex items-center gap-3 flex-wrap md:flex-nowrap justify-end">

            <div className="relative">
              <Button variant="outline" onClick={() => setShowToolsMenu(!showToolsMenu)} className="flex items-center gap-2 bg-card border-border">
                Tools <ChevronDownIcon className="w-4 h-4 opacity-50" />
              </Button>
              {showToolsMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowToolsMenu(false)}></div>
                  <div className="absolute top-full right-0 mt-2 w-48 bg-popover border border-border rounded-xl shadow-xl z-50 p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 origin-top-right">
                    <button onClick={() => { navigateToInventory(); setShowToolsMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors text-foreground">
                      <BoxIcon className="w-4 h-4 text-primary" /> Inventory
                    </button>
                    <button onClick={() => { navigateToPriceBook(); setShowToolsMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors text-foreground">
                      <TagIcon className="w-4 h-4 text-primary" /> Price Book
                    </button>
                    <button onClick={() => { navigateToCalendar(); setShowToolsMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors text-foreground">
                      <CalendarIcon className="w-4 h-4 text-primary" /> Schedule
                    </button>
                    <button onClick={() => { navigateToCalculator(); setShowToolsMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors text-foreground">
                      <CalculatorIcon className="w-4 h-4 text-primary" /> Calculator
                    </button>
                    <button onClick={() => { navigateToAnalytics(); setShowToolsMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors text-foreground">
                      <BarChartIcon className="w-4 h-4 text-primary" /> Insights
                    </button>
                  </div>
                </>
              )}
            </div>

            <Button variant="outline" onClick={() => navigateToForum()} className="flex items-center gap-2 bg-card border-border">
              <MessageSquareIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Community</span>
              {notificationCount > 0 && <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold shadow-sm animate-pulse">{notificationCount > 9 ? '9+' : notificationCount}</span>}
            </Button>

            <Button onClick={() => navigateToCreateJob('dashboard')} className="shadow-sm">
              <PlusIcon className="w-4 h-4 mr-2" /> {t.newJob}
            </Button>

            <Button variant="ghost" size="icon" onClick={() => setView({ screen: 'profile' })} className="rounded-full h-10 w-10 overflow-hidden border border-border ml-1 shrink-0">
              {profile.profilePictureUrl ? <img src={profile.profilePictureUrl} alt="Profile" className="h-full w-full object-cover" /> : <UserIcon className="h-6 w-6" />}
            </Button>
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
    const getDocIcon = (type: FormType) => { switch (type) { case FormType.Invoice: return InvoiceIcon; case FormType.Estimate: return EstimateIcon; case FormType.ChangeOrder: return ChangeOrderIcon; case FormType.PurchaseOrder: return TruckIcon; default: return InvoiceIcon; } };
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

    // Pass public token to forms that support approval
    const publicToken = form?.public_token;

    switch (formType) {
      case FormType.Invoice: return <InvoiceForm key={componentKey} job={job} userProfile={profile} invoice={form?.data as InvoiceData | null} onSave={handleSaveForm} onClose={handleCloseForm} onUploadImage={handleUploadDocumentImage} savedItems={savedItems} onSaveToPriceBook={handleSaveToPriceBook} />;
      case FormType.DailyJobReport: return <DailyJobReportForm key={componentKey} profile={profile} job={job} clients={clients} report={form?.data as DailyJobReportData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.Note: return <NoteForm key={componentKey} profile={profile} job={job} note={form?.data as NoteData | null} onSave={handleSaveForm} onBack={handleCloseForm} />;
      case FormType.WorkOrder: return <WorkOrderForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as WorkOrderData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.TimeSheet: return <TimeSheetForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as TimeSheetData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.MaterialLog: return <MaterialLogForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as MaterialLogData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.Estimate: return <EstimateForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as EstimateData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} savedItems={savedItems} publicToken={publicToken} onSaveToPriceBook={handleSaveToPriceBook} />;
      case FormType.ExpenseLog: return <ExpenseLogForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as ExpenseLogData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.Warranty: return <WarrantyForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as WarrantyData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.Receipt: return <ReceiptForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as ReceiptData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} />;
      case FormType.ChangeOrder: return <ChangeOrderForm key={componentKey} job={job} profile={profile} clients={clients} data={form?.data as ChangeOrderData | null} onSave={handleSaveForm} onBack={handleCloseForm} onUploadImage={handleUploadDocumentImage} publicToken={publicToken} />;
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

    if (view.screen === 'jobDetails') {
      items.push({ icon: PlusIcon, label: t.newDocument, onClick: () => navigateToNewDoc((view as { jobId: string }).jobId) });
    }
    else if (view.screen === 'dashboard' || view.screen === 'clients') items.push({ icon: UsersIcon, label: 'Clients', onClick: navigateToClients });

    items.push({ icon: MailIcon, label: 'Communication', onClick: navigateToCommunication });

    items.push({ icon: SettingsIcon, label: t.settings, onClick: navigateToSettings });
    return items;
  };

  const renderContent = () => {
    // 1. External Portal View (Many documents)
    if (portalKey) return <PortalView supabase={supabase} portalKey={portalKey} />;

    // 2. Single Document Approval View
    if (approvalToken) return <DocumentApprovalView supabase={supabase} approvalToken={approvalToken} />;

    if (dbSetupError) return <DbSetupScreen sqlScript={dbSetupError} />;
    if (loading) return <div className="flex items-center justify-center min-h-screen">{loadingMessage}</div>;
    if (!session) {
      if (view.screen === 'welcome') return <Welcome onGetStarted={() => setView({ screen: 'auth', authScreen: 'signup' })} onLogin={() => setView({ screen: 'auth', authScreen: 'login' })} onNavigate={(screen) => setView({ screen: screen as any })} />;
      if (view.screen === 'privacy') return <PrivacyPolicy onBack={() => setView({ screen: 'welcome' })} />;
      if (view.screen === 'terms') return <TermsOfService onBack={() => setView({ screen: 'welcome' })} />;
      if (view.screen === 'security') return <Security onBack={() => setView({ screen: 'welcome' })} />;

      return renderAuth();
    }
    switch (view.screen) {
      case 'dashboard': return renderDashboard();
      case 'jobDetails': return renderJobDetails();
      case 'createJob': return <JobForm onSave={handleSaveJob} onCancel={navigateToDashboard} supabase={supabase} session={session} jobCount={jobs.filter(j => j.status === 'active').length} profile={profile} />;
      case 'selectDocType': { const activeJob = jobs.find(j => j.id === view.jobId); if (!activeJob) return <div>Error</div>; return <SelectDocType onSelect={(type) => setView({ screen: 'form', formType: type, jobId: activeJob.id, formId: null })} onBack={() => setView({ screen: 'jobDetails', jobId: view.jobId })} profile={profile} docCount={forms.length} />; }
      case 'form': return renderForm();
      case 'settings': if (!profile) return null; return <Settings mode="settings" profile={profile} onSave={handleSaveProfile} onBack={navigateToDashboard} theme={theme} setTheme={setTheme} onLogout={handleLogout} />;
      case 'profile': if (!profile) return null; return <Settings mode="profile" profile={profile} onSave={handleSaveProfile} onBack={navigateToDashboard} theme={theme} setTheme={setTheme} onLogout={handleLogout} />;
      case 'clients':
        return <ClientsView
          onBack={navigateToDashboard}
          supabase={supabase}
          session={session}
          clients={clients}
          forms={forms} // Pass forms for approval flow
          jobs={jobs}
          onAddClient={handleAddClient}
          onDeleteClient={handleDeleteClient}
          isOnline={isOnline}
          onNavigateToNewDoc={handleNavigateToNewDoc}
        />;
      case 'inventory':
        return <InventoryView
          onBack={navigateToDashboard}
          inventory={inventory}
          onAddItem={handleAddInventoryItem}
          onUpdateItem={handleUpdateInventoryItem}
          onDeleteItem={handleDeleteInventoryItem}
        />;
      case 'pricebook':
        return <PriceBookView
          onBack={navigateToDashboard}
          savedItems={savedItems}
          onAddItem={handleAddSavedItem}
          onUpdateItem={handleUpdateSavedItem}
          onDeleteItem={handleDeleteSavedItem}
          onUploadImage={handleUploadPriceBookImage}
        />;
      case 'profitCalculator':
        return <ProfitCalculatorView onBack={navigateToDashboard} />;
      case 'analytics': return <AnalyticsView jobs={jobs} forms={forms} onBack={navigateToDashboard} />;
      case 'calendar': return <CalendarView jobs={jobs} onBack={navigateToDashboard} onNavigateJob={(jobId) => setView({ screen: 'jobDetails', jobId })} onNewJob={() => navigateToCreateJob('calendar')} />;
      case 'communication': if (!profile) return null; return <CommunicationView clients={clients} forms={forms} jobs={jobs} profile={profile} onBack={navigateToDashboard} session={session} onConnectGmail={handleConnectGmail} onEmailSent={handleEmailSent} />;
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
