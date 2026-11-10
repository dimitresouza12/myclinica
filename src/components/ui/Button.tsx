import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from 'react'
import { Icon, type IconName } from './Icon'
import { Spinner } from './Spinner'
import btn from './button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = ação principal (teal, uma por tela); secondary = branco com borda; danger = confirmar exclusão; ghost = texto; icon = quadrado só com ícone (exige aria-label) */
  variant?: ButtonVariant
  /** ícone antes do texto (ou o único conteúdo, na variante icon) */
  icon?: IconName
  /** mostra spinner e ignora cliques, sem trocar o visual por cinza de desabilitado */
  loading?: boolean
  /** ocupa a largura toda do contêiner */
  fullWidth?: boolean
}

/**
 * Botão padrão do MyClinica: pílula de 40px (44px no mobile), teal #4DD9C0 com texto escuro no primário.
 * Usa button.module.css; telas antigas que importam esse CSS direto continuam iguais.
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', icon, loading = false, fullWidth = false, className, children, type = 'button', onClick, disabled, ...rest },
  ref,
) {
  const cls = [btn[variant], fullWidth ? btn.block : '', loading ? btn.busy : '', className].filter(Boolean).join(' ')
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (loading) { e.preventDefault(); return }
    onClick?.(e)
  }
  return (
    <button {...rest} ref={ref} type={type} className={cls} disabled={disabled} aria-busy={loading || undefined} onClick={handleClick}>
      {loading ? <Spinner size={16} decorative /> : icon ? <Icon name={icon} size={variant === 'icon' ? 18 : 16} aria-hidden="true" /> : null}
      {children}
    </button>
  )
})
