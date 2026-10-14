-- Run as postgres in a test-capable SQL session. All fixtures and edits roll back.
begin;
select set_config('test.admin','6f110607-aada-456a-87ca-4ed2bcff2d31',true);
select set_config('test.driver','9707c0ea-3c88-4a7a-968e-79f1e0cbfdfa',true);
select set_config('test.org','00000000-0000-4000-8000-000000000001',true);
select set_config('test.site',(select id::text from public.sites where organization_id=current_setting('test.org')::uuid order by id limit 1),true);
insert into public.organizations(id,slug,name) values ('f1500000-1015-4000-8000-000000000001','gis-transaction-test','GIS transaction test');
insert into public.regions(id,organization_id,code,name_en) values ('f1500000-1015-4000-8000-000000000002','f1500000-1015-4000-8000-000000000001','TEST','Test region');
insert into public.cities(id,organization_id,region_id,name_en) values ('f1500000-1015-4000-8000-000000000003','f1500000-1015-4000-8000-000000000001','f1500000-1015-4000-8000-000000000002','Test city');
insert into public.merchant_categories(id,organization_id,code,name_en) values ('f1500000-1015-4000-8000-000000000004','f1500000-1015-4000-8000-000000000001','TEST','Test category');
insert into public.sites(id,organization_id,region_id,city_id,category_id,site_code,merchant_name,latitude,longitude) values ('f1500000-1015-4000-8000-000000000005','f1500000-1015-4000-8000-000000000001','f1500000-1015-4000-8000-000000000002','f1500000-1015-4000-8000-000000000003','f1500000-1015-4000-8000-000000000004','CROSS-ORG','Inaccessible fixture',24,46);
insert into public.sites(organization_id,region_id,city_id,category_id,site_code,merchant_name,latitude,longitude)
select s.organization_id,s.region_id,s.city_id,s.category_id,'GIS-TEST-'||n,'Transactional pagination fixture',24,46
from public.sites s cross join generate_series(1,10000) n where s.id=current_setting('test.site')::uuid;
select set_config('test.expected',(select count(*)::text from public.sites where organization_id=current_setting('test.org')::uuid),true);

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
do $$ declare v_after uuid; v_count integer; v_total integer:=0; v_last uuid; begin
  loop
    select count(*),max(site_id::text)::uuid into v_count,v_last from public.gis_site_summaries(v_after,500);
    v_total:=v_total+v_count; exit when v_count<500;
    if v_after=v_last then raise exception 'Cursor did not advance'; end if; v_after:=v_last;
  end loop;
  if v_total<>current_setting('test.expected')::integer then raise exception 'Pagination lost records: %',v_total; end if;
  if exists(select 1 from public.gis_site_summaries() where site_id='f1500000-1015-4000-8000-000000000005') then raise exception 'Cross-org summary leaked'; end if;
  perform public.gis_update_contact(current_setting('test.site')::uuid,'GIS test contact','+000 TEST','test@example.invalid');
  if (public.gis_site_profile(current_setting('test.site')::uuid)->'contact'->>'name')<>'GIS test contact' then raise exception 'Contact did not persist'; end if;
  if not exists(select 1 from public.audit_events where site_id=current_setting('test.site')::uuid and action='contact_updated' and actor_id=auth.uid() and new_values->>'name'='GIS test contact') then raise exception 'Audit missing'; end if;
  begin perform public.gis_update_contact('f1500000-1015-4000-8000-000000000005','Forbidden',null,null);raise exception 'Cross-org edit accepted';exception when insufficient_privilege then null;end;
  begin perform public.gis_site_profile('f1500000-1015-4000-8000-000000000005');raise exception 'Cross-org profile leaked';exception when insufficient_privilege then null;end;
  begin update public.site_contacts set name='Direct edit';raise exception 'Direct edit accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;

-- Reuse the admin identity only inside this rolled-back transaction to test each role.
update public.organization_members set role='operator' where user_id=current_setting('test.admin')::uuid and organization_id=current_setting('test.org')::uuid;
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.gis_site_summaries()) then raise exception 'Operator cannot view GIS';end if;
  if (public.gis_site_profile(current_setting('test.site')::uuid)->>'can_edit_contact')::boolean then raise exception 'Operator can edit';end if;
  begin perform public.gis_update_contact(current_setting('test.site')::uuid,'Forbidden',null,null);raise exception 'Operator edit accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.organization_members set role='reviewer' where user_id=current_setting('test.admin')::uuid and organization_id=current_setting('test.org')::uuid;
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.gis_site_summaries()) then raise exception 'Reviewer cannot view GIS';end if;
  begin perform public.gis_update_contact(current_setting('test.site')::uuid,'Forbidden',null,null);raise exception 'Reviewer edit accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.organization_members set active=false where user_id=current_setting('test.admin')::uuid and organization_id=current_setting('test.org')::uuid;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.gis_site_summaries()) then raise exception 'Inactive member can view GIS';end if;
  begin perform public.gis_update_contact(current_setting('test.site')::uuid,'Forbidden',null,null);raise exception 'Inactive edit accepted';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.driver'),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.gis_site_summaries()) then raise exception 'Driver can view GIS';end if;
  if exists(select 1 from public.site_contacts) then raise exception 'Driver contact leak';end if;
  if exists(select 1 from public.audit_events where entity_type='site_contact') then raise exception 'Driver contact audit leak';end if;
  begin perform public.gis_site_profile(current_setting('test.site')::uuid);raise exception 'Driver profile access accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.gis_site_summaries();raise exception 'Anonymous GIS accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: 10,000 fixture pagination, contact save/audit, admin/operator/reviewer/driver/inactive/anonymous and cross-org access. All test changes rolled back.' as gis_verification;

