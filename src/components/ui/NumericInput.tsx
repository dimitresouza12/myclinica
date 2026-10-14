'use client'
import { useCallback, useLayoutEffect, useRef, useState, type FocusEvent, type InputHTMLAttributes } from 'react'
import { caretAfterDigits } from '@/lib/phoneFormat'
import {
  CPF_PLACEHOLDER, DATE_PLACEHOLDER, clampInteger, decimalToMoney, decimalToPercent, maskCpf, maskDateBR, maskDecimal,
  maskInteger, maskMoney, moneyToDecimal, percentToDecimal,
} from '@/lib/numericFormat'

// Campos que só aceitam número. Todos: o que não é dígito é descartado na digitação e o teclado do celular
// é o numérico (inputMode). Texto, não type="number": o type="number" aceita "e", "+", "-" e rola com o mouse.
//
// Sem maxLength de propósito: o navegador conta os caracteres COLADOS (com pontuação, espaço, letras), então cortaria
// "123.456.789-09" ou "31 / 12 / 1990" antes de a máscara agir. Quem limita a quantidade de dígitos é a máscara.

type Base = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode' | 'min' | 'max'>

/** Reposiciona o cursor depois de a máscara reescrever o texto (senão ele pula para o fim ao editar no meio). */
function useCaret() {
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current)
    }
    caret.current = null
  })
  const setCaret = useCallback((pos: number) => { caret.current = pos }, [])
  return { ref, setCaret }
}

/** CPF: só os 11 números, mostrados como 000.000.000-00. */
export function CpfInput({ value, onChange, placeholder = CPF_PLACEHOLDER, ...rest }: Base & { value: string; onChange: (masked: string) => void }) {
  const { ref, setCaret } = useCaret()
  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={maskCpf(value)}
      onChange={e => {
        const el = e.target
        const before = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, '').length
        const masked = maskCpf(el.value)
        setCaret(caretAfterDigits(masked, before))
        onChange(masked)
      }}
    />
  )
}

/**
 * Número inteiro (minutos, quantidade, dia do mês…). Só dígitos; com `max`, o dígito que estoura é descartado;
 * ao sair do campo, abaixo de `min` sobe para `min`. Devolve texto ('' quando vazio).
 */
export function IntegerInput({ value, onChange, min, max, onBlur, ...rest }: Base & {
  value: string | number | null | undefined
  onChange: (value: string) => void
  min?: number
  max?: number
}) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={maskInteger(value, { max })}
      onChange={e => onChange(maskInteger(e.target.value, { max }))}
      onBlur={(e: FocusEvent<HTMLInputElement>) => {
        const current = maskInteger(e.target.value, { max })
        const clamped = clampInteger(current, { min, max })
        if (clamped !== current) onChange(clamped)
        onBlur?.(e)
      }}
    />
  )
}

/**
 * Valor em reais só com números: cada dígito entra pela direita (1, 8, 0, 0, 0, 0 mostra "1.800,00").
 * O valor que sobe é o texto com ponto decimal ("1800.00"), ou '' quando vazio.
 */
export function MoneyInput({ value, onChange, placeholder = '0,00', ...rest }: Base & {
  value: string | number | null | undefined
  onChange: (decimal: string) => void
}) {
  const { ref, setCaret } = useCaret()
  const shown = decimalToMoney(value)
  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={shown}
      onChange={e => {
        const raw = e.target.value
        const onlyZeros = raw.replace(/\D/g, '').replace(/0/g, '') === ''
        // apagar com tudo em zero ("0,00") limpa o campo; senão ele nunca ficaria vazio
        const masked = raw.length < shown.length && onlyZeros ? '' : maskMoney(raw)
        setCaret(masked.length)
        onChange(moneyToDecimal(masked))
      }}
    />
  )
}

/**
 * Número decimal (percentual, peso…): dígitos e uma vírgula, com `decimals` casas e valor máximo `max`.
 * O teclado é o decimal porque precisa da vírgula (os únicos campos que o exigem). O valor que sobe é texto
 * com ponto decimal ("37.5"), ou '' quando vazio.
 */
export function DecimalInput({ value, onChange, max, decimals = 1, placeholder = '0', ...rest }: Base & {
  value: string | number | null | undefined
  onChange: (decimal: string) => void
  max: number
  decimals?: number
}) {
  const propDecimal = value === null || value === undefined ? '' : String(value)
  // o texto digitado ("37,") tem mais detalhe que o valor que sobe ("37"): guardamos o texto e só o refazemos
  // quando o valor muda por fora (ex.: o formulário foi reiniciado)
  const [text, setText] = useState(() => decimalToPercent(propDecimal))
  if (propDecimal !== percentToDecimal(text)) setText(decimalToPercent(propDecimal))

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={text}
      onChange={e => {
        const masked = maskDecimal(e.target.value, { max, decimals })
        setText(masked)
        onChange(percentToDecimal(masked))
      }}
    />
  )
}

/** Percentual de 0 a 100, uma casa decimal. */
export function PercentInput(props: Omit<Parameters<typeof DecimalInput>[0], 'max' | 'decimals'> & { max?: number }) {
  return <DecimalInput {...props} max={props.max ?? 100} decimals={1} />
}

/** Data DD/MM/AAAA só com números: as barras entram sozinhas e dia/mês/ano impossíveis são descartados. */
export function DateInput({ value, onChange, placeholder = DATE_PLACEHOLDER, ...rest }: Base & { value: string; onChange: (masked: string) => void }) {
  const { ref, setCaret } = useCaret()
  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      placeholder={placeholder}
      value={maskDateBR(value)}
      onChange={e => {
        const el = e.target
        const before = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, '').length
        const masked = maskDateBR(el.value)
        setCaret(caretAfterDigits(masked, before))
        onChange(masked)
      }}
    />
  )
}
