import { createClient } from '@supabase/supabase-js'

// Cliente de SERVIDOR. Usa a service_role, que ignora GRANT e RLS.
//
// Existe porque vw_casos_cobranca e vw_reversoes carregam nome, CPF, e-mail e telefone de
// aluno. Enquanto o browser as lia com a anon key, qualquer pessoa que abrisse o dashboard
// tinha a chave no bundle e podia baixar as duas direto pela API. Estas views passam a ser
// lidas apenas por Route Handler, aqui no servidor, e o navegador recebe só o resultado.
//
// NUNCA importe este arquivo de um componente com "use client", nem prefixe a variavel com
// NEXT_PUBLIC_ -- as duas coisas mandariam a chave para o navegador, que e exatamente o
// problema que este arquivo resolve.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente')
if (!serviceRoleKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY ausente. Sem ela o dashboard nao le a fila de cobranca. ' +
    'Configure em .env.local e nas Environment Variables do projeto na Vercel.'
  )
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  db: { schema: 'cobranca' },
  auth: { persistSession: false, autoRefreshToken: false },
})
