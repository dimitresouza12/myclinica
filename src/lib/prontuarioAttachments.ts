// Anexos da evolução do prontuário (bucket `pacientes`, pasta `evolucao/`):
// que tipos de arquivo aceitamos, limites de tamanho, validação no cliente e
// como descobrir o tipo de um anexo já salvo (só temos o path em
// record_entries.photo_urls — sem coluna de tipo). Funções puras, sem rede.

export type AttachmentKind = 'image' | 'pdf' | 'audio' | 'video'

const MB = 1024 * 1024

// O bucket `pacientes` não tem limite próprio nem lista de tipos (consultado
// no banco); o teto real é o limite global de upload do Supabase (50 MB por
// padrão), então o vídeo fica abaixo disso com folga.
export const ATTACHMENT_MAX_BYTES: Record<AttachmentKind, number> = {
  image: 15 * MB,
  pdf: 20 * MB,
  audio: 25 * MB,
  video: 40 * MB,
}

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  image: 'Imagem',
  pdf: 'PDF',
  audio: 'Áudio',
  video: 'Vídeo',
}

// MIME aceito → tipo. SVG fica de fora de propósito (pode carregar script).
const MIME_KIND: Record<string, AttachmentKind> = {
  'image/jpeg': 'image', 'image/jpg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'image/gif': 'image', 'image/heic': 'image', 'image/heif': 'image', 'image/avif': 'image',
  'application/pdf': 'pdf',
  'audio/mpeg': 'audio', 'audio/mp3': 'audio', 'audio/mp4': 'audio', 'audio/m4a': 'audio',
  'audio/x-m4a': 'audio', 'audio/aac': 'audio', 'audio/wav': 'audio', 'audio/x-wav': 'audio',
  'audio/wave': 'audio', 'audio/ogg': 'audio', 'audio/webm': 'audio', 'audio/opus': 'audio',
  'video/mp4': 'video', 'video/webm': 'video', 'video/quicktime': 'video',
  'video/x-m4v': 'video', 'video/3gpp': 'video', 'video/ogg': 'video',
}

// MIME aceito → extensão em que o arquivo é gravado quando o nome não traz uma
// extensão utilizável (ou ela é ambígua, como .webm de áudio). Cobre TODOS os
// MIME de MIME_KIND — nunca cai em ".bin". 'weba'/'ogv' guardam áudio webm e
// vídeo ogg com a extensão do tipo certo, pra reabrir com o player certo.
const MIME_DEFAULT_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'weba', 'audio/opus': 'opus',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'video/x-m4v': 'm4v', 'video/3gpp': '3gp', 'video/ogg': 'ogv',
}

/** Todos os MIME aceitos (exposto pra testes e telas). */
export const ATTACHMENT_ACCEPTED_MIMES = Object.keys(MIME_KIND)

// Extensão aceita → tipo e MIME canônico (usado quando o navegador não informa
// o MIME, comum em .m4a/.heic, e pra decidir o tipo de anexos já salvos).
// `alsoKinds`: contêineres que existem como áudio E vídeo (.webm, .ogg) — o
// MIME declarado desempata.
const EXT_INFO: Record<string, { kind: AttachmentKind; mime: string; alsoKinds?: AttachmentKind[] }> = {
  jpg: { kind: 'image', mime: 'image/jpeg' }, jpeg: { kind: 'image', mime: 'image/jpeg' },
  png: { kind: 'image', mime: 'image/png' }, webp: { kind: 'image', mime: 'image/webp' },
  gif: { kind: 'image', mime: 'image/gif' }, heic: { kind: 'image', mime: 'image/heic' },
  heif: { kind: 'image', mime: 'image/heif' }, avif: { kind: 'image', mime: 'image/avif' },
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' }, m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' }, wav: { kind: 'audio', mime: 'audio/wav' },
  ogg: { kind: 'audio', mime: 'audio/ogg', alsoKinds: ['video'] }, oga: { kind: 'audio', mime: 'audio/ogg' },
  opus: { kind: 'audio', mime: 'audio/opus' }, weba: { kind: 'audio', mime: 'audio/webm' },
  mp4: { kind: 'video', mime: 'video/mp4' }, m4v: { kind: 'video', mime: 'video/x-m4v' },
  mov: { kind: 'video', mime: 'video/quicktime' }, webm: { kind: 'video', mime: 'video/webm', alsoKinds: ['audio'] },
  ogv: { kind: 'video', mime: 'video/ogg' },
  '3gp': { kind: 'video', mime: 'video/3gpp' },
}

// Valor do atributo `accept` do <input type="file"> — lista explícita (nada de
// image/* aberto) pra o seletor já filtrar o que a validação aceita.
export const ATTACHMENT_ACCEPT = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif',
  'application/pdf',
  'audio/*',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/3gpp', 'video/ogg',
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.avif', '.pdf',
  '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.weba', '.mp4', '.m4v', '.mov', '.webm', '.ogv', '.3gp',
].join(',')

/** "audio/ogg; codecs=opus" → "audio/ogg". Vazio/inválido → ''. */
export function normalizeMime(mime: string | null | undefined): string {
  if (!mime) return ''
  const m = mime.split(';')[0].trim().toLowerCase()
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(m) ? m : ''
}

/** Extensão em minúsculas, sem o ponto — '' se não houver. */
export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const i = base.lastIndexOf('.')
  if (i <= 0 || i === base.length - 1) return ''
  return base.slice(i + 1).toLowerCase()
}

export type AttachmentCheck =
  | { ok: true; kind: AttachmentKind; mime: string; ext: string }
  | { ok: false; reason: string }

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0).replace('.', ',')} MB`
}

/**
 * Valida um arquivo escolhido pelo usuário: tipo permitido (pelo MIME, com a
 * extensão como apoio quando o navegador não informa o MIME), coerência entre
 * MIME e extensão, arquivo vazio e limite de tamanho do tipo.
 */
export function validateAttachment(file: { name: string; type: string; size: number }): AttachmentCheck {
  const mime = normalizeMime(file.type)
  const extRaw = fileExtension(file.name)
  const extInfo = EXT_INFO[extRaw]
  const mimeKind = mime ? MIME_KIND[mime] : undefined
  const genericMime = mime === '' || mime === 'application/octet-stream'

  // Extensão presente no nome mas fora da lista (.exe, .svg, .html...) → recusa,
  // mesmo que o navegador declare um MIME aceito. Só números ("v1.2") não conta
  // como extensão.
  if (extRaw && !extInfo && !/^\d+$/.test(extRaw)) {
    return { ok: false, reason: `extensão .${extRaw.slice(0, 10)} não permitida` }
  }

  let kind: AttachmentKind | undefined
  let finalMime = mime
  if (mimeKind) {
    kind = mimeKind
    // MIME e extensão de tipos diferentes (ex.: .pdf com type image/png) → recusa.
    // .webm/.ogg valem como áudio ou vídeo, conforme o MIME declarado.
    if (extInfo && extInfo.kind !== mimeKind && !extInfo.alsoKinds?.includes(mimeKind)) {
      return { ok: false, reason: 'o tipo do arquivo não confere com a extensão' }
    }
  } else if (genericMime && extInfo) {
    kind = extInfo.kind
    finalMime = extInfo.mime
  }

  if (!kind) return { ok: false, reason: 'tipo não permitido (aceitos: imagem, PDF, áudio e vídeo)' }
  if (file.size <= 0) return { ok: false, reason: 'arquivo vazio' }
  const max = ATTACHMENT_MAX_BYTES[kind]
  if (file.size > max) {
    return { ok: false, reason: `${ATTACHMENT_KIND_LABEL[kind].toLowerCase()} maior que ${Math.round(max / MB)} MB` }
  }
  // Extensão do nome vale quando é do mesmo tipo do arquivo; senão (sem
  // extensão, ou .webm/.ogg do "outro" tipo) usa a padrão do MIME.
  const ext = extInfo && extInfo.kind === kind ? extRaw : MIME_DEFAULT_EXT[finalMime]
  if (!ext) return { ok: false, reason: 'tipo não permitido (aceitos: imagem, PDF, áudio e vídeo)' }
  return { ok: true, kind, mime: finalMime, ext }
}

/** Parte do nome original que vai no path (só [a-z0-9-], até 40 caracteres). */
export function slugifyFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  return stem
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/g, '')
}

/** Path de armazenamento: evolucao/<clinica>/<paciente>/<timestamp>-<rand>[-<nome>].<ext> */
export function buildAttachmentPath(args: {
  clinicId: string; patientId: string; fileName: string; ext: string; now?: number; rand?: string
}): string {
  const now = args.now ?? Date.now()
  const rand = (args.rand ?? Math.random().toString(36).slice(2, 8)).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'x'
  const slug = slugifyFileName(args.fileName)
  const ext = /^[a-z0-9]{1,5}$/.test(args.ext) ? args.ext : 'bin'
  return `evolucao/${args.clinicId}/${args.patientId}/${now}-${rand}${slug ? `-${slug}` : ''}.${ext}`
}

/**
 * Tipo de um anexo já salvo, pelo path/URL. Qualquer coisa sem extensão
 * reconhecida (anexos antigos, URLs com query) é tratada como imagem — era a
 * única coisa que o prontuário aceitava antes.
 */
export function attachmentKindFromPath(pathOrUrl: string): AttachmentKind {
  const clean = pathOrUrl.split(/[?#]/)[0]
  const info = EXT_INFO[fileExtension(clean)]
  return info?.kind ?? 'image'
}

/** Nome legível a partir do path (usa o trecho do nome original quando existe). */
export function attachmentDisplayName(path: string): string {
  const clean = path.split(/[?#]/)[0]
  const base = clean.split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const m = stem.match(/^\d{8,}-[a-z0-9]{1,8}-(.+)$/)
  if (m) return m[1].replace(/-/g, ' ')
  return ''
}
