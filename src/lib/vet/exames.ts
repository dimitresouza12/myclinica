// Exames do pet: solicitação e registro do resultado (hemograma, bioquímico e outros em campos livres, com valor de
// referência opcional), com anexo (PDF ou foto do laudo) e impressão. Modelo de dados versionado (v:1) guardado em
// vet_exames (supabase/migrations/20261135_vet_internacao_exames.sql); a solicitação e o resultado ficam na mesma linha.
// Lógica pura, testada em exames.test.ts.
//
// Os valores de referência variam por espécie, idade e laboratório: o app NÃO traz tabela pronta, quem registra digita
// a referência que vem no laudo. Só quando ela vem como faixa ("5,5 - 8,5", "< 10") o app marca Alto ou Baixo.

import { assinaturaHtml, ESTILO_TD, ESTILO_TH } from '@/lib/medico/impresso'
import { cabecalhoPetHtml, esc, type CabecalhoPet, type ProfissionalImpresso } from './cabecalhoPet'
import { dataBr, isoValido } from './datas'

// ── Catálogo básico de solicitação ───────────────────────────────

export type GrupoExameVet = 'laboratorial' | 'imagem' | 'teste_rapido' | 'outros'

export const GRUPO_EXAME_ROTULO: Record<GrupoExameVet, string> = {
  laboratorial: 'Laboratoriais',
  imagem: 'Imagem e função',
  teste_rapido: 'Testes rápidos',
  outros: 'Outros',
}

export interface ExameCatalogoVet {
  id: string
  nome: string
  grupo: GrupoExameVet
  /** id de MODELOS_RESULTADO que preenche os campos do resultado */
  modelo?: string
}

export const CATALOGO_EXAMES_VET: readonly ExameCatalogoVet[] = [
  { id: 'hemograma', nome: 'Hemograma completo', grupo: 'laboratorial', modelo: 'hemograma' },
  { id: 'bioquimico-basico', nome: 'Perfil bioquímico básico (ALT, FA, ureia, creatinina, glicose)', grupo: 'laboratorial', modelo: 'bioquimico' },
  { id: 'alt', nome: 'ALT (TGP)', grupo: 'laboratorial' },
  { id: 'fa', nome: 'Fosfatase alcalina', grupo: 'laboratorial' },
  { id: 'ureia-creatinina', nome: 'Ureia e creatinina', grupo: 'laboratorial' },
  { id: 'glicemia', nome: 'Glicemia', grupo: 'laboratorial' },
  { id: 'proteinas-albumina', nome: 'Proteínas totais e albumina', grupo: 'laboratorial' },
  { id: 'urinalise', nome: 'Urinálise (EAS)', grupo: 'laboratorial' },
  { id: 'parasitologico', nome: 'Parasitológico de fezes', grupo: 'laboratorial' },
  { id: 'citologia', nome: 'Citologia', grupo: 'laboratorial' },
  { id: 'cultura-antibiograma', nome: 'Cultura e antibiograma', grupo: 'laboratorial' },
  { id: 'raspado-pele', nome: 'Raspado de pele', grupo: 'laboratorial' },
  { id: 'rx-torax', nome: 'Radiografia de tórax', grupo: 'imagem' },
  { id: 'rx-abdome', nome: 'Radiografia de abdome', grupo: 'imagem' },
  { id: 'rx-ortopedico', nome: 'Radiografia ortopédica', grupo: 'imagem' },
  { id: 'us-abdominal', nome: 'Ultrassonografia abdominal', grupo: 'imagem' },
  { id: 'ecocardiograma', nome: 'Ecocardiograma', grupo: 'imagem' },
  { id: 'eletrocardiograma', nome: 'Eletrocardiograma', grupo: 'imagem' },
  { id: 'pressao-arterial', nome: 'Aferição de pressão arterial', grupo: 'imagem' },
  { id: 'teste-parvo', nome: 'Teste rápido de parvovirose', grupo: 'teste_rapido' },
  { id: 'teste-cinomose', nome: 'Teste rápido de cinomose', grupo: 'teste_rapido' },
  { id: 'teste-fiv-felv', nome: 'Teste rápido de FIV e FeLV', grupo: 'teste_rapido' },
  { id: 'teste-leish', nome: 'Teste rápido de leishmaniose', grupo: 'teste_rapido' },
  { id: 'teste-ehrlichia', nome: 'Teste rápido de erliquiose e anaplasmose', grupo: 'teste_rapido' },
]

export function exameDoCatalogoVet(id: string): ExameCatalogoVet | undefined {
  return CATALOGO_EXAMES_VET.find(e => e.id === id)
}

export const CATEGORIA_LIVRE = 'Outros exames'

// ── Modelos de campos do resultado ───────────────────────────────

export interface ModeloResultado {
  id: string
  nome: string
  campos: { nome: string; unidade: string }[]
}

export const MODELOS_RESULTADO: readonly ModeloResultado[] = [
  {
    id: 'hemograma',
    nome: 'Hemograma',
    campos: [
      { nome: 'Hemácias', unidade: 'milhões/µL' },
      { nome: 'Hemoglobina', unidade: 'g/dL' },
      { nome: 'Hematócrito', unidade: '%' },
      { nome: 'VCM', unidade: 'fL' },
      { nome: 'CHCM', unidade: 'g/dL' },
      { nome: 'Leucócitos totais', unidade: '/µL' },
      { nome: 'Neutrófilos segmentados', unidade: '/µL' },
      { nome: 'Linfócitos', unidade: '/µL' },
      { nome: 'Monócitos', unidade: '/µL' },
      { nome: 'Eosinófilos', unidade: '/µL' },
      { nome: 'Plaquetas', unidade: '/µL' },
      { nome: 'Proteína plasmática total', unidade: 'g/dL' },
    ],
  },
  {
    id: 'bioquimico',
    nome: 'Bioquímico',
    campos: [
      { nome: 'ALT (TGP)', unidade: 'UI/L' },
      { nome: 'Fosfatase alcalina', unidade: 'UI/L' },
      { nome: 'Ureia', unidade: 'mg/dL' },
      { nome: 'Creatinina', unidade: 'mg/dL' },
      { nome: 'Glicose', unidade: 'mg/dL' },
      { nome: 'Proteínas totais', unidade: 'g/dL' },
      { nome: 'Albumina', unidade: 'g/dL' },
      { nome: 'GGT', unidade: 'UI/L' },
    ],
  },
]

export function modeloPorId(id: string | null | undefined): ModeloResultado | undefined {
  return MODELOS_RESULTADO.find(m => m.id === id)
}

// ── Tipos ────────────────────────────────────────────────────────

export type StatusExame = 'solicitado' | 'com_resultado'
export type Urgencia = 'rotina' | 'urgente'

export const URGENCIA_ROTULO: Record<Urgencia, string> = { rotina: 'Rotina', urgente: 'Urgente' }
export const STATUS_EXAME_ROTULO: Record<StatusExame, string> = { solicitado: 'Aguardando resultado', com_resultado: 'Com resultado' }

export interface ItemExameVet {
  /** id do catálogo; vazio no exame digitado à mão */
  id: string | null
  nome: string
  categoria: string
}

export interface CampoResultado {
  /** identificador local, só para a lista da tela */
  id: string
  nome: string
  valor: string
  unidade: string
  /** referência do laudo, texto livre ("5,5 - 8,5"); opcional */
  referencia: string
}

export interface AnexoExame {
  /** caminho no bucket `pacientes`: vet-exames/<clinic_id>/<patient_id>/<arquivo> */
  path: string
  nome: string
  tipo: string
  tamanho: number
}

export interface ResultadoExame {
  /** AAAA-MM-DD do resultado */
  data: string
  laboratorio: string
  campos: CampoResultado[]
  interpretacao: string
  anexos: AnexoExame[]
}

export interface ExameVetDados {
  v: 1
  urgencia: Urgencia
  itens: ItemExameVet[]
  indicacao: string
  observacoes: string
  profissional: ProfissionalImpresso | null
  resultado: ResultadoExame | null
}

/** Linha de vet_exames como a tela usa. */
export interface ExameVetLinha {
  id: string
  status: StatusExame
  /** AAAA-MM-DD da solicitação */
  data: string
  dados: unknown
  created_at: string
}

export const MAX_ITENS = 30
export const MAX_NOME_EXAME = 140
export const MAX_INDICACAO = 600
export const MAX_OBSERVACOES = 600
export const MAX_CAMPOS = 60
export const MAX_INTERPRETACAO = 2000
export const MAX_ANEXOS = 6
export const MAX_TAMANHO_ANEXO = 10 * 1024 * 1024

// ── Solicitação ──────────────────────────────────────────────────

export function exameVazio(): ExameVetDados {
  return { v: 1, urgencia: 'rotina', itens: [], indicacao: '', observacoes: '', profissional: null, resultado: null }
}

export function itemDoCatalogo(e: ExameCatalogoVet): ItemExameVet {
  return { id: e.id, nome: e.nome, categoria: GRUPO_EXAME_ROTULO[e.grupo] }
}

export function itemLivre(nome: string): ItemExameVet {
  return { id: null, nome: nome.trim().replace(/\s+/g, ' ').slice(0, MAX_NOME_EXAME), categoria: CATEGORIA_LIVRE }
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Marca ou desmarca um exame do catálogo. Respeita o limite de itens. */
export function alternarExame(itens: ItemExameVet[], e: ExameCatalogoVet): ItemExameVet[] {
  if (itens.some(i => i.id === e.id)) return itens.filter(i => i.id !== e.id)
  return itens.length >= MAX_ITENS ? itens : [...itens, itemDoCatalogo(e)]
}

/** Acrescenta um exame livre, sem repetir o mesmo nome (sem acento nem maiúscula). */
export function adicionarLivre(itens: ItemExameVet[], nome: string): ItemExameVet[] {
  const novo = itemLivre(nome)
  if (!novo.nome || itens.length >= MAX_ITENS || itens.some(i => semAcento(i.nome) === semAcento(novo.nome))) return itens
  return [...itens, novo]
}

export function validarSolicitacao(d: ExameVetDados): string[] {
  const erros: string[] = []
  if (d.itens.length === 0) erros.push('Escolha pelo menos um exame.')
  if (d.indicacao.length > MAX_INDICACAO) erros.push(`A indicação clínica passa de ${MAX_INDICACAO} caracteres.`)
  if (d.observacoes.length > MAX_OBSERVACOES) erros.push(`As observações passam de ${MAX_OBSERVACOES} caracteres.`)
  return erros
}

export function solicitacaoTemConteudo(d: ExameVetDados): boolean {
  return d.itens.length > 0 || d.indicacao.trim() !== '' || d.observacoes.trim() !== ''
}

/** "Hemograma completo, Glicemia e mais 2". */
export function resumoDoExame(d: ExameVetDados, max = 2): string {
  const nomes = d.itens.map(i => i.nome)
  if (nomes.length === 0) return 'Sem exames'
  if (nomes.length <= max) return nomes.join(', ')
  return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`
}

// ── Resultado ────────────────────────────────────────────────────

export function novoIdCampo(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function campoVazio(nome = '', unidade = '', id: string = novoIdCampo()): CampoResultado {
  return { id, nome, valor: '', unidade, referencia: '' }
}

/** Campos em branco de um modelo (hemograma, bioquímico). Modelo desconhecido: lista vazia. */
export function camposDoModelo(modeloId: string | null | undefined, novoId: () => string = novoIdCampo): CampoResultado[] {
  return (modeloPorId(modeloId)?.campos ?? []).map(c => campoVazio(c.nome, c.unidade, novoId()))
}

export function resultadoVazio(hoje: string): ResultadoExame {
  return { data: hoje, laboratorio: '', campos: [], interpretacao: '', anexos: [] }
}

/** Campos que a pessoa de fato preencheu (valor digitado): só eles entram no que é salvo e impresso. */
export function camposPreenchidos(campos: CampoResultado[]): CampoResultado[] {
  return campos.filter(c => c.valor.trim() !== '')
}

export function resultadoTemConteudo(r: ResultadoExame): boolean {
  return camposPreenchidos(r.campos).length > 0 || r.interpretacao.trim() !== '' || r.anexos.length > 0 || r.laboratorio.trim() !== ''
}

export function validarResultado(r: ResultadoExame, hoje: string): string[] {
  const erros: string[] = []
  if (!isoValido(r.data)) erros.push('Informe a data do resultado.')
  else if (r.data > hoje) erros.push('A data do resultado está no futuro.')
  const preenchidos = camposPreenchidos(r.campos)
  if (preenchidos.length === 0 && !r.interpretacao.trim() && r.anexos.length === 0) {
    erros.push('Registre pelo menos um valor, a interpretação ou anexe o laudo.')
  }
  if (preenchidos.some(c => !c.nome.trim())) erros.push('Todo valor digitado precisa do nome do exame ao lado.')
  if (r.campos.length > MAX_CAMPOS) erros.push(`O resultado passa de ${MAX_CAMPOS} campos.`)
  if (r.interpretacao.length > MAX_INTERPRETACAO) erros.push(`A interpretação passa de ${MAX_INTERPRETACAO} caracteres.`)
  if (r.anexos.length > MAX_ANEXOS) erros.push(`No máximo ${MAX_ANEXOS} anexos por exame.`)
  return erros
}

// ── Referência: Alto, Baixo ou dentro da faixa ───────────────────

/**
 * Número digitado no formato brasileiro ou simples: "5,5", "5.5", "12.500" (milhar), "12.500,5". Texto, vazio ou
 * "1.2.3" viram null. "1.500" é lido como mil e quinhentos (grupo de três dígitos depois do ponto).
 */
export function numeroDoLaudo(v: string | null | undefined): number | null {
  const s = (v ?? '').trim().replace(/\s/g, '')
  if (!s) return null
  let limpo: string
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) limpo = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d+(,\d+)?$/.test(s)) limpo = s.replace(',', '.')
  else if (/^\d+(\.\d+)?$/.test(s)) limpo = s
  else return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

export type SituacaoReferencia = 'baixo' | 'alto' | 'normal'

const NUM = '(\\d[\\d.,]*)'
const FAIXA = new RegExp(`^${NUM}\\s*(?:-|–|—|a|até)\\s*${NUM}$`, 'i')
const LIMITE = new RegExp(`^(<=|>=|≤|≥|<|>|até|menor que|maior que|acima de|abaixo de)\\s*${NUM}$`, 'i')

/**
 * Compara o valor com a referência digitada. Reconhece faixa ("5,5 - 8,5", "5,5 a 8,5") e limite ("< 10", ">= 3",
 * "até 10"). Qualquer outra coisa (referência em texto, valor não numérico): null, a tela não marca nada.
 */
export function avaliarReferencia(valor: string, referencia: string): SituacaoReferencia | null {
  const v = numeroDoLaudo(valor)
  const ref = referencia.trim()
  if (v === null || !ref) return null
  const faixa = FAIXA.exec(ref)
  if (faixa) {
    const min = numeroDoLaudo(faixa[1]), max = numeroDoLaudo(faixa[2])
    if (min === null || max === null || min > max) return null
    return v < min ? 'baixo' : v > max ? 'alto' : 'normal'
  }
  const lim = LIMITE.exec(ref)
  if (lim) {
    const n = numeroDoLaudo(lim[2])
    if (n === null) return null
    const op = lim[1].toLowerCase()
    if (['<', 'menor que', 'abaixo de'].includes(op)) return v >= n ? 'alto' : 'normal'
    if (['<=', '≤', 'até'].includes(op)) return v > n ? 'alto' : 'normal'
    if (['>', 'maior que', 'acima de'].includes(op)) return v <= n ? 'baixo' : 'normal'
    return v < n ? 'baixo' : 'normal' // >=, ≥
  }
  return null
}

export const SITUACAO_ROTULO: Record<SituacaoReferencia, string> = { baixo: 'Baixo', alto: 'Alto', normal: 'Na faixa' }

// ── Leitura do JSON gravado ──────────────────────────────────────

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function profissionalDe(v: unknown): ProfissionalImpresso | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const nome = texto(o.nome, 160)
  return nome ? { nome, registro: texto(o.registro, 60), rqe: texto(o.rqe, 40) } : null
}

/** Só caminhos da pasta vet-exames entram: o JSON não pode apontar para arquivo de outro lugar do bucket. */
export function caminhoDeAnexoValido(path: string): boolean {
  return /^vet-exames\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(path) && !path.includes('..')
}

function resultadoDe(v: unknown): ResultadoExame | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const campos: CampoResultado[] = []
  if (Array.isArray(o.campos)) {
    for (const c of o.campos) {
      if (!c || typeof c !== 'object') continue
      const r = c as Record<string, unknown>
      const nome = texto(r.nome, 80)
      const valor = texto(r.valor, 60)
      if (!nome && !valor) continue
      campos.push({ id: texto(r.id, 30) || novoIdCampo(), nome, valor, unidade: texto(r.unidade, 20), referencia: texto(r.referencia, 40) })
      if (campos.length >= MAX_CAMPOS) break
    }
  }
  const anexos: AnexoExame[] = []
  if (Array.isArray(o.anexos)) {
    for (const a of o.anexos) {
      if (!a || typeof a !== 'object') continue
      const r = a as Record<string, unknown>
      const path = typeof r.path === 'string' ? r.path : ''
      if (!caminhoDeAnexoValido(path)) continue
      const tamanho = typeof r.tamanho === 'number' && Number.isFinite(r.tamanho) && r.tamanho >= 0 ? r.tamanho : 0
      anexos.push({ path, nome: texto(r.nome, 120) || 'Anexo', tipo: texto(r.tipo, 60), tamanho })
      if (anexos.length >= MAX_ANEXOS) break
    }
  }
  const data = typeof o.data === 'string' && isoValido(o.data) ? o.data : ''
  return { data, laboratorio: texto(o.laboratorio, 120), campos, interpretacao: texto(o.interpretacao, MAX_INTERPRETACAO), anexos }
}

/** Lê o JSON gravado (de qualquer versão ou lixo) e devolve sempre um exame válido para a tela. */
export function normalizarExame(raw: unknown): ExameVetDados {
  const base = exameVazio()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const itens: ItemExameVet[] = []
  if (Array.isArray(o.itens)) {
    for (const it of o.itens) {
      if (!it || typeof it !== 'object') continue
      const r = it as Record<string, unknown>
      const id = typeof r.id === 'string' && r.id ? r.id : null
      const doCatalogo = id ? exameDoCatalogoVet(id) : undefined
      const nome = texto(r.nome, MAX_NOME_EXAME) || doCatalogo?.nome || ''
      if (!nome) continue
      itens.push({ id: doCatalogo ? id : null, nome, categoria: texto(r.categoria, 80) || (doCatalogo ? GRUPO_EXAME_ROTULO[doCatalogo.grupo] : CATEGORIA_LIVRE) })
      if (itens.length >= MAX_ITENS) break
    }
  }
  return {
    v: 1,
    urgencia: o.urgencia === 'urgente' ? 'urgente' : 'rotina',
    itens,
    indicacao: texto(o.indicacao, MAX_INDICACAO),
    observacoes: texto(o.observacoes, MAX_OBSERVACOES),
    profissional: profissionalDe(o.profissional),
    resultado: resultadoDe(o.resultado),
  }
}

/** Dados prontos para gravar: só os campos com valor, status coerente com a presença de resultado. */
export function prepararParaGravar(d: ExameVetDados): { status: StatusExame; dados: ExameVetDados } {
  const resultado = d.resultado && resultadoTemConteudo(d.resultado)
    ? { ...d.resultado, campos: camposPreenchidos(d.resultado.campos) }
    : null
  return { status: resultado ? 'com_resultado' : 'solicitado', dados: { ...d, resultado } }
}

// ── Anexos ───────────────────────────────────────────────────────

const EXTENSOES_ANEXO = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'] as const

export function extensaoDoArquivo(nome: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nome.trim())
  return m ? m[1].toLowerCase() : ''
}

/** Mensagem de erro para um arquivo que não pode ser anexado; null = pode. */
export function problemaDoArquivo(f: { name: string; size: number }): string | null {
  const ext = extensaoDoArquivo(f.name)
  if (!(EXTENSOES_ANEXO as readonly string[]).includes(ext)) return `${f.name}: use PDF ou foto (JPG, PNG, WEBP).`
  if (f.size <= 0) return `${f.name}: o arquivo está vazio.`
  if (f.size > MAX_TAMANHO_ANEXO) return `${f.name}: passa de 10 MB.`
  return null
}

/** Caminho do anexo no bucket `pacientes`: a 2ª pasta é a clínica, como pedem as policies do bucket. */
export function caminhoAnexoExame(args: { clinicId: string; patientId: string; nome: string; now?: number; rand?: string }): string {
  const rand = (args.rand ?? Math.random().toString(36).slice(2, 8)).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'x'
  const ext = extensaoDoArquivo(args.nome)
  const seguro = (EXTENSOES_ANEXO as readonly string[]).includes(ext) ? ext : 'pdf'
  return `vet-exames/${args.clinicId}/${args.patientId}/${args.now ?? Date.now()}-${rand}.${seguro}`
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

// ── Impressos ────────────────────────────────────────────────────

/** Itens agrupados por categoria, na ordem da primeira aparição (os exames livres vão por último). */
export function agruparPorCategoria(itens: ItemExameVet[]): { categoria: string; itens: ItemExameVet[] }[] {
  const grupos: { categoria: string; itens: ItemExameVet[] }[] = []
  for (const it of itens) {
    const g = grupos.find(x => x.categoria === it.categoria)
    if (g) g.itens.push(it)
    else grupos.push({ categoria: it.categoria, itens: [it] })
  }
  const livre = grupos.findIndex(g => g.categoria === CATEGORIA_LIVRE)
  if (livre >= 0 && livre !== grupos.length - 1) grupos.push(...grupos.splice(livre, 1))
  return grupos
}

/** HTML do impresso "SOLICITAÇÃO DE EXAMES" do pet. */
export function htmlSolicitacaoExames(c: CabecalhoPet, d: ExameVetDados): string {
  let n = 0
  const blocos = agruparPorCategoria(d.itens).map(g => `
    <div style="margin:14px 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#555;page-break-after:avoid">${esc(g.categoria)}</div>
    <table style="width:100%;border-collapse:collapse"><tbody>
      ${g.itens.map(i => `<tr style="page-break-inside:avoid"><td style="${ESTILO_TD};width:28px;color:#555">${++n}.</td><td style="${ESTILO_TD}">${esc(i.nome)}</td></tr>`).join('')}
    </tbody></table>`).join('')
  return `${cabecalhoPetHtml(c, 'SOLICITAÇÃO DE EXAMES', d.urgencia === 'urgente' ? 'URGENTE' : undefined)}
    ${d.indicacao.trim() ? `<div style="margin-bottom:6px;font-size:12.5px;white-space:pre-wrap"><strong>Indicação clínica:</strong> ${esc(d.indicacao)}</div>` : ''}
    <div style="margin:12px 0 0;font-size:13px;font-weight:700">Solicito os seguintes exames:</div>
    ${blocos}
    ${d.observacoes.trim() ? `<div style="margin-top:14px;font-size:12.5px;white-space:pre-wrap"><strong>Observações ao tutor:</strong> ${esc(d.observacoes)}</div>` : ''}
    ${assinaturaHtml(c.profissional)}`
}

/** HTML do impresso "RESULTADO DE EXAMES" do pet: valores com referência (Alto e Baixo escritos por extenso) e interpretação. */
export function htmlResultadoExames(c: CabecalhoPet, d: ExameVetDados, dataSolicitacao: string): string {
  const r = d.resultado
  if (!r) return `${cabecalhoPetHtml(c, 'RESULTADO DE EXAMES')}<div style="font-size:12.5px;color:#666">Sem resultado registrado.</div>`
  const campos = camposPreenchidos(r.campos)
  const temRef = campos.some(x => x.referencia.trim())
  const linhas = campos.map(x => {
    const s = avaliarReferencia(x.valor, x.referencia)
    const marca = s === 'alto' || s === 'baixo' ? `<strong> ${esc(SITUACAO_ROTULO[s])}</strong>` : ''
    return `<tr style="page-break-inside:avoid">
      <td style="${ESTILO_TD}">${esc(x.nome)}</td>
      <td style="${ESTILO_TD};white-space:nowrap"><strong>${esc(x.valor)}</strong>${x.unidade ? ` <span style="color:#555">${esc(x.unidade)}</span>` : ''}${marca}</td>
      ${temRef ? `<td style="${ESTILO_TD};color:#444">${esc(x.referencia)}</td>` : ''}
    </tr>`
  }).join('')
  const tabela = campos.length === 0 ? '' : `
    <table style="width:100%;border-collapse:collapse;margin-top:10px">
      <thead><tr><th style="${ESTILO_TH}">Exame</th><th style="${ESTILO_TH}">Resultado</th>${temRef ? `<th style="${ESTILO_TH}">Referência</th>` : ''}</tr></thead>
      <tbody>${linhas}</tbody>
    </table>`
  return `${cabecalhoPetHtml(c, 'RESULTADO DE EXAMES')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;margin-bottom:6px;font-size:12.5px">
      <div><span style="color:#555">Solicitado em:</span> <strong>${esc(dataBr(dataSolicitacao))}</strong></div>
      <div><span style="color:#555">Resultado em:</span> <strong>${esc(dataBr(r.data))}</strong></div>
      ${r.laboratorio ? `<div><span style="color:#555">Laboratório:</span> <strong>${esc(r.laboratorio)}</strong></div>` : ''}
    </div>
    ${d.itens.length ? `<div style="font-size:12px;color:#444;margin-top:6px"><strong>Exames:</strong> ${esc(d.itens.map(i => i.nome).join('; '))}</div>` : ''}
    ${tabela}
    ${temRef ? '<div style="font-size:10.5px;color:#777;margin-top:4px">Alto e Baixo aparecem quando a referência informada é uma faixa numérica.</div>' : ''}
    ${r.interpretacao.trim() ? `<div style="margin-top:14px;page-break-inside:avoid"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#555;margin-bottom:3px">Interpretação</div><div style="font-size:12.5px;white-space:pre-wrap;line-height:1.5">${esc(r.interpretacao)}</div></div>` : ''}
    ${r.anexos.length ? `<div style="margin-top:12px;font-size:11.5px;color:#444"><strong>Laudo anexado ao prontuário:</strong> ${esc(r.anexos.map(a => a.nome).join('; '))}</div>` : ''}
    ${assinaturaHtml(c.profissional)}`
}
