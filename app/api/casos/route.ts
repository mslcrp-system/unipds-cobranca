import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Le cobranca.vw_casos_cobranca no servidor. A view carrega nome, CPF, e-mail e telefone,
// entao nao pode ser lida com a anon key do navegador.
//
// Dois modos, os mesmos dois que o dashboard sempre fez:
//   GET /api/casos            -> a fila de trabalho (exclui pago/baixado, ordenada)
//   GET /api/casos?ids=a,b,c  -> so nome e voomp_contrato_id dos casos pedidos (negociacoes)

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const ids = new URL(request.url).searchParams.get('ids')

  if (ids !== null) {
    const lista = ids.split(',').map(s => s.trim()).filter(Boolean)
    if (lista.length === 0) return NextResponse.json([])

    const { data, error } = await supabaseAdmin
      .from('vw_casos_cobranca')
      .select('caso_id, nome, voomp_contrato_id')
      .in('caso_id', lista)

    if (error) {
      console.error('[api/casos] resumo por ids falhou:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data ?? [])
  }

  // Só cobrança ativa: exclui encerrados (pago/baixado) — carteira, aging, funil e
  // top5 refletem apenas contratos ainda em cobrança. Encerrados ficam para vista futura.
  const { data, error } = await supabaseAdmin
    .from('vw_casos_cobranca')
    .select('*')
    .not('status_efetivo', 'in', '("pago","baixado")')
    .order('faixa_aging', { ascending: false })
    .order('valor_total_aberto', { ascending: false })

  if (error) {
    console.error('[api/casos] fila falhou:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}
