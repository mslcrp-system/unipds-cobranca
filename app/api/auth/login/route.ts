import { NextResponse } from 'next/server'
import { COOKIE_NAME, DURACAO_MS, criarToken, senhaCorreta } from '@/lib/auth'

// Recebe a senha, confere contra DASHBOARD_PASSWORD e, se bater, grava o cookie de sessao.
// A senha nunca vai para o cliente -- so o cookie assinado, httpOnly.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const esperada = process.env.DASHBOARD_PASSWORD
  const segredo  = process.env.DASHBOARD_SESSION_SECRET

  if (!esperada || !segredo) {
    console.error('[api/auth/login] DASHBOARD_PASSWORD ou DASHBOARD_SESSION_SECRET ausente')
    return NextResponse.json({ error: 'servidor nao configurado' }, { status: 503 })
  }

  let senha = ''
  try {
    const body = await request.json()
    senha = typeof body?.senha === 'string' ? body.senha : ''
  } catch {
    return NextResponse.json({ error: 'corpo invalido' }, { status: 400 })
  }

  if (!senha || !(await senhaCorreta(senha, esperada))) {
    // Atraso pequeno para tornar tentativa em massa desinteressante, sem irritar quem
    // simplesmente errou a digitacao.
    await new Promise(r => setTimeout(r, 600))
    return NextResponse.json({ error: 'senha incorreta' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: COOKIE_NAME,
    value: await criarToken(segredo),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(DURACAO_MS / 1000),
  })
  return res
}
