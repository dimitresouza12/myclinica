'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_VOICE_SECONDS } from '@/lib/whatsapp/media'

const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export interface Recording { blob: Blob; seconds: number }

/** Grava mensagem de voz pelo microfone do aparelho (WebM no Chrome, MP4 no Safari). */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recRef.current = null
    setRecording(false)
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
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
      release()
      resolve(blob.size > 0 ? { blob, seconds: elapsed } : null)
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
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.start()
      recRef.current = rec
      startedRef.current = Date.now()
      setSeconds(0)
      setRecording(true)
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

  return { recording, seconds, error, start, finish, cancel }
}
