import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { printEvolucao, printProntuario } from './print'
import type { MedicalRecord, Patient, RecordEntry } from '@/types'

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
