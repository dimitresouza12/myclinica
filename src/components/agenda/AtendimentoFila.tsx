'use client'
import { useEffect, useMemo, useState } from 'react'
import { buildQueue, type QueueAppt, type QueueItem } from '@/lib/atendimento/queue'
import { formatBrasilTime, formatMinutes, waitTone } from '@/lib/atendimento/time'
import styles from './atendimentoFila.module.css'

interface Props {
  appointments: QueueAppt[]
  /** dia da fila, AAAA-MM-DD em Brasília */
  dayKey: string
  /** pode agir (permissão de edição da agenda) */
  canEdit: boolean
  busyId: string | null
  onOpen: (id: string) => void
  onCall: (id: string) => void
}

const STORE_KEY = 'agenda.fila.open'

/**
 * Fila do dia para a recepção: aguardando (com tempo de espera), em atendimento e atendidos.
 * Mostra horários e esperas, nunca um cronômetro correndo: o cronômetro da consulta é só do profissional (Prontuário).
 */
export function AtendimentoFila({ appointments, dayKey, canEdit, busyId, onOpen, onCall }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState(() => {
    try { return window.localStorage.getItem(STORE_KEY) !== '0' } catch { return true /* sem armazenamento: fica aberta */ }
  })
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const queue = useMemo(() => buildQueue(appointments, dayKey, new Date(now)), [appointments, dayKey, now])
  const { waiting, inProgress, done, byProfessional } = queue

  function toggle() {
    setOpen(v => {
      try { window.localStorage.setItem(STORE_KEY, v ? '0' : '1') } catch { /* só vale nesta sessão */ }
      return !v
    })
  }

  const summary = waiting.length + inProgress.length + done.length === 0
    ? 'Ninguém chegou ainda'
    : [
        `${waiting.length} aguardando`,
        `${inProgress.length} em atendimento`,
        `${done.length} ${done.length === 1 ? 'atendido' : 'atendidos'}`,
      ].join(' · ')

  const first = (s: string | null) => (s ? s.split(' ').slice(0, 2).join(' ') : null)

  const row = (it: QueueItem, extra: React.ReactNode, action?: React.ReactNode) => (
    <li key={it.id} className={styles.itemWrap}>
      <button type="button" className={styles.item} onClick={() => onOpen(it.id)}>
        <span className={styles.name}>{it.patientName}</span>
        <span className={styles.meta}>{[first(it.professionalName), `marcado ${formatBrasilTime(it.scheduledAt)}`].filter(Boolean).join(' · ')}</span>
        {extra}
      </button>
      {action}
    </li>
  )

  return (
    <section className={styles.panel} aria-label="Fila do dia">
      <button type="button" className={styles.head} onClick={toggle} aria-expanded={open}>
        <span className={styles.title}>Fila de hoje</span>
        <span className={styles.summary}>{summary}</span>
        <span className={`${styles.chev} ${open ? styles.chevOpen : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.cols}>
          <div className={styles.col}>
            <h3 className={styles.colTitle}>Aguardando <span className={styles.count}>{waiting.length}</span></h3>
            {byProfessional.length > 1 && (
              <ul className={styles.perProf} aria-label="Espera por profissional">
                {byProfessional.map(p => (
                  <li key={p.professionalId ?? 'none'}>{first(p.name)}: {p.count} · maior espera {formatMinutes(p.longestMs)}</li>
                ))}
              </ul>
            )}
            {waiting.length === 0 ? <p className={styles.empty}>Ninguém aguardando.</p> : (
              <ul className={styles.list}>
                {waiting.map(it => row(
                  it,
                  <span className={styles.tags}>
                    <span className={`${styles.wait} ${styles[`wait_${waitTone(it.waitedMs ?? 0)}`]}`}>aguarda {formatMinutes(it.waitedMs ?? 0)}</span>
                    {it.calledAt && <span className={styles.called}>chamado {formatBrasilTime(it.calledAt)}</span>}
                  </span>,
                  canEdit && (
                    <button type="button" className={styles.callBtn} onClick={() => onCall(it.id)} disabled={busyId === it.id}>
                      {it.calledAt ? 'Chamar de novo' : 'Chamar'}
                    </button>
                  ),
                ))}
              </ul>
            )}
          </div>
          <div className={styles.col}>
            <h3 className={styles.colTitle}>Em atendimento <span className={styles.count}>{inProgress.length}</span></h3>
            {inProgress.length === 0 ? <p className={styles.empty}>Nenhum atendimento em andamento.</p> : (
              <ul className={styles.list}>
                {inProgress.map(it => row(it, <span className={styles.tags}><span className={styles.now}>desde {formatBrasilTime(it.startedAt)}</span></span>))}
              </ul>
            )}
          </div>
          <div className={styles.col}>
            <h3 className={styles.colTitle}>Atendidos <span className={styles.count}>{done.length}</span></h3>
            {done.length === 0 ? <p className={styles.empty}>Nenhum atendimento finalizado.</p> : (
              <ul className={styles.list}>
                {done.map(it => row(it, <span className={styles.tags}><span className={styles.doneTag}>{it.finishedAt ? `saiu ${formatBrasilTime(it.finishedAt)}` : 'concluído'}</span></span>))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
