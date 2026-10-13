-- End-to-end Sites Activation demo workflow.
-- This migration is intentionally small: it adds driver-scoped workflow RPCs,
-- notification side effects, and fictional demo records only.

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;

  update public.drivers
  set user_id = new.id
  where user_id is null
    and email is not null
    and lower(email) = lower(new.email);

  return new;
end;
$$;

create or replace function public.start_site_visit(
  p_site_code text,
  p_latitude numeric default null,
  p_longitude numeric default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_site public.sites%rowtype;
  v_driver public.drivers%rowtype;
  v_attempt_id uuid;
  v_attempt_number integer;
begin
  select * into v_site
  from public.sites
  where site_code = p_site_code
  for update;

  if not found or v_site.assigned_driver_id is null then
    raise exception 'Assigned site not found';
  end if;

  select * into v_driver
  from public.drivers
  where id = v_site.assigned_driver_id
    and user_id = (select auth.uid())
    and active;

  if not found then raise exception 'Not authorized for this site'; end if;
  if v_site.status not in ('assigned', 'revisit_required', 'in_progress') then
    raise exception 'Site cannot be visited from status %', v_site.status;
  end if;

  select id into v_attempt_id
  from public.visit_attempts
  where site_id = v_site.id and driver_id = v_driver.id and status = 'in_progress'
  order by attempt_number desc limit 1;

  if v_attempt_id is null then
    select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
    from public.visit_attempts where site_id = v_site.id;

    insert into public.visit_attempts(
      organization_id, site_id, driver_id, attempt_number, status,
      started_at, captured_latitude, captured_longitude
    ) values (
      v_site.organization_id, v_site.id, v_driver.id, v_attempt_number,
      'in_progress', now(), p_latitude, p_longitude
    ) returning id into v_attempt_id;
  else
    update public.visit_attempts
    set captured_latitude = coalesce(p_latitude, captured_latitude),
        captured_longitude = coalesce(p_longitude, captured_longitude)
    where id = v_attempt_id;
  end if;

  if v_site.status in ('assigned', 'revisit_required') then
    update public.sites set status = 'in_progress' where id = v_site.id;
  end if;

  return v_attempt_id;
end;
$$;

create or replace function public.submit_site_evidence(
  p_attempt_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.visit_attempts%rowtype;
  v_site public.sites%rowtype;
  v_driver public.drivers%rowtype;
  v_evidence_count integer;
  v_distance numeric;
  v_member record;
begin
  select * into v_attempt from public.visit_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Attempt not found'; end if;

  select * into v_driver from public.drivers
  where id = v_attempt.driver_id and user_id = (select auth.uid()) and active;
  if not found then raise exception 'Not authorized for this attempt'; end if;

  select * into v_site from public.sites
  where id = v_attempt.site_id and assigned_driver_id = v_driver.id for update;
  if not found or v_site.status <> 'in_progress' then
    raise exception 'Site is not ready for submission';
  end if;

  select count(distinct kind) into v_evidence_count
  from public.evidence_files
  where attempt_id = p_attempt_id
    and kind in ('installation_photo', 'close_up_photo');
  if v_evidence_count < 2 then raise exception 'Two evidence photos are required'; end if;

  v_distance := extensions.st_distance(
    v_site.location,
    extensions.st_setsrid(
      extensions.st_makepoint(p_longitude::double precision, p_latitude::double precision),
      4326
    )::extensions.geography
  );

  update public.visit_attempts
  set status = 'submitted', submitted_at = now(),
      captured_latitude = p_latitude, captured_longitude = p_longitude,
      gps_proximity_metres = round(v_distance, 2), notes = p_notes
  where id = p_attempt_id;
  update public.sites set status = 'under_review' where id = v_site.id;

  for v_member in
    select user_id from public.organization_members
    where organization_id = v_site.organization_id
      and active and role in ('admin', 'operator', 'reviewer')
  loop
    insert into public.notifications(organization_id, user_id, type, title, detail, site_id)
    values (v_site.organization_id, v_member.user_id, 'review',
      'Evidence ready for review', v_site.site_code || ' was submitted by ' || v_driver.full_name, v_site.id);
  end loop;

  return v_site.id;
end;
$$;

create or replace function public.report_site_issue(
  p_attempt_id uuid,
  p_notes text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.visit_attempts%rowtype;
  v_site public.sites%rowtype;
  v_driver public.drivers%rowtype;
  v_exception_id uuid;
begin
  select * into v_attempt from public.visit_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Attempt not found'; end if;
  select * into v_driver from public.drivers
  where id = v_attempt.driver_id and user_id = (select auth.uid()) and active;
  if not found then raise exception 'Not authorized for this attempt'; end if;
  select * into v_site from public.sites
  where id = v_attempt.site_id and assigned_driver_id = v_driver.id for update;
  if not found or v_site.status <> 'in_progress' then raise exception 'Site is not in progress'; end if;

  update public.visit_attempts
  set status = 'rejected', decided_at = now(), notes = p_notes
  where id = p_attempt_id;
  update public.sites set status = 'flagged_exception' where id = v_site.id;

  insert into public.exceptions(
    organization_id, site_id, attempt_id, reason, status, details, opened_by
  ) values (
    v_site.organization_id, v_site.id, p_attempt_id, 'unable_to_install',
    'open', jsonb_build_object('notes', p_notes), (select auth.uid())
  ) returning id into v_exception_id;

  return v_exception_id;
end;
$$;

create or replace function public.assign_sites(p_site_codes text[], p_driver_id uuid, p_reason text default 'Assignment confirmed')
returns table(assigned integer, skipped integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_driver public.drivers%rowtype;
  v_site public.sites%rowtype;
  v_site_code text;
  v_assigned integer := 0;
  v_skipped integer := 0;
begin
  select * into v_driver from public.drivers where id = p_driver_id;
  if not found or not v_driver.active or not v_driver.available then raise exception 'Driver is not eligible'; end if;
  if not private.has_org_role(v_driver.organization_id, array['admin','operator']::public.org_role[]) then raise exception 'Not authorized'; end if;
  foreach v_site_code in array p_site_codes loop
    select * into v_site from public.sites where organization_id = v_driver.organization_id and site_code = v_site_code for update;
    if not found or v_site.region_id <> v_driver.region_id or v_site.status in ('under_review','verified','closed_cancelled') or v_site.assigned_driver_id = p_driver_id then
      v_skipped := v_skipped + 1; continue;
    end if;
    update public.site_assignments set ended_at = now() where site_id = v_site.id and ended_at is null;
    insert into public.site_assignments(organization_id, site_id, driver_id, assigned_by, reason)
    values (v_site.organization_id, v_site.id, p_driver_id, (select auth.uid()), p_reason);
    update public.sites set assigned_driver_id = p_driver_id,
      status = case when status in ('unassigned','revisit_required','flagged_exception') then 'assigned'::public.site_status else status end
    where id = v_site.id;
    v_assigned := v_assigned + 1;
  end loop;
  if v_driver.user_id is not null and v_assigned > 0 then
    insert into public.notifications(organization_id, user_id, type, title, detail)
    values (v_driver.organization_id, v_driver.user_id, 'assignment',
      'New site assignment', v_assigned || ' site' || case when v_assigned = 1 then '' else 's' end || ' assigned to you');
  end if;
  return query select v_assigned, v_skipped;
end;
$$;

create or replace function public.decide_site_review(p_site_code text, p_decision public.review_decision_type, p_reason_code text, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_site public.sites%rowtype; v_attempt public.visit_attempts%rowtype; v_driver public.drivers%rowtype; v_id uuid;
begin
  select * into v_site from public.sites where site_code = p_site_code for update;
  if not found or not private.has_org_role(v_site.organization_id, array['admin','reviewer']::public.org_role[]) then raise exception 'Not authorized'; end if;
  if v_site.status <> 'under_review' then raise exception 'Site is not under review'; end if;
  select * into v_attempt from public.visit_attempts where site_id = v_site.id and status = 'submitted' order by attempt_number desc limit 1 for update;
  if not found then raise exception 'No submitted attempt exists'; end if;
  select * into v_driver from public.drivers where id = v_attempt.driver_id;
  insert into public.review_decisions(organization_id, site_id, attempt_id, reviewer_id, decision, reason_code, notes)
  values (v_site.organization_id, v_site.id, v_attempt.id, (select auth.uid()), p_decision, p_reason_code, p_notes) returning id into v_id;
  update public.visit_attempts set status = case when p_decision = 'verified' then 'accepted'::public.attempt_status else 'rejected'::public.attempt_status end, decided_at = now() where id = v_attempt.id;
  update public.sites set status = p_decision::text::public.site_status where id = v_site.id;
  if p_decision = 'flagged_exception' then
    insert into public.exceptions(organization_id, site_id, attempt_id, reason, opened_by, details)
    values (v_site.organization_id, v_site.id, v_attempt.id, 'rejected_evidence', (select auth.uid()), jsonb_build_object('reason_code', p_reason_code));
  end if;
  if v_driver.user_id is not null then
    insert into public.notifications(organization_id, user_id, type, title, detail, site_id)
    values (v_site.organization_id, v_driver.user_id,
      case when p_decision = 'verified' then 'approval'::public.notification_type else 'revisit'::public.notification_type end,
      case when p_decision = 'verified' then 'Site approved' else 'Site needs attention' end,
      v_site.site_code || ': ' || coalesce(p_notes, p_reason_code), v_site.id);
  end if;
  return v_id;
end;
$$;

revoke all on function public.start_site_visit(text, numeric, numeric), public.submit_site_evidence(uuid, numeric, numeric, text), public.report_site_issue(uuid, text) from public, anon;
grant execute on function public.start_site_visit(text, numeric, numeric), public.submit_site_evidence(uuid, numeric, numeric, text), public.report_site_issue(uuid, text) to authenticated;

-- Fictional demo drivers. Link a real invited Auth identity by creating/updating
-- a driver with the same email before the invite is accepted.
insert into public.drivers(id, organization_id, driver_code, full_name, mobile, email, region_id)
values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'DRV-DEMO-01', 'Fahad Al Demo', '+966 50 000 0101', 'driver.riyadh@example.test', '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'DRV-DEMO-02', 'Noura Al Demo', '+966 50 000 0102', 'driver.jeddah@example.test', '10000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

with demo(site_code, merchant_name, address, region_id, city_name, category_code, latitude, longitude) as (
  values
    ('DEMO-RUH-001', 'North Star Grocery', 'King Fahd Road, Riyadh', '10000000-0000-4000-8000-000000000001'::uuid, 'Riyadh', 'grocery', 24.713552::numeric, 46.675296::numeric),
    ('DEMO-RUH-002', 'Palm Corner Pharmacy', 'Olaya Street, Riyadh', '10000000-0000-4000-8000-000000000001'::uuid, 'Riyadh', 'pharmacy', 24.711200::numeric, 46.674100::numeric),
    ('DEMO-JED-001', 'Red Sea Café', 'Al Hamra, Jeddah', '10000000-0000-4000-8000-000000000002'::uuid, 'Jeddah', 'cafe', 21.543333::numeric, 39.172778::numeric),
    ('DEMO-DMM-001', 'Eastern Table', 'Al Shatea, Dammam', '10000000-0000-4000-8000-000000000003'::uuid, 'Dammam', 'restaurant', 26.420683::numeric, 50.088794::numeric),
    ('DEMO-MED-001', 'Heritage Convenience', 'Quba Road, Madinah', '10000000-0000-4000-8000-000000000004'::uuid, 'Madinah', 'convenience', 24.468611::numeric, 39.614167::numeric),
    ('DEMO-ABH-001', 'Highland Electronics', 'King Abdulaziz Road, Abha', '10000000-0000-4000-8000-000000000005'::uuid, 'Abha', 'electronics', 18.216389::numeric, 42.505278::numeric)
)
insert into public.sites(
  organization_id, site_code, merchant_name, address, region_id, city_id,
  category_id, latitude, longitude
)
select
  '00000000-0000-4000-8000-000000000001', d.site_code, d.merchant_name,
  d.address, d.region_id, c.id, mc.id, d.latitude, d.longitude
from demo d
join public.cities c on c.organization_id = '00000000-0000-4000-8000-000000000001'
  and c.region_id = d.region_id and c.name_en = d.city_name
join public.merchant_categories mc on mc.organization_id = '00000000-0000-4000-8000-000000000001'
  and mc.code = d.category_code
on conflict (organization_id, site_code) do nothing;
