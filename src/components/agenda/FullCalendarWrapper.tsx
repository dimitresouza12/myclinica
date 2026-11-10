'use client'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import googleCalendarPlugin from '@fullcalendar/google-calendar'
import type { EventClickArg, DateSelectArg, DatesSetArg } from '@fullcalendar/core'
import type { EventDropArg } from '@fullcalendar/core'
import './fullcalendar.css'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end?: string
  /** cor sólida (eventos do Google Calendar); consultas usam `classNames` e as cores do tema */
  color?: string
  classNames?: string[]
  /** 'background' pinta a faixa atrás das consultas (fora da escala); não é clicável nem arrastável */
  display?: 'auto' | 'background'
  /** false trava o arraste (bloqueios e consultas concluídas) */
  startEditable?: boolean
  extendedProps: Record<string, unknown>
}

export type CalendarView = 'dayGridMonth' | 'timeGridWeek'

export interface FullCalendarHandle {
  prev: () => void
  next: () => void
  today: () => void
  changeView: (view: CalendarView) => void
  gotoDate: (date: Date) => void
  getDate: () => Date | null
}

interface Props {
  events: CalendarEvent[]
  view: CalendarView
  googleCalendarId?: string
  onEventClick: (id: string) => void
  onDateSelect: (dateStr: string) => void
  onTitleChange?: (title: string) => void
  /** período visível (fim exclusivo), a cada navegação, para o mini calendário e a contagem da agenda */
  onRangeChange?: (start: Date, end: Date) => void
  /** consulta arrastada para outro horário ou dia; `revert` devolve o evento ao lugar */
  onEventDrop?: (id: string, start: Date, revert: () => void) => void
  /** horas visíveis na Semana ("07:00:00"); padrão 06:00 a 21:00 */
  slotMinTime?: string
  slotMaxTime?: string
}

const STATUS_COLORS: Record<string, string> = {
  agendado:  '#3B82F6',
  confirmado:'#10B981',
  concluido: '#6B7280',
  cancelado: '#EF4444',
  faltou:    '#F59E0B',
}

export function statusColor(status: string) {
  return STATUS_COLORS[status] ?? '#3B82F6'
}

const FullCalendarWrapper = forwardRef<FullCalendarHandle, Props>(function FullCalendarWrapper(
  { events, view, googleCalendarId, onEventClick, onDateSelect, onTitleChange, onRangeChange, onEventDrop, slotMinTime = '06:00:00', slotMaxTime = '21:00:00' },
  ref
) {
  const GAPI_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  const calRef = useRef<FullCalendar>(null)

  const eventSources = [
    { events },
    ...(googleCalendarId && GAPI_KEY
      ? [{ googleCalendarId, className: 'gcal-event', editable: false }]
      : []),
  ]

  useImperativeHandle(ref, () => ({
    prev: () => calRef.current?.getApi().prev(),
    next: () => calRef.current?.getApi().next(),
    today: () => calRef.current?.getApi().today(),
    changeView: (v: CalendarView) => calRef.current?.getApi().changeView(v),
    gotoDate: (date: Date) => calRef.current?.getApi().gotoDate(date),
    getDate: () => calRef.current?.getApi().getDate() ?? null,
  }))

  return (
    <FullCalendar
      ref={calRef}
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, googleCalendarPlugin]}
      initialView={view}
      locale="pt-br"
      headerToolbar={false}
      googleCalendarApiKey={GAPI_KEY}
      eventSources={eventSources}
      nowIndicator
      selectable
      selectMirror
      editable
      eventDurationEditable={false}
      eventDrop={(arg: EventDropArg) => {
        if (arg.event.id && arg.event.start) onEventDrop?.(arg.event.id, arg.event.start, arg.revert)
        else arg.revert()
      }}
      select={(arg: DateSelectArg) => onDateSelect(arg.startStr)}
      eventClick={(arg: EventClickArg) => {
        arg.jsEvent.preventDefault()
        const id = arg.event.id
        if (id) onEventClick(id)
      }}
      datesSet={(arg: DatesSetArg) => {
        onTitleChange?.(arg.view.title)
        onRangeChange?.(arg.view.currentStart, arg.view.currentEnd)
      }}
      // Cabeçalho da coluna: dia da semana em letras minúsculas; na Semana o número do dia vai grande embaixo
      // (hoje fica num círculo escuro, ver fullcalendar.css).
      dayHeaderContent={arg => {
        // no Mês a data do cabeçalho é um marcador em UTC (no Brasil cairia um dia antes): usa o texto pronto do FullCalendar
        if (arg.view.type !== 'timeGridWeek') return arg.text.replace('.', '').toLowerCase()
        const dow = arg.date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
        // html (e não JSX): o conteúdo em React do FullCalendar chama flushSync durante a renderização e o React reclama
        return { html: `<span class="fc-dh"><span class="fc-dh-dow">${dow}</span><span class="fc-dh-num">${arg.date.getDate()}</span></span>` }
      }}
      height="auto"
      // Quem rola é o .calendarWrap (div externo), não o FullCalendar. O
      // sticky é feito por CSS puro ancorado no .calendarWrap (ver
      // .fc-scrollgrid-section-header em fullcalendar.css) — só isso já
      // resolve. stickyHeaderDates precisa continuar false explicitamente:
      // com height="auto" o próprio FullCalendar reativa seu mecanismo
      // interno de sticky mesmo se a prop for só omitida (ele trata
      // 'auto' como true quando height é "auto"), e esse mecanismo tem
      // CSS (.fc-scrollgrid-section-sticky, top:0) com especificidade
      // maior que a nossa, além de ser exatamente o que causava o
      // vazamento de evento por trás do cabeçalho antes.
      stickyHeaderDates={false}
      eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      // Blocos estreitos (agendamentos que colidem, dividem a largura) não
      // têm espaço pro intervalo completo "09:00 - 10:00" — só a hora de
      // início já basta, a duração aparece pela altura do bloco.
      displayEventEnd={false}
      // Padrão do FullCalendar (slotEventOverlap:true) empilha agendamentos
      // conflitantes: o primeiro fica em largura cheia e o segundo por cima
      // dele, menor — texto ilegível quando dois profissionais têm horário
      // colidindo. Com false, divide a largura entre os dois lado a lado.
      slotEventOverlap={false}
      dayMaxEvents={4}
      moreLinkText={n => `+${n} mais`}
      slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      slotMinTime={slotMinTime}
      slotMaxTime={slotMaxTime}
      allDaySlot={false}
    />
  )
})

export default FullCalendarWrapper
