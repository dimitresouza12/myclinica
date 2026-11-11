import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { PortalView } from './PortalView'
import type { PortalPageData } from '@/lib/portal/server'

const base: PortalPageData = {
  clinicName: 'Clínica Sol', firstName: 'Maria', petName: null, scopes: ['proximas_consultas'], expiresAt: '2026-11-24T12:00:00Z',
  message: 'TEXTO-ORIENTACAO', appointments: [{ whenIso: '2026-11-20T13:00:00Z', procedure: 'Retorno', professional: 'Dra. Ana', confirmed: true }],
  vaccines: [{ kind: 'vacina', name: 'V10', batch: null, manufacturer: null, appliedOn: '2026-01-10', nextDueOn: '2026-12-01', dueState: 'proxima' }],
  weights: [{ date: '2026-03-01', kg: 10.5 }],
  plan: { title: 'Plano X', meals: [{ name: 'Almoço', time: '12:00', items: [{ food: 'ARROZ-SECRETO', grams: 100, measure: null }], note: null }], notes: null },
  documents: [{ id: 'd1', title: 'TCLE da clínica', docType: 'tcle', contentText: 'CORPO-DO-TERMO', signedAt: null }],
}

describe('PortalView mostra só o escopo liberado', () => {
  it('só consultas: nada de plano, vacinas, orientações nem documentos', () => {
    const html = renderToString(<PortalView data={base} token="t" />)
    expect(html).toContain('Próximas consultas')
    expect(html).toContain('Maria')
    for (const x of ['ARROZ-SECRETO', 'V10', 'TEXTO-ORIENTACAO', 'CORPO-DO-TERMO', 'Documentos para assinar']) expect(html).not.toContain(x)
  })
  it('escopos extras aparecem, com aviso de assinatura simples', () => {
    const html = renderToString(<PortalView data={{ ...base, scopes: ['plano_alimentar', 'vacinas_peso', 'orientacoes', 'assinatura'] }} token="t" />)
    for (const x of ['ARROZ-SECRETO', 'V10', 'TEXTO-ORIENTACAO', 'CORPO-DO-TERMO']) expect(html).toContain(x)
    expect(html).toContain('ICP-Brasil')
    expect(html).not.toContain('Próximas consultas')
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
  })
  it('documento já assinado não mostra o formulário', () => {
    const html = renderToString(<PortalView data={{ ...base, scopes: ['assinatura'], documents: [{ ...base.documents![0], contentText: '', signedAt: '2026-11-17T15:00:00Z' }] }} token="t" />)
    expect(html).toContain('Assinado em')
    expect(html).not.toContain('Assinar documento')
  })
})
