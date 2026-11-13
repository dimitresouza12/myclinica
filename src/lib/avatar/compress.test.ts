import { describe, expect, it } from 'vitest'
import {
  AVATAR_MAX_CHARS, AVATAR_MIN_QUALITY, AVATAR_START_QUALITY, avatarQualitySteps, centerSquare, dataUrlBytes, isImageFile, isValidAvatarData,
} from './compress'

describe('centerSquare', () => {
  it('recorta o centro de uma foto em paisagem', () => {
    expect(centerSquare(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 })
  })
  it('recorta o centro de uma foto em retrato', () => {
    expect(centerSquare(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 })
  })
  it('quadrada fica inteira', () => {
    expect(centerSquare(200, 200)).toEqual({ sx: 0, sy: 0, side: 200 })
  })
  it('entrada inválida vira 1x1', () => {
    expect(centerSquare(0, 10)).toEqual({ sx: 0, sy: 0, side: 1 })
  })
})

describe('avatarQualitySteps', () => {
  const steps = avatarQualitySteps()
  it('começa na qualidade inicial e termina no piso', () => {
    expect(steps[0]).toBe(AVATAR_START_QUALITY)
    expect(steps[steps.length - 1]).toBe(AVATAR_MIN_QUALITY)
  })
  it('é estritamente decrescente', () => {
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1])
  })
})

describe('dataUrlBytes', () => {
  it('desconta o prefixo e o preenchimento do base64', () => {
    expect(dataUrlBytes('data:image/webp;base64,QUJD')).toBe(3)
    expect(dataUrlBytes('data:image/webp;base64,QUI=')).toBe(2)
    expect(dataUrlBytes('data:image/webp;base64,QQ==')).toBe(1)
  })
  it('sem vírgula vale zero', () => {
    expect(dataUrlBytes('nada')).toBe(0)
  })
})

describe('isValidAvatarData', () => {
  it('aceita webp e jpeg em base64', () => {
    expect(isValidAvatarData('data:image/webp;base64,QUJDRA==')).toBe(true)
    expect(isValidAvatarData('data:image/jpeg;base64,QUJD')).toBe(true)
  })
  it('recusa outros tipos, texto solto e valor não texto', () => {
    expect(isValidAvatarData('data:image/svg+xml;base64,QUJD')).toBe(false)
    expect(isValidAvatarData('https://exemplo.com/a.png')).toBe(false)
    expect(isValidAvatarData(null)).toBe(false)
  })
  it('recusa acima do teto de caracteres', () => {
    expect(isValidAvatarData('data:image/webp;base64,' + 'A'.repeat(AVATAR_MAX_CHARS))).toBe(false)
  })
})

describe('isImageFile', () => {
  it('aceita image/* e recusa o que não é imagem', () => {
    expect(isImageFile({ type: 'image/png', name: 'a.png' })).toBe(true)
    expect(isImageFile({ type: 'image/gif', name: 'a.gif' })).toBe(true)
    expect(isImageFile({ type: 'application/pdf', name: 'a.pdf' })).toBe(false)
    expect(isImageFile({ type: 'image/svg+xml', name: 'a.svg' })).toBe(false)
  })
  it('tipo vazio vale pela extensão', () => {
    expect(isImageFile({ type: '', name: 'IMG_1.HEIC' })).toBe(true)
    expect(isImageFile({ type: '', name: 'nota.txt' })).toBe(false)
  })
})
