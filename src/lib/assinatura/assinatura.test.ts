import { describe, expect, it } from 'vitest'
import { contentHash, HASH_RE, shortHash, signedHash, sha256Hex } from './hash'
import { cleanUserAgent, validateSignInput } from './validar'
import { fillKnownFields, findPlaceholders, htmlToPlainText, normalizeDocText, prefillDocText, stripPaperSignatureLines, validateDocDraft } from './texto'
import { buildSignedDocumentHtml, buildVerificationStamp, NOTA_ASSINATURA_SIMPLES, type SignedDocView } from './carimbo'
import { buildVerificationView, formatCode, generateVerificationCode, hashCode, normalizeCode, verificationUrl } from './verificacao'

describe('hash', () => {
  it('SHA-256 conhecido', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('hash do conteúdo ignora quebra de linha do Windows, espaços no fim e linhas em branco extras', async () => {
    const a = await contentHash('Linha 1  \r\n\r\n\r\n\r\nLinha 2\r\n')
    const b = await contentHash('Linha 1\n\nLinha 2')
    expect(a).toBe(b)
    expect(a).toMatch(HASH_RE)
    expect(await contentHash('Linha 1\n\nLinha 3')).not.toBe(a)
  })
  it('hash curto em 3 grupos maiúsculos', () => {
    expect(shortHash('abcdef0123456789'.repeat(4))).toBe('ABCD-EF01-2345')
  })
  it('hash do ato muda com qualquer campo', async () => {
    const base = { requestId: 'r', clinicId: 'c', patientId: 'p', contentHash: 'h', signerName: 'Maria Souza', method: 'digitado' as const, signatureImageHash: '', signedAt: '2026-11-17T12:00:00.000Z' }
    const h0 = await signedHash(base)
    expect(h0).toMatch(HASH_RE)
    expect(await signedHash({ ...base })).toBe(h0)
    for (const patch of [{ requestId: 'x' }, { clinicId: 'x' }, { patientId: 'x' }, { contentHash: 'x' }, { signerName: 'Maria Souza Lima' }, { method: 'desenho' as const }, { signatureImageHash: 'x' }, { signedAt: '2026-11-17T12:00:01.000Z' }]) {
      expect(await signedHash({ ...base, ...patch })).not.toBe(h0)
    }
  })
})

describe('validateSignInput', () => {
  const id = '3f2b8a0e-1c4d-4e5f-9a6b-7c8d9e0f1a2b'
  const png = `data:image/png;base64,iVBORw0KGgo${'A'.repeat(600)}`
  it('aceita nome digitado com aceite', () => {
    const r = validateSignInput({ requestId: id, method: 'digitado', signerName: '  Maria   Souza ', accepted: true })
    expect(r).toEqual({ ok: true, requestId: id, method: 'digitado', signerName: 'Maria Souza', drawing: null })
  })
  it('aceita desenho PNG válido', () => {
    const r = validateSignInput({ requestId: id, method: 'desenho', signerName: 'Maria Souza', accepted: true, drawing: png })
    expect(r.ok && r.drawing).toBe(png)
  })
  it('exige aceite explícito (true, não "true")', () => {
    expect(validateSignInput({ requestId: id, method: 'digitado', signerName: 'Maria Souza', accepted: 'true' }).ok).toBe(false)
    expect(validateSignInput({ requestId: id, method: 'digitado', signerName: 'Maria Souza' }).ok).toBe(false)
  })
  it('exige nome completo e sem marcação', () => {
    for (const n of ['Maria', 'Maria S', '', '<b>Maria Souza</b>', 'x'.repeat(130), 42]) {
      expect(validateSignInput({ requestId: id, method: 'digitado', signerName: n, accepted: true }).ok).toBe(false)
    }
  })
  it('recusa id que não é uuid e método desconhecido', () => {
    expect(validateSignInput({ requestId: "1' or '1'='1", method: 'digitado', signerName: 'Maria Souza', accepted: true }).ok).toBe(false)
    expect(validateSignInput({ requestId: id, method: 'biometria', signerName: 'Maria Souza', accepted: true }).ok).toBe(false)
  })
  it('recusa desenho vazio, grande, não PNG ou com cabeçalho falso', () => {
    const base = { requestId: id, method: 'desenho', signerName: 'Maria Souza', accepted: true }
    expect(validateSignInput({ ...base }).ok).toBe(false)
    expect(validateSignInput({ ...base, drawing: 'data:image/png;base64,iVBORw0KGgo' }).ok).toBe(false)
    expect(validateSignInput({ ...base, drawing: `data:image/png;base64,iVBORw0KGgo${'A'.repeat(210_000)}` }).ok).toBe(false)
    expect(validateSignInput({ ...base, drawing: `data:image/svg+xml;base64,${'A'.repeat(600)}` }).ok).toBe(false)
    expect(validateSignInput({ ...base, drawing: `data:image/png;base64,AAAA${'A'.repeat(600)}` }).ok).toBe(false)
    expect(validateSignInput({ ...base, drawing: `${png}"><script>` }).ok).toBe(false)
  })
  it('user-agent sem controle e com limite', () => {
    expect(cleanUserAgent('Mozilla\n\x00X'.repeat(80)).length).toBeLessThanOrEqual(300)
    expect(cleanUserAgent('a\nb')).toBe('a b')
    expect(cleanUserAgent(null)).toBe('')
  })
})

describe('texto do documento', () => {
  it('HTML do modelo vira texto puro com parágrafos', () => {
    const t = htmlToPlainText('<p>Eu, [nome], &amp; outro.</p><p style="x">Linha<br>dois</p><script>alert(1)</script>')
    expect(t).toBe('Eu, [nome], & outro.\n\nLinha\ndois\n\nalert(1)')
    expect(t).not.toContain('<')
  })
  it('acha campos esquecidos entre colchetes', () => {
    expect(findPlaceholders('A [cidade], [data] e [cidade].')).toEqual(['[cidade]', '[data]'])
    expect(findPlaceholders('Tudo preenchido.')).toEqual([])
  })
  it('modelos: preenche paciente e clínica, tira linhas de assinatura em papel', () => {
    const tcle = prefillDocText('tcle', { patientName: 'Maria Souza', clinicName: 'Clínica Sol' }, {
      tcle: '<p>Eu, [nome do paciente], concordo com [nome da clínica].</p><p>Local e data: [cidade]. Assinatura: ______________</p>',
      termo_imagem: '',
    })
    expect(tcle).toBe('Eu, Maria Souza, concordo com Clínica Sol.')
    expect(stripPaperSignatureLines('a\n____\nb')).toBe('a\nb')
    expect(fillKnownFields('[Nome da Clínica]', { patientName: 'x', clinicName: 'Sol' })).toBe('Sol')
  })
  it('contrato usa o texto salvo na ficha; sem contrato fica vazio', () => {
    const tpl = { tcle: '', termo_imagem: '' }
    expect(prefillDocText('contrato', { patientName: 'a', clinicName: 'b', contractText: ' Cláusula 1\r\n' }, tpl)).toBe('Cláusula 1')
    expect(prefillDocText('contrato', { patientName: 'a', clinicName: 'b' }, tpl)).toBe('')
  })
  it('validateDocDraft', () => {
    const ok = validateDocDraft({ docType: 'tcle', title: ' TCLE ', contentText: 'Texto completo do termo de consentimento, sem pendências.' })
    expect(ok.ok && ok.title).toBe('TCLE')
    expect(validateDocDraft({ docType: 'receita', title: 'x', contentText: 'y'.repeat(50) }).ok).toBe(false)
    expect(validateDocDraft({ docType: 'tcle', title: '', contentText: 'y'.repeat(50) }).ok).toBe(false)
    expect(validateDocDraft({ docType: 'tcle', title: 't', contentText: 'curto' }).ok).toBe(false)
    expect(validateDocDraft({ docType: 'tcle', title: 't', contentText: 'y'.repeat(30_000) }).ok).toBe(false)
    const pend = validateDocDraft({ docType: 'tcle', title: 't', contentText: 'Eu, [nome do paciente], autorizo o procedimento descrito.' })
    expect(!pend.ok && pend.error).toContain('[nome do paciente]')
    expect(normalizeDocText('a \r\n\r\n\r\n\r\nb ')).toBe('a\n\nb')
  })
})

describe('código verificador', () => {
  it('80 bits em 16 caracteres Crockford, sem repetir', () => {
    const a = generateVerificationCode()
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/)
    expect(new Set(Array.from({ length: 200 }, generateVerificationCode)).size).toBe(200)
  })
  it('normaliza o que o usuário digita e recusa o resto', () => {
    expect(normalizeCode('abcd-efgh-jkmn-pqrs')).toBe('ABCDEFGHJKMNPQRS')
    expect(normalizeCode('ABCD EFGH JKMN PQRS')).toBe('ABCDEFGHJKMNPQRS')
    expect(normalizeCode('oooo-iiii-llll-0000')).toBe('0000111111110000')
    for (const bad of ['', 'ABC', 'ABCD-EFGH-JKMN-PQRS-T', 'ABCD-EFGH-JKMN-PQRU', "'; drop table", '../../x', 5, null]) expect(normalizeCode(bad)).toBeNull()
    expect(normalizeCode('x'.repeat(100))).toBeNull()
  })
  it('o banco recebe só o hash do código; url usa o código formatado', () => {
    expect(hashCode('ABCDEFGHJKMNPQRS')).toMatch(HASH_RE)
    expect(hashCode('ABCDEFGHJKMNPQRS')).toBe(hashCode('ABCDEFGHJKMNPQRS'))
    expect(formatCode('ABCDEFGHJKMNPQRS')).toBe('ABCD-EFGH-JKMN-PQRS')
    expect(verificationUrl('https://x.com/', 'ABCDEFGHJKMNPQRS')).toBe('https://x.com/verificar/ABCD-EFGH-JKMN-PQRS')
  })
  it('a visão pública traz só clínica, tipo, data, profissional e hash curto', () => {
    const v = buildVerificationView({
      doc_type: 'atestado', issued_at: '2026-11-17T12:00:00Z', revoked_at: null, content_hash: 'ab'.repeat(32),
      professional_name: 'Dra. Ana', professional_registration: 'CRM 123/CE', clinic_name: 'Clínica Sol',
    })
    expect(v).toEqual({ valid: true, clinicName: 'Clínica Sol', typeLabel: 'Atestado', issuedAt: '2026-11-17T12:00:00Z', professional: 'Dra. Ana (CRM 123/CE)', shortHash: 'ABAB-ABAB-ABAB' })
    expect(buildVerificationView({ ...{ doc_type: 'x', issued_at: '', content_hash: 'a'.repeat(64), professional_name: null, professional_registration: null, clinic_name: 'C' }, revoked_at: '2026-11-18T00:00:00Z' })).toMatchObject({ valid: false, typeLabel: 'Documento', professional: null })
  })
})

describe('HTML do selo e do documento assinado', () => {
  const view: SignedDocView = {
    clinic: { name: 'Clínica <Sol>', logo: 'javascript:alert(1)', address: 'Rua "A"', phone: '85999991234' },
    patientName: 'Maria <img src=x onerror=alert(1)>', title: 'TCLE', contentText: 'Parágrafo 1 <script>x</script>\n\nParágrafo 2',
    contentHash: 'a'.repeat(64), signerName: 'Maria Souza', method: 'digitado', signatureImage: null,
    signedAt: '2026-11-17T15:30:00Z', ipHash: 'b'.repeat(64), userAgent: 'UA "x" <b>', signedHash: 'c'.repeat(64), acceptedText: 'Li e concordo.',
  }
  it('escapa tudo que veio do banco ou de digitação e deixa claro que não é ICP-Brasil', () => {
    const html = buildSignedDocumentHtml(view)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('javascript:alert')
    expect(html).toContain('Clínica &lt;Sol&gt;')
    expect(html).toContain('12:30:00') // 15:30Z em Brasília (UTC-3)
    expect(html).toContain('a'.repeat(64))
    expect(html).toContain(NOTA_ASSINATURA_SIMPLES)
    expect(html).toContain('ICP-Brasil')
  })
  it('desenho só entra se for data URL PNG', () => {
    const png = `data:image/png;base64,iVBORw0KGgo${'A'.repeat(50)}`
    expect(buildSignedDocumentHtml({ ...view, method: 'desenho', signatureImage: png })).toContain(`src="${png}"`)
    const evil = buildSignedDocumentHtml({ ...view, method: 'desenho', signatureImage: 'https://evil.com/x.png" onerror="x' })
    expect(evil).not.toContain('evil.com')
  })
  it('selo mostra url, código e hash curto, escapados', () => {
    const s = buildVerificationStamp({ qrDataUri: 'data:image/svg+xml;charset=utf-8,%3Csvg', url: 'https://x.com/verificar/ABCD-EFGH-JKMN-PQRS', code: 'ABCD-EFGH-JKMN-PQRS', contentHash: 'ab'.repeat(32) })
    expect(s).toContain('data-verif-stamp')
    expect(s).toContain('ABCD-EFGH-JKMN-PQRS')
    expect(s).toContain('ABAB-ABAB-ABAB')
    expect(buildVerificationStamp({ qrDataUri: 'x', url: '"><script>', code: 'c', contentHash: 'a'.repeat(64) })).not.toContain('<script>')
  })
})
