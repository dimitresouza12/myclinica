'use client'
import { FAIXA_SANGRAMENTO_ROTULO, fmtNum, resumoPerio, type PerioDados } from '@/lib/odonto/periograma'
import common from './odontoCommon.module.css'

const tomFaixa = { baixo: common.tagOk, moderado: common.tagWarn, alto: common.tagBad }

/** Índices do exame que está na tela: sangramento à sondagem, profundidade, NIC, sítios profundos, mobilidade e furca. */
export function PerioResumo({ dados }: { dados: PerioDados }) {
  const r = resumoPerio(dados)
  return (
    <section className={common.card} aria-label="Resumo do exame">
      <h3 className={common.cardTitle}>Resumo do exame</h3>
      {r.sitiosRegistrados === 0 ? (
        <p className={common.hint}>Preencha a profundidade de sondagem para ver os índices.</p>
      ) : (
        <>
          <div className={common.stats}>
            <div className={common.stat}>
              <span className={common.statLabel}>Sangramento à sondagem</span>
              <span className={common.statValue}>{fmtNum(r.pctSangramento)}<small>%</small></span>
              <span className={common.statSub}>{r.sitiosSangrando} de {r.sitiosRegistrados} sítios</span>
              {r.faixaSangramento && <span className={`${common.tag} ${tomFaixa[r.faixaSangramento]}`}>{FAIXA_SANGRAMENTO_ROTULO[r.faixaSangramento]}</span>}
            </div>
            <div className={common.stat}>
              <span className={common.statLabel}>Profundidade média</span>
              <span className={common.statValue}>{fmtNum(r.psMedia)}<small>mm</small></span>
              <span className={common.statSub}>Maior: {r.psMax ?? '-'} mm</span>
            </div>
            <div className={common.stat}>
              <span className={common.statLabel}>NIC médio</span>
              <span className={common.statValue}>{fmtNum(r.nicMedia)}<small>mm</small></span>
              <span className={common.statSub}>Maior: {r.nicMax ?? '-'} mm</span>
            </div>
            <div className={common.stat}>
              <span className={common.statLabel}>Sítios com 4 mm ou mais</span>
              <span className={common.statValue}>{r.sitiosPs4}{r.pctPs4 !== null && <small>{fmtNum(r.pctPs4, 0)}%</small>}</span>
              <span className={common.statSub}>6 mm ou mais: {r.sitiosPs6}</span>
            </div>
            <div className={common.stat}>
              <span className={common.statLabel}>Supuração</span>
              <span className={common.statValue}>{r.sitiosSupurando}<small>{r.sitiosSupurando === 1 ? 'sítio' : 'sítios'}</small></span>
            </div>
            <div className={common.stat}>
              <span className={common.statLabel}>Mobilidade e furca</span>
              <span className={common.statValue}>{r.dentesComMobilidade}<small>mob.</small> {r.dentesComFurca}<small>furca</small></span>
              <span className={common.statSub}>dentes com grau 1 ou mais</span>
            </div>
          </div>
          <p className={common.hint}>
            {r.dentesAvaliados} {r.dentesAvaliados === 1 ? 'dente avaliado' : 'dentes avaliados'}, {r.dentesAusentes} {r.dentesAusentes === 1 ? 'ausente' : 'ausentes'}.
            O percentual de sangramento é a parte dos sítios medidos que sangrou; menos de 10% é o limite usado como referência de saúde gengival.
            Os índices são calculados dos números digitados e não substituem o diagnóstico do profissional.
          </p>
        </>
      )}
    </section>
  )
}
