import { describe, expect, it } from 'vitest'
import { buildDefaultTemplate, buildSignatureBlock, escapeHtml, safeCssColor, safeLogoUrl, syncSignerBlocks, type DefaultTemplateArgs } from './documentHtml'

const council = { code: 'CRO', label: 'CRO' }
const base: DefaultTemplateArgs = {
  type: 'atestado', title: 'ATESTADO', patientName: 'Ana', patientAddress: 'Rua A', date: '1 de janeiro de 2026',
  clinicName: 'Clínica X', clinicAddress: 'Av. B', clinicPhone: '(85) 99999-0000', clinicColor: '#4DD9C0',
  doctorName: 'Dr. Y', registrationNumber: '123', council, body: '', professionalId: 'p1',
}

describe('escapeHtml e sanitizers', () => {
  it('escapa os cinco caracteres e aceita vazio', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
    expect(escapeHtml(null)).toBe('')
  })
  it('cor e logo só aceitam formatos seguros', () => {
    expect(safeCssColor('#0d9488')).toBe('#0d9488')
    expect(safeCssColor('red;background:url(x)')).toBe('#4DD9C0')
    expect(safeLogoUrl('https://x.co/a.png')).toBe('https://x.co/a.png')
    expect(safeLogoUrl('javascript:alert(1)')).toBe('')
    expect(safeLogoUrl('data:image/svg+xml;base64,AAA')).toBe('')
  })
})

describe('buildDefaultTemplate escapa dados do usuário', () => {
  const evil = '<img src=x onerror=alert(1)>'
  for (const type of ['atestado', 'receita_especial'] as const) {
    it(`${type}: nenhum campo vira HTML`, () => {
      const html = buildDefaultTemplate({
        ...base, type, patientName: evil, patientAddress: evil, clinicName: evil, clinicAddress: evil,
        clinicPhone: evil, doctorName: evil, registrationNumber: evil, clinicLogo: `"><script>x</script>`, clinicColor: '"><b>',
      })
      expect(html).not.toContain('<img src=x')
      expect(html).not.toContain('<script')
      expect(html).not.toContain('"><b>')
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    })
  }
  it('mantém o corpo-modelo (HTML do sistema) sem escapar e leva a marca da assinatura', () => {
    const html = buildDefaultTemplate({ ...base, body: '<p>corpo</p>' })
    expect(html).toContain('<p>corpo</p>')
    expect(html).toContain('data-doc-signature')
    expect(html).toContain('data-prof="p1"')
  })
})

// Sem DOM no vitest (ambiente node): raiz falsa com a mesma interface usada por syncSignerBlocks.
function fakeRoot(blocks: Array<{ prof: string; emitente?: boolean }>) {
  const els = blocks.map(b => ({
    outerHTML: `OLD-${b.prof}`,
    getAttribute: (n: string) => (n === 'data-prof' ? b.prof : null),
    hasAttribute: (n: string) => n === 'data-doc-emitente' && !!b.emitente,
  }))
  return { els, root: { querySelectorAll: () => els } as never }
}

describe('syncSignerBlocks', () => {
  const signer = { doctorName: 'Dra. Nova', registrationNumber: '999', council, professionalId: 'p2', clinicAddress: 'Av. B' }
  it('troca só os blocos de outro profissional', () => {
    const { els, root } = fakeRoot([{ prof: 'p1' }, { prof: 'p2' }, { prof: 'p1', emitente: true }])
    expect(syncSignerBlocks(root, signer)).toBe(2)
    expect(els[0].outerHTML).toContain('Dra. Nova')
    expect(els[0].outerHTML).toContain('CRO 999')
    expect(els[1].outerHTML).toBe('OLD-p2')
    expect(els[2].outerHTML).toContain('data-doc-emitente')
  })
  it('profissional ainda desconhecido (id vazio) também é trocado quando ele carrega', () => {
    const { els, root } = fakeRoot([{ prof: '' }])
    expect(syncSignerBlocks(root, signer)).toBe(1)
    expect(els[0].outerHTML).toBe(buildSignatureBlock(signer))
  })
})
