-- Applied 2026-11-15 with the owner's OK (roadmap D8, follow-up) in the Supabase SQL editor (project iauteblvljppwzsxloyd); verified: the live submit_feedback has no rating condition, is still security definer with search_path '', anon can still execute it, a bad token is refused.
-- =====================================================================================
-- ContractorDocs: no review gating (follow-up to 20261116001000_feedback_profile.sql, roadmap D8)
--
-- Google's review policies forbid "review gating": asking for a public review only from customers who are happy.
-- 20261116001000 returned the contractor's Google review link from submit_feedback only for 4-5 stars. This replaces
-- ONLY that function: the body is the 20261116001000 version, with the "if p_rating >= 4" condition removed, so every
-- client who sends feedback gets the same link (when the contractor has set one). Nothing else changes: same signature,
-- same once-per-link rule, same errors, same return shape, same grants.
--
-- Rollback: re-run the submit_feedback block of 20261116001000_feedback_profile.sql.
-- =====================================================================================

create or replace function public.submit_feedback(p_token text, p_rating integer, p_comment text default null, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f       public.feedback_responses%rowtype;
  v_comment text := public._clean_multiline(p_comment, 2000);
  v_name    text := public._clean_text(p_name, 80);
  v_review  text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'Feedback link not found' using errcode = 'P0002';
  end if;
  select * into v_f from public.feedback_responses where token = p_token for update;
  if not found then
    raise exception 'Feedback link not found' using errcode = 'P0002';
  end if;
  if v_f.status <> 'requested' then
    raise exception 'ALREADY_SUBMITTED: Thank you, your feedback was already sent.' using errcode = 'P0001', hint = 'already_submitted';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Please choose 1 to 5 stars.' using errcode = '22023';
  end if;

  update public.feedback_responses
     set status = 'submitted',
         rating = p_rating,
         comment = v_comment,
         client_name = v_name,
         submitted_at = now()
   where id = v_f.id;

  -- every rating gets the same link: offering it only to happy clients is "review gating", which Google forbids
  select p.google_review_link into v_review from public.profiles p where p.id = v_f.user_id;
  if v_review is null or v_review !~* '^https://[^[:space:]]+$' then
    v_review := null;
  end if;
  return jsonb_build_object('ok', true, 'rating', p_rating, 'review_url', v_review);
end;
$$;

revoke all on function public.submit_feedback(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(text, integer, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
