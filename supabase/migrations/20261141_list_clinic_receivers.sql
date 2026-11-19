-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCEIRO — list_clinic_receivers(): usuários que podem ser "quem recebeu"
-- Criado em: 2026-11-18
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A RLS de clinic_users só deixa o admin listar a clínica; a recepção enxerga apenas a própria linha.
-- Para o seletor de "recebido por" no financeiro, esta função devolve SÓ id, nome e papel dos usuários
-- ativos da clínica de quem chama (sem email, cpf, avatar nem username). Somente leitura.
--
-- Quem pode chamar: admin, recepção, ou quem tem acesso de visualização ao módulo financeiro.
-- Superadmins da plataforma não aparecem na lista. anon não executa.
--
-- Idempotente (CREATE OR REPLACE). Só cria; não altera nem apaga dado existente.

CREATE OR REPLACE FUNCTION public.list_clinic_receivers()
RETURNS TABLE (id uuid, display_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cu.id, cu.display_name, cu.role
  FROM public.clinic_users cu
  WHERE cu.clinic_id = public.get_my_clinic_id()
    AND cu.is_active = true
    AND cu.is_superadmin IS NOT TRUE
    AND (public.get_my_role() IN ('admin', 'recepcao') OR public.has_module_perm('financeiro', false))
  ORDER BY cu.display_name;
$$;

REVOKE ALL ON FUNCTION public.list_clinic_receivers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_clinic_receivers() TO authenticated;
