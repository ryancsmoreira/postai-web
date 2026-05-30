'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export default function RootPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkSessionAndRedirect = async () => {
      try {
        console.log('ℹ-[PostAI Root] Verificando sessão de usuário...');
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          console.log('ℹ-[PostAI Root] Sem sessão ativa. Redirecionando para login.');
          router.push('/login')
          return
        }

        console.log('ℹ-[PostAI Root] Usuário logado. Buscando perfil...');
        // Busca o perfil do usuário para saber para qual painel redirecionar
        const { data: profile, error: profileErr } = await supabase
          .from('web_users')
          .select('role')
          .eq('id', session.user.id)
          .single()

        if (profileErr) {
          console.error('🚨 [PostAI Root] Erro ao buscar perfil web_users:', profileErr);
          router.push('/login')
          return
        }

        if (profile?.role === 'admin') {
          console.log('ℹ-[PostAI Root] Papel admin detectado. Redirecionando para /admin');
          router.push('/admin')
        } else {
          console.log('ℹ-[PostAI Root] Papel videomaker detectado. Redirecionando para /videomaker');
          router.push('/videomaker')
        }
      } catch (err) {
        console.error('🚨 [PostAI Root] Erro crítico no redirecionamento inicial:', err);
        router.push('/login')
      }
    }

    checkSessionAndRedirect()
  }, [supabase, router])

  return (
    <div className="flex-1 flex flex-col justify-center items-center bg-dark-bg text-white">
      <Loader2 className="w-10 h-10 text-brand animate-spin mb-4" />
      <p className="text-zinc-400 text-sm">Direcionando você para a plataforma...</p>
    </div>
  )
}
