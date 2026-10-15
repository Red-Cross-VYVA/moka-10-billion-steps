-- Existing demo identities; all driver fixtures and role changes roll back.
begin;
select set_config('test.admin','6f110607-aada-456a-87ca-4ed2bcff2d31',true);
select set_config('test.org','00000000-0000-4000-8000-000000000001',true);
select set_config('test.region',(select id::text from public.regions where organization_id=current_setting('test.org')::uuid and active order by id limit 1),true);
insert into public.organizations(id,slug,name) values('f1570000-1015-4000-8000-000000000001','driver-registration-transaction-test','Driver registration transaction test');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
do $$ declare v_driver public.drivers%rowtype; begin
  insert into public.drivers(organization_id,region_id,driver_code,full_name,mobile,email,active,available)
  values(current_setting('test.org')::uuid,current_setting('test.region')::uuid,'DRV-TRANSACTION-TEST','Driver test fixture','+000 TEST','driver-test@example.invalid',true,true) returning * into v_driver;
  if v_driver.mobile<>'+000 TEST' or v_driver.email<>'driver-test@example.invalid' or v_driver.user_id is not null or not v_driver.active or not v_driver.available then raise exception 'Stored driver fields are incorrect';end if;
  if not exists(select 1 from public.drivers where id=v_driver.id and full_name='Driver test fixture') then raise exception 'New driver cannot be reloaded';end if;
  begin
    insert into public.drivers(organization_id,region_id,driver_code,full_name) values(current_setting('test.org')::uuid,current_setting('test.region')::uuid,'DRV-TRANSACTION-TEST','Duplicate fixture');
    raise exception 'Duplicate code accepted';
  exception when unique_violation then null;end;
  begin
    insert into public.drivers(organization_id,region_id,driver_code,full_name) values('f1570000-1015-4000-8000-000000000001',current_setting('test.region')::uuid,'DRV-FORBIDDEN','Cross-org fixture');
    raise exception 'Cross-org creation accepted';
  exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.organization_members set role='operator' where organization_id=current_setting('test.org')::uuid and user_id=current_setting('test.admin')::uuid;
set local role authenticated;
insert into public.drivers(organization_id,region_id,driver_code,full_name) values(current_setting('test.org')::uuid,current_setting('test.region')::uuid,'DRV-OPERATOR-TEST','Operator fixture');
reset role;
update public.organization_members set role='reviewer' where organization_id=current_setting('test.org')::uuid and user_id=current_setting('test.admin')::uuid;
set local role authenticated;
do $$ begin
  begin
    insert into public.drivers(organization_id,region_id,driver_code,full_name) values(current_setting('test.org')::uuid,current_setting('test.region')::uuid,'DRV-REVIEWER-TEST','Reviewer fixture');
    raise exception 'Reviewer creation accepted';
  exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.organization_members set role='admin',active=false where organization_id=current_setting('test.org')::uuid and user_id=current_setting('test.admin')::uuid;
set local role authenticated;
do $$ begin
  begin
    insert into public.drivers(organization_id,region_id,driver_code,full_name) values(current_setting('test.org')::uuid,current_setting('test.region')::uuid,'DRV-INACTIVE-TEST','Inactive fixture');
    raise exception 'Inactive creation accepted';
  exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"9707c0ea-3c88-4a7a-968e-79f1e0cbfdfa","role":"authenticated"}',true);
do $$ begin
  begin
    insert into public.drivers(organization_id,region_id,driver_code,full_name) values(current_setting('test.org')::uuid,current_setting('test.region')::uuid,'DRV-DRIVER-TEST','Driver fixture');
    raise exception 'Driver creation accepted';
  exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    insert into public.drivers(organization_id,region_id,driver_code,full_name) values(current_setting('test.org')::uuid,current_setting('test.region')::uuid,'DRV-ANON-TEST','Anonymous fixture');
    raise exception 'Anonymous creation accepted';
  exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: admin/operator create, stored contacts and reload, duplicate codes, reviewer/driver/inactive/anonymous and cross-org rejection. All fixtures rolled back.' as driver_registration_verification;
