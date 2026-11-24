const ASAAS_PROD_BASE = 'https://api.asaas.com/v3'
const ASAAS_SANDBOX_BASE = 'https://api-sandbox.asaas.com/v3'

/** ASAAS_ENV=sandbox aponta para o sandbox do Asaas; qualquer outro valor (ou ausente) é produção. */
export function asaasBaseUrl(env: string | undefined = process.env.ASAAS_ENV): string {
  return env?.trim().toLowerCase() === 'sandbox' ? ASAAS_SANDBOX_BASE : ASAAS_PROD_BASE
}

function headers() {
  return {
    'Content-Type': 'application/json',
    access_token: process.env.ASAAS_API_KEY!,
  }
}

export async function asaasPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${asaasBaseUrl()}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Asaas POST ${path} [${res.status}]: ${text}`)
  }
  return res.json()
}

export async function asaasGet<T>(path: string): Promise<T> {
  const res = await fetch(`${asaasBaseUrl()}${path}`, { headers: headers() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Asaas GET ${path} [${res.status}]: ${text}`)
  }
  return res.json()
}

export async function asaasPut<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${asaasBaseUrl()}${path}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Asaas PUT ${path} [${res.status}]: ${text}`)
  }
  return res.json()
}

export async function asaasDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${asaasBaseUrl()}${path}`, { method: 'DELETE', headers: headers() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Asaas DELETE ${path} [${res.status}]: ${text}`)
  }
  return res.json()
}

/**
 * Próxima data (YYYY-MM-DD) em que o dia-do-mês `day` ocorre a partir de
 * `from` — usa este mês se o dia ainda não passou, senão o mês seguinte.
 * Evita o bug de sempre pular um mês inteiro mesmo quando o dia ainda não
 * chegou no mês corrente.
 */
export function nextOccurrenceOfDay(day: number, from: Date = new Date()): string {
  const candidateThisMonth = new Date(from.getFullYear(), from.getMonth(), day)
  const target = candidateThisMonth.getDate() === day && candidateThisMonth >= startOfDay(from)
    ? candidateThisMonth
    : new Date(from.getFullYear(), from.getMonth() + 1, day)
  return toISODate(target)
}

/** Dias de calendário entre hoje e a próxima ocorrência do dia `day` (mínimo 1). */
export function daysUntilNextOccurrence(day: number, from: Date = new Date()): number {
  const target = new Date(nextOccurrenceOfDay(day, from) + 'T00:00:00')
  const diffDays = Math.round((target.getTime() - startOfDay(from).getTime()) / 86_400_000)
  return Math.max(diffDays, 1)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Cliente mínimo da API do Asaas. Os fluxos de contrato recebem isto por parâmetro para os testes usarem um mock. */
export interface AsaasApi {
  post<T>(path: string, body: object): Promise<T>
  get<T>(path: string): Promise<T>
  put<T>(path: string, body: object): Promise<T>
}

/** AsaasApi + DELETE (cancelar assinatura). Separado para não obrigar os mocks dos fluxos de contrato a implementar delete. */
export interface AsaasApiWithDelete extends AsaasApi {
  delete<T>(path: string): Promise<T>
}

export const realAsaas: AsaasApiWithDelete = { post: asaasPost, get: asaasGet, put: asaasPut, delete: asaasDelete }
