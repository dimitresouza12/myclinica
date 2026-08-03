export function formatDate(dateString: string | null | undefined, short = false): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (short) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    }).format(date)
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

/** Formata um mês no formato "YYYY-MM" (de um <input type="month">) como
 *  "agosto de 2026". new Date("2026-08-01") parseia como UTC meia-noite —
 *  em fuso horário atrás de UTC (ex: Brasil) isso "volta" um dia ao formatar
 *  em horário local, mostrando o mês errado. Construir com componentes
 *  locais evita o bug. */
export function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '-'
  let str = String(phone)
  if (str.includes('@')) str = str.split('@')[0]
  const digits = str.replace(/\D/g, '')
  if (digits.length >= 12 && digits.startsWith('55')) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9, 13)}`
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return digits || '-'
}

export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0)
}

export function formatCurrencyCompact(value: number | null | undefined): string {
  const v = value ?? 0
  const abs = Math.abs(v)
  // Valores pequenos cabem inteiros no card — só abrevia quando o formato
  // completo (ex: "R$ 3.320,00") normalmente estoura a largura do card mobile.
  if (abs < 1000) return formatCurrency(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace('.', ',')} mi`
  return `${sign}R$ ${(abs / 1_000).toFixed(1).replace('.', ',')} mil`
}

export function getStatusClass(status: string | null | undefined): string {
  if (!status) return 'status-pendente'
  const s = String(status).toLowerCase().trim()
  if (s.includes('agendado') || s.includes('confirmado')) return 'status-agendado'
  if (s.includes('concluído') || s.includes('concluido') || s.includes('finalizado')) return 'status-concluido'
  if (s.includes('cancelado') || s.includes('pausado')) return 'status-cancelado'
  return 'status-pendente'
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Normaliza telefone BR para um valor canônico único, para que todas as
// variações do mesmo número (com/sem DDI 55, com/sem sufixo WhatsApp, com/sem
// o "nono dígito" dos celulares) convirjam ao mesmo valor e o casamento
// lead↔paciente funcione. Celular antigo de 8 dígitos ganha o 9 (regra
// nacional desde 2016); fixo (começa com 2-5) não.
export function cleanPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = String(raw).trim()
  if (s.startsWith('=')) s = s.slice(1)
  if (s.includes('@')) s = s.split('@')[0]
  let d = s.replace(/\D/g, '')
  // Remove o DDI 55 quando sobra DDD + número plausível
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) d = d.slice(2)
  // DDD (2) + 8 dígitos: se for celular antigo (começa com 6-9), injeta o 9
  if (d.length === 10) {
    const ddd = d.slice(0, 2)
    const num = d.slice(2)
    if (/^[6-9]/.test(num)) d = ddd + '9' + num
  }
  return d
}
