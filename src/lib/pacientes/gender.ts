// Opções de gênero do paciente. Uma lista só para o cadastro (PatientFormModal) e a ficha (TabFicha):
// antes cada tela tinha a sua e o "Outro" do cadastro deixava o campo em branco na ficha.

export const GENDER_OPTIONS = ['Masculino', 'Feminino', 'Não binário', 'Prefiro não informar'] as const

/** Valor antigo gravado pelo cadastro antes da unificação. */
const LEGACY_GENDER = 'Outro'

/**
 * Opções do seletor para o valor atual: a lista padrão e, se o paciente já tem um valor fora dela
 * (ex.: "Outro", do cadastro antigo), esse valor também, para o campo não aparecer em branco.
 */
export function genderSelectOptions(current: string | null | undefined): { value: string; label: string }[] {
  const base = GENDER_OPTIONS.map(g => ({ value: g as string, label: g as string }))
  const cur = (current ?? '').trim()
  const extra = cur && !(GENDER_OPTIONS as readonly string[]).includes(cur) ? [{ value: cur, label: cur === LEGACY_GENDER ? 'Outro' : cur }] : []
  return [{ value: '', label: 'Selecionar' }, ...base, ...extra]
}
