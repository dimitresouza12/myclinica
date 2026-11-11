import { describe, expect, it } from 'vitest'
import { markSpriteFailed, resetSpriteStatus, spriteFailed } from './spriteStatus'

describe('estado da sprite', () => {
  it('começa sem falha e avisa os assinantes uma vez só quando falha', () => {
    resetSpriteStatus()
    expect(spriteFailed()).toBe(false)
    markSpriteFailed()
    markSpriteFailed()
    expect(spriteFailed()).toBe(true)
    resetSpriteStatus()
  })
})
