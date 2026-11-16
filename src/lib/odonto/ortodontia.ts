// Ficha de ortodontia: aparelho, arcadas, instalação, manutenções (ativação, fio, elásticos, fotos), próxima manutenção e
// linha do tempo do tratamento. Lógica pura (testada em ortodontia.test.ts). Datas são texto "AAAA-MM-DD"; todas as contas
// de data usam UTC, então não dependem do fuso do navegador.

export type AparelhoId = 'fixo_metalico' | 'fixo_estetico' | 'autoligado' | 'alinhador' | 'removivel' | 'expansor' | 'contencao' | 'outro'
export const APARELHOS: { id: AparelhoId; rotulo: string; /** usa fio ortodôntico */ fio: boolean }[] = [
  { id: 'fixo_metalico', rotulo: 'Fixo metálico', fio: true },
  { id: 'fixo_estetico', rotulo: 'Fixo estético (cerâmica ou safira)', fio: true },
  { id: 'autoligado', rotulo: 'Fixo autoligado', fio: true },
  { id: 'alinhador', rotulo: 'Alinhadores transparentes', fio: false },
  { id: 'removivel', rotulo: 'Removível', fio: false },
  { id: 'expansor', rotulo: 'Expansor palatino', fio: false },
  { id: 'contencao', rotulo: 'Contenção', fio: false },
  { id: 'outro', rotulo: 'Outro', fio: true },
]
export const aparelhoValido = (x: unknown): x is AparelhoId => APARELHOS.some(a => a.id === x)
export const rotuloAparelho = (id: AparelhoId, outro = ''): string =>
  id === 'outro' && outro.trim() ? outro.trim() : (APARELHOS.find(a => a.id === id)?.rotulo ?? 'Aparelho')
export const aparelhoUsaFio = (id: AparelhoId): boolean => APARELHOS.find(a => a.id === id)?.fio ?? true

export type Arcadas = 'superior' | 'inferior' | 'ambas'
export const ARCADAS: { id: Arcadas; rotulo: string }[] = [
  { id: 'superior', rotulo: 'Superior' },
  { id: 'inferior', rotulo: 'Inferior' },
  { id: 'ambas', rotulo: 'Ambas' },
]
export const rotuloArcadas = (a: Arcadas): string => (a === 'ambas' ? 'Arcadas superior e inferior' : a === 'superior' ? 'Arcada superior' : 'Arcada inferior')

export type SituacaoOrto = 'planejado' | 'ativo' | 'contencao' | 'pausado' | 'concluido'
export const SITUACOES: { id: SituacaoOrto; rotulo: string }[] = [
  { id: 'planejado', rotulo: 'Planejado' },
  { id: 'ativo', rotulo: 'Em tratamento ativo' },
  { id: 'contencao', rotulo: 'Em contenção' },
  { id: 'pausado', rotulo: 'Pausado' },
  { id: 'concluido', rotulo: 'Concluído' },
]
export const rotuloSituacao = (s: SituacaoOrto): string => SITUACOES.find(x => x.id === s)?.rotulo ?? ''

export const MAX_FOTOS_POR_CONSULTA = 6

export interface OrtoConsulta {
  id: string
  /** AAAA-MM-DD */
  data: string
  /** o que foi ativado: troca de fio, dobra, volta do parafuso, etapa do alinhador... */
  ativacao: string
  fioSup: string
  fioInf: string
  elasticos: string
  obs: string
  /** próxima manutenção marcada nesta consulta; '' = sem data marcada */
  proxima: string
  /** caminhos no bucket de armazenamento (ver caminhoFotoOrto) */
  fotos: string[]
}

export interface OrtoDados {
  v: 1
  aparelho: AparelhoId
  aparelhoOutro: string
  arcadas: Arcadas
  /** data da instalação do aparelho; '' enquanto não instalado */
  instalacao: string
  /** duração prevista do tratamento em meses (texto com dígitos); '' = sem previsão */
  previsaoMeses: string
  /** intervalo padrão entre manutenções em dias (texto com dígitos) */
  intervaloDias: string
  situacao: SituacaoOrto
  /** data em que o aparelho saiu ou o tratamento terminou */
  conclusao: string
  objetivo: string
  obs: string
  consultas: OrtoConsulta[]
}

export function ortoVazio(hoje = ''): OrtoDados {
  return {
    v: 1, aparelho: 'fixo_metalico', aparelhoOutro: '', arcadas: 'ambas', instalacao: hoje, previsaoMeses: '', intervaloDias: '30',
    situacao: 'ativo', conclusao: '', objetivo: '', obs: '', consultas: [],
  }
}

export function consultaVazia(id: string, data: string): OrtoConsulta {
  return { id, data, ativacao: '', fioSup: '', fioInf: '', elasticos: '', obs: '', proxima: '', fotos: [] }
}

// ── Datas (UTC) ──────────────────────────────────────────────────

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/
export function dataValida(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = RE_DATA.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}
const toUtc = (s: string) => { const m = RE_DATA.exec(s)!; return Date.UTC(+m[1], +m[2] - 1, +m[3]) }
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10)
const DIA = 86_400_000

/** Dias de a até b (positivo quando b é depois). */
export function diasEntre(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DIA)
}
export function somarDias(s: string, n: number): string {
  return fromUtc(toUtc(s) + n * DIA)
}
/** Soma meses mantendo o dia, ou o último dia do mês quando ele não existe (31 de janeiro + 1 mês = 28 ou 29 de fevereiro). */
export function somarMeses(s: string, n: number): string {
  const m = RE_DATA.exec(s)!
  const total = +m[1] * 12 + (+m[2] - 1) + n
  const ano = Math.floor(total / 12), mes = total % 12
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  return fromUtc(Date.UTC(ano, mes, Math.min(+m[3], ultimo)))
}

// ── Leitura segura do JSON salvo ─────────────────────────────────

const txt = (x: unknown, max = 500): string => (typeof x === 'string' ? x.slice(0, max) : '')
const dataOuVazio = (x: unknown): string => (dataValida(x) ? x : '')
const digitos = (x: unknown, max: number): string => {
  const d = (typeof x === 'number' ? String(Math.trunc(x)) : typeof x === 'string' ? x : '').replace(/\D/g, '').slice(0, 3)
  return d !== '' && Number(d) > max ? String(max) : d
}

function lerConsulta(raw: unknown, i: number): OrtoConsulta | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!dataValida(r.data)) return null
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `c${i}`,
    data: r.data,
    ativacao: txt(r.ativacao), fioSup: txt(r.fioSup, 120), fioInf: txt(r.fioInf, 120), elasticos: txt(r.elasticos), obs: txt(r.obs, 2000),
    proxima: dataOuVazio(r.proxima),
    fotos: Array.isArray(r.fotos) ? r.fotos.filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 400).slice(0, MAX_FOTOS_POR_CONSULTA) : [],
  }
}

/** Lê o jsonb salvo e devolve sempre uma ficha válida; consulta sem data válida é descartada. */
export function normalizarOrto(raw: unknown): OrtoDados {
  const base = ortoVazio('')
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  const sit = SITUACOES.find(s => s.id === r.situacao)?.id
  const arc = ARCADAS.find(a => a.id === r.arcadas)?.id
  return {
    v: 1,
    aparelho: aparelhoValido(r.aparelho) ? r.aparelho : base.aparelho,
    aparelhoOutro: txt(r.aparelhoOutro, 80),
    arcadas: arc ?? base.arcadas,
    instalacao: dataOuVazio(r.instalacao),
    previsaoMeses: digitos(r.previsaoMeses, 120),
    intervaloDias: r.intervaloDias === undefined ? base.intervaloDias : digitos(r.intervaloDias, 365),
    situacao: sit ?? base.situacao,
    conclusao: dataOuVazio(r.conclusao),
    objetivo: txt(r.objetivo, 2000),
    obs: txt(r.obs, 4000),
    consultas: (Array.isArray(r.consultas) ? r.consultas : []).flatMap((c, i) => { const x = lerConsulta(c, i); return x ? [x] : [] }),
  }
}

/** Mais recente primeiro; na mesma data, a última registrada fica na frente. */
export function consultasOrdenadas(d: OrtoDados): OrtoConsulta[] {
  return d.consultas.map((c, i) => ({ c, i })).sort((a, b) => (a.c.data === b.c.data ? b.i - a.i : a.c.data < b.c.data ? 1 : -1)).map(x => x.c)
}

/** A ficha tem algo além dos valores iniciais? Serve para não gravar uma ficha em branco. */
export function ortoTemConteudo(d: OrtoDados): boolean {
  return d.consultas.length > 0 || d.objetivo.trim() !== '' || d.obs.trim() !== '' || d.instalacao !== '' || d.previsaoMeses !== ''
}

export function comConsulta(d: OrtoDados, c: OrtoConsulta): OrtoDados {
  const existe = d.consultas.some(x => x.id === c.id)
  return { ...d, consultas: existe ? d.consultas.map(x => (x.id === c.id ? c : x)) : [...d.consultas, c] }
}
export function semConsulta(d: OrtoDados, id: string): OrtoDados {
  return { ...d, consultas: d.consultas.filter(c => c.id !== id) }
}

/** Todos os caminhos de foto da ficha. */
export function fotosDaFicha(d: OrtoDados): string[] {
  return d.consultas.flatMap(c => c.fotos)
}

/** Caminho da foto no bucket `pacientes`: a 2ª pasta é a clínica, como pedem as policies do bucket. */
export function caminhoFotoOrto(args: { clinicId: string; patientId: string; ext: string; now?: number; rand?: string }): string {
  const rand = (args.rand ?? Math.random().toString(36).slice(2, 8)).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'x'
  const ext = /^[a-z0-9]{1,5}$/.test(args.ext) ? args.ext : 'jpg'
  return `ortodontia/${args.clinicId}/${args.patientId}/${args.now ?? Date.now()}-${rand}.${ext}`
}

// ── Próxima manutenção, prazo e andamento ────────────────────────

export interface ProximaManutencao {
  data: string
  /** agendada = data digitada na última consulta; sugerida = última consulta (ou instalação) + intervalo padrão */
  origem: 'agendada' | 'sugerida'
}

/** Próxima manutenção do tratamento; null quando concluído, pausado ou sem como estimar. */
export function proximaManutencao(d: OrtoDados): ProximaManutencao | null {
  if (d.situacao === 'concluido' || d.situacao === 'pausado' || d.conclusao) return null
  const ultima = consultasOrdenadas(d)[0]
  if (ultima?.proxima) return { data: ultima.proxima, origem: 'agendada' }
  const intervalo = Number(d.intervaloDias)
  if (!(intervalo > 0)) return null
  const ref = ultima?.data ?? (d.instalacao || '')
  if (!ref) return null
  return { data: somarDias(ref, intervalo), origem: 'sugerida' }
}

export type PrazoManutencao = 'atrasada' | 'hoje' | 'em_dias'
export function prazoManutencao(data: string, hoje: string): { estado: PrazoManutencao; dias: number } {
  const dias = diasEntre(hoje, data)
  return { estado: dias < 0 ? 'atrasada' : dias === 0 ? 'hoje' : 'em_dias', dias }
}
export function textoPrazo(p: { estado: PrazoManutencao; dias: number }): string {
  if (p.estado === 'hoje') return 'Hoje'
  const n = Math.abs(p.dias)
  const un = n === 1 ? 'dia' : 'dias'
  return p.estado === 'atrasada' ? `Atrasada há ${n} ${un}` : `Em ${n} ${un}`
}

/** Tempo de tratamento: da instalação até a conclusão (ou hoje), em meses e dias. null sem instalação ou se a instalação é futura. */
export function tempoDeTratamento(d: OrtoDados, hoje: string): { meses: number; dias: number } | null {
  if (!d.instalacao) return null
  const fim = d.conclusao || hoje
  if (diasEntre(d.instalacao, fim) < 0) return null
  let meses = 0
  while (somarMeses(d.instalacao, meses + 1) <= fim) meses++
  return { meses, dias: diasEntre(somarMeses(d.instalacao, meses), fim) }
}

export function textoTempo(t: { meses: number; dias: number } | null): string {
  if (!t) return ''
  const m = t.meses === 0 ? '' : `${t.meses} ${t.meses === 1 ? 'mês' : 'meses'}`
  const d = t.dias === 0 ? '' : `${t.dias} ${t.dias === 1 ? 'dia' : 'dias'}`
  return [m, d].filter(Boolean).join(' e ') || '0 dias'
}

/** Data prevista de término (instalação + previsão); null sem os dois. */
export function previsaoDeTermino(d: OrtoDados): string | null {
  const m = Number(d.previsaoMeses)
  if (!d.instalacao || !(m > 0)) return null
  return somarMeses(d.instalacao, m)
}

/** Quanto do prazo previsto já passou, de 0 a 100; null sem previsão ou sem instalação. */
export function progressoPrevisto(d: OrtoDados, hoje: string): number | null {
  const fim = previsaoDeTermino(d)
  if (!fim || !d.instalacao) return null
  if (d.situacao === 'concluido' || d.conclusao) return 100
  const total = diasEntre(d.instalacao, fim)
  if (total <= 0) return null
  const pct = (diasEntre(d.instalacao, hoje) / total) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

// ── Linha do tempo ───────────────────────────────────────────────

export type TipoEvento = 'instalacao' | 'manutencao' | 'proxima' | 'previsao' | 'conclusao'
export type EstadoEvento = 'feito' | 'futuro' | 'atrasado'

export interface EventoOrto {
  tipo: TipoEvento
  data: string
  titulo: string
  detalhe: string
  estado: EstadoEvento
  /** id da consulta, para os eventos de manutenção */
  consultaId?: string
  fotos: number
}

const ORDEM_TIPO: Record<TipoEvento, number> = { instalacao: 0, manutencao: 1, proxima: 2, previsao: 3, conclusao: 4 }

/** Resumo de uma consulta em uma linha: ativação, fio e elásticos preenchidos. */
export function resumoConsulta(c: OrtoConsulta, usaFio = true): string {
  const fio = usaFio ? [c.fioSup && `fio superior ${c.fioSup}`, c.fioInf && `fio inferior ${c.fioInf}`].filter(Boolean).join(', ') : ''
  return [c.ativacao && `Ativação: ${c.ativacao}`, fio, c.elasticos && `Elásticos: ${c.elasticos}`].filter(Boolean).join(' | ')
}

/**
 * Eventos do tratamento em ordem de data: instalação, cada manutenção, a próxima manutenção (marcada ou sugerida),
 * a previsão de término e a conclusão. A previsão só aparece com o tratamento em andamento.
 */
export function linhaDoTempo(d: OrtoDados, hoje: string): EventoOrto[] {
  const ev: EventoOrto[] = []
  const usaFio = aparelhoUsaFio(d.aparelho)
  if (d.instalacao) {
    ev.push({
      tipo: 'instalacao', data: d.instalacao, titulo: 'Instalação do aparelho', fotos: 0,
      detalhe: `${rotuloAparelho(d.aparelho, d.aparelhoOutro)} - ${rotuloArcadas(d.arcadas).toLowerCase()}`,
      estado: d.instalacao <= hoje ? 'feito' : 'futuro',
    })
  }
  for (const c of d.consultas) {
    ev.push({
      tipo: 'manutencao', data: c.data, titulo: 'Manutenção', consultaId: c.id, fotos: c.fotos.length,
      detalhe: [resumoConsulta(c, usaFio), c.obs].filter(Boolean).join(' | '),
      estado: c.data <= hoje ? 'feito' : 'futuro',
    })
  }
  const prox = proximaManutencao(d)
  if (prox) {
    const atrasada = prox.data < hoje
    ev.push({
      tipo: 'proxima', data: prox.data, fotos: 0, estado: atrasada ? 'atrasado' : 'futuro',
      titulo: prox.origem === 'agendada' ? 'Próxima manutenção' : 'Próxima manutenção (sugerida pelo intervalo)',
      detalhe: textoPrazo(prazoManutencao(prox.data, hoje)),
    })
  }
  const fim = previsaoDeTermino(d)
  if (fim && d.situacao !== 'concluido' && !d.conclusao) {
    ev.push({ tipo: 'previsao', data: fim, titulo: 'Previsão de término', detalhe: `${d.previsaoMeses} ${Number(d.previsaoMeses) === 1 ? 'mês' : 'meses'} de tratamento previstos`, estado: fim < hoje ? 'atrasado' : 'futuro', fotos: 0 })
  }
  if (d.conclusao) {
    ev.push({ tipo: 'conclusao', data: d.conclusao, titulo: d.situacao === 'contencao' ? 'Fim da fase ativa' : 'Tratamento concluído', detalhe: '', estado: d.conclusao <= hoje ? 'feito' : 'futuro', fotos: 0 })
  }
  return ev.map((e, i) => ({ e, i })).sort((a, b) => (a.e.data === b.e.data ? ORDEM_TIPO[a.e.tipo] - ORDEM_TIPO[b.e.tipo] || a.i - b.i : a.e.data < b.e.data ? -1 : 1)).map(x => x.e)
}

/** Rótulo curto do tratamento para o seletor de histórico: "Fixo metálico, jan/2026". */
export function rotuloTratamento(d: OrtoDados): string {
  const nome = rotuloAparelho(d.aparelho, d.aparelhoOutro)
  if (!d.instalacao) return nome
  const [a, m] = d.instalacao.split('-')
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nome}, ${MES[+m - 1]}/${a}`
}
