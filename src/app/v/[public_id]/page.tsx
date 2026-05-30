import React from 'react'
import { Metadata } from 'next'
import { Film } from 'lucide-react'
import { createClientServer } from '@/lib/supabase'
import StudentVideoClient from './StudentVideoClient'

interface StudentPageProps {
  params: Promise<{ public_id: string }>
}

export async function generateMetadata({ params }: StudentPageProps): Promise<Metadata> {
  const { public_id } = await params
  try {
    const supabase = await createClientServer()
    const { data: video } = await supabase
      .from('web_videos')
      .select('student_name')
      .eq('public_id', public_id)
      .single()

    if (!video) {
      return {
        title: 'Vídeo Não Encontrado — PostAI',
      }
    }

    return {
      title: `Vídeo de ${video.student_name} — PostAI`,
      description: `Assista e baixe o vídeo de treino de ${video.student_name} personalizado da sua academia.`,
    }
  } catch {
    return {
      title: 'Vídeo do Aluno — PostAI',
    }
  }
}

export default async function StudentVideoPage({ params }: StudentPageProps) {
  const { public_id } = await params
  const supabase = await createClientServer()

  // 1. Busca os dados do vídeo pelo public_id
  const { data: video, error: videoError } = await supabase
    .from('web_videos')
    .select('id, file_url, student_name, academy_id')
    .eq('public_id', public_id)
    .single()

  if (videoError || !video) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-dark-bg text-white min-h-screen px-4 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mb-4">
          <Film className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-white">Vídeo não encontrado</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-xs">
          O link está incorreto ou o vídeo foi removido do servidor.
        </p>
      </div>
    )
  }

  // 2. Busca o nome da academia
  const { data: academy } = await supabase
    .from('web_academies')
    .select('name')
    .eq('id', video.academy_id)
    .single()

  const videoData = {
    id: video.id,
    file_url: video.file_url,
    student_name: video.student_name,
    academy_name: academy?.name || 'Academia SIX',
  }

  return <StudentVideoClient videoData={videoData} />
}
