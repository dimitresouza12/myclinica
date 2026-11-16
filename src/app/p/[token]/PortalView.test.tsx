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
  it('exercícios: mostra o programa com vídeo e o botão de marcar; sem o escopo nada aparece', () => {
    const exercises = {
      today: '2026-11-30',
      programs: [{
        id: 'p1', title: 'Casa', notes: 'ORIENTACAO-GERAL',
        items: [
          { id: 'i1', name: 'PONTE-GLUTEA', description: 'Deite de costas', region: 'Coluna lombar', sets: 3, reps: '10', timesPerWeek: 3, notes: null, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', imageUrl: null, doneToday: false, doneLast7: 1 },
          { id: 'i2', name: 'AGACHAMENTO', description: null, region: null, sets: null, reps: null, timesPerWeek: 7, notes: null, videoUrl: null, imageUrl: null, doneToday: true, doneLast7: 4 },
        ],
      }],
    }
    const html = renderToString(<PortalView data={{ ...base, scopes: ['exercicios'], exercises }} token="t" />)
    for (const x of ['Seus exercícios', 'PONTE-GLUTEA', '3 séries de 10 repetições', '3 dias por semana', 'Assistir ao vídeo', 'Marcar como feito hoje', 'Feito hoje. Toque para desfazer', '1 de 3 vezes']) expect(html).toContain(x)
    expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"')
    expect(html).not.toContain('Próximas consultas')
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(renderToString(<PortalView data={{ ...base, exercises }} token="t" />)).not.toContain('PONTE-GLUTEA')
    expect(renderToString(<PortalView data={{ ...base, scopes: ['exercicios'], exercises: { today: '2026-11-30', programs: [] } }} token="t" />)).toContain('ainda não foi publicado')
  })
  it('documento já assinado não mostra o formulário', () => {
    const html = renderToString(<PortalView data={{ ...base, scopes: ['assinatura'], documents: [{ ...base.documents![0], contentText: '', signedAt: '2026-11-17T15:00:00Z' }] }} token="t" />)
    expect(html).toContain('Assinado em')
    expect(html).not.toContain('Assinar documento')
  })
})
