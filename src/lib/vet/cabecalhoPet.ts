// Cabeçalho comum dos impressos clínicos do pet (resumo de alta, solicitação e resultado de exames): clínica, pet,
// tutor e identificação do animal, mais o profissional responsável (CRMV). HTML puro, testado nos testes de cada
// impresso; todo texto digitado passa por `esc`.

import { esc, type ProfissionalImpresso } from '@/lib/medico/impresso'
import { councilForProfessional, formatRegistration, formatRqe } from '@/lib/professionalCouncil'
import { formatBrPhone } from '@/lib/phoneFormat'
import { petAgeFromBirth, petSexLabel } from '@/lib/pacientes/pet'
import { dataBr } from './datas'
import { fmt } from './numeros'
import type { ClinicType } from '@/types'

export { esc }
export type { ProfissionalImpresso }

export interface DadosProfissionalVet {
  name?: string | null
  specialty?: string | null
  specialty_type?: ClinicType | null
  registration_number?: string | null
  rqe?: string | null
}

/** Nome e registro (CRMV) do profissional prontos para a assinatura. Sem profissional: só o nome de quem está logado. */
export function profissionalVetParaImpresso(p: DadosProfissionalVet | null | undefined, nomeDeQuemEstaLogado?: string | null): ProfissionalImpresso {
  const council = councilForProfessional({ specialtyType: p?.specialty_type ?? 'vet', specialty: p?.specialty, clinicType: 'vet' })
  return {
    nome: (p?.name ?? nomeDeQuemEstaLogado ?? '').trim(),
    registro: formatRegistration(council, p?.registration_number),
    rqe: formatRqe(p?.rqe),
  }
}

export interface CabecalhoPet {
  clinica: string
  /** endereço e telefone da clínica, texto livre */
  detalhe?: string
  pet: string
  tutor: string
  tutorTelefone?: string
  /** "Canino | SRD | Macho | 3 anos | 12,4 kg | Microchip 9851..." (só o que existir) */
  animal?: string
  /** AAAA-MM-DD do dia do documento */
  data: string
  profissional: ProfissionalImpresso
}

export interface DadosPetCabecalho {
  clinica: { name: string; address?: string | null; phone?: string | null }
  paciente: {
    name: string
    phone?: string | null
    pet_name?: string | null
    pet_species?: string | null
    pet_breed?: string | null
    pet_sex?: string | null
    pet_birth_date?: string | null
    pet_weight?: number | null
    pet_microchip?: string | null
  }
  /** peso mais recente conhecido (pesagem), se diferente do cadastro */
  pesoKg?: number | null
  data: string
  profissional: ProfissionalImpresso
}

export function montarCabecalhoPet(d: DadosPetCabecalho): CabecalhoPet {
  const p = d.paciente
  const nasc = (p.pet_birth_date ?? '').slice(0, 10)
  const idade = nasc ? petAgeFromBirth(nasc, new Date(`${d.data}T12:00:00`)) : ''
  const peso = d.pesoKg ?? p.pet_weight ?? null
  const animal = [
    p.pet_species, p.pet_breed, petSexLabel(p.pet_sex),
    nasc ? `Nasc. ${dataBr(nasc)}${idade ? ` (${idade})` : ''}` : '',
    peso ? `${fmt(peso, 3)} kg` : '',
    p.pet_microchip ? `Microchip ${p.pet_microchip}` : '',
  ].map(v => (v ?? '').toString().trim()).filter(Boolean).join(' | ')
  const detalhe = [(d.clinica.address ?? '').trim(), d.clinica.phone ? formatBrPhone(d.clinica.phone) : ''].filter(Boolean).join(' | ')
  const tel = p.phone ? formatBrPhone(p.phone) : ''
  return {
    clinica: d.clinica.name,
    detalhe: detalhe || undefined,
    pet: (p.pet_name ?? '').trim() || p.name,
    tutor: p.name,
    tutorTelefone: tel || undefined,
    animal: animal || undefined,
    data: d.data,
    profissional: d.profissional,
  }
}

/** Cabeçalho do impresso: clínica, título do documento, pet, tutor e identificação do animal. */
export function cabecalhoPetHtml(c: CabecalhoPet, titulo: string, selo?: string): string {
  return `
    <div style="padding-bottom:10px;border-bottom:2px solid #333;margin-bottom:14px">
      <div style="font-size:18px;font-weight:800">${esc(c.clinica)}</div>
      ${c.detalhe ? `<div style="font-size:11.5px;color:#555">${esc(c.detalhe)}</div>` : ''}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px">
      <div style="font-size:17px;font-weight:800;letter-spacing:0.02em">${esc(titulo)}</div>
      ${selo ? `<div style="border:2px solid #111;padding:2px 10px;font-size:12px;font-weight:800;letter-spacing:0.06em">${esc(selo)}</div>` : ''}
    </div>
    <div style="font-size:12.5px;margin-bottom:2px">Pet: <strong>${esc(c.pet)}</strong></div>
    ${c.animal ? `<div style="font-size:11.5px;color:#444;margin-bottom:2px">${esc(c.animal)}</div>` : ''}
    <div style="font-size:12.5px;margin-bottom:2px">Tutor: <strong>${esc(c.tutor)}</strong>${c.tutorTelefone ? ` <span style="color:#444">| ${esc(c.tutorTelefone)}</span>` : ''}</div>
    <div style="font-size:11.5px;color:#444;margin-bottom:14px">Emitido em ${esc(dataBr(c.data))}</div>`
}
