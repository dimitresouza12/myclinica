import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/print', () => ({ printDocumento: vi.fn() }))

import { dataBr, esc, htmlOrtodontia, htmlPeriograma, htmlPeriogramaComparacao } from './imprimir'
import { comDente, comMarcaNoSitio, comValorNoSitio, marcarAusentes, perioVazio } from './periograma'
import { comConsulta, consultaVazia, ortoVazio } from './ortodontia'

const cab = { clinica: 'Clínica <Sorriso>', paciente: 'Ana "A" Souza', detalhe: 'Rua 1' }

function exame() {
  let d = perioVazio()
  d = comDente(d, 16, t => comMarcaNoSitio(comValorNoSitio(comValorNoSitio(t, 'v', 'ps', 0, 6), 'v', 'rec', 0, 2), 'v', 'sang', 0, true))
  return marcarAusentes(d, [18])
}

describe('impressão do periograma', () => {
  const html = htmlPeriograma(cab, exame(), '2026-11-10')
  it('escapa o texto digitado', () => {
    expect(html).toContain('Clínica &lt;Sorriso&gt;')
    expect(html).toContain('Ana &quot;A&quot; Souza')
    expect(html).not.toContain('<Sorriso>')
    const obs = htmlPeriograma(cab, { ...exame(), obs: '<script>x</script>' }, '2026-11-10')
    expect(obs).not.toContain('<script>')
  })
  it('traz a data, os 32 dentes e os valores do sítio', () => {
    expect(html).toContain('Exame de 10/11/2026')
    for (const n of [18, 11, 21, 28, 48, 41, 31, 38]) expect(html).toContain(`>${n}</td>`)
    expect(html).toContain('<strong style="color:#b91c1c">6</strong>') // PS de 6 mm em destaque
    expect(html).toContain('>8</td>') // NIC = 6 + 2
  })
  it('marca o dente ausente e mostra a legenda', () => {
    expect(html).toContain('>x</td>')
    expect(html).toContain('nível de inserção clínica')
  })
  it('no resumo, 1 sítio sangrando de 1 registrado', () => {
    expect(html).toContain('1 de 1')
    expect(html).toContain('100,0%')
  })
})

describe('impressão da comparação', () => {
  it('mostra as duas datas e a variação', () => {
    const a = exame()
    const b = comDente(a, 16, t => comValorNoSitio(t, 'v', 'ps', 0, 3))
    const html = htmlPeriogramaComparacao(cab, a, '2026-05-01', b, '2026-11-01')
    expect(html).toContain('01/05/2026')
    expect(html).toContain('01/11/2026')
    expect(html).toContain('-3,0 mm')
    expect(html).toContain('melhorou em 1')
  })
})

describe('impressão da ortodontia', () => {
  const d = comConsulta(
    { ...ortoVazio('2026-06-01'), objetivo: 'Alinhar <incisivos>', previsaoMeses: '18' },
    { ...consultaVazia('a', '2026-07-01'), ativacao: 'Fio NiTi 014', fioSup: '014', elasticos: 'Classe II', proxima: '2026-08-01', fotos: ['x'] },
  )
  const html = htmlOrtodontia(cab, d, '2026-11-15')
  it('traz o aparelho, a instalação e o histórico', () => {
    expect(html).toContain('Fixo metálico')
    expect(html).toContain('01/06/2026')
    expect(html).toContain('Fio NiTi 014')
    expect(html).toContain('(1 foto)')
    expect(html).toContain('Alinhar &lt;incisivos&gt;')
  })
  it('mostra a próxima manutenção vencida e a linha do tempo', () => {
    expect(html).toContain('Atrasada há 106 dias')
    expect(html).toContain('Linha do tempo')
    expect(html).toContain('Instalação do aparelho')
  })
  it('sem consulta avisa que não há registro', () => {
    expect(htmlOrtodontia(cab, ortoVazio('2026-06-01'), '2026-11-15')).toContain('Nenhuma manutenção registrada.')
  })
})

describe('auxiliares', () => {
  it('esc e dataBr', () => {
    expect(esc('<a&b>')).toBe('&lt;a&amp;b&gt;')
    expect(dataBr('2026-01-05')).toBe('05/01/2026')
  })
})
