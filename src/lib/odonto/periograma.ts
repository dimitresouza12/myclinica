// Periograma: ficha de sondagem periodontal por dente. Lógica pura (testada em periograma.test.ts): modelo dos dados,
// leitura segura do JSON salvo, nível de inserção clínica, índices do exame e comparação entre duas datas.
//
// Cada dente tem 6 sítios: três por face (distal, central e mesial), na face vestibular e na lingual/palatina.
// Os arrays de sítios ficam SEMPRE na ordem anatômica [distal, central, mesial]; a tela é que inverte a ordem nos
// quadrantes da direita (ver ordemNaTela), reaproveitando a geometria do odontograma.

import { ALL_TEETH, LOWER, UPPER, isUpperTooth, readOdontogram } from '../odontograma'
import { faceLabel, mesialSide, rootCount, toothKind } from '../odontogramaGeometry'

export type Trio<T> = [T, T, T]
export type Sitio = 'd' | 'c' | 'm'
export const SITIOS: Sitio[] = ['d', 'c', 'm']
export const SITIO_NOME: Record<Sitio, string> = { d: 'Distal', c: 'Central', m: 'Mesial' }

/** v = vestibular; l = lingual (arcada de baixo) ou palatina (arcada de cima). */
export type FacePerio = 'v' | 'l'
export const FACES_PERIO: FacePerio[] = ['v', 'l']

export const PS_MAX = 15
export const REC_MAX = 15
export const MOBILIDADE_MAX = 3
export const FURCA_MAX = 3

export interface PerioFace {
  /** profundidade de sondagem em mm (do bordo gengival ao fundo do sulco) */
  ps: Trio<number | null>
  /** recessão em mm (do bordo gengival à junção cemento-esmalte); vazio conta como 0 */
  rec: Trio<number | null>
  sang: Trio<boolean>
  sup: Trio<boolean>
}

export interface PerioDente {
  ausente: boolean
  /** mobilidade 0 a 3; null = não avaliada */
  mob: number | null
  /** lesão de furca 0 a 3; null = não avaliada */
  furca: number | null
  v: PerioFace
  l: PerioFace
}

export interface PerioDados {
  v: 1
  dentes: Record<number, PerioDente>
  obs: string
}

/** Os 32 permanentes, na ordem da arcada como o dentista lê (direito do paciente à esquerda da tela). */
export const PERIO_SUPERIOR = UPPER
export const PERIO_INFERIOR = LOWER
export const PERIO_DENTES = ALL_TEETH

const trio = <T,>(v: T): Trio<T> => [v, v, v]

export function faceVazia(): PerioFace {
  return { ps: trio<number | null>(null), rec: trio<number | null>(null), sang: trio(false), sup: trio(false) }
}
export function denteVazio(): PerioDente {
  return { ausente: false, mob: null, furca: null, v: faceVazia(), l: faceVazia() }
}
export function perioVazio(): PerioDados {
  return { v: 1, dentes: {}, obs: '' }
}

// ── Leitura segura do JSON ───────────────────────────────────────

function numeroNoLimite(x: unknown, max: number): number | null {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN
  if (!Number.isFinite(n)) return null
  const i = Math.round(n)
  return i < 0 || i > max ? null : i
}

function lerTrio<T>(raw: unknown, fn: (x: unknown) => T, vazio: T): Trio<T> {
  const a = Array.isArray(raw) ? raw : []
  return [a[0] !== undefined ? fn(a[0]) : vazio, a[1] !== undefined ? fn(a[1]) : vazio, a[2] !== undefined ? fn(a[2]) : vazio]
}

function lerFace(raw: unknown): PerioFace {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    ps: lerTrio(r.ps, x => numeroNoLimite(x, PS_MAX), null),
    rec: lerTrio(r.rec, x => numeroNoLimite(x, REC_MAX), null),
    sang: lerTrio(r.sang, x => x === true, false),
    sup: lerTrio(r.sup, x => x === true, false),
  }
}

/** Lê o jsonb salvo: aceita dado incompleto ou corrompido e devolve sempre um exame válido (valores fora da faixa viram vazio). */
export function normalizarPerio(raw: unknown): PerioDados {
  const base = perioVazio()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  const dentes = (r.dentes && typeof r.dentes === 'object' ? r.dentes : {}) as Record<string, unknown>
  for (const n of PERIO_DENTES) {
    const t = dentes[String(n)]
    if (!t || typeof t !== 'object') continue
    const tr = t as Record<string, unknown>
    base.dentes[n] = {
      ausente: tr.ausente === true,
      mob: numeroNoLimite(tr.mob, MOBILIDADE_MAX),
      furca: numeroNoLimite(tr.furca, FURCA_MAX),
      v: lerFace(tr.v),
      l: lerFace(tr.l),
    }
  }
  base.obs = typeof r.obs === 'string' ? r.obs.slice(0, 4000) : ''
  return base
}

function faceTemDado(f: PerioFace): boolean {
  return f.ps.some(x => x !== null) || f.rec.some(x => x !== null) || f.sang.some(Boolean) || f.sup.some(Boolean)
}
export function denteTemDado(d: PerioDente | undefined): boolean {
  if (!d) return false
  return d.ausente || d.mob !== null || d.furca !== null || faceTemDado(d.v) || faceTemDado(d.l)
}
export function perioTemConteudo(d: PerioDados): boolean {
  return PERIO_DENTES.some(n => denteTemDado(d.dentes[n])) || d.obs.trim() !== ''
}

/** Versão para gravar: só os dentes com alguma informação, para o JSON não carregar 32 dentes vazios. */
export function serializarPerio(d: PerioDados): PerioDados {
  const dentes: Record<number, PerioDente> = {}
  for (const n of PERIO_DENTES) if (denteTemDado(d.dentes[n])) dentes[n] = d.dentes[n]
  return { v: 1, dentes, obs: d.obs.trim() }
}

/** Troca um valor de sítio sem mutar o exame. */
export function comDente(d: PerioDados, n: number, fn: (t: PerioDente) => PerioDente): PerioDados {
  const atual = d.dentes[n] ?? denteVazio()
  return { ...d, dentes: { ...d.dentes, [n]: fn(atual) } }
}
export function comValorNoSitio<K extends 'ps' | 'rec'>(t: PerioDente, face: FacePerio, campo: K, i: number, valor: number | null): PerioDente {
  const f = t[face]
  const arr = [...f[campo]] as Trio<number | null>
  arr[i] = valor
  return { ...t, [face]: { ...f, [campo]: arr } }
}
export function comMarcaNoSitio(t: PerioDente, face: FacePerio, campo: 'sang' | 'sup', i: number, valor: boolean): PerioDente {
  const f = t[face]
  const arr = [...f[campo]] as Trio<boolean>
  arr[i] = valor
  return { ...t, [face]: { ...f, [campo]: arr } }
}

// ── Geometria: ordem na tela, rótulos, furca ─────────────────────

/** Ordem dos sítios da esquerda para a direita da tela: o mesial aponta sempre para a linha média. */
export function ordemNaTela(n: number): Sitio[] {
  return mesialSide(n) === 'left' ? ['m', 'c', 'd'] : ['d', 'c', 'm']
}
const INDICE: Record<Sitio, number> = { d: 0, c: 1, m: 2 }
export const indiceDoSitio = (s: Sitio): number => INDICE[s]

/** "Mesial, vestibular" / "Distal, palatina": usado em leitor de tela e impressão. */
export function rotuloSitio(n: number, face: FacePerio, s: Sitio): string {
  return `${SITIO_NOME[s]}, ${faceLabel(n, face === 'v' ? 'v' : 'l').toLowerCase()}`
}

/** Furca só existe em dente com duas ou mais raízes (molares e 1º pré-molar superior). */
export function temFurca(n: number): boolean {
  return rootCount(toothKind(n), isUpperTooth(n)) >= 2
}

/**
 * Dentes que o odontograma marca como ausentes no dente inteiro. Implante fica de fora: ele é sondado (peri-implante).
 * Recebe o jsonb `odontogram` do prontuário.
 */
export function ausentesDoOdontograma(raw: Record<string, unknown> | null | undefined): number[] {
  const t = readOdontogram(raw ?? {})
  return PERIO_DENTES.filter(n => t[n]?.status === 'ausente')
}

/** Marca os dentes como ausentes sem apagar o que já foi digitado neles. */
export function marcarAusentes(d: PerioDados, nums: number[]): PerioDados {
  let out = d
  for (const n of nums) if (PERIO_DENTES.includes(n)) out = comDente(out, n, t => ({ ...t, ausente: true }))
  return out
}

// ── Cálculos ─────────────────────────────────────────────────────

/** Nível de inserção clínica de um sítio: profundidade de sondagem + recessão. Sem profundidade não há NIC; recessão vazia vale 0. */
export function nic(ps: number | null, rec: number | null): number | null {
  if (ps === null) return null
  return ps + (rec ?? 0)
}

export interface SitioCalculado {
  face: FacePerio
  sitio: Sitio
  ps: number | null
  rec: number | null
  nic: number | null
  sang: boolean
  sup: boolean
}

export function sitiosDoDente(t: PerioDente): SitioCalculado[] {
  const out: SitioCalculado[] = []
  for (const face of FACES_PERIO) {
    SITIOS.forEach((sitio, i) => {
      const f = t[face]
      out.push({ face, sitio, ps: f.ps[i], rec: f.rec[i], nic: nic(f.ps[i], f.rec[i]), sang: f.sang[i], sup: f.sup[i] })
    })
  }
  return out
}

/** Sítio que entra nas contas: tem profundidade, ou foi marcado com sangramento/supuração. */
const registrado = (s: SitioCalculado) => s.ps !== null || s.sang || s.sup

const media = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const maximo = (xs: number[]): number | null => (xs.length ? Math.max(...xs) : null)

export interface ResumoDente {
  sitiosRegistrados: number
  psMedia: number | null
  psMax: number | null
  nicMedia: number | null
  nicMax: number | null
  sangrando: number
  supurando: number
}

export function resumoDente(t: PerioDente | undefined): ResumoDente {
  const vazio: ResumoDente = { sitiosRegistrados: 0, psMedia: null, psMax: null, nicMedia: null, nicMax: null, sangrando: 0, supurando: 0 }
  if (!t || t.ausente) return vazio
  const s = sitiosDoDente(t).filter(registrado)
  const ps = s.flatMap(x => (x.ps === null ? [] : [x.ps]))
  const ni = s.flatMap(x => (x.nic === null ? [] : [x.nic]))
  return {
    sitiosRegistrados: s.length,
    psMedia: media(ps), psMax: maximo(ps), nicMedia: media(ni), nicMax: maximo(ni),
    sangrando: s.filter(x => x.sang).length, supurando: s.filter(x => x.sup).length,
  }
}

export type FaixaSangramento = 'baixo' | 'moderado' | 'alto'

/**
 * Faixa de leitura do sangramento à sondagem. Menos de 10% é o limite que a literatura usa para saúde gengival;
 * as outras duas faixas são só uma referência visual do app. Não é diagnóstico.
 */
export function faixaSangramento(pct: number | null): FaixaSangramento | null {
  if (pct === null) return null
  if (pct < 10) return 'baixo'
  if (pct <= 30) return 'moderado'
  return 'alto'
}
export const FAIXA_SANGRAMENTO_ROTULO: Record<FaixaSangramento, string> = {
  baixo: 'Abaixo de 10%',
  moderado: 'De 10% a 30%',
  alto: 'Acima de 30%',
}

export interface ResumoPerio {
  dentesAusentes: number
  /** dentes não ausentes com algum sítio registrado */
  dentesAvaliados: number
  sitiosRegistrados: number
  sitiosComPs: number
  sitiosSangrando: number
  sitiosSupurando: number
  /** % de sítios registrados com sangramento; null sem sítios */
  pctSangramento: number | null
  faixaSangramento: FaixaSangramento | null
  psMedia: number | null
  psMax: number | null
  nicMedia: number | null
  nicMax: number | null
  /** sítios com profundidade de 4 mm ou mais, e de 6 mm ou mais */
  sitiosPs4: number
  sitiosPs6: number
  pctPs4: number | null
  dentesComMobilidade: number
  dentesComFurca: number
}

export function resumoPerio(d: PerioDados): ResumoPerio {
  let ausentes = 0, avaliados = 0, registrados = 0, comPs = 0, sang = 0, sup = 0, ps4 = 0, ps6 = 0, mob = 0, furca = 0
  const psTodos: number[] = []
  const nicTodos: number[] = []
  for (const n of PERIO_DENTES) {
    const t = d.dentes[n]
    if (!t) continue
    if (t.ausente) { ausentes++; continue }
    const s = sitiosDoDente(t).filter(registrado)
    if (s.length > 0) avaliados++
    registrados += s.length
    for (const x of s) {
      if (x.ps !== null) { comPs++; psTodos.push(x.ps); if (x.ps >= 4) ps4++; if (x.ps >= 6) ps6++ }
      if (x.nic !== null) nicTodos.push(x.nic)
      if (x.sang) sang++
      if (x.sup) sup++
    }
    if ((t.mob ?? 0) >= 1) mob++
    if (temFurca(n) && (t.furca ?? 0) >= 1) furca++
  }
  const pct = registrados > 0 ? (sang / registrados) * 100 : null
  return {
    dentesAusentes: ausentes, dentesAvaliados: avaliados, sitiosRegistrados: registrados, sitiosComPs: comPs,
    sitiosSangrando: sang, sitiosSupurando: sup, pctSangramento: pct, faixaSangramento: faixaSangramento(pct),
    psMedia: media(psTodos), psMax: maximo(psTodos), nicMedia: media(nicTodos), nicMax: maximo(nicTodos),
    sitiosPs4: ps4, sitiosPs6: ps6, pctPs4: comPs > 0 ? (ps4 / comPs) * 100 : null,
    dentesComMobilidade: mob, dentesComFurca: furca,
  }
}

// ── Digitação rápida ─────────────────────────────────────────────

/** Texto digitado no campo de mm → número, limitado a `max`; vazio ou inválido = null. */
export function lerMm(texto: string, max: number): number | null {
  const d = texto.replace(/\D/g, '').slice(0, 2)
  if (d === '') return null
  const n = Number(d)
  return n > max ? Number(d.slice(-1)) : n
}

/**
 * Depois deste texto o campo já está completo e o foco pode pular para o próximo sítio: dois dígitos, ou um dígito
 * que não pode virar um número válido de dois dígitos (com máximo 15, de 2 a 9 já fecha; o 1 espera o segundo dígito).
 */
export function campoCompleto(texto: string, max: number): boolean {
  const d = texto.replace(/\D/g, '')
  if (d.length >= 2) return true
  if (d.length === 1) return Number(d) * 10 > max
  return false
}

// ── Comparação entre duas datas ──────────────────────────────────

/** Variação de 2 mm ou mais passa do erro de medida da sondagem; é o corte usado para dizer que um sítio mudou. */
export const LIMIAR_MUDANCA_MM = 2

export interface ComparacaoDente {
  dente: number
  a: ResumoDente
  b: ResumoDente
  ausenteA: boolean
  ausenteB: boolean
  /** B menos A; null quando falta o número em uma das datas. Negativo em profundidade e NIC é melhora. */
  dPsMedia: number | null
  dNicMedia: number | null
  dSangrando: number
}

export interface ComparacaoPerio {
  a: ResumoPerio
  b: ResumoPerio
  delta: {
    psMedia: number | null
    nicMedia: number | null
    pctSangramento: number | null
    sitiosSangrando: number
    sitiosPs4: number
  }
  /** Só sítios medidos nas duas datas. */
  sitios: {
    comparados: number
    psMelhorou: number
    psPiorou: number
    nicMelhorou: number
    nicPiorou: number
    sangramentoCessou: number
    sangramentoNovo: number
  }
  dentes: ComparacaoDente[]
  /** Presentes na data A e ausentes na B. */
  perdidos: number[]
}

const dif = (b: number | null, a: number | null): number | null => (a === null || b === null ? null : b - a)

export function compararPerio(a: PerioDados, b: PerioDados, limiar = LIMIAR_MUDANCA_MM): ComparacaoPerio {
  const ra = resumoPerio(a), rb = resumoPerio(b)
  const sitios = { comparados: 0, psMelhorou: 0, psPiorou: 0, nicMelhorou: 0, nicPiorou: 0, sangramentoCessou: 0, sangramentoNovo: 0 }
  const dentes: ComparacaoDente[] = []
  const perdidos: number[] = []
  for (const n of PERIO_DENTES) {
    const ta = a.dentes[n], tb = b.dentes[n]
    const ausA = !!ta?.ausente, ausB = !!tb?.ausente
    if (!ausA && ausB && denteTemDado(ta)) perdidos.push(n)
    const sa = resumoDente(ta), sb = resumoDente(tb)
    if (sa.sitiosRegistrados === 0 && sb.sitiosRegistrados === 0) continue
    dentes.push({
      dente: n, a: sa, b: sb, ausenteA: ausA, ausenteB: ausB,
      dPsMedia: dif(sb.psMedia, sa.psMedia), dNicMedia: dif(sb.nicMedia, sa.nicMedia), dSangrando: sb.sangrando - sa.sangrando,
    })
    if (ausA || ausB || !ta || !tb) continue
    const la = sitiosDoDente(ta), lb = sitiosDoDente(tb)
    la.forEach((x, i) => {
      const y = lb[i]
      if (x.ps === null || y.ps === null) return
      sitios.comparados++
      const dps = y.ps - x.ps
      if (dps <= -limiar) sitios.psMelhorou++
      else if (dps >= limiar) sitios.psPiorou++
      const dnic = (y.nic ?? 0) - (x.nic ?? 0)
      if (dnic <= -limiar) sitios.nicMelhorou++
      else if (dnic >= limiar) sitios.nicPiorou++
      if (x.sang && !y.sang) sitios.sangramentoCessou++
      if (!x.sang && y.sang) sitios.sangramentoNovo++
    })
  }
  return {
    a: ra, b: rb,
    delta: {
      psMedia: dif(rb.psMedia, ra.psMedia), nicMedia: dif(rb.nicMedia, ra.nicMedia), pctSangramento: dif(rb.pctSangramento, ra.pctSangramento),
      sitiosSangrando: rb.sitiosSangrando - ra.sitiosSangrando, sitiosPs4: rb.sitiosPs4 - ra.sitiosPs4,
    },
    sitios, dentes, perdidos,
  }
}

/** Número com vírgula e casas fixas; "-" quando vazio. */
export function fmtNum(n: number | null, casas = 1): string {
  return n === null ? '-' : n.toFixed(casas).replace('.', ',')
}
/** Variação com sinal ("+0,5", "-1,2", "0,0"); "-" quando vazio. */
export function fmtDelta(n: number | null, casas = 1): string {
  if (n === null) return '-'
  const s = Math.abs(n) < 0.5 * 10 ** -casas ? (0).toFixed(casas) : n.toFixed(casas)
  return (n > 0 && Number(s) !== 0 ? '+' : '') + s.replace('.', ',')
}
