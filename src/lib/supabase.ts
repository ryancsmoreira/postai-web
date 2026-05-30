import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

// Cliente para componentes do lado do cliente (Browser)
export const createClient = () => {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// Cliente para Server Components, Server Actions e Route Handlers (com cookies)
export const createClientServer = async () => {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Pode ser ignorado se chamado em Server Components onde cookies não podem ser modificados diretamente
        }
      },
    },
  })
}

// Cliente admin com a chave Service Role (apenas para uso do lado do servidor)
export const createClientAdmin = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!serviceRoleKey) {
    console.warn('AVISO: SUPABASE_SERVICE_ROLE_KEY não configurada.')
  }
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
