// Quando o prontuário/paciente é recarregado (ex.: outra aba salvou), a Ficha não pode apagar o que a pessoa
// digitou e ainda não salvou. Cada campo só recebe o valor novo se ainda estiver igual ao último valor carregado
// (isto é, não foi editado); campo editado fica como está.

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function rehydrateValue<T>(base: T, next: T, current: T): T {
  return same(current, base) ? next : current
}

export function rehydrateMap(
  base: Record<string, string>,
  next: Record<string, string>,
  current: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  const keys = new Set([...Object.keys(base), ...Object.keys(next), ...Object.keys(current)])
  for (const k of keys) {
    const cur = k in current ? current[k] : undefined
    const old = k in base ? base[k] : undefined
    const value = cur === old ? (k in next ? next[k] : undefined) : cur
    if (value !== undefined) out[k] = value
  }
  return out
}
