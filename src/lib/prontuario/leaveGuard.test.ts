import { afterEach, describe, expect, it } from 'vitest'
import { canLeave, internalTarget, joinLabels, setLeaveGuard, unsavedLabels } from './leaveGuard'

afterEach(() => setLeaveGuard(null))

describe('unsavedLabels', () => {
  it('lista só o que está pendente, na ordem das abas', () => {
    expect(unsavedLabels({})).toEqual([])
    expect(unsavedLabels({ nutri: true, odontograma: true })).toEqual(['o Odontograma', 'a Nutrição (avaliação ou plano alimentar)'])
  })
})

describe('joinLabels', () => {
  it('junta com vírgula e "e"', () => {
    expect(joinLabels(['a'])).toBe('a')
    expect(joinLabels(['a', 'b'])).toBe('a e b')
    expect(joinLabels(['a', 'b', 'c'])).toBe('a, b e c')
    expect(joinLabels([])).toBe('')
  })
})

describe('internalTarget', () => {
  const origin = 'https://app.exemplo.com'
  const current = 'https://app.exemplo.com/pacientes/p1?aba=timeline'
  it('devolve o destino de links internos', () => {
    expect(internalTarget('/agenda', origin, current)).toBe('/agenda')
    expect(internalTarget('https://app.exemplo.com/financeiro?x=1#a', origin, current)).toBe('/financeiro?x=1#a')
  })
  it('não intercepta outra origem, outro protocolo nem a própria página', () => {
    expect(internalTarget('https://outro.com/x', origin, current)).toBeNull()
    expect(internalTarget('mailto:a@b.com', origin, current)).toBeNull()
    expect(internalTarget('tel:123', origin, current)).toBeNull()
    expect(internalTarget('/pacientes/p1?aba=timeline#x', origin, current)).toBeNull()
  })
})

describe('guarda global', () => {
  it('sem guarda, pode sair', async () => {
    expect(await canLeave()).toBe(true)
  })
  it('com guarda, a resposta dele manda', async () => {
    setLeaveGuard(async () => false)
    expect(await canLeave()).toBe(false)
    setLeaveGuard(async () => true)
    expect(await canLeave()).toBe(true)
  })
})
