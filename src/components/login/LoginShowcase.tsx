'use client'
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { buildDay, useShowcaseClock, type ShowcaseDay } from './showcaseData'
import styles from './loginShowcase.module.css'

// Dados IMAGINÁRIOS, sorteados a cada carregamento (ver showcaseData.ts): a tela de login é pública e nunca toca o banco.
const SCENES = ['Agenda', 'Financeiro', 'WhatsApp'] as const

const fmtMoney = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`
const fmtInt = (n: number) => n.toLocaleString('pt-BR')
const fmtPct10 = (n: number) => `${(n / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%`

/** Número que sobe contando até `to`. Escreve direto no DOM (sem setState a cada quadro). */
function CountUp({ to, format, reduce, delay }: { to: number; format: (n: number) => string; reduce: boolean; delay: number }) {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce) { el.textContent = format(to); return }
    el.textContent = format(0)
    let raf = 0
    let t0: number | null = null
    const dur = 1100
    const step = (t: number) => {
      if (t0 === null) t0 = t
      const p = Math.min(Math.max((t - t0 - delay) / dur, 0), 1)
      el.textContent = format(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, format, reduce, delay])
  return <b ref={ref} />
}

const Check = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
)

function AgendaScene({ day }: { day: ShowcaseDay }) {
  const row = (i: number): CSSProperties => ({ '--i': i } as CSSProperties)
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}><strong>{day.dateLabel}</strong><span>Exemplo</span></div>
      {day.slots.map((sl, i) => sl.status === 'new' ? (
        <div key={i} className={`${styles.slot} ${styles.slotNew}`}>
          <time>{sl.time}</time><div className={styles.who}><b>{sl.name}</b><small>Agendou {sl.female ? 'sozinha' : 'sozinho'} pelo WhatsApp</small></div>
          <span className={`${styles.chip} ${styles.fresh}`}>Novo</span>
        </div>
      ) : (
        <div key={i} className={styles.slot} style={row(i)}>
          <time>{sl.time}</time><div className={styles.who}><b>{sl.name}</b><small>{sl.service}</small></div>
          {sl.status === 'ok' && <span className={`${styles.chip} ${styles.ok}`}><Check />Confirmado</span>}
          {sl.status === 'wait' && <span className={`${styles.chip} ${styles.wait}`}>Lembrete enviado</span>}
          {sl.status === 'swap' && (
            <span className={styles.swap}>
              <span className={`${styles.chip} ${styles.wait} ${styles.swapOut}`}>Lembrete enviado</span>
              <span className={`${styles.chip} ${styles.ok} ${styles.swapIn}`}><Check />Confirmado pelo WhatsApp</span>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function FinanceScene({ day, reduce }: { day: ShowcaseDay; reduce: boolean }) {
  const m = day.money
  const xs = [2, 40, 78, 116, 154, 192, 230, 268, 306, 344, 382, 418]
  const pts = m.series.map((y, i) => `${xs[i]} ${y}`)
  const line = `M${pts.join(' L')}`
  const lastY = m.series[m.series.length - 1]
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}><strong>{day.monthLabel}</strong><span>Exemplo</span></div>
      <div className={styles.tiles}>
        <div className={styles.tile}><small>Faturamento</small><CountUp to={m.revenue} format={fmtMoney} reduce={reduce} delay={200} /><em>+{m.revenueDelta}% no mês</em></div>
        <div className={styles.tile}><small>Atendimentos</small><CountUp to={m.visits} format={fmtInt} reduce={reduce} delay={280} /><em>+{m.visitsDelta} no mês</em></div>
        <div className={styles.tile}><small>Faltas</small><CountUp to={m.noShow} format={fmtPct10} reduce={reduce} delay={360} /><em>{m.noShowDrop}</em></div>
      </div>
      <div className={styles.chart}>
        <div className={styles.toast}>
          <i><svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></i>
          <div><b>Pix recebido</b>{m.pixAmount}, {m.pixName}</div>
        </div>
        <svg viewBox="0 0 420 120" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="loginShowcaseArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4DD9C0" stopOpacity=".45" />
              <stop offset="1" stopColor="#4DD9C0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className={styles.grid}><line x1="0" y1="30" x2="420" y2="30" /><line x1="0" y1="65" x2="420" y2="65" /><line x1="0" y1="100" x2="420" y2="100" /></g>
          <path className={styles.area} d={`${line} L418 120 L2 120Z`} fill="url(#loginShowcaseArea)" />
          <path className={styles.line} pathLength={1} d={line} />
          <circle className={styles.halo} cx="418" cy={lastY} r="5" />
          <circle className={styles.dot} cx="418" cy={lastY} r="4.5" />
        </svg>
      </div>
      <div className={styles.months}>{m.monthTicks.map(t => <span key={t}>{t}</span>)}</div>
    </div>
  )
}

function WhatsAppScene({ day }: { day: ShowcaseDay }) {
  const w = day.wa
  const phrase = w.phrase[0].toUpperCase() + w.phrase.slice(1)
  return (
    <div className={styles.panel}>
      <div className={styles.wh}>
        <span className={styles.av}>{w.initials}</span>
        <div><b>{w.name}</b><small>WhatsApp da clínica, automático</small></div>
      </div>
      <div className={styles.chat}>
        <div className={`${styles.bub} ${styles.me}`}>Oi, {w.first}! {phrase} é amanhã às {w.at}. Posso confirmar?<small>{w.sentAt}</small></div>
        <div className={styles.reply}>
          <div className={styles.typing}><i /><i /><i /></div>
          <div className={`${styles.bub} ${styles.them}`}>{w.reply}<small>{w.replyAt}</small></div>
        </div>
        <div className={styles.sys}><Check />Agenda atualizada: {w.first} {w.female ? 'confirmada' : 'confirmado'}</div>
      </div>
    </div>
  )
}

/**
 * Vitrine do login: três cenas de um dia de clínica (agenda, financeiro, WhatsApp) que passam sozinhas.
 * A linha de batimento embaixo das abas é o relógio: ao terminar de se desenhar, troca de cena.
 * Pausa com o mouse ou o foco por cima; com movimento reduzido tudo fica parado no estado final.
 */
export function LoginShowcase() {
  const [cur, setCur] = useState(0)
  // a cada volta completa das três cenas sorteia-se um dia novo (nomes, horários, valores)
  const [cycle, setCycle] = useState(0)
  const clock = useShowcaseClock()
  const day = useMemo(() => (clock ? buildDay(clock.seed + cycle * 7919, clock.now) : null), [clock, cycle])
  const [paused, setPaused] = useState(false)
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  function go(i: number) { setCur(i) }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (cur + d + SCENES.length) % SCENES.length
    go(n)
    tabRefs.current[n]?.focus()
  }

  if (!day) return null

  const ecgStyle = {
    '--from': 3 - cur,
    '--to': 2 - cur,
    strokeDashoffset: reduce ? 2 - cur : 3 - cur,
  } as CSSProperties

  return (
    <div
      className={styles.show}
      data-paused={paused}
      aria-label="Exemplo do sistema, com dados imaginários"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className={styles.tabs} role="tablist">
        {SCENES.map((name, i) => (
          <button
            key={name}
            ref={el => { tabRefs.current[i] = el }}
            id={`login-show-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={cur === i}
            aria-controls="login-show-panel"
            tabIndex={cur === i ? 0 : -1}
            className={styles.tab}
            onClick={() => go(i)}
            onKeyDown={onKeyDown}
          >{name}</button>
        ))}
      </div>
      <svg className={styles.ecg} viewBox="0 0 480 28" preserveAspectRatio="none" aria-hidden="true">
        <path className={styles.ecgBg} d="M0 17h62l6-11l8 22l6-17l4 6h74h62l6-11l8 22l6-17l4 6h74h62l6-11l8 22l6-17l4 6h74" />
        <path
          key={cur}
          className={`${styles.ecgFg} ${reduce ? '' : styles.ecgRun}`}
          style={ecgStyle}
          pathLength={3}
          d="M0 17h62l6-11l8 22l6-17l4 6h74h62l6-11l8 22l6-17l4 6h74h62l6-11l8 22l6-17l4 6h74"
          onAnimationEnd={() => { const n = (cur + 1) % SCENES.length; if (n === 0) setCycle(c => c + 1); go(n) }}
        />
      </svg>
      <div className={styles.stage} id="login-show-panel" role="tabpanel" aria-labelledby={`login-show-tab-${cur}`}>
        <div key={cur} className={styles.scene}>
          {cur === 0 && <AgendaScene day={day} />}
          {cur === 1 && <FinanceScene day={day} reduce={reduce} />}
          {cur === 2 && <WhatsAppScene day={day} />}
        </div>
      </div>
    </div>
  )
}
