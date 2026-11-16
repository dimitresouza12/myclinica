'use client'
import { useMemo } from 'react'
import type { Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { hojeBrasil } from '@/lib/brasilDate'
import { agruparPorDia, diasComRegistro, rotuloRefeicao } from '@/lib/nutri/diario'
import { MENSAGEM_DIARIO } from '@/lib/nutri/diarioStorage'
import { DIAS_DO_DIARIO, useDiario } from './useDiario'
import styles from './nutri.module.css'

const rotuloDia = (iso: string, hoje: string) => {
  if (iso === hoje) return 'Hoje'
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short' })
}

/** Diário alimentar que o paciente preenche pela página dele (link com o item "Diário alimentar"). Aqui a nutricionista só lê. */
export function DiarioPanel({ patient, clinicId }: { patient: Patient; clinicId: string }) {
  const { registros, fotos, carregando, motivo, recarregar } = useDiario(clinicId, patient.id)
  const hoje = hojeBrasil()
  const dias = useMemo(() => agruparPorDia(registros), [registros])
  const ultimos7 = diasComRegistro(registros, hoje, 7)

  return (
    <div className={styles.wrap}>
      {motivo && (
        <div className={styles.notice} role="status"><Icon name="alert" size={18} /><span>{MENSAGEM_DIARIO[motivo]}</span></div>
      )}

      <section className={styles.card} aria-label="Diário alimentar do paciente">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Diário alimentar</h3>
          <Button variant="secondary" icon="refresh" onClick={recarregar} disabled={carregando}>Atualizar</Button>
        </div>
        <p className={styles.cardSub}>
          O paciente registra refeição, horário, descrição e foto pela página dele. Para liberar, gere o link do paciente e marque Diário alimentar.
          Mostrando os últimos {DIAS_DO_DIARIO} dias.
        </p>
        {!motivo && registros.length > 0 && (
          <p className={styles.hint}>{ultimos7} de 7 dias com registro na última semana | {registros.length} {registros.length === 1 ? 'registro' : 'registros'} no período.</p>
        )}
        {carregando && <p className={styles.hint}>Carregando diário...</p>}
        {!carregando && !motivo && registros.length === 0 && (
          <p className={styles.empty}>Nenhum registro do paciente nos últimos {DIAS_DO_DIARIO} dias.</p>
        )}
      </section>

      {dias.map(d => (
        <section key={d.dia} className={styles.card} aria-label={rotuloDia(d.dia, hoje)}>
          <h3 className={styles.cardTitle}>{rotuloDia(d.dia, hoje)}</h3>
          <ul className={styles.diList}>
            {d.registros.map(r => {
              const url = r.foto_path ? fotos.get(r.foto_path) : undefined
              return (
                <li key={r.id} className={styles.diItem}>
                  <div className={styles.diHead}>
                    <span className={styles.recName}>{rotuloRefeicao(r.refeicao)}</span>
                    {r.horario && <span className={styles.hint}>{r.horario}</span>}
                  </div>
                  <p className={styles.diDesc}>{r.descricao}</p>
                  {r.foto_path && (url ? (
                    <a className={styles.diFotoLink} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir a foto de ${rotuloRefeicao(r.refeicao)} em tamanho maior`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className={styles.diFoto} src={url} alt={`Foto de ${rotuloRefeicao(r.refeicao)}`} loading="lazy" />
                    </a>
                  ) : <span className={styles.hint}>Foto indisponível no momento.</span>)}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
