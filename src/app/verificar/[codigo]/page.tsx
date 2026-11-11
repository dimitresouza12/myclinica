import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { rateLimit } from '@/lib/rateLimit'
import { clientIpFrom } from '@/lib/portal/token'
import { lookupVerification } from '@/lib/portal/server'
import { fmtDateBr } from '@/lib/portal/format'
import styles from './verificar.module.css'

export const dynamic = 'force-dynamic'

// Confirma que o documento foi emitido pela clínica. Mostra só: clínica, tipo, data, profissional e hash curto.
// Nunca o paciente nem o conteúdo clínico. Código inexistente, malformado ou revogado seguem o mesmo caminho de erro.
export default async function VerifyPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const ip = clientIpFrom(await headers())

  const byIp = rateLimit(`pverify:${ip}`, { limit: 20, windowMs: 60_000 })
  if (!byIp.success) return <Aviso titulo="Muitas consultas" texto="Aguarde um minuto e tente de novo." />
  // Teto global da rota: vale mesmo que o IP seja rotacionado/forjado.
  if (!rateLimit('pglobal:pverify', { limit: 600, windowMs: 60_000 }).success) {
    return <Aviso titulo="Muitas consultas" texto="Aguarde um minuto e tente de novo." />
  }

  const view = await lookupVerification(safeDecode(codigo))
  if (!view) {
    const bad = rateLimit(`pfail:${ip}`, { limit: 10, windowMs: 10 * 60_000 })
    if (!bad.success) return <Aviso titulo="Muitas tentativas" texto="Aguarde alguns minutos antes de tentar de novo." />
    notFound()
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card}>
          <p className={view.valid ? styles.badgeOk : styles.badgeWarn}>{view.valid ? 'Documento autêntico' : 'Documento revogado'}</p>
          <h1 className={styles.title}>{view.typeLabel}</h1>
          <dl className={styles.dl}>
            <div><dt>Emitido por</dt><dd>{view.clinicName}</dd></div>
            <div><dt>Data de emissão</dt><dd>{fmtDateBr(view.issuedAt)}</dd></div>
            {view.professional && <div><dt>Profissional</dt><dd>{view.professional}</dd></div>}
            <div><dt>Hash do documento</dt><dd className={styles.mono}>{view.shortHash}</dd></div>
          </dl>
          <p className={styles.note}>
            {view.valid
              ? 'Compare o hash acima com o que está impresso no rodapé do documento. Esta página não mostra o conteúdo do documento.'
              : 'A clínica cancelou a validade deste documento. Não o aceite como válido.'}
          </p>
          <p className={styles.note}>Verificação de autenticidade do MyClinica. Não substitui assinatura digital ICP-Brasil.</p>
        </section>
      </div>
    </main>
  )
}

function safeDecode(v: string): string {
  try { return decodeURIComponent(v) } catch { return '' }
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card}>
          <h1 className={styles.title}>{titulo}</h1>
          <p className={styles.note}>{texto}</p>
        </section>
      </div>
    </main>
  )
}
