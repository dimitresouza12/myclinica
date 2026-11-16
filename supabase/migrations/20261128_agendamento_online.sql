-- ═══════════════════════════════════════════════════════════════════════════
-- AGENDAMENTO ONLINE PÚBLICO — link /agendar/<slug>, 24 horas, por clínica
-- Criado em: 2026-11-28
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O paciente abre o link da clínica, escolhe profissional (e serviço), vê os horários livres reais, informa
-- nome e WhatsApp, aceita a LGPD e confirma. Sem login.
--
-- ARQUITETURA DE ACESSO (importante):
--   * Nenhuma tabela é aberta para anon. O navegador do paciente NUNCA fala com o banco: ele fala com as
--     rotas /api/agendar/* do Next, que chamam as 3 funções abaixo com a chave de serviço.
--   * As funções são SECURITY DEFINER, com search_path fixo, e o EXECUTE é revogado de PUBLIC, anon e
--     authenticated. Só service_role executa. Quem tem a chave anon (que é pública) não consegue chamá-las.
--   * Nenhuma função devolve dado de paciente: o contexto devolve só nome/logo/endereço/telefone da
--     clínica, profissionais e serviços liberados; a disponibilidade devolve só intervalos ocupados em
--     milissegundos (sem nome, sem motivo, sem tipo de bloqueio).
--
-- DUPLA RESERVA:
--   * O banco já tem appointments_no_double_booking (EXCLUDE gist por professional_id + intervalo, fora os
--     cancelados). Ela é a trava atômica; a função só a respeita e converte a violação (23P01) em resposta.
--   * Bloqueio da clínica toda (status 'bloqueado' sem profissional) NÃO é coberto por essa restrição:
--     a função confere explicitamente, sob pg_advisory_xact_lock do profissional.
--
-- Aditiva e idempotente: 4 tabelas novas, 1 coluna nova com padrão seguro em appointments, funções e
-- políticas. Nada existente é alterado. Pode ser aplicada mais de uma vez.
-- Plano de aplicação: aplicar ESTE arquivo inteiro (uma transação) e só depois publicar o código do app.

-- ─── Configuração por clínica (uma linha por clínica; a linha só existe depois de salvar) ───
CREATE TABLE IF NOT EXISTS public.clinic_online_booking (
  clinic_id        uuid        PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  enabled          boolean     NOT NULL DEFAULT false,
  -- parte do link: /agendar/<slug>. 3 a 40 caracteres, minúsculas, números e hífen (não começa nem termina em hífen)
  slug             text,
  -- 'pendente' = a clínica confirma depois (status agendado); 'confirmado' = já nasce confirmado
  confirm_mode     text        NOT NULL DEFAULT 'pendente' CHECK (confirm_mode IN ('pendente', 'confirmado')),
  -- antecedência mínima, em horas, entre agora e o horário escolhido
  min_notice_hours integer     NOT NULL DEFAULT 4  CHECK (min_notice_hours BETWEEN 0 AND 720),
  -- janela máxima: até quantos dias à frente o paciente pode marcar
  max_days_ahead   integer     NOT NULL DEFAULT 30 CHECK (max_days_ahead BETWEEN 1 AND 180),
  -- fuso em que "08:00" do paciente vira instante. Só zonas do Brasil.
  timezone         text        NOT NULL DEFAULT 'America/Sao_Paulo' CHECK (timezone IN (
    'America/Sao_Paulo', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Belem',
    'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho',
    'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_online_booking_slug_format CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  CONSTRAINT clinic_online_booking_enabled_needs_slug CHECK (NOT enabled OR slug IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_online_booking_slug_uniq ON public.clinic_online_booking (slug) WHERE slug IS NOT NULL;

-- ─── Quais profissionais aparecem (lista explícita: sem linha, não aparece) e quanto dura o atendimento ───
CREATE TABLE IF NOT EXISTS public.online_booking_professionals (
  professional_id  uuid        PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
  clinic_id        uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  -- duração que o link reserva. A tela de configuração pré-preenche com a duração padrão do profissional/área.
  duration_minutes integer     NOT NULL CHECK (duration_minutes BETWEEN 10 AND 240),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_online_booking_professionals_clinic ON public.online_booking_professionals (clinic_id);

-- ─── Quais serviços aparecem. Sem nenhuma linha, o paciente não escolhe serviço (vira "Consulta") ───
CREATE TABLE IF NOT EXISTS public.online_booking_procedures (
  procedure_id uuid        PRIMARY KEY REFERENCES public.procedures(id) ON DELETE CASCADE,
  clinic_id    uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_online_booking_procedures_clinic ON public.online_booking_procedures (clinic_id);

-- ─── Registro de cada reserva feita pelo link: consentimento LGPD e base dos limites anti-abuso ───
-- Guarda só o hash do IP (HMAC feito no servidor, não reversível) e a chave do telefone (DDD + 8 últimos dígitos).
CREATE TABLE IF NOT EXISTS public.online_booking_requests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id     uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  phone_key      text        NOT NULL,
  ip_hash        text        NOT NULL,
  consent_text   text        NOT NULL,
  consent_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_online_booking_requests_phone ON public.online_booking_requests (clinic_id, phone_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_booking_requests_ip    ON public.online_booking_requests (clinic_id, ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_booking_requests_time  ON public.online_booking_requests (clinic_id, created_at DESC);

-- ─── Selo "online" na agenda ───
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS booked_online boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.appointments.booked_online IS 'true = marcado pelo paciente no link público /agendar/<slug>.';

-- ─── Profissional e serviço têm de ser da mesma clínica da linha; profissional ainda precisa ter a escala ligada ───
CREATE OR REPLACE FUNCTION public.online_booking_same_clinic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic uuid;
  v_sched boolean;
BEGIN
  IF TG_TABLE_NAME = 'online_booking_professionals' THEN
    SELECT clinic_id, schedule_enabled INTO v_clinic, v_sched FROM public.professionals WHERE id = NEW.professional_id;
    -- sem escala ligada o público veria a grade inteira (almoço, folga): só entra no link quem tem escala
    IF v_clinic IS NOT DISTINCT FROM NEW.clinic_id AND NOT COALESCE(v_sched, false) THEN
      RAISE EXCEPTION 'online_booking: profissional sem escala ligada' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT clinic_id INTO v_clinic FROM public.procedures WHERE id = NEW.procedure_id;
  END IF;
  IF v_clinic IS DISTINCT FROM NEW.clinic_id THEN
    RAISE EXCEPTION 'online_booking: item de outra clínica' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_online_booking_prof_same_clinic ON public.online_booking_professionals;
CREATE TRIGGER trg_online_booking_prof_same_clinic
  BEFORE INSERT OR UPDATE ON public.online_booking_professionals
  FOR EACH ROW EXECUTE FUNCTION public.online_booking_same_clinic();

DROP TRIGGER IF EXISTS trg_online_booking_proc_same_clinic ON public.online_booking_procedures;
CREATE TRIGGER trg_online_booking_proc_same_clinic
  BEFORE INSERT OR UPDATE ON public.online_booking_procedures
  FOR EACH ROW EXECUTE FUNCTION public.online_booking_same_clinic();

-- ─── RLS: só o administrador da clínica (e o superadmin) configura; a leitura do registro é do administrador ───
ALTER TABLE public.clinic_online_booking        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_booking_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_booking_procedures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_booking_requests      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  cond text := '(public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.get_my_role() = ''admin''))';
BEGIN
  FOREACH t IN ARRAY ARRAY['clinic_online_booking', 'online_booking_professionals', 'online_booking_procedures', 'online_booking_requests'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'admin_read_' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING %s', 'admin_read_' || t, t, cond);
    END IF;
  END LOOP;

  -- configuração e listas liberadas: o admin grava (sem policy de escrita, o registro de reservas só é gravado pela função)
  FOREACH t IN ARRAY ARRAY['clinic_online_booking', 'online_booking_professionals', 'online_booking_procedures'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'admin_insert_' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK %s', 'admin_insert_' || t, t, cond);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'admin_update_' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING %s WITH CHECK %s', 'admin_update_' || t, t, cond, cond);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['online_booking_professionals', 'online_booking_procedures'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'admin_delete_' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING %s', 'admin_delete_' || t, t, cond);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Funções auxiliares (internas: ninguém além do service_role e das funções abaixo as executa)
-- ═══════════════════════════════════════════════════════════════════════════

-- Nome comparável: sem acento, sem caixa, espaços únicos. Só traduz as letras acentuadas do português (sem extensão unaccent).
CREATE OR REPLACE FUNCTION public._ob_norm_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(translate(
    regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'))
$$;

-- "HH:MM" -> minutos desde 00:00; NULL se não for um horário.
CREATE OR REPLACE FUNCTION public._ob_hhmm(p_text text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p_text ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
              THEN substr(p_text, 1, 2)::int * 60 + substr(p_text, 4, 2)::int END
$$;

-- Telefone guardado de qualquer jeito -> dígitos nacionais (DDD + número), sem o 55.
CREATE OR REPLACE FUNCTION public._ob_nat_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN d ~ '^55[0-9]{10,11}$' THEN substr(d, 3)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') AS d) x
$$;

CREATE OR REPLACE FUNCTION public._ob_err(p_code text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT jsonb_build_object('ok', false, 'code', p_code) $$;

-- Configuração da clínica pelo slug, SÓ se o link pode estar no ar: ligado, clínica ativa, não é demonstração
-- e o teste grátis não venceu. Sem linha válida devolve um registro com clinic_id nulo.
CREATE OR REPLACE FUNCTION public._ob_active_config(p_slug text)
RETURNS public.clinic_online_booking
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ob.*
  FROM public.clinic_online_booking ob
  JOIN public.clinics c ON c.id = ob.clinic_id
  WHERE ob.enabled
    AND ob.slug = lower(p_slug)
    AND c.is_active IS NOT FALSE
    AND c.demo_mode = false
    AND c.status IN ('active', 'trial')
    AND (c.status <> 'trial' OR c.trial_ends_at IS NULL OR c.trial_ends_at > now())
$$;

-- O horário cabe na escala do profissional? Mesmas regras de lib/agenda/availability.ts (dayStatus + fitsWindows):
--   escala desligada -> não atende pelo link; linha da data manda; sem linha da data usa a rotina semanal;
--   sem nenhuma rotina -> "por definir" (não atende); dia da semana sem janelas na rotina -> não atende;
--   linha da data com works = true e sem janelas -> dia todo.
CREATE OR REPLACE FUNCTION public._ob_in_schedule(p_professional_id uuid, p_date date, p_start_min integer, p_duration integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled boolean;
  v_works boolean;
  v_windows jsonb;
  v_day_found boolean := false;
  v_w jsonb;
BEGIN
  SELECT schedule_enabled INTO v_enabled FROM public.professionals WHERE id = p_professional_id;
  -- profissional sem escala ligada não é reservável pelo link (o trigger e as consultas já o excluem; aqui é a última barreira)
  IF NOT COALESCE(v_enabled, false) THEN RETURN false; END IF;

  SELECT d.works, d.windows INTO v_works, v_windows
  FROM public.professional_day_schedule d
  WHERE d.professional_id = p_professional_id AND d.date = p_date;
  v_day_found := FOUND;

  IF v_day_found THEN
    IF NOT v_works THEN RETURN false; END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.professional_week_pattern WHERE professional_id = p_professional_id) THEN
      RETURN false;
    END IF;
    SELECT w.windows INTO v_windows
    FROM public.professional_week_pattern w
    WHERE w.professional_id = p_professional_id AND w.weekday = extract(dow FROM p_date)::int;
    IF v_windows IS NULL OR jsonb_typeof(v_windows) <> 'array' OR jsonb_array_length(v_windows) = 0 THEN RETURN false; END IF;
  END IF;

  IF v_windows IS NULL OR jsonb_typeof(v_windows) <> 'array' OR jsonb_array_length(v_windows) = 0 THEN RETURN true; END IF;
  FOR v_w IN SELECT * FROM jsonb_array_elements(v_windows) LOOP
    IF p_start_min >= public._ob_hhmm(v_w->>'start') AND p_start_min + p_duration <= public._ob_hhmm(v_w->>'end') THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) CONTEXTO: o que a página pública mostra. NULL = link indisponível (não existe, desligado, clínica inativa).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.online_booking_context(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.clinic_online_booking;
  v_name text; v_logo text; v_address text; v_phone text; v_color text;
BEGIN
  IF p_slug IS NULL OR length(p_slug) > 60 THEN RETURN NULL; END IF;
  v := public._ob_active_config(p_slug);
  IF v.clinic_id IS NULL THEN RETURN NULL; END IF;

  SELECT c.name, c.logo_url, c.address, c.phone, c.primary_color
    INTO v_name, v_logo, v_address, v_phone, v_color
  FROM public.clinics c WHERE c.id = v.clinic_id;

  RETURN jsonb_build_object(
    'clinic', jsonb_build_object('name', v_name, 'logo_url', v_logo, 'address', v_address, 'phone', v_phone, 'primary_color', v_color),
    'config', jsonb_build_object(
      'confirm_mode', v.confirm_mode, 'min_notice_hours', v.min_notice_hours,
      'max_days_ahead', v.max_days_ahead, 'timezone', v.timezone),
    'professionals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'specialty', p.specialty, 'duration_minutes', obp.duration_minutes) ORDER BY p.name)
      FROM public.online_booking_professionals obp
      JOIN public.professionals p ON p.id = obp.professional_id AND p.clinic_id = v.clinic_id AND p.schedule_enabled
      WHERE obp.clinic_id = v.clinic_id
    ), '[]'::jsonb),
    'procedures', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'category', pr.category) ORDER BY pr.name)
      FROM public.online_booking_procedures op
      JOIN public.procedures pr ON pr.id = op.procedure_id AND pr.clinic_id = v.clinic_id AND pr.is_active
      WHERE op.clinic_id = v.clinic_id
    ), '[]'::jsonb)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) DISPONIBILIDADE: tudo que o servidor precisa para calcular os horários livres (a conta é feita em
--    lib/agendamentoOnline/horarios.ts). Só intervalos ocupados em ms; nunca nome, motivo ou tipo.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.online_booking_availability(p_slug text, p_professional_id uuid, p_from date, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.clinic_online_booking;
  v_dur integer;
  v_days integer;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_enabled boolean;
  v_step integer;
  v_open jsonb;
  v_open_s text; v_open_e text;
BEGIN
  IF p_slug IS NULL OR length(p_slug) > 60 OR p_professional_id IS NULL OR p_from IS NULL THEN RETURN NULL; END IF;
  v := public._ob_active_config(p_slug);
  IF v.clinic_id IS NULL THEN RETURN NULL; END IF;

  SELECT obp.duration_minutes INTO v_dur
  FROM public.online_booking_professionals obp
  JOIN public.professionals p ON p.id = obp.professional_id AND p.clinic_id = v.clinic_id AND p.schedule_enabled
  WHERE obp.clinic_id = v.clinic_id AND obp.professional_id = p_professional_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_days := least(greatest(COALESCE(p_days, 1), 1), 31);
  v_from_ts := p_from::timestamp AT TIME ZONE v.timezone;
  v_to_ts   := (p_from + v_days)::timestamp AT TIME ZONE v.timezone;

  SELECT COALESCE(s.slot_step_minutes, 30), s.opening_hours INTO v_step, v_open
  FROM (SELECT 1) one LEFT JOIN public.clinic_schedule_settings s ON s.clinic_id = v.clinic_id;
  v_step := COALESCE(v_step, 30);
  v_open_s := CASE WHEN public._ob_hhmm(v_open->>'start') IS NOT NULL THEN v_open->>'start' ELSE '07:00' END;
  v_open_e := CASE WHEN public._ob_hhmm(v_open->>'end') IS NOT NULL AND public._ob_hhmm(v_open->>'end') > public._ob_hhmm(v_open_s) THEN v_open->>'end' ELSE '19:30' END;
  IF public._ob_hhmm(v_open_e) <= public._ob_hhmm(v_open_s) THEN v_open_s := '07:00'; v_open_e := '19:30'; END IF;

  SELECT schedule_enabled INTO v_enabled FROM public.professionals WHERE id = p_professional_id AND clinic_id = v.clinic_id;

  RETURN jsonb_build_object(
    'config', jsonb_build_object(
      'timezone', v.timezone, 'min_notice_hours', v.min_notice_hours, 'max_days_ahead', v.max_days_ahead,
      'step_minutes', v_step, 'opening', jsonb_build_object('start', v_open_s, 'end', v_open_e)),
    'duration_minutes', v_dur,
    'schedule', jsonb_build_object(
      'enabled', COALESCE(v_enabled, false),
      'pattern', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('weekday', w.weekday, 'windows', w.windows))
        FROM public.professional_week_pattern w WHERE w.professional_id = p_professional_id AND w.clinic_id = v.clinic_id
      ), '[]'::jsonb),
      'days', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('date', d.date, 'works', d.works, 'windows', d.windows))
        FROM public.professional_day_schedule d
        WHERE d.professional_id = p_professional_id AND d.clinic_id = v.clinic_id
          AND d.date >= p_from - 1 AND d.date <= p_from + v_days
      ), '[]'::jsonb)
    ),
    'busy', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        (extract(epoch FROM a.scheduled_at) * 1000)::bigint,
        ((extract(epoch FROM a.scheduled_at) * 1000)::bigint + COALESCE(a.duration_minutes, 60)::bigint * 60000)))
      FROM public.appointments a
      WHERE a.clinic_id = v.clinic_id
        AND COALESCE(a.status, '') <> 'cancelado'
        AND (a.professional_id = p_professional_id OR (a.professional_id IS NULL AND a.status = 'bloqueado'))
        AND a.scheduled_at < v_to_ts
        AND a.scheduled_at + (COALESCE(a.duration_minutes, 60) * interval '1 minute') > v_from_ts
    ), '[]'::jsonb)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) CRIAR AGENDAMENTO. Devolve {ok:true,...} ou {ok:false, code}. Códigos:
--    indisponivel | dados_invalidos | profissional_invalido | procedimento_invalido | fora_da_janela |
--    horario_invalido | horario_ocupado | limite
-- Todas as regras são conferidas de novo aqui: o navegador pode mandar qualquer horário.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.online_booking_create(
  p_slug text, p_professional_id uuid, p_procedure_id uuid, p_date date, p_time text,
  p_name text, p_phone_digits text, p_phone_display text, p_email text,
  p_consent boolean, p_consent_text text, p_ip_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.clinic_online_booking;
  v_dur integer; v_prof_name text;
  v_has_procs boolean; v_proc_id uuid; v_proc_name text; v_proc_price numeric; v_proc_free boolean;
  v_start timestamptz; v_end timestamptz; v_start_min integer;
  v_today date;
  v_open jsonb; v_open_s integer; v_open_e integer; v_step integer;
  v_name text; v_email text; v_key text;
  v_patient uuid; v_appt uuid; v_status text; v_notes text; v_clinic_name text;
BEGIN
  -- ── entrada: nada do navegador é confiável ──
  v_name := regexp_replace(btrim(COALESCE(p_name, '')), '[[:space:]]+', ' ', 'g');
  IF length(v_name) < 2 OR length(v_name) > 80 THEN RETURN public._ob_err('dados_invalidos'); END IF;
  IF p_phone_digits IS NULL OR p_phone_digits !~ '^[1-9][0-9]{9,10}$' THEN RETURN public._ob_err('dados_invalidos'); END IF;
  IF p_phone_display IS NULL OR length(p_phone_display) > 20 THEN RETURN public._ob_err('dados_invalidos'); END IF;
  v_email := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  -- mesmo charset de validar.ts (cleanEmail): letras minúsculas sem acento, números e . _ % + - na parte local; domínio com pontos
  IF v_email IS NOT NULL AND (length(v_email) > 120 OR v_email !~ '^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$') THEN
    RETURN public._ob_err('dados_invalidos');
  END IF;
  IF p_consent IS NOT TRUE OR p_consent_text IS NULL OR length(p_consent_text) < 10 OR length(p_consent_text) > 600 THEN
    RETURN public._ob_err('dados_invalidos');
  END IF;
  IF p_date IS NULL OR p_time IS NULL OR public._ob_hhmm(p_time) IS NULL THEN RETURN public._ob_err('dados_invalidos'); END IF;
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN RETURN public._ob_err('dados_invalidos'); END IF;
  IF p_professional_id IS NULL THEN RETURN public._ob_err('profissional_invalido'); END IF;

  -- ── o link está no ar? ──
  IF p_slug IS NULL OR length(p_slug) > 60 THEN RETURN public._ob_err('indisponivel'); END IF;
  v := public._ob_active_config(p_slug);
  IF v.clinic_id IS NULL THEN RETURN public._ob_err('indisponivel'); END IF;

  -- ── profissional e serviço liberados NESTA clínica ──
  SELECT obp.duration_minutes, p.name INTO v_dur, v_prof_name
  FROM public.online_booking_professionals obp
  JOIN public.professionals p ON p.id = obp.professional_id AND p.clinic_id = v.clinic_id AND p.schedule_enabled
  WHERE obp.clinic_id = v.clinic_id AND obp.professional_id = p_professional_id;
  IF NOT FOUND THEN RETURN public._ob_err('profissional_invalido'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.online_booking_procedures op
    JOIN public.procedures pr ON pr.id = op.procedure_id AND pr.clinic_id = v.clinic_id AND pr.is_active
    WHERE op.clinic_id = v.clinic_id
  ) INTO v_has_procs;
  IF v_has_procs THEN
    IF p_procedure_id IS NULL THEN RETURN public._ob_err('procedimento_invalido'); END IF;
    SELECT pr.id, pr.name, pr.price, pr.is_free INTO v_proc_id, v_proc_name, v_proc_price, v_proc_free
    FROM public.online_booking_procedures op
    JOIN public.procedures pr ON pr.id = op.procedure_id AND pr.clinic_id = v.clinic_id AND pr.is_active
    WHERE op.clinic_id = v.clinic_id AND op.procedure_id = p_procedure_id;
    IF NOT FOUND THEN RETURN public._ob_err('procedimento_invalido'); END IF;
  ELSIF p_procedure_id IS NOT NULL THEN
    RETURN public._ob_err('procedimento_invalido');
  END IF;

  -- ── janela: antecedência mínima, dias à frente, grade e horário de funcionamento ──
  v_start := (p_date + p_time::time) AT TIME ZONE v.timezone;
  v_end := v_start + (v_dur * interval '1 minute');
  IF v_start < now() + (v.min_notice_hours * interval '1 hour') THEN RETURN public._ob_err('fora_da_janela'); END IF;
  v_today := (now() AT TIME ZONE v.timezone)::date;
  IF p_date > v_today + v.max_days_ahead THEN RETURN public._ob_err('fora_da_janela'); END IF;

  SELECT s.slot_step_minutes, s.opening_hours INTO v_step, v_open
  FROM (SELECT 1) one LEFT JOIN public.clinic_schedule_settings s ON s.clinic_id = v.clinic_id;
  v_step := COALESCE(v_step, 30);
  v_open_s := COALESCE(public._ob_hhmm(v_open->>'start'), 7 * 60);
  v_open_e := COALESCE(public._ob_hhmm(v_open->>'end'), 19 * 60 + 30);
  IF v_open_e <= v_open_s THEN v_open_s := 7 * 60; v_open_e := 19 * 60 + 30; END IF;
  v_start_min := public._ob_hhmm(p_time);
  IF v_start_min < v_open_s OR v_start_min + v_dur > v_open_e OR (v_start_min - v_open_s) % v_step <> 0 THEN
    RETURN public._ob_err('horario_invalido');
  END IF;
  IF NOT public._ob_in_schedule(p_professional_id, p_date, v_start_min, v_dur) THEN RETURN public._ob_err('horario_invalido'); END IF;

  -- ── anti-abuso no banco (o IP e o telefone também são limitados na rota, antes de chegar aqui) ──
  -- Evolução prevista, fora deste escopo: captcha (ex.: Turnstile) ou código de confirmação por WhatsApp antes de gravar.
  -- Enquanto isso, a defesa é: campo isca e tempo de preenchimento na rota, limites abaixo e o modo "pendente" como padrão.
  v_key := left(p_phone_digits, 2) || right(p_phone_digits, 8);

  -- Trava por clínica + telefone ANTES de contar: duas reservas simultâneas do mesmo número se enfileiram e a segunda
  -- enxerga a primeira (sem isso, as duas passariam pelo limite lendo a mesma contagem).
  PERFORM pg_advisory_xact_lock(hashtextextended('online_booking_phone:' || v.clinic_id::text || ':' || v_key, 0));

  -- online_booking_requests só recebe linha quando a reserva foi GRAVADA (mais abaixo): tentativa recusada
  -- (horário ocupado, dado inválido) não consome o limite do telefone nem do IP.
  IF (SELECT count(*) FROM public.online_booking_requests r WHERE r.clinic_id = v.clinic_id AND r.phone_key = v_key AND r.created_at > now() - interval '24 hours') >= 4
     OR (SELECT count(*) FROM public.online_booking_requests r WHERE r.clinic_id = v.clinic_id AND r.ip_hash = p_ip_hash AND r.created_at > now() - interval '1 hour') >= 6
     OR (SELECT count(*) FROM public.online_booking_requests r WHERE r.clinic_id = v.clinic_id AND r.created_at > now() - interval '1 hour') >= 80
     OR (SELECT count(*) FROM public.online_booking_requests r JOIN public.appointments a ON a.id = r.appointment_id
         WHERE r.clinic_id = v.clinic_id AND r.phone_key = v_key AND a.scheduled_at > now() AND a.status IN ('agendado', 'confirmado')) >= 3
     -- teto por clínica: reservas online futuras ainda aguardando confirmação. Passou disso, o link para de aceitar
     -- até a recepção confirmar ou cancelar (impede encher a agenda de "pendentes" falsos).
     OR (SELECT count(*) FROM public.appointments a
         WHERE a.clinic_id = v.clinic_id AND a.booked_online AND a.status = 'agendado' AND a.scheduled_at > now()) >= 60
  THEN
    RETURN public._ob_err('limite');
  END IF;

  -- ── dupla reserva: trava por profissional, confere e insere ──
  PERFORM pg_advisory_xact_lock(hashtextextended('online_booking:' || p_professional_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.clinic_id = v.clinic_id
      AND COALESCE(a.status, '') <> 'cancelado'
      AND (a.professional_id = p_professional_id OR (a.professional_id IS NULL AND a.status = 'bloqueado'))
      AND a.scheduled_at < v_end
      AND a.scheduled_at + (COALESCE(a.duration_minutes, 60) * interval '1 minute') > v_start
  ) THEN
    RETURN public._ob_err('horario_ocupado');
  END IF;

  v_status := CASE v.confirm_mode WHEN 'confirmado' THEN 'confirmado' ELSE 'agendado' END;

  BEGIN
    -- paciente: reaproveita quem já tem o MESMO telefone E o MESMO nome completo (sem acento nem caixa); senão cria. Nunca altera cadastro existente.
    SELECT pt.id INTO v_patient
    FROM public.patients pt
    WHERE pt.clinic_id = v.clinic_id
      AND pt.is_active IS NOT FALSE
      AND length(public._ob_nat_phone(pt.phone)) BETWEEN 10 AND 11
      AND left(public._ob_nat_phone(pt.phone), 2) = left(p_phone_digits, 2)
      AND right(public._ob_nat_phone(pt.phone), 8) = right(p_phone_digits, 8)
      AND public._ob_norm_name(pt.name) = public._ob_norm_name(v_name)
    ORDER BY pt.created_at
    LIMIT 1;

    IF v_patient IS NULL THEN
      INSERT INTO public.patients (clinic_id, name, phone, email, self_registered, registration_status, lgpd_consent, lgpd_consent_at, lgpd_consent_ip)
      VALUES (v.clinic_id, v_name, p_phone_display, v_email, true, 'approved', true, now(), p_ip_hash)
      RETURNING id INTO v_patient;
    END IF;

    v_notes := 'Agendamento online. Nome informado: ' || v_name || '. WhatsApp: ' || p_phone_display
      || CASE WHEN v_email IS NOT NULL THEN '. E-mail: ' || v_email ELSE '' END || '.';

    INSERT INTO public.appointments (clinic_id, patient_id, professional_id, procedure_id, procedure_name, procedure_price,
                                     status, scheduled_at, duration_minutes, notes, booked_online)
    VALUES (v.clinic_id, v_patient, p_professional_id, v_proc_id, COALESCE(v_proc_name, 'Consulta'),
            CASE WHEN v_proc_id IS NULL THEN NULL WHEN v_proc_free THEN 0 ELSE v_proc_price END,
            v_status, v_start, v_dur, v_notes, true)
    RETURNING id INTO v_appt;

    INSERT INTO public.online_booking_requests (clinic_id, appointment_id, patient_id, phone_key, ip_hash, consent_text)
    VALUES (v.clinic_id, v_appt, v_patient, v_key, p_ip_hash, p_consent_text);
  EXCEPTION WHEN exclusion_violation THEN
    -- outra reserva do mesmo profissional entrou no mesmo instante: o bloco inteiro (inclusive o paciente) é desfeito
    RETURN public._ob_err('horario_ocupado');
  END;

  -- lead no CRM (fonte "site"): melhora o funil, mas NUNCA derruba a reserva já feita.
  -- Se o lead já existe, só liga o paciente (se faltava) e leva Novo/Em conversa para Agendado; o resto fica como está.
  BEGIN
    INSERT INTO public.crm_leads (clinic_id, name, phone, phone_key, stage, stage_source, source, interest, patient_id)
    VALUES (v.clinic_id, v_name, p_phone_display, v_key, 'agendado', 'auto', 'site', v_proc_name, v_patient)
    ON CONFLICT (clinic_id, phone_key) DO UPDATE SET
      patient_id   = COALESCE(crm_leads.patient_id, EXCLUDED.patient_id),
      stage        = CASE WHEN crm_leads.stage IN ('novo', 'em_conversa') THEN 'agendado' ELSE crm_leads.stage END,
      stage_source = CASE WHEN crm_leads.stage IN ('novo', 'em_conversa') THEN 'auto' ELSE crm_leads.stage_source END;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'online_booking_create: lead não registrado (%).', SQLSTATE;
  END;

  SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v.clinic_id;
  RETURN jsonb_build_object(
    'ok', true,
    'status', v_status,
    'starts_at', v_start,
    'duration_minutes', v_dur,
    'clinic_name', v_clinic_name,
    'professional_name', v_prof_name,
    'procedure_name', COALESCE(v_proc_name, 'Consulta')
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) RETENÇÃO (LGPD): apaga do registro de reservas o que tem mais de 90 dias (telefone normalizado, hash de IP e
--    texto de consentimento). A reserva e o paciente continuam; o consentimento do paciente fica em patients.lgpd_*.
--    Devolve quantas linhas apagou. Os limites anti-abuso só olham as últimas 24 horas, então a purga não os afeta.
--
-- COMO AGENDAR (nada é agendado por esta migração). Uma das duas:
--   a) pg_cron, uma vez por dia:
--        select cron.schedule('online-booking-purge', '17 3 * * *', $cron$ select public.online_booking_purge() $cron$);
--   b) o agendador do app (service role) chamando  supabase.rpc('online_booking_purge')  uma vez por dia.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.online_booking_purge()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.online_booking_requests WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ─── Permissões: só o service_role (as rotas do Next) executa. Nada de anon, authenticated ou PUBLIC. ───
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public._ob_hhmm(text)',
    'public._ob_norm_name(text)',
    'public._ob_nat_phone(text)',
    'public._ob_err(text)',
    'public._ob_active_config(text)',
    'public._ob_in_schedule(uuid, date, integer, integer)',
    'public.online_booking_context(text)',
    'public.online_booking_availability(text, uuid, date, integer)',
    'public.online_booking_create(text, uuid, uuid, date, text, text, text, text, text, boolean, text, text)',
    'public.online_booking_purge()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

COMMENT ON TABLE public.clinic_online_booking IS 'Agendamento online público por clínica (link /agendar/<slug>). Config só pelo admin; leitura pública só pelas funções online_booking_*.';
COMMENT ON TABLE public.online_booking_requests IS 'Uma linha por reserva feita pelo link público: consentimento LGPD e base dos limites anti-abuso. Só a função grava.';
