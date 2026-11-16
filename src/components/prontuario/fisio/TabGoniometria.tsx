'use client'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import type { AuthClinic, Patient } from '@/types'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { DecimalInput } from '@/components/ui/NumericInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { dataBr } from '@/lib/vet/datas'
import {
  ARTICULACOES, MAX_NOTA, ROTULO_MODO, ROTULO_NIVEL, ROTULO_TENDENCIA, agruparSeries, articulacaoPorChave, evolucaoDaSerie, lerAdm,
  referencia as referenciaDe, rotuloDaSerie, textoGraus, validarMedida, type Lado, type Medida, type Modo, type NivelAdm, type RascunhoMedida,
} from '@/lib/fisio/goniometria'
import { excluirMedida, listarMedidas, MENSAGEM_INDISPONIVEL, salvarMedida, type Indisponibilidade } from '@/lib/fisio/storage'
import { GraficoGonio } from './GraficoGonio'
import styles from './fisio.module.css'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
}

const TOM_NIVEL: Record<NivelAdm, BadgeTone> = { esperado: 'success', acima: 'info', leve: 'warning', moderado: 'warning', importante: 'danger' }
const TOM_TENDENCIA = { melhora: 'success', piora: 'danger', estavel: 'neutral' } as const
const SEM_MEDIDAS: Medida[] = []

const ARTICULACAO_OPCOES = [{ value: '', label: 'Escolher articulação' }, ...ARTICULACOES.map(a => ({ value: a.key, label: a.label }))]
const MODO_OPCOES = (['ativo', 'passivo'] as Modo[]).map(m => ({ value: m, label: ROTULO_MODO[m] }))

const referenciaTexto = (joint: string, movement: string): string => {
  const r = referenciaDe(joint, movement)
  return r === null ? '' : String(r)
}

/** Aba "Goniometria": registrar o ângulo por articulação e movimento, ver o histórico e a evolução em gráfico. */
export function TabGoniometria({ patient, clinicId }: Props) {
  const user = useAuthStore(s => s.user)
  const queryClient = useQueryClient()
  const hoje = hojeBrasil()
  const consulta = useQuery({ queryKey: ['fisio-gonio', clinicId, patient.id], queryFn: () => listarMedidas(clinicId, patient.id), staleTime: 15_000 })
  const medidas = consulta.data?.ok ? consulta.data.linhas : SEM_MEDIDAS
  const motivo: Indisponibilidade | null = consulta.data && !consulta.data.ok ? consulta.data.motivo : null

  const [form, setForm] = useState<RascunhoMedida | null>(null)
  const [refManual, setRefManual] = useState(false)
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [escolhida, setEscolhida] = useState<string | null>(null)

  const series = useMemo(() => agruparSeries(medidas), [medidas])
  const serie = series.find(s => s.chave === escolhida) ?? series[0] ?? null
  const evolucao = serie ? evolucaoDaSerie(serie) : null
  const ultima = serie ? serie.pontos[serie.pontos.length - 1] : null
  const leitura = serie && ultima ? lerAdm(ultima.angle_deg, serie.referencia) : null

  const art = form ? articulacaoPorChave(form.joint) : null
  const movimentoOpcoes = art ? [{ value: '', label: 'Escolher movimento' }, ...art.movimentos.map(m => ({ value: m.key, label: m.label }))] : [{ value: '', label: 'Escolha a articulação primeiro' }]
  const extensaoCompleta = form && form.referencia.trim() === '0'

  function abrir() {
    setErros([])
    setRefManual(false)
    setForm({ data: hoje, joint: '', movement: '', side: 'nao_se_aplica', mode: 'ativo', angulo: '', referencia: '', nota: '' })
  }
  const set = (patch: Partial<RascunhoMedida>) => { setForm(f => (f ? { ...f, ...patch } : f)); setErros([]) }

  function escolherArticulacao(joint: string) {
    const a = articulacaoPorChave(joint)
    setRefManual(false)
    set({ joint, movement: '', referencia: '', side: a?.lateral ? 'direito' : 'nao_se_aplica' })
  }
  function escolherMovimento(movement: string) {
    setForm(f => (f ? { ...f, movement, referencia: refManual ? f.referencia : referenciaTexto(f.joint, movement) } : f))
    setErros([])
  }

  async function salvar() {
    if (!form) return
    const v = validarMedida(form, hoje)
    if (!v.ok) { setErros(v.erros); return }
    setSalvando(true)
    const res = await salvarMedida({ clinicId, patientId: patient.id, professionalId: user?.professionalId ?? null, dados: v.dados })
    setSalvando(false)
    if (!res.ok) { setErros([MENSAGEM_INDISPONIVEL[res.motivo]]); return }
    await queryClient.invalidateQueries({ queryKey: ['fisio-gonio', clinicId, patient.id] })
    setEscolhida(`${v.dados.joint}|${v.dados.movement}|${v.dados.side}|${v.dados.mode}`)
    setForm(null)
    showToast('ok', 'Medida registrada.')
  }

  async function excluir(m: Medida) {
    const ok = await confirmDialog({
      title: 'Excluir esta medida?',
      message: `A medida de ${textoGraus(m.angle_deg)} em ${dataBr(m.measured_on)} será removida do histórico e do gráfico.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    const res = await excluirMedida({ id: m.id, clinicId })
    if (!res.ok) { showToast('error', 'Não foi possível excluir agora.'); return }
    await queryClient.invalidateQueries({ queryKey: ['fisio-gonio', clinicId, patient.id] })
  }

  if (consulta.isPending) return <p className={styles.hint}>Carregando goniometria...</p>

  return (
    <div className={styles.wrap}>
      {motivo && (
        <div className={styles.notice} role="status">
          <Icon name="info" size={18} />
          <div>{MENSAGEM_INDISPONIVEL[motivo]}</div>
        </div>
      )}

      <div className={styles.cardHead}>
        <p className={styles.cardSub}>
          {medidas.length === 0 ? 'Nenhuma medida registrada.' : `${medidas.length} ${medidas.length === 1 ? 'medida' : 'medidas'} em ${series.length} ${series.length === 1 ? 'série' : 'séries'}.`}
        </p>
        <div className={styles.row}>
          {!form && <Button variant="primary" icon="plus" onClick={abrir} disabled={motivo === 'sem_tabela'}>Registrar medida</Button>}
        </div>
      </div>

      {form && (
        <section className={styles.card} aria-label="Nova medida">
          <div className={styles.cardTitle}>Registrar medida</div>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="gn-data">Data</label>
              <DatePicker id="gn-data" value={form.data} onChange={v => set({ data: v || hoje })} max={hoje} ariaLabel="Data da medida" />
            </div>
            <div className={styles.field}>
              <label htmlFor="gn-art">Articulação</label>
              <SelectMenu id="gn-art" variant="field" value={form.joint} onChange={escolherArticulacao} ariaLabel="Articulação" options={ARTICULACAO_OPCOES} />
            </div>
            <div className={styles.field}>
              <label htmlFor="gn-mov">Movimento</label>
              <SelectMenu id="gn-mov" variant="field" value={form.movement} onChange={escolherMovimento} ariaLabel="Movimento" disabled={!art} options={movimentoOpcoes} />
            </div>
            {art?.lateral && (
              <div className={styles.field}>
                <span className={styles.label}>Lado</span>
                <div className={styles.chips} role="group" aria-label="Lado medido">
                  {(['direito', 'esquerdo'] as Lado[]).map(l => (
                    <button key={l} type="button" aria-pressed={form.side === l} className={`${styles.chip} ${form.side === l ? styles.chipOn : ''}`} onClick={() => set({ side: l })}>
                      {l === 'direito' ? 'Direito' : 'Esquerdo'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.field}>
              <span className={styles.label}>Tipo de movimento</span>
              <div className={styles.chips} role="group" aria-label="Ativo ou passivo">
                {MODO_OPCOES.map(o => (
                  <button key={o.value} type="button" aria-pressed={form.mode === o.value} className={`${styles.chip} ${form.mode === o.value ? styles.chipOn : ''}`} onClick={() => set({ mode: o.value })}>{o.label}</button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="gn-ang">Ângulo medido <span className={styles.unit}>(graus)</span></label>
              <DecimalInput id="gn-ang" className={`${styles.input} ${erros.length ? styles.inputErr : ''}`} value={form.angulo} onChange={v => set({ angulo: v })} max={360} decimals={1} placeholder="0" />
            </div>
            <div className={styles.field}>
              <label htmlFor="gn-ref">Valor normal <span className={styles.unit}>(referência, graus)</span></label>
              <DecimalInput id="gn-ref" className={styles.input} value={form.referencia} onChange={v => { setRefManual(true); set({ referencia: v }) }} max={360} decimals={1} placeholder="Sem referência" />
            </div>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="gn-nota">Observação <span className={styles.unit}>(opcional)</span></label>
              <input id="gn-nota" className={styles.input} value={form.nota} onChange={e => set({ nota: e.target.value })} maxLength={MAX_NOTA} placeholder="Ex.: dor no fim do movimento, goniômetro universal" />
            </div>
          </div>
          {extensaoCompleta && <p className={styles.hint}>Referência 0 graus: registre quantos graus faltam para a extensão completa (0 quando estende por inteiro).</p>}
          <p className={styles.hint}>O valor normal sugerido vem de tabelas de amplitude de movimento da literatura e muda com idade e método. Ajuste se usar outra referência.</p>
          {erros.length > 0 && (
            <div className={styles.avisos} role="alert">
              {erros.map(m => <span key={m} className={styles.errMsg}>{m}</span>)}
            </div>
          )}
          <div className={styles.saveRow}>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={salvando}>Cancelar</Button>
            <Button variant="primary" icon="check" loading={salvando} onClick={salvar}>Salvar medida</Button>
          </div>
        </section>
      )}

      {series.length === 0 && !form ? (
        <EmptyState icon="target" title="Sem goniometria registrada" description="Registre o ângulo de cada movimento a cada reavaliação. As medidas da mesma articulação, movimento e lado formam uma série com gráfico de evolução." compact />
      ) : serie && ultima && (
        <>
          <section className={styles.card} aria-label="Séries registradas">
            <div className={styles.cardTitle}>Séries</div>
            <div className={styles.chips} role="group" aria-label="Escolher a série">
              {series.map(s => {
                const u = s.pontos[s.pontos.length - 1]
                const ativa = s.chave === serie.chave
                return (
                  <button key={s.chave} type="button" aria-pressed={ativa} className={`${styles.seriesBtn} ${ativa ? styles.chipOn : ''}`} onClick={() => setEscolhida(s.chave)}>
                    {rotuloDaSerie(s)}
                    <small>{textoGraus(u.angle_deg)} em {dataBr(u.measured_on)}</small>
                  </button>
                )
              })}
            </div>
          </section>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Última medida</span>
              <span className={styles.statValue}>{textoGraus(ultima.angle_deg)}</span>
              <span className={styles.statSub}>em {dataBr(ultima.measured_on)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Valor normal</span>
              <span className={styles.statValue}>{serie.referencia === null ? '—' : textoGraus(serie.referencia)}</span>
              <span className={styles.statSub}>
                {leitura ? (leitura.pct !== null ? `${leitura.pct}% da referência` : `${textoGraus(leitura.desvio)} de déficit`) : 'Sem referência'}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Evolução</span>
              <span className={styles.statValue}>{evolucao ? textoGraus(evolucao.deltaGraus, true) : '—'}</span>
              <span className={styles.statSub}>
                {evolucao ? `${evolucao.dias === 1 ? '1 dia' : `${evolucao.dias} dias`} desde a primeira` : 'Precisa de 2 medidas'}
              </span>
            </div>
          </div>

          <div className={styles.statusRow}>
            {leitura && <Badge tone={TOM_NIVEL[leitura.nivel]}>{ROTULO_NIVEL[leitura.nivel]}</Badge>}
            {evolucao && <Badge tone={TOM_TENDENCIA[evolucao.tendencia]}>{ROTULO_TENDENCIA[evolucao.tendencia]}</Badge>}
          </div>

          <section className={styles.card} aria-label="Gráfico de evolução">
            <div className={styles.cardTitle}>{rotuloDaSerie(serie)}</div>
            <GraficoGonio pontos={serie.pontos} referencia={serie.referencia} />
            <p className={styles.note}>Variação de até 3 graus entre medidas está dentro do erro esperado do goniômetro e conta como estável. Interprete sempre junto do quadro clínico.</p>
          </section>

          <section className={styles.card} aria-label="Histórico da série">
            <div className={styles.cardTitle}>Histórico</div>
            <div className={styles.list}>
              {[...serie.pontos].reverse().map(m => (
                <div key={m.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemTitle}>{textoGraus(m.angle_deg)} <span className={styles.unit}>em {dataBr(m.measured_on)}</span></div>
                    <div className={styles.itemMeta}>
                      {m.reference_deg !== null ? `Referência ${textoGraus(m.reference_deg)}` : 'Sem referência'}
                      {(() => { const l = lerAdm(m.angle_deg, m.reference_deg); return l ? ` · ${ROTULO_NIVEL[l.nivel]}` : '' })()}
                      {m.note ? ` · ${m.note}` : ''}
                    </div>
                  </div>
                  <div className={styles.itemActions}>
                    <button type="button" className={styles.iconBtn} aria-label={`Excluir a medida de ${dataBr(m.measured_on)}`} onClick={() => excluir(m)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
