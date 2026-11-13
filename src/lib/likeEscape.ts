/** Escapa %, _ e \ para uso literal dentro de um padrão ilike. Sem dependência de servidor: pode ir para o navegador. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, c => `\\${c}`)
}
