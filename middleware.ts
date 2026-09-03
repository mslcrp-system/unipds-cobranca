import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_NAME, tokenValido } from '@/lib/auth'

// Trava de acesso do dashboard. Cobre a pagina E as rotas /api/*, porque a fila de cobranca
// carrega nome, CPF, e-mail e telefone -- deixar /api/casos aberto seria o mesmo furo com
// outra porta.
//
// Pagina sem sessao -> redireciona para /login.
// Rota de API sem sessao -> 401 em JSON (nao redireciona: quem chama e fetch, nao navegador).

const LIVRES = ['/login', '/api/auth/login']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (LIVRES.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const segredo = process.env.DASHBOARD_SESSION_SECRET
  if (!segredo) {
    // Sem segredo configurado nao da para validar sessao nenhuma. Fecha em vez de liberar:
    // env faltando no deploy nao pode virar dashboard aberto.
    console.error('[middleware] DASHBOARD_SESSION_SECRET ausente -- acesso bloqueado')
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'servidor sem DASHBOARD_SESSION_SECRET' }, { status: 503 })
      : new NextResponse('Configuracao ausente: DASHBOARD_SESSION_SECRET', { status: 503 })
  }

  if (await tokenValido(request.cookies.get(COOKIE_NAME)?.value, segredo)) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'nao autenticado' }, { status: 401 })
  }

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = pathname === '/' ? '' : `?de=${encodeURIComponent(pathname)}`
  return NextResponse.redirect(url)
}

export const config = {
  // Tudo, menos os estaticos do proprio Next e o favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
