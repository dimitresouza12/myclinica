'use client'
import { useEffect, useMemo, useState } from 'react'
import type { AuthClinic, Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { Icon } from '@/components/ui/Icon'
import { PillTabs } from '@/components/ui/PillTabs'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import {
  ausentesDoOdontograma, marcarAusentes, normalizarPerio, perioTemConteudo, perioVazio, serializarPerio, type PerioDados,
} from '@/lib/odonto/periograma'
import { htmlPeriograma, htmlPeriogramaComparacao, imprimirOdonto } from '@/lib/odonto/imprimir'
import { excluirOdonto, MENSAGEM_PERIOGRAMA, salvarOdonto } from '@/lib/odonto/storage'
import { usePrintActions } from '../print/PrintRegistry'
import { PerioComparar, type ExamePerio } from './PerioComparar'
import { PerioGrade } from './PerioGrade'
import { PerioResumo } from './PerioResumo'
import { useOdontoLista } from './useOdontoLista'
import common from './odontoCommon.module.css'
import styles from './periograma.module.css'

type Vista = 'ficha' | 'comparar'

const fmtData = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })

/** Foto do exame para saber se há alteração não salva: vazio quando ainda não há nada preenchido. */
const snapshot = (d: PerioDados, data: string) => (perioTemConteudo(d) ? JSON.stringify({ d: serializarPerio(d), data }) : '')

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  /** jsonb `odontogram` do prontuário, para sugerir os dentes ausentes */
  odontogram: Record<string, unknown> | null
  onDirtyChange?: (dirty: boolean) => void
}

/** Aba "Periograma": ficha de sondagem por dente, índices do exame, histórico por data, comparação e impressão. */
export function TabPeriograma({ patient, clinic, clinicId, odontogram, onDirtyChange }: Props) {
  const { linhas, carregando, motivo, recarregar } = useOdontoLista('odonto_periogramas', patient.id)
  const [vista, setVista] = useState<Vista>('ficha')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PerioDados>(() => perioVazio())
  const [data, setData] = useState(() => hojeBrasil())
  const [savedSnap, setSavedSnap] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [iniciou, setIniciou] = useState(false)
  const [cmpA, setCmpA] = useState('')
  const [cmpB, setCmpB] = useState('')

  const registros = useMemo(() => linhas.map(l => ({ id: l.id, data: l.data, dados: normalizarPerio(l.dados) })), [linhas])
  // o rótulo repete a data quando há dois exames no mesmo dia: "10 nov 26" e "10 nov 26 (2)"
  const exames: ExamePerio[] = useMemo(() => {
    const vistas: Record<string, number> = {}
    return registros.map(r => {
      vistas[r.data] = (vistas[r.data] ?? 0) + 1
      return { ...r, rotulo: vistas[r.data] > 1 ? `${fmtData(r.data)} (${vistas[r.data]})` : fmtData(r.data) }
    })
  }, [registros])

  const ausentesOdonto = useMemo(() => ausentesDoOdontograma(odontogram), [odontogram])

  /** Exame novo: parte dos dentes ausentes do exame anterior (o dente não volta sozinho), sem os valores medidos. */
  function rascunhoNovo(): PerioDados {
    const ult = registros[0]?.dados
    if (!ult) return perioVazio()
    const ausentes = Object.entries(ult.dentes).filter(([, t]) => t.ausente).map(([n]) => Number(n))
    return marcarAusentes(perioVazio(), ausentes)
  }

  function abrirNovo() {
    const r = rascunhoNovo(); const hoje = hojeBrasil()
    // o ponto de partida já tem os ausentes herdados: só é "não salvo" o que o profissional mudar depois
    setActiveId(null); setDraft(r); setData(hoje); setSavedSnap(snapshot(r, hoje)); setSaved(false)
  }
  function abrir(r: { id: string; data: string; dados: PerioDados }) {
    setActiveId(r.id); setDraft(r.dados); setData(r.data); setSavedSnap(snapshot(r.dados, r.data)); setSaved(false)
  }

  // abre o exame mais recente quando o histórico termina de carregar; sem histórico, um novo em branco
  if (!carregando && !iniciou) {
    setIniciou(true)
    if (registros[0]) abrir(registros[0]); else abrirNovo()
  }

  const dirty = snapshot(draft, data) !== savedSnap
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  async function escolher(r: { id: string; data: string; dados: PerioDados } | null) {
    if (r && r.id === activeId) return
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Descartar alterações?',
        message: 'Este exame tem alterações não salvas. Se continuar, elas serão perdidas.',
        confirmText: 'Descartar', cancelText: 'Voltar e salvar', danger: true,
      })
      if (!ok) return
    }
    if (r) abrir(r); else abrirNovo()
    setVista('ficha')
  }

  function alterar(d: PerioDados) { setDraft(d); setSaved(false) }

  function marcarAusentesDoOdonto() {
    const novos = ausentesOdonto.filter(n => !draft.dentes[n]?.ausente)
    if (novos.length === 0) return
    alterar(marcarAusentes(draft, novos))
    showToast('ok', `${novos.length} ${novos.length === 1 ? 'dente marcado' : 'dentes marcados'} como ausente, conforme o odontograma.`)
  }
  const faltaMarcar = ausentesOdonto.filter(n => !draft.dentes[n]?.ausente).length

  async function salvar() {
    if (!perioTemConteudo(draft)) { showToast('error', 'Preencha ao menos uma medida antes de salvar.'); return }
    if (!activeId && registros.some(r => r.data === data)) {
      const ok = await confirmDialog({
        title: 'Já existe um periograma desta data',
        message: `Há um exame salvo em ${fmtData(data)}. Se continuar, este será salvo como outro exame no mesmo dia.`,
        confirmText: 'Salvar como outro exame', cancelText: 'Voltar',
      })
      if (!ok) return
    }
    setSaving(true)
    const r = await salvarOdonto({ tabela: 'odonto_periogramas', id: activeId, clinicId, patientId: patient.id, data, dados: serializarPerio(draft) })
    setSaving(false)
    if (!r.ok) { showToast('error', MENSAGEM_PERIOGRAMA[r.motivo]); return }
    setActiveId(r.id); setSavedSnap(snapshot(draft, data)); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    await recarregar()
  }

  async function excluir() {
    if (!activeId) return
    const ok = await confirmDialog({
      title: 'Excluir este periograma?',
      message: `O exame de ${fmtData(data)} será removido do histórico e das comparações. Isso não pode ser desfeito.`,
      confirmText: 'Excluir exame', cancelText: 'Manter', danger: true,
    })
    if (!ok) return
    const r = await excluirOdonto('odonto_periogramas', activeId)
    if (!r.ok) { showToast('error', 'Não foi possível excluir agora. Tente de novo.'); return }
    const restantes = registros.filter(x => x.id !== activeId)
    await recarregar()
    if (restantes[0]) abrir(restantes[0]); else abrirNovo()
  }

  // impressões no menu "Imprimir" do prontuário (sem botões próprios aqui)
  const cab = { clinica: clinic.name, paciente: patient.name, detalhe: [clinic.address, clinic.phone].filter(Boolean).join(' | ') || undefined }
  const exameA = exames.find(e => e.id === cmpA) ?? exames[1]
  const exameB = exames.find(e => e.id === cmpB) ?? exames[0]
  usePrintActions('periograma', [
    {
      id: 'periograma-ficha', label: 'Periograma do exame na tela',
      includes: ['Ficha dos 32 dentes: profundidade, recessão, NIC, sangramento e supuração', 'Mobilidade, furca e resumo dos índices'],
      disabledReason: perioTemConteudo(draft) ? undefined : 'Preencha o exame para imprimir',
      run: () => imprimirOdonto(htmlPeriograma(cab, draft, data)),
    },
    {
      id: 'periograma-comparacao', label: 'Comparação entre duas datas',
      includes: ['Índices das duas datas e a variação', 'Sítios que melhoraram ou pioraram e variação por dente'],
      disabledReason: exames.length < 2 ? 'Precisa de dois exames salvos' : undefined,
      run: () => { if (exameA && exameB) imprimirOdonto(htmlPeriogramaComparacao(cab, exameA.dados, exameA.data, exameB.dados, exameB.data)) },
    },
  ])

  return (
    <div className={common.wrap}>
      {motivo && (
        <div className={common.notice} role="status">
          <Icon name="alert" size={18} />
          <span>{MENSAGEM_PERIOGRAMA[motivo]}</span>
        </div>
      )}

      {/* ── Histórico por data ── */}
      <div className={common.histBar}>
        <div className={common.histChips} role="group" aria-label="Exames por data">
          {exames.map(r => (
            <button key={r.id} type="button" aria-pressed={r.id === activeId} className={`${common.chip} ${r.id === activeId ? common.chipActive : ''}`} onClick={() => escolher(r)}>
              {r.rotulo}
            </button>
          ))}
          {activeId === null && <span className={`${common.chip} ${common.chipActive} ${common.chipStatic}`} aria-current="true">Novo exame</span>}
        </div>
        {activeId !== null && <button type="button" className={`${common.chip} ${common.chipNew}`} onClick={() => escolher(null)}>+ Novo exame</button>}
      </div>
      {carregando && <p className={common.hint}>Carregando histórico...</p>}

      <PillTabs<Vista>
        label="Visão do periograma"
        value={vista}
        onChange={setVista}
        options={[{ value: 'ficha', label: 'Ficha de sondagem' }, { value: 'comparar', label: 'Comparar datas' }]}
      />

      {vista === 'comparar' ? (
        <PerioComparar exames={exames} idA={exameA?.id ?? ''} idB={exameB?.id ?? ''} onA={setCmpA} onB={setCmpB} />
      ) : (
        <>
          <section className={common.card} aria-label="Dados do exame">
            <div className={common.cardHead}>
              <h3 className={common.cardTitle}>Exame de sondagem</h3>
              {faltaMarcar > 0 && (
                <Button variant="secondary" onClick={marcarAusentesDoOdonto}>
                  Marcar {faltaMarcar === 1 ? '1 ausente' : `${faltaMarcar} ausentes`} do odontograma
                </Button>
              )}
            </div>
            <div className={common.grid}>
              <div className={common.field}>
                <label>Data do exame</label>
                <DatePicker value={data} onChange={v => { setData(v || hojeBrasil()); setSaved(false) }} max={hojeBrasil()} ariaLabel="Data do exame" />
              </div>
            </div>
            <p className={common.hint}>
              Seis sítios por dente: distal, central e mesial, na face vestibular e na lingual ou palatina. Digite a profundidade e a recessão em milímetros
              (o foco pula sozinho para o sítio ao lado), toque no círculo para sangramento e no losango para supuração. Toque no número do dente para marcar ausente.
              NIC é a profundidade somada à recessão.
            </p>
            <div className={styles.legend} aria-label="Legenda">
              <span><i className={styles.legendBleed} aria-hidden="true" /> Sangramento</span>
              <span><i className={styles.legendPus} aria-hidden="true" /> Supuração</span>
              <span><i className={styles.legendWarn} aria-hidden="true" /> Profundidade de 4 a 5 mm</span>
              <span><i className={styles.legendBad} aria-hidden="true" /> Profundidade de 6 mm ou mais</span>
              <span>Mobilidade: 0 a 3 &middot; Furca: 0 a 3</span>
            </div>
          </section>

          <PerioGrade dados={draft} onChange={alterar} />
          <p className={styles.scrollHint}>A ficha rola para os lados dentro de cada arcada; a coluna com os nomes das linhas fica fixa.</p>

          <PerioResumo dados={draft} />

          <section className={common.card} aria-label="Observações">
            <div className={common.field}>
              <label htmlFor="perio-obs">Observações do exame</label>
              <textarea id="perio-obs" className={common.textarea} value={draft.obs} onChange={e => alterar({ ...draft, obs: e.target.value })} placeholder="Placa, cálculo, hábitos, conduta indicada, reavaliação..." />
            </div>
          </section>

          <div className={common.saveRow}>
            {dirty && !saving && <span className={common.dirtyMsg}>Alterações não salvas</span>}
            {saved && <span className={common.savedMsg}><Icon name="check" size={16} /> Exame salvo</span>}
            {activeId && <Button variant="secondary" onClick={excluir} disabled={saving}>Excluir</Button>}
            <Button variant="primary" onClick={salvar} loading={saving} disabled={!dirty && activeId !== null}>
              {activeId ? 'Salvar alterações' : 'Salvar exame'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
