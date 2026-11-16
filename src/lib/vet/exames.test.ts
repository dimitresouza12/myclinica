import { describe, expect, it } from 'vitest'
import {
  adicionarLivre, alternarExame, avaliarReferencia, camposDoModelo, camposPreenchidos, campoVazio, caminhoAnexoExame, caminhoDeAnexoValido,
  exameDoCatalogoVet, exameVazio, htmlResultadoExames, htmlSolicitacaoExames, itemDoCatalogo, MAX_ITENS, normalizarExame, numeroDoLaudo,
  prepararParaGravar, problemaDoArquivo, resultadoVazio, resumoDoExame, tamanhoLegivel, validarResultado, validarSolicitacao, type ExameVetDados,
} from './exames'

const cab = {
  clinica: 'Clínica Pet & Cia', detalhe: 'Rua A, 10', pet: 'Thor', tutor: 'Maria <b>Silva</b>', animal: 'Canino | SRD',
  data: '2026-11-16', profissional: { nome: 'Dra. Ana Lima', registro: 'CRMV-CE 1234', rqe: '' },
}
const CLINICA = '3f2b8a52-1c4e-4f8a-9b7d-0a1b2c3d4e5f'
const PET = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

describe('solicitação', () => {
  const hemo = exameDoCatalogoVet('hemograma')!
  it('marca, desmarca, aceita exame livre sem repetir e respeita o limite', () => {
    let itens = alternarExame([], hemo)
    expect(itens).toEqual([{ id: 'hemograma', nome: 'Hemograma completo', categoria: 'Laboratoriais' }])
    expect(alternarExame(itens, hemo)).toEqual([])
    itens = adicionarLivre(itens, '  Teste   de  alergia ')
    expect(itens[1]).toEqual({ id: null, nome: 'Teste de alergia', categoria: 'Outros exames' })
    expect(adicionarLivre(itens, 'teste de ALERGIA')).toHaveLength(2)
    expect(adicionarLivre(itens, '   ')).toHaveLength(2)
    const cheio = Array.from({ length: MAX_ITENS }, (_, i) => ({ id: null, nome: `E${i}`, categoria: 'Outros exames' }))
    expect(alternarExame(cheio, hemo)).toHaveLength(MAX_ITENS)
  })
  it('valida e resume', () => {
    const d = exameVazio()
    expect(validarSolicitacao(d)).toEqual(['Escolha pelo menos um exame.'])
    expect(validarSolicitacao({ ...d, itens: [itemDoCatalogo(hemo)] })).toEqual([])
    expect(resumoDoExame(d)).toBe('Sem exames')
    const tres = { ...d, itens: [{ id: null, nome: 'A', categoria: 'x' }, { id: null, nome: 'B', categoria: 'x' }, { id: null, nome: 'C', categoria: 'x' }] }
    expect(resumoDoExame(tres)).toBe('A, B e mais 1')
  })
})

describe('número e referência do laudo', () => {
  it('lê vírgula, ponto e milhar', () => {
    expect(numeroDoLaudo('5,5')).toBe(5.5)
    expect(numeroDoLaudo('5.5')).toBe(5.5)
    expect(numeroDoLaudo('12.500')).toBe(12500)
    expect(numeroDoLaudo('12.500,5')).toBe(12500.5)
    expect(numeroDoLaudo(' 38 ')).toBe(38)
    expect(numeroDoLaudo('')).toBeNull()
    expect(numeroDoLaudo('ausente')).toBeNull()
    expect(numeroDoLaudo('1.2.3')).toBeNull()
  })
  it('faixa: baixo, alto e na faixa', () => {
    expect(avaliarReferencia('4,2', '5,5 - 8,5')).toBe('baixo')
    expect(avaliarReferencia('9', '5,5 a 8,5')).toBe('alto')
    expect(avaliarReferencia('6', '5,5–8,5')).toBe('normal')
    expect(avaliarReferencia('5,5', '5,5 - 8,5')).toBe('normal')
    expect(avaliarReferencia('8.000', '6.000 - 17.000')).toBe('normal')
    expect(avaliarReferencia('20.000', '6.000 - 17.000')).toBe('alto')
  })
  it('limite: menor, maior e até', () => {
    expect(avaliarReferencia('12', '< 10')).toBe('alto')
    expect(avaliarReferencia('10', '< 10')).toBe('alto')
    expect(avaliarReferencia('9', '< 10')).toBe('normal')
    expect(avaliarReferencia('10', 'até 10')).toBe('normal')
    expect(avaliarReferencia('11', 'até 10')).toBe('alto')
    expect(avaliarReferencia('2', '>= 3')).toBe('baixo')
    expect(avaliarReferencia('3', '>= 3')).toBe('normal')
    expect(avaliarReferencia('3', '> 3')).toBe('baixo')
  })
  it('sem número ou sem faixa, não marca nada', () => {
    expect(avaliarReferencia('positivo', '5 - 8')).toBeNull()
    expect(avaliarReferencia('6', 'negativo')).toBeNull()
    expect(avaliarReferencia('6', '')).toBeNull()
    expect(avaliarReferencia('6', '9 - 5')).toBeNull()
  })
})

describe('resultado', () => {
  const hoje = '2026-11-16'
  it('modelos trazem campos em branco com unidade, sem referência pronta', () => {
    let n = 0
    const campos = camposDoModelo('hemograma', () => `id${++n}`)
    expect(campos.length).toBeGreaterThan(8)
    expect(campos[0]).toEqual({ id: 'id1', nome: 'Hemácias', valor: '', unidade: 'milhões/µL', referencia: '' })
    expect(camposDoModelo('bioquimico').map(c => c.nome)).toContain('Creatinina')
    expect(camposDoModelo('nao-existe')).toEqual([])
  })
  it('só campos com valor entram; valida o que falta', () => {
    const r = resultadoVazio(hoje)
    expect(validarResultado(r, hoje)).toEqual(['Registre pelo menos um valor, a interpretação ou anexe o laudo.'])
    const campos = [{ ...campoVazio('Hemácias', 'x', 'a'), valor: '6,2' }, campoVazio('Plaquetas', 'x', 'b')]
    expect(camposPreenchidos(campos).map(c => c.id)).toEqual(['a'])
    expect(validarResultado({ ...r, campos }, hoje)).toEqual([])
    expect(validarResultado({ ...r, campos: [{ ...campoVazio('', '', 'z'), valor: '3' }] }, hoje)).toEqual(['Todo valor digitado precisa do nome do exame ao lado.'])
    expect(validarResultado({ ...r, interpretacao: 'Anemia leve' }, hoje)).toEqual([])
    expect(validarResultado({ ...r, interpretacao: 'x', data: '2026-11-17' }, hoje)).toEqual(['A data do resultado está no futuro.'])
    expect(validarResultado({ ...r, interpretacao: 'x', data: '' }, hoje)).toEqual(['Informe a data do resultado.'])
  })
  it('prepara para gravar: status segue a presença de resultado e descarta campo vazio', () => {
    const sem = prepararParaGravar({ ...exameVazio(), resultado: resultadoVazio(hoje) })
    expect(sem.status).toBe('solicitado')
    expect(sem.dados.resultado).toBeNull()
    const com = prepararParaGravar({ ...exameVazio(), resultado: { ...resultadoVazio(hoje), campos: [{ ...campoVazio('Glicose', 'mg/dL', 'g'), valor: '95' }, campoVazio('Ureia', 'mg/dL', 'u')] } })
    expect(com.status).toBe('com_resultado')
    expect(com.dados.resultado?.campos.map(c => c.nome)).toEqual(['Glicose'])
  })
  it('lê JSON com lixo sem quebrar e descarta anexo fora da pasta do módulo', () => {
    const d = normalizarExame({
      urgencia: 'urgente', itens: [{ id: 'hemograma' }, { nome: '  ' }, 'x', { id: 'inexistente', nome: 'Livre' }],
      resultado: {
        data: '2026-02-30', laboratorio: ' Lab X ', campos: [{ nome: 'Glicose', valor: '95', unidade: 'mg/dL', referencia: '70 - 110' }, 7, { nome: '', valor: '' }],
        anexos: [{ path: `vet-exames/${CLINICA}/${PET}/1-a.pdf`, nome: 'laudo.pdf', tipo: 'application/pdf', tamanho: 1200 }, { path: '../outra/pasta.pdf', nome: 'x' }, { path: `ortodontia/${CLINICA}/${PET}/1-a.jpg`, nome: 'y' }],
      },
    })
    expect(d.urgencia).toBe('urgente')
    expect(d.itens.map(i => i.nome)).toEqual(['Hemograma completo', 'Livre'])
    expect(d.itens[1].id).toBeNull()
    expect(d.resultado?.data).toBe('')
    expect(d.resultado?.laboratorio).toBe('Lab X')
    expect(d.resultado?.campos).toHaveLength(1)
    expect(d.resultado?.anexos.map(a => a.nome)).toEqual(['laudo.pdf'])
    expect(normalizarExame(null)).toEqual(exameVazio())
    expect(normalizarExame({ resultado: 'x' }).resultado).toBeNull()
  })
})

describe('anexos', () => {
  it('caminho fica na pasta do módulo, com a clínica na 2ª pasta', () => {
    const p = caminhoAnexoExame({ clinicId: CLINICA, patientId: PET, nome: 'Laudo Final.PDF', now: 123, rand: 'ab' })
    expect(p).toBe(`vet-exames/${CLINICA}/${PET}/123-ab.pdf`)
    expect(caminhoDeAnexoValido(p)).toBe(true)
    expect(caminhoAnexoExame({ clinicId: CLINICA, patientId: PET, nome: 'x.exe', now: 1, rand: '../' })).toBe(`vet-exames/${CLINICA}/${PET}/1-x.pdf`)
    expect(caminhoDeAnexoValido(`vet-exames/${CLINICA}/${PET}/../x.pdf`)).toBe(false)
  })
  it('valida tipo e tamanho', () => {
    expect(problemaDoArquivo({ name: 'laudo.pdf', size: 1000 })).toBeNull()
    expect(problemaDoArquivo({ name: 'foto.JPG', size: 1000 })).toBeNull()
    expect(problemaDoArquivo({ name: 'macro.exe', size: 1000 })).toContain('use PDF ou foto')
    expect(problemaDoArquivo({ name: 'grande.pdf', size: 11 * 1024 * 1024 })).toContain('10 MB')
    expect(problemaDoArquivo({ name: 'vazio.pdf', size: 0 })).toContain('vazio')
    expect(tamanhoLegivel(512)).toBe('512 B')
    expect(tamanhoLegivel(2048)).toBe('2 KB')
    expect(tamanhoLegivel(1.5 * 1024 * 1024)).toBe('1,5 MB')
  })
})

describe('impressos', () => {
  const dados: ExameVetDados = {
    ...exameVazio(), urgencia: 'urgente', indicacao: 'Apatia e vômitos <i>', observacoes: 'Jejum de 8 horas',
    itens: [itemDoCatalogo(exameDoCatalogoVet('hemograma')!), { id: null, nome: 'Teste de alergia', categoria: 'Outros exames' }],
  }
  it('solicitação: urgência, itens por categoria, indicação e assinatura, com escape de HTML', () => {
    const html = htmlSolicitacaoExames(cab, dados)
    expect(html).toContain('SOLICITAÇÃO DE EXAMES')
    expect(html).toContain('URGENTE')
    expect(html).toContain('Laboratoriais')
    expect(html).toContain('Hemograma completo')
    expect(html).toContain('Jejum de 8 horas')
    expect(html).toContain('CRMV-CE 1234')
    expect(html).toContain('Maria &lt;b&gt;Silva&lt;/b&gt;')
    expect(html).not.toContain('<i>')
    expect(html.indexOf('Laboratoriais')).toBeLessThan(html.indexOf('Outros exames'))
  })
  it('resultado: Alto e Baixo por extenso, referência, interpretação e anexo', () => {
    const resultado = {
      ...resultadoVazio('2026-11-16'), laboratorio: 'Lab Vet', interpretacao: 'Leve leucocitose',
      campos: [
        { ...campoVazio('Leucócitos', '/µL', 'a'), valor: '20.000', referencia: '6.000 - 17.000' },
        { ...campoVazio('Hematócrito', '%', 'b'), valor: '30', referencia: '37 - 55' },
        { ...campoVazio('Plaquetas', '/µL', 'c'), valor: '300.000', referencia: '200.000 - 500.000' },
        { ...campoVazio('Glicose', 'mg/dL', 'd'), valor: '95', referencia: '' },
        campoVazio('Ureia', 'mg/dL', 'e'),
      ],
      anexos: [{ path: `vet-exames/${CLINICA}/${PET}/1-a.pdf`, nome: 'laudo.pdf', tipo: 'application/pdf', tamanho: 10 }],
    }
    const html = htmlResultadoExames(cab, { ...dados, resultado }, '2026-11-14')
    expect(html).toContain('RESULTADO DE EXAMES')
    expect(html).toContain('14/11/2026')
    expect(html).toContain('Lab Vet')
    expect(html).toContain('Alto')
    expect(html).toContain('Baixo')
    expect(html).toContain('Referência')
    expect(html).toContain('Leve leucocitose')
    expect(html).toContain('laudo.pdf')
    expect(html).not.toContain('Ureia')
    expect(htmlResultadoExames(cab, dados, '2026-11-14')).toContain('Sem resultado registrado.')
  })
})
