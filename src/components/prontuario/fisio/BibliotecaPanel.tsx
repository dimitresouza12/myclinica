'use client'
import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { IntegerInput } from '@/components/ui/NumericInput'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import {
  MAX_DESCRICAO, MAX_NOME, MAX_REPS, REGIOES, ROTULO_VIDEO, exercicioVazio, filtrarExercicios, lerVideo, rascunhoDoExercicio, rotuloRegiao,
  textoDaDose, validarExercicio, type Exercicio, type RascunhoExercicio,
} from '@/lib/fisio/exercicios'
import {
  ativarExercicio, enviarFoto, MENSAGEM_INDISPONIVEL, removerFotoSeOrfa, salvarExercicio, type Indisponibilidade,
} from '@/lib/fisio/storage'
import styles from './fisio.module.css'

interface Props {
  clinicId: string
  exercicios: Exercicio[]
  carregando: boolean
  motivo: Indisponibilidade | null
  fotos: ReadonlyMap<string, string>
}

interface Form { id: string | null; r: RascunhoExercicio; imagePath: string | null; imagemOriginal: string | null; novaFoto: File | null; novaFotoUrl: string | null; removerFoto: boolean }

const REGIAO_OPCOES = [{ value: '', label: 'Sem região' }, ...REGIOES.map(r => ({ value: r.value, label: r.label }))]
const FILTRO_OPCOES = [{ value: '', label: 'Todas as regiões' }, ...REGIOES.map(r => ({ value: r.value, label: r.label }))]

/** Biblioteca de exercícios da clínica: buscar, cadastrar, editar (com vídeo e foto) e desativar. */
export function BibliotecaPanel({ clinicId, exercicios, carregando, motivo, fotos }: Props) {
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const [regiao, setRegiao] = useState('')
  const [verInativos, setVerInativos] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const lista = useMemo(() => filtrarExercicios(exercicios.filter(e => verInativos || e.active), busca, regiao), [exercicios, busca, regiao, verInativos])
  const inativos = exercicios.filter(e => !e.active).length

  function abrirNovo() { setErros([]); setForm({ id: null, r: exercicioVazio(), imagePath: null, imagemOriginal: null, novaFoto: null, novaFotoUrl: null, removerFoto: false }) }
  function editar(e: Exercicio) {
    setErros([])
    setForm({ id: e.id, r: rascunhoDoExercicio(e), imagePath: e.image_path, imagemOriginal: e.image_path, novaFoto: null, novaFotoUrl: null, removerFoto: false })
  }
  function fechar() {
    if (form?.novaFotoUrl) URL.revokeObjectURL(form.novaFotoUrl)
    setForm(null)
    setErros([])
  }
  const set = (patch: Partial<RascunhoExercicio>) => { setForm(f => (f ? { ...f, r: { ...f.r, ...patch } } : f)); setErros([]) }

  function escolherFoto(file: File | undefined) {
    if (!file) return
    setForm(f => {
      if (!f) return f
      if (f.novaFotoUrl) URL.revokeObjectURL(f.novaFotoUrl)
      return { ...f, novaFoto: file, novaFotoUrl: URL.createObjectURL(file), removerFoto: false }
    })
    setErros([])
  }
  function tirarFoto() {
    setForm(f => {
      if (!f) return f
      if (f.novaFotoUrl) URL.revokeObjectURL(f.novaFotoUrl)
      return { ...f, novaFoto: null, novaFotoUrl: null, removerFoto: true }
    })
  }

  async function salvar() {
    if (!form) return
    const v = validarExercicio(form.r)
    if (!v.ok) { setErros(v.erros); return }
    setSalvando(true)
    let id = form.id
    // exercício novo: grava primeiro (a foto precisa do id na pasta), depois envia a foto e liga o caminho
    if (!id) {
      const res = await salvarExercicio({ clinicId, dados: v.dados })
      if (!res.ok) { setSalvando(false); setErros([MENSAGEM_INDISPONIVEL[res.motivo]]); return }
      id = res.id
      const novoId = res.id
      // se a 2ª gravação falhar, um novo toque em Salvar edita este mesmo exercício em vez de criar outro
      setForm(f => (f ? { ...f, id: novoId } : f))
    }
    let imagePath: string | null | undefined = undefined
    let avisoFoto = ''
    if (form.novaFoto) {
      const up = await enviarFoto({ clinicId, exercicioId: id, arquivo: form.novaFoto })
      if (up.ok) imagePath = up.path
      else avisoFoto = up.mensagem
    } else if (form.removerFoto) {
      imagePath = null
    }
    const res = await salvarExercicio({ id, clinicId, dados: v.dados, imagePath })
    setSalvando(false)
    if (!res.ok) { setErros([MENSAGEM_INDISPONIVEL[res.motivo]]); return }
    if (imagePath !== undefined && form.imagemOriginal && form.imagemOriginal !== imagePath) void removerFotoSeOrfa(form.imagemOriginal, clinicId)
    await queryClient.invalidateQueries({ queryKey: ['fisio-exercicios', clinicId] })
    fechar()
    if (avisoFoto) showToast('error', `Exercício salvo, mas a foto não foi enviada. ${avisoFoto}`)
    else showToast('ok', 'Exercício salvo na biblioteca.')
  }

  async function alternarAtivo(e: Exercicio) {
    if (e.active) {
      const ok = await confirmDialog({
        title: 'Tirar da biblioteca?',
        message: `"${e.name}" deixa de aparecer para novas prescrições. Os programas que já usam este exercício não mudam.`,
        confirmText: 'Tirar da lista',
        cancelText: 'Cancelar',
      })
      if (!ok) return
    }
    const res = await ativarExercicio({ id: e.id, clinicId, ativo: !e.active })
    if (!res.ok) { showToast('error', 'Não foi possível atualizar agora.'); return }
    await queryClient.invalidateQueries({ queryKey: ['fisio-exercicios', clinicId] })
  }

  if (carregando) return <p className={styles.hint}>Carregando biblioteca...</p>

  const fotoDoForm = form ? (form.novaFotoUrl ?? (form.removerFoto || !form.imagePath ? null : (fotos.get(form.imagePath) ?? null))) : null
  const temVideo = form ? !!form.r.videoUrl.trim() : false
  const videoLido = form && temVideo ? lerVideo(form.r.videoUrl) : null

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
          {exercicios.length === 0 ? 'Nenhum exercício cadastrado.' : `${exercicios.filter(e => e.active).length} ${exercicios.filter(e => e.active).length === 1 ? 'exercício' : 'exercícios'} na biblioteca da clínica.`}
        </p>
        <div className={styles.row}>
          {!form && <Button variant="primary" icon="plus" onClick={abrirNovo} disabled={motivo === 'sem_tabela'}>Novo exercício</Button>}
        </div>
      </div>

      {form && (
        <section className={styles.card} aria-label={form.id ? 'Editar exercício' : 'Novo exercício'}>
          <div className={styles.cardTitle}>{form.id ? 'Editar exercício' : 'Novo exercício'}</div>
          <div className={styles.grid}>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="fx-nome">Nome</label>
              <input id="fx-nome" className={styles.input} value={form.r.name} onChange={e => set({ name: e.target.value })} maxLength={MAX_NOME} placeholder="Ex.: Ponte glútea" />
            </div>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="fx-desc">Como fazer <span className={styles.unit}>(descrição para o paciente)</span></label>
              <textarea id="fx-desc" className={styles.textarea} value={form.r.description} onChange={e => set({ description: e.target.value })} maxLength={MAX_DESCRICAO} rows={4} placeholder="Posição inicial, movimento, respiração e o que evitar." />
            </div>
            <div className={styles.field}>
              <label htmlFor="fx-regiao">Região</label>
              <SelectMenu id="fx-regiao" variant="field" value={form.r.region} onChange={v => set({ region: v })} ariaLabel="Região do corpo" options={REGIAO_OPCOES} />
            </div>
            <div className={styles.field}>
              <label htmlFor="fx-series">Séries <span className={styles.unit}>(padrão)</span></label>
              <IntegerInput id="fx-series" className={styles.input} value={form.r.sets} onChange={v => set({ sets: v })} min={1} max={20} placeholder="Ex.: 3" />
            </div>
            <div className={styles.field}>
              <label htmlFor="fx-reps">Repetições <span className={styles.unit}>(padrão)</span></label>
              <input id="fx-reps" className={styles.input} value={form.r.reps} onChange={e => set({ reps: e.target.value })} maxLength={MAX_REPS} placeholder="Ex.: 12 ou 30 segundos" />
            </div>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="fx-video">Vídeo <span className={styles.unit}>(opcional, link do YouTube ou do Vimeo)</span></label>
              <input id="fx-video" className={styles.input} value={form.r.videoUrl} onChange={e => set({ videoUrl: e.target.value })} maxLength={300} inputMode="url" autoCapitalize="none" placeholder="https://www.youtube.com/watch?v=..." />
              {temVideo && (videoLido
                ? <span className={styles.hint}>Vídeo do {ROTULO_VIDEO[videoLido.provedor]} reconhecido.</span>
                : <span className={styles.errMsg}>Link não reconhecido. Use um endereço do YouTube ou do Vimeo.</span>)}
            </div>
            <div className={`${styles.field} ${styles.wide}`}>
              <span className={styles.label}>Foto <span className={styles.unit}>(opcional)</span></span>
              <div className={styles.photoRow}>
                {fotoDoForm
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img className={styles.thumb} src={fotoDoForm} alt="Foto do exercício" />
                  : <span className={styles.thumbEmpty} aria-hidden="true"><Icon name="camera" size={20} /></span>}
                <input ref={arquivoRef} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-label="Escolher foto do exercício" onChange={e => { escolherFoto(e.target.files?.[0]); e.target.value = '' }} />
                <Button variant="secondary" icon="upload" onClick={() => arquivoRef.current?.click()}>{fotoDoForm ? 'Trocar foto' : 'Enviar foto'}</Button>
                {fotoDoForm && <Button variant="ghost" icon="trash" onClick={tirarFoto}>Remover foto</Button>}
              </div>
              <span className={styles.hint}>A foto fica guardada em área privada da clínica e só aparece para o paciente que receber este exercício.</span>
            </div>
          </div>
          {erros.length > 0 && (
            <div className={styles.avisos} role="alert">
              {erros.map(m => <span key={m} className={styles.errMsg}>{m}</span>)}
            </div>
          )}
          <div className={styles.saveRow}>
            <Button variant="secondary" onClick={fechar} disabled={salvando}>Cancelar</Button>
            <Button variant="primary" icon="check" loading={salvando} onClick={salvar}>Salvar exercício</Button>
          </div>
        </section>
      )}

      {exercicios.length > 0 && (
        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor="fx-busca">Buscar</label>
            <input id="fx-busca" className={styles.input} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou descrição" />
          </div>
          <div className={styles.field}>
            <label htmlFor="fx-filtro">Região</label>
            <SelectMenu id="fx-filtro" variant="field" value={regiao} onChange={setRegiao} ariaLabel="Filtrar por região" options={FILTRO_OPCOES} />
          </div>
        </div>
      )}
      {inativos > 0 && (
        <button type="button" className={styles.chip} aria-pressed={verInativos} onClick={() => setVerInativos(v => !v)} style={{ alignSelf: 'flex-start' }}>
          {verInativos ? 'Ocultar os que saíram da lista' : `Mostrar os ${inativos} que saíram da lista`}
        </button>
      )}

      {exercicios.length === 0 && !form ? (
        <EmptyState icon="procedures" title="Biblioteca vazia" description="Cadastre os exercícios que você mais prescreve. Depois é só escolher na hora de montar o programa do paciente." compact />
      ) : lista.length === 0 && !form ? (
        <EmptyState icon="search" title="Nada encontrado" description="Tente outro nome ou limpe o filtro de região." compact />
      ) : lista.length > 0 && (
        <section className={styles.card} aria-label="Exercícios da biblioteca">
          <div className={styles.list}>
            {lista.map(e => {
              const foto = e.image_path ? fotos.get(e.image_path) : undefined
              const dose = textoDaDose(e.default_sets, e.default_reps)
              return (
                <div key={e.id} className={styles.item}>
                  <div className={styles.itemLead}>
                    {foto
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img className={styles.thumb} src={foto} alt="" loading="lazy" />
                      : <span className={styles.thumbEmpty} aria-hidden="true"><Icon name="procedures" size={20} /></span>}
                    <div className={styles.itemBody}>
                      <div className={styles.itemTitle}>
                        {e.name}
                        {e.region && <Badge tone="neutral" dot={false}>{rotuloRegiao(e.region)}</Badge>}
                        {!e.active && <Badge tone="warning">Fora da lista</Badge>}
                      </div>
                      <div className={styles.itemMeta}>
                        {[dose, e.video_url ? 'Com vídeo' : '', e.image_path ? 'Com foto' : ''].filter(Boolean).join(' · ') || 'Sem dose padrão'}
                      </div>
                    </div>
                  </div>
                  <div className={styles.itemActions}>
                    <button type="button" className={styles.iconBtn} aria-label={`Editar ${e.name}`} onClick={() => editar(e)}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button type="button" className={styles.iconBtn} aria-label={e.active ? `Tirar ${e.name} da lista` : `Voltar ${e.name} para a lista`} title={e.active ? 'Tirar da lista' : 'Voltar para a lista'} onClick={() => alternarAtivo(e)}>
                      <Icon name={e.active ? 'ban' : 'refresh'} size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
