import { describe, expect, it } from 'vitest'
import {
  IMAGE_MIN_QUALITY, IMAGE_START_QUALITY, dimensionPlan, fitDimensions, isAcceptedImage, pickAudioMime, qualitySteps,
} from './compress'

describe('fitDimensions', () => {
  it('mantém a foto que já cabe', () => {
    expect(fitDimensions(800, 600, 1280)).toEqual({ width: 800, height: 600 })
  })
  it('reduz pelo maior lado e mantém a proporção (paisagem)', () => {
    expect(fitDimensions(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 })
  })
  it('reduz pelo maior lado (retrato)', () => {
    expect(fitDimensions(3000, 4000, 960)).toEqual({ width: 720, height: 960 })
  })
  it('nunca devolve lado zero', () => {
    const d = fitDimensions(10000, 3, 720)
    expect(d.width).toBe(720)
    expect(d.height).toBeGreaterThanOrEqual(1)
  })
  it('entrada inválida vira 1x1', () => {
    expect(fitDimensions(0, 100, 720)).toEqual({ width: 1, height: 1 })
  })
})

describe('qualitySteps', () => {
  const steps = qualitySteps()
  it('começa em 0,72 e termina no piso de 0,4', () => {
    expect(steps[0]).toBe(IMAGE_START_QUALITY)
    expect(steps[steps.length - 1]).toBe(IMAGE_MIN_QUALITY)
  })
  it('é estritamente decrescente e nunca passa do piso', () => {
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1])
    expect(Math.min(...steps)).toBe(IMAGE_MIN_QUALITY)
  })
})

describe('dimensionPlan', () => {
  it('foto grande passa por 1280, 960, 720, 540 e 420', () => {
    expect(dimensionPlan(4000, 3000).map(d => Math.max(d.width, d.height))).toEqual([1280, 960, 720, 540, 420])
  })
  it('foto pequena começa no tamanho dela e só reduz (540 e 420), sem repetir', () => {
    expect(dimensionPlan(600, 400)).toEqual([{ width: 600, height: 400 }, { width: 540, height: 360 }, { width: 420, height: 280 }])
  })
  it('foto de 1000 px não repete o tamanho', () => {
    expect(dimensionPlan(1000, 500).map(d => Math.max(d.width, d.height))).toEqual([1000, 960, 720, 540, 420])
  })
  it('nunca amplia: foto de 400 px tem um único tamanho', () => {
    expect(dimensionPlan(400, 300)).toEqual([{ width: 400, height: 300 }])
  })
  it('nenhum tamanho passa do lado original', () => {
    for (const d of dimensionPlan(500, 300)) expect(Math.max(d.width, d.height)).toBeLessThanOrEqual(500)
  })
})

describe('isAcceptedImage', () => {
  it('aceita jpeg, png, webp e heic', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) expect(isAcceptedImage({ type, name: 'x' })).toBe(true)
  })
  it('rejeita gif, svg, pdf e vídeo', () => {
    for (const type of ['image/gif', 'image/svg+xml', 'application/pdf', 'video/mp4']) expect(isAcceptedImage({ type, name: 'x.jpg' })).toBe(false)
  })
  it('sem tipo, vale a extensão', () => {
    expect(isAcceptedImage({ type: '', name: 'IMG_0001.HEIC' })).toBe(true)
    expect(isAcceptedImage({ type: '', name: 'planilha.xlsx' })).toBe(false)
  })
})

describe('pickAudioMime', () => {
  it('prefere webm/opus', () => {
    expect(pickAudioMime(() => true)).toBe('audio/webm;codecs=opus')
  })
  it('depois ogg/opus', () => {
    expect(pickAudioMime(m => m.startsWith('audio/ogg') || m === 'audio/mp4')).toBe('audio/ogg;codecs=opus')
  })
  it('Safari: só mp4', () => {
    expect(pickAudioMime(m => m === 'audio/mp4')).toBe('audio/mp4')
  })
  it('nenhum: undefined', () => {
    expect(pickAudioMime(() => false)).toBeUndefined()
  })
})
