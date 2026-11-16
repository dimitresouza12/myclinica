'use client'
import { useMemo } from 'react'
import {
  CONCOMITANTES, DISFLUENCIAS_COMUNS, DISFLUENCIAS_GAGAS, LIMITE_GAGAS_PCT, TAREFAS, UNIDADES,
  amostraCurta, calcularFluencia, faixaFluencia, normalizarFluencia, type DisfluenciaId, type FluenciaDados,
} from '@/lib/escalas/fichaFluencia'
import { CampoNumero, MultiOpcoes, Nota0a10, Observacoes, Opcoes } from './controles'
import styles from './escalas.module.css'
import f from './protocolos.module.css'

const TOM_CLASS = { ok: styles.tomOk, info: styles.tomInfo, wait: styles.tomWait, warn: styles.tomWarn, bad: styles.tomBad }
const fmt = (n: number) => String(n).replace('.', ',')

function Contador({ id, rotulo, exemplo, valor, onChange }: { id: string; rotulo: string; exemplo: string; valor: number; onChange: (v: number) => void }) {
  return (
    <div className={f.counterRow}>
      <div className={f.counterText}>
        <div className={f.fieldLabel} id={`${id}-l`}>{rotulo}</div>
        <div className={f.fieldHint}>{exemplo}</div>
      </div>
      <div className={f.stepper} role="group" aria-labelledby={`${id}-l`}>
        <button type="button" className={f.stepBtn} aria-label={`Menos uma: ${rotulo}`} disabled={valor <= 0} onClick={() => onChange(Math.max(0, valor - 1))}>-</button>
        <input className={`${f.input} ${f.stepVal}`} type="number" inputMode="numeric" min={0} max={999} aria-label={`Quantidade: ${rotulo}`}
          value={valor} onChange={e => onChange(Math.min(999, Math.max(0, Math.trunc(Number(e.target.value) || 0))))} />
        <button type="button" className={f.stepBtn} aria-label={`Mais uma: ${rotulo}`} disabled={valor >= 999} onClick={() => onChange(Math.min(999, valor + 1))}>+</button>
      </div>
    </div>
  )
}

export function FormFluencia({ dados, onChange }: { dados: FluenciaDados; onChange: (d: FluenciaDados) => void }) {
  const limpo = useMemo(() => normalizarFluencia(dados), [dados])
  const c = useMemo(() => calcularFluencia(limpo), [limpo])
  const faixa = c.pctGagas === null ? null : faixaFluencia(c.pctGagas)
  const unid = limpo.unidade === 'palavras' ? 'palavras' : 'sílabas'
  const setConta = (id: DisfluenciaId, v: number) => onChange({ ...dados, contagens: { ...dados.contagens, [id]: v } })

  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Amostra de fala</div>
        <Opcoes rotulo="Tarefa" valor={dados.tarefa} opcoes={TAREFAS} onChange={tarefa => onChange({ ...dados, tarefa })} />
        <div className={f.field}>
          <div className={f.fieldLabel} id="flu-unid">Contar em</div>
          <div className={f.choices3} role="group" aria-labelledby="flu-unid">
            {UNIDADES.map(u => (
              <button key={u.id} type="button" className={styles.opt} aria-pressed={dados.unidade === u.id} onClick={() => onChange({ ...dados, unidade: u.id })}>
                <span>{u.rotulo}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={f.twoCols}>
          <CampoNumero id="flu-total" rotulo={`Total de ${unid} faladas`} valor={dados.total} min={1} max={99999} onChange={total => onChange({ ...dados, total })} />
          <CampoNumero id="flu-seg" rotulo="Duração (segundos)" valor={dados.segundos} min={1} max={36000} onChange={segundos => onChange({ ...dados, segundos })} />
        </div>
        <div className={f.fieldHint}>Use amostras de pelo menos 100 palavras ou 200 sílabas. O total é obrigatório para calcular as porcentagens.</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Disfluências gagas</div>
        <div>
          {DISFLUENCIAS_GAGAS.map(t => (
            <Contador key={t.id} id={`flu-${t.id}`} rotulo={t.rotulo} exemplo={`Ex.: ${t.exemplo}`} valor={dados.contagens[t.id]} onChange={v => setConta(t.id, v)} />
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Disfluências comuns</div>
        <div>
          {DISFLUENCIAS_COMUNS.map(t => (
            <Contador key={t.id} id={`flu-${t.id}`} rotulo={t.rotulo} exemplo={`Ex.: ${t.exemplo}`} valor={dados.contagens[t.id]} onChange={v => setConta(t.id, v)} />
          ))}
        </div>
      </div>

      <div className={styles.card} aria-live="polite">
        <div className={styles.cardTitle}>Resultado</div>
        <div className={f.metrics}>
          <div className={f.metric}><span className={f.metricVal}>{c.pctGagas === null ? '-' : `${fmt(c.pctGagas)}%`}</span><span className={f.metricLbl}>Disfluências gagas ({c.gagas})</span></div>
          <div className={f.metric}><span className={f.metricVal}>{c.pctComuns === null ? '-' : `${fmt(c.pctComuns)}%`}</span><span className={f.metricLbl}>Disfluências comuns ({c.comuns})</span></div>
          <div className={f.metric}><span className={f.metricVal}>{c.pctTotal === null ? '-' : `${fmt(c.pctTotal)}%`}</span><span className={f.metricLbl}>Total ({c.totalDisfluencias})</span></div>
          <div className={f.metric}><span className={f.metricVal}>{c.velocidade === null ? '-' : c.velocidade}</span><span className={f.metricLbl}>{unid} por minuto</span></div>
        </div>
        {faixa && <div><span className={`${styles.chip} ${TOM_CLASS[faixa.tom]}`}>{faixa.rotulo}</span></div>}
        {amostraCurta(limpo) && <div className={f.fieldHint}>Amostra curta: interprete com cautela.</div>}
        <div className={f.fieldHint}>Referência de {LIMITE_GAGAS_PCT}% de disfluências gagas (Ambrose e Yairi, 1999): sinal para investigar melhor, não é diagnóstico.</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Comportamentos e percepção</div>
        <MultiOpcoes rotulo="Comportamentos associados observados" valores={dados.concomitantes} opcoes={CONCOMITANTES} onChange={concomitantes => onChange({ ...dados, concomitantes })} />
        <Nota0a10 rotulo="Quanto a fala incomoda, segundo o paciente" dica="0 nada, 10 muitíssimo" valor={dados.autopercepcao} onChange={autopercepcao => onChange({ ...dados, autopercepcao })} />
        <Observacoes id="flu-obs" valor={dados.obs} onChange={obs => onChange({ ...dados, obs })} />
      </div>
    </>
  )
}
