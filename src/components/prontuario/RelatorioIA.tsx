'use client'
import { useState } from 'react'
import { PillTabs } from '@/components/ui/PillTabs'
import { DatePicker } from '@/components/ui/DatePicker'
import { hojeBrasil } from '@/lib/brasilDate'
import { escapeHtml } from '@/lib/documentHtml'
import { printDocumento } from '@/lib/print'
import { AREA_LABEL, PUBLICO_LABEL, PUBLICOS, type EscribaArea, type EscribaPublico } from '@/lib/ia/escriba'
import { gerarRelatorio } from './iaEscribaApi'
import { useEscribaStatus } from './useEscribaStatus'
import { ConsentimentoIa } from './IaEscriba'
import { usePrintActions } from './print/PrintRegistry'
import styles from './IaEscriba.module.css'

interface Props {
  area: EscribaArea
  patientId: string
  patientName: string
  clinicName: string
}

function daysAgo(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PUBLICO_TITULO: Record<EscribaPublico, string> = {
  escola: 'Relatório para a escola',
  convenio: 'Relatório evolutivo para convênio',
  medico: 'Relatório evolutivo para o médico assistente',
}

/** Texto digitado/gerado vira HTML só depois de escapeHtml; nada de HTML vindo da IA é interpretado. */
function reportHtml(args: { clinicName: string; patientName: string; area: EscribaArea; publico: EscribaPublico; text: string }): string {
  const paras = args.text.split(/\n{2,}/).map(p => `<p style="margin:0 0 10px">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
  return `
    <h2 style="margin:0 0 2px">${escapeHtml(PUBLICO_TITULO[args.publico])}</h2>
    <p style="margin:0 0 14px;color:#444">${escapeHtml(args.clinicName)} | ${escapeHtml(AREA_LABEL[args.area])}</p>
    <p style="margin:0 0 14px"><strong>Paciente:</strong> ${escapeHtml(args.patientName)}</p>
    ${paras}
    <p style="margin-top:48px">______________________________________<br>Assinatura e registro profissional</p>`
}

/** Gerador de relatório (escola, convênio, médico) a partir das evoluções do período. Sempre rascunho. */
export function RelatorioIA({ area, patientId, patientName, clinicName }: Props) {
  const { estado, reload } = useEscribaStatus(true)
  const today = hojeBrasil()
  const [open, setOpen] = useState(false)
  const [publico, setPublico] = useState<EscribaPublico>('convenio')
  const [from, setFrom] = useState(() => daysAgo(today, 90))
  const [to, setTo] = useState(today)
  const [obs, setObs] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [copied, setCopied] = useState(false)

  // a impressão vai para o menu "Imprimir" do prontuário (só aparece com rascunho gerado; exige a revisão marcada)
  usePrintActions('timeline', !text.trim() ? [] : [{
    id: 'relatorio-ia',
    label: `Relatório com IA: ${PUBLICO_LABEL[publico]}`,
    includes: ['O rascunho do relatório como está na tela, já revisado por você', 'Anotações sigilosas e anexos não entram no relatório'],
    disabledReason: reviewed ? undefined : 'Marque que leu e revisou o relatório',
    run: () => printDocumento(reportHtml({ clinicName, patientName, area, publico, text }), null),
  }], 'relatorio-ia')

  if (estado.kind === 'carregando' || estado.kind === 'oculto') return null

  const off = estado.kind === 'nao_configurada'
  const validRange = !!from && !!to && from <= to

  async function gerar() {
    setBusy(true)
    setError('')
    try {
      const r = await gerarRelatorio({ area, patientId, publico, de: from, ate: to, observacoes: obs })
      setText(r.rascunho)
      setReviewed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar agora.')
    } finally {
      setBusy(false)
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <button type="button" className={styles.btn} aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {open ? 'Fechar relatório com IA' : 'Relatório com IA (escola, convênio, médico)'}
        </button>
        {off && <span className={styles.muted}>IA ainda não configurada.</span>}
      </div>

      {open && estado.kind === 'sem_consentimento' && <ConsentimentoIa estado={estado} onDone={reload} />}

      {open && !off && estado.kind === 'pronto' && (
        <div className={styles.panel}>
          <span className={styles.muted}>
            A IA monta o rascunho a partir das evoluções do período (anotações sigilosas e anexos ficam de fora). Você revisa e edita antes de imprimir ou copiar; nada é salvo no prontuário.
          </span>
          <div className={styles.field}>
            <span className={styles.label}>Para quem</span>
            <PillTabs label="Destinatário do relatório" value={publico} onChange={setPublico}
              options={PUBLICOS.map(p => ({ value: p, label: PUBLICO_LABEL[p] }))} />
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ia-rel-de">De</label>
              <DatePicker id="ia-rel-de" value={from} onChange={setFrom} max={to || today} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ia-rel-ate">Até</label>
              <DatePicker id="ia-rel-ate" value={to} onChange={setTo} min={from} max={today} />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ia-rel-obs">Observações para o relatório (opcional)</label>
            <textarea id="ia-rel-obs" className={styles.textarea} rows={3} maxLength={1500} value={obs} onChange={e => setObs(e.target.value)}
              placeholder="Ex.: pontos que você quer destacar. Evite nomes de pessoas." />
          </div>
          <div className={styles.row}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { void gerar() }} disabled={busy || !validRange}>
              {busy ? 'Gerando...' : text ? 'Gerar de novo' : 'Gerar rascunho'}
            </button>
          </div>
          {!validRange && <p className={styles.muted}>Escolha um período válido (a data inicial não pode ser depois da final).</p>}
          {error && <p className={styles.error}>{error}</p>}

          {text && (
            <>
              <div className={styles.review} role="status">
                <span className={styles.reviewTitle}>Rascunho gerado por IA, revise antes de usar</span>
                <span className={styles.muted}>Confira os fatos e os trechos marcados com [confirmar]. Você pode editar o texto abaixo.</span>
              </div>
              <textarea className={styles.textarea} rows={14} value={text} aria-label="Rascunho do relatório"
                onChange={e => { setText(e.target.value); setReviewed(false) }} />
              <label className={styles.check}>
                <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />
                <span>Li e revisei o relatório</span>
              </label>
              <div className={styles.row}>
                <button type="button" className={styles.btn} disabled={!reviewed || !text.trim()} onClick={() => { void copiar() }}>
                  {copied ? 'Copiado' : 'Copiar texto'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
