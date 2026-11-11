'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { DecimalInput } from '@/components/ui/NumericInput'
import { Icon } from '@/components/ui/Icon'
import { PillTabs } from '@/components/ui/PillTabs'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { useTaco } from '@/hooks/useTaco'
import {
  GRUPOS, GRUPO_INFO, MEDIDAS_PADRAO, buscarAlimentos, catalogoCom, substituicoesEquivalentes,
  type Alimento, type GrupoAlimentar,
} from '@/lib/nutri/alimentos'
import {
  formatarPeso, listaDeCompras, normalizarPlano, novoId, planoVazio, progressoDoDia, totaisDoPlano,
  type ItemPlano, type MetaDiaria, type PlanoDados, type Refeicao,
} from '@/lib/nutri/plano'
import { TACO_FONTE } from '@/lib/nutri/taco'
import { htmlCompras, htmlPlano, htmlSubstituicoes, imprimirNutri } from '@/lib/nutri/imprimir'
import { excluirNutri, MENSAGEM_INDISPONIVEL, salvarNutri, type LinhaNutri } from '@/lib/nutri/storage'
import type { Indisponibilidade } from '@/lib/nutri/erros'
import { formatarNumero } from '@/lib/nutri/validacao'
import { mascaraHora } from './Campos'
import { usePrintActions } from '../print/PrintRegistry'
import styles from './nutri.module.css'

const fmtData = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
const curto = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const snapshot = (p: PlanoDados, data: string) => {
  const temConteudo = p.refeicoes.some(r => r.itens.length > 0) || p.observacoes?.trim() || Object.values(p.meta).some(v => v !== null) || p.titulo !== 'Plano alimentar'
  return temConteudo ? JSON.stringify({ p, data }) : ''
}
const textoMeta = (v: number | null) => (v === null ? '' : String(v))
const numeroOuNull = (v: string) => (v === '' ? null : Number(v))

interface Props {
  patient: Patient
  clinicId: string
  clinica: { name: string; address?: string; phone?: string }
  linhas: LinhaNutri[]
  carregando: boolean
  motivo: Indisponibilidade | null
  recarregar: () => Promise<unknown>
  onDirtyChange?: (dirty: boolean) => void
  /** Meta da avaliação mais recente (kcal e macros), para um clique preencher a meta do plano. */
  metaSugerida: MetaDiaria | null
}

export function PlanoPanel({ patient, clinicId, clinica, linhas, carregando, motivo, recarregar, onDirtyChange, metaSugerida }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [plano, setPlano] = useState<PlanoDados>(() => planoVazio())
  const [data, setData] = useState(() => hojeBrasil())
  const [savedSnap, setSavedSnap] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [buscaRef, setBuscaRef] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [personalizadoRef, setPersonalizadoRef] = useState<string | null>(null)
  const [trocasItem, setTrocasItem] = useState<string | null>(null)
  const [dias, setDias] = useState<7 | 14 | 30>(7)
  const [iniciou, setIniciou] = useState(false)

  const planos = useMemo(() => linhas.map(l => ({ id: l.id, data: l.data, dados: normalizarPlano(l.dados) })), [linhas])
  const { taco, erro: erroTaco, tentarDeNovo } = useTaco()
  const catalogo = useMemo(() => catalogoCom(plano.personalizados, taco ?? []), [plano.personalizados, taco])

  function abrirNovo(base?: PlanoDados) {
    setActiveId(null)
    setPlano(base ?? planoVazio())
    setData(hojeBrasil()); setSavedSnap(''); setSaved(false); setBuscaRef(null); setTrocasItem(null)
  }
  function abrir(p: { id: string; data: string; dados: PlanoDados }) {
    setActiveId(p.id); setPlano(p.dados); setData(p.data); setSavedSnap(snapshot(p.dados, p.data)); setSaved(false)
    setBuscaRef(null); setTrocasItem(null)
  }

  // abre o plano mais recente quando a lista termina de carregar; sem plano salvo, um novo em branco
  if (!carregando && !iniciou) {
    setIniciou(true)
    if (planos[0]) abrir(planos[0]); else abrirNovo()
  }

  const dirty = snapshot(plano, data) !== savedSnap
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  async function confirmarDescarte() {
    if (!dirty) return true
    return confirmDialog({
      title: 'Descartar alterações?',
      message: 'Este plano tem alterações não salvas. Se continuar, elas serão perdidas.',
      confirmText: 'Descartar', cancelText: 'Voltar e salvar', danger: true,
    })
  }
  async function escolher(p: { id: string; data: string; dados: PlanoDados } | null) {
    if (p && p.id === activeId) return
    if (!(await confirmarDescarte())) return
    if (p) abrir(p); else abrirNovo()
  }
  async function duplicar() {
    if (!(await confirmarDescarte())) return
    const copia: PlanoDados = {
      ...plano, titulo: `${plano.titulo} (cópia)`,
      refeicoes: plano.refeicoes.map(r => ({ ...r, id: novoId(), itens: r.itens.map(i => ({ ...i, id: novoId() })) })),
    }
    abrirNovo(copia)
  }

  // ── edição ──
  const alterar = (fn: (p: PlanoDados) => PlanoDados) => { setPlano(fn); setSaved(false) }
  const alterarRefeicao = (id: string, fn: (r: Refeicao) => Refeicao) => alterar(p => ({ ...p, refeicoes: p.refeicoes.map(r => (r.id === id ? fn(r) : r)) }))
  const alterarItem = (rid: string, iid: string, patch: Partial<ItemPlano>) =>
    alterarRefeicao(rid, r => ({ ...r, itens: r.itens.map(i => (i.id === iid ? { ...i, ...patch } : i)) }))
  const setMeta = (patch: Partial<MetaDiaria>) => alterar(p => ({ ...p, meta: { ...p.meta, ...patch } }))

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
      const ok = await confirmDialog({ title: 'Remover esta refeição?', message: `"${r.nome || 'Refeição'}" e os ${r.itens.length} alimentos dela serão removidos do plano.`, confirmText: 'Remover', cancelText: 'Manter', danger: true })
      if (!ok) return
    }
    alterar(p => ({ ...p, refeicoes: p.refeicoes.filter(x => x.id !== r.id) }))
  }

  function usarMetaDaAvaliacao() {
    if (!metaSugerida) return
    setMeta(metaSugerida)
    showToast('ok', 'Meta preenchida com a da última avaliação.')
  }

  async function salvar() {
    setSaving(true)
    const r = await salvarNutri({ id: activeId, clinicId, patientId: patient.id, tipo: 'plano', data, dados: plano })
    setSaving(false)
    if (!r.ok) { showToast('error', MENSAGEM_INDISPONIVEL[r.motivo]); return }
    setActiveId(r.id); setSavedSnap(snapshot(plano, data)); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    await recarregar()
  }

  async function excluir() {
    if (!activeId) return
    const ok = await confirmDialog({
      title: 'Excluir este plano?', message: `O plano "${plano.titulo}" será removido. Isso não pode ser desfeito.`,
      confirmText: 'Excluir plano', cancelText: 'Manter', danger: true,
    })
    if (!ok) return
    const r = await excluirNutri(activeId)
    if (!r.ok) { showToast('error', 'Não foi possível excluir agora. Tente de novo.'); return }
    const restantes = planos.filter(x => x.id !== activeId)
    await recarregar()
    if (restantes[0]) abrir(restantes[0]); else abrirNovo()
  }

  // ── cálculo ao vivo ──
  const totais = useMemo(() => totaisDoPlano(plano, catalogo), [plano, catalogo])
  const progresso = useMemo(() => progressoDoDia(totais.dia, plano.meta), [totais.dia, plano.meta])
  const compras = useMemo(() => listaDeCompras(plano, catalogo, dias), [plano, catalogo, dias])
  const resultados = useMemo(() => (busca.trim().length >= 2 ? buscarAlimentos(catalogo, busca, 30) : []), [catalogo, busca])
  const totalItens = plano.refeicoes.reduce((n, r) => n + r.itens.length, 0)

  const cab = { clinica: clinica.name, paciente: patient.name, detalhe: [clinica.address, clinica.phone].filter(Boolean).join(' | ') || undefined }

  // as impressões vão para o menu "Imprimir" do prontuário (sem botões próprios aqui)
  const semItens = !taco ? 'Aguarde o banco de alimentos carregar' : totalItens === 0 ? 'Adicione alimentos ao plano para imprimir' : undefined
  usePrintActions('nutri', [
    { id: 'nutri-plano', label: 'Plano alimentar', includes: ['Refeições, horários, alimentos e quantidades', 'Meta diária e totais do plano'], disabledReason: semItens, run: () => imprimirNutri(htmlPlano(cab, plano, catalogo)) },
    { id: 'nutri-trocas', label: 'Lista de trocas do plano', includes: ['Substituições possíveis para cada alimento do plano'], disabledReason: semItens, run: () => imprimirNutri(htmlSubstituicoes(cab, plano, catalogo)) },
    { id: 'nutri-compras', label: `Lista de compras (${dias === 7 ? '1 semana' : dias === 14 ? '2 semanas' : '30 dias'})`, includes: ['Quantidade total de cada alimento para o período escolhido na tela'], disabledReason: semItens, run: () => imprimirNutri(htmlCompras(cab, plano, catalogo, dias)) },
  ], 'plano')

  // ── formulário de alimento personalizado ──
  const [pers, setPers] = useState({ nome: '', grupo: 'preparados' as GrupoAlimentar, kcal: '', p: '', c: '', l: '', f: '' })
  function criarPersonalizado(rid: string) {
    const kcal = Number(pers.kcal)
    if (!pers.nome.trim() || !(kcal > 0)) { showToast('error', 'Informe o nome e a energia (kcal por 100 g) do alimento.'); return }
    const a: Alimento = {
      id: `pers-${novoId()}`, nome: pers.nome.trim(), grupo: pers.grupo, kcal,
      proteina: Number(pers.p) || 0, carboidrato: Number(pers.c) || 0, lipidio: Number(pers.l) || 0, fibra: Number(pers.f) || 0, origem: 'personalizado',
    }
    alterar(p => ({
      ...p,
      personalizados: [...p.personalizados, { id: a.id, nome: a.nome, grupo: a.grupo, kcal: a.kcal, proteina: a.proteina, carboidrato: a.carboidrato, lipidio: a.lipidio, fibra: a.fibra }],
    }))
    adicionarAlimento(rid, a)
    setPers({ nome: '', grupo: 'preparados', kcal: '', p: '', c: '', l: '', f: '' })
  }

  // sem a TACO carregada, os itens do plano apareceriam como "removidos": espera o chunk antes de mostrar o plano
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

      {/* ── Planos salvos ── */}
      <div className={styles.histBar}>
        <div className={styles.histChips} role="group" aria-label="Planos alimentares">
          {planos.map(p => (
            <button key={p.id} type="button" aria-pressed={p.id === activeId} className={`${styles.chip} ${p.id === activeId ? styles.chipActive : ''}`} onClick={() => escolher(p)}>
              {curto(p.dados.titulo)} · {fmtData(p.data)}
            </button>
          ))}
          {activeId === null && <span className={`${styles.chip} ${styles.chipActive}`} aria-current="true">Novo plano</span>}
        </div>
        <div className={styles.row}>
          <button type="button" className={`${styles.chip} ${styles.chipNew}`} onClick={() => escolher(null)}>+ Novo plano</button>
          <button type="button" className={`${styles.chip} ${styles.chipNew}`} onClick={duplicar}>Duplicar</button>
        </div>
      </div>
      {carregando && <p className={styles.hint}>Carregando planos...</p>}

      {/* ── Identificação e meta ── */}
      <section className={styles.card} aria-label="Plano e meta">
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="plano-titulo">Nome do plano</label>
            <input id="plano-titulo" className={styles.input} value={plano.titulo} maxLength={80} onChange={e => alterar(p => ({ ...p, titulo: e.target.value }))} />
          </div>
          <div className={styles.field}>
            <label>Data</label>
            <DatePicker value={data} onChange={v => { setData(v || hojeBrasil()); setSaved(false) }} ariaLabel="Data do plano" />
          </div>
        </div>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Meta diária</h3>
          <Button variant="secondary" onClick={usarMetaDaAvaliacao} disabled={!metaSugerida}>Usar meta da última avaliação</Button>
        </div>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor="meta-kcal">Energia <span className={styles.unit}>(kcal)</span></label>
            <DecimalInput id="meta-kcal" className={styles.input} value={textoMeta(plano.meta.kcal)} onChange={v => setMeta({ kcal: numeroOuNull(v) })} max={9999} decimals={0} placeholder="0" />
          </div>
          <div className={styles.field}>
            <label htmlFor="meta-p">Proteína <span className={styles.unit}>(g)</span></label>
            <DecimalInput id="meta-p" className={styles.input} value={textoMeta(plano.meta.proteinaG)} onChange={v => setMeta({ proteinaG: numeroOuNull(v) })} max={999} decimals={0} placeholder="0" />
          </div>
          <div className={styles.field}>
            <label htmlFor="meta-c">Carboidrato <span className={styles.unit}>(g)</span></label>
            <DecimalInput id="meta-c" className={styles.input} value={textoMeta(plano.meta.carboidratoG)} onChange={v => setMeta({ carboidratoG: numeroOuNull(v) })} max={1500} decimals={0} placeholder="0" />
          </div>
          <div className={styles.field}>
            <label htmlFor="meta-l">Lipídio <span className={styles.unit}>(g)</span></label>
            <DecimalInput id="meta-l" className={styles.input} value={textoMeta(plano.meta.lipidioG)} onChange={v => setMeta({ lipidioG: numeroOuNull(v) })} max={999} decimals={0} placeholder="0" />
          </div>
        </div>
        {!metaSugerida && <p className={styles.hint}>Sem meta calculada: preencha a Avaliação (peso, altura, idade e sexo) para sugerir a meta, ou digite os valores.</p>}
      </section>

      {/* ── Progresso em tempo real ── */}
      <div className={styles.progress} role="group" aria-label="Progresso do dia contra a meta">
        {progresso.map(p => {
          const pct = p.fracao === null ? 0 : Math.min(100, p.fracao * 100)
          const cls = p.situacao === 'ok' ? styles.barOk : p.situacao === 'abaixo' ? styles.barBelow : p.situacao === 'acima' ? styles.barAbove : ''
          return (
            <div key={p.chave} className={styles.pItem}>
              <div className={styles.pHead}>
                <span className={styles.pName}>{p.rotulo}</span>
                <span className={styles.pVal}>{formatarNumero(p.atual, p.chave === 'kcal' ? 0 : 1)}{p.meta !== null && <small> / {formatarNumero(p.meta, 0)} {p.un}</small>}{p.meta === null && <small> {p.un}</small>}</span>
              </div>
              <div className={styles.bar} role="progressbar" aria-label={p.rotulo} aria-valuemin={0} aria-valuemax={p.meta ?? undefined} aria-valuenow={Math.round(p.atual)}>
                <div className={`${styles.barFill} ${cls}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.pNote}>
                {p.situacao === null ? 'Sem meta' : p.situacao === 'ok' ? `${Math.round((p.fracao ?? 0) * 100)}% da meta` : p.situacao === 'abaixo' ? `Faltam ${formatarNumero(p.meta! - p.atual, p.chave === 'kcal' ? 0 : 1)} ${p.un}` : `Passou ${formatarNumero(p.atual - p.meta!, p.chave === 'kcal' ? 0 : 1)} ${p.un}`}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Refeições ── */}
      {plano.refeicoes.map(r => {
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
              {r.itens.length === 0 && <p className={styles.empty}>Nenhum alimento nesta refeição.</p>}
              {(t?.itens ?? []).map(({ item, alimento, nutrientes }) => {
                const nome = alimento?.nome ?? 'Alimento removido do catálogo'
                const trocas = trocasItem === item.id && alimento ? substituicoesEquivalentes(alimento, item.gramas, catalogo, { max: 8 }) : null
                return (
                  <div key={item.id}>
                    <div className={styles.item}>
                      <div className={styles.itemName}>
                        <span>{nome}</span>
                        {alimento && <span className={styles.itemGroup}>{GRUPO_INFO[alimento.grupo].rotulo}{alimento.origem === 'personalizado' ? ' | personalizado' : ''}</span>}
                      </div>
                      <div className={styles.itemQty}>
                        <DecimalInput className={styles.input} value={item.gramas > 0 ? String(item.gramas) : ''} onChange={v => alterarItem(r.id, item.id, { gramas: v === '' ? 0 : Number(v) })} max={3000} decimals={1} placeholder="g" aria-label={`Quantidade em gramas de ${nome}`} />
                        <input className={styles.input} value={item.medida ?? ''} maxLength={60} placeholder="Medida caseira" aria-label={`Medida caseira de ${nome}`} onChange={e => alterarItem(r.id, item.id, { medida: e.target.value })} />
                      </div>
                      <span className={styles.itemKcal}>{formatarNumero(nutrientes.kcal, 0)} kcal</span>
                      <button type="button" className={`${styles.iconBtn} ${styles.itemSwap} ${trocasItem === item.id ? styles.iconBtnOn : ''}`} aria-pressed={trocasItem === item.id} aria-label={`Ver trocas equivalentes de ${nome}`} title="Trocas equivalentes" disabled={!alimento} onClick={() => setTrocasItem(trocasItem === item.id ? null : item.id)}><Icon name="swap" size={18} /></button>
                      <button type="button" className={`${styles.iconBtn} ${styles.itemDel}`} aria-label={`Remover ${nome}`} onClick={() => alterarRefeicao(r.id, x => ({ ...x, itens: x.itens.filter(i => i.id !== item.id) }))}><Icon name="close" size={18} /></button>
                    </div>
                    {trocas && (
                      <div className={styles.subs}>
                        <span className={styles.subsTitle}>{formatarNumero(item.gramas, 0)} g de {nome} ({formatarNumero(nutrientes.kcal, 0)} kcal) equivale, com até 10% de diferença de energia, a:</span>
                        {trocas.length === 0 && <span className={styles.hint}>Sem trocas para este item (energia muito baixa ou sem alimento parecido no grupo).</span>}
                        {trocas.map(s => (
                          <div key={s.alimento.id} className={styles.subRow}>
                            <span>{s.gramas} g de {s.alimento.nome}<span className={styles.subMeta}> | {s.kcal} kcal | P {formatarNumero(s.proteina, 1)} C {formatarNumero(s.carboidrato, 1)} L {formatarNumero(s.lipidio, 1)}</span></span>
                            <Button variant="secondary" onClick={() => { alterarItem(r.id, item.id, { alimentoId: s.alimento.id, gramas: s.gramas, medida: '' }); setTrocasItem(null) }}>Trocar</Button>
                          </div>
                        ))}
                      </div>
                    )}
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
                    <input className={`${styles.input} ${styles.wide}`} value={pers.nome} onChange={e => setPers(s => ({ ...s, nome: e.target.value }))} placeholder="Nome do alimento (ex.: Leite integral, rótulo)" aria-label="Nome do alimento personalizado" maxLength={80} />
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
              <label htmlFor={`obs-${r.id}`}>Observação da refeição</label>
              <input id={`obs-${r.id}`} className={styles.input} value={r.obs ?? ''} maxLength={200} onChange={e => alterarRefeicao(r.id, x => ({ ...x, obs: e.target.value }))} placeholder="Opcional" />
            </div>
          </section>
        )
      })}
      <div>
        <Button variant="secondary" icon="plus" onClick={() => alterar(p => ({ ...p, refeicoes: [...p.refeicoes, { id: novoId(), nome: `Refeição ${p.refeicoes.length + 1}`, horario: '', itens: [] }] }))}>Adicionar refeição</Button>
      </div>

      <section className={styles.card} aria-label="Orientações">
        <div className={styles.field}>
          <label htmlFor="plano-obs">Orientações gerais</label>
          <textarea id="plano-obs" className={styles.textarea} value={plano.observacoes ?? ''} onChange={e => alterar(p => ({ ...p, observacoes: e.target.value }))} placeholder="Hidratação, preparo, o que evitar, quando retornar..." />
        </div>
      </section>

      {/* ── Lista de compras ── */}
      <section className={styles.card} aria-label="Lista de compras">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Lista de compras</h3>
          <PillTabs<'7' | '14' | '30'> label="Período da lista" value={String(dias) as '7' | '14' | '30'} onChange={v => setDias(Number(v) as 7 | 14 | 30)}
            options={[{ value: '7', label: 'Semana' }, { value: '14', label: '2 semanas' }, { value: '30', label: '30 dias' }]} />
        </div>
        {compras.length === 0 ? <p className={styles.empty}>Adicione alimentos ao plano para gerar a lista.</p> : (
          <div className={styles.shop}>
            {compras.map(g => (
              <div key={g.grupo} className={styles.shopGroup}>
                <span className={styles.shopGroupName}>{g.rotulo}</span>
                {g.itens.map(i => (
                  <div key={i.alimento.id} className={styles.shopRow}>
                    <span>{i.alimento.nome}</span>
                    <span><span className={styles.shopQty}>{formatarPeso(i.gramasTotal)}</span><span className={styles.shopPer}>{formatarNumero(i.gramasPorDia, 0)} g/dia</span></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <span className={styles.hint}>As quantidades seguem o preparo do plano (ex.: arroz cozido). Para itens crus ou com casca, compre um pouco a mais.</span>
      </section>

      {/* ── Ações ── */}
      <div className={styles.saveRow}>
        {dirty && !saving && <span className={styles.dirtyMsg}>Alterações não salvas</span>}
        {saved && <span className={styles.savedMsg}><Icon name="check" size={16} /> Plano salvo</span>}
        {activeId && <Button variant="secondary" onClick={excluir} disabled={saving}>Excluir</Button>}
        <Button variant="primary" onClick={salvar} loading={saving} disabled={!dirty && activeId !== null}>{activeId ? 'Salvar alterações' : 'Salvar plano'}</Button>
      </div>
    </div>
  )
}
