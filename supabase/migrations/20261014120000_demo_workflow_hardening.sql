-- Persist exception outcomes and represent revisit decisions in the unified queue.

create or replace function public.decide_site_review(
  p_site_code text,
  p_decision public.review_decision_type,
  p_reason_code text,
  p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_site public.sites%rowtype;
  v_attempt public.visit_attempts%rowtype;
  v_driver public.drivers%rowtype;
  v_id uuid;
begin
  select * into v_site from public.sites where site_code = p_site_code for update;
  if not found or not private.has_org_role(v_site.organization_id, array['admin','reviewer']::public.org_role[]) then
    raise exception 'Not authorized';
  end if;
  if v_site.status <> 'under_review' then raise exception 'Site is not under review'; end if;

  select * into v_attempt from public.visit_attempts
  where site_id = v_site.id and status = 'submitted'
  order by attempt_number desc limit 1 for update;
  if not found then raise exception 'No submitted attempt exists'; end if;

  select * into v_driver from public.drivers where id = v_attempt.driver_id;
  insert into public.review_decisions(
    organization_id, site_id, attempt_id, reviewer_id, decision, reason_code, notes
  ) values (
    v_site.organization_id, v_site.id, v_attempt.id, (select auth.uid()),
    p_decision, p_reason_code, p_notes
  ) returning id into v_id;

  update public.visit_attempts
  set status = case when p_decision = 'verified' then 'accepted'::public.attempt_status else 'rejected'::public.attempt_status end,
      decided_at = now()
  where id = v_attempt.id;
  update public.sites set status = p_decision::text::public.site_status where id = v_site.id;

  if p_decision in ('revisit_required', 'flagged_exception') then
    insert into public.exceptions(
      organization_id, site_id, attempt_id, reason, status, opened_by, details
    ) values (
      v_site.organization_id,
      v_site.id,
      v_attempt.id,
      'rejected_evidence',
      case when p_decision = 'revisit_required'
        then 'awaiting_revisit'::public.exception_status
        else 'open'::public.exception_status
      end,
      (select auth.uid()),
      jsonb_build_object('reason_code', p_reason_code, 'notes', p_notes)
    );
  end if;

  if v_driver.user_id is not null then
    insert into public.notifications(organization_id, user_id, type, title, detail, site_id)
    values (
      v_site.organization_id,
      v_driver.user_id,
      case when p_decision = 'verified' then 'approval'::public.notification_type else 'revisit'::public.notification_type end,
      case when p_decision = 'verified' then 'Site approved' else 'Site needs attention' end,
      v_site.site_code || ': ' || coalesce(p_notes, p_reason_code),
      v_site.id
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.resolve_site_exception(
  p_site_code text,
  p_to_status public.site_status,
  p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_site public.sites%rowtype;
  v_exception public.exceptions%rowtype;
begin
  select * into v_site from public.sites where site_code = p_site_code for update;
  if not found or not private.has_org_role(
    v_site.organization_id,
    array['admin','operator','reviewer']::public.org_role[]
  ) then raise exception 'Not authorized'; end if;

  if nullif(btrim(p_notes), '') is null then
    raise exception 'Resolution reason is required';
  end if;

  if not exists (
    select 1 from public.site_status_transitions
    where from_status = v_site.status and to_status = p_to_status
  ) then raise exception 'Invalid site transition: % -> %', v_site.status, p_to_status; end if;

  select * into v_exception from public.exceptions
  where site_id = v_site.id and status in ('open','investigating','awaiting_revisit')
  order by created_at desc limit 1 for update;

  if v_exception.id is null then
    raise exception 'No active exception exists';
  end if;

  update public.sites set status = p_to_status where id = v_site.id;
  update public.exceptions
  set status = case when p_to_status = 'closed_cancelled'
      then 'closed'::public.exception_status
      else 'resolved'::public.exception_status
    end,
    resolved_by = (select auth.uid()),
    resolved_at = now(),
    details = details || jsonb_build_object('resolution_reason', p_notes, 'resolved_to', p_to_status)
  where id = v_exception.id;

  insert into public.audit_events(
    organization_id, site_id, entity_type, entity_id, actor_id, action,
    old_values, new_values, detail
  ) values (
    v_site.organization_id, v_site.id, 'exception', v_exception.id,
    (select auth.uid()), 'exception_resolved',
    jsonb_build_object('site_status', v_site.status, 'exception_status', v_exception.status),
    jsonb_build_object('site_status', p_to_status, 'resolution_reason', p_notes),
    p_notes
  );
  return v_exception.id;
end;
$$;

revoke all on function public.resolve_site_exception(text, public.site_status, text) from public, anon;
grant execute on function public.resolve_site_exception(text, public.site_status, text) to authenticated;
