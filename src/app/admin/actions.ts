'use server'

import { createClientServer, createClientAdmin } from '@/lib/supabase'

/**
 * Busca todas as academias, vídeos, leads e gera estatísticas gerais para o painel.
 */
export async function getAdminData() {
  const supabase = await createClientServer()

  // 1. Busca estatísticas e tabelas básicas
  const { data: videos } = await supabase
    .from('web_videos')
    .select('id, student_name, student_phone, downloads, created_at, academy_id')
    .order('created_at', { ascending: false })

  const { data: leads } = await supabase
    .from('web_leads')
    .select('id, name, phone, instagram, created_at, video_id')
    .order('created_at', { ascending: false })

  const { data: academies } = await supabase
    .from('web_academies')
    .select('id, name')
    .order('name', { ascending: true })

  // 2. Mapeamento de academias para busca rápida
  const academyMap = new Map<string, string>()
  academies?.forEach(a => academyMap.set(a.id, a.name))

  // 3. Estruturação dos logs de vídeos com o nome da academia
  const formattedVideos = (videos || []).map(v => ({
    id: v.id,
    studentName: v.student_name,
    studentPhone: v.student_phone,
    downloads: v.downloads,
    createdAt: v.created_at,
    academyName: academyMap.get(v.academy_id) || 'Desconhecida'
  }))

  // 4. Mapeamento de vídeos para descobrir de qual aluno/academia é o lead
  const videoMap = new Map<string, { studentName: string; academyName: string }>()
  videos?.forEach(v => {
    videoMap.set(v.id, {
      studentName: v.student_name,
      academyName: academyMap.get(v.academy_id) || 'Desconhecida'
    })
  })

  // 5. Estruturação dos logs de leads
  const formattedLeads = (leads || []).map(l => {
    const videoDetails = videoMap.get(l.video_id)
    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      instagram: l.instagram,
      createdAt: l.created_at,
      studentReference: videoDetails?.studentName || 'Vídeo excluído',
      academyName: videoDetails?.academyName || 'Desconhecida'
    }
  })

  // 6. Cálculo das métricas operacionais
  const totalVideos = formattedVideos.length
  const totalLeads = formattedLeads.length
  const totalDownloads = formattedVideos.reduce((acc, curr) => acc + curr.downloads, 0)
  
  // Taxa de conversão: porcentagem de vídeos que geraram pelo menos um lead
  const conversionRate = totalVideos > 0 
    ? Math.min(Math.round((totalLeads / totalVideos) * 100), 100) 
    : 0

  return {
    metrics: {
      totalVideos,
      totalLeads,
      totalDownloads,
      conversionRate
    },
    videos: formattedVideos,
    leads: formattedLeads,
    academies: academies || []
  }
}

/**
 * Cria uma nova academia.
 */
export async function createAcademy(name: string) {
  const supabase = await createClientServer()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Não autorizado.')
  }

  // Verifica se é administrador
  const { data: profile } = await supabase
    .from('web_users')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin') {
    throw new Error('Apenas administradores podem cadastrar academias.')
  }

  const { data, error } = await supabase
    .from('web_academies')
    .insert({ name })
    .select('id, name')
    .single()

  if (error) {
    console.error('Erro ao cadastrar academia:', error)
    throw new Error(`Erro ao salvar academia: ${error.message}`)
  }

  return data
}

/**
 * Registra programaticamente um novo Videomaker no Supabase Auth e perfil customizado.
 * Utiliza a Service Role para criar sem precisar de confirmação por e-mail.
 */
export async function registerVideomaker(params: {
  name: string
  email: string
  password: string
  academyId: string
}) {
  const supabase = await createClientServer()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Não autorizado.')
  }

  // Verifica se o usuário atual é admin
  const { data: profile } = await supabase
    .from('web_users')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin') {
    throw new Error('Acesso negado. Apenas administradores podem registrar novos usuários.')
  }

  // Inicializa o cliente Admin para criar credenciais de autenticação diretamente
  const supabaseAdmin = createClientAdmin()

  // Cria a conta do Videomaker no Auth
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true, // Já confirma o e-mail para que ele faça login imediatamente
    user_metadata: {
      name: params.name,
      role: 'videomaker',
      academy_id: params.academyId
    }
  })

  if (error) {
    console.error('Erro ao criar credenciais de videomaker:', error)
    throw new Error(`Falha ao registrar credenciais: ${error.message}`)
  }

  return {
    id: data.user.id,
    email: data.user.email,
  }
}
