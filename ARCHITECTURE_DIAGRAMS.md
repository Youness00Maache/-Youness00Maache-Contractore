# Architecture & Data Flow Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend App                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐        ┌──────────────────┐                │
│  │   Components     │        │     Hooks        │                │
│  ├──────────────────┤        ├──────────────────┤                │
│  │ InvoiceForm.tsx  │        │ useLocalStorage  │                │
│  │ Settings.tsx     │        │ useState         │                │
│  │ Dashboard.tsx    │        │ useEffect        │                │
│  └────────┬─────────┘        └────────┬─────────┘                │
│           │                           │                          │
│           └───────────────┬───────────┘                          │
│                           │                                      │
│        ┌──────────────────▼────────────────────┐                │
│        │       App.tsx (Main Logic)            │                │
│        ├──────────────────────────────────────┤                │
│        │ handleSaveForm()                     │                │
│        │ handleLogin() / handleLogout()       │                │
│        │ loadData() useEffect                 │                │
│        └──────────────────┬────────────────────┘                │
│                           │                                      │
│        ┌──────────────────▼────────────────────┐                │
│        │   lib/supabaseHelpers.ts             │                │
│        ├──────────────────────────────────────┤                │
│        │ saveDocument()                       │                │
│        │ loadDocumentsByJob()                 │                │
│        │ saveCompanySettings()                │                │
│        │ loadCompanySettings()                │                │
│        │ + error handling                     │                │
│        └──────────────────┬────────────────────┘                │
│                           │                                      │
│        ┌──────────────────▼────────────────────┐                │
│        │    Supabase Client JS SDK            │                │
│        ├──────────────────────────────────────┤                │
│        │ auth.getUser()                       │                │
│        │ from().insert()                      │                │
│        │ from().select()                      │                │
│        │ from().update()                      │                │
│        │ from().upsert()                      │                │
│        └──────────────────┬────────────────────┘                │
│                           │                                      │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS
                            │
        ┌───────────────────▼────────────────────┐
        │   Supabase Cloud                       │
        ├───────────────────────────────────────┤
        │                                        │
        │  ┌──────────────────────────────────┐ │
        │  │  Authentication (auth.users)     │ │
        │  └──────────────────────────────────┘ │
        │                                        │
        │  ┌──────────────────────────────────┐ │
        │  │  documents table                 │ │
        │  │  ├─ id (PK)                      │ │
        │  │  ├─ user_id (FK) ← Your user ID  │ │
        │  │  ├─ type                         │ │
        │  │  ├─ job_id                       │ │
        │  │  ├─ data (JSONB)                 │ │
        │  │  └─ timestamps                   │ │
        │  └──────────────────────────────────┘ │
        │                                        │
        │  ┌──────────────────────────────────┐ │
        │  │  company_settings table          │ │
        │  │  ├─ user_id (PK) ← Your user ID  │ │
        │  │  ├─ company_name                 │ │
        │  │  ├─ contact_name                 │ │
        │  │  ├─ email / phone / address      │ │
        │  │  └─ website / logo_url           │ │
        │  └──────────────────────────────────┘ │
        │                                        │
        │  ┌──────────────────────────────────┐ │
        │  │  RLS Policies (Row Security)     │ │
        │  │  WHERE user_id = auth.uid()      │ │
        │  └──────────────────────────────────┘ │
        │                                        │
        └────────────────────────────────────────┘
```

---

## Document Save Flow

```
┌──────────────────────┐
│  User fills invoice  │
│  and clicks "Save"   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────┐
│  InvoiceForm.onSave triggered    │
│  with invoice data               │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  App.handleSaveForm() called      │
│  with formData                    │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  ✅ Call saveDocument()          │
│     from supabaseHelpers.ts      │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Get current user_id             │
│  const { user } =                │
│    supabase.auth.getUser()       │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Build payload with user_id:     │
│  {                               │
│    user_id: user.id,  ← KEY!    │
│    type: 'Invoice',              │
│    job_id: jobId,                │
│    data: formData                │
│  }                               │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Send to Supabase:               │
│  INSERT into documents           │
│  with payload                    │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Supabase Auth Check:            │
│  Verify user_id matches          │
│  auth.uid() (RLS Policy)         │
└──────────┬───────────────────────┘
           │
           ▼ ✅ Passes
┌──────────────────────────────────┐
│  Document saved in database!     │
│  Row created with user_id        │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Update local state:             │
│  setForms([...newForm])          │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Navigate to dashboard           │
│  Show success                    │
└──────────────────────────────────┘
```

---

## Document Load Flow

```
┌──────────────────────────┐
│  User logs in (session   │
│  established)            │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  useEffect runs (dependency:     │
│  supabase, session, jobs)        │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Call loadData() async function  │
└──────────┬───────────────────────┘
           │
           ├─────────────────────────────┐
           │                             │
           ▼                             ▼
┌──────────────────────────────────┐  ┌────────────────────────────┐
│ loadCompanySettings()            │  │ loadDocumentsByJob()       │
│ from supabaseHelpers.ts          │  │ from supabaseHelpers.ts    │
│                                  │  │                            │
│ 1. Get user_id                   │  │ 1. Get user_id             │
│    auth.getUser()                │  │    auth.getUser()          │
│                                  │  │                            │
│ 2. Query database:               │  │ 2. Query database:         │
│    SELECT * WHERE user_id = $1   │  │    SELECT * WHERE          │
│    .single()                     │  │    user_id = $1 AND        │
│                                  │  │    job_id = $2             │
│ 3. Return settings row (or null) │  │                            │
│                                  │  │ 3. Return documents array  │
└──────────┬───────────────────────┘  └────────────┬───────────────┘
           │                                        │
           └────────────────────┬───────────────────┘
                                │
                                ▼
                    ┌──────────────────────────┐
                    │ Update local state:      │
                    │ setProfile() with new   │
                    │ company settings        │
                    │                          │
                    │ setForms() with docs    │
                    └──────────┬───────────────┘
                               │
                               ▼
                    ┌──────────────────────────┐
                    │ Dashboard rerender       │
                    │ Shows loaded data        │
                    └──────────────────────────┘
```

---

## Company Settings Upsert Flow

```
┌──────────────────────────────────┐
│  User in Settings page           │
│  Updates company info            │
│  Clicks "Save Changes"           │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  handleSaveChanges() called      │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  setIsSaving(true)               │
│  Show "Saving..." button         │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Call saveCompanySettings()      │
│  from supabaseHelpers.ts         │
│  with profile object             │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Get current user_id             │
│  auth.getUser()                  │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Build settings payload:         │
│  {                               │
│    user_id: user.id,  ← KEY!    │
│    company_name: ...,            │
│    contact_name: ...,            │
│    email: ...,                   │
│    ...                           │
│  }                               │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Upsert to Supabase:             │
│  UPSERT company_settings         │
│  (onConflict: 'user_id')         │
│                                  │
│  If user_id exists → UPDATE      │
│  If user_id not exists → INSERT  │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Supabase processes:             │
│  - Check RLS policy              │
│  - Verify user_id matches        │
│  - Perform INSERT or UPDATE      │
└──────────┬───────────────────────┘
           │
           ▼ ✅
┌──────────────────────────────────┐
│  Settings row created/updated    │
│  in company_settings table       │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  setIsSaving(false)              │
│  Show "Settings saved!" message  │
│  Auto-clear after 3 seconds      │
└──────────────────────────────────┘
```

---

## User Isolation Guarantee

```
┌─────────────────────────────────────────┐
│  Example: Two Users Using Same App      │
└─────────────────────────────────────────┘

USER A                                   USER B
user_id: abc123                         user_id: def456
│                                        │
├─ Saves Invoice                        ├─ Saves Invoice
│  │                                    │  │
│  └─ INSERT documents {                └─ INSERT documents {
│     user_id: abc123,                      user_id: def456,
│     data: invoiceA                        data: invoiceB
│  }                                    }
│                                        │
├─ Loads documents                      ├─ Loads documents
│  │                                    │  │
│  └─ SELECT WHERE user_id = abc123    └─ SELECT WHERE user_id = def456
│     │                                    │
│     └─ Returns: [invoiceA]  ✅           └─ Returns: [invoiceB]  ✅
│        (only sees own)                      (only sees own)
│                                        │
├─ Updates company settings             ├─ Updates company settings
│  │                                    │  │
│  └─ UPSERT {                          └─ UPSERT {
│     user_id: abc123,                      user_id: def456,
│     company_name: "A Corp"                company_name: "B Corp"
│  }                                    }
│                                        │
├─ Loads settings                       ├─ Loads settings
│  │                                    │  │
│  └─ SELECT WHERE user_id = abc123    └─ SELECT WHERE user_id = def456
│     │                                    │
│     └─ Returns: A's settings  ✅        └─ Returns: B's settings  ✅
│        (only sees own)                     (only sees own)


SECURITY LAYERS:
Layer 1: Frontend code includes user_id ✅
Layer 2: RLS policy enforces user_id ✅
Layer 3: Database filters by user_id ✅

Even if Layer 1 fails → Layer 2 & 3 still prevent data leak!
```

---

## Error Handling Flow

```
┌─────────────────────────────┐
│  User attempts to save      │
│  (Internet disconnected)    │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  saveDocument() tries to:                │
│  supabase.from('documents').insert()    │
└──────────┬──────────────────────────────┘
           │
           ▼ Network error
┌─────────────────────────────────────────┐
│  catch(error) block triggered           │
│  Error logged to console                │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  alert('Error saving document.          │
│  Please try again.')                    │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  User sees error message                │
│  Local state still updated              │
│  (data not lost)                        │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  User reconnects internet               │
│  Tries to save again                    │
│  This time it works! ✅                 │
└─────────────────────────────────────────┘
```

---

## Settings.tsx Save State Flow

```
Initial State:
isSaving = false
saveMessage = null

User clicks "Save Changes":
     │
     ▼
setIsSaving(true)    ← Button shows "Saving..."
setSaveMessage(null) ← Clear any old messages

     │
     ▼
Try:
  saveCompanySettings()

     │
     ├─ Success path:
     │  setSaveMessage({ 
     │    type: 'success',
     │    message: 'Saved successfully!'
     │  })
     │  setTimeout(() => setSaveMessage(null), 3000)
     │     │
     │     └─ Message disappears after 3 seconds
     │
     └─ Error path:
        setSaveMessage({
          type: 'error',
          message: 'Error saving. Try again.'
        })
        
Finally (always runs):
  setIsSaving(false) ← Button goes back to "Save Changes"
```

---

## Data Consistency

```
┌──────────────────────────────────────────┐
│  Where User's Data Lives                 │
└──────────────────────────────────────────┘

Browser Memory (React State):
  profile = { companyName: "...", ... }
  forms = [ { id, type, data }, ... ]
  └─ ✅ Immediate UI updates
  └─ ❌ Lost on refresh

LocalStorage:
  userProfile = JSON string
  forms = JSON string
  └─ ✅ Survives browser refresh
  └─ ✅ Survives app restart
  └─ ❌ Lost if storage cleared
  └─ ❌ Device-specific

Supabase Cloud:
  documents table rows with user_id
  company_settings row with user_id
  └─ ✅ Permanent storage
  └─ ✅ Cross-device access
  └─ ✅ Never lost
  └─ ✅ Synced across devices


Flow:
User Input
  ↓
Update React State ✅ (instant)
  ↓
Save to LocalStorage ✅ (fast)
  ↓
Save to Supabase ✅ (async)
  ↓
If user refreshes:
  ↓
Load from Supabase ✅ (cloud sync)
```

---

## Summary

Every operation goes through this security pipeline:

```
User Action
    ↓
Get user_id from Supabase Auth
    ↓
Include user_id in database operation
    ↓
Send to Supabase
    ↓
RLS Policy checks: user_id == auth.uid()
    ↓ ✅ Passes
Database processes request
    ↓
Only this user's data is affected
    ↓
✅ Data isolation guaranteed!
```
