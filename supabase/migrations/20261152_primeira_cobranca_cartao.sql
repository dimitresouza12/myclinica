-- ═══════════════════════════════════════════════════════════════════════════
-- PRIMEIRA COBRANÇA COMBINADA (cartão cadastrado no fim do teste)
-- Criado em: 2026-11-23
-- Projeto Supabase: siohvtgbomvcprbzfamr | NÃO APLICADA: revisar e aplicar pelo mc-db.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA
--   O cliente cadastra o cartão no fim do teste e só é cobrado na data combinada
--   (ex.: 2027-01-15). Até lá a clínica não pagou nada e o app não pode bloquear.
--   Além disso, a assinatura no Asaas pode nascer com 50% do valor na primeira
--   mensalidade; o webhook precisa saber o valor cheio para trocá-la depois do
--   primeiro pagamento confirmado.
--
-- MUDANÇA (migração única, duas partes)
--   PARTE 1: colunas novas, aditivas e nulas por padrão.
--   public.clinics.billing_first_due        date
--     Data da primeira cobrança combinada. Enquanto hoje <= essa data (+ tolerância
--     aplicada no app) e a clínica não pagou, o app não bloqueia o acesso.
--   public.clinics.billing_promo_full_value numeric(10,2)
--     Quando preenchida, a assinatura no Asaas nasceu com 50% na primeira
--     mensalidade e este é o valor cheio para o qual o webhook deve trocá-la após o
--     primeiro pagamento confirmado. NULL = sem pendência.
--
--   PARTE 2: guard de colunas.
--   Recria public.clinics_guard_billing_columns() idêntica à definição viva (lida
--   via pg_get_functiondef em 2026-11-23, relida antes de fechar o arquivo),
--   acrescentando 'billing_first_due' e 'billing_promo_full_value' ao array
--   v_protected. Motivo: o guard usa lista fixa de nomes (denylist) e, sem isso,
--   um admin de clínica logado poderia gravar billing_first_due no futuro (acesso
--   sem pagar) ou alterar/apagar billing_promo_full_value pelo cliente. Com a
--   PARTE 2 as duas colunas só mudam via service_role, postgres, RPC SECURITY
--   DEFINER ou superadmin. Assinatura, RETURNS, LANGUAGE e SET search_path
--   inalterados; o trigger trg_clinics_guard_billing_columns continua apontando
--   para a mesma função (CREATE OR REPLACE não o recria).
--
-- RLS / GRANTS (verificado em 2026-11-23, SOMENTE leitura)
--   Nenhuma mudança em RLS e nenhum GRANT necessário.
--   - clinics tem RLS ligada; SELECT para a própria clínica (own_clinic e
--     "Usuários veem apenas sua própria clínica"), UPDATE por admin da clínica e
--     por superadmin. Nenhuma policy referencia coluna específica.
--   - anon/authenticated têm privilégios no nível da TABELA (não por coluna), então
--     colunas novas já herdam SELECT/UPDATE; service_role idem.
--   - As colunas billing_* existentes não têm grant por coluna além do que já vem
--     do nível da tabela.
--
-- Efeito para o código: qualquer escrita dessas duas colunas feita com JWT de
-- usuário passa a falhar com 42501 (clinic_protected_columns). Cadastro de cartão
-- e webhook do Asaas devem escrever com service role.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS; COMMENT ON COLUMN e CREATE OR REPLACE
-- podem rodar de novo.
--
-- Como reverter (nesta ordem):
--   1) Recriar public.clinics_guard_billing_columns() com o mesmo corpo da PARTE 2,
--      REMOVENDO 'billing_first_due' e 'billing_promo_full_value' do array
--      v_protected (volta à definição anterior). Fazer isso antes do DROP não é
--      obrigatório (to_jsonb simplesmente não traz a coluna), mas deixa o guard
--      limpo.
--   2) ALTER TABLE public.clinics DROP COLUMN IF EXISTS billing_first_due;
--      ALTER TABLE public.clinics DROP COLUMN IF EXISTS billing_promo_full_value;
--      (DESTRUTIVO se já houver valores gravados: pedir confirmação antes.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1: colunas
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS billing_first_due date,
  ADD COLUMN IF NOT EXISTS billing_promo_full_value numeric(10,2);

COMMENT ON COLUMN public.clinics.billing_first_due IS
  'Data da primeira cobrança combinada (ex.: 2027-01-15). Enquanto hoje <= esta data (mais a tolerância do app) e a clínica não pagou (billing_paid = false), o app não bloqueia o acesso. NULL = sem primeira cobrança combinada. Escrita só pelo service role.';

COMMENT ON COLUMN public.clinics.billing_promo_full_value IS
  'Valor cheio da mensalidade quando a assinatura no Asaas foi criada com 50% na primeira mensalidade. O webhook troca a assinatura para este valor depois do primeiro pagamento confirmado e então zera o campo. NULL = sem pendência. Escrita só pelo service role.';

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2: proteger as colunas novas no guard (idêntica à função viva, mais os
-- dois nomes novos no array v_protected)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.clinics_guard_billing_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_protected text[] := ARRAY[
    'id', 'slug', 'created_at',
    'plan', 'max_patients', 'max_users', 'is_active', 'status', 'trial_ends_at',
    'custom_monthly_price', 'demo_mode',
    'billing_phone', 'billing_due_day', 'billing_paid', 'billing_overdue_since', 'next_billing_date',
    'billing_first_due', 'billing_promo_full_value',
    'stripe_customer_id', 'stripe_subscription_id', 'stripe_price_id',
    'asaas_customer_id', 'asaas_subscription_id',
    'ia_escriba_consent', 'ia_escriba_consent_at', 'ia_escriba_consent_by'
  ];
  v_old     jsonb;
  v_new     jsonb;
  v_col     text;
  v_changed text[] := '{}';
BEGIN
  -- Só sessões vindas da API (JWT de usuário). service_role, postgres, SQL Editor e
  -- RPCs SECURITY DEFINER (current_user = dono da função) passam direto.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOREACH v_col IN ARRAY v_protected LOOP
    IF (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
      v_changed := v_changed || v_col;
    END IF;
  END LOOP;

  IF array_length(v_changed, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'clinic_protected_columns: %', array_to_string(v_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;
