// Curvas de crescimento da OMS de 0 a 5 anos (WHO Child Growth Standards, 2006): peso, comprimento/estatura,
// perímetro cefálico e IMC por idade, com escore Z e percentil. Lógica pura, testada em oms.test.ts.
//
// Dados: os parâmetros LMS oficiais da OMS (Box-Cox: L = assimetria, M = mediana, S = coeficiente de variação), um
// por dia de vida (0 a 1856 dias, quase 5,1 anos), para meninos e meninas. Vêm das "expanded tables" publicadas pela
// OMS em https://www.who.int/tools/child-growth-standards/standards (material de domínio público para uso e
// reprodução). Ficam em oms-lms.json, só L, M e S arredondados como na tabela original (L e M com 4 casas, S com 5);
// as colunas de desvio-padrão da própria tabela batem com o que se calcula daqui com diferença relativa < 0,03%.
//
// Fórmulas (WHO, Methods and Development, 2006):
//   z = ((y / M)^L - 1) / (L * S)     para L != 0;      z = ln(y / M) / S    para L = 0
//   y(z) = M * (1 + L * S * z)^(1 / L)                   y(z) = M * exp(S * z)
// Peso para idade e IMC para idade usam o ajuste da OMS fora de ±3 (a cauda é extrapolada linearmente a partir do
// intervalo entre os escores 2 e 3), porque nessas curvas a distribuição não é simétrica nas pontas. Comprimento/
// estatura e perímetro cefálico usam o escore calculado direto.
//
// Ferramenta de apoio ao raciocínio clínico: a classificação NÃO substitui a avaliação do profissional.

import lmsJson from './oms-lms.json'
import { addMonthsIso, parseIsoDay } from '@/lib/documentos/campos'

export type Sexo = 'meninos' | 'meninas'
export type Indicador = 'peso' | 'estatura' | 'pc' | 'imc'

interface TabelaLms { L: number[]; M: number[]; S: number[] }
const TABELAS = lmsJson as unknown as Record<Sexo, Record<Indicador, TabelaLms>>

/** Último dia coberto pelas tabelas (5 anos e 3 dias: 1856 dias). */
export const DIAS_MAX = 1856
/** Dias de um mês médio (365,25 / 12), o mesmo da OMS. */
export const DIAS_POR_MES = 30.4375

export const INDICADORES: Indicador[] = ['peso', 'estatura', 'pc', 'imc']

export const INDICADOR_INFO: Record<Indicador, { rotulo: string; curto: string; titulo: string; unidade: string; casas: number }> = {
  peso: { rotulo: 'Peso', curto: 'Peso', titulo: 'Peso para a idade', unidade: 'kg', casas: 2 },
  estatura: { rotulo: 'Comprimento / estatura', curto: 'Estatura', titulo: 'Comprimento ou estatura para a idade', unidade: 'cm', casas: 1 },
  pc: { rotulo: 'Perímetro cefálico', curto: 'P. cefálico', titulo: 'Perímetro cefálico para a idade', unidade: 'cm', casas: 1 },
  imc: { rotulo: 'IMC', curto: 'IMC', titulo: 'IMC para a idade', unidade: 'kg/m²', casas: 1 },
}

/** Sexo da tabela a partir do campo gênero do cadastro; sem informação (ou outro valor), null: a tela pede para escolher. */
export function sexoDoCadastro(gender: string | null | undefined): Sexo | null {
  const g = (gender ?? '').trim().toLowerCase()
  if (g === 'masculino') return 'meninos'
  if (g === 'feminino') return 'meninas'
  return null
}

// ── Idade ────────────────────────────────────────────────────

const diaUtc = (iso: string): number | null => {
  const p = parseIsoDay(iso)
  return p ? Date.UTC(p.y, p.m - 1, p.d) : null
}

/** Dias de vida na data (ambas "AAAA-MM-DD"). Nascimento depois da data ou data inválida: null. */
export function diasDeVida(nascimento: string | null | undefined, data: string): number | null {
  const n = diaUtc((nascimento ?? '').slice(0, 10))
  const d = diaUtc(data.slice(0, 10))
  if (n === null || d === null || d < n) return null
  return Math.round((d - n) / 86_400_000)
}

export function mesesDeVida(dias: number): number {
  return dias / DIAS_POR_MES
}

/** "3 meses e 12 dias" / "1 ano e 2 meses" / "8 dias": idade por extenso, calculada por calendário. */
export function idadeTexto(nascimento: string | null | undefined, data: string): string {
  const nasc = (nascimento ?? '').slice(0, 10)
  const dia = data.slice(0, 10)
  const n = parseIsoDay(nasc)
  const d = parseIsoDay(dia)
  if (!n || !d || dia < nasc) return ''
  // meses completos: soma meses ao nascimento (dia limitado ao fim do mês) até passar da data
  let total = (d.y - n.y) * 12 + (d.m - n.m)
  if (addMonthsIso(nasc, total) > dia) total -= 1
  const dias = diasDeVida(addMonthsIso(nasc, total), dia) ?? 0
  const anos = Math.floor(total / 12)
  const meses = total % 12
  const plural = (q: number, s: string, p: string) => `${q} ${q === 1 ? s : p}`
  if (anos >= 1) return meses > 0 ? `${plural(anos, 'ano', 'anos')} e ${plural(meses, 'mês', 'meses')}` : plural(anos, 'ano', 'anos')
  if (meses >= 1) return dias > 0 ? `${plural(meses, 'mês', 'meses')} e ${plural(dias, 'dia', 'dias')}` : plural(meses, 'mês', 'meses')
  return plural(dias, 'dia', 'dias')
}

// ── LMS, escore Z e valor na curva ───────────────────────────

export interface Lms { L: number; M: number; S: number }

/** Parâmetros LMS do dia de vida (interpola linearmente se for fracionário). Fora de 0 a 1856: null. */
export function parametrosLms(sexo: Sexo, indicador: Indicador, dias: number): Lms | null {
  if (!Number.isFinite(dias) || dias < 0 || dias > DIAS_MAX) return null
  const t = TABELAS[sexo][indicador]
  const i = Math.floor(dias)
  const f = dias - i
  if (f === 0 || i >= DIAS_MAX) return { L: t.L[i], M: t.M[i], S: t.S[i] }
  return {
    L: t.L[i] + (t.L[i + 1] - t.L[i]) * f,
    M: t.M[i] + (t.M[i + 1] - t.M[i]) * f,
    S: t.S[i] + (t.S[i + 1] - t.S[i]) * f,
  }
}

/** Valor da medida sobre a curva do escore Z indicado (z = 0 é a mediana). */
export function valorNoEscore(p: Lms, z: number): number {
  return Math.abs(p.L) < 1e-9 ? p.M * Math.exp(p.S * z) : p.M * Math.pow(1 + p.L * p.S * z, 1 / p.L)
}

/** Peso e IMC têm o ajuste da OMS nas caudas (|z| > 3). */
const COM_AJUSTE_NAS_CAUDAS: Record<Indicador, boolean> = { peso: true, imc: true, estatura: false, pc: false }

/** Escore Z da medida (kg, cm ou kg/m²) para o sexo e a idade em dias. Medida <= 0 ou idade fora da tabela: null. */
export function escoreZ(sexo: Sexo, indicador: Indicador, dias: number, valor: number): number | null {
  const p = parametrosLms(sexo, indicador, dias)
  if (!p || !Number.isFinite(valor) || valor <= 0) return null
  const z = Math.abs(p.L) < 1e-9 ? Math.log(valor / p.M) / p.S : (Math.pow(valor / p.M, p.L) - 1) / (p.L * p.S)
  if (!COM_AJUSTE_NAS_CAUDAS[indicador] || Math.abs(z) <= 3) return z
  if (z > 3) {
    const sd3 = valorNoEscore(p, 3)
    const sd2 = valorNoEscore(p, 2)
    return 3 + (valor - sd3) / (sd3 - sd2)
  }
  const sd3 = valorNoEscore(p, -3)
  const sd2 = valorNoEscore(p, -2)
  return -3 + (valor - sd3) / (sd2 - sd3)
}

// ── Percentil ────────────────────────────────────────────────

/** Função de distribuição da normal padrão (aproximação de Abramowitz e Stegun 7.1.26, erro < 1,5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-x * x)
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

/** Percentil (0 a 100) do escore Z. */
export function percentilDoEscore(z: number): number {
  return normalCdf(z) * 100
}

/** "P50", "P3", "P0,6", "< P0,1", "> P99,9": percentil legível (uma casa só nas pontas, onde importa). */
export function percentilTexto(z: number): string {
  const p = percentilDoEscore(z)
  if (p < 0.1) return '< P0,1'
  if (p > 99.9) return '> P99,9'
  const r = p < 1 || p > 99 ? Math.round(p * 10) / 10 : Math.round(p)
  return `P${String(r).replace('.', ',')}`
}

/** "+1,25", "-2,03", "0": escore Z com duas casas e sinal. */
export function escoreTexto(z: number): string {
  const r = Math.round(z * 100) / 100
  if (r === 0) return '0'
  return `${r > 0 ? '+' : '-'}${String(Math.abs(r)).replace('.', ',')}`
}

// ── Classificação ────────────────────────────────────────────

export type Gravidade = 'ok' | 'atencao' | 'alerta'
export interface Classificacao { rotulo: string; gravidade: Gravidade }

/**
 * Faixas do escore Z segundo a OMS / Ministério da Saúde (Caderneta da Criança) para 0 a 5 anos. É leitura da curva,
 * não diagnóstico.
 */
export function classificar(indicador: Indicador, z: number): Classificacao {
  switch (indicador) {
    case 'peso':
      if (z < -3) return { rotulo: 'Muito baixo peso para a idade', gravidade: 'alerta' }
      if (z < -2) return { rotulo: 'Baixo peso para a idade', gravidade: 'atencao' }
      if (z <= 2) return { rotulo: 'Peso adequado para a idade', gravidade: 'ok' }
      return { rotulo: 'Peso elevado para a idade', gravidade: 'atencao' }
    case 'estatura':
      if (z < -3) return { rotulo: 'Muito baixa estatura para a idade', gravidade: 'alerta' }
      if (z < -2) return { rotulo: 'Baixa estatura para a idade', gravidade: 'atencao' }
      return { rotulo: 'Estatura adequada para a idade', gravidade: 'ok' }
    case 'pc':
      if (z < -2) return { rotulo: 'Perímetro cefálico abaixo do esperado', gravidade: 'alerta' }
      if (z > 2) return { rotulo: 'Perímetro cefálico acima do esperado', gravidade: 'alerta' }
      return { rotulo: 'Perímetro cefálico dentro do esperado', gravidade: 'ok' }
    case 'imc':
      if (z < -3) return { rotulo: 'Magreza acentuada', gravidade: 'alerta' }
      if (z < -2) return { rotulo: 'Magreza', gravidade: 'atencao' }
      if (z <= 1) return { rotulo: 'IMC adequado para a idade', gravidade: 'ok' }
      if (z <= 2) return { rotulo: 'Risco de sobrepeso', gravidade: 'atencao' }
      if (z <= 3) return { rotulo: 'Sobrepeso', gravidade: 'atencao' }
      return { rotulo: 'Obesidade', gravidade: 'alerta' }
  }
}

/** Limites de escore Z que a OMS considera biologicamente implausíveis (provável erro de medida ou de digitação). */
const LIMITES_IMPLAUSIVEIS: Record<Indicador, [number, number]> = {
  peso: [-6, 5],
  estatura: [-6, 6],
  pc: [-5, 5],
  imc: [-5, 5],
}

export function implausivel(indicador: Indicador, z: number): boolean {
  const [min, max] = LIMITES_IMPLAUSIVEIS[indicador]
  return z < min || z > max
}

// ── Medidas e avaliação ──────────────────────────────────────

export interface Medidas { pesoKg?: number | null; estaturaCm?: number | null; pcCm?: number | null }

/** IMC (kg/m²) sem arredondar, ou null se faltar peso ou estatura. */
export function imcDe(pesoKg: number | null | undefined, estaturaCm: number | null | undefined): number | null {
  if (!pesoKg || !estaturaCm || pesoKg <= 0 || estaturaCm <= 0) return null
  const m = estaturaCm / 100
  return pesoKg / (m * m)
}

export interface ResultadoIndicador {
  indicador: Indicador
  valor: number
  z: number
  percentil: number
  classificacao: Classificacao
  /** true se o escore está fora do que a OMS aceita como plausível: conferir a medida. */
  implausivel: boolean
}

/** Avalia cada medida informada na idade da data. Idade fora de 0 a 5 anos (ou antes do nascimento): lista vazia. */
export function avaliarMedidas(sexo: Sexo, nascimento: string | null | undefined, data: string, m: Medidas): ResultadoIndicador[] {
  const dias = diasDeVida(nascimento, data)
  if (dias === null || dias > DIAS_MAX) return []
  const entradas: [Indicador, number | null | undefined][] = [
    ['peso', m.pesoKg], ['estatura', m.estaturaCm], ['pc', m.pcCm], ['imc', imcDe(m.pesoKg, m.estaturaCm)],
  ]
  const out: ResultadoIndicador[] = []
  for (const [indicador, valor] of entradas) {
    if (valor === null || valor === undefined) continue
    const z = escoreZ(sexo, indicador, dias, valor)
    if (z === null) continue
    out.push({ indicador, valor, z, percentil: percentilDoEscore(z), classificacao: classificar(indicador, z), implausivel: implausivel(indicador, z) })
  }
  return out
}

// ── Entrada de medidas (validação) ───────────────────────────

/** Faixas aceitas na digitação (bem largas: o que for estranho para a idade é avisado pelo escore Z, não barrado aqui). */
export const FAIXA_MEDIDA = {
  pesoKg: { min: 0.3, max: 60 },
  estaturaCm: { min: 25, max: 140 },
  pcCm: { min: 20, max: 65 },
} as const

/** Aceita "12,5" ou "12.5"; vazio ou fora do formato: NaN. */
export function lerNumero(v: string | number | null | undefined): number {
  if (typeof v === 'number') return v
  const s = (v ?? '').toString().trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

/** Mensagem de erro de uma medida em digitação (vazia é válida: cada medida é opcional), ou null. */
export function erroDaMedida(campo: keyof typeof FAIXA_MEDIDA, texto: string): string | null {
  if (texto.trim() === '') return null
  const n = lerNumero(texto)
  const f = FAIXA_MEDIDA[campo]
  const nome = campo === 'pesoKg' ? 'Peso' : campo === 'estaturaCm' ? 'Estatura' : 'Perímetro cefálico'
  const un = campo === 'pesoKg' ? 'kg' : 'cm'
  if (!Number.isFinite(n)) return `${nome}: informe um número.`
  if (n < f.min || n > f.max) return `${nome}: informe um valor entre ${String(f.min).replace('.', ',')} e ${f.max} ${un}.`
  return null
}

// ── Curvas para o gráfico ────────────────────────────────────

export interface PontoCurva { dias: number; valor: number }

/** Pontos da curva do escore Z entre dois dias de vida (passo em dias), para desenhar a linha. */
export function curvaDoEscore(sexo: Sexo, indicador: Indicador, z: number, diasIni: number, diasFim: number, passo = 15): PontoCurva[] {
  const out: PontoCurva[] = []
  const fim = Math.min(diasFim, DIAS_MAX)
  for (let d = Math.max(0, diasIni); d <= fim; d += passo) {
    const p = parametrosLms(sexo, indicador, d)
    if (p) out.push({ dias: d, valor: valorNoEscore(p, z) })
  }
  const ultimo = out[out.length - 1]
  if (ultimo && ultimo.dias < fim) {
    const p = parametrosLms(sexo, indicador, fim)
    if (p) out.push({ dias: fim, valor: valorNoEscore(p, z) })
  }
  return out
}

/** Escores Z desenhados no gráfico: -3, -2, mediana, +2 e +3 (o mesmo conjunto da Caderneta da Criança). */
export const ESCORES_DO_GRAFICO = [-3, -2, 0, 2, 3] as const
