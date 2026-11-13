import { describe, expect, it } from 'vitest'
import {
  buildMentionIndex, composeBody, countPatientTokens, detectMention, escapeLike, mentionsMe, parseBody, patientSearchTerms, patientToken,
  plainText, snippetParts, splitPatientTokens, tokensReserve, visibleTextHas,
} from './richText'
import type { TeamDirectoryEntry } from './types'

const dir = (name: string, id: string, me = false): TeamDirectoryEntry => ({ clinic_user_id: id, display_name: name, role: 'profissional', areas: [], is_me: me })
const index = buildMentionIndex([dir('Maria', 'a'), dir('Maria Silva', 'b'), dir('Dimitre Souza', 'c', true)])
const UUID = '3f2a9c1e-7b4d-4e0a-9c55-1a2b3c4d5e6f'

describe('parseBody', () => {
  it('mensagem antiga sem token vira um único texto igual ao original', () => {
    expect(parseBody('Olá, tudo bem? a@b.com [[x]] @ninguem', index)).toEqual([{ kind: 'text', text: 'Olá, tudo bem? a@b.com [[x]] @ninguem' }])
    expect(parseBody('', index)).toEqual([{ kind: 'text', text: '' }])
  })

  it('reconhece menção pelo nome mais longo e marca a do próprio login', () => {
    const segs = parseBody('Oi @Maria Silva e @maria, veja @Dimitre Souza.', index)
    expect(segs.filter(s => s.kind === 'mention').map(s => s.kind === 'mention' && s.text)).toEqual(['@Maria Silva', '@maria', '@Dimitre Souza'])
    expect(mentionsMe(segs)).toBe(true)
    expect(mentionsMe(parseBody('@Maria', index))).toBe(false)
  })

  it('não trata "@Mariana" como menção de "Maria" nem e-mail como menção', () => {
    expect(parseBody('@Mariana', index)).toEqual([{ kind: 'text', text: '@Mariana' }])
    expect(parseBody('fulano@maria.com', index)).toEqual([{ kind: 'text', text: 'fulano@maria.com' }])
  })

  it('citação de paciente vira chip; da 4ª em diante fica como texto', () => {
    const t = patientToken(UUID, 'Ana [Lima] | X')
    expect(t).toBe(`[[paciente:${UUID}|Ana Lima X]]`)
    const segs = parseBody(`veja ${t}`, index)
    expect(segs).toEqual([{ kind: 'text', text: 'veja ' }, { kind: 'patient', id: UUID, name: 'Ana Lima X' }])
    const four = Array.from({ length: 4 }, () => t).join(' ')
    expect(parseBody(four, index).filter(s => s.kind === 'patient')).toHaveLength(3)
    expect(countPatientTokens(four)).toBe(4)
  })

  it('não aceita id que não é uuid', () => {
    expect(parseBody('[[paciente:123|Ana]]', index)).toEqual([{ kind: 'text', text: '[[paciente:123|Ana]]' }])
  })
})

describe('plainText, busca e menção no campo', () => {
  it('plainText troca o token pelo nome', () => {
    expect(plainText(`ver ${patientToken(UUID, 'Ana')} hoje`)).toBe('ver Ana hoje')
  })
  it('escapeLike escapa % _ \\ e troca *', () => {
    expect(escapeLike('50%_a\\b*')).toBe('50\\%\\_a\\\\b_')
  })
  it('snippetParts destaca o termo sem diferenciar maiúsculas', () => {
    const parts = snippetParts('Reunião SOBRE o plantão e o plantao', 'plantão')
    expect(parts.filter(p => p.hit).map(p => p.text)).toEqual(['plantão'])
  })
  it('detectMention', () => {
    expect(detectMention('oi @Mar', 7)).toEqual({ start: 3, query: 'Mar' })
    expect(detectMention('@', 1)).toEqual({ start: 0, query: '' })
    expect(detectMention('a@b', 3)).toBeNull()
    expect(detectMention('oi @Mar\nlinha', 13)).toBeNull()
  })
})

describe('busca de paciente (termos)', () => {
  it('termo só de curingas ou pontuação não gera consulta', () => {
    for (const t of ['', ' ', '%', '%%', '__', '_%_', ',()', '*', 'a', ' a ', '%a%', '"\\']) expect(patientSearchTerms(t)).toEqual([])
  })
  it('tira o que quebra o filtro e devolve o termo e a variante sem acento', () => {
    expect(patientSearchTerms('Ana')).toEqual(['Ana'])
    expect(patientSearchTerms('  José, da  Silva ')).toEqual(['José da Silva', 'Jose da Silva'])
    expect(patientSearchTerms('Jo%_ão')).toEqual(['Jo ão', 'Jo ao'])
  })
})

describe('busca de mensagens (texto visível)', () => {
  const body = `Segue o caso ${patientToken(UUID, 'Ana Lima')}`
  it('não casa com o miolo do token', () => {
    for (const t of ['paciente', 'paciente:', UUID.slice(0, 8), '3f2a', '[[', '|']) expect(visibleTextHas(body, t)).toBe(false)
  })
  it('casa com o texto e com o nome do paciente, sem diferenciar acento nem caixa', () => {
    expect(visibleTextHas(body, 'SEGUE')).toBe(true)
    expect(visibleTextHas(body, 'ana lima')).toBe(true)
    expect(visibleTextHas('Reunião do plantão', 'plantao')).toBe(true)
    expect(visibleTextHas('abc', '')).toBe(false)
  })
})

describe('edição com citação de paciente', () => {
  it('separa os tokens do texto e recompõe o mesmo corpo', () => {
    const body = composeBody('Veja o caso', [{ id: UUID, name: 'Ana Lima' }, { id: UUID.replace('3f2a', '4f2a'), name: 'Bia' }])
    const { text, patients } = splitPatientTokens(body)
    expect(text).toBe('Veja o caso')
    expect(patients.map(p => p.name)).toEqual(['Ana Lima', 'Bia'])
    expect(composeBody(text, patients)).toBe(body)
  })
  it('token no meio do texto sai sem deixar espaço duplo; mensagem sem token não muda', () => {
    expect(splitPatientTokens(`veja ${patientToken(UUID, 'Ana')} hoje`).text).toBe('veja hoje')
    expect(splitPatientTokens('  texto  com  espaços  ')).toEqual({ text: '  texto  com  espaços  ', patients: [] })
  })
  it('só citações, sem texto, é um corpo válido; o limite reserva o tamanho dos tokens', () => {
    const one = [{ id: UUID, name: 'Ana' }]
    expect(composeBody('  ', one)).toBe(patientToken(UUID, 'Ana'))
    expect(composeBody('', [])).toBe('')
    expect(tokensReserve([])).toBe(0)
    expect(tokensReserve(one)).toBe(patientToken(UUID, 'Ana').length + 1)
  })
})
