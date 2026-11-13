'use client'
import { PageHeader } from '@/components/ui/PageHeader'
import { MinhaConta } from '@/components/conta/MinhaConta'
import styles from './minhaConta.module.css'

// Sem PermissionGuard de propósito: todo login pode trocar a própria senha.
// A sessão já é exigida pelo middleware e pelo layout (app).
export default function MinhaContaPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Minha conta" />
      <MinhaConta />
    </div>
  )
}
