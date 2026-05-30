'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  BarChart3, Users, Film, PlusCircle, LogOut, Loader2, 
  Download, Target, Instagram, MessageCircle, MapPin, Mail, Key, UserPlus
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { getAdminData, createAcademy, registerVideomaker } from './actions'

type TabType = 'overview' | 'manage' | 'videos' | 'leads'

export default function AdminDashboard() {
  const router = useRouter()
  const { showToast } = useToast()
  const supabase = createClient()

  // Estados de Controle
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [isDataLoading, setIsDataLoading] = useState(true)
  const [adminUser, setAdminUser] = useState<any>(null)

  // Estados dos Dados do Banco
  const [dashboardData, setDashboardData] = useState<{
    metrics: { totalVideos: number; totalLeads: number; totalDownloads: number; conversionRate: number }
    videos: any[]
    leads: any[]
    academies: any[]
  }>({
    metrics: { totalVideos: 0, totalLeads: 0, totalDownloads: 0, conversionRate: 0 },
    videos: [],
    leads: [],
    academies: []
  })

  // Formulário - Nova Academia
  const [academyName, setAcademyName] = useState('')
  const [isCreatingAcademy, setIsCreatingAcademy] = useState(false)

  // Formulário - Novo Videomaker
  const [videomakerName, setVideomakerName] = useState('')
  const [videomakerEmail, setVideomakerEmail] = useState('')
  const [videomakerPassword, setVideomakerPassword] = useState('')
  const [selectedAcademyId, setSelectedAcademyId] = useState('')
  const [isRegisteringVideomaker, setIsRegisteringVideomaker] = useState(false)

  // Verifica Auth
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('ℹ️ [PostAI Admin] Verificando sessão administrativa...');
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          console.log('ℹ️ [PostAI Admin] Nenhuma sessão ativa. Redirecionando para login.');
          router.push('/login')
          return
        }

        console.log('ℹ️ [PostAI Admin] Sessão encontrada. Verificando papel de administrador...');
        const { data: profile, error: profileErr } = await supabase
          .from('web_users')
          .select('id, name, email, role')
          .eq('id', session.user.id)
          .single()

        if (profileErr) {
          console.error('🚨 [PostAI Admin] Erro ao buscar perfil web_users:', profileErr);
          showToast('Erro ao validar seu perfil administrativo.', 'error')
          await supabase.auth.signOut()
          router.push('/login')
          return
        }

        if (!profile || profile.role !== 'admin') {
          console.warn('⚠️ [PostAI Admin] Usuário logado não possui papel de admin:', profile);
          showToast('Acesso negado. Apenas administradores.', 'error')
          await supabase.auth.signOut()
          router.push('/login')
          return
        }

        console.log('ℹ️ [PostAI Admin] Administrador validado:', profile);
        setAdminUser(profile)
        await fetchData()
      } catch (err: any) {
        console.error('🚨 [PostAI Admin] Erro crítico na validação do admin:', err);
        showToast('Erro de conexão ao validar administrador.', 'error')
        router.push('/login')
      } finally {
        setIsAuthLoading(false)
      }
    }

    checkAuth()
  }, [supabase, router, showToast])

  // Busca Dados Gerais
  const fetchData = async () => {
    setIsDataLoading(true)
    try {
      const data = await getAdminData()
      setDashboardData(data)
    } catch {
      showToast('Erro ao atualizar os dados do painel.', 'error')
    } finally {
      setIsDataLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    showToast('Sessão administrativa encerrada.', 'success')
    router.push('/login')
  }

  // Criação de Academia
  const handleCreateAcademy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!academyName.trim()) {
      showToast('Digite o nome da academia.', 'warning')
      return
    }

    setIsCreatingAcademy(true)
    try {
      await createAcademy(academyName.trim())
      showToast('Academia cadastrada com sucesso!', 'success')
      setAcademyName('')
      await fetchData() // Recarrega dados
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar academia.', 'error')
    } finally {
      setIsCreatingAcademy(false)
    }
  }

  // Cadastro de Videomaker
  const handleRegisterVideomaker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!videomakerName.trim() || !videomakerEmail.trim() || !videomakerPassword || !selectedAcademyId) {
      showToast('Por favor, preencha todos os campos do videomaker.', 'warning')
      return
    }

    setIsRegisteringVideomaker(true)
    try {
      await registerVideomaker({
        name: videomakerName.trim(),
        email: videomakerEmail.trim(),
        password: videomakerPassword,
        academyId: selectedAcademyId
      })

      showToast('Videomaker cadastrado com sucesso! Já pode realizar login.', 'success')
      setVideomakerName('')
      setVideomakerEmail('')
      setVideomakerPassword('')
      setSelectedAcademyId('')
      await fetchData()
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar videomaker.', 'error')
    } finally {
      setIsRegisteringVideomaker(false)
    }
  }

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isAuthLoading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-dark-bg text-white">
        <Loader2 className="w-10 h-10 text-brand animate-spin mb-4" />
        <p className="text-zinc-400 text-sm">Validando credenciais administrativas...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-dark-bg min-h-screen">
      {/* Admin Header */}
      <header className="border-b border-white/5 bg-zinc-950/40 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              POST<span className="text-brand">AI</span>
            </h1>
            <span className="text-xs bg-brand/10 border border-brand/20 text-brand px-2 py-0.5 rounded-full font-medium ml-2">
              Painel Admin
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 hidden sm:inline">
              Administrador: <span className="text-white font-medium">{adminUser?.name}</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-zinc-400 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-white/5"
              title="Sair do Painel"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Navegação por Abas (Tabs) */}
      <div className="bg-zinc-950/20 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto gap-2 py-3 scrollbar-none">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 shrink-0 ${
              activeTab === 'overview'
                ? 'bg-brand text-dark-bg glow-glow'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Visão Geral
          </button>

          <button
            onClick={() => setActiveTab('manage')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 shrink-0 ${
              activeTab === 'manage'
                ? 'bg-brand text-dark-bg glow-glow'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Gestão Operacional
          </button>

          <button
            onClick={() => setActiveTab('videos')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 shrink-0 ${
              activeTab === 'videos'
                ? 'bg-brand text-dark-bg glow-glow'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Film className="w-4 h-4" />
            Vídeos Enviados
          </button>

          <button
            onClick={() => setActiveTab('leads')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 shrink-0 ${
              activeTab === 'leads'
                ? 'bg-brand text-dark-bg glow-glow'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4" />
            Leads Capturados
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
        
        {isDataLoading && activeTab !== 'manage' ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 text-brand animate-spin" />
          </div>
        ) : (
          <>
            {/* 1. ABA: VISÃO GERAL */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Grid de Métricas */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-6 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Vídeos Enviados</span>
                      <Film className="w-5 h-5 text-brand" />
                    </div>
                    <p className="text-3xl font-black text-white">{dashboardData.metrics.totalVideos}</p>
                  </Card>

                  <Card className="p-6 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Leads Capturados</span>
                      <Users className="w-5 h-5 text-emerald-400" />
                    </div>
                    <p className="text-3xl font-black text-white">{dashboardData.metrics.totalLeads}</p>
                  </Card>

                  <Card className="p-6 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Vídeos Baixados</span>
                      <Download className="w-5 h-5 text-blue-400" />
                    </div>
                    <p className="text-3xl font-black text-white">{dashboardData.metrics.totalDownloads}</p>
                  </Card>

                  <Card className="p-6 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Taxa de Conversão</span>
                      <Target className="w-5 h-5 text-yellow-400" />
                    </div>
                    <p className="text-3xl font-black text-white">{dashboardData.metrics.conversionRate}%</p>
                  </Card>
                </div>

                {/* Resumo Rápido */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Últimos Vídeos */}
                  <Card className="p-6 space-y-4">
                    <h3 className="text-base font-bold text-white uppercase tracking-wider border-b border-white/5 pb-3">
                      Últimos Envio de Vídeos
                    </h3>
                    <div className="space-y-4">
                      {dashboardData.videos.slice(0, 4).map((v) => (
                        <div key={v.id} className="flex justify-between items-center text-sm border-b border-white/5 pb-2 last:border-0">
                          <div>
                            <p className="text-white font-medium">{v.studentName}</p>
                            <p className="text-xs text-zinc-500">{v.academyName} • {formatDate(v.createdAt)}</p>
                          </div>
                          <span className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
                            <Download className="w-3.5 h-3.5 text-zinc-600" /> {v.downloads} dls
                          </span>
                        </div>
                      ))}
                      {dashboardData.videos.length === 0 && (
                        <p className="text-sm text-zinc-500 text-center py-4">Nenhum vídeo cadastrado.</p>
                      )}
                    </div>
                  </Card>

                  {/* Últimos Leads */}
                  <Card className="p-6 space-y-4">
                    <h3 className="text-base font-bold text-white uppercase tracking-wider border-b border-white/5 pb-3">
                      Últimos Alunos Cadastrados (Leads)
                    </h3>
                    <div className="space-y-4">
                      {dashboardData.leads.slice(0, 4).map((l) => (
                        <div key={l.id} className="flex justify-between items-center text-sm border-b border-white/5 pb-2 last:border-0">
                          <div>
                            <p className="text-white font-medium">{l.name}</p>
                            <p className="text-xs text-zinc-500">{l.academyName} • {formatDate(l.createdAt)}</p>
                          </div>
                          <div className="flex gap-2">
                            {l.instagram && (
                              <a
                                href={`https://instagram.com/${l.instagram}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-pink-400 p-1 hover:bg-white/5 rounded-lg transition-colors"
                              >
                                <Instagram className="w-4 h-4" />
                              </a>
                            )}
                            <a
                              href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 p-1 hover:bg-white/5 rounded-lg transition-colors"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ))}
                      {dashboardData.leads.length === 0 && (
                        <p className="text-sm text-zinc-500 text-center py-4">Nenhum lead capturado ainda.</p>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* 2. ABA: GESTÃO OPERACIONAL */}
            {activeTab === 'manage' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Formulário de Academia */}
                <Card className="p-6 md:p-8 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-white">Cadastrar Academia</h3>
                    <p className="text-zinc-500 text-xs mt-1">
                      Adicione novas academias e unidades operacionais.
                    </p>
                  </div>
                  <form onSubmit={handleCreateAcademy} className="space-y-4">
                    <Input
                      label="Nome da Academia"
                      type="text"
                      placeholder="Ex: SIX - Unidade Itaim"
                      icon={<MapPin className="w-5 h-5" />}
                      value={academyName}
                      onChange={(e) => setAcademyName(e.target.value)}
                      disabled={isCreatingAcademy}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      fullWidth
                      isLoading={isCreatingAcademy}
                    >
                      Salvar Academia
                    </Button>
                  </form>

                  {/* Listagem Simples de Academias */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Academias Ativas ({dashboardData.academies.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {dashboardData.academies.map((ac) => (
                        <span key={ac.id} className="text-xs bg-zinc-900 border border-white/5 text-zinc-300 px-3 py-1.5 rounded-xl font-medium">
                          {ac.name}
                        </span>
                      ))}
                      {dashboardData.academies.length === 0 && (
                        <span className="text-xs text-zinc-500">Nenhuma academia ativa cadastrada.</span>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Formulário de Videomaker */}
                <Card className="p-6 md:p-8 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-white">Registrar Novo Videomaker</h3>
                    <p className="text-zinc-500 text-xs mt-1">
                      Crie credenciais de videomaker para iniciar os uploads.
                    </p>
                  </div>
                  <form onSubmit={handleRegisterVideomaker} className="space-y-4">
                    <Input
                      label="Nome Completo"
                      type="text"
                      placeholder="Ex: Rodrigo Videomaker"
                      icon={<Users className="w-5 h-5" />}
                      value={videomakerName}
                      onChange={(e) => setVideomakerName(e.target.value)}
                      disabled={isRegisteringVideomaker}
                    />

                    <Input
                      label="E-mail"
                      type="email"
                      placeholder="rodrigo@academia.com"
                      icon={<Mail className="w-5 h-5" />}
                      value={videomakerEmail}
                      onChange={(e) => setVideomakerEmail(e.target.value)}
                      disabled={isRegisteringVideomaker}
                    />

                    <Input
                      label="Senha Provisória"
                      type="password"
                      placeholder="Min. 6 caracteres"
                      icon={<Key className="w-5 h-5" />}
                      value={videomakerPassword}
                      onChange={(e) => setVideomakerPassword(e.target.value)}
                      disabled={isRegisteringVideomaker}
                    />

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Academia Vinculada
                      </label>
                      <select
                        className="w-full bg-zinc-900/60 border border-white/10 rounded-xl py-3 pl-4 pr-10 text-sm text-white focus:outline-none focus:border-brand/40 transition-all appearance-none"
                        value={selectedAcademyId}
                        onChange={(e) => setSelectedAcademyId(e.target.value)}
                        disabled={isRegisteringVideomaker}
                      >
                        <option value="">Selecione...</option>
                        {dashboardData.academies.map((ac) => (
                          <option key={ac.id} value={ac.id}>
                            {ac.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      fullWidth
                      isLoading={isRegisteringVideomaker}
                    >
                      Cadastrar Videomaker
                    </Button>
                  </form>
                </Card>
              </div>
            )}

            {/* 3. ABA: LISTAGEM DE VÍDEOS */}
            {activeTab === 'videos' && (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-lg font-bold text-white">Histórico de Vídeos Enviados</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-zinc-300">
                    <thead className="bg-zinc-950/40 text-xs font-bold uppercase tracking-wider text-zinc-500 border-b border-white/5">
                      <tr>
                        <th className="p-4">Aluno</th>
                        <th className="p-4">WhatsApp</th>
                        <th className="p-4">Unidade</th>
                        <th className="p-4">Data Envio</th>
                        <th className="p-4 text-center">Downloads</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {dashboardData.videos.map((video) => (
                        <tr key={video.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 font-semibold text-white">{video.studentName}</td>
                          <td className="p-4 font-mono text-xs">{video.studentPhone}</td>
                          <td className="p-4">{video.academyName}</td>
                          <td className="p-4 text-xs text-zinc-500">{formatDate(video.createdAt)}</td>
                          <td className="p-4 text-center font-bold text-brand">{video.downloads}</td>
                        </tr>
                      ))}
                      {dashboardData.videos.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-zinc-500">Nenhum vídeo enviado.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* 4. ABA: LISTAGEM DE LEADS */}
            {activeTab === 'leads' && (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-lg font-bold text-white">Alunos Cadastrados (Leads Operacionais)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-zinc-300">
                    <thead className="bg-zinc-950/40 text-xs font-bold uppercase tracking-wider text-zinc-500 border-b border-white/5">
                      <tr>
                        <th className="p-4">Nome do Aluno</th>
                        <th className="p-4">Celular/WhatsApp</th>
                        <th className="p-4">Instagram</th>
                        <th className="p-4">Academia</th>
                        <th className="p-4">Data Cadastro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {dashboardData.leads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 font-semibold text-white">{lead.name}</td>
                          <td className="p-4">
                            <a
                              href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs text-emerald-400 hover:underline flex items-center gap-1"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              {lead.phone}
                            </a>
                          </td>
                          <td className="p-4">
                            {lead.instagram ? (
                              <a
                                href={`https://instagram.com/${lead.instagram}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-pink-400 hover:underline flex items-center gap-1 text-xs"
                              >
                                <Instagram className="w-3.5 h-3.5" />
                                @{lead.instagram}
                              </a>
                            ) : (
                              <span className="text-zinc-600 text-xs">-</span>
                            )}
                          </td>
                          <td className="p-4">{lead.academyName}</td>
                          <td className="p-4 text-xs text-zinc-500">{formatDate(lead.createdAt)}</td>
                        </tr>
                      ))}
                      {dashboardData.leads.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-zinc-500">Nenhum lead capturado ainda.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  )
}
