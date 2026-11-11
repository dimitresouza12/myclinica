'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { FINALIDADE_LABEL, FINALIDADES_POR_TIPO, STRUCTURED_KINDS, type DocKind, type Finalidade } from '@/lib/documentos/atestado'
import { camposPermitidosDetalhe, CAMPOS_MODELO } from '@/lib/documentos/camposModelo'
import {
  AVISO_IA, chaveDoModelo, IMPORTAR_LIMITES, inserirMarcador, parseChave, partesDoTexto, reconciliarCampos, removerMarcador, TIPO_LABEL,
  trocarCampo, validarNomeModelo, validarParaSalvar, type CampoImportado,
} from '@/lib/documentos/importar'
import { prepararImagem } from '@/lib/documentos/importarImagemCliente'
import { importarModeloPorFoto, salvarModeloDaClinica, voltarAoModeloPadrao, type ModeloClinicaItem } from './modelosApi'
import styles from './importarModelo.module.css'

interface Props {
  /** Tipo aberto no formulário estruturado (sugestão inicial). */
  kind: DocKind
  /** Modelos próprios que a clínica já tem. */
  modelos: ModeloClinicaItem[]
  /** Quem pode editar o prontuário; sem isso o botão não aparece. */
  canEdit: boolean
  /** Depois de salvar ou voltar ao padrão: o pai relê os modelos. */
  onChanged: () => void
}

interface Foto { id: number; previewUrl: string; dataBase64: string }

const CAMPO_LABEL_FULL: Record<string, string> = Object.fromEntries(CAMPOS_MODELO.map(c => [c.key, c.label]))
const firstFinalidade = (k: DocKind): Finalidade | null => FINALIDADES_POR_TIPO[k][0] ?? null
const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * Importar modelo por foto: a clínica envia a foto do modelo EM BRANCO, a IA lê o texto e marca os pontos variáveis
 * com campos do catálogo; a pessoa confere lado a lado, ajusta e só então salva. Nada é salvo nem emitido sozinho,
 * e a imagem fica apenas na memória desta tela (descartada ao salvar, descartar ou sair).
 */
export function ImportarModelo({ kind, modelos, canEdit, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<DocKind>(kind)
  const [finalidade, setFinalidade] = useState<Finalidade | null>(firstFinalidade(kind))
  const [confirmaBranco, setConfirmaBranco] = useState(false)
  const [fotos, setFotos] = useState<Foto[]>([])
  const [busy, setBusy] = useState<null | 'preparando' | 'lendo' | 'salvando'>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lido, setLido] = useState<{ avisos: string[] } | null>(null)
  const [texto, setTexto] = useState('')
  const [campos, setCampos] = useState<CampoImportado[]>([])
  const [nome, setNome] = useState('')
  const [revisado, setRevisado] = useState(false)
  const [novoCampo, setNovoCampo] = useState('paciente')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const seqRef = useRef(0)
  // espelho das fotos para uso em handlers assíncronos e na limpeza ao desmontar (não é lido no render)
  const fotosRef = useRef<Foto[]>([])
  function atualizarFotos(next: Foto[]) { fotosRef.current = next; setFotos(next) }

  // imagem só em memória: libera os endereços blob: ao sair da tela
  useEffect(() => () => { fotosRef.current.forEach(x => URL.revokeObjectURL(x.previewUrl)) }, [])

  const lista = useMemo(() => reconciliarCampos(texto, campos), [texto, campos])
  const permitidos = useMemo(() => camposPermitidosDetalhe(tipo, finalidade), [tipo, finalidade])
  const validacao = useMemo(() => validarParaSalvar(texto, lista, { kind: tipo, finalidade }), [texto, lista, tipo, finalidade])
  const nomeOk = validarNomeModelo(nome)
  const partes = useMemo(() => partesDoTexto(texto), [texto])
  const meus = useMemo(() => modelos.filter(m => m.key === 'laudo' ? kind === 'laudo' : m.key.startsWith(`${kind}.`)), [modelos, kind])
  const existente = modelos.find(m => m.key === chaveDoModelo(tipo, finalidade))
  const campoOptions = useMemo(() => [{ value: '', label: 'Sem campo (escolher)' }, ...permitidos.map(c => ({ value: c.key, label: c.label }))], [permitidos])

  if (!canEdit) return null

  function limparFotos() {
    fotosRef.current.forEach(x => URL.revokeObjectURL(x.previewUrl))
    atualizarFotos([])
  }
  function reset() {
    limparFotos()
    setConfirmaBranco(false); setErro(null); setLido(null); setTexto(''); setCampos([]); setNome(''); setRevisado(false); setBusy(null)
  }
  function fechar() { reset(); setOpen(false) }
  function abrir() {
    setTipo(kind); setFinalidade(firstFinalidade(kind)); reset(); setOpen(true)
  }
  function escolherTipo(k: DocKind) { setTipo(k); setFinalidade(firstFinalidade(k)); setRevisado(false) }

  async function adicionar(files: FileList | null) {
    if (!files || files.length === 0) return
    setErro(null)
    setBusy('preparando')
    try {
      for (const file of Array.from(files)) {
        if (fotosRef.current.length >= IMPORTAR_LIMITES.maxImagens) { setErro(`No máximo ${IMPORTAR_LIMITES.maxImagens} imagens.`); break }
        const r = await prepararImagem(file)
        if (!r.ok) { setErro(r.message); continue }
        const foto = { id: ++seqRef.current, previewUrl: r.previewUrl, dataBase64: r.dataBase64 }
        atualizarFotos([...fotosRef.current, foto])
      }
    } finally {
      setBusy(null)
      if (cameraRef.current) cameraRef.current.value = ''
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }
  function tirarFoto(id: number) {
    fotosRef.current.filter(x => x.id === id).forEach(x => URL.revokeObjectURL(x.previewUrl))
    atualizarFotos(fotosRef.current.filter(x => x.id !== id))
  }

  async function ler() {
    setErro(null)
    if (!confirmaBranco || fotos.length === 0) return
    setBusy('lendo')
    try {
      const r = await importarModeloPorFoto({
        tipo, finalidade, confirmaEmBranco: true,
        imagens: fotos.map(x => ({ mediaType: 'image/jpeg', dataBase64: x.dataBase64 })),
      })
      // o conteúdo da imagem já cumpriu o papel: só a prévia (blob:) fica para a conferência lado a lado
      atualizarFotos(fotosRef.current.map(x => ({ ...x, dataBase64: '' })))
      setTexto(r.texto); setCampos(r.campos); setLido({ avisos: r.avisos }); setRevisado(false)
      setNome(`${TIPO_LABEL[tipo]} da clínica`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o modelo. Tente de novo.')
    } finally {
      setBusy(null)
    }
  }

  function aoTrocarCampo(marcador: string, valor: string) {
    setCampos(trocarCampo(lista, marcador, valor || null)); setRevisado(false)
  }
  function aoRemover(marcador: string) {
    const r = removerMarcador(texto, lista, marcador)
    setTexto(r.texto); setCampos(r.campos); setRevisado(false)
  }
  function aoInserir() {
    const ta = taRef.current
    const r = inserirMarcador(texto, lista, novoCampo, ta?.selectionStart ?? texto.length, ta?.selectionEnd ?? texto.length)
    setTexto(r.texto); setCampos(r.campos); setRevisado(false)
  }

  const podeSalvar = !!lido && busy === null && revisado && nomeOk.ok && validacao.erros.length === 0

  async function salvar() {
    if (!podeSalvar || !nomeOk.ok) return
    setErro(null)
    setBusy('salvando')
    try {
      await salvarModeloDaClinica({ tipo, finalidade, nome: nomeOk.nome, texto: validacao.modelo, confirmadoPelaPessoa: true, origem: 'foto_ia' })
      showToast('ok', 'Modelo salvo. O formulário passa a usar o texto da clínica.')
      onChanged()
      fechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o modelo. Tente de novo.')
      setBusy(null)
    }
  }

  async function voltarPadrao(m: ModeloClinicaItem) {
    const chave = parseChave(m.key)
    if (!chave) return
    setErro(null)
    try {
      await voltarAoModeloPadrao(chave.kind, chave.finalidade)
      showToast('ok', 'Voltou ao modelo padrão do sistema.')
      onChanged()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível voltar ao modelo padrão.')
    }
  }

  function rotulo(m: ModeloClinicaItem): string {
    const c = parseChave(m.key)
    return c && c.finalidade ? `${m.name} (${FINALIDADE_LABEL[c.finalidade].toLowerCase()})` : m.name
  }

  const tipoFinalidade = (
    <>
      <div role="group" aria-label="Tipo de documento" className={styles.pills}>
        {STRUCTURED_KINDS.map(k => (
          <button key={k} type="button" className={styles.pill} aria-pressed={tipo === k} onClick={() => escolherTipo(k)}>{TIPO_LABEL[k]}</button>
        ))}
      </div>
      {FINALIDADES_POR_TIPO[tipo].length > 0 && (
        <div role="group" aria-label="Finalidade do modelo" className={styles.pills}>
          {FINALIDADES_POR_TIPO[tipo].map(fin => (
            <button key={fin} type="button" className={styles.pill} aria-pressed={finalidade === fin} onClick={() => { setFinalidade(fin); setRevisado(false) }}>{FINALIDADE_LABEL[fin]}</button>
          ))}
        </div>
      )}
    </>
  )

  if (!open) {
    return (
      <div className={styles.entry}>
        <p className={styles.entryHint}>Tem um modelo próprio em papel ou PDF? Envie a foto e o sistema monta o texto com os campos, para você conferir antes de salvar.</p>
        {meus.length > 0 && (
          <ul className={styles.models}>
            {meus.map(m => (
              <li key={m.key} className={styles.modelRow}>
                <span>Modelo da clínica em uso: {rotulo(m)}</span>
                <button type="button" className={`${btn.ghost} ${styles.tall}`} onClick={() => void voltarPadrao(m)}>Voltar ao modelo padrão</button>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.entryActions}>
          <button type="button" className={`${btn.secondary} ${styles.tall}`} onClick={abrir}><Icon name="camera" size={14} /> Importar modelo por foto</button>
        </div>
        {erro && <p role="alert" className={styles.error}>{erro}</p>}
      </div>
    )
  }

  return (
    <section className={styles.panel} aria-label="Importar modelo por foto">
      <div className={styles.head}>
        <h3 className={styles.title}>Importar modelo por foto</h3>
        <button type="button" className={`${btn.ghost} ${styles.tall}`} onClick={fechar} disabled={busy === 'lendo' || busy === 'salvando'}>Cancelar</button>
      </div>

      <div className={styles.notice} role="note">
        <p><strong>Antes de enviar.</strong> A foto é enviada a um serviço de inteligência artificial para ler o texto. Envie somente o modelo em branco, sem nenhum dado de paciente (nome, CPF, endereço, diagnóstico). A imagem não é guardada pelo sistema: ela existe só nesta tela e é descartada ao salvar ou cancelar.</p>
        <p>{AVISO_IA}</p>
      </div>

      {!lido && (
        <>
          <div className={styles.group}>
            <span className={styles.label}>Tipo do documento</span>
            {tipoFinalidade}
          </div>

          <div className={styles.group}>
            <span className={styles.label}>Foto do modelo (até {IMPORTAR_LIMITES.maxImagens} imagens, JPG, PNG ou WebP)</span>
            <div className={styles.entryActions}>
              <button type="button" className={`${btn.secondary} ${styles.tall}`} onClick={() => cameraRef.current?.click()} disabled={busy !== null || fotos.length >= IMPORTAR_LIMITES.maxImagens}><Icon name="camera" size={14} /> Tirar foto</button>
              <button type="button" className={`${btn.secondary} ${styles.tall}`} onClick={() => arquivoRef.current?.click()} disabled={busy !== null || fotos.length >= IMPORTAR_LIMITES.maxImagens}><Icon name="upload" size={14} /> Escolher arquivo</button>
            </div>
            <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e => void adicionar(e.target.files)} />
            <input ref={arquivoRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => void adicionar(e.target.files)} />
            <p className={styles.hint}>Modelo em PDF: exporte a página como imagem (captura de tela serve).</p>
            {fotos.length > 0 && (
              <ul className={styles.thumbs}>
                {fotos.map((x, i) => (
                  <li key={x.id} className={styles.thumb}>
                    {/* prévia local (blob:), nunca enviada a lugar nenhum além da leitura */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.previewUrl} alt={`Imagem ${i + 1} do modelo`} />
                    <button type="button" className={styles.thumbRemove} aria-label={`Remover imagem ${i + 1}`} onClick={() => tirarFoto(x.id)} disabled={busy !== null}><Icon name="close" size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className={styles.check}>
            <input type="checkbox" checked={confirmaBranco} onChange={e => setConfirmaBranco(e.target.checked)} />
            <span>Confirmo que o modelo está em branco, sem dados de paciente.</span>
          </label>

          {erro && <p role="alert" className={styles.error}>{erro}</p>}
          {busy === 'preparando' && <p role="status" className={styles.loading}>Preparando a imagem...</p>}
          {busy === 'lendo' && <p role="status" className={styles.loading}>Lendo o modelo. Isso pode levar até um minuto.</p>}

          <div className={styles.entryActions}>
            <button type="button" className={`${btn.primary} ${styles.tall}`} disabled={!confirmaBranco || fotos.length === 0 || busy !== null} onClick={() => void ler()}>
              {busy === 'lendo' ? 'Lendo...' : 'Ler modelo'}
            </button>
          </div>
        </>
      )}

      {lido && (
        <>
          <div className={styles.group}>
            <span className={styles.label}>Tipo do documento</span>
            {tipoFinalidade}
          </div>

          {lido.avisos.length > 0 && (
            <ul className={styles.avisos} role="status">{lido.avisos.map(a => <li key={a}>{a}</li>)}</ul>
          )}

          <div className={styles.side}>
            <div className={styles.sideImg}>
              <span className={styles.label}>Imagem enviada (só nesta tela)</span>
              {fotos.map((x, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={x.id} src={x.previewUrl} alt={`Imagem ${i + 1} do modelo enviado`} className={styles.full} />
              ))}
            </div>

            <div className={styles.sideText}>
              <span className={styles.label}>Texto reconhecido, com os campos destacados</span>
              <div className={styles.rendered} aria-label="Como o texto ficará, com os campos destacados">
                {partes.map((p, i) => {
                  if (p.tipo === 'texto') return <span key={i}>{p.valor}</span>
                  const c = lista.find(x => x.marcador === p.id)
                  const ok = !!c?.campo && permitidos.some(pp => pp.key === c.campo)
                  return <mark key={i} className={ok ? styles.mark : styles.markWarn}>{ok && c?.campo ? CAMPO_LABEL_FULL[c.campo] : 'sem campo'}</mark>
                })}
              </div>

              <div className={f.field}>
                <label htmlFor="im-texto">Editar o texto (os pontos variáveis aparecem como [[M1]], [[M2]]...)</label>
                <textarea id="im-texto" ref={taRef} className={styles.textarea} value={texto} maxLength={IMPORTAR_LIMITES.textoMax} onChange={e => { setTexto(e.target.value); setRevisado(false) }} />
              </div>
            </div>
          </div>

          <div className={styles.group}>
            <span className={styles.label}>Campos encontrados</span>
            {lista.length === 0 && <p className={styles.hint}>Nenhum ponto variável. Posicione o cursor no texto e use &quot;Adicionar campo&quot; abaixo.</p>}
            <ul className={styles.fields}>
              {lista.map(c => (
                <li key={c.marcador} className={styles.fieldRow}>
                  <span className={styles.marker}>{c.marcador}</span>
                  <div className={styles.fieldSelect}>
                    <SelectMenu variant="field" ariaLabel={`Campo do ponto ${c.marcador}`} value={c.campo ?? ''} onChange={v => aoTrocarCampo(c.marcador, v)} options={campoOptions} />
                  </div>
                  <span className={c.campo && c.confianca < 0.7 ? styles.confLow : styles.conf} title="Confiança da IA">{c.campo ? pct(c.confianca) : 'sem campo'}</span>
                  <button type="button" className={`${btn.ghost} ${styles.tall}`} onClick={() => aoRemover(c.marcador)}>Remover</button>
                </li>
              ))}
            </ul>
            <div className={styles.addRow}>
              <div className={styles.fieldSelect}>
                <SelectMenu variant="field" ariaLabel="Campo a adicionar" value={novoCampo} onChange={setNovoCampo} options={permitidos.map(c => ({ value: c.key, label: c.label }))} />
              </div>
              <button type="button" className={`${btn.secondary} ${styles.tall}`} onClick={aoInserir}><Icon name="plus" size={14} /> Adicionar campo no cursor</button>
            </div>
            <p className={styles.hint}>Para marcar uma palavra como campo, selecione-a no texto acima e clique em adicionar: o trecho selecionado é substituído pelo campo.</p>
          </div>

          <div className={f.field}>
            <label htmlFor="im-nome">Nome do modelo</label>
            <input id="im-nome" value={nome} maxLength={IMPORTAR_LIMITES.nomeMax} onChange={e => setNome(e.target.value)} />
          </div>

          {existente && <p className={styles.hint}>A clínica já tem o modelo &quot;{existente.name}&quot; para este documento. Salvar substitui o anterior (o padrão do sistema pode ser restaurado depois).</p>}

          {validacao.erros.length > 0 && <ul className={styles.avisos} role="status">{validacao.erros.map(e => <li key={e}>{e}</li>)}</ul>}
          {!nomeOk.ok && <p className={styles.hint}>{nomeOk.erro}</p>}

          <label className={styles.check}>
            <input type="checkbox" checked={revisado} onChange={e => setRevisado(e.target.checked)} />
            <span>Revisei o texto e os campos, comparei com a imagem e confirmo que o modelo está correto. Sei que o conteúdo foi gerado por IA.</span>
          </label>

          {erro && <p role="alert" className={styles.error}>{erro}</p>}

          <div className={styles.entryActions}>
            <button type="button" className={`${btn.primary} ${styles.tall}`} disabled={!podeSalvar} onClick={() => void salvar()}>
              {busy === 'salvando' ? 'Salvando...' : 'Salvar como modelo da clínica'}
            </button>
            <button type="button" className={`${btn.ghost} ${styles.tall}`} onClick={() => { reset() }} disabled={busy !== null}>Descartar e enviar outra foto</button>
          </div>
        </>
      )}
    </section>
  )
}
