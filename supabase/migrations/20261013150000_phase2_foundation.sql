-- Moka 10 Billion Steps — Phase 2 Sites Activation foundation
-- Approved 2026-10-13. All application tables use RLS; evidence is private.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.org_role as enum ('admin', 'operator', 'reviewer', 'driver');
create type public.site_status as enum ('unassigned', 'assigned', 'in_progress', 'under_review', 'verified', 'revisit_required', 'flagged_exception', 'closed_cancelled');
create type public.attempt_status as enum ('not_started', 'in_progress', 'submitted', 'accepted', 'rejected');
create type public.exception_status as enum ('open', 'investigating', 'awaiting_revisit', 'resolved', 'closed');
create type public.exception_reason as enum ('unable_to_install', 'simulated_ai_flag', 'gps_mismatch', 'qr_mismatch', 'rejected_evidence', 'other');
create type public.review_decision_type as enum ('verified', 'revisit_required', 'flagged_exception');
create type public.evidence_kind as enum ('installation_photo', 'close_up_photo', 'other');
create type public.notification_type as enum ('assignment', 'review', 'exception', 'revisit', 'approval');
create type public.import_status as enum ('pending', 'validating', 'completed', 'failed');

create table public.organizations (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.regions (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name_en text not null,
  name_ar text,
  active boolean not null default true,
  unique (organization_id, code)
);

create table public.cities (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete restrict,
  name_en text not null,
  name_ar text,
  active boolean not null default true,
  unique (organization_id, region_id, name_en)
);

create table public.merchant_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name_en text not null,
  name_ar text,
  active boolean not null default true,
  unique (organization_id, code)
);

create table public.drivers (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_code text not null,
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  mobile text,
  email text,
  region_id uuid not null references public.regions(id) on delete restrict,
  active boolean not null default true,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, driver_code)
);

create table public.sites (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_code text not null,
  merchant_name text not null,
  address text,
  region_id uuid not null references public.regions(id) on delete restrict,
  city_id uuid not null references public.cities(id) on delete restrict,
  category_id uuid not null references public.merchant_categories(id) on delete restrict,
  status public.site_status not null default 'unassigned',
  assigned_driver_id uuid references public.drivers(id) on delete set null,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  location extensions.geography(point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude::double precision, latitude::double precision), 4326)::extensions.geography
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, site_code)
);

create table public.site_status_transitions (
  from_status public.site_status not null,
  to_status public.site_status not null,
  primary key (from_status, to_status),
  check (from_status <> to_status)
);

create table public.site_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text,
  check (ended_at is null or ended_at >= assigned_at)
);
create unique index site_assignments_one_active on public.site_assignments(site_id) where ended_at is null;

create table public.visit_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  status public.attempt_status not null default 'not_started',
  started_at timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz,
  captured_latitude numeric(9,6) check (captured_latitude between -90 and 90),
  captured_longitude numeric(9,6) check (captured_longitude between -180 and 180),
  gps_proximity_metres numeric(10,2) check (gps_proximity_metres >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, attempt_number)
);

create table public.evidence_files (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  attempt_id uuid not null references public.visit_attempts(id) on delete cascade,
  kind public.evidence_kind not null,
  bucket_id text not null default 'site-evidence' check (bucket_id = 'site-evidence'),
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  checksum_sha256 text,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.review_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  attempt_id uuid not null unique references public.visit_attempts(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision public.review_decision_type not null,
  reason_code text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.exceptions (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  attempt_id uuid references public.visit_attempts(id) on delete set null,
  reason public.exception_reason not null,
  status public.exception_status not null default 'open',
  details jsonb not null default '{}'::jsonb,
  opened_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  detail text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  detail text not null,
  site_id uuid references public.sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  file_name text not null,
  status public.import_status not null default 'pending',
  total_rows integer not null default 0 check (total_rows >= 0),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.import_row_errors (
  id uuid primary key default extensions.gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  field_name text,
  message text not null,
  raw_values jsonb not null default '{}'::jsonb
);

create index sites_org_status_idx on public.sites(organization_id, status);
create index sites_org_region_idx on public.sites(organization_id, region_id);
create index sites_driver_idx on public.sites(assigned_driver_id) where assigned_driver_id is not null;
create index sites_location_gix on public.sites using gist(location);
create index drivers_org_region_idx on public.drivers(organization_id, region_id);
create index assignments_driver_active_idx on public.site_assignments(driver_id) where ended_at is null;
create index attempts_site_idx on public.visit_attempts(site_id, attempt_number desc);
create index evidence_attempt_idx on public.evidence_files(attempt_id);
create index exceptions_org_status_idx on public.exceptions(organization_id, status);
create index audit_site_created_idx on public.audit_events(site_id, created_at desc);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);

insert into public.site_status_transitions(from_status, to_status) values
  ('unassigned','assigned'), ('unassigned','closed_cancelled'),
  ('assigned','unassigned'), ('assigned','in_progress'), ('assigned','closed_cancelled'),
  ('in_progress','under_review'), ('in_progress','revisit_required'), ('in_progress','flagged_exception'),
  ('under_review','verified'), ('under_review','revisit_required'), ('under_review','flagged_exception'),
  ('verified','flagged_exception'), ('verified','closed_cancelled'),
  ('revisit_required','assigned'), ('revisit_required','in_progress'), ('revisit_required','closed_cancelled'),
  ('flagged_exception','assigned'), ('flagged_exception','revisit_required'), ('flagged_exception','verified'), ('flagged_exception','closed_cancelled');

insert into public.organizations(id, slug, name)
values ('00000000-0000-4000-8000-000000000001', 'dmc-sites-activation', 'DMC Sites Activation');

insert into public.regions(id, organization_id, code, name_en, name_ar) values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','riyadh','Riyadh','الرياض'),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','makkah','Makkah','مكة المكرمة'),
  ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','eastern-province','Eastern Province','المنطقة الشرقية'),
  ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','madinah','Madinah','المدينة المنورة'),
  ('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','asir','Asir','عسير');

insert into public.cities(organization_id, region_id, name_en) values
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Riyadh'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Al Kharj'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Diriyah'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Jeddah'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Makkah'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Taif'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Dammam'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Khobar'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Dhahran'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Madinah'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Yanbu'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','Abha'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','Khamis Mushait');

insert into public.merchant_categories(organization_id, code, name_en) values
  ('00000000-0000-4000-8000-000000000001','grocery','Grocery'),
  ('00000000-0000-4000-8000-000000000001','pharmacy','Pharmacy'),
  ('00000000-0000-4000-8000-000000000001','cafe','Café'),
  ('00000000-0000-4000-8000-000000000001','restaurant','Restaurant'),
  ('00000000-0000-4000-8000-000000000001','convenience','Convenience'),
  ('00000000-0000-4000-8000-000000000001','electronics','Electronics');

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger organizations_updated_at before update on public.organizations for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger drivers_updated_at before update on public.drivers for each row execute function private.set_updated_at();
create trigger sites_updated_at before update on public.sites for each row execute function private.set_updated_at();
create trigger attempts_updated_at before update on public.visit_attempts for each row execute function private.set_updated_at();

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.is_org_member(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = (select auth.uid()) and m.active
  );
$$;

create function private.has_org_role(p_organization_id uuid, p_roles public.org_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = (select auth.uid()) and m.active and m.role = any(p_roles)
  );
$$;

create function private.is_driver(p_driver_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.drivers d where d.id = p_driver_id and d.user_id = (select auth.uid()) and d.active);
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.has_org_role(uuid, public.org_role[]) from public, anon;
revoke all on function private.is_driver(uuid) from public, anon;
grant execute on function private.is_org_member(uuid), private.has_org_role(uuid, public.org_role[]), private.is_driver(uuid) to authenticated;

create function private.enforce_site_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status is distinct from new.status and not exists (
    select 1 from public.site_status_transitions t where t.from_status = old.status and t.to_status = new.status
  ) then raise exception 'Invalid site transition: % -> %', old.status, new.status using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger sites_enforce_transition before update of status on public.sites for each row execute function private.enforce_site_transition();

create function private.audit_site_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status or old.assigned_driver_id is distinct from new.assigned_driver_id then
    insert into public.audit_events(organization_id, site_id, entity_type, entity_id, actor_id, action, old_values, new_values)
    values (new.organization_id, new.id, 'site', new.id, (select auth.uid()), 'site_updated',
      jsonb_build_object('status', old.status, 'assigned_driver_id', old.assigned_driver_id),
      jsonb_build_object('status', new.status, 'assigned_driver_id', new.assigned_driver_id));
  end if;
  return new;
end;
$$;
create trigger sites_audit_change after update on public.sites for each row execute function private.audit_site_change();

create function public.assign_sites(p_site_codes text[], p_driver_id uuid, p_reason text default 'Assignment confirmed')
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
  return query select v_assigned, v_skipped;
end;
$$;

create function public.decide_site_review(p_site_code text, p_decision public.review_decision_type, p_reason_code text, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_site public.sites%rowtype; v_attempt public.visit_attempts%rowtype; v_id uuid;
begin
  select * into v_site from public.sites where site_code = p_site_code for update;
  if not found or not private.has_org_role(v_site.organization_id, array['admin','reviewer']::public.org_role[]) then raise exception 'Not authorized'; end if;
  if v_site.status <> 'under_review' then raise exception 'Site is not under review'; end if;
  select * into v_attempt from public.visit_attempts where site_id = v_site.id and status = 'submitted' order by attempt_number desc limit 1 for update;
  if not found then raise exception 'No submitted attempt exists'; end if;
  insert into public.review_decisions(organization_id, site_id, attempt_id, reviewer_id, decision, reason_code, notes)
  values (v_site.organization_id, v_site.id, v_attempt.id, (select auth.uid()), p_decision, p_reason_code, p_notes) returning id into v_id;
  update public.visit_attempts set status = case when p_decision = 'verified' then 'accepted'::public.attempt_status else 'rejected'::public.attempt_status end, decided_at = now() where id = v_attempt.id;
  update public.sites set status = p_decision::text::public.site_status where id = v_site.id;
  if p_decision = 'flagged_exception' then
    insert into public.exceptions(organization_id, site_id, attempt_id, reason, opened_by, details)
    values (v_site.organization_id, v_site.id, v_attempt.id, 'rejected_evidence', (select auth.uid()), jsonb_build_object('reason_code', p_reason_code));
  end if;
  return v_id;
end;
$$;

revoke all on function public.assign_sites(text[], uuid, text), public.decide_site_review(text, public.review_decision_type, text, text) from public, anon;
grant execute on function public.assign_sites(text[], uuid, text), public.decide_site_review(text, public.review_decision_type, text, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.regions enable row level security;
alter table public.cities enable row level security;
alter table public.merchant_categories enable row level security;
alter table public.drivers enable row level security;
alter table public.sites enable row level security;
alter table public.site_status_transitions enable row level security;
alter table public.site_assignments enable row level security;
alter table public.visit_attempts enable row level security;
alter table public.evidence_files enable row level security;
alter table public.review_decisions enable row level security;
alter table public.exceptions enable row level security;
alter table public.audit_events enable row level security;
alter table public.notifications enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_row_errors enable row level security;

create policy organizations_member_read on public.organizations for select to authenticated using ((select private.is_org_member(id)));
create policy profiles_self_read on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_self_update on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy members_org_read on public.organization_members for select to authenticated using ((select private.is_org_member(organization_id)));
create policy members_admin_write on public.organization_members for all to authenticated using ((select private.has_org_role(organization_id, array['admin']::public.org_role[]))) with check ((select private.has_org_role(organization_id, array['admin']::public.org_role[])));

create policy regions_member_read on public.regions for select to authenticated using ((select private.is_org_member(organization_id)));
create policy cities_member_read on public.cities for select to authenticated using ((select private.is_org_member(organization_id)));
create policy categories_member_read on public.merchant_categories for select to authenticated using ((select private.is_org_member(organization_id)));
create policy references_admin_write_regions on public.regions for all to authenticated using ((select private.has_org_role(organization_id, array['admin']::public.org_role[]))) with check ((select private.has_org_role(organization_id, array['admin']::public.org_role[])));
create policy references_admin_write_cities on public.cities for all to authenticated using ((select private.has_org_role(organization_id, array['admin']::public.org_role[]))) with check ((select private.has_org_role(organization_id, array['admin']::public.org_role[])));
create policy references_admin_write_categories on public.merchant_categories for all to authenticated using ((select private.has_org_role(organization_id, array['admin']::public.org_role[]))) with check ((select private.has_org_role(organization_id, array['admin']::public.org_role[])));

create policy drivers_read on public.drivers for select to authenticated using ((select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[])) or user_id = (select auth.uid()));
create policy drivers_manage on public.drivers for all to authenticated using ((select private.has_org_role(organization_id, array['admin','operator']::public.org_role[]))) with check ((select private.has_org_role(organization_id, array['admin','operator']::public.org_role[])));

create policy sites_read on public.sites for select to authenticated using (
  (select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[])) or (assigned_driver_id is not null and (select private.is_driver(assigned_driver_id)))
);
create policy sites_manage on public.sites for all to authenticated using ((select private.has_org_role(organization_id, array['admin','operator']::public.org_role[]))) with check ((select private.has_org_role(organization_id, array['admin','operator']::public.org_role[])));
create policy transitions_member_read on public.site_status_transitions for select to authenticated using (true);

create policy assignments_read on public.site_assignments for select to authenticated using ((select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[])) or (select private.is_driver(driver_id)));
create policy attempts_read on public.visit_attempts for select to authenticated using ((select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[])) or (select private.is_driver(driver_id)));
create policy attempts_driver_insert on public.visit_attempts for insert to authenticated with check ((select private.is_driver(driver_id)) and exists (select 1 from public.sites s where s.id = site_id and s.assigned_driver_id = driver_id));
create policy attempts_driver_update on public.visit_attempts for update to authenticated using ((select private.is_driver(driver_id))) with check ((select private.is_driver(driver_id)));

create policy evidence_read on public.evidence_files for select to authenticated using ((select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[])) or exists (select 1 from public.visit_attempts a where a.id = attempt_id and (select private.is_driver(a.driver_id))));
create policy evidence_driver_insert on public.evidence_files for insert to authenticated with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.visit_attempts a where a.id = attempt_id and a.site_id = site_id and (select private.is_driver(a.driver_id))));
create policy decisions_read on public.review_decisions for select to authenticated using ((select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[])) or exists (select 1 from public.visit_attempts a where a.id = attempt_id and (select private.is_driver(a.driver_id))));

create policy exceptions_read on public.exceptions for select to authenticated using ((select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[])) or exists (select 1 from public.sites s where s.id = site_id and s.assigned_driver_id is not null and (select private.is_driver(s.assigned_driver_id))));
create policy exceptions_manage on public.exceptions for all to authenticated using ((select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[]))) with check ((select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[])));
create policy audit_read on public.audit_events for select to authenticated using ((select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[])) or exists (select 1 from public.sites s where s.id = site_id and s.assigned_driver_id is not null and (select private.is_driver(s.assigned_driver_id))));
create policy notifications_self_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_self_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy imports_manage on public.import_batches for all to authenticated using ((select private.has_org_role(organization_id, array['admin','operator']::public.org_role[]))) with check ((select private.has_org_role(organization_id, array['admin','operator']::public.org_role[])));
create policy import_errors_read on public.import_row_errors for select to authenticated using (exists (select 1 from public.import_batches b where b.id = batch_id and (select private.has_org_role(b.organization_id, array['admin','operator']::public.org_role[]))));

revoke all on all tables in schema public from anon;
grant select on public.organizations, public.profiles, public.organization_members, public.regions, public.cities, public.merchant_categories, public.drivers, public.sites, public.site_status_transitions, public.site_assignments, public.visit_attempts, public.evidence_files, public.review_decisions, public.exceptions, public.audit_events, public.notifications, public.import_batches, public.import_row_errors to authenticated;
grant insert, update, delete on public.organization_members, public.regions, public.cities, public.merchant_categories, public.drivers, public.sites, public.exceptions, public.import_batches to authenticated;
grant insert, update on public.visit_attempts, public.evidence_files, public.notifications to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('site-evidence', 'site-evidence', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function private.can_access_evidence_object(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_site uuid; v_attempt uuid;
begin
  if split_part(p_name, '/', 1) !~ '^[0-9a-f-]{36}$' or split_part(p_name, '/', 2) !~ '^[0-9a-f-]{36}$' or split_part(p_name, '/', 3) !~ '^[0-9a-f-]{36}$' then return false; end if;
  v_org := split_part(p_name, '/', 1)::uuid; v_site := split_part(p_name, '/', 2)::uuid; v_attempt := split_part(p_name, '/', 3)::uuid;
  if private.has_org_role(v_org, case when p_write then array['admin','operator']::public.org_role[] else array['admin','operator','reviewer']::public.org_role[] end) then return true; end if;
  return exists (select 1 from public.visit_attempts a join public.drivers d on d.id = a.driver_id where a.id = v_attempt and a.site_id = v_site and a.organization_id = v_org and d.user_id = (select auth.uid()) and d.active);
end;
$$;
revoke all on function private.can_access_evidence_object(text, boolean) from public, anon;
grant execute on function private.can_access_evidence_object(text, boolean) to authenticated;

create policy evidence_objects_read on storage.objects for select to authenticated using (bucket_id = 'site-evidence' and (select private.can_access_evidence_object(name, false)));
create policy evidence_objects_insert on storage.objects for insert to authenticated with check (bucket_id = 'site-evidence' and (select private.can_access_evidence_object(name, true)));

comment on table public.audit_events is 'Append-only operational audit log. Application roles receive SELECT only.';
comment on table public.evidence_files is 'Metadata for objects in the private site-evidence bucket; never store public URLs.';
