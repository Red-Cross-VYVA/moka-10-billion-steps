-- Operations GIS: lightweight pages, private profiles and audited primary contacts.
begin;

create table public.site_contacts (
  site_id uuid primary key references public.sites(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  phone text,
  email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (char_length(name) <= 200),
  check (char_length(phone) <= 60),
  check (char_length(email) <= 254)
);
alter table public.site_contacts enable row level security;
revoke all on public.site_contacts from public, anon, authenticated;
grant select on public.site_contacts to authenticated;
create policy contacts_staff_read on public.site_contacts for select to authenticated
using (private.has_org_role(organization_id, array['admin','operator','reviewer']::public.org_role[]));

create index if not exists gis_evidence_site_idx on public.evidence_files(site_id);
create index if not exists gis_attempts_site_idx on public.visit_attempts(site_id, created_at desc);
create index if not exists gis_exceptions_site_idx on public.exceptions(site_id);

create function public.gis_site_summaries(p_after uuid default null, p_limit integer default 500)
returns table (
  site_id uuid, site_code text, merchant text, region text, city text, category text,
  status text, address text, latitude numeric, longitude numeric, updated_at timestamptz,
  driver_id uuid, driver_name text, driver_code text,
  photo_count bigint, visit_count bigint, exception_count bigint,
  latest_submission timestamptz, gps_deviation numeric
)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.site_code, s.merchant_name, r.name_en, c.name_en, mc.name_en,
    s.status::text, s.address, s.latitude, s.longitude, s.updated_at,
    d.id, d.full_name, d.driver_code,
    (select count(distinct case
      when e.object_path ~ '/(original|stamped)\.[^/]+$'
      then regexp_replace(e.object_path, '/(original|stamped)\.[^/]+$', '')
      else e.id::text end) from public.evidence_files e where e.site_id = s.id),
    (select count(*) from public.visit_attempts a where a.site_id = s.id),
    (select count(*) from public.exceptions x where x.site_id = s.id and x.status::text in ('open','investigating','awaiting_revisit')),
    (select max(a.submitted_at) from public.visit_attempts a where a.site_id = s.id),
    (select a.gps_proximity_metres from public.visit_attempts a where a.site_id = s.id
      order by coalesce(a.submitted_at,a.started_at,a.created_at) desc, a.id desc limit 1)
  from public.sites s
  join public.regions r on r.id = s.region_id
  join public.cities c on c.id = s.city_id
  join public.merchant_categories mc on mc.id = s.category_id
  left join public.drivers d on d.id = s.assigned_driver_id
  where private.has_org_role(s.organization_id, array['admin','operator','reviewer']::public.org_role[])
    and (p_after is null or s.id > p_after)
  order by s.id limit least(greatest(coalesce(p_limit,500),1),500);
$$;

create function public.gis_site_profile(p_site_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_site public.sites%rowtype;
begin
  select * into v_site from public.sites where id = p_site_id;
  if not found or not private.has_org_role(v_site.organization_id, array['admin','operator','reviewer']::public.org_role[]) then
    raise exception 'Site unavailable or access denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'address',v_site.address,
    'contact',(select to_jsonb(c) - 'organization_id' from public.site_contacts c where c.site_id = p_site_id),
    'can_edit_contact',private.has_org_role(v_site.organization_id,array['admin']::public.org_role[]),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'driver_name',d.full_name,'assigned_at',a.assigned_at,'ended_at',a.ended_at,'reason',a.reason) order by a.assigned_at desc) from public.site_assignments a join public.drivers d on d.id=a.driver_id where a.site_id=p_site_id),'[]'::jsonb),
    'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.visit_attempts a where a.site_id = p_site_id),'[]'::jsonb),
    'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.evidence_files e where e.site_id = p_site_id),'[]'::jsonb),
    'decisions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from public.review_decisions d join public.visit_attempts a on a.id = d.attempt_id where a.site_id = p_site_id),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.audit_events a where a.site_id = p_site_id),'[]'::jsonb),
    'exceptions',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.exceptions x where x.site_id = p_site_id),'[]'::jsonb)
  );
end;
$$;

-- Contacts in audit history have the same staff-only visibility as contacts.
alter policy audit_read on public.audit_events using (
  private.has_org_role(organization_id,array['admin','operator','reviewer']::public.org_role[])
  or (entity_type <> 'site_contact' and exists (
    select 1 from public.sites s where s.id = site_id and s.assigned_driver_id is not null
      and private.is_driver(s.assigned_driver_id)
  ))
);

create function public.gis_update_contact(p_site_id uuid, p_name text default null, p_phone text default null, p_email text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_site public.sites%rowtype; v_old jsonb; v_new public.site_contacts%rowtype;
begin
  select * into v_site from public.sites where id = p_site_id for update;
  if not found or not private.has_org_role(v_site.organization_id,array['admin']::public.org_role[]) then
    raise exception 'Only an active site administrator can edit contacts' using errcode = '42501';
  end if;
  p_name := nullif(btrim(p_name),''); p_phone := nullif(btrim(p_phone),''); p_email := nullif(btrim(p_email),'');
  if char_length(p_name) > 200 or char_length(p_phone) > 60 or char_length(p_email) > 254
    or (p_email is not null and p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Invalid contact details' using errcode = '22023';
  end if;
  select to_jsonb(c) into v_old from public.site_contacts c where c.site_id = p_site_id;
  insert into public.site_contacts(site_id,organization_id,name,phone,email,updated_by)
  values(p_site_id,v_site.organization_id,p_name,p_phone,p_email,auth.uid())
  on conflict(site_id) do update set name=excluded.name,phone=excluded.phone,email=excluded.email,updated_at=now(),updated_by=auth.uid()
  returning * into v_new;
  insert into public.audit_events(organization_id,site_id,entity_type,entity_id,actor_id,action,old_values,new_values,detail)
  values(v_site.organization_id,p_site_id,'site_contact',p_site_id,auth.uid(),'contact_updated',v_old,to_jsonb(v_new),'Primary site contact updated from GIS');
  return to_jsonb(v_new) - 'organization_id';
end;
$$;

revoke all on function public.gis_site_summaries(uuid,integer), public.gis_site_profile(uuid), public.gis_update_contact(uuid,text,text,text) from public, anon;
grant execute on function public.gis_site_summaries(uuid,integer), public.gis_site_profile(uuid), public.gis_update_contact(uuid,text,text,text) to authenticated;
commit;
