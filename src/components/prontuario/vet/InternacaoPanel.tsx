'use client'
import { useEffect, useMemo, useState } from 'react'
import type { AuthClinic, Patient } from '@/types'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { PillTabs } from '@/components/ui/PillTabs'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { abrirJanelaDeImpressao, imprimirMedico, imprimirNaJanela, type ProfissionalImpresso } from '@/lib/medico/impresso'
import { montarCabecalhoPet } from '@/lib/vet/cabecalhoPet'
import { dataBr } from '@/lib/vet/datas'
import {
  agoraBrasil, altaVazia, colunasDoItem, combinarDataHora, dataHoraBr, diasDeInternacao, evolucoesPorDia, FREQUENCIAS, htmlInternacao,
  internacaoAberta, itensDaInternacao, maisRecentesPrimeiro, normalizarEvolucao, normalizarInternacao, normalizarPrescricao, resumoDaPrescricao,
  resumoDosSinais, SAIDA_ROTULO, separarDataHora, STATUS_ROTULO, textoDias, TURNO_FAIXA, TURNO_ROTULO, turnoDaHora, validarAlta, validarEntrada,
  validarEvolucao, validarPrescricao, VIAS, type Internacao, type ItemInternacao, type SaidaInternacao, type StatusInternacao,
} from '@/lib/vet/internacao'
import { lerNumero } from '@/lib/vet/numeros'
import {
  excluirInternacao, excluirItemDeInternacao, MENSAGEM_INDISPONIVEL, salvarInternacao, salvarItemDeInternacao, type Indisponibilidade,
} from '@/lib/vet/clinicoStorage'
import { usePrintActions } from '../print/PrintRegistry'
import styles from './vet.module.css'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  profissional: ProfissionalImpresso
  internacoes: Internacao[]
  itens: ItemInternacao[]
  carregando: boolean
  motivo: Indisponibilidade | null
  recarregar: () => Promise<unknown>
  /** peso mais recente conhecido, para o impresso */
  pesoKg: number | null
  /** a seção está na tela (as impressões do menu só valem enquanto ela está aberta) */
  ativo: boolean
  onDirtyChange: (dirty: boolean) => void
}

const TOM: Record<StatusInternacao, BadgeTone> = { internado: 'warning', alta: 'success', obito: 'neutral', transferido: 'info' }

type Momento = { data: string; hora: string }
type FormEntrada = Momento & { kind: 'entrada'; id: string | null; motivo: string; leito: string; diagnostico: string }
type FormPrescricao = Momento & { kind: 'prescricao'; internacaoId: string; id: string | null; medicamento: string; dose: string; via: string; frequencia: string; observacao: string; suspensa: boolean }
type FormEvolucao = Momento & { kind: 'evolucao'; internacaoId: string; id: string | null; texto: string; temperatura: string; fc: string; fr: string }
type FormAlta = Momento & { kind: 'alta'; internacaoId: string; saida: SaidaInternacao; resumo: string; medicacaoPos: string; orientacoes: string; retornoEm: string }
type Form = FormEntrada | FormPrescricao | FormEvolucao | FormAlta

const num = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

/** Internação simples: entrada, leito/baia, prescrições e evoluções por turno, alta com resumo imprimível. */
export function InternacaoPanel({ patient, clinic, clinicId, profissional, internacoes, itens, carregando, motivo, recarregar, pesoKg, ativo, onDirtyChange }: Props) {
  const hoje = hojeBrasil()
  const [form, setForm] = useState<Form | null>(null)
  const [inicial, setInicial] = useState('')
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [exp, setExp] = useState<string | null | undefined>(undefined)

  const lista = useMemo(() => maisRecentesPrimeiro(internacoes), [internacoes])
  const aberta = useMemo(() => internacaoAberta(internacoes), [internacoes])
  const idExpandido = exp === undefined ? (aberta?.id ?? null) : exp

  const dirty = form !== null && JSON.stringify(form) !== inicial
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  function abrir(f: Form) { setErros([]); setInicial(JSON.stringify(f)); setForm(f) }
  function fechar() { setForm(null); setInicial(''); setErros([]) }
  const set = (patch: Partial<Form>) => { setForm(f => (f ? ({ ...f, ...patch } as Form) : f)); setErros([]) }

  const cabecalho = (iso: string) => montarCabecalhoPet({ clinica: clinic, paciente: patient, pesoKg, data: iso, profissional })

  function imprimir(i: Internacao) {
    imprimirMedico(htmlInternacao(cabecalho(hoje), i, itens))
  }

  // o resumo da internação mais recente vai para o menu "Imprimir" do prontuário
  const maisRecente = lista[0] ?? null
  usePrintActions('vet', ativo && maisRecente ? [{
    id: 'vet-internacao',
    label: maisRecente.status === 'internado' ? 'Ficha de internação do pet' : maisRecente.status === 'obito' ? 'Resumo da internação do pet' : 'Resumo de alta do pet',
    includes: ['Dados do pet e do tutor', 'Entrada, saída, leito e motivo', 'Prescrições e evolução por turno', 'Resumo, orientações e retorno'],
    run: () => imprimir(maisRecente),
  }] : [], 'internacao')

  // ── abrir formulários ──
  function novaInternacao() {
    const a = agoraBrasil()
    abrir({ kind: 'entrada', id: null, data: a.data, hora: a.hora, motivo: '', leito: '', diagnostico: '' })
  }
  function editarEntrada(i: Internacao) {
    const s = separarDataHora(i.entrada_em)
    abrir({ kind: 'entrada', id: i.id, data: s.data, hora: s.hora, motivo: i.motivo, leito: i.leito ?? '', diagnostico: normalizarInternacao(i.dados).diagnostico })
  }
  function novaPrescricao(i: Internacao) {
    const a = agoraBrasil()
    abrir({ kind: 'prescricao', internacaoId: i.id, id: null, data: a.data, hora: a.hora, medicamento: '', dose: '', via: '', frequencia: '', observacao: '', suspensa: false })
  }
  function editarPrescricao(it: ItemInternacao) {
    const s = separarDataHora(it.registrado_em)
    const d = normalizarPrescricao(it.dados)
    abrir({ kind: 'prescricao', internacaoId: it.internacao_id, id: it.id, data: s.data, hora: s.hora, medicamento: d.medicamento, dose: d.dose, via: d.via, frequencia: d.frequencia, observacao: d.observacao, suspensa: d.suspensa })
  }
  function novaEvolucao(i: Internacao) {
    const a = agoraBrasil()
    abrir({ kind: 'evolucao', internacaoId: i.id, id: null, data: a.data, hora: a.hora, texto: '', temperatura: '', fc: '', fr: '' })
  }
  function editarEvolucao(it: ItemInternacao) {
    const s = separarDataHora(it.registrado_em)
    const d = normalizarEvolucao(it.dados)
    abrir({ kind: 'evolucao', internacaoId: it.internacao_id, id: it.id, data: s.data, hora: s.hora, texto: d.texto, temperatura: num(d.temperaturaC), fc: num(d.fc), fr: num(d.fr) })
  }
  function novaAlta(i: Internacao) {
    const a = agoraBrasil()
    abrir({ kind: 'alta', internacaoId: i.id, data: a.data, hora: a.hora, saida: 'alta', resumo: '', medicacaoPos: '', orientacoes: '', retornoEm: '' })
  }

  // ── salvar ──
  async function aposSalvar(res: { ok: boolean; motivo?: Indisponibilidade; mensagem?: string }, mensagemOk: string): Promise<boolean> {
    if (!res.ok) {
      setErros([res.mensagem ?? MENSAGEM_INDISPONIVEL[res.motivo ?? 'erro']])
      return false
    }
    await recarregar()
    fechar()
    showToast('ok', mensagemOk)
    return true
  }

  async function salvarEntrada(f: FormEntrada) {
    const msgs = validarEntrada(f)
    const entradaEm = combinarDataHora(f.data, f.hora)
    const atual = f.id ? internacoes.find(i => i.id === f.id) : null
    if (entradaEm && atual?.saida_em && new Date(entradaEm).getTime() > new Date(atual.saida_em).getTime()) msgs.push('A entrada não pode ser depois da saída.')
    if (msgs.length || !entradaEm) { setErros(msgs); return }
    setSalvando(true)
    const dadosAtuais = normalizarInternacao(atual?.dados)
    const res = await salvarInternacao({
      id: f.id, clinicId, patientId: patient.id,
      status: atual?.status ?? 'internado', entradaEm, saidaEm: atual?.saida_em ?? null,
      leito: f.leito, motivo: f.motivo, dados: { ...dadosAtuais, diagnostico: f.diagnostico.trim() },
    })
    setSalvando(false)
    const gravou = await aposSalvar(res, f.id ? 'Internação atualizada.' : 'Internação registrada.')
    if (gravou && !f.id && res.ok) setExp(res.id)
  }

  async function salvarPrescricao(f: FormPrescricao) {
    const msgs = validarPrescricao(f)
    const cols = colunasDoItem(f)
    if (msgs.length || !cols) { setErros(msgs); return }
    setSalvando(true)
    const res = await salvarItemDeInternacao({
      id: f.id, clinicId, patientId: patient.id, internacaoId: f.internacaoId, tipo: 'prescricao', registradoEm: cols.registrado_em, turno: cols.turno,
      dados: { v: 1, medicamento: f.medicamento.trim(), dose: f.dose.trim(), via: f.via, frequencia: f.frequencia.trim(), observacao: f.observacao.trim(), suspensa: f.suspensa },
    })
    setSalvando(false)
    await aposSalvar(res, 'Prescrição salva.')
  }

  async function salvarEvolucao(f: FormEvolucao) {
    const msgs = validarEvolucao(f)
    const cols = colunasDoItem(f)
    if (msgs.length || !cols) { setErros(msgs); return }
    setSalvando(true)
    const res = await salvarItemDeInternacao({
      id: f.id, clinicId, patientId: patient.id, internacaoId: f.internacaoId, tipo: 'evolucao', registradoEm: cols.registrado_em, turno: cols.turno,
      dados: { v: 1, texto: f.texto.trim(), temperaturaC: lerNumero(f.temperatura), fc: lerNumero(f.fc), fr: lerNumero(f.fr) },
    })
    setSalvando(false)
    await aposSalvar(res, 'Evolução salva.')
  }

  async function alternarSuspensa(it: ItemInternacao) {
    const d = normalizarPrescricao(it.dados)
    const res = await salvarItemDeInternacao({
      id: it.id, clinicId, patientId: patient.id, internacaoId: it.internacao_id, tipo: 'prescricao', registradoEm: it.registrado_em, turno: it.turno,
      dados: { ...d, suspensa: !d.suspensa },
    })
    if (!res.ok) { showToast('error', res.mensagem ?? 'Não foi possível atualizar agora.'); return }
    await recarregar()
  }

  async function registrarAlta(f: FormAlta, imprimirDepois: boolean) {
    const i = internacoes.find(x => x.id === f.internacaoId)
    if (!i) return
    const msgs = validarAlta({ ...f, entradaEm: i.entrada_em })
    const saidaEm = combinarDataHora(f.data, f.hora)
    if (msgs.length || !saidaEm) { setErros(msgs); return }
    // a janela de impressão abre já, dentro do clique: depois do salvamento o navegador a bloquearia
    const janela = imprimirDepois ? abrirJanelaDeImpressao() : null
    if (imprimirDepois && !janela) { setErros(['Não abriu a impressão: o navegador bloqueou o pop-up. Libere pop-ups para este site e tente de novo.']); return }
    const alta = { ...altaVazia(), resumo: f.resumo.trim(), medicacaoPos: f.medicacaoPos.trim(), orientacoes: f.orientacoes.trim(), retornoEm: f.retornoEm, profissional: profissional.nome ? profissional : null }
    const dados = { ...normalizarInternacao(i.dados), alta }
    setSalvando(true)
    const res = await salvarInternacao({
      id: i.id, clinicId, patientId: patient.id, status: f.saida, entradaEm: i.entrada_em, saidaEm,
      leito: i.leito ?? '', motivo: i.motivo, dados,
    })
    setSalvando(false)
    if (!res.ok) { janela?.close(); await aposSalvar(res, ''); return }
    const fechada: Internacao = { ...i, status: f.saida, saida_em: saidaEm, dados }
    await aposSalvar(res, f.saida === 'alta' ? 'Alta registrada.' : `${SAIDA_ROTULO[f.saida]} registrada.`)
    if (janela) await imprimirNaJanela(janela, htmlInternacao(cabecalho(hoje), fechada, itens))
  }

  async function excluirDaInternacao(i: Internacao) {
    const ok = await confirmDialog({
      title: 'Excluir esta internação?',
      message: `A internação de ${dataHoraBr(i.entrada_em)} e todas as prescrições e evoluções dela serão removidas do prontuário. Não dá para desfazer.`,
      confirmText: 'Excluir', cancelText: 'Cancelar', danger: true,
    })
    if (!ok) return
    const r = await excluirInternacao(i.id)
    if (!r.ok) { showToast('error', 'Não foi possível excluir agora.'); return }
    await recarregar()
  }

  async function excluirItem(it: ItemInternacao, rotulo: string) {
    const ok = await confirmDialog({
      title: `Excluir ${rotulo}?`,
      message: `O registro de ${dataHoraBr(it.registrado_em)} será removido da internação. Não dá para desfazer.`,
      confirmText: 'Excluir', cancelText: 'Cancelar', danger: true,
    })
    if (!ok) return
    const r = await excluirItemDeInternacao(it.id)
    if (!r.ok) { showToast('error', 'Não foi possível excluir agora.'); return }
    await recarregar()
  }

  if (carregando) return <p className={styles.hint}>Carregando internações...</p>

  const msgErros = erros.length > 0 && <ul className={styles.errors} role="alert">{erros.map(e => <li key={e}>{e}</li>)}</ul>
  const botoes = (rotuloSalvar: string, onSalvar: () => void) => (
    <div className={styles.saveRow}>
      <Button variant="ghost" onClick={fechar} disabled={salvando}>Cancelar</Button>
      <Button variant="primary" loading={salvando} onClick={onSalvar}>{rotuloSalvar}</Button>
    </div>
  )

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
          {lista.length === 0 ? 'Nenhuma internação registrada.' : aberta ? 'Este pet está internado.' : `${lista.length} ${lista.length === 1 ? 'internação' : 'internações'} no histórico.`}
        </p>
        {!form && (
          <Button variant="primary" icon="plus" onClick={novaInternacao} disabled={motivo === 'sem_tabela' || !!aberta}>Internar</Button>
        )}
      </div>
      {aberta && !form && <p className={styles.hint}>Um pet só pode ter uma internação aberta. Dê alta nela para internar de novo.</p>}

      {form?.kind === 'entrada' && (
        <section className={styles.card} aria-label={form.id ? 'Editar internação' : 'Nova internação'}>
          <div className={styles.cardTitle}>{form.id ? 'Editar internação' : 'Internar o pet'}</div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="vi-ent-data">Data de entrada</label>
              <DatePicker id="vi-ent-data" value={form.data} onChange={v => set({ data: v || hoje })} max={hoje} ariaLabel="Data de entrada" />
            </div>
            <div className={styles.field}>
              <label htmlFor="vi-ent-hora">Hora</label>
              <input id="vi-ent-hora" type="time" className={styles.input} value={form.hora} onChange={e => set({ hora: e.target.value })} />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="vi-motivo">Motivo da internação</label>
            <textarea id="vi-motivo" className={styles.textarea} value={form.motivo} maxLength={600} onChange={e => set({ motivo: e.target.value })} placeholder="Ex.: vômitos e desidratação, pós-operatório de castração" />
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="vi-leito">Leito ou baia <span className={styles.unit}>(opcional)</span></label>
              <input id="vi-leito" className={styles.input} value={form.leito} maxLength={60} onChange={e => set({ leito: e.target.value })} placeholder="Ex.: Baia 3" />
            </div>
            <div className={styles.field}>
              <label htmlFor="vi-diag">Diagnóstico ou suspeita <span className={styles.unit}>(opcional)</span></label>
              <input id="vi-diag" className={styles.input} value={form.diagnostico} maxLength={600} onChange={e => set({ diagnostico: e.target.value })} />
            </div>
          </div>
          {msgErros}
          {botoes(form.id ? 'Salvar alterações' : 'Registrar internação', () => salvarEntrada(form))}
        </section>
      )}

      {lista.length === 0 && !form && !motivo && (
        <EmptyState icon="file" title="Nenhuma internação" description="Registre a entrada do pet para anotar prescrições e a evolução de cada turno. A alta gera um resumo para imprimir." compact />
      )}

      {lista.map(i => {
        const dados = normalizarInternacao(i.dados)
        const aberto = idExpandido === i.id
        const prescricoes = itensDaInternacao(itens, i.id, 'prescricao')
        const dias = evolucoesPorDia(itensDaInternacao(itens, i.id, 'evolucao'), 'desc')
        const encerrada = i.status !== 'internado'
        const formAqui = form && form.kind !== 'entrada' && form.internacaoId === i.id ? form : null
        return (
          <section key={i.id} className={styles.card} aria-label={`Internação de ${dataHoraBr(i.entrada_em)}`}>
            <button type="button" className={styles.expandBtn} aria-expanded={aberto} onClick={() => setExp(aberto ? '' : i.id)}>
              <span className={styles.itemMain}>
                <span className={styles.itemTitle}>
                  {dataHoraBr(i.entrada_em)}
                  <Badge tone={TOM[i.status]}>{STATUS_ROTULO[i.status]}</Badge>
                  {i.leito && <span className={styles.unit}>{i.leito}</span>}
                </span>
                <span className={styles.itemMeta}>{i.motivo}</span>
                <span className={styles.itemMeta}>
                  {encerrada ? `Saída em ${dataHoraBr(i.saida_em)} | ${textoDias(diasDeInternacao(i.entrada_em, i.saida_em))}` : `Dia ${diasDeInternacao(i.entrada_em, null)} de internação`}
                </span>
              </span>
              <Icon name="chevronDown" size={18} aria-hidden="true" style={{ transform: aberto ? 'rotate(180deg)' : undefined, flexShrink: 0 }} />
            </button>

            {aberto && (
              <>
                <div className={styles.row}>
                  <Button variant="secondary" icon="file" onClick={() => imprimir(i)}>{encerrada ? (i.status === 'obito' ? 'Imprimir resumo' : 'Imprimir resumo de alta') : 'Imprimir ficha'}</Button>
                  {!form && <Button variant="ghost" icon="edit" onClick={() => editarEntrada(i)}>Editar entrada</Button>}
                  <button type="button" className={styles.iconBtn} aria-label={`Excluir a internação de ${dataHoraBr(i.entrada_em)}`} title="Excluir internação" onClick={() => excluirDaInternacao(i)}><Icon name="trash" size={16} /></button>
                </div>

                {dados.diagnostico && <p className={`${styles.itemMeta} ${styles.pre}`}>Diagnóstico: {dados.diagnostico}</p>}

                {/* Prescrições */}
                <div className={styles.sub}>
                  <div className={styles.subhead}>
                    <span>Prescrições</span>
                    {!form && <Button variant="secondary" icon="plus" onClick={() => novaPrescricao(i)}>Prescrever</Button>}
                  </div>
                  {formAqui?.kind === 'prescricao' && (
                    <div className={styles.card} aria-label={formAqui.id ? 'Editar prescrição' : 'Nova prescrição'}>
                      <div className={styles.grid}>
                        <div className={`${styles.field} ${styles.wide}`}>
                          <label htmlFor="vi-med">Medicamento</label>
                          <input id="vi-med" className={styles.input} value={formAqui.medicamento} maxLength={120} onChange={e => set({ medicamento: e.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="vi-dose">Dose</label>
                          <input id="vi-dose" className={styles.input} value={formAqui.dose} maxLength={80} onChange={e => set({ dose: e.target.value })} placeholder="Ex.: 0,1 mg/kg" />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="vi-via">Via <span className={styles.unit}>(opcional)</span></label>
                          <SelectMenu variant="field" id="vi-via" value={formAqui.via} onChange={v => set({ via: v })} placeholder="Selecionar"
                            options={[{ value: '', label: 'Não informada' }, ...VIAS.map(v => ({ value: v, label: v }))]} />
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="vi-freq">Frequência</label>
                        <input id="vi-freq" className={styles.input} value={formAqui.frequencia} maxLength={60} onChange={e => set({ frequencia: e.target.value })} placeholder="Ex.: a cada 12 horas" />
                        <div className={styles.chips} role="group" aria-label="Frequências comuns">
                          {FREQUENCIAS.map(fq => (
                            <button key={fq} type="button" aria-pressed={formAqui.frequencia === fq} className={`${styles.chip} ${formAqui.frequencia === fq ? styles.chipOn : ''}`} onClick={() => set({ frequencia: fq })}>{fq}</button>
                          ))}
                        </div>
                      </div>
                      <div className={styles.grid2}>
                        <div className={styles.field}>
                          <label htmlFor="vi-pr-data">Início</label>
                          <DatePicker id="vi-pr-data" value={formAqui.data} onChange={v => set({ data: v || hoje })} max={hoje} ariaLabel="Data de início da prescrição" />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="vi-pr-hora">Hora</label>
                          <input id="vi-pr-hora" type="time" className={styles.input} value={formAqui.hora} onChange={e => set({ hora: e.target.value })} />
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="vi-pr-obs">Observação <span className={styles.unit}>(opcional)</span></label>
                        <input id="vi-pr-obs" className={styles.input} value={formAqui.observacao} maxLength={300} onChange={e => set({ observacao: e.target.value })} placeholder="Ex.: diluir em 20 mL, aplicar lentamente" />
                      </div>
                      {msgErros}
                      {botoes('Salvar prescrição', () => salvarPrescricao(formAqui))}
                    </div>
                  )}
                  {prescricoes.length === 0 && formAqui?.kind !== 'prescricao' ? (
                    <p className={styles.hint}>Nenhuma prescrição nesta internação.</p>
                  ) : (
                    <div className={styles.list}>
                      {prescricoes.map(it => {
                        const d = normalizarPrescricao(it.dados)
                        return (
                          <div key={it.id} className={styles.item}>
                            <div className={styles.itemMain}>
                              <div className={`${styles.itemTitle} ${d.suspensa ? styles.suspended : ''}`}>{resumoDaPrescricao(d)}{d.suspensa && <Badge tone="neutral">Suspensa</Badge>}</div>
                              <div className={styles.itemMeta}>Desde {dataHoraBr(it.registrado_em)}{d.observacao ? ` | ${d.observacao}` : ''}</div>
                            </div>
                            {!form && (
                              <div className={styles.itemActions}>
                                <button type="button" className={styles.iconBtn} aria-label={d.suspensa ? `Reativar ${d.medicamento}` : `Suspender ${d.medicamento}`} title={d.suspensa ? 'Reativar' : 'Suspender'} onClick={() => alternarSuspensa(it)}><Icon name={d.suspensa ? 'play' : 'pause'} size={16} /></button>
                                <button type="button" className={styles.iconBtn} aria-label={`Editar ${d.medicamento}`} title="Editar" onClick={() => editarPrescricao(it)}><Icon name="edit" size={16} /></button>
                                <button type="button" className={styles.iconBtn} aria-label={`Excluir ${d.medicamento}`} title="Excluir" onClick={() => excluirItem(it, 'esta prescrição')}><Icon name="trash" size={16} /></button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Evoluções por turno */}
                <div className={styles.sub}>
                  <div className={styles.subhead}>
                    <span>Evolução por turno</span>
                    {!form && <Button variant="secondary" icon="plus" onClick={() => novaEvolucao(i)}>Registrar evolução</Button>}
                  </div>
                  {formAqui?.kind === 'evolucao' && (
                    <div className={styles.card} aria-label={formAqui.id ? 'Editar evolução' : 'Nova evolução'}>
                      <div className={styles.grid2}>
                        <div className={styles.field}>
                          <label htmlFor="vi-ev-data">Data</label>
                          <DatePicker id="vi-ev-data" value={formAqui.data} onChange={v => set({ data: v || hoje })} max={hoje} ariaLabel="Data da evolução" />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="vi-ev-hora">Hora</label>
                          <input id="vi-ev-hora" type="time" className={styles.input} value={formAqui.hora} onChange={e => set({ hora: e.target.value })} />
                        </div>
                      </div>
                      <p className={styles.hint}>Turno: <strong>{TURNO_ROTULO[turnoDaHora(formAqui.hora)]}</strong> ({TURNO_FAIXA[turnoDaHora(formAqui.hora)]}). Ele muda sozinho com a hora.</p>
                      <div className={styles.field}>
                        <label htmlFor="vi-ev-texto">Evolução</label>
                        <textarea id="vi-ev-texto" className={styles.textarea} value={formAqui.texto} maxLength={2000} onChange={e => set({ texto: e.target.value })} placeholder="Estado geral, alimentação, hidratação, fezes e urina, medicações dadas" />
                      </div>
                      <div className={styles.grid}>
                        <div className={styles.field}>
                          <label htmlFor="vi-ev-t">Temperatura <span className={styles.unit}>°C</span></label>
                          <input id="vi-ev-t" className={styles.input} inputMode="decimal" autoComplete="off" value={formAqui.temperatura} onChange={e => set({ temperatura: e.target.value })} placeholder="38,5" />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="vi-ev-fc">FC <span className={styles.unit}>bpm</span></label>
                          <input id="vi-ev-fc" className={styles.input} inputMode="numeric" autoComplete="off" value={formAqui.fc} onChange={e => set({ fc: e.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="vi-ev-fr">FR <span className={styles.unit}>mpm</span></label>
                          <input id="vi-ev-fr" className={styles.input} inputMode="numeric" autoComplete="off" value={formAqui.fr} onChange={e => set({ fr: e.target.value })} />
                        </div>
                      </div>
                      {msgErros}
                      {botoes('Salvar evolução', () => salvarEvolucao(formAqui))}
                    </div>
                  )}
                  {dias.length === 0 && formAqui?.kind !== 'evolucao' ? (
                    <p className={styles.hint}>Nenhuma evolução registrada.</p>
                  ) : (
                    <div className={styles.list}>
                      {dias.map(dia => (
                        <div key={dia.dia}>
                          <div className={styles.dayHead}>{dataBr(dia.dia)}</div>
                          {dia.turnos.flatMap(t => t.itens.map(it => {
                            const e = normalizarEvolucao(it.dados)
                            const sinais = resumoDosSinais(e)
                            return (
                              <div key={it.id} className={styles.item}>
                                <div className={styles.itemMain}>
                                  <div className={styles.itemTitle}><span className={styles.turnoTag}>{TURNO_ROTULO[t.turno]}</span>{separarDataHora(it.registrado_em).hora}</div>
                                  {sinais && <div className={styles.itemMeta}>{sinais}</div>}
                                  <div className={`${styles.itemMeta} ${styles.pre}`}>{e.texto}</div>
                                </div>
                                {!form && (
                                  <div className={styles.itemActions}>
                                    <button type="button" className={styles.iconBtn} aria-label={`Editar a evolução de ${dataHoraBr(it.registrado_em)}`} title="Editar" onClick={() => editarEvolucao(it)}><Icon name="edit" size={16} /></button>
                                    <button type="button" className={styles.iconBtn} aria-label={`Excluir a evolução de ${dataHoraBr(it.registrado_em)}`} title="Excluir" onClick={() => excluirItem(it, 'esta evolução')}><Icon name="trash" size={16} /></button>
                                  </div>
                                )}
                              </div>
                            )
                          }))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Alta */}
                {!encerrada && !form && (
                  <div className={styles.sub}>
                    <div className={styles.subhead}><span>Alta</span><Button variant="secondary" icon="checkCircle" onClick={() => novaAlta(i)}>Dar alta ou encerrar</Button></div>
                  </div>
                )}
                {formAqui?.kind === 'alta' && (
                  <div className={styles.card} aria-label="Encerrar internação">
                    <div className={styles.cardTitle}>Encerrar a internação</div>
                    <div className={styles.field}>
                      <span className={styles.label}>Motivo da saída</span>
                      <PillTabs<SaidaInternacao>
                        label="Motivo da saída"
                        value={formAqui.saida}
                        onChange={v => set({ saida: v })}
                        options={(Object.keys(SAIDA_ROTULO) as SaidaInternacao[]).map(v => ({ value: v, label: SAIDA_ROTULO[v] }))}
                      />
                    </div>
                    <div className={styles.grid2}>
                      <div className={styles.field}>
                        <label htmlFor="vi-al-data">Data da saída</label>
                        <DatePicker id="vi-al-data" value={formAqui.data} onChange={v => set({ data: v || hoje })} max={hoje} ariaLabel="Data da saída" />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="vi-al-hora">Hora</label>
                        <input id="vi-al-hora" type="time" className={styles.input} value={formAqui.hora} onChange={e => set({ hora: e.target.value })} />
                      </div>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="vi-al-resumo">Resumo da internação</label>
                      <textarea id="vi-al-resumo" className={styles.textarea} value={formAqui.resumo} maxLength={2000} onChange={e => set({ resumo: e.target.value })} placeholder="O que foi feito, como o pet evoluiu e em que condição sai" />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="vi-al-med">Medicação após a alta <span className={styles.unit}>(opcional)</span></label>
                      <textarea id="vi-al-med" className={styles.textarea} value={formAqui.medicacaoPos} maxLength={2000} onChange={e => set({ medicacaoPos: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="vi-al-ori">Orientações ao tutor <span className={styles.unit}>(opcional)</span></label>
                      <textarea id="vi-al-ori" className={styles.textarea} value={formAqui.orientacoes} maxLength={2000} onChange={e => set({ orientacoes: e.target.value })} placeholder="Alimentação, repouso, sinais de alerta" />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="vi-al-ret">Retorno <span className={styles.unit}>(opcional)</span></label>
                      <DatePicker id="vi-al-ret" value={formAqui.retornoEm} onChange={v => set({ retornoEm: v })} min={hoje} ariaLabel="Data de retorno" />
                    </div>
                    {!profissional.nome && <p className={styles.warn}>Escolha o profissional responsável acima: o nome e o registro (CRMV) dele saem na assinatura do resumo.</p>}
                    {msgErros}
                    <div className={styles.saveRow}>
                      <Button variant="ghost" onClick={fechar} disabled={salvando}>Cancelar</Button>
                      <Button variant="secondary" loading={salvando} onClick={() => registrarAlta(formAqui, false)}>Registrar</Button>
                      <Button variant="primary" icon="file" loading={salvando} onClick={() => registrarAlta(formAqui, true)}>Registrar e imprimir</Button>
                    </div>
                  </div>
                )}
                {encerrada && dados.alta && (
                  <div className={styles.sub}>
                    <div className={styles.subhead}><span>Resumo da saída</span></div>
                    <p className={`${styles.itemMeta} ${styles.pre}`}>{dados.alta.resumo}</p>
                    {dados.alta.medicacaoPos && <p className={`${styles.itemMeta} ${styles.pre}`}>Medicação: {dados.alta.medicacaoPos}</p>}
                    {dados.alta.orientacoes && <p className={`${styles.itemMeta} ${styles.pre}`}>Orientações: {dados.alta.orientacoes}</p>}
                    {dados.alta.retornoEm && <p className={styles.itemMeta}>Retorno em {dataBr(dados.alta.retornoEm)}</p>}
                  </div>
                )}
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
