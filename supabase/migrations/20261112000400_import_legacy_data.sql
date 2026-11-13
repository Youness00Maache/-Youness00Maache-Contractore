-- =====================================================================================
-- ContractorDocs part 5: import data from an OLD ContractorDocs schema (legacy_backup).
--
-- Runs only when 20261111000000_move_legacy_schema.sql moved an old schema aside; on a fresh
-- project it does nothing. Copies, per table, every column that exists in both schemas with safe
-- casts (old schemas disagree on types, e.g. saved_items.images text[] vs jsonb). Rows that would
-- break the new rules are skipped (orphans, other users' jobs). legacy_backup itself is untouched.
--
-- Deliberate choices
--   * Billing is NOT imported (PayPal is gone): everyone starts on Free. Legacy paying users are
--     listed by the query in docs/work/BACKEND_NOTES.md so they can be granted a plan manually.
--   * Gmail tokens are NOT imported (they were plaintext). Accounts are imported as
--     status = 'needs_reconnect'; users reconnect once. user_credentials is not imported.
--   * Corrupted list stubs saved by the old "mark as viewed" bug lose their `__lightweight` flag.
--   * Stock levels are kept as they are. For documents that already moved stock in the old app,
--     an "opening" ledger row records the allocation WITHOUT changing stock, so the next save of
--     such a document only applies a difference (no double deduction).
--   * Historic job/document creations are written to usage_events with their original dates, so
--     free-plan monthly limits count real creations only.
-- =====================================================================================

create or replace function public._legacy_has(p_table text, p_col text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from information_schema.columns
                 where table_schema = 'legacy_backup' and table_name = p_table and column_name = p_col);
$$;

create or replace function public._legacy_try_date(p text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return left(btrim(p), 10)::date;
exception when others then
  return null;
end;
$$;

-- Safe cast of a legacy column expression to the new column type.
create or replace function public._legacy_cast(p_expr text, p_src_type text, p_dst_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_dst_type = 'jsonb' and p_src_type in ('jsonb', 'json') then p_expr || '::jsonb'
    when p_dst_type = 'jsonb' and p_src_type = 'text' then
      format('(case when btrim(%1$s) ~ ''^[\[{]'' then %1$s::jsonb else to_jsonb(%1$s) end)', p_expr)
    when p_dst_type = 'jsonb' then format('to_jsonb(%s)', p_expr)
    when p_dst_type = 'uuid' then format('public._try_uuid(%s::text)', p_expr)
    when p_dst_type = 'text' then format('%s::text', p_expr)
    when p_dst_type = 'integer' then format('round(public._try_numeric(%s::text))::integer', p_expr)
    when p_dst_type in ('numeric', 'bigint', 'smallint', 'double precision', 'real') then
      format('public._try_numeric(%s::text)::%s', p_expr, p_dst_type)
    when p_dst_type = 'boolean' then
      format('(case lower(%s::text) when ''true'' then true when ''t'' then true when ''1'' then true when ''yes'' then true '
             'when ''false'' then false when ''f'' then false when ''0'' then false when ''no'' then false end)', p_expr)
    when p_dst_type = 'date' then format('public._legacy_try_date(%s::text)', p_expr)
    when p_dst_type = 'timestamp with time zone' then format('public._kelviq_ts(%s::text)', p_expr)
    else format('%s::%s', p_expr, p_dst_type)
  end;
$$;

-- insert into public.<t> (common columns) select <safe casts> from legacy_backup.<t> s where <filter>
create or replace function public._legacy_copy(p_table text, p_where text default 'true',
                                               p_overrides jsonb default '{}'::jsonb, p_exclude text[] default '{}')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  c        record;
  v_src    text;
  v_expr   text;
  v_cols   text[] := '{}';
  v_exprs  text[] := '{}';
  v_n      integer;
begin
  if to_regclass(format('legacy_backup.%I', p_table)) is null then
    raise notice 'legacy_backup.% does not exist: skipped', p_table;
    return 0;
  end if;
  for c in
    select column_name, data_type, is_nullable, column_default, is_generated, identity_generation
    from information_schema.columns
    where table_schema = 'public' and table_name = p_table
    order by ordinal_position
  loop
    continue when c.is_generated = 'ALWAYS' or c.identity_generation is not null or c.column_name = any (p_exclude);
    if p_overrides ? c.column_name then
      v_expr := p_overrides ->> c.column_name;
    else
      select data_type into v_src from information_schema.columns
       where table_schema = 'legacy_backup' and table_name = p_table and column_name = c.column_name;
      continue when v_src is null;
      v_expr := public._legacy_cast(format('s.%I', c.column_name), v_src, c.data_type);
      if c.is_nullable = 'NO' and c.column_default is not null then
        v_expr := format('coalesce(%s, %s)', v_expr, c.column_default);
      end if;
    end if;
    v_cols := v_cols || quote_ident(c.column_name);
    v_exprs := v_exprs || v_expr;
  end loop;

  execute format('insert into public.%I (%s) select %s from legacy_backup.%I s where %s on conflict do nothing',
                 p_table, array_to_string(v_cols, ', '), array_to_string(v_exprs, ', '), p_table, p_where);
  get diagnostics v_n = row_count;
  raise notice 'legacy import: % rows -> public.%', v_n, p_table;
  return v_n;
end;
$$;

do $import$
declare
  v_user_ok text := 'exists (select 1 from auth.users u where u.id = public._try_uuid(s.user_id::text))';
begin
  if to_regnamespace('legacy_backup') is null then
    raise notice 'No legacy_backup schema: nothing to import.';
    return;
  end if;

  -- historical rows must not move stock, create notifications or count as new usage
  alter table public.documents disable trigger trg_documents_inventory;
  alter table public.documents disable trigger trg_documents_track_usage;
  alter table public.jobs disable trigger trg_jobs_track_usage;
  alter table public.inventory disable trigger trg_inventory_initial_history;
  alter table public.forum_votes disable trigger trg_forum_votes_recount;
  alter table public.forum_comment_votes disable trigger trg_forum_comment_votes_recount;
  alter table public.forum_comments disable trigger trg_forum_comments_notify;

  -- profiles (no billing columns)
  perform public._legacy_copy('profiles',
    'exists (select 1 from auth.users u where u.id = public._try_uuid(s.id::text))',
    '{}'::jsonb,
    array['subscription_tier', 'subscription_status', 'subscription_period_end', 'subscription_cancel_at',
          'kelviq_customer_id', 'kelviq_subscription_id', 'billing_updated_at', 'ai_credits_used', 'ai_credits_period_start']);
  insert into public.profiles (id, email, name)
  select u.id, u.email, nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '')
  from auth.users u
  on conflict (id) do nothing;

  perform public._legacy_copy('clients', v_user_ok, jsonb_build_object(
    'name', 'coalesce(nullif(btrim(s.name::text), ''''), ''Unnamed client'')',
    'portal_key', case when public._legacy_has('clients', 'portal_key')
                       then 'case when s.portal_key::text ~ ''^[A-Za-z0-9_-]{32,128}$'' then s.portal_key::text else encode(extensions.gen_random_bytes(16), ''hex'') end'
                       else 'encode(extensions.gen_random_bytes(16), ''hex'')' end));

  perform public._legacy_copy('jobs', v_user_ok, jsonb_build_object(
    'name', 'coalesce(nullif(btrim(s.name::text), ''''), ''Untitled job'')',
    'client_id', case when public._legacy_has('jobs', 'client_id')
                      then '(select c.id from public.clients c where c.id = public._try_uuid(s.client_id::text) and c.user_id = public._try_uuid(s.user_id::text))'
                      else 'null' end));

  perform public._legacy_copy('price_book_categories', v_user_ok, '{"parent_id": "null"}'::jsonb);

  perform public._legacy_copy('saved_items', v_user_ok, jsonb_build_object(
    'name', 'coalesce(nullif(btrim(s.name::text), ''''), ''Untitled item'')',
    'category_id', case when public._legacy_has('saved_items', 'category_id')
                        then '(select c.id from public.price_book_categories c where c.id = public._try_uuid(s.category_id::text) and c.user_id = public._try_uuid(s.user_id::text))'
                        else 'null' end));

  perform public._legacy_copy('inventory', v_user_ok, jsonb_build_object(
    'name', 'coalesce(nullif(btrim(s.name::text), ''''), ''Untitled item'')'));

  perform public._legacy_copy('inventory_history', v_user_ok, jsonb_build_object(
    'item_id', case when public._legacy_has('inventory_history', 'item_id')
                    then '(select i.id from public.inventory i where i.id = public._try_uuid(s.item_id::text))' else 'null' end,
    'item_name', case when public._legacy_has('inventory_history', 'item_id')
                      then '(select i.name from public.inventory i where i.id = public._try_uuid(s.item_id::text))' else 'null' end,
    'job_id', case when public._legacy_has('inventory_history', 'job_id')
                   then '(select j.id from public.jobs j where j.id = public._try_uuid(s.job_id::text))' else 'null' end,
    'action', case when public._legacy_has('inventory_history', 'action')
                   then 'coalesce(nullif(s.action::text, ''''), ''update'')' else '''update''' end,
    'quantity_change', case when public._legacy_has('inventory_history', 'quantity_change')
                            then 'coalesce(public._try_numeric(s.quantity_change::text), 0)' else '0' end,
    'quantity_after', 'null',
    'document_id', 'null',
    'line_key', 'null',
    'source', '''manual'''));

  perform public._legacy_copy('documents',
    v_user_ok || ' and s.type is not null and exists (select 1 from public.jobs j where j.id = public._try_uuid(s.job_id::text) and j.user_id = public._try_uuid(s.user_id::text))',
    jsonb_build_object(
      'data', case when public._legacy_has('documents', 'data')
                   then format('(coalesce(case when jsonb_typeof(%1$s) = ''object'' then %1$s end, ''{}''::jsonb) - ''__lightweight'')',
                               public._legacy_cast('s.data', (select data_type from information_schema.columns
                                                              where table_schema = 'legacy_backup' and table_name = 'documents' and column_name = 'data'), 'jsonb'))
                   else '''{}''::jsonb' end,
      'public_token', case when public._legacy_has('documents', 'public_token')
                           then 'coalesce(public._try_uuid(s.public_token::text), gen_random_uuid())' else 'gen_random_uuid()' end,
      'client_id', '(select j.client_id from public.jobs j where j.id = public._try_uuid(s.job_id::text))',
      'approval_expires_at', 'null',
      'approval_used_at', 'null'));

  perform public._legacy_copy('ai_chat_history', v_user_ok, jsonb_build_object(
    'title', 'coalesce(nullif(btrim(s.title::text), ''''), ''Imported chat'')'));

  if to_regclass('legacy_backup.user_gmail_accounts') is not null then
    perform public._legacy_copy('user_gmail_accounts',
      v_user_ok || ' and coalesce(' || case when public._legacy_has('user_gmail_accounts', 'gmail_address') then 's.gmail_address::text' else 'null' end
               || ', ' || case when public._legacy_has('user_gmail_accounts', 'email') then 's.email::text' else 'null' end || ') is not null',
      jsonb_build_object(
        'gmail_address', 'lower(coalesce(' || case when public._legacy_has('user_gmail_accounts', 'gmail_address') then 's.gmail_address::text' else 'null' end
                        || ', ' || case when public._legacy_has('user_gmail_accounts', 'email') then 's.email::text' else 'null' end || '))',
        'status', '''needs_reconnect''',
        'is_default', 'false',
        'granted_scopes', 'null'));
  end if;

  perform public._legacy_copy('forum_posts',
    'exists (select 1 from public.profiles p where p.id = public._try_uuid(s.user_id::text))',
    jsonb_build_object(
      'title', 'left(coalesce(nullif(btrim(s.title::text), ''''), ''Untitled''), 300)',
      'content', case when public._legacy_has('forum_posts', 'content') then 'left(s.content::text, 20000)' else 'null' end,
      'upvotes', '0', 'downvotes', '0', 'is_hidden', 'false'));
  perform public._legacy_copy('forum_comments',
    'exists (select 1 from public.profiles p where p.id = public._try_uuid(s.user_id::text))'
    || ' and exists (select 1 from public.forum_posts fp where fp.id = public._try_uuid(s.post_id::text))',
    jsonb_build_object(
      'content', case when public._legacy_has('forum_comments', 'content') then 'left(s.content::text, 10000)' else 'null' end,
      'upvotes', '0', 'downvotes', '0', 'is_hidden', 'false'));
  perform public._legacy_copy('forum_votes',
    'exists (select 1 from public.profiles p where p.id = public._try_uuid(s.user_id::text))'
    || ' and exists (select 1 from public.forum_posts fp where fp.id = public._try_uuid(s.post_id::text))'
    || ' and s.vote_type::text in (''up'', ''down'')');
  perform public._legacy_copy('forum_comment_votes',
    'exists (select 1 from public.profiles p where p.id = public._try_uuid(s.user_id::text))'
    || ' and exists (select 1 from public.forum_comments fc where fc.id = public._try_uuid(s.comment_id::text))'
    || ' and s.vote_type::text in (''up'', ''down'')');
  if to_regclass('legacy_backup.notifications') is not null then
    perform public._legacy_copy('notifications',
      'exists (select 1 from public.profiles p where p.id = public._try_uuid(s.user_id::text))',
      jsonb_build_object(
        'type', 'coalesce(nullif(s.type::text, ''''), ''like'')',
        'source_user_id', case when public._legacy_has('notifications', 'source_user_id')
                               then '(select p.id from public.profiles p where p.id = public._try_uuid(s.source_user_id::text))' else 'null' end,
        'post_id', case when public._legacy_has('notifications', 'post_id')
                        then '(select fp.id from public.forum_posts fp where fp.id = public._try_uuid(s.post_id::text))' else 'null' end,
        'comment_id', 'null'));
  end if;

  alter table public.documents enable trigger trg_documents_inventory;
  alter table public.documents enable trigger trg_documents_track_usage;
  alter table public.jobs enable trigger trg_jobs_track_usage;
  alter table public.inventory enable trigger trg_inventory_initial_history;
  alter table public.forum_votes enable trigger trg_forum_votes_recount;
  alter table public.forum_comment_votes enable trigger trg_forum_comment_votes_recount;
  alter table public.forum_comments enable trigger trg_forum_comments_notify;

  -- link jobs/documents to clients by id where the old data only had a (unique) client name
  update public.jobs j set client_id = c.id
    from public.clients c
   where j.client_id is null and c.user_id = j.user_id and c.name = j.client_name
     and (select count(*) from public.clients c2 where c2.user_id = j.user_id and c2.name = j.client_name) = 1;
  update public.documents d set client_id = j.client_id
    from public.jobs j
   where d.client_id is null and j.id = d.job_id and j.client_id is not null;

  -- vote counters
  update public.forum_posts p set
    upvotes   = (select count(*) from public.forum_votes v where v.post_id = p.id and v.vote_type = 'up'),
    downvotes = (select count(*) from public.forum_votes v where v.post_id = p.id and v.vote_type = 'down');
  update public.forum_comments c set
    upvotes   = (select count(*) from public.forum_comment_votes v where v.comment_id = c.id and v.vote_type = 'up'),
    downvotes = (select count(*) from public.forum_comment_votes v where v.comment_id = c.id and v.vote_type = 'down');

  -- historic creations (monthly limits count the real creation dates)
  insert into public.usage_events (user_id, kind, ref_id, created_at)
  select user_id, 'job', id, created_at from public.jobs;
  insert into public.usage_events (user_id, kind, ref_id, meta, created_at)
  select user_id, 'document', job_id, jsonb_build_object('document_id', id, 'type', type, 'imported', true), created_at
  from public.documents;

  -- opening ledger: what imported documents already took from stock (no stock change now)
  insert into public.inventory_history
    (user_id, item_id, item_name, action, quantity_change, quantity_after, notes, job_id, document_id, line_key, source)
  select j.user_id, p.item_id, i.name, 'deduct', -p.qty, i.quantity,
         'Imported: already deducted by the previous version (no stock change)', j.job_id, p.document_id, p.line_key, 'document'
  from (select distinct user_id, job_id from public.documents
        where type in ('Estimate', 'Change Order', 'Material Log', 'Invoice')) j
  cross join lateral public._job_stock_plan(j.user_id, j.job_id) p
  join public.inventory i on i.id = p.item_id
  where p.qty <> 0;

  raise notice 'Legacy import finished. legacy_backup is kept untouched; drop it once the data is verified.';
end
$import$;

-- helpers are only needed during this migration
drop function public._legacy_copy(text, text, jsonb, text[]);
drop function public._legacy_cast(text, text, text);
drop function public._legacy_try_date(text);
drop function public._legacy_has(text, text);

notify pgrst, 'reload schema';
