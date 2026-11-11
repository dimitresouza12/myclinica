import { describe, expect, it } from 'vitest'
import { motivoDoErro } from './erros'

describe('motivo do erro do Supabase', () => {
  it('tabela inexistente', () => {
    expect(motivoDoErro({ code: '42P01' })).toBe('sem_tabela')
    expect(motivoDoErro({ code: 'PGRST205', message: "Could not find the table 'public.nutri_avaliacoes' in the schema cache" })).toBe('sem_tabela')
  })
  it('negado pela RLS', () => {
    expect(motivoDoErro({ code: '42501', message: 'new row violates row-level security policy for table "nutri_avaliacoes"' })).toBe('sem_permissao')
  })
  it('qualquer outro erro', () => {
    expect(motivoDoErro({ code: '23505', message: 'duplicate key' })).toBe('erro')
    expect(motivoDoErro(null)).toBe('erro')
  })
})
