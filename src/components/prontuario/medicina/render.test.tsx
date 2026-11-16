import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { GraficoCrescimento } from './GraficoCrescimento'
import { medidasDeLinhas, pontosDoIndicador } from '@/lib/medico/crescimento/medidas'

const linhas = [
  { id: 'a', data: '2026-02-01', dados: { pesoKg: 4.4, estaturaCm: 55, pcCm: 37 } },
  { id: 'b', data: '2026-05-01', dados: { pesoKg: 6.3, estaturaCm: 62, pcCm: 40 } },
  { id: 'c', data: '2026-09-01', dados: { pesoKg: 7.9, estaturaCm: 69.5, pcCm: 42.5 } },
]
const medidas = medidasDeLinhas(linhas)

describe('gráfico de crescimento', () => {
  it('desenha as 5 curvas da OMS e os pontos, sem NaN, para cada indicador e faixa', () => {
    for (const sexo of ['meninos', 'meninas'] as const) {
      for (const ind of ['peso', 'estatura', 'pc', 'imc'] as const) {
        for (const faixa of ['2anos', '5anos'] as const) {
          const html = renderToString(<GraficoCrescimento sexo={sexo} indicador={ind} faixa={faixa} pontos={pontosDoIndicador(sexo, '2026-01-01', medidas, ind)} />)
          expect(html).toContain('<svg')
          expect(html).not.toContain('NaN')
          expect(html).not.toContain('Infinity')
          expect((html.match(/<circle/g) ?? []).length).toBe(3)
          expect((html.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(6) // 5 curvas + a linha das medidas
        }
      }
    }
  })

  it('descreve as medidas para leitor de tela', () => {
    const html = renderToString(<GraficoCrescimento sexo="meninas" indicador="peso" faixa="2anos" pontos={pontosDoIndicador('meninas', '2026-01-01', medidas, 'peso')} />)
    expect(html).toContain('Peso para a idade, meninas, padrão OMS')
    expect(html).toContain('escore Z')
    expect(html).toContain('7,9')
  })

  it('sem medidas: só as curvas e o convite a registrar', () => {
    const html = renderToString(<GraficoCrescimento sexo="meninos" indicador="pc" faixa="5anos" pontos={[]} />)
    expect(html).toContain('Nenhuma medida registrada.')
    expect(html).toContain('Registre uma medida')
    expect(html).not.toContain('<circle')
    expect(html).not.toContain('NaN')
  })

  it('medida fora da faixa de idade escolhida não é desenhada', () => {
    const tardia = medidasDeLinhas([{ id: 'x', data: '2029-01-01', dados: { pesoKg: 14 } }])
    const html = renderToString(<GraficoCrescimento sexo="meninos" indicador="peso" faixa="2anos" pontos={pontosDoIndicador('meninos', '2026-01-01', tardia, 'peso')} />)
    expect(html).not.toContain('<circle')
  })
})
