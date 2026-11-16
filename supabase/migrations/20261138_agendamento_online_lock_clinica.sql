-- ═══════════════════════════════════════════════════════════════════════════
-- Agendamento online: trava por clínica nos tetos anti-abuso de online_booking_create.
--
-- Problema (20261128): a função travava por clínica+telefone e depois conferia os tetos por IP (>= 6/h), por clínica
-- (>= 80/h) e de pendentes (>= 60) com SELECT count(*) em READ COMMITTED. Rajadas paralelas com telefones e profissionais
-- diferentes passavam todas pelo count antes de qualquer commit e estouravam os tetos.
--
-- Correção: PERFORM pg_advisory_xact_lock(hashtextextended('online_booking_clinic:' || clinic_id, 0)) antes das contagens.
-- Só muda isso; o restante do corpo é idêntico ao que está no banco (conferido com pg_get_functiondef antes de escrever).
--
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT repetíveis. Aditiva: sem tabela, coluna ou dado novo; assinatura igual.
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

  -- Trava por CLÍNICA antes de contar os tetos por IP (>= 6/h), por clínica (>= 80/h) e de pendentes (>= 60). A trava por
  -- telefone (logo abaixo) só enfileira o MESMO número; rajadas paralelas com telefones/profissionais diferentes liam, em READ
  -- COMMITTED, a mesma contagem antes de qualquer commit e estouravam os tetos. Com esta trava, a reserva seguinte só conta
  -- depois que a anterior commitou (o count seguinte já enxerga a linha). Ela cobre o IP também: todas as contagens de IP
  -- filtram por clinic_id, então não precisa de trava extra por ip_hash. Ordem fixa de travas (clínica -> telefone ->
  -- profissional) em todas as chamadas, o que evita deadlock. Custo: reservas da MESMA clínica passam uma por vez (fila curta,
  -- teto de 80/h); clínicas diferentes não se bloqueiam.
  PERFORM pg_advisory_xact_lock(hashtextextended('online_booking_clinic:' || v.clinic_id::text, 0));

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

-- ─── Permissões: idênticas à 20261128 (só o service_role executa; nada de PUBLIC, anon, authenticated). ───
REVOKE ALL ON FUNCTION public.online_booking_create(text, uuid, uuid, date, text, text, text, text, text, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.online_booking_create(text, uuid, uuid, date, text, text, text, text, text, boolean, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.online_booking_create(text, uuid, uuid, date, text, text, text, text, text, boolean, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.online_booking_create(text, uuid, uuid, date, text, text, text, text, text, boolean, text, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodar depois de aplicar; somente leitura)
--   1) A trava existe no corpo e vem antes das contagens:
--        select position('online_booking_clinic:' in prosrc) > 0 as tem_trava_clinica,
--               position('online_booking_clinic:' in prosrc) < position('interval ''24 hours'') >= 4' in prosrc) as antes_dos_tetos,
--               prosecdef, proconfig
--          from pg_proc where oid = 'public.online_booking_create(text, uuid, uuid, date, text, text, text, text, text, boolean, text, text)'::regprocedure;
--      Esperado: true, true, true, {search_path=public, pg_temp}.
--   2) Só o service_role executa:
--        select proacl::text from pg_proc
--         where oid = 'public.online_booking_create(text, uuid, uuid, date, text, text, text, text, text, boolean, text, text)'::regprocedure;
--      Esperado: {postgres=X/postgres,service_role=X/postgres}  (sem anon, authenticated ou "=X/postgres").
--
-- ROLLBACK (voltar ao comportamento anterior, sem a trava por clínica):
--   rodar de novo o CREATE OR REPLACE FUNCTION public.online_booking_create(...) de supabase/migrations/20261128_agendamento_online.sql
--   (linhas 406-590, o bloco inteiro até o "$$;"). Os REVOKE/GRANT já estão corretos e não mudam.
-- ═══════════════════════════════════════════════════════════════════════════
