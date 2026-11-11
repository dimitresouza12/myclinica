import type { PortalPageData } from '@/lib/portal/server'
import { hasScope } from '@/lib/portal/scopes'
import { fmtDateBr, fmtDateTimeBr, fmtKg } from '@/lib/portal/format'
import { SIGN_DOC_LABEL } from '@/lib/assinatura/texto'
import { SignBox } from './SignBox'
import styles from './portal.module.css'

const DUE_LABEL = { atrasada: 'Reforço atrasado', proxima: 'Reforço próximo', em_dia: 'Em dia' } as const
const KIND_LABEL: Record<string, string> = { vacina: 'Vacina', vermifugo: 'Vermífugo', antiparasitario_externo: 'Antipulgas e carrapatos' }

// Só o escopo liberado pelo link aparece; o servidor já nem consultou o resto (ver loadPortalPage).
export function PortalView({ data, token }: { data: PortalPageData; token: string }) {
  const sc = data.scopes
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <p className={styles.clinic}>{data.clinicName}</p>
          <h1 className={styles.title}>Olá{data.firstName ? `, ${data.firstName}` : ''}</h1>
          <p className={styles.muted}>Página pessoal. Link válido até {fmtDateBr(data.expiresAt)}.</p>
        </header>

        {hasScope(sc, 'orientacoes') && data.message && (
          <section className={styles.card} aria-labelledby="sec-orient">
            <h2 id="sec-orient" className={styles.h2}>Orientações da clínica</h2>
            <p className={styles.pre}>{data.message}</p>
          </section>
        )}

        {hasScope(sc, 'proximas_consultas') && data.appointments && (
          <section className={styles.card} aria-labelledby="sec-cons">
            <h2 id="sec-cons" className={styles.h2}>Próximas consultas</h2>
            {data.appointments.length === 0 ? (
              <p className={styles.muted}>Nenhuma consulta agendada no momento.</p>
            ) : (
              <ul className={styles.list}>
                {data.appointments.map((a, i) => (
                  <li key={i} className={styles.item}>
                    <strong>{fmtDateTimeBr(a.whenIso)}</strong>
                    <span className={styles.muted}>{[a.procedure, a.professional].filter(Boolean).join(' · ') || 'Consulta'}</span>
                    <span className={a.confirmed ? styles.tagOk : styles.tag}>{a.confirmed ? 'Confirmada' : 'Agendada'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {hasScope(sc, 'plano_alimentar') && (
          <section className={styles.card} aria-labelledby="sec-plano">
            <h2 id="sec-plano" className={styles.h2}>{data.plan?.title ?? 'Plano alimentar'}</h2>
            {!data.plan ? (
              <p className={styles.muted}>Seu plano alimentar ainda não foi publicado.</p>
            ) : (
              <>
                {data.plan.meals.filter(m => m.items.length > 0).map((m, i) => (
                  <details key={i} className={styles.meal} open={i === 0}>
                    <summary className={styles.mealHead}>{m.name}{m.time ? <span className={styles.muted}> · {m.time}</span> : null}</summary>
                    <ul className={styles.list}>
                      {m.items.map((it, j) => (
                        <li key={j} className={styles.itemRow}>
                          <span>{it.food}</span>
                          <span className={styles.muted}>{it.measure ? `${it.measure} (${it.grams} g)` : `${it.grams} g`}</span>
                        </li>
                      ))}
                    </ul>
                    {m.note && <p className={styles.note}>{m.note}</p>}
                  </details>
                ))}
                {data.plan.notes && <p className={styles.pre}>{data.plan.notes}</p>}
              </>
            )}
          </section>
        )}

        {hasScope(sc, 'vacinas_peso') && (
          <section className={styles.card} aria-labelledby="sec-vac">
            <h2 id="sec-vac" className={styles.h2}>{data.petName ? `Carteira de ${data.petName}` : 'Carteira de vacinas'}</h2>
            {!data.vaccines || data.vaccines.length === 0 ? (
              <p className={styles.muted}>Nenhum registro de vacina ou vermífugo ainda.</p>
            ) : (
              <ul className={styles.list}>
                {data.vaccines.map((v, i) => (
                  <li key={i} className={styles.item}>
                    <strong>{v.name}</strong>
                    <span className={styles.muted}>
                      {KIND_LABEL[v.kind] ?? 'Registro'} · aplicada em {fmtDateBr(v.appliedOn)}
                      {v.batch ? ` · lote ${v.batch}` : ''}{v.manufacturer ? ` · ${v.manufacturer}` : ''}
                    </span>
                    {v.nextDueOn && (
                      <span className={v.dueState === 'atrasada' ? styles.tagWarn : v.dueState === 'proxima' ? styles.tagNext : styles.tagOk}>
                        {v.dueState ? DUE_LABEL[v.dueState] : 'Próxima dose'}: {fmtDateBr(v.nextDueOn)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <h3 className={styles.h3}>Peso</h3>
            {!data.weights || data.weights.length === 0 ? (
              <p className={styles.muted}>Nenhuma pesagem registrada.</p>
            ) : (
              <ul className={styles.list}>
                {[...data.weights].reverse().map((w, i) => (
                  <li key={i} className={styles.itemRow}><span>{fmtDateBr(w.date)}</span><strong>{fmtKg(w.kg)}</strong></li>
                ))}
              </ul>
            )}
          </section>
        )}

        {hasScope(sc, 'assinatura') && data.documents && (
          <section className={styles.card} aria-labelledby="sec-sign">
            <h2 id="sec-sign" className={styles.h2}>Documentos para assinar</h2>
            {data.documents.length === 0 ? (
              <p className={styles.muted}>Nenhum documento pendente.</p>
            ) : (
              data.documents.map(d => (
                <article key={d.id} className={styles.doc}>
                  <h3 className={styles.h3}>{d.title} <span className={styles.muted}>({SIGN_DOC_LABEL[d.docType]})</span></h3>
                  {d.signedAt ? (
                    <p className={styles.tagOk}>Assinado em {fmtDateTimeBr(d.signedAt)}</p>
                  ) : (
                    <SignBox token={token} docId={d.id} text={d.contentText} />
                  )}
                </article>
              ))
            )}
            <p className={styles.legal}>
              Assinatura eletrônica simples (Lei 14.063/2020). Registramos data, hora, seu dispositivo e uma marca do seu endereço de rede.
              Não é assinatura com certificado digital ICP-Brasil.
            </p>
          </section>
        )}

        <footer className={styles.footer}>Esta página é pessoal. Não compartilhe o link com outras pessoas.</footer>
      </div>
    </main>
  )
}
