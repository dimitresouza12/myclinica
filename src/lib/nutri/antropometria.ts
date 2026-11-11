// Antropometria: IMC, relação cintura-quadril, densidade corporal por dobras cutâneas e % de gordura.
// Funções puras, sem React e sem rede. Valores já validados (ver validacao.ts) entram como número.
//
// FONTES (conferidas em 2026-11 contra material de referência; citadas em cada equação):
//  - IMC e faixas de adulto: OMS, Obesity: preventing and managing the global epidemic (WHO TRS 894, 2000).
//  - IMC do idoso (60 anos ou mais): Lipschitz, Prim Care 21(1):55-67, 1994.
//  - Circunferência da cintura: OMS, WHO TRS 894 (2000), pontos de corte 94/102 cm (H) e 80/88 cm (M).
//  - RCQ: OMS, Waist circumference and waist-hip ratio, relatório de consulta de especialistas (2008): risco com
//    RCQ > 0,90 (H) e > 0,85 (M).
//  - Jackson & Pollock 1978 (homens), Jackson, Pollock & Ward 1980 (mulheres): 3 e 7 dobras.
//  - Guedes 1985 (universitários brasileiros), dissertação UFSM.
//  - Petroski 1995 (adultos brasileiros), tese UFSM, equações de 4 dobras (a feminina usa peso e altura).
//  - Durnin & Womersley 1974, Br J Nutr 32:77-97: 4 dobras, equação por sexo e faixa de idade.
//  - Siri 1961 (conversão de densidade em % de gordura): %G = (4,95 / D - 4,50) x 100.

import { arredondar } from './validacao'

export type Sexo = 'M' | 'F'

// ── IMC e circunferências ────────────────────────────────────────────────────

/** IMC em kg/m². Peso em kg, altura em cm. */
export function calcularImc(pesoKg: number | null, alturaCm: number | null): number | null {
  if (!pesoKg || !alturaCm || pesoKg <= 0 || alturaCm <= 0) return null
  const m = alturaCm / 100
  return pesoKg / (m * m)
}

export type FaixaId =
  | 'baixo_peso' | 'eutrofia' | 'sobrepeso'
  | 'obesidade_1' | 'obesidade_2' | 'obesidade_3'
  | 'pediatrico'
export type Gravidade = 'ok' | 'atencao' | 'risco'
export interface Classificacao { id: FaixaId | string; rotulo: string; gravidade: Gravidade; fonte: string }

/**
 * Classifica o IMC. Adulto: faixas da OMS. 60 anos ou mais: Lipschitz (< 22 baixo peso, 22 a 27 eutrofia, > 27 sobrepeso).
 * Menor de 19 anos: não classifica (precisa da curva de IMC por idade da OMS, que não está embarcada).
 */
export function classificarImc(imc: number | null, idade?: number | null): Classificacao | null {
  if (imc === null || !Number.isFinite(imc)) return null
  if (idade !== null && idade !== undefined && idade < 19) {
    return { id: 'pediatrico', rotulo: 'Criança ou adolescente: classifique pelo IMC por idade (curvas da OMS)', gravidade: 'atencao', fonte: 'OMS' }
  }
  if (idade !== null && idade !== undefined && idade >= 60) {
    if (imc < 22) return { id: 'baixo_peso', rotulo: 'Baixo peso (idoso)', gravidade: 'risco', fonte: 'Lipschitz 1994' }
    if (imc <= 27) return { id: 'eutrofia', rotulo: 'Eutrofia (idoso)', gravidade: 'ok', fonte: 'Lipschitz 1994' }
    return { id: 'sobrepeso', rotulo: 'Sobrepeso (idoso)', gravidade: 'atencao', fonte: 'Lipschitz 1994' }
  }
  const fonte = 'OMS 2000'
  if (imc < 18.5) return { id: 'baixo_peso', rotulo: 'Baixo peso', gravidade: 'risco', fonte }
  if (imc < 25)   return { id: 'eutrofia', rotulo: 'Eutrofia', gravidade: 'ok', fonte }
  if (imc < 30)   return { id: 'sobrepeso', rotulo: 'Sobrepeso', gravidade: 'atencao', fonte }
  if (imc < 35)   return { id: 'obesidade_1', rotulo: 'Obesidade grau I', gravidade: 'risco', fonte }
  if (imc < 40)   return { id: 'obesidade_2', rotulo: 'Obesidade grau II', gravidade: 'risco', fonte }
  return { id: 'obesidade_3', rotulo: 'Obesidade grau III', gravidade: 'risco', fonte }
}

/** Relação cintura-quadril (sem unidade). */
export function calcularRcq(cinturaCm: number | null, quadrilCm: number | null): number | null {
  if (!cinturaCm || !quadrilCm || cinturaCm <= 0 || quadrilCm <= 0) return null
  return cinturaCm / quadrilCm
}

/** RCQ acima de 0,90 (homens) ou 0,85 (mulheres) indica risco metabólico aumentado (OMS 2008). */
export function classificarRcq(rcq: number | null, sexo: Sexo | null): Classificacao | null {
  if (rcq === null || !sexo) return null
  const corte = sexo === 'M' ? 0.9 : 0.85
  return rcq > corte
    ? { id: 'rcq_risco', rotulo: 'Risco metabólico aumentado', gravidade: 'risco', fonte: 'OMS 2008' }
    : { id: 'rcq_ok', rotulo: 'Sem risco aumentado', gravidade: 'ok', fonte: 'OMS 2008' }
}

/** Cintura: aumentado a partir de 94 (H) / 80 (M) cm; muito aumentado a partir de 102 (H) / 88 (M) cm. */
export function classificarCintura(cinturaCm: number | null, sexo: Sexo | null): Classificacao | null {
  if (cinturaCm === null || !sexo) return null
  const [alto, muito] = sexo === 'M' ? [94, 102] : [80, 88]
  const fonte = 'OMS 2000'
  if (cinturaCm >= muito) return { id: 'cc_muito', rotulo: 'Risco muito aumentado', gravidade: 'risco', fonte }
  if (cinturaCm >= alto)  return { id: 'cc_alto', rotulo: 'Risco aumentado', gravidade: 'atencao', fonte }
  return { id: 'cc_ok', rotulo: 'Sem risco aumentado', gravidade: 'ok', fonte }
}

// ── Dobras cutâneas ──────────────────────────────────────────────────────────

export type DobraKey =
  | 'triceps' | 'biceps' | 'subescapular' | 'peitoral' | 'axilar_media'
  | 'suprailiaca' | 'abdominal' | 'coxa' | 'panturrilha'

export const DOBRAS: { key: DobraKey; rotulo: string }[] = [
  { key: 'triceps',      rotulo: 'Tríceps' },
  { key: 'biceps',       rotulo: 'Bíceps' },
  { key: 'subescapular', rotulo: 'Subescapular' },
  { key: 'peitoral',     rotulo: 'Peitoral' },
  { key: 'axilar_media', rotulo: 'Axilar média' },
  { key: 'suprailiaca',  rotulo: 'Supra-ilíaca' },
  { key: 'abdominal',    rotulo: 'Abdominal' },
  { key: 'coxa',         rotulo: 'Coxa' },
  { key: 'panturrilha',  rotulo: 'Panturrilha medial' },
]
export const DOBRA_ROTULO: Record<DobraKey, string> = Object.fromEntries(DOBRAS.map(d => [d.key, d.rotulo])) as Record<DobraKey, string>

export type Dobras = Partial<Record<DobraKey, number | null>>

export type ProtocoloDobras = 'pollock3' | 'pollock7' | 'guedes' | 'petroski' | 'durnin'

export interface InfoProtocolo { id: ProtocoloDobras; rotulo: string; fonte: string; resumo: string }

export const PROTOCOLOS: InfoProtocolo[] = [
  { id: 'pollock3', rotulo: 'Jackson e Pollock, 3 dobras', fonte: 'Jackson e Pollock 1978 (H); Jackson, Pollock e Ward 1980 (M)', resumo: 'H: peitoral, abdominal, coxa. M: tríceps, supra-ilíaca, coxa' },
  { id: 'pollock7', rotulo: 'Jackson e Pollock, 7 dobras', fonte: 'Jackson e Pollock 1978 (H); Jackson, Pollock e Ward 1980 (M)', resumo: 'Peitoral, axilar média, tríceps, subescapular, abdominal, supra-ilíaca, coxa' },
  { id: 'guedes',   rotulo: 'Guedes, 3 dobras', fonte: 'Guedes 1985', resumo: 'H: tríceps, supra-ilíaca, abdominal. M: coxa, supra-ilíaca, subescapular' },
  { id: 'petroski', rotulo: 'Petroski, 4 dobras', fonte: 'Petroski 1995', resumo: 'H: subescapular, tríceps, supra-ilíaca, panturrilha. M: axilar média, supra-ilíaca, coxa, panturrilha (usa peso e altura)' },
  { id: 'durnin',   rotulo: 'Durnin e Womersley, 4 dobras', fonte: 'Durnin e Womersley 1974', resumo: 'Bíceps, tríceps, subescapular, supra-ilíaca' },
]
export const PROTOCOLO_INFO: Record<ProtocoloDobras, InfoProtocolo> = Object.fromEntries(PROTOCOLOS.map(p => [p.id, p])) as Record<ProtocoloDobras, InfoProtocolo>

/** Faixa de idade em que a equação foi desenvolvida e validada. Fora dela o resultado vale como estimativa. */
const FAIXA_IDADE: Record<ProtocoloDobras, { M: [number, number]; F: [number, number] }> = {
  pollock3: { M: [18, 61], F: [18, 55] },
  pollock7: { M: [18, 61], F: [18, 55] },
  guedes:   { M: [17, 27], F: [18, 30] },
  petroski: { M: [18, 61], F: [18, 51] },
  durnin:   { M: [16, 72], F: [16, 72] },
}

/** Dobras que o protocolo exige para o sexo. */
export function dobrasDoProtocolo(protocolo: ProtocoloDobras, sexo: Sexo): DobraKey[] {
  switch (protocolo) {
    case 'pollock3': return sexo === 'M' ? ['peitoral', 'abdominal', 'coxa'] : ['triceps', 'suprailiaca', 'coxa']
    case 'pollock7': return ['peitoral', 'axilar_media', 'triceps', 'subescapular', 'abdominal', 'suprailiaca', 'coxa']
    case 'guedes':   return sexo === 'M' ? ['triceps', 'suprailiaca', 'abdominal'] : ['coxa', 'suprailiaca', 'subescapular']
    case 'petroski': return sexo === 'M' ? ['subescapular', 'triceps', 'suprailiaca', 'panturrilha'] : ['axilar_media', 'suprailiaca', 'coxa', 'panturrilha']
    case 'durnin':   return ['biceps', 'triceps', 'subescapular', 'suprailiaca']
  }
}

export interface EntradaDensidade {
  protocolo: ProtocoloDobras
  sexo: Sexo
  idade: number | null
  dobras: Dobras
  pesoKg?: number | null
  alturaCm?: number | null
}
export type ResultadoDensidade =
  | { ok: true; densidade: number; somatorio: number; dobrasUsadas: DobraKey[]; aviso?: string }
  | { ok: false; faltam: string[] }

// Durnin e Womersley 1974, Tabela 2: D = c - m x log10(soma das 4 dobras em mm), por sexo e faixa de idade.
const DURNIN: Record<Sexo, { ate: number; c: number; m: number }[]> = {
  M: [
    { ate: 16, c: 1.1533, m: 0.0643 }, // menor de 17
    { ate: 19, c: 1.1620, m: 0.0630 }, // 17 a 19
    { ate: 29, c: 1.1631, m: 0.0632 }, // 20 a 29
    { ate: 39, c: 1.1422, m: 0.0544 }, // 30 a 39
    { ate: 49, c: 1.1620, m: 0.0700 }, // 40 a 49
    { ate: 200, c: 1.1715, m: 0.0779 }, // 50 ou mais
  ],
  F: [
    { ate: 16, c: 1.1369, m: 0.0598 },
    { ate: 19, c: 1.1549, m: 0.0678 },
    { ate: 29, c: 1.1599, m: 0.0717 },
    { ate: 39, c: 1.1423, m: 0.0632 },
    { ate: 49, c: 1.1333, m: 0.0612 },
    { ate: 200, c: 1.1339, m: 0.0645 },
  ],
}

/**
 * Densidade corporal (g/mL) pelo protocolo escolhido. Devolve a lista do que falta quando faltar dado.
 * Fórmulas (S = soma das dobras em mm; idade em anos):
 *  - Pollock 3, H: D = 1,10938 - 0,0008267 S + 0,0000016 S² - 0,0002574 idade (peitoral + abdominal + coxa)
 *  - Pollock 3, M: D = 1,0994921 - 0,0009929 S + 0,0000023 S² - 0,0001392 idade (tríceps + supra-ilíaca + coxa)
 *  - Pollock 7, H: D = 1,112 - 0,00043499 S + 0,00000055 S² - 0,00028826 idade
 *  - Pollock 7, M: D = 1,097 - 0,00046971 S + 0,00000056 S² - 0,00012828 idade
 *  - Guedes, H: D = 1,1714 - 0,0671 log10(tríceps + supra-ilíaca + abdominal)
 *  - Guedes, M: D = 1,1665 - 0,0706 log10(coxa + supra-ilíaca + subescapular)
 *  - Petroski, H: D = 1,10726863 - 0,00081201 S + 0,00000212 S² - 0,00041761 idade
 *  - Petroski, M: D = 1,0346585 - 0,00063129 S + 0,00000187 S² - 0,00031165 idade - 0,0004889 peso + 0,00051345 altura
 *  - Durnin e Womersley: tabela por idade (DURNIN acima).
 */
export function densidadeCorporal(e: EntradaDensidade): ResultadoDensidade {
  const exigidas = dobrasDoProtocolo(e.protocolo, e.sexo)
  const faltam: string[] = []
  for (const k of exigidas) {
    const v = e.dobras[k]
    if (v === null || v === undefined || !(v > 0)) faltam.push(DOBRA_ROTULO[k])
  }
  const precisaIdade = e.protocolo !== 'guedes'
  if (precisaIdade && (e.idade === null || e.idade === undefined)) faltam.push('Idade')
  if (e.protocolo === 'petroski' && e.sexo === 'F') {
    if (!e.pesoKg) faltam.push('Peso')
    if (!e.alturaCm) faltam.push('Altura')
  }
  if (faltam.length > 0) return { ok: false, faltam }

  const S = exigidas.reduce((acc, k) => acc + (e.dobras[k] as number), 0)
  const idade = e.idade ?? 0
  const log = Math.log10(S)
  let d: number
  switch (e.protocolo) {
    case 'pollock3':
      d = e.sexo === 'M'
        ? 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * idade
        : 1.0994921 - 0.0009929 * S + 0.0000023 * S * S - 0.0001392 * idade
      break
    case 'pollock7':
      d = e.sexo === 'M'
        ? 1.112 - 0.00043499 * S + 0.00000055 * S * S - 0.00028826 * idade
        : 1.097 - 0.00046971 * S + 0.00000056 * S * S - 0.00012828 * idade
      break
    case 'guedes':
      d = e.sexo === 'M' ? 1.1714 - 0.0671 * log : 1.1665 - 0.0706 * log
      break
    case 'petroski':
      d = e.sexo === 'M'
        ? 1.10726863 - 0.00081201 * S + 0.00000212 * S * S - 0.00041761 * idade
        : 1.0346585 - 0.00063129 * S + 0.00000187 * S * S - 0.00031165 * idade - 0.0004889 * (e.pesoKg as number) + 0.00051345 * (e.alturaCm as number)
      break
    case 'durnin': {
      const faixa = DURNIN[e.sexo].find(f => idade <= f.ate) ?? DURNIN[e.sexo][DURNIN[e.sexo].length - 1]
      d = faixa.c - faixa.m * log
      break
    }
  }

  let aviso: string | undefined
  if (e.idade !== null && e.idade !== undefined) {
    const [min, max] = FAIXA_IDADE[e.protocolo][e.sexo]
    if (e.idade < min || e.idade > max) {
      aviso = `Equação desenvolvida para ${min} a ${max} anos; fora dessa faixa o resultado é só uma estimativa.`
    }
  }
  return { ok: true, densidade: d, somatorio: S, dobrasUsadas: exigidas, aviso }
}

/** Siri 1961: % de gordura = (4,95 / D - 4,50) x 100. Resultado fora de 0 a 70 vira null (densidade inviável). */
export function percentualGorduraSiri(densidade: number): number | null {
  if (!Number.isFinite(densidade) || densidade <= 0) return null
  const pct = (4.95 / densidade - 4.5) * 100
  return pct >= 0 && pct <= 70 ? pct : null
}

export interface Composicao { pctGordura: number; massaGordaKg: number; massaMagraKg: number }

/** Massa gorda e magra a partir do peso e do % de gordura. */
export function calcularComposicao(pesoKg: number | null, pctGordura: number | null): Composicao | null {
  if (!pesoKg || pctGordura === null) return null
  const gorda = pesoKg * (pctGordura / 100)
  return { pctGordura, massaGordaKg: arredondar(gorda, 2), massaMagraKg: arredondar(pesoKg - gorda, 2) }
}
