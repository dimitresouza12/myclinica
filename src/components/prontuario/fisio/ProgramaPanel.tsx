'use client'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AuthClinic, Patient, Professional } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { IntegerInput } from '@/components/ui/NumericInput'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { councilForProfessional, formatRegistration } from '@/lib/professionalCouncil'
import { dataBr, somarDias } from '@/lib/vet/datas'
import {
  MAX_DESCRICAO, MAX_NOME, MAX_NOTA_ITEM, MAX_ORIENTACOES, MAX_REPS, MAX_TITULO, REGIOES, adesaoDoPrograma, filtrarExercicios, gerarId, itemDoBanco,
  itemDoExercicio, resumoDoItem, rotuloRegiao, textoDaDose, textoDaFrequencia, textoUltimaVez, validarPrescricao,
  type Execucao, type Exercicio, type ItemRascunho,
} from '@/lib/fisio/exercicios'
import { htmlPrograma, imprimirPrograma } from '@/lib/fisio/imprimir'
import { MENSAGEM_INDISPONIVEL, mudarStatusPrograma, salvarPrograma, type Indisponibilidade, type ProgramaCompleto } from '@/lib/fisio/storage'
import { usePrintActions } from '../print/PrintRegistry'
import styles from './fisio.module.css'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  programas: ProgramaCompleto[]
  carregando: boolean
  motivo: Indisponibilidade | null
  execucoes: Execucao[]
  /** só os exercícios ativos da biblioteca */
  biblioteca: Exercicio[]
  fotos: ReadonlyMap<string, string>
  profissionais: Professional[]
  profissionalAtualId: string | null
  irParaBiblioteca: () => void
}

interface Editor { id: string | null; titulo: string; orientacoes: string; itens: ItemRascunho[]; originais: string[]; profissionalId: string | null }

const REGIAO_OPCOES = [{ value: '', label: 'Sem região' }, ...REGIOES.map(r => ({ value: r.value, label: r.label }))]
const FILTRO_OPCOES = [{ value: '', label: 'Todas as regiões' }, ...REGIOES.map(r => ({ value: r.value, label: r.label }))]

const itemAvulso = (id: string): ItemRascunho => ({
  id, exercicioId: null, name: '', description: '', region: '', videoUrl: '', imagePath: null, sets: '', reps: '', timesPerWeek: '7', notes: '',
})

/** Programa de exercícios do paciente: montar a partir da biblioteca, acompanhar o que ele marcou e imprimir. */
export function ProgramaPanel({ patient, clinic, clinicId, programas, carregando, motivo, execucoes, biblioteca, fotos, profissionais, profissionalAtualId, irParaBiblioteca }: Props) {
  const queryClient = useQueryClient()
  const hoje = hojeBrasil()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [escolhendo, setEscolhendo] = useState(false)
  const [busca, setBusca] = useState('')
  const [regiao, setRegiao] = useState('')

  const profissionalPorId = (id: string | null) => (id ? profissionais.find(p => p.id === id) ?? null : null)
  const profissionalPadrao = profissionalAtualId && profissionais.some(p => p.id === profissionalAtualId) ? profissionalAtualId : null
  const ativos = programas.filter(p => p.prescricao.status === 'ativa')
  const encerrados = programas.filter(p => p.prescricao.status !== 'ativa')

  const nomePorItem = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of programas) for (const i of p.itens) m.set(i.id, i.name)
    return m
  }, [programas])

  // histórico: últimos 14 dias com marcação, do mais recente para o mais antigo
  const historico = useMemo(() => {
    const desde = somarDias(hoje, -13) ?? hoje
    const porDia = new Map<string, string[]>()
    for (const e of execucoes) {
      const nome = nomePorItem.get(e.item_id)
      if (!nome || e.done_on < desde || e.done_on > hoje) continue
      const arr = porDia.get(e.done_on) ?? []
      arr.push(nome)
      porDia.set(e.done_on, arr)
    }
    return [...porDia.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [execucoes, nomePorItem, hoje])

  const sugestoes = useMemo(() => filtrarExercicios(biblioteca, busca, regiao), [biblioteca, busca, regiao])

  function registroDe(p: Professional): string {
    const council = councilForProfessional({ specialtyType: p.specialty_type ?? 'fisio', specialty: p.specialty, clinicType: clinic.type })
    return formatRegistration(council, p.registration_number)
  }

  function imprimir(prog: ProgramaCompleto) {
    const prof = profissionalPorId(prog.prescricao.professional_id) ?? profissionalPorId(profissionalAtualId)
    imprimirPrograma(htmlPrograma(
      { clinica: clinic.name, detalhe: [clinic.address, clinic.phone].filter(Boolean).join(' | ') || undefined, paciente: patient.name, emitidoEm: hoje },
      prog.prescricao, prog.itens, fotos, prof ? { nome: prof.name, registro: registroDe(prof) } : null,
    ))
  }

  // a impressão vai para o menu "Imprimir" do prontuário (um item por programa ativo, até 3)
  usePrintActions('exercicios', ativos.slice(0, 3).map(prog => ({
    id: `fisio-programa-${prog.prescricao.id}`,
    label: `Programa de exercícios: ${prog.prescricao.title}`,
    includes: ['Exercícios com séries, repetições e frequência', 'Orientações e link dos vídeos', 'Fotos dos exercícios, quando houver'],
    disabledReason: carregando ? 'Carregando o programa' : undefined,
    run: () => imprimir(prog),
  })))

  function abrirNovo() {
    setErros([])
    setEscolhendo(false)
    setEditor({ id: null, titulo: 'Programa de exercícios', orientacoes: '', itens: [], originais: [], profissionalId: profissionalPadrao })
  }
  function editar(prog: ProgramaCompleto) {
    setErros([])
    setEscolhendo(false)
    setEditor({
      id: prog.prescricao.id, titulo: prog.prescricao.title, orientacoes: prog.prescricao.notes ?? '', itens: prog.itens.map(itemDoBanco),
      originais: prog.itens.map(i => i.id), profissionalId: prog.prescricao.professional_id,
    })
  }
  const patchEditor = (patch: Partial<Editor>) => { setEditor(e => (e ? { ...e, ...patch } : e)); setErros([]) }
  const patchItem = (id: string, patch: Partial<ItemRascunho>) => { setEditor(e => (e ? { ...e, itens: e.itens.map(i => (i.id === id ? { ...i, ...patch } : i)) } : e)); setErros([]) }
  function mover(id: string, delta: -1 | 1) {
    setEditor(e => {
      if (!e) return e
      const i = e.itens.findIndex(x => x.id === id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= e.itens.length) return e
      const itens = [...e.itens]
      ;[itens[i], itens[j]] = [itens[j], itens[i]]
      return { ...e, itens }
    })
  }
  const remover = (id: string) => patchEditor({ itens: (editor?.itens ?? []).filter(i => i.id !== id) })
  const adicionarDaBiblioteca = (ex: Exercicio) => { patchEditor({ itens: [...(editor?.itens ?? []), itemDoExercicio(ex, gerarId())] }) }
  const adicionarAvulso = () => { patchEditor({ itens: [...(editor?.itens ?? []), itemAvulso(gerarId())] }) }

  async function salvar() {
    if (!editor) return
    const v = validarPrescricao({ titulo: editor.titulo, orientacoes: editor.orientacoes, itens: editor.itens })
    if (!v.ok) { setErros(v.erros); return }
    setSalvando(true)
    const mantidos = new Set(v.itens.map(i => i.id))
    const res = await salvarPrograma({
      id: editor.id, clinicId, patientId: patient.id, titulo: v.titulo, orientacoes: v.orientacoes, professionalId: editor.profissionalId,
      itens: v.itens, removidos: editor.originais.filter(id => !mantidos.has(id)),
    })
    setSalvando(false)
    if (!res.ok) { setErros([MENSAGEM_INDISPONIVEL[res.motivo]]); return }
    await queryClient.invalidateQueries({ queryKey: ['fisio-programas', clinicId, patient.id] })
    await queryClient.invalidateQueries({ queryKey: ['fisio-execucoes', clinicId, patient.id] })
    setEditor(null)
    showToast('ok', 'Programa salvo.')
  }

  async function mudarStatus(prog: ProgramaCompleto) {
    const encerrar = prog.prescricao.status === 'ativa'
    if (encerrar) {
      const ok = await confirmDialog({
        title: 'Encerrar este programa?',
        message: `"${prog.prescricao.title}" deixa de aparecer na página do paciente. O histórico do que ele marcou continua guardado e você pode reabrir depois.`,
        confirmText: 'Encerrar',
        cancelText: 'Cancelar',
      })
      if (!ok) return
    }
    const res = await mudarStatusPrograma({ id: prog.prescricao.id, clinicId, status: encerrar ? 'encerrada' : 'ativa', hoje })
    if (!res.ok) { showToast('error', 'Não foi possível atualizar agora.'); return }
    await queryClient.invalidateQueries({ queryKey: ['fisio-programas', clinicId, patient.id] })
  }

  if (carregando) return <p className={styles.hint}>Carregando programas...</p>

  function cartaoPrograma(prog: ProgramaCompleto) {
    const p = prog.prescricao
    const ativo = p.status === 'ativa'
    const adesao = ativo ? adesaoDoPrograma(prog.itens, execucoes, hoje) : null
    const prof = profissionalPorId(p.professional_id)
    return (
      <section key={p.id} className={styles.card} aria-label={`Programa ${p.title}`}>
        <div className={styles.cardHead}>
          <div className={styles.statusRow}>
            <div className={styles.cardTitle}>{p.title}</div>
            <Badge tone={ativo ? 'success' : 'neutral'}>{ativo ? 'Ativo' : 'Encerrado'}</Badge>
          </div>
          <div className={styles.row}>
            <Button variant="secondary" icon="edit" onClick={() => editar(prog)} disabled={!!editor}>Editar</Button>
            <Button variant="ghost" onClick={() => mudarStatus(prog)}>{ativo ? 'Encerrar' : 'Reabrir'}</Button>
          </div>
        </div>
        <p className={styles.cardSub}>
          Início em {dataBr(p.started_on)}{p.ended_on ? `, encerrado em ${dataBr(p.ended_on)}` : ''}{prof ? ` · ${prof.name}` : ''}
        </p>
        {p.notes && <p className={styles.note} style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</p>}
        {adesao !== null && (
          <div className={styles.adesao}>
            <span className={styles.label}>Adesão nos últimos 7 dias: {adesao}%</span>
            <div className={styles.bar} role="img" aria-label={`Adesão de ${adesao} por cento nos últimos 7 dias`}><div className={styles.barFill} style={{ width: `${adesao}%` }} /></div>
          </div>
        )}
        <div className={styles.list}>
          {prog.itens.map(i => {
            const r = resumoDoItem(i, execucoes, hoje)
            const foto = i.image_path ? fotos.get(i.image_path) : undefined
            const dose = textoDaDose(i.sets, i.reps)
            return (
              <div key={i.id} className={styles.item}>
                <div className={styles.itemLead}>
                  {foto
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img className={styles.thumb} src={foto} alt="" loading="lazy" />
                    : <span className={styles.thumbEmpty} aria-hidden="true"><Icon name="procedures" size={20} /></span>}
                  <div className={styles.itemBody}>
                    <div className={styles.itemTitle}>
                      {i.name}
                      {i.region && <Badge tone="neutral" dot={false}>{rotuloRegiao(i.region)}</Badge>}
                    </div>
                    <div className={styles.itemMeta}>{[dose, textoDaFrequencia(i.times_per_week)].filter(Boolean).join(' · ')}</div>
                    {ativo && (
                      <div className={styles.itemMeta}>
                        {r.feitosNaSemana} de {r.meta} {r.meta === 1 ? 'vez' : 'vezes'} nos últimos 7 dias · {textoUltimaVez(r.ultimaVez, hoje)}
                      </div>
                    )}
                    {i.video_url && <a className={styles.itemMeta} href={i.video_url} target="_blank" rel="noopener noreferrer">Abrir vídeo do exercício</a>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

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
          {programas.length === 0
            ? 'Nenhum programa prescrito.'
            : 'O paciente vê o programa ativo no link pessoal dele (escolha "Programa de exercícios" em Link do paciente) e marca o que fez.'}
        </p>
        <div className={styles.row}>
          {!editor && <Button variant="primary" icon="plus" onClick={abrirNovo} disabled={motivo === 'sem_tabela'}>Novo programa</Button>}
        </div>
      </div>

      {editor && (
        <section className={styles.card} aria-label={editor.id ? 'Editar programa' : 'Novo programa'}>
          <div className={styles.cardTitle}>{editor.id ? 'Editar programa' : 'Novo programa'}</div>
          <div className={styles.grid}>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="pg-titulo">Título</label>
              <input id="pg-titulo" className={styles.input} value={editor.titulo} onChange={e => patchEditor({ titulo: e.target.value })} maxLength={MAX_TITULO} />
            </div>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="pg-orient">Orientações gerais <span className={styles.unit}>(opcional, o paciente lê)</span></label>
              <textarea id="pg-orient" className={styles.textarea} value={editor.orientacoes} onChange={e => patchEditor({ orientacoes: e.target.value })} maxLength={MAX_ORIENTACOES} rows={3} placeholder="Ex.: faça em um local firme, respeite o limite da dor e avise se piorar." />
            </div>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="pg-prof">Fisioterapeuta responsável</label>
              <SelectMenu id="pg-prof" variant="field" value={editor.profissionalId ?? ''} onChange={v => patchEditor({ profissionalId: v || null })} ariaLabel="Fisioterapeuta responsável" placeholder="Não informar"
                options={[{ value: '', label: 'Não informar' }, ...profissionais.map(p => ({ value: p.id, label: p.name }))]} />
            </div>
          </div>

          <div className={styles.cardTitle}>Exercícios ({editor.itens.length})</div>
          {editor.itens.length === 0 && <p className={styles.hint}>Escolha exercícios da biblioteca ou crie um avulso só para este paciente.</p>}
          {editor.itens.map((it, idx) => (
            <div key={it.id} className={styles.editItem}>
              <div className={styles.editHead}>
                <span className={styles.editNum}>Exercício {idx + 1}</span>
                <div className={styles.editTools}>
                  <button type="button" className={styles.iconBtn} aria-label={`Subir o exercício ${idx + 1}`} disabled={idx === 0} onClick={() => mover(it.id, -1)}><Icon name="arrowUp" size={16} /></button>
                  <button type="button" className={styles.iconBtn} aria-label={`Descer o exercício ${idx + 1}`} disabled={idx === editor.itens.length - 1} onClick={() => mover(it.id, 1)}><Icon name="chevronDown" size={16} /></button>
                  <button type="button" className={styles.iconBtn} aria-label={`Remover o exercício ${idx + 1} do programa`} onClick={() => remover(it.id)}><Icon name="trash" size={16} /></button>
                </div>
              </div>
              <div className={styles.grid}>
                <div className={`${styles.field} ${styles.wide}`}>
                  <label htmlFor={`it-n-${it.id}`}>Nome</label>
                  <input id={`it-n-${it.id}`} className={styles.input} value={it.name} onChange={e => patchItem(it.id, { name: e.target.value })} maxLength={MAX_NOME} />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`it-s-${it.id}`}>Séries</label>
                  <IntegerInput id={`it-s-${it.id}`} className={styles.input} value={it.sets} onChange={v => patchItem(it.id, { sets: v })} min={1} max={20} placeholder="Ex.: 3" />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`it-r-${it.id}`}>Repetições</label>
                  <input id={`it-r-${it.id}`} className={styles.input} value={it.reps} onChange={e => patchItem(it.id, { reps: e.target.value })} maxLength={MAX_REPS} placeholder="Ex.: 12 ou 30 segundos" />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`it-d-${it.id}`}>Dias por semana</label>
                  <IntegerInput id={`it-d-${it.id}`} className={styles.input} value={it.timesPerWeek} onChange={v => patchItem(it.id, { timesPerWeek: v })} min={1} max={7} placeholder="1 a 7" />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`it-g-${it.id}`}>Região</label>
                  <SelectMenu id={`it-g-${it.id}`} variant="field" value={it.region} onChange={v => patchItem(it.id, { region: v })} ariaLabel="Região do corpo" options={REGIAO_OPCOES} />
                </div>
                <div className={`${styles.field} ${styles.wide}`}>
                  <label htmlFor={`it-o-${it.id}`}>Observação para este paciente <span className={styles.unit}>(opcional)</span></label>
                  <input id={`it-o-${it.id}`} className={styles.input} value={it.notes} onChange={e => patchItem(it.id, { notes: e.target.value })} maxLength={MAX_NOTA_ITEM} placeholder="Ex.: sem carga, só até 60 graus" />
                </div>
                <div className={`${styles.field} ${styles.wide}`}>
                  <label htmlFor={`it-c-${it.id}`}>Como fazer <span className={styles.unit}>(opcional)</span></label>
                  <textarea id={`it-c-${it.id}`} className={styles.textarea} value={it.description} onChange={e => patchItem(it.id, { description: e.target.value })} maxLength={MAX_DESCRICAO} rows={3} />
                </div>
                <div className={`${styles.field} ${styles.wide}`}>
                  <label htmlFor={`it-v-${it.id}`}>Vídeo <span className={styles.unit}>(opcional, YouTube ou Vimeo)</span></label>
                  <input id={`it-v-${it.id}`} className={styles.input} value={it.videoUrl} onChange={e => patchItem(it.id, { videoUrl: e.target.value })} maxLength={300} inputMode="url" autoCapitalize="none" />
                </div>
              </div>
            </div>
          ))}

          <div className={styles.row}>
            <Button variant="secondary" icon="plus" onClick={() => setEscolhendo(v => !v)} aria-expanded={escolhendo}>{escolhendo ? 'Fechar a biblioteca' : 'Adicionar da biblioteca'}</Button>
            <Button variant="secondary" icon="plus" onClick={adicionarAvulso}>Exercício avulso</Button>
          </div>

          {escolhendo && (
            <div className={styles.editItem} role="region" aria-label="Biblioteca de exercícios">
              {biblioteca.length === 0 ? (
                <p className={styles.hint}>
                  A biblioteca está vazia.{' '}
                  <button type="button" className={styles.chip} onClick={irParaBiblioteca}>Cadastrar exercícios</button>
                </p>
              ) : (
                <>
                  <div className={styles.grid}>
                    <div className={styles.field}>
                      <label htmlFor="pg-busca">Buscar</label>
                      <input id="pg-busca" className={styles.input} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou descrição" />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="pg-regiao">Região</label>
                      <SelectMenu id="pg-regiao" variant="field" value={regiao} onChange={setRegiao} ariaLabel="Filtrar por região" options={FILTRO_OPCOES} />
                    </div>
                  </div>
                  <div className={styles.picker}>
                    {sugestoes.length === 0 && <p className={styles.hint}>Nada encontrado.</p>}
                    {sugestoes.map(ex => (
                      <div key={ex.id} className={styles.pickerRow}>
                        <div>
                          <div className={styles.pickerName}>{ex.name}</div>
                          <div className={styles.pickerMeta}>{[rotuloRegiao(ex.region), textoDaDose(ex.default_sets, ex.default_reps)].filter(Boolean).join(' · ')}</div>
                        </div>
                        <Button variant="secondary" icon="plus" onClick={() => adicionarDaBiblioteca(ex)}>Adicionar</Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {erros.length > 0 && (
            <div className={styles.avisos} role="alert">
              {erros.map(m => <span key={m} className={styles.errMsg}>{m}</span>)}
            </div>
          )}
          <div className={styles.saveRow}>
            <Button variant="secondary" onClick={() => setEditor(null)} disabled={salvando}>Cancelar</Button>
            <Button variant="primary" icon="check" loading={salvando} onClick={salvar}>Salvar programa</Button>
          </div>
        </section>
      )}

      {programas.length === 0 && !editor ? (
        <EmptyState icon="procedures" title="Sem programa de exercícios" description="Monte o programa a partir da biblioteca da clínica. O paciente recebe pelo link pessoal, assiste ao vídeo e marca o que fez." compact />
      ) : (
        <>
          {ativos.map(cartaoPrograma)}
          {historico.length > 0 && (
            <section className={styles.card} aria-label="Histórico de execução">
              <div className={styles.cardTitle}>Histórico de execução (14 dias)</div>
              <div className={styles.list}>
                {historico.map(([dia, nomes]) => (
                  <div key={dia} className={styles.histDay}>
                    <span className={styles.histDate}>{dataBr(dia)}{dia === hoje ? ' (hoje)' : ''}</span>
                    <span className={styles.histNames}>{nomes.length} {nomes.length === 1 ? 'exercício' : 'exercícios'}: {[...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ')}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {ativos.length > 0 && historico.length === 0 && <p className={styles.hint}>O paciente ainda não marcou nenhum exercício nos últimos 14 dias.</p>}
          {encerrados.map(cartaoPrograma)}
        </>
      )}
    </div>
  )
}
