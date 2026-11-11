// Data de agendamento que vem do n8n/bot → ISO (UTC). Função pura, usada por sync-leads.ts.

// Horário de Brasília (UTC-3, sem horário de verão desde 2019).
// A clínica e o bot operam nesse fuso; ancoramos a data explicitamente
// para não depender do fuso do navegador de quem dispara o sync.
const BRT_OFFSET = '-03:00'

// Sem hora ("AAAA-MM-DD"), o agendamento cai às 9h de Brasília (mesmo padrão do formato DD/MM/AAAA).
const DEFAULT_HOUR = '9'

// "AAAA-MM-DD", "AAAA-MM-DD HH:mm", "AAAA-MM-DDTH:mm:ss" (hora de 1 ou 2 dígitos, sem fuso).
const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/

export function parseN8nDate(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // Já vem com fuso/ISO explícito (ex.: timestamptz do banco) → confia.
  const iso = new Date(raw)
  if (!isNaN(iso.getTime()) && /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return iso.toISOString()
  }
  // DD/MM/YYYY HH:mm or DD/MM/YYYY — interpreta como horário de Brasília
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const yyyy = m[3]
    const mm = m[2].padStart(2, '0')
    const dd = m[1].padStart(2, '0')
    const hh = (m[4] ?? DEFAULT_HOUR).padStart(2, '0')
    const min = (m[5] ?? '0').padStart(2, '0')
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00${BRT_OFFSET}`)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  // AAAA-MM-DD (com ou sem hora, hora de 1 dígito aceita) sem fuso: Brasília.
  // Sem este ramo, "2026-11-15" viraria 00:00 UTC = 21h do dia 14 em Brasília.
  const l = trimmed.match(ISO_LOCAL)
  if (l) {
    const hh = (l[4] ?? DEFAULT_HOUR).padStart(2, '0')
    const d = new Date(`${l[1]}-${l[2]}-${l[3]}T${hh}:${l[5] ?? '00'}:${l[6] ?? '00'}${BRT_OFFSET}`)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  // Fallback: data sem fuso explícito — assume Brasília.
  if (!isNaN(iso.getTime())) {
    const d = new Date(`${trimmed.replace(' ', 'T')}${BRT_OFFSET}`)
    return isNaN(d.getTime()) ? iso.toISOString() : d.toISOString()
  }
  return null
}
