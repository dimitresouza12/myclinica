-- Fluxo "Iniciar atendimento": recepção (paciente chegou / aguardando) e atendimento (em atendimento / atendido).
-- Idempotente: pode rodar mais de uma vez. NÃO altera nem remove nenhum status ou coluna existente.
--
-- Status: appointments.status é texto livre (sem CHECK, confirmado no banco em 2026-11-11), então os dois status
-- novos entram só por valor, sem DDL:
--   'arrived'     = paciente chegou, aguardando atendimento
--   'in_progress' = em atendimento
-- Os existentes seguem iguais: agendado, confirmado, concluido (= atendido), cancelado, faltou, bloqueado.
-- A restrição appointments_no_double_booking só exclui 'cancelado', então os novos status continuam ocupando o horário.
--
-- Cronômetro: o início e o fim ficam gravados aqui; a tela do profissional calcula o tempo a partir de started_at
-- (por isso o cronômetro retoma sozinho se a página recarregar). Nenhuma dessas colunas vai para o portal/link do paciente
-- (o portal lê colunas explícitas de appointments).

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS arrived_at   timestamptz,  -- já existe (20261104_agenda_escala.sql); repetido por segurança
  ADD COLUMN IF NOT EXISTS called_at    timestamptz,  -- paciente chamado na fila (sem mensagem automática)
  ADD COLUMN IF NOT EXISTS started_at   timestamptz,  -- início do atendimento
  ADD COLUMN IF NOT EXISTS finished_at  timestamptz,  -- fim do atendimento
  ADD COLUMN IF NOT EXISTS started_by   uuid,         -- auth.users.id de quem iniciou (opcional, sem FK de propósito)
  ADD COLUMN IF NOT EXISTS finished_by  uuid;         -- auth.users.id de quem finalizou (opcional, sem FK de propósito)

-- Fila do dia: poucas linhas por clínica estão "aguardando" ou "em atendimento"; índice parcial barato.
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_flow
  ON public.appointments (clinic_id, scheduled_at)
  WHERE status IN ('arrived', 'in_progress');

-- RLS: as policies existentes (clinic_isolation e restrict_agenda_by_professional) já cobrem as colunas novas.
-- Não há CHECK de status, então não existe arquivo em pendente-colar-sql-editor para este recurso.
