// Google Calendar OAuth2 via Google Identity Services (GIS)
// Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID in environment

import { supabase } from './supabase'

const SCOPE = 'https://www.googleapis.com/auth/calendar'
const TOKEN_KEY = 'gcal_access_token'
const TOKEN_EXPIRY_KEY = 'gcal_token_expiry'

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (resp: { access_token: string; expires_in: number; error?: string }) => void
          }) => { requestAccessToken: () => void }
        }
      }
    }
  }
}

function loadGIS(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return
    if (window.google?.accounts?.oauth2) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => resolve()
    script.async = true
    document.head.appendChild(script)
  })
}

function saveTokenLocally(token: string, expiresIn: number) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresIn * 1000))
}

export async function connectGoogleCalendar(): Promise<string> {
  await loadGIS()
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID não configurado.')

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: async (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return }
        saveTokenLocally(resp.access_token, resp.expires_in)
        // Persiste flag de conexão no banco (por clínica, não por dispositivo)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: cu } = await supabase
            .from('clinic_users')
            .select('clinic_id')
            .eq('user_id', user.id)
            .single()
          if (cu?.clinic_id) {
            await supabase.from('clinics').update({ gcal_connected: true }).eq('id', cu.clinic_id)
          }
        }
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken()
  })
}

export function getGCalToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem(TOKEN_KEY)
  const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) ?? 0)
  if (!token || Date.now() > expiry) return null
  return token
}

export function isGCalConnected(gcalConnectedFromStore?: boolean): boolean {
  // Fonte primária: banco (via store). Fallback: localStorage para compatibilidade.
  if (gcalConnectedFromStore !== undefined) return gcalConnectedFromStore
  if (typeof window === 'undefined') return false
  return localStorage.getItem('gcal_connected') === '1'
}

export async function silentRefreshGCal(gcalConnected: boolean): Promise<string | null> {
  if (!gcalConnected) return null
  await loadGIS()
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) return null

  return new Promise((resolve) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        // prompt vazio = silent refresh sem popup (usa sessão Google já ativa no browser)
        prompt: '',
        callback: (resp) => {
          if (resp.error) { resolve(null); return }
          saveTokenLocally(resp.access_token, resp.expires_in)
          resolve(resp.access_token)
        },
      } as Parameters<typeof window.google.accounts.oauth2.initTokenClient>[0])
      client.requestAccessToken()
    } catch {
      resolve(null)
    }
  })
}

export async function disconnectGoogleCalendar(clinicId?: string) {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
  localStorage.removeItem('gcal_connected') // limpa flag legado
  if (clinicId) {
    await supabase.from('clinics').update({ gcal_connected: false }).eq('id', clinicId)
  }
}

export interface GCalEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  description?: string
  htmlLink?: string
  calendarId?: string
}

export async function fetchGCalEvents(
  token: string,
  timeMin: string,
  timeMax: string,
  calendarIds: string[] = ['primary']
): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
  })
  const unique = Array.from(new Set(calendarIds.filter(Boolean)))
  const results = await Promise.all(
    unique.map(async (calId) => {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) {
        if (res.status === 401) throw new Error('Token expirado. Reconecte o Google Calendar.')
        const body = await res.text().catch(() => '')
        console.warn(`[GCal] Falha em ${calId}: ${res.status} ${res.statusText}`, body)
        if (res.status === 403 || res.status === 404) return []
        throw new Error(`Erro ao buscar eventos do calendário ${calId}.`)
      }
      const json = await res.json()
      const items: GCalEvent[] = json.items ?? []
      return items.map((e) => ({ ...e, calendarId: calId }))
    })
  )
  return results.flat()
}

export async function createGCalEvent(token: string, event: {
  summary: string; description?: string; start: string; end: string
}): Promise<GCalEvent> {
  const body = {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.start, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: event.end, timeZone: 'America/Sao_Paulo' },
  }
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Erro ao criar evento no Google Calendar.')
  return res.json()
}

export async function updateGCalEvent(token: string, gcalEventId: string, event: {
  summary: string; description?: string; start: string; end: string
}): Promise<void> {
  const body = {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.start, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: event.end, timeZone: 'America/Sao_Paulo' },
  }
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalEventId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Erro ao atualizar evento no Google Calendar.')
}

export async function deleteGCalEvent(token: string, gcalEventId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalEventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 410) throw new Error('Erro ao remover evento do Google Calendar.')
}
