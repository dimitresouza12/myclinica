import { describe, expect, it } from 'vitest'
import { USERNAME_REGEX, usernameFromEmail } from './username'

describe('usernameFromEmail', () => {
  it('usa o prefixo do e-mail normalizado', () => {
    expect(usernameFromEmail('Dr.João+clinica@exemplo.com')).toBe('dr.joaoclinica')
  })

  it('completa com dígitos quando o prefixo é curto ou vazio', () => {
    for (const email of ['a@x.com', 'ab@x.com', '+++@x.com', '@x.com', 'sem-arroba']) {
      expect(usernameFromEmail(email)).toMatch(USERNAME_REGEX)
    }
  })

  it('remove símbolos no início para começar com letra ou número', () => {
    expect(usernameFromEmail('._-maria@x.com')).toBe('maria')
  })

  it('limita a 30 caracteres, mesmo com sufixo', () => {
    const longo = `${'a'.repeat(60)}@x.com`
    expect(usernameFromEmail(longo)).toHaveLength(30)
    const comSufixo = usernameFromEmail(longo, true)
    expect(comSufixo).toHaveLength(29)
    expect(comSufixo).toMatch(USERNAME_REGEX)
  })

  it('com sufixo anexa 4 dígitos', () => {
    expect(usernameFromEmail('maria@x.com', true)).toMatch(/^maria\d{4}$/)
  })
})
