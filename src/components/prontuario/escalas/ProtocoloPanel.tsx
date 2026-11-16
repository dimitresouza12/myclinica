'use client'
import { useEffect, useMemo, useState } from 'react'
import { brasilDayOf } from '@/lib/brasilDate'
import { brDate } from '@/lib/metas/relatorio'
import type { SeriesPoint } from '@/lib/metas/progress'
import type { TomFaixa } from '@/lib/escalas/escalas'
import { mesmoConteudo, type ProtocoloDef } from '@/lib/escalas/protocolos'
import type { AudiogramaDados } from '@/lib/escalas/audiograma'
import type { VozDados } from '@/lib/escalas/fichaVoz'
import type { FluenciaDados } from '@/lib/escalas/fichaFluencia'
import type { MofDados } from '@/lib/escalas/fichaMof'
import { lerProtocolo, moduloDe, montarEntradaProtocolo, type DadosProtocolo, type ProtocoloLido } from '@/lib/escalas/registro'
import type { MedicalRecord, Patient, RecordEntry } from '@/types'
import { ProgressChart } from '../metas/ProgressChart'
import { AudiogramaChart } from './AudiogramaChart'
import { FormAudiograma } from './FormAudiograma'
import { FormFluencia } from './FormFluencia'
import { FormMof } from './FormMof'
import { FormVoz } from './FormVoz'
import { useGravarEntrada } from './useGravarEntrada'
import styles from './escalas.module.css'
import f from './protocolos.module.css'

const TOM_CLASS: Record<TomFaixa, string> = {
  ok: styles.tomOk, info: styles.tomInfo, wait: styles.tomWait, warn: styles.tomWarn, bad: styles.tomBad,
}

interface Props {
  def: ProtocoloDef
  patient: Patient
  clinicId: string
  record: MedicalRecord | null
  entries: RecordEntry[]
  entriesLoading: boolean
  onSaved: () => void
  onDirtyChange: (id: string, dirty: boolean) => void
}

interface HistLinha { id: string; day: string; lida: ProtocoloLido; author: string | null }

const fmt = (n: number) => String(n).replace('.', ',')

/** Uma ficha estruturada (audiograma, voz, fluência, motricidade orofacial): preenchimento, evolução e histórico. */
export function ProtocoloPanel({ def, patient, clinicId, record, entries, entriesLoading, onSaved, onDirtyChange }: Props) {
  const modulo = useMemo(() => moduloDe(def.id), [def.id])
  const [dados, setDados] = useState<DadosProtocolo>(() => moduloDe(def.id).vazio())
  const { gravar, saving, erro, limparErro } = useGravarEntrada({ patient, clinicId, record, onSaved })

  const dirty = !mesmoConteudo(dados, modulo.vazio())
  useEffect(() => { onDirtyChange(def.id, dirty) }, [dirty, onDirtyChange, def.id])
  useEffect(() => () => onDirtyChange(def.id, false), [onDirtyChange, def.id])

  const pronto = useMemo(() => modulo.pronto(modulo.normalizar(dados)), [modulo, dados])

  function muda(d: DadosProtocolo) {
    limparErro()
    setDados(d)
  }

  async function save() {
    if (!pronto || saving) return
    const ok = await gravar(montarEntradaProtocolo(def, dados), { protocolo: def.id }, `Registro de ${def.sigla} salvo no prontuário.`)
    if (ok) setDados(modulo.vazio())
  }

  const historico = useMemo<HistLinha[]>(() => {
    const out: HistLinha[] = []
    for (const e of entries) {
      const lida = lerProtocolo(e.entry_text)
      if (!lida || lida.id !== def.id) continue
      out.push({ id: e.id, day: brasilDayOf(e.created_at) ?? e.created_at.slice(0, 10), lida, author: e.author_name })
    }
    return out.sort((a, b) => b.day.localeCompare(a.day))
  }, [entries, def.id])

  const series = useMemo(
    () => modulo.indicadores.map((ind, k) => ({
      ind,
      serie: [...historico].reverse().flatMap<SeriesPoint>(h => {
        const v = h.lida.indicadores[k]
        return v === null || v === undefined ? [] : [{ date: h.day, score: v }]
      }),
    })),
    [modulo, historico],
  )
  const comGrafico = series.filter(s => s.serie.length > 1)

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.title}>{def.nome}</div>
        <div className={styles.sub}>{def.instrucao}</div>
      </div>

      {def.id === 'audiograma' && <FormAudiograma dados={dados as AudiogramaDados} onChange={muda} />}
      {def.id === 'voz' && <FormVoz dados={dados as VozDados} onChange={muda} />}
      {def.id === 'fluencia' && <FormFluencia dados={dados as FluenciaDados} onChange={muda} />}
      {def.id === 'mof' && <FormMof dados={dados as MofDados} onChange={muda} />}

      <div className={styles.card}>
        {erro && <div className={styles.error} role="alert">{erro}</div>}
        <div className={styles.btnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!pronto || saving} onClick={() => void save()}>
            {saving ? 'Salvando...' : 'Salvar no prontuário'}
          </button>
          <button type="button" className={styles.btn} disabled={saving || !dirty} onClick={() => muda(modulo.vazio())}>
            Limpar ficha
          </button>
        </div>
        {!pronto && <div className={styles.itemHint}>{def.id === 'fluencia' ? 'Informe o total de palavras ou sílabas da amostra para salvar.' : 'Preencha ao menos um campo para salvar.'}</div>}
        <div className={styles.itemHint}>O registro entra na aba Evolução, com a data de hoje, e não pode ser editado depois.</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Evolução</div>
        {entriesLoading ? (
          <div className={styles.loading}>Carregando...</div>
        ) : comGrafico.length > 0 ? (
          <div className={f.charts}>
            {comGrafico.map(({ ind, serie }) => (
              <div key={ind.id} className={styles.chart}>
                <div className={f.chartTitle}>{ind.rotulo}</div>
                <ProgressChart series={serie} label={`${ind.rotulo}, por data de aplicação`} height={150} unit={ind.unidade} yMax={ind.yMax} yTicks={ind.yTicks} />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>{historico.length === 1 ? 'Com mais uma aplicação o gráfico de evolução aparece aqui.' : 'Nenhuma aplicação registrada ainda.'}</div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Histórico por data</div>
        {entriesLoading ? (
          <div className={styles.loading}>Carregando...</div>
        ) : historico.length === 0 ? (
          <div className={styles.empty}>Nenhuma aplicação registrada ainda.</div>
        ) : (
          <div className={styles.history}>
            {historico.map((h, idx) => {
              const anterior = historico[idx + 1]
              const deltas = anterior
                ? modulo.indicadores.flatMap((ind, k) => {
                    const a = h.lida.indicadores[k]
                    const b = anterior.lida.indicadores[k]
                    if (a === null || a === undefined || b === null || b === undefined || a === b) return []
                    const dif = Math.round((a - b) * 10) / 10
                    return [`${ind.rotulo}: ${dif > 0 ? '+' : '-'}${fmt(Math.abs(dif))}${ind.unidade ? ` ${ind.unidade}` : ''} desde a anterior`]
                  })
                : []
              return (
                <details key={h.id} className={styles.hItem}>
                  <summary className={styles.hSum}>
                    <span className={styles.hDate}>{brDate(h.day)}</span>
                    {h.lida.destaque && <span className={`${styles.chip} ${TOM_CLASS[h.lida.destaque.tom]}`}>{h.lida.destaque.rotulo}</span>}
                  </summary>
                  <div className={styles.hBody}>
                    {h.lida.id === 'audiograma' && <AudiogramaChart dados={h.lida.dados as AudiogramaDados} />}
                    <div className={f.histLines}>
                      {h.lida.resumo.map((linha, i) => <div key={i} className={f.histLine}>{linha}</div>)}
                    </div>
                    {deltas.length > 0 && <div className={f.deltaList}>{deltas.map(t => <span key={t} className={styles.hDelta}>{t}</span>)}</div>}
                    {h.author && <div className={styles.hMeta}>Aplicado por {h.author}</div>}
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </div>

      <div className={`${styles.card} ${styles.source}`}>
        <div className={styles.sourceTitle}>Fonte e versão</div>
        <div>{def.fonte.original}</div>
        <div>{def.fonte.nota}</div>
      </div>
    </div>
  )
}
