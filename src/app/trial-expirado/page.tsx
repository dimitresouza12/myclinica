'use client'
import styles from './trial-expirado.module.css'

export default function TrialExpiradoPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>⏰</div>
        <h1 className={styles.title}>Seu período de teste encerrou</h1>
        <p className={styles.desc}>
          Os 7 dias gratuitos do MyClinica chegaram ao fim.<br />
          Para continuar acessando o painel e todos os seus dados, entre em contato com a nossa equipe.
        </p>
        <a
          href="https://wa.me/5588988557247?text=Olá!%20Quero%20continuar%20usando%20o%20MyClinica."
          target="_blank"
          rel="noopener noreferrer"
          className={styles.btnContact}
        >
          Entrar em contato
        </a>
        <a href="/login" className={styles.linkBack}>Voltar ao login</a>
      </div>
    </div>
  )
}
