import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'

export async function logout() {
  await supabase.auth.signOut()
  useAuthStore.getState().clearSession()
  try {
    window.localStorage.removeItem('myclinica-auth')
    // Limpa também a sessão do Supabase Auth para evitar JWT residual
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach((k) => window.localStorage.removeItem(k))
  } catch { /* ignore */ }
  // Hard navigation para garantir reset completo de qualquer estado em memória
  window.location.href = '/login'
}
