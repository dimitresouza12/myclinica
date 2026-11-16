'use client'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { compararPerio, fmtDelta, fmtNum, type PerioDados } from '@/lib/odonto/periograma'
import common from './odontoCommon.module.css'
import styles from './periograma.module.css'

export interface ExamePerio { id: string; data: string; rotulo: string; dados: PerioDados }

interface Props {
  exames: ExamePerio[]
  idA: string
  idB: string
  onA: (id: string) => void
  onB: (id: string) => void
}

/** Quanto mais baixo, melhor (profundidade, NIC, sangramento): a bolinha dá a leitura sem depender só da cor. */
function Variacao({ valor, texto }: { valor: number | null; texto: string }) {
  if (valor === null) return <>{'-'}</>
  const tom = Math.abs(valor) < 0.05 ? '' : valor < 0 ? common.tagOk : common.tagBad
  return <span className={`${common.tag} ${tom}`}>{texto}</span>
}

/** Compara dois exames salvos: índices gerais, sítios que mudaram 2 mm ou mais e variação por dente. */
export function PerioComparar({ exames, idA, idB, onA, onB }: Props) {
  if (exames.length < 2) {
    return (
      <section className={common.card}>
        <p className={common.empty}>A comparação precisa de dois exames salvos em datas diferentes. Salve o exame desta consulta e volte aqui depois do próximo.</p>
      </section>
    )
  }
  const a = exames.find(e => e.id === idA) ?? exames[1]
  const b = exames.find(e => e.id === idB) ?? exames[0]
  const opcoes = exames.map(e => ({ value: e.id, label: e.rotulo }))
  const c = compararPerio(a.dados, b.dados)
  const s = c.sitios

  return (
    <div className={common.wrap}>
      <section className={common.card} aria-label="Datas a comparar">
        <div className={styles.pickRow}>
          <div className={common.field}>
            <label htmlFor="perio-cmp-a">Exame anterior</label>
            <SelectMenu id="perio-cmp-a" variant="field" ariaLabel="Exame anterior" value={a.id} onChange={onA} options={opcoes} />
          </div>
          <div className={common.field}>
            <label htmlFor="perio-cmp-b">Exame mais recente</label>
            <SelectMenu id="perio-cmp-b" variant="field" ariaLabel="Exame mais recente" value={b.id} onChange={onB} options={opcoes} />
          </div>
        </div>
        {a.data > b.data && <p className={common.warn}>O exame escolhido como anterior é mais novo que o outro. A variação é sempre o segundo menos o primeiro; troque as datas para ler na ordem do tempo.</p>}
        {a.id === b.id && <p className={common.warn}>Escolha dois exames diferentes.</p>}
      </section>

      <section className={common.card} aria-label="Índices gerais">
        <h3 className={common.cardTitle}>Índices gerais</h3>
        <div className={common.tableScroll}>
          <table className={common.table}>
            <thead><tr><th>Índice</th><th className={common.num}>{a.rotulo}</th><th className={common.num}>{b.rotulo}</th><th className={common.num}>Variação</th></tr></thead>
            <tbody>
              <tr>
                <td>Sangramento à sondagem</td>
                <td className={common.num}>{c.a.pctSangramento === null ? '-' : `${fmtNum(c.a.pctSangramento)}%`}</td>
                <td className={common.num}>{c.b.pctSangramento === null ? '-' : `${fmtNum(c.b.pctSangramento)}%`}</td>
                <td className={common.num}><Variacao valor={c.delta.pctSangramento} texto={c.delta.pctSangramento === null ? '' : `${fmtDelta(c.delta.pctSangramento)} pontos`} /></td>
              </tr>
              <tr>
                <td>Profundidade média</td>
                <td className={common.num}>{c.a.psMedia === null ? '-' : `${fmtNum(c.a.psMedia)} mm`}</td>
                <td className={common.num}>{c.b.psMedia === null ? '-' : `${fmtNum(c.b.psMedia)} mm`}</td>
                <td className={common.num}><Variacao valor={c.delta.psMedia} texto={`${fmtDelta(c.delta.psMedia)} mm`} /></td>
              </tr>
              <tr>
                <td>NIC médio</td>
                <td className={common.num}>{c.a.nicMedia === null ? '-' : `${fmtNum(c.a.nicMedia)} mm`}</td>
                <td className={common.num}>{c.b.nicMedia === null ? '-' : `${fmtNum(c.b.nicMedia)} mm`}</td>
                <td className={common.num}><Variacao valor={c.delta.nicMedia} texto={`${fmtDelta(c.delta.nicMedia)} mm`} /></td>
              </tr>
              <tr>
                <td>Sítios com 4 mm ou mais</td>
                <td className={common.num}>{c.a.sitiosPs4}</td>
                <td className={common.num}>{c.b.sitiosPs4}</td>
                <td className={common.num}><Variacao valor={c.delta.sitiosPs4} texto={fmtDelta(c.delta.sitiosPs4, 0)} /></td>
              </tr>
              <tr>
                <td>Sítios com sangramento</td>
                <td className={common.num}>{c.a.sitiosSangrando}</td>
                <td className={common.num}>{c.b.sitiosSangrando}</td>
                <td className={common.num}><Variacao valor={c.delta.sitiosSangrando} texto={fmtDelta(c.delta.sitiosSangrando, 0)} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={styles.sentence}>
          Dos {s.comparados} sítios medidos nas duas datas, a profundidade melhorou em {s.psMelhorou} e piorou em {s.psPiorou}
          {' '}(mudança de 2 mm ou mais); o NIC melhorou em {s.nicMelhorou} e piorou em {s.nicPiorou}. O sangramento cessou em {s.sangramentoCessou} sítios e apareceu em {s.sangramentoNovo}.
          {c.perdidos.length > 0 && <> Dentes presentes no exame anterior e ausentes no mais recente: {c.perdidos.join(', ')}.</>}
        </p>
        <p className={common.hint}>Variação é o exame mais recente menos o anterior. Em profundidade, NIC e sangramento, número negativo é melhora. Mudanças menores que 2 mm ficam dentro do erro da sondagem.</p>
      </section>

      <section className={common.card} aria-label="Variação por dente">
        <h3 className={common.cardTitle}>Por dente</h3>
        {c.dentes.length === 0 ? (
          <p className={common.hint}>Nenhum dente com medida nas duas datas.</p>
        ) : (
          <div className={common.tableScroll}>
            <table className={common.table}>
              <thead><tr><th>Dente</th><th className={common.num}>Prof. média</th><th className={common.num}>Prof. máx.</th><th className={common.num}>NIC médio</th><th className={common.num}>Sangr.</th></tr></thead>
              <tbody>
                {c.dentes.map(d => (
                  <tr key={d.dente}>
                    <td><strong>{d.dente}</strong>{(d.ausenteA || d.ausenteB) && <span className={common.hint}> {d.ausenteB ? 'ausente agora' : 'ausente antes'}</span>}</td>
                    <td className={common.num}>{fmtNum(d.a.psMedia)} para {fmtNum(d.b.psMedia)} <Variacao valor={d.dPsMedia} texto={fmtDelta(d.dPsMedia)} /></td>
                    <td className={common.num}>{d.a.psMax ?? '-'} para {d.b.psMax ?? '-'}</td>
                    <td className={common.num}>{fmtNum(d.a.nicMedia)} para {fmtNum(d.b.nicMedia)} <Variacao valor={d.dNicMedia} texto={fmtDelta(d.dNicMedia)} /></td>
                    <td className={common.num}>{d.a.sangrando} para {d.b.sangrando}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
