// Monta o cabeçalho dos impressos da Medicina (clínica, paciente, data, profissional responsável) a partir dos dados do
// cadastro. Pura e testada em cabecalho.test.ts: a tela só passa os dados que já tem.

import { formatCpf, formatDateBr } from '@/lib/documentos/campos'
import { councilForProfessional, formatRegistration, formatRqe } from '@/lib/professionalCouncil'
import { formatBrPhone } from '@/lib/phoneFormat'
import { idadeTexto } from '@/lib/medico/crescimento/oms'
import type { CabecalhoImpresso, ProfissionalImpresso } from './impresso'
import type { ClinicType } from '@/types'

export interface DadosProfissional {
  name?: string | null
  specialty?: string | null
  specialty_type?: ClinicType | null
  registration_number?: string | null
  rqe?: string | null
}

/** Nome, registro com a sigla do conselho (CRM) e RQE do profissional, prontos para imprimir. Sem profissional: só o nome de quem está logado. */
export function profissionalParaImpresso(p: DadosProfissional | null | undefined, nomeDeQuemEstaLogado?: string | null): ProfissionalImpresso {
  const council = councilForProfessional({ specialtyType: p?.specialty_type, specialty: p?.specialty, clinicType: 'medico' })
  return {
    nome: (p?.name ?? nomeDeQuemEstaLogado ?? '').trim(),
    registro: formatRegistration(council, p?.registration_number),
    rqe: formatRqe(p?.rqe),
  }
}

export interface DadosCabecalho {
  clinica: { name: string; address?: string | null; phone?: string | null }
  paciente: { name: string; cpf?: string | null; birth_date?: string | null }
  /** Dia do documento, "AAAA-MM-DD". */
  data: string
  profissional: ProfissionalImpresso
}

export function montarCabecalho(d: DadosCabecalho): CabecalhoImpresso {
  const nasc = (d.paciente.birth_date ?? '').slice(0, 10)
  const idade = nasc ? idadeTexto(nasc, d.data) : ''
  const cpf = formatCpf(d.paciente.cpf)
  const detalhePaciente = [cpf ? `CPF ${cpf}` : '', nasc ? `Nascimento ${formatDateBr(nasc)}${idade ? ` (${idade})` : ''}` : ''].filter(Boolean).join(' | ')
  const detalheClinica = [(d.clinica.address ?? '').trim(), d.clinica.phone ? formatBrPhone(d.clinica.phone) : ''].filter(Boolean).join(' | ')
  return {
    clinica: d.clinica.name,
    detalhe: detalheClinica || undefined,
    paciente: d.paciente.name,
    pacienteDetalhe: detalhePaciente || undefined,
    data: d.data,
    profissional: d.profissional,
  }
}
