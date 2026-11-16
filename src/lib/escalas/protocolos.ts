/**
 * Fichas estruturadas de fonoaudiologia (audiograma, voz, fluência, motricidade orofacial). Não são escalas de soma:
 * guardam campos próprios (limiares por frequência, contagem de disfluências, itens adequado/alterado) e entram na mesma
 * aba "Escalas" do prontuário. Mesmo armazenamento das escalas (uma linha de `record_entries` com entry_type = 'escala'),
 * com a linha técnica `#protocolo:v1:<id>:<dados>` em vez de `#escala:v1:...` (ver ./registro.ts). Sem tabela nova.
 *
 * Todas são registro de apoio à avaliação do fonoaudiólogo: classificam o que foi medido, não fecham diagnóstico.
 * Só instrumentos de domínio público ou roteiros próprios, em redação própria; nada de instrumento licenciado.
 */

import type { EscalaDef, TomFaixa } from './escalas'

export type ProtocoloId = 'audiograma' | 'voz' | 'fluencia' | 'mof'

export interface ProtocoloDef {
  /** Marca de tipo: diferencia a ficha de uma escala de soma (`EscalaDef` não tem este campo) */
  tipo: 'protocolo'
  id: ProtocoloId
  sigla: string
  nome: string
  /** Texto de apoio mostrado abaixo do título */
  instrucao: string
  /** Áreas (ClinicType) que oferecem a ficha */
  areas: string[]
  fonte: { original: string; nota: string }
}

/** O que a aba "Escalas" lista: escala de soma ou ficha estruturada. */
export type AvaliacaoDef = EscalaDef | ProtocoloDef

export function isProtocolo(def: AvaliacaoDef): def is ProtocoloDef {
  return (def as ProtocoloDef).tipo === 'protocolo'
}

/** Um valor que pode ser mostrado ao lado de uma aplicação e plotado no gráfico de evolução. */
export interface IndicadorProtocolo<T> {
  id: string
  rotulo: string
  /** Sufixo curto: 'dB', '%', 's'; vazio quando não há */
  unidade: string
  yMax: number
  yTicks: number[]
  valor: (d: T) => number | null
}

export interface DestaqueProtocolo { rotulo: string; tom: TomFaixa }

/** Contrato de cada ficha: o que a tela e o registro precisam saber dela. */
export interface ModuloProtocolo<T> {
  vazio: () => T
  /** Aceita qualquer coisa (dado salvo, de outra versão, corrompido) e devolve dados válidos */
  normalizar: (raw: unknown) => T
  /** Há o que salvar */
  pronto: (d: T) => boolean
  /** Linhas legíveis do prontuário (a linha técnica é montada à parte) */
  resumo: (d: T) => string[]
  destaque: (d: T) => DestaqueProtocolo | null
  indicadores: IndicadorProtocolo<T>[]
}

export const PROTOCOLOS: Record<ProtocoloId, ProtocoloDef> = {
  audiograma: {
    tipo: 'protocolo',
    id: 'audiograma',
    sigla: 'Audiograma',
    nome: 'Audiograma (audiometria tonal liminar)',
    instrucao: 'Registre o limiar de cada frequência, por orelha, na via aérea e na via óssea. O gráfico, a média tonal e a classificação saem sozinhos. Campo em branco = frequência não testada.',
    areas: ['fono'],
    fonte: {
      original: 'Classificação do grau da perda pela média tonal de 500, 1000 e 2000 Hz: Lloyd LL, Kaplan H. Audiometric interpretation: a manual of basic audiometry. Baltimore: University Park Press, 1978 (normal até 25 dB NA; leve 26 a 40; moderada 41 a 55; moderadamente severa 56 a 70; severa 71 a 90; profunda 91 ou mais). Símbolos do gráfico: ASHA. Guidelines for audiometric symbols. ASHA, 1990;32(Suppl 2):25-30 (orelha direita em vermelho, esquerda em azul; via aérea círculo e X; via óssea sem mascaramento "<" e ">").',
      nota: 'Critério de classificação e símbolos de domínio público. Há outras classificações (por exemplo a da OMS, com média de 500 a 4000 Hz e limite de 20 dB): informe no laudo a que você adotou. O tipo da perda (condutiva, neurossensorial ou mista) é uma sugestão pela diferença entre via aérea e via óssea (15 dB ou mais) e exige limiares de via óssea em 500, 1000 e 2000 Hz. Esta ficha não registra mascaramento nem ausência de resposta: anote na observação.',
    },
  },
  voz: {
    tipo: 'protocolo',
    id: 'voz',
    sigla: 'Voz',
    nome: 'Ficha de avaliação da voz',
    instrucao: 'Avaliação perceptivo-auditiva (GRBAS), tempos máximos de fonação, queixas e hábitos vocais. Preencha só o que foi avaliado: cada aplicação fica no histórico para comparar depois da terapia.',
    areas: ['fono'],
    fonte: {
      original: 'GRBAS: Hirano M. Clinical examination of voice. Wien: Springer-Verlag, 1981 (grau geral, rugosidade, soprosidade, astenia e tensão, de 0 a 3). Relação s/z: Eckel FC, Boone DR. The s/z ratio as an indicator of laryngeal pathology. J Speech Hear Disord, 1981;46(2):147-9.',
      nota: 'Roteiro próprio, em redação própria; não reproduz o CAPE-V (ASHA) nem protocolos de autoavaliação licenciados. O tempo máximo de fonação varia com idade, sexo e esforço: o sistema não classifica os valores, só acompanha. Relação s/z acima de 1,4 sugere avaliar a função laríngea, sempre junto da avaliação perceptivo-auditiva e do exame laríngeo.',
    },
  },
  fluencia: {
    tipo: 'protocolo',
    id: 'fluencia',
    sigla: 'Fluência',
    nome: 'Ficha de avaliação da fluência',
    instrucao: 'Conte as disfluências de uma amostra de fala e o total de palavras ou sílabas faladas. As porcentagens e a velocidade de fala saem sozinhas. Use o contador para ir somando durante a gravação.',
    areas: ['fono'],
    fonte: {
      original: 'Tipos de disfluência (gagas e comuns): Yairi E, Ambrose NG. Early childhood stuttering. Austin: Pro-Ed, 2005. Referência de 3% de disfluências gagas: Ambrose NG, Yairi E. Normative disfluency data for early childhood stuttering. J Speech Lang Hear Res, 1999;42(4):895-909. Para comparação com dados brasileiros, ver o ABFW (Andrade CRF e cols., Pró-Fono, 2004), que não é reproduzido aqui.',
      nota: 'Roteiro próprio. A referência de 3% é um sinal para investigar melhor, não um diagnóstico: depende da idade, do tipo de amostra e de coletar mais de uma. Amostras curtas (menos de 100 palavras ou 200 sílabas) devem ser lidas com cautela. A autopercepção e os comportamentos associados completam a avaliação.',
    },
  },
  mof: {
    tipo: 'protocolo',
    id: 'mof',
    sigla: 'Motricidade orofacial',
    nome: 'Ficha de motricidade orofacial',
    instrucao: 'Marque, em cada item, adequado ou alterado. Deixe em branco o que não foi avaliado. Anote na observação o que explica a alteração.',
    areas: ['fono'],
    fonte: {
      original: 'Roteiro próprio de avaliação miofuncional orofacial, em redação própria, com a terminologia usual da motricidade orofacial. Para escores padronizados, use o protocolo AMIOFE (Felício CM, Ferreira CLP. Protocol of orofacial myofunctional evaluation with scores. Int J Pediatr Otorhinolaryngol, 2008;72(3):367-75), que não é reproduzido aqui.',
      nota: 'Registro estruturado, sem pontuação padronizada: a contagem de itens alterados serve para acompanhar a evolução, não para classificar. Observação da dentição e da oclusão não substitui a avaliação do cirurgião-dentista.',
    },
  },
}

export const PROTOCOLO_ORDEM: ProtocoloId[] = ['audiograma', 'voz', 'fluencia', 'mof']

export function isProtocoloId(v: unknown): v is ProtocoloId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PROTOCOLOS, v)
}

/** Fichas oferecidas para as áreas informadas, na ordem fixa. */
export function protocolosParaAreas(areas: readonly string[]): ProtocoloDef[] {
  return PROTOCOLO_ORDEM.map(id => PROTOCOLOS[id]).filter(def => def.areas.some(a => areas.includes(a)))
}

/** Pequenos auxiliares de normalização, compartilhados pelas fichas. */
export function inteiroEm(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
}

export function decimalEm(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return null
  return Math.round(v * 10) / 10
}

export function textoCurto(v: unknown, max = 400): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export function escolha<T extends string>(v: unknown, validos: readonly T[]): T | null {
  return typeof v === 'string' && (validos as readonly string[]).includes(v) ? (v as T) : null
}

export function selecao(v: unknown, validos: readonly string[]): string[] {
  if (!Array.isArray(v)) return []
  return validos.filter(id => v.includes(id))
}

export function mesmoConteudo(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** O pior tom entre vários (para o destaque de uma ficha com dois lados). */
export function piorTom(...tons: TomFaixa[]): TomFaixa {
  const ordem: TomFaixa[] = ['ok', 'info', 'wait', 'warn', 'bad']
  return tons.reduce((pior, t) => (ordem.indexOf(t) > ordem.indexOf(pior) ? t : pior), 'ok' as TomFaixa)
}
