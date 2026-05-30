import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Inicializa o cliente S3 para Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
})

interface PresignedUrlResponse {
  uploadUrl: string
  fileUrl: string
  fileKey: string
}

/**
 * Gera uma URL pré-assinada (pre-signed URL) para fazer upload diretamente do cliente para o Cloudflare R2.
 */
export async function generateUploadUrl(
  fileName: string,
  contentType: string
): Promise<PresignedUrlResponse> {
  const accountId = process.env.R2_ACCOUNT_ID
  const bucketName = process.env.R2_BUCKET_NAME
  const publicUrlPrefix = process.env.NEXT_PUBLIC_R2_PUBLIC_URL

  if (!accountId || !bucketName) {
    throw new Error('Configurações do Cloudflare R2 estão ausentes no servidor.')
  }

  // Gera um nome único para o arquivo
  const fileExtension = fileName.split('.').pop()
  const randomString = Math.random().toString(36).substring(2, 10)
  const fileKey = `${Date.now()}-${randomString}.${fileExtension}`

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
    ContentType: contentType,
  })

  // URL expira em 1 hora (3600 segundos)
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })

  // URL pública para visualização/download do vídeo
  const fileUrl = `${publicUrlPrefix}/${fileKey}`

  return {
    uploadUrl,
    fileUrl,
    fileKey,
  }
}
