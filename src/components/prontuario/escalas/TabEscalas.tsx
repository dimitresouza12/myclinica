'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import { PillTabs } from '@/components/ui/PillTabs'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import { brasilDayOf } from '@/lib/brasilDate'
import { brDate } from '@/lib/metas/relatorio'
import type { SeriesPoint } from '@/lib/metas/progress'
import {
  ESCALAS, formatarValor, opcoesDoItem, pontuar, respostasVazias,
  type EscalaDef, type EscalaId, type Respostas, type TomFaixa,
} from '@/lib/escalas/escalas'
import { lerEntrada, montarEntrada, type EscalaLida } from '@/lib/escalas/registro'
import type { MedicalRecord, Patient, RecordEntry } from '@/types'
import { ProgressChart } from '../metas/ProgressChart'
import styles from './escalas.module.css'

interface Props {
  patient: Patient
  clinicId: string
  record: MedicalRecord | null
  entries: RecordEntry[]
  entriesLoading: boolean
  /** Escalas oferecidas a quem está logado (ver escalasParaAreas) */
  escalas: EscalaDef[]
  onSaved: () => void
  onDirtyChange?: (dirty: boolean) => void
}

const TOM_CLASS: Record<TomFaixa, string> = {
  ok: styles.tomOk, info: styles.tomInfo, wait: styles.tomWait, warn: styles.tomWarn, bad: styles.tomBad,
}

const AVISO_RISCO = 'O item 9 foi marcado como positivo (pensamentos de se ferir ou de que seria melhor estar morto). Avalie o risco com o paciente ainda neste atendimento e siga o protocolo de cuidado do seu serviço. Em risco imediato, acione a urgência (SAMU 192); o CVV atende pelo 188, 24 horas.'

function AvisoRisco({ compact }: { compact?: boolean }) {
  return (
    <div className={styles.risk} role="alert">
      <Icon name="alert" size={20} aria-hidden="true" />
      <div>
        <div className={styles.riskTitle}>Atenção clínica: item 9 positivo</div>
        {!compact && <div className={styles.riskText}>{AVISO_RISCO}</div>}
      </div>
    </div>
  )
}

interface HistLinha { id: string; day: string; lida: EscalaLida; author: string | null }

export function TabEscalas({ patient, clinicId, record, entries, entriesLoading, escalas, onSaved, onDirtyChange }: Props) {
  const user = useAuthStore(s => s.user)
  const [escalaId, setEscalaId] = useState<EscalaId>(escalas[0]?.id ?? 'phq9')
  // um rascunho por escala: trocar de aba não perde o que já foi marcado
  const [rascunhos, setRascunhos] = useState<Partial<Record<EscalaId, Respostas>>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const def = ESCALAS[escalas.some(e => e.id === escalaId) ? escalaId : (escalas[0]?.id ?? 'phq9')]
  const respostas = rascunhos[def.id] ?? respostasVazias(def)
  const res = useMemo(() => pontuar(def, respostas), [def, respostas])

  const dirty = Object.values(rascunhos).some(r => r?.some(v => v !== null))
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  function setResposta(indice: number, valor: number) {
    setError('')
    setRascunhos(prev => {
      const atual = prev[def.id] ?? respostasVazias(def)
      const next = atual.slice()
      next[indice] = next[indice] === valor ? null : valor
      return { ...prev, [def.id]: next }
    })
  }

  const historico = useMemo<HistLinha[]>(() => {
    const out: HistLinha[] = []
    for (const e of entries) {
      const lida = lerEntrada(e.entry_text)
      if (!lida || lida.id !== def.id) continue
      out.push({ id: e.id, day: brasilDayOf(e.created_at) ?? e.created_at.slice(0, 10), lida, author: e.author_name })
    }
    // do mais recente para o mais antigo (entries já vem assim, mas não dependemos disso)
    return out.sort((a, b) => b.day.localeCompare(a.day))
  }, [entries, def.id])

  const serie = useMemo<SeriesPoint[]>(
    () => [...historico].reverse().map(h => ({ date: h.day, score: h.lida.resultado.valor ?? 0 })),
    [historico],
  )

  async function save() {
    if (!res.completo || saving) return
    setSaving(true)
    setError('')
    try {
      let recordId = record?.id
      if (!recordId) {
        const { data, error: recErr } = await supabase
          .from('medical_records')
          .insert([{ clinic_id: clinicId, patient_id: patient.id }])
          .select('id')
          .single()
        if (recErr) throw new Error('Erro ao criar prontuário: ' + recErr.message)
        recordId = data?.id
      }
      if (!recordId) throw new Error('Falha ao criar prontuário.')

      const entrada = montarEntrada(def, respostas)
      const { error: entryErr } = await supabase.from('record_entries').insert([{
        clinic_id: clinicId,
        patient_id: patient.id,
        record_id: recordId,
        entry_text: entrada.entry_text,
        entry_type: entrada.entry_type,
        author_name: user?.displayName ?? 'Sistema',
        professional_id: user?.professionalId ?? null,
        photo_urls: [],
      }])
      if (entryErr) throw new Error('Erro ao salvar a escala: ' + entryErr.message)

      if (user?.id) {
        await audit({
          action: 'prontuario.update',
          user_id: user.id,
          clinic_id: clinicId,
          module: 'prontuario',
          resource_id: patient.id,
          details: { escala: def.id },
        })
      }
      setRascunhos(prev => ({ ...prev, [def.id]: respostasVazias(def) }))
      showToast('ok', `${def.sigla} registrado no prontuário.`)
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const pontuaveis = def.itens.filter(i => i.pontua !== false).length
  const pct = res.valor === null ? 0 : Math.round((res.valor / def.maximo) * 100)

  return (
    <div className={styles.wrap}>
      {escalas.length > 1 && (
        <PillTabs<EscalaId> label="Escala" value={def.id} onChange={id => { setEscalaId(id); setError('') }}
          options={escalas.map(e => ({ value: e.id, label: e.sigla }))} />
      )}

      <div className={styles.head}>
        <div className={styles.title}>{def.nome}</div>
        <div className={styles.sub}>{def.instrucao}</div>
      </div>

      {res.alertaRisco && <AvisoRisco />}

      <div className={styles.card}>
        <div className={styles.cardTitle}>Nova aplicação</div>
        <div className={styles.progress} aria-live="polite">
          {res.respondidos} de {pontuaveis} {def.unidade === 'percentual' ? 'seções' : 'itens'} respondidos
        </div>

        <div>
          {def.itens.map((item, i) => {
            const opcoes = opcoesDoItem(def, i)
            const lista = opcoes.length > 4
            const itemRisco = def.id === 'phq9' && i === 8
            const labelId = `esc-${def.id}-${i}`
            return (
              <div key={`${def.id}-${i}`} className={styles.item}>
                <div className={styles.itemText} id={labelId}>
                  {item.pontua !== false && def.id !== 'odi' && <span className={styles.itemNum}>{i + 1}.</span>}
                  {item.texto}
                </div>
                {item.pontua === false && <div className={styles.itemHint}>Pergunta de apoio, não entra na pontuação.</div>}
                <div className={lista ? styles.optsList : `${styles.opts} ${styles.optsGrid}`} role="group" aria-labelledby={labelId}>
                  {opcoes.map(op => (
                    <button
                      key={op.valor}
                      type="button"
                      className={`${styles.opt} ${itemRisco && op.valor > 0 ? styles.optRisk : ''}`}
                      aria-pressed={respostas[i] === op.valor}
                      onClick={() => setResposta(i, op.valor)}
                    >
                      <span className={styles.optVal} aria-hidden="true">{op.valor}</span>
                      <span>{op.rotulo}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className={styles.result} aria-live="polite">
          <div className={styles.resultRow}>
            <span className={styles.big}>{res.valor === null ? '-' : def.unidade === 'percentual' ? `${res.valor}%` : res.valor}</span>
            {def.unidade === 'pontos' && <span className={styles.bigUnit}>de {def.maximo} pontos</span>}
            {res.faixa && <span className={`${styles.chip} ${TOM_CLASS[res.faixa.tom]}`}>{res.faixa.rotulo}</span>}
          </div>
          <div className={styles.bar} aria-hidden="true"><div className={styles.barFill} style={{ width: `${pct}%` }} /></div>
          <div className={styles.resultLbl}>
            {res.completo
              ? `${def.dominio}. ${def.unidade === 'percentual' ? 'Percentual de incapacidade calculado sobre as seções respondidas.' : 'Soma dos itens respondidos.'}`
              : `Responda ${def.omissoesPermitidas > 0 ? `ao menos ${pontuaveis - def.omissoesPermitidas} das ${pontuaveis} seções` : `todos os ${pontuaveis} itens`} para ver o resultado.`}
          </div>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.btnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!res.completo || saving} onClick={() => void save()}>
            {saving ? 'Salvando...' : 'Salvar no prontuário'}
          </button>
          <button type="button" className={styles.btn} disabled={saving || respostas.every(v => v === null)}
            onClick={() => { setError(''); setRascunhos(prev => ({ ...prev, [def.id]: respostasVazias(def) })) }}>
            Limpar respostas
          </button>
        </div>
        <div className={styles.itemHint}>O registro entra na aba Evolução, com a data de hoje, e não pode ser editado depois.</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Evolução do {def.sigla}</div>
        {entriesLoading ? (
          <div className={styles.loading}>Carregando...</div>
        ) : serie.length > 1 ? (
          <div className={styles.chart}>
            <ProgressChart series={serie} label={`${def.sigla} por data de aplicação`} height={180}
              unit={def.unidade === 'percentual' ? '%' : ''} yMax={def.maximo} yTicks={def.eixo} />
          </div>
        ) : (
          <div className={styles.empty}>{serie.length === 1 ? 'Com mais uma aplicação o gráfico de evolução aparece aqui.' : 'Nenhuma aplicação registrada ainda.'}</div>
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
              const delta = anterior && h.lida.resultado.valor !== null && anterior.lida.resultado.valor !== null
                ? h.lida.resultado.valor - anterior.lida.resultado.valor : null
              const risco = h.lida.resultado.alertaRisco
              return (
                <details key={h.id} className={`${styles.hItem} ${risco ? styles.hItemRisk : ''}`}>
                  <summary className={styles.hSum}>
                    <span className={styles.hDate}>{brDate(h.day)}</span>
                    <span className={styles.hVal}>{formatarValor(def, h.lida.resultado.valor ?? 0)}</span>
                    {h.lida.resultado.faixa && <span className={`${styles.chip} ${TOM_CLASS[h.lida.resultado.faixa.tom]}`}>{h.lida.resultado.faixa.rotulo}</span>}
                    {risco && <span className={`${styles.chip} ${styles.tomBad}`}><Icon name="alert" size={12} aria-hidden="true" /> Item 9 positivo</span>}
                    {delta !== null && delta !== 0 && (
                      <span className={styles.hDelta}>{delta > 0 ? '+' : '-'}{Math.abs(delta)}{def.unidade === 'percentual' ? ' p.p.' : ''} desde a anterior</span>
                    )}
                  </summary>
                  <div className={styles.hBody}>
                    {risco && <AvisoRisco compact />}
                    {def.itens.map((item, i) => {
                      const v = h.lida.respostas[i]
                      if (v === null) return null
                      const op = opcoesDoItem(def, i)
                      const texto = op.length <= 4 ? op.find(o => o.valor === v)?.rotulo ?? String(v) : `${v} de ${Math.max(...op.map(o => o.valor))}`
                      return <div key={i} className={styles.hAns}>{i + 1}. {item.curto}: <b>{texto}</b></div>
                    })}
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
        <div>{def.fonte.portugues}</div>
        {def.fonte.nota && <div>{def.fonte.nota}</div>}
      </div>
    </div>
  )
}
