import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/print', () => ({ printDocumento: vi.fn() }))

import { htmlPrograma } from './imprimir'
import type { ItemPrescricao, Prescricao } from './exercicios'

const presc: Prescricao = { id: 'p', title: 'Programa <b>de casa</b>', notes: 'Faça com calma & respire', status: 'ativa', started_on: '2026-11-20', ended_on: null, professional_id: null, created_at: '' }
const item = (o: Partial<ItemPrescricao>): ItemPrescricao => ({
  id: 'i', prescricao_id: 'p', exercicio_id: null, name: 'Ponte', description: 'Deite de costas', region: 'lombar', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  image_path: 'exercicios/c/e/a.webp', sets: 3, reps: '10', times_per_week: 3, notes: 'Sem carga', sort_order: 0, ...o,
})
const cab = { clinica: 'Clínica Sol', paciente: 'Maria', emitidoEm: '2026-11-30' }

describe('htmlPrograma', () => {
  it('traz os dados do programa, dose, frequência, vídeo e assinatura', () => {
    const html = htmlPrograma(cab, presc, [item({})], new Map(), { nome: 'Ana', registro: 'CREFITO 123' })
    for (const t of ['Programa de exercícios', 'Maria', 'Ponte', '3 séries de 10 repetições', '3 dias por semana', 'Região: Coluna lombar', 'Sem carga', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Ana - CREFITO 123', '30/11/2026', '20/11/2026']) expect(html).toContain(t)
  })
  it('escapa o que o usuário digitou', () => {
    const html = htmlPrograma({ ...cab, clinica: '<script>x</script>' }, presc, [item({ name: '<img src=x onerror=1>' })], new Map(), null)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('Programa &lt;b&gt;de casa&lt;/b&gt;')
    expect(html).toContain('Faça com calma &amp; respire')
  })
  it('foto entra só com URL http(s) segura; sem assinatura vira linha em branco', () => {
    const fotos = new Map([['exercicios/c/e/a.webp', 'https://x.supabase.co/a?token=1']])
    expect(htmlPrograma(cab, presc, [item({})], fotos, null)).toContain('<img src="https://x.supabase.co/a?token=1"')
    expect(htmlPrograma(cab, presc, [item({})], new Map([['exercicios/c/e/a.webp', 'javascript:alert(1)']]), null)).not.toContain('<img')
    expect(htmlPrograma(cab, presc, [item({})], new Map(), null)).toContain('______')
  })
  it('programa sem exercício avisa; ordem segue sort_order', () => {
    expect(htmlPrograma(cab, presc, [], new Map(), null)).toContain('Nenhum exercício neste programa.')
    const html = htmlPrograma(cab, presc, [item({ id: 'b', name: 'Segundo', sort_order: 1 }), item({ id: 'a', name: 'Primeiro', sort_order: 0 })], new Map(), null)
    expect(html.indexOf('Primeiro')).toBeLessThan(html.indexOf('Segundo'))
  })
  it('sem emoji', () => {
    expect(htmlPrograma(cab, presc, [item({})], new Map(), null)).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
