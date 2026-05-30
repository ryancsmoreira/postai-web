import { NextResponse } from 'next/server'
import { createClientAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const { videoId, name, phone, instagram } = await request.json()

    if (!videoId || !name || !phone) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
    }

    const supabase = createClientAdmin()

    // 1. Verifica se já existe um lead com o mesmo telefone
    const { data: existingLead } = await supabase
      .from('web_leads')
      .select('id')
      .eq('phone', phone.trim())
      .maybeSingle()

    if (existingLead) {
      console.log(`📝 [API Lead] Lead existente encontrado para o telefone ${phone}. Atualizando...`)
      
      // Atualiza o lead com as novas informações e o novo vídeo
      const { error: updateError } = await supabase
        .from('web_leads')
        .update({
          name: name.trim(),
          instagram: instagram ? instagram.trim().replace('@', '') : null,
          video_id: videoId, // Vincula ao vídeo atual para que o admin saiba qual vídeo liberou o lead
        })
        .eq('id', existingLead.id)

      if (updateError) {
        console.error('🚨 [API Lead] Erro ao atualizar lead:', updateError)
        return NextResponse.json({ error: `Erro ao atualizar dados: ${updateError.message}` }, { status: 500 })
      }
    } else {
      console.log(`📝 [API Lead] Nenhum lead encontrado para ${phone}. Criando novo...`)
      
      // Cria novo lead no banco
      const { error: insertError } = await supabase
        .from('web_leads')
        .insert({
          video_id: videoId,
          name: name.trim(),
          phone: phone.trim(),
          instagram: instagram ? instagram.trim().replace('@', '') : null,
        })

      if (insertError) {
        console.error('🚨 [API Lead] Erro ao cadastrar lead:', insertError)
        return NextResponse.json({ error: `Erro ao salvar dados: ${insertError.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('🚨 [API Lead] Exceção em POST /api/lead:', err)
    return NextResponse.json({ error: err.message || 'Erro interno no servidor' }, { status: 500 })
  }
}
