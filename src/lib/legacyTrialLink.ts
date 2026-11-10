// Links antigos do site e de anúncios ("Testar grátis") apontam para /login com parâmetros do teste grátis.
// Esses links agora pertencem a /experimentar: o middleware redireciona no servidor e o AuthFlow
// cobre a navegação client-side. A regra mora aqui para as duas pontas não divergirem.

type ParamsLike = { get(name: string): string | null }

/** Os parâmetros que identificam um link de teste grátis: ?quiz=true, ?mode=register ou ?plan=<algo>. */
export function hasLegacyTrialParams(params: ParamsLike): boolean {
  return params.get('quiz') === 'true' || params.get('mode') === 'register' || !!params.get('plan')
}

/** True quando a URL é /login (exato) com parâmetros de teste grátis. */
export function isLegacyTrialLogin(url: string | URL): boolean {
  let parsed: URL
  try {
    parsed = typeof url === 'string' ? new URL(url, 'http://localhost') : url
  } catch {
    return false
  }
  return parsed.pathname === '/login' && hasLegacyTrialParams(parsed.searchParams)
}
