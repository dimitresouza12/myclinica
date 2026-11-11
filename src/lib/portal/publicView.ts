// Reduz as linhas do banco ao MÍNIMO que a página pública mostra. Cada função devolve só os campos listados:
// nada de observações internas, preços, notas clínicas, telefone, CPF ou ids. Funções puras.

import { catalogoCom, indexarCatalogo, type Alimento } from '@/lib/nutri/alimentos'
import { normalizarPlano } from '@/lib/nutri/plano'
import { hojeBrasil } from '@/lib/brasilDate'

// ── Consultas ───────────────────────────────────────────────────────────────
export interface AppointmentRow { scheduled_at: string; status: string; procedure_name: string | null; professional_name: string | null }
export interface PublicAppointment { whenIso: string; procedure: string | null; professional: string | null; confirmed: boolean }

const UPCOMING_STATUS = new Set(['agendado', 'confirmado'])

export function shapeAppointments(rows: AppointmentRow[], now: Date, limit = 5): PublicAppointment[] {
  return rows
    .filter(r => UPCOMING_STATUS.has(r.status) && new Date(r.scheduled_at).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, limit)
    .map(r => ({ whenIso: r.scheduled_at, procedure: r.procedure_name?.trim() || null, professional: r.professional_name?.trim() || null, confirmed: r.status === 'confirmado' }))
}

// ── Vacinas ─────────────────────────────────────────────────────────────────
export interface VaccineRow {
  kind: string; name: string; batch: string | null; manufacturer: string | null
  applied_on: string; next_due_on: string | null
}
export type DueState = 'atrasada' | 'proxima' | 'em_dia' | null
export interface PublicVaccine {
  kind: string; name: string; batch: string | null; manufacturer: string | null
  appliedOn: string; nextDueOn: string | null; dueState: DueState
}

function dayDiff(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000)
}

/** Próximo reforço: atrasado (data passou), próximo (até 30 dias) ou em dia. Só o reforço mais recente de cada produto conta. */
export function shapeVaccines(rows: VaccineRow[], now: Date = new Date(), limit = 60): PublicVaccine[] {
  const today = hojeBrasil(now)
  const sorted = [...rows].sort((a, b) => b.applied_on.localeCompare(a.applied_on))
  const seen = new Set<string>()
  return sorted.slice(0, limit).map(r => {
    const key = `${r.kind}:${r.name.trim().toLowerCase()}`
    const latest = !seen.has(key)
    seen.add(key)
    let dueState: DueState = null
    if (latest && r.next_due_on) {
      const d = dayDiff(today, r.next_due_on)
      dueState = d < 0 ? 'atrasada' : d <= 30 ? 'proxima' : 'em_dia'
    }
    return { kind: r.kind, name: r.name, batch: r.batch, manufacturer: r.manufacturer, appliedOn: r.applied_on, nextDueOn: r.next_due_on, dueState }
  })
}

// ── Peso ────────────────────────────────────────────────────────────────────
export interface WeightRow { weighed_on: string; weight_kg: number | string }
export interface PublicWeight { date: string; kg: number }

export function shapeWeights(rows: WeightRow[], limit = 24): PublicWeight[] {
  return rows
    .map(r => ({ date: r.weighed_on, kg: Number(r.weight_kg) }))
    .filter(r => Number.isFinite(r.kg) && r.kg > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
}

// ── Plano alimentar ─────────────────────────────────────────────────────────
export interface PublicMeal { name: string; time: string; items: { food: string; grams: number; measure: string | null }[]; note: string | null }
export interface PublicPlan { title: string; meals: PublicMeal[]; notes: string | null }

/**
 * Plano salvo (jsonb) para a visão do paciente: refeições, alimentos e quantidades; sem macros, metas nem dados de avaliação.
 * `taco` é o catálogo da TACO (`carregarTaco()`); sem ele só os alimentos personalizados do plano têm nome.
 */
export function shapePlan(raw: unknown, taco: Alimento[] = []): PublicPlan {
  const plan = normalizarPlano(raw)
  const idx = indexarCatalogo(catalogoCom(plan.personalizados, taco))
  return {
    title: plan.titulo,
    meals: plan.refeicoes.map(r => ({
      name: r.nome,
      time: r.horario,
      items: r.itens.flatMap(i => {
        const food = idx.get(i.alimentoId)
        return food ? [{ food: food.nome, grams: i.gramas, measure: i.medida?.trim() || null }] : []
      }),
      note: r.obs?.trim() || null,
    })),
    notes: plan.observacoes?.trim() || null,
  }
}
