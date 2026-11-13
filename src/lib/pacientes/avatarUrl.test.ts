import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { avatarStoragePath, patientAvatarPath } from './avatarUrl'

describe('patientAvatarPath', () => {
  it('usa nome fixo por paciente e a extensão do formato', () => {
    expect(patientAvatarPath('c1', 'p1', 'image/webp')).toBe('c1/p1/avatar.webp')
    expect(patientAvatarPath('c1', 'p1', 'image/jpeg')).toBe('c1/p1/avatar.jpg')
  })
})

describe('avatarStoragePath', () => {
  it('vazio vira null', () => {
    expect(avatarStoragePath(null, 'c1', 'p1')).toBeNull()
    expect(avatarStoragePath('  ', 'c1', 'p1')).toBeNull()
  })
  it('mantém o caminho do storage', () => {
    expect(avatarStoragePath('c1/p1/avatar.png', 'c1', 'p1')).toBe('c1/p1/avatar.png')
  })
  it('URL antiga cai no nome fixo', () => {
    expect(avatarStoragePath('https://x.supabase.co/a.jpg', 'c1', 'p1')).toBe('c1/p1/avatar.jpg')
  })
})
