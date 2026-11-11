'use client'
import { useMemo } from 'react'
import type { Patient } from '@/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { SERIES, normalizarAvaliacao, seriesDeEvolucao, variacao, type SerieChave } from '@/lib/nutri/avaliacao'
import { htmlEvolucao, imprimirNutri } from '@/lib/nutri/imprimir'
import type { LinhaNutri } from '@/lib/nutri/storage'
import { formatarNumero } from '@/lib/nutri/validacao'
import { GraficoLinha } from './GraficoLinha'
import { usePrintActions } from '../print/PrintRegistry'
import styles from './nutri.module.css'

const COR: Record<SerieChave, string> = { peso: styles.cPeso, massaMagra: styles.cMagra, massaGorda: styles.cGorda, cintura: styles.cCintura }

interface Props {
  patient: Patient
  clinica: { name: string; address?: string; phone?: string }
  linhas: LinhaNutri[]
  carregando: boolean
}

/** Gráficos de evolução (peso, massa magra, massa gorda, cintura) a partir do histórico de avaliações. */
export function EvolucaoPanel({ patient, clinica, linhas, carregando }: Props) {
  const series = useMemo(
    () => seriesDeEvolucao(linhas.map(l => ({ id: l.id, data: l.data, dados: normalizarAvaliacao(l.dados) })), patient.birth_date),
    [linhas, patient.birth_date],
  )

  function imprimir() {
    imprimirNutri(htmlEvolucao({ clinica: clinica.name, paciente: patient.name, detalhe: [clinica.address, clinica.phone].filter(Boolean).join(' | ') || undefined }, series))
  }

  // a impressão vai para o menu "Imprimir" do prontuário
  usePrintActions('nutri', [{
    id: 'nutri-evolucao',
    label: 'Evolução nutricional (gráficos)',
    includes: ['Gráficos de peso, massa magra, massa gorda e cintura', 'Variação desde a primeira avaliação'],
    disabledReason: carregando ? 'Carregando o histórico' : linhas.length === 0 ? 'Sem avaliações salvas ainda' : undefined,
    run: imprimir,
  }], 'evolucao')

  if (carregando) return <p className={styles.hint}>Carregando histórico...</p>
  if (linhas.length === 0) {
    return <EmptyState icon="reports" title="Sem avaliações ainda" description="Salve a primeira avaliação na aba Avaliação para começar o acompanhamento. Cada consulta vira um ponto nos gráficos." compact />
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.cardHead}>
        <p className={styles.cardSub}>{linhas.length === 1 ? '1 avaliação registrada' : `${linhas.length} avaliações registradas`}. A variação compara a primeira e a última medida de cada gráfico.</p>
      </div>
      <div className={styles.chartGrid}>
        {SERIES.map(s => {
          const pontos = series[s.chave]
          const v = variacao(pontos)
          return (
            <section key={s.chave} className={styles.chartCard} aria-label={s.rotulo}>
              <div className={styles.chartHead}>
                <h3 className={styles.chartTitle}>{s.rotulo} <span className={styles.unit}>({s.un})</span></h3>
                <span className={styles.chartDelta}>
                  {v === null ? (pontos.length === 1 ? 'Primeira medida' : '') : `${v > 0 ? '+' : ''}${formatarNumero(v, 1)} ${s.un} desde o início`}
                </span>
              </div>
              <GraficoLinha pontos={pontos} unidade={s.un} corClasse={COR[s.chave]} rotulo={s.rotulo} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
