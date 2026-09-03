// Sessao do dashboard, assinada com HMAC-SHA256.
//
// Existe porque as rotas /api/* servem a fila de cobranca com nome, CPF, e-mail e telefone.
// Sem isto, quem souber a URL le tudo sem credencial nenhuma. O Deployment Protection da
// Vercel resolveria, mas cobra um add-on de US$ 150/mes -- inviavel aqui.
//
// Usa Web Crypto (crypto.subtle) e nao o modulo `crypto` do Node, porque o middleware roda
// no Edge Runtime, onde o modulo do Node nao existe. O mesmo codigo serve aos dois lados.

const COOKIE_NAME = 'unipds_cobranca_sessao'
const DURACAO_MS = 12 * 60 * 60 * 1000 // 12h: cobre um turno inteiro sem pedir senha de novo

const enc = new TextEncoder()

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function chave(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
}

async function assinar(valor: string, segredo: string): Promise<string> {
  return base64url(await crypto.subtle.sign('HMAC', await chave(segredo), enc.encode(valor)))
}

// Comparacao de tempo constante: nao entrega, pelo tempo de resposta, quantos caracteres
// do valor esperado o palpite acertou.
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return dif === 0
}

export async function criarToken(segredo: string): Promise<string> {
  const exp = String(Date.now() + DURACAO_MS)
  return `${exp}.${await assinar(exp, segredo)}`
}

export async function tokenValido(token: string | undefined, segredo: string): Promise<boolean> {
  if (!token) return false
  const ponto = token.indexOf('.')
  if (ponto < 1) return false
  const exp = token.slice(0, ponto)
  const sig = token.slice(ponto + 1)
  if (!/^\d+$/.test(exp)) return false
  if (Date.now() > Number(exp)) return false
  return iguais(sig, await assinar(exp, segredo))
}

export async function senhaCorreta(palpite: string, esperada: string): Promise<boolean> {
  // Compara os HMACs, nao as strings: iguala o comprimento antes da comparacao e evita
  // vazar o tamanho da senha real.
  const seg = 'comparacao-de-senha'
  return iguais(await assinar(palpite, seg), await assinar(esperada, seg))
}

export { COOKIE_NAME, DURACAO_MS }
