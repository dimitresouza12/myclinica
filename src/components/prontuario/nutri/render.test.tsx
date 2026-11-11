import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Patient } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/print', () => ({ printDocumento: vi.fn() }))

import { AvaliacaoPanel } from './AvaliacaoPanel'
import { EvolucaoPanel } from './EvolucaoPanel'
import { PlanoPanel } from './PlanoPanel'
import { avaliacaoVazia } from '@/lib/nutri/avaliacao'
import { planoVazio } from '@/lib/nutri/plano'
import { carregarTaco } from '@/lib/nutri/alimentos'

// a TACO é carregada sob demanda; com ela já em memória a primeira renderização (síncrona) já tem os alimentos
await carregarTaco()

const patient = { id: 'p1', name: 'Maria Teste', birth_date: '1990-05-10', gender: 'Feminino' } as unknown as Patient
const clinica = { name: 'Clínica QA' }

const avaliacao = {
  ...avaliacaoVazia('F'), peso: '70', altura: '165', cintura: '82', quadril: '100',
  dobras: { triceps: '20', suprailiaca: '15', coxa: '25' }, protocolo: 'pollock3' as const,
}
const plano = (() => {
  const p = planoVazio('Plano de teste')
  p.meta = { kcal: 1800, proteinaG: 110, carboidratoG: 200, lipidioG: 55 }
  p.refeicoes[0].itens = [{ id: 'i1', alimentoId: 'taco-53', gramas: 50, medida: '1 pão francês (unidade)' }, { id: 'i2', alimentoId: 'taco-488', gramas: 100 }]
  return p
})()

const linhasAval = [
  { id: 'a2', tipo: 'avaliacao' as const, data: '2026-06-01', dados: avaliacao, created_at: '2026-06-01T10:00:00Z' },
  { id: 'a1', tipo: 'avaliacao' as const, data: '2026-05-01', dados: { ...avaliacao, peso: '73' }, created_at: '2026-05-01T10:00:00Z' },
]

describe('renderização das telas de Nutrição', () => {
  it('avaliação preenchida mostra IMC, composição e meta', () => {
    const html = renderToString(<AvaliacaoPanel patient={patient} clinicId="c1" linhas={linhasAval} carregando={false} motivo={null} recarregar={async () => {}} />)
    expect(html).toContain('IMC')
    expect(html).toContain('Densidade corporal')
    expect(html).toContain('Meta calórica')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
  })
  it('avaliação sem histórico abre em branco e avisa quando o banco está indisponível', () => {
    const html = renderToString(<AvaliacaoPanel patient={patient} clinicId="c1" linhas={[]} carregando={false} motivo="sem_permissao" recarregar={async () => {}} />)
    expect(html).toContain('Nova avaliação')
    expect(html).toContain('Não foi possível salvar')
  })
  it('evolução desenha os quatro gráficos', () => {
    const html = renderToString(<EvolucaoPanel patient={patient} clinica={clinica} linhas={linhasAval} carregando={false} />)
    expect(html).toContain('Peso')
    expect(html).toContain('Massa magra')
    expect(html).toContain('Massa gorda')
    expect(html).toContain('Cintura')
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(html).not.toContain('NaN')
  })
  it('plano mostra refeições, progresso e lista de compras', () => {
    const linhas = [{ id: 'pl1', tipo: 'plano' as const, data: '2026-06-01', dados: plano, created_at: '2026-06-01T10:00:00Z' }]
    const html = renderToString(<PlanoPanel patient={patient} clinicId="c1" clinica={clinica} linhas={linhas} carregando={false} motivo={null} recarregar={async () => {}}
      metaSugerida={{ kcal: 1800, proteinaG: 110, carboidratoG: 200, lipidioG: 55 }} />)
    expect(html).toContain('Pão, trigo, francês')
    expect(html).toContain('Lista de compras')
    expect(html).toContain('Café da manhã')
    expect(html).not.toContain('NaN')
  })
})
