'use client'
import {
  curvaDoEscore, DIAS_MAX, DIAS_POR_MES, escoreTexto, INDICADOR_INFO, mesesDeVida, type Indicador, type Sexo,
} from '@/lib/medico/crescimento/oms'
import type { PontoMedido } from '@/lib/medico/crescimento/medidas'
import styles from './medicina.module.css'

const W = 340
const H = 250
const ML = 34
const MR = 26
const MT = 20
const MB = 30

export type FaixaIdade = '2anos' | '5anos'
const DIAS_DA_FAIXA: Record<FaixaIdade, number> = { '2anos': 730, '5anos': DIAS_MAX }

const fmt = (n: number, casas: number) => n.toFixed(casas).replace('.', ',')
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/** Passo "redondo" de eixo para caber cerca de 5 marcas. */
function passoDoEixo(amplitude: number): number {
  const bruto = amplitude / 5
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)))
  const f = bruto / potencia
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * potencia
}

const ROTULO_Z: Record<number, string> = { [-3]: '-3', [-2]: '-2', 0: '0', 2: '+2', 3: '+3' }

interface Props {
  sexo: Sexo
  indicador: Indicador
  faixa: FaixaIdade
  pontos: PontoMedido[]
}

/**
 * Curvas da OMS (escores Z -3, -2, mediana, +2 e +3) com as medidas da criança por cima. SVG próprio: o eixo X é a
 * idade (meses até 2 anos; anos até 5), o valor vem escrito em cada ponto (funciona no toque, sem hover) e a leitura
 * completa fica na tabela abaixo do gráfico, que também serve a quem usa leitor de tela.
 */
export function GraficoCrescimento({ sexo, indicador, faixa, pontos }: Props) {
  const info = INDICADOR_INFO[indicador]
  const diasMax = DIAS_DA_FAIXA[faixa]
  const visiveis = pontos.filter(p => p.dias <= diasMax)

  const curvas = ([-3, -2, 0, 2, 3] as const).map(z => ({ z, pts: curvaDoEscore(sexo, indicador, z, 0, diasMax, faixa === '2anos' ? 10 : 30) }))
  const todos = [...curvas.flatMap(c => c.pts.map(p => p.valor)), ...visiveis.map(p => p.valor)]
  const passo = passoDoEixo(Math.max(...todos) - Math.min(...todos))
  const min = Math.floor(Math.min(...todos) / passo) * passo
  const max = Math.ceil(Math.max(...todos) / passo) * passo

  const x = (dias: number) => ML + (dias / diasMax) * (W - ML - MR)
  const y = (v: number) => MT + (1 - (v - min) / (max - min)) * (H - MT - MB)

  const marcasY: number[] = []
  for (let v = min; v <= max + passo / 1000; v += passo) marcasY.push(Math.round(v * 1e6) / 1e6)

  const marcasX: { dias: number; rotulo: string }[] = []
  if (faixa === '2anos') for (let m = 0; m <= 24; m += 3) marcasX.push({ dias: m * DIAS_POR_MES, rotulo: String(m) })
  else for (let a = 0; a <= 5; a += 1) marcasX.push({ dias: a * 365.25, rotulo: String(a) })

  const tracado = (pts: { dias: number; valor: number }[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.dias).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ')
  const classeLinha = (z: number) => (z === 0 ? styles.zMedian : Math.abs(z) === 2 ? styles.zMid : styles.zExtreme)
  const classeTexto = (z: number) => (z === 0 ? styles.zMedianText : Math.abs(z) === 2 ? styles.zMidText : styles.zExtremeText)

  const resumo = visiveis.length === 0
    ? 'Nenhuma medida registrada.'
    : visiveis.map(p => `${dataCurta(p.data)}, ${fmt(mesesDeVida(p.dias), 1)} meses: ${fmt(p.valor, info.casas)} ${info.unidade}, escore Z ${escoreTexto(p.z)}`).join('; ')
  const rotulo = `${info.titulo}, ${sexo === 'meninos' ? 'meninos' : 'meninas'}, padrão OMS. ${resumo}`

  const caminhoDados = visiveis.length > 1 ? tracado(visiveis.map(p => ({ dias: p.dias, valor: p.valor }))) : ''
  const rotularTodos = visiveis.length <= 6

  return (
    <div>
      <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={rotulo}>
        {marcasY.map(v => (
          <g key={v}>
            <line className={styles.gridLine} x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} />
            <text className={styles.axis} x={ML - 4} y={y(v) + 3} textAnchor="end">{fmt(v, passo < 1 ? 1 : 0)}</text>
          </g>
        ))}
        {marcasX.map(m => (
          <g key={m.rotulo}>
            <line className={styles.gridLine} x1={x(m.dias)} x2={x(m.dias)} y1={MT} y2={H - MB} />
            <text className={styles.axis} x={x(m.dias)} y={H - MB + 12} textAnchor="middle">{m.rotulo}</text>
          </g>
        ))}
        <text className={styles.axisTitle} x={(ML + W - MR) / 2} y={H - 4}>{faixa === '2anos' ? 'idade (meses)' : 'idade (anos)'}</text>
        <text className={styles.axisTitle} x={ML - 4} y={9} textAnchor="end">{info.unidade}</text>

        {curvas.map(c => <path key={c.z} className={classeLinha(c.z)} d={tracado(c.pts)} />)}
        {curvas.map(c => {
          const ultimo = c.pts[c.pts.length - 1]
          return <text key={`t${c.z}`} className={`${styles.zLabel} ${classeTexto(c.z)}`} x={W - MR + 3} y={y(ultimo.valor) + 3}>{ROTULO_Z[c.z]}</text>
        })}

        {caminhoDados && <path className={styles.dataLine} d={caminhoDados} />}
        {visiveis.map((p, i) => {
          const ultimo = i === visiveis.length - 1
          return (
            <g key={p.id}>
              <circle className={styles.dataDot} cx={x(p.dias)} cy={y(p.valor)} r={3.8} />
              {(rotularTodos || i === 0 || ultimo) && <text className={styles.dataLabel} x={x(p.dias)} y={y(p.valor) - 8}>{fmt(p.valor, info.casas)}</text>}
            </g>
          )
        })}
      </svg>
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.legMedian} />Mediana (escore Z 0)</span>
        <span><i className={styles.legMid} />Escore Z -2 e +2</span>
        <span><i className={styles.legExtreme} />Escore Z -3 e +3</span>
      </div>
      {visiveis.length === 0 && <p className={styles.hint}>Registre uma medida para ela aparecer sobre as curvas.</p>}
    </div>
  )
}
