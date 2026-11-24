// Áudio de uma mensagem recebida, em base64, para o n8n transcrever (GET /api/automacao/midia). Só no servidor.
//
// Busca pela MESMA via que o app usa para mídia recebida (media-store.downloadMessageMedia): a mensagem inteira
// guardada em whatsapp_media_source vai para a Evolution (getBase64FromMediaMessage). Nada é gravado em disco nem
// no storage; o conteúdo só passa pela memória desta requisição e nunca vai para log.
//
// Só devolve se a mensagem: é desta clínica, é de ENTRADA (do contato), é áudio, não foi apagada e tem até 3 MB.
// `mensagemId` é o id do provedor (key.id da Evolution), o mesmo que vai no repasse do áudio ao n8n.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { fetchMediaBase64, instanceNameFor, EvolutionError } from '@/lib/whatsapp/evolution'
import { baseMime } from '@/lib/whatsapp/media'

export const MIDIA_MAX_BYTES = 3 * 1024 * 1024
const MENSAGEM_ID_RE = /^[A-Za-z0-9_.:\-]{1,200}$/

export class MidiaError extends Error {
  constructor(message: string, public status: number, public codigo: string) { super(message) }
}

export const isMensagemId = (v: unknown): v is string => typeof v === 'string' && MENSAGEM_ID_RE.test(v)

export interface MidiaAudio { mensagemId: string; mimetype: string; tamanhoBytes: number; base64: string }

interface MsgRow {
  id: string
  kind: string
  direction: string
  deleted_at: string | null
  media_size: number | null
  media_mime: string | null
}

/** Tamanho dos bytes que o base64 representa, sem decodificar. */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - pad
}

export async function buscarAudio(clinicId: string, mensagemId: string): Promise<MidiaAudio> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('whatsapp_messages')
    .select('id, kind, direction, deleted_at, media_size, media_mime')
    .eq('clinic_id', clinicId)
    .eq('provider_message_id', mensagemId)
    .eq('direction', 'in')
    .limit(1)
  if (error) throw new MidiaError('Erro ao ler a mensagem.', 500, 'erro_leitura')
  const msg = ((data ?? []) as MsgRow[])[0]
  // outra clínica, mensagem nossa ou id inexistente: tudo "não encontrada", sem revelar qual
  if (!msg || msg.deleted_at) throw new MidiaError('Mensagem não encontrada.', 404, 'nao_encontrada')
  if (msg.kind !== 'audio') throw new MidiaError('A mensagem não é um áudio.', 422, 'nao_e_audio')
  if (msg.media_size != null && msg.media_size > MIDIA_MAX_BYTES) throw new MidiaError('Áudio maior que 3 MB.', 413, 'muito_grande')

  const { data: source, error: srcErr } = await admin.from('whatsapp_media_source').select('raw').eq('message_id', msg.id).maybeSingle()
  if (srcErr) throw new MidiaError('Erro ao ler a mensagem.', 500, 'erro_leitura')
  if (!source) throw new MidiaError('O áudio não está mais disponível.', 404, 'midia_indisponivel')

  let file
  try {
    file = await fetchMediaBase64(instanceNameFor(clinicId), source.raw as { key: unknown; message: unknown })
  } catch (e) {
    if (e instanceof EvolutionError && e.status === 404) throw new MidiaError('O áudio não está mais disponível.', 404, 'midia_indisponivel')
    console.error('[automacao/midia] download falhou:', e instanceof EvolutionError ? `evolution_${e.status}` : 'erro')
    throw new MidiaError('Não foi possível buscar o áudio.', 502, 'whatsapp_instavel')
  }

  const tamanho = base64Bytes(file.base64)
  if (tamanho <= 0) throw new MidiaError('O áudio não está mais disponível.', 404, 'midia_indisponivel')
  if (tamanho > MIDIA_MAX_BYTES) throw new MidiaError('Áudio maior que 3 MB.', 413, 'muito_grande')

  const mimetype = baseMime(file.mimetype) ?? baseMime(msg.media_mime) ?? 'audio/ogg'
  if (!mimetype.startsWith('audio/')) throw new MidiaError('A mensagem não é um áudio.', 422, 'nao_e_audio')
  return { mensagemId, mimetype, tamanhoBytes: tamanho, base64: file.base64 }
}
