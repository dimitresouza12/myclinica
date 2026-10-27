/** Quantos tons de avatar existem (tokens --av0-* a --av5-* em design-system.css). */
export const AVATAR_TONES = 6

/** Tom do avatar derivado do nome: a mesma pessoa tem sempre a mesma cor. */
export function avatarTone(name: string): number {
  const key = name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  let h = 5381
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0
  return Math.abs(h) % AVATAR_TONES
}
