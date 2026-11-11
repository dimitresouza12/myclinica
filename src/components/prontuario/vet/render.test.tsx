import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { GraficoPeso } from './GraficoPeso'
import { DosePanel } from './DosePanel'

const p = (id: string, weighed_on: string, weight_kg: number) => ({ id, weighed_on, weight_kg, note: null, created_at: `${weighed_on}T10:00:00Z` })

describe('renderização da aba Vacinas e peso', () => {
  it('gráfico com várias pesagens, uma só e nenhuma', () => {
    const html = renderToString(<GraficoPeso pesagens={[p('a', '2026-03-01', 4), p('b', '2026-06-01', 4.6), p('c', '2026-09-01', 5.2)]} />)
    expect(html).toContain('<svg')
    expect(html).toContain('4,6')
    expect(html).not.toContain('NaN')
    expect(renderToString(<GraficoPeso pesagens={[p('a', '2026-03-01', 0.35)]} />)).not.toContain('NaN')
    expect(renderToString(<GraficoPeso pesagens={[]} />)).toContain('Sem pesagens ainda')
  })
  it('calculadora traz o aviso de conferir a dose e usa o peso informado', () => {
    const html = renderToString(<DosePanel pesoAtualKg={12.5} pesoCadastroKg={null} />)
    expect(html).toContain('Conferir a dose antes de prescrever')
    expect(html).toContain('12,5')
    expect(html).toContain('última pesagem')
    expect(html).not.toContain('NaN')
  })
})
