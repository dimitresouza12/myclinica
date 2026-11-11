import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { rateLimit } from '@/lib/rateLimit'
import { clientIpFrom, hashToken, isWellFormedToken } from '@/lib/portal/token'
import { loadPortalPage, resolveLink, touchLink } from '@/lib/portal/server'
import { PortalView } from './PortalView'
import styles from './portal.module.css'

export const dynamic = 'force-dynamic'

export default async function PatientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ip = clientIpFrom(await headers())

  const byIp = rateLimit(`ppage:${ip}`, { limit: 40, windowMs: 60_000 })
  if (!byIp.success) return <Aviso titulo="Muitos acessos" texto="Aguarde um minuto e abra o link de novo." />
  // Limite por token e teto global da rota: valem mesmo que o IP seja rotacionado/forjado.
  if (isWellFormedToken(token) && !rateLimit(`ppage-t:${hashToken(token)}`, { limit: 60, windowMs: 60_000 }).success) {
    return <Aviso titulo="Muitos acessos" texto="Aguarde um minuto e abra o link de novo." />
  }
  if (!rateLimit('pglobal:ppage', { limit: 1200, windowMs: 60_000 }).success) {
    return <Aviso titulo="Muitos acessos" texto="Aguarde um minuto e abra o link de novo." />
  }

  const link = await resolveLink(token)
  if (!link) {
    const bad = rateLimit(`pfail:${ip}`, { limit: 10, windowMs: 10 * 60_000 })
    if (!bad.success) return <Aviso titulo="Muitas tentativas" texto="Aguarde alguns minutos antes de tentar de novo." />
    notFound()
  }
  const data = await loadPortalPage(link)
  if (!data) notFound()
  await touchLink(link)
  return <PortalView data={data} token={token} />
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
