'use client'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { DecimalInput } from '@/components/ui/NumericInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { dataBr } from '@/lib/vet/datas'
import { fmt } from '@/lib/vet/numeros'
import {
  emOrdemCronologica, lerPeso, pesoAtual, textoDaVariacao, validarPesagem, variacaoDoPeso, variacoesEntrePesagens, type Pesagem,
} from '@/lib/vet/peso'
import { excluirPesagem, MENSAGEM_INDISPONIVEL, salvarPesagem, sincronizarPesoNoCadastro, type Indisponibilidade } from '@/lib/vet/storage'
import { GraficoPeso } from './GraficoPeso'
import styles from './vet.module.css'

interface Props {
  patient: Patient
  clinicId: string
  pesos: Pesagem[]
  carregando: boolean
  motivo: Indisponibilidade | null
  recarregar: () => Promise<unknown>
}

/** Histórico de pesagens do pet: registrar, curva em gráfico, variação percentual e lista por data. */
export function PesoPanel({ patient, clinicId, pesos, carregando, motivo, recarregar }: Props) {
  const queryClient = useQueryClient()
  const hoje = hojeBrasil()
  const [data, setData] = useState(hoje)
  const [kg, setKg] = useState('')
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const ordem = useMemo(() => emOrdemCronologica(pesos), [pesos])
  const atual = pesoAtual(pesos)
  const variacao = variacaoDoPeso(pesos)
  const linhas = useMemo(() => [...variacoesEntrePesagens(pesos)].reverse(), [pesos])
  const kgCadastro = patient.pet_weight

  async function salvar() {
    const msg = validarPesagem(kg, data, hoje)
    if (msg) { setErro(msg); return }
    const valor = lerPeso(kg).valor as number
    setErro(null)
    setSalvando(true)
    const res = await salvarPesagem({ clinicId, patientId: patient.id, data, kg: valor, nota })
    if (!res.ok) {
      setSalvando(false)
      setErro(MENSAGEM_INDISPONIVEL[res.motivo])
      return
    }
    // o "peso atual" do cadastro acompanha a pesagem mais recente (uma pesagem antiga digitada depois não o troca)
    if (!atual || data >= atual.weighed_on) await sincronizarPesoNoCadastro(patient.id, valor)
    await recarregar()
    queryClient.invalidateQueries({ queryKey: ['pacientes'] })
    setSalvando(false)
    setKg('')
    setNota('')
    showToast('ok', 'Pesagem registrada.')
  }

  async function excluir(p: Pesagem) {
    const ok = await confirmDialog({
      title: 'Excluir esta pesagem?',
      message: `A pesagem de ${fmt(p.weight_kg, 3)} kg em ${dataBr(p.weighed_on)} será removida da curva.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    const res = await excluirPesagem(p.id)
    if (!res.ok) { showToast('error', 'Não foi possível excluir agora.'); return }
    // se era a mais recente, o cadastro volta para a anterior
    if (atual && atual.id === p.id) {
      const restantes = ordem.filter(x => x.id !== p.id)
      await sincronizarPesoNoCadastro(patient.id, restantes.length ? restantes[restantes.length - 1].weight_kg : null)
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
    }
    await recarregar()
  }

  if (carregando) return <p className={styles.hint}>Carregando histórico...</p>

  return (
    <div className={styles.wrap}>
      {motivo && (
        <div className={styles.notice} role="status">
          <Icon name="info" size={18} />
          <div>{MENSAGEM_INDISPONIVEL[motivo]}</div>
        </div>
      )}

      <section className={styles.card} aria-label="Registrar pesagem">
        <div className={styles.cardTitle}>Registrar pesagem</div>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor="vet-peso-data">Data</label>
            <DatePicker id="vet-peso-data" value={data} onChange={v => setData(v || hoje)} max={hoje} ariaLabel="Data da pesagem" />
          </div>
          <div className={styles.field}>
            <label htmlFor="vet-peso-kg">Peso <span className={styles.unit}>(kg)</span></label>
            <DecimalInput id="vet-peso-kg" className={`${styles.input} ${erro ? styles.inputErr : ''}`} value={kg} onChange={v => { setKg(v); setErro(null) }} max={2000} decimals={3} placeholder="0" />
          </div>
          <div className={`${styles.field} ${styles.wide}`}>
            <label htmlFor="vet-peso-nota">Observação <span className={styles.unit}>(opcional)</span></label>
            <input id="vet-peso-nota" className={styles.input} value={nota} onChange={e => setNota(e.target.value)} maxLength={200} placeholder="Ex.: jejum, pós-cirurgia, balança da clínica" />
          </div>
        </div>
        {erro && <span className={styles.errMsg} role="alert">{erro}</span>}
        {ordem.length === 0 && kgCadastro != null && (
          <p className={styles.hint}>
            O cadastro do pet tem {fmt(kgCadastro, 3)} kg, sem data.{' '}
            <button type="button" className={styles.chip} onClick={() => { setKg(String(kgCadastro)); setErro(null) }}>Usar este peso</button>
          </p>
        )}
        <div className={styles.saveRow}>
          <Button variant="primary" icon="plus" loading={salvando} onClick={salvar}>Registrar peso</Button>
        </div>
      </section>

      {ordem.length === 0 ? (
        <EmptyState icon="reports" title="Sem pesagens ainda" description="Registre o peso a cada consulta. Cada pesagem vira um ponto na curva e o peso anterior deixa de ser perdido." compact />
      ) : (
        <>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Peso atual</span>
              <span className={styles.statValue}>{fmt(atual!.weight_kg, 3)}<small>kg</small></span>
              <span className={styles.statSub}>em {dataBr(atual!.weighed_on)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Variação total</span>
              <span className={styles.statValue}>
                {variacao ? (variacao.pct === null ? `${variacao.deltaKg > 0 ? '+' : ''}${fmt(variacao.deltaKg, 3)}` : `${variacao.pct > 0 ? '+' : ''}${fmt(variacao.pct, 1)}%`) : '—'}
              </span>
              <span className={styles.statSub}>
                {variacao ? `${textoDaVariacao(variacao.deltaKg, null)} em ${variacao.dias === 1 ? '1 dia' : `${variacao.dias} dias`}` : 'Precisa de 2 pesagens'}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Pesagens</span>
              <span className={styles.statValue}>{ordem.length}</span>
              <span className={styles.statSub}>desde {dataBr(ordem[0].weighed_on)}</span>
            </div>
          </div>

          <section className={styles.card} aria-label="Curva de peso">
            <div className={styles.cardTitle}>Curva de peso</div>
            <GraficoPeso pesagens={pesos} />
          </section>

          <section className={styles.card} aria-label="Pesagens por data">
            <div className={styles.cardTitle}>Pesagens</div>
            <div className={styles.list}>
              {linhas.map(({ pesagem: p, deltaKg, pct }) => (
                <div key={p.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemTitle}>{fmt(p.weight_kg, 3)} kg <span className={styles.unit}>em {dataBr(p.weighed_on)}</span></div>
                    <div className={styles.itemMeta}>
                      {deltaKg === null ? 'Primeira pesagem' : `${textoDaVariacao(deltaKg, pct)} desde a anterior`}
                      {p.note ? ` · ${p.note}` : ''}
                    </div>
                  </div>
                  <div className={styles.itemActions}>
                    <button type="button" className={styles.iconBtn} aria-label={`Excluir a pesagem de ${dataBr(p.weighed_on)}`} onClick={() => excluir(p)}>
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
