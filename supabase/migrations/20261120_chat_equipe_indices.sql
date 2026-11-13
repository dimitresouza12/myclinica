-- Chat da equipe: índices de FK apontados pelo advisor de performance (2026-11-12).
-- Aditiva e idempotente. Sem efeito funcional; só evita varredura ao apagar login/mensagem
-- (ON DELETE SET NULL em sender_clinic_user_id e created_by) e ao validar as FKs compostas.
-- Desfazer: DROP INDEX IF EXISTS public.<nome>;

CREATE INDEX IF NOT EXISTS idx_team_messages_sender   ON public.team_messages (sender_clinic_user_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_reply    ON public.team_messages (reply_to_id, channel_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_messages_chan_clinic ON public.team_messages (channel_id, clinic_id);
CREATE INDEX IF NOT EXISTS idx_team_channels_created_by ON public.team_channels (created_by) WHERE created_by IS NOT NULL;
