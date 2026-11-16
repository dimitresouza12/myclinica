'use client'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { quadrantName, toothPositionName } from '@/lib/odontograma'
import { faceLabel } from '@/lib/odontogramaGeometry'
import {
  FURCA_MAX, MOBILIDADE_MAX, PERIO_INFERIOR, PERIO_SUPERIOR, PS_MAX, REC_MAX, campoCompleto, comDente, comMarcaNoSitio, comValorNoSitio,
  indiceDoSitio, lerMm, nic, ordemNaTela, rotuloSitio, temFurca, type FacePerio, type PerioDados, type PerioDente,
} from '@/lib/odonto/periograma'
import styles from './periograma.module.css'

interface Props {
  dados: PerioDados
  onChange: (d: PerioDados) => void
}

const tomPs = (ps: number | null) => (ps === null ? undefined : ps >= 6 ? 'bad' : ps >= 4 ? 'warn' : undefined)

/**
 * Ficha de sondagem dos 32 dentes. Cada arcada é uma tabela com a coluna de rótulos fixa e rolagem horizontal só dentro do
 * contêiner. Digitar a profundidade ou a recessão pula sozinho para o sítio ao lado quando o número já fechou (ex.: um 3);
 * Enter também avança. Sangramento e supuração são botões liga/desliga; o dente ausente se marca pelo número.
 */
export function PerioGrade({ dados, onChange }: Props) {
  const raiz = useRef<HTMLDivElement>(null)

  const mexe = (n: number, fn: (t: PerioDente) => PerioDente) => onChange(comDente(dados, n, fn))

  /** Foca o próximo campo da mesma linha (a ordem do DOM é a da tela, da esquerda para a direita). */
  function avancar(el: HTMLInputElement) {
    const nav = el.dataset.nav
    if (!nav || !raiz.current) return
    const campos = Array.from(raiz.current.querySelectorAll<HTMLInputElement>(`input[data-nav="${nav}"]:not(:disabled)`))
    const i = campos.indexOf(el)
    campos[i + 1]?.focus()
  }

  function cicla(atual: number | null, max: number): number | null {
    return atual === null ? 0 : atual >= max ? null : atual + 1
  }

  function renderArcada(titulo: string, dentes: number[], superior: boolean) {
    const nomeL = faceLabel(superior ? 11 : 41, 'l')
    // em cima a face vestibular vem primeiro; embaixo, a lingual (espelho da boca)
    const faces: FacePerio[] = superior ? ['v', 'l'] : ['l', 'v']
    const totalCols = 1 + dentes.length * 3
    const t = (n: number) => dados.dentes[n]

    // uma linha: um rótulo fixo + 3 células por dente, na ordem da tela
    const linha = (chave: string, rotulo: string, celula: (n: number, i: number, ausente: boolean) => ReactNode, altura?: 'baixa') => (
      <tr key={chave}>
        <th scope="row" className={styles.rowLabel}>{rotulo}</th>
        {dentes.map(n => ordemNaTela(n).map(s => {
          const ausente = !!t(n)?.ausente
          const i = indiceDoSitio(s)
          return (
            <td key={`${n}-${s}`} className={`${styles.site} ${ausente ? styles.siteAbs : ''}`} style={altura ? { height: 32 } : undefined}>
              {celula(n, i, ausente)}
            </td>
          )
        }))}
      </tr>
    )

    return (
      <section className={styles.arcada} aria-label={titulo}>
        <h3 className={styles.arcadaTitle}>{titulo}</h3>
        <div className={styles.scroller} tabIndex={0} role="region" aria-label={`${titulo}: ficha de sondagem, role para os lados`}>
          <table className={styles.sheet}>
            <tbody>
              <tr>
                <th scope="row" className={styles.rowLabel}>Dente</th>
                {dentes.map(n => {
                  const aus = !!t(n)?.ausente
                  const nome = `${toothPositionName(n)} ${quadrantName(n).toLowerCase()}`
                  return (
                    <th key={n} colSpan={3} scope="col" className={styles.toothHead}>
                      <button
                        type="button"
                        className={`${styles.toothBtn} ${aus ? styles.toothAbs : ''}`}
                        aria-pressed={aus}
                        aria-label={`Dente ${n}, ${nome}: ${aus ? 'ausente. Toque para marcar como presente' : 'presente. Toque para marcar como ausente'}`}
                        onClick={() => mexe(n, d => ({ ...d, ausente: !d.ausente }))}
                      >
                        <span className={styles.toothNum}>{n}</span>
                        <span className={styles.toothSub}>{aus ? 'ausente' : toothPositionName(n)}</span>
                      </button>
                    </th>
                  )
                })}
              </tr>
              <tr>
                <th scope="row" className={styles.rowLabel}>Mobilidade</th>
                {dentes.map(n => {
                  const d = t(n)
                  const v = d?.mob ?? null
                  return (
                    <td key={n} colSpan={3} className={d?.ausente ? styles.siteAbs : ''}>
                      <button
                        type="button"
                        className={`${styles.cycleBtn} ${v !== null && v >= 1 ? styles.cycleOn : ''}`}
                        disabled={!!d?.ausente}
                        aria-label={`Mobilidade do dente ${n}: ${v === null ? 'não avaliada' : `grau ${v}`}. Toque para mudar`}
                        onClick={() => mexe(n, x => ({ ...x, mob: cicla(x.mob, MOBILIDADE_MAX) }))}
                      >
                        {v === null ? '-' : v}
                      </button>
                    </td>
                  )
                })}
              </tr>
              <tr>
                <th scope="row" className={styles.rowLabel}>Furca</th>
                {dentes.map(n => {
                  const d = t(n)
                  const ok = temFurca(n)
                  const v = d?.furca ?? null
                  return (
                    <td key={n} colSpan={3} className={d?.ausente || !ok ? styles.siteAbs : ''}>
                      <button
                        type="button"
                        className={`${styles.cycleBtn} ${v !== null && v >= 1 ? styles.cycleOn : ''}`}
                        disabled={!ok || !!d?.ausente}
                        aria-label={ok ? `Furca do dente ${n}: ${v === null ? 'não avaliada' : `grau ${v}`}. Toque para mudar` : `Dente ${n}: sem furca`}
                        onClick={() => mexe(n, x => ({ ...x, furca: cicla(x.furca, FURCA_MAX) }))}
                      >
                        {!ok ? '' : v === null ? '-' : v}
                      </button>
                    </td>
                  )
                })}
              </tr>

              {faces.map(face => [
                <tr key={`${face}-nome`} className={styles.faceHead}>
                  <th scope="colgroup" colSpan={totalCols} className={styles.faceName}><span className={styles.faceNameText}>{face === 'v' ? 'Vestibular' : nomeL}</span></th>
                </tr>,
                linha(`${face}-sang`, 'Sangramento', (n, i, aus) => (
                  <button
                    type="button" className={`${styles.mark} ${styles.markBleed}`} disabled={aus}
                    aria-pressed={!!t(n)?.[face].sang[i]}
                    aria-label={`Dente ${n}, ${rotuloSitio(n, face, indiceParaSitio(i))}: sangramento`}
                    onClick={() => mexe(n, x => comMarcaNoSitio(x, face, 'sang', i, !x[face].sang[i]))}
                  />
                )),
                linha(`${face}-sup`, 'Supuração', (n, i, aus) => (
                  <button
                    type="button" className={`${styles.mark} ${styles.markPus}`} disabled={aus}
                    aria-pressed={!!t(n)?.[face].sup[i]}
                    aria-label={`Dente ${n}, ${rotuloSitio(n, face, indiceParaSitio(i))}: supuração`}
                    onClick={() => mexe(n, x => comMarcaNoSitio(x, face, 'sup', i, !x[face].sup[i]))}
                  />
                )),
                linha(`${face}-rec`, 'Recessão', (n, i, aus) => (
                  <MmCampo
                    nav={`${superior ? 's' : 'i'}-${face}-rec`} max={REC_MAX} disabled={aus}
                    valor={t(n)?.[face].rec[i] ?? null}
                    rotulo={`Dente ${n}, ${rotuloSitio(n, face, indiceParaSitio(i))}: recessão em milímetros`}
                    onValor={v => mexe(n, x => comValorNoSitio(x, face, 'rec', i, v))}
                    onAvancar={avancar}
                  />
                )),
                linha(`${face}-ps`, 'Profundidade', (n, i, aus) => (
                  <MmCampo
                    nav={`${superior ? 's' : 'i'}-${face}-ps`} max={PS_MAX} disabled={aus}
                    valor={t(n)?.[face].ps[i] ?? null} tom={tomPs(t(n)?.[face].ps[i] ?? null)}
                    rotulo={`Dente ${n}, ${rotuloSitio(n, face, indiceParaSitio(i))}: profundidade de sondagem em milímetros`}
                    onValor={v => mexe(n, x => comValorNoSitio(x, face, 'ps', i, v))}
                    onAvancar={avancar}
                  />
                )),
                linha(`${face}-nic`, 'NIC', (n, i, aus) => {
                  const f = t(n)?.[face]
                  const v = aus || !f ? null : nic(f.ps[i], f.rec[i])
                  return <span className={styles.nicCell}>{v ?? ''}</span>
                }, 'baixa'),
              ])}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  return (
    <div ref={raiz} className={styles.arcadas}>
      {renderArcada('Arcada superior', PERIO_SUPERIOR, true)}
      {renderArcada('Arcada inferior', PERIO_INFERIOR, false)}
    </div>
  )
}

function indiceParaSitio(i: number): 'd' | 'c' | 'm' {
  return (['d', 'c', 'm'] as const)[i]
}

interface MmProps {
  valor: number | null
  max: number
  nav: string
  rotulo: string
  disabled: boolean
  tom?: 'warn' | 'bad'
  onValor: (v: number | null) => void
  onAvancar: (el: HTMLInputElement) => void
}

/** Campo de milímetros: só dígitos, seleciona tudo ao focar e pula para o próximo quando o número fecha. */
function MmCampo({ valor, max, nav, rotulo, disabled, tom, onValor, onAvancar }: MmProps) {
  return (
    <input
      className={styles.mm}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      data-nav={nav}
      data-tone={tom}
      disabled={disabled}
      aria-label={rotulo}
      value={valor === null ? '' : String(valor)}
      onFocus={e => e.currentTarget.select()}
      onChange={e => {
        const bruto = e.target.value
        onValor(lerMm(bruto, max))
        if (campoCompleto(bruto, max)) onAvancar(e.currentTarget)
      }}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); onAvancar(e.currentTarget) }
      }}
    />
  )
}
