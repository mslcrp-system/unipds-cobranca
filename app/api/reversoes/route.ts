import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Le cobranca.vw_reversoes no servidor -- a view traz aluno_nome, cpf_cnpj, e-mail e
// telefone. O dashboard so precisa de dois campos para somar o volume revertido, entao e
// so isso que atravessa: valor_revertido e origem_valor. Nenhum dado pessoal sai daqui.

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('vw_reversoes')
    .select('valor_revertido, origem_valor')
    .eq('houve_reversao', true)

  if (error) {
    console.error('[api/reversoes] falhou:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}
