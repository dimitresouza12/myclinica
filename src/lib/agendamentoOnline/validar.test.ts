import { describe, expect, it } from 'vitest'
import { cleanEmail, cleanMobile, cleanName, consentText, MAX_FILL_MS, MIN_FILL_MS, validateBooking } from './validar'

const NOW = 1_800_000_000_000
const PROF = '5b5c8c9a-1d2e-4f3a-9b8c-0123456789ab'
const base = (over: Record<string, unknown> = {}) => ({
  professionalId: PROF, procedureId: null, date: '2026-12-02', time: '09:00',
  name: 'Maria da Silva', phone: '(85) 99999-8888', email: '', consent: true, website: '', openedAt: NOW - 20_000, ...over,
})

describe('validateBooking', () => {
  it('aceita um pedido bom e normaliza', () => {
    const r = validateBooking(base({ email: ' Maria@Exemplo.com ', procedureId: PROF.toUpperCase(), name: '  Maria   da  Silva ' }), NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toMatchObject({
      professionalId: PROF, procedureId: PROF, date: '2026-12-02', time: '09:00', name: 'Maria da Silva',
      phoneDigits: '85999998888', phoneDisplay: '(85) 99999-8888', phoneKey: '8599998888', email: 'maria@exemplo.com',
    })
  })
  it('campo isca preenchido: marca como robô (a rota responde "ok" sem gravar)', () => {
    const r = validateBooking(base({ website: 'http://spam.example' }), NOW)
    expect(r).toMatchObject({ ok: false, honeypot: true })
  })
  it('exige o tempo de preenchimento de uma pessoa', () => {
    expect(validateBooking(base({ openedAt: NOW - (MIN_FILL_MS - 1) }), NOW).ok).toBe(false)
    expect(validateBooking(base({ openedAt: NOW - MIN_FILL_MS }), NOW).ok).toBe(true)
    expect(validateBooking(base({ openedAt: NOW - MAX_FILL_MS - 1 }), NOW).ok).toBe(false)
    expect(validateBooking(base({ openedAt: undefined }), NOW).ok).toBe(false)
    expect(validateBooking(base({ openedAt: 'x' }), NOW).ok).toBe(false)
    expect(validateBooking(base({ openedAt: NOW + 60_000 }), NOW).ok).toBe(false) // data no futuro
  })
  it('profissional, serviço, dia e hora têm de ter o formato certo', () => {
    expect(validateBooking(base({ professionalId: 'abc' }), NOW).ok).toBe(false)
    expect(validateBooking(base({ professionalId: undefined }), NOW).ok).toBe(false)
    expect(validateBooking(base({ procedureId: 'não-é-uuid' }), NOW).ok).toBe(false)
    expect(validateBooking(base({ date: '2026-02-31' }), NOW).ok).toBe(false)
    expect(validateBooking(base({ date: '02/12/2026' }), NOW).ok).toBe(false)
    expect(validateBooking(base({ time: '9:00' }), NOW).ok).toBe(false)
    expect(validateBooking(base({ time: '25:00' }), NOW).ok).toBe(false)
  })
  it('sem o aceite da LGPD não agenda (só `true` vale)', () => {
    expect(validateBooking(base({ consent: false }), NOW).ok).toBe(false)
    expect(validateBooking(base({ consent: 'true' }), NOW).ok).toBe(false)
    expect(validateBooking(base({ consent: 1 }), NOW).ok).toBe(false)
    expect(validateBooking(base({ consent: undefined }), NOW).ok).toBe(false)
  })
  it('recusa corpo com tipos trocados sem estourar', () => {
    expect(validateBooking(base({ name: { a: 1 }, phone: [1, 2] }), NOW).ok).toBe(false)
    expect(validateBooking(base({ website: { x: 1 } }), NOW).ok).toBe(true) // objeto não é texto: não vira isca
  })
})

describe('cleanName', () => {
  it('aceita nomes reais', () => {
    expect(cleanName('José')).toBe('José')
    expect(cleanName("Ana D'Ávila-Souza")).toBe("Ana D'Ávila-Souza")
    expect(cleanName('李 小龙')).toBe('李 小龙')
  })
  it('recusa vazio, curto, longo, só símbolos, link e marcação', () => {
    for (const bad of ['', ' ', 'A', '12345', '!!!', 'x'.repeat(81), 'veja www.site.com', 'http://a.b', '<script>alert(1)</script>', 'a@b', 'Fulano\u0000']) {
      expect(cleanName(bad) === null || bad === 'Fulano\u0000').toBe(true)
    }
    expect(cleanName(undefined)).toBeNull()
    expect(cleanName(null)).toBeNull()
  })
  it('caractere de controle vira espaço', () => {
    expect(cleanName('Ana\u0000Paula')).toBe('Ana Paula')
  })
})

describe('cleanMobile', () => {
  it('aceita celular em vários formatos e devolve dígitos, formato e chave', () => {
    for (const raw of ['(85) 99999-8888', '85999998888', '+55 85 99999-8888', '085 99999-8888', '5585999998888']) {
      expect(cleanMobile(raw)).toEqual({ digits: '85999998888', display: '(85) 99999-8888', key: '8599998888' })
    }
  })
  it('recusa fixo, incompleto, DDD inválido e texto', () => {
    for (const bad of ['(85) 3222-1111', '85 9999', '(10) 99999-8888', 'abc', '', '99999999999999', '0800 123 4567']) {
      expect(cleanMobile(bad)).toBeNull()
    }
    expect(cleanMobile(undefined)).toBeNull()
  })
})

describe('cleanEmail', () => {
  it('vazio é permitido (opcional)', () => {
    expect(cleanEmail('')).toEqual({ ok: true, value: null })
    expect(cleanEmail('   ')).toEqual({ ok: true, value: null })
    expect(cleanEmail(undefined)).toEqual({ ok: true, value: null })
  })
  it('valida o formato', () => {
    expect(cleanEmail('a@b.co')).toEqual({ ok: true, value: 'a@b.co' })
    for (const bad of ['a@b', 'a b@c.com', '@b.com', 'a@@b.com', `${'a'.repeat(120)}@b.com`]) expect(cleanEmail(bad).ok).toBe(false)
  })
  it('recusa charset fora do permitido: acento, aspas, marcação, link e quebra de linha', () => {
    const bad = ['jose@exemplo.\ncom.br', 'josé@exemplo.com', 'a"b@c.com', "o'neil@c.com", 'a<b>@c.com', 'a@c.com;b@d.com', 'a,b@c.com', 'a@c_d.com', 'a@c.com/x', 'a(b)@c.com', 'a@exé.com', `${'a'.repeat(65)}@c.com`]
    for (const e of bad) expect(cleanEmail(e).ok, e).toBe(false)
  })
  it('aceita o formato comum com ponto, mais, hífen e subdomínio', () => {
    expect(cleanEmail('Maria.Silva+clinica@mail-exemplo.com.br')).toEqual({ ok: true, value: 'maria.silva+clinica@mail-exemplo.com.br' })
  })
})

describe('consentText', () => {
  it('leva o nome da clínica, limitado, e cabe no limite do banco', () => {
    expect(consentText('Clínica Sorriso')).toContain('Clínica Sorriso')
    expect(consentText('   ')).toContain('a clínica')
    const t = consentText('x'.repeat(500))
    expect(t.length).toBeGreaterThan(10)
    expect(t.length).toBeLessThanOrEqual(600)
  })
})
