// Google Calendar OAuth2 via Google Identity Services (GIS)
// Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID in environment

const SCOPE = 'https://www.googleapis.com/auth/calendar'
const TOKEN_KEY = 'gcal_access_token'
const TOKEN_EXPIRY_KEY = 'gcal_token_expiry'
// Persists user intent to stay connected across token expiry
const CONNECTED_KEY = 'gcal_connected'

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

export async function connectGoogleCalendar(): Promise<string> {
  await loadGIS()
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID não configurado.')

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return }
        const expiry = Date.now() + resp.expires_in * 1000
        localStorage.setItem(TOKEN_KEY, resp.access_token)
        localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiry))
        localStorage.setItem(CONNECTED_KEY, '1')
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken()
  })
}

/** Returns a valid token if available, null if expired (but user may still be "connected"). */
export function getGCalToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem(TOKEN_KEY)
  const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) ?? 0)
  if (!token || Date.now() > expiry) return null
  return token
}

/** Returns true if user has previously connected and not disconnected, even if token is expired. */
export function isGCalConnected(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(CONNECTED_KEY) === '1'
}

/** Silently refreshes the token without showing the Google consent popup (uses prompt='none'). */
export async function silentRefreshGCal(): Promise<string | null> {
  if (!isGCalConnected()) return null
  await loadGIS()
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) return null

  return new Promise((resolve) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) { resolve(null); return }
          const expiry = Date.now() + resp.expires_in * 1000
          localStorage.setItem(TOKEN_KEY, resp.access_token)
          localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiry))
          resolve(resp.access_token)
        },
      })
      // prompt: 'none' is not standard in GIS token client — we use requestAccessToken
      // which triggers silent grant if session is still active in the browser
      client.requestAccessToken()
    } catch {
      resolve(null)
    }
  })
}

export function disconnectGoogleCalendar() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
  localStorage.removeItem(CONNECTED_KEY)
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
        if (res.status === 401) {
          disconnectGoogleCalendar()
          throw new Error('Token expirado. Reconecte o Google Calendar.')
        }
        const body = await res.text().catch(() => '')
        console.warn(`[GCal] Falha em ${calId}: ${res.status} ${res.statusText}`, body)
        if (res.status === 403 || res.status === 404) return []
        throw new Error(`Erro ao buscar eventos do calendário ${calId}.`)
      }
      const json = await res.json()
      const items: GCalEvent[] = json.items ?? []
      console.log(`[GCal] ${calId}: ${items.length} evento(s)`)
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
