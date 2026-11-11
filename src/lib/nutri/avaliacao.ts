// Avaliação nutricional: formato guardado em nutri_avaliacoes.dados (tipo 'avaliacao') e o resumo calculado
// a partir dele. Os campos guardam o TEXTO digitado (ponto decimal) para a tela reabrir exatamente como foi
// preenchida; os números só existem depois de validados (validacao.ts). Funções puras.

import {
  calcularComposicao, calcularImc, calcularRcq, classificarCintura, classificarImc, classificarRcq,
  densidadeCorporal, percentualGorduraSiri, DOBRAS,
  type Classificacao, type Dobras, type DobraKey, type ProtocoloDobras, type Sexo,
} from './antropometria'
import {
  EQUACAO_INFO, calcularGet, calcularTmb, dividirMacros,
  type EquacaoTmb, type Macros,
} from './energia'
import { arredondar, idadeEm, numeroValido, validar, type LimiteKey } from './validacao'

export type FonteComposicao = 'dobras' | 'manual'

export interface AvaliacaoDados {
  v: 1
  sexo: Sexo | null
  /** Idade digitada quando o paciente não tem data de nascimento cadastrada. */
  idadeManual: string
  peso: string
  altura: string
  cintura: string
  quadril: string
  dobras: Partial<Record<DobraKey, string>>
  protocolo: ProtocoloDobras
  fonteComposicao: FonteComposicao
  /** Valores informados (bioimpedância ou outro método). */
  pctGorduraManual: string
  massaGordaManual: string
  massaMagraManual: string
  equacaoTmb: EquacaoTmb
  fatorAtividade: string
  /** kcal a somar (+) ou tirar (-) do GET para chegar à meta. */
  ajusteKcal: string
  proteinaGkg: string
  lipidioGkg: string
  obs: string
}

export function avaliacaoVazia(sexo: Sexo | null = null): AvaliacaoDados {
  return {
    v: 1, sexo, idadeManual: '', peso: '', altura: '', cintura: '', quadril: '', dobras: {},
    protocolo: 'pollock3', fonteComposicao: 'dobras', pctGorduraManual: '', massaGordaManual: '', massaMagraManual: '',
    equacaoTmb: 'mifflin', fatorAtividade: '1.55', ajusteKcal: '', proteinaGkg: '1.6', lipidioGkg: '1', obs: '',
  }
}

const txt = (v: unknown, padrao = ''): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : padrao)

/** Lê o JSON salvo e completa o que faltar (registro antigo ou editado à mão). */
export function normalizarAvaliacao(raw: unknown): AvaliacaoDados {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof AvaliacaoDados, unknown>>
  const base = avaliacaoVazia(r.sexo === 'M' || r.sexo === 'F' ? r.sexo : null)
  const dobras: Partial<Record<DobraKey, string>> = {}
  if (r.dobras && typeof r.dobras === 'object') {
    for (const d of DOBRAS) {
      const v = (r.dobras as Record<string, unknown>)[d.key]
      if (v !== undefined && v !== null && v !== '') dobras[d.key] = txt(v)
    }
  }
  const protocolos: ProtocoloDobras[] = ['pollock3', 'pollock7', 'guedes', 'petroski', 'durnin']
  return {
    ...base,
    idadeManual: txt(r.idadeManual), peso: txt(r.peso), altura: txt(r.altura), cintura: txt(r.cintura), quadril: txt(r.quadril),
    dobras,
    protocolo: protocolos.includes(r.protocolo as ProtocoloDobras) ? (r.protocolo as ProtocoloDobras) : base.protocolo,
    fonteComposicao: r.fonteComposicao === 'manual' ? 'manual' : 'dobras',
    pctGorduraManual: txt(r.pctGorduraManual), massaGordaManual: txt(r.massaGordaManual), massaMagraManual: txt(r.massaMagraManual),
    equacaoTmb: r.equacaoTmb && (r.equacaoTmb as string) in EQUACAO_INFO ? (r.equacaoTmb as EquacaoTmb) : base.equacaoTmb,
    fatorAtividade: txt(r.fatorAtividade, base.fatorAtividade), ajusteKcal: txt(r.ajusteKcal),
    proteinaGkg: txt(r.proteinaGkg, base.proteinaGkg), lipidioGkg: txt(r.lipidioGkg, base.lipidioGkg), obs: txt(r.obs),
  }
}

export interface Resumo {
  idade: number | null
  sexo: Sexo | null
  pesoKg: number | null
  alturaCm: number | null
  cinturaCm: number | null
  quadrilCm: number | null
  imc: number | null
  imcClasse: Classificacao | null
  rcq: number | null
  rcqClasse: Classificacao | null
  cinturaClasse: Classificacao | null
  densidade: number | null
  somatorioDobras: number | null
  pctGordura: number | null
  massaGordaKg: number | null
  massaMagraKg: number | null
  /** Dobras que faltam para o protocolo escolhido (só quando a fonte é "dobras" e há alguma preenchida). */
  faltamDobras: string[] | null
  avisoComposicao: string | null
  tmb: number | null
  get: number | null
  metaKcal: number | null
  macros: Macros | null
  /** Mensagem por campo (chave = nome do campo em AvaliacaoDados, ou 'dobra:<key>'). */
  erros: Record<string, string>
}

const CAMPOS_VALIDADOS: [keyof AvaliacaoDados, LimiteKey][] = [
  ['peso', 'peso'], ['altura', 'altura'], ['cintura', 'cintura'], ['quadril', 'quadril'],
  ['pctGorduraManual', 'pctGordura'], ['massaGordaManual', 'massa'], ['massaMagraManual', 'massa'],
  ['idadeManual', 'idade'], ['fatorAtividade', 'fatorAtividade'], ['proteinaGkg', 'gkg'], ['lipidioGkg', 'gkg'], ['ajusteKcal', 'ajusteKcal'],
]

/** Calcula tudo da avaliação. `nascimento` e `data` (AAAA-MM-DD) definem a idade na data da avaliação. */
export function resumirAvaliacao(d: AvaliacaoDados, ctx: { nascimento: string | null | undefined; data: string }): Resumo {
  const erros: Record<string, string> = {}
  for (const [campo, limite] of CAMPOS_VALIDADOS) {
    const r = validar(d[campo], limite)
    if (r.erro) erros[campo] = r.erro
  }
  const dobras: Dobras = {}
  for (const dob of DOBRAS) {
    const bruto = d.dobras[dob.key]
    const r = validar(bruto, 'dobra')
    if (r.erro) erros[`dobra:${dob.key}`] = r.erro
    if (r.valor !== null) dobras[dob.key] = r.valor
  }

  const idade = idadeEm(ctx.nascimento, ctx.data) ?? numeroValido(d.idadeManual, 'idade')
  const sexo = d.sexo
  const pesoKg = numeroValido(d.peso, 'peso')
  const alturaCm = numeroValido(d.altura, 'altura')
  const cinturaCm = numeroValido(d.cintura, 'cintura')
  const quadrilCm = numeroValido(d.quadril, 'quadril')

  const imc = calcularImc(pesoKg, alturaCm)
  const rcq = calcularRcq(cinturaCm, quadrilCm)

  // composição corporal: dobras (protocolo + Siri) ou valores informados
  let pctGordura: number | null = null
  let densidade: number | null = null
  let somatorioDobras: number | null = null
  let faltamDobras: string[] | null = null
  let avisoComposicao: string | null = null
  if (d.fonteComposicao === 'dobras') {
    const algumaDobra = Object.keys(dobras).length > 0
    if (algumaDobra && sexo) {
      const res = densidadeCorporal({ protocolo: d.protocolo, sexo, idade, dobras, pesoKg, alturaCm })
      if (res.ok) {
        densidade = res.densidade
        somatorioDobras = res.somatorio
        pctGordura = percentualGorduraSiri(res.densidade)
        avisoComposicao = res.aviso ?? null
        if (pctGordura === null) avisoComposicao = 'A densidade calculada ficou fora do possível. Confira as dobras digitadas.'
      } else {
        faltamDobras = res.faltam
      }
    } else if (algumaDobra && !sexo) {
      faltamDobras = ['Sexo']
    }
  } else {
    const pct = numeroValido(d.pctGorduraManual, 'pctGordura')
    const mg = numeroValido(d.massaGordaManual, 'massa')
    const mm = numeroValido(d.massaMagraManual, 'massa')
    if (pct !== null) pctGordura = pct
    else if (pesoKg && mg !== null && mg < pesoKg) pctGordura = arredondar((mg / pesoKg) * 100, 2)
    else if (pesoKg && mm !== null && mm < pesoKg) pctGordura = arredondar(((pesoKg - mm) / pesoKg) * 100, 2)
  }
  const comp = calcularComposicao(pesoKg, pctGordura)

  const tmb = calcularTmb({ equacao: d.equacaoTmb, sexo, pesoKg, alturaCm, idade, massaMagraKg: comp?.massaMagraKg ?? null })
  const fator = numeroValido(d.fatorAtividade, 'fatorAtividade')
  const get = calcularGet(tmb, fator)
  const ajuste = validar(d.ajusteKcal, 'ajusteKcal').valor ?? 0
  const metaKcal = get !== null ? Math.max(0, get + ajuste) : null
  const macros = dividirMacros({
    kcal: metaKcal, pesoKg,
    proteinaGkg: numeroValido(d.proteinaGkg, 'gkg'), lipidioGkg: numeroValido(d.lipidioGkg, 'gkg'),
  })

  return {
    idade, sexo, pesoKg, alturaCm, cinturaCm, quadrilCm,
    imc, imcClasse: classificarImc(imc, idade),
    rcq, rcqClasse: classificarRcq(rcq, sexo), cinturaClasse: classificarCintura(cinturaCm, sexo),
    densidade, somatorioDobras, pctGordura: comp ? comp.pctGordura : pctGordura,
    massaGordaKg: comp?.massaGordaKg ?? null, massaMagraKg: comp?.massaMagraKg ?? null,
    faltamDobras, avisoComposicao, tmb, get, metaKcal: metaKcal !== null ? arredondar(metaKcal, 0) : null, macros, erros,
  }
}

/**
 * Erros de campos que o profissional está vendo na tela (e portanto consegue corrigir). Valor inválido
 * em campo oculto (dobra com a fonte em "informar valores", idade digitada quando há nascimento) já fica
 * fora dos cálculos e não deve impedir o salvamento.
 */
export function errosBloqueantes(erros: Record<string, string>, d: AvaliacaoDados, temNascimento: boolean): string[] {
  const ocultos = new Set<string>(['idadeManual'].filter(() => temNascimento))
  if (d.fonteComposicao === 'dobras') ['pctGorduraManual', 'massaGordaManual', 'massaMagraManual'].forEach(k => ocultos.add(k))
  return Object.keys(erros).filter(k => {
    if (ocultos.has(k)) return false
    if (k.startsWith('dobra:') && d.fonteComposicao !== 'dobras') return false
    return true
  })
}

/** A avaliação tem algo digitado (um registro em branco não deve ser salvo nem acender "não salvo"). */
export function avaliacaoTemConteudo(d: AvaliacaoDados): boolean {
  return !!(d.peso || d.altura || d.cintura || d.quadril || d.pctGorduraManual || d.massaGordaManual || d.massaMagraManual
    || d.obs.trim() || Object.values(d.dobras).some(v => v))
}

// ── Evolução (gráficos) ──────────────────────────────────────────────────────

export interface RegistroAvaliacao { id: string; data: string; dados: AvaliacaoDados }

export type SerieChave = 'peso' | 'massaMagra' | 'massaGorda' | 'cintura'

export interface PontoSerie { id: string; data: string; valor: number }

export const SERIES: { chave: SerieChave; rotulo: string; un: string }[] = [
  { chave: 'peso', rotulo: 'Peso', un: 'kg' },
  { chave: 'massaMagra', rotulo: 'Massa magra', un: 'kg' },
  { chave: 'massaGorda', rotulo: 'Massa gorda', un: 'kg' },
  { chave: 'cintura', rotulo: 'Cintura', un: 'cm' },
]

/** Séries em ordem cronológica. Cada avaliação entra só nas séries em que tem o valor. */
export function seriesDeEvolucao(registros: RegistroAvaliacao[], nascimento: string | null | undefined): Record<SerieChave, PontoSerie[]> {
  const ordenados = [...registros].sort((a, b) => a.data.localeCompare(b.data))
  const out: Record<SerieChave, PontoSerie[]> = { peso: [], massaMagra: [], massaGorda: [], cintura: [] }
  for (const r of ordenados) {
    const s = resumirAvaliacao(r.dados, { nascimento, data: r.data })
    const add = (k: SerieChave, v: number | null) => { if (v !== null) out[k].push({ id: r.id, data: r.data, valor: arredondar(v, 1) }) }
    add('peso', s.pesoKg); add('massaMagra', s.massaMagraKg); add('massaGorda', s.massaGordaKg); add('cintura', s.cinturaCm)
  }
  return out
}

/** Diferença entre o último e o primeiro ponto (null com menos de 2 pontos). */
export function variacao(pontos: PontoSerie[]): number | null {
  if (pontos.length < 2) return null
  return arredondar(pontos[pontos.length - 1].valor - pontos[0].valor, 1)
}
