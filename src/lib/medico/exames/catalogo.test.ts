import { describe, expect, it } from 'vitest'
import { buscarExames, categoriasDoGrupo, EXAMES_CATALOGO, examePorId, GRUPO_ROTULO } from './catalogo'

describe('catálogo de exames', () => {
  it('ids únicos, nomes e categorias preenchidos, grupos válidos', () => {
    const ids = EXAMES_CATALOGO.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of EXAMES_CATALOGO) {
      expect(e.id).toMatch(/^[a-z0-9-]+$/)
      expect(e.nome.trim().length).toBeGreaterThan(2)
      expect(e.categoria.trim().length).toBeGreaterThan(2)
      expect(Object.keys(GRUPO_ROTULO)).toContain(e.grupo)
    }
  })

  it('nomes únicos (ignorando acento e maiúscula)', () => {
    const n = EXAMES_CATALOGO.map(e => e.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
    expect(new Set(n).size).toBe(n.length)
  })

  it('TUSS só com 8 dígitos e sem repetição', () => {
    const tuss = EXAMES_CATALOGO.filter(e => e.tuss).map(e => e.tuss!)
    for (const t of tuss) expect(t).toMatch(/^\d{8}$/)
    expect(new Set(tuss).size).toBe(tuss.length)
  })

  it('cobre laboratório, imagem e exames funcionais', () => {
    expect(EXAMES_CATALOGO.length).toBeGreaterThan(150)
    for (const g of ['laboratorial', 'imagem', 'funcional'] as const) expect(EXAMES_CATALOGO.some(e => e.grupo === g)).toBe(true)
    expect(categoriasDoGrupo('imagem')).toContain('Ultrassonografia')
    expect(categoriasDoGrupo('todos')).toContain('Hematologia')
  })

  it('busca sem acento, por sigla e por nome alternativo', () => {
    expect(buscarExames('hemograma')[0].id).toBe('hemograma')
    expect(buscarExames('glicose').map(e => e.id)).toContain('glicemia-jejum')
    expect(buscarExames('TGO').map(e => e.id)).toContain('tgo')
    expect(buscarExames('ultrassonografia tireoide').map(e => e.id)).toEqual(['us-tireoide'])
    expect(buscarExames('urina rotina').map(e => e.id)).toContain('eas')
    expect(buscarExames('ressonancia joelho').map(e => e.id)).toEqual(['rm-joelho'])
    expect(buscarExames('ultrassom tireoide').map(e => e.id)).toEqual(['us-tireoide'])
    expect(buscarExames('raio x torax').map(e => e.id)).toContain('rx-torax')
    expect(buscarExames('rnm joelho').map(e => e.id)).toEqual(['rm-joelho'])
    expect(buscarExames('xyzxyz')).toEqual([])
  })

  it('filtra por grupo e categoria; sem texto devolve todos do filtro', () => {
    const us = buscarExames('', { categoria: 'Ultrassonografia' })
    expect(us.length).toBeGreaterThan(10)
    expect(us.every(e => e.categoria === 'Ultrassonografia')).toBe(true)
    expect(buscarExames('', { grupo: 'funcional' }).every(e => e.grupo === 'funcional')).toBe(true)
    expect(buscarExames('', { grupo: 'todos' })).toHaveLength(EXAMES_CATALOGO.length)
  })

  it('examePorId', () => {
    expect(examePorId('hemograma')?.tuss).toBe('40304361')
    expect(examePorId('nao-existe')).toBeUndefined()
  })
})
