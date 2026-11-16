import { describe, expect, it } from 'vitest'
import { candidatosAoVinculo, especieDoPet, petsDoTutor, petsDoTutorPorContato, raizDoTutor, rotuloDoPet, uuidValido, type PetLinha } from './tutor'

const pet = (id: string, pet_name: string | null, over: Partial<PetLinha> = {}): PetLinha => ({
  id, name: 'Maria Silva', phone: '(85) 98888-1111', cpf: null, pet_name, pet_species: 'Canino', tutor_id: null, ...over,
})

describe('vínculo tutor-pet', () => {
  it('raiz: o próprio cadastro sem vínculo, o tutor quando há vínculo', () => {
    expect(raizDoTutor({ id: 'a', tutor_id: null })).toBe('a')
    expect(raizDoTutor({ id: 'b', tutor_id: 'a' })).toBe('a')
    expect(raizDoTutor({ id: 'c' })).toBe('c')
  })

  it('pets do tutor: o principal e os vinculados, em ordem de nome, sem misturar outro tutor', () => {
    const principal = pet('a', 'Thor')
    const mel = pet('b', 'Mel', { tutor_id: 'a', cpf: null })
    const bidu = pet('c', 'Bidu', { tutor_id: 'a' })
    const outro = pet('d', 'Rex', { name: 'João', phone: '(85) 97777-0000' })
    const todos = [principal, mel, bidu, outro]
    expect(petsDoTutor(mel, todos).map(p => p.pet_name)).toEqual(['Bidu', 'Mel', 'Thor'])
    expect(petsDoTutor(principal, todos).map(p => p.id)).toEqual(['c', 'b', 'a'])
    expect(petsDoTutor(outro, todos).map(p => p.id)).toEqual(['d'])
  })

  it('o pet aberto aparece mesmo que a busca não o tenha trazido', () => {
    const principal = pet('a', 'Thor')
    const mel = pet('b', 'Mel', { tutor_id: 'a' })
    expect(petsDoTutor(mel, [principal]).map(p => p.id).sort()).toEqual(['a', 'b'])
  })

  it('sem a coluna de vínculo, agrupa por telefone ou CPF completo', () => {
    const a = pet('a', 'Thor')
    const b = pet('b', 'Mel', { phone: '85988881111' })
    const c = pet('c', 'Rex', { name: 'João', phone: '(85) 97777-0000' })
    expect(petsDoTutorPorContato(a, [a, b, c]).map(p => p.id)).toEqual(['b', 'a'])
    // CPFs completos diferentes: pessoas diferentes mesmo com o mesmo telefone
    const d = pet('d', 'Pipa', { cpf: '111.444.777-35' })
    const e = pet('e', 'Luna', { cpf: '529.982.247-25' })
    expect(petsDoTutorPorContato(d, [d, e]).map(p => p.id)).toEqual(['d'])
  })

  it('candidatos ao vínculo: mesmo contato, sem vínculo e fora do grupo', () => {
    const a = pet('a', 'Thor')
    const mel = pet('b', 'Mel', { tutor_id: 'a' })
    const solto = pet('c', 'Bidu')
    const deOutro = pet('d', 'Luna', { tutor_id: 'z' })
    const outroTutor = pet('e', 'Rex', { name: 'João', phone: '(85) 97777-0000' })
    const semNomeDePet = pet('f', null)
    const cands = candidatosAoVinculo(mel, [a, mel, solto, deOutro, outroTutor, semNomeDePet])
    expect(cands.map(p => p.id)).toEqual(['c'])
  })

  it('rótulos', () => {
    expect(rotuloDoPet({ name: 'Maria', pet_name: ' Thor ' })).toBe('Thor')
    expect(rotuloDoPet({ name: 'Maria', pet_name: null })).toBe('Maria')
    expect(especieDoPet({ pet_species: 'canino' })).toBe('Canino')
    expect(especieDoPet({ pet_species: null })).toBe('')
  })

  it('só uuid entra em filtro', () => {
    expect(uuidValido('3f2b8a52-1c4e-4f8a-9b7d-0a1b2c3d4e5f')).toBe(true)
    expect(uuidValido('x,id.eq.1')).toBe(false)
    expect(uuidValido(null)).toBe(false)
  })
})
