import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AuthClinic, Patient } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/print', () => ({ printDocumento: vi.fn() }))

import { GraficoGonio } from './GraficoGonio'
import { BibliotecaPanel } from './BibliotecaPanel'
import { ProgramaPanel } from './ProgramaPanel'
import type { Exercicio, ItemPrescricao, Prescricao } from '@/lib/fisio/exercicios'
import type { Medida } from '@/lib/fisio/goniometria'

const medida = (id: string, measured_on: string, angle_deg: number): Medida => ({
  id, measured_on, joint: 'ombro', movement: 'flexao', side: 'direito', mode: 'ativo', angle_deg, reference_deg: 180, note: null, created_at: `${measured_on}T10:00:00Z`,
})

const comProvider = (node: React.ReactNode) => renderToString(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>)

const patient = { id: 'p1', name: 'Maria Teste' } as unknown as Patient
const clinic = { id: 'c1', name: 'Clínica QA', type: 'fisio' } as unknown as AuthClinic

const ex: Exercicio = { id: 'e1', name: 'Ponte glútea', description: null, region: 'lombar', default_sets: 3, default_reps: '12', video_url: null, image_path: null, active: true, created_at: '' }
const presc: Prescricao = { id: 'pr1', title: 'Programa de casa', notes: null, status: 'ativa', started_on: '2026-11-20', ended_on: null, professional_id: null, created_at: '' }
const item: ItemPrescricao = { id: 'it1', prescricao_id: 'pr1', exercicio_id: 'e1', name: 'Ponte glútea', description: null, region: 'lombar', video_url: 'https://vimeo.com/123456789', image_path: null, sets: 3, reps: '12', times_per_week: 3, notes: null, sort_order: 0 }

describe('renderização das abas de fisioterapia', () => {
  it('gráfico de goniometria com várias medidas, uma só e nenhuma, com a linha de referência', () => {
    const html = renderToString(<GraficoGonio pontos={[medida('a', '2026-11-01', 60), medida('b', '2026-11-10', 90), medida('c', '2026-11-20', 120)]} referencia={180} />)
    expect(html).toContain('<svg')
    expect(html).toContain('Referência 180°')
    expect(html).toContain('120°')
    expect(html).not.toContain('NaN')
    expect(renderToString(<GraficoGonio pontos={[medida('a', '2026-11-01', 60)]} referencia={null} />)).not.toContain('NaN')
    expect(renderToString(<GraficoGonio pontos={[]} referencia={180} />)).toContain('Sem medidas ainda')
  })

  it('biblioteca vazia orienta e biblioteca com dados lista o exercício', () => {
    const vazia = comProvider(<BibliotecaPanel clinicId="c1" exercicios={[]} carregando={false} motivo={null} fotos={new Map()} />)
    expect(vazia).toContain('Biblioteca vazia')
    expect(vazia).toContain('Novo exercício')
    const cheia = comProvider(<BibliotecaPanel clinicId="c1" exercicios={[ex]} carregando={false} motivo={null} fotos={new Map()} />)
    expect(cheia).toContain('Ponte glútea')
    expect(cheia).toContain('3 séries de 12 repetições')
    expect(cheia).toContain('Coluna lombar')
  })

  it('biblioteca avisa quando as tabelas ainda não existem', () => {
    const html = comProvider(<BibliotecaPanel clinicId="c1" exercicios={[]} carregando={false} motivo="sem_tabela" fotos={new Map()} />)
    expect(html).toContain('ainda não estão ativos')
  })

  const props = { patient, clinic, clinicId: 'c1', carregando: false, motivo: null, biblioteca: [ex], fotos: new Map<string, string>(), profissionais: [], profissionalAtualId: null, irParaBiblioteca: () => {} }

  it('programa ativo mostra adesão, exercícios, última marcação e histórico de execução', () => {
    const hoje = new Date().toISOString().slice(0, 10)
    const html = comProvider(<ProgramaPanel {...props} programas={[{ prescricao: presc, itens: [item] }]} execucoes={[{ item_id: 'it1', done_on: hoje }]} />)
    for (const t of ['Programa de casa', 'Ativo', 'Adesão nos últimos 7 dias', 'Ponte glútea', '3 dias por semana', 'Abrir vídeo do exercício', 'Histórico de execução']) expect(html).toContain(t)
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('sem programa mostra o estado vazio e o botão de criar', () => {
    const html = comProvider(<ProgramaPanel {...props} programas={[]} execucoes={[]} />)
    expect(html).toContain('Sem programa de exercícios')
    expect(html).toContain('Novo programa')
  })
})
