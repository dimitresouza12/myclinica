import { describe, expect, it } from 'vitest'
import {
  LIMITES_DIARIO, agruparPorDia, caminhoDaFotoDiario, detectarImagem, diasComRegistro, fotoDoDiarioValida, horarioValido,
  isRefeicaoDiario, rotuloRefeicao, shapeDiario, validarRegistroDiario, type RegistroDiario,
} from './diario'

const HOJE = '2026-11-16'
const ok = { refeicao: 'almoco', horario: '12:30', descricao: 'Arroz, feijão e frango', dia: HOJE }

describe('validarRegistroDiario', () => {
  it('aceita o registro de hoje e normaliza o texto', () => {
    const r = validarRegistroDiario({ ...ok, descricao: '  Arroz\r\nfeijão  ' }, HOJE)
    expect(r).toEqual({ ok: true, dados: { dia: HOJE, refeicao: 'almoco', horario: '12:30', descricao: 'Arroz\nfeijão' } })
  })

  it('dia ausente vale hoje; ontem é aceito; outros dias não', () => {
    expect(validarRegistroDiario({ ...ok, dia: undefined }, HOJE)).toMatchObject({ ok: true, dados: { dia: HOJE } })
    expect(validarRegistroDiario({ ...ok, dia: '2026-11-15' }, HOJE)).toMatchObject({ ok: true, dados: { dia: '2026-11-15' } })
    for (const dia of ['2026-11-14', '2026-11-17', '2026-12-16', 'ontem', 20261116, {}]) {
      expect(validarRegistroDiario({ ...ok, dia }, HOJE).ok, String(dia)).toBe(false)
    }
  })

  it('horário é opcional, mas se vier precisa ser HH:MM válido', () => {
    expect(validarRegistroDiario({ ...ok, horario: '' }, HOJE)).toMatchObject({ ok: true, dados: { horario: null } })
    expect(validarRegistroDiario({ ...ok, horario: undefined }, HOJE)).toMatchObject({ ok: true, dados: { horario: null } })
    for (const horario of ['24:00', '7:30', '12:60', 'meio-dia', '12h', 730]) {
      expect(validarRegistroDiario({ ...ok, horario }, HOJE).ok, String(horario)).toBe(false)
    }
  })

  it('refeição precisa ser uma das conhecidas; descrição obrigatória e limitada', () => {
    expect(validarRegistroDiario({ ...ok, refeicao: 'brunch' }, HOJE)).toEqual({ ok: false, erro: 'Escolha a refeição.' })
    expect(validarRegistroDiario({ ...ok, refeicao: undefined }, HOJE).ok).toBe(false)
    expect(validarRegistroDiario({ ...ok, descricao: '   ' }, HOJE)).toEqual({ ok: false, erro: 'Descreva o que você comeu.' })
    expect(validarRegistroDiario({ ...ok, descricao: 42 }, HOJE).ok).toBe(false)
    expect(validarRegistroDiario({ ...ok, descricao: 'x'.repeat(LIMITES_DIARIO.descricao) }, HOJE).ok).toBe(true)
    expect(validarRegistroDiario({ ...ok, descricao: 'x'.repeat(LIMITES_DIARIO.descricao + 1) }, HOJE).ok).toBe(false)
  })

  it('helpers', () => {
    expect(isRefeicaoDiario('ceia')).toBe(true)
    expect(isRefeicaoDiario('ceia ')).toBe(false)
    expect(rotuloRefeicao('cafe_manha')).toBe('Café da manhã')
    expect(rotuloRefeicao('x')).toBe('Refeição')
    expect(horarioValido('00:00')).toBe(true)
    expect(horarioValido('23:59')).toBe(true)
  })
})

describe('foto do diário', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0, 0, 0, 0])
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])

  it('reconhece JPEG, PNG e WebP pelos bytes e recusa o resto', () => {
    expect(detectarImagem(jpeg)).toBe('image/jpeg')
    expect(detectarImagem(png)).toBe('image/png')
    expect(detectarImagem(webp)).toBe('image/webp')
    expect(detectarImagem(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]))).toBeNull() // GIF
    expect(detectarImagem(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull()
    expect(detectarImagem(new TextEncoder().encode('<?php echo 1; ?>'))).toBeNull()
    expect(detectarImagem(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull() // WAV
    expect(detectarImagem(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(detectarImagem(new Uint8Array())).toBeNull()
  })

  it('caminho fica na pasta da clínica e do paciente, e só esse caminho é aceito', () => {
    const c = '11111111-1111-1111-1111-111111111111'
    const p = '22222222-2222-2222-2222-222222222222'
    const path = caminhoDaFotoDiario(c, p, 'image/webp', 1700000000000, 'AbC123')
    expect(path).toBe(`diario/${c}/${p}/1700000000000-abc123.webp`)
    expect(caminhoDaFotoDiario(c, p, 'image/jpeg', 1, '!!!')).toBe(`diario/${c}/${p}/1-x.jpg`)
    expect(fotoDoDiarioValida(path, c, p)).toBe(true)
    expect(fotoDoDiarioValida(path, c, '33333333-3333-3333-3333-333333333333')).toBe(false)
    expect(fotoDoDiarioValida(path, '33333333-3333-3333-3333-333333333333', p)).toBe(false)
    expect(fotoDoDiarioValida(`diario/${c}/${p}/../x.jpg`, c, p)).toBe(false)
    expect(fotoDoDiarioValida(`exercicios/${c}/${p}/a.jpg`, c, p)).toBe(false)
    expect(fotoDoDiarioValida(null, c, p)).toBe(false)
    expect(fotoDoDiarioValida('diario/' + c + '/' + p + '/' + 'a'.repeat(300), c, p)).toBe(false)
  })
})

const reg = (id: string, dia: string, horario: string | null, created: string): RegistroDiario =>
  ({ id, dia, refeicao: 'almoco', horario, descricao: id, foto_path: null, created_at: created })

describe('agruparPorDia e diasComRegistro', () => {
  const lista = [
    reg('a', '2026-11-14', '08:00', '2026-11-14T11:00:00Z'),
    reg('b', '2026-11-16', null, '2026-11-16T10:00:00Z'),
    reg('c', '2026-11-16', '19:30', '2026-11-16T22:30:00Z'),
    reg('d', '2026-11-16', '07:30', '2026-11-16T10:31:00Z'),
    reg('e', '2026-11-01', '12:00', '2026-11-01T15:00:00Z'),
  ]
  it('dias do mais recente ao mais antigo; no dia, por horário e sem horário por último', () => {
    const g = agruparPorDia(lista)
    expect(g.map(x => x.dia)).toEqual(['2026-11-16', '2026-11-14', '2026-11-01'])
    expect(g[0].registros.map(r => r.id)).toEqual(['d', 'c', 'b'])
  })
  it('lista vazia', () => {
    expect(agruparPorDia([])).toEqual([])
    expect(diasComRegistro([], HOJE)).toBe(0)
  })
  it('conta dias distintos dentro da janela de 7 dias, inclusive hoje', () => {
    expect(diasComRegistro(lista, HOJE)).toBe(2) // 16 e 14; o dia 1 está fora; futuro não conta
    expect(diasComRegistro(lista, HOJE, 30)).toBe(3)
    expect(diasComRegistro([reg('f', '2026-11-17', null, 'x')], HOJE)).toBe(0)
  })
})

describe('shapeDiario (visão do paciente)', () => {
  it('traz só o necessário, com URL assinada da foto e permissão de apagar hoje e ontem', () => {
    const linhas = [
      { id: '1', dia: HOJE, refeicao: 'jantar', horario: '20:00', descricao: 'Sopa', foto_path: 'diario/c/p/a.webp', created_at: 'x' },
      { id: '2', dia: '2026-11-15', refeicao: 'invalida', horario: null, descricao: 'Fruta', foto_path: 'diario/c/p/b.webp', created_at: 'x' },
      { id: '3', dia: '2026-11-10', refeicao: 'ceia', horario: null, descricao: 'Chá', foto_path: null, created_at: 'x' },
    ]
    const out = shapeDiario({ linhas, imagens: new Map([['diario/c/p/a.webp', 'https://assinada/a']]), hoje: HOJE })
    expect(out.today).toBe(HOJE)
    expect(out.entries.map(e => e.fotoUrl)).toEqual(['https://assinada/a', null, null])
    expect(out.entries.map(e => e.podeApagar)).toEqual([true, true, false])
    expect(out.entries[1].refeicao).toBe('outro')
    expect(Object.keys(out.entries[0]).sort()).toEqual(['descricao', 'dia', 'fotoUrl', 'horario', 'id', 'podeApagar', 'refeicao'])
  })
})
