import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormType, UserProfile, InvoiceData, DailyJobReportData, NoteData, FormData } from '../types';

/**
 * Save a document (Invoice, Receipt, DailyJobReport, Note) to Supabase
 * Associated with the currently logged-in user
 */
export const saveDocument = async (
  supabase: SupabaseClient,
  docType: FormType,
  docData: InvoiceData | DailyJobReportData | NoteData | any,
  jobId: string,
  formId?: string
) => {
  try {
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Prepare the document data
    const documentPayload = {
      user_id: user.id,
      type: docType,
      job_id: jobId,
      data: docData,
    };

    let result;
    if (formId) {
      // Update existing document
      result = await supabase
        .from('documents')
        .update(documentPayload)
        .eq('id', formId)
        .eq('user_id', user.id)
        .select();
    } else {
      // Create new document
      result = await supabase
        .from('documents')
        .insert(documentPayload)
        .select();
    }

    if (result.error) {
      throw result.error;
    }

    return result.data;
  } catch (error) {
    console.error('Error saving document:', error);
    throw error;
  }
};

/**
 * Load all documents for the current user
 * Filters by user_id to ensure RLS works correctly
 */
export const loadDocuments = async (supabase: SupabaseClient) => {
  try {
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Load documents for this user
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error loading documents:', error);
    throw error;
  }
};

/**
 * Load documents for a specific job
 * Filters by user_id and job_id
 */
export const loadDocumentsByJob = async (supabase: SupabaseClient, jobId: string) => {
  try {
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Load documents for this user and job
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .eq('job_id', jobId);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error loading documents for job:', error);
    throw error;
  }
};

/**
 * Save or update company settings
 * Uses upsert to handle both create and update
 */
export const saveCompanySettings = async (
  supabase: SupabaseClient,
  settings: Partial<UserProfile>
) => {
  try {
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Prepare settings payload
    const settingsPayload = {
      user_id: user.id,
      company_name: settings.companyName || '',
      contact_name: settings.name || '',
      email: settings.email || '',
      phone: settings.phone || '',
      address: settings.address || '',
      website: settings.website || '',
      logo_url: settings.logoUrl || '',
    };

    // Upsert the company settings
    const { data, error } = await supabase
      .from('company_settings')
      .upsert(settingsPayload, { onConflict: 'user_id' })
      .select();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error saving company settings:', error);
    throw error;
  }
};

/**
 * Load company settings for the current user
 * Filters by user_id and expects a single row
 */
export const loadCompanySettings = async (supabase: SupabaseClient): Promise<any> => {
  try {
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Load settings for this user
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error;
    }

    return data || null;
  } catch (error) {
    console.error('Error loading company settings:', error);
    throw error;
  }
};

/**
 * Delete a document
 */
export const deleteDocument = async (supabase: SupabaseClient, documentId: string) => {
  try {
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Delete only if it belongs to this user
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
};
