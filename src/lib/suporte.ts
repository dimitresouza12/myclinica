// Contato de suporte do MyClinica (WhatsApp). Mesmo número usado na barra lateral e no aviso de cobrança.
export const SUPORTE_WHATSAPP = '5588920020570'

export function suporteUrl(mensagem: string): string {
  return `https://wa.me/${SUPORTE_WHATSAPP}?text=${encodeURIComponent(mensagem)}`
}
