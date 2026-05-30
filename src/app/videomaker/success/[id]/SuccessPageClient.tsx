'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Copy, Plus, ArrowLeft } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface SuccessPageClientProps {
  studentName: string
  videoLink: string
  qrCodeDataUrl: string
}

export default function SuccessPageClient({ studentName, videoLink, qrCodeDataUrl }: SuccessPageClientProps) {
  const router = useRouter()
  const { showToast } = useToast()

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(videoLink)
      showToast('Link copiado para a área de transferência!', 'success')
    } catch {
      showToast('Não foi possível copiar o link.', 'error')
    }
  }

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden bg-dark-bg">
      {/* Luzes de fundo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md z-10 text-center space-y-6">
        {/* Ícone de sucesso animado */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-brand/10 border border-brand/20 rounded-full flex items-center justify-center glow-glow pulse-record mb-4">
            <CheckCircle2 className="w-9 h-9 text-brand" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">
            Vídeo Pronto!
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Peça para o aluno <span className="text-white font-semibold">{studentName}</span> escanear abaixo:
          </p>
        </div>

        {/* QR Code Card */}
        <Card className="p-6 md:p-8 flex flex-col items-center space-y-6" glow>
          {qrCodeDataUrl ? (
            <div className="bg-white p-4 rounded-2xl shadow-xl transition-all duration-300 hover:scale-[1.02]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCodeDataUrl}
                alt={`QR Code para baixar o vídeo de ${studentName}`}
                className="w-64 h-64 md:w-72 md:h-72 object-contain"
              />
            </div>
          ) : (
            <div className="w-64 h-64 bg-zinc-800 rounded-2xl animate-pulse" />
          )}

          <div className="w-full space-y-2">
            <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
              Link de Acesso
            </p>
            <div className="bg-zinc-950/60 border border-white/5 rounded-xl p-3 text-xs font-mono text-zinc-300 select-all truncate">
              {videoLink}
            </div>
          </div>
        </Card>

        {/* Ações */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="secondary"
            onClick={copyToClipboard}
            className="flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copiar Link
          </Button>

          <Button
            variant="primary"
            onClick={() => router.push('/videomaker')}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo Vídeo
          </Button>
        </div>

        {/* Voltar ao painel */}
        <button
          onClick={() => router.push('/videomaker')}
          className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar ao painel do videomaker
        </button>
      </div>
    </div>
  )
}
