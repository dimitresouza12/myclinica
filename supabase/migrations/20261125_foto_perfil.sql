-- ═══════════════════════════════════════════════════════════════════════════
-- FOTO DE PERFIL DE QUALQUER LOGIN (admin, profissional, recepção)
-- ═══════════════════════════════════════════════════════════════════════════
-- Guarda a foto como data URL pequena (já redimensionada no navegador) direto em clinic_users:
--   clinic_users.avatar_data  text  'data:image/webp;base64,...' ou NULL (sem foto)
-- Limite: 40.000 caracteres (check na coluna e de novo na RPC).
--
-- Quem grava: só a RPC set_my_avatar (SECURITY DEFINER), que mexe SÓ nas linhas do auth.uid()
-- (clinic_users.user_id = auth.uid()). Passar NULL remove a foto.
--
-- Update direto de outro login: já é impossível. clinic_users tem RLS ligada e a única policy de
-- UPDATE é superadmin_update_clinic_user (+ "Superadmins can manage all clinic users", ALL).
-- Admin de clínica e usuário comum NÃO têm policy de UPDATE, então o UPDATE deles afeta 0 linhas
-- (o GRANT de tabela para authenticated não vale sem policy). Nada a tratar aqui.
--
-- Chat: team_members_directory() passa a devolver também avatar_data (é a única RPC de listagem
-- de equipe do chat; as de grupo 20261124 não listam membros). Muda o tipo de retorno, então
-- DROP + CREATE + grants de novo, tudo na mesma transação.
--
-- Aditiva e idempotente. Desfazer: bloco ROLLBACK no fim.
-- Impacto no app (mc-backend/mc-frontend):
--   public.set_my_avatar(p_avatar text) RETURNS void
--   public.team_members_directory() RETURNS TABLE (clinic_user_id uuid, display_name text,
--     role text, areas text[], is_me boolean, avatar_data text)
--   Erros da RPC: 'invalid_avatar' (22023), 'not_authenticated' (28000).
--   Para a foto do próprio login fora do chat, ler clinic_users.avatar_data pela policy own_profile.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Coluna e check de tamanho/formato ────────────────────────────────────
ALTER TABLE public.clinic_users
  ADD COLUMN IF NOT EXISTS avatar_data text;

COMMENT ON COLUMN public.clinic_users.avatar_data IS
  'Foto de perfil como data URL (data:image/webp;base64,...), até 40000 caracteres. NULL = sem foto. Gravada só por set_my_avatar().';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clinic_users'::regclass
      AND conname  = 'clinic_users_avatar_data_check'
  ) THEN
    ALTER TABLE public.clinic_users
      ADD CONSTRAINT clinic_users_avatar_data_check
      CHECK (avatar_data IS NULL
             OR (avatar_data LIKE 'data:image/%;base64,%' AND length(avatar_data) <= 40000));
  END IF;
END $$;

-- ─── 2. RPC: trocar/remover a PRÓPRIA foto ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_my_avatar(p_avatar text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- NULL remove a foto; qualquer outra coisa tem que ser data URL de imagem base64 e caber no limite
  IF p_avatar IS NOT NULL AND NOT (
       p_avatar LIKE 'data:image/%;base64,%' AND length(p_avatar) <= 40000
     ) THEN
    RAISE EXCEPTION 'invalid_avatar' USING ERRCODE = '22023';
  END IF;

  -- só as linhas do próprio auth user
  UPDATE public.clinic_users
     SET avatar_data = p_avatar
   WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_my_avatar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_avatar(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated, service_role;

-- ─── 3. Diretório da equipe (chat) devolve avatar_data ───────────────────────
-- Tipo de retorno muda (coluna nova no fim): precisa de DROP antes. Nenhum objeto depende dela.
DROP FUNCTION IF EXISTS public.team_members_directory();

CREATE FUNCTION public.team_members_directory()
 RETURNS TABLE (clinic_user_id uuid, display_name text, role text, areas text[], is_me boolean, avatar_data text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT cu.id, cu.display_name, cu.role, public.team_user_areas(cu.id),
         (cu.id = public.team_my_member_id()), cu.avatar_data
  FROM public.clinic_users cu
  WHERE cu.clinic_id = public.get_my_clinic_id()
    AND cu.is_active = true
    AND public.team_my_member_id() IS NOT NULL
  ORDER BY cu.display_name;
$function$;

REVOKE ALL ON FUNCTION public.team_members_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_members_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.team_members_directory() TO authenticated, service_role;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar à mão; DESTRUTIVO: apaga as fotos já gravadas)
-- ═══════════════════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS public.team_members_directory();
--   CREATE FUNCTION public.team_members_directory()
--    RETURNS TABLE (clinic_user_id uuid, display_name text, role text, areas text[], is_me boolean)
--    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
--   AS $function$
--     SELECT cu.id, cu.display_name, cu.role, public.team_user_areas(cu.id), (cu.id = public.team_my_member_id())
--     FROM public.clinic_users cu
--     WHERE cu.clinic_id = public.get_my_clinic_id() AND cu.is_active = true
--       AND public.team_my_member_id() IS NOT NULL
--     ORDER BY cu.display_name;
--   $function$;
--   REVOKE ALL ON FUNCTION public.team_members_directory() FROM PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.team_members_directory() TO authenticated, service_role;
--   DROP FUNCTION IF EXISTS public.set_my_avatar(text);
--   ALTER TABLE public.clinic_users DROP CONSTRAINT IF EXISTS clinic_users_avatar_data_check;
--   ALTER TABLE public.clinic_users DROP COLUMN IF EXISTS avatar_data;
