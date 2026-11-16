// Medidas de crescimento registradas a cada consulta (peso, comprimento/estatura e perímetro cefálico), guardadas em
// medico_registros (tipo 'crescimento'), e a conversão delas em pontos do gráfico. Lógica pura, testada em medidas.test.ts.

import {
  DIAS_MAX, avaliarMedidas, diasDeVida, erroDaMedida, escoreZ, imcDe, lerNumero,
  type Indicador, type ResultadoIndicador, type Sexo,
} from './oms'
import { parseIsoDay } from '@/lib/documentos/campos'

export interface MedidaDados {
  v: 1
  pesoKg: number | null
  estaturaCm: number | null
  pcCm: number | null
  observacao: string
}

export interface MedidaRegistro extends MedidaDados {
  id: string
  /** AAAA-MM-DD */
  data: string
}

export const MAX_OBSERVACAO_MEDIDA = 200

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

export function normalizarMedida(raw: unknown): MedidaDados {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    v: 1,
    pesoKg: numero(o.pesoKg),
    estaturaCm: numero(o.estaturaCm),
    pcCm: numero(o.pcCm),
    observacao: typeof o.observacao === 'string' ? o.observacao.trim().slice(0, MAX_OBSERVACAO_MEDIDA) : '',
  }
}

/** Linhas do banco em medidas, da mais antiga para a mais recente; linha sem nenhuma medida é descartada. */
export function medidasDeLinhas(linhas: { id: string; data: string; dados: unknown }[]): MedidaRegistro[] {
  return linhas
    .map(l => ({ id: l.id, data: l.data.slice(0, 10), ...normalizarMedida(l.dados) }))
    .filter(m => m.pesoKg !== null || m.estaturaCm !== null || m.pcCm !== null)
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1))
}

export interface FormMedida {
  data: string
  peso: string
  estatura: string
  pc: string
  observacao: string
}

/** Erros do formulário de nova medida (lista vazia = pode salvar). */
export function validarFormMedida(f: FormMedida, nascimento: string | null | undefined, hoje: string): string[] {
  const erros: string[] = []
  if (!parseIsoDay(f.data)) erros.push('Informe a data da medida.')
  else if (f.data > hoje) erros.push('A data da medida não pode ser no futuro.')
  else if (nascimento) {
    const dias = diasDeVida(nascimento, f.data)
    if (dias === null) erros.push('A data da medida é anterior ao nascimento.')
    else if (dias > DIAS_MAX) erros.push('A criança já passou dos 5 anos nesta data: as curvas da OMS desta tela cobrem de 0 a 5 anos.')
  }
  for (const [campo, texto] of [['pesoKg', f.peso], ['estaturaCm', f.estatura], ['pcCm', f.pc]] as const) {
    const e = erroDaMedida(campo, texto)
    if (e) erros.push(e)
  }
  if (f.peso.trim() === '' && f.estatura.trim() === '' && f.pc.trim() === '') erros.push('Informe pelo menos uma medida (peso, estatura ou perímetro cefálico).')
  if (f.observacao.length > MAX_OBSERVACAO_MEDIDA) erros.push(`A observação passa de ${MAX_OBSERVACAO_MEDIDA} caracteres.`)
  return erros
}

/** Dados prontos para gravar a partir do formulário já validado. */
export function medidaDoForm(f: FormMedida): MedidaDados {
  const n = (t: string) => { const v = lerNumero(t); return Number.isFinite(v) && v > 0 ? v : null }
  return { v: 1, pesoKg: n(f.peso), estaturaCm: n(f.estatura), pcCm: n(f.pc), observacao: f.observacao.trim() }
}

export interface PontoMedido {
  id: string
  data: string
  dias: number
  valor: number
  z: number
}

/** Pontos de um indicador para plotar sobre as curvas: só as medidas com valor e idade dentro de 0 a 1856 dias. */
export function pontosDoIndicador(sexo: Sexo, nascimento: string | null | undefined, medidas: MedidaRegistro[], indicador: Indicador): PontoMedido[] {
  const out: PontoMedido[] = []
  for (const m of medidas) {
    const dias = diasDeVida(nascimento, m.data)
    if (dias === null || dias > DIAS_MAX) continue
    const valor = indicador === 'peso' ? m.pesoKg : indicador === 'estatura' ? m.estaturaCm : indicador === 'pc' ? m.pcCm : imcDe(m.pesoKg, m.estaturaCm)
    if (valor === null) continue
    const z = escoreZ(sexo, indicador, dias, valor)
    if (z === null) continue
    out.push({ id: m.id, data: m.data, dias, valor, z })
  }
  return out
}

/** Avaliação completa (escore Z, percentil e classificação) de uma medida registrada. */
export function avaliarRegistro(sexo: Sexo, nascimento: string | null | undefined, m: MedidaRegistro): ResultadoIndicador[] {
  return avaliarMedidas(sexo, nascimento, m.data, { pesoKg: m.pesoKg, estaturaCm: m.estaturaCm, pcCm: m.pcCm })
}
