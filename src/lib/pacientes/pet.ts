// Dados do animal (clínica veterinária): lógica pura de idade, rótulo, vínculo de tutor e payload.
// Cada pet é uma linha de `patients` (o prontuário é por paciente); o tutor é o contato dessa linha.

/** Valores gravados em patients.pet_sex (CHECK da migration 20261111_vet_pet_fields_professional_rqe.sql) e rótulos da tela. */
export const PET_SEX_OPTIONS = [
  { value: 'macho', label: 'Macho' },
  { value: 'femea', label: 'Fêmea' },
] as const

/** Colunas de `patients` que só existem depois da migration 20261111_vet_pet_fields_professional_rqe.sql. */
export const PET_EXTRA_COLUMNS = ['pet_sex', 'pet_birth_date', 'pet_microchip'] as const

/** Texto da tela para o valor gravado ('macho' → 'Macho'). */
export function petSexLabel(v: string | null | undefined): string {
  return PET_SEX_OPTIONS.find(o => o.value === v)?.label ?? ''
}

/** Aceita o valor gravado ou o rótulo; qualquer outra coisa vira ''. */
export function normalizePetSex(v: string | null | undefined): '' | 'macho' | 'femea' {
  const s = (v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  return s === 'macho' ? 'macho' : s === 'femea' ? 'femea' : ''
}

/** Campos de `patients` que indicam que o cadastro é de um animal. */
export interface PetDataLike {
  pet_name?: string | null
  pet_species?: string | null
  pet_breed?: string | null
  pet_weight?: number | null
  pet_age?: string | null
  pet_coat?: string | null
  pet_neutered?: boolean | null
  pet_sex?: string | null
  pet_birth_date?: string | null
  pet_microchip?: string | null
}

/** O paciente já tem algum dado de pet gravado (texto em branco não conta). */
export function hasPetData(p: PetDataLike | null | undefined): boolean {
  if (!p) return false
  const t = (v: string | null | undefined) => (v ?? '').trim() !== ''
  return t(p.pet_name) || t(p.pet_species) || t(p.pet_breed) || t(p.pet_age) || t(p.pet_coat) || t(p.pet_sex)
    || t(p.pet_birth_date) || t(p.pet_microchip) || p.pet_weight != null || p.pet_neutered != null
}

export interface PetVisibilityInput {
  /** áreas da clínica (specialties, ou só o type) */
  clinicAreas: readonly string[]
  /** área do profissional logado; vazio/null = admin, recepção etc. */
  specialtyType?: string | null
  isNew: boolean
  /** caixa "Este cadastro é de um animal (pet)" */
  markedAsPet: boolean
  /** paciente em edição já tem dados de pet */
  patientHasPetData: boolean
}

export interface PetVisibility {
  /** mostra "Dados do pet" (e a busca de tutor no cadastro novo) */
  showPet: boolean
  /** clínica só de veterinária: todo cadastro é de um pet e a pessoa é o tutor */
  vetOnly: boolean
  /** mostra a caixa "Este cadastro é de um animal (pet)" */
  askIsPet: boolean
}

/**
 * Quando o formulário de paciente trata o cadastro como de um animal.
 * Sem veterinária: nunca. Só veterinária: sempre. Várias áreas com veterinária: profissional de outra área nunca,
 * profissional vet sempre; sem área (admin/recepção), só no cadastro novo com a caixa marcada ou em paciente que já tem dados de pet.
 */
export function petVisibility(i: PetVisibilityInput): PetVisibility {
  const none: PetVisibility = { showPet: false, vetOnly: false, askIsPet: false }
  if (!i.clinicAreas.includes('vet')) return none
  if (i.clinicAreas.length === 1) return { showPet: true, vetOnly: true, askIsPet: false }
  if (i.specialtyType) return { ...none, showPet: i.specialtyType === 'vet' }
  return { showPet: i.isNew ? i.markedAsPet : i.patientHasPetData, vetOnly: false, askIsPet: i.isNew }
}

export interface PetLike {
  name: string
  pet_name?: string | null
}

/** "Thor (Tutor: Maria Silva)" quando há nome de pet; senão, só o nome da pessoa. */
export function petLabel(p: PetLike | null | undefined): string {
  if (!p) return ''
  const pet = (p.pet_name ?? '').trim()
  return pet ? `${pet} (Tutor: ${p.name})` : p.name
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Idade a partir do nascimento (AAAA-MM-DD): "12 dias", "5 meses", "2 anos e 3 meses". Nasc. inválido/futuro: ''. */
export function petAgeFromBirth(birthISO: string | null | undefined, today: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthISO ?? '')
  if (!m) return ''
  const by = Number(m[1]), bm = Number(m[2]), bd = Number(m[3])
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate()
  let months = (ty - by) * 12 + (tm - bm)
  if (td < bd) months -= 1
  if (months < 0) return ''
  if (months < 1) {
    const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
    return plural(Math.max(days, 0), 'dia', 'dias')
  }
  if (months < 12) return plural(months, 'mês', 'meses')
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest ? `${plural(years, 'ano', 'anos')} e ${plural(rest, 'mês', 'meses')}` : plural(years, 'ano', 'anos')
}

export interface PetFormValues {
  nome: string
  especie: string
  raca: string
  sexo: string
  /** DD/MM/AAAA já convertido para ISO por quem chama; '' = sem data */
  nascimentoISO: string
  castrado: string // 'Sim' | 'Não' | ''
  peso: string
  pelagem: string
  microchip: string
  /** texto livre antigo (pet_age); preservado ao gravar, mesmo quando há nascimento */
  idadeTexto: string
}

export const EMPTY_PET_FORM: PetFormValues = {
  nome: '', especie: '', raca: '', sexo: '', nascimentoISO: '', castrado: '', peso: '', pelagem: '', microchip: '', idadeTexto: '',
}

const orNull = (v: string) => (v.trim() ? v.trim() : null)

/** "Sim"/"Não" → boolean, vazio → null (aceita grafias antigas digitadas à mão). */
export function parseNeutered(v: string | null | undefined): boolean | null {
  const s = (v ?? '').trim().toLowerCase()
  if (!s) return null
  if (['sim', 's', 'castrado', 'castrada', 'true'].includes(s)) return true
  if (['não', 'nao', 'n', 'false'].includes(s)) return false
  return null
}

/** Microchip: só dígitos (15 no padrão ISO 11784); vazio vira null. */
export function normalizeMicrochip(v: string): string | null {
  const d = v.replace(/\D/g, '')
  return d ? d : null
}

export function microchipError(v: string): string | null {
  const d = v.replace(/\D/g, '')
  if (!d) return null
  return d.length === 15 ? null : 'O microchip tem 15 números.'
}

/**
 * Colunas de `patients` para o animal. As colunas extras (sexo, nascimento, microchip)
 * só entram quando existem no banco; sem elas o resto é gravado normalmente.
 */
export function buildPetColumns(v: PetFormValues, opts: { extras: boolean }): Record<string, unknown> {
  const weight = v.peso.trim() ? Number(v.peso.replace(',', '.')) : NaN
  const cols: Record<string, unknown> = {
    pet_name: orNull(v.nome),
    pet_species: orNull(v.especie),
    pet_breed: orNull(v.raca),
    pet_coat: orNull(v.pelagem),
    pet_weight: Number.isFinite(weight) ? weight : null,
    pet_neutered: parseNeutered(v.castrado),
    // a idade em texto nunca é apagada ao informar o nascimento: o campo só deixa de ser exibido
    pet_age: orNull(v.idadeTexto),
  }
  if (opts.extras) {
    cols.pet_sex = normalizePetSex(v.sexo) || null
    cols.pet_birth_date = v.nascimentoISO || null
    cols.pet_microchip = normalizeMicrochip(v.microchip)
  }
  return cols
}

export interface TutorCandidate {
  id: string
  name: string
  phone: string | null
  cpf: string | null
  pet_name?: string | null
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** Último trecho do número (sem DDI/DDD), para comparar telefones gravados de jeitos diferentes. */
function phoneTail(s: string | null | undefined): string {
  const d = digits(s)
  return d.length >= 8 ? d.slice(-8) : ''
}

/**
 * Duas linhas de `patients` são do mesmo tutor: mesmo CPF (11 dígitos) ou mesmo telefone (não há tabela de tutores).
 * Se os dois têm CPF completo e ele difere, são pessoas diferentes mesmo com telefone igual (contato da família).
 */
export function sameTutor(a: TutorCandidate, b: TutorCandidate): boolean {
  if (a.id === b.id) return true
  const ca = digits(a.cpf), cb = digits(b.cpf)
  if (ca.length === 11 && cb.length === 11) return ca === cb
  const pa = phoneTail(a.phone), pb = phoneTail(b.phone)
  return !!pa && pa === pb
}

/** Os outros pets (linhas) do mesmo tutor de `target`, em ordem de nome do pet. */
export function otherPetsOfTutor<T extends TutorCandidate>(target: TutorCandidate, all: T[]): T[] {
  return all
    .filter(p => p.id !== target.id && !!(p.pet_name ?? '').trim() && sameTutor(target, p))
    .sort((x, y) => (x.pet_name ?? '').localeCompare(y.pet_name ?? '', 'pt-BR'))
}
