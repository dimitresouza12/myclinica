import { describe, expect, it } from 'vitest'
import {
  clampSlider, collectPhotos, daysBetween, formatInterval, formatPhotoDate, photoOptionLabel,
  pickPhoto, pointerToPercent, procedureLabel, reconcilePair, sliderKeyValue, sortPhotosByDate,
  storagePathFromPhotoUrl, suggestPair, type EntryLike,
} from './antesDepois'

const entry = (id: string, created_at: string, photos: string[], extra: Partial<EntryLike> = {}): EntryLike =>
  ({ id, created_at, entry_text: `Procedimento ${id}`, photo_urls: photos, ...extra })

describe('collectPhotos', () => {
  it('junta só imagens, da mais antiga para a mais nova', () => {
    const photos = collectPhotos([
      entry('c', '2026-09-01T12:00:00Z', ['evolucao/c1/p1/c.jpg']),
      entry('a', '2026-03-01T12:00:00Z', ['evolucao/c1/p1/a.png', 'evolucao/c1/p1/laudo.pdf']),
      entry('b', '2026-06-01T12:00:00Z', ['evolucao/c1/p1/audio.m4a']),
    ])
    expect(photos.map(p => p.entryId)).toEqual(['a', 'c'])
    expect(photos[0].total).toBe(1)
  })
  it('ignora anotação sigilosa, evolução sem foto e aceita o campo photo_url antigo', () => {
    const photos = collectPhotos([
      entry('s', '2026-01-01T00:00:00Z', ['evolucao/x.jpg'], { is_confidential: true }),
      { id: 'o', created_at: '2026-02-01T00:00:00Z', photo_url: 'evolucao/old.jpg', photo_urls: [] },
      entry('n', '2026-03-01T00:00:00Z', []),
    ])
    expect(photos.map(p => p.entryId)).toEqual(['o'])
  })
  it('numera várias fotos da mesma evolução e gera chaves únicas', () => {
    const photos = collectPhotos([entry('a', '2026-03-01T00:00:00Z', ['x/1.jpg', 'x/2.jpg', 'x/3.pdf', 'x/4.jpg'])])
    expect(photos.map(p => `${p.index}/${p.total}`)).toEqual(['1/3', '2/3', '3/3'])
    expect(new Set(photos.map(p => p.key)).size).toBe(3)
  })
  it('lista vazia', () => {
    expect(collectPhotos([])).toEqual([])
  })
})

describe('storagePathFromPhotoUrl', () => {
  it('path relativo passa direto e URL antiga do storage vira path', () => {
    expect(storagePathFromPhotoUrl('evolucao/a/b/1.jpg')).toBe('evolucao/a/b/1.jpg')
    expect(storagePathFromPhotoUrl('https://x.supabase.co/storage/v1/object/public/pacientes/evolucao/a/b/1.jpg?t=1')).toBe('evolucao/a/b/1.jpg')
    expect(storagePathFromPhotoUrl('https://outro.com/foto.jpg')).toBeNull()
    expect(storagePathFromPhotoUrl('')).toBeNull()
  })
})

describe('sortPhotosByDate', () => {
  const items = [
    { takenAt: '2026-05-01T00:00:00Z', n: 1 },
    { takenAt: 'lixo', n: 2 },
    { takenAt: '2026-01-01T00:00:00Z', n: 3 },
    { takenAt: '2026-05-01T00:00:00Z', n: 4 },
  ]
  it('crescente, estável no empate e com data inválida no fim', () => {
    expect(sortPhotosByDate(items, 'asc').map(i => i.n)).toEqual([3, 1, 4, 2])
  })
  it('decrescente mantém a data inválida no fim e não altera o original', () => {
    expect(sortPhotosByDate(items, 'desc').map(i => i.n)).toEqual([1, 4, 3, 2])
    expect(items.map(i => i.n)).toEqual([1, 2, 3, 4])
  })
})

describe('seleção de pares', () => {
  const photos = collectPhotos([
    entry('a', '2026-01-10T12:00:00Z', ['p/a.jpg']),
    entry('b', '2026-02-10T12:00:00Z', ['p/b.jpg']),
    entry('c', '2026-03-10T12:00:00Z', ['p/c.jpg']),
  ])
  const [ka, kb, kc] = photos.map(p => p.key)

  it('sugere a mais antiga como antes e a mais nova como depois', () => {
    expect(suggestPair(photos)).toEqual({ before: ka, after: kc })
  })
  it('menos de duas fotos não forma par', () => {
    expect(suggestPair([])).toBeNull()
    expect(suggestPair(photos.slice(0, 1))).toBeNull()
  })
  it('trocar para a foto do outro lado inverte os dois em vez de repetir', () => {
    expect(pickPhoto({ before: ka, after: kc }, 'before', kc)).toEqual({ before: kc, after: ka })
    expect(pickPhoto({ before: ka, after: kc }, 'after', ka)).toEqual({ before: kc, after: ka })
    expect(pickPhoto({ before: ka, after: kc }, 'before', kb)).toEqual({ before: kb, after: kc })
  })
  it('reconcilePair mantém par válido e refaz quando uma foto some', () => {
    expect(reconcilePair({ before: kb, after: kc }, photos)).toEqual({ before: kb, after: kc })
    expect(reconcilePair({ before: 'sumiu', after: kc }, photos)).toEqual({ before: ka, after: kc })
    expect(reconcilePair(null, photos)).toEqual({ before: ka, after: kc })
    expect(reconcilePair({ before: ka, after: kc }, photos.slice(0, 1))).toBeNull()
  })
})

describe('rótulos e datas', () => {
  it('procedureLabel tira HTML, pega a primeira linha e corta', () => {
    expect(procedureLabel('<p>Preenchimento labial</p><p>Obs</p>')).toBe('Preenchimento labial')
    expect(procedureLabel('  \n Limpeza &amp; polimento \n resto')).toBe('Limpeza & polimento')
    expect(procedureLabel(null)).toBe('')
    expect(procedureLabel('x'.repeat(80), 20)).toHaveLength(20)
  })
  it('formata data no fuso do Brasil e trata data inválida', () => {
    expect(formatPhotoDate('2026-03-01T01:00:00Z')).toBe('28/02/2026')
    expect(formatPhotoDate('nada')).toBe('Sem data')
  })
  it('photoOptionLabel junta data, procedimento e posição', () => {
    const [p] = collectPhotos([entry('a', '2026-03-10T15:00:00Z', ['p/1.jpg', 'p/2.jpg'])])
    expect(photoOptionLabel(p)).toBe('10/03/2026 - Procedimento a - foto 1 de 2')
  })
  it('intervalo entre fotos', () => {
    expect(daysBetween('2026-01-01T00:00:00Z', '2026-01-11T00:00:00Z')).toBe(10)
    expect(daysBetween('x', '2026-01-11T00:00:00Z')).toBeNull()
    expect(formatInterval(0)).toBe('no mesmo dia')
    expect(formatInterval(1)).toBe('1 dia depois')
    expect(formatInterval(90)).toBe('3 meses depois')
    expect(formatInterval(400)).toBe('1 ano e 1 mês depois')
    expect(formatInterval(null)).toBe('')
  })
})

describe('slider', () => {
  it('clampSlider limita a 0..100 e trata valores inválidos', () => {
    expect(clampSlider(-20)).toBe(0)
    expect(clampSlider(140)).toBe(100)
    expect(clampSlider(37.5)).toBe(37.5)
    expect(clampSlider(NaN)).toBe(50)
    expect(clampSlider(Infinity)).toBe(50)
  })
  it('pointerToPercent converte a posição e protege contra largura zero', () => {
    expect(pointerToPercent(150, 100, 200)).toBe(25)
    expect(pointerToPercent(0, 100, 200)).toBe(0)
    expect(pointerToPercent(900, 100, 200)).toBe(100)
    expect(pointerToPercent(150, 100, 0)).toBe(50)
  })
  it('teclado: setas, Shift, PageUp/Down, Home/End e limites', () => {
    expect(sliderKeyValue(50, 'ArrowRight')).toBe(52)
    expect(sliderKeyValue(50, 'ArrowLeft')).toBe(48)
    expect(sliderKeyValue(50, 'ArrowRight', true)).toBe(60)
    expect(sliderKeyValue(98, 'ArrowRight')).toBe(100)
    expect(sliderKeyValue(1, 'ArrowLeft')).toBe(0)
    expect(sliderKeyValue(50, 'PageUp')).toBe(60)
    expect(sliderKeyValue(50, 'Home')).toBe(0)
    expect(sliderKeyValue(50, 'End')).toBe(100)
    expect(sliderKeyValue(50, 'a')).toBeNull()
  })
})
