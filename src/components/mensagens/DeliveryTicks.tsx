import { Icon } from '@/components/ui/Icon'
import { STATUS_LABEL, type DeliveryStatus } from '@/lib/whatsapp/message-events'
import styles from './Inbox.module.css'

/**
 * Estado da mensagem enviada em ícone: um tique (enviada), dois (entregue), dois na cor da marca (lida).
 * O texto vai em aria-label e title; a diferença entre os estados também está na forma, não só na cor.
 */
export function DeliveryTicks({ status }: { status: DeliveryStatus }) {
  return (
    <span className={`${styles.ticks} ${status === 'read' ? styles.ticksRead : ''}`} role="img" aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]}>
      <Icon name={status === 'sent' ? 'check' : 'checkDouble'} size={15} />
    </span>
  )
}
