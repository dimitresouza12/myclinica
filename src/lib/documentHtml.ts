// HTML dos documentos do prontuário (modelo padrão do sistema, sem papel
// timbrado calibrado). Funções puras: tudo que vem de dado do usuário (nome do
// paciente, da clínica, endereços, logo, cor) passa por escapeHtml/sanitizers
// antes de entrar na string que vai pra innerHTML.
import { formatRegistration, formatRqe, type CouncilInfo } from '@/lib/professionalCouncil'
import type { DocumentTemplateType } from '@/types'

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escapa texto pra uso em conteúdo e em atributo entre aspas. */
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch])
}

const FALLBACK_COLOR = '#4DD9C0'
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%]+\))$/i

/** Cor que entra em `style=""`: só hex/rgb()/hsl() simples, senão a cor padrão. */
export function safeCssColor(color: string | null | undefined): string {
  const c = (color ?? '').trim()
  return SAFE_COLOR.test(c) ? c : FALLBACK_COLOR
}

const SAFE_LOGO = /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);|\/)/i

/** URL de logo aceita em `src=""` (http(s), data:image raster ou caminho do próprio site). */
export function safeLogoUrl(url: string | null | undefined): string {
  const u = (url ?? '').trim()
  return SAFE_LOGO.test(u) ? u : ''
}

// Linha de campo — quando tem valor, mostra "Rótulo: valor"; sem valor,
// mostra "Rótulo:" com um traço em branco pra preencher à mão.
function fieldLine(label: string, value: string) {
  return value
    ? `<p style="margin:0 0 9px">${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong></p>`
    : `<p style="margin:0 0 9px">${escapeHtml(label)}: <span style="display:inline-block;min-width:140px;border-bottom:1px solid #5B665F">&nbsp;</span></p>`
}

interface SignerArgs {
  doctorName: string
  registrationNumber: string
  council: CouncilInfo
  /** RQE do médico (texto livre); só sai no documento quando preenchido */
  rqe?: string
  /** id do profissional responsável — marca o bloco pra poder ser trocado depois */
  professionalId?: string
}

/**
 * Bloco de assinatura do modelo padrão. Leva `data-doc-signature` e
 * `data-prof` (id do profissional) pra a aba conseguir trocar SÓ ele quando o
 * responsável mudar, sem mexer no texto que o usuário já editou.
 */
export function buildSignatureBlock({ doctorName, registrationNumber, council, rqe, professionalId }: SignerArgs): string {
  const registrationText = escapeHtml(formatRegistration(council, registrationNumber))
  const rqeText = escapeHtml(formatRqe(rqe))
  return `<div data-doc-signature data-prof="${escapeHtml(professionalId ?? '')}" style="margin:0 auto 4px;padding-top:10px;border-top:1px solid #1D2421;width:62%;text-align:center">
      <p style="margin:0;font-size:13px">${escapeHtml(doctorName)}</p>
      ${registrationText ? `<p style="font-family:-apple-system,sans-serif;font-size:11px;color:#2B3430;margin:2px 0 0">${registrationText}</p>` : ''}
      ${rqeText ? `<p style="font-family:-apple-system,sans-serif;font-size:11px;color:#2B3430;margin:2px 0 0">${rqeText}</p>` : ''}
      <p style="font-family:-apple-system,sans-serif;font-size:10px;color:#5B665F;margin-top:2px">Assinatura e carimbo</p>
    </div>`
}

/** Bloco "Identificação do emitente" da receita de controle especial (também trocável, ver acima). */
export function buildEmitenteBlock({ doctorName, registrationNumber, council, rqe, professionalId, clinicAddress }: SignerArgs & { clinicAddress: string }): string {
  const registrationText = formatRegistration(council, registrationNumber)
  const rqeText = formatRqe(rqe)
  // "CRM / RQE" vira só "CRM" quando o RQE ganha linha própria logo abaixo.
  const registrationLabel = rqeText ? council.label.replace(/\s*\/\s*RQE$/i, '') : council.label
  return `<div data-doc-emitente data-prof="${escapeHtml(professionalId ?? '')}" style="border:1px solid #5B665F;border-radius:2px;margin-bottom:14px">
        <div style="font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#F3F6F4;color:#1D2421;padding:5px 10px;border-bottom:1px solid #5B665F">Identificação do emitente</div>
        <div style="padding:10px 12px 12px;font-family:-apple-system,sans-serif;font-size:12px;color:#2B3430">
          ${fieldLine('Nome completo', doctorName)}
          ${registrationNumber ? fieldLine(registrationLabel, registrationText) : `<p style="margin:0 0 9px">${escapeHtml(registrationLabel)}: <span style="display:inline-block;min-width:70px;border-bottom:1px solid #5B665F">&nbsp;</span> &nbsp;&nbsp; UF: <span style="display:inline-block;min-width:70px;border-bottom:1px solid #5B665F">&nbsp;</span></p>`}
          ${rqeText ? fieldLine('RQE', rqeText.replace(/^RQE\s*/i, '')) : ''}
          ${fieldLine('Endereço', clinicAddress)}
        </div>
      </div>`
}

/**
 * Conteúdo mínimo quando a clínica tem modelo (PDF/imagem) cadastrado mas sem
 * campos calibrados: só paciente e data por cima do papel timbrado.
 */
export function buildLetterheadPatientBlock(patientName: string, date: string): string {
  return `<p><strong>Paciente:</strong> ${escapeHtml(patientName)}</p><p><strong>Data:</strong> ${escapeHtml(date)}</p><br><p></p>`
}

export interface DefaultTemplateArgs {
  type: DocumentTemplateType
  title: string
  patientName: string
  patientAddress: string
  date: string
  clinicName: string
  clinicAddress: string
  clinicPhone: string
  clinicColor: string
  doctorName: string
  registrationNumber: string
  council: CouncilInfo
  rqe?: string
  professionalId?: string
  // Corpo-modelo genérico do tipo de documento (HTML estático do sistema, ver
  // documentBodyTemplates.ts), vazio = só espaço em branco. NÃO escapado.
  body: string
  clinicLogo?: string
}

// Modelo padrão do sistema (sem PDF próprio cadastrado) — direção
// "clínico-editorial": letterhead com filete na cor da clínica, título em
// caixa alta, corpo em serif (reforça "documento oficial"), rodapé de
// contato. Mesma estrutura de dados de sempre (paciente/data/assinatura),
// só a apresentação mudou.
export function buildDefaultTemplate(args: DefaultTemplateArgs): string {
  const { type, title, date, clinicName, clinicAddress, clinicPhone, doctorName, registrationNumber, council, rqe, body, professionalId } = args
  const color = safeCssColor(args.clinicColor)
  const logo = safeLogoUrl(args.clinicLogo)
  const patientName = escapeHtml(args.patientName)
  const initials = escapeHtml(clinicName.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'C')
  const contactLine = escapeHtml([clinicAddress, clinicPhone].filter(Boolean).join(' · '))
  const clinicNameHtml = escapeHtml(clinicName)
  const signer: SignerArgs = { doctorName, registrationNumber, council, rqe, professionalId }

  const letterhead = `
    <div style="height:3px;width:100%;background:${color};margin-bottom:22px"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:16px;border-bottom:1px solid #E1E6E2;margin-bottom:24px;font-family:-apple-system,sans-serif">
      <div style="display:flex;align-items:center;gap:12px">
        ${logo
          ? `<img src="${escapeHtml(logo)}" alt="Logo" style="height:40px;width:auto;max-width:80px;object-fit:contain" />`
          : `<div style="width:38px;height:38px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">${initials}</div>`
        }
        <p style="font-size:16px;font-weight:700;margin:0;color:#1D2421;font-family:Georgia,'Times New Roman',serif">${clinicNameHtml}</p>
      </div>
      ${contactLine ? `<div style="font-size:11px;line-height:1.5;color:#5B665F;text-align:right;white-space:nowrap">${contactLine}</div>` : ''}
    </div>`

  const footer = contactLine ? `
    <div style="height:1px;background:${color};opacity:.55;margin:30px 0 10px"></div>
    <p style="font-family:-apple-system,sans-serif;font-size:10px;color:#5B665F;text-align:center;margin:0">${clinicNameHtml} · ${contactLine}</p>
  ` : ''

  const titleHtml = escapeHtml(title)

  if (type === 'receita_especial') {
    // Estrutura legal da receita de controle especial: identificação do
    // emitente (com registro profissional), paciente, prescrição, e os
    // blocos de comprador/fornecedor que a farmácia preenche na hora da
    // compra (sempre em branco — não tem como o sistema saber isso antes).
    return `
      ${letterhead}
      <h2 style="text-align:center;font-size:14px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#1D2421;margin:4px 0 2px;font-family:Georgia,'Times New Roman',serif">${titleHtml}</h2>
      <p style="font-family:-apple-system,sans-serif;font-size:11px;color:#5B665F;text-align:right;line-height:1.5;margin:0 0 16px">1ª via — Retenção da farmácia ou drogaria<br>2ª via — Orientação ao paciente</p>

      ${buildEmitenteBlock({ ...signer, clinicAddress })}

      <div style="font-family:-apple-system,sans-serif;font-size:12px;color:#2B3430">
        ${fieldLine('Paciente', args.patientName)}
        ${fieldLine('Endereço', args.patientAddress)}
      </div>

      <p style="font-family:-apple-system,sans-serif;font-size:12px;font-weight:700;color:#1D2421;margin:12px 0 6px">Prescrição</p>
      <div style="border:1px solid #E1E6E2;border-radius:2px;min-height:170px;padding:8px"><p><br></p></div>

      <p style="text-align:right;font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#2B3430;margin:14px 0 16px">Data ____ / ____ / ${new Date().getFullYear()}</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="border:1px solid #5B665F;border-radius:2px">
          <div style="font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#F3F6F4;color:#1D2421;padding:5px 10px;border-bottom:1px solid #5B665F">Identificação do comprador</div>
          <div style="padding:10px 12px 12px;font-family:-apple-system,sans-serif;font-size:11px;color:#2B3430">
            <p style="margin:0 0 8px">Nome: <span style="display:inline-block;min-width:60%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
            <p style="margin:0 0 8px">Ident.: <span style="display:inline-block;min-width:55%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
            <p style="margin:0 0 8px">Órgão emissor: <span style="display:inline-block;min-width:40%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
            <p style="margin:0 0 8px">Endereço: <span style="display:inline-block;min-width:55%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
            <p style="margin:0 0 8px">Cidade: <span style="display:inline-block;min-width:35%;border-bottom:1px solid #5B665F">&nbsp;</span> &nbsp; UF: <span style="display:inline-block;min-width:12%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
            <p style="margin:0">Telefone: <span style="display:inline-block;min-width:50%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
          </div>
        </div>
        <div style="border:1px solid #5B665F;border-radius:2px;display:flex;flex-direction:column">
          <div style="font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#F3F6F4;color:#1D2421;padding:5px 10px;border-bottom:1px solid #5B665F">Identificação do fornecedor</div>
          <div style="padding:10px 12px 12px;flex:1;display:flex;align-items:flex-end">
            <p style="width:100%;display:flex;justify-content:space-between;font-family:-apple-system,sans-serif;font-size:10px;color:#5B665F;margin:0;padding-top:8px;border-top:1px solid #5B665F">
              <span>Assinatura do farmacêutico</span><span>Data ___/___/___</span>
            </p>
          </div>
        </div>
      </div>
      ${footer}
    `
  }

  return `
    ${letterhead}
    <h2 style="text-align:center;font-size:14px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#1D2421;margin:0 0 26px">${titleHtml}</h2>
    <p style="font-family:-apple-system,sans-serif;font-size:12px;color:#5B665F;margin:0 0 4px"><strong style="color:#2B3430">Paciente:</strong> ${patientName}</p>
    <p style="font-family:-apple-system,sans-serif;font-size:12px;color:#5B665F;margin:0 0 24px"><strong style="color:#2B3430">Data:</strong> ${escapeHtml(date)}</p>
    ${body || '<p></p>'}
    <br><br><br>
    ${buildSignatureBlock(signer)}
    ${footer}
  `
}

/**
 * Troca, dentro do HTML do editor, os blocos de assinatura/emitente que
 * pertencem a OUTRO profissional pelo do responsável atual — sem tocar no
 * resto do texto (o que o usuário já editou). Devolve quantos blocos trocou.
 * Roda sobre um container (HTMLElement), não sobre string.
 */
export function syncSignerBlocks(
  root: Pick<ParentNode, 'querySelectorAll'>,
  signer: SignerArgs & { clinicAddress: string },
): number {
  const currentId = signer.professionalId ?? ''
  let changed = 0
  root.querySelectorAll<HTMLElement>('[data-doc-signature],[data-doc-emitente]').forEach(el => {
    if ((el.getAttribute('data-prof') ?? '') === currentId) return
    el.outerHTML = el.hasAttribute('data-doc-emitente') ? buildEmitenteBlock(signer) : buildSignatureBlock(signer)
    changed++
  })
  return changed
}
