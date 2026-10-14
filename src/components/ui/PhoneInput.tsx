'use client'
import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react'
import { PHONE_PLACEHOLDER, caretAfterDigits, maskBrPhone } from '@/lib/phoneFormat'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** o que está no campo; sempre devolvido já no formato (85) 99999-8888 */
  value: string
  onChange: (masked: string) => void
}

/**
 * Campo de telefone brasileiro. O teclado do celular é o numérico (só 0-9): os parênteses, o espaço e o hífen
 * a máscara coloca sozinha. Mantém type="tel" para o navegador reconhecer o campo como telefone. Só aceita o formato "(85) 99999-8888" (celular) ou "(85) 3222-1111" (fixo):
 * dígitos impossíveis são descartados na hora, e colar "+55 85 99999-8888" vira o formato. O valor que sobe
 * para a tela já está formatado; para saber se está completo, use isCompleteBrPhone / phoneInputError.
 */
export function PhoneInput({ value, onChange, placeholder = PHONE_PLACEHOLDER, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)

  // reposiciona o cursor depois de a máscara reescrever o texto (senão ele pula para o fim ao editar no meio)
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current)
    }
    caret.current = null
  })

  return (
    <input
      {...rest}
      ref={ref}
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      placeholder={placeholder}
      value={maskBrPhone(value)}
      onChange={e => {
        const el = e.target
        const before = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, '').length
        const masked = maskBrPhone(el.value)
        caret.current = caretAfterDigits(masked, before)
        onChange(masked)
      }}
    />
  )
}
