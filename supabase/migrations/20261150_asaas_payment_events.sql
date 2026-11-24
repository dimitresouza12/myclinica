-- ═══════════════════════════════════════════════════════════════════════════
-- ASAAS — eventos de pagamento processados (idempotência do webhook)
-- Projeto Supabase: siohvtgbomvcprbzfamr | NÃO APLICADA: revisar e aplicar pelo mc-db.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA
--   O Asaas reenvia o mesmo evento (timeout, nova tentativa) e entrega fora de ordem. O webhook precisa
--   processar cada (pagamento, evento) uma vez e saber qual foi o último estado de cada pagamento, porque
--   a clínica pode ter vários pagamentos (parcelas do cartão, assinatura mensal).
--
-- MUDANÇA (aditiva)
--   Tabela public.asaas_payment_events, uma linha por (payment_id, event). UNIQUE serve de trava: o webhook
--   insere primeiro e trata 23505 como "já processado". RLS ligada e SEM policies: só service role.

CREATE TABLE IF NOT EXISTS public.asaas_payment_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       text NOT NULL,
  event            text NOT NULL,
  clinic_id        uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  subscription_id  text,
  installment_id   text,
  value            numeric(10,2),
  due_date         date,
  received_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asaas_payment_events_unique UNIQUE (payment_id, event)
);

CREATE INDEX IF NOT EXISTS idx_asaas_payment_events_clinic
  ON public.asaas_payment_events (clinic_id, received_at DESC);

ALTER TABLE public.asaas_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asaas_payment_events FROM anon, authenticated;

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.asaas_payment_events;
