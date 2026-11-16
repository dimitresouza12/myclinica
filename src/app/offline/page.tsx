import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import styles from './offline.module.css'

export const metadata: Metadata = {
  title: 'Sem conexão | My Clinica',
  robots: { index: false, follow: false },
}

// Página mostrada pelo service worker (public/sw.js) quando uma navegação falha por falta de rede.
// Sem dados da clínica e sem JavaScript obrigatório: o botão é um link comum, então funciona mesmo
// que os scripts não estejam no cache.
export default function OfflinePage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true"><Icon name="alert" size={28} /></div>
        <h1 className={styles.title}>Sem conexão</h1>
        <p className={styles.desc}>
          Não foi possível acessar o MyClinica agora. Verifique sua internet e tente novamente.
        </p>
        <Link href="/dashboard" prefetch={false} className={styles.btn}>Tentar de novo</Link>
      </div>
    </main>
  )
}
