// Sub-especialidade médica da ficha. Casa o texto livre de professionals.specialty
// ("Cardiologista", "Ginecologia e Obstetrícia"...) com as chaves de medicoSpecialties.ts.

import { MEDICO_ANAMNESIS_EXTRA_BY_SPECIALTY } from '@/lib/medicoSpecialties'

export const CLINICO_GERAL = 'Clínico Geral'

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// raiz do nome (sem acento) → chave de medicoSpecialties.ts
const STEMS: [string, string][] = [
  ['cardio', 'Cardiologia'],
  ['pediatr', 'Pediatria'],
  ['psiquiat', 'Psiquiatria'],
  ['ginecolog', 'Ginecologia'],
  ['obstetr', 'Ginecologia'],
  ['ortoped', 'Ortopedia'],
  ['traumatolog', 'Ortopedia'],
  ['dermat', 'Dermatologia'],
  ['endocrin', 'Endocrinologia'],
  ['oftalm', 'Oftalmologia'],
  ['otorrino', 'Otorrinolaringologia'],
  ['neurolog', 'Neurologia'],
  ['urolog', 'Urologia'],
  ['radiolog', 'Radiologia / Ultrassonografia'],
  ['ultrassonograf', 'Radiologia / Ultrassonografia'],
  ['ultrasson', 'Radiologia / Ultrassonografia'],
  ['ecograf', 'Radiologia / Ultrassonografia'],
]

/** Chave de MEDICO_ANAMNESIS_EXTRA_BY_SPECIALTY para o texto livre, ou null (Clínico Geral, "Outra", vazio). */
export function matchMedicoSpecialty(raw: string | null | undefined): string | null {
  const n = norm(raw ?? '')
  if (!n) return null
  const exact = Object.keys(MEDICO_ANAMNESIS_EXTRA_BY_SPECIALTY).find(k => norm(k) === n)
  if (exact) return exact
  return STEMS.find(([stem]) => n.includes(stem))?.[1] ?? null
}

/** Valor do seletor ("Clínico Geral" ou uma sub-especialidade) para o texto do profissional. */
export function medicoSelectValue(raw: string | null | undefined): string {
  return matchMedicoSpecialty(raw) ?? CLINICO_GERAL
}

/** Chave usada nos campos extras: o seletor "Clínico Geral" não soma nada. */
export function medicoExtrasKey(selectValue: string): string | null {
  return selectValue === CLINICO_GERAL ? null : selectValue
}
