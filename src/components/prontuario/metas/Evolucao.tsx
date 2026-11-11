'use client'
import { AREA_PROFILE, STATUS_LABEL } from '@/lib/metas/constants'
import { goalProgress, logsOfGoal, overallProgress, overallSeries, seriesFromLogs, sessionDates, TREND_LABEL } from '@/lib/metas/progress'
import { brDate } from '@/lib/metas/relatorio'
import type { Goal, GoalLog, MetasArea } from '@/lib/metas/types'
import { ProgressChart } from './ProgressChart'
import styles from './metas.module.css'

interface Props { area: MetasArea; goals: Goal[]; logs: GoalLog[] }

export function Evolucao({ area, goals, logs }: Props) {
  const profile = AREA_PROFILE[area]
  const considered = goals.filter(g => g.status !== 'cancelada')
  const geral = overallProgress(goals, logs)
  const serie = overallSeries(considered, logs)
  const datas = sessionDates(logs.filter(l => considered.some(g => g.id === l.goal_id)))

  if (considered.length === 0 || datas.length === 0) {
    return <div className={styles.empty}>O gráfico aparece assim que houver registros de sessão nas metas.</div>
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.title}>Progresso geral</div>
        <div className={styles.statRow}>
          <span className={styles.big}>{geral === null ? '-' : `${geral}%`}</span>
          <span className={styles.sub}>média do desempenho recente nas metas · {datas.length} {datas.length === 1 ? 'sessão registrada' : 'sessões registradas'}</span>
        </div>
        <ProgressChart series={serie} label="Desempenho geral por data" height={200} />
        <div className={styles.last}>Cada ponto é a média dos registros do dia ({profile.resultLabel.adquirido} = 100%, {profile.resultLabel.com_pista} = 50%, {profile.resultLabel.nao_adquirido} = 0%).</div>
      </div>

      <div className={styles.list}>
        {considered.map(g => {
          const own = logsOfGoal(logs, g.id)
          const prog = goalProgress(own)
          return (
            <div key={g.id} className={styles.card}>
              <div className={styles.row}>
                <span className={styles.cardTitle} style={{ flex: 1, minWidth: 0 }}>{g.title}</span>
                <span className={styles.chip}>{STATUS_LABEL[g.status]}</span>
              </div>
              {own.length === 0 ? (
                <div className={styles.last}>Sem registros ainda.</div>
              ) : (
                <>
                  <div className={styles.row}>
                    <span className={styles.pct}>{prog.percent}%</span>
                    <span className={styles.last}>
                      {TREND_LABEL[prog.trend]} · {own.length} {own.length === 1 ? 'registro' : 'registros'} · último em {brDate(prog.lastDate)}
                      {prog.lastResult ? ` (${profile.resultLabel[prog.lastResult]})` : ''}
                    </span>
                  </div>
                  <ProgressChart series={seriesFromLogs(own)} label={`Evolução da meta ${g.title}`} height={140} />
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
