// Foto do paciente: o banco guarda o CAMINHO no bucket privado `patient-avatars` (patients.avatar_url);
// para exibir, é preciso trocá-lo por uma URL assinada.
import { supabase } from '@/lib/supabase'

export const PATIENT_AVATAR_BUCKET = 'patient-avatars'
const SIGNED_URL_TTL = 3600
const SIGN_CHUNK = 100

/** Caminho padrão da foto: sempre o mesmo nome por paciente, só muda a extensão (webp, ou jpg se o navegador não souber WebP). */
export function patientAvatarPath(clinicId: string, patientId: string, mime: 'image/webp' | 'image/jpeg'): string {
  return `${clinicId}/${patientId}/avatar.${mime === 'image/webp' ? 'webp' : 'jpg'}`
}

/** Caminho no storage a partir do que está em patients.avatar_url; um https://... de versão antiga cai no nome fixo usado então. */
export function avatarStoragePath(stored: string | null | undefined, clinicId: string, patientId: string): string | null {
  const v = (stored ?? '').trim()
  if (!v) return null
  return /^https?:/i.test(v) ? `${clinicId}/${patientId}/avatar.jpg` : v
}

/** Assina vários caminhos de uma vez; o que falhar fica de fora (a tela mostra as iniciais). */
export async function signAvatarPaths(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  const out: Record<string, string> = {}
  for (let i = 0; i < unique.length; i += SIGN_CHUNK) {
    const chunk = unique.slice(i, i + SIGN_CHUNK)
    try {
      const { data } = await supabase.storage.from(PATIENT_AVATAR_BUCKET).createSignedUrls(chunk, SIGNED_URL_TTL)
      for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl
    } catch {
      // sem rede ou arquivo ausente: segue sem foto
    }
  }
  return out
}
