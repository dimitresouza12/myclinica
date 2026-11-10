import styles from './logotype.module.css'

/**
 * Logotipo completo "MyClínica": o "My" é o batimento do logo desenhado na escala do nome.
 * Mede-se tudo em milésimos do corpo da fonte (Nunito 700, pontas arredondadas como o traço do batimento): o batimento começa e termina no
 * meio da altura das letras (-272), o pico alto bate na altura do C (-697 a -757), o vale desce até a
 * profundidade da perna do y (160) e o traço tem a espessura das hastes (124). `textLength` fixa a largura
 * do nome, então o desenho não se desloca se a fonte demorar a carregar.
 */
export function Logotype({ className }: { className?: string }) {
  return (
    <svg
      className={`${styles.logotype} ${className ?? ''}`}
      viewBox="-70 -830 4584 1060"
      role="img"
      aria-label="MyClínica"
    >
      <path
        className={styles.beat}
        d="M0 -272H150L320 -697L530 160L730 -600L890 -272M1000 -484L1175 -20M1350 -484L1175 -20L1105 160"
      />
      <text className={styles.word} x="1431" y="0" textLength="3110" lengthAdjust="spacingAndGlyphs">Clínica</text>
    </svg>
  )
}
