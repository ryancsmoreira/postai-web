'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const supabase = createClient()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Verifica se já está logado e redireciona
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: profile } = await supabase
          .from('web_users')
          .select('role')
          .eq('id', session.user.id)
          .single()
        
        if (profile?.role === 'admin') {
          router.push('/admin')
        } else {
          router.push('/videomaker')
        }
      }
    }
    checkUser()
  }, [supabase, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      showToast('Por favor, preencha todos os campos.', 'warning')
      return
    }

    setIsLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        showToast('Credenciais inválidas. Verifique seus dados.', 'error')
        setIsLoading(false)
        return
      }

      if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from('web_users')
          .select('role')
          .eq('id', data.user.id)
          .single()

        if (profileError || !profile) {
          showToast('Perfil de usuário não encontrado.', 'error')
          await supabase.auth.signOut()
          setIsLoading(false)
          return
        }

        showToast('Login realizado com sucesso!', 'success')
        
        if (profile.role === 'admin') {
          router.push('/admin')
        } else {
          router.push('/videomaker')
        }
      }
    } catch {
      showToast('Ocorreu um erro ao tentar fazer login.', 'error')
      setIsLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 relative overflow-hidden bg-dark-bg">
      {/* Luzes de fundo decorativas */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-10 left-10 w-[300px] h-[300px] bg-brand/3 rounded-full blur-[80px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Logo e cabeçalho */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-brand/10 border border-brand/20 rounded-2xl flex items-center justify-center glow-glow mb-4">
            <Zap className="w-8 h-8 text-brand animate-pulse" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
            POST<span className="text-brand">AI</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Portal exclusivo para videomakers e administradores
          </p>
        </div>

        {/* Card de Login */}
        <Card className="p-6 md:p-8" glow>
          <form onSubmit={handleLogin} className="space-y-6">
            <Input
              label="E-mail"
              type="email"
              placeholder="seuemail@academia.com"
              icon={<Mail className="w-5 h-5" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />

            <Input
              label="Senha"
              type="password"
              placeholder="••••••••"
              icon={<Lock className="w-5 h-5" />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
            >
              Acessar Plataforma
            </Button>
          </form>
        </Card>

        {/* Rodapé da SIX */}
        <p className="text-center text-xs text-zinc-600 mt-8">
          Desenvolvido exclusivamente para a academia <span className="text-zinc-400 font-semibold">SIX</span>.
        </p>
      </div>
    </div>
  )
}
