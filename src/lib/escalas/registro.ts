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
  ESCALAS, formatarValor, isEscalaId, normalizarRespostas, opcoesDoItem, pontuar,
  type EscalaDef, type EscalaId, type Respostas, type ResultadoEscala,
} from './escalas'

export const ENTRY_TYPE_ESCALA = 'escala'

const LINHA_TECNICA = /^#escala:v1:([a-z0-9]+):([\d,-]+)[ \t]*$/m

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
  linhas.push(`Escala ${def.sigla}:${cab}${res.faixa ? ` ${def.dominio}: ${res.faixa.rotulo.toLowerCase()}.` : ''}`)
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
    // opções curtas (frequência, dificuldade) saem por extenso; as frases longas do Oswestry, só como nota da seção
    const resposta = opcoes.length <= 4
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
  return entryText.replace(LINHA_TECNICA, '').replace(/\n+$/, '')
}
