import type { Patient, MedicalRecord, RecordEntry } from '@/types'

interface ClinicInfo {
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
        ${clinic.phone ? `<p style="margin:2px 0;font-size:12px;color:#555">${clinic.phone}</p>` : ''}
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

export function printProntuario(clinic: ClinicInfo, patient: Patient, record: MedicalRecord | null, entries: RecordEntry[]) {
  const an = record?.anamnesis ?? {}
  const ex = record?.clinical_exam ?? {}

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Prontuário – ${patient.name}</title>${baseStyles()}</head><body>
    ${clinicHeader(clinic)}
    <h2>Prontuário Clínico</h2>
    <h3>Identificação do Paciente</h3>
    <div class="grid">
      ${field('Nome', patient.name)}
      ${field('Telefone', patient.phone)}
      ${field('E-mail', patient.email)}
      ${field('CPF', an['p-cpf'])}
      ${field('RG', an['p-rg'])}
      ${field('Data de Nascimento', an['p-nasc'])}
      ${field('Gênero', an['p-genero'])}
      ${field('Ocupação', an['p-ocupacao'])}
      ${field('Endereço', an['p-endereco'])}
      ${field('Indicação', an['p-indicado'])}
      ${field('Contato de Emergência', an['p-emergencia'])}
    </div>
    <h3>Anamnese</h3>
    <div class="grid">
      ${field('Estado geral de saúde', an['a-saude'])}
      ${field('Em tratamento médico', an['a-tratamento'])}
      ${field('Medicamentos', an['a-medicamentos'])}
      ${field('Alergias', an['a-alergia'])}
      ${field('Pressão arterial', an['a-pressao'])}
      ${field('Fumante / Álcool', an['a-fumante'])}
      ${field('Sangramento gengival', an['a-gengiva'])}
      ${field('Hábitos bucais', an['a-habitos'])}
    </div>
    <h3>Exame Clínico</h3>
    <div class="grid">
      ${field('Higiene bucal', ex['e-higiene'])}
      ${field('Halitose', ex['e-halitose'])}
      ${field('Mucosa', ex['e-mucosa'])}
      ${field('Palato', ex['e-palato'])}
      ${field('Observações', ex['e-obs'])}
    </div>
    ${record?.treatment_plan ? `<h3>Plano de Tratamento</h3><div class="field-value">${record.treatment_plan}</div>` : ''}
    ${entries.length > 0 ? `
      <h3>Evolução Clínica</h3>
      ${entries.map((e) => `
        <div style="margin-bottom:10px;padding:8px;border:1px solid #eee;border-radius:4px">
          <div style="font-size:11px;color:#888;margin-bottom:4px">${new Date(e.created_at).toLocaleDateString('pt-BR', { day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit' })}</div>
          <div class="field-value">${e.entry_text ?? ''}</div>
        </div>
      `).join('')}
    ` : ''}
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

export function printDocumento(contentHtml: string, bgImage: string | null) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Documento</title>
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

  openPrint(html)
}

function openPrint(html: string) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print() }, 400)
}
