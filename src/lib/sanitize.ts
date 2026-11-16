// Sanitização de inputs para prevenção de XSS e injeção

// Remove tags HTML e escapa caracteres perigosos
export function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
}

// Remove tudo que não for dígito (CPF, CNPJ, telefone)
export function sanitizeDigits(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\D/g, '')
}

// Valida e normaliza email
export function sanitizeEmail(value: unknown): string {
  if (typeof value !== 'string') return ''
  const email = value.toLowerCase().trim()
  const emailRegex = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/
  return emailRegex.test(email) ? email : ''
}

// Valida UUID para evitar BOLA — sempre filtrar por clinic_id no banco
export function isValidUUID(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

// Sanitiza objeto recursivamente (para dados vindos de formulários)
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as T
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const val = obj[key]
    if (typeof val === 'string') {
      result[key] = sanitizeString(val) as T[keyof T]
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = sanitizeObject(val as Record<string, unknown>) as T[keyof T]
    } else {
      result[key] = val
    }
  }
  return result
}

// Valida tamanho máximo de string para evitar payload excessivo
export function assertMaxLength(value: string, max: number, field: string): void {
  if (value.length > max) {
    throw new Error(`Campo "${field}" excede o tamanho máximo de ${max} caracteres`)
  }
}

// ── HTML rico (editor de documentos) ────────────────────────────────────────
//
// Sanitizador por lista de permissão, sem DOM e sem dependência: tokeniza o HTML e REESCREVE a saída só com o que
// é permitido (tags, atributos e propriedades de estilo conhecidos). Funciona igual no navegador, no SSR e no
// vitest. Como a saída é montada token a token (texto e valores de atributo sempre escapados), o navegador não tem
// o que reinterpretar (sem mXSS por reparse). Tags fora da lista perdem a marcação e mantêm o texto; tags de
// conteúdo ativo (script, style, svg, math, iframe, template...) perdem o conteúdo também.

const RICH_TAGS = new Set([
  'p', 'div', 'span', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'small',
  'mark', 'big', 'center', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li',
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'img', 'a',
])
const VOID_TAGS = new Set(['br', 'hr', 'img', 'col'])
/** Conteúdo cru (o parser do navegador não lê tags lá dentro): some a tag e tudo até o fechamento correspondente. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript'])
/** Conteúdo aninhado perigoso (namespaces estrangeiros, template): some a tag e tudo até o fechamento, contando aninhamento. */
const DROP_NESTED_TAGS = new Set(['svg', 'math', 'template', 'object', 'applet', 'embed', 'audio', 'video', 'canvas', 'select', 'frameset'])

const GLOBAL_ATTRS = new Set(['style', 'title', 'lang', 'dir', 'align'])
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan', 'width', 'height', 'valign']),
  th: new Set(['colspan', 'rowspan', 'width', 'height', 'valign']),
  tr: new Set(['valign']),
  table: new Set(['border', 'cellpadding', 'cellspacing', 'width', 'height']),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span', 'width']),
  ol: new Set(['start', 'type']),
  li: new Set(['value']),
  font: new Set(['color', 'face', 'size']),
}
/** Marcas internas do editor de documentos (bloco de assinatura/emitente trocável, selo de verificação). */
const MARKER_ATTRS = new Set(['data-doc-signature', 'data-doc-emitente', 'data-verif-stamp', 'data-prof'])

const STYLE_PROPS = new Set([
  'color', 'background', 'background-color', 'font', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-decoration', 'text-decoration-line', 'text-decoration-color',
  'text-indent', 'text-transform', 'white-space', 'word-break', 'overflow-wrap', 'vertical-align', 'direction',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-width', 'border-style', 'border-color',
  'border-collapse', 'border-spacing', 'border-radius', 'table-layout', 'caption-side',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'box-sizing',
  'display', 'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-self',
  'justify-content', 'gap', 'row-gap', 'column-gap', 'grid-template-columns', 'grid-template-rows',
  'opacity', 'object-fit', 'list-style', 'list-style-type', 'list-style-position',
  'page-break-inside', 'page-break-before', 'page-break-after', 'break-inside', 'break-before', 'break-after',
])
const CSS_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'calc', 'min', 'max', 'clamp', 'repeat', 'minmax'])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', tab: '\t', newline: '\n', lpar: '(', rpar: ')',
  sol: '/', bsol: '\\', semi: ';', comma: ',', period: '.', equals: '=', num: '#', excl: '!', percnt: '%', plus: '+',
}

/** Decodifica entidades (numéricas e as nomeadas comuns) para validar o VALOR que o navegador enxergaria. */
function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,8}));?/g, (m, dec, hex, name) => {
    if (name) {
      const v = NAMED_ENTITIES[name.toLowerCase()]
      return v === undefined ? m : v
    }
    const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16)
    if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\uFFFD'
    return String.fromCodePoint(cp)
  })
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Texto: preserva entidades bem formadas (&nbsp; &amp; ...), escapa o resto. */
function cleanText(s: string): string {
  return s.replace(/&(?!(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const CTRL_OR_INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/

/** URL de link: http(s), mailto, tel, âncora (#x) ou caminho do próprio site (/x). Nunca javascript:, data:, vbscript:. */
export function safeHref(raw: string): string | null {
  const v = decodeEntities(raw).replace(/[\t\n\r]/g, '').trim()
  if (!v || CTRL_OR_INVISIBLE.test(v)) return null
  if (/^(?:https?:|mailto:|tel:)/i.test(v)) return v
  if (/^#/.test(v)) return v
  if (/^\/(?![/\\])/.test(v)) return v
  return null
}

/**
 * URL de imagem: http(s), data:image/* ou caminho do próprio site (/x). SVG só entra como data: dentro de <img>,
 * onde o navegador não executa script (é o formato do QR de verificação).
 */
export function safeImageSrc(raw: string): string | null {
  const v = decodeEntities(raw).replace(/[\t\n\r]/g, '').trim()
  if (!v || CTRL_OR_INVISIBLE.test(v)) return null
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v
  if (/^data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml)(?:;[a-z0-9=._+-]+)*,/i.test(v)) return v
  if (/^\/(?![/\\])/.test(v)) return v
  return null
}

/** `style=""`: só propriedades conhecidas, valores sem url(), expression(), escapes ou funções fora da lista. */
function cleanStyle(raw: string): string {
  const decoded = decodeEntities(raw)
  if (/[\\<>@]|\/\*/.test(decoded) || CTRL_OR_INVISIBLE.test(decoded.replace(/[\t\n\r]/g, ''))) return ''
  const out: string[] = []
  for (const decl of decoded.split(';')) {
    const i = decl.indexOf(':')
    if (i < 1) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const value = decl.slice(i + 1).trim()
    if (!STYLE_PROPS.has(prop) || !value || value.length > 200) continue
    if (!/^[\w\s#%.,()'"\-+!/*\u00c0-\u024f]*$/.test(value)) continue
    if (/(?:expression|javascript|vbscript|behavior|binding|image-set|url|src|attr|var|env)\s*\(/i.test(value)) continue
    const fns = value.match(/[a-z-]+(?=\s*\()/gi) ?? []
    if (fns.some(f => !CSS_FUNCTIONS.has(f.toLowerCase()))) continue
    out.push(`${prop}:${value}`)
  }
  return out.join(';')
}

const NUM_ATTR = /^\d{1,4}%?$/
const COLOR_ATTR = /^(?:#[0-9a-f]{3,8}|[a-z]{3,20}|(?:rgb|hsl)a?\([\d\s.,%]+\))$/i

function cleanAttr(tag: string, name: string, raw: string): string | null {
  if (MARKER_ATTRS.has(name)) {
    if (name !== 'data-prof') return ''
    const v = decodeEntities(raw)
    return /^[\w-]{0,64}$/.test(v) ? v : null
  }
  const allowed = GLOBAL_ATTRS.has(name) || TAG_ATTRS[tag]?.has(name)
  if (!allowed) return null
  const v = decodeEntities(raw)
  switch (name) {
    case 'style': { const s = cleanStyle(raw); return s || null }
    case 'href': return safeHref(raw)
    case 'src': return safeImageSrc(raw)
    case 'target': return v === '_blank' ? '_blank' : null
    case 'width': case 'height': case 'colspan': case 'rowspan': case 'border': case 'cellpadding': case 'cellspacing':
    case 'span': case 'start': case 'value': case 'size':
      return NUM_ATTR.test(v.trim()) ? v.trim() : null
    case 'color': return COLOR_ATTR.test(v.trim()) ? v.trim() : null
    case 'face': return /^[\w\s,'"-]{1,80}$/.test(v) ? v : null
    case 'align': case 'valign': return /^(?:left|right|center|justify|top|middle|bottom|baseline)$/i.test(v.trim()) ? v.trim().toLowerCase() : null
    case 'dir': return /^(?:ltr|rtl|auto)$/i.test(v.trim()) ? v.trim().toLowerCase() : null
    case 'lang': return /^[a-zA-Z-]{2,12}$/.test(v) ? v : null
    case 'type': return /^[1aAiI]$/.test(v) ? v : null
    case 'title': case 'alt': return v.length <= 500 ? v : null
    default: return null
  }
}

interface ParsedTag { name: string; attrs: [string, string][]; selfClosing: boolean; end: number }

/** Lê uma tag de abertura a partir de `<name`; devolve null se o HTML termina no meio dela. */
function parseOpenTag(html: string, nameStart: number, nameEnd: number): ParsedTag | null {
  const n = html.length
  const attrs: [string, string][] = []
  let i = nameEnd
  let selfClosing = false
  for (;;) {
    while (i < n && /[\s/]/.test(html[i])) { selfClosing = html[i] === '/'; i++ }
    if (i >= n) return null
    if (html[i] === '>') return { name: html.slice(nameStart, nameEnd).toLowerCase(), attrs, selfClosing, end: i + 1 }
    const aStart = i
    while (i < n && !/[\s=>/]/.test(html[i])) i++
    const aName = html.slice(aStart, i).toLowerCase()
    selfClosing = false
    while (i < n && /\s/.test(html[i])) i++
    let value = ''
    if (html[i] === '=') {
      i++
      while (i < n && /\s/.test(html[i])) i++
      const q = html[i]
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, i + 1)
        if (close < 0) return null
        value = html.slice(i + 1, close)
        i = close + 1
      } else {
        const vStart = i
        while (i < n && !/[\s>]/.test(html[i])) i++
        value = html.slice(vStart, i)
      }
    }
    if (aName && !attrs.some(([k]) => k === aName)) attrs.push([aName, value])
  }
}

/** Posição logo após o fechamento `</name>` (ou -1 se não houver). `nested` conta aberturas do mesmo nome. */
function skipElement(html: string, from: number, name: string, nested: boolean): number {
  const re = new RegExp(`<(/?)${name}(?=[\\s/>])`, 'gi')
  re.lastIndex = from
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[1]) { if (--depth === 0) { const gt = html.indexOf('>', re.lastIndex); return gt < 0 ? html.length : gt + 1 } }
    else if (nested) depth++
  }
  return -1
}

/**
 * Sanitiza HTML do editor de documentos (rascunho do localStorage, modelos, corpo e o que vai para impressão).
 * Mantém formatação básica, listas, tabelas, links http(s)/mailto/tel e imagens http(s)/data:image; remove script,
 * handlers on*, javascript:, svg/math/iframe/style e CSS perigoso. A saída é sempre HTML balanceado.
 */
export function sanitizeRichHtml(input: unknown): string {
  if (typeof input !== 'string' || input === '') return ''
  const html = input
  const n = html.length
  const out: string[] = []
  const stack: string[] = []
  let i = 0

  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt < 0) { out.push(cleanText(html.slice(i))); break }
    if (lt > i) out.push(cleanText(html.slice(i, lt)))
    i = lt
    const next = html[i + 1]

    if (next === '!' || next === '?') {
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4)
        if (end < 0) break
        i = end + 3
      } else {
        const gt = html.indexOf('>', i)
        if (gt < 0) break
        i = gt + 1
      }
      continue
    }

    if (next === '/') {
      const m = /^<\/([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(i, i + 40))
      const gt = html.indexOf('>', i)
      if (gt < 0) break
      if (m) {
        const name = m[1].toLowerCase()
        const at = stack.lastIndexOf(name)
        if (at >= 0) { while (stack.length > at) out.push(`</${stack.pop()}>`) }
      }
      i = gt + 1
      continue
    }

    if (next === undefined || !/[a-zA-Z]/.test(next)) { out.push('&lt;'); i++; continue }

    let ne = i + 1
    while (ne < n && /[a-zA-Z0-9:-]/.test(html[ne])) ne++
    const tag = parseOpenTag(html, i + 1, ne)
    if (!tag) break // tag cortada no fim do texto: descarta o resto
    i = tag.end
    const { name } = tag

    if (name === 'plaintext') break
    if (RAW_TEXT_TAGS.has(name) || DROP_NESTED_TAGS.has(name)) {
      if (tag.selfClosing && !RAW_TEXT_TAGS.has(name)) continue
      const after = skipElement(html, i, name, DROP_NESTED_TAGS.has(name))
      if (after < 0) break
      i = after
      continue
    }
    if (!RICH_TAGS.has(name)) continue // desconhecida: perde a marcação, o texto de dentro fica

    const attrs: string[] = []
    let blank = false
    let hasSrc = false
    for (const [k, v] of tag.attrs) {
      const clean = cleanAttr(name, k, v)
      if (clean === null) continue
      if (k === 'target') blank = true
      if (k === 'src') hasSrc = true
      attrs.push(MARKER_ATTRS.has(k) && k !== 'data-prof' ? k : `${k}="${escAttr(clean)}"`)
    }
    if (name === 'a' && blank) attrs.push('rel="noopener noreferrer"')
    if (name === 'img' && !hasSrc) continue // imagem sem origem válida some
    out.push(`<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}>`)
    if (!VOID_TAGS.has(name)) stack.push(name)
  }

  while (stack.length) out.push(`</${stack.pop()}>`)
  return out.join('')
}
