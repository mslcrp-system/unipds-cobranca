import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente principal — schema cobranca
export const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'cobranca' },
})

// Cliente secundário — schema unipds (UnipdsBanco)
export const supabaseUnipds = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'unipds' },
})

// Cliente para RPC — sem schema fixo, acessa funções do public
export const supabaseRpc = createClient(supabaseUrl, supabaseKey)
