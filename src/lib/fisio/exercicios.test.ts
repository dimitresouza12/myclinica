import { describe, expect, it } from 'vitest'
import {
  adesaoDoPrograma, caminhoDaFoto, exercicioVazio, filtrarExercicios, fotoDaClinica, gerarId, itemDoBanco, itemDoExercicio, lerInteiro, lerVideo,
  resumoDoItem, textoDaDose, textoDaFrequencia, textoUltimaVez, validarExercicio, validarPrescricao, videoNormalizado,
  type Exercicio, type ItemPrescricao, type ItemRascunho,
} from './exercicios'

describe('lerVideo', () => {
  it('aceita os formatos comuns do YouTube e normaliza', () => {
    const esperado = { provedor: 'youtube', id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    expect(lerVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toEqual(esperado)
    expect(lerVideo('https://youtu.be/dQw4w9WgXcQ?si=abc')).toEqual(esperado)
    expect(lerVideo('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual(esperado)
    expect(lerVideo('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual(esperado)
    expect(lerVideo('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual(esperado)
    expect(lerVideo('youtube.com/watch?v=dQw4w9WgXcQ')).toEqual(esperado)
  })
  it('aceita Vimeo, inclusive vídeo não listado com código', () => {
    expect(lerVideo('https://vimeo.com/123456789')).toEqual({ provedor: 'vimeo', id: '123456789', url: 'https://vimeo.com/123456789' })
    expect(lerVideo('https://vimeo.com/123456789/abcdef0123')?.url).toBe('https://vimeo.com/123456789/abcdef0123')
    expect(lerVideo('https://player.vimeo.com/video/123456789?h=abcdef0123')?.url).toBe('https://vimeo.com/123456789/abcdef0123')
    expect(lerVideo('https://vimeo.com/channels/staffpicks/123456789')?.url).toBe('https://vimeo.com/123456789')
  })
  it('recusa outros endereços, ids inválidos e coisas que não são link', () => {
    for (const x of [
      'https://exemplo.com/watch?v=dQw4w9WgXcQ', 'https://evil.com/?u=https://youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=curto', 'https://www.youtube.com/', 'https://vimeo.com/abc', 'javascript:alert(1)', 'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
      'https://user:senha@www.youtube.com/watch?v=dQw4w9WgXcQ', '', '   ', 'texto qualquer', null, undefined, 42,
    ]) expect(lerVideo(x)).toBeNull()
  })
  it('videoNormalizado só aceita o endereço já normalizado (espelha o CHECK do banco)', () => {
    expect(videoNormalizado('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    expect(videoNormalizado('https://vimeo.com/123456789')).toBe(true)
    expect(videoNormalizado('https://vimeo.com/123456789/abcdef0123')).toBe(true)
    expect(videoNormalizado('https://youtu.be/dQw4w9WgXcQ')).toBe(false)
    expect(videoNormalizado('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
    expect(videoNormalizado('https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>')).toBe(false)
    expect(videoNormalizado(null)).toBe(false)
  })
})

describe('fotos', () => {
  it('caminho fica na pasta da clínica e fotoDaClinica confere o prefixo', () => {
    const p = caminhoDaFoto('c1', 'e1', 'image/webp', 1700000000000, 'ab-12')
    expect(p).toBe('exercicios/c1/e1/1700000000000-ab12.webp')
    expect(caminhoDaFoto('c1', 'e1', 'image/jpeg', 1, 'x').endsWith('.jpg')).toBe(true)
    expect(fotoDaClinica(p, 'c1')).toBe(true)
    expect(fotoDaClinica(p, 'c2')).toBe(false)
    expect(fotoDaClinica('exercicios/c1/../c2/x.jpg', 'c1')).toBe(false)
    expect(fotoDaClinica('evolucao/c1/p/x.jpg', 'c1')).toBe(false)
    expect(fotoDaClinica(null, 'c1')).toBe(false)
  })
})

describe('validarExercicio', () => {
  it('exige nome, valida séries e vídeo e normaliza o link', () => {
    expect(validarExercicio(exercicioVazio())).toEqual({ ok: false, erros: ['Dê um nome ao exercício.'] })
    const r = validarExercicio({ name: ' Ponte ', description: ' ', region: 'lombar', sets: '3', reps: '12', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(r).toEqual({ ok: true, dados: { name: 'Ponte', description: null, region: 'lombar', default_sets: 3, default_reps: '12', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } })
  })
  it('recusa séries fora da faixa e vídeo de outro site', () => {
    const r = validarExercicio({ ...exercicioVazio(), name: 'X', sets: '21', videoUrl: 'https://exemplo.com/v' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erros).toHaveLength(2)
    expect(validarExercicio({ ...exercicioVazio(), name: 'X', sets: '0' }).ok).toBe(false)
    expect(validarExercicio({ ...exercicioVazio(), name: 'X', sets: '2,5' }).ok).toBe(false)
  })
  it('lerInteiro: vazio é válido, texto não', () => {
    expect(lerInteiro('', 20)).toEqual({ valor: null, erro: false })
    expect(lerInteiro('abc', 20)).toEqual({ valor: null, erro: true })
    expect(lerInteiro('7', 7)).toEqual({ valor: 7, erro: false })
  })
})

const ex = (o: Partial<Exercicio>): Exercicio => ({ id: 'e', name: 'Agachamento', description: null, region: null, default_sets: null, default_reps: null, video_url: null, image_path: null, active: true, created_at: '', ...o })

describe('filtrarExercicios', () => {
  const lista = [ex({ id: '1', name: 'Agachamento livre', region: 'joelho' }), ex({ id: '2', name: 'Alongamento cervical', description: 'Pescoço relaxado', region: 'cervical' })]
  it('busca sem acento e filtra por região', () => {
    expect(filtrarExercicios(lista, 'pescoco', '').map(e => e.id)).toEqual(['2'])
    expect(filtrarExercicios(lista, '', 'joelho').map(e => e.id)).toEqual(['1'])
    expect(filtrarExercicios(lista, 'al', 'joelho')).toEqual([])
    expect(filtrarExercicios(lista, '', '')).toHaveLength(2)
  })
})

describe('prescrição', () => {
  const item = (o: Partial<ItemRascunho>): ItemRascunho => ({ ...itemDoExercicio(ex({}), 'i1'), ...o })
  it('item da biblioteca copia os dados e começa todos os dias', () => {
    const i = itemDoExercicio(ex({ default_sets: 3, default_reps: '10', video_url: 'https://vimeo.com/1', image_path: 'exercicios/c/e/x.jpg' }), 'novo')
    expect(i).toMatchObject({ id: 'novo', exercicioId: 'e', name: 'Agachamento', sets: '3', reps: '10', timesPerWeek: '7', imagePath: 'exercicios/c/e/x.jpg' })
  })
  it('exige título e ao menos um exercício', () => {
    const r = validarPrescricao({ titulo: '', orientacoes: '', itens: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erros).toEqual(['Dê um título ao programa.', 'Inclua ao menos um exercício no programa.'])
  })
  it('valida cada item e numera a ordem', () => {
    const ok = validarPrescricao({ titulo: 'Casa', orientacoes: '  ', itens: [item({ id: 'a', name: 'A', timesPerWeek: '3', sets: '2' }), item({ id: 'b', name: 'B', timesPerWeek: '7' })] })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.orientacoes).toBeNull()
      expect(ok.itens.map(i => [i.id, i.sort_order, i.times_per_week])).toEqual([['a', 0, 3], ['b', 1, 7]])
    }
    const mau = validarPrescricao({ titulo: 'Casa', orientacoes: '', itens: [item({ name: '' }), item({ name: 'B', timesPerWeek: '8' }), item({ name: 'C', timesPerWeek: '' })] })
    expect(mau.ok).toBe(false)
    if (!mau.ok) expect(mau.erros).toHaveLength(3)
  })
  it('itemDoBanco devolve os números como texto', () => {
    const b: ItemPrescricao = { id: 'i', prescricao_id: 'p', exercicio_id: null, name: 'N', description: null, region: null, video_url: null, image_path: null, sets: 3, reps: '10', times_per_week: 5, notes: null, sort_order: 0 }
    expect(itemDoBanco(b)).toMatchObject({ sets: '3', reps: '10', timesPerWeek: '5', exercicioId: null })
  })
  it('textos da dose e da frequência', () => {
    expect(textoDaDose(3, '10')).toBe('3 séries de 10 repetições')
    expect(textoDaDose(1, '1')).toBe('1 série de 1 repetição')
    expect(textoDaDose(2, '30 segundos')).toBe('2 séries de 30 segundos')
    expect(textoDaDose(null, '12')).toBe('12 repetições')
    expect(textoDaDose(4, null)).toBe('4 séries')
    expect(textoDaDose(null, null)).toBe('')
    expect(textoDaFrequencia(7)).toBe('Todos os dias')
    expect(textoDaFrequencia(1)).toBe('1 dia por semana')
    expect(textoDaFrequencia(3)).toBe('3 dias por semana')
  })
})

describe('adesão do paciente', () => {
  const hoje = '2026-11-30'
  const item = { id: 'i1', times_per_week: 3 }
  const e = (done_on: string, item_id = 'i1') => ({ item_id, done_on })

  it('conta dias diferentes nos últimos 7 dias, hoje incluído', () => {
    const r = resumoDoItem(item, [e('2026-11-30'), e('2026-11-28'), e('2026-11-24'), e('2026-11-23')], hoje)
    expect(r).toMatchObject({ feitosNaSemana: 3, meta: 3, pct: 100, feitoHoje: true, ultimaVez: '2026-11-30' })
  })
  it('a janela é de 7 dias: o dia 23 já ficou de fora', () => {
    expect(resumoDoItem(item, [e('2026-11-23')], hoje).feitosNaSemana).toBe(0)
    expect(resumoDoItem(item, [e('2026-11-24')], hoje).feitosNaSemana).toBe(1)
  })
  it('ignora outros itens, dias repetidos, datas inválidas e futuras', () => {
    const r = resumoDoItem(item, [e('2026-11-29'), e('2026-11-29'), e('2026-11-28', 'outro'), e('2026-12-05'), e('lixo')], hoje)
    expect(r.feitosNaSemana).toBe(1)
    expect(r.ultimaVez).toBe('2026-11-29')
    expect(r.feitoHoje).toBe(false)
  })
  it('limita a 100% e protege contra meta inválida', () => {
    const muitos = ['2026-11-30', '2026-11-29', '2026-11-28', '2026-11-27', '2026-11-26'].map(d => e(d))
    expect(resumoDoItem(item, muitos, hoje).pct).toBe(100)
    expect(resumoDoItem({ id: 'i1', times_per_week: 0 }, muitos, hoje).meta).toBe(1)
  })
  it('adesão do programa soma o feito sobre as metas, sem passar da meta de cada item', () => {
    const itens = [{ id: 'a', times_per_week: 2 }, { id: 'b', times_per_week: 4 }]
    const ex = [e('2026-11-30', 'a'), e('2026-11-29', 'a'), e('2026-11-28', 'a'), e('2026-11-30', 'b')]
    expect(adesaoDoPrograma(itens, ex, hoje)).toBe(Math.round(((2 + 1) / 6) * 100))
    expect(adesaoDoPrograma([], ex, hoje)).toBeNull()
  })
  it('texto da última vez', () => {
    expect(textoUltimaVez(null, hoje)).toBe('Ainda não marcado')
    expect(textoUltimaVez('2026-11-30', hoje)).toBe('Feito hoje')
    expect(textoUltimaVez('2026-11-29', hoje)).toBe('Feito ontem')
    expect(textoUltimaVez('2026-11-26', hoje)).toBe('Último há 4 dias')
  })
})

describe('gerarId', () => {
  it('devolve um uuid v4', () => {
    expect(gerarId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
