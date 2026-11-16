import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { rateLimit } from '@/lib/rateLimit'
import { clientIpFrom } from '@/lib/portal/token'
import { isValidSlug } from '@/lib/agendamentoOnline/slug'
import { loadPublicContext } from '@/lib/agendamentoOnline/server'
import { AgendarView } from './AgendarView'
import styles from './agendar.module.css'

export const dynamic = 'force-dynamic'

export default async function AgendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ip = clientIpFrom(await headers())

  if (!rateLimit(`agpage:${ip}`, { limit: 40, windowMs: 60_000 }).success) return <Aviso titulo="Muitos acessos" texto="Aguarde um minuto e abra o link de novo." />
  if (!rateLimit('agglobal:page', { limit: 1500, windowMs: 60_000 }).success) return <Aviso titulo="Muitos acessos" texto="Aguarde um minuto e abra o link de novo." />
  if (!isValidSlug(slug)) notFound()
  if (!rateLimit(`agpage-s:${slug}`, { limit: 200, windowMs: 60_000 }).success) return <Aviso titulo="Muitos acessos" texto="Aguarde um minuto e abra o link de novo." />

  const r = await loadPublicContext(slug)
  if (!r.ok) return <Aviso titulo="Não foi possível carregar" texto="Tente de novo em instantes." />
  if (!r.context || r.context.professionals.length === 0) {
    // endereços que não existem contam num balde próprio, mais apertado (contra varredura de slugs)
    if (!rateLimit(`agfail:${ip}`, { limit: 20, windowMs: 10 * 60_000 }).success) return <Aviso titulo="Muitas tentativas" texto="Aguarde alguns minutos antes de tentar de novo." />
    notFound()
  }
  return <AgendarView slug={slug} context={r.context} />
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card}>
          <h1 className={styles.title}>{titulo}</h1>
          <p className={styles.text}>{texto}</p>
        </section>
      </div>
    </main>
  )
}
