'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, User, Phone, MapPin, Film, LogOut, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { getAcademies, getPresignedUrl, createVideoRecord, Academy } from './actions'

// Máscara de telefone padrão brasileiro: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
const formatPhoneNumber = (value: string) => {
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

export default function VideomakerDashboard() {
  const router = useRouter()
  const { showToast } = useToast()
  const supabase = createClient()

  // Estados do Usuário e Operação
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string; role: string; academy_id: string | null } | null>(null)
  const [academies, setAcademies] = useState<Academy[]>([])
  const [isAuthLoading, setIsAuthLoading] = useState(true)

  // Estados do Formulário
  const [studentName, setStudentName] = useState('')
  const [studentPhone, setStudentPhone] = useState('')
  const [selectedAcademyId, setSelectedAcademyId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStudentPhone(formatPhoneNumber(e.target.value))
  }

  // Estados do Upload
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')

  // Verifica Autenticação
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          console.log('ℹ️ [PostAI] Nenhuma sessão ativa encontrada. Redirecionando para login.');
          router.push('/login')
          return
        }

        console.log('ℹ️ [PostAI] Sessão ativa encontrada. Buscando perfil do usuário...');
        // Busca dados do usuário (perfil)
        const { data: profile, error: profileErr } = await supabase
          .from('web_users')
          .select('id, name, email, role, academy_id')
          .eq('id', session.user.id)
          .single()

        if (profileErr) {
          console.error('🚨 [PostAI] Erro ao buscar perfil web_users:', profileErr);
          showToast('Erro ao validar seu perfil de acesso.', 'error')
          await supabase.auth.signOut()
          router.push('/login')
          return
        }

        if (!profile || (profile.role !== 'videomaker' && profile.role !== 'admin')) {
          console.warn('⚠️ [PostAI] Usuário sem permissões adequadas:', profile);
          showToast('Acesso negado. Apenas videomakers ou administradores.', 'error')
          await supabase.auth.signOut()
          router.push('/login')
          return
        }

        console.log('ℹ️ [PostAI] Perfil carregado com sucesso:', profile);
        setCurrentUser(profile)
        if (profile.academy_id) {
          setSelectedAcademyId(profile.academy_id)
        }

        // Busca academias
        console.log('ℹ️ [PostAI] Carregando lista de academias...');
        try {
          const academiesData = await getAcademies()
          setAcademies(academiesData)
        } catch (acErr) {
          console.error('🚨 [PostAI] Erro na Server Action getAcademies:', acErr);
          showToast('Erro ao carregar lista de academias.', 'warning')
        }
      } catch (err: any) {
        console.error('🚨 [PostAI] Erro crítico no fluxo de autenticação do videomaker:', err);
        showToast('Erro ao validar sua sessão. Redirecionando para o login.', 'error')
        router.push('/login')
      } finally {
        setIsAuthLoading(false)
      }
    }

    checkAuth()
  }, [supabase, router, showToast])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    showToast('Sessão encerrada.', 'success')
    router.push('/login')
  }

  // Tratamento de Arquivos
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      if (!file.type.startsWith('video/')) {
        showToast('Por favor, selecione apenas arquivos de vídeo (MP4, MOV, etc).', 'warning')
        return
      }
      setSelectedFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (!file.type.startsWith('video/')) {
        showToast('Por favor, selecione apenas arquivos de vídeo.', 'warning')
        return
      }
      setSelectedFile(file)
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  // Executa o upload completo
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!studentName.trim()) {
      showToast('Preencha o nome do aluno.', 'warning')
      return
    }
    if (!studentPhone.trim()) {
      showToast('Preencha o telefone do aluno.', 'warning')
      return
    }
    if (!selectedAcademyId) {
      showToast('Selecione a academia/unidade.', 'warning')
      return
    }
    if (!selectedFile) {
      showToast('Selecione o vídeo editado do aluno.', 'warning')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setUploadStatus('Obtendo autorização de upload...')

    try {
      console.log('ℹ️ [PostAI] Iniciando processo de upload...');
      console.log('ℹ️ [PostAI] Arquivo selecionado:', selectedFile.name, `(${selectedFile.size} bytes)`, selectedFile.type);

      // 1. Gera URL de upload via Worker ou Fallback local
      let fileUrl = ''
      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL
      console.log('ℹ️ [PostAI] NEXT_PUBLIC_WORKER_URL configurado:', workerUrl || 'Nenhum (usando fallback S3 local)');

      // Obtém o token de sessão ativa do Supabase
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        console.error('🚨 [PostAI] Token de autenticação não encontrado na sessão.');
        throw new Error('Sessão expirada. Faça login novamente.')
      }

      if (!workerUrl) {
        throw new Error('Worker URL não configurado. Defina NEXT_PUBLIC_WORKER_URL no .env.local.')
      }

      // 2. Faz upload direto ao Worker (worker → R2 server-side, sem CORS no R2)
      setUploadStatus('Enviando vídeo para o storage (Cloudflare)...')

      const uploadEndpoint = `${workerUrl}/v1/media/upload?fileName=${encodeURIComponent(selectedFile.name)}&prefix=web_videos`

      const uploadSuccess = await new Promise<boolean>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        console.log('ℹ️ [PostAI] Fazendo PUT para Worker:', uploadEndpoint);
        xhr.open('PUT', uploadEndpoint, true)
        xhr.setRequestHeader('Content-Type', selectedFile.type)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100)
            setUploadProgress(percentComplete)
          }
        }

        xhr.onload = () => {
          console.log('ℹ️ [PostAI] Resposta do Worker upload:', xhr.status, xhr.statusText);
          if (xhr.status === 200) {
            try {
              const data = JSON.parse(xhr.responseText)
              fileUrl = data.data?.publicUrl || ''
              console.log('ℹ️ [PostAI] Upload concluído. URL pública:', fileUrl);
            } catch (e) {
              console.warn('Não foi possível parsear resposta do worker:', xhr.responseText)
            }
            resolve(true)
          } else {
            console.error('🚨 [PostAI] Erro no upload via Worker. Status:', xhr.status, xhr.responseText)
            reject(new Error(`Falha no upload do arquivo. Status do servidor: ${xhr.status}`))
          }
        }

        xhr.onerror = (e) => {
          console.error('🚨 [PostAI] Erro de rede no XMLHttpRequest durante o upload:', e);
          reject(new Error('Erro de conexão ao realizar o upload do arquivo para o storage.'))
        }

        xhr.send(selectedFile)
      })

      if (!uploadSuccess) {
        throw new Error('Não foi possível concluir o upload do vídeo.')
      }

      // 3. Cria registro do vídeo no Banco de Dados
      setUploadStatus('Finalizando cadastro no banco de dados...')
      const videoRecord = await createVideoRecord({
        studentName: studentName.trim(),
        studentPhone: studentPhone.trim(),
        academyId: selectedAcademyId,
        fileUrl,
      })

      showToast('Vídeo enviado e cadastrado com sucesso!', 'success')

      // Limpa formulário
      setStudentName('')
      setStudentPhone('')
      setSelectedFile(null)
      setIsUploading(false)

      // Redireciona para a tela de sucesso
      router.push(`/videomaker/success/${videoRecord.public_id}`)

    } catch (err: any) {
      console.error(err)
      showToast(err.message || 'Erro durante o upload do vídeo.', 'error')
      setIsUploading(false)
    }
  }

  if (isAuthLoading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-dark-bg text-white">
        <Loader2 className="w-10 h-10 text-brand animate-spin mb-4" />
        <p className="text-zinc-400 text-sm">Carregando painel...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-dark-bg min-h-screen">
      {/* Header */}
      <header className="border-b border-white/5 bg-zinc-950/40 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand pulse-record" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              POST<span className="text-brand">AI</span>
            </h1>
            <span className="text-xs bg-brand/10 border border-brand/20 text-brand px-2 py-0.5 rounded-full font-medium ml-2">
              Videomaker
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 hidden sm:inline">
              Olá, <span className="text-white font-medium">{currentUser?.name}</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-zinc-400 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-white/5"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Novo Vídeo</h2>
          <p className="text-zinc-400 text-sm">
            Grave o aluno, edite e suba o arquivo aqui para gerar o QR Code instantâneo.
          </p>
        </div>

        {isUploading ? (
          /* Card de Progresso */
          <Card className="p-8 text-center space-y-6" glow>
            <div className="w-16 h-16 bg-brand/10 border border-brand/20 rounded-full flex items-center justify-center mx-auto glow-glow pulse-record">
              <Film className="w-8 h-8 text-brand animate-pulse" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Processando Envio...</h3>
              <p className="text-zinc-400 text-sm max-w-md mx-auto">
                {uploadStatus}
              </p>
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="text-brand font-bold text-lg">{uploadProgress}%</span>
            </div>
          </Card>
        ) : (
          /* Formulário de Envio */
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="p-6 md:p-8 space-y-6">
              {/* Nome do Aluno */}
              <Input
                label="Nome do Aluno"
                type="text"
                placeholder="Ex: João Silva"
                icon={<User className="w-5 h-5" />}
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
              />

              {/* Telefone do Aluno */}
              <Input
                label="Telefone do Aluno"
                type="tel"
                placeholder="Ex: (99) 99999-9999"
                icon={<Phone className="w-5 h-5" />}
                value={studentPhone}
                onChange={handlePhoneChange}
              />

              {/* Academia / Unidade */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Academia / Unidade
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <select
                    className="w-full bg-zinc-900/60 border border-white/10 rounded-xl py-3 pl-11 pr-10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10 transition-all duration-200 appearance-none"
                    value={selectedAcademyId}
                    onChange={(e) => setSelectedAcademyId(e.target.value)}
                  >
                    <option value="">Selecione a academia...</option>
                    {academies.map((academy) => (
                      <option key={academy.id} value={academy.id}>
                        {academy.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-zinc-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Dropzone de Vídeo */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Arquivo do Vídeo (Editado)
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={triggerFileInput}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${selectedFile
                    ? 'border-brand/40 bg-brand/5'
                    : 'border-white/10 hover:border-brand/30 hover:bg-white/5'
                    }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="video/*"
                    className="hidden"
                  />

                  {selectedFile ? (
                    <div className="space-y-3">
                      <div className="w-12 h-12 bg-brand/10 border border-brand/20 rounded-xl flex items-center justify-center mx-auto">
                        <Film className="w-6 h-6 text-brand" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-semibold truncate max-w-xs mx-auto">
                          {selectedFile.name}
                        </p>
                        <p className="text-zinc-500 text-xs mt-1">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Clique ou arraste outro para trocar
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mx-auto">
                        <Upload className="w-6 h-6 text-zinc-400" />
                      </div>
                      <div>
                        <p className="text-zinc-300 text-sm font-medium">
                          Arraste o vídeo editado do aluno ou clique para buscar
                        </p>
                        <p className="text-zinc-500 text-xs mt-1">
                          Formatos aceitos: MP4, MOV, AVI (máx. 100MB)
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={isUploading}
            >
              Fazer Upload e Gerar Link/QR Code
            </Button>
          </form>
        )}
      </main>
    </div>
  )
}
