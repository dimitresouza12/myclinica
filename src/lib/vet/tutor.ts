// Vínculo tutor-pet: um tutor com vários pets, sem duplicar o cadastro do tutor. Funções puras (testadas em tutor.test.ts).
//
// Cada pet é uma linha de `patients`. A coluna `tutor_id` (supabase/migrations/20261135_vet_internacao_exames.sql) aponta
// para o cadastro principal do tutor, que é o primeiro pet dele e guarda o CPF e o contato. O principal tem tutor_id vazio.
// Linhas antigas, sem vínculo, são "tutor de si mesmas": a tela só junta quando alguém confirma (ver `candidatosAoVinculo`).

import { sameTutor } from '@/lib/pacientes/pet'

export interface PetLinha {
  id: string
  name: string
  phone: string | null
  cpf: string | null
  pet_name: string | null
  pet_species: string | null
  /** vazio no cadastro principal do tutor; ausente enquanto a migration 20261135 não foi aplicada */
  tutor_id?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Só ids no formato de uuid entram em filtros montados como texto (nunca um valor digitado). */
export function uuidValido(v: string | null | undefined): v is string {
  return typeof v === 'string' && UUID.test(v)
}

/** Id do cadastro principal do tutor de um pet (o próprio, se ainda não tem vínculo). */
export function raizDoTutor(p: Pick<PetLinha, 'id' | 'tutor_id'>): string {
  return p.tutor_id || p.id
}

const temNome = (p: PetLinha) => (p.pet_name ?? '').trim() !== ''

/** Ordem de exibição: pelo nome do pet (português), o principal primeiro em caso de empate. */
function porNomeDoPet(a: PetLinha, b: PetLinha): number {
  return (a.pet_name ?? '').localeCompare(b.pet_name ?? '', 'pt-BR') || (a.tutor_id ? 1 : 0) - (b.tutor_id ? 1 : 0)
}

/**
 * Os pets do mesmo tutor de `atual` (inclusive ele), com base no vínculo explícito. Linha sem nome de pet só aparece
 * se for o próprio `atual`.
 */
export function petsDoTutor(atual: PetLinha, todos: PetLinha[]): PetLinha[] {
  const raiz = raizDoTutor(atual)
  const grupo = todos.filter(p => raizDoTutor(p) === raiz && (temNome(p) || p.id === atual.id))
  if (!grupo.some(p => p.id === atual.id)) grupo.push(atual)
  return [...new Map(grupo.map(p => [p.id, p])).values()].sort(porNomeDoPet)
}

/**
 * Sem a coluna de vínculo (migration não aplicada): agrupa pela heurística de telefone/CPF que o cadastro novo já usa.
 * Só leitura: não dá para gravar vínculo sem a coluna.
 */
export function petsDoTutorPorContato(atual: PetLinha, todos: PetLinha[]): PetLinha[] {
  const grupo = todos.filter(p => p.id !== atual.id && temNome(p) && sameTutor(atual, p))
  return [atual, ...grupo].sort(porNomeDoPet)
}

/**
 * Cadastros principais, fora do grupo de `atual`, que parecem ser do mesmo tutor (mesmo CPF completo ou mesmo telefone)
 * e ainda não estão vinculados a ninguém: a tela oferece juntar. Quem já aponta para outro tutor não é candidato.
 */
export function candidatosAoVinculo(atual: PetLinha, todos: PetLinha[]): PetLinha[] {
  const raiz = raizDoTutor(atual)
  return todos
    .filter(p => raizDoTutor(p) !== raiz && !p.tutor_id && temNome(p) && sameTutor(atual, p))
    .sort(porNomeDoPet)
}

/** "Thor" ou, sem nome de pet, o nome da pessoa. */
export function rotuloDoPet(p: Pick<PetLinha, 'name' | 'pet_name'>): string {
  return (p.pet_name ?? '').trim() || p.name
}

/** Espécie do cadastro com a primeira letra maiúscula; vazio se não houver. */
export function especieDoPet(p: Pick<PetLinha, 'pet_species'>): string {
  const s = (p.pet_species ?? '').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}
