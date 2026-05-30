import React from 'react'
import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { createClientServer } from '@/lib/supabase'
import SuccessPageClient from './SuccessPageClient'

interface SuccessPageProps {
  params: Promise<{ id: string }>
}

export default async function UploadSuccessPage({ params }: SuccessPageProps) {
  const { id: videoPublicId } = await params
  const supabase = await createClientServer()

  // 1. Busca detalhes do vídeo no Supabase do lado do servidor
  const { data, error } = await supabase
    .from('web_videos')
    .select('student_name, public_id')
    .eq('public_id', videoPublicId)
    .single()

  if (error || !data) {
    redirect('/videomaker')
  }

  // 2. Monta o link público para download do aluno (usa a variável de IP configurada se existir, ou cai no hostname padrão)
  const origin = process.env.NEXT_PUBLIC_APP_URL || ''
  const videoLink = `${origin}/v/${data.public_id}`

  // 3. Gera o QR Code em formato DataURL no servidor
  let qrCodeDataUrl = ''
  try {
    qrCodeDataUrl = await QRCode.toDataURL(videoLink, {
      width: 380,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000', // Código preto
        light: '#FFFFFF', // Fundo branco
      },
    })
  } catch (err) {
    console.error('Erro ao gerar QR Code no servidor:', err)
  }

  return (
    <SuccessPageClient
      studentName={data.student_name}
      videoLink={videoLink}
      qrCodeDataUrl={qrCodeDataUrl}
    />
  )
}
