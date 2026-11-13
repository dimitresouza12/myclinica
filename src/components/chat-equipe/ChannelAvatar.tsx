import { UserAvatar } from '@/components/ui/UserAvatar'
import { Icon } from '@/components/ui/Icon'
import { avatarTone } from '@/lib/ui/avatarTone'
import type { TeamChannelKind } from '@/lib/teamChat/types'
import styles from './ChatEquipe.module.css'

interface Props {
  kind: TeamChannelKind
  name: string
  size?: number
  /** foto de perfil da pessoa (conversa direta); sem ela, iniciais */
  avatar?: string | null
}

/** Círculo do canal: iniciais de quem está na conversa direta; ícone para geral, áreas e grupos. */
export function ChannelAvatar({ kind, name, size = 40, avatar }: Props) {
  const tone = styles[`tone${avatarTone(name)}`]
  if (kind === 'direct') {
    return <UserAvatar name={name} avatar={avatar} size={size} />
  }
  return (
    <span className={`${styles.avatar} ${tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon name={kind === 'area' ? 'chat' : 'team'} size={Math.round(size * 0.45)} />
    </span>
  )
}
