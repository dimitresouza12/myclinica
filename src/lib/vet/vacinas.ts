// Carteira de vacinas e antiparasitários do pet: tipos, catálogo de SUGESTÕES, próxima dose e situação (vencida / a vencer).
// Funções puras, sem acesso a banco.
//
// O catálogo NÃO é protocolo oficial. Os intervalos são pontos de partida comuns, preenchidos na tela como
// sugestão que o veterinário confere e edita; o protocolo vale o da clínica e a bula do produto usado.

import { diasEntre, isoValido, somarDias } from './datas'

export type TipoRegistro = 'vacina' | 'vermifugo' | 'antiparasitario_externo'

export const TIPOS_REGISTRO: { value: TipoRegistro; label: string; plural: string }[] = [
  { value: 'vacina', label: 'Vacina', plural: 'Vacinas' },
  { value: 'vermifugo', label: 'Vermífugo', plural: 'Vermífugos' },
  { value: 'antiparasitario_externo', label: 'Antipulgas e carrapatos', plural: 'Antipulgas e carrapatos' },
]

export function rotuloTipo(t: string | null | undefined): string {
  return TIPOS_REGISTRO.find(x => x.value === t)?.label ?? 'Registro'
}

export interface RegistroCarteira {
  id: string
  kind: TipoRegistro
  name: string
  batch: string | null
  manufacturer: string | null
  /** AAAA-MM-DD */
  applied_on: string
  /** AAAA-MM-DD */
  next_due_on: string | null
  professional_id: string | null
  professional_name: string | null
  professional_registration: string | null
  notes: string | null
  created_at: string
}

/** Antecedência (dias) em que a carteira passa a avisar "a vencer". */
export const DIAS_AVISO = 30

// ── Catálogo de sugestões ───────────────────────────────────────────────────

export type EspecieCatalogo = 'canino' | 'felino'

export interface ItemCatalogo {
  id: string
  tipo: TipoRegistro
  nome: string
  /** Intervalo sugerido até o próximo reforço; null = não sugere (o veterinário informa a data). */
  intervaloDias: number | null
  /** Nota curta mostrada junto da sugestão. */
  nota: string
}

export const AVISO_CATALOGO =
  'Sugestões de partida, não são protocolo oficial. Os intervalos mudam com a idade do animal, o produto e o risco do paciente: confira com o protocolo da clínica e a bula antes de registrar.'

const CANINO: ItemCatalogo[] = [
  { id: 'c-polivalente', tipo: 'vacina', nome: 'Polivalente canina (V8 / V10)', intervaloDias: 365, nota: 'Filhote: costuma ser série de doses a cada 21 a 30 dias; depois, reforço anual.' },
  { id: 'c-antirrabica', tipo: 'vacina', nome: 'Antirrábica', intervaloDias: 365, nota: 'Reforço anual.' },
  { id: 'c-gripe', tipo: 'vacina', nome: 'Gripe canina (tosse dos canis)', intervaloDias: 365, nota: 'Reforço anual.' },
  { id: 'c-giardia', tipo: 'vacina', nome: 'Giárdia', intervaloDias: 365, nota: 'Reforço anual.' },
  { id: 'c-leish', tipo: 'vacina', nome: 'Leishmaniose', intervaloDias: 365, nota: 'Reforço anual; a indicação e o teste prévio são decisão do veterinário.' },
  { id: 'c-vermifugo', tipo: 'vermifugo', nome: 'Vermífugo', intervaloDias: 90, nota: 'Filhotes costumam precisar de intervalos menores; ajuste pelo produto e pela idade.' },
  { id: 'c-ecto', tipo: 'antiparasitario_externo', nome: 'Antipulgas e carrapatos', intervaloDias: 30, nota: 'Alguns produtos duram 30 dias, outros até 90: use o prazo da bula.' },
]

const FELINO: ItemCatalogo[] = [
  { id: 'f-v3', tipo: 'vacina', nome: 'Tríplice felina (V3)', intervaloDias: 365, nota: 'Filhote: costuma ser série de doses a cada 21 a 30 dias; depois, reforço anual.' },
  { id: 'f-v4', tipo: 'vacina', nome: 'Quádrupla felina (V4)', intervaloDias: 365, nota: 'Filhote: costuma ser série de doses a cada 21 a 30 dias; depois, reforço anual.' },
  { id: 'f-v5', tipo: 'vacina', nome: 'Quíntupla felina (V5)', intervaloDias: 365, nota: 'Filhote: costuma ser série de doses a cada 21 a 30 dias; depois, reforço anual.' },
  { id: 'f-antirrabica', tipo: 'vacina', nome: 'Antirrábica', intervaloDias: 365, nota: 'Reforço anual.' },
  { id: 'f-felv', tipo: 'vacina', nome: 'Leucemia felina (FeLV)', intervaloDias: 365, nota: 'Reforço anual; o teste prévio é decisão do veterinário.' },
  { id: 'f-vermifugo', tipo: 'vermifugo', nome: 'Vermífugo', intervaloDias: 90, nota: 'Filhotes costumam precisar de intervalos menores; ajuste pelo produto e pela idade.' },
  { id: 'f-ecto', tipo: 'antiparasitario_externo', nome: 'Antipulgas e carrapatos', intervaloDias: 30, nota: 'Alguns produtos duram 30 dias, outros até 90: use o prazo da bula.' },
]

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** "Canino"/"Cão"/"cachorro" -> 'canino'; "Felino"/"Gato" -> 'felino'; outras espécies: null (sem catálogo). */
export function especieDoCatalogo(especie: string | null | undefined): EspecieCatalogo | null {
  const s = semAcento(especie ?? '')
  if (['canino', 'cao', 'cachorro', 'cachorra', 'cadela', 'cao (canino)'].includes(s)) return 'canino'
  if (['felino', 'gato', 'gata'].includes(s)) return 'felino'
  return null
}

/** Sugestões da espécie, filtradas por tipo quando informado. Espécie sem catálogo: lista vazia (o nome é digitado). */
export function catalogoDaEspecie(especie: string | null | undefined, tipo?: TipoRegistro): ItemCatalogo[] {
  const e = especieDoCatalogo(especie)
  const lista = e === 'canino' ? CANINO : e === 'felino' ? FELINO : []
  return tipo ? lista.filter(i => i.tipo === tipo) : lista
}

// ── Próxima dose e situação ─────────────────────────────────────────────────

/** Data da próxima dose = aplicação + intervalo em dias. Intervalo vazio, zero, negativo ou fracionado: null. */
export function proximaDose(aplicadaEm: string | null | undefined, intervaloDias: number | null | undefined): string | null {
  if (intervaloDias === null || intervaloDias === undefined || !Number.isInteger(intervaloDias) || intervaloDias <= 0) return null
  return somarDias(aplicadaEm, intervaloDias)
}

export type SituacaoPrazo = 'vencida' | 'a_vencer' | 'em_dia' | 'sem_prazo'

/**
 * Situação de um prazo. Vence no dia seguinte ao da data prevista: no próprio dia ainda é "a vencer" (hoje).
 * `a_vencer` = faltam `diasAviso` dias ou menos.
 */
export function situacaoDoPrazo(proxima: string | null | undefined, hoje: string, diasAviso = DIAS_AVISO): SituacaoPrazo {
  if (!isoValido(proxima) || !isoValido(hoje)) return 'sem_prazo'
  const falta = diasEntre(hoje, proxima)!
  if (falta < 0) return 'vencida'
  return falta <= diasAviso ? 'a_vencer' : 'em_dia'
}

/** Texto curto do prazo: "venceu há 12 dias", "vence hoje", "vence em 5 dias", "em dia". */
export function textoDoPrazo(proxima: string | null | undefined, hoje: string, diasAviso = DIAS_AVISO): string {
  const s = situacaoDoPrazo(proxima, hoje, diasAviso)
  if (s === 'sem_prazo') return 'Sem próxima dose'
  const falta = diasEntre(hoje, proxima)!
  if (s === 'vencida') return falta === -1 ? 'Venceu ontem' : `Venceu há ${-falta} dias`
  if (falta === 0) return 'Vence hoje'
  if (s === 'a_vencer') return falta === 1 ? 'Vence amanhã' : `Vence em ${falta} dias`
  return 'Em dia'
}

/** Chave que identifica "o mesmo produto" para saber qual aplicação é a mais recente (sem acento, caixa ou espaço sobrando). */
export function chaveDoProduto(r: Pick<RegistroCarteira, 'kind' | 'name'>): string {
  return `${r.kind}|${semAcento(r.name).replace(/\s+/g, ' ')}`
}

/** Mais recente primeiro (aplicação; empate pela criação). */
export function ordenarRecentesPrimeiro<T extends Pick<RegistroCarteira, 'applied_on' | 'created_at'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) => b.applied_on.localeCompare(a.applied_on) || b.created_at.localeCompare(a.created_at))
}

/** Só a aplicação mais recente de cada produto: ela é quem manda no prazo (a dose anterior já foi cumprida). */
export function vigentes<T extends Pick<RegistroCarteira, 'kind' | 'name' | 'applied_on' | 'created_at'>>(registros: T[]): T[] {
  const vistos = new Set<string>()
  const out: T[] = []
  for (const r of ordenarRecentesPrimeiro(registros)) {
    const k = chaveDoProduto(r)
    if (vistos.has(k)) continue
    vistos.add(k)
    out.push(r)
  }
  return out
}

export interface SituacaoCarteira {
  vencidas: RegistroCarteira[]
  aVencer: RegistroCarteira[]
  /** Menor data entre os prazos ainda em aberto (vencidos incluídos), com o nome do produto. */
  proxima: { data: string; nome: string } | null
  /** Pior situação do pet: vencida > a_vencer > em_dia; sem nenhum registro: sem_registro. */
  geral: 'vencida' | 'a_vencer' | 'em_dia' | 'sem_registro'
}

/** Resume a carteira de um pet na data `hoje`. Só entra no alerta a aplicação mais recente de cada produto. */
export function situacaoDaCarteira(registros: RegistroCarteira[], hoje: string, diasAviso = DIAS_AVISO): SituacaoCarteira {
  if (registros.length === 0) return { vencidas: [], aVencer: [], proxima: null, geral: 'sem_registro' }
  const atuais = vigentes(registros)
  const vencidas: RegistroCarteira[] = []
  const aVencer: RegistroCarteira[] = []
  for (const r of atuais) {
    const s = situacaoDoPrazo(r.next_due_on, hoje, diasAviso)
    if (s === 'vencida') vencidas.push(r)
    else if (s === 'a_vencer') aVencer.push(r)
  }
  const porPrazo = (a: RegistroCarteira, b: RegistroCarteira) => (a.next_due_on ?? '').localeCompare(b.next_due_on ?? '')
  vencidas.sort(porPrazo)
  aVencer.sort(porPrazo)
  const abertos = atuais.filter(r => isoValido(r.next_due_on)).sort(porPrazo)
  return {
    vencidas,
    aVencer,
    proxima: abertos.length ? { data: abertos[0].next_due_on as string, nome: abertos[0].name } : null,
    geral: vencidas.length ? 'vencida' : aVencer.length ? 'a_vencer' : 'em_dia',
  }
}

/** Texto do selo na lista de pacientes e no topo da aba: "2 vencidas", "1 a vencer"; vazio quando não há o que avisar. */
export function seloDaCarteira(s: Pick<SituacaoCarteira, 'vencidas' | 'aVencer'>): string {
  if (s.vencidas.length) return s.vencidas.length === 1 ? '1 vencida' : `${s.vencidas.length} vencidas`
  if (s.aVencer.length) return `${s.aVencer.length} a vencer`
  return ''
}

// ── Validação do formulário ─────────────────────────────────────────────────

export interface FormRegistro {
  nome: string
  aplicadaEm: string
  proximaEm: string
}

/** Mensagens de erro do formulário (vazio = pode gravar). */
export function validarRegistro(f: FormRegistro, hoje: string): string[] {
  const erros: string[] = []
  if (!f.nome.trim()) erros.push('Informe o nome do produto.')
  if (!isoValido(f.aplicadaEm)) erros.push('Informe a data de aplicação.')
  else if (f.aplicadaEm > hoje) erros.push('A data de aplicação não pode ser no futuro.')
  if (f.proximaEm) {
    if (!isoValido(f.proximaEm)) erros.push('A data da próxima dose não é válida.')
    else if (isoValido(f.aplicadaEm) && f.proximaEm < f.aplicadaEm) erros.push('A próxima dose não pode ser antes da aplicação.')
  }
  return erros
}
