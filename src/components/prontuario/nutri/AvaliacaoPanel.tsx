'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { IntegerInput } from '@/components/ui/NumericInput'
import { PillTabs } from '@/components/ui/PillTabs'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Icon } from '@/components/ui/Icon'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import {
  DOBRAS, PROTOCOLOS, PROTOCOLO_INFO, dobrasDoProtocolo,
  type Classificacao, type DobraKey, type ProtocoloDobras, type Sexo,
} from '@/lib/nutri/antropometria'
import {
  EQUACAO_INFO, EQUACOES_TMB, NIVEIS_ATIVIDADE, type EquacaoTmb,
} from '@/lib/nutri/energia'
import {
  avaliacaoTemConteudo, avaliacaoVazia, errosBloqueantes, normalizarAvaliacao, resumirAvaliacao, type AvaliacaoDados, type FonteComposicao,
} from '@/lib/nutri/avaliacao'
import { excluirNutri, MENSAGEM_INDISPONIVEL, salvarNutri, type LinhaNutri } from '@/lib/nutri/storage'
import type { Indisponibilidade } from '@/lib/nutri/erros'
import { formatarNumero, idadeEm } from '@/lib/nutri/validacao'
import { CampoNumero } from './Campos'
import styles from './nutri.module.css'

const fmtData = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })

export function sexoDoPaciente(gender: string | null | undefined): Sexo | null {
  const g = (gender ?? '').trim().toLowerCase()
  if (g === 'masculino') return 'M'
  if (g === 'feminino') return 'F'
  return null
}

const snapshot = (d: AvaliacaoDados, data: string) => (avaliacaoTemConteudo(d) ? JSON.stringify({ d, data }) : '')

const tagClasse = (c: Classificacao | null) => (c ? (c.gravidade === 'ok' ? styles.tagOk : c.gravidade === 'atencao' ? styles.tagWarn : styles.tagBad) : '')

interface Props {
  patient: Patient
  clinicId: string
  linhas: LinhaNutri[]
  carregando: boolean
  motivo: Indisponibilidade | null
  recarregar: () => Promise<unknown>
  onDirtyChange?: (dirty: boolean) => void
}

export function AvaliacaoPanel({ patient, clinicId, linhas, carregando, motivo, recarregar, onDirtyChange }: Props) {
  const sexoPadrao = sexoDoPaciente(patient.gender)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AvaliacaoDados>(() => avaliacaoVazia(sexoPadrao))
  const [data, setData] = useState(() => hojeBrasil())
  const [savedSnap, setSavedSnap] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [iniciou, setIniciou] = useState(false)

  const registros = useMemo(() => linhas.map(l => ({ id: l.id, data: l.data, dados: normalizarAvaliacao(l.dados) })), [linhas])

  function novoRascunho(): AvaliacaoDados {
    // a nova consulta parte das escolhas da anterior (altura, protocolo, equação, metas g/kg), sem os valores medidos
    const ult = registros[0]?.dados
    const base = avaliacaoVazia(ult?.sexo ?? sexoPadrao)
    if (!ult) return base
    return {
      ...base, altura: ult.altura, idadeManual: ult.idadeManual, protocolo: ult.protocolo, fonteComposicao: ult.fonteComposicao,
      equacaoTmb: ult.equacaoTmb, fatorAtividade: ult.fatorAtividade, ajusteKcal: ult.ajusteKcal, proteinaGkg: ult.proteinaGkg, lipidioGkg: ult.lipidioGkg,
    }
  }

  function abrirNovo() {
    // o ponto de partida é o rascunho já com as escolhas herdadas: só é "não salvo" o que o profissional mudar
    const r = novoRascunho(); const hoje = hojeBrasil()
    setActiveId(null); setDraft(r); setData(hoje); setSavedSnap(snapshot(r, hoje)); setSaved(false)
  }
  function abrir(r: { id: string; data: string; dados: AvaliacaoDados }) {
    setActiveId(r.id); setDraft(r.dados); setData(r.data); setSavedSnap(snapshot(r.dados, r.data)); setSaved(false)
  }

  // abre a avaliação mais recente quando o histórico termina de carregar; sem histórico, uma nova em branco
  if (!carregando && !iniciou) {
    setIniciou(true)
    if (registros[0]) abrir(registros[0]); else abrirNovo()
  }

  const dirty = snapshot(draft, data) !== savedSnap
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  async function confirmarDescarte(): Promise<boolean> {
    if (!dirty) return true
    return confirmDialog({
      title: 'Descartar alterações?',
      message: 'Esta avaliação tem alterações não salvas. Se continuar, elas serão perdidas.',
      confirmText: 'Descartar', cancelText: 'Voltar e salvar', danger: true,
    })
  }
  async function escolher(r: { id: string; data: string; dados: AvaliacaoDados } | null) {
    if (r && r.id === activeId) return
    if (!(await confirmarDescarte())) return
    if (r) abrir(r); else abrirNovo()
  }

  const set = <K extends keyof AvaliacaoDados>(k: K, v: AvaliacaoDados[K]) => { setDraft(d => ({ ...d, [k]: v })); setSaved(false) }
  const setDobra = (k: DobraKey, v: string) => { setDraft(d => ({ ...d, dobras: { ...d.dobras, [k]: v } })); setSaved(false) }

  const resumo = useMemo(
    () => resumirAvaliacao(draft, { nascimento: patient.birth_date, data }),
    [draft, patient.birth_date, data],
  )
  const idadePorNascimento = idadeEm(patient.birth_date, data)
  const sexo = draft.sexo
  const exigidas = sexo ? dobrasDoProtocolo(draft.protocolo, sexo) : []
  const erros = resumo.erros

  async function salvar() {
    if (!avaliacaoTemConteudo(draft) || (!activeId && !dirty)) { showToast('error', 'Preencha ao menos uma medida antes de salvar.'); return }
    if (errosBloqueantes(erros, draft, idadePorNascimento !== null).length > 0) { showToast('error', 'Corrija os campos com valores fora do esperado antes de salvar.'); return }
    setSaving(true)
    const r = await salvarNutri({ id: activeId, clinicId, patientId: patient.id, tipo: 'avaliacao', data, dados: draft })
    setSaving(false)
    if (!r.ok) { showToast('error', MENSAGEM_INDISPONIVEL[r.motivo]); return }
    setActiveId(r.id); setSavedSnap(snapshot(draft, data)); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    await recarregar()
  }

  async function excluir() {
    if (!activeId) return
    const ok = await confirmDialog({
      title: 'Excluir esta avaliação?',
      message: `A avaliação de ${fmtData(data)} será removida do histórico e dos gráficos. Isso não pode ser desfeito.`,
      confirmText: 'Excluir avaliação', cancelText: 'Manter', danger: true,
    })
    if (!ok) return
    const r = await excluirNutri(activeId)
    if (!r.ok) { showToast('error', 'Não foi possível excluir agora. Tente de novo.'); return }
    const restantes = registros.filter(x => x.id !== activeId)
    await recarregar()
    if (restantes[0]) abrir(restantes[0]); else abrirNovo()
  }

  const macros = resumo.macros

  return (
    <div className={styles.wrap}>
      {motivo && (
        <div className={styles.notice} role="status">
          <Icon name="alert" size={18} />
          <span>{MENSAGEM_INDISPONIVEL[motivo]}</span>
        </div>
      )}

      {/* ── Histórico por data ── */}
      <div className={styles.histBar}>
        <div className={styles.histChips} role="group" aria-label="Avaliações por data">
          {registros.map(r => (
            <button key={r.id} type="button" aria-pressed={r.id === activeId} className={`${styles.chip} ${r.id === activeId ? styles.chipActive : ''}`} onClick={() => escolher(r)}>
              {fmtData(r.data)}
            </button>
          ))}
          {activeId === null && <span className={`${styles.chip} ${styles.chipActive}`} aria-current="true">Nova avaliação</span>}
        </div>
        {activeId !== null && <button type="button" className={`${styles.chip} ${styles.chipNew}`} onClick={() => escolher(null)}>+ Nova avaliação</button>}
      </div>
      {carregando && <p className={styles.hint}>Carregando histórico...</p>}

      {/* ── Dados da avaliação ── */}
      <section className={styles.card} aria-label="Dados da avaliação">
        <h3 className={styles.cardTitle}>Dados da avaliação</h3>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label>Data da avaliação</label>
            <DatePicker value={data} onChange={v => { setData(v || hojeBrasil()); setSaved(false) }} max={hojeBrasil()} ariaLabel="Data da avaliação" />
          </div>
          <div className={styles.field}>
            <label>Sexo (para os cálculos)</label>
            <SelectMenu variant="field" ariaLabel="Sexo para os cálculos" value={sexo ?? ''} onChange={v => set('sexo', v === 'M' || v === 'F' ? v : null)}
              options={[{ value: '', label: 'Selecionar' }, { value: 'F', label: 'Feminino' }, { value: 'M', label: 'Masculino' }]} />
          </div>
          <div className={styles.field}>
            <label htmlFor="nutri-idade">Idade <span className={styles.unit}>(anos)</span></label>
            {idadePorNascimento !== null
              ? <input id="nutri-idade" className={styles.input} value={`${idadePorNascimento}`} disabled aria-describedby="nutri-idade-dica" />
              : <IntegerInput id="nutri-idade" className={`${styles.input} ${erros.idadeManual ? styles.inputErr : ''}`} value={draft.idadeManual} onChange={v => set('idadeManual', v)} max={120} placeholder="Anos" />}
            <span id="nutri-idade-dica" className={styles.hint}>
              {idadePorNascimento !== null ? 'Calculada pela data de nascimento do cadastro.' : 'Sem data de nascimento no cadastro: digite a idade.'}
            </span>
          </div>
        </div>
        {!sexo && <p className={styles.warn}>Escolha o sexo: as equações de dobras, o RCQ e a TMB dependem dele.</p>}
      </section>

      {/* ── Medidas ── */}
      <section className={styles.card} aria-label="Medidas">
        <h3 className={styles.cardTitle}>Medidas</h3>
        <div className={styles.grid}>
          <CampoNumero rotulo="Peso" valor={draft.peso} onChange={v => set('peso', v)} limite="peso" casas={2} erro={erros.peso} />
          <CampoNumero rotulo="Altura" valor={draft.altura} onChange={v => set('altura', v)} limite="altura" casas={1} erro={erros.altura} />
          <CampoNumero rotulo="Cintura" valor={draft.cintura} onChange={v => set('cintura', v)} limite="cintura" casas={1} erro={erros.cintura} />
          <CampoNumero rotulo="Quadril" valor={draft.quadril} onChange={v => set('quadril', v)} limite="quadril" casas={1} erro={erros.quadril} />
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>IMC</span>
            <span className={styles.statValue}>{formatarNumero(resumo.imc, 1)}<small>kg/m²</small></span>
            {resumo.imcClasse && <span className={`${styles.tag} ${tagClasse(resumo.imcClasse)}`}>{resumo.imcClasse.rotulo}</span>}
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>RCQ (cintura/quadril)</span>
            <span className={styles.statValue}>{formatarNumero(resumo.rcq, 2)}</span>
            {resumo.rcqClasse && <span className={`${styles.tag} ${tagClasse(resumo.rcqClasse)}`}>{resumo.rcqClasse.rotulo}</span>}
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Cintura</span>
            <span className={styles.statValue}>{formatarNumero(resumo.cinturaCm, 1)}<small>cm</small></span>
            {resumo.cinturaClasse && <span className={`${styles.tag} ${tagClasse(resumo.cinturaClasse)}`}>{resumo.cinturaClasse.rotulo}</span>}
          </div>
        </div>
        {resumo.imcClasse && <span className={styles.hint}>Fonte da classificação do IMC: {resumo.imcClasse.fonte}.</span>}
      </section>

      {/* ── Composição corporal ── */}
      <section className={styles.card} aria-label="Composição corporal">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Composição corporal</h3>
          <PillTabs<FonteComposicao>
            label="Origem da composição corporal"
            value={draft.fonteComposicao}
            onChange={v => set('fonteComposicao', v)}
            options={[{ value: 'dobras', label: 'Dobras cutâneas' }, { value: 'manual', label: 'Informar valores' }]}
          />
        </div>

        {draft.fonteComposicao === 'dobras' ? (
          <>
            <div className={styles.field}>
              <label>Protocolo</label>
              <SelectMenu variant="field" ariaLabel="Protocolo de dobras cutâneas" value={draft.protocolo} onChange={v => set('protocolo', v as ProtocoloDobras)}
                options={PROTOCOLOS.map(p => ({ value: p.id, label: p.rotulo }))} />
              <span className={styles.hint}>{PROTOCOLO_INFO[draft.protocolo].resumo}. Fonte: {PROTOCOLO_INFO[draft.protocolo].fonte}. % de gordura pela equação de Siri (1961).</span>
            </div>
            <div className={styles.grid}>
              {DOBRAS.filter(d => exigidas.includes(d.key) || !!draft.dobras[d.key]).map(d => (
                <CampoNumero key={d.key} rotulo={d.rotulo} valor={draft.dobras[d.key] ?? ''} onChange={v => setDobra(d.key, v)} limite="dobra" casas={1}
                  erro={erros[`dobra:${d.key}`]} obrigatorio={exigidas.includes(d.key)} />
              ))}
            </div>
            {resumo.faltamDobras && <p className={styles.warn}>Para este protocolo ainda falta: {resumo.faltamDobras.join(', ')}.</p>}
          </>
        ) : (
          <div className={styles.grid}>
            <CampoNumero rotulo="% de gordura" valor={draft.pctGorduraManual} onChange={v => set('pctGorduraManual', v)} limite="pctGordura" casas={1} erro={erros.pctGorduraManual} />
            <CampoNumero rotulo="Massa gorda" valor={draft.massaGordaManual} onChange={v => set('massaGordaManual', v)} limite="massa" casas={2} erro={erros.massaGordaManual} />
            <CampoNumero rotulo="Massa magra" valor={draft.massaMagraManual} onChange={v => set('massaMagraManual', v)} limite="massa" casas={2} erro={erros.massaMagraManual} />
          </div>
        )}
        {draft.fonteComposicao === 'manual' && <span className={styles.hint}>Use o laudo da bioimpedância ou de outro método. Vale o primeiro preenchido: % de gordura, depois massa gorda, depois massa magra (precisa do peso).</span>}

        <div className={styles.stats}>
          {draft.fonteComposicao === 'dobras' && (
            <>
              <div className={styles.stat}><span className={styles.statLabel}>Soma das dobras</span><span className={styles.statValue}>{formatarNumero(resumo.somatorioDobras, 1)}<small>mm</small></span></div>
              <div className={styles.stat}><span className={styles.statLabel}>Densidade corporal</span><span className={styles.statValue}>{formatarNumero(resumo.densidade, 4)}<small>g/mL</small></span></div>
            </>
          )}
          <div className={styles.stat}><span className={styles.statLabel}>% de gordura</span><span className={styles.statValue}>{formatarNumero(resumo.pctGordura, 1)}<small>%</small></span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Massa gorda</span><span className={styles.statValue}>{formatarNumero(resumo.massaGordaKg, 1)}<small>kg</small></span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Massa magra</span><span className={styles.statValue}>{formatarNumero(resumo.massaMagraKg, 1)}<small>kg</small></span></div>
        </div>
        {resumo.avisoComposicao && <p className={styles.warn}>{resumo.avisoComposicao}</p>}
      </section>

      {/* ── Gasto energético e macros ── */}
      <section className={styles.card} aria-label="Gasto energético">
        <h3 className={styles.cardTitle}>Gasto energético e macronutrientes</h3>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label>Equação da TMB</label>
            <SelectMenu variant="field" ariaLabel="Equação da taxa metabólica basal" value={draft.equacaoTmb} onChange={v => set('equacaoTmb', v as EquacaoTmb)}
              options={EQUACOES_TMB.map(e => ({ value: e.id, label: e.rotulo }))} />
            <span className={styles.hint}>Fonte: {EQUACAO_INFO[draft.equacaoTmb].fonte}.{EQUACAO_INFO[draft.equacaoTmb].precisaMassaMagra ? ' Precisa da massa magra (informe as dobras ou os valores acima).' : ''}</span>
          </div>
          <div className={styles.field}>
            <label>Nível de atividade</label>
            <SelectMenu variant="field" ariaLabel="Nível de atividade física" value={NIVEIS_ATIVIDADE.find(n => String(n.fator) === draft.fatorAtividade)?.id ?? 'outro'}
              onChange={v => { const n = NIVEIS_ATIVIDADE.find(x => x.id === v); if (n) set('fatorAtividade', String(n.fator)); else set('fatorAtividade', draft.fatorAtividade || '1.2') }}
              options={[...NIVEIS_ATIVIDADE.map(n => ({ value: n.id, label: `${n.rotulo} (x${String(n.fator).replace('.', ',')})` })), { value: 'outro', label: 'Outro fator (informar)' }]} />
          </div>
        </div>
        {!NIVEIS_ATIVIDADE.some(n => String(n.fator) === draft.fatorAtividade) && (
          <div className={styles.grid}>
            <CampoNumero rotulo="Fator de atividade" valor={draft.fatorAtividade} onChange={v => set('fatorAtividade', v)} limite="fatorAtividade" casas={2} erro={erros.fatorAtividade} />
          </div>
        )}

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label>Ajuste calórico na meta</label>
            <PillTabs<'deficit' | 'manter' | 'superavit'>
              label="Ajuste calórico"
              value={draft.ajusteKcal.startsWith('-') ? 'deficit' : draft.ajusteKcal && draft.ajusteKcal !== '0' ? 'superavit' : 'manter'}
              onChange={v => {
                const abs = draft.ajusteKcal.replace('-', '') || '500'
                set('ajusteKcal', v === 'manter' ? '' : v === 'deficit' ? `-${abs}` : abs)
              }}
              options={[{ value: 'deficit', label: 'Déficit' }, { value: 'manter', label: 'Manter' }, { value: 'superavit', label: 'Superávit' }]}
            />
          </div>
          {draft.ajusteKcal !== '' && draft.ajusteKcal !== '0' && (
            <div className={styles.field}>
              <label htmlFor="nutri-ajuste">Valor do ajuste <span className={styles.unit}>(kcal/dia)</span></label>
              <IntegerInput id="nutri-ajuste" className={`${styles.input} ${erros.ajusteKcal ? styles.inputErr : ''}`} max={2500}
                value={draft.ajusteKcal.replace('-', '')} onChange={v => set('ajusteKcal', v === '' ? '' : draft.ajusteKcal.startsWith('-') ? `-${v}` : v)} placeholder="500" />
            </div>
          )}
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}><span className={styles.statLabel}>TMB</span><span className={styles.statValue}>{formatarNumero(resumo.tmb, 0)}<small>kcal</small></span></div>
          <div className={styles.stat}><span className={styles.statLabel}>GET (TMB x atividade)</span><span className={styles.statValue}>{formatarNumero(resumo.get, 0)}<small>kcal</small></span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Meta calórica</span><span className={styles.statValue}>{formatarNumero(resumo.metaKcal, 0)}<small>kcal</small></span></div>
        </div>
        {resumo.tmb === null && <p className={styles.hint}>Preencha sexo, idade, peso{draft.equacaoTmb === 'cunningham' ? ' e a composição corporal' : ' e altura'} para calcular a TMB.</p>}

        <div className={styles.grid}>
          <CampoNumero rotulo="Proteína" un="g/kg" valor={draft.proteinaGkg} onChange={v => set('proteinaGkg', v)} limite="gkg" casas={2} erro={erros.proteinaGkg} />
          <CampoNumero rotulo="Lipídio" un="g/kg" valor={draft.lipidioGkg} onChange={v => set('lipidioGkg', v)} limite="gkg" casas={2} erro={erros.lipidioGkg} />
        </div>
        {macros ? (
          <div className={styles.tableScroll}>
            <table className={styles.macroTable}>
              <thead><tr><th>Macronutriente</th><th>g/dia</th><th>g/kg</th><th>% da meta</th><th>kcal</th></tr></thead>
              <tbody>
                <tr><td>Proteína</td><td>{formatarNumero(macros.proteinaG, 0)}</td><td>{formatarNumero(macros.proteinaGkg, 2)}</td><td>{formatarNumero(macros.proteinaPct, 0)}%</td><td>{formatarNumero(macros.proteinaG * 4, 0)}</td></tr>
                <tr><td>Carboidrato (o que sobra)</td><td>{formatarNumero(macros.carboidratoG, 0)}</td><td>{formatarNumero(macros.carboidratoGkg, 2)}</td><td>{formatarNumero(macros.carboidratoPct, 0)}%</td><td>{formatarNumero(macros.carboidratoG * 4, 0)}</td></tr>
                <tr><td>Lipídio</td><td>{formatarNumero(macros.lipidioG, 0)}</td><td>{formatarNumero(macros.lipidioGkg, 2)}</td><td>{formatarNumero(macros.lipidioPct, 0)}%</td><td>{formatarNumero(macros.lipidioG * 9, 0)}</td></tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.hint}>A divisão em g/kg aparece quando há meta calórica e peso válidos.</p>
        )}
        {macros?.estouro && <p className={styles.warn}>Proteína e lipídio já passam da meta calórica, então o carboidrato ficou em zero. Reduza o g/kg ou aumente a meta.</p>}
      </section>

      {/* ── Observações e salvar ── */}
      <section className={styles.card} aria-label="Observações">
        <div className={styles.field}>
          <label htmlFor="nutri-obs">Observações da avaliação</label>
          <textarea id="nutri-obs" className={styles.textarea} value={draft.obs} onChange={e => set('obs', e.target.value)} placeholder="Conduta, queixas, adesão, exames recentes..." />
        </div>
      </section>

      <div className={styles.saveRow}>
        {dirty && !saving && <span className={styles.dirtyMsg}>Alterações não salvas</span>}
        {saved && <span className={styles.savedMsg}><Icon name="check" size={16} /> Avaliação salva</span>}
        {activeId && <Button variant="secondary" onClick={excluir} disabled={saving}>Excluir</Button>}
        <Button variant="primary" onClick={salvar} loading={saving} disabled={!dirty && activeId !== null}>
          {activeId ? 'Salvar alterações' : 'Salvar avaliação'}
        </Button>
      </div>
    </div>
  )
}
