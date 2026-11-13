import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { avatarTone } from '@/lib/ui/avatarTone'
import type { TeamChannelKind } from '@/lib/teamChat/types'
import styles from './ChatEquipe.module.css'

interface Props {
  kind: TeamChannelKind
  name: string
  size?: number
}

/** Círculo do canal: iniciais de quem está na conversa direta; ícone para geral, áreas e grupos. */
export function ChannelAvatar({ kind, name, size = 40 }: Props) {
  const tone = styles[`tone${avatarTone(name)}`]
  if (kind === 'direct') {
    return <Avatar name={name} size={size} className={`${styles.avatar} ${tone}`} />
  }
  return (
    <span className={`${styles.avatar} ${tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon name={kind === 'area' ? 'chat' : 'team'} size={Math.round(size * 0.45)} />
    </span>
  )
}
