'use client'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import btn from '@/components/ui/button.module.css'
import type { Termo } from '@/lib/termoAssinatura'
import styles from './TermoAceite.module.css'

interface Props {
  termo: Termo
  /** A pessoa rolou o termo até o fim (ou ele cabe sem rolar). */
  leuTudo: boolean
  onLeuTudo: (v: boolean) => void
  accepted: boolean
  onAccepted: (v: boolean) => void
  disabled?: boolean
  /** Mostra o erro "marque o aceite". */
  showError?: boolean
  /** Frase de autorização com os valores, acima do aceite. */
  autorizacao: string
}

/**
 * Aceite do termo: a caixa só libera depois que a pessoa abre o termo (modal), rola até o fim (margem de 4px)
 * e toca em "Li e aceito", que fecha o modal e marca a caixa.
 */
export function TermoAceite({ termo, leuTudo, onLeuTudo, accepted, onAccepted, disabled, showError, autorizacao }: Props) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const hintId = `${uid}-hint`

  const medir = useCallback(() => {
    const el = boxRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) onLeuTudo(true)
  }, [onLeuTudo])

  // texto novo (valores mudaram): exige ler e aceitar de novo
  const ultimoTexto = useRef(termo.texto)
  useEffect(() => {
    if (ultimoTexto.current === termo.texto) return
    ultimoTexto.current = termo.texto
    onLeuTudo(false)
    onAccepted(false)
  }, [termo.texto, onLeuTudo, onAccepted])

  // ao abrir (ou se a altura mudar), vê se já cabe sem rolar
  useEffect(() => {
    if (!open) return
    const el = boxRef.current
    if (!el) return
    medir()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => medir()) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [open, medir])

  function aceitar() {
    onAccepted(true)
    setOpen(false)
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.resumo}>{autorizacao}</p>

      <label className={`${styles.consent} ${!leuTudo ? styles.consentOff : ''}`}>
        <input
          id="tcf-consent"
          type="checkbox"
          checked={accepted}
          disabled={disabled || !leuTudo}
          onChange={e => onAccepted(e.target.checked)}
          aria-describedby={!leuTudo ? hintId : showError && !accepted ? 'tcf-consent-err' : undefined}
          aria-invalid={showError && !accepted ? true : undefined}
        />
        <span>
          Li e concordo com os{' '}
          <button id="tcf-termo" type="button" className={styles.link} onClick={e => { e.preventDefault(); setOpen(true) }} disabled={disabled}>
            {termo.titulo}
          </button>
        </span>
      </label>

      {!leuTudo && <p id={hintId} className={styles.hint}>Abra o termo e role até o fim para poder aceitar.</p>}
      {showError && !accepted && leuTudo && (
        <span id="tcf-consent-err" className={styles.error} role="alert">Marque o aceite para continuar.</span>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={termo.titulo}
        size="md"
        footer={(
          <div className={styles.foot}>
            {!leuTudo && <p className={styles.footHint}>Role até o fim para poder aceitar.</p>}
            <div className={styles.footBtns}>
              <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>Fechar</button>
              <button type="button" className={btn.primary} onClick={aceitar} disabled={!leuTudo}>Li e aceito</button>
            </div>
          </div>
        )}
      >
        <div ref={boxRef} className={styles.box} role="region" aria-label={termo.titulo} tabIndex={0} onScroll={medir}>
          {termo.secoes.map(s => (
            <section key={s.titulo} className={styles.section}>
              <h4 className={styles.sectionTitle}>{s.titulo}</h4>
              {s.paragrafos.map((p, i) => <p key={i} className={styles.par}>{p}</p>)}
            </section>
          ))}
        </div>
      </Modal>
    </div>
  )
}
