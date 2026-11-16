'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuthClinic, Patient } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { PillTabs } from '@/components/ui/PillTabs'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { abrirJanelaDeImpressao, imprimirMedico, imprimirNaJanela, type ProfissionalImpresso } from '@/lib/medico/impresso'
import { montarCabecalhoPet } from '@/lib/vet/cabecalhoPet'
import { dataBr } from '@/lib/vet/datas'
import {
  adicionarLivre, alternarExame, avaliarReferencia, camposDoModelo, camposPreenchidos, campoVazio, caminhoAnexoExame, CATALOGO_EXAMES_VET, exameVazio,
  GRUPO_EXAME_ROTULO, htmlResultadoExames, htmlSolicitacaoExames, MAX_ANEXOS, MAX_INDICACAO, MAX_INTERPRETACAO, MAX_NOME_EXAME, MAX_OBSERVACOES,
  MODELOS_RESULTADO, normalizarExame, prepararParaGravar, problemaDoArquivo, resultadoVazio, resumoDoExame, SITUACAO_ROTULO, solicitacaoTemConteudo,
  STATUS_EXAME_ROTULO, tamanhoLegivel, URGENCIA_ROTULO, validarResultado, validarSolicitacao, type AnexoExame, type ExameVetDados, type ExameVetLinha,
  type GrupoExameVet, type Urgencia,
} from '@/lib/vet/exames'
import {
  excluirExameVet, MENSAGEM_INDISPONIVEL, removerAnexosExame, salvarExameVet, subirAnexoExame, urlsDosAnexos, type Indisponibilidade,
} from '@/lib/vet/clinicoStorage'
import { usePrintActions } from '../print/PrintRegistry'
import styles from './vet.module.css'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  profissional: ProfissionalImpresso
  exames: ExameVetLinha[]
  carregando: boolean
  motivo: Indisponibilidade | null
  recarregar: () => Promise<unknown>
  /** peso mais recente conhecido, para o impresso */
  pesoKg: number | null
  /** a seção está na tela (as impressões do menu só valem enquanto ela está aberta) */
  ativo: boolean
  onDirtyChange: (dirty: boolean) => void
}

type FormSolicitacao = { kind: 'solicitacao'; id: string | null; data: string; dados: ExameVetDados }
type FormResultado = { kind: 'resultado'; id: string; data: string; dados: ExameVetDados; originais: string[] }
type Form = FormSolicitacao | FormResultado

const GRUPOS: GrupoExameVet[] = ['laboratorial', 'imagem', 'teste_rapido']

/** Exames do pet: solicitação (catálogo básico ou exame livre) e registro do resultado em campos livres, com anexo e impressão. */
export function ExamesPetPanel({ patient, clinic, clinicId, profissional, exames, carregando, motivo, recarregar, pesoKg, ativo, onDirtyChange }: Props) {
  const hoje = hojeBrasil()
  const [form, setForm] = useState<Form | null>(null)
  const [inicial, setInicial] = useState('')
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [livre, setLivre] = useState('')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const arquivoRef = useRef<HTMLInputElement>(null)

  const dirty = form !== null && JSON.stringify(form) !== inicial
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const linhas = useMemo(() => exames.map(l => ({ linha: l, dados: normalizarExame(l.dados) })), [exames])

  // endereços temporários dos anexos (o bucket é privado): dos exames salvos e do que está sendo editado
  const caminhos = useMemo(() => {
    const salvos = linhas.flatMap(x => x.dados.resultado?.anexos.map(a => a.path) ?? [])
    const emEdicao = form?.kind === 'resultado' ? (form.dados.resultado?.anexos.map(a => a.path) ?? []) : []
    return [...new Set([...salvos, ...emEdicao])]
  }, [linhas, form])
  const chave = caminhos.join('|')
  useEffect(() => {
    let vivo = true
    if (caminhos.length === 0) return
    urlsDosAnexos(caminhos).then(m => { if (vivo) setUrls(m) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  function abrir(f: Form) { setErros([]); setInicial(JSON.stringify(f)); setForm(f) }
  const cabecalho = (iso: string, prof: ProfissionalImpresso) => montarCabecalhoPet({ clinica: clinic, paciente: patient, pesoKg, data: iso, profissional: prof })

  /** Fecha o formulário. Anexos enviados nesta edição e não gravados saem do armazenamento. */
  async function fechar(descartar: boolean) {
    if (descartar && form?.kind === 'resultado') {
      const originais = new Set(form.originais)
      await removerAnexosExame((form.dados.resultado?.anexos ?? []).map(a => a.path).filter(p => !originais.has(p)))
    }
    setForm(null); setInicial(''); setErros([]); setLivre('')
  }

  // ── solicitação ──
  function novaSolicitacao() { abrir({ kind: 'solicitacao', id: null, data: hoje, dados: exameVazio() }) }
  function editarSolicitacao(l: ExameVetLinha, d: ExameVetDados) { abrir({ kind: 'solicitacao', id: l.id, data: l.data, dados: { ...d, profissional: d.profissional } }) }
  const patchDados = (p: Partial<ExameVetDados>) => { setForm(f => (f ? { ...f, dados: { ...f.dados, ...p } } : f)); setErros([]) }
  const setData = (v: string) => { setForm(f => (f && f.kind === 'solicitacao' ? { ...f, data: v || hoje } : f)); setErros([]) }

  function adicionarLivreAgora() {
    if (!form || !livre.trim()) return
    patchDados({ itens: adicionarLivre(form.dados.itens, livre) })
    setLivre('')
  }

  async function salvarSolicitacao(f: FormSolicitacao, imprimir: boolean) {
    const janela = imprimir ? abrirJanelaDeImpressao() : null
    if (imprimir && !janela) { setErros(['Não abriu a impressão: o navegador bloqueou o pop-up. Libere pop-ups para este site e tente de novo.']); return }
    const msgs = validarSolicitacao(f.dados)
    if (msgs.length) { janela?.close(); setErros(msgs); return }
    const dados: ExameVetDados = { ...f.dados, profissional }
    const { status } = prepararParaGravar(dados)
    setSalvando(true)
    const res = await salvarExameVet({ id: f.id, clinicId, patientId: patient.id, data: f.data, status, dados })
    setSalvando(false)
    if (!res.ok) { janela?.close(); setErros([res.mensagem ?? MENSAGEM_INDISPONIVEL[res.motivo]]); return }
    await recarregar()
    await fechar(false)
    showToast('ok', imprimir ? 'Solicitação salva. Abrindo a impressão.' : 'Solicitação salva no prontuário.')
    if (janela) await imprimirNaJanela(janela, htmlSolicitacaoExames(cabecalho(f.data, profissional), dados))
  }

  // ── resultado ──
  function abrirResultado(l: ExameVetLinha, d: ExameVetDados) {
    const resultado = d.resultado ?? resultadoVazio(hoje)
    abrir({ kind: 'resultado', id: l.id, data: l.data, dados: { ...d, resultado }, originais: resultado.anexos.map(a => a.path) })
  }
  const patchResultado = (p: Partial<NonNullable<ExameVetDados['resultado']>>) => {
    setForm(f => (f && f.kind === 'resultado' ? { ...f, dados: { ...f.dados, resultado: { ...(f.dados.resultado ?? resultadoVazio(hoje)), ...p } } } : f))
    setErros([])
  }
  const resultadoAtual = form?.kind === 'resultado' ? (form.dados.resultado ?? resultadoVazio(hoje)) : null

  function aplicarModelo(modeloId: string) {
    if (!resultadoAtual) return
    const existentes = new Set(resultadoAtual.campos.map(c => c.nome.trim().toLowerCase()))
    const novos = camposDoModelo(modeloId).filter(c => !existentes.has(c.nome.toLowerCase()))
    patchResultado({ campos: [...resultadoAtual.campos, ...novos] })
  }
  function campo(id: string, p: Partial<{ nome: string; valor: string; unidade: string; referencia: string }>) {
    if (!resultadoAtual) return
    patchResultado({ campos: resultadoAtual.campos.map(c => (c.id === id ? { ...c, ...p } : c)) })
  }

  async function anexar(files: FileList | null) {
    if (!files || files.length === 0 || !resultadoAtual) return
    const novos: AnexoExame[] = []
    const msgs: string[] = []
    setEnviando(true)
    for (const file of Array.from(files)) {
      if (resultadoAtual.anexos.length + novos.length >= MAX_ANEXOS) { msgs.push(`No máximo ${MAX_ANEXOS} anexos por exame.`); break }
      const problema = problemaDoArquivo(file)
      if (problema) { msgs.push(problema); continue }
      try {
        const path = await subirAnexoExame(caminhoAnexoExame({ clinicId, patientId: patient.id, nome: file.name }), file)
        novos.push({ path, nome: file.name, tipo: file.type, tamanho: file.size })
      } catch (e) {
        msgs.push(e instanceof Error ? e.message : `Não foi possível enviar ${file.name}.`)
      }
    }
    setEnviando(false)
    if (arquivoRef.current) arquivoRef.current.value = ''
    // o estado pode ter mudado durante o envio: soma aos anexos de agora
    setForm(f => (f && f.kind === 'resultado' ? { ...f, dados: { ...f.dados, resultado: { ...(f.dados.resultado ?? resultadoVazio(hoje)), anexos: [...(f.dados.resultado?.anexos ?? []), ...novos] } } } : f))
    setErros(msgs)
  }

  function tirarAnexo(path: string) {
    if (!resultadoAtual) return
    patchResultado({ anexos: resultadoAtual.anexos.filter(a => a.path !== path) })
  }

  async function salvarResultado(f: FormResultado, imprimir: boolean) {
    const resultado = f.dados.resultado ?? resultadoVazio(hoje)
    const msgs = validarResultado(resultado, hoje)
    if (msgs.length) { setErros(msgs); return }
    const janela = imprimir ? abrirJanelaDeImpressao() : null
    if (imprimir && !janela) { setErros(['Não abriu a impressão: o navegador bloqueou o pop-up. Libere pop-ups para este site e tente de novo.']); return }
    const { status, dados } = prepararParaGravar({ ...f.dados, profissional: f.dados.profissional ?? profissional })
    setSalvando(true)
    const res = await salvarExameVet({ id: f.id, clinicId, patientId: patient.id, data: f.data, status, dados })
    setSalvando(false)
    if (!res.ok) { janela?.close(); setErros([res.mensagem ?? MENSAGEM_INDISPONIVEL[res.motivo]]); return }
    // anexos tirados do resultado saem do armazenamento depois que o novo estado foi gravado
    const finais = new Set((dados.resultado?.anexos ?? []).map(a => a.path))
    await removerAnexosExame(f.originais.filter(p => !finais.has(p)))
    await recarregar()
    await fechar(false)
    showToast('ok', imprimir ? 'Resultado salvo. Abrindo a impressão.' : 'Resultado salvo no prontuário.')
    if (janela) await imprimirNaJanela(janela, htmlResultadoExames(cabecalho(dados.resultado?.data ?? hoje, dados.profissional ?? profissional), dados, f.data))
  }

  // ── impressão e exclusão ──
  function imprimirSolicitacao(l: ExameVetLinha, d: ExameVetDados) {
    imprimirMedico(htmlSolicitacaoExames(cabecalho(l.data, d.profissional ?? profissional), d))
  }
  function imprimirResultado(l: ExameVetLinha, d: ExameVetDados) {
    imprimirMedico(htmlResultadoExames(cabecalho(d.resultado?.data || l.data, d.profissional ?? profissional), d, l.data))
  }

  const maisRecente = linhas[0] ?? null
  const comResultado = linhas.find(x => x.dados.resultado) ?? null
  usePrintActions('vet', ativo ? [
    ...(maisRecente ? [{
      id: 'vet-exames-solicitacao', label: 'Solicitação de exames do pet', includes: ['Dados do pet e do tutor', 'Exames solicitados e indicação clínica'],
      run: () => imprimirSolicitacao(maisRecente.linha, maisRecente.dados),
    }] : []),
    ...(comResultado ? [{
      id: 'vet-exames-resultado', label: 'Resultado de exames do pet', includes: ['Dados do pet e do tutor', 'Valores com referência', 'Interpretação'],
      run: () => imprimirResultado(comResultado.linha, comResultado.dados),
    }] : []),
  ] : [], 'exames')

  async function excluir(l: ExameVetLinha, d: ExameVetDados) {
    const ok = await confirmDialog({
      title: 'Excluir este exame?',
      message: `A solicitação de ${dataBr(l.data)} (${resumoDoExame(d)})${d.resultado ? ', o resultado e os anexos' : ''} será removida do prontuário. Não dá para desfazer.`,
      confirmText: 'Excluir', cancelText: 'Cancelar', danger: true,
    })
    if (!ok) return
    const r = await excluirExameVet(l.id)
    if (!r.ok) { showToast('error', 'Não foi possível excluir agora.'); return }
    await removerAnexosExame(d.resultado?.anexos.map(a => a.path) ?? [])
    await recarregar()
  }

  if (carregando) return <p className={styles.hint}>Carregando exames...</p>

  const msgErros = erros.length > 0 && <ul className={styles.errors} role="alert">{erros.map(e => <li key={e}>{e}</li>)}</ul>

  return (
    <div className={styles.wrap}>
      {motivo && (
        <div className={styles.notice} role="status">
          <Icon name="info" size={18} />
          <div>{MENSAGEM_INDISPONIVEL[motivo]}</div>
        </div>
      )}

      <div className={styles.cardHead}>
        <p className={styles.cardSub}>{linhas.length === 0 ? 'Nenhum exame registrado.' : `${linhas.length} ${linhas.length === 1 ? 'exame' : 'exames'} no histórico.`}</p>
        {!form && <Button variant="primary" icon="plus" onClick={novaSolicitacao} disabled={motivo === 'sem_tabela'}>Solicitar exames</Button>}
      </div>

      {form?.kind === 'solicitacao' && (
        <section className={styles.card} aria-label={form.id ? 'Editar solicitação' : 'Nova solicitação'}>
          <div className={styles.cardTitle}>{form.id ? 'Editar solicitação' : 'Solicitar exames'}</div>
          {GRUPOS.map(g => (
            <div key={g} className={styles.field}>
              <span className={styles.groupLabel}>{GRUPO_EXAME_ROTULO[g]}</span>
              <div className={styles.chips} role="group" aria-label={GRUPO_EXAME_ROTULO[g]}>
                {CATALOGO_EXAMES_VET.filter(e => e.grupo === g).map(e => {
                  const on = form.dados.itens.some(i => i.id === e.id)
                  return <button key={e.id} type="button" aria-pressed={on} className={`${styles.chip} ${on ? styles.chipOn : ''}`} onClick={() => patchDados({ itens: alternarExame(form.dados.itens, e) })}>{e.nome}</button>
                })}
              </div>
            </div>
          ))}
          <div className={styles.field}>
            <label htmlFor="ve-livre">Outro exame <span className={styles.unit}>(fora da lista)</span></label>
            <div className={styles.row}>
              <input
                id="ve-livre" className={styles.input} style={{ flex: '1 1 180px', width: 'auto' }} value={livre} maxLength={MAX_NOME_EXAME}
                onChange={e => setLivre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarLivreAgora() } }} placeholder="Nome do exame"
              />
              <Button variant="secondary" icon="plus" onClick={adicionarLivreAgora} disabled={!livre.trim()}>Adicionar</Button>
            </div>
          </div>

          {form.dados.itens.length > 0 && (
            <div className={styles.field}>
              <span className={styles.groupLabel}>No pedido ({form.dados.itens.length})</span>
              <div className={styles.list}>
                {form.dados.itens.map(i => (
                  <div key={i.id ?? i.nome} className={styles.attach}>
                    <span className={styles.attachName}>{i.nome}</span>
                    <button type="button" className={styles.iconBtn} aria-label={`Remover ${i.nome} do pedido`} onClick={() => patchDados({ itens: form.dados.itens.filter(x => x !== i) })}><Icon name="close" size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="ve-data">Data da solicitação</label>
              <DatePicker id="ve-data" value={form.data} onChange={setData} ariaLabel="Data da solicitação" />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Urgência</span>
              <PillTabs<Urgencia> label="Urgência do pedido" value={form.dados.urgencia} onChange={v => patchDados({ urgencia: v })}
                options={[{ value: 'rotina', label: URGENCIA_ROTULO.rotina }, { value: 'urgente', label: URGENCIA_ROTULO.urgente }]} />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="ve-ind">Indicação clínica <span className={styles.unit}>(opcional)</span></label>
            <textarea id="ve-ind" className={styles.textarea} value={form.dados.indicacao} maxLength={MAX_INDICACAO} onChange={e => patchDados({ indicacao: e.target.value })} placeholder="Ex.: apatia, vômitos há 2 dias" />
          </div>
          <div className={styles.field}>
            <label htmlFor="ve-obs">Observações ao tutor <span className={styles.unit}>(jejum, preparo)</span></label>
            <textarea id="ve-obs" className={styles.textarea} value={form.dados.observacoes} maxLength={MAX_OBSERVACOES} onChange={e => patchDados({ observacoes: e.target.value })} />
          </div>
          {!profissional.nome && <p className={styles.warn}>Escolha o profissional responsável acima: o nome e o registro (CRMV) dele saem na assinatura.</p>}
          {msgErros}
          <div className={styles.saveRow}>
            {solicitacaoTemConteudo(form.dados) && <span className={styles.hint} style={{ marginRight: 'auto' }}>Ainda não salvo no prontuário.</span>}
            <Button variant="ghost" onClick={() => fechar(true)} disabled={salvando}>Cancelar</Button>
            <Button variant="secondary" loading={salvando} onClick={() => salvarSolicitacao(form, false)}>Salvar</Button>
            <Button variant="primary" icon="file" loading={salvando} onClick={() => salvarSolicitacao(form, true)}>Salvar e imprimir</Button>
          </div>
        </section>
      )}

      {form?.kind === 'resultado' && resultadoAtual && (
        <section className={styles.card} aria-label="Registrar resultado">
          <div className={styles.cardTitle}>Resultado do exame</div>
          <p className={styles.cardSub}>Solicitado em {dataBr(form.data)}: {resumoDoExame(form.dados, 4)}</p>

          <div className={styles.field}>
            <span className={styles.groupLabel}>Preencher com um modelo</span>
            <div className={styles.chips} role="group" aria-label="Modelos de resultado">
              {MODELOS_RESULTADO.map(m => (
                <button key={m.id} type="button" className={styles.chip} onClick={() => aplicarModelo(m.id)}>{m.nome}</button>
              ))}
              <button type="button" className={styles.chip} onClick={() => patchResultado({ campos: [...resultadoAtual.campos, campoVazio()] })}>Campo em branco</button>
            </div>
            <p className={styles.hint}>A referência é opcional. Se vier como faixa (ex.: 5,5 - 8,5), o valor fora dela é marcado como Alto ou Baixo.</p>
          </div>

          {resultadoAtual.campos.length > 0 && (
            <div role="group" aria-label="Valores do resultado">
              {resultadoAtual.campos.map((c, idx) => {
                const sit = c.valor.trim() ? avaliarReferencia(c.valor, c.referencia) : null
                return (
                  <div key={c.id} className={styles.campo}>
                    <div className={styles.field}>
                      <label htmlFor={`ve-c-n-${c.id}`}>{idx === 0 ? 'Exame' : <span className={styles.srOnly}>Exame</span>}</label>
                      <input id={`ve-c-n-${c.id}`} className={styles.input} value={c.nome} maxLength={80} onChange={e => campo(c.id, { nome: e.target.value })} placeholder="Nome" />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`ve-c-v-${c.id}`}>{idx === 0 ? 'Valor' : <span className={styles.srOnly}>Valor de {c.nome || 'exame'}</span>}</label>
                      <input id={`ve-c-v-${c.id}`} className={styles.input} value={c.valor} maxLength={60} autoComplete="off" onChange={e => campo(c.id, { valor: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`ve-c-u-${c.id}`}>{idx === 0 ? 'Unidade' : <span className={styles.srOnly}>Unidade de {c.nome || 'exame'}</span>}</label>
                      <input id={`ve-c-u-${c.id}`} className={styles.input} value={c.unidade} maxLength={20} onChange={e => campo(c.id, { unidade: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`ve-c-r-${c.id}`}>{idx === 0 ? 'Referência' : <span className={styles.srOnly}>Referência de {c.nome || 'exame'}</span>}</label>
                      <input id={`ve-c-r-${c.id}`} className={styles.input} value={c.referencia} maxLength={40} autoComplete="off" onChange={e => campo(c.id, { referencia: e.target.value })} placeholder="Opcional" />
                    </div>
                    <button type="button" className={styles.iconBtn} aria-label={`Remover o campo ${c.nome || 'em branco'}`} onClick={() => patchResultado({ campos: resultadoAtual.campos.filter(x => x.id !== c.id) })}><Icon name="close" size={16} /></button>
                    {(sit === 'alto' || sit === 'baixo') && (
                      <div className={styles.campoFlag}><Badge tone={sit === 'alto' ? 'danger' : 'warning'}>{SITUACAO_ROTULO[sit]}</Badge></div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="ve-res-data">Data do resultado</label>
              <DatePicker id="ve-res-data" value={resultadoAtual.data} onChange={v => patchResultado({ data: v || hoje })} max={hoje} ariaLabel="Data do resultado" />
            </div>
            <div className={styles.field}>
              <label htmlFor="ve-lab">Laboratório <span className={styles.unit}>(opcional)</span></label>
              <input id="ve-lab" className={styles.input} value={resultadoAtual.laboratorio} maxLength={120} onChange={e => patchResultado({ laboratorio: e.target.value })} />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="ve-interp">Interpretação <span className={styles.unit}>(opcional)</span></label>
            <textarea id="ve-interp" className={styles.textarea} value={resultadoAtual.interpretacao} maxLength={MAX_INTERPRETACAO} onChange={e => patchResultado({ interpretacao: e.target.value })} placeholder="Achados e conduta" />
          </div>

          <div className={styles.field}>
            <span className={styles.groupLabel}>Laudo anexado</span>
            {resultadoAtual.anexos.map(a => (
              <div key={a.path} className={styles.attach}>
                <span className={styles.attachName}>
                  {urls[a.path] ? <a className={styles.attachLink} href={urls[a.path]} target="_blank" rel="noopener noreferrer">{a.nome}</a> : a.nome}
                  {a.tamanho > 0 && <span className={styles.unit}> ({tamanhoLegivel(a.tamanho)})</span>}
                </span>
                <button type="button" className={styles.iconBtn} aria-label={`Remover o anexo ${a.nome}`} onClick={() => tirarAnexo(a.path)}><Icon name="close" size={16} /></button>
              </div>
            ))}
            <input ref={arquivoRef} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*" onChange={e => anexar(e.target.files)} />
            <div className={styles.row}>
              <Button variant="secondary" icon="paperclip" loading={enviando} onClick={() => arquivoRef.current?.click()} disabled={resultadoAtual.anexos.length >= MAX_ANEXOS}>Anexar PDF ou foto</Button>
              <span className={styles.hint}>Até {MAX_ANEXOS} arquivos de 10 MB.</span>
            </div>
          </div>

          {msgErros}
          <div className={styles.saveRow}>
            <Button variant="ghost" onClick={() => fechar(true)} disabled={salvando || enviando}>Cancelar</Button>
            <Button variant="secondary" loading={salvando} disabled={enviando} onClick={() => salvarResultado(form, false)}>Salvar resultado</Button>
            <Button variant="primary" icon="file" loading={salvando} disabled={enviando} onClick={() => salvarResultado(form, true)}>Salvar e imprimir</Button>
          </div>
        </section>
      )}

      {linhas.length === 0 && !form && !motivo && (
        <EmptyState icon="file" title="Nenhum exame" description="Solicite exames para imprimir o pedido e depois registre o resultado, com o laudo anexado." compact />
      )}

      {linhas.length > 0 && (
        <section className={styles.card} aria-label="Exames do pet">
          <div className={styles.cardTitle}>Histórico de exames</div>
          <div className={styles.list}>
            {linhas.map(({ linha: l, dados: d }) => {
              const campos = d.resultado ? camposPreenchidos(d.resultado.campos) : []
              const fora = campos.filter(c => { const s = avaliarReferencia(c.valor, c.referencia); return s === 'alto' || s === 'baixo' }).length
              return (
                <div key={l.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemTitle}>
                      {dataBr(l.data)}
                      <Badge tone={l.status === 'com_resultado' ? 'success' : 'warning'}>{STATUS_EXAME_ROTULO[l.status]}</Badge>
                      {d.urgencia === 'urgente' && <Badge tone="danger">Urgente</Badge>}
                    </div>
                    <div className={styles.itemMeta}>{resumoDoExame(d, 3)}</div>
                    {d.indicacao && <div className={styles.itemMeta}>Indicação: {d.indicacao}</div>}
                    {d.resultado && (
                      <div className={styles.itemMeta}>
                        Resultado em {dataBr(d.resultado.data)}
                        {d.resultado.laboratorio ? ` | ${d.resultado.laboratorio}` : ''}
                        {campos.length > 0 ? ` | ${campos.length} ${campos.length === 1 ? 'valor' : 'valores'}${fora > 0 ? `, ${fora} fora da referência` : ''}` : ''}
                      </div>
                    )}
                    {d.resultado?.anexos.map(a => (
                      <div key={a.path} className={styles.itemMeta}>
                        <Icon name="paperclip" size={12} aria-hidden="true" />{' '}
                        {urls[a.path] ? <a className={styles.attachLink} href={urls[a.path]} target="_blank" rel="noopener noreferrer">{a.nome}</a> : a.nome}
                      </div>
                    ))}
                  </div>
                  {!form && (
                    <div className={styles.itemActions}>
                      <button type="button" className={styles.iconBtn} aria-label={`${d.resultado ? 'Editar' : 'Registrar'} o resultado do exame de ${dataBr(l.data)}`} title={d.resultado ? 'Editar resultado' : 'Registrar resultado'} onClick={() => abrirResultado(l, d)}><Icon name="checkCircle" size={16} /></button>
                      <button type="button" className={styles.iconBtn} aria-label={`Imprimir a solicitação de ${dataBr(l.data)}`} title="Imprimir solicitação" onClick={() => imprimirSolicitacao(l, d)}><Icon name="file" size={16} /></button>
                      {d.resultado && <button type="button" className={styles.iconBtn} aria-label={`Imprimir o resultado de ${dataBr(l.data)}`} title="Imprimir resultado" onClick={() => imprimirResultado(l, d)}><Icon name="receipt" size={16} /></button>}
                      <button type="button" className={styles.iconBtn} aria-label={`Editar a solicitação de ${dataBr(l.data)}`} title="Editar solicitação" onClick={() => editarSolicitacao(l, d)}><Icon name="edit" size={16} /></button>
                      <button type="button" className={styles.iconBtn} aria-label={`Excluir o exame de ${dataBr(l.data)}`} title="Excluir" onClick={() => excluir(l, d)}><Icon name="trash" size={16} /></button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
