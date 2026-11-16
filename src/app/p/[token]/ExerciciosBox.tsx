'use client'
import { useState } from 'react'
import { textoDaDose, textoDaFrequencia } from '@/lib/fisio/exercicios'
import type { ExerciciosPublicos } from '@/lib/fisio/portalView'
import styles from './portal.module.css'

interface Estado { done: boolean; week: number; busy: boolean; error: string }

/** Programa de exercícios na página do paciente: vídeo, foto e o botão de marcar como feito hoje (grava pelo servidor). */
export function ExerciciosBox({ token, data }: { token: string; data: ExerciciosPublicos }) {
  const [estado, setEstado] = useState<Record<string, Estado>>(() => {
    const e: Record<string, Estado> = {}
    for (const p of data.programs) for (const i of p.items) e[i.id] = { done: i.doneToday, week: i.doneLast7, busy: false, error: '' }
    return e
  })

  function patch(id: string, p: Partial<Estado>) {
    setEstado(cur => ({ ...cur, [id]: { ...cur[id], ...p } }))
  }

  async function alternar(id: string) {
    const atual = estado[id]
    if (!atual || atual.busy) return
    const feito = !atual.done
    patch(id, { busy: true, error: '' })
    try {
      const res = await fetch(`/api/p/${token}/exercicios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: id, done: feito }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { patch(id, { busy: false, error: json.error ?? 'Não foi possível salvar. Tente de novo.' }); return }
      setEstado(cur => {
        const c = cur[id]
        return { ...cur, [id]: { ...c, busy: false, done: feito, week: Math.max(0, c.week + (feito ? 1 : -1)) } }
      })
    } catch {
      patch(id, { busy: false, error: 'Sem conexão. Verifique a internet e tente de novo.' })
    }
  }

  if (data.programs.length === 0) {
    return <p className={styles.muted}>Seu programa de exercícios ainda não foi publicado.</p>
  }

  return (
    <div>
      {data.programs.map(p => (
        <div key={p.id} className={styles.exProgram}>
          {data.programs.length > 1 && <h3 className={styles.h3}>{p.title}</h3>}
          {p.notes && <p className={styles.pre}>{p.notes}</p>}
          <ul className={styles.list}>
            {p.items.map(i => {
              const st = estado[i.id] ?? { done: false, week: 0, busy: false, error: '' }
              const dose = textoDaDose(i.sets, i.reps)
              return (
                <li key={i.id} className={styles.exCard}>
                  {i.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.exImg} src={i.imageUrl} alt={`Foto do exercício ${i.name}`} loading="lazy" />
                  )}
                  <h3 className={styles.exName}>{i.name}</h3>
                  <ul className={styles.exMeta} aria-label="Resumo do exercício">
                    {i.region && <li className={styles.tag}>{i.region}</li>}
                    {dose && <li className={styles.tag}>{dose}</li>}
                    <li className={styles.tag}>{textoDaFrequencia(i.timesPerWeek)}</li>
                  </ul>
                  {i.description && <p className={styles.pre}>{i.description}</p>}
                  {i.notes && <p className={styles.note}>{i.notes}</p>}
                  <p className={styles.exWeek}>{`${st.week} de ${i.timesPerWeek} ${i.timesPerWeek === 1 ? 'vez' : 'vezes'} nos últimos 7 dias`}</p>
                  <div className={styles.exActions}>
                    {i.videoUrl && (
                      <a className={styles.exVideo} href={i.videoUrl} target="_blank" rel="noopener noreferrer">Assistir ao vídeo</a>
                    )}
                    <button
                      type="button"
                      className={st.done ? styles.exDone : styles.exTodo}
                      aria-pressed={st.done}
                      disabled={st.busy}
                      onClick={() => alternar(i.id)}
                    >
                      {st.busy ? 'Salvando...' : st.done ? 'Feito hoje. Toque para desfazer' : 'Marcar como feito hoje'}
                    </button>
                  </div>
                  {st.error && <p className={styles.error} role="alert">{st.error}</p>}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <p className={styles.legal}>Só é possível marcar o dia de hoje. A clínica acompanha o que você registra.</p>
    </div>
  )
}
