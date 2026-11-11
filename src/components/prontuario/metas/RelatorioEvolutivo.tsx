'use client'
import { useMemo, useState } from 'react'
import { PillTabs } from '@/components/ui/PillTabs'
import { DatePicker } from '@/components/ui/DatePicker'
import { printDocumento } from '@/lib/print'
import { hojeBrasil } from '@/lib/brasilDate'
import { buildRelatorioHtml, PUBLICO_LABEL, type Publico, type RelatorioInput } from '@/lib/metas/relatorio'
import type { Assessment, Goal, GoalLog, MetasArea } from '@/lib/metas/types'
import { usePrintActions } from '../print/PrintRegistry'
import styles from './metas.module.css'

interface Props {
  area: MetasArea
  goals: Goal[]
  logs: GoalLog[]
  assessments: Assessment[]
  clinic: RelatorioInput['clinic']
  patient: RelatorioInput['patient']
  professional: RelatorioInput['professional']
}

function daysAgo(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function RelatorioEvolutivo({ area, goals, logs, assessments, clinic, patient, professional }: Props) {
  const today = hojeBrasil()
  const [publico, setPublico] = useState<Publico>('convenio')
  const [from, setFrom] = useState(() => daysAgo(today, 90))
  const [to, setTo] = useState(today)
  const [obs, setObs] = useState('')

  const html = useMemo(() => buildRelatorioHtml({
    area, publico, from, to, clinic, patient, professional, goals, logs, assessments, observacoes: obs, emitidoEm: today,
  }), [area, publico, from, to, clinic, patient, professional, goals, logs, assessments, obs, today])

  const validRange = !!from && !!to && from <= to

  // a impressão vai para o menu "Imprimir" do prontuário
  usePrintActions('metas', [{
    id: 'relatorio-evolutivo',
    label: `Relatório evolutivo: ${PUBLICO_LABEL[publico]}`,
    includes: ['Metas e registros do período escolhido na tela', publico === 'escola' ? 'Só metas e resultado recente (sem contagens clínicas nem notas de sessão)' : 'Avaliações, metas e registros do período'],
    disabledReason: validRange ? undefined : 'Escolha um período válido',
    run: () => printDocumento(html, null),
  }], 'relatorio')

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>Relatório evolutivo</div>
          <div className={styles.sub}>Montado sozinho a partir das metas e dos registros do período. Revise antes de entregar.</div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.label}>Para quem</span>
          <PillTabs label="Destinatário do relatório" value={publico} onChange={setPublico}
            options={(Object.keys(PUBLICO_LABEL) as Publico[]).map(p => ({ value: p, label: PUBLICO_LABEL[p] }))} />
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="rel-de">De</label>
            <DatePicker id="rel-de" value={from} onChange={setFrom} max={to || today} />
          </div>
          <div className={styles.field}>
            <label htmlFor="rel-ate">Até</label>
            <DatePicker id="rel-ate" value={to} onChange={setTo} min={from} max={today} />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="rel-obs">{publico === 'escola' ? 'Orientações para a escola (opcional)' : 'Observações do profissional (opcional)'}</label>
          <textarea id="rel-obs" className={styles.textarea} value={obs} maxLength={2000} onChange={e => setObs(e.target.value)}
            placeholder={publico === 'escola' ? 'Ex.: adaptações em sala, como apoiar a comunicação' : 'Impressão clínica, conduta, próximos passos'} />
        </div>
        {publico === 'escola' && (
          <div className={styles.last}>O relatório para a escola leva só as metas e o resultado recente. Contagens clínicas, quadro fonêmico e notas de sessão ficam de fora.</div>
        )}
        {!validRange && <div className={styles.last}>Escolha um período válido (a data inicial não pode ser depois da final).</div>}
      </div>

      {validRange && (
        <div>
          <div className={styles.label} style={{ marginBottom: 6 }}>Pré-visualização</div>
          {/* HTML montado por buildRelatorioHtml: todo texto digitado passa por escapeHtml */}
          <div className={styles.preview} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  )
}
