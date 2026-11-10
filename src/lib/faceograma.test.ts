import { describe, expect, it } from 'vitest'
import { faceRegion, formatTotal, parseDose, sessionTotals, type FaceAnnotation } from './faceograma'

const ann = (type: string, qty: string): FaceAnnotation => ({ id: Math.random().toString(), x: 0, y: 0, type, qty, note: '' })

describe('parseDose', () => {
  it('lê número e unidade', () => {
    expect(parseDose('20U')).toEqual({ value: 20, unit: 'U' })
    expect(parseDose('0,5 ml')).toEqual({ value: 0.5, unit: 'ml' })
    expect(parseDose('1.5ML')).toEqual({ value: 1.5, unit: 'ml' })
    expect(parseDose('2 unidades')).toEqual({ value: 2, unit: 'U' })
    expect(parseDose('1A')).toEqual({ value: 1, unit: 'ampola' })
    expect(parseDose('3')).toEqual({ value: 3, unit: '' })
  })
  it('devolve null sem número', () => {
    expect(parseDose('')).toBeNull()
    expect(parseDose('meia ampola')).toBeNull()
  })
})

describe('sessionTotals', () => {
  it('soma por produto e unidade e conta os pontos sem dose', () => {
    const { totals, semDose } = sessionTotals([
      ann('toxina', '20U'), ann('toxina', '4 u'), ann('preenchimento', '0,5ml'), ann('preenchimento', '0.3 ml'),
      ann('preenchimento', '1 seringa x'), ann('fio', ''),
    ])
    expect(totals.map(t => `${t.tool}:${formatTotal(t)}`)).toEqual(['toxina:24 U', 'preenchimento:0,8 ml', 'preenchimento:1 seringa'])
    expect(semDose).toBe(1)
  })
})

describe('faceRegion', () => {
  it('acha a região pelo ponto, com o lado do paciente', () => {
    expect(faceRegion(150, 82)).toBe('Glabela')
    expect(faceRegion(150, 50)).toBe('Frontal')
    expect(faceRegion(98, 95)).toBe('Pé de galinha (direito)')
    expect(faceRegion(202, 95)).toBe('Pé de galinha (esquerdo)')
    expect(faceRegion(150, 168)).toBe('Mento')
    expect(faceRegion(150, 225)).toBe('Pescoço')
  })
  it('usa Face quando nenhuma região cobre o ponto', () => {
    expect(faceRegion(5, 5)).toBe('Face')
  })
})
