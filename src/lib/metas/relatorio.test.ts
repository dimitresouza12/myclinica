import { describe, expect, it } from 'vitest'
import { buildRelatorioHtml, resumoTexto, type RelatorioInput } from './relatorio'
import type { Assessment, Goal, GoalLog } from './types'

const goal: Goal = { id: 'g1', clinic_id: 'c', patient_id: 'p', area: 'fono', title: 'Produzir /r/ <b>medial</b>', domain: 'Fala e articulação', criterion: '80% de acerto', target_date: '2026-06-30', status: 'em_andamento', sort_order: 0, professional_id: null, created_at: '', updated_at: '' }
const mk = (d: string, r: GoalLog['result'], note: string | null = null): GoalLog => ({ id: d, clinic_id: 'c', patient_id: 'p', goal_id: 'g1', log_date: d, result: r, note, professional_id: null, created_at: d + 'T10:00:00Z' })
const logs = [mk('2026-03-02', 'nao_adquirido'), mk('2026-03-09', 'com_pista', 'precisou de modelo'), mk('2026-03-16', 'adquirido')]
const assessments: Assessment[] = [{ id: 'a', clinic_id: 'c', patient_id: 'p', kind: 'quadro_fonemico', assessed_on: '2026-03-10', data: { cells: { 'p|ini': 'c', 'ɾ|med': 's' } }, professional_id: null, created_at: '', updated_at: '' }]

const base: RelatorioInput = {
  area: 'fono', publico: 'convenio', from: '2026-03-01', to: '2026-03-31',
  clinic: { name: 'Clínica Teste' }, patient: { name: 'Maria', birth_date: '2019-05-04' },
  professional: { name: 'Ana', registration: 'CREFONO 1/2345' },
  goals: [goal], logs, assessments, observacoes: '', emitidoEm: '2026-04-01',
}

describe('relatório evolutivo', () => {
  it('resumo automático conta sessões e metas', () => {
    const t = resumoTexto(base)
    expect(t).toContain('3 sessões')
    expect(t).toContain('1 meta')
    expect(t).toContain('0%')
    expect(t).toContain('100%')
  })
  it('sem registros no período avisa', () => {
    expect(resumoTexto({ ...base, from: '2027-01-01', to: '2027-01-31' })).toContain('não há registros')
  })
  it('escapa texto digitado e traz a meta, o gráfico e a assinatura', () => {
    const html = buildRelatorioHtml(base)
    expect(html).toContain('&lt;b&gt;medial&lt;/b&gt;')
    expect(html).not.toContain('<b>medial</b>')
    expect(html).toContain('<svg')
    expect(html).toContain('CREFONO 1/2345')
    expect(html).toContain('Percentual de consoantes corretas')
    expect(html).toContain('50%')
  })
  it('escola não leva contagem clínica, quadro fonêmico nem notas', () => {
    const html = buildRelatorioHtml({ ...base, publico: 'escola', observacoes: 'Sentar perto da professora' })
    expect(html).toContain('Relatório para a escola')
    expect(html).not.toContain('Quadro fonêmico')
    expect(html).not.toContain('precisou de modelo')
    expect(html).toContain('Orientações para a escola')
  })
  it('neuropediatra leva as notas de sessão', () => {
    expect(buildRelatorioHtml({ ...base, publico: 'neuropediatra' })).toContain('precisou de modelo')
  })
  it('psico/fisio não puxam avaliação de fono', () => {
    const html = buildRelatorioHtml({ ...base, area: 'fisio' })
    expect(html).not.toContain('Quadro fonêmico')
  })
  it('psicologia não leva nota de sessão nem para o neuropediatra', () => {
    const html = buildRelatorioHtml({ ...base, area: 'psico', publico: 'neuropediatra', goals: [{ ...goal, area: 'psico' }] })
    expect(html).not.toContain('precisou de modelo')
    expect(html).not.toContain('Observações de sessão')
  })
  it('escapa a data de nascimento fora do padrão', () => {
    const html = buildRelatorioHtml({ ...base, patient: { name: 'Maria', birth_date: '<img src=x onerror=alert(1)>' } })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})
