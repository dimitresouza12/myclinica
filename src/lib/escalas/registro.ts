/**
 * Como uma escala aplicada vira registro do prontuário, sem tabela nova: uma linha de
 * `record_entries` com entry_type = 'escala'. O texto da linha tem duas partes:
 *   1. um resumo legível (resultado, faixa, alerta e cada resposta), que aparece como está em
 *      qualquer lugar que lista evoluções (linha do tempo, impressão, relatório de IA);
 *   2. uma última linha técnica `#escala:v1:<id>:<respostas>` de onde o histórico e o gráfico
 *      leem as respostas. As telas que mostram o texto escondem essa linha (`textoVisivel`).
 * Como toda evolução, o registro é permanente: o banco só aceita inserir e ler.
 */

import {
  ESCALAS, formatarValor, isEscalaId, normalizarRespostas, opcoesCurtas, opcoesDoItem, pontuar,
  type EscalaDef, type EscalaId, type Respostas, type ResultadoEscala,
} from './escalas'
import { isProtocoloId, PROTOCOLOS, type DestaqueProtocolo, type ModuloProtocolo, type ProtocoloDef, type ProtocoloId } from './protocolos'
import { MODULO_AUDIOGRAMA, type AudiogramaDados } from './audiograma'
import { MODULO_VOZ, type VozDados } from './fichaVoz'
import { MODULO_FLUENCIA, type FluenciaDados } from './fichaFluencia'
import { MODULO_MOF, type MofDados } from './fichaMof'

export const ENTRY_TYPE_ESCALA = 'escala'

const LINHA_TECNICA = /^#escala:v1:([a-z0-9]+):([\d,-]+)[ \t]*$/m
/** Fichas estruturadas (audiograma, voz...): os dados vão em JSON codificado em base64 URL-safe. */
const LINHA_PROTOCOLO = /^#protocolo:v1:([a-z0-9]+):([A-Za-z0-9_-]+)[ \t]*$/m

export interface EntradaEscala {
  entry_text: string
  entry_type: typeof ENTRY_TYPE_ESCALA
}

/** Linha técnica: respostas separadas por vírgula, "-" para item em branco. */
function linhaTecnica(def: EscalaDef, respostas: Respostas): string {
  return `#escala:v1:${def.id}:${respostas.map(r => (r === null ? '-' : String(r))).join(',')}`
}

/** Texto e tipo da linha de record_entries para uma escala já respondida. */
export function montarEntrada(def: EscalaDef, respostas: Respostas): EntradaEscala {
  const res = pontuar(def, respostas)
  const linhas: string[] = []
  const cab = res.valor === null ? '' : ` ${formatarValor(def, res.valor)}${def.unidade === 'pontos' ? ` de ${def.maximo}` : ''}.`
  if (def.subescalas) {
    // sem total geral: um resultado por subescala (DASS-21, checklists)
    const partes = res.subescalas.flatMap(sub => (sub.valor === null ? [] : [`${sub.nome} ${sub.valor} de ${sub.maximo}${sub.faixa ? ` (${sub.faixa.rotulo.toLowerCase()})` : ''}`]))
    linhas.push(`Escala ${def.sigla}: ${partes.join('; ')}.`)
  } else {
    linhas.push(`Escala ${def.sigla}:${cab}${res.faixa ? ` ${def.dominio}: ${res.faixa.rotulo.toLowerCase()}.` : ''}`)
  }
  if (res.alertaRisco) {
    linhas.push('ATENÇÃO CLÍNICA: item 9 positivo (pensamentos de se ferir ou de que seria melhor estar morto).')
  }
  if (def.unidade === 'percentual' && res.total - res.respondidos > 0) {
    linhas.push(`Seções respondidas: ${res.respondidos} de ${res.total}.`)
  }
  def.itens.forEach((item, i) => {
    const r = respostas[i]
    if (r === null || r === undefined) return
    const opcoes = opcoesDoItem(def, i)
    // opções curtas (frequência, dificuldade, sim/não) saem por extenso; as frases longas (Oswestry, Barthel, Berg), só como nota do item
    const resposta = opcoesCurtas(def, i)
      ? `${opcoes.find(x => x.valor === r)?.rotulo ?? ''} (${r})`
      : `${r} de ${Math.max(...opcoes.map(x => x.valor))}`
    linhas.push(`${i + 1}. ${item.curto}: ${resposta}`)
  })
  linhas.push(linhaTecnica(def, respostas))
  return { entry_text: linhas.join('\n'), entry_type: ENTRY_TYPE_ESCALA }
}

export interface EscalaLida {
  id: EscalaId
  def: EscalaDef
  respostas: Respostas
  resultado: ResultadoEscala
}

/** Lê as respostas de uma evolução; null quando não é registro de escala ou o formato não confere. */
export function lerEntrada(entryText: string | null | undefined): EscalaLida | null {
  if (!entryText) return null
  const m = LINHA_TECNICA.exec(entryText)
  if (!m || !isEscalaId(m[1])) return null
  const def = ESCALAS[m[1]]
  const partes = m[2].split(',')
  if (partes.length !== def.itens.length) return null
  const bruto = partes.map(p => (p === '-' ? null : Number(p)))
  const respostas = normalizarRespostas(def, bruto)
  const resultado = pontuar(def, respostas)
  if (!resultado.completo) return null
  return { id: def.id, def, respostas, resultado }
}

/** O texto da evolução sem a linha técnica, para mostrar, imprimir ou mandar para a IA. */
export function textoVisivel(entryText: string): string {
  return entryText.replace(LINHA_TECNICA, '').replace(LINHA_PROTOCOLO, '').replace(/\n+$/, '')
}

// ── Fichas estruturadas (fonoaudiologia) ──────────────────────────────────────────────────────

export interface DadosPorProtocolo {
  audiograma: AudiogramaDados
  voz: VozDados
  fluencia: FluenciaDados
  mof: MofDados
}
export type DadosProtocolo = DadosPorProtocolo[ProtocoloId]

const MODULOS: { [K in ProtocoloId]: ModuloProtocolo<DadosPorProtocolo[K]> } = {
  audiograma: MODULO_AUDIOGRAMA,
  voz: MODULO_VOZ,
  fluencia: MODULO_FLUENCIA,
  mof: MODULO_MOF,
}

/** Módulo da ficha sem o tipo específico dos dados (cada módulo normaliza o que recebe). */
export function moduloDe(id: ProtocoloId): ModuloProtocolo<DadosProtocolo> {
  return MODULOS[id] as unknown as ModuloProtocolo<DadosProtocolo>
}

function paraBase64Url(texto: string): string {
  let bin = ''
  new TextEncoder().encode(texto).forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deBase64Url(b64: string): string | null {
  try {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)
    const bin = atob(padded)
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/** Texto e tipo da linha de record_entries para uma ficha preenchida. */
export function montarEntradaProtocolo(def: ProtocoloDef, dados: unknown): EntradaEscala {
  const modulo = moduloDe(def.id)
  const limpo = modulo.normalizar(dados)
  const linhas = [`Ficha ${def.sigla}: ${def.nome}.`, ...modulo.resumo(limpo)]
  linhas.push(`#protocolo:v1:${def.id}:${paraBase64Url(JSON.stringify(limpo))}`)
  return { entry_text: linhas.join('\n'), entry_type: ENTRY_TYPE_ESCALA }
}

export interface ProtocoloLido {
  id: ProtocoloId
  def: ProtocoloDef
  dados: DadosProtocolo
  destaque: DestaqueProtocolo | null
  /** Linhas legíveis da aplicação (as mesmas que foram para o prontuário, sem a linha técnica) */
  resumo: string[]
  /** Valor de cada indicador do módulo, na ordem em que ele os declara */
  indicadores: (number | null)[]
}

/** Lê uma ficha de uma evolução; null quando não é registro de ficha ou o formato não confere. */
export function lerProtocolo(entryText: string | null | undefined): ProtocoloLido | null {
  if (!entryText) return null
  const m = LINHA_PROTOCOLO.exec(entryText)
  if (!m || !isProtocoloId(m[1])) return null
  const json = deBase64Url(m[2])
  if (json === null) return null
  let bruto: unknown
  try { bruto = JSON.parse(json) } catch { return null }
  const modulo = moduloDe(m[1])
  const dados = modulo.normalizar(bruto)
  if (!modulo.pronto(dados)) return null
  return {
    id: m[1], def: PROTOCOLOS[m[1]], dados,
    destaque: modulo.destaque(dados), resumo: modulo.resumo(dados),
    indicadores: modulo.indicadores.map(i => i.valor(dados)),
  }
}
