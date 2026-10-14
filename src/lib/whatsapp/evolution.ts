// Cliente da Evolution API (servidor do MyClinica, projeto EasyPanel clinica_unificada).
// SÓ roda no servidor: a chave global da Evolution dá acesso ao WhatsApp de TODAS as
// clínicas conectadas e nunca pode chegar ao navegador nem ao repositório.
//
// Variáveis de ambiente (EasyPanel do app + .env.local em desenvolvimento):
//   EVOLUTION_API_URL   ex.: https://clinica-unificada-evolution-api.rabewg.easypanel.host
//   EVOLUTION_API_KEY   AUTHENTICATION_API_KEY da Evolution do MyClinica

export type EvolutionState = 'open' | 'connecting' | 'close'

export class EvolutionError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'EvolutionError'
  }
}

const TIMEOUT_MS = 15_000

function config() {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, '')
  const key = process.env.EVOLUTION_API_KEY
  if (!url || !key) throw new EvolutionError('Evolution não configurada no servidor', 503)
  return { url, key }
}

async function evo<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const { url, key } = config()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? TIMEOUT_MS)
  try {
    const res = await fetch(`${url}${path}`, {
      method: init.method ?? 'GET',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      cache: 'no-store',
    })
    const text = await res.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { /* resposta não-JSON */ }
    if (!res.ok) {
      const msg = (data as { response?: { message?: unknown }; message?: unknown } | null)
      const detail = msg?.response?.message ?? msg?.message
      throw new EvolutionError(typeof detail === 'string' ? detail : `Evolution respondeu ${res.status}`, res.status)
    }
    return data as T
  } catch (e) {
    if (e instanceof EvolutionError) throw e
    if (e instanceof Error && e.name === 'AbortError') throw new EvolutionError('A Evolution demorou demais para responder', 504)
    throw new EvolutionError('Não foi possível falar com a Evolution', 502)
  } finally {
    clearTimeout(timer)
  }
}

/** Nome da instância na Evolution: um por clínica, derivado do id (sem hífens). */
export function instanceNameFor(clinicId: string): string {
  return `mc_${clinicId.replace(/-/g, '')}`
}

export interface QrResult { qr: string | null; pairingCode: string | null }

function toDataUrl(b64: string | undefined | null): string | null {
  if (!b64) return null
  return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`
}

/** Cria a instância já com as opções mínimas: ignora grupos, não baixa histórico. */
export async function createInstance(instanceName: string): Promise<QrResult> {
  const r = await evo<{ qrcode?: { base64?: string; pairingCode?: string | null } }>('/instance/create', {
    method: 'POST',
    body: {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      groupsIgnore: true,
      syncFullHistory: false,
      readMessages: false,
      readStatus: false,
      alwaysOnline: false,
      rejectCall: false,
    },
  })
  return { qr: toDataUrl(r.qrcode?.base64), pairingCode: r.qrcode?.pairingCode ?? null }
}

/** Pede um QR novo para uma instância que já existe. */
export async function connectInstance(instanceName: string): Promise<QrResult> {
  const r = await evo<{ base64?: string; pairingCode?: string | null }>(`/instance/connect/${encodeURIComponent(instanceName)}`)
  return { qr: toDataUrl(r.base64), pairingCode: r.pairingCode ?? null }
}

/** Estado da conexão; null se a instância não existe na Evolution. */
export async function connectionState(instanceName: string): Promise<EvolutionState | null> {
  try {
    const r = await evo<{ instance?: { state?: string } }>(`/instance/connectionState/${encodeURIComponent(instanceName)}`)
    const s = r.instance?.state
    return s === 'open' || s === 'connecting' || s === 'close' ? s : 'close'
  } catch (e) {
    if (e instanceof EvolutionError && e.status === 404) return null
    throw e
  }
}

/** Número (só dígitos) do WhatsApp conectado, ou null. */
export async function connectedNumber(instanceName: string): Promise<string | null> {
  const r = await evo<Array<{ name?: string; ownerJid?: string | null; number?: string | null }>>(
    `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
  )
  const inst = Array.isArray(r) ? r.find(i => i.name === instanceName) : null
  const raw = inst?.number ?? inst?.ownerJid?.split('@')[0] ?? null
  const digits = raw ? raw.replace(/\D/g, '') : ''
  return digits || null
}

/** Desconecta do WhatsApp e apaga a instância. Instância inexistente não é erro. */
export async function removeInstance(instanceName: string): Promise<void> {
  const name = encodeURIComponent(instanceName)
  for (const [method, path] of [['DELETE', `/instance/logout/${name}`], ['DELETE', `/instance/delete/${name}`]] as const) {
    try {
      await evo(path, { method })
    } catch (e) {
      // logout falha quando já está desconectado; delete falha se já não existe
      if (!(e instanceof EvolutionError) || (e.status !== 404 && e.status !== 400)) throw e
    }
  }
}

export interface NumberCheck { number: string; exists: boolean; jid: string | null }

/** Pergunta ao WhatsApp quais números existem (resolve o nono dígito). */
export async function checkNumbers(instanceName: string, numbers: string[]): Promise<NumberCheck[]> {
  const r = await evo<Array<{ number?: string; exists?: boolean; jid?: string }>>(
    `/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
    { method: 'POST', body: { numbers } },
  )
  return (Array.isArray(r) ? r : []).map(x => ({
    number: String(x.number ?? ''),
    exists: !!x.exists,
    jid: x.jid ?? null,
  }))
}

/**
 * Foto de perfil do contato (URL da CDN do WhatsApp, que expira). null quando o contato não tem foto
 * ou a esconde nas configurações de privacidade. `number` é o telefone com DDI ou o jid completo.
 */
export async function fetchProfilePicture(instanceName: string, number: string): Promise<string | null> {
  const r = await evo<{ profilePictureUrl?: string | null } | null>(
    `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
    { method: 'POST', body: { number } },
  )
  const url = r?.profilePictureUrl
  return typeof url === 'string' && url.startsWith('https://') ? url : null
}

export interface SendResult { messageId: string | null }

export async function sendText(instanceName: string, to: string, text: string): Promise<SendResult> {
  const r = await evo<{ key?: { id?: string } }>(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: { number: to, text },
  })
  return { messageId: r.key?.id ?? null }
}

const MEDIA_TIMEOUT_MS = 60_000

export interface DownloadedMedia { base64: string; mimetype: string | null; fileName: string | null }

/**
 * Baixa o arquivo de uma mensagem recebida. Passa a mensagem inteira (com a chave do arquivo) para a Evolution
 * não precisar achá-la no banco dela. Devolve o arquivo em base64, sem prefixo.
 */
export async function fetchMediaBase64(instanceName: string, message: { key: unknown; message: unknown }): Promise<DownloadedMedia> {
  const r = await evo<{ base64?: string; mimetype?: string; fileName?: string } | null>(
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
    { method: 'POST', body: { message, convertToMp4: false }, timeoutMs: MEDIA_TIMEOUT_MS },
  )
  const raw = r?.base64
  if (!raw) throw new EvolutionError('A Evolution não devolveu o arquivo', 404)
  return {
    base64: raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw,
    mimetype: r?.mimetype ?? null,
    fileName: r?.fileName ?? null,
  }
}

/** Envia imagem ou documento (arquivo em base64, sem prefixo). */
export async function sendMedia(instanceName: string, to: string, m: {
  mediatype: 'image' | 'document'; mimetype: string; fileName: string; base64: string; caption?: string
}): Promise<SendResult> {
  const r = await evo<{ key?: { id?: string } }>(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: { number: to, mediatype: m.mediatype, mimetype: m.mimetype, fileName: m.fileName, media: m.base64, caption: m.caption ?? '' },
    timeoutMs: MEDIA_TIMEOUT_MS,
  })
  return { messageId: r.key?.id ?? null }
}

/** Envia mensagem de voz (a Evolution converte para o formato do WhatsApp). Áudio em base64, sem prefixo. */
export async function sendVoice(instanceName: string, to: string, base64: string): Promise<SendResult> {
  const r = await evo<{ key?: { id?: string } }>(`/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: { number: to, audio: base64, encoding: true },
    timeoutMs: MEDIA_TIMEOUT_MS,
  })
  return { messageId: r.key?.id ?? null }
}

/** Apaga para todos uma mensagem que a clínica enviou. */
export async function deleteForEveryone(instanceName: string, m: { id: string; remoteJid: string }): Promise<void> {
  await evo(`/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
    body: { id: m.id, remoteJid: m.remoteJid, fromMe: true },
  })
}

/** Edita o texto de uma mensagem que a clínica enviou (o WhatsApp só deixa nos primeiros 15 minutos). */
export async function editText(instanceName: string, m: { id: string; remoteJid: string; text: string }): Promise<void> {
  await evo(`/chat/updateMessage/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: { number: m.remoteJid.split('@')[0], key: { remoteJid: m.remoteJid, fromMe: true, id: m.id }, text: m.text },
  })
}

/** Aponta os eventos da instância para o webhook do MyClinica (com token no cabeçalho). */
export async function setWebhook(instanceName: string, url: string, token: string): Promise<void> {
  await evo(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      webhook: {
        enabled: true,
        url,
        byEvents: false,
        base64: false,
        headers: { 'x-webhook-token': token },
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
      },
    },
  })
}
