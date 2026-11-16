import { describe, expect, it } from 'vitest'
import { sanitizeRichHtml, safeHref, safeImageSrc } from './sanitize'
import { buildDefaultTemplate, buildLetterheadPatientBlock, buildSignatureBlock } from './documentHtml'
import { buildVerificationStamp } from './assinatura/carimbo'
import { qrDataUri } from './qr/qr'
import * as bodies from './documentBodyTemplates'

/** Todo `<` da saída é tag de verdade (texto é escapado): nenhuma pode ter handler, script ou esquema perigoso. */
function expectNoActiveContent(out: string) {
  const tags = out.match(/<[^>]*>/g) ?? []
  for (const t of tags) {
    expect(t).not.toMatch(/^<\s*(script|style|svg|math|iframe|object|embed|template|link|meta|base|form|input|button)\b/i)
    expect(t).not.toMatch(/\son[a-z]+\s*=/i)
    expect(t).not.toMatch(/javascript\s*:/i)
    expect(t).not.toMatch(/vbscript\s*:/i)
    expect(t).not.toMatch(/expression\s*\(|url\s*\(/i)
  }
  expect(out).not.toMatch(/<script/i)
}

describe('sanitizeRichHtml: payloads de XSS', () => {
  const payloads: [string, string][] = [
    ['script', '<p>oi</p><script>alert(1)</script><p>fim</p>'],
    ['script maiúsculo/espaçado', '<SCRIPT\n>alert(1)</SCRIPT >'],
    ['script sem fechar', '<p>a</p><script>alert(1)'],
    ['img onerror', '<img src=x onerror=alert(1)>'],
    ['img onerror aspas', '<img src="https://x.co/a.png" onerror="alert(1)" onload=\'alert(2)\'>'],
    ['a javascript:', '<a href="javascript:alert(1)">clique</a>'],
    ['a javascript: com entidade', '<a href="jav&#x61;script&colon;alert(1)">x</a>'],
    ['a javascript: com tab e newline', '<a href="java\tscript:alert(1)">x</a><a href="  jav&#9;ascript:alert(1)">y</a>'],
    ['a vbscript e data', '<a href="vbscript:msgbox(1)">x</a><a href="data:text/html,<script>alert(1)</script>">y</a>'],
    ['svg onload', '<svg onload=alert(1)><circle/></svg>'],
    ['svg aninhado', '<svg><g><script>alert(1)</script></g></svg><p>ok</p>'],
    ['math', '<math><mi xlink:href="javascript:alert(1)">x</mi></math>'],
    ['iframe', '<iframe src="javascript:alert(1)"></iframe><iframe srcdoc="<script>alert(1)</script>"></iframe>'],
    ['object/embed', '<object data="javascript:alert(1)"></object><embed src="javascript:alert(1)">'],
    ['style tag', '<style>body{background:url(javascript:alert(1))}</style>'],
    ['style attr', '<p style="background:url(javascript:alert(1));color:red">x</p>'],
    ['style expression', '<p style="width:expression(alert(1))">x</p>'],
    ['style escape css', '<p style="color:\\72 ed;background:u\\72l(x)">x</p>'],
    ['body onload / form', '<body onload=alert(1)><form action="javascript:alert(1)"><input onfocus=alert(1) autofocus><button formaction="javascript:alert(1)">x</button></form>'],
    ['link/meta/base', '<link rel="stylesheet" href="https://evil.test/x.css"><meta http-equiv="refresh" content="0;url=javascript:alert(1)"><base href="https://evil.test/">'],
    ['comentário condicional', '<!--[if IE]><script>alert(1)</script><![endif]--><p>x</p>'],
    ['mXSS noscript', '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>'],
    ['mXSS style/svg', '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">'],
    ['mXSS textarea/title', '<textarea></textarea><img src=x onerror=alert(1)></textarea><title></title><img src=x onerror=alert(1)>'],
    ['tag cortada', '<p>ok</p><img src=x onerror=alert(1)'],
    ['atributo sem aspas e barra', '<img/src=x/onerror=alert(1)>'],
    ['evento em tag permitida', '<p onclick="alert(1)" onmouseover=alert(2)>x</p><table onclick="x"><tr><td onclick="y">1</td></tr></table>'],
    ['srcdoc/formaction', '<a href="https://ok.test" onclick="x" target="_blank">x</a>'],
    ['img src javascript', '<img src="javascript:alert(1)"><img src="data:text/html;base64,PHNjcmlwdD4="><img src="vbscript:x">'],
    ['entidades duplas em texto', '&lt;script&gt;alert(1)&lt;/script&gt; &#60;img src=x onerror=alert(1)&#62;'],
    ['null byte', '<scr\u0000ipt>alert(1)</scr\u0000ipt><img src=x onerror\u0000=alert(1)>'],
    ['plaintext', '<p>a</p><plaintext><script>alert(1)</script>'],
    ['template', '<template><script>alert(1)</script></template>'],
  ]
  for (const [name, html] of payloads) {
    it(name, () => {
      const out = sanitizeRichHtml(html)
      expectNoActiveContent(out)
      // idempotente: sanitizar de novo não muda nada
      expect(sanitizeRichHtml(out)).toBe(out)
    })
  }

  it('script some com o conteúdo, texto vizinho fica', () => {
    expect(sanitizeRichHtml('<p>oi</p><script>alert(1)</script><p>fim</p>')).toBe('<p>oi</p><p>fim</p>')
  })
  it('img onerror perde o handler mas mantém a imagem válida', () => {
    expect(sanitizeRichHtml('<img src="https://x.co/a.png" onerror="alert(1)">')).toBe('<img src="https://x.co/a.png">')
  })
  it('img sem origem válida some', () => {
    expect(sanitizeRichHtml('<img src=x onerror=alert(1)>')).toBe('')
    expect(sanitizeRichHtml('<img src="javascript:alert(1)">')).toBe('')
  })
  it('a javascript: perde o href e mantém o texto', () => {
    expect(sanitizeRichHtml('<a href="javascript:alert(1)">clique</a>')).toBe('<a>clique</a>')
    expect(sanitizeRichHtml('<a href="jav&#x61;script&colon;alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeRichHtml('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>')
  })
  it('svg e math somem inteiros', () => {
    expect(sanitizeRichHtml('<svg onload=alert(1)><circle/></svg><p>ok</p>')).toBe('<p>ok</p>')
    expect(sanitizeRichHtml('<p>a</p><math><mi>x</mi></math>')).toBe('<p>a</p>')
  })
  it('texto com entidades de tag continua texto', () => {
    const out = sanitizeRichHtml('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
  it('< solto vira texto', () => {
    expect(sanitizeRichHtml('1 < 2 e 3 > 2')).toBe('1 &lt; 2 e 3 &gt; 2')
  })
  it('tag desconhecida perde a marcação e mantém o texto', () => {
    expect(sanitizeRichHtml('<blink>oi</blink><marquee onstart=x>tchau</marquee>')).toBe('oitchau')
  })
  it('style: remove url(), expression e propriedades desconhecidas, mantém o resto', () => {
    expect(sanitizeRichHtml('<p style="color:red;background:url(x);position:fixed;font-weight:700">x</p>')).toBe('<p style="color:red;font-weight:700">x</p>')
    expect(sanitizeRichHtml('<p style="width:expression(alert(1))">x</p>')).toBe('<p>x</p>')
    expect(sanitizeRichHtml('<p style="color:\\72 ed">x</p>')).toBe('<p>x</p>')
  })
  it('target=_blank ganha rel seguro', () => {
    expect(sanitizeRichHtml('<a href="https://ok.test/x?a=1&amp;b=2" target="_blank">x</a>')).toBe('<a href="https://ok.test/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a>')
  })
  it('devolve HTML balanceado', () => {
    expect(sanitizeRichHtml('<div><p>a<b>b')).toBe('<div><p>a<b>b</b></p></div>')
    expect(sanitizeRichHtml('a</div></p>b')).toBe('ab')
  })
  it('entrada que não é string vira vazio', () => {
    expect(sanitizeRichHtml(null)).toBe('')
    expect(sanitizeRichHtml(undefined)).toBe('')
    expect(sanitizeRichHtml(42)).toBe('')
  })
})

describe('safeHref / safeImageSrc', () => {
  it('links', () => {
    expect(safeHref('https://a.co')).toBe('https://a.co')
    expect(safeHref('mailto:a@b.co')).toBe('mailto:a@b.co')
    expect(safeHref('#topo')).toBe('#topo')
    expect(safeHref('/rota')).toBe('/rota')
    expect(safeHref('//evil.test')).toBeNull()
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeHref('&#106;avascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,x')).toBeNull()
  })
  it('imagens', () => {
    expect(safeImageSrc('https://a.co/x.png')).toBe('https://a.co/x.png')
    expect(safeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(safeImageSrc('data:image/svg+xml;charset=utf-8,%3Csvg%3E')).toContain('data:image/svg+xml')
    expect(safeImageSrc('data:text/html;base64,AAAA')).toBeNull()
    expect(safeImageSrc('javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('x')).toBeNull()
  })
})

describe('sanitizeRichHtml: modelos legítimos continuam funcionando', () => {
  it('formatação básica, listas e tabelas', () => {
    const html = '<p style="text-align:center"><strong>Título</strong> <em>itálico</em> <u>sub</u></p><ul><li>um</li><li>dois</li></ul><ol start="2"><li>x</li></ol>'
      + '<table style="width:100%;border-collapse:collapse"><thead><tr><th>A</th></tr></thead><tbody><tr><td colspan="2" style="padding:4px;border:1px solid #ccc">1</td></tr></tbody></table>'
    expect(sanitizeRichHtml(html)).toBe(html)
  })
  it('execCommand: font, b, span com style', () => {
    const html = '<font color="#ff0000" face="Arial" size="4">x</font><span style="font-family: Arial; font-size: 14px;">y</span>'
    expect(sanitizeRichHtml(html)).toBe('<font color="#ff0000" face="Arial" size="4">x</font><span style="font-family:Arial;font-size:14px">y</span>')
  })
  it('imagem de papel timbrado (https e data:image) mantém src e dimensões', () => {
    const a = '<img src="https://x.supabase.co/storage/v1/object/public/logo.png" alt="Logo" style="height:40px;width:auto;max-width:80px;object-fit:contain">'
    expect(sanitizeRichHtml(a)).toBe(a)
    const b = '<img src="data:image/png;base64,iVBORw0KGgo=" width="120" height="60">'
    expect(sanitizeRichHtml(b)).toBe(b)
  })
  it('entidades legítimas e acentos ficam', () => {
    expect(sanitizeRichHtml('<p>Jo&atilde;o &amp; Maria &nbsp; ação</p>')).toBe('<p>Jo&atilde;o &amp; Maria &nbsp; ação</p>')
  })

  const council = { code: 'CRM', label: 'CRM / RQE' } as const
  const args = {
    type: 'atestado' as const, title: 'ATESTADO', patientName: 'Ana <b>', patientAddress: 'Rua A', date: '1 de janeiro de 2026',
    clinicName: 'Clínica X', clinicAddress: 'Av. B', clinicPhone: '(85) 99999-0000', clinicColor: '#4DD9C0',
    doctorName: 'Dr. Y', registrationNumber: '123', council, body: '<p>corpo</p>', professionalId: 'prof-1',
    clinicLogo: 'https://x.co/logo.png',
  }
  for (const type of ['atestado', 'receita_especial'] as const) {
    it(`modelo padrão (${type}) passa íntegro, com marcas do editor e estilos`, () => {
      const html = buildDefaultTemplate({ ...args, type })
      const out = sanitizeRichHtml(html)
      expect(out).toContain('data-doc-' + (type === 'receita_especial' ? 'emitente' : 'signature'))
      expect(out).toContain('data-prof="prof-1"')
      expect(out).toContain('<img src="https://x.co/logo.png"')
      expect(out).toContain('display:flex')
      expect(out).toContain('font-family:Georgia,\'Times New Roman\',serif'.replace(/'/g, '&#39;'))
      if (type === 'receita_especial') expect(out).toContain('grid-template-columns:1fr 1fr')
      // mesma quantidade de tags (nada de útil foi removido)
      const count = (s: string) => (s.match(/<[a-z0-9]+[\s>]/gi) ?? []).length
      expect(count(out)).toBe(count(html))
      expectNoActiveContent(out)
    })
  }
  it('bloco do paciente e assinatura', () => {
    const out = sanitizeRichHtml(buildLetterheadPatientBlock('Ana', '1 de janeiro') + buildSignatureBlock({ doctorName: 'Dr. Y', registrationNumber: '1', council, professionalId: 'p9' }))
    expect(out).toContain('<p><strong>Paciente:</strong> Ana</p>')
    expect(out).toContain('data-doc-signature')
    expect(out).toContain('data-prof="p9"')
  })
  it('todos os corpos-modelo do sistema passam sem perder tags', () => {
    const count = (s: string) => (s.match(/<[a-z0-9]+[\s>]/gi) ?? []).length
    for (const [key, value] of Object.entries(bodies)) {
      if (typeof value !== 'string' || !value.includes('<')) continue
      const out = sanitizeRichHtml(value)
      expect(count(out), key).toBe(count(value))
    }
  })
  it('selo de verificação (QR em data:image/svg+xml dentro de <img>) é preservado', () => {
    const stamp = buildVerificationStamp({ qrDataUri: qrDataUri('https://x.co/v/ABC'), url: 'https://x.co/v/ABC', code: 'ABCD-1234', contentHash: 'a'.repeat(64) })
    const out = sanitizeRichHtml(stamp)
    expect(out).toContain('<img src="data:image/svg+xml')
    expect(out).toContain('data-verif-stamp')
    expect(out).toContain('ABCD-1234')
  })
})

describe('sanitizeRichHtml: dado do usuário já escapado pelos builders continua inofensivo', () => {
  it('nome malicioso no modelo padrão não vira tag', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const out = sanitizeRichHtml(buildDefaultTemplate({
      type: 'atestado', title: evil, patientName: evil, patientAddress: evil, date: evil, clinicName: evil, clinicAddress: evil,
      clinicPhone: evil, clinicColor: 'red;background:url(x)', doctorName: evil, registrationNumber: evil,
      council: { code: 'CRM', label: 'CRM' }, body: '', clinicLogo: 'javascript:alert(1)',
    }))
    expectNoActiveContent(out)
    expect(out).not.toMatch(/<img/)
  })
})
