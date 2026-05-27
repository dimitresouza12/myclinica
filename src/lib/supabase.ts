import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente único para componentes 'use client' — usa cookies (compatível com o middleware @supabase/ssr).
// Compartilhar uma instância evita múltiplos GoTrueClient warnings.
// persistSession + autoRefreshToken garantem que a sessão dure sem forçar novo login.
export const supabase = createBrowserClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

// Alias retrocompatível: pages que importavam `createClient()` continuam funcionando.
export const createClient = () => supabase
