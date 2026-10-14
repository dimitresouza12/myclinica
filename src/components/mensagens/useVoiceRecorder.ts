'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_VOICE_SECONDS, encodeWave } from '@/lib/whatsapp/media'

const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
const SAMPLE_MS = 80
/** quantas barras aparecem ao vivo durante a gravação */
const LIVE_BARS = 36

export interface Recording { blob: Blob; seconds: number; /** onda em base64 (até 64 pontos de 0 a 100) */ wave: string | null }

/** Grava mensagem de voz pelo microfone do aparelho (WebM no Chrome, MP4 no Safari), medindo o volume para desenhar a onda. */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  /** volume recente (0 a 1), para as barras ao vivo */
  const [levels, setLevels] = useState<number[]>([])
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const allLevelsRef = useRef<number[]>([])

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (meterRef.current) clearInterval(meterRef.current)
    timerRef.current = null
    meterRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    ctxRef.current?.close().catch(() => { /* já fechado */ })
    ctxRef.current = null
    recRef.current = null
    setRecording(false)
    setLevels([])
  }, [])

  // fechar a conversa no meio da gravação solta o microfone
  useEffect(() => () => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.onstop = null
    release()
  }, [release])

  const finish = useCallback((): Promise<Recording | null> => new Promise(resolve => {
    const rec = recRef.current
    if (!rec || rec.state === 'inactive') { release(); resolve(null); return }
    const elapsed = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))
    const wave = encodeWave(allLevelsRef.current)
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
      release()
      resolve(blob.size > 0 ? { blob, seconds: elapsed, wave } : null)
    }
    rec.stop()
  }), [release])

  const start = useCallback(async () => {
    setError('')
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador não consegue gravar áudio. Envie o áudio pelo WhatsApp do celular.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = CANDIDATES.find(m => MediaRecorder.isTypeSupported(m))
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      allLevelsRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.start()
      recRef.current = rec
      startedRef.current = Date.now()
      setSeconds(0)
      setRecording(true)

      // volume do microfone: alimenta a onda guardada e as barras ao vivo (se o navegador não deixar medir, a gravação segue sem onda)
      try {
        const ctx = new AudioContext()
        ctxRef.current = ctx
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Uint8Array(analyser.fftSize)
        meterRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (const v of buf) { const d = (v - 128) / 128; sum += d * d }
          const level = Math.min(1, Math.sqrt(sum / buf.length) * 3)
          allLevelsRef.current.push(level)
          setLevels(prev => [...prev, level].slice(-LIVE_BARS))
        }, SAMPLE_MS)
      } catch { /* sem medidor */ }

      timerRef.current = setInterval(() => {
        const s = Math.round((Date.now() - startedRef.current) / 1000)
        setSeconds(s)
        if (s >= MAX_VOICE_SECONDS && recRef.current?.state === 'recording') recRef.current.stop()
      }, 500)
    } catch (e) {
      release()
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'O microfone está bloqueado. Libere o acesso ao microfone nas permissões do navegador.'
        : 'Não foi possível usar o microfone.')
    }
  }, [release])

  const cancel = useCallback(() => {
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') rec.onstop = null
    if (rec && rec.state !== 'inactive') rec.stop()
    release()
  }, [release])

  return { recording, seconds, error, levels, start, finish, cancel }
}
