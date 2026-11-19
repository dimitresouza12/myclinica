-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCEIRO — list_clinic_receivers_all(): inclui usuários desativados
-- Criado em: 2026-11-18
-- ═══════════════════════════════════════════════════════════════════════════
--
-- list_clinic_receivers() (20261141) devolve só usuários ativos. No histórico financeiro, quem recebeu
-- e foi desativado depois apareceria como "Outro usuário". Esta função devolve TAMBÉM os inativos, com a
-- coluna is_active, para resolver o nome no histórico e deixar o seletor de novas entradas filtrar ativos.
--
-- Somente leitura. Só id, nome, papel e is_active (sem email, cpf, avatar nem username). Mesma clínica de
-- quem chama; superadmin da plataforma não aparece. Quem pode chamar: admin, recepção, ou quem tem
-- visualização do módulo financeiro. Ativos primeiro, depois por nome. anon não executa.
--
-- Aditiva: a list_clinic_receivers() original fica intacta. Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.list_clinic_receivers_all()
RETURNS TABLE (id uuid, display_name text, role text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cu.id, cu.display_name, cu.role, COALESCE(cu.is_active, false)
  FROM public.clinic_users cu
  WHERE cu.clinic_id = public.get_my_clinic_id()
    AND cu.is_superadmin IS NOT TRUE
    AND (public.get_my_role() IN ('admin', 'recepcao') OR public.has_module_perm('financeiro', false))
  ORDER BY COALESCE(cu.is_active, false) DESC, cu.display_name;
$$;

REVOKE ALL ON FUNCTION public.list_clinic_receivers_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_clinic_receivers_all() TO authenticated;
