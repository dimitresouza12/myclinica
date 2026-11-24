-- ═══════════════════════════════════════════════════════════════════════════
-- PLANO "EQUIPE" — limite de 6 profissionais
-- Criado em: 2026-11-23
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O que faz:
--   Recria public.enforce_clinic_professional_limit() idêntica à definição viva
--   (lida em 2026-11-23), acrescentando apenas `when 'equipe' then 6`.
--   'ilimitado', 'completo_plus' e 'plus' continuam sem limite (null);
--   clinics.max_users, quando preenchido, continua sobrescrevendo o default.
--   Preserva SECURITY DEFINER e SET search_path TO 'public'.
--
-- Verificações feitas por leitura no banco (siohvtgbomvcprbzfamr):
--   * clinics.plan NÃO tem CHECK constraint (as únicas CHECK de clinics são
--     clinics_clinic_type_check e clinics_status_check). Nada a ajustar para
--     aceitar 'equipe'.
--   * enforce_clinic_user_limit() NÃO tem trigger ativo: o único trigger que
--     chama uma função de limite é trg_enforce_clinic_professional_limit
--     (BEFORE INSERT ON professionals). enforce_clinic_user_limit é função
--     órfã, portanto NÃO é alterada aqui (e não impõe limite nenhum hoje).
--   * O limite do plano Equipe vale só para a tabela professionals (INSERT).
--
-- Atenção (fora do escopo deste arquivo): a whitelist de plano do
-- register_clinic_and_admin(9 args) não inclui 'equipe' e cai em 'essencial'.
-- Quem criar clínica já no plano Equipe precisa de UPDATE em clinics.plan
-- depois, ou de uma migração separada ampliando a whitelist.
--
-- Idempotente: CREATE OR REPLACE.
--
-- Como reverter: rodar o mesmo CREATE OR REPLACE sem a linha `when 'equipe'`
-- (cai no `else 1`; clínicas com plan='equipe' passariam a ter limite 1).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_clinic_professional_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan    text;
  v_max     int;
  v_default int;
  v_current int;
begin
  select plan, max_users into v_plan, v_max from clinics where id = new.clinic_id;

  v_default := case v_plan
    when 'essencial'     then 1
    when 'basico'        then 1
    when 'avancado'      then 3
    when 'completo'      then 3
    when 'equipe'        then 6
    when 'ilimitado'     then null
    when 'completo_plus' then null
    when 'plus'          then null
    else 1
  end;

  if coalesce(v_max, v_default) is null then
    return new;
  end if;

  select count(*) into v_current from professionals where clinic_id = new.clinic_id;

  if v_current >= coalesce(v_max, v_default) then
    raise exception 'professional_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;
