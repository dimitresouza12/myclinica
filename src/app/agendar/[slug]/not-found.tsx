import styles from './agendar.module.css'

// Mesma tela para link inexistente, desligado ou de clínica inativa: não revela qual dos casos é.
export default function AgendarUnavailable() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card}>
          <h1 className={styles.title}>Agendamento online indisponível</h1>
          <p className={styles.text}>Este link não está disponível agora. Fale diretamente com a clínica para marcar seu horário.</p>
        </section>
      </div>
    </main>
  )
}
