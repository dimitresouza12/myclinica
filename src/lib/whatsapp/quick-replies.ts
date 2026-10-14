// Respostas rápidas: textos prontos da clínica. Funções puras.

export interface QuickReply { id: string; title: string; body: string }

export const QUICK_TITLE_MAX = 40
export const QUICK_BODY_MAX = 1000

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Primeiro nome do contato, ou null se não houver nome de pessoa (só telefone). */
export function firstName(name: string | null | undefined): string | null {
  const w = (name ?? '').trim().split(/\s+/)[0] ?? ''
  return /^[A-Za-zÀ-ú]/.test(w) ? w : null
}

/** Troca {nome} pelo primeiro nome; sem nome, tira o {nome} e o espaço antes dele ("Olá {nome}," vira "Olá,"). */
export function fillQuickReply(body: string, contactName: string | null | undefined): string {
  const n = firstName(contactName)
  return n ? body.replace(/\{nome\}/gi, n) : body.replace(/\s*\{nome\}/gi, '')
}

/** Filtra pelo que a pessoa digitou depois da "/": título primeiro, depois o texto; sem acento e sem diferenciar maiúscula. */
export function filterQuickReplies(list: QuickReply[], query: string): QuickReply[] {
  const q = fold(query.trim())
  if (!q) return list
  const inTitle = list.filter(r => fold(r.title).includes(q))
  const inBody = list.filter(r => !inTitle.includes(r) && fold(r.body).includes(q))
  return [...inTitle, ...inBody]
}

/** Texto do campo que ainda é um comando de resposta rápida ("/val" → "val"); null se não for. */
export function slashQuery(text: string): string | null {
  return /^\/[^\s/]*$/.test(text) ? text.slice(1) : null
}

export function validateQuickReply(input: { title: string; body: string }): string | null {
  const title = input.title.trim(), body = input.body.trim()
  if (!title) return 'Dê um nome para a resposta.'
  if (title.length > QUICK_TITLE_MAX) return `O nome pode ter até ${QUICK_TITLE_MAX} caracteres.`
  if (!body) return 'Escreva o texto da resposta.'
  if (body.length > QUICK_BODY_MAX) return `O texto pode ter até ${QUICK_BODY_MAX} caracteres.`
  return null
}
