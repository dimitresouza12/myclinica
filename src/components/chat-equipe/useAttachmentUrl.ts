'use client'
// URL do arquivo de um anexo: gerada SOB DEMANDA (createSignedUrl, 300 s) quando a bolha entra na tela. Fica só em memória
// (estado do componente): nunca em localStorage, IndexedDB nem cache persistente. Ao reabrir a conversa, gera de novo.
// Como o link vale 300 s, guarda-se o instante em que foi gerado: acima de 240 s, quem vai usar o link (tela cheia, play) pede outro.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { supabase } from '@/lib/supabase'
import { SIGNED_URL_SECONDS, TEAM_BUCKET } from '@/lib/teamChat/attachments'

/** Vira true quando o elemento chega perto da tela (e fica true: o link já foi pedido). Sem IntersectionObserver, vale sempre. */
export function useInView(ref: RefObject<Element | null>, rootMargin = '300px'): boolean {
  const [seen, setSeen] = useState(false)
  const unsupported = typeof IntersectionObserver === 'undefined'
  useEffect(() => {
    if (seen || unsupported) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin, seen, unsupported])
  return seen || unsupported
}

export type SignedState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  /** falha de rede ou de permissão: dá para tentar de novo */
  | { status: 'error' }
  /** o arquivo não existe mais no servidor (a limpeza passou): tratado como expirado */
  | { status: 'gone' }

/** Idade (ms) a partir da qual o link é considerado velho demais para usar: 240 s de uma validade de 300 s. */
export const SIGNED_URL_STALE_MS = 240_000

/** O link gerado em `at` já passou de 240 s? Pura, para teste. */
export const isSignedUrlStale = (at: number, now: number): boolean => now - at > SIGNED_URL_STALE_MS

/**
 * Link de um arquivo local (Blob) para <img>/<audio>: criado ao montar e liberado ao desmontar, então some junto com a bolha
 * (mensagem substituída, descartada ou chat fechado) e nunca é revogado enquanto a bolha ainda o usa.
 */
export function useObjectUrl(blob: Blob): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o link de objeto só pode ser criado no navegador, depois de montar
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function useSignedUrl(path: string, enabled: boolean) {
  const [attempt, setAttempt] = useState(0)
  // o resultado vem com a chave do pedido: pedido novo (outro caminho ou "tentar de novo") volta a "carregando" sem setState no efeito
  const key = `${path}|${attempt}`
  const [result, setResult] = useState<{ key: string; state: SignedState } | null>(null)
  /** o link mais recente gerado e quando (só em memória) */
  const genRef = useRef<{ path: string; url: string; at: number } | null>(null)
  /** já houve a nova tentativa automática depois de um erro de carregamento? (uma só; "Tentar de novo" libera outra) */
  const autoRetriedRef = useRef(false)

  useEffect(() => { autoRetriedRef.current = false }, [path])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    supabase.storage.from(TEAM_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return
        if (data?.signedUrl) {
          genRef.current = { path, url: data.signedUrl, at: Date.now() }
          setResult({ key, state: { status: 'ready', url: data.signedUrl } })
        } else setResult({ key, state: { status: /not found|404|does not exist/i.test(error?.message ?? '') ? 'gone' : 'error' } })
      })
      .catch(() => { if (!cancelled) setResult({ key, state: { status: 'error' } }) })
    return () => { cancelled = true }
  }, [path, enabled, key])

  const state: SignedState = !enabled ? { status: 'idle' } : result && result.key === key ? result.state : { status: 'loading' }
  /** gera um link novo (botão "Tentar de novo") */
  const retry = useCallback(() => { autoRetriedRef.current = false; setAttempt(a => a + 1) }, [])
  /**
   * O elemento (img/audio) não conseguiu carregar o link. Na primeira vez (ou se o link já passou de 240 s) gera outro sozinho;
   * se falhar de novo, mostra o erro com "Tentar de novo".
   */
  const fail = useCallback(() => {
    const g = genRef.current
    const stale = !g || isSignedUrlStale(g.at, Date.now())
    if (stale || !autoRetriedRef.current) {
      autoRetriedRef.current = !stale
      setAttempt(a => a + 1)
    } else setResult({ key, state: { status: 'error' } })
  }, [key])
  /**
   * Link utilizável agora, para quem vai usar o arquivo depois de um tempo (abrir a tela cheia, tocar o áudio): devolve o que
   * está em memória se tem até 240 s; senão (ou com `force`) gera outro. Não mexe no estado, então a miniatura/player não recarregam.
   * Sem rede, devolve o link antigo (o chamador tenta assim mesmo).
   */
  const getFresh = useCallback(async (force = false): Promise<string | null> => {
    const g = genRef.current && genRef.current.path === path ? genRef.current : null
    if (g && !force && !isSignedUrlStale(g.at, Date.now())) return g.url
    try {
      const { data } = await supabase.storage.from(TEAM_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
      if (data?.signedUrl) {
        genRef.current = { path, url: data.signedUrl, at: Date.now() }
        return data.signedUrl
      }
    } catch { /* sem rede: cai no link antigo */ }
    return g?.url ?? null
  }, [path])
  return { state, retry, fail, getFresh }
}
