import styles from './verificar.module.css'

export default function VerifyNotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card}>
          <p className={styles.badgeWarn}>Código não encontrado</p>
          <h1 className={styles.title}>Não foi possível confirmar</h1>
          <p className={styles.note}>Confira o código impresso no documento. Se o problema continuar, não considere o documento válido e fale com a clínica.</p>
        </section>
      </div>
    </main>
  )
}
