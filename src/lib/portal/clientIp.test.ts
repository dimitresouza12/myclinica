import { describe, expect, it } from 'vitest'
import { clientIpFromHeaders, trustedProxyHops } from './clientIp'

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null })

describe('IP do cliente atrás de proxy', () => {
  it('1 salto: usa o último valor, ignorando o forjado pelo cliente', () => {
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }), 1)).toBe('203.0.113.9')
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': '203.0.113.9' }), 1)).toBe('203.0.113.9')
  })
  it('rotacionar o valor forjado não muda o IP', () => {
    const a = clientIpFromHeaders(h({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }), 1)
    const b = clientIpFromHeaders(h({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3, 203.0.113.9' }), 1)
    expect(a).toBe(b)
  })
  it('2 saltos: penúltimo valor', () => {
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.0.0.2' }), 2)).toBe('203.0.113.9')
  })
  it('lista mais curta que os saltos: usa o primeiro disponível', () => {
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': '203.0.113.9' }), 3)).toBe('203.0.113.9')
  })
  it('sem XFF: cai para x-real-ip; sem nada: unknown', () => {
    expect(clientIpFromHeaders(h({ 'x-real-ip': '198.51.100.4' }), 1)).toBe('198.51.100.4')
    expect(clientIpFromHeaders(h({}), 1)).toBe('unknown')
  })
  it('0 saltos: ignora cabeçalhos de cliente', () => {
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '7.7.7.7' }), 0)).toBe('unknown')
  })
  it('valor que não parece IP é descartado', () => {
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': '<script>' }), 1)).toBe('unknown')
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': '2001:db8::1' }), 1)).toBe('2001:db8::1')
  })
  it('PORTAL_TRUSTED_PROXY_HOPS: padrão 1, inválido volta ao padrão', () => {
    expect(trustedProxyHops({})).toBe(1)
    expect(trustedProxyHops({ PORTAL_TRUSTED_PROXY_HOPS: '2' })).toBe(2)
    expect(trustedProxyHops({ PORTAL_TRUSTED_PROXY_HOPS: '0' })).toBe(0)
    expect(trustedProxyHops({ PORTAL_TRUSTED_PROXY_HOPS: 'x' })).toBe(1)
    expect(trustedProxyHops({ PORTAL_TRUSTED_PROXY_HOPS: '-1' })).toBe(1)
  })
})
