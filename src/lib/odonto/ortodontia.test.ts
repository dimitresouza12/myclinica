import { describe, expect, it } from 'vitest'
import {
  caminhoFotoOrto, comConsulta, consultaVazia, consultasOrdenadas, dataValida, diasEntre, fotosDaFicha, linhaDoTempo, normalizarOrto, ortoTemConteudo,
  ortoVazio, prazoManutencao, previsaoDeTermino, progressoPrevisto, proximaManutencao, resumoConsulta, rotuloTratamento, semConsulta, somarDias, somarMeses,
  tempoDeTratamento, textoPrazo, textoTempo, type OrtoDados,
} from './ortodontia'

const HOJE = '2026-11-15'

function ficha(p: Partial<OrtoDados> = {}): OrtoDados {
  return { ...ortoVazio('2026-06-01'), ...p }
}

describe('datas', () => {
  it('valida o formato e o calendário', () => {
    expect(dataValida('2026-02-28')).toBe(true)
    expect(dataValida('2026-02-30')).toBe(false)
    expect(dataValida('2026-2-3')).toBe(false)
    expect(dataValida(20260101)).toBe(false)
  })
  it('conta e soma dias', () => {
    expect(diasEntre('2026-11-15', '2026-11-20')).toBe(5)
    expect(diasEntre('2026-11-20', '2026-11-15')).toBe(-5)
    expect(somarDias('2026-12-20', 15)).toBe('2027-01-04')
  })
  it('soma meses sem estourar o fim do mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(somarMeses('2026-11-15', 3)).toBe('2027-02-15')
    expect(somarMeses('2026-06-01', 24)).toBe('2028-06-01')
  })
})

describe('leitura do JSON salvo', () => {
  it('lixo vira ficha em branco', () => {
    expect(normalizarOrto(null).consultas).toEqual([])
    expect(normalizarOrto('x').aparelho).toBe('fixo_metalico')
  })
  it('descarta opção inválida, data inválida e consulta sem data', () => {
    const d = normalizarOrto({
      aparelho: 'foguete', arcadas: 'meio', situacao: 'x', instalacao: '2026-13-01', previsaoMeses: '999', intervaloDias: 'abc',
      consultas: [{ id: 'a', data: '2026-07-01', ativacao: 'fio 014', proxima: 'quando der', fotos: ['x/y.jpg', 3, ''] }, { id: 'b', data: 'ontem' }, null],
    })
    expect(d.aparelho).toBe('fixo_metalico')
    expect(d.arcadas).toBe('ambas')
    expect(d.situacao).toBe('ativo')
    expect(d.instalacao).toBe('')
    expect(d.previsaoMeses).toBe('120')
    expect(d.intervaloDias).toBe('')
    expect(d.consultas).toHaveLength(1)
    expect(d.consultas[0].proxima).toBe('')
    expect(d.consultas[0].fotos).toEqual(['x/y.jpg'])
  })
  it('o que foi gravado volta igual', () => {
    const d = comConsulta(ficha({ objetivo: 'Fechar diastema' }), { ...consultaVazia('c1', '2026-07-01'), ativacao: 'Fio NiTi 014', fotos: ['ortodontia/c/p/1-a.jpg'], proxima: '2026-08-01' })
    expect(normalizarOrto(JSON.parse(JSON.stringify(d)))).toEqual(d)
  })
  it('sabe se tem conteúdo', () => {
    expect(ortoTemConteudo(ortoVazio(''))).toBe(false)
    expect(ortoTemConteudo(ortoVazio('2026-01-01'))).toBe(true)
  })
})

describe('consultas', () => {
  const base = ficha({
    consultas: [
      { ...consultaVazia('a', '2026-07-01') },
      { ...consultaVazia('b', '2026-09-01') },
      { ...consultaVazia('c', '2026-09-01') },
    ],
  })
  it('ordena da mais recente para a mais antiga; empate pela última registrada', () => {
    expect(consultasOrdenadas(base).map(c => c.id)).toEqual(['c', 'b', 'a'])
  })
  it('adiciona, edita e remove sem mutar', () => {
    const editada = comConsulta(base, { ...consultaVazia('a', '2026-07-02'), elasticos: '3/16' })
    expect(editada.consultas).toHaveLength(3)
    expect(editada.consultas[0].elasticos).toBe('3/16')
    expect(base.consultas[0].elasticos).toBe('')
    expect(semConsulta(base, 'b').consultas.map(c => c.id)).toEqual(['a', 'c'])
  })
  it('junta as fotos de todas as consultas', () => {
    const d = comConsulta(comConsulta(ficha(), { ...consultaVazia('a', '2026-07-01'), fotos: ['1', '2'] }), { ...consultaVazia('b', '2026-08-01'), fotos: ['3'] })
    expect(fotosDaFicha(d)).toEqual(['1', '2', '3'])
  })
  it('resume ativação, fio e elásticos; fio só para aparelho que usa', () => {
    const c = { ...consultaVazia('a', '2026-07-01'), ativacao: 'Troca de fio', fioSup: 'NiTi 014', elasticos: 'Classe II 3/16' }
    expect(resumoConsulta(c)).toBe('Ativação: Troca de fio | fio superior NiTi 014 | Elásticos: Classe II 3/16')
    expect(resumoConsulta(c, false)).toBe('Ativação: Troca de fio | Elásticos: Classe II 3/16')
  })
})

describe('próxima manutenção', () => {
  it('usa a data marcada na última consulta', () => {
    const d = ficha({ consultas: [{ ...consultaVazia('a', '2026-10-01'), proxima: '2026-11-03' }, { ...consultaVazia('b', '2026-10-20'), proxima: '2026-11-25' }] })
    expect(proximaManutencao(d)).toEqual({ data: '2026-11-25', origem: 'agendada' })
  })
  it('sem data marcada, sugere a última consulta mais o intervalo', () => {
    const d = ficha({ intervaloDias: '30', consultas: [{ ...consultaVazia('a', '2026-10-20') }] })
    expect(proximaManutencao(d)).toEqual({ data: '2026-11-19', origem: 'sugerida' })
  })
  it('sem consulta, parte da instalação', () => {
    expect(proximaManutencao(ficha({ instalacao: '2026-11-01', intervaloDias: '28' }))).toEqual({ data: '2026-11-29', origem: 'sugerida' })
  })
  it('a data da consulta mais nova vale mesmo que a antiga tenha data marcada', () => {
    const d = ficha({ intervaloDias: '30', consultas: [{ ...consultaVazia('a', '2026-09-01'), proxima: '2026-12-31' }, { ...consultaVazia('b', '2026-10-01') }] })
    expect(proximaManutencao(d)).toEqual({ data: '2026-10-31', origem: 'sugerida' })
  })
  it('não há próxima em tratamento concluído, pausado, ou sem intervalo e sem data', () => {
    expect(proximaManutencao(ficha({ situacao: 'concluido' }))).toBeNull()
    expect(proximaManutencao(ficha({ situacao: 'pausado' }))).toBeNull()
    expect(proximaManutencao(ficha({ intervaloDias: '' }))).toBeNull()
    expect(proximaManutencao(ficha({ instalacao: '', intervaloDias: '30' }))).toBeNull()
  })
  it('diz se está atrasada, é hoje ou está em dia', () => {
    expect(prazoManutencao('2026-11-10', HOJE)).toEqual({ estado: 'atrasada', dias: -5 })
    expect(prazoManutencao(HOJE, HOJE)).toEqual({ estado: 'hoje', dias: 0 })
    expect(prazoManutencao('2026-11-16', HOJE)).toEqual({ estado: 'em_dias', dias: 1 })
    expect(textoPrazo({ estado: 'atrasada', dias: -1 })).toBe('Atrasada há 1 dia')
    expect(textoPrazo({ estado: 'em_dias', dias: 12 })).toBe('Em 12 dias')
    expect(textoPrazo({ estado: 'hoje', dias: 0 })).toBe('Hoje')
  })
})

describe('andamento do tratamento', () => {
  it('conta o tempo da instalação até hoje, ou até a conclusão', () => {
    expect(tempoDeTratamento(ficha({ instalacao: '2026-06-01' }), HOJE)).toEqual({ meses: 5, dias: 14 })
    expect(tempoDeTratamento(ficha({ instalacao: '2026-06-01', conclusao: '2026-09-01' }), HOJE)).toEqual({ meses: 3, dias: 0 })
    expect(tempoDeTratamento(ficha({ instalacao: '' }), HOJE)).toBeNull()
    expect(tempoDeTratamento(ficha({ instalacao: '2027-01-01' }), HOJE)).toBeNull()
    expect(textoTempo({ meses: 5, dias: 14 })).toBe('5 meses e 14 dias')
    expect(textoTempo({ meses: 1, dias: 0 })).toBe('1 mês')
    expect(textoTempo({ meses: 0, dias: 0 })).toBe('0 dias')
  })
  it('calcula a previsão de término e o progresso', () => {
    const d = ficha({ instalacao: '2026-06-01', previsaoMeses: '12' })
    expect(previsaoDeTermino(d)).toBe('2027-06-01')
    const p = progressoPrevisto(d, HOJE)!
    expect(p).toBeGreaterThan(40)
    expect(p).toBeLessThan(50)
    expect(progressoPrevisto(ficha({ previsaoMeses: '' }), HOJE)).toBeNull()
    expect(progressoPrevisto(ficha({ previsaoMeses: '12', situacao: 'concluido' }), HOJE)).toBe(100)
    expect(progressoPrevisto(ficha({ instalacao: '2027-06-01', previsaoMeses: '12' }), HOJE)).toBe(0)
  })
})

describe('linha do tempo', () => {
  const d = ficha({
    instalacao: '2026-06-01', previsaoMeses: '18', intervaloDias: '30', aparelho: 'autoligado', arcadas: 'ambas',
    consultas: [
      { ...consultaVazia('b', '2026-08-03'), ativacao: 'Fio 016', proxima: '2026-09-02' },
      { ...consultaVazia('a', '2026-07-01'), elasticos: 'Classe II', fotos: ['f1'] },
    ],
  })
  const t = linhaDoTempo(d, HOJE)
  it('põe os eventos em ordem de data, com instalação primeiro', () => {
    expect(t.map(e => e.tipo)).toEqual(['instalacao', 'manutencao', 'manutencao', 'proxima', 'previsao'])
    expect(t.map(e => e.data)).toEqual(['2026-06-01', '2026-07-01', '2026-08-03', '2026-09-02', '2027-12-01'])
  })
  it('marca o que já aconteceu e a próxima manutenção vencida como atrasada', () => {
    expect(t[0].estado).toBe('feito')
    expect(t[3].estado).toBe('atrasado')
    expect(t[3].detalhe).toBe('Atrasada há 74 dias')
    expect(t[4].estado).toBe('futuro')
  })
  it('traz o resumo e a contagem de fotos de cada manutenção', () => {
    expect(t[1].detalhe).toContain('Elásticos: Classe II')
    expect(t[1].fotos).toBe(1)
    expect(t[1].consultaId).toBe('a')
    expect(t[0].detalhe).toBe('Fixo autoligado - arcadas superior e inferior')
  })
  it('concluído mostra a conclusão e não mostra previsão nem próxima', () => {
    const f = linhaDoTempo({ ...d, situacao: 'concluido', conclusao: '2026-10-20' }, HOJE)
    expect(f.map(e => e.tipo)).toEqual(['instalacao', 'manutencao', 'manutencao', 'conclusao'])
    expect(f[3].titulo).toBe('Tratamento concluído')
  })
  it('sem nada preenchido, a linha do tempo é vazia', () => {
    expect(linhaDoTempo(ortoVazio(''), HOJE)).toEqual([])
  })
})

describe('rótulos e caminho das fotos', () => {
  it('rotula o tratamento pelo aparelho e mês da instalação', () => {
    expect(rotuloTratamento(ficha({ instalacao: '2026-01-15' }))).toBe('Fixo metálico, jan/2026')
    expect(rotuloTratamento(ficha({ aparelho: 'outro', aparelhoOutro: 'Placa de Hawley', instalacao: '' }))).toBe('Placa de Hawley')
  })
  it('o caminho da foto tem a clínica na segunda pasta', () => {
    const p = caminhoFotoOrto({ clinicId: 'cli', patientId: 'pac', ext: 'png', now: 123, rand: 'ab' })
    expect(p).toBe('ortodontia/cli/pac/123-ab.png')
    expect(p.split('/')[1]).toBe('cli')
    expect(caminhoFotoOrto({ clinicId: 'c', patientId: 'p', ext: '../x', now: 1, rand: 'a' })).toBe('ortodontia/c/p/1-a.jpg')
  })
})
