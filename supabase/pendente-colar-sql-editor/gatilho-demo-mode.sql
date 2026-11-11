-- Protege demo_mode: so superadmin/service role/SQL direto altera. Opcional para a demo funcionar, mas recomendado.
create or replace function public.clinics_guard_demo_mode()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.demo_mode is true and not public.is_superadmin() then
      raise exception 'demo_mode só pode ser definido por superadmin' using errcode = '42501';
    end if;
  elsif new.demo_mode is distinct from old.demo_mode and not public.is_superadmin() then
    raise exception 'demo_mode só pode ser alterado por superadmin' using errcode = '42501';
  end if;
  return new;
end; $$;
drop trigger if exists trg_clinics_guard_demo_mode on public.clinics;
create trigger trg_clinics_guard_demo_mode before insert or update of demo_mode on public.clinics
  for each row execute function public.clinics_guard_demo_mode();
