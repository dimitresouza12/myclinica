// Resumo por paciente para a lista de Pacientes: última e próxima consulta, procedimento principal e "sem retorno".
// Funções puras sobre as consultas que a tela já busca, para testar sem banco.

/** Mesmo prazo do alerta "sem retorno" do Dashboard. */
export const NO_RETURN_DAYS = 45

interface Appt { patient_id: string | null; status: string; scheduled_at: string; procedure_name: string | null }

export interface PatientSummary {
  lastAt: string | null
  nextAt: string | null
  /** procedimento mais feito nas consultas concluídas; no empate, o mais recente */
  mainProcedure: string | null
  noReturn: boolean
}

export function summarizePatients(appts: Appt[], now: Date): Map<string, PatientSummary> {
  const out = new Map<string, PatientSummary>()
  const counts = new Map<string, Map<string, { n: number; at: string }>>()
  const nowMs = now.getTime()

  for (const a of appts) {
    if (!a.patient_id || a.status === 'cancelado' || a.status === 'bloqueado') continue
    const cur = out.get(a.patient_id) ?? { lastAt: null, nextAt: null, mainProcedure: null, noReturn: false }
    out.set(a.patient_id, cur)
    const when = new Date(a.scheduled_at).getTime()

    if (a.status === 'concluido' && when <= nowMs) {
      if (!cur.lastAt || a.scheduled_at > cur.lastAt) cur.lastAt = a.scheduled_at
      if (a.procedure_name) {
        const m = counts.get(a.patient_id) ?? new Map()
        counts.set(a.patient_id, m)
        const c = m.get(a.procedure_name) ?? { n: 0, at: a.scheduled_at }
        c.n++
        if (a.scheduled_at > c.at) c.at = a.scheduled_at
        m.set(a.procedure_name, c)
      }
    } else if ((a.status === 'agendado' || a.status === 'confirmado') && when >= nowMs) {
      if (!cur.nextAt || a.scheduled_at < cur.nextAt) cur.nextAt = a.scheduled_at
    }
  }

  for (const [id, s] of out) {
    const m = counts.get(id)
    if (m) {
      s.mainProcedure = [...m.entries()].sort((x, y) => y[1].n - x[1].n || y[1].at.localeCompare(x[1].at))[0][0]
    }
    s.noReturn = !!s.lastAt && !s.nextAt && nowMs - new Date(s.lastAt).getTime() >= NO_RETURN_DAYS * 86400000
  }
  return out
}

export type PatientFilter = 'todos' | 'agendados' | 'sem_retorno' | 'com_saldo'

export function matchesFilter(id: string, filter: PatientFilter, summary: Map<string, PatientSummary>, credits: Map<string, number>): boolean {
  if (filter === 'agendados') return !!summary.get(id)?.nextAt
  if (filter === 'sem_retorno') return !!summary.get(id)?.noReturn
  if (filter === 'com_saldo') return (credits.get(id) ?? 0) !== 0
  return true
}

export function filterPatients<T extends { id: string }>(patients: T[], filter: PatientFilter, summary: Map<string, PatientSummary>, credits: Map<string, number>): T[] {
  return filter === 'todos' ? patients : patients.filter(p => matchesFilter(p.id, filter, summary, credits))
}

// ── exportação ──────────────────────────────────────────────────────────────

/** CSV com ";" (o Excel em português abre direto), campos entre aspas quando precisam. */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map(r => r.map(cell).join(';')).join('\r\n')
}

const dayBr = (iso: string | null) => (iso ? new Intl.DateTimeFormat('pt-BR').format(new Date(iso)) : '')

export function exportRows(
  patients: { id: string; name: string; phone: string | null; email: string | null; created_at: string }[],
  summary: Map<string, PatientSummary>,
  credits: Map<string, number>,
): string[][] {
  return [
    ['Nome', 'Telefone', 'E-mail', 'Cadastro', 'Última consulta', 'Próxima consulta', 'Saldo de pacote'],
    ...patients.map(p => [
      p.name,
      p.phone ?? '',
      p.email ?? '',
      dayBr(p.created_at),
      dayBr(summary.get(p.id)?.lastAt ?? null),
      dayBr(summary.get(p.id)?.nextAt ?? null),
      (credits.get(p.id) ?? 0).toFixed(2).replace('.', ','),
    ]),
  ]
}
