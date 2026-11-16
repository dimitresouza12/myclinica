import { describe, expect, it } from 'vitest'
import { motivoDoErro } from './erros'

describe('motivo do erro do Supabase', () => {
  it('tabela inexistente', () => {
    expect(motivoDoErro({ code: '42P01' })).toBe('sem_tabela')
    expect(motivoDoErro({ code: 'PGRST205', message: "Could not find the table 'public.nutri_avaliacoes' in the schema cache" })).toBe('sem_tabela')
  })
  it('tipo recordatorio ainda não aceito pelo check da tabela (migração pendente)', () => {
    expect(motivoDoErro({ code: '23514', message: 'new row for relation "nutri_avaliacoes" violates check constraint "nutri_avaliacoes_tipo_check"' })).toBe('sem_tabela')
    expect(motivoDoErro({ code: '23514', message: 'violates check constraint "outra_check"' })).toBe('erro')
  })
  it('negado pela RLS', () => {
    expect(motivoDoErro({ code: '42501', message: 'new row violates row-level security policy for table "nutri_avaliacoes"' })).toBe('sem_permissao')
  })
  it('qualquer outro erro', () => {
    expect(motivoDoErro({ code: '23505', message: 'duplicate key' })).toBe('erro')
    expect(motivoDoErro(null)).toBe('erro')
  })
})
