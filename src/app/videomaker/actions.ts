'use server'

import { createClientServer } from '@/lib/supabase'
import { generateUploadUrl } from '@/lib/r2'

// Interface para retornar dados de academias
export interface Academy {
  id: string
  name: string
}

/**
 * Busca a lista de academias disponíveis.
 */
export async function getAcademies(): Promise<Academy[]> {
  const supabase = await createClientServer()
  const { data, error } = await supabase
    .from('web_academies')
    .select('id, name')
    .order('name', { ascending: true })

  if (error) {
    console.error('Erro ao buscar academias:', error.message)
    return []
  }

  return data || []
}

/**
 * Solicita os detalhes de upload. Se houver um Worker ativo,
 * retorna a rota do Worker; caso contrário, gera URL pré-assinada do R2.
 */
export async function getPresignedUrl(fileName: string, contentType: string) {
  try {
    const supabase = await createClientServer()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      throw new Error('Não autorizado. Faça login primeiro.')
    }

    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL

    if (workerUrl) {
      // Cria nome de arquivo único
      const fileExtension = fileName.split('.').pop()
      const randomString = Math.random().toString(36).substring(2, 10)
      const fileKey = `${Date.now()}-${randomString}.${fileExtension}`

      // No fluxo de Worker, fazemos um PUT direto para o Worker
      const uploadUrl = `${workerUrl}/${fileKey}`
      const fileUrl = `${workerUrl}/${fileKey}`

      return {
        uploadUrl,
        fileUrl,
        fileKey,
        isWorker: true
      }
    }

    // Fallback: URL pré-assinada direta ao R2
    const result = await generateUploadUrl(fileName, contentType)
    return {
      ...result,
      isWorker: false
    }
  } catch (error: any) {
    throw new Error(error.message || 'Erro ao gerar URL de upload.')
  }
}

/**
 * Cadastra o registro do vídeo no banco de dados.
 */
export async function createVideoRecord(params: {
  studentName: string
  studentPhone: string
  academyId: string
  fileUrl: string
}) {
  const supabase = await createClientServer()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Não autorizado. Faça login primeiro.')
  }

  // Gera um public_id aleatório de 6 caracteres em maiúsculas (ex: AX82KQ)
  let publicId = ''
  let isUnique = false
  let attempts = 0

  while (!isUnique && attempts < 10) {
    attempts++
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    publicId = ''
    for (let i = 0; i < 6; i++) {
      publicId += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    // Verifica se já existe
    const { data } = await supabase
      .from('web_videos')
      .select('id')
      .eq('public_id', publicId)
      .maybeSingle()

    if (!data) {
      isUnique = true
    }
  }

  if (!isUnique) {
    throw new Error('Não foi possível gerar um identificador único para o vídeo.')
  }

  const qrCodeUrl = `/v/${publicId}`

  // Salva no banco de dados
  const { data, error } = await supabase
    .from('web_videos')
    .insert({
      public_id: publicId,
      academy_id: params.academyId,
      videomaker_id: session.user.id,
      student_name: params.studentName,
      student_phone: params.studentPhone,
      file_url: params.fileUrl,
      qr_code_url: qrCodeUrl,
      downloads: 0,
    })
    .select('id, public_id')
    .single()

  if (error) {
    console.error('Erro ao cadastrar vídeo no banco:', error)
    throw new Error(`Erro ao salvar dados do vídeo: ${error.message}`)
  }

  return data
}
