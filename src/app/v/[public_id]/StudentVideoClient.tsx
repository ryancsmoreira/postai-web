'use client'

import React, { useState, useEffect } from 'react'
import { Download, Instagram, Phone, User, Lock, Film, Sparkles, Loader2, Dumbbell } from 'lucide-react'
import confetti from 'canvas-confetti'
import { useToast } from '@/components/Toast'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { registerLead, incrementDownload } from './actions'

interface VideoData {
  id: string
  file_url: string
  student_name: string
  academy_name: string
}

interface StudentVideoClientProps {
  videoData: VideoData
}

// Máscara de telefone padrão brasileiro: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
export const formatPhoneNumber = (value: string) => {
  if (!value) return ''
  const cleanValue = value.replace(/\D/g, '')
  const truncated = cleanValue.substring(0, 11)

  if (truncated.length <= 2) {
    return truncated.length > 0 ? `(${truncated}` : ''
  }
  if (truncated.length <= 6) {
    return `(${truncated.substring(0, 2)}) ${truncated.substring(2)}`
  }
  if (truncated.length <= 10) {
    return `(${truncated.substring(0, 2)}) ${truncated.substring(2, 6)}-${truncated.substring(6)}`
  }
  return `(${truncated.substring(0, 2)}) ${truncated.substring(2, 7)}-${truncated.substring(7)}`
}

export default function StudentVideoClient({ videoData }: StudentVideoClientProps) {
  const { showToast } = useToast()
  const [isUnlocked, setIsUnlocked] = useState(false)

  // Estados do Formulário
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [isSubmittingLead, setIsSubmittingLead] = useState(false)

  // Estados de Download
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  // Estado para armazenar a URL final do vídeo (evita Hydration Mismatch)
  const [activeVideoUrl, setActiveVideoUrl] = useState(videoData.file_url)

  // Verifica se o lead já foi cadastrado para este vídeo nesta sessão
  useEffect(() => {
    try {
      const sessionUnlocked = sessionStorage.getItem(`unlocked_${videoData.id}`)
      if (sessionUnlocked === 'true') {
        setIsUnlocked(true)
      }
    } catch (e) {
      console.warn('Erro ao ler sessionStorage:', e)
    }
    // Define a URL reescrita após a hidratação estar concluída
    setActiveVideoUrl(getDynamicVideoUrl(videoData.file_url))
  }, [videoData.id, videoData.file_url])

  // Função utilitária para converter a URL do Worker em uma URL acessível pela rede local (ex: no celular do aluno)
  const getDynamicVideoUrl = (url: string) => {
    if (typeof window === 'undefined') return url
    try {
      const parsedUrl = new URL(url)
      // Se a URL aponta para o localhost, reescreve com o IP/Host da máquina atual que está servindo a página
      if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
        parsedUrl.hostname = window.location.hostname
      }
      return parsedUrl.toString()
    } catch (e) {
      console.warn('Erro ao processar URL dinâmica do vídeo:', e)
      return url
    }
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneNumber(e.target.value))
  }

  const handleLeadSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    console.log('🔮 [Client] handleLeadSubmit disparada!')
    if (e) e.preventDefault()

    console.log('🔮 [Client] Dados digitados:', { name, phone, instagram })

    if (!name.trim()) {
      console.warn('🔮 [Client] Validação falhou: Nome está vazio')
      showToast('Por favor, informe seu nome.', 'warning')
      return
    }
    if (!phone.trim()) {
      console.warn('🔮 [Client] Validação falhou: Telefone está vazio')
      showToast('Por favor, informe seu telefone.', 'warning')
      return
    }

    console.log('🔮 [Client] Alterando estado isSubmittingLead para true...')
    setIsSubmittingLead(true)
    try {
      console.log('🔮 [Client] Fazendo requisição POST para /api/lead...')
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoData.id,
          name: name.trim(),
          phone: phone.trim(),
          instagram: instagram.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Erro ao salvar dados do lead no servidor.')
      }

      const res = await response.json()
      console.log('🔮 [Client] Resposta da API recebida com sucesso:', res)

      // Marca como liberado na sessão para persistir caso atualize a página
      try {
        sessionStorage.setItem(`unlocked_${videoData.id}`, 'true')
      } catch (e) {
        console.warn('Erro ao salvar na sessionStorage:', e)
      }
      setIsUnlocked(true)

      // Efeito de sucesso premium (Confetti)
      try {
        if (typeof confetti === 'function') {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.8 },
            colors: ['#A3E635', '#ffffff', '#10B981'],
          })
        }
      } catch (confettiErr) {
        console.warn('Falha ao rodar efeito de confete:', confettiErr)
      }

      showToast('Vídeo liberado! Aproveite para baixar e postar.', 'success')
    } catch (err: any) {
      console.error('🔮 [Client] Exceção capturada ao tentar registrar lead:', err)
      showToast(err.message || 'Erro ao liberar o download.', 'error')
    } finally {
      console.log('🔮 [Client] Finalizando submit. Voltando isSubmittingLead para false.')
      setIsSubmittingLead(false)
    }
  }

  // Realiza o download do arquivo de vídeo como Blob (com fallback direto caso falhe por CORS/rede)
  const handleDownload = async () => {
    setIsDownloading(true)
    setDownloadProgress(0)
    const dynamicUrl = getDynamicVideoUrl(videoData.file_url)

    try {
      console.log('ℹ️ [PostAI] Iniciando download do vídeo via Blob:', dynamicUrl);
      const response = await fetch(dynamicUrl)

      if (!response.ok) {
        throw new Error('Falha ao baixar vídeo do servidor.')
      }

      const contentLength = response.headers.get('content-length')
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Não foi possível iniciar o download.')
      }

      let receivedBytes = 0
      const chunks: Uint8Array[] = []

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        chunks.push(value)
        receivedBytes += value.length

        if (totalBytes > 0) {
          const progress = Math.round((receivedBytes / totalBytes) * 100)
          setDownloadProgress(progress)
        }
      }

      const blob = new Blob(chunks as any[], { type: 'video/mp4' })
      const blobUrl = URL.createObjectURL(blob)

      // Cria elemento âncora temporário para forçar o download no dispositivo
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `postai-${videoData.student_name.toLowerCase().replace(/\s+/g, '-')}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)

      // Incrementa métrica de download
      await incrementDownload(videoData.id)
      showToast('Download concluído com sucesso!', 'success')
    } catch (err: any) {
      console.warn('⚠️ [PostAI] Falha ao baixar via Blob (CORS ou rede). Usando link direto de contingência...', err)

      // Contingência: Abre o arquivo de vídeo diretamente em uma nova aba para salvar nativamente
      try {
        const a = document.createElement('a')
        a.href = dynamicUrl
        a.target = '_blank'
        a.download = `postai-${videoData.student_name.toLowerCase().replace(/\s+/g, '-')}.mp4`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)

        // Incrementa métrica
        await incrementDownload(videoData.id)
        showToast('Download iniciado pelo navegador!', 'success')
      } catch (fallbackErr) {
        console.error('🚨 [PostAI] Falha total no download:', fallbackErr);
        showToast('Erro ao baixar o vídeo. Tente abrir o link em outro navegador.', 'error')
      }
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-dark-bg min-h-screen relative overflow-hidden">
      {/* Luzes decorativas */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-[300px] bg-brand/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header Slim */}
      <header className="py-6 text-center border-b border-white/5 bg-zinc-950/20 sticky top-0 z-30 backdrop-blur-md">
        <div className="inline-flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-brand" />
          <span className="text-sm font-semibold tracking-wider text-zinc-400 uppercase">
            Exclusivo • {videoData.academy_name}
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-8 flex flex-col justify-center space-y-6">

        {/* Titulo */}
        <div className="text-center">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">
            Seu Vídeo Está <span className="text-brand">Pronto!</span>
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Assista à sua gravação e baixe em alta definição.
          </p>
        </div>

        {/* Video Card */}
        <Card className="relative aspect-[9/16] w-full overflow-hidden shadow-2xl" glow={isUnlocked}>
          {isUnlocked ? (
            /* Player Desbloqueado */
            <video
              src={activeVideoUrl}
              controls
              playsInline
              className="w-full h-full object-cover"
              poster={`${activeVideoUrl}#t=0.1`} // Pega o primeiro frame como poster
            />
          ) : (
            /* Preview Bloqueado */
            <div className="relative w-full h-full bg-zinc-950 flex flex-col items-center justify-center p-6 text-center select-none">
              {/* Vídeo desfocado no fundo para dar textura */}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-zinc-950 z-10" />
              <video
                src={activeVideoUrl}
                muted
                loop
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover blur-md opacity-30"
              />

              {/* Elementos de Bloqueio */}
              <div className="z-20 space-y-4">
                <div className="w-16 h-16 bg-brand/10 border border-brand/20 rounded-full flex items-center justify-center mx-auto glow-glow pulse-record">
                  <Lock className="w-6 h-6 text-brand" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white uppercase tracking-tight">Vídeo Bloqueado</h3>
                  <p className="text-zinc-400 text-xs px-4">
                    Preencha o formulário rápido abaixo para liberar o download imediatamente.
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Formulário / Download Button */}
        <div className="z-20">
          {isUnlocked ? (
            /* Botão de Download Liberado */
            <div className="space-y-4">
              <Button
                variant="primary"
                onClick={handleDownload}
                fullWidth
                isLoading={isDownloading}
                className="h-14 text-base tracking-wide flex items-center gap-2"
              >
                {isDownloading ? (
                  `Baixando (${downloadProgress}%)`
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Baixar Vídeo em Alta Qualidade
                  </>
                )}
              </Button>
              <div className="text-center flex items-center justify-center gap-1.5 text-xs text-zinc-500 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-brand" />
                Pronto para compartilhar no Instagram!
              </div>
            </div>
          ) : (
            /* Formulário de Lead */
            <Card className="p-5 md:p-6 space-y-4">
              <div className="space-y-4">
                <Input
                  label="Seu Nome"
                  type="text"
                  placeholder="Nome Completo"
                  icon={<User className="w-4 h-4" />}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmittingLead}
                />

                <Input
                  label="Seu Telefone / WhatsApp"
                  type="tel"
                  placeholder="Ex: (99) 99999-9999"
                  icon={<Phone className="w-4 h-4" />}
                  value={phone}
                  onChange={handlePhoneChange}
                  disabled={isSubmittingLead}
                />

                <Input
                  label="Seu Instagram (Opcional)"
                  type="text"
                  placeholder="@seuusuario"
                  icon={<Instagram className="w-4 h-4" />}
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  disabled={isSubmittingLead}
                />

                <button
                  type="button"
                  disabled={isSubmittingLead}
                  onClick={handleLeadSubmit}
                  className="w-full h-12 bg-brand text-dark-bg hover:bg-brand-dark font-semibold rounded-xl text-sm transition-all duration-200 flex items-center justify-center glow-glow hover:shadow-brand/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingLead ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Liberar Meu Vídeo'
                  )}
                </button>
              </div>
            </Card>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-zinc-700 mt-auto border-t border-white/5">
        PostAI © {new Date().getFullYear()} • Conectando você e sua academia.
      </footer>
    </div>
  )
}
