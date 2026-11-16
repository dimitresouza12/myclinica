// Banco de receitas da clínica (Nutrição): tipos, validação, conversão de ingredientes e a cópia (snapshot) que o plano
// alimentar guarda quando uma receita é anexada a uma refeição. Funções puras; a gravação está em receitasStorage.ts.
// Tabela: public.nutri_receitas (supabase/migrations/20261134_nutri_substituicoes_receitas_diario.sql).

export const LIMITES_RECEITA = {
  titulo: 120,
  ingrediente: 160,
  ingredientes: 80,
  preparo: 8000,
  observacoes: 2000,
  porcoesMax: 200,
  tempoMaxMin: 1440,
} as const

export interface Ingrediente { texto: string }

/** Linha da tabela como o app a usa. */
export interface Receita {
  id: string
  titulo: string
  porcoes: number | null
  tempo_preparo_min: number | null
  ingredientes: Ingrediente[]
  modo_preparo: string
  observacoes: string | null
  created_at: string
}

/** O que o formulário grava (sem id nem datas). */
export interface DadosReceita {
  titulo: string
  porcoes: number | null
  tempo_preparo_min: number | null
  ingredientes: Ingrediente[]
  modo_preparo: string
  observacoes: string | null
}

/** Lê o jsonb do banco: só itens com texto, aparados e dentro do limite. Qualquer outra coisa vira lista vazia. */
export function normalizarIngredientes(raw: unknown): Ingrediente[] {
  if (!Array.isArray(raw)) return []
  const out: Ingrediente[] = []
  for (const x of raw) {
    const t = typeof x === 'string' ? x : x && typeof x === 'object' && typeof (x as { texto?: unknown }).texto === 'string' ? (x as { texto: string }).texto : ''
    const texto = t.trim().slice(0, LIMITES_RECEITA.ingrediente)
    if (texto) out.push({ texto })
    if (out.length >= LIMITES_RECEITA.ingredientes) break
  }
  return out
}

/** Caixa de texto (um ingrediente por linha) para a lista. Linhas vazias saem. */
export function ingredientesDeTexto(texto: string): Ingrediente[] {
  return normalizarIngredientes(texto.split(/\r?\n/))
}

export function ingredientesParaTexto(lista: Ingrediente[]): string {
  return lista.map(i => i.texto).join('\n')
}

export type ResultadoValidacao = { ok: true; dados: DadosReceita } | { ok: false; erro: string }

function inteiroOuNull(v: string | number | null | undefined, max: number): number | null | 'invalido' {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > max) return 'invalido'
  return n
}

/** Valida o que veio do formulário (tudo em texto) e devolve os dados prontos para gravar, ou a mensagem do erro. */
export function validarReceita(f: {
  titulo: string
  porcoes: string
  tempo: string
  ingredientes: string
  preparo: string
  observacoes: string
}): ResultadoValidacao {
  const titulo = f.titulo.trim()
  if (!titulo) return { ok: false, erro: 'Informe o nome da receita.' }
  if (titulo.length > LIMITES_RECEITA.titulo) return { ok: false, erro: `O nome pode ter até ${LIMITES_RECEITA.titulo} caracteres.` }
  const porcoes = inteiroOuNull(f.porcoes, LIMITES_RECEITA.porcoesMax)
  if (porcoes === 'invalido') return { ok: false, erro: `Porções: informe um número inteiro de 1 a ${LIMITES_RECEITA.porcoesMax}.` }
  const tempo = inteiroOuNull(f.tempo, LIMITES_RECEITA.tempoMaxMin)
  if (tempo === 'invalido') return { ok: false, erro: `Tempo de preparo: informe os minutos, de 1 a ${LIMITES_RECEITA.tempoMaxMin}.` }
  const linhas = f.ingredientes.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (linhas.length === 0) return { ok: false, erro: 'Informe ao menos um ingrediente.' }
  if (linhas.length > LIMITES_RECEITA.ingredientes) return { ok: false, erro: `Use no máximo ${LIMITES_RECEITA.ingredientes} ingredientes.` }
  if (linhas.some(l => l.length > LIMITES_RECEITA.ingrediente)) return { ok: false, erro: `Cada ingrediente pode ter até ${LIMITES_RECEITA.ingrediente} caracteres.` }
  const preparo = f.preparo.replace(/\r\n/g, '\n').trim()
  if (!preparo) return { ok: false, erro: 'Descreva o modo de preparo.' }
  if (preparo.length > LIMITES_RECEITA.preparo) return { ok: false, erro: `O modo de preparo pode ter até ${LIMITES_RECEITA.preparo} caracteres.` }
  const obs = f.observacoes.replace(/\r\n/g, '\n').trim()
  if (obs.length > LIMITES_RECEITA.observacoes) return { ok: false, erro: `As observações podem ter até ${LIMITES_RECEITA.observacoes} caracteres.` }
  return {
    ok: true,
    dados: { titulo, porcoes, tempo_preparo_min: tempo, ingredientes: linhas.map(texto => ({ texto })), modo_preparo: preparo, observacoes: obs || null },
  }
}

/** Linha do banco (com jsonb solto) para `Receita`. */
export function receitaDaLinha(l: Record<string, unknown>): Receita {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    id: String(l.id ?? ''),
    titulo: String(l.titulo ?? ''),
    porcoes: num(l.porcoes),
    tempo_preparo_min: num(l.tempo_preparo_min),
    ingredientes: normalizarIngredientes(l.ingredientes),
    modo_preparo: String(l.modo_preparo ?? ''),
    observacoes: typeof l.observacoes === 'string' && l.observacoes.trim() ? l.observacoes : null,
    created_at: String(l.created_at ?? ''),
  }
}

/** "45 min", "1 h", "1 h 30 min". */
export function formatarTempo(min: number | null | undefined): string {
  if (!min || min < 1) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

// ── Anexo no plano alimentar ─────────────────────────────────────────────────

/**
 * Cópia da receita guardada dentro da refeição do plano. Fica independente do banco de receitas: editar ou apagar a
 * receita depois não muda o que o paciente já recebeu. `id` só serve para marcar a origem na tela da nutricionista.
 */
export interface ReceitaAnexada {
  id: string
  titulo: string
  porcoes: number | null
  tempoMin: number | null
  ingredientes: string[]
  preparo: string
}

export function anexarReceita(r: Pick<Receita, 'id' | 'titulo' | 'porcoes' | 'tempo_preparo_min' | 'ingredientes' | 'modo_preparo'>): ReceitaAnexada {
  return {
    id: r.id, titulo: r.titulo, porcoes: r.porcoes, tempoMin: r.tempo_preparo_min,
    ingredientes: r.ingredientes.map(i => i.texto), preparo: r.modo_preparo,
  }
}

/** Lê o anexo salvo no plano (jsonb): devolve `undefined` se não houver anexo utilizável. */
export function normalizarAnexo(raw: unknown): ReceitaAnexada | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Partial<ReceitaAnexada>
  const titulo = typeof r.titulo === 'string' ? r.titulo.trim().slice(0, LIMITES_RECEITA.titulo) : ''
  if (!titulo) return undefined
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  return {
    id: typeof r.id === 'string' ? r.id : '',
    titulo,
    porcoes: num(r.porcoes),
    tempoMin: num(r.tempoMin),
    ingredientes: Array.isArray(r.ingredientes)
      ? r.ingredientes.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim().slice(0, LIMITES_RECEITA.ingrediente)).slice(0, LIMITES_RECEITA.ingredientes)
      : [],
    preparo: typeof r.preparo === 'string' ? r.preparo.slice(0, LIMITES_RECEITA.preparo) : '',
  }
}

/** Receitas por nome (pt-BR, sem diferenciar acento), para o seletor da refeição. */
export function receitasParaEscolha(lista: Receita[]): Receita[] {
  return [...lista].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

/** Filtro da lista por título ou ingrediente (sem acento, todas as palavras). */
export function filtrarReceitas(lista: Receita[], consulta: string): Receita[] {
  const sem = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const termos = sem(consulta).split(/\s+/).filter(Boolean)
  if (termos.length === 0) return lista
  return lista.filter(r => {
    const alvo = sem(`${r.titulo} ${r.ingredientes.map(i => i.texto).join(' ')}`)
    return termos.every(t => alvo.includes(t))
  })
}
