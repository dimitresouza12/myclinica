import { CARD_BRAND_LABELS, type CardBrand } from '@/lib/cartaoCheckout'
import styles from './CardPreview.module.css'

interface Props {
  brand: CardBrand | null
  /** Já mascarado por maskCardPreview: só os 4 últimos dígitos digitados aparecem. */
  maskedNumber: string
  holder: string
  expiry: string
}

const SANS = 'Arial, Helvetica, sans-serif'

/** Marcas desenhadas à mão (formas simples e próprias). Cada uma ocupa 28px de altura no cartão. */
function VisaMark() {
  return (
    <svg className={styles.logo} viewBox="0 0 64 28" width="64" height="28" focusable="false" aria-hidden="true">
      <text x="32" y="21" textAnchor="middle" fontFamily={SANS} fontSize="25" fontStyle="italic" fontWeight="900" letterSpacing="-0.5" fill="#ffffff">VISA</text>
      <path d="M10 25.5h44" stroke="#f7b600" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function MastercardMark() {
  return (
    <svg className={styles.logo} viewBox="0 0 60 40" width="42" height="28" focusable="false" aria-hidden="true">
      <circle cx="22" cy="20" r="14" fill="#eb001b" />
      <circle cx="38" cy="20" r="14" fill="#f79e1b" />
      {/* interseção dos dois círculos */}
      <path d="M30 8.511A14 14 0 0 1 30 31.489A14 14 0 0 1 30 8.511Z" fill="#ff5f00" />
    </svg>
  )
}

function EloMark() {
  return (
    <svg className={styles.logo} viewBox="0 0 64 40" width="45" height="28" focusable="false" aria-hidden="true">
      <text x="3" y="30" fontFamily={SANS} fontSize="26" fontWeight="800" letterSpacing="-1" fill="#ffffff">el</text>
      <g fill="none" strokeWidth="5.5">
        <path d="M43.07 26A8 8 0 0 1 50 14" stroke="#ffcb05" />
        <path d="M50 14A8 8 0 0 1 56.93 26" stroke="#00a4e0" />
        <path d="M56.93 26A8 8 0 0 1 43.07 26" stroke="#ef4123" />
      </g>
    </svg>
  )
}

function AmexMark() {
  return (
    <svg className={styles.logo} viewBox="0 0 48 32" width="42" height="28" focusable="false" aria-hidden="true">
      <rect x="1" y="1" width="46" height="30" rx="5" fill="#1f72cd" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.5" />
      <text x="24" y="20.5" textAnchor="middle" fontFamily={SANS} fontSize="11" fontWeight="800" letterSpacing="0.8" fill="#ffffff">AMEX</text>
    </svg>
  )
}

function HipercardMark() {
  return (
    <svg className={styles.logo} viewBox="0 0 96 28" width="96" height="28" focusable="false" aria-hidden="true">
      <rect x="0" y="1" width="96" height="26" rx="6" fill="#ffffff" />
      {/* textLength fixa o texto com ~8px de folga; o text-transform do .brand (caixa alta) não se aplica ao logo */}
      <text x="48" y="19" textAnchor="middle" fontFamily={SANS} fontSize="13" fontStyle="italic" fontWeight="800" textLength="78" lengthAdjust="spacingAndGlyphs" style={{ textTransform: 'none', letterSpacing: 0 }} fill="#b3131b">Hipercard</text>
    </svg>
  )
}

const BRAND_MARKS: Record<CardBrand, () => React.JSX.Element> = {
  visa: VisaMark,
  mastercard: MastercardMark,
  elo: EloMark,
  amex: AmexMark,
  hipercard: HipercardMark,
}

/**
 * Cartão desenhado ao vivo. É só visual (aria-hidden): os campos do formulário continuam sendo a fonte acessível.
 * Não recebe o número completo nem o CVV, então nada sensível fica neste componente.
 */
export function CardPreview({ brand, maskedNumber, holder, expiry }: Props) {
  const name = holder.trim().toUpperCase()
  const Mark = brand ? BRAND_MARKS[brand] : null
  return (
    <div className={styles.card} data-brand={brand ?? 'generic'} aria-hidden="true">
      <div className={styles.top}>
        <svg className={styles.chip} viewBox="0 0 36 28" width="36" height="28" focusable="false">
          <rect x="1" y="1" width="34" height="26" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M1 10h34M1 18h34M13 1v26M23 1v26" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
        {/* espaço reservado: o cartão não se mexe quando a bandeira é identificada */}
        <div className={styles.brandSlot}>
          {brand && (
            <span key={brand} className={styles.brand}>
              {Mark ? <Mark /> : CARD_BRAND_LABELS[brand]}
            </span>
          )}
        </div>
      </div>
      <div className={styles.number}>{maskedNumber}</div>
      <div className={styles.bottom}>
        <div className={styles.cell}>
          <span className={styles.caption}>Titular</span>
          <span className={styles.name}>{name || 'NOME NO CARTÃO'}</span>
        </div>
        <div className={`${styles.cell} ${styles.cellExpiry}`}>
          <span className={styles.caption}>Validade</span>
          <span className={styles.value}>{expiry || 'MM/AA'}</span>
        </div>
      </div>
    </div>
  )
}
