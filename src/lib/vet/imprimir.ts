// Impresso da carteira de vacinas e antiparasitários. O construtor devolve HTML puro (testável); `imprimirCarteira`
// entrega ao mecanismo de impressão do prontuário (printDocumento, src/lib/print.ts). Todo texto digitado passa por `esc`.

import { printDocumento } from '@/lib/print'
import { dataBr } from './datas'
import { fmt } from './numeros'
import { TIPOS_REGISTRO, type RegistroCarteira } from './vacinas'

export const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface CabecalhoCarteira {
  clinica: string
  /** endereço e telefone da clínica, texto livre */
  detalhe?: string
  pet: string
  tutor: string
  especie?: string | null
  raca?: string | null
  sexo?: string | null
  nascimento?: string | null
  microchip?: string | null
  pesoKg?: number | null
  /** AAAA-MM-DD de hoje (data de emissão) */
  emitidoEm: string
}

export interface ProfissionalCarteira {
  nome: string
  /** "CRMV-CE 1234" já formatado; vazio quando não cadastrado */
  registro: string
}

const TH = 'text-align:left;padding:5px 6px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;color:#555'
const TD = 'padding:5px 6px;border-bottom:1px solid #e5e5e5;font-size:12.5px;vertical-align:top'

const dado = (rotulo: string, valor: string | null | undefined) =>
  valor && String(valor).trim() ? `<div style="font-size:12.5px"><span style="color:#555">${esc(rotulo)}:</span> <strong>${esc(valor)}</strong></div>` : ''

/** Da aplicação mais antiga para a mais recente, como numa carteira de papel. */
function cronologico(lista: RegistroCarteira[]): RegistroCarteira[] {
  return [...lista].sort((a, b) => a.applied_on.localeCompare(b.applied_on) || a.created_at.localeCompare(b.created_at))
}

function linhasDoTipo(lista: RegistroCarteira[]): string {
  return cronologico(lista).map(r => {
    const vet = [r.professional_name, r.professional_registration].filter(Boolean).join(' - ')
    return `<tr>
      <td style="${TD}">${esc(dataBr(r.applied_on))}</td>
      <td style="${TD}"><strong>${esc(r.name)}</strong>${r.notes ? `<div style="font-size:11px;color:#555">${esc(r.notes)}</div>` : ''}</td>
      <td style="${TD}">${esc(r.batch ?? '')}</td>
      <td style="${TD}">${esc(r.manufacturer ?? '')}</td>
      <td style="${TD}">${esc(r.next_due_on ? dataBr(r.next_due_on) : '')}</td>
      <td style="${TD}">${esc(vet)}</td>
    </tr>`
  }).join('')
}

/** Carteira completa do pet: dados do animal e uma tabela por tipo (vacinas, vermífugos, antipulgas e carrapatos). */
export function htmlCarteira(c: CabecalhoCarteira, registros: RegistroCarteira[], profissional: ProfissionalCarteira | null): string {
  const blocos = TIPOS_REGISTRO.map(t => {
    const lista = registros.filter(r => r.kind === t.value)
    if (lista.length === 0) return ''
    return `
      <div style="margin:16px 0 4px;font-size:13.5px;font-weight:700;page-break-inside:avoid">${esc(t.plural)}</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr><th style="${TH}">Aplicação</th><th style="${TH}">Produto</th><th style="${TH}">Lote</th><th style="${TH}">Fabricante</th><th style="${TH}">Próxima dose</th><th style="${TH}">Veterinário</th></tr></thead>
        <tbody>${linhasDoTipo(lista)}</tbody>
      </table>`
  }).join('')

  const assinatura = profissional
    ? `${esc(profissional.nome)}${profissional.registro ? ` - ${esc(profissional.registro)}` : ''}`
    : '______________________________________'

  return `
    <div style="padding-bottom:10px;border-bottom:2px solid #333;margin-bottom:14px">
      <div style="font-size:18px;font-weight:800">${esc(c.clinica)}</div>
      ${c.detalhe ? `<div style="font-size:11.5px;color:#555">${esc(c.detalhe)}</div>` : ''}
    </div>
    <div style="font-size:17px;font-weight:800;margin-bottom:8px">Carteira de vacinação e antiparasitários</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;margin-bottom:6px">
      ${dado('Pet', c.pet)}
      ${dado('Tutor', c.tutor)}
      ${dado('Espécie', c.especie)}
      ${dado('Raça', c.raca)}
      ${dado('Sexo', c.sexo)}
      ${dado('Nascimento', c.nascimento ? dataBr(c.nascimento) : '')}
      ${dado('Microchip', c.microchip)}
      ${dado('Peso atual', c.pesoKg ? `${fmt(c.pesoKg, 3)} kg` : '')}
    </div>
    <div style="font-size:11.5px;color:#555;margin-bottom:4px">Emitida em ${esc(dataBr(c.emitidoEm))}</div>
    ${registros.length === 0 ? '<div style="margin-top:14px;font-size:12.5px;color:#666">Nenhum registro na carteira.</div>' : blocos}
    <div style="margin-top:14px;font-size:10.5px;color:#777">As datas de próxima dose seguem o protocolo definido pelo veterinário responsável e a bula de cada produto.</div>
    <div style="margin-top:36px;font-size:12px;color:#444">Médico(a) veterinário(a): ${assinatura}</div>`
}

/** Entrega o HTML à janela de impressão do navegador (Imprimir ou Salvar como PDF). */
export function imprimirCarteira(html: string) {
  printDocumento(html, null)
}
