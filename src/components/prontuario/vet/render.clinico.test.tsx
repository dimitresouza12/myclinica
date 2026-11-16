import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { AuthClinic, Patient } from '@/types'
import { combinarDataHora, turnoDoInstante, type Internacao, type ItemInternacao } from '@/lib/vet/internacao'
import { campoVazio, exameVazio, itemDoCatalogo, exameDoCatalogoVet, resultadoVazio, type ExameVetLinha } from '@/lib/vet/exames'

// a gravação e as consultas ficam fora do teste de renderização
vi.mock('@/lib/vet/clinicoStorage', () => ({
  MENSAGEM_INDISPONIVEL: { sem_tabela: 'sem tabela', sem_permissao: 'sem permissao', erro: 'erro' },
  salvarInternacao: vi.fn(), salvarItemDeInternacao: vi.fn(), excluirInternacao: vi.fn(), excluirItemDeInternacao: vi.fn(),
  salvarExameVet: vi.fn(), excluirExameVet: vi.fn(), subirAnexoExame: vi.fn(), removerAnexosExame: vi.fn(), urlsDosAnexos: vi.fn(async () => ({})),
}))

import { InternacaoPanel } from './InternacaoPanel'
import { ExamesPetPanel } from './ExamesPetPanel'

const clinic = { id: 'c1', name: 'Clínica Pet', type: 'vet', address: 'Rua A', phone: '85999990000' } as unknown as AuthClinic
const patient = { id: 'p1', name: 'Maria Silva', phone: '85988881111', pet_name: 'Thor', pet_species: 'Canino' } as unknown as Patient
const prof = { nome: 'Dra. Ana', registro: 'CRMV-CE 1', rqe: '' }
const noop = async () => {}

const entrada = combinarDataHora('2026-11-14', '10:00')!
const aberta: Internacao = { id: 'i1', status: 'internado', entrada_em: entrada, saida_em: null, leito: 'Baia 3', motivo: 'Vômitos', dados: { v: 1, diagnostico: 'Gastroenterite', alta: null }, created_at: entrada }
const encerrada: Internacao = { ...aberta, id: 'i0', status: 'alta', saida_em: combinarDataHora('2026-11-10', '10:00'), entrada_em: combinarDataHora('2026-11-08', '09:00')!, dados: { v: 1, diagnostico: '', alta: { resumo: 'Boa evolução', medicacaoPos: '', orientacoes: '', retornoEm: '', profissional: null } } }
const evolIso = combinarDataHora('2026-11-15', '08:30')!
const itens: ItemInternacao[] = [
  { id: 'e1', internacao_id: 'i1', tipo: 'evolucao', registrado_em: evolIso, turno: turnoDoInstante(evolIso), dados: { v: 1, texto: 'Aceitou água', temperaturaC: 38.4, fc: null, fr: null }, created_at: evolIso },
  { id: 'p1', internacao_id: 'i1', tipo: 'prescricao', registrado_em: entrada, turno: 'manha', dados: { v: 1, medicamento: 'Ondansetrona', dose: '0,5 mg/kg', via: 'Intravenosa', frequencia: 'A cada 12 horas', observacao: '', suspensa: true }, created_at: entrada },
]

const base = { patient, clinic, clinicId: 'c1', profissional: prof, recarregar: noop, pesoKg: 12.4, ativo: true, onDirtyChange: () => {} }

describe('aba Saúde do pet: internação', () => {
  it('internado: mostra leito, dia, prescrição suspensa, evolução por turno e o botão de alta; não deixa internar de novo', () => {
    const html = renderToString(<InternacaoPanel {...base} internacoes={[aberta, encerrada]} itens={itens} carregando={false} motivo={null} />)
    expect(html).toContain('Este pet está internado.')
    expect(html).toContain('Baia 3')
    expect(html).toContain('Ondansetrona')
    expect(html).toContain('Suspensa')
    expect(html).toContain('Manhã')
    expect(html).toContain('Aceitou água')
    expect(html).toContain('Dar alta ou encerrar')
    expect(html).toContain('Imprimir ficha')
    expect(html).toContain('Um pet só pode ter uma internação aberta')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
  })
  it('só histórico encerrado: oferece internar e imprimir o resumo de alta', () => {
    const html = renderToString(<InternacaoPanel {...base} internacoes={[encerrada]} itens={[]} carregando={false} motivo={null} />)
    expect(html).toContain('Internar')
    expect(html).not.toContain('Dar alta ou encerrar')
    expect(html).toContain('Alta')
  })
  it('sem nada: convite a registrar; tabela ausente: aviso e botão desligado', () => {
    expect(renderToString(<InternacaoPanel {...base} internacoes={[]} itens={[]} carregando={false} motivo={null} />)).toContain('Nenhuma internação')
    const html = renderToString(<InternacaoPanel {...base} internacoes={[]} itens={[]} carregando={false} motivo="sem_tabela" />)
    expect(html).toContain('sem tabela')
    expect(html).toContain('disabled')
    expect(renderToString(<InternacaoPanel {...base} internacoes={[]} itens={[]} carregando motivo={null} />)).toContain('Carregando')
  })
})

describe('aba Saúde do pet: exames', () => {
  const linhaSolicitada: ExameVetLinha = {
    id: 'x1', status: 'solicitado', data: '2026-11-15', created_at: '2026-11-15T10:00:00Z',
    dados: { ...exameVazio(), urgencia: 'urgente', indicacao: 'Apatia', itens: [itemDoCatalogo(exameDoCatalogoVet('hemograma')!)] },
  }
  const linhaComResultado: ExameVetLinha = {
    id: 'x2', status: 'com_resultado', data: '2026-11-10', created_at: '2026-11-10T10:00:00Z',
    dados: {
      ...exameVazio(), itens: [itemDoCatalogo(exameDoCatalogoVet('bioquimico-basico')!)],
      resultado: { ...resultadoVazio('2026-11-11'), laboratorio: 'Lab Vet', campos: [{ ...campoVazio('Creatinina', 'mg/dL', 'a'), valor: '3,1', referencia: '0,5 - 1,5' }] },
    },
  }
  it('histórico: aguardando resultado, urgente, valores fora da referência e ações com nome acessível', () => {
    const html = renderToString(<ExamesPetPanel {...base} exames={[linhaSolicitada, linhaComResultado]} carregando={false} motivo={null} />)
    expect(html).toContain('Aguardando resultado')
    expect(html).toContain('Urgente')
    expect(html).toContain('Com resultado')
    expect(html).toContain('1 fora da referência')
    expect(html).toContain('Lab Vet')
    expect(html).toContain('Registrar o resultado do exame de 15/11/2026')
    expect(html).toContain('Imprimir o resultado de 10/11/2026')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
  })
  it('vazio e tabela ausente', () => {
    expect(renderToString(<ExamesPetPanel {...base} exames={[]} carregando={false} motivo={null} />)).toContain('Nenhum exame')
    const html = renderToString(<ExamesPetPanel {...base} exames={[]} carregando={false} motivo="sem_permissao" />)
    expect(html).toContain('sem permissao')
  })
})
