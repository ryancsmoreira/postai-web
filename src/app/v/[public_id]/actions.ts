'use server'

import { createClientServer } from '@/lib/supabase'

/**
 * Cadastra o lead do aluno e vincula ao vídeo.
 */
export async function registerLead(params: {
  videoId: string
  name: string
  phone: string
  instagram?: string
}) {
  console.log('📝 [Server Action] registerLead iniciada com params:', params)
  try {
    const supabase = await createClientServer()
    console.log('📝 [Server Action] Supabase client criado')

    const { data, error } = await supabase
      .from('web_leads')
      .insert({
        video_id: params.videoId,
        name: params.name,
        phone: params.phone,
        instagram: params.instagram || null,
      })

    if (error) {
      console.error('🚨 [Server Action] Erro do Supabase ao cadastrar lead:', error)
      throw new Error(`Erro ao salvar seus dados: ${error.message}`)
    }

    console.log('✅ [Server Action] Lead cadastrado com sucesso!', data)
    return { success: true }
  } catch (err: any) {
    console.error('🚨 [Server Action] Exceção em registerLead:', err)
    throw err
  }
}

/**
 * Incrementa o contador de downloads de um vídeo.
 */
export async function incrementDownload(videoId: string) {
  const supabase = await createClientServer()

  // Como o RLS permite leitura pública e não queremos abrir escrita pública arbitrária,
  // fazemos a atualização usando RPC ou direto se a política permitir.
  // Como nossa RLS permite apenas leitura de vídeos e escrita via autenticação,
  // para o aluno público incrementar o download podemos usar uma query direta do lado do servidor
  // (o cliente do servidor ignora o RLS se usar a service role, ou podemos simplesmente fazer com o cliente de cookies/anon,
  // mas para garantir o bypass do RLS para esse campo específico, podemos usar o clientAdmin!).
  // Sim! Usar o createClientAdmin garante que o contador possa ser incrementado mesmo que a tabela esteja bloqueada para updates públicos.
  // Isso é extremamente robusto!
  const { createClientAdmin } = await import('@/lib/supabase')
  const supabaseAdmin = createClientAdmin()

  // Incrementa downloads usando sql inline no update ou buscando e somando
  const { data: videoData } = await supabaseAdmin
    .from('web_videos')
    .select('downloads')
    .eq('id', videoId)
    .single()

  const currentDownloads = videoData?.downloads || 0

  const { error } = await supabaseAdmin
    .from('web_videos')
    .update({ downloads: currentDownloads + 1 })
    .eq('id', videoId)

  if (error) {
    console.error('Erro ao incrementar download:', error)
    return false
  }

  return true
}
