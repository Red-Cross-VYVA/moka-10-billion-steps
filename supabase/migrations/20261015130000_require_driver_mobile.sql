-- Require mobile for new profiles and mobile edits without blocking unrelated
-- updates to historical profiles whose mobile has not yet been provided.
begin;

create or replace function private.require_driver_mobile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.mobile := regexp_replace(new.mobile, '^\s+|\s+$', '', 'g');
  if new.mobile is null or new.mobile = '' then
    raise exception 'Mobile number is required.'
      using errcode = '23514', constraint = 'drivers_mobile_required';
  end if;
  return new;
end;
$$;

revoke all on function private.require_driver_mobile() from public, anon, authenticated;
create trigger drivers_require_mobile
before insert or update of mobile on public.drivers
for each row execute function private.require_driver_mobile();

commit;
