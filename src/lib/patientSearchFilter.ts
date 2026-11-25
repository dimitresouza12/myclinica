// Filtro .or() do PostgREST para buscar paciente por nome, pet, telefone ou CPF.
// Telefone e CPF ficam salvos com máscara, então quem digita só os números
// não casava com "(85) 99999-8888": cada dígito vira um curinga entre eles.
export function patientSearchOr(raw: string, opts: { pet?: boolean } = {}): string {
  const safe = raw.replace(/[%,()*\\]/g, ' ').trim()
  const parts = [`name.ilike.%${safe}%`]
  if (opts.pet !== false) parts.push(`pet_name.ilike.%${safe}%`)
  parts.push(`phone.ilike.%${safe}%`, `cpf.ilike.%${safe}%`)
  const digits = safe.replace(/\D/g, '')
  if (digits.length >= 3) {
    const loose = `%${digits.split('').join('%')}%`
    parts.push(`phone.ilike.${loose}`, `cpf.ilike.${loose}`)
  }
  return parts.join(',')
}
