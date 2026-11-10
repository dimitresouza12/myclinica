import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { printProntuario } from './print'
import type { MedicalRecord, Patient } from '@/types'

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

  it('imprime as sessões do faceograma em ordem de data, com pontos numerados', async () => {
    const html = await print({
      aesthetic_protocols: [
        { id: 's2', date: '2026-10-20', notes: '', annotations: [{ id: 'a', x: 150, y: 124, type: 'toxina', qty: '20U', note: 'glabela', region: 'Glabela' }, { id: 'b', x: 60, y: 90, type: 'toxina', qty: '4 u', note: '', region: 'Têmpora (direito)' }] },
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
    expect(html).toContain('http://localhost:3000/rosto.webp')
  })
})
