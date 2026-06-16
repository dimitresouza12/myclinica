const ASAAS_BASE = 'https://api.asaas.com/v3'

function headers() {
  return {
    'Content-Type': 'application/json',
    access_token: process.env.ASAAS_API_KEY!,
  }
}

export async function asaasPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Asaas POST ${path}: ${text}`)
  }
  return res.json()
}

export async function asaasGet<T>(path: string): Promise<T> {
  const res = await fetch(`${ASAAS_BASE}${path}`, { headers: headers() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Asaas GET ${path}: ${text}`)
  }
  return res.json()
}

export async function asaasPut<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Asaas PUT ${path}: ${text}`)
  }
  return res.json()
}
