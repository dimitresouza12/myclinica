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
  it('plano com receita anexada mostra ingredientes e modo de preparo para o paciente', () => {
    const plan = {
      title: 'Plano Y',
      meals: [{ name: 'Lanche', time: '16:00', items: [{ food: 'BANANA-X', grams: 100, measure: null }], note: null,
        recipe: { title: 'PANQUECA-X', servings: 2, minutes: 20, ingredients: ['ING-UM', 'ING-DOIS'], steps: 'PASSOS-X' } }],
      notes: null,
    }
    const html = renderToString(<PortalView data={{ ...base, scopes: ['plano_alimentar'], plan }} token="t" />)
    for (const x of ['Receita: PANQUECA-X', '2 porções', 'preparo 20 min', 'Ingredientes', 'ING-UM', 'ING-DOIS', 'Modo de preparo', 'PASSOS-X']) expect(html).toContain(x)
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
    // refeição sem receita não ganha o bloco
    const sem = renderToString(<PortalView data={{ ...base, scopes: ['plano_alimentar'] }} token="t" />)
    expect(sem).not.toContain('Modo de preparo')
  })
  it('diário alimentar: formulário e registros só com o escopo; foto, horário e apagar de hoje e ontem', () => {
    const diary = {
      today: '2026-11-16',
      entries: [
        { id: 'e1', dia: '2026-11-16', refeicao: 'almoco' as const, horario: '12:30', descricao: 'DESC-ALMOCO', fotoUrl: 'https://x/foto.webp', podeApagar: true },
        { id: 'e2', dia: '2026-11-10', refeicao: 'ceia' as const, horario: null, descricao: 'DESC-CEIA', fotoUrl: null, podeApagar: false },
      ],
    }
    const html = renderToString(<PortalView data={{ ...base, scopes: ['diario'], diary }} token="t" />)
    for (const x of ['Diário alimentar', 'Registrar refeição', 'Hoje', 'Ontem', 'Escolha a refeição', 'Café da manhã', 'DESC-ALMOCO', '12:30', 'DESC-CEIA', 'Adicionar foto (opcional)', 'Seus registros']) expect(html).toContain(x)
    expect(html).toContain('src="https://x/foto.webp"')
    expect((html.match(/Apagar registro/g) ?? []).length).toBe(1)
    expect(html).toContain('10/11/2026')
    expect(html).not.toContain('Próximas consultas')
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(renderToString(<PortalView data={{ ...base, diary }} token="t" />)).not.toContain('DESC-ALMOCO')
    expect(renderToString(<PortalView data={{ ...base, scopes: ['diario'], diary: { today: '2026-11-16', entries: [] } }} token="t" />)).toContain('Nenhuma refeição registrada')
  })
  it('documento já assinado não mostra o formulário', () => {
    const html = renderToString(<PortalView data={{ ...base, scopes: ['assinatura'], documents: [{ ...base.documents![0], contentText: '', signedAt: '2026-11-17T15:00:00Z' }] }} token="t" />)
    expect(html).toContain('Assinado em')
    expect(html).not.toContain('Assinar documento')
  })
})
