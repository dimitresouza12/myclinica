// Contas de horário do Novo/Editar agendamento. Funções puras, no fuso local do navegador.

/** Compromisso mínimo para calcular ocupação. */
export interface SlotAppt {
  status: string | null
  scheduled_at: string
  duration_minutes?: number | null
  professional_id?: string | null
  patients?: { name?: string | null } | null
  id?: string
}

/** Tamanho de uma casa da grade de horários. */
export const SLOT_MINUTES = 30

const pad = (n: number) => String(n).padStart(2, '0')

/** "AAAA-MM-DD" no fuso local. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Valor de um `datetime-local` ("AAAA-MM-DDTHH:mm") no fuso LOCAL a partir do instante gravado no banco.
 * Cortar o ISO (`slice(0, 16)`) devolve a hora em UTC e desloca a consulta ao editar.
 */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${localDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Bloqueio que vale para a clínica toda (sem profissional): ninguém atende nesse horário. */
export const isClinicBlock = (a: SlotAppt) => a.status === 'bloqueado' && !a.professional_id

/** Ocupa a agenda do profissional escolhido? Consultas dele e bloqueios da clínica toda; sem profissional escolhido, tudo. */
export function blocksProfessional(a: SlotAppt, professionalId: string): boolean {
  if (!professionalId) return true
  return a.professional_id === professionalId || isClinicBlock(a)
}

/**
 * Casa da grade -> quem ocupa, no dia `dateStr` ("AAAA-MM-DD").
 * Cancelados não ocupam; `ignoreId` deixa de fora a consulta que está sendo editada.
 */
export function buildBusyMap(
  appts: SlotAppt[],
  opts: { dateStr: string; professionalId: string; ignoreId?: string | null; slots: string[] },
): Map<string, string> {
  const map = new Map<string, string>()
  if (!opts.dateStr) return map
  for (const a of appts) {
    if (!a.scheduled_at || a.status === 'cancelado') continue
    if (opts.ignoreId && a.id === opts.ignoreId) continue
    if (!blocksProfessional(a, opts.professionalId)) continue
    const start = new Date(a.scheduled_at)
    // compara instantes absolutos: vale também para consulta de outro dia que atravessa a meia-noite
    const startMs = start.getTime()
    const endMs = startMs + (a.duration_minutes ?? 60) * 60000
    for (const slot of opts.slots) {
      const slotMs = new Date(`${opts.dateStr}T${slot}:00`).getTime()
      if (startMs < slotMs + SLOT_MINUTES * 60000 && endMs > slotMs && !map.has(slot)) {
        map.set(slot, a.status === 'bloqueado' ? 'Bloqueado' : (a.patients?.name?.split(' ')[0] ?? 'Ocupado'))
      }
    }
  }
  return map
}

/**
 * Quem atrapalha uma consulta que começa em `slot` e dura `durationMin`?
 * Devolve o nome de quem ocupa a primeira casa dentro do intervalo, ou `undefined` se cabe.
 */
export function conflictInSpan(slot: string, durationMin: number, busy: Map<string, string>, slots: string[]): string | undefined {
  const i = slots.indexOf(slot)
  if (i < 0) return busy.get(slot)
  const n = Math.max(1, Math.ceil((durationMin || SLOT_MINUTES) / SLOT_MINUTES))
  for (let k = 0; k < n; k++) {
    const s = slots[i + k]
    if (s && busy.has(s)) return busy.get(s)
  }
  return undefined
}

/** Duas janelas [aStart, aEnd) e [bStart, bEnd) em milissegundos se sobrepõem? */
export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd

/** Maior duração aceita no formulário (12 h), em ms: dá o recuo seguro para buscar conflitos no banco. */
export const MAX_APPT_MS = 720 * 60000

/**
 * Próximos horários livres de um profissional, a partir de `from`, olhando `days` dias à frente
 * (padrão 14). Só entram casas da grade em que a consulta inteira cabe (duração incluída).
 */
export function nextFreeSlots(
  appts: SlotAppt[],
  opts: {
    professionalId: string; durationMin: number; slots: string[]; from: Date; count: number; days?: number; ignoreId?: string | null
    /** filtro extra por casa (a escala do profissional); sem ele, qualquer casa livre vale */
    isOpen?: (dateStr: string, slot: string) => boolean
  },
): { date: string; time: string }[] {
  const out: { date: string; time: string }[] = []
  const days = opts.days ?? 14
  const fromMs = opts.from.getTime()
  const windowEnd = fromMs + (days + 1) * 86400000
  // só o que pode tocar a janela: o resto não muda o resultado e encarece a conta
  const near = appts.filter(a => {
    if (!a.scheduled_at || a.status === 'cancelado') return false
    const s = new Date(a.scheduled_at).getTime()
    return s < windowEnd && s + (a.duration_minutes ?? 60) * 60000 > fromMs - 86400000
  })
  for (let d = 0; d < days && out.length < opts.count; d++) {
    const day = new Date(opts.from.getFullYear(), opts.from.getMonth(), opts.from.getDate() + d)
    const dateStr = localDateKey(day)
    const busy = buildBusyMap(near, { dateStr, professionalId: opts.professionalId, ignoreId: opts.ignoreId, slots: opts.slots })
    for (const slot of opts.slots) {
      if (new Date(`${dateStr}T${slot}:00`).getTime() <= fromMs) continue
      if (opts.isOpen && !opts.isOpen(dateStr, slot)) continue
      if (conflictInSpan(slot, opts.durationMin, busy, opts.slots)) continue
      out.push({ date: dateStr, time: slot })
      if (out.length >= opts.count) break
    }
  }
  return out
}
