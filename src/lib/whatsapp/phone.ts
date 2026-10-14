import { cleanPhone } from '../utils'

// Telefones brasileiros no WhatsApp: o mesmo número aparece com e sem DDI 55,
// e alguns celulares antigos estão registrados SEM o nono dígito mesmo hoje.
// Por isso o envio nunca confia no telefone gravado no cadastro: gera os
// candidatos, pergunta à Evolution qual existe no WhatsApp e guarda o
// identificador (jid) que ela devolver.

/**
 * Dígitos nacionais de UM número escrito de qualquer jeito: sem DDI 55, sem o zero de tronco que algumas
 * pessoas digitam ("085 99999-8888"), e com o nono dígito injetado em celular antigo (regra do cleanPhone).
 * Não valida: quem chama confere com isValidBrPhone.
 */
function nationalDigits(raw: string): string {
  const body = raw.includes('@') ? raw.split('@')[0] : raw
  const digits = body.replace(/\D/g, '')
  // 0800, 0300, 0500, 0900 são serviços, não telefones de pessoa: sem isso virariam um "fixo" de DDD 80, 30…
  if (/^0[3589]00/.test(digits)) return ''
  // DDD nunca começa com 0, então o zero na frente é sempre prefixo de ligação
  return cleanPhone(digits.replace(/^0+/, ''))
}

/** Um campo de telefone pode trazer vários números ("(85) 99999-8888 / (85) 3222-1111"). */
function splitNumbers(raw: string): string[] {
  return raw.split(/[\/;,|\n]| ou | e /i).map(p => p.trim()).filter(Boolean)
}

/**
 * Telefone nacional canônico (DDD + número) ou '' se não parecer telefone BR.
 * Se o campo tiver mais de um número, vale o primeiro celular (é o que tem WhatsApp); na falta, o primeiro válido.
 */
export function normalizeBrPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const text = String(raw)
  const valid = splitNumbers(text).map(nationalDigits).filter(isValidBrPhone)
  if (valid.length > 0) return valid.find(v => v.length === 11) ?? valid[0]
  // pontuação estranha pode ter partido um número válido ao meio ("85.99999,8888"): tenta o texto inteiro
  const whole = nationalDigits(text)
  return isValidBrPhone(whole) ? whole : ''
}

/**
 * DDD válido (11–99); celular de 11 dígitos com o 9 na frente; fixo de 10 dígitos começando em 2 a 5.
 * (Celular de 10 dígitos começando em 6 a 9 é o antigo sem o 9: o cleanPhone já injeta o 9 antes de chegar aqui.)
 */
export function isValidBrPhone(d: string): boolean {
  if (!/^\d+$/.test(d)) return false
  if (d.length !== 10 && d.length !== 11) return false
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return false
  if (d.length === 11 && d[2] !== '9') return false
  if (d.length === 10 && !/[2-5]/.test(d[2])) return false
  return true
}

/** Cada número brasileiro válido de um texto, no formato nacional (DDD + número), sem repetir. */
export function brPhonesIn(raw: string | null | undefined): string[] {
  if (!raw) return []
  const text = String(raw)
  const out: string[] = []
  for (const part of splitNumbers(text)) {
    const d = nationalDigits(part)
    if (isValidBrPhone(d) && !out.includes(d)) out.push(d)
  }
  if (out.length === 0) {
    const whole = nationalDigits(text)
    if (isValidBrPhone(whole)) out.push(whole)
  }
  return out
}

/**
 * Candidatos a consultar no WhatsApp, em ordem de preferência, já com o 55.
 * Celular: com o 9 primeiro, depois sem o 9 (conta antiga). Fixo: um só.
 */
export function whatsappCandidates(raw: string | null | undefined): string[] {
  const d = normalizeBrPhone(raw)
  if (!d) return []
  const withDdi = (n: string) => `55${n}`
  if (d.length === 11) {
    const semNove = d.slice(0, 2) + d.slice(3)
    return [withDdi(d), withDdi(semNove)]
  }
  return [withDdi(d)]
}

/**
 * Chave de comparação que ignora DDI e nono dígito: DDD + últimos 8 dígitos.
 * "5585999998888", "85999998888", "(85) 9999-8888" e "558599998888" → "8599998888".
 * Serve para casar a resposta que chegou com a confirmação enviada.
 */
export function phoneKey(raw: string | null | undefined): string {
  const d = normalizeBrPhone(raw)
  return d ? d.slice(0, 2) + d.slice(-8) : ''
}

/** Todas as chaves de um campo que pode ter vários números. Vazio se nenhum for telefone brasileiro. */
export function phoneKeys(raw: string | null | undefined): string[] {
  if (!raw) return []
  const text = String(raw)
  const keys = new Set<string>()
  for (const part of splitNumbers(text)) {
    const d = nationalDigits(part)
    if (isValidBrPhone(d)) keys.add(d.slice(0, 2) + d.slice(-8))
  }
  if (keys.size === 0) { const k = phoneKey(text); if (k) keys.add(k) }
  return [...keys]
}

/** O identificador do WhatsApp usa um id interno (@lid), sem telefone dentro. */
export function isLidJid(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith('@lid')
}

/** Grupos e transmissões nunca são resposta de paciente. */
export function isIndividualJid(jid: string | null | undefined): boolean {
  if (!jid) return false
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')
}

/**
 * "5585999998888@s.whatsapp.net" → chave de telefone ('' se for @lid, grupo ou número de outro país).
 * O jid SEMPRE traz o código do país: só o 55 é Brasil. Sem essa conferência, um fixo da Espanha
 * ("34912345678") seria lido como o DDD 34 de Minas Gerais e viraria o mesmo contato de um brasileiro.
 */
export function phoneKeyFromJid(jid: string | null | undefined): string {
  if (!jid || isLidJid(jid) || !isIndividualJid(jid)) return ''
  const digits = jid.split('@')[0].replace(/\D/g, '')
  if (!digits.startsWith('55') || (digits.length !== 12 && digits.length !== 13)) return ''
  return phoneKey(digits)
}
