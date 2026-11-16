'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PillTabs } from '@/components/ui/PillTabs'
import { Icon } from '@/components/ui/Icon'
import { brasilDayOf } from '@/lib/brasilDate'
import { brDate } from '@/lib/metas/relatorio'
import type { SeriesPoint } from '@/lib/metas/progress'
import {
  formatarValor, opcoesCurtas, opcoesDoItem, pontuar, respostasVazias,
  type EscalaDef, type Respostas, type TomFaixa,
} from '@/lib/escalas/escalas'
import { isProtocolo, type AvaliacaoDef } from '@/lib/escalas/protocolos'
import { lerEntrada, montarEntrada, type EscalaLida } from '@/lib/escalas/registro'
import type { MedicalRecord, Patient, RecordEntry } from '@/types'
import { ProgressChart } from '../metas/ProgressChart'
import { ProtocoloPanel } from './ProtocoloPanel'
import { useGravarEntrada } from './useGravarEntrada'
import styles from './escalas.module.css'
import extra from './protocolos.module.css'

interface Props {
  patient: Patient
  clinicId: string
  record: MedicalRecord | null
  entries: RecordEntry[]
  entriesLoading: boolean
  /** Escalas e fichas oferecidas a quem está logado (ver escalasParaAreas) */
  escalas: AvaliacaoDef[]
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

type PropsPainel = Omit<Props, 'escalas' | 'onDirtyChange'> & { def: EscalaDef; onDirtyChange: (id: string, dirty: boolean) => void }

/** Uma escala de soma: itens, resultado, evolução e histórico. */
function EscalaPanel({ def, patient, clinicId, record, entries, entriesLoading, onSaved, onDirtyChange }: PropsPainel) {
  const [respostas, setRespostas] = useState<Respostas>(() => respostasVazias(def))
  const [error, setError] = useState('')
  const { gravar, saving, erro, limparErro } = useGravarEntrada({ patient, clinicId, record, onSaved })
  const res = useMemo(() => pontuar(def, respostas), [def, respostas])

  const dirty = respostas.some(v => v !== null)
  useEffect(() => { onDirtyChange(def.id, dirty) }, [dirty, onDirtyChange, def.id])
  useEffect(() => () => onDirtyChange(def.id, false), [onDirtyChange, def.id])

  function setResposta(indice: number, valor: number) {
    setError('')
    limparErro()
    setRespostas(prev => {
      const next = prev.slice()
      next[indice] = next[indice] === valor ? null : valor
      return next
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
    setError('')
    const ok = await gravar(montarEntrada(def, respostas), { escala: def.id }, `${def.sigla} registrado no prontuário.`)
    if (ok) setRespostas(respostasVazias(def))
  }

  const pontuaveis = def.itens.filter(i => i.pontua !== false).length
  const pct = res.valor === null ? 0 : Math.round((res.valor / def.maximo) * 100)
  const subs = useMemo(() => def.subescalas ?? [], [def])
  // série de cada subescala (escalas sem total geral: DASS-21 e checklists)
  const seriesSub = useMemo(
    () => subs.map((sub, k) => ({
      sub,
      serie: [...historico].reverse().map(h => ({ date: h.day, score: h.lida.resultado.subescalas[k]?.valor ?? 0 })),
    })),
    [subs, historico],
  )

  return (
    <div className={styles.wrap}>
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
            const lista = !opcoesCurtas(def, i)
            const itemRisco = def.id === 'phq9' && i === 8
            const labelId = `esc-${def.id}-${i}`
            // checklists por área: título do grupo antes do primeiro item (só quando a subescala é um bloco contínuo)
            const inicioGrupo = subs.find(sub => sub.itens[0] === i && sub.itens.every((v, k) => v === i + k))
            return (
              <div key={`${def.id}-${i}`} className={styles.item}>
                {inicioGrupo && <div className={extra.groupTitle}>{inicioGrupo.nome}</div>}
                <div className={styles.itemText} id={labelId}>
                  {item.pontua !== false && def.id !== 'odi' && <span className={styles.itemNum}>{i + 1}.</span>}
                  {item.texto}
                </div>
                {item.orientacao && <div className={styles.itemHint}>{item.orientacao}</div>}
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
          {subs.length > 0 ? (
            <div className={extra.subList}>
              {res.subescalas.map(sub => (
                <div key={sub.id} className={extra.subRow}>
                  <div className={extra.subHead}>
                    <span className={extra.subNome}>{sub.nome}</span>
                    <span className={extra.subVal}>{sub.valor === null ? '-' : `${sub.valor} de ${sub.maximo}`}</span>
                    {sub.faixa && <span className={`${styles.chip} ${TOM_CLASS[sub.faixa.tom]}`}>{sub.faixa.rotulo}</span>}
                  </div>
                  <div className={styles.bar} aria-hidden="true"><div className={styles.barFill} style={{ width: `${sub.valor === null ? 0 : Math.round((sub.valor / sub.maximo) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className={styles.resultRow}>
                <span className={styles.big}>{res.valor === null ? '-' : def.unidade === 'percentual' ? `${res.valor}%` : res.valor}</span>
                {def.unidade === 'pontos' && <span className={styles.bigUnit}>de {def.maximo} pontos</span>}
                {res.faixa && <span className={`${styles.chip} ${TOM_CLASS[res.faixa.tom]}`}>{res.faixa.rotulo}</span>}
              </div>
              <div className={styles.bar} aria-hidden="true"><div className={styles.barFill} style={{ width: `${pct}%` }} /></div>
            </>
          )}
          <div className={styles.resultLbl}>
            {res.completo
              ? `${def.dominio}. ${subs.length > 0 ? 'Cada parte tem a sua pontuação; não há total geral.' : def.unidade === 'percentual' ? 'Percentual de incapacidade calculado sobre as seções respondidas.' : def.multiplicador ? 'Soma dos itens respondidos, em escala de 0 a 100.' : 'Soma dos itens respondidos.'}`
              : `Responda ${def.omissoesPermitidas > 0 ? `ao menos ${pontuaveis - def.omissoesPermitidas} das ${pontuaveis} seções` : `todos os ${pontuaveis} itens`} para ver o resultado.`}
          </div>
        </div>

        {(error || erro) && <div className={styles.error} role="alert">{error || erro}</div>}
        <div className={styles.btnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!res.completo || saving} onClick={() => void save()}>
            {saving ? 'Salvando...' : 'Salvar no prontuário'}
          </button>
          <button type="button" className={styles.btn} disabled={saving || respostas.every(v => v === null)}
            onClick={() => { setError(''); limparErro(); setRespostas(respostasVazias(def)) }}>
            Limpar respostas
          </button>
        </div>
        <div className={styles.itemHint}>O registro entra na aba Evolução, com a data de hoje, e não pode ser editado depois.</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Evolução do {def.sigla}</div>
        {entriesLoading ? (
          <div className={styles.loading}>Carregando...</div>
        ) : subs.length > 0 ? (
          seriesSub[0] && seriesSub[0].serie.length > 1 ? (
            <div className={extra.charts}>
              {seriesSub.map(({ sub, serie: sr }) => (
                <div key={sub.id} className={styles.chart}>
                  <div className={extra.chartTitle}>{sub.nome}</div>
                  <ProgressChart series={sr} label={`${def.sigla}: ${sub.nome}, por data de aplicação`} height={150} unit="" yMax={sub.maximo} yTicks={sub.eixo} />
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>{historico.length === 1 ? 'Com mais uma aplicação o gráfico de evolução aparece aqui.' : 'Nenhuma aplicação registrada ainda.'}</div>
          )
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
                    {subs.length > 0 ? h.lida.resultado.subescalas.map(sub => (
                      <span key={sub.id} className={styles.chip + ' ' + (sub.faixa ? TOM_CLASS[sub.faixa.tom] : '')}>{sub.nome} {sub.valor ?? '-'}{sub.faixa ? `: ${sub.faixa.rotulo.toLowerCase()}` : ''}</span>
                    )) : (
                      <>
                        <span className={styles.hVal}>{formatarValor(def, h.lida.resultado.valor ?? 0)}</span>
                        {h.lida.resultado.faixa && <span className={`${styles.chip} ${TOM_CLASS[h.lida.resultado.faixa.tom]}`}>{h.lida.resultado.faixa.rotulo}</span>}
                      </>
                    )}
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
                      const texto = opcoesCurtas(def, i) ? op.find(o => o.valor === v)?.rotulo ?? String(v) : `${v} de ${Math.max(...op.map(o => o.valor))}`
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

/** Aba "Escalas" do prontuário: um seletor e, abaixo, a escala ou ficha escolhida. Os painéis ficam todos montados (só um visível)
 *  para que trocar de escala não perca o que já foi marcado. */
export function TabEscalas({ escalas, onDirtyChange, ...resto }: Props) {
  const [escalaId, setEscalaId] = useState<string>(escalas[0]?.id ?? '')
  const [sujas, setSujas] = useState<Record<string, boolean>>({})
  const atual = escalas.find(e => e.id === escalaId) ?? escalas[0]

  const dirty = Object.values(sujas).some(Boolean)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const marcar = useCallback((id: string, valor: boolean) => {
    setSujas(prev => (prev[id] === valor ? prev : { ...prev, [id]: valor }))
  }, [])

  if (!atual) return null

  return (
    <div className={styles.wrap}>
      {escalas.length > 1 && (
        <PillTabs<string> label="Escala" value={atual.id} onChange={setEscalaId}
          options={escalas.map(e => ({ value: e.id, label: e.sigla }))} />
      )}
      {escalas.map(def => (
        <div key={def.id} hidden={def.id !== atual.id}>
          {isProtocolo(def)
            ? <ProtocoloPanel def={def} {...resto} onDirtyChange={marcar} />
            : <EscalaPanel def={def} {...resto} onDirtyChange={marcar} />}
        </div>
      ))}
    </div>
  )
}
