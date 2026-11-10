import { useSyncExternalStore } from 'react'

// Dados IMAGINÁRIOS da vitrine e da faixa "ao vivo" do login. A tela é pública e nunca toca o banco: cada
// carregamento da página (e cada volta completa da vitrine) sorteia um dia novo de clínica a partir de
// listas grandes de nomes e atendimentos, em vez de repetir sempre os mesmos cinco pacientes.

const FEMALE = [
  'Ana', 'Maria', 'Júlia', 'Fernanda', 'Camila', 'Beatriz', 'Mariana', 'Larissa', 'Patrícia', 'Luciana',
  'Aline', 'Juliana', 'Amanda', 'Letícia', 'Bruna', 'Gabriela', 'Carolina', 'Renata', 'Vanessa', 'Priscila',
  'Tatiane', 'Débora', 'Daniela', 'Natália', 'Raquel', 'Sandra', 'Cláudia', 'Simone', 'Eduarda', 'Isabela',
  'Rafaela', 'Bianca', 'Lívia', 'Sofia', 'Helena', 'Alice', 'Laura', 'Valentina', 'Manuela', 'Heloísa',
  'Cecília', 'Clara', 'Luana', 'Thaís', 'Jéssica', 'Monique', 'Viviane', 'Elaine', 'Marcela', 'Roberta',
  'Adriana', 'Kelly', 'Michele', 'Paula', 'Regina', 'Rosana', 'Silvia', 'Tereza', 'Denise', 'Elisa',
  'Lorena', 'Nathalia', 'Yasmin', 'Rebeca', 'Giovana', 'Marina', 'Lúcia', 'Cristina', 'Fabiana', 'Flávia',
  'Karina', 'Lais', 'Mônica', 'Sabrina', 'Talita', 'Vitória', 'Joana', 'Esther', 'Olívia', 'Antônia',
]
const MALE = [
  'Carlos', 'João', 'Pedro', 'Lucas', 'Rafael', 'Gabriel', 'Marcos', 'Felipe', 'Bruno', 'Rodrigo',
  'Thiago', 'Diego', 'Leonardo', 'Gustavo', 'Eduardo', 'Ricardo', 'Fernando', 'André', 'Paulo', 'Roberto',
  'Daniel', 'Mateus', 'Vinícius', 'Henrique', 'Matheus', 'Guilherme', 'Leandro', 'Fábio', 'Alexandre', 'Sérgio',
  'Marcelo', 'Renato', 'Caio', 'Murilo', 'Otávio', 'Samuel', 'Davi', 'Arthur', 'Miguel', 'Heitor',
  'Bernardo', 'Enzo', 'Nicolas', 'Gael', 'Theo', 'Benício', 'Lorenzo', 'Ítalo', 'Wagner', 'Jorge',
  'Márcio', 'Cláudio', 'Rogério', 'Adriano', 'Anderson', 'Alan', 'Douglas', 'Edson', 'Elias', 'Fabrício',
  'Hugo', 'Igor', 'Jean', 'Josué', 'Júlio', 'Kleber', 'Luan', 'Maurício', 'Nelson', 'Osvaldo',
  'Raul', 'Sidnei', 'Tiago', 'Wesley', 'Yuri', 'Antônio', 'Francisco', 'José', 'Luiz', 'Washington',
]
const SURNAMES = [
  'Souza', 'Lima', 'Prado', 'Nunes', 'Costa', 'Silva', 'Santos', 'Oliveira', 'Pereira', 'Rodrigues',
  'Almeida', 'Nascimento', 'Ferreira', 'Araújo', 'Ribeiro', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Barbosa',
  'Moreira', 'Cardoso', 'Teixeira', 'Correia', 'Mendes', 'Freitas', 'Barros', 'Pinto', 'Moura', 'Cavalcanti',
  'Dias', 'Castro', 'Campos', 'Cunha', 'Monteiro', 'Vieira', 'Melo', 'Azevedo', 'Fernandes', 'Lopes',
  'Machado', 'Duarte', 'Batista', 'Ramos', 'Reis', 'Andrade', 'Nogueira', 'Farias', 'Borges', 'Medeiros',
  'Siqueira', 'Miranda', 'Bezerra', 'Peixoto', 'Guimarães', 'Tavares', 'Coelho', 'Xavier', 'Furtado', 'Viana',
  'Amaral', 'Brandão', 'Franco', 'Leite', 'Matos', 'Pacheco', 'Rezende', 'Salgado', 'Toledo', 'Valente',
  'Albuquerque', 'Bastos', 'Cordeiro', 'Dantas', 'Esteves', 'Fontes', 'Garcia', 'Holanda', 'Macedo', 'Paiva',
  'Quintela', 'Rangel', 'Sampaio', 'Trindade', 'Uchoa', 'Vasconcelos', 'Zanetti', 'Assis', 'Braga', 'Camargo',
]

// [texto curto na agenda, como aparece numa mensagem ("sua ...")]
type Service = [string, string]
const SERVICES: Record<string, Service[]> = {
  estetica: [
    ['Limpeza de pele', 'sua limpeza de pele'], ['Peeling químico', 'seu peeling'], ['Drenagem linfática', 'sua drenagem linfática'],
    ['Massagem modeladora', 'sua massagem modeladora'], ['Design de sobrancelhas', 'seu design de sobrancelhas'],
    ['Microagulhamento', 'sua sessão de microagulhamento'], ['Hidratação facial', 'sua hidratação facial'],
    ['Avaliação estética', 'sua avaliação estética'], ['Depilação a laser', 'sua sessão de depilação a laser'],
  ],
  odonto: [
    ['Avaliação inicial', 'sua avaliação inicial'], ['Limpeza e profilaxia', 'sua limpeza'], ['Clareamento', 'seu clareamento'],
    ['Restauração', 'sua restauração'], ['Manutenção de aparelho', 'sua manutenção de aparelho'], ['Tratamento de canal', 'seu tratamento de canal'],
    ['Retorno, ortodontia', 'seu retorno na ortodontia'], ['Extração de siso', 'sua extração de siso'], ['Aplicação de flúor', 'sua aplicação de flúor'],
  ],
  fisio: [
    ['Sessão de fisioterapia', 'sua sessão de fisioterapia'], ['Pilates clínico', 'seu pilates clínico'], ['Avaliação postural', 'sua avaliação postural'],
    ['RPG', 'sua sessão de RPG'], ['Reabilitação de joelho', 'sua sessão de reabilitação'], ['Liberação miofascial', 'sua liberação miofascial'],
  ],
  fono: [
    ['Retorno, fonoaudiologia', 'seu retorno na fonoaudiologia'], ['Terapia de fala', 'sua terapia de fala'], ['Avaliação de linguagem', 'sua avaliação de linguagem'],
    ['Terapia da deglutição', 'sua terapia da deglutição'], ['Orientação a pais', 'sua orientação a pais'],
  ],
  psico: [
    ['Sessão de psicoterapia', 'sua sessão de psicoterapia'], ['Primeira consulta', 'sua primeira consulta'], ['Orientação de pais', 'sua orientação de pais'],
    ['Avaliação psicológica', 'sua avaliação psicológica'], ['Terapia de casal', 'sua sessão de terapia de casal'],
  ],
  nutri: [
    ['Consulta de nutrição', 'sua consulta de nutrição'], ['Retorno, plano alimentar', 'seu retorno do plano alimentar'], ['Bioimpedância', 'sua bioimpedância'],
    ['Avaliação nutricional', 'sua avaliação nutricional'], ['Acompanhamento esportivo', 'seu acompanhamento nutricional'],
  ],
  to: [
    ['Terapia ocupacional', 'sua sessão de terapia ocupacional'], ['Avaliação sensorial', 'sua avaliação sensorial'], ['Treino de coordenação', 'seu treino de coordenação'],
    ['Retorno, terapia ocupacional', 'seu retorno na terapia ocupacional'],
  ],
  medico: [
    ['Consulta clínica', 'sua consulta'], ['Retorno', 'seu retorno'], ['Check-up', 'seu check-up'], ['Avaliação cardiológica', 'sua avaliação cardiológica'],
    ['Consulta dermatológica', 'sua consulta dermatológica'], ['Revisão de exames', 'sua revisão de exames'],
  ],
  vet: [
    ['Consulta veterinária', 'a consulta do seu pet'], ['Vacinação', 'a vacinação do seu pet'], ['Retorno do pet', 'o retorno do seu pet'],
    ['Check-up do pet', 'o check-up do seu pet'], ['Limpeza de tártaro', 'a limpeza de tártaro do seu pet'],
  ],
}
const AREAS = Object.keys(SERVICES)

const REPLIES_NEUTRAL = ['Confirmo, até amanhã!', 'Pode confirmar, sim.', 'Confirmado! Até lá.', 'Combinado, estarei aí.', 'Tá confirmado, até amanhã!', 'Confirmo sim, obrigado pelo aviso.']
const REPLY_THANKS = { female: 'Confirmo, obrigada!', male: 'Confirmo, obrigado!' }

export const POOL_SIZES = { firstNames: FEMALE.length + MALE.length, surnames: SURNAMES.length, services: Object.values(SERVICES).flat().length }

// ── sorteio com semente (mesma semente, mesmo dia de clínica) ─────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rnd = () => number
const int = (r: Rnd, a: number, b: number) => a + Math.floor(r() * (b - a + 1))
const pick = <T,>(r: Rnd, list: readonly T[]): T => list[Math.floor(r() * list.length)]
const two = (n: number) => String(n).padStart(2, '0')
const hhmm = (min: number) => `${two(Math.floor(min / 60))}:${two(min % 60)}`

interface Person { first: string; last: string; name: string; female: boolean; initials: string }

function makePerson(r: Rnd, used: Set<string>): Person {
  for (let tries = 0; ; tries++) {
    const female = r() < 0.58
    const first = pick(r, female ? FEMALE : MALE)
    const last = pick(r, SURNAMES)
    const name = `${first} ${last}`
    if (used.has(first) && tries < 40) continue // primeiro nome diferente entre os pacientes do dia
    used.add(first)
    return { first, last, name, female, initials: `${first[0]}${last[0]}`.toUpperCase() }
  }
}

export type SlotStatus = 'ok' | 'wait' | 'swap' | 'new'
export interface ShowcaseDay {
  dateLabel: string
  monthLabel: string
  slots: { time: string; name: string; service: string; status: SlotStatus; female: boolean }[]
  wa: { name: string; first: string; female: boolean; initials: string; phrase: string; at: string; sentAt: string; replyAt: string; reply: string }
  money: {
    revenue: number; revenueDelta: number; visits: number; visitsDelta: number; noShow: number; noShowDrop: string
    pixAmount: string; pixName: string; series: number[]; monthTicks: string[]
  }
  events: [string, string][]
}

const CHART_X = [2, 40, 78, 116, 154, 192, 230, 268, 306, 344, 382, 418]

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function buildDay(seed: number, now: Date): ShowcaseDay {
  const r = mulberry32(seed)
  const used = new Set<string>()

  // agenda: cinco horários espalhados pelo dia (sem o almoço), o último é o que chegou sozinho pelo WhatsApp
  const windows: [number, number][] = [[8 * 60, 9 * 60 + 45], [10 * 60, 11 * 60 + 45], [13 * 60, 14 * 60 + 45], [15 * 60, 16 * 60 + 15], [16 * 60 + 30, 18 * 60]]
  const times = windows.map(([a, b]) => a + 15 * int(r, 0, Math.floor((b - a) / 15)))
  const areas = [pick(r, AREAS)]
  areas.push(pick(r, AREAS.filter(a => a !== areas[0])))
  const services = areas.flatMap(a => SERVICES[a])
  const chosen = new Set<number>()
  while (chosen.size < 5) chosen.add(int(r, 0, services.length - 1))
  const picked = [...chosen].map(i => services[i])
  const people = times.map(() => makePerson(r, used))
  const swapAt = int(r, 1, 2)
  const slots = times.map((t, i) => {
    const status: SlotStatus = i === 4 ? 'new' : i === swapAt ? 'swap' : r() < 0.65 ? 'ok' : 'wait'
    return { time: hhmm(t), name: people[i].name, service: picked[i][0], status, female: people[i].female }
  })
  // ao menos uma linha já confirmada além da que muda
  if (!slots.some(s => s.status === 'ok')) slots[swapAt === 1 ? 0 : 1].status = 'ok'

  // WhatsApp: a pessoa da linha que muda (assim agenda, conversa e faixa contam a mesma história)
  const p = people[swapAt]
  const sent = 17 * 60 + int(r, 0, 3 * 60)
  const wa = {
    name: p.name, first: p.first, female: p.female, initials: p.initials,
    phrase: picked[swapAt][1],
    at: `${Math.floor(times[swapAt] / 60)}h${two(times[swapAt] % 60)}`,
    sentAt: hhmm(sent), replyAt: hhmm(sent + int(r, 1, 7)),
    reply: r() < 0.4 ? REPLY_THANKS[p.female ? 'female' : 'male'] : pick(r, REPLIES_NEUTRAL),
  }

  // financeiro
  const ticket = 10 * int(r, 12, 42)
  const visits = int(r, 140, 520)
  const payer = pick(r, people)
  const startY = int(r, 78, 98)
  const endY = int(r, 16, 34)
  const series = CHART_X.map((_, i) => {
    if (i === CHART_X.length - 1) return endY
    const t = i / (CHART_X.length - 1)
    return Math.min(108, Math.max(14, Math.round(startY + (endY - startY) * Math.pow(t, 0.9) + (r() - 0.5) * 16)))
  })
  const ticks = [11, 9, 7, 5, 3, 0].map(back => {
    const m = (now.getMonth() - back + 120) % 12
    return MONTHS[m].slice(0, 3)
  })
  const money = {
    revenue: ticket * visits - ((ticket * visits) % 10),
    revenueDelta: int(r, 3, 24),
    visits,
    visitsDelta: int(r, 8, 64),
    noShow: int(r, 22, 88),
    noShowDrop: `caiu ${(int(r, 4, 40) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} pts`,
    pixAmount: `R$ ${(10 * int(r, 8, 69)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    pixName: payer.name,
    series,
    monthTicks: ticks,
  }

  // faixa "ao vivo" do celular: uma lista longa, que a faixa percorre sem repetir tão cedo
  const events: [string, string][] = []
  const evUsed = new Set<string>()
  for (let i = 0; i < 28; i++) {
    const q = makePerson(r, evUsed.size > 60 ? new Set() : evUsed)
    const clock = hhmm(8 * 60 + 5 * int(r, 0, 120))
    const kind = i % 6
    if (kind === 0) events.push([clock, `${q.first} confirmou pelo WhatsApp`])
    else if (kind === 1) events.push(['Pix', `R$ ${(10 * int(r, 8, 69)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} recebido de ${q.first}`])
    else if (kind === 2) events.push([clock, `${q.first} agendou ${q.female ? 'sozinha' : 'sozinho'}`])
    else if (kind === 3) events.push([clock, `Lembrete enviado para ${q.first}`])
    else if (kind === 4) events.push([clock, `${q.first} remarcou pelo WhatsApp`])
    else events.push(['Hoje', `${int(r, 6, 38)} confirmações automáticas`])
  }

  return {
    dateLabel: `Hoje, ${WEEKDAYS[now.getDay()]} ${now.getDate()}`,
    monthLabel: MONTHS[now.getMonth()][0].toUpperCase() + MONTHS[now.getMonth()].slice(1),
    slots, wa, money, events,
  }
}

// ── semente do navegador ──────────────────────────────────────────────────────
// Sorteada uma vez por carregamento da página. No servidor (e na hidratação) o valor é null: a faixa nasce vazia e
// preenche logo depois, para o HTML do servidor nunca divergir do que o navegador desenha.

interface ClientClock { seed: number; now: Date }
let clientClock: ClientClock | undefined
const getClientClock = (): ClientClock => (clientClock ??= { seed: (Math.random() * 2 ** 32) >>> 0 || 1, now: new Date() })
const subscribeNone = () => () => {}

export function useShowcaseClock(): ClientClock | null {
  return useSyncExternalStore(subscribeNone, getClientClock, () => null)
}
