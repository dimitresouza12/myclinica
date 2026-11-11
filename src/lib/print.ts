import type { Patient, MedicalRecord, RecordEntry, FinancialRecord, ClinicType, TreatmentPlanItem } from '@/types'
import { getSpecialtyConfig } from '@/lib/specialtyConfig'
import { formatBrPhone } from '@/lib/phoneFormat'
import { formatCpf } from '@/lib/numericFormat'
import { EVERY_TOOTH, UPPER, LOWER, UPPER_DECIDUOUS, LOWER_DECIDUOUS, EXTRA_NAME, FACE_NAME, FACE_KEYS, DEFAULT_STATUS, statusLabel, statusColor, statusBg, type SurfaceKey } from '@/lib/odontograma'
import { stripConfidentialForPrint } from '@/lib/sigilo'
import { textoVisivel } from '@/lib/escalas/registro'
import { FACE_TOOLS, FACE_VW, FACE_VH, sessionTotals, formatTotal, type FaceSession } from '@/lib/faceograma'

export interface ClinicInfo {
  name: string
  logo?: string
  address?: string
  phone?: string
}

function clinicHeader(clinic: ClinicInfo) {
  return `
    <div style="display:flex;align-items:center;gap:16px;padding-bottom:12px;border-bottom:2px solid #333;margin-bottom:20px">
      ${clinic.logo ? `<img src="${clinic.logo}" style="height:60px;width:auto;object-fit:contain" />` : ''}
      <div>
        <h1 style="margin:0;font-size:20px;font-weight:800;color:#111">${clinic.name}</h1>
        ${clinic.address ? `<p style="margin:2px 0;font-size:12px;color:#555">${clinic.address}</p>` : ''}
        ${clinic.phone ? `<p style="margin:2px 0;font-size:12px;color:#555">${formatBrPhone(clinic.phone)}</p>` : ''}
      </div>
    </div>
  `
}

function baseStyles() {
  return `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; max-width: 800px; margin: 0 auto; }
      h2 { font-size: 16px; font-weight: 700; margin-bottom: 12px; color: #333; }
      h3 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 16px 0 8px; }
      .field { margin-bottom: 8px; }
      .field-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #888; }
      .field-value { font-size: 13px; color: #111; margin-top: 2px; white-space: pre-wrap; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
      .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #888; }
      @media print { body { padding: 0; } }
    </style>
  `
}

function field(label: string, value: string | null | undefined) {
  if (!value) return ''
  return `<div class="field"><div class="field-label">${label}</div><div class="field-value">${value}</div></div>`
}

function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso
}

// Texto digitado pelo usuário vai para dentro de HTML escrito à mão: escapa antes.
export const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface PrintTooth { status?: string; surfaces?: Partial<Record<SurfaceKey, string>>; note?: string; planned?: Record<string, boolean>; endo?: number[]; pin?: number[]; bracket?: boolean }

/** Odontograma: mapa dos permanentes (e dos decíduos que tiverem registro) e tabela dos dentes com alteração ou observação. */
function odontogramaSection(record: MedicalRecord | null): string {
  const raw = (record?.odontogram ?? {}) as Record<string, unknown>
  const teeth: Record<number, PrintTooth> = {}
  for (const n of EVERY_TOOTH) {
    const v = raw[n]
    if (typeof v === 'string') teeth[n] = { status: v }
    else if (v && typeof v === 'object') teeth[n] = v as PrintTooth
  }
  // Canal, pino e aparelho: tratamentos que convivem com a condição do dente.
  const extras = (t: PrintTooth) => {
    const out: { status: string; text: string }[] = []
    if (Array.isArray(t.endo) && t.endo.length > 0) out.push({ status: 'endodontia', text: `${EXTRA_NAME.endo}${t.planned?.endo ? ' (a realizar)' : ''}` })
    if (Array.isArray(t.pin) && t.pin.length > 0) out.push({ status: 'pino', text: `${EXTRA_NAME.pin}${t.planned?.pin ? ' (a realizar)' : ''}` })
    if (t.bracket) out.push({ status: 'aparelho', text: `${EXTRA_NAME.bracket}${t.planned?.bracket ? ' (a realizar)' : ''}` })
    return out
  }
  const marks = (t: PrintTooth) => {
    const out: string[] = []
    if (t.status && t.status !== DEFAULT_STATUS) out.push(t.status)
    for (const k of FACE_KEYS) {
      const v = t.surfaces?.[k]
      if (v && v !== DEFAULT_STATUS && !out.includes(v)) out.push(v)
    }
    for (const x of extras(t)) if (!out.includes(x.status)) out.push(x.status)
    return out
  }
  const rows = EVERY_TOOTH.filter(n => teeth[n] && (marks(teeth[n]).length > 0 || teeth[n].note?.trim()))
  if (rows.length === 0) return ''

  const cell = (n: number) => {
    const t = teeth[n]
    const main = t ? marks(t)[0] : undefined
    const style = !main
      ? 'border:1px solid #ccc;background:#fff;color:#555'
      : main === 'ausente'
        ? 'border:1px dashed #888;background:#f3f4f6;color:#6b7280'
        : `border:1px solid ${statusColor(main)};background:${statusBg(main)};color:${statusColor(main)}`
    return `<div style="${style};border-radius:4px;text-align:center;font-size:10px;font-weight:700;padding:5px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact">${n}</div>`
  }
  const rowOf = (list: number[]) => `<div style="display:grid;grid-template-columns:repeat(${list.length},1fr);gap:3px;margin-bottom:6px">${list.map(cell).join('')}</div>`
  const hasDeciduous = [...UPPER_DECIDUOUS, ...LOWER_DECIDUOUS].some(n => rows.includes(n))
  const deciduousMap = hasDeciduous
    ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#777;margin:6px 0 4px">Decíduos</div><div style="max-width:62%">${rowOf(UPPER_DECIDUOUS)}${rowOf(LOWER_DECIDUOUS)}</div>`
    : ''
  const used = Array.from(new Set(rows.flatMap(n => marks(teeth[n]))))

  return `
    <div style="page-break-inside:avoid">
      <h3>Odontograma</h3>
      ${rowOf(UPPER)}${rowOf(LOWER)}${deciduousMap}
      <div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11px;color:#555;margin-bottom:10px">
        ${used.map(k => `<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${statusColor(k)};margin-right:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact"></span>${esc(statusLabel(k))}</span>`).join('')}
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          ${['Dente', 'Condição', 'Faces', 'Observação'].map(h => `<th style="text-align:left;padding:5px 4px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;color:#555">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.map(n => {
            const t = teeth[n]
            const whole = t.status && t.status !== DEFAULT_STATUS ? `${statusLabel(t.status)}${t.planned?.all ? ' (a realizar)' : ''}` : '—'
            const faces = [
              ...FACE_KEYS.filter(k => t.surfaces?.[k] && t.surfaces[k] !== DEFAULT_STATUS)
                .map(k => `${FACE_NAME[k]}: ${statusLabel(t.surfaces![k]!)}${t.planned?.[k] ? ' (a realizar)' : ''}`),
              ...extras(t).map(x => x.text),
            ].join('; ') || '—'
            return `<tr>
              <td style="padding:5px 4px;border-bottom:1px solid #eee;font-weight:700">${n}</td>
              <td style="padding:5px 4px;border-bottom:1px solid #eee">${esc(whole)}</td>
              <td style="padding:5px 4px;border-bottom:1px solid #eee">${esc(faces)}</td>
              <td style="padding:5px 4px;border-bottom:1px solid #eee;white-space:pre-wrap">${esc(t.note?.trim() || '—')}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>`
}

/** Faceograma: uma figura por sessão com os pontos numerados, e a lista com produto, dose e nota. */
function faceogramaSection(record: MedicalRecord | null): string {
  const raw = record?.aesthetic_protocols as FaceSession[] | undefined
  const sessions = (Array.isArray(raw) ? raw : [])
    .filter(s => s.annotations?.length > 0 || s.notes?.trim())
    .sort((a, b) => a.date.localeCompare(b.date))
  if (sessions.length === 0) return ''
  const tool = (k: string) => FACE_TOOLS.find(t => t.key === k)
  const faceSrc = `${typeof window !== 'undefined' ? window.location.origin : ''}/rosto.webp`

  return `
    <h3>Faceograma</h3>
    ${sessions.map(s => `
      <div style="page-break-inside:avoid;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px">Sessão de ${formatDateBR(s.date)}</div>
        <div style="display:flex;gap:16px;align-items:flex-start">
          <div style="position:relative;width:260px;flex:none">
            <img src="${faceSrc}" style="width:100%;display:block;border:1px solid #ddd;border-radius:6px" />
            ${s.annotations.map((a, i) => `<span style="position:absolute;left:${(a.x / FACE_VW) * 100}%;top:${(a.y / FACE_VH) * 100}%;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;background:${tool(a.type)?.bg ?? '#f3f4f6'};border:1.5px solid ${tool(a.type)?.color ?? '#6b7280'};color:${tool(a.type)?.color ?? '#6b7280'};font-size:9px;font-weight:700;text-align:center;line-height:15px;-webkit-print-color-adjust:exact;print-color-adjust:exact">${i + 1}</span>`).join('')}
          </div>
          <div style="flex:1;min-width:0">
            ${s.annotations.length > 0 ? `
              <table style="width:100%;border-collapse:collapse">
                <thead><tr>
                  ${['#', 'Tratamento', 'Região', 'Dose / volume', 'Nota'].map(h => `<th style="text-align:left;padding:4px;border-bottom:2px solid #333;font-size:10px;text-transform:uppercase;color:#555">${h}</th>`).join('')}
                </tr></thead>
                <tbody>
                  ${s.annotations.map((a, i) => `<tr>
                    <td style="padding:4px;border-bottom:1px solid #eee;font-weight:700">${i + 1}</td>
                    <td style="padding:4px;border-bottom:1px solid #eee">${esc(tool(a.type)?.label ?? a.type)}</td>
                    <td style="padding:4px;border-bottom:1px solid #eee">${esc(a.region || '—')}</td>
                    <td style="padding:4px;border-bottom:1px solid #eee">${esc(a.qty || '—')}</td>
                    <td style="padding:4px;border-bottom:1px solid #eee;white-space:pre-wrap">${esc(a.note || '—')}</td>
                  </tr>`).join('')}
                </tbody>
              </table>` : ''}
            ${(() => {
              const { totals } = sessionTotals(s.annotations)
              return totals.length > 0
                ? `<div style="margin-top:8px;font-size:12px"><b>Total da sessão:</b> ${totals.map(t => `${esc(tool(t.tool)?.label ?? t.tool)} ${esc(formatTotal(t))}`).join(' · ')}</div>`
                : ''
            })()}
            ${s.notes?.trim() ? `<div class="field" style="margin-top:8px"><div class="field-label">Observações</div><div class="field-value">${esc(s.notes)}</div></div>` : ''}
          </div>
        </div>
      </div>`).join('')}`
}

export interface ProntuarioSections {
  /** Evolução clínica (entradas do histórico). Padrão: true. */
  evolucao?: boolean
  /** Odontograma e faceograma, quando houver marcações. Padrão: true. */
  mapas?: boolean
}

/** Bloco "Evolução clínica": só as entradas não sigilosas. Vazio quando não há nada a imprimir. */
function evolucaoSection(entries: RecordEntry[]): string {
  // Anotações sigilosas (psicologia) nunca saem em papel.
  const printableEntries = stripConfidentialForPrint(entries)
  if (printableEntries.length === 0) return ''
  return `
      <h3>Evolução Clínica</h3>
      ${printableEntries.map((e) => `
        <div style="margin-bottom:10px;padding:8px;border:1px solid #eee;border-radius:4px">
          <div style="font-size:11px;color:#888;margin-bottom:4px">${new Date(e.created_at).toLocaleDateString('pt-BR', { day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit' })}</div>
          <div class="field-value">${textoVisivel(e.entry_text ?? '')}</div>
        </div>
      `).join('')}
    `
}

/** Imprime só a evolução clínica do paciente (sem as anotações sigilosas). */
export function printEvolucao(clinic: ClinicInfo, patient: Patient, entries: RecordEntry[]) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Evolução – ${patient.name}</title>${baseStyles()}</head><body>
    ${clinicHeader(clinic)}
    <h2>Evolução Clínica</h2>
    <div class="grid" style="margin-bottom:16px">
      ${field('Paciente', patient.name)}
      ${field('Data', new Date().toLocaleDateString('pt-BR'))}
    </div>
    ${evolucaoSection(entries) || '<p class="field-value">Nenhuma evolução registrada.</p>'}
    <div class="footer">
      <span>${clinic.name}</span>
      <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
    </div>
  </body></html>`
  openPrint(html)
}

// area: qual namespace do jsonb (anamnesis/clinical_exam por área — ver Bloco B)
// imprimir. Os rótulos vêm de getSpecialtyConfig(area), então o impresso
// mostra os campos certos da área do profissional, não mais fixo em odonto
// (limitação de antes: outras áreas imprimiam com rótulos de odontologia).
export function printProntuario(clinic: ClinicInfo, patient: Patient, record: MedicalRecord | null, entries: RecordEntry[], area: ClinicType, sections: ProntuarioSections = {}) {
  const withEvolucao = sections.evolucao !== false
  const withMapas = sections.mapas !== false
  const an = record?.anamnesis?.[area] ?? {}
  const ex = record?.clinical_exam?.[area] ?? {}
  const specialty = getSpecialtyConfig(area)

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Prontuário – ${patient.name}</title>${baseStyles()}</head><body>
    ${clinicHeader(clinic)}
    <h2>Prontuário Clínico</h2>
    <h3>Identificação do Paciente</h3>
    <div class="grid">
      ${field('Nome', patient.name)}
      ${field('Telefone', formatBrPhone(patient.phone))}
      ${field('E-mail', patient.email)}
      ${field('CPF', formatCpf(patient.cpf))}
      ${field('RG', patient.rg)}
      ${field('Data de Nascimento', formatDateBR(patient.birth_date))}
      ${field('Gênero', patient.gender)}
      ${field('Ocupação', patient.occupation)}
      ${field('Endereço', patient.address)}
      ${field('Indicação', patient.referred_by)}
      ${field('Contato de Emergência', patient.emergency_contact)}
    </div>
    <h3>Anamnese</h3>
    <div class="grid">
      ${specialty.anamnesisFields.map(([k, label]) => field(label, an[k])).join('')}
    </div>
    <h3>Exame Clínico</h3>
    <div class="grid">
      ${specialty.clinicalExamFields.map(([k, label]) => field(label, ex[k])).join('')}
    </div>
    ${record?.treatment_plan ? `<h3>Plano de Tratamento</h3><div class="field-value">${record.treatment_plan}</div>` : ''}
    ${withMapas ? odontogramaSection(record) : ''}
    ${withMapas ? faceogramaSection(record) : ''}
    ${withEvolucao ? evolucaoSection(entries) : ''}
    <div class="footer">
      <span>${clinic.name}</span>
      <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
    </div>
  </body></html>`

  openPrint(html)
}

export function printOrcamento(clinic: ClinicInfo, patient: Patient, items: TreatmentPlanItem[], generalNote?: string | null) {
  const total = items.reduce((sum, it) => sum + (it.value ?? 0), 0)
  const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Orçamento – ${patient.name}</title>${baseStyles()}</head><body>
    ${clinicHeader(clinic)}
    <h2>Orçamento / Plano de Tratamento</h2>
    <div class="grid" style="margin-bottom:16px">
      ${field('Paciente', patient.name)}
      ${field('Data', new Date().toLocaleDateString('pt-BR'))}
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 4px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;color:#555">Serviço</th>
          <th style="text-align:right;padding:6px 4px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;color:#555">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it) => `
          <tr>
            <td style="padding:8px 4px;border-bottom:1px solid #eee;font-size:13px">${it.description || '—'}</td>
            <td style="padding:8px 4px;border-bottom:1px solid #eee;font-size:13px;text-align:right;white-space:nowrap">${it.value != null ? money(it.value) : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td style="padding:10px 4px;font-size:14px;font-weight:700;text-align:right">TOTAL</td>
          <td style="padding:10px 4px;font-size:14px;font-weight:700;text-align:right;white-space:nowrap">${money(total)}</td>
        </tr>
      </tfoot>
    </table>
    ${generalNote ? `<h3>Observações</h3><div class="field-value">${generalNote.replace(/\n/g, '<br>')}</div>` : ''}
    <div class="footer">
      <span>${clinic.name}</span>
      <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
    </div>
  </body></html>`

  openPrint(html)
}

export function printContrato(clinic: ClinicInfo, patient: Patient, contractText: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Contrato – ${patient.name}</title>${baseStyles()}</head><body>
    ${clinicHeader(clinic)}
    <h2>Contrato de Prestação de Serviços</h2>
    <div class="field-value" style="margin-top:16px;line-height:1.8">${contractText.replace(/\n/g, '<br>')}</div>
    <div style="margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:32px">
      <div style="border-top:1px solid #333;padding-top:8px;font-size:12px;color:#555">
        Assinatura da Clínica<br><strong>${clinic.name}</strong>
      </div>
      <div style="border-top:1px solid #333;padding-top:8px;font-size:12px;color:#555">
        Assinatura do Paciente<br><strong>${patient.name}</strong>
      </div>
    </div>
    <div class="footer">
      <span>${clinic.name}</span>
      <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
    </div>
  </body></html>`

  openPrint(html)
}

export interface AntesDepoisSide { url: string; date: string; procedure?: string }

/** Comparação Antes/Depois lado a lado (o slider não existe no papel). Só deve ser chamada depois do aviso de consentimento de imagem. */
export function printAntesDepois(clinic: ClinicInfo, patientName: string, before: AntesDepoisSide, after: AntesDepoisSide, interval?: string) {
  const side = (label: string, s: AntesDepoisSide) => `
    <figure style="flex:1;min-width:0;margin:0">
      <div style="aspect-ratio:3/4;border:1px solid #ccc;border-radius:6px;overflow:hidden;background:#f3f3f3">
        <img src="${esc(s.url)}" style="width:100%;height:100%;object-fit:cover;display:block" />
      </div>
      <figcaption style="margin-top:8px;text-align:center">
        <div style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">${label}</div>
        <div style="font-size:12px;color:#555">${esc(s.date)}</div>
        ${s.procedure ? `<div style="font-size:11px;color:#777;margin-top:2px">${esc(s.procedure)}</div>` : ''}
      </figcaption>
    </figure>`
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Antes e depois – ${esc(patientName)}</title>${baseStyles()}</head><body>
    ${clinicHeader(clinic)}
    <h2>Comparativo Antes e Depois</h2>
    <div class="field"><div class="field-label">Paciente</div><div class="field-value">${esc(patientName)}</div></div>
    ${interval ? `<div class="field"><div class="field-label">Intervalo</div><div class="field-value">${esc(interval)}</div></div>` : ''}
    <div style="display:flex;gap:16px;margin-top:16px">
      ${side('Antes', before)}
      ${side('Depois', after)}
    </div>
    <p style="margin-top:20px;font-size:11px;color:#777">Uso e divulgação destas imagens dependem de autorização expressa do paciente (Termo de uso de imagem).</p>
    <div class="footer">
      <span>${esc(clinic.name)}</span>
      <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
    </div>
  </body></html>`
  openPrint(html)
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  convenio: 'Convênio',
  outro: 'Outro',
}

export function printRecibo(clinic: ClinicInfo, record: FinancialRecord, patientName: string) {
  const dataEmissao = new Date(record.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const valor = (record.total_amount ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const metodo = PAYMENT_METHOD_LABELS[record.payment_method ?? ''] ?? record.payment_method ?? '—'

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo – ${patientName}</title>${baseStyles()}</head><body>
    ${clinicHeader(clinic)}
    <h2>Recibo de Pagamento</h2>
    <p style="font-size:13px;line-height:1.8;margin-top:12px">
      Recebi de <strong>${patientName}</strong> a quantia de <strong>${valor}</strong>,
      referente a ${record.category ? `<strong>${record.category}</strong>` : 'serviço prestado'}${record.notes ? ` (${record.notes})` : ''},
      pago via ${metodo}.
    </p>
    <div class="grid" style="margin-top:24px">
      ${field('Paciente', patientName)}
      ${field('Valor', valor)}
      ${field('Forma de pagamento', metodo)}
      ${field('Data', dataEmissao)}
      ${field('Categoria', record.category)}
    </div>
    <div style="margin-top:64px;display:grid;grid-template-columns:1fr;gap:8px;max-width:340px">
      <div style="border-top:1px solid #333;padding-top:8px;font-size:12px;color:#555;text-align:center">
        ${clinic.name}
      </div>
    </div>
    <div class="footer">
      <span>${clinic.name}</span>
      <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
    </div>
  </body></html>`

  openPrint(html)
}

export function buildDocumentoHtml(contentHtml: string, bgImage: string | null): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Documento</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      @page { size: A4; margin: 0; }
      html, body { width: 210mm; }
      body {
        font-family: Arial, sans-serif;
        font-size: 13px;
        line-height: 1.7;
        color: #111;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        ${bgImage ? `background-image: url('${bgImage}'); background-size: 100% auto; background-repeat: no-repeat; background-position: top center;` : ''}
      }
      .page { padding: 32px 48px; min-height: 297mm; }
      p { margin: 0 0 4px; }
      ul { padding-left: 20px; }
    </style></head><body><div class="page">${contentHtml}</div></body></html>`
}

export function printDocumento(contentHtml: string, bgImage: string | null) {
  openPrint(buildDocumentoHtml(contentHtml, bgImage))
}

// O caminho calibrado (papel timbrado com campos posicionados) não usa mais
// esta função — foi substituída por documentRender.ts (composeCalibratedDoc
// + printBlob), que gera o MESMO PDF pra baixar e pra imprimir, encaixado
// numa A4 física de verdade. Ver auditoria D1/D2/D3/D4/D6 no plano.

// Acha toda URL de imagem usada no HTML (background-image inline + <img
// src>) pra poder pré-carregar antes de imprimir — ver preloadImages abaixo.
function extractImageUrls(html: string): string[] {
  const urls = new Set<string>()
  const bgRe = /url\((['"]?)([^'")]+)\1\)/g
  let m: RegExpExecArray | null
  while ((m = bgRe.exec(html))) urls.add(m[2])
  const imgRe = /<img[^>]+src=["']([^"']+)["']/g
  while ((m = imgRe.exec(html))) urls.add(m[1])
  return Array.from(urls)
}

// Antes disso, w.print() rodava num setTimeout fixo de 400ms — uma corrida
// contra o carregamento real do papel timbrado (mais lento em rede ruim ou
// com PDF pesado convertido em data URL grande) que às vezes abria o
// diálogo de impressão com o fundo em branco, de forma intermitente. Espera
// de verdade cada imagem carregar, com um teto de segurança (nunca trava
// pra sempre numa URL quebrada).
function preloadImages(urls: string[], timeoutMs = 4000): Promise<void> {
  if (urls.length === 0) return Promise.resolve()
  const loaders = urls.map(url => new Promise<void>(resolve => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = url
  }))
  const timeout = new Promise<void>(resolve => setTimeout(resolve, timeoutMs))
  return Promise.race([Promise.all(loaders).then(() => undefined), timeout])
}

export async function openPrint(html: string) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    // window.open volta null quando o navegador bloqueia o pop-up — sem
    // isso, o clique não fazia nada visível e parecia que o botão estava
    // quebrado (era só o bloqueio silencioso do pop-up).
    window.alert('Não abriu a impressão — seu navegador bloqueou o pop-up. Libere pop-ups para este site e tente de novo.')
    return
  }
  await printHtmlInWindow(w, html)
}

/** Escreve o HTML numa aba JÁ aberta (aberta no clique, antes de uma espera assíncrona) e imprime. */
export async function printHtmlInWindow(w: Window, html: string) {
  await preloadImages(extractImageUrls(html))
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}
