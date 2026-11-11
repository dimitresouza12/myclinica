// Cadastro repetido de paciente: monta a pergunta para o RPC find_possible_duplicate_patients e
// interpreta a resposta. Funções puras, sem React e sem rede (o hook está em usePossibleDuplicates.ts).
//
// O RPC devolve {id, name, phone_masked, birth_date, match_reason}, com match_reason
// 'cpf' | 'telefone' | 'nome_nascimento'. Só 'cpf' impede o cadastro (a clínica não pode ter dois
// pacientes com o mesmo CPF); telefone e nome + nascimento apenas avisam, porque família divide telefone
// e homônimos existem.

export type DuplicateReason = 'cpf' | 'telefone' | 'nome_nascimento'

export interface DuplicateMatch {
  id: string
  name: string
  phoneMasked: string
  birthDate: string | null
  reason: DuplicateReason
}

export interface DuplicateQuery {
  p_name: string | null
  p_birth: string | null
  p_phone: string | null
  p_cpf: string | null
}

const digitsOf = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** Quantas palavras tem o nome (espaços repetidos não contam). */
function wordCount(name: string): number {
  return name.trim().split(/\s+/).filter(Boolean).length
}

/**
 * O que vale a pena perguntar ao banco: CPF completo (11 números), telefone com 10+ dígitos, ou
 * nome com 2+ palavras junto com a data de nascimento (ISO). Sem nenhum desses, null: não consulta.
 * Só manda a parte que se sustenta: um telefone pela metade não vai no pedido.
 */
export function buildDuplicateQuery(input: {
  name?: string | null
  birthISO?: string | null
  phone?: string | null
  cpf?: string | null
}): DuplicateQuery | null {
  const cpf = digitsOf(input.cpf)
  const phone = digitsOf(input.phone)
  const name = (input.name ?? '').trim().replace(/\s+/g, ' ')
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(input.birthISO ?? '') ? (input.birthISO as string) : null

  const cpfOk = cpf.length === 11
  const phoneOk = phone.length >= 10
  const nameOk = wordCount(name) >= 2 && !!birth
  if (!cpfOk && !phoneOk && !nameOk) return null

  return {
    p_name: nameOk ? name : null,
    p_birth: nameOk ? birth : null,
    p_phone: phoneOk ? phone : null,
    p_cpf: cpfOk ? cpf : null,
  }
}

/** Chave estável de uma pergunta, para o hook saber se mudou. */
export function duplicateQueryKey(q: DuplicateQuery | null): string {
  return q ? `${q.p_cpf ?? ''}|${q.p_phone ?? ''}|${q.p_name ?? ''}|${q.p_birth ?? ''}` : ''
}

const REASONS: readonly string[] = ['cpf', 'telefone', 'nome_nascimento']

/** Resposta do RPC → lista limpa. Linhas sem id/nome ou com motivo desconhecido são descartadas. */
export function parseDuplicateRows(data: unknown): DuplicateMatch[] {
  if (!Array.isArray(data)) return []
  const out: DuplicateMatch[] = []
  const seen = new Set<string>()
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue
    if (typeof r.name !== 'string' || !r.name.trim()) continue
    if (typeof r.match_reason !== 'string' || !REASONS.includes(r.match_reason)) continue
    seen.add(r.id)
    out.push({
      id: r.id,
      name: r.name.trim(),
      phoneMasked: typeof r.phone_masked === 'string' ? r.phone_masked : '',
      birthDate: typeof r.birth_date === 'string' && r.birth_date ? r.birth_date : null,
      reason: r.match_reason as DuplicateReason,
    })
  }
  // CPF primeiro: é o que mais pesa
  const rank: Record<DuplicateReason, number> = { cpf: 0, telefone: 1, nome_nascimento: 2 }
  return out.sort((a, b) => rank[a.reason] - rank[b.reason])
}

/** Algum cadastro tem o mesmo CPF: não dá para cadastrar de novo. */
export function hasCpfConflict(matches: readonly DuplicateMatch[]): boolean {
  return matches.some(m => m.reason === 'cpf')
}

/** Chave do conjunto de cadastros parecidos (para lembrar o "Cadastrar mesmo assim"). */
export function duplicateMatchesKey(matches: readonly DuplicateMatch[]): string {
  return matches.map(m => `${m.id}:${m.reason}`).sort().join(',')
}

export function reasonLabel(reason: DuplicateReason): string {
  if (reason === 'cpf') return 'Mesmo CPF'
  if (reason === 'telefone') return 'Mesmo telefone'
  return 'Mesmo nome e nascimento'
}

export const CPF_DUPLICATE_MESSAGE = 'CPF já cadastrado. Use o cadastro existente.'
export const DUPLICATE_SAVE_MESSAGE = 'Já existe um cadastro parecido. Use o cadastro existente ou toque em "Cadastrar mesmo assim".'

/** Violação de unicidade do Postgres (23505), no formato do erro do Supabase. */
export function isUniqueViolation(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key value|violates unique constraint/i.test(error.message ?? '')
}

/** Mensagem clara para a violação de unicidade ao salvar paciente; null se o erro é de outro tipo. */
export function uniqueViolationMessage(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined): string | null {
  if (!isUniqueViolation(error)) return null
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`
  if (/cpf/i.test(text)) return CPF_DUPLICATE_MESSAGE
  if (/phone|telefone/i.test(text)) return 'Já existe um paciente com este telefone. Use o cadastro existente.'
  return 'Já existe um paciente com estes dados. Use o cadastro existente.'
}
