// HTML do selo de verificação (QR) e do documento assinado com carimbo, para imprimir. Funções puras:
// todo dado que vem do banco ou de digitação passa por escapeHtml.

import { escapeHtml, safeLogoUrl } from '@/lib/documentHtml'
import { formatBrPhone } from '@/lib/phoneFormat'
import { BRASIL_TZ } from '@/lib/brasilDate'
import { shortHash } from './hash'

export const NOTA_ASSINATURA_SIMPLES =
  'Assinatura eletrônica simples (Lei 14.063/2020, art. 4º, I). Não é assinatura com certificado digital ICP-Brasil (MP 2.200-2/2001).'

export function formatDateTimeBr(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toLocaleString('pt-BR', { timeZone: BRASIL_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} (Brasília)`
}

export interface StampArgs { qrDataUri: string; url: string; code: string; contentHash: string }

/** Selo no rodapé do documento: QR + endereço + código + hash curto. Estilos inline para valer no editor, no PDF e na impressão. */
export function buildVerificationStamp(a: StampArgs): string {
  return `<div data-verif-stamp style="display:flex;align-items:center;gap:10px;margin-top:22px;padding-top:8px;border-top:1px solid #c9ceca;font-family:Arial,sans-serif;font-size:9px;line-height:1.4;color:#444;text-align:left">
    <img src="${escapeHtml(a.qrDataUri)}" alt="QR de verificação" style="width:72px;height:72px;flex:none" />
    <div>
      <div style="font-weight:700;color:#111">Verifique a autenticidade deste documento</div>
      <div>${escapeHtml(a.url)}</div>
      <div>Código: <strong>${escapeHtml(a.code)}</strong> &middot; Hash: <strong>${escapeHtml(shortHash(a.contentHash))}</strong></div>
    </div>
  </div>`
}

export interface SignedDocView {
  clinic: { name: string; logo?: string | null; address?: string | null; phone?: string | null }
  patientName: string
  title: string
  contentText: string
  contentHash: string
  signerName: string
  method: 'desenho' | 'digitado'
  signatureImage: string | null
  signedAt: string
  ipHash: string
  userAgent: string
  signedHash: string
  acceptedText: string
}

const PNG_URI = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/

/** Documento completo, pronto para `openPrint`: texto assinado + bloco de assinatura + carimbo com data, hash e dados técnicos. */
export function buildSignedDocumentHtml(v: SignedDocView): string {
  const paragraphs = v.contentText.split(/\n{2,}/).map(p => `<p style="margin:0 0 10px;white-space:pre-wrap">${escapeHtml(p)}</p>`).join('')
  const logo = safeLogoUrl(v.clinic.logo)
  const sig = v.method === 'desenho' && v.signatureImage && PNG_URI.test(v.signatureImage)
    ? `<img src="${v.signatureImage}" alt="Assinatura desenhada" style="max-height:90px;max-width:280px;display:block;margin:0 auto" />`
    : `<div style="font-family:'Brush Script MT','Segoe Script',cursive;font-size:26px;text-align:center">${escapeHtml(v.signerName)}</div>`
  const row = (k: string, val: string) => `<tr><td style="padding:2px 8px 2px 0;color:#666;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:2px 0;word-break:break-all">${val}</td></tr>`
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(v.title)}</title>
    <style>
      * { box-sizing: border-box; }
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #111; margin: 0 auto; max-width: 800px; padding: 24px; }
      h1 { font-size: 17px; margin: 0 0 14px; text-align: center; text-transform: uppercase; }
      table { border-collapse: collapse; font-size: 10px; }
      .stamp { margin-top: 28px; border: 1px solid #999; border-radius: 4px; padding: 10px 12px; font-size: 10px; page-break-inside: avoid; }
    </style></head><body>
    <div style="display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:2px solid #333;margin-bottom:18px">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" style="height:54px;width:auto" />` : ''}
      <div>
        <div style="font-size:18px;font-weight:800">${escapeHtml(v.clinic.name)}</div>
        ${v.clinic.address ? `<div style="font-size:11px;color:#555">${escapeHtml(v.clinic.address)}</div>` : ''}
        ${v.clinic.phone ? `<div style="font-size:11px;color:#555">${escapeHtml(formatBrPhone(v.clinic.phone))}</div>` : ''}
      </div>
    </div>
    <h1>${escapeHtml(v.title)}</h1>
    <p style="margin:0 0 14px;font-size:12px;color:#444">Paciente: <strong>${escapeHtml(v.patientName)}</strong></p>
    ${paragraphs}
    <div style="margin-top:26px;width:300px;margin-left:auto;margin-right:auto">
      ${sig}
      <div style="border-top:1px solid #111;margin-top:6px;padding-top:4px;text-align:center;font-size:12px">${escapeHtml(v.signerName)}</div>
    </div>
    <div class="stamp">
      <div style="font-weight:700;margin-bottom:4px">Carimbo da assinatura eletrônica</div>
      <table>
        ${row('Assinado em', escapeHtml(formatDateTimeBr(v.signedAt)))}
        ${row('Método', v.method === 'desenho' ? 'Desenho na tela + nome digitado' : 'Nome digitado')}
        ${row('Aceite', escapeHtml(v.acceptedText))}
        ${row('Hash do conteúdo (SHA-256)', escapeHtml(v.contentHash))}
        ${row('Hash da assinatura (SHA-256)', escapeHtml(v.signedHash))}
        ${row('IP (hash HMAC)', escapeHtml(v.ipHash.slice(0, 32)))}
        ${row('Dispositivo', escapeHtml(v.userAgent))}
      </table>
      <div style="margin-top:6px;color:#444">${escapeHtml(NOTA_ASSINATURA_SIMPLES)}</div>
    </div>
  </body></html>`
}
