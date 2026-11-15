-- Applied 2026-11-15 with the owner's OK ("Yes, approve all", roadmap D9) in the Supabase SQL editor (project iauteblvljppwzsxloyd); verified: security definer, search_path '', stable, anon can execute, a bad key raises 28000 'Invalid portal link'.
-- =====================================================================================
-- ContractorDocs: client portal project dashboard (competitor roadmap batch D9, #39)
--
-- One read-only function for the client portal (/?portal=<key>): a per-job "project dashboard" for the client.
-- Status, dates, progress, milestones and the next one, the job's documents (balance is computed in the browser
-- from them, see below), the newest photos the contractor shared, a punch list summary and an empty `selections`
-- placeholder (roadmap D5 fills it later).
--
-- ADDITIVE ONLY: one new function. No table, column, row, existing function or policy is changed. Safe to run
-- twice (create or replace). Needs (all applied in production): 20261112000200 (_client_safe_doc_data,
-- _contractor_public_info), 20261113000400 (job_photos), 20261113000600 (_client_document_ids, _client_doc_state,
-- _client_visible_type), 20261115000200 (punch_lists / punch_items), 20261116000100 (job_tasks).
--
-- Who sees what (same rules as the sibling portal reads get_portal_data / get_portal_photos / get_portal_punch_list):
--   * the viewer is identified by the client's portal key only; a bad key raises 'Invalid portal link' (28000)
--   * a job is the client's when it belongs to the client's contractor and jobs.client_id = the client, or (no
--     client_id) the job's client name matches the client's (trimmed, case-insensitive, never an empty name)
--   * a p_job_id that is not one of the client's jobs raises the SAME 'Invalid portal link' (never data, never a
--     different message, so job ids of other clients / contractors can't be probed)
--   * documents: the exact get_portal_data rule (_client_document_ids, client-visible types, no Drafts), limited to
--     this job; data goes through _client_safe_doc_data like the portal list
--   * photos: shared_in_portal with a portal_path (public portal-photos copy), like get_portal_photos
--   * tasks: MILESTONES ONLY (id, title, due_date, status, completed_at) + done/total counts of all tasks. Never
--     notes, comments, assignees, dependencies, task photos, sources or work order links
--   * punch list: counts only, and only when the contractor shares the list in the portal (punch_lists.shared_in_portal)
--   * contractor: _contractor_public_info (what the portal already shows); jobs.worker_name is never returned
--
-- Money: invoice totals are NOT computed here. The browser computes them exactly like the portal list does today
-- (utils/clientPortalRules.ts documentTotals: line items, progress billing, discount, tax, shipping, flat amounts,
-- cent rounding), so the dashboard balance always equals the portal's "Outstanding" figure.
--
-- Rate limiting: none, like the sibling portal reads (they only check the key format, then look it up).
--
-- Returns jsonb (version 1):
--   { version, jobs[<=50] {id,name,status,start_date,end_date},
--     job {id,name,address,status,start_date,end_date} | null (when p_job_id is null),
--     contractor {name,company_name,logo_url,phone,email,website,address},
--     progress {done,total,percent} | null (no tasks), milestones[<=100] {id,title,due_date,status,completed_at},
--     next_milestone {id,title,due_date,status,completed_at} | null,
--     documents[<=200] {id,type,created_at,state,data}, photos[<=12] {id,tag,caption,taken_at,path},
--     punch {total,open,done,verified} | null, selections [] }
-- Keep in sync with lib/portal/dashboardTypes.ts and scripts/portal-dashboard-check.ts (lints this file).
--
-- Rollback: drop function public.get_portal_project_dashboard(text, uuid);
-- =====================================================================================

create or replace function public.get_portal_project_dashboard(p_key text, p_job_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_job    public.jobs%rowtype;
  v_jobs   jsonb;
  v_total  integer;
  v_done   integer;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;
  select * into v_client from public.clients where portal_key = p_key;
  if not found then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;

  -- the client's jobs (job picker)
  v_jobs := coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'name', x.name, 'status', x.status, 'start_date', x.start_date, 'end_date', x.end_date)
           order by x.start_date desc nulls last, x.created_at desc)
    from (
      select j.id, j.name, j.status, j.start_date, j.end_date, j.created_at
      from public.jobs j
      where j.user_id = v_client.user_id
        and (j.client_id = v_client.id
             or (j.client_id is null
                 and btrim(coalesce(v_client.name, '')) <> ''
                 and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))))
      order by j.start_date desc nulls last, j.created_at desc
      limit 50
    ) x), '[]'::jsonb);

  if p_job_id is null then
    return jsonb_build_object(
      'version', 1,
      'jobs', v_jobs,
      'job', null,
      'contractor', public._contractor_public_info(v_client.user_id),
      'progress', null,
      'milestones', '[]'::jsonb,
      'next_milestone', null,
      'documents', '[]'::jsonb,
      'photos', '[]'::jsonb,
      'punch', null,
      'selections', '[]'::jsonb);
  end if;

  -- the job must be this client's (same rule as above); anything else looks like a bad link
  select j.* into v_job
  from public.jobs j
  where j.id = p_job_id
    and j.user_id = v_client.user_id
    and (j.client_id = v_client.id
         or (j.client_id is null
             and btrim(coalesce(v_client.name, '')) <> ''
             and lower(btrim(coalesce(j.client_name, ''))) = lower(btrim(v_client.name))));
  if not found then
    raise exception 'Invalid portal link' using errcode = '28000';
  end if;

  select count(*), count(*) filter (where t.status = 'done')
    into v_total, v_done
  from public.job_tasks t
  where t.job_id = v_job.id and t.user_id = v_job.user_id;

  return jsonb_build_object(
    'version', 1,
    'jobs', v_jobs,
    'job', jsonb_build_object(
      'id', v_job.id, 'name', v_job.name, 'address', v_job.client_address, 'status', v_job.status,
      'start_date', v_job.start_date, 'end_date', v_job.end_date),
    'contractor', public._contractor_public_info(v_client.user_id),
    'progress', case when v_total > 0 then jsonb_build_object(
      'done', v_done, 'total', v_total, 'percent', round(100.0 * v_done / v_total)::integer) end,
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'title', m.title, 'due_date', m.due_date, 'status', m.status, 'completed_at', m.completed_at)
             order by m.due_date nulls last, m.sort_order, m.created_at)
      from (
        select t.id, t.title, t.due_date, t.status, t.completed_at, t.sort_order, t.created_at
        from public.job_tasks t
        where t.job_id = v_job.id and t.user_id = v_job.user_id and t.is_milestone
        order by t.due_date nulls last, t.sort_order, t.created_at
        limit 100
      ) m), '[]'::jsonb),
    'next_milestone', (
      select jsonb_build_object(
               'id', t.id, 'title', t.title, 'due_date', t.due_date, 'status', t.status, 'completed_at', t.completed_at)
      from public.job_tasks t
      where t.job_id = v_job.id and t.user_id = v_job.user_id and t.is_milestone and t.status <> 'done'
      order by t.due_date nulls last, t.sort_order, t.created_at
      limit 1),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'type', x.type, 'created_at', x.created_at, 'state', x.state,
               'data', public._client_safe_doc_data(x.data))
             order by x.created_at desc)
      from (
        select d.id, d.type, d.created_at, d.data, public._client_doc_state(d) as state
        from public.documents d
        where d.id in (select public._client_document_ids(v_client.id))
          and d.job_id = v_job.id
          and public._client_visible_type(d.type)
          and coalesce(d.data->>'status', '') <> 'Draft'
        order by d.created_at desc
        limit 200
      ) x), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'tag', p.tag, 'caption', p.caption, 'taken_at', p.taken_at, 'path', p.path)
             order by p.taken_at desc)
      from (
        select ph.id, ph.tag, ph.caption, ph.taken_at, ph.portal_path as path
        from public.job_photos ph
        where ph.job_id = v_job.id
          and ph.user_id = v_job.user_id
          and ph.shared_in_portal
          and ph.portal_path is not null
        order by ph.taken_at desc
        limit 12
      ) p), '[]'::jsonb),
    'punch', (
      select jsonb_build_object(
               'total', count(i.id),
               'open', count(i.id) filter (where i.status = 'open'),
               'done', count(i.id) filter (where i.status = 'done'),
               'verified', count(i.id) filter (where i.status = 'verified'))
      from public.punch_lists l
      left join public.punch_items i on i.job_id = l.job_id and i.user_id = l.user_id
      where l.job_id = v_job.id and l.user_id = v_job.user_id and l.shared_in_portal
      group by l.job_id),
    'selections', '[]'::jsonb);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Privileges (default-deny, explicit grants; same as the sibling portal reads)
-- -------------------------------------------------------------------------------------
revoke all on function public.get_portal_project_dashboard(text, uuid) from public, anon, authenticated;
grant execute on function public.get_portal_project_dashboard(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
