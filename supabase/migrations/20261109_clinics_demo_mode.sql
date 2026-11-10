-- ═══════════════════════════════════════════════════════════════════════════
-- CLÍNICA DEMO — flag demo_mode em public.clinics
-- Criado em: 2026-11-09
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contexto: a conta de demonstração (slug video123) passa a exibir as 9 áreas de atuação
-- (estética, odonto, medicina, vet, fisio, psico, nutri, fono, TO). O frontend e as rotas que
-- enviam WhatsApp precisam saber que a clínica é demo: o flag demo_mode é esse sinal.
--
-- Aditiva e reversível:
--   - 1 coluna nova, NOT NULL com default false: nenhuma clínica existente muda de comportamento.
--   - 1 função + 1 gatilho que impedem um admin de clínica de ligar/desligar demo_mode pela
--     API pública. A política de UPDATE de clinics deixa o admin alterar qualquer coluna;
--     sem o gatilho um cliente poderia se marcar como demo. Só superadmin, service role
--     e SQL direto (auth.uid() nulo) conseguem mudar o flag.
--
-- Esta migração NÃO liga demo_mode em nenhuma clínica. Quem liga é
-- supabase/seeds/demo-video123/00-config-final.sql, restrito ao id da clínica demo.
--
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clinics
  add column if not exists demo_mode boolean not null default false;

comment on column public.clinics.demo_mode is
  'Clínica de demonstração (dados fictícios, todas as áreas liberadas). Só superadmin/service role altera. O código não deve enviar WhatsApp real quando true.';

create or replace function public.clinics_guard_demo_mode()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- auth.uid() nulo = service role, SQL editor ou migração: permitido.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.demo_mode is true and not public.is_superadmin() then
      raise exception 'demo_mode só pode ser definido por superadmin' using errcode = '42501';
    end if;
  elsif new.demo_mode is distinct from old.demo_mode and not public.is_superadmin() then
    raise exception 'demo_mode só pode ser alterado por superadmin' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clinics_guard_demo_mode on public.clinics;
create trigger trg_clinics_guard_demo_mode
  before insert or update of demo_mode on public.clinics
  for each row execute function public.clinics_guard_demo_mode();

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação (rodar depois, só leitura):
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'clinics' and column_name = 'demo_mode';
--   select tgname from pg_trigger where tgrelid = 'public.clinics'::regclass and tgname = 'trg_clinics_guard_demo_mode';
--   select count(*) filter (where demo_mode) as demos, count(*) as total from public.clinics;   -- demos = 0 até rodar o 00-config-final
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (descomente e rode inteiro; só depois de desligar o uso de demo_mode no código)
-- ═══════════════════════════════════════════════════════════════════════════
-- drop trigger if exists trg_clinics_guard_demo_mode on public.clinics;
-- drop function if exists public.clinics_guard_demo_mode();
-- alter table public.clinics drop column if exists demo_mode;
