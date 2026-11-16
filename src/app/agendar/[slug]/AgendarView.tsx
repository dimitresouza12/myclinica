'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { maskBrPhone } from '@/lib/phoneFormat'
import { contrastText, type BookingDone, type PublicContext, type PublicProfessional } from '@/lib/agendamentoOnline/config'
import { dateKeyInZone } from '@/lib/agendamentoOnline/tz'
import { consentText } from '@/lib/agendamentoOnline/validar'
import styles from './agendar.module.css'

type Step = 'escolha' | 'horario' | 'dados' | 'pronto'
interface DaySlots { date: string; times: string[] }

const dayFmt = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { ...opts, timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))

/** Hora marcada, escrita no relógio da clínica. */
const whenFmt = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso))

export function AgendarView({ slug, context }: { slug: string; context: PublicContext }) {
  const { clinic, config, professionals, procedures } = context
  const needsProcedure = procedures.length > 0

  const [step, setStep] = useState<Step>('escolha')
  const [procedureId, setProcedureId] = useState<string | null>(null)
  const [professional, setProfessional] = useState<PublicProfessional | null>(professionals.length === 1 ? professionals[0] : null)

  const [days, setDays] = useState<DaySlots[]>([])
  const [nextFrom, setNextFrom] = useState<string | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState('')
  const [slotsLoaded, setSlotsLoaded] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // campo isca: escondido, só robô preenche
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<BookingDone | null>(null)

  const openedAt = useRef(0)
  useEffect(() => { openedAt.current = Date.now() }, [])
  const topRef = useRef<HTMLHeadingElement>(null)
  const loadSeq = useRef(0)

  const accent = clinic.primaryColor
  const themeStyle = useMemo(() => (accent
    ? ({ '--ag-accent': accent, '--ag-on-accent': contrastText(accent) } as CSSProperties)
    : undefined), [accent])

  const goStep = (s: Step) => {
    setStep(s)
    setError('')
    // leva o foco para o título do passo: leitor de tela anuncia e a página volta ao topo no celular
    setTimeout(() => topRef.current?.focus(), 0)
  }

  const loadSlots = useCallback(async (prof: PublicProfessional, from: string | null) => {
    const seq = ++loadSeq.current
    setLoadingSlots(true)
    setSlotsError('')
    const start = from ?? dateKeyInZone(Date.now(), config.timezone)
    try {
      const res = await fetch(`/api/agendar/${slug}/horarios?profissional=${prof.id}&inicio=${start}&dias=31`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (seq !== loadSeq.current) return
      if (!res.ok) { setSlotsError(typeof data.error === 'string' ? data.error : 'Não foi possível carregar os horários.'); return }
      const got = (data.days ?? []) as DaySlots[]
      setDays(prev => (from ? [...prev, ...got] : got))
      setNextFrom(typeof data.nextFrom === 'string' ? data.nextFrom : null)
      setSlotsLoaded(true)
      if (!from && got.length > 0) setDay(got[0].date)
    } catch {
      if (seq === loadSeq.current) setSlotsError('Sem conexão. Confira a internet e tente de novo.')
    } finally {
      if (seq === loadSeq.current) setLoadingSlots(false)
    }
  }, [slug, config.timezone])

  function continueToHorario() {
    if (!professional || (needsProcedure && !procedureId)) return
    setDays([]); setNextFrom(null); setDay(null); setTime(null); setSlotsLoaded(false)
    goStep('horario')
    void loadSlots(professional, null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!professional || !day || !time || sending) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/agendar/${slug}/agendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professionalId: professional.id, procedureId, date: day, time, name, phone, email, consent, website, openedAt: openedAt.current,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = typeof data.code === 'string' ? data.code : ''
        if (code === 'horario_ocupado' || code === 'horario_invalido' || code === 'fora_da_janela') {
          // o horário saiu do ar: volta para a escolha, com a lista atualizada
          setTime(null)
          goStep('horario')
          void loadSlots(professional, null)
          setSlotsError(data.error ?? 'Esse horário não está mais disponível. Escolha outro.')
          return
        }
        setError(typeof data.error === 'string' ? data.error : 'Não foi possível concluir agora. Tente de novo.')
        return
      }
      if (typeof data.startsAt !== 'string') {
        // resposta de robô barrado pelo campo isca (sem dados): não mostra tela de sucesso
        setError('Não foi possível concluir agora. Tente de novo.')
        return
      }
      setDone(data as BookingDone)
      goStep('pronto')
    } catch {
      setError('Sem conexão. Confira a internet e tente de novo.')
    } finally {
      setSending(false)
    }
  }

  const procedure = procedures.find(p => p.id === procedureId) ?? null
  const dayTimes = days.find(d => d.date === day)?.times ?? []
  const canContinue = !!professional && (!needsProcedure || !!procedureId)
  const stepNumber = step === 'escolha' ? 1 : step === 'horario' ? 2 : 3

  return (
    <main className={styles.page} style={themeStyle}>
      <div className={styles.shell}>
        <header className={styles.header}>
          {clinic.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.logo} src={clinic.logoUrl} alt="" width={48} height={48} />
          )}
          <div>
            <p className={styles.clinic}>{clinic.name}</p>
            <h1 className={styles.title} tabIndex={-1} ref={topRef}>
              {step === 'escolha' && 'Agende sua consulta'}
              {step === 'horario' && 'Escolha dia e horário'}
              {step === 'dados' && 'Seus dados'}
              {step === 'pronto' && (done?.status === 'confirmado' ? 'Agendamento confirmado' : 'Horário reservado')}
            </h1>
          </div>
        </header>

        {step !== 'pronto' && <p className={styles.progress} aria-label={`Passo ${stepNumber} de 3`}>Passo {stepNumber} de 3</p>}

        {step === 'escolha' && (
          <section className={styles.card}>
            {needsProcedure && (
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>O que você precisa?</legend>
                <div className={styles.options} role="radiogroup" aria-label="Serviço">
                  {procedures.map(p => (
                    <button key={p.id} type="button" role="radio" aria-checked={procedureId === p.id}
                      className={procedureId === p.id ? styles.optionOn : styles.option} onClick={() => setProcedureId(p.id)}>
                      <span>{p.name}</span>
                      {p.category && <small>{p.category}</small>}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>{professionals.length === 1 ? 'Profissional' : 'Com quem?'}</legend>
              <div className={styles.options} role="radiogroup" aria-label="Profissional">
                {professionals.map(p => (
                  <button key={p.id} type="button" role="radio" aria-checked={professional?.id === p.id}
                    className={professional?.id === p.id ? styles.optionOn : styles.option} onClick={() => setProfessional(p)}>
                    <span>{p.name}</span>
                    <small>{[p.specialty, `${p.durationMinutes} min`].filter(Boolean).join(' · ')}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <button type="button" className={styles.btn} disabled={!canContinue} onClick={continueToHorario}>Ver horários</button>
          </section>
        )}

        {step === 'horario' && professional && (
          <section className={styles.card}>
            <p className={styles.summary}>
              {[procedure?.name, professional.name].filter(Boolean).join(' com ')} · {professional.durationMinutes} min
            </p>
            {slotsError && <p className={styles.error} role="alert">{slotsError}</p>}
            {loadingSlots && days.length === 0 && <p className={styles.muted} role="status">Carregando horários...</p>}
            {slotsLoaded && days.length === 0 && !loadingSlots && !slotsError && (
              <p className={styles.muted}>Não há horários livres nos próximos {config.maxDaysAhead} dias. Fale com a clínica para encontrar um encaixe.</p>
            )}
            {days.length > 0 && (
              <>
                <h2 className={styles.h2}>Dia</h2>
                <div className={styles.days} role="radiogroup" aria-label="Dia">
                  {days.map(d => (
                    <button key={d.date} type="button" role="radio" aria-checked={day === d.date}
                      className={day === d.date ? styles.dayOn : styles.day} onClick={() => { setDay(d.date); setTime(null) }}>
                      <span>{dayFmt(d.date, { weekday: 'short' }).replace('.', '')}</span>
                      <b>{dayFmt(d.date, { day: '2-digit', month: '2-digit' })}</b>
                    </button>
                  ))}
                </div>
                {nextFrom && (
                  <button type="button" className={styles.btnGhost} disabled={loadingSlots} onClick={() => void loadSlots(professional, nextFrom)}>
                    {loadingSlots ? 'Carregando...' : 'Ver mais datas'}
                  </button>
                )}
                {day && (
                  <>
                    <h2 className={styles.h2}>Horário em {dayFmt(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                    <div className={styles.times} role="radiogroup" aria-label="Horário">
                      {dayTimes.map(t => (
                        <button key={t} type="button" role="radio" aria-checked={time === t}
                          className={time === t ? styles.timeOn : styles.time} onClick={() => setTime(t)}>{t}</button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.btnGhost} onClick={() => goStep('escolha')}>Voltar</button>
              <button type="button" className={styles.btn} disabled={!day || !time} onClick={() => goStep('dados')}>Continuar</button>
            </div>
          </section>
        )}

        {step === 'dados' && professional && day && time && (
          <form className={styles.card} onSubmit={submit} noValidate>
            <p className={styles.summary}>
              {[procedure?.name, professional.name].filter(Boolean).join(' com ')}
              <br />{dayFmt(day, { weekday: 'long', day: 'numeric', month: 'long' })} às {time}
            </p>
            <label className={styles.label} htmlFor="ag-nome">Nome completo</label>
            <input id="ag-nome" className={styles.input} value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={80} required />
            <label className={styles.label} htmlFor="ag-fone">WhatsApp</label>
            <input id="ag-fone" className={styles.input} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="(85) 99999-8888"
              value={phone} onChange={e => setPhone(maskBrPhone(e.target.value))} required />
            <label className={styles.label} htmlFor="ag-email">E-mail <span className={styles.optional}>(opcional)</span></label>
            <input id="ag-email" className={styles.input} type="email" inputMode="email" autoComplete="email" maxLength={120} value={email} onChange={e => setEmail(e.target.value)} />

            {/* campo isca: fora da tela e do teclado; pessoa nunca preenche */}
            <div className={styles.trap} aria-hidden="true">
              <label htmlFor="ag-site">Site</label>
              <input id="ag-site" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
            </div>

            <label className={styles.check}>
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
              <span>{consentText(clinic.name)}</span>
            </label>

            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.actions}>
              <button type="button" className={styles.btnGhost} onClick={() => goStep('horario')}>Voltar</button>
              <button type="submit" className={styles.btn} disabled={sending || !name.trim() || !phone || !consent}>{sending ? 'Enviando...' : 'Confirmar agendamento'}</button>
            </div>
            <p className={styles.legal}>
              {config.confirmMode === 'confirmado'
                ? 'Seu horário será confirmado na hora.'
                : 'Seu horário fica reservado e a clínica confirma com você pelo WhatsApp.'}
            </p>
          </form>
        )}

        {step === 'pronto' && done && (
          <section className={styles.card}>
            <p className={done.status === 'confirmado' ? styles.tagOk : styles.tagNext}>
              {done.status === 'confirmado' ? 'Confirmado' : 'Pendente de confirmação'}
            </p>
            <ul className={styles.list}>
              <li className={styles.item}><small>Quando</small><b>{whenFmt(done.startsAt, config.timezone)}</b></li>
              <li className={styles.item}><small>{done.procedureName}</small><b>{done.professionalName}</b></li>
              <li className={styles.item}><small>Local</small><b>{done.clinicName}{clinic.address ? ` · ${clinic.address}` : ''}</b></li>
            </ul>
            <p className={styles.text}>
              {done.status === 'confirmado'
                ? 'Está tudo certo. Se precisar remarcar ou cancelar, fale com a clínica.'
                : 'Recebemos seu pedido. A clínica vai confirmar o horário com você pelo WhatsApp.'}
              {clinic.phone ? ` Contato da clínica: ${clinic.phone}.` : ''}
            </p>
          </section>
        )}

        <p className={styles.footer}>Agendamento online. Seus dados são usados só para este atendimento.</p>
      </div>
    </main>
  )
}
