import { describe, expect, it } from 'vitest'
import type { MedicalRecord, RecordEntry } from '@/types'
import { confidentialCount, confirmQuestion, corePrintOptions, sigiloNotice } from './printOptions'

const entry = (text: string, confidential = false) => ({ id: text, entry_text: text, is_confidential: confidential, created_at: '2026-01-01T10:00:00Z' }) as unknown as RecordEntry
const base = { record: null as MedicalRecord | null, entries: [] as RecordEntry[], entriesLoading: false, planItemCount: 0 }
const byId = (list: ReturnType<typeof corePrintOptions>, id: string) => list.find(o => o.id === id)!

describe('corePrintOptions', () => {
  it('lista as cinco opções fixas na ordem do menu', () => {
    expect(corePrintOptions(base).map(o => o.id)).toEqual(['prontuario', 'ficha', 'evolucao', 'orcamento', 'contrato'])
  })
  it('enquanto carrega, prontuário, ficha e evolução ficam desativados', () => {
    const list = corePrintOptions({ ...base, entriesLoading: true })
    for (const id of ['prontuario', 'ficha', 'evolucao']) expect(byId(list, id).disabledReason).toBeTruthy()
  })
  it('evolução sem registros fica desativada; com registros conta só os não sigilosos', () => {
    expect(byId(corePrintOptions(base), 'evolucao').disabledReason).toBeTruthy()
    const list = corePrintOptions({ ...base, entries: [entry('a'), entry('b'), entry('segredo', true)] })
    expect(byId(list, 'evolucao').disabledReason).toBeUndefined()
    expect(byId(list, 'evolucao').includes[0]).toContain('2 registros')
  })
  it('orçamento exige itens no plano', () => {
    expect(byId(corePrintOptions(base), 'orcamento').disabledReason).toBeTruthy()
    const on = byId(corePrintOptions({ ...base, planItemCount: 1 }), 'orcamento')
    expect(on.disabledReason).toBeUndefined()
    expect(on.includes[0]).toContain('1 item')
  })
  it('contrato exige texto salvo (vazio ou só espaços não vale)', () => {
    const rec = (t: string | null) => ({ contract_text: t }) as MedicalRecord
    expect(byId(corePrintOptions({ ...base, record: rec(null) }), 'contrato').disabledReason).toBeTruthy()
    expect(byId(corePrintOptions({ ...base, record: rec('   ') }), 'contrato').disabledReason).toBeTruthy()
    expect(byId(corePrintOptions({ ...base, record: rec('CONTRATO') }), 'contrato').disabledReason).toBeUndefined()
  })
  it('só as opções com evolução mencionam o sigilo', () => {
    const list = corePrintOptions(base)
    expect(list.filter(o => o.mentionsSigilo).map(o => o.id)).toEqual(['prontuario', 'evolucao'])
  })
})

describe('confirmação', () => {
  it('nomeia o que será impresso e para quem', () => {
    expect(confirmQuestion('Prontuário completo', 'Ana Souza')).toBe('Você vai imprimir: Prontuário completo de Ana Souza. Deseja continuar?')
  })
  it('o aviso de sigilo sempre existe e conta o que fica de fora', () => {
    expect(sigiloNotice([])).toBe('Anotações sigilosas de psicologia nunca saem na impressão.')
    expect(sigiloNotice([entry('a'), entry('b', true)])).toContain('1 anotação sigilosa fica de fora')
    expect(sigiloNotice([entry('a', true), entry('b', true)])).toContain('2 anotações sigilosas ficam de fora')
    expect(confidentialCount([entry('a'), entry('b', true)])).toBe(1)
  })
})
