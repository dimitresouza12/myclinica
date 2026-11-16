import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDocumentoHtml, printContrato, printEvolucao, printOrcamento, printProntuario, printRecibo, safeImageUrl } from './print'
import { getSpecialtyConfig } from '@/lib/specialtyConfig'
import type { FinancialRecord, MedicalRecord, Patient, RecordEntry, TreatmentPlanItem } from '@/types'

const patient = { id: 'p1', name: 'Paciente Teste' } as Patient
const clinic = { name: 'Clínica Teste' }

// openPrint escreve o HTML numa janela nova; aqui a janela é falsa e guardamos o HTML.
let printed = ''
function stubBrowser() {
  printed = ''
  const win = { document: { write: (h: string) => { printed = h }, close() {} }, focus() {}, print() {} }
  vi.stubGlobal('window', { open: () => win, alert() {}, location: { origin: 'http://localhost:3000' } })
  vi.stubGlobal('Image', class { onload?: () => void; set src(_: string) { setTimeout(() => this.onload?.(), 0) } })
}
async function print(record: Partial<MedicalRecord> | null) {
  printProntuario(clinic, patient, record as MedicalRecord | null, [], 'odonto')
  await vi.waitFor(() => expect(printed).not.toBe(''))
  return printed
}

describe('printProntuario: odontograma e faceograma', () => {
  beforeEach(stubBrowser)
  afterEach(() => vi.unstubAllGlobals())

  it('não imprime as seções quando não há nada marcado', async () => {
    const html = await print({ odontogram: { 11: { status: 'higido', surfaces: { v: 'higido' } } } as never, aesthetic_protocols: [] as never })
    expect(html).not.toContain('<h3>Odontograma</h3>')
    expect(html).not.toContain('<h3>Faceograma</h3>')
  })

  it('imprime o dente alterado com a condição, a face e a observação (escapada)', async () => {
    const html = await print({
      odontogram: { 21: { status: 'cariado', surfaces: { o: 'extracao' }, note: 'trocar <b>urgente</b>', planned: { o: true } }, _history: [] } as never,
    })
    expect(html).toContain('<h3>Odontograma</h3>')
    expect(html).toContain('Cariado')
    expect(html).toContain('Oclusal: Extração Indicada (a realizar)')
    expect(html).toContain('trocar &lt;b&gt;urgente&lt;/b&gt;')
    expect(html).not.toContain('<b>urgente</b>')
  })

  it('imprime dentes decíduos com registro, com o mapa próprio, e os tratamentos extras', async () => {
    const html = await print({
      odontogram: {
        54: { status: 'higido', surfaces: { o: 'cariado' } },
        16: { status: 'higido', surfaces: {}, endo: [0, 1, 2], pin: [1], planned: { pin: true } },
        11: { status: 'higido', surfaces: {}, bracket: true },
        _history: [],
      } as never,
    })
    expect(html).toContain('Decíduos')
    expect(html).toContain('grid-template-columns:repeat(10,1fr)')
    expect(html).toContain('Oclusal: Cariado')
    expect(html).toContain('Canal; Pino (a realizar)')
    expect(html).toContain('Aparelho')
    expect(html).toContain('>54</td>')
  })

  it('sem decíduos com registro, o mapa de decíduos não aparece', async () => {
    const html = await print({ odontogram: { 21: { status: 'cariado', surfaces: {} }, 55: { status: 'higido', surfaces: {} }, _history: [] } as never })
    expect(html).not.toContain('Decíduos')
  })

  it('imprime as sessões do faceograma em ordem de data, com pontos numerados', async () => {
    const html = await print({
      aesthetic_protocols: [
        { id: 's2', date: '2026-10-20', notes: '', annotations: [{ id: 'a', x: 150, y: 124.5, type: 'toxina', qty: '20U', note: 'glabela', region: 'Glabela' }, { id: 'b', x: 60, y: 90, type: 'toxina', qty: '4 u', note: '', region: 'Têmpora (direito)' }] },
        { id: 's1', date: '2026-09-01', notes: 'lote <X>', annotations: [] },
      ] as never,
    })
    expect(html).toContain('<h3>Faceograma</h3>')
    expect(html.indexOf('01/09/2026')).toBeLessThan(html.indexOf('20/10/2026'))
    expect(html).toContain('Toxina botulínica')
    expect(html).toContain('20U')
    expect(html).toContain('Têmpora (direito)')
    expect(html).toContain('Total da sessão:</b> Toxina botulínica 24 U')
    expect(html).toContain('left:50%;top:50%')
    expect(html).toContain('lote &lt;X&gt;')
    expect(html).toContain('http://localhost:3000/faceograma/rosto-frente-sm.webp')
  })
})

describe('printProntuario: evoluções sigilosas', () => {
  beforeEach(stubBrowser)
  afterEach(() => vi.unstubAllGlobals())

  const entry = (over: Partial<RecordEntry>) => ({ id: 'e', created_at: '2026-10-20T12:00:00Z', entry_text: '', ...over }) as RecordEntry

  it('não imprime evolução com is_confidential true; mantém as demais (inclusive sem o campo)', async () => {
    printProntuario(clinic, patient, null, [
      entry({ id: '1', entry_text: 'texto-sigiloso', is_confidential: true }),
      entry({ id: '2', entry_text: 'texto-publico', is_confidential: false }),
      entry({ id: '3', entry_text: 'texto-antigo' }),
    ], 'psico')
    await vi.waitFor(() => expect(printed).not.toBe(''))
    expect(printed).not.toContain('texto-sigiloso')
    expect(printed).toContain('texto-publico')
    expect(printed).toContain('texto-antigo')
  })

  it('se todas são sigilosas, a seção Evolução Clínica some', async () => {
    printProntuario(clinic, patient, null, [entry({ entry_text: 'segredo', is_confidential: true })], 'psico')
    await vi.waitFor(() => expect(printed).not.toBe(''))
    expect(printed).not.toContain('segredo')
    expect(printed).not.toContain('Evolução Clínica')
  })
})

describe('impressões do menu: ficha clínica e evolução', () => {
  beforeEach(stubBrowser)
  afterEach(() => vi.unstubAllGlobals())

  const entry = (over: Partial<RecordEntry>) => ({ id: 'e', created_at: '2026-10-20T12:00:00Z', entry_text: '', ...over }) as RecordEntry

  it('ficha clínica (evolucao: false) não leva a evolução, mesmo havendo registros', async () => {
    printProntuario(clinic, patient, null, [entry({ entry_text: 'texto-publico' })], 'psico', { evolucao: false })
    await vi.waitFor(() => expect(printed).not.toBe(''))
    expect(printed).not.toContain('texto-publico')
    expect(printed).not.toContain('Evolução Clínica')
    expect(printed).toContain('Identificação do Paciente')
  })

  it('prontuário completo (sem opções) continua levando a evolução', async () => {
    printProntuario(clinic, patient, null, [entry({ entry_text: 'texto-publico' })], 'psico')
    await vi.waitFor(() => expect(printed).not.toBe(''))
    expect(printed).toContain('texto-publico')
  })

  it('evolução avulsa nunca imprime anotação sigilosa', async () => {
    printEvolucao(clinic, patient, [
      entry({ id: '1', entry_text: 'texto-sigiloso', is_confidential: true }),
      entry({ id: '2', entry_text: 'texto-publico' }),
    ])
    await vi.waitFor(() => expect(printed).not.toBe(''))
    expect(printed).not.toContain('texto-sigiloso')
    expect(printed).toContain('texto-publico')
    expect(printed).not.toContain('Identificação do Paciente')
  })

  it('evolução avulsa com tudo sigiloso avisa que não há registro, sem vazar o texto', async () => {
    printEvolucao(clinic, patient, [entry({ entry_text: 'segredo', is_confidential: true })])
    await vi.waitFor(() => expect(printed).not.toBe(''))
    expect(printed).not.toContain('segredo')
    expect(printed).toContain('Nenhuma evolução registrada')
  })
})

// Segurança: texto digitado em qualquer campo entra num HTML escrito com document.write na mesma origem logada.
describe('XSS: campos do banco saem escapados em cada impresso', () => {
  beforeEach(stubBrowser)
  afterEach(() => vi.unstubAllGlobals())

  const XSS = '<img src=x onerror=alert(1)>'
  const ESCAPED = '&lt;img src=x onerror=alert(1)&gt;'
  const evil = { ...patient, name: XSS, phone: XSS, email: XSS, cpf: XSS, rg: XSS, birth_date: XSS, gender: XSS, occupation: XSS, address: XSS, referred_by: XSS, emergency_contact: XSS } as Patient
  const evilClinic = { name: XSS, address: XSS, phone: XSS, logo: 'javascript:alert(1)' }
  const entry = (text: string) => ({ id: 'e', created_at: '2026-10-20T12:00:00Z', entry_text: text }) as RecordEntry

  async function run(fn: () => void) {
    fn()
    await vi.waitFor(() => expect(printed).not.toBe(''))
    expect(printed).not.toContain('<img src=x')
    expect(printed).not.toContain('onerror=alert(1)>')
    expect(printed).toContain(ESCAPED)
    return printed
  }

  it('prontuário: identificação, anamnese, exame, plano, evolução, faceograma e cabeçalho da clínica', async () => {
    const cfg = getSpecialtyConfig('odonto')
    const an = { [cfg.anamnesisFields[0][0]]: XSS }
    const ex = { [cfg.clinicalExamFields[0][0]]: XSS }
    const html = await run(() => printProntuario(evilClinic, evil, {
      anamnesis: { odonto: an }, clinical_exam: { odonto: ex }, treatment_plan: XSS,
      aesthetic_protocols: [{ id: 's', date: XSS, notes: '', annotations: [] }, { id: 't', date: `2026-01-01`, notes: XSS, annotations: [] }],
    } as never, [entry(XSS)], 'odonto'))
    // 11 campos de identificação + anamnese + exame + plano + evolução + faceograma (data e notas) + nome/endereço/telefone/rodapé da clínica
    expect(html.split(ESCAPED).length - 1).toBeGreaterThanOrEqual(20)
    expect(html).toContain(`<title>Prontuário – ${ESCAPED}</title>`)
  })

  it('evolução avulsa: texto da evolução, paciente, título e clínica', async () => {
    const html = await run(() => printEvolucao(evilClinic, evil, [entry(XSS)]))
    expect(html).toContain(`<title>Evolução – ${ESCAPED}</title>`)
  })

  it('orçamento: descrição, valor textual vindo do jsonb, observação (quebra de linha preservada) e paciente', async () => {
    const items = [{ id: '1', description: XSS, value: XSS as never }, { id: '2', description: 'ok', value: 10 }] as TreatmentPlanItem[]
    const html = await run(() => printOrcamento(evilClinic, evil, items, `linha1\n${XSS}`))
    expect(html).toContain(`linha1<br>${ESCAPED}`)
    expect(html).toContain(`<title>Orçamento – ${ESCAPED}</title>`)
    expect(html).toContain('R$')
  })

  it('contrato: texto (quebra de linha preservada), paciente, título e clínica', async () => {
    const html = await run(() => printContrato(evilClinic, evil, `cláusula 1\n${XSS}`))
    expect(html).toContain(`cláusula 1<br>${ESCAPED}`)
    expect(html).toContain(`<strong>${ESCAPED}</strong>`)
  })

  it('recibo: paciente, categoria, observação, forma de pagamento e clínica', async () => {
    const record = { created_at: '2026-10-20T12:00:00Z', total_amount: XSS, payment_method: XSS, category: XSS, notes: XSS } as unknown as FinancialRecord
    const html = await run(() => printRecibo(evilClinic, record, XSS))
    expect(html).toContain(`<title>Recibo – ${ESCAPED}</title>`)
    expect(html).toContain(`<strong>${ESCAPED}</strong>`)
    expect(html).toContain('R$')
  })

  it('o escape não estraga o texto normal nem acentos', async () => {
    printContrato({ name: 'Clínica São José & Filhos' }, { ...patient, name: 'Ana "Lu" Souza' } as Patient, 'Valor < R$ 100 & > 50')
    await vi.waitFor(() => expect(printed).not.toBe(''))
    expect(printed).toContain('Clínica São José &amp; Filhos')
    expect(printed).toContain('Ana &quot;Lu&quot; Souza')
    expect(printed).toContain('Valor &lt; R$ 100 &amp; &gt; 50')
  })

  it('logo: https e data:image passam; javascript:, http: e texto solto são descartados', async () => {
    printContrato({ name: 'C', logo: 'https://x.supabase.co/logo.png?a=1&b="2"' }, patient, 't')
    await vi.waitFor(() => expect(printed).not.toBe(''))
    expect(printed).toContain('<img src="https://x.supabase.co/logo.png?a=1&amp;b=&quot;2&quot;"')
    expect(safeImageUrl('data:image/png;base64,AAAA')).not.toBeNull()
    expect(safeImageUrl('/logo.png')).toBe('/logo.png')
    for (const bad of ['javascript:alert(1)', 'http://x/a.png', '//evil.com/a.png', '/\\evil.com', 'data:text/html;base64,AAAA', 'x" onerror="alert(1)', '', null, undefined, 42]) {
      expect(safeImageUrl(bad)).toBeNull()
    }
  })
})

describe('buildDocumentoHtml: fundo (papel timbrado)', () => {
  it('aceita https, data:image e caminho relativo', () => {
    expect(buildDocumentoHtml('x', 'https://x.supabase.co/bg.png')).toContain("background-image: url('https://x.supabase.co/bg.png')")
    expect(buildDocumentoHtml('x', 'data:image/png;base64,iVBOR/+=')).toContain("url('data:image/png;base64,iVBOR/+=')")
    expect(buildDocumentoHtml('x', '/timbrado.png')).toContain("url('/timbrado.png')")
  })

  it('descarta esquemas perigosos e sem fundo não escreve background-image', () => {
    for (const bad of ['javascript:alert(1)', 'http://x/a.png', 'data:text/html,<script>alert(1)</script>', '//evil.com/a.png']) {
      expect(buildDocumentoHtml('x', bad)).not.toContain('background-image')
    }
    expect(buildDocumentoHtml('x', null)).not.toContain('background-image')
  })

  it("aspas, parênteses e </style> dentro da URL não fecham a string nem o bloco", () => {
    const html = buildDocumentoHtml('x', "https://x.com/a.png');}</style><img/src=x/onerror=alert(1)>")
    expect(html).not.toContain('<img')
    expect(html.match(/<\/style>/g)).toHaveLength(1)
    expect(html).not.toContain("a.png')")
    expect(html).toContain("url('https://x.com/a.png%27%29;}%3C/style%3E%3Cimg/src=x/onerror=alert%281%29%3E')")
    // com espaço na URL, o fundo inteiro é descartado
    expect(buildDocumentoHtml('x', "https://x.com/a b.png")).not.toContain('background-image')
  })
})
