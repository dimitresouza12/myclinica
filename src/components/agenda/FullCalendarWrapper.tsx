'use client'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import googleCalendarPlugin from '@fullcalendar/google-calendar'
import type { EventClickArg, DateSelectArg, DatesSetArg } from '@fullcalendar/core'
import './fullcalendar.css'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end?: string
  color: string
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
  { events, view, googleCalendarId, onEventClick, onDateSelect, onTitleChange },
  ref
) {
  const GAPI_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  const calRef = useRef<FullCalendar>(null)

  const eventSources = [
    { events },
    ...(googleCalendarId && GAPI_KEY
      ? [{ googleCalendarId, className: 'gcal-event' }]
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
      select={(arg: DateSelectArg) => onDateSelect(arg.startStr)}
      eventClick={(arg: EventClickArg) => {
        arg.jsEvent.preventDefault()
        const id = arg.event.id
        if (id) onEventClick(id)
      }}
      datesSet={(arg: DatesSetArg) => onTitleChange?.(arg.view.title)}
      height="auto"
      eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
    />
  )
})

export default FullCalendarWrapper
