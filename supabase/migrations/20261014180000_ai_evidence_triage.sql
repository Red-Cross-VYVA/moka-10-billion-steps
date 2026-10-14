-- AI-assisted evidence triage. This migration only queues and records assessments;
-- it never makes review decisions or changes site/attempt/exception status.

do $$ begin
  create type public.evidence_assessment_status as enum ('queued', 'processing', 'completed', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.evidence_assessment_result as enum ('meets_criteria', 'needs_review', 'likely_issue');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.evidence_assessment_rollout as enum ('shadow', 'active');
exception when duplicate_object then null;
end $$;

alter table public.evidence_files
  add column if not exists evidence_uid uuid,
  add column if not exists variant text,
  add column if not exists capture_timestamp timestamptz,
  add column if not exists capture_time_source text,
  add column if not exists stamp_language text,
  add column if not exists captured_latitude numeric(9,6),
  add column if not exists captured_longitude numeric(9,6);

do $$ begin
  alter table public.evidence_files add constraint evidence_files_variant_check
    check (variant is null or variant in ('original', 'stamped'));
exception when duplicate_object then null;
end $$;

create table if not exists public.evidence_assessment_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  rollout_mode public.evidence_assessment_rollout not null default 'shadow',
  gps_threshold_metres integer not null default 100 check (gps_threshold_metres between 10 and 5000),
  future_tolerance_minutes integer not null default 5 check (future_tolerance_minutes between 0 and 1440),
  capture_upload_warning_minutes integer not null default 30 check (capture_upload_warning_minutes between 1 and 10080),
  min_image_width integer not null default 1280 check (min_image_width between 320 and 12000),
  min_image_height integer not null default 720 check (min_image_height between 320 and 12000),
  max_analysis_edge integer not null default 1600 check (max_analysis_edge between 640 and 2400),
  pass_confidence numeric(4,3) not null default 0.850 check (pass_confidence between 0 and 1),
  issue_confidence numeric(4,3) not null default 0.900 check (issue_confidence between 0 and 1),
  rule_version text not null default '2026-10-01',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evidence_assessments (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  attempt_id uuid not null references public.visit_attempts(id) on delete cascade,
  run_number integer not null check (run_number > 0),
  trigger_source text not null check (trigger_source in ('automatic', 'retry')),
  requested_by uuid references auth.users(id) on delete set null,
  status public.evidence_assessment_status not null default 'queued',
  result public.evidence_assessment_result,
  criteria jsonb not null default '[]'::jsonb check (jsonb_typeof(criteria) = 'array'),
  reasons text[] not null default '{}',
  confidence numeric(4,3) check (confidence between 0 and 1),
  provider text,
  model text,
  rule_version text not null,
  retry_count integer not null default 0 check (retry_count between 0 and 3),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_detail text,
  supersedes_id uuid references public.evidence_assessments(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (attempt_id, run_number),
  check ((status = 'completed' and result is not null and completed_at is not null) or status <> 'completed')
);

create index if not exists evidence_assessments_attempt_run_idx
  on public.evidence_assessments(attempt_id, run_number desc);
create index if not exists evidence_assessments_queue_idx
  on public.evidence_assessments(status, available_at, created_at)
  where status = 'queued';
create unique index if not exists evidence_assessments_one_open_run
  on public.evidence_assessments(attempt_id)
  where status in ('queued', 'processing');

create or replace function private.set_evidence_assessment_settings_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists evidence_assessment_settings_updated_at on public.evidence_assessment_settings;
create trigger evidence_assessment_settings_updated_at
before update on public.evidence_assessment_settings
for each row execute function private.set_evidence_assessment_settings_updated_at();

insert into public.evidence_assessment_settings(organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create or replace function private.create_default_evidence_assessment_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.evidence_assessment_settings(organization_id)
  values (new.id) on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_create_assessment_settings on public.organizations;
create trigger organizations_create_assessment_settings
after insert on public.organizations
for each row execute function private.create_default_evidence_assessment_settings();

create or replace function private.queue_evidence_assessment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_settings public.evidence_assessment_settings%rowtype;
  v_run integer;
begin
  if new.status <> 'submitted' or old.status = 'submitted' then return new; end if;
  select * into v_settings from public.evidence_assessment_settings
  where organization_id = new.organization_id and enabled;
  if not found then return new; end if;

  select coalesce(max(run_number), 0) + 1 into v_run
  from public.evidence_assessments where attempt_id = new.id;
  insert into public.evidence_assessments(
    organization_id, site_id, attempt_id, run_number, trigger_source,
    requested_by, rule_version
  ) values (
    new.organization_id, new.site_id, new.id, v_run, 'automatic',
    (select auth.uid()), v_settings.rule_version
  );
  return new;
end;
$$;

drop trigger if exists attempts_queue_evidence_assessment on public.visit_attempts;
create trigger attempts_queue_evidence_assessment
after update of status on public.visit_attempts
for each row execute function private.queue_evidence_assessment();

create or replace function public.retry_evidence_assessment(p_attempt_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.visit_attempts%rowtype;
  v_settings public.evidence_assessment_settings%rowtype;
  v_previous public.evidence_assessments%rowtype;
  v_id uuid;
  v_run integer;
begin
  select * into v_attempt from public.visit_attempts where id = p_attempt_id;
  if not found or not private.has_org_role(v_attempt.organization_id, array['admin','operator','reviewer']::public.org_role[]) then
    raise exception 'Not authorized';
  end if;
  if v_attempt.status <> 'submitted' then raise exception 'Attempt is not awaiting review'; end if;
  if exists (select 1 from public.evidence_assessments where attempt_id = p_attempt_id and status in ('queued','processing')) then
    raise exception 'An assessment is already queued or processing';
  end if;
  select * into v_settings from public.evidence_assessment_settings
  where organization_id = v_attempt.organization_id and enabled;
  if not found then raise exception 'Evidence assessment is disabled'; end if;
  select * into v_previous from public.evidence_assessments
  where attempt_id = p_attempt_id order by run_number desc limit 1;
  v_run := coalesce(v_previous.run_number, 0) + 1;
  insert into public.evidence_assessments(
    organization_id, site_id, attempt_id, run_number, trigger_source,
    requested_by, rule_version, supersedes_id
  ) values (
    v_attempt.organization_id, v_attempt.site_id, p_attempt_id, v_run, 'retry',
    (select auth.uid()), v_settings.rule_version, v_previous.id
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.claim_evidence_assessment(p_assessment_id uuid default null)
returns setof public.evidence_assessments
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.evidence_assessments
  set status = case when retry_count >= 2 then 'failed'::public.evidence_assessment_status else 'queued'::public.evidence_assessment_status end,
      result = case when retry_count >= 2 then 'needs_review'::public.evidence_assessment_result else null end,
      retry_count = retry_count + 1,
      available_at = now(),
      lease_expires_at = null,
      completed_at = case when retry_count >= 2 then now() else null end,
      error_code = 'worker_lease_expired',
      error_detail = 'Assessment worker stopped before completion; human review remains available.'
  where status = 'processing' and lease_expires_at < now();

  select id into v_id from public.evidence_assessments
  where status = 'queued'
    and available_at <= now()
    and (p_assessment_id is null or id = p_assessment_id)
  order by created_at
  for update skip locked limit 1;
  if v_id is null then return; end if;
  return query
    update public.evidence_assessments
    set status = 'processing', started_at = now(), lease_expires_at = now() + interval '2 minutes',
        error_code = null, error_detail = null
    where id = v_id
    returning *;
end;
$$;

create or replace function private.audit_evidence_assessment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := case when new.trigger_source = 'retry' then 'ai_assessment_retry_queued' else 'ai_assessment_queued' end;
  elsif old.status is distinct from new.status and new.status = 'completed' then
    v_action := 'ai_assessment_completed';
  elsif old.status is distinct from new.status and new.status = 'failed' then
    v_action := 'ai_assessment_failed';
  else
    return new;
  end if;
  insert into public.audit_events(
    organization_id, site_id, entity_type, entity_id, actor_id, action, new_values, detail
  ) values (
    new.organization_id, new.site_id, 'evidence_assessment', new.id,
    coalesce(new.requested_by, (select auth.uid())), v_action,
    jsonb_build_object('status', new.status, 'result', new.result, 'run_number', new.run_number),
    case when new.status = 'completed' then array_to_string(new.reasons, '; ') else new.error_code end
  );
  return new;
end;
$$;

drop trigger if exists evidence_assessments_audit on public.evidence_assessments;
create trigger evidence_assessments_audit
after insert or update of status on public.evidence_assessments
for each row execute function private.audit_evidence_assessment();

alter table public.evidence_assessment_settings enable row level security;
alter table public.evidence_assessments enable row level security;

drop policy if exists assessment_settings_ops_read on public.evidence_assessment_settings;
create policy assessment_settings_ops_read on public.evidence_assessment_settings
for select to authenticated using (
  (select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[]))
);
drop policy if exists assessment_settings_admin_update on public.evidence_assessment_settings;
create policy assessment_settings_admin_update on public.evidence_assessment_settings
for update to authenticated using (
  (select private.has_org_role(organization_id, array['admin']::public.org_role[]))
) with check (
  (select private.has_org_role(organization_id, array['admin']::public.org_role[]))
);
drop policy if exists evidence_assessments_ops_read on public.evidence_assessments;
create policy evidence_assessments_ops_read on public.evidence_assessments
for select to authenticated using (
  (select private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[]))
);

revoke all on public.evidence_assessment_settings, public.evidence_assessments from anon;
revoke insert, update, delete on public.evidence_assessments from authenticated;
grant select on public.evidence_assessment_settings, public.evidence_assessments to authenticated;
grant update on public.evidence_assessment_settings to authenticated;

revoke all on function public.retry_evidence_assessment(uuid) from public, anon;
grant execute on function public.retry_evidence_assessment(uuid) to authenticated;
revoke all on function public.claim_evidence_assessment(uuid) from public, anon, authenticated;
grant execute on function public.claim_evidence_assessment(uuid) to service_role;

comment on table public.evidence_assessments is
  'Append-only AI-assisted triage runs. Results are advisory and never perform review decisions.';
comment on table public.evidence_assessment_settings is
  'Organization-scoped evidence triage thresholds. Defaults to shadow mode.';
