import { describe, expect, it } from 'vitest'
import { shapeExercicios, type LinhaItemPublico } from './portalView'

const item = (o: Partial<LinhaItemPublico>): LinhaItemPublico => ({
  id: 'i1', prescricao_id: 'p1', name: 'Ponte', description: ' Deite de costas ', region: 'lombar', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  image_path: 'exercicios/c1/e1/a.webp', sets: 3, reps: '10', times_per_week: 3, notes: null, sort_order: 0, ...o,
})

describe('shapeExercicios (página pública do paciente)', () => {
  const base = {
    prescricoes: [{ id: 'p1', title: 'Casa', notes: '  Respeite a dor  ' }],
    execucoes: [{ item_id: 'i1', done_on: '2026-11-30' }, { item_id: 'i1', done_on: '2026-11-28' }, { item_id: 'i2', done_on: '2026-11-30' }],
    imagens: new Map([['exercicios/c1/e1/a.webp', 'https://x.supabase.co/assinada?token=t']]),
    hoje: '2026-11-30',
  }

  it('mostra o programa com dose, vídeo, foto assinada e a marcação de hoje', () => {
    const r = shapeExercicios({ ...base, itens: [item({}), item({ id: 'i2', name: 'Agachamento', sort_order: 1, video_url: null, image_path: null })] })
    expect(r.today).toBe('2026-11-30')
    expect(r.programs[0]).toMatchObject({ id: 'p1', title: 'Casa', notes: 'Respeite a dor' })
    expect(r.programs[0].items[0]).toMatchObject({
      id: 'i1', name: 'Ponte', description: 'Deite de costas', region: 'Coluna lombar', sets: 3, reps: '10', timesPerWeek: 3,
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', imageUrl: 'https://x.supabase.co/assinada?token=t', doneToday: true, doneLast7: 2,
    })
    expect(r.programs[0].items[1]).toMatchObject({ id: 'i2', videoUrl: null, imageUrl: null, doneToday: true, doneLast7: 1 })
  })

  it('ordena pelo sort_order e agrupa por programa', () => {
    const r = shapeExercicios({
      ...base,
      prescricoes: [{ id: 'p1', title: 'A', notes: null }, { id: 'p2', title: 'B', notes: null }],
      itens: [item({ id: 'x', sort_order: 2 }), item({ id: 'y', sort_order: 0 }), item({ id: 'z', prescricao_id: 'p2' })],
    })
    expect(r.programs[0].items.map(i => i.id)).toEqual(['y', 'x'])
    expect(r.programs[1].items.map(i => i.id)).toEqual(['z'])
  })

  it('não vaza caminho do Storage, ids internos nem vídeo fora do padrão', () => {
    const r = shapeExercicios({ ...base, itens: [item({ video_url: 'https://evil.com/x', image_path: 'exercicios/outra/x.jpg' })] })
    const json = JSON.stringify(r)
    expect(r.programs[0].items[0].videoUrl).toBeNull()
    expect(r.programs[0].items[0].imageUrl).toBeNull()
    for (const proibido of ['exercicios/', 'clinic', 'professional', 'evil.com', 'prescricao_id', 'image_path']) expect(json).not.toContain(proibido)
  })

  it('sem programa ativo devolve lista vazia', () => {
    expect(shapeExercicios({ ...base, prescricoes: [], itens: [] }).programs).toEqual([])
  })
})
