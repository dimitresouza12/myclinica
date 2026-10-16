import { waMeNumber } from '@/lib/phoneFormat'
import type { DashboardAlert, DashboardAlertReason } from '@/hooks/useClinicData'
import type { IconName } from '@/components/ui/Icon'

// "Ações necessárias": o que o Dashboard e a barra de cima mostram como pendência da clínica.

export const ALERT_META: Record<DashboardAlertReason, { label: string; icon: IconName; color: string }> = {
  faltou:        { label: 'Faltou',       icon: 'alert',    color: '#EF4444' },
  sem_retorno:   { label: 'Sem retorno',  icon: 'calendar', color: '#F59E0B' },
  aniversario:   { label: 'Aniversário',  icon: 'cake',     color: '#8B5CF6' },
  estoque_baixo: { label: 'Estoque baixo', icon: 'stock',   color: '#F59E0B' },
  pediu_remarcacao: { label: 'Pediu para remarcar', icon: 'swap', color: '#D97706' },
  respondeu:     { label: 'Respondeu',    icon: 'mail',     color: '#2563EB' },
  whatsapp_pausado: { label: 'WhatsApp pausado', icon: 'pause', color: '#DC2626' },
}

/** Pendências da clínica (não de um paciente): em vez de "Responder", levam à tela certa. */
export const SYSTEM_ALERT_LINK: Partial<Record<DashboardAlertReason, { href: string; label: string }>> = {
  estoque_baixo: { href: '/estoque', label: 'Ver estoque' },
  whatsapp_pausado: { href: '/configuracoes?tab=whatsapp', label: 'Ver WhatsApp' },
}

export function buildWaLink(phone: string, message: string): string {
  return `https://wa.me/${waMeNumber(phone)}?text=${encodeURIComponent(message)}`
}

export function alertMessage(reason: DashboardAlertReason, name: string, clinicName: string): string {
  const first = name.split(' ')[0]
  if (reason === 'pediu_remarcacao') return `Olá ${first}! Recebemos seu pedido para remarcar a consulta na ${clinicName}. Qual dia e horário ficam melhores para você?`
  if (reason === 'respondeu') return `Olá ${first}! Vimos sua mensagem sobre a consulta na ${clinicName}. Como podemos ajudar?`
  if (reason === 'faltou') return `Olá ${first}! Notamos que você não conseguiu comparecer à sua última consulta na ${clinicName}. Vamos reagendar? 😊`
  if (reason === 'aniversario') return `Olá ${first}! 🎉 A equipe da ${clinicName} deseja um Feliz Aniversário! Se quiser aproveitar para marcar sua próxima consulta, é só chamar por aqui.`
  return `Olá ${first}! Faz um tempo desde seu último atendimento na ${clinicName}. Que tal agendarmos seu retorno? 😊`
}

/** Soma o aviso de estoque baixo (vem de outra consulta) à lista de pendências. */
export function withLowStockAlert(alerts: DashboardAlert[], lowStockCount: number): DashboardAlert[] {
  if (lowStockCount <= 0) return [...alerts]
  return [...alerts, {
    patientId: 'estoque',
    name: `${lowStockCount} ${lowStockCount === 1 ? 'item' : 'itens'} abaixo do estoque mínimo`,
    phone: null,
    date: new Date().toISOString(),
    reason: 'estoque_baixo',
  }]
}

// ── Pendências que a pessoa mandou ignorar ──────────────────────────────────
// Ficam guardadas neste navegador, por clínica, e voltam sozinhas depois de 7 dias.

const IGNORE_DAYS = 7
const IGNORE_EVENT = 'myclinica-alerts-ignored'
export const ignoredStorageKey = (clinicId: string) => `myclinica-alerts-ignored:${clinicId}`

export function alertKeyOf(a: Pick<DashboardAlert, 'reason' | 'patientId'>): string {
  return `${a.reason}-${a.patientId}`
}

/** Lê o texto guardado e descarta o que já passou de 7 dias. */
export function parseIgnoredAlerts(raw: string | null, now: number): Record<string, number> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, number>
    const limit = now - IGNORE_DAYS * 24 * 60 * 60 * 1000
    return Object.fromEntries(Object.entries(parsed).filter(([, at]) => typeof at === 'number' && at > limit))
  } catch { return {} }
}

/** Para useSyncExternalStore: avisa quando a lista de ignoradas muda (nesta aba ou em outra). */
export function subscribeIgnoredAlerts(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(IGNORE_EVENT, onChange)
  return () => { window.removeEventListener('storage', onChange); window.removeEventListener(IGNORE_EVENT, onChange) }
}

export function ignoreAlert(clinicId: string, key: string, current: Record<string, number>, now = Date.now()) {
  try { window.localStorage.setItem(ignoredStorageKey(clinicId), JSON.stringify({ ...current, [key]: now })) } catch { /* sem armazenamento: vale só até recarregar */ }
  window.dispatchEvent(new Event(IGNORE_EVENT))
}
