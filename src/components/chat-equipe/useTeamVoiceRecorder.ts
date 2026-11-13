'use client'
// Gravação de áudio do Chat da equipe: mono, 24 kbps, no máximo 5 minutos (90 s em audio/mp4 do Safari, que pode ignorar o bitrate). Diferente do
// useVoiceRecorder do WhatsApp dos pacientes (15 min, sem limite de bitrate); aqui o arquivo vai para um bucket com limite pequeno.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AUDIO_BITS_PER_SECOND, pickAudioMime } from '@/lib/teamChat/compress'
import { MAX_AUDIO_MS, MAX_FILE_BYTES, MIN_AUDIO_MS, baseMime, isAllowedMime, maxAudioMsForMime } from '@/lib/teamChat/attachments'

const METER_MS = 80

export interface TeamRecording {
  blob: Blob
  /** tipo sem parâmetros (audio/webm, audio/ogg ou audio/mp4) */
  mime: string
  /** tempo real de gravação, no máximo 300000 */
  durationMs: number
}

export type TeamFinish = { ok: true; rec: TeamRecording } | { ok: false; message: string }

/** Volume do microfone (0 a 1) a cada 80 ms, para as barras ao vivo. Fica fora do estado do React: quem desenha assina. */
export interface LevelMeter {
  subscribe: (fn: (level: number) => void) => () => void
}

export type RecorderPhase = 'idle' | 'starting' | 'recording'

/** O navegador consegue gravar áudio? (precisa de HTTPS, microfone e MediaRecorder) */
export function canRecordAudio(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

function micErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'O acesso ao microfone foi negado. Libere o microfone nas permissões do navegador para gravar áudio.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Nenhum microfone foi encontrado neste aparelho.'
  if (name === 'NotReadableError') return 'O microfone está em uso por outro aplicativo. Feche-o e tente de novo.'
  return 'Não foi possível usar o microfone.'
}

export function useTeamVoiceRecorder(opts: { /** a gravação chegou a 5 minutos: quem chama envia o que foi gravado */ onLimit: () => void }) {
  const [phase, setPhase] = useState<RecorderPhase>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [error, setError] = useState('')
  /** limite de duração do formato escolhido (5 min; 90 s em audio/mp4) */
  const [maxMs, setMaxMs] = useState(MAX_AUDIO_MS)
  const maxMsRef = useRef(MAX_AUDIO_MS)
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const perfStartRef = useRef(0)
  const mimeRef = useRef('')
  const limitRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const listenersRef = useRef(new Set<(level: number) => void>())
  /** invalida um start() ainda esperando o microfone quando a pessoa cancela ou sai */
  const runRef = useRef(0)
  /** start() que ainda é o dono do estado (0 = nenhum): evita que um start cancelado volte a fase de um start novo */
  const liveRunRef = useRef(0)
  const finishingRef = useRef(false)
  const onLimitRef = useRef(opts.onLimit)
  useEffect(() => { onLimitRef.current = opts.onLimit }, [opts.onLimit])

  const meter = useMemo<LevelMeter>(() => ({
    subscribe: fn => {
      listenersRef.current.add(fn)
      return () => { listenersRef.current.delete(fn) }
    },
  }), [])

  /** Solta tudo: temporizadores, medidor e o microfone (a luz de gravação do aparelho apaga). */
  const release = useCallback(() => {
    if (limitRef.current) clearTimeout(limitRef.current)
    if (meterTimerRef.current) clearInterval(meterTimerRef.current)
    limitRef.current = null
    meterTimerRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    ctxRef.current?.close().catch(() => { /* já fechado */ })
    ctxRef.current = null
    recRef.current = null
    chunksRef.current = []
    finishingRef.current = false
    liveRunRef.current = 0
    setPhase('idle')
    setStartedAt(null)
  }, [])

  // sair da conversa (ou da tela) no meio da gravação solta o microfone
  useEffect(() => () => {
    runRef.current++
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') { rec.onstop = null; try { rec.stop() } catch { /* já parou */ } }
    release()
  }, [release])

  const start = useCallback(async () => {
    if (phase !== 'idle') return
    setError('')
    if (!canRecordAudio()) {
      setError('Este navegador não consegue gravar áudio.')
      return
    }
    const run = ++runRef.current
    liveRunRef.current = run
    setPhase('starting')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (e) {
      if (run !== runRef.current) { if (liveRunRef.current === 0) setPhase('idle'); return }
      liveRunRef.current = 0
      setPhase('idle')
      setError(micErrorMessage(e))
      return
    }
    // cancelou enquanto o navegador perguntava pelo microfone
    if (run !== runRef.current) {
      stream.getTracks().forEach(t => t.stop())
      // sem start novo em andamento, o gravador não pode ficar preso em 'starting'
      if (liveRunRef.current === 0) setPhase('idle')
      return
    }
    streamRef.current = stream
    try {
      const picked = pickAudioMime(m => MediaRecorder.isTypeSupported(m))
      const rec = new MediaRecorder(stream, { ...(picked ? { mimeType: picked } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND })
      const mime = baseMime(rec.mimeType || picked || '')
      if (!isAllowedMime(mime)) throw new Error('mime')
      mimeRef.current = mime
      maxMsRef.current = maxAudioMsForMime(mime)
      setMaxMs(maxMsRef.current)
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.start()
      recRef.current = rec
      perfStartRef.current = performance.now()
      setStartedAt(Date.now())
      setPhase('recording')

      // parada automática no limite do formato (5 minutos; 90 s em audio/mp4)
      limitRef.current = setTimeout(() => onLimitRef.current(), maxMsRef.current)

      // nível do microfone (AnalyserNode); se o navegador não deixar medir, a gravação segue sem as barras
      try {
        const ctx = new AudioContext()
        ctxRef.current = ctx
        void ctx.resume().catch(() => undefined)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Uint8Array(analyser.fftSize)
        meterTimerRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (const v of buf) { const d = (v - 128) / 128; sum += d * d }
          const level = Math.min(1, Math.sqrt(sum / buf.length) * 3)
          listenersRef.current.forEach(fn => fn(level))
        }, METER_MS)
      } catch { /* sem medidor */ }
    } catch {
      release()
      setError('Não foi possível gravar áudio neste navegador.')
    }
  }, [phase, release])

  /** Para e devolve o áudio. Menos de 1 s é descartado. Sempre solta o microfone. */
  const finish = useCallback((): Promise<TeamFinish> => new Promise(resolve => {
    // segundo toque em "enviar" com o primeiro ainda parando: ignora (soltar agora esvaziaria a gravação)
    if (finishingRef.current) { resolve({ ok: false, message: '' }); return }
    const rec = recRef.current
    if (!rec || rec.state === 'inactive') { release(); resolve({ ok: false, message: '' }); return }
    finishingRef.current = true
    const durationMs = Math.min(maxMsRef.current, Math.round(performance.now() - perfStartRef.current))
    const mime = mimeRef.current
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime })
      release()
      if (durationMs < MIN_AUDIO_MS) { resolve({ ok: false, message: 'Gravação curta demais. Grave pelo menos 1 segundo.' }); return }
      if (blob.size === 0) { resolve({ ok: false, message: 'A gravação saiu vazia. Tente de novo.' }); return }
      if (blob.size > MAX_FILE_BYTES) { resolve({ ok: false, message: 'O áudio ficou grande demais. Grave um mais curto.' }); return }
      resolve({ ok: true, rec: { blob, mime, durationMs } })
    }
    try { rec.stop() } catch { release(); resolve({ ok: false, message: 'Não foi possível concluir a gravação.' }) }
  }), [release])

  const cancel = useCallback(() => {
    runRef.current++
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') { rec.onstop = null; try { rec.stop() } catch { /* já parou */ } }
    release()
  }, [release])

  return { phase, startedAt, error, maxMs, meter, start, finish, cancel }
}
