import styles from './ChatEquipe.module.css'

/** Bolinha verde ao lado do nome: o colega está com o app aberto. Só se renderiza quando está online. */
export function PresenceDot() {
  return <span className={styles.presence} role="img" aria-label="Online" title="Online" />
}
