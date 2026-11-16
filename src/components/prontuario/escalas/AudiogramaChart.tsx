'use client'
import {
  FREQ_VA, FREQ_VO, LADOS, MODULO_AUDIOGRAMA, posicaoFrequencia, posicaoLimiar,
  type AudiogramaDados, type LadoAudiograma, type Limiar,
} from '@/lib/escalas/audiograma'
import styles from './audiograma.module.css'

const W = 360
const X0 = 42
const X1 = 346
const Y0 = 40
const Y1 = 270

const x = (freq: number) => X0 + posicaoFrequencia(freq) * (X1 - X0)
const y = (db: number) => Y0 + posicaoLimiar(db) * (Y1 - Y0)

const ROTULO_FREQ: Record<number, string> = { 250: '250', 500: '500', 1000: '1k', 2000: '2k', 3000: '3k', 4000: '4k', 6000: '6k', 8000: '8k' }

function SimboloVA({ lado, cx, cy }: { lado: LadoAudiograma; cx: number; cy: number }) {
  return lado === 'od'
    ? <circle cx={cx} cy={cy} r={6} className={styles.od} />
    : <path d={`M${cx - 5},${cy - 5} L${cx + 5},${cy + 5} M${cx + 5},${cy - 5} L${cx - 5},${cy + 5}`} className={styles.oe} />
}

/** Via óssea sem mascaramento: "<" para a orelha direita, ">" para a esquerda, levemente deslocados da via aérea. */
function SimboloVO({ lado, cx, cy }: { lado: LadoAudiograma; cx: number; cy: number }) {
  return lado === 'od'
    ? <path d={`M${cx - 4},${cy - 5} L${cx - 12},${cy} L${cx - 4},${cy + 5}`} className={styles.od} />
    : <path d={`M${cx + 4},${cy - 5} L${cx + 12},${cy} L${cx + 4},${cy + 5}`} className={styles.oe} />
}

function pontos(limiares: Limiar[], freqs: readonly number[]): { f: number; db: number }[] {
  return freqs.flatMap((f, i) => (typeof limiares[i] === 'number' ? [{ f, db: limiares[i] as number }] : []))
}

export function AudiogramaChart({ dados }: { dados: AudiogramaDados }) {
  const resumo = MODULO_AUDIOGRAMA.resumo(MODULO_AUDIOGRAMA.normalizar(dados)).slice(1).filter(l => !l.startsWith('Observações'))
  const rotulo = resumo.length > 0 ? `Audiograma. ${resumo.join(' ')}` : 'Audiograma sem limiares registrados.'
  const vazio = LADOS.every(l => pontos(dados[l.id].va, FREQ_VA).length === 0 && pontos(dados[l.id].vo, FREQ_VO).length === 0)

  const linhasH: number[] = []
  for (let db = -10; db <= 120; db += 10) linhasH.push(db)

  return (
    <div className={styles.wrap}>
      <svg className={styles.svg} viewBox={`0 0 ${W} 340`} role="img" aria-label={rotulo}>
        <rect className={styles.normal} x={X0} y={Y0} width={X1 - X0} height={y(25) - Y0} />
        {linhasH.map(db => <line key={db} className={styles.gridH} x1={X0} x2={X1} y1={y(db)} y2={y(db)} />)}
        {FREQ_VA.map(f => <line key={f} className={styles.gridV} x1={x(f)} x2={x(f)} y1={Y0} y2={Y1} />)}
        <text className={styles.cap} x={X0} y={14} textAnchor="start">dB NA</text>
        <text className={styles.cap} x={X1} y={14} textAnchor="end">Frequência (Hz)</text>
        {FREQ_VA.map(f => <text key={f} className={styles.tick} x={x(f)} y={32} textAnchor="middle">{ROTULO_FREQ[f]}</text>)}
        {[0, 20, 40, 60, 80, 100, 120].map(db => <text key={db} className={styles.tick} x={X0 - 6} y={y(db) + 4} textAnchor="end">{db}</text>)}

        {vazio && <text className={styles.vazio} x={(X0 + X1) / 2} y={(Y0 + Y1) / 2} textAnchor="middle">Os limiares aparecem aqui</text>}

        {LADOS.map(l => {
          const va = pontos(dados[l.id].va, FREQ_VA)
          const vo = pontos(dados[l.id].vo, FREQ_VO)
          return (
            <g key={l.id}>
              {va.length > 1 && <polyline className={`${l.id === 'od' ? styles.od : styles.oe} ${styles.linha}`} points={va.map(p => `${x(p.f)},${y(p.db)}`).join(' ')} />}
              {va.map(p => <SimboloVA key={`va-${p.f}`} lado={l.id} cx={x(p.f)} cy={y(p.db)} />)}
              {vo.map(p => <SimboloVO key={`vo-${p.f}`} lado={l.id} cx={x(p.f)} cy={y(p.db)} />)}
            </g>
          )
        })}

        <g aria-hidden="true">
          <SimboloVA lado="od" cx={22} cy={298} /><text className={styles.legend} x={36} y={302}>Direita, via aérea</text>
          <SimboloVA lado="oe" cx={22} cy={320} /><text className={styles.legend} x={36} y={324}>Esquerda, via aérea</text>
          <SimboloVO lado="od" cx={204} cy={298} /><text className={styles.legend} x={212} y={302}>Direita, via óssea</text>
          <SimboloVO lado="oe" cx={188} cy={320} /><text className={styles.legend} x={212} y={324}>Esquerda, via óssea</text>
        </g>
      </svg>
    </div>
  )
}
