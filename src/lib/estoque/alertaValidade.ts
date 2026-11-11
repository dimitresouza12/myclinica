// Aviso de validade no sino de pendências (junto do "abaixo do estoque mínimo"). Reaproveita o grupo "Estoque":
// mesmo tipo e mesmo destino (/estoque); o que muda é o texto e a chave, para dispensar um aviso sem esconder o outro.
import type { DashboardAlert } from '@/hooks/useClinicData'

export function withExpiryAlert(alerts: DashboardAlert[], texto: string | null): DashboardAlert[] {
  if (!texto) return [...alerts]
  return [...alerts, {
    patientId: 'estoque_validade',
    name: texto,
    phone: null,
    date: new Date().toISOString(),
    reason: 'estoque_baixo',
  }]
}
