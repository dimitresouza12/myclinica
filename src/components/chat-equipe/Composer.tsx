'use client'
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useAuthStore } from '@/store/auth'
import { draftKey, teamDrafts } from '@/lib/teamChat/drafts'
import { showToast } from '@/components/ui/Toast'
import { memberRoleLabel, normalizeSearch, type ReadOnlyReason } from '@/lib/teamChat/format'
import { MAX_PATIENT_TOKENS, composeBody, countPatientTokens, detectMention, tokensReserve } from '@/lib/teamChat/richText'
import { ImageCompressError, compressImage } from '@/lib/teamChat/compress'
import { MAX_CAPTION, audioLimitLabel, maxAudioMsForMime } from '@/lib/teamChat/attachments'
import type { TeamAttachmentInput } from '@/hooks/useTeamChat'
import type { TeamChannelKind, TeamChannelMember, TeamDirectoryEntry } from '@/lib/teamChat/types'
import { ChannelAvatar } from './ChannelAvatar'
import { ImagePreview, type ImagePreviewState } from './ImagePreview'
import { RecordingBar } from './RecordingBar'
import { canRecordAudio, useTeamVoiceRecorder } from './useTeamVoiceRecorder'
import { PatientPickerModal } from './PatientPickerModal'
import { PresenceDot } from './PresenceDot'
import styles from './ChatEquipe.module.css'

const MAX_BODY = 4000
const MAX_MENTION_OPTIONS = 8

export interface ComposerHandle {
  focus: () => void
}

interface Props {
  ref?: Ref<ComposerHandle>
  clinicId: string
  channelId: string
  kind: TeamChannelKind
  /** por que o login não pode escrever neste canal (null: pode) */
  readOnly: ReadOnlyReason
  /** quem está no canal (a lista de menção só traz essas pessoas; vazio = a clínica toda) */
  members: TeamChannelMember[]
  directory: TeamDirectoryEntry[]
  online: ReadonlySet<string>
  /** barra "Respondendo a ...": nome e trecho da mensagem respondida (null: não está respondendo) */
  replyName: string | null
  replyText: string
  onCancelReply: () => void
  /** corpo pronto para enviar (texto + citações). Quem chama envia e fecha a resposta. */
  onSend: (body: string) => void
  /** foto (já comprimida, com legenda) ou áudio gravado, pronto para subir. Quem chama envia e fecha a resposta. */
  onSendAttachment: (input: TeamAttachmentInput) => void
  /** a caixa cresceu ou encolheu: quem estava no fim da lista continua no fim */
  onResize: () => void
}

/**
 * Campo de escrever. O texto, o cursor, a lista de menção, as citações de paciente e o seletor ficam AQUI: digitar
 * re-renderiza só este componente, nunca a lista de mensagens. Para cima só sobem onSend, onCancelReply e onResize.
 * Montado por conversa (o pai tem `key` do canal), então o rascunho não passa de uma conversa para outra.
 */
function ComposerBase({ ref, ...p }: Props) {
  const { onResize } = p
  // rascunho da conversa: volta ao reabrir o canal (só em memória; some ao sair ou trocar de login)
  const userId = useAuthStore(s => s.user?.id)
  const key = draftKey(userId, p.clinicId, p.channelId)
  const [text, setText] = useState(() => teamDrafts.get(key)?.text ?? '')
  const [caret, setCaret] = useState(() => teamDrafts.get(key)?.text.length ?? 0)
  const [mentionIdx, setMentionIdx] = useState(0)
  /** posição do "@" cuja lista o usuário fechou com Esc */
  const [mentionOff, setMentionOff] = useState<number | null>(null)
  const [cited, setCited] = useState<{ id: string; name: string }[]>(() => teamDrafts.get(key)?.cited ?? [])
  const [picking, setPicking] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const attachBtnRef = useRef<HTMLButtonElement>(null)
  const sendBtnRef = useRef<HTMLButtonElement>(null)
  // foto escolhida (preparando ou pronta para enviar) e a legenda; o rascunho de texto não guarda anexo
  const [preview, setPreview] = useState<ImagePreviewState | null>(null)
  const [caption, setCaption] = useState('')
  const previewTick = useRef(0)
  const previewRef = useRef<ImagePreviewState | null>(null)
  const canRecord = useSyncExternalStore(() => () => undefined, canRecordAudio, () => false)
  const sendRecordingRef = useRef<(auto: boolean) => void>(() => undefined)
  const onLimit = useCallback(() => sendRecordingRef.current(true), [])
  const rec = useTeamVoiceRecorder({ onLimit })

  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }), [])

  // @menção: o cursor está depois de um "@algo"; a lista traz colegas desta conversa (ou da clínica, se os membros ainda não chegaram)
  const mentionQ = useMemo(() => detectMention(text, caret), [text, caret])
  const mentionOptions = useMemo(() => {
    if (!mentionQ || mentionQ.start === mentionOff) return []
    const q = normalizeSearch(mentionQ.query)
    const finished = mentionQ.query.endsWith(' ')
    const inChannel = new Set(p.members.map(m => m.clinic_user_id))
    const rank = (d: TeamDirectoryEntry) => {
      const n = normalizeSearch(d.display_name)
      return n === q ? 0 : n.startsWith(q) ? 1 : 2
    }
    const list = p.directory
      .filter(d => !d.is_me && (inChannel.size === 0 || inChannel.has(d.clinic_user_id)))
      .filter(d => {
        const n = normalizeSearch(d.display_name)
        // "@Maria " com espaço no fim: o nome exato ou nomes com mais palavras; senão a pessoa já terminou de digitar
        return finished ? n === q || n.startsWith(`${q} `) : n.includes(q)
      })
      // o nome exato vem primeiro (e é o escolhido por padrão): "@Ana" com "Ana" e "Ana Paula" seleciona "Ana"
      .sort((a, b) => rank(a) - rank(b) || a.display_name.localeCompare(b.display_name, 'pt-BR'))
      .slice(0, MAX_MENTION_OPTIONS)
    // "@Ana " e só existe "Ana": nada a escolher, a lista não abre e o Enter envia a mensagem
    if (finished && list.length === 1 && normalizeSearch(list[0].display_name) === q) return []
    return list
  }, [mentionQ, mentionOff, p.members, p.directory])
  const mentionOpen = mentionOptions.length > 0
  const activeMention = mentionOpen ? Math.min(mentionIdx, mentionOptions.length - 1) : 0

  // o que vai de fato para o banco: o texto e, na linha de baixo, as citações de paciente escolhidas
  const draftBody = useMemo(() => composeBody(text, cited), [text, cited])
  const textMax = Math.max(0, MAX_BODY - tokensReserve(cited))
  const counterLeft = MAX_BODY - draftBody.length
  const noPatients = p.kind === 'general'
  const showMic = canRecord && !draftBody

  const resize = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
    onResize()
  }, [onResize])

  // guarda o que está escrito (enviar limpa o campo, e o rascunho some junto)
  useEffect(() => { teamDrafts.set(key, { text, cited }) }, [key, text, cited])

  // ao abrir (resize é estável, então roda uma vez): ajusta a altura ao rascunho restaurado; no computador (ponteiro preciso e lista ao lado da conversa) o foco vai
  // para o campo. No celular não: focar ao entrar abriria o teclado por cima da conversa.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    if (ta.value) resize()
    const wide = (ta.closest('[data-team-root]')?.clientWidth ?? 0) > 760
    if (wide && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    }
  }, [resize])

  /** "@" que o usuário dispensou com Esc só vale enquanto o cursor continua nele; em outro lugar (ou sem "@"), a dispensa some. */
  function syncMentionOff(value: string, pos: number) {
    const q = detectMention(value, pos)
    setMentionOff(cur => (cur !== null && (!q || q.start !== cur) ? null : cur))
  }

  function pickMention(d: TeamDirectoryEntry) {
    if (!mentionQ) return
    const insert = `@${d.display_name.trim()} `
    const next = text.slice(0, mentionQ.start) + insert + text.slice(caret)
    if (next.length > MAX_BODY) { showToast('error', `A mensagem pode ter até ${MAX_BODY.toLocaleString('pt-BR')} caracteres.`); return }
    const pos = mentionQ.start + insert.length
    setText(next)
    setCaret(pos)
    setMentionIdx(0)
    setMentionOff(mentionQ.start)
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(pos, pos)
      resize()
    })
  }

  function addPatient(pt: { id: string; name: string }) {
    setPicking(false)
    setCited(cur => (cur.length >= MAX_PATIENT_TOKENS || cur.some(c => c.id === pt.id) ? cur : [...cur, pt]))
    requestAnimationFrame(() => taRef.current?.focus())
  }

  function submit() {
    if (!draftBody || p.readOnly) return
    if (draftBody.length > MAX_BODY) { showToast('error', `A mensagem pode ter até ${MAX_BODY.toLocaleString('pt-BR')} caracteres.`); return }
    if (countPatientTokens(draftBody) > MAX_PATIENT_TOKENS) { showToast('error', `Uma mensagem pode citar até ${MAX_PATIENT_TOKENS} pacientes.`); return }
    p.onSend(draftBody)
    setText('')
    setCited([])
    setCaret(0)
    setMentionOff(null)
    requestAnimationFrame(resize)
  }

  // ── foto ──
  useEffect(() => { previewRef.current = preview }, [preview])
  // sair da conversa solta a URL da pré-visualização
  useEffect(() => () => { const cur = previewRef.current; if (cur?.status === 'ready') URL.revokeObjectURL(cur.url) }, [])

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const tick = ++previewTick.current
    setPreview({ status: 'preparing' })
    setCaption('')
    try {
      const image = await compressImage(file)
      if (tick !== previewTick.current) return
      setPreview({ status: 'ready', image, url: URL.createObjectURL(image.blob) })
    } catch (err) {
      if (tick !== previewTick.current) return
      setPreview(null)
      showToast('error', err instanceof ImageCompressError ? err.message : 'Não foi possível preparar a foto.')
      requestAnimationFrame(() => attachBtnRef.current?.focus())
    }
  }

  function closePreview() {
    previewTick.current++
    if (preview?.status === 'ready') URL.revokeObjectURL(preview.url)
    setPreview(null)
    setCaption('')
    requestAnimationFrame(() => attachBtnRef.current?.focus())
  }

  function sendImage() {
    if (preview?.status !== 'ready' || p.readOnly) return
    const { image } = preview
    p.onSendAttachment({ kind: 'image', blob: image.blob, mime: image.mime, width: image.width, height: image.height, caption: caption.trim().slice(0, MAX_CAPTION) })
    closePreview()
  }

  // ── áudio ──
  useEffect(() => { if (rec.error) showToast('error', rec.error) }, [rec.error])

  async function sendRecording(auto: boolean) {
    const r = await rec.finish()
    requestAnimationFrame(() => sendBtnRef.current?.focus())
    if (!r.ok) { if (r.message) showToast('error', r.message); return }
    if (p.readOnly) return
    p.onSendAttachment({ kind: 'audio', blob: r.rec.blob, mime: r.rec.mime, durationMs: r.rec.durationMs, caption: '' })
    if (auto) showToast('ok', `Chegou ao limite de ${audioLimitLabel(maxAudioMsForMime(r.rec.mime))}: o áudio foi enviado.`)
  }
  useEffect(() => { sendRecordingRef.current = auto => { void sendRecording(auto) } })

  function cancelRecording() {
    rec.cancel()
    requestAnimationFrame(() => sendBtnRef.current?.focus())
  }

  // o campo some enquanto grava ou escolhe a foto: ao voltar, ajusta a altura; ao sair, a lista segue no fim
  const boxShown = rec.phase === 'idle' && !preview
  useEffect(() => {
    if (boxShown) { if (taRef.current?.value) resize() } else onResize()
  }, [boxShown, resize, onResize])

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // durante a composição de IME (teclado de celular, japonês etc.) o Enter confirma a palavra, não envia
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
    if (mentionOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((activeMention + 1) % mentionOptions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((activeMention - 1 + mentionOptions.length) % mentionOptions.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionOptions[activeMention]); return }
      if (e.key === 'Escape') { e.preventDefault(); setMentionOff(mentionQ?.start ?? null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div className={styles.composer}>
      {p.readOnly ? (
        <div className={styles.readOnlyNote} role="note">
          <Icon name="eye" size={16} />
          {p.readOnly === 'archived'
            ? 'Esta conversa está arquivada. Só é possível ler as mensagens.'
            : 'Somente leitura (administrador)'}
        </div>
      ) : (
        <>
          {p.replyName !== null && (
            <div className={styles.replyBar}>
              <span className={styles.replyText}>
                <b>Respondendo a {p.replyName}</b>
                <span>{p.replyText}</span>
              </span>
              <button type="button" className={styles.iconBtn} onClick={p.onCancelReply} aria-label="Cancelar a resposta">
                <Icon name="close" size={18} />
              </button>
            </div>
          )}
          {cited.length > 0 && (
            <ul className={styles.citedRow} aria-label="Pacientes citados">
              {cited.map(c => (
                <li key={c.id} className={styles.citedChip}>
                  <Icon name="patients" size={14} aria-hidden="true" />
                  <span>{c.name}</span>
                  <button type="button" className={styles.citedRemove} onClick={() => setCited(cur => cur.filter(x => x.id !== c.id))} aria-label={`Remover ${c.name} da mensagem`}>
                    <Icon name="close" size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.composerWrap}>
            {mentionOpen && (
              <ul id="team-mention-list" className={styles.mentionList} role="listbox" aria-label="Mencionar um colega" onMouseDown={e => e.preventDefault()}>
                {mentionOptions.map((d, i) => (
                  <li key={d.clinic_user_id} role="presentation">
                    <button
                      type="button"
                      id={`team-mention-${i}`}
                      role="option"
                      aria-selected={i === activeMention}
                      className={`${styles.mentionOpt} ${i === activeMention ? styles.mentionOptOn : ''}`}
                      onClick={() => pickMention(d)}
                      onMouseEnter={() => setMentionIdx(i)}
                    >
                      <ChannelAvatar kind="direct" name={d.display_name} size={32} avatar={d.avatar_data} />
                      <span className={styles.pickText}><b>{d.display_name}</b><span>{memberRoleLabel(d)}</span></span>
                      {p.online.has(d.clinic_user_id) && <PresenceDot />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {rec.phase !== 'idle' ? (
              <RecordingBar phase={rec.phase} startedAt={rec.startedAt} maxMs={rec.maxMs} meter={rec.meter} onCancel={cancelRecording} onSend={() => void sendRecording(false)} />
            ) : preview ? (
              <ImagePreview state={preview} caption={caption} onCaption={setCaption} onCancel={closePreview} onSend={sendImage} />
            ) : (
            <div className={styles.composerBox}>
              <button
                type="button"
                className={styles.patientBtn}
                onClick={() => setPicking(true)}
                disabled={noPatients || cited.length >= MAX_PATIENT_TOKENS}
                aria-label="Citar paciente"
                title={noPatients
                  ? 'Não é possível citar paciente no canal Geral: a conversa é de toda a equipe, e nem todos têm acesso ao cadastro.'
                  : cited.length >= MAX_PATIENT_TOKENS ? `Uma mensagem pode citar até ${MAX_PATIENT_TOKENS} pacientes` : 'Citar paciente'}
              >
                <Icon name="patients" size={18} />
                <span className={styles.patientBtnLabel}>Paciente</span>
              </button>
              <button
                ref={attachBtnRef}
                type="button"
                className={`${styles.iconBtn} ${styles.attachBtn}`}
                onClick={() => fileRef.current?.click()}
                aria-label="Anexar foto"
                title="Anexar foto"
              >
                <Icon name="paperclip" size={20} />
              </button>
              <textarea
                ref={taRef}
                rows={1}
                value={text}
                placeholder="Escreva uma mensagem"
                aria-label="Mensagem"
                maxLength={textMax}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-controls={mentionOpen ? 'team-mention-list' : undefined}
                aria-activedescendant={mentionOpen ? `team-mention-${activeMention}` : undefined}
                onChange={e => {
                  setText(e.target.value)
                  setCaret(e.target.selectionStart)
                  setMentionIdx(0)
                  syncMentionOff(e.target.value, e.target.selectionStart)
                  resize()
                }}
                onSelect={e => {
                  setCaret(e.currentTarget.selectionStart)
                  syncMentionOff(e.currentTarget.value, e.currentTarget.selectionStart)
                }}
                onKeyDown={onKey}
              />
              {/* campo vazio: o botão vira microfone (grava sem precisar tocar de novo); com texto, envia */}
              <button
                ref={sendBtnRef}
                type="button"
                className={styles.send}
                onClick={showMic ? () => void rec.start() : submit}
                disabled={!showMic && !draftBody}
                aria-label={showMic ? 'Gravar áudio' : 'Enviar mensagem'}
                title={showMic ? 'Gravar áudio' : 'Enviar mensagem'}
              >
                <Icon name={showMic ? 'mic' : 'send'} size={18} />
              </button>
            </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className={styles.srOnly} tabIndex={-1} aria-hidden="true" onChange={e => void onPickFile(e)} />
          </div>
          {counterLeft <= 500 && (
            <div className={`${styles.counter} ${counterLeft <= 0 ? styles.counterOver : ''}`} aria-hidden="true">
              {draftBody.length.toLocaleString('pt-BR')} de {MAX_BODY.toLocaleString('pt-BR')} caracteres
            </div>
          )}
          {/* leitor de tela: só avisa nos marcos (100 restantes e limite), não a cada tecla */}
          <div className={styles.srOnly} role="status">
            {counterLeft <= 0 ? 'Limite de caracteres atingido.' : counterLeft <= 100 ? 'Restam menos de 100 caracteres.' : ''}
          </div>
          {picking && (
            <PatientPickerModal
              clinicId={p.clinicId}
              sharedChannel={p.kind === 'area' || p.kind === 'group'}
              excludeIds={cited.map(c => c.id)}
              onPick={addPatient}
              onClose={() => { setPicking(false); requestAnimationFrame(() => taRef.current?.focus()) }}
            />
          )}
        </>
      )}
    </div>
  )
}

export const Composer = memo(ComposerBase)
