import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

type Bindings = {
  DATABASE_URL: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  SUPABASE_JWT_SECRET: string
  ENVIRONMENT: string
  // Cloudflare R2 Credentials
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  R2_ENDPOINT: string
  R2_BUCKET_NAME: string
  R2_PUBLIC_URL?: string
  RESEND_API_KEY: string
  R2: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>()

// Middlewares Globais
app.use('*', cors())

// Tratamento de Erros Global (Garante sempre JSON)
app.onError((err, c) => {
  console.error(`Worker Error: ${err.message}`)
  return c.json({ 
    error: 'Erro interno no Worker', 
    details: err.message,
    stack: c.env.ENVIRONMENT === 'development' ? err.stack : undefined
  }, 500)
})

app.notFound((c) => {
  return c.json({ error: 'Endpoint não encontrado' }, 404)
})

// Middleware de Autenticação (Supabase)
app.use('/v1/*', async (c, next) => {
  // Ignorar check de token para rotas públicas (Student Booking)
  if (c.req.path.startsWith('/v1/public/')) {
    return await next()
  }

  const authHeader = c.req.header('Authorization')
  if (!authHeader) {
    return c.json({ error: 'Nenhum token fornecido' }, 401)
  }

  const token = authHeader.replace('Bearer ', '').trim()
  
  // Usamos o Service Role client para validar o token com a API de Auth (garante que não expirou/foi revogado)
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return c.json({ error: 'Sessão inválida ou expirada', details: error?.message }, 401)
  }

  c.set('jwtPayload', { sub: user.id })
  await next()
})

// Helper para Cliente Supabase (Admin/Service Role)
const getSupabase = (c: any) => {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })
}

app.get('/', (c) => c.text('PostAI Edge API v1 (Hono + Supabase SDK)'))

/**
 * [GET] /v1/me
 */
app.get('/v1/me', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      memberships (
        role,
        entity_id,
        entity_type,
        unit_id,
        gyms ( company_name ),
        units ( name, gyms (company_name) )
      ),
      professionals (*)
    `)
    .eq('id', profileId)
    .single()

  if (error) return c.json({ error: 'Erro ao carregar perfil', details: error.message }, 500)
  return c.json({ data })
})

/**
 * [POST] /v1/onboarding
 */
app.post('/v1/onboarding', async (c) => {
  const payload = await c.req.json()
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!profileId) return c.json({ error: 'Não autorizado' }, 401)

  try {
    // 1. Criar Academia
    const { data: gym, error: gymError } = await supabase
      .from('gyms')
      .insert({
        company_name: payload.company_name,
        cnpj: payload.cnpj.replace(/\D/g, ''),
        status: 'active'
      })
      .select()
      .single()

    if (gymError) throw new Error(`Erro ao criar academia: ${gymError.message}`)

    // 2. Criar Unidade
    const { data: unit, error: unitError } = await supabase
      .from('units')
      .insert({
        gym_id: gym.id,
        name: payload.unit_name,
        address: payload.unit_address,
        latitude: 0,
        longitude: 0
      })
      .select()
      .single()

    if (unitError) throw new Error(`Erro ao criar unidade: ${unitError.message}`)

    // 3. Criar Membership (Owner)
    const { error: memError } = await supabase
      .from('memberships')
      .insert({
        profile_id: profileId,
        entity_type: 'gym',
        entity_id: gym.id,
        role: 'owner'
      })

    if (memError) throw new Error(`Erro ao criar vínculo: ${memError.message}`)

    return c.json({ success: true, data: { gym_id: gym.id, unit_id: unit.id } })
  } catch (err: any) {
    console.error('Onboarding Error:', err.message)
    return c.json({ error: 'Falha no onboarding', details: err.message }, 500)
  }
})

/**
 * [POST] /v1/onboarding/professional
 */
app.post('/v1/onboarding/professional', async (c) => {
  const payload = await c.req.json()
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!profileId) return c.json({ error: 'Não autorizado' }, 401)

  try {
    const { data: pro, error } = await supabase
      .from('professionals')
      .insert({
        profile_id: profileId,
        specialties: payload.specialties || [],
        region: payload.region || '',
        portfolio_urls: payload.portfolio_url ? [payload.portfolio_url] : [],
        cover_r2_key: payload.cover_r2_key || null,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw new Error(`Erro ao cadastrar profissional: ${error.message}`)

    return c.json({ success: true, data: { professional_id: pro.id } })
  } catch (err: any) {
    console.error('Pro Onboarding Error:', err.message)
    return c.json({ error: 'Falha no onboarding profissional', details: err.message }, 500)
  }
})

/**
 * [GET] /v1/professionals
 */
app.get('/v1/professionals', async (c) => {
  const supabase = getSupabase(c)
  const { data, error } = await supabase
    .from('professionals')
    .select(`
      id,
      status,
      specialties,
      region,
      portfolio_urls,
      cover_r2_key,
      profiles ( full_name, avatar_url, email )
    `)
    .eq('status', 'approved')

  if (error) return c.json({ error: 'Erro ao listar profissionais', details: error.message }, 500)
  return c.json({ data })
})

/**
 * [GET] /v1/pro/agenda
 */
app.get('/v1/pro/agenda', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!profileId) return c.json({ error: 'Não autorizado' }, 401)

  // 1. Pegar o ID do profissional
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('profile_id', profileId)
    .single()

  if (!pro) return c.json({ error: 'Perfil profissional não encontrado' }, 404)

  // 2. Buscar serviços atribuídos
  const { data, error } = await supabase
    .from('service_assignments')
    .select(`
      status,
      services (
        id,
        start_at,
        end_at,
        status,
        contracted_minutes,
        check_in_at,
        units (
          name,
          address,
          latitude,
          longitude,
          gyms ( company_name )
        )
      )
    `)
    .eq('professional_id', pro.id)
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: 'Erro ao listar agenda', details: error.message }, 500)
  return c.json({ data })
})

/**
 * [POST] /v1/pro/services/:id/check-in
 */
app.post('/v1/pro/services/:id/check-in', async (c) => {
  const id = c.req.param('id')
  const { latitude, longitude } = await c.req.json()
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!profileId) return c.json({ error: 'Não autorizado' }, 401)

  // 1. Validar se o pro está atribuído ao serviço
  const { data: service } = await supabase
    .from('services')
    .select('*, units(*)')
    .eq('id', id)
    .single()

  if (!service) return c.json({ error: 'Serviço não encontrado' }, 404)

  // 2. Lógica de Haversine para Distância
  const R = 6371e3 // Metros
  const φ1 = (service.units.latitude * Math.PI) / 180
  const φ2 = (latitude * Math.PI) / 180
  const Δφ = ((latitude - service.units.latitude) * Math.PI) / 180
  const Δλ = ((longitude - service.units.longitude) * Math.PI) / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const cc = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * cc

  const isWithinRange = distance <= 500 // 500 metros

  if (!isWithinRange) {
    // Log de tentativa fora do raio
    await supabase.from('audit_logs').insert({
      profile_id: profileId,
      source: 'worker_api',
      event_type: 'check_in_failed_distance',
      entity_type: 'service',
      entity_id: id,
      metadata: { distance, latitude, longitude }
    })
    return c.json({ 
      error: 'Você está muito longe da unidade para fazer o check-in automático.',
      distance 
    }, 400)
  }

  // 3. Registrar Check-in
  const { error: updateError } = await supabase
    .from('services')
    .update({ 
      status: 'in_progress', 
      check_in_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (updateError) return c.json({ error: 'Erro ao registrar check-in', details: updateError.message }, 500)

  return c.json({ success: true, distance })
})

/**
 * [POST] /v1/pro/services/:id/raw-complete
 */
app.post('/v1/pro/services/:id/raw-complete', async (c) => {
  const id = c.req.param('id')
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!profileId) return c.json({ error: 'Não autorizado' }, 401)

  const { data: service, error: sError } = await supabase
    .from('services')
    .select('*, units(name, gyms(company_name)), slots(*), media_uploads(*)')
    .eq('id', id)
    .single()

  if (sError) return c.json({ error: 'Erro ao buscar serviço', details: sError.message }, 500)

  // 1. Validar se TODOS os slots ocupados têm pelo menos um BRUTO
  const occupiedSlots = service.slots?.filter((s: any) => s.student_name && s.status !== 'cancelled') || []
  const missingRaws = occupiedSlots.filter((slot: any) => {
    const hasRaw = service.media_uploads?.some((m: any) => m.slot_id === slot.id && m.kind === 'raw')
    return !hasRaw
  })

  if (missingRaws.length > 0) {
    return c.json({ 
      error: 'Segurança de Captação Violada', 
      details: `Faltam materiais brutos para ${missingRaws.length} aluno(s). Você deve realizar o upload de cada um para destravar a finalização.` 
    }, 400)
  }

  // 2. Atualizar status para awaiting_edit
  const { error } = await supabase
    .from('services')
    .update({ 
      status: 'awaiting_edit', 
      updated_at: new Date().toISOString() 
    })
    .eq('id', id)

  if (error) return c.json({ error: 'Erro ao atualizar status', details: error.message }, 500)

  // GATILHO: Notificar Editores
  const { data: editors } = await supabase
    .from('professionals')
    .select('profiles(email)')
    .eq('status', 'approved')
    .contains('specialties', ['Editor'])

  const editorEmails = editors?.map((e: any) => e.profiles.email).filter(Boolean) || []
  
  if (editorEmails.length > 0) {
    const domain = 'https://postai.app'
    await sendInternalEmail(
      c.env,
      editorEmails,
      `🎞️ Novo Job de Edição: ${service.units.name}`,
      'Material Bruto Disponível!',
      `O material bruto da sessão na <strong>${service.units.gyms.company_name} - ${service.units.name}</strong> já está no sistema. Acesse seu backlog para assumir este job e iniciar a edição.`,
      'VER BACKLOG',
      `${domain}/dashboard/editor/backlog`
    )
  }

  return c.json({ success: true })
})

/**
 * [GET] /v1/units
 */
app.get('/v1/units', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  const { data, error } = await supabase
    .from('memberships')
    .select(`
      entity_type,
      entity_id,
      unit_id,
      gyms (
        units (*)
      ),
      units (*)
    `)
    .eq('profile_id', profileId)
    .in('entity_type', ['gym', 'unit'])

  if (error) return c.json({ error: 'Erro ao listar unidades', details: error.message }, 500)
  
  const units = data.flatMap(m => {
    if (m.entity_type === 'gym') return (m.gyms as any)?.units || []
    if (m.entity_type === 'unit' && m.units) return [m.units]
    return []
  })
  
  // Dedup in case user has overlapping memberships
  const uniqueUnits = Array.from(new Map(units.map((u: any) => [u.id, u])).values())
  return c.json({ data: uniqueUnits })
})

/**
 * [POST] /v1/services/book
 */
app.post('/v1/services/book', async (c) => {
  const payload = await c.req.json()
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!profileId) return c.json({ error: 'Não autorizado' }, 401)

  try {
    const startAt = new Date(payload.start_at)
    const endAt = new Date(startAt.getTime() + payload.minutes * 60000)

    const { data: service, error: sError } = await supabase
      .from('services')
      .insert({
        unit_id: payload.unit_id,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        contracted_minutes: payload.minutes,
        status: 'scheduled'
      })
      .select()
      .single()

    if (sError) throw new Error(`Erro ao criar agendamento: ${sError.message}`)

    const { error: aError } = await supabase
      .from('service_assignments')
      .insert({
        service_id: service.id,
        professional_id: payload.professional_id,
        status: 'invited',
        assigned_by_profile_id: profileId
      })

    if (aError) throw new Error(`Erro ao atribuir profissional: ${aError.message}`)

    // 3. GERAL SLOTS AUTOMATICAMENTE (30 min cada)
    const slotDuration = 30
    const totalSlots = Math.floor(payload.minutes / slotDuration)
    const slotsToInsert = []

    for (let i = 0; i < totalSlots; i++) {
      const slotStart = new Date(startAt.getTime() + i * slotDuration * 60000)
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000)
      
      slotsToInsert.push({
        service_id: service.id,
        start_at: slotStart.toISOString(),
        end_at: slotEnd.toISOString(),
        student_name: null, // Vago para auto-agendamento
        status: 'pending'
      })
    }

    if (slotsToInsert.length > 0) {
      const { error: slotError } = await supabase
        .from('slots')
        .insert(slotsToInsert)
      
      if (slotError) console.error('Erro ao gerar slots:', slotError.message)
    }

    return c.json({ success: true, data: { service_id: service.id } })
  } catch (err: any) {
    return c.json({ error: 'Erro ao processar agendamento', details: err.message }, 500)
  }
})

/**
 * [GET] /v1/branding/upload-url
 */
app.get('/v1/branding/upload-url', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const fileName = c.req.query('fileName') || `${profileId}-logo-${Date.now()}.png`

  if (!profileId) return c.json({ error: 'Não autorizado' }, 401)

  const s3 = new S3Client({
    region: 'auto',
    endpoint: c.env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    },
  })

  const r2Key = `branding/logos/${fileName}`

  try {
    const command = new PutObjectCommand({
      Bucket: c.env.R2_BUCKET_NAME,
      Key: r2Key,
      ContentType: 'image/png',
    })

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })

    const publicUrl = c.env.R2_PUBLIC_URL 
      ? `${c.env.R2_PUBLIC_URL}/${r2Key}`
      : `${c.env.R2_ENDPOINT}/${c.env.R2_BUCKET_NAME}/${r2Key}`

    return c.json({
      data: {
        uploadUrl,
        r2Key,
        publicUrl
      }
    })
  } catch (err: any) {
    return c.json({ error: 'Erro ao gerar URL do R2', details: err.message }, 500)
  }
})

/**
 * [PUT] /v1/media/upload
 * Upload direto para o R2 via Worker (sem CORS no R2)
 * O browser envia o arquivo para o Worker, que faz PUT no R2 server-side.
 */
app.put('/v1/media/upload', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const prefix = c.req.query('prefix') || 'general'
  const fileName = c.req.query('fileName') || `${Date.now()}.bin`
  const contentType = c.req.header('Content-Type') || 'application/octet-stream'

  if (!profileId) return c.json({ error: 'Não autorizado' }, 401)

  if (!c.env.R2) {
    return c.json({ error: 'R2 Bucket Binding não configurado no worker.' }, 500)
  }

  const r2Key = `${prefix}/${fileName}`

  try {
    // PUT nativo do Cloudflare Worker para o R2 Bucket
    await c.env.R2.put(r2Key, c.req.raw.body, {
      httpMetadata: {
        contentType: contentType,
      }
    })

    const publicUrl = `${new URL(c.req.url).origin}/v1/public/media/${prefix}/${fileName}`

    return c.json({ success: true, data: { r2Key, publicUrl } })
  } catch (err: any) {
    console.error('Erro no upload proxy R2 binding:', err.message)
    return c.json({ error: 'Erro ao fazer upload para o R2', details: err.message }, 500)
  }
})

/**
 * [GET] /v1/public/media/:prefix/:fileName
 * Rota pública para ler arquivos do R2 através do Worker
 */
app.get('/v1/public/media/:prefix/:fileName', async (c) => {
  const prefix = c.req.param('prefix')
  const fileName = c.req.param('fileName')
  const r2Key = `${prefix}/${fileName}`

  if (!c.env.R2) {
    return c.text('R2 bucket binding não configurado', 500)
  }

  try {
    const object = await c.env.R2.get(r2Key)
    if (!object) {
      return c.text('Arquivo não encontrado', 404)
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Cache-Control', 'public, max-age=31536000')

    return new Response(object.body, {
      headers,
    })
  } catch (err: any) {
    return c.text(`Erro ao buscar arquivo: ${err.message}`, 500)
  }
})

/**
 * [GET] /v1/media/upload-url
 */
app.get('/v1/media/upload-url', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const prefix = c.req.query('prefix') || 'general'
  const fileName = c.req.query('fileName') || `${Date.now()}.bin`

  if (!profileId) return c.json({ error: 'Não autorizado' }, 401)

  // 1. Validar Credenciais do R2
  const isR2Configured = c.env.R2_ACCESS_KEY_ID && c.env.R2_SECRET_ACCESS_KEY && c.env.R2_ENDPOINT && c.env.R2_BUCKET_NAME

  if (!isR2Configured) {
    if (c.env.ENVIRONMENT === 'development') {
      console.warn('⚠️ R2 Credentials Missing. Returning MOCK upload URL.')
      return c.json({
        data: {
          uploadUrl: `https://postai-mock-upload.com/${prefix}/${fileName}?mock=true`,
          r2Key: `${prefix}${fileName}`,
          publicUrl: 'https://postai.app/mock-video.mp4',
          isMock: true
        }
      })
    }
    return c.json({ 
      error: 'R2 Storage não configurado.', 
      details: 'Verifique as chaves R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT e R2_BUCKET_NAME no seu arquivo .dev.vars' 
    }, 400)
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: c.env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    },
  })

  // Prefixo customizado (raw/id-servico/nome.mp4)
  const r2Key = `${prefix}/${fileName}`

  try {
    const command = new PutObjectCommand({
      Bucket: c.env.R2_BUCKET_NAME,
      Key: r2Key,
      ContentType: c.req.query('contentType') || 'application/octet-stream',
    })

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })

    const publicUrl = c.env.R2_PUBLIC_URL 
      ? `${c.env.R2_PUBLIC_URL}/${r2Key}`
      : `${c.env.R2_ENDPOINT}/${c.env.R2_BUCKET_NAME}/${r2Key}`

    return c.json({
      data: {
        uploadUrl,
        r2Key,
        publicUrl
      }
    })
  } catch (err: any) {
    return c.json({ error: 'Erro ao gerar URL do R2', details: err.message }, 500)
  }
})

/**
 * [POST] /v1/branding
 */
app.post('/v1/branding', async (c) => {
  const payload = await c.req.json()
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!profileId) return c.json({ error: 'Não autorizado' }, 401)

  try {
    const { data: membership } = await supabase
      .from('memberships')
      .select('entity_id')
      .eq('profile_id', profileId)
      .eq('entity_type', 'gym')
      .in('role', ['owner', 'manager'])
      .limit(1)
      .single()

    if (!membership) return c.json({ error: 'Apenas proprietários da franquia matriz podem editar o branding.' }, 403)

    const { data: branding, error } = await supabase
      .from('brandings')
      .upsert({
        gym_id: membership.entity_id,
        logo_r2_key: payload.logo_r2_key,
        manual_pdf_r2_key: payload.manual_pdf_r2_key, // Novo
        primary_color: payload.primary_color,
        secondary_color: payload.secondary_color,
        color_palette: payload.color_palette, // Novo
        editing_guidelines: payload.editing_guidelines,
        version: 1,
        updated_at: new Date().toISOString()
      }, { onConflict: 'gym_id' })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return c.json({ success: true, data: branding })
  } catch (err: any) {
    return c.json({ error: 'Erro ao salvar branding', details: err.message }, 500)
  }
})

// Helper para verificar se o usuário é ADMIN (PostAI)
const isAdmin = async (c: any, profileId: string) => {
  const supabase = getSupabase(c)
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('profile_id', profileId)
    .eq('entity_type', 'postai')
    .single()
  
  return membership?.role === 'admin'
}

/**
 * [GET] /v1/admin/professionals
 */
app.get('/v1/admin/professionals', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!(await isAdmin(c, profileId))) {
    return c.json({ error: 'Acesso restrito ao Backoffice PostAI' }, 403)
  }

  const { data, error } = await supabase
    .from('professionals')
    .select(`
      *,
      profiles ( full_name, email, avatar_url )
    `)
    .order('created_at', { ascending: false })

  if (error) return c.json({ error: 'Erro ao listar profissionais para admin', details: error.message }, 500)
  return c.json({ data })
})

/**
 * [PATCH] /v1/admin/professionals/:id/status
 */
app.patch('/v1/admin/professionals/:id/status', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json()
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!(await isAdmin(c, profileId))) {
    return c.json({ error: 'Não autorizado' }, 403)
  }

  const { data, error } = await supabase
    .from('professionals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return c.json({ error: 'Erro ao atualizar status', details: error.message }, 500)

  // Simulação de Notificação (Sim do usuário na pergunta 1)
  console.log(`[Notification] Profissional ${id} status atualizado para ${status}`)

  return c.json({ success: true, data })
})

/**
 * [GET] /v1/editor/backlog
 * Lista jobs disponíveis para edição
 */
app.get('/v1/editor/backlog', async (c) => {
  const supabase = getSupabase(c)

  const { data, error } = await supabase
    .from('services')
    .select(`
      *,
      units (
        name,
        gyms ( company_name, brandings(*) )
      ),
      media_uploads ( id, kind ),
      service_assignments!inner ( role )
    `)
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .eq('service_assignments.role', 'videomaker') // Garante que foi capturado/em curso por VM
    // Para filtrar quem já tem editor, precisaríamos de um NOT EXISTS ou filtro negativo.
    // Como a query acima é complexa para filtro negativo no Supabase cliente sem views, 
    // faremos a filtragem no código para garantir precisão total.
    .order('created_at', { ascending: true })

  if (error) return c.json({ error: 'Erro ao buscar backlog de edição', details: error.message }, 500)

  // 2. Buscar IDs de serviços que JÁ possuem editor atribuído
  const { data: assignedEditors } = await supabase
    .from('service_assignments')
    .select('service_id')
    .eq('role', 'editor')

  const assignedServiceIds = new Set(assignedEditors?.map(a => a.service_id) || [])

  // 3. Filtrar: Só o que tem videomaker mas NÃO tem editor ainda
  const availableJobs = data.filter((s: any) => !assignedServiceIds.has(s.id))

  return c.json({ data: availableJobs })
})

/**
 * Helper para buscar configurações dinâmicas
 */
async function getSetting(supabase: any, key: string, defaultValue: string): Promise<string> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single()
  return data?.value || defaultValue
}

/**
 * Serviço de Disparo de E-mail para o Aluno (Resend)
 */
async function sendDeliveryEmail(env: any, studentName: string, studentEmail: string, deliveryUrl: string, gymName: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'PostAI Cinema <entregas@postai.app>',
      to: [studentEmail],
      subject: `Sua Produção de Cinema na ${gymName} está pronta! 🎬`,
      html: `
        <div style="background-color: #050505; color: #ffffff; padding: 40px; font-family: sans-serif; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #1a1a1a;">
          <h1 style="font-size: 24px; font-weight: 900; letter-spacing: -1px; margin-bottom: 20px; color: #ffffff;">POST<span style="color: #7c3aed;">AI</span></h1>
          <p style="font-size: 16px; color: #a1a1aa;">Olá, <strong>${studentName}</strong>!</p>
          <p style="font-size: 16px; color: #a1a1aa;">Sua sessão de cinema na <strong>${gymName}</strong> foi editada e já está disponível para você assistir e compartilhar.</p>
          <div style="margin-top: 32px;">
            <a href="${deliveryUrl}" style="background-color: #7c3aed; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">ASSISTIR MEU VÍDEO 🎬</a>
          </div>
          <p style="font-size: 12px; color: #52525b; margin-top: 40px; border-top: 1px solid #1a1a1a; pt: 20px;">
            Este é um envido automático. Você recebeu este e-mail porque realizou uma sessão de cinema patrocinada por sua unidade.
          </p>
        </div>
      `
    })
  })
  return res.ok
}

/**
 * Helper Genérico para Notificações Internas (Admin/Ops)
 */
async function sendInternalEmail(env: any, to: string[], subject: string, title: string, message: string, buttonText?: string, buttonUrl?: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'PostAI Ops <ops@postai.app>',
      to: to,
      subject: subject,
      html: `
        <div style="background-color: #050505; color: #ffffff; padding: 40px; font-family: sans-serif; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #1a1a1a;">
          <h1 style="font-size: 24px; font-weight: 900; letter-spacing: -1px; margin-bottom: 20px; color: #ffffff;">POST<span style="color: #7c3aed;">AI</span></h1>
          <h2 style="font-size: 18px; color: #ffffff; margin-bottom: 12px;">${title}</h2>
          <p style="font-size: 16px; color: #a1a1aa; line-height: 1.6;">${message}</p>
          ${buttonUrl ? `
          <div style="margin-top: 32px;">
            <a href="${buttonUrl}" style="background-color: #ffffff; color: #050505; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">${buttonText || 'ACESSAR AGORA'}</a>
          </div>
          ` : ''}
          <p style="font-size: 11px; color: #52525b; margin-top: 40px; border-top: 1px solid #1a1a1a; padding-top: 20px;">
            Este e-mail foi gerado automaticamente pelo motor operacional do PostAI.
          </p>
        </div>
      `
    })
  })
  return res.ok
}

/**
 * [POST] /v1/gym/services/:id/approve
 * Academia aprova a versão final da edição
 */
app.post('/v1/gym/services/:id/approve', async (c) => {
  const serviceId = c.req.param('id')
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)
  const env = c.env

  // 1. Validar se o usuário tem membership na academia dona deste serviço
  const { data: service, error: sError } = await supabase
    .from('services')
    .select('id, unit_id, units(name, gym_id)')
    .eq('id', serviceId)
    .single()

  if (sError || !service) return c.json({ error: 'Serviço não encontrado' }, 404)

  const { data: membership } = await supabase
    .from('memberships')
    .select('id')
    .eq('profile_id', profileId)
    .eq('entity_id', (service.units as any).gym_id)
    .eq('entity_type', 'gym')
    .single()

  if (!membership) return c.json({ error: 'Você não tem permissão para aprovar este serviço.' }, 403)

  // 1.5 Validar se todos os slots OCUPADOS (com aluno) possuem entrega final
  const { data: slots, error: slotsError } = await supabase
    .from('slots')
    .select('id, student_name, media_uploads(id)')
    .eq('service_id', serviceId)
    .not('student_name', 'is', null)

  const pendingSlots = slots?.filter((s: any) => !s.media_uploads || s.media_uploads.length === 0)
  
  if (pendingSlots && pendingSlots.length > 0) {
    return c.json({ 
      error: `Existem ${pendingSlots.length} alunos aguardando edição final. A aprovação só é permitida após a entrega de todos os vídeos agendados.` 
    }, 400)
  }

  // 2. Buscar Preços dinâmicos das configurações
  const payoutVM = await getSetting(supabase, 'payout_videomaker_default', '150.00')
  const payoutED = await getSetting(supabase, 'payout_editor_default', '100.00')

  // 3. Transação: Marcar como Completo e Gerar Créditos
  const { error: statusError } = await supabase
    .from('services')
    .update({ 
      status: 'completed', 
      adjustment_notes: null, // Limpa notas de ajuste ao aprovar
      updated_at: new Date().toISOString() 
    })
    .eq('id', serviceId)

  if (statusError) return c.json({ error: 'Erro ao completar serviço' }, 500)

  // 4. Gerar Créditos para todos os profissionais atribuídos
  const { data: assignments } = await supabase
    .from('service_assignments')
    .select('professional_id, role')
    .eq('service_id', serviceId)
    .eq('status', 'assigned')

  if (assignments) {
    for (const assign of assignments) {
      const amount = assign.role === 'videomaker' ? parseFloat(payoutVM) : parseFloat(payoutED)
      await supabase.from('transactions').insert({
        professional_id: assign.professional_id,
        service_id: serviceId,
        type: 'credit',
        amount: amount
      })
    }
  }

  // 5. GATILHO STAGE 6: Disparar e-mails para os alunos
  const domain = 'https://postai.app' // Em produção usaríamos o domínio real
  const { data: deliverables } = await supabase
    .from('media_uploads')
    .select(`
      id,
      slot_id,
      slots ( student_name, student_email )
    `)
    .eq('service_id', serviceId)
    .eq('kind', 'final')

  if (deliverables) {
    for (const item of deliverables) {
      const student = item.slots as any
      if (student?.student_email) {
        await sendDeliveryEmail(
          env, 
          student.student_name, 
          student.student_email, 
          `${domain}/delivery/${item.id}`,
          (service.units as any).name
        )
        // Marcar como entregue
        await supabase.from('media_uploads').update({ delivered_at: new Date().toISOString() }).eq('id', item.id)
      }
    }
  }

  return c.json({ message: 'Produção aprovada com sucesso! Alunos notificados e crédito liberado para o profissional.' })
})

// [POST] /v1/gym/services/:id/reject
// Rota para a academia solicitar ajustes no material
app.post('/v1/gym/services/:id/reject', async (c) => {
  const serviceId = c.req.param('id')
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)
  const { notes } = await c.req.json()

  // 1. Validar se o usuário é Manager/Owner da Gym dona desse serviço
  const { data: service, error: sError } = await supabase
    .from('services')
    .select('*, units!inner(gym_id)')
    .eq('id', serviceId)
    .single()

  if (sError || !service) return c.json({ error: 'Serviço não encontrado' }, 404)

  const { data: membership } = await supabase
    .from('memberships')
    .select('*')
    .eq('profile_id', profileId)
    .eq('entity_id', service.units.gym_id)
    .in('role', ['owner', 'manager'])
    .single()

  if (!membership) {
    return c.json({ error: 'Você não tem permissão para rejeitar esta produção.' }, 403)
  }

  // 2. Atualizar status e salvar notas de ajuste
  const { error } = await supabase
    .from('services')
    .update({ 
      status: 'adjustment_requested',
      adjustment_notes: notes || 'Ajuste solicitado pelo gestor da academia.',
      updated_at: new Date().toISOString()
    })
    .eq('id', serviceId)

  if (error) return c.json({ error: 'Erro ao solicitar ajuste', details: error.message }, 500)

  return c.json({ message: 'Solicitação de ajuste enviada para o editor. Nossa equipe e os profissionais foram notificados.' })
})

/**
 * [POST] /v1/editor/services/:id/claim
 * Editor assume um job
 */
app.post('/v1/editor/services/:id/claim', async (c) => {
  const serviceId = c.req.param('id')
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  // 1. Verificar se o profissional existe e não está bloqueado
  const { data: pro, error: proError } = await supabase
    .from('professionals')
    .select('id, status')
    .eq('profile_id', profileId)
    .single()

  if (proError || !pro || pro.status === 'blocked') {
    return c.json({ error: 'Este perfil profissional não tem permissão para assumir jobs.' }, 403)
  }

  // 2. Criar atribuição de Editor
  const { error: assignError } = await supabase
    .from('service_assignments')
    .insert({
      service_id: serviceId,
      professional_id: pro.id,
      role: 'editor',
      status: 'assigned',
      assigned_by_profile_id: profileId // Auto-atribuição
    })

  if (assignError) {
    if (assignError.code === '23505') return c.json({ error: 'Este job já foi assumido por outro editor.' }, 409)
    return c.json({ error: 'Erro ao assumir job', details: assignError.message }, 500)
  }

  // 3. Atualizar status do serviço
  await supabase.from('services').update({ status: 'in_progress' }).eq('id', serviceId)

  return c.json({ success: true })
})

/**
 * =============================================================================
 * PUBLIC ENDPOINTS FOR STUDENT BOOKING (Universal Booking Engine)
 * =============================================================================
 */

// 1. Busca Unidades (Público)
app.get('/v1/public/units/search', async (c) => {
  const query = c.req.query('q')
  const supabase = getSupabase(c)

  const { data, error } = await supabase
    .from('units')
    .select(`
      id, name, address,
      gyms ( company_name, brandings (*) )
    `)
    .ilike('name', `%${query || ''}%`)
    .limit(20)

  if (error) return c.json({ error: 'Erro ao buscar unidades', details: error.message }, 500)
  return c.json({ data })
})

// 2. Disponibilidade da Unidade (Público)
app.get('/v1/public/units/:id/availability', async (c) => {
  const unitId = c.req.param('id')
  const supabase = getSupabase(c)

  // Buscar Unidade e Branding
  const { data: unit, error: uError } = await supabase
    .from('units')
    .select('*, gyms(company_name, brandings(*))')
    .eq('id', unitId)
    .single()

  if (uError) return c.json({ error: 'Unidade não encontrada' }, 404)

  // Buscar slots VAGOS para os próximos 7 dias desta unidade
  const { data: slots, error: sError } = await supabase
    .from('slots')
    .select('*, services!inner(unit_id)')
    .eq('services.unit_id', unitId)
    .is('student_name', null)
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })

  if (sError) return c.json({ error: 'Erro ao buscar disponibilidade', details: sError.message }, 500)

  return c.json({ data: { unit, slots } })
})

// 3. Reservar Slot (Público)
app.post('/v1/public/slots/:id/book', async (c) => {
  const slotId = c.req.param('id')
  const payload = await c.req.json()
  const supabase = getSupabase(c)

  // Verificar se o slot ainda está vago (Race Condition Protection)
  const { data: slot, error: fError } = await supabase
    .from('slots')
    .select('student_name')
    .eq('id', slotId)
    .single()

  if (fError || !slot) return c.json({ error: 'Horário não encontrado' }, 404)
  if (slot.student_name) return c.json({ error: 'Desculpe, este horário acabou de ser reservado!' }, 409)

  // Realizar Reserva
  const { error: bError } = await supabase
    .from('slots')
    .update({
      student_name: payload.student_name,
      student_email: payload.student_email,
      student_phone: payload.student_phone,
      status: 'confirmed'
    })
    .eq('id', slotId)

  if (bError) return c.json({ error: 'Erro ao realizar reserva', details: bError.message }, 500)

  return c.json({ success: true })
})

/**
 * [POST] /v1/editor/services/:id/submit
 * Editor finaliza a edição e envia para revisão
 */
app.post('/v1/editor/services/:id/submit', async (c) => {
  const serviceId = c.req.param('id')
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  // 1. Validar se o editor está realmente atribuído a este job
  const { data: assignment, error: assignError } = await supabase
    .from('service_assignments')
    .select('id')
    .eq('service_id', serviceId)
    .eq('role', 'editor')
    .single()

  if (assignError || !assignment) {
    return c.json({ error: 'Você não tem permissão para submeter este job.' }, 403)
  }

  // 2. Buscar Serviço, Slots e Mídias para validar entrega total
  const { data: service, error: sError } = await supabase
    .from('services')
    .select('*, units(name, gym_id, gyms(company_name)), slots(*), media_uploads(*)')
    .eq('id', serviceId)
    .single()

  if (sError) return c.json({ error: 'Erro ao buscar serviço', details: sError.message }, 500)

  // GATILHO DE SEGURANÇA: Conferir se todos os alunos têm vídeo final
  const occupiedSlots = service.slots?.filter((s: any) => s.student_name && s.status !== 'cancelled') || []
  const missingFinals = occupiedSlots.filter((slot: any) => {
    const hasFinal = service.media_uploads?.some((m: any) => m.slot_id === slot.id && m.kind === 'final')
    return !hasFinal
  })

  if (missingFinals.length > 0) {
    return c.json({ 
      error: 'Entrega Incompleta', 
      details: `Você precisa subir o Vídeo Final para todos os ${occupiedSlots.length} alunos atendidos antes de enviar para revisão.` 
    }, 400)
  }

  const { error: statusError } = await supabase
    .from('services')
    .update({ 
      status: 'under_review', 
      updated_at: new Date().toISOString() 
    })
    .eq( 'id', serviceId)

  if (statusError) return c.json({ error: 'Erro ao enviar para revisão', details: statusError.message }, 500)

  // GATILHO: Notificar Gestores da Academia
  const { data: managers } = await supabase
    .from('memberships')
    .select('profiles(email)')
    .eq('entity_id', service.units.gym_id)
    .eq('entity_type', 'gym')
    .in('role', ['owner', 'manager'])

  const managerEmails = managers?.map((m: any) => m.profiles.email).filter(Boolean) || []

  if (managerEmails.length > 0) {
    const domain = 'https://postai.app'
    await sendInternalEmail(
      c.env,
      managerEmails,
      `✅ Produção Pronta para Revisão: ${service.units.name}`,
      'Vídeos Disponíveis!',
      `A edição da sessão <strong>${service.units.name}</strong> foi concluída pelo editor. Acesse seu painel de produções para revisar o material final e aprovar a entrega.`,
      'REVISAR AGORA',
      `${domain}/dashboard/productions`
    )
  }

  // 3. Simulação de Notificação para a Academia
  console.log(`[Notification] Produção ${serviceId} enviada para REVISÃO da academia.`)

  return c.json({ success: true, message: 'Vídeo enviado para revisão com sucesso!' })
})

/**
 * [GET] /v1/pro/wallet
 * Resumo financeiro do profissional
 */
app.get('/v1/pro/wallet', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  // 1. Buscar ID do profissional
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('profile_id', profileId)
    .single()

  if (!pro) return c.json({ error: 'Profissional não encontrado' }, 404)

  // 2. Buscar todas as transações
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('professional_id', pro.id)
    .order('created_at', { ascending: false })

  // 3. Calcular Saldo Disponível
  const availableBalance = transactions?.reduce((acc: number, t: any) => {
    if (t.type === 'credit') return acc + parseFloat(t.amount)
    if (t.type === 'payout' || t.type === 'platform_fee') return acc - parseFloat(t.amount)
    return acc
  }, 0) || 0

  // 4. Calcular Saldo Pendente (Jobs em revisão)
  // Buscamos serviços onde ele está atribuído e o status é 'under_review'
  const { data: pendingServices } = await supabase
    .from('service_assignments')
    .select('role, services!inner(status)')
    .eq('professional_id', pro.id)
    .eq('services.status', 'under_review')

  // Buscar valores padrão para estimativa
  const payoutVM = await getSetting(supabase, 'payout_videomaker_default', '150.00')
  const payoutED = await getSetting(supabase, 'payout_editor_default', '100.00')

  const pendingBalance = pendingServices?.reduce((acc: number, s: any) => {
    return acc + (s.role === 'videomaker' ? parseFloat(payoutVM) : parseFloat(payoutED))
  }, 0) || 0

  return c.json({
    available: availableBalance,
    pending: pendingBalance,
    history: transactions || []
  })
})

/**
 * [POST] /v1/pro/withdraw
 * Solicitação de Saque Pix
 */
app.post('/v1/pro/withdraw', async (c) => {
  const { amount } = await c.req.json()
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  // 1. Buscar Profissional e Saldo
  const { data: pro } = await supabase
    .from('professionals')
    .select('id, pix_key')
    .eq('profile_id', profileId)
    .single()

  if (!pro || !pro.pix_key) return c.json({ error: 'Configure sua chave Pix antes de sacar.' }, 400)

  // 2. Validar saldo (Simplificado: chama a lógica interna de wallet)
  // Em prod, faríamos uma query de agregação no DB
  const walletRes = await app.request('/v1/pro/wallet', {
    headers: { Authorization: c.req.header('Authorization') || '' }
  })
  const wallet = await walletRes.json()

  if (amount > (wallet as any).available) {
    return c.json({ error: 'Saldo insuficiente para este saque.' }, 400)
  }

  // 3. Criar Pedido de Saque e Débito Preventivo
  const idempotencyKey = `payout_${pro.id}_${Date.now()}`
  
  const { error: payoutError } = await supabase
    .from('payout_requests')
    .insert({
      professional_id: pro.id,
      amount: amount,
      status: 'requested',
      idempotency_key: idempotencyKey
    })

  if (payoutError) return c.json({ error: 'Erro ao processar saque', details: payoutError.message }, 500)

  // Registrar a transação de débito (tipo payout)
  await supabase.from('transactions').insert({
    professional_id: pro.id,
    type: 'payout',
    amount: amount
  })

  return c.json({ success: true, message: 'Saque solicitado com sucesso! O processamento ocorre em até 24h.' })
})

/**
 * [GET] /v1/admin/payouts
 * Lista todos os pedidos de saque para o Admin
 */
app.get('/v1/admin/payouts', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!(await isAdmin(c, profileId))) {
    return c.json({ error: 'Não autorizado' }, 403)
  }

  const { data, error } = await supabase
    .from('payout_requests')
    .select(`
      *,
      professionals (
        pix_key,
        profiles ( full_name, email )
      )
    `)
    .order('requested_at', { ascending: false })

  if (error) return c.json({ error: 'Erro ao buscar pedidos de saque', details: error.message }, 500)
  return c.json({ data })
})

/**
 * [PATCH] /v1/admin/payouts/:id/status
 * Atualiza status do pedido de saque (Processar/Pagar)
 */
app.patch('/v1/admin/payouts/:id/status', async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json()
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!(await isAdmin(c, profileId))) {
    return c.json({ error: 'Não autorizado' }, 403)
  }

  const updateData: any = { status, updated_at: new Date().toISOString() }
  if (status === 'completed') {
    updateData.processed_at = new Date().toISOString()
    updateData.processed_by_profile_id = profileId
  }

  const { error } = await supabase
    .from('payout_requests')
    .update(updateData)
    .eq('id', id)

  if (error) return c.json({ error: 'Erro ao atualizar pedido', details: error.message }, 500)

  return c.json({ success: true, message: `Status do saque atualizado para ${status}` })
})

/**
 * [GET] /v1/admin/analytics
 * Dashboard de inteligência operativa
 */
app.get('/v1/admin/analytics', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!(await isAdmin(c, profileId))) {
    return c.json({ error: 'Não autorizado' }, 403)
  }

  // 1. Métricas de Volume
  const { count: totalServices } = await supabase.from('services').select('*', { count: 'exact', head: true })
  const { count: completedServices } = await supabase.from('services').select('*', { count: 'exact', head: true }).eq('status', 'completed')
  const { count: totalDeliveries } = await supabase.from('media_uploads').select('*', { count: 'exact', head: true }).not('delivered_at', 'is', null)

  // 2. Tempo Médio de Entrega (TAT)
  // Pegamos a diferença entre service.start_at e media_upload.delivered_at
  const { data: tatData } = await supabase
    .from('media_uploads')
    .select(`
      delivered_at,
      services ( start_at )
    `)
    .not('delivered_at', 'is', null)
    .eq('kind', 'final')

  let avgTatHours = 0
  if (tatData && tatData.length > 0) {
    const totalHours = tatData.reduce((acc, item) => {
      const start = new Date((item.services as any).start_at).getTime()
      const end = new Date(item.delivered_at as string).getTime()
      return acc + (end - start) / (1000 * 60 * 60)
    }, 0)
    avgTatHours = totalHours / tatData.length
  }

  return c.json({
    totalServices: totalServices || 0,
    completedServices: completedServices || 0,
    totalDeliveries: totalDeliveries || 0,
    avgTatHours: avgTatHours.toFixed(1),
    conversionRate: ((totalDeliveries || 0) / (totalServices || 1) * 100).toFixed(1)
  })
})

/**
 * [GET] /v1/admin/performance-ranking
 * Ranking de Profissionais por TAT (Velocidade)
 */
app.get('/v1/admin/performance-ranking', async (c) => {
  const jwtPayload = c.get('jwtPayload') as any
  const profileId = jwtPayload?.sub
  const supabase = getSupabase(c)

  if (!(await isAdmin(c, profileId))) {
    return c.json({ error: 'Não autorizado' }, 403)
  }

  const { data, error } = await supabase
    .from('professional_performance_ranking')
    .select('*')
    .limit(10)

  if (error) return c.json({ error: 'Erro ao buscar ranking', details: error.message }, 500)
  return c.json({ data })
})

/**
 * [POST] /v1/student/auth/request
 * Solicita link mágico para acesso do aluno
 */
app.post('/v1/student/auth/request', async (c) => {
  const { email } = await c.req.json()
  const supabase = getSupabase(c)
  const env = c.env

  // 1. Verificar se o e-mail existe em algum slot (para evitar spam/acesso indevido)
  const { data: slot } = await supabase
    .from('slots')
    .select('id')
    .eq('student_email', email)
    .limit(1)
    .single()

  if (!slot) return c.json({ error: 'Nenhuma produção encontrada para este e-mail.' }, 404)

  // 2. Gerar Token Mágico
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hora

  await supabase.from('student_magic_links').insert({
    email,
    token,
    expires_at: expiresAt
  })

  // 3. Enviar E-mail
  const domain = 'https://postai.app'
  const magicLink = `${domain}/student/verify?token=${token}`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'PostAI <entregas@postai.app>',
      to: [email],
      subject: 'Seu acesso ao Portal do Aluno PostAI 🎬',
      html: `
        <div style="background-color: #050505; color: #ffffff; padding: 40px; font-family: sans-serif; border-radius: 12px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #7c3aed;">POSTAI</h1>
          <p>Clique no botão abaixo para acessar seu histórico de produções. Este link expira em 1 hora.</p>
          <a href="${magicLink}" style="background-color: #7c3aed; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">ACESSAR MEU MURAL</a>
        </div>
      `
    })
  })

  return c.json({ success: true, message: 'Link mágico enviado!' })
})

/**
 * [POST] /v1/student/auth/verify
 * Valida o link mágico e cria sessão de 30 dias
 */
app.post('/v1/student/auth/verify', async (c) => {
  const { token } = await c.req.json()
  const supabase = getSupabase(c)

  // 1. Validar link mágico
  const { data: magicLink, error } = await supabase
    .from('student_magic_links')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !magicLink) return c.json({ error: 'Link inválido ou expirado.' }, 401)

  // 2. Criar sessão de 30 dias
  const sessionToken = crypto.randomUUID()
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: session } = await supabase.from('student_sessions').insert({
    email: magicLink.email,
    token: sessionToken,
    expires_at: sessionExpiresAt
  }).select().single()

  // 3. Limpar link mágico usado
  await supabase.from('student_magic_links').delete().eq('id', magicLink.id)

  return c.json({ sessionToken: session.token, email: session.email })
})

/**
 * [GET] /v1/student/feed
 * Busca o histórico de vídeos do aluno (estilo TikTok)
 */
app.get('/v1/student/feed', async (c) => {
  const authHeader = c.req.header('Authorization')
  const sessionToken = authHeader?.replace('Bearer ', '')
  const supabase = getSupabase(c)

  // 1. Validar Sessão
  const { data: session } = await supabase
    .from('student_sessions')
    .select('email')
    .eq('token', sessionToken)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!session) return c.json({ error: 'Sessão expirada.' }, 401)

  // 2. Buscar Vídeos (Finalizados e Entregues) do Aluno
  const { data: videos } = await supabase
    .from('media_uploads')
    .select(`
      id,
      kind,
      r2_key,
      created_at,
      slots ( student_name ),
      services ( units ( name ) )
    `)
    .eq('kind', 'final')
    .eq('slots.student_email', session.email)
    .order('created_at', { ascending: false })

  // Filtrar apenas o que o e-mail do slot bate (Inner Join manual via Supabase Select)
  const filteredVideos = videos?.filter((v: any) => v.slots !== null) || []

  return c.json({ videos: filteredVideos })
})

export default app
