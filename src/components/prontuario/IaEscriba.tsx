'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useAuthStore } from '@/store/auth'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'
import type { EscribaArea } from '@/lib/ia/escriba'
import { redigirEvolucao, salvarConsentimento } from './iaEscribaApi'
import { useEscribaStatus, type EscribaEstado } from './useEscribaStatus'
import styles from './IaEscriba.module.css'

// ─── Web Speech API (ditado no navegador, pt-BR) ────────────────────────────
// O áudio NÃO passa pelo servidor do MyClinica. Atenção: em vários navegadores (ex.: Chrome) o
// reconhecimento é feito na nuvem do fornecedor do navegador; por isso o aviso abaixo.

interface SpeechResultLike { isFinal: boolean; 0: { transcript: string } }
interface SpeechEventLike { resultIndex: number; results: ArrayLike<SpeechResultLike> }
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((e: SpeechEventLike) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
  start(): void; stop(): void; abort(): void
}
type SpeechCtor = new () => SpeechRecognitionLike

function getSpeechCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const VOICE_ERRORS: Record<string, string> = {
  'not-allowed': 'O navegador bloqueou o microfone. Libere o acesso para ditar.',
  'service-not-allowed': 'O navegador bloqueou o microfone. Libere o acesso para ditar.',
  'audio-capture': 'Nenhum microfone encontrado.',
  'network': 'O ditado precisa de conexão com a internet.',
}

export function useDictation(onChunk: (text: string) => void) {
  // false no servidor e na hidratação; depois reflete o navegador (sem suporte = botão de ditado escondido)
  const supported = useSyncExternalStore(() => () => {}, () => getSpeechCtor() !== null, () => false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const chunkRef = useRef(onChunk)
  useEffect(() => { chunkRef.current = onChunk }, [onChunk])

  useEffect(() => {
    return () => { recRef.current?.abort(); recRef.current = null }
  }, [])

  function start() {
    const Ctor = getSpeechCtor()
    if (!Ctor || recRef.current) return
    setError('')
    const rec = new Ctor()
    rec.lang = 'pt-BR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) chunkRef.current(r[0].transcript)
        else partial += r[0].transcript
      }
      setInterim(partial)
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      setError(VOICE_ERRORS[e.error ?? ''] ?? 'Não foi possível usar o ditado agora.')
    }
    rec.onend = () => { recRef.current = null; setListening(false); setInterim('') }
    recRef.current = rec
    try { rec.start(); setListening(true) } catch {
      recRef.current = null
      setError('Não foi possível iniciar o ditado.')
    }
  }
  function stop() { recRef.current?.stop() }

  return { supported, listening, interim, error, start, stop }
}

// ─── Consentimento da clínica ───────────────────────────────────────────────

export function ConsentimentoIa({ estado, onDone }: { estado: Extract<EscribaEstado, { kind: 'sem_consentimento' }>; onDone: () => void }) {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin === true
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function autorizar() {
    const ok = await confirmDialog({
      title: 'Autorizar o uso de IA pela clínica?',
      message: 'O texto clínico que o profissional escrever ou ditar será enviado a um provedor de IA para redação. Nome, CPF, telefone, e-mail e endereço do paciente não são enviados, e o resultado é sempre um rascunho a ser revisado. Dados de saúde são dados sensíveis (LGPD): confirme que a clínica concorda e que os pacientes foram informados. Você pode desfazer a autorização depois.',
      confirmText: 'Autorizar',
      cancelText: 'Cancelar',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await salvarConsentimento(true)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar agora.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.notice}>
      <span className={styles.noticeTitle}>IA escriba desligada nesta clínica</span>
      <span className={styles.muted}>
        Para usar, a clínica precisa autorizar o envio do texto clínico, sem identificadores do paciente, a um provedor de IA. Dados de saúde são dados sensíveis (LGPD).
      </span>
      {!estado.suportado
        ? <span className={styles.muted}>O registro dessa autorização ainda não está disponível neste ambiente.</span>
        : isAdmin
          ? <div className={styles.row}><button type="button" className={styles.btn} onClick={() => { void autorizar() }} disabled={busy}>{busy ? 'Salvando...' : 'Autorizar o uso de IA pela clínica'}</button></div>
          : <span className={styles.muted}>Peça ao administrador da clínica para autorizar.</span>}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}

// ─── Botão "Redigir com IA" + ditado, para a evolução ───────────────────────

interface Props {
  area: EscribaArea
  patientId: string
  text: string
  setText: React.Dispatch<React.SetStateAction<string>>
  /** bloqueia o recurso (ex.: anotação sigilosa não usa IA) */
  blockedReason?: string | null
  disabled?: boolean
  /** true enquanto há rascunho de IA ainda não marcado como revisado; o pai deve travar o salvar */
  onNeedsReviewChange?: (needs: boolean) => void
}

export function IaEscriba({ area, patientId, text, setText, blockedReason, disabled, onNeedsReviewChange }: Props) {
  const { estado, reload } = useEscribaStatus(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [original, setOriginal] = useState<string | null>(null)   // texto do profissional antes da IA
  // texto exato que o profissional marcou como revisado; qualquer edição depois disso invalida a revisão
  const [reviewedText, setReviewedText] = useState<string | null>(null)
  const reviewed = reviewedText !== null && reviewedText === text

  const dictation = useDictation(chunk => {
    setText(prev => `${prev && !/\s$/.test(prev) ? `${prev} ` : prev}${chunk.trim()} `)
  })

  const generated = original !== null
  const needsReview = generated && !reviewed

  useEffect(() => { onNeedsReviewChange?.(needsReview) }, [needsReview]) // eslint-disable-line react-hooks/exhaustive-deps
  // texto limpo (salvou ou apagou) = fim do ciclo do rascunho (ajuste de estado durante a renderização)
  if (!text.trim() && (original !== null || reviewedText !== null)) { setOriginal(null); setReviewedText(null) }
  useEffect(() => () => onNeedsReviewChange?.(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  if (estado.kind === 'carregando' || estado.kind === 'oculto') return null

  if (estado.kind === 'sem_consentimento') return <ConsentimentoIa estado={estado} onDone={reload} />

  const off = estado.kind === 'nao_configurada'
  const tooShort = text.trim().length < 10
  const lockReason = blockedReason ?? null

  async function redigir() {
    if (busy) return
    if (dictation.listening) dictation.stop()
    setBusy(true)
    setError('')
    try {
      const r = await redigirEvolucao({ area, patientId, texto: text })
      setOriginal(prev => prev ?? text)
      setReviewedText(null)
      setText(r.rascunho)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível redigir agora.')
    } finally {
      setBusy(false)
    }
  }

  function voltar() {
    if (original !== null) setText(original)
    setOriginal(null)
    setReviewedText(null)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        {dictation.supported && !off && (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnMic} ${dictation.listening ? styles.btnMicOn : ''}`}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            disabled={disabled || busy || !!lockReason}
            aria-pressed={dictation.listening}
            title={lockReason ?? (dictation.listening ? 'Parar o ditado' : 'Ditar por voz')}
          >
            <Icon name="mic" size={16} /> {dictation.listening ? 'Parar ditado' : 'Ditar'}
          </button>
        )}
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => { void redigir() }}
          disabled={off || disabled || busy || tooShort || !!lockReason}
          title={lockReason ?? (off ? 'IA ainda não configurada' : tooShort ? 'Escreva ou dite o rascunho primeiro' : undefined)}
        >
          {busy ? 'Redigindo...' : 'Redigir com IA'}
        </button>
        {off && <span className={styles.muted}>IA ainda não configurada.</span>}
        {lockReason && !off && <span className={styles.muted}>{lockReason}</span>}
      </div>

      {dictation.interim && <p className={styles.interim} aria-live="polite">{dictation.interim}</p>}
      {dictation.error && <p className={styles.error}>{dictation.error}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!off && !generated && (
        <p className={styles.muted}>
          Escreva ou dite o rascunho ou os tópicos; a IA devolve um texto técnico e sucinto para você revisar. Evite digitar nomes: CPF, telefone, e-mail e o nome do paciente são removidos antes do envio, mas outros nomes não.
          {dictation.supported && ' O ditado usa o reconhecimento de voz do seu navegador, que pode processar o áudio nos servidores do fornecedor do navegador; o áudio não passa pelo MyClinica.'}
        </p>
      )}

      {generated && (
        <div className={styles.review} role="status">
          <span className={styles.reviewTitle}>Rascunho gerado por IA, revise antes de salvar</span>
          <span className={styles.muted}>
            O texto acima pode conter erros ou omissões e os trechos marcados com [confirmar] precisam de sua conferência. A anotação só é salva quando você clicar em Adicionar Anotação, e depois de salva não pode ser editada.
          </span>
          <label className={styles.check}>
            <input type="checkbox" checked={reviewed} onChange={e => setReviewedText(e.target.checked ? text : null)} />
            <span>Li e revisei o texto, e ele reflete o que aconteceu no atendimento</span>
          </label>
          <div className={styles.row}>
            <button type="button" className={styles.btn} onClick={voltar} disabled={busy}>Voltar ao meu texto</button>
          </div>
        </div>
      )}
    </div>
  )
}
