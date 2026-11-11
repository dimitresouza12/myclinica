import styles from './portal.module.css'

// Mesma tela para link inexistente, expirado ou revogado: não revela qual dos três é.
export default function PortalUnavailable() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card}>
          <h1 className={styles.title}>Link indisponível</h1>
          <p className={styles.text}>Este link não está mais disponível. Peça um novo link à clínica.</p>
        </section>
      </div>
    </main>
  )
}
