'use client'
import { Avatar } from '@/components/ui/Avatar'
import { avatarTone } from '@/lib/ui/avatarTone'
import styles from './userAvatar.module.css'

interface Props {
  /** nome da pessoa (iniciais e cor de reserva) */
  name: string
  /** foto de perfil (data URL); sem ela aparecem as iniciais */
  avatar?: string | null
  size?: number
  /** `tone`: cor por pessoa (listas, chat); `brand`: cor da marca (menu do perfil) */
  variant?: 'tone' | 'brand'
  className?: string
}

/** Foto de perfil da pessoa com as iniciais como reserva. Reaproveita o Avatar (que já cai nas iniciais se a imagem falhar). */
export function UserAvatar({ name, avatar, size = 32, variant = 'tone', className }: Props) {
  const color = variant === 'brand' ? styles.brand : styles[`tone${avatarTone(name)}`]
  const fontSize = Math.max(10, Math.round(size * 0.36))
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0, fontSize }}>
      <Avatar url={avatar} name={name} size={size} className={`${styles.base} ${color} ${className ?? ''}`} />
    </span>
  )
}
