'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { DecimalInput } from '@/components/ui/NumericInput'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { useTaco } from '@/hooks/useTaco'
import {
  GRUPOS, GRUPO_INFO, MEDIDAS_PADRAO, buscarAlimentos, catalogoCom,
  type Alimento, type GrupoAlimentar,
} from '@/lib/nutri/alimentos'
import { novoId, type ItemPlano, type MetaDiaria, type Refeicao } from '@/lib/nutri/plano'
import {
  normalizarRecordatorio, percentualDaMeta, recordatorioTemConteudo, recordatorioVazio, resumirRecordatorio,
  totaisDoRecordatorio, type RecordatorioDados,
} from '@/lib/nutri/recordatorio'
import { TACO_FONTE } from '@/lib/nutri/taco'
import { excluirNutri, MENSAGEM_INDISPONIVEL, salvarNutri, type LinhaNutri } from '@/lib/nutri/storage'
import type { Indisponibilidade } from '@/lib/nutri/erros'
import { formatarNumero } from '@/lib/nutri/validacao'
import { mascaraHora } from './Campos'
import styles from './nutri.module.css'

const fmtData = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
const snapshot = (r: RecordatorioDados, data: string) => (recordatorioTemConteudo(r) ? JSON.stringify({ r, data }) : '')

interface Props {
  patient: Patient
  clinicId: string
  linhas: LinhaNutri[]
  carregando: boolean
  motivo: Indisponibilidade | null
  recarregar: () => Promise<unknown>
  onDirtyChange?: (dirty: boolean) => void
  /** Meta da avaliação mais recente: o consumo informado é comparado com a energia dela. */
  metaSugerida: MetaDiaria | null
}

/** Recordatório alimentar 24h estruturado: refeição, horário, alimento (TACO) e quantidade, com um registro por data. */
export function RecordatorioPanel({ patient, clinicId, linhas, carregando, motivo, recarregar, onDirtyChange, metaSugerida }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [rec, setRec] = useState<RecordatorioDados>(() => recordatorioVazio())
  const [data, setData] = useState(() => hojeBrasil())
  const [savedSnap, setSavedSnap] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [buscaRef, setBuscaRef] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [personalizadoRef, setPersonalizadoRef] = useState<string | null>(null)
  const [iniciou, setIniciou] = useState(false)

  const registros = useMemo(() => linhas.map(l => ({ id: l.id, data: l.data, dados: normalizarRecordatorio(l.dados) })), [linhas])
  const { taco, erro: erroTaco, tentarDeNovo } = useTaco()
  const catalogo = useMemo(() => catalogoCom(rec.personalizados, taco ?? []), [rec.personalizados, taco])

  function abrirNovo() {
    setActiveId(null)
    setRec(recordatorioVazio())
    setData(hojeBrasil()); setSavedSnap(''); setSaved(false); setBuscaRef(null)
  }
  function abrir(r: { id: string; data: string; dados: RecordatorioDados }) {
    setActiveId(r.id); setRec(r.dados); setData(r.data); setSavedSnap(snapshot(r.dados, r.data)); setSaved(false); setBuscaRef(null)
  }

  // abre o recordatório mais recente quando a lista termina de carregar; sem registro, um novo em branco
  if (!carregando && !iniciou) {
    setIniciou(true)
    if (registros[0]) abrir(registros[0]); else abrirNovo()
  }

  const dirty = snapshot(rec, data) !== savedSnap
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  async function escolher(r: { id: string; data: string; dados: RecordatorioDados } | null) {
    if (r && r.id === activeId) return
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Descartar alterações?',
        message: 'Este recordatório tem alterações não salvas. Se continuar, elas serão perdidas.',
        confirmText: 'Descartar', cancelText: 'Voltar e salvar', danger: true,
      })
      if (!ok) return
    }
    if (r) abrir(r); else abrirNovo()
  }

  // ── edição ──
  const alterar = (fn: (r: RecordatorioDados) => RecordatorioDados) => { setRec(fn); setSaved(false) }
  const alterarRefeicao = (id: string, fn: (r: Refeicao) => Refeicao) => alterar(r => ({ ...r, refeicoes: r.refeicoes.map(x => (x.id === id ? fn(x) : x)) }))
  const alterarItem = (rid: string, iid: string, patch: Partial<ItemPlano>) =>
    alterarRefeicao(rid, r => ({ ...r, itens: r.itens.map(i => (i.id === iid ? { ...i, ...patch } : i)) }))

  function adicionarAlimento(rid: string, a: Alimento) {
    const padrao = MEDIDAS_PADRAO[a.id]?.[0]
    alterarRefeicao(rid, r => ({
      ...r,
      itens: [...r.itens, { id: novoId(), alimentoId: a.id, gramas: padrao ? padrao.gramas : 100, ...(padrao ? { medida: `1 ${padrao.rotulo}` } : {}) }],
    }))
    setBuscaRef(null); setBusca(''); setPersonalizadoRef(null)
  }

  async function removerRefeicao(r: Refeicao) {
    if (r.itens.length > 0) {
      const ok = await confirmDialog({ title: 'Remover esta refeição?', message: `"${r.nome || 'Refeição'}" e os ${r.itens.length} alimentos dela serão removidos do recordatório.`, confirmText: 'Remover', cancelText: 'Manter', danger: true })
      if (!ok) return
    }
    alterar(x => ({ ...x, refeicoes: x.refeicoes.filter(m => m.id !== r.id) }))
  }

  async function salvar() {
    // um recordatório por data: se já existe outro nesta data, oferece abrir o existente em vez de criar uma segunda linha
    const existente = registros.find(x => x.data === data && x.id !== activeId)
    if (existente) {
      const abrirExistente = await confirmDialog({
        title: 'Já existe um recordatório desta data',
        message: `O paciente já tem um recordatório em ${fmtData(data)}. Abra o existente para editar, ou volte e escolha outra data para este.`,
        confirmText: 'Abrir o existente', cancelText: 'Voltar e mudar a data',
      })
      if (abrirExistente) abrir(existente)
      return
    }
    setSaving(true)
    const r = await salvarNutri({ id: activeId, clinicId, patientId: patient.id, tipo: 'recordatorio', data, dados: rec })
    setSaving(false)
    if (!r.ok) { showToast('error', MENSAGEM_INDISPONIVEL[r.motivo]); return }
    setActiveId(r.id); setSavedSnap(snapshot(rec, data)); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    await recarregar()
  }

  async function excluir() {
    if (!activeId) return
    const ok = await confirmDialog({
      title: 'Excluir este recordatório?', message: `O recordatório de ${fmtData(data)} será removido. Isso não pode ser desfeito.`,
      confirmText: 'Excluir recordatório', cancelText: 'Manter', danger: true,
    })
    if (!ok) return
    const r = await excluirNutri(activeId)
    if (!r.ok) { showToast('error', 'Não foi possível excluir agora. Tente de novo.'); return }
    const restantes = registros.filter(x => x.id !== activeId)
    await recarregar()
    if (restantes[0]) abrir(restantes[0]); else abrirNovo()
  }

  // ── cálculo ao vivo ──
  const totais = useMemo(() => totaisDoRecordatorio(rec, catalogo), [rec, catalogo])
  const resumo = useMemo(() => resumirRecordatorio(rec, catalogo), [rec, catalogo])
  const resultados = useMemo(() => (busca.trim().length >= 2 ? buscarAlimentos(catalogo, busca, 30) : []), [catalogo, busca])
  const pctMeta = percentualDaMeta(resumo.dia.kcal, metaSugerida?.kcal ?? null)

  // ── formulário de alimento personalizado ──
  const [pers, setPers] = useState({ nome: '', grupo: 'preparados' as GrupoAlimentar, kcal: '', p: '', c: '', l: '', f: '' })
  function criarPersonalizado(rid: string) {
    const kcal = Number(pers.kcal)
    if (!pers.nome.trim() || !(kcal > 0)) { showToast('error', 'Informe o nome e a energia (kcal por 100 g) do alimento.'); return }
    const a: Alimento = {
      id: `pers-${novoId()}`, nome: pers.nome.trim(), grupo: pers.grupo, kcal,
      proteina: Number(pers.p) || 0, carboidrato: Number(pers.c) || 0, lipidio: Number(pers.l) || 0, fibra: Number(pers.f) || 0, origem: 'personalizado',
    }
    alterar(r => ({
      ...r,
      personalizados: [...r.personalizados, { id: a.id, nome: a.nome, grupo: a.grupo, kcal: a.kcal, proteina: a.proteina, carboidrato: a.carboidrato, lipidio: a.lipidio, fibra: a.fibra }],
    }))
    adicionarAlimento(rid, a)
    setPers({ nome: '', grupo: 'preparados', kcal: '', p: '', c: '', l: '', f: '' })
  }

  // sem a TACO carregada, os itens apareceriam como "removidos": espera o chunk antes de mostrar o recordatório
  if (!taco) {
    return (
      <div className={styles.wrap}>
        {erroTaco ? (
          <>
            <p className={styles.hint}>Não foi possível carregar o banco de alimentos. Verifique a conexão e tente de novo.</p>
            <div><Button variant="secondary" onClick={tentarDeNovo}>Tentar de novo</Button></div>
          </>
        ) : <p className={styles.hint}>Carregando banco de alimentos...</p>}
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {motivo && (
        <div className={styles.notice} role="status"><Icon name="alert" size={18} /><span>{MENSAGEM_INDISPONIVEL[motivo]}</span></div>
      )}

      {/* ── Recordatórios salvos ── */}
      <div className={styles.histBar}>
        <div className={styles.histChips} role="group" aria-label="Recordatórios alimentares salvos">
          {registros.map(r => (
            <button key={r.id} type="button" aria-pressed={r.id === activeId} className={`${styles.chip} ${r.id === activeId ? styles.chipActive : ''}`} onClick={() => escolher(r)}>
              {fmtData(r.data)}
            </button>
          ))}
          {activeId === null && <span className={`${styles.chip} ${styles.chipActive}`} aria-current="true">Novo recordatório</span>}
        </div>
        <div className={styles.row}>
          {activeId !== null && <button type="button" className={`${styles.chip} ${styles.chipNew}`} onClick={() => escolher(null)}>+ Novo recordatório</button>}
        </div>
      </div>
      {carregando && <p className={styles.hint}>Carregando recordatórios...</p>}

      {/* ── Data e total do dia ── */}
      <section className={styles.card} aria-label="Recordatório alimentar de 24 horas">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Recordatório 24 horas</h3>
        </div>
        <p className={styles.cardSub}>Registre tudo o que o paciente comeu e bebeu no dia anterior, refeição por refeição, com horário, alimento e quantidade (em gramas e, se souber, na medida caseira).</p>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label>Data da consulta</label>
            <DatePicker value={data} onChange={v => { setData(v || hojeBrasil()); setSaved(false) }} ariaLabel="Data do recordatório" />
          </div>
        </div>
        <div className={styles.stats} role="group" aria-label="Total informado no dia">
          <div className={styles.stat}><span className={styles.statLabel}>Energia</span><span className={styles.statValue}>{formatarNumero(resumo.dia.kcal, 0)}<small>kcal</small></span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Proteína</span><span className={styles.statValue}>{formatarNumero(resumo.dia.proteina, 1)}<small>g</small></span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Carboidrato</span><span className={styles.statValue}>{formatarNumero(resumo.dia.carboidrato, 1)}<small>g</small></span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Lipídio</span><span className={styles.statValue}>{formatarNumero(resumo.dia.lipidio, 1)}<small>g</small></span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Fibra</span><span className={styles.statValue}>{formatarNumero(resumo.dia.fibra, 1)}<small>g</small></span></div>
        </div>
        {resumo.alimentos > 0 && (
          <p className={styles.hint}>
            {resumo.alimentos} {resumo.alimentos === 1 ? 'alimento' : 'alimentos'} em {resumo.refeicoesComConsumo} {resumo.refeicoesComConsumo === 1 ? 'refeição' : 'refeições'}.
            {pctMeta !== null && ` O consumo informado equivale a ${pctMeta}% da meta de energia da última avaliação (${formatarNumero(metaSugerida!.kcal!, 0)} kcal).`}
            {pctMeta === null && ' Sem meta calculada na Avaliação para comparar.'}
          </p>
        )}
        {resumo.semCalculo > 0 && (
          <p className={styles.warn}>{resumo.semCalculo} {resumo.semCalculo === 1 ? 'alimento saiu' : 'alimentos saíram'} do banco de alimentos e não {resumo.semCalculo === 1 ? 'entra' : 'entram'} nos totais.</p>
        )}
      </section>

      {/* ── Refeições ── */}
      {rec.refeicoes.map(r => {
        const t = totais.refeicoes.find(x => x.refeicao.id === r.id)
        return (
          <section key={r.id} className={styles.meal} aria-label={r.nome || 'Refeição'}>
            <div className={styles.mealHead}>
              <input className={styles.mealName} value={r.nome} maxLength={40} aria-label="Nome da refeição" placeholder="Nome da refeição" onChange={e => alterarRefeicao(r.id, x => ({ ...x, nome: e.target.value }))} />
              <input className={styles.input} value={r.horario} inputMode="numeric" aria-label="Horário da refeição" placeholder="00:00" onChange={e => alterarRefeicao(r.id, x => ({ ...x, horario: mascaraHora(e.target.value) }))} />
              <button type="button" className={styles.iconBtn} aria-label={`Remover a refeição ${r.nome || ''}`} onClick={() => removerRefeicao(r)}><Icon name="trash" size={18} /></button>
            </div>
            {t && t.itens.length > 0 && (
              <span className={styles.mealTotals}>
                {formatarNumero(t.total.kcal, 0)} kcal | P {formatarNumero(t.total.proteina, 1)} g | C {formatarNumero(t.total.carboidrato, 1)} g | L {formatarNumero(t.total.lipidio, 1)} g
              </span>
            )}

            <div className={styles.items}>
              {r.itens.length === 0 && <p className={styles.empty}>Sem consumo informado nesta refeição.</p>}
              {(t?.itens ?? []).map(({ item, alimento, nutrientes }) => {
                const nome = alimento?.nome ?? 'Alimento removido do catálogo'
                return (
                  <div key={item.id} className={`${styles.item} ${styles.itemRec}`}>
                    <div className={styles.itemName}>
                      <span>{nome}</span>
                      {alimento && <span className={styles.itemGroup}>{GRUPO_INFO[alimento.grupo].rotulo}{alimento.origem === 'personalizado' ? ' | personalizado' : ''}</span>}
                    </div>
                    <div className={styles.itemQty}>
                      <DecimalInput className={styles.input} value={item.gramas > 0 ? String(item.gramas) : ''} onChange={v => alterarItem(r.id, item.id, { gramas: v === '' ? 0 : Number(v) })} max={3000} decimals={1} placeholder="g" aria-label={`Quantidade em gramas de ${nome}`} />
                      <input className={styles.input} value={item.medida ?? ''} maxLength={60} placeholder="Medida caseira" aria-label={`Medida caseira de ${nome}`} onChange={e => alterarItem(r.id, item.id, { medida: e.target.value })} />
                    </div>
                    <span className={styles.itemKcal}>{formatarNumero(nutrientes.kcal, 0)} kcal</span>
                    <button type="button" className={`${styles.iconBtn} ${styles.itemDel}`} aria-label={`Remover ${nome}`} onClick={() => alterarRefeicao(r.id, x => ({ ...x, itens: x.itens.filter(i => i.id !== item.id) }))}><Icon name="close" size={18} /></button>
                  </div>
                )
              })}
            </div>

            {buscaRef === r.id ? (
              <div className={styles.searchBox}>
                <div className={styles.row}>
                  <input className={styles.input} style={{ flex: 1 }} autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar alimento (ex.: arroz, frango, maçã)" aria-label="Buscar alimento" />
                  <button type="button" className={styles.iconBtn} aria-label="Fechar a busca" onClick={() => { setBuscaRef(null); setBusca(''); setPersonalizadoRef(null) }}><Icon name="close" size={18} /></button>
                </div>
                {busca.trim().length >= 2 && (
                  resultados.length > 0 ? (
                    <div className={styles.results} role="list">
                      {resultados.map(a => (
                        <button key={a.id} type="button" role="listitem" className={styles.result} onClick={() => adicionarAlimento(r.id, a)}>
                          <span>{a.nome}</span>
                          <span className={styles.resultInfo}>{formatarNumero(a.kcal, 0)} kcal/100 g</span>
                        </button>
                      ))}
                    </div>
                  ) : <p className={styles.hint}>Nada encontrado. Use um alimento personalizado com os dados do rótulo.</p>
                )}
                <span className={styles.hint}>Base: {TACO_FONTE}. Valores por 100 g.</span>
                {personalizadoRef === r.id ? (
                  <div className={styles.customForm}>
                    <input className={`${styles.input} ${styles.wide}`} value={pers.nome} onChange={e => setPers(s => ({ ...s, nome: e.target.value }))} placeholder="Nome do alimento (ex.: Biscoito recheado, rótulo)" aria-label="Nome do alimento personalizado" maxLength={80} />
                    <div className={styles.wide}>
                      <SelectMenu variant="field" ariaLabel="Grupo do alimento" value={pers.grupo} onChange={v => setPers(s => ({ ...s, grupo: v as GrupoAlimentar }))} options={GRUPOS.map(g => ({ value: g.id, label: g.rotulo }))} />
                    </div>
                    <DecimalInput className={styles.input} value={pers.kcal} onChange={v => setPers(s => ({ ...s, kcal: v }))} max={900} decimals={0} placeholder="kcal/100 g" aria-label="Energia por 100 gramas" />
                    <DecimalInput className={styles.input} value={pers.p} onChange={v => setPers(s => ({ ...s, p: v }))} max={100} decimals={1} placeholder="Proteína g" aria-label="Proteína por 100 gramas" />
                    <DecimalInput className={styles.input} value={pers.c} onChange={v => setPers(s => ({ ...s, c: v }))} max={100} decimals={1} placeholder="Carboidrato g" aria-label="Carboidrato por 100 gramas" />
                    <DecimalInput className={styles.input} value={pers.l} onChange={v => setPers(s => ({ ...s, l: v }))} max={100} decimals={1} placeholder="Lipídio g" aria-label="Lipídio por 100 gramas" />
                    <DecimalInput className={styles.input} value={pers.f} onChange={v => setPers(s => ({ ...s, f: v }))} max={100} decimals={1} placeholder="Fibra g" aria-label="Fibra por 100 gramas" />
                    <Button variant="primary" className={styles.wide} onClick={() => criarPersonalizado(r.id)}>Adicionar alimento personalizado</Button>
                  </div>
                ) : (
                  <Button variant="ghost" onClick={() => setPersonalizadoRef(r.id)}>Alimento que não está na lista (personalizado)</Button>
                )}
              </div>
            ) : (
              <div><Button variant="secondary" icon="plus" onClick={() => { setBuscaRef(r.id); setBusca(''); setPersonalizadoRef(null) }}>Adicionar alimento</Button></div>
            )}

            <div className={styles.field}>
              <label htmlFor={`rec-obs-${r.id}`}>Observação da refeição</label>
              <input id={`rec-obs-${r.id}`} className={styles.input} value={r.obs ?? ''} maxLength={200} onChange={e => alterarRefeicao(r.id, x => ({ ...x, obs: e.target.value }))} placeholder="Opcional (local, quem preparou, comeu assistindo TV)" />
            </div>
          </section>
        )
      })}
      <div>
        <Button variant="secondary" icon="plus" onClick={() => alterar(r => ({ ...r, refeicoes: [...r.refeicoes, { id: novoId(), nome: `Refeição ${r.refeicoes.length + 1}`, horario: '', itens: [] }] }))}>Adicionar refeição</Button>
      </div>

      <section className={styles.card} aria-label="Observações do dia">
        <div className={styles.field}>
          <label htmlFor="rec-obs">Observações do dia</label>
          <textarea id="rec-obs" className={styles.textarea} value={rec.observacoes ?? ''} onChange={e => alterar(r => ({ ...r, observacoes: e.target.value }))} placeholder="Dia atípico, jejum, evento, suplementos, hidratação..." />
        </div>
        <span className={styles.hint}>As quantidades são as relatadas pelo paciente; os totais usam a {TACO_FONTE} e são uma estimativa.</span>
      </section>

      {/* ── Ações ── */}
      <div className={styles.saveRow}>
        {dirty && !saving && <span className={styles.dirtyMsg}>Alterações não salvas</span>}
        {saved && <span className={styles.savedMsg}><Icon name="check" size={16} /> Recordatório salvo</span>}
        {activeId && <Button variant="secondary" onClick={excluir} disabled={saving}>Excluir</Button>}
        <Button variant="primary" onClick={salvar} loading={saving} disabled={!recordatorioTemConteudo(rec) || (!dirty && activeId !== null)}>{activeId ? 'Salvar alterações' : 'Salvar recordatório'}</Button>
      </div>
    </div>
  )
}
