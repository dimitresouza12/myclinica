import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { STATUS_LABEL, type ContractStatus } from '@/lib/contratos/status'

const TONE: Record<ContractStatus, BadgeTone> = {
  rascunho: 'neutral',
  enviado: 'info',
  assinado: 'success',
  vencido: 'danger',
  cancelado: 'neutral',
}

/** Estado do contrato em pílula: a cor acompanha o texto, nunca o substitui. */
export function ContratoBadge({ status }: { status: ContractStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>
}
