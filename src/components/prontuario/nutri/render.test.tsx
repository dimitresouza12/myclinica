import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Patient } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/print', () => ({ printDocumento: vi.fn() }))

import { AvaliacaoPanel } from './AvaliacaoPanel'
import { EvolucaoPanel } from './EvolucaoPanel'
import { DiarioPanel } from './DiarioPanel'
import { PlanoPanel } from './PlanoPanel'
import { ReceitasPanel } from './ReceitasPanel'
import { RecordatorioPanel } from './RecordatorioPanel'
import { avaliacaoVazia } from '@/lib/nutri/avaliacao'
import { planoVazio } from '@/lib/nutri/plano'
import { recordatorioVazio } from '@/lib/nutri/recordatorio'
import { carregarTaco } from '@/lib/nutri/alimentos'
import { anexarReceita, type Receita } from '@/lib/nutri/receitas'

// a TACO é carregada sob demanda; com ela já em memória a primeira renderização (síncrona) já tem os alimentos
await carregarTaco()

const patient = { id: 'p1', name: 'Maria Teste', birth_date: '1990-05-10', gender: 'Feminino' } as unknown as Patient
const clinica = { name: 'Clínica QA' }

const avaliacao = {
  ...avaliacaoVazia('F'), peso: '70', altura: '165', cintura: '82', quadril: '100',
  dobras: { triceps: '20', suprailiaca: '15', coxa: '25' }, protocolo: 'pollock3' as const,
}
const plano = (() => {
  const p = planoVazio('Plano de teste')
  p.meta = { kcal: 1800, proteinaG: 110, carboidratoG: 200, lipidioG: 55 }
  p.refeicoes[0].itens = [{ id: 'i1', alimentoId: 'taco-53', gramas: 50, medida: '1 pão francês (unidade)' }, { id: 'i2', alimentoId: 'taco-488', gramas: 100 }]
  return p
})()

const receita: Receita = {
  id: 'rc1', titulo: 'Panqueca de banana', porcoes: 2, tempo_preparo_min: 20, ingredientes: [{ texto: '1 banana' }, { texto: '2 ovos' }],
  modo_preparo: 'Misture e doure.', observacoes: null, created_at: '2026-06-01T10:00:00Z',
}

const linhasAval = [
  { id: 'a2', tipo: 'avaliacao' as const, data: '2026-06-01', dados: avaliacao, created_at: '2026-06-01T10:00:00Z' },
  { id: 'a1', tipo: 'avaliacao' as const, data: '2026-05-01', dados: { ...avaliacao, peso: '73' }, created_at: '2026-05-01T10:00:00Z' },
]

describe('renderização das telas de Nutrição', () => {
  it('avaliação preenchida mostra IMC, composição e meta', () => {
    const html = renderToString(<AvaliacaoPanel patient={patient} clinicId="c1" linhas={linhasAval} carregando={false} motivo={null} recarregar={async () => {}} />)
    expect(html).toContain('IMC')
    expect(html).toContain('Densidade corporal')
    expect(html).toContain('Meta calórica')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
  })
  it('avaliação sem histórico abre em branco e avisa quando o banco está indisponível', () => {
    const html = renderToString(<AvaliacaoPanel patient={patient} clinicId="c1" linhas={[]} carregando={false} motivo="sem_permissao" recarregar={async () => {}} />)
    expect(html).toContain('Nova avaliação')
    expect(html).toContain('Não foi possível salvar')
  })
  it('evolução desenha os quatro gráficos', () => {
    const html = renderToString(<EvolucaoPanel patient={patient} clinica={clinica} linhas={linhasAval} carregando={false} />)
    expect(html).toContain('Peso')
    expect(html).toContain('Massa magra')
    expect(html).toContain('Massa gorda')
    expect(html).toContain('Cintura')
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(html).not.toContain('NaN')
  })
  it('plano mostra refeições, progresso e lista de compras', () => {
    const linhas = [{ id: 'pl1', tipo: 'plano' as const, data: '2026-06-01', dados: plano, created_at: '2026-06-01T10:00:00Z' }]
    const html = renderToString(<PlanoPanel patient={patient} clinicId="c1" clinica={clinica} linhas={linhas} carregando={false} motivo={null} recarregar={async () => {}}
      metaSugerida={{ kcal: 1800, proteinaG: 110, carboidratoG: 200, lipidioG: 55 }} receitas={[]} />)
    expect(html).toContain('Pão, trigo, francês')
    expect(html).toContain('Lista de compras')
    expect(html).toContain('Café da manhã')
    expect(html).toContain('Lista de porções equivalentes')
    expect(html).toMatch(/1 porção = (<!-- -->)?150/)
    expect(html).toContain('Anexar receita')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
  })
  it('plano com receita anexada mostra a cópia da receita e permite trocar ou remover', () => {
    const comReceita = planoVazio('Com receita')
    comReceita.refeicoes[0].itens = [{ id: 'i1', alimentoId: 'taco-53', gramas: 50 }]
    comReceita.refeicoes[0].receita = anexarReceita(receita)
    const linhas = [{ id: 'pl2', tipo: 'plano' as const, data: '2026-06-01', dados: comReceita, created_at: '2026-06-01T10:00:00Z' }]
    const html = renderToString(<PlanoPanel patient={patient} clinicId="c1" clinica={clinica} linhas={linhas} carregando={false} motivo={null} recarregar={async () => {}}
      metaSugerida={null} receitas={[receita]} />)
    expect(html).toMatch(/Receita: (<!-- -->)?Panqueca de banana/)
    expect(html).toContain('Trocar receita')
    expect(html).toContain('Remover receita')
    expect(html).toContain('2 ingredientes')
    expect(html).not.toContain('NaN')
  })
  it('receitas: lista com resumo e ações; sem receitas, mostra o estado vazio; indisponível, avisa', () => {
    const html = renderToString(<ReceitasPanel patient={patient} clinicId="c1" clinica={clinica} receitas={[receita]} carregando={false} motivo={null} recarregar={async () => {}} />)
    expect(html).toContain('Banco de receitas da clínica')
    expect(html).toContain('Panqueca de banana')
    expect(html).toContain('2 porções | preparo 20 min | 2 ingredientes')
    expect(html).toContain('Editar')
    expect(html).toContain('Imprimir')
    const vazio = renderToString(<ReceitasPanel patient={patient} clinicId="c1" clinica={clinica} receitas={[]} carregando={false} motivo={null} recarregar={async () => {}} />)
    expect(vazio).toContain('Nenhuma receita cadastrada ainda')
    const off = renderToString(<ReceitasPanel patient={patient} clinicId="c1" clinica={clinica} receitas={[]} carregando={false} motivo="sem_tabela" recarregar={async () => {}} />)
    expect(off).toContain('ainda não está ativo')
    expect(off).not.toContain('Nenhuma receita cadastrada ainda')
    for (const h of [html, vazio, off]) expect(h).not.toMatch(/\p{Extended_Pictographic}/u)
  })
  it('diário: ao abrir, avisa que está carregando e explica como liberar o link do paciente', () => {
    const html = renderToString(<DiarioPanel patient={patient} clinicId="c1" />)
    expect(html).toContain('Diário alimentar')
    expect(html).toContain('Carregando diário')
    expect(html).toContain('marque Diário alimentar')
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
  })
  it('recordatório 24h mostra refeições, alimentos e total do dia; em branco, avisa que não há consumo', () => {
    const rec = recordatorioVazio()
    rec.refeicoes[0].horario = '07:30'
    rec.refeicoes[0].itens = [{ id: 'r1', alimentoId: 'taco-53', gramas: 50, medida: '1 pão francês (unidade)' }, { id: 'r2', alimentoId: 'taco-488', gramas: 100 }]
    const linhas = [{ id: 'rc1', tipo: 'recordatorio' as const, data: '2026-06-01', dados: rec, created_at: '2026-06-01T10:00:00Z' }]
    const html = renderToString(<RecordatorioPanel patient={patient} clinicId="c1" linhas={linhas} carregando={false} motivo={null} recarregar={async () => {}}
      metaSugerida={{ kcal: 1800, proteinaG: 110, carboidratoG: 200, lipidioG: 55 }} />)
    expect(html).toContain('Recordatório 24 horas')
    expect(html).toContain('Pão, trigo, francês')
    expect(html).toContain('Café da manhã')
    expect(html).toContain('07:30')
    expect(html).toContain('da meta de energia')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
    const vazio = renderToString(<RecordatorioPanel patient={patient} clinicId="c1" linhas={[]} carregando={false} motivo="sem_tabela" recarregar={async () => {}} metaSugerida={null} />)
    expect(vazio).toContain('Sem consumo informado nesta refeição.')
    expect(vazio).toContain('Salvar recordatório')
    // recordatório novo e vazio: Salvar desabilitado (não cria linha vazia)
    expect(vazio).toMatch(/<button[^>]*disabled[^>]*>[^<]*(<[^>]+>)*[^<]*Salvar recordatório/)
    expect(vazio).toContain('ainda não está ativo')
    expect(vazio).not.toContain('NaN')
  })
})
