'use client'
import { Fragment, useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { DatePicker } from '@/components/ui/DatePicker'
import { localDayKey } from '@/lib/dashboard/metrics'
import type { ScheduleData } from '@/lib/agenda/availability'
import {
  DEFAULT_SHOW, MAX_CUSTOM_DAYS, areasOf, buildSheets, dateBr, documentTitle, freeAllowed, needsFetch, periodTitle, pickProfessionals, resolvePeriod,
  type PrintGrouping, type PrintPeriod, type PrintProf, type PrintShow, type PrintSheet,
} from '@/lib/agenda/print'
import type { Appointment } from '@/types'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { SelectMenu } from '@/components/ui/SelectMenu'
import styles from './agendaPrint.module.css'

interface Props {
  clinicId: string | undefined
  clinicName: string
  userName: string
  professionals: PrintProf[]
  /** profissional restrito: só a própria agenda */
  scopeProfessionalId: string | null
  /** o que a Agenda já carregou */
  appointments: Appointment[]
  scheduleFor: (professionalId: string) => ScheduleData | undefined
  /** grade de horários da clínica ("HH:mm") */
  slots: string[]
  /** visão e dia que estão na tela: o ponto de partida do período */
  initialView: 'dia' | 'semana' | 'mes'
  initialDate: Date
  onClose: () => void
}

const PERIODS: { value: PrintPeriod; label: string }[] = [
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
  { value: 'custom', label: 'Personalizado' },
]
const GROUPS: { value: PrintGrouping; label: string }[] = [
  { value: 'folha', label: 'Uma folha por profissional' },
  { value: 'lista', label: 'Lista única' },
]
const SHOW_OPTIONS: { key: keyof PrintShow; label: string }[] = [
  { key: 'phone', label: 'Telefone' },
  { key: 'convenio', label: 'Convênio' },
  { key: 'notes', label: 'Observações' },
  { key: 'free', label: 'Horários livres e bloqueios' },
  { key: 'canceled', label: 'Cancelados e faltas' },
  { key: 'arrival', label: 'Coluna "Chegou"' },
  { key: 'summary', label: 'Resumo no rodapé' },
]

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const APPT_SELECT = '*, patients(id, name, phone, pet_name), professionals(id, name)'

/** Consultas de um período fora do que a Agenda carrega (3 meses para trás): mesma consulta e mesmo escopo, em páginas. */
async function fetchRange(clinicId: string, scopeId: string | null, start: Date, end: Date): Promise<Appointment[]> {
  const PAGE = 1000
  const out: Appointment[] = []
  for (let from = 0; from < PAGE * 20; from += PAGE) {
    let q = supabase.from('appointments').select(APPT_SELECT).eq('clinic_id', clinicId)
      .gte('scheduled_at', start.toISOString()).lt('scheduled_at', end.toISOString())
      .order('scheduled_at', { ascending: true }).order('id', { ascending: true })
    if (scopeId) q = q.or(`professional_id.eq.${scopeId},and(professional_id.is.null,status.eq.bloqueado)`)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data ?? []) as Appointment[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

/** Convênio não mora na consulta, mas no paciente. */
async function fetchConvenios(clinicId: string, ids: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from('patients').select('id, convenio').eq('clinic_id', clinicId).in('id', ids.slice(i, i + 150))
    if (error) throw error
    for (const r of (data ?? []) as { id: string; convenio: string | null }[]) out[r.id] = r.convenio
  }
  return out
}

export function AgendaPrintDialog({ clinicId, clinicName, userName, professionals, scopeProfessionalId, appointments, scheduleFor, slots, initialView, initialDate, onClose }: Props) {
  const uid = useId()
  const [period, setPeriod] = useState<PrintPeriod>(initialView)
  const [from, setFrom] = useState(() => localDayKey(initialDate))
  const [to, setTo] = useState(() => localDayKey(initialDate))
  const [areas, setAreas] = useState<string[]>([])
  const [professionalIds, setProfessionalIds] = useState<string[]>([])
  const [group, setGroup] = useState<PrintGrouping>('folha')
  const [show, setShow] = useState<PrintShow>(DEFAULT_SHOW)
  const [job, setJob] = useState<{ printedAt: Date } | null>(null)

  const range = useMemo(() => resolvePeriod(period, initialDate, from, to), [period, initialDate, from, to])
  const remote = range.ok && needsFetch(range.start)
  const rangeKey = range.ok ? [range.start.getTime(), range.end.getTime()] : []
  const remoteQuery = useQuery({
    queryKey: ['agenda-print', clinicId, scopeProfessionalId, ...rangeKey],
    queryFn: () => fetchRange(clinicId as string, scopeProfessionalId, (range as { start: Date }).start, (range as { end: Date }).end),
    enabled: !!clinicId && remote,
    staleTime: 60 * 1000,
  })
  const source = remote ? remoteQuery.data : appointments

  const areaOptions = useMemo(() => areasOf(professionals), [professionals])
  const selectedAreas = areas.filter(a => areaOptions.some(o => o.value === a))
  const inArea = useMemo(
    () => pickProfessionals(professionals, { areas: selectedAreas, professionalIds: [], scopeId: scopeProfessionalId }),
    [professionals, selectedAreas, scopeProfessionalId],
  )
  const effectiveProfIds = useMemo(
    () => (scopeProfessionalId ? [] : professionalIds.filter(id => inArea.some(p => p.id === id))),
    [scopeProfessionalId, professionalIds, inArea],
  )
  const picked = useMemo(
    () => pickProfessionals(professionals, { areas: selectedAreas, professionalIds: effectiveProfIds, scopeId: scopeProfessionalId }),
    [professionals, selectedAreas, effectiveProfIds, scopeProfessionalId],
  )
  // consultas sem profissional só entram quando nada restringe quem imprimir
  const includeUnassigned = !scopeProfessionalId && selectedAreas.length === 0 && effectiveProfIds.length === 0
  const sheetCount = picked.length + (includeUnassigned ? 1 : 0)
  const freeOk = freeAllowed(group, sheetCount)

  const patientIds = useMemo(() => {
    if (!range.ok || !show.convenio || !source) return []
    const a = range.start.getTime()
    const b = range.end.getTime()
    const ids = new Set<string>()
    for (const x of source) {
      const t = new Date(x.scheduled_at).getTime()
      if (x.patient_id && x.status !== 'bloqueado' && t >= a && t < b) ids.add(x.patient_id)
    }
    return [...ids].sort()
  }, [range, show.convenio, source])
  const convQuery = useQuery({
    queryKey: ['agenda-print-convenio', clinicId, patientIds.join(',')],
    queryFn: () => fetchConvenios(clinicId as string, patientIds),
    enabled: !!clinicId && patientIds.length > 0,
    staleTime: 60 * 1000,
  })

  const result = useMemo(() => {
    if (!range.ok || !source) return { sheets: [] as PrintSheet[], count: 0 }
    return buildSheets({
      appointments: source,
      professionals: picked,
      includeUnassigned,
      start: range.start,
      end: range.end,
      group,
      show: { ...show, free: show.free && freeOk },
      convenios: convQuery.data ?? {},
      listLabel: effectiveProfIds.length > 0 ? picked.map(p => p.name).join(', ') : selectedAreas.length > 0 ? selectedAreas.map(a => areaOptions.find(o => o.value === a)?.label ?? a).join(', ') : 'Todos os profissionais',
      scheduleFor,
      slots,
    })
  }, [range, source, picked, effectiveProfIds, includeUnassigned, group, show, freeOk, convQuery.data, selectedAreas, areaOptions, scheduleFor, slots])

  const loading = (remote && remoteQuery.isFetching) || (patientIds.length > 0 && convQuery.isFetching)
  const loadFailed = (remote && remoteQuery.isError) || (patientIds.length > 0 && convQuery.isError)
  const waitingConvenios = show.convenio && patientIds.length > 0 && !convQuery.data
  const canPrint = range.ok && !loading && !loadFailed && !waitingConvenios && result.sheets.length > 0

  // Impressão: o navegador imprime a página, então a folha é um filho do <body> e o resto some por CSS de impressão.
  // O efeito só desfaz o que mexeu no DOM; quem encerra o trabalho é o evento de depois da impressão.
  useEffect(() => {
    if (!job || !range.ok) return
    const root = document.documentElement
    const prevTitle = document.title
    root.setAttribute('data-print-agenda', '')
    document.title = documentTitle(clinicName, range.start, range.end)
    const done = () => setJob(null)
    const mql = window.matchMedia('print')
    const onMql = (e: MediaQueryListEvent) => { if (!e.matches) done() }
    window.addEventListener('afterprint', done)
    mql.addEventListener('change', onMql)
    // dois quadros: dá tempo de a folha ir para o DOM antes de o navegador montar a impressão
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => window.print()) })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.removeEventListener('afterprint', done)
      mql.removeEventListener('change', onMql)
      root.removeAttribute('data-print-agenda')
      document.title = prevTitle
    }
  }, [job, range, clinicName])

  const toggleArea = (value: string) => setAreas(prev => (prev.includes(value) ? prev.filter(a => a !== value) : [...prev, value]))
  const setFlag = (key: keyof PrintShow, value: boolean) => setShow(prev => ({ ...prev, [key]: value }))

  const rangeText = range.ok
    ? (range.days === 1 ? dateBr(range.start) : `${dateBr(range.start)} a ${dateBr(new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate() - 1))}`)
    : ''

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Imprimir agenda"
        subtitle="Escolha o que vai na folha"
        size="md"
        footer={<>
          <span className={styles.count} aria-live="polite">
            {loading ? 'Carregando...' : `${plural(result.count, 'consulta', 'consultas')} · ${plural(result.sheets.length, 'folha', 'folhas')}`}
          </span>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={btn.primary} onClick={() => setJob({ printedAt: new Date() })} disabled={!canPrint}>Imprimir</button>
        </>}
      >
        <div className={styles.form}>
          <div className={f.field}>
            <span className={styles.label} id={`${uid}-period`}>Período</span>
            <div className={styles.seg} role="group" aria-labelledby={`${uid}-period`} data-cols="4">
              {PERIODS.map(o => (
                <button key={o.value} type="button" className={styles.segBtn} aria-pressed={period === o.value} onClick={() => setPeriod(o.value)}>{o.label}</button>
              ))}
            </div>
            {period === 'custom' ? (
              <div className={f.row2}>
                <div className={f.field}>
                  <label htmlFor={`${uid}-from`}>Data inicial</label>
                  <DatePicker id={`${uid}-from`} value={from} onChange={setFrom} />
                </div>
                <div className={f.field}>
                  <label htmlFor={`${uid}-to`}>até</label>
                  <DatePicker id={`${uid}-to`} value={to} onChange={setTo} />
                </div>
              </div>
            ) : (
              <p className={f.hint}>{rangeText}. Para outro dia, use Personalizado.</p>
            )}
            {!range.ok && <p className={f.error} role="alert">{range.error}</p>}
            {range.ok && period === 'custom' && <p className={f.hint}>Até {MAX_CUSTOM_DAYS} dias por impressão.</p>}
          </div>

          {!scopeProfessionalId && areaOptions.length > 1 && (
            <div className={f.field}>
              <span className={styles.label} id={`${uid}-area`}>Área</span>
              <div className={styles.chips} role="group" aria-labelledby={`${uid}-area`}>
                {areaOptions.map(o => (
                  <button key={o.value} type="button" className={styles.chip} aria-pressed={selectedAreas.includes(o.value)} onClick={() => toggleArea(o.value)}>{o.label}</button>
                ))}
              </div>
              <p className={f.hint}>{selectedAreas.length === 0 ? 'Todas as áreas.' : 'Só as áreas marcadas.'}</p>
            </div>
          )}

          <div className={f.field}>
            <label htmlFor={`${uid}-prof`}>Profissional</label>
            {scopeProfessionalId ? (
              <p className={f.hint}>Você imprime só a sua agenda.</p>
            ) : (
              <>
                <SelectMenu
                  id={`${uid}-prof`}
                  variant="field"
                  multiple
                  values={effectiveProfIds}
                  onChangeValues={setProfessionalIds}
                  options={inArea.map(p => ({ value: p.id, label: p.name }))}
                  placeholder="Todos"
                  summary={n => `${n} profissionais`}
                  ariaLabel="Profissional"
                />
                <p className={f.hint}>{effectiveProfIds.length === 0 ? 'Todos os profissionais.' : 'Só os profissionais marcados.'}</p>
              </>
            )}
          </div>

          <div className={f.field}>
            <span className={styles.label} id={`${uid}-group`}>Agrupar</span>
            <div className={styles.seg} role="group" aria-labelledby={`${uid}-group`} data-cols="2">
              {GROUPS.map(o => (
                <button key={o.value} type="button" className={styles.segBtn} aria-pressed={group === o.value} onClick={() => setGroup(o.value)}>{o.label}</button>
              ))}
            </div>
          </div>

          <div className={f.field}>
            <span className={styles.label} id={`${uid}-show`}>Mostrar</span>
            <div className={styles.checks} role="group" aria-labelledby={`${uid}-show`}>
              {SHOW_OPTIONS.map(o => {
                const blocked = o.key === 'free' && !freeOk
                return (
                  <label key={o.key} className={styles.check} data-disabled={blocked || undefined}>
                    <input type="checkbox" checked={show[o.key] && !blocked} disabled={blocked} onChange={e => setFlag(o.key, e.target.checked)} />
                    <span>{o.label}</span>
                  </label>
                )
              })}
            </div>
            {!freeOk && <p className={f.hint}>Horários livres e bloqueios saem só com um profissional ou uma folha por profissional.</p>}
          </div>

          {loadFailed && <p className={f.error} role="alert">Não foi possível carregar a agenda desse período. Tente de novo.</p>}
          {!loading && !loadFailed && range.ok && result.sheets.length === 0 && (
            <p className={f.hint}>Nenhuma consulta nesse período com esses filtros.</p>
          )}
        </div>
      </Modal>
      {job && range.ok && typeof document !== 'undefined' && createPortal(
        <PrintRoot
          sheets={result.sheets}
          clinicName={clinicName}
          title={periodTitle(range.start, range.end)}
          multiDay={range.days > 1}
          show={show}
          userName={userName}
          printedAt={job.printedAt}
        />,
        document.body,
      )}
    </>
  )
}

// ── Folha impressa (A4) ───────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

// Classes globais com prefixo: o módulo CSS não aceita seletor sem classe local (@page, html[...], body > *).
const PRINT_CSS = `
[data-agenda-print-root]{display:none}
@page{size:A4;margin:14mm 12mm 16mm;
  @bottom-left{content:"MyClinica";font:8.5pt -apple-system,"Helvetica Neue",Arial,sans-serif;color:#777}
  @bottom-right{content:"Página " counter(page) " de " counter(pages);font:8.5pt -apple-system,"Helvetica Neue",Arial,sans-serif;color:#777}
}
@media print{
  html[data-print-agenda],html[data-print-agenda] body{height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important;touch-action:auto!important;max-width:none!important}
  html[data-print-agenda] body>*:not([data-agenda-print-root]){display:none!important}
  html[data-print-agenda] [data-agenda-print-root]{display:block!important;position:static!important;color:#111;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:10.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .agp-folha{break-after:page;page-break-after:always}
  .agp-folha:last-child{break-after:auto;page-break-after:auto}
  .agp-folha *{box-sizing:border-box}
  .agp-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12pt;border-bottom:1.5pt solid #111;padding-bottom:6pt;margin-bottom:8pt}
  .agp-head h1{font-size:14pt;margin:0 0 2pt;font-weight:700;color:#111}
  .agp-sub{margin:0;color:#444}
  .agp-meta{text-align:right;color:#444;font-size:9pt;line-height:1.4;flex-shrink:0}
  .agp-day{margin:10pt 0 4pt;font-size:10.5pt;font-weight:700;text-transform:capitalize;break-after:avoid;page-break-after:avoid}
  .agp-table{width:100%;border-collapse:collapse;table-layout:fixed}
  .agp-table thead{display:table-header-group}
  .agp-table tr{break-inside:avoid;page-break-inside:avoid}
  .agp-table th{text-align:left;font-size:8.5pt;text-transform:uppercase;letter-spacing:.3pt;color:#555;font-weight:600;padding:4pt 4pt;border-bottom:.75pt solid #999}
  .agp-table td{padding:6pt 4pt;border-bottom:.5pt solid #ccc;vertical-align:top;overflow-wrap:anywhere}
  .agp-table td.agp-hora{font-weight:600;white-space:nowrap}
  .agp-table td.agp-fone{white-space:nowrap;overflow-wrap:normal}
  .agp-table td.agp-nome{font-weight:600}
  .agp-obs{display:block;font-weight:400;color:#555;font-size:8.5pt;margin-top:1pt}
  .agp-table tr.agp-livre td,.agp-table tr.agp-bloq td{color:#888;padding-top:4pt;padding-bottom:4pt}
  .agp-table tr.agp-bloq td{font-style:italic}
  .agp-box{display:inline-block;width:10pt;height:10pt;border:.75pt solid #333}
  .agp-status{font-size:9pt}
  .agp-resumo{margin:8pt 0 0;font-size:9pt;color:#333}
}
`

interface Col { key: string; label: string; width: number }

function PrintRoot({ sheets, clinicName, title, multiDay, show, userName, printedAt }: {
  sheets: PrintSheet[]; clinicName: string; title: string; multiDay: boolean; show: PrintShow; userName: string; printedAt: Date
}) {
  const printed = `${dateBr(printedAt)} às ${pad(printedAt.getHours())}:${pad(printedAt.getMinutes())}`
  return (
    <div data-agenda-print-root>
      <style>{PRINT_CSS}</style>
      {sheets.map(sheet => {
        // larguras do modelo (8/25/18/18/11/11/9), refeitas para 100% quando uma coluna some
        const cols: Col[] = [
          { key: 'hora', label: 'Hora', width: 8 },
          { key: 'paciente', label: 'Paciente', width: 25 },
          ...(sheet.showProfessional ? [{ key: 'prof', label: 'Profissional', width: 14 }] : []),
          ...(show.phone ? [{ key: 'fone', label: 'Telefone', width: 18 }] : []),
          { key: 'proc', label: 'Procedimento', width: 18 },
          ...(show.convenio ? [{ key: 'conv', label: 'Convênio', width: 11 }] : []),
          { key: 'status', label: 'Status', width: 11 },
          ...(show.arrival ? [{ key: 'chegou', label: 'Chegou', width: 9 }] : []),
        ]
        const total = cols.reduce((s, c) => s + c.width, 0)
        const span = cols.length - 1
        return (
          <section key={sheet.key} className="agp-folha">
            <header className="agp-head">
              <div>
                <h1>{clinicName}</h1>
                <p className="agp-sub">{title}{sheet.professional ? ` · ${sheet.professional}` : ''}</p>
              </div>
              <div className="agp-meta">
                {sheet.count} {sheet.count === 1 ? 'atendimento' : 'atendimentos'}<br />
                Impresso em {printed}<br />
                por {userName}
              </div>
            </header>
            {sheet.days.map(day => (
              <Fragment key={day.key}>
                {multiDay && <h2 className="agp-day">{day.title}</h2>}
                <table className="agp-table">
                  <colgroup>{cols.map(c => <col key={c.key} style={{ width: `${(c.width / total) * 100}%` }} />)}</colgroup>
                  <thead><tr>{cols.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {day.rows.map(r => r.kind !== 'appt' ? (
                      <tr key={r.key} className={r.kind === 'free' ? 'agp-livre' : 'agp-bloq'}>
                        <td className="agp-hora">{r.time}</td>
                        <td colSpan={span}>{r.text}</td>
                      </tr>
                    ) : (
                      <tr key={r.key}>
                        <td className="agp-hora">{r.time}</td>
                        <td className="agp-nome">
                          {r.patient}
                          {show.notes && r.notes && <span className="agp-obs">{r.notes}</span>}
                        </td>
                        {sheet.showProfessional && <td>{r.professional}</td>}
                        {show.phone && <td className="agp-fone">{r.phone}</td>}
                        <td>{r.procedure}</td>
                        {show.convenio && <td>{r.convenio}</td>}
                        <td className="agp-status">{r.statusLabel}</td>
                        {show.arrival && <td>{r.arrived || <span className="agp-box" />}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Fragment>
            ))}
            {sheet.summary && <p className="agp-resumo">{sheet.summary}</p>}
          </section>
        )
      })}
    </div>
  )
}
