"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase, supabaseRpc } from "@/lib/supabase"

// ─── PALETA ───────────────────────────────────────────────────
const C = {
  bg:       "#e8f0f7",
  sidebar:  "#ffffff",
  card:     "#ffffff",
  border:   "#e2eaf3",
  text:     "#1a2332",
  muted:    "#8496ae",
  green:    "#4caf82",  greenBg:  "#e8f7ef",
  pink:     "#e85d8a",  pinkBg:   "#fce8f0",
  orange:   "#f5a623",  orangeBg: "#fef6e8",
  blue:     "#4a90d9",  blueBg:   "#e8f2fc",
  purple:   "#7c6ef7",  purpleBg: "#f0eeff",
  red:      "#e85d5d",  redBg:    "#fce8e8",
}

const shadow   = "0 2px 12px rgba(0,0,0,0.06)"
const shadowMd = "0 4px 20px rgba(0,0,0,0.10)"

// ─── TIPOS ────────────────────────────────────────────────────
type StatusCaso = "em_aberto"|"em_contato"|"em_negociacao"|"acordo_ativo"|"pago"|"extrajudicial"|"baixado"
type FaixaAging = "faixa_1"|"faixa_2"|"faixa_3"|"faixa_4"

interface Caso {
  caso_id: string
  tenant_id: string
  tenant_nome: string
  status: StatusCaso
  faixa_aging: FaixaAging
  valor_total_aberto: number
  parcelas_vencidas: number
  valor_revertido: number | null
  responsavel: string | null
  data_abertura: string
  data_ultima_interacao: string | null
  data_encerramento: string | null
  contract_id: string
  voomp_contrato_id: string | null
  status_contrato: string
  nome: string
  cpf_cnpj: string
  email: string
  telefone: string
  total_contatos: number
  total_retornos: number
  data_ultimo_contato: string | null
  status_negociacao: string | null
  valor_negociado: number | null
  produto?: string
  nome_produto?: string | null
  classe?: string | null
}

interface Interacao {
  interacao_id: string
  caso_id: string
  data_contato: string
  canal: string
  mensagem_enviada: string | null
  houve_retorno: boolean
  observacao: string | null
  operador: string
}

interface Negociacao {
  negociacao_id: string
  caso_id: string
  valor_total_acordado: number
  valor_entrada: number | null
  parcelas_acordadas: number | null
  valor_parcela_acordo: number | null
  data_acordo: string
  data_primeiro_vencimento: string | null
  status: string
  observacao: string | null
  nome?: string
  voomp_contrato_id?: string
}

interface Parcela {
  previsao_id: string
  numero_parcela: number
  total_parcelas: number
  previsao_ref: string
  data_prevista: string
  valor_previsto: number
}

type NegFormKey = "valor" | "entrada" | "parcelas"

// ─── HELPERS ──────────────────────────────────────────────────
const fmt     = (v?: number|null) => v != null ? v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "—"
const fmtDate = (d?: string|null) => d ? new Date(d).toLocaleDateString("pt-BR") : "—"

const STATUS_META: Record<StatusCaso,{label:string,cor:string,bg:string}> = {
  em_aberto:     { label:"Em aberto",     cor:C.muted,  bg:"#f0f4f8"   },
  em_contato:    { label:"Em contato",    cor:C.blue,   bg:C.blueBg    },
  em_negociacao: { label:"Negociando",    cor:C.orange, bg:C.orangeBg  },
  acordo_ativo:  { label:"Acordo ativo",  cor:C.purple, bg:C.purpleBg  },
  pago:          { label:"Pago",          cor:C.green,  bg:C.greenBg   },
  extrajudicial: { label:"Extrajudicial", cor:C.red,    bg:C.redBg     },
  baixado:       { label:"Baixado",       cor:C.muted,  bg:"#f0f4f8"   },
}

const FAIXA_META: Record<FaixaAging,{label:string,cor:string}> = {
  faixa_1: { label:"F1 · 1-30d",  cor:C.green  },
  faixa_2: { label:"F2 · 31-60d", cor:C.orange },
  faixa_3: { label:"F3 · 61-90d", cor:C.pink   },
  faixa_4: { label:"F4 · +90d",   cor:C.red    },
}

// ─── COMPONENTES BASE ─────────────────────────────────────────
const Badge = ({ text, cor, bg }: { text:string, cor:string, bg?:string }) => (
  <span style={{ background:bg??cor+"22", color:cor, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, letterSpacing:"0.04em", whiteSpace:"nowrap" }}>
    {text}
  </span>
)

const Card = ({ children, style={} }: { children:React.ReactNode, style?:React.CSSProperties }) => (
  <div style={{ background:C.card, borderRadius:16, boxShadow:shadow, padding:20, ...style }}>
    {children}
  </div>
)

const SectionTitle = ({ children }: { children:React.ReactNode }) => (
  <div style={{ fontSize:13, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:16 }}>
    {children}
  </div>
)

const Spinner = () => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:40, color:C.muted, fontSize:13 }}>
    Carregando...
  </div>
)

// ─── HOOKS DE DADOS ───────────────────────────────────────────
function useCasos() {
  const [casos, setCasos]     = useState<Caso[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .schema("cobranca")
      .from("vw_casos_cobranca")
      .select("*")
      .order("faixa_aging", { ascending:false })
      .order("valor_total_aberto", { ascending:false })
    if (data) setCasos(data as Caso[])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { casos, loading, refresh: fetch }
}

function useParcelas(contractId: string|null) {
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [loading, setLoading]   = useState(false)

  const fetch = useCallback(async () => {
    if (!contractId) return
    setLoading(true)
    const { data } = await supabaseRpc
      .rpc("get_parcelas_vencidas", { p_contract_id: contractId })
    if (data) setParcelas(data as Parcela[])
    setLoading(false)
  }, [contractId])

  useEffect(() => { fetch() }, [fetch])
  return { parcelas, loading }
}

function useInteracoes(casoId: string|null) {
  const [interacoes, setInteracoes] = useState<Interacao[]>([])
  const [loading, setLoading]       = useState(false)

  const fetch = useCallback(async () => {
    if (!casoId) return
    setLoading(true)
    const { data } = await supabase
      .schema("cobranca")
      .from("cobranca_interacoes")
      .select("*")
      .eq("caso_id", casoId)
      .order("data_contato", { ascending:false })
    if (data) setInteracoes(data as Interacao[])
    setLoading(false)
  }, [casoId])

  useEffect(() => { fetch() }, [fetch])
  return { interacoes, loading, refresh: fetch }
}

function useNegociacoes() {
  const [negociacoes, setNeg] = useState<Negociacao[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .schema("cobranca")
      .from("cobranca_negociacoes")
      .select(`*, cobranca_casos(contract_id, cobranca_casos_contracts:unipds.contracts(voomp_contrato_id), cobranca_casos_students:unipds.students(nome))`)
      .eq("status", "em_andamento")
      .order("data_primeiro_vencimento", { ascending:true })
    if (data) setNeg(data as unknown as Negociacao[])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { negociacoes, loading, refresh: fetch }
}

// ─── MODAL: REGISTRAR CONTATO ─────────────────────────────────
function ModalContato({ caso, onClose, onSave }: { caso:Caso, onClose:()=>void, onSave:()=>void }) {
  const [canal,    setCanal]    = useState("whatsapp")
  const [mensagem, setMensagem] = useState("A")
  const [retorno,  setRetorno]  = useState(false)
  const [obs,      setObs]      = useState("")
  const [saving,   setSaving]   = useState(false)

  const salvar = async () => {
    setSaving(true)
    await supabase.schema("cobranca").from("cobranca_interacoes").insert({
      caso_id:          caso.caso_id,
      canal,
      mensagem_enviada: mensagem,
      houve_retorno:    retorno,
      observacao:       obs || null,
      operador:         "Operador",
    })
    if (caso.status === "em_aberto") {
      await supabase.schema("cobranca").from("cobranca_casos")
        .update({ status: "em_contato" })
        .eq("caso_id", caso.caso_id)
    }
    setSaving(false)
    onSave()
    onClose()
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"#00000055", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
      <div style={{ background:C.card, borderRadius:20, padding:28, width:460, maxWidth:"90vw", boxShadow:shadowMd }}>
        <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>Registrar contato</div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:22 }}>{caso.nome} · {caso.voomp_contrato_id}</div>

        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div>
            <label style={{ fontSize:11, color:C.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>Canal</label>
            <div style={{ display:"flex", gap:8 }}>
              {[["whatsapp","📱 WhatsApp"],["telefone","📞 Telefone"]].map(([v,l]) => (
                <button key={v} onClick={() => setCanal(v)}
                  style={{ flex:1, padding:"10px 0", borderRadius:10, border:`2px solid ${canal===v?C.blue:C.border}`, background:canal===v?C.blueBg:"transparent", color:canal===v?C.blue:C.muted, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize:11, color:C.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>Mensagem enviada</label>
            <select value={mensagem} onChange={e => setMensagem(e.target.value)}
              style={{ width:"100%", padding:"10px 14px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, color:C.text, fontSize:13 }}>
              <option value="A">Mensagem A — Faixa 1, Dia 1</option>
              <option value="B">Mensagem B — Faixa 1, Dia 7</option>
              <option value="C">Mensagem C — Faixa 1, Dia 30</option>
              <option value="D">Mensagem D — Faixa 2, Dia 31</option>
              <option value="E">Mensagem E — Faixa 2, Dia 60</option>
              <option value="F">Mensagem F — Faixa 3, Dia 61</option>
              <option value="personalizada">Personalizada</option>
            </select>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:C.greenBg, borderRadius:10 }}>
            <input type="checkbox" id="ret" checked={retorno} onChange={e => setRetorno(e.target.checked)}
              style={{ width:16, height:16, accentColor:C.green }} />
            <label htmlFor="ret" style={{ fontSize:13, color:C.green, fontWeight:600, cursor:"pointer" }}>Houve retorno do aluno</label>
          </div>

          <div>
            <label style={{ fontSize:11, color:C.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>Observação</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} placeholder="O que aconteceu neste contato..."
              style={{ width:"100%", padding:"10px 14px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, color:C.text, fontSize:13, resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
          </div>
        </div>

        <div style={{ display:"flex", gap:10, marginTop:22 }}>
          <button onClick={onClose}
            style={{ flex:1, padding:"12px 0", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent", color:C.muted, fontSize:13, fontWeight:700, cursor:"pointer" }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving}
            style={{ flex:2, padding:"12px 0", borderRadius:10, border:"none", background:saving?C.muted:C.blue, color:"#fff", fontSize:13, fontWeight:700, cursor:saving?"not-allowed":"pointer" }}>
            {saving ? "Salvando..." : "Salvar contato"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TELA 1: DASHBOARD ────────────────────────────────────────
function Dashboard() {
  const { casos, loading } = useCasos()

  if (loading) return <Spinner />

  const total_casos          = casos.length
  const volume_carteira      = casos.reduce((s,c) => s + c.valor_total_aberto, 0)
  const casos_revertidos     = casos.filter(c => c.status === "pago").length
  const volume_revertido     = casos.filter(c => c.status === "pago").reduce((s,c) => s + (c.valor_revertido ?? 0), 0)
  const total_contatos       = casos.reduce((s,c) => s + c.total_contatos, 0)
  const total_retornos       = casos.reduce((s,c) => s + c.total_retornos, 0)
  const taxa_recuperacao_pct = volume_carteira > 0 ? Math.round(volume_revertido / volume_carteira * 100) : 0
  const taxa_retorno_pct     = total_contatos  > 0 ? Math.round(total_retornos  / total_contatos  * 100) : 0
  const casos_em_aberto      = casos.filter(c => c.status === "em_aberto").length
  const casos_em_contato     = casos.filter(c => c.status === "em_contato").length
  const casos_em_negociacao  = casos.filter(c => c.status === "em_negociacao").length
  const casos_extrajudicial  = casos.filter(c => c.status === "extrajudicial").length

  const agingData = [
    { label:"1–30 dias",  casos:casos.filter(c=>c.faixa_aging==="faixa_1").length, cor:C.green  },
    { label:"31–60 dias", casos:casos.filter(c=>c.faixa_aging==="faixa_2").length, cor:C.orange },
    { label:"61–90 dias", casos:casos.filter(c=>c.faixa_aging==="faixa_3").length, cor:C.pink   },
    { label:"+90 dias",   casos:casos.filter(c=>c.faixa_aging==="faixa_4").length, cor:C.red    },
  ]
  const maxAging = Math.max(...agingData.map(a=>a.casos), 1)
  const top5     = [...casos].sort((a,b)=>b.valor_total_aberto-a.valor_total_aberto).slice(0,5)

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div>
        <div style={{ fontSize:11, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Unipds · Atualizado agora</div>
        <div style={{ fontSize:24, fontWeight:800, color:C.text }}>Dashboard de Cobrança</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
        {[
          { label:"Carteira total",   val:fmt(volume_carteira),          sub:`${total_casos} casos`,                              cor:C.blue,   bg:C.blueBg   },
          { label:"Volume revertido", val:fmt(volume_revertido),         sub:`${casos_revertidos} clientes`,                      cor:C.green,  bg:C.greenBg  },
          { label:"Taxa recuperação", val:`${taxa_recuperacao_pct}%`,    sub:"do volume total",                                   cor:C.orange, bg:C.orangeBg },
          { label:"Taxa de retorno",  val:`${taxa_retorno_pct}%`,        sub:`${total_retornos} de ${total_contatos}`,            cor:C.purple, bg:C.purpleBg },
        ].map((k,i) => (
          <div key={i} style={{ background:k.bg, borderRadius:16, padding:"20px 22px", boxShadow:shadow }}>
            <div style={{ fontSize:11, color:k.cor, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>{k.label}</div>
            <div style={{ fontSize:26, fontWeight:800, color:k.cor, lineHeight:1 }}>{k.val}</div>
            <div style={{ fontSize:12, color:k.cor+"99", marginTop:6 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
        {[
          { label:"Em aberto",    val:casos_em_aberto,    cor:C.muted,  bg:"#f0f4f8"  },
          { label:"Em contato",   val:casos_em_contato,   cor:C.blue,   bg:C.blueBg   },
          { label:"Negociando",   val:casos_em_negociacao,cor:C.orange, bg:C.orangeBg },
          { label:"Extrajudicial",val:casos_extrajudicial, cor:C.red,    bg:C.redBg    },
        ].map((k,i) => (
          <Card key={i} style={{ padding:"16px 20px", display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:k.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:14, height:14, borderRadius:"50%", background:k.cor }} />
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>{k.label}</div>
              <div style={{ fontSize:22, fontWeight:800, color:k.cor }}>{k.val}</div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Card>
          <SectionTitle>Casos por faixa de aging</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {agingData.map(b => (
              <div key={b.label}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:13, color:C.text, fontWeight:600 }}>{b.label}</span>
                  <span style={{ fontSize:13, fontWeight:800, color:b.cor }}>{b.casos} casos</span>
                </div>
                <div style={{ height:8, background:C.bg, borderRadius:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${(b.casos/maxAging)*100}%`, background:b.cor, borderRadius:4 }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>Maiores valores em aberto</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {top5.map((c,i) => (
              <div key={c.caso_id} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:C.muted, flexShrink:0 }}>{i+1}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:C.text, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.nome}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{c.voomp_contrato_id} · {c.tenant_nome}</div>
                </div>
                <div style={{ fontSize:14, fontWeight:800, color:C.text, whiteSpace:"nowrap" }}>{fmt(c.valor_total_aberto)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── TELA 2: LISTA DE CASOS ───────────────────────────────────
function ListaCasos({ onAbrirFicha }: { onAbrirFicha:(c:Caso)=>void }) {
  const { casos, loading, refresh } = useCasos()
  const [filtroFaixa,  setFiltroFaixa]  = useState("todas")
  const [filtroStatus, setFiltroStatus] = useState("todos")
  const [filtroTenant, setFiltroTenant] = useState("todos")
  const [modalCaso,    setModalCaso]    = useState<Caso|null>(null)

  const filtrados = casos.filter(c =>
    (filtroFaixa  === "todas" || c.faixa_aging === filtroFaixa) &&
    (filtroStatus === "todos" || c.status      === filtroStatus) &&
    (filtroTenant === "todos" || c.tenant_nome === filtroTenant)
  )

  const FBtn = ({ val, cur, set, label }: { val: string; cur: string; set: (v: string) => void; label: string }) => (
    <button onClick={() => set(val)}
      style={{ padding:"7px 14px", borderRadius:20, border:`1.5px solid ${cur===val?C.blue:C.border}`, background:cur===val?C.blueBg:"transparent", color:cur===val?C.blue:C.muted, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
      {label}
    </button>
  )

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      {modalCaso && <ModalContato caso={modalCaso} onClose={() => setModalCaso(null)} onSave={refresh} />}

      <div>
        <div style={{ fontSize:24, fontWeight:800, color:C.text }}>Lista de Casos</div>
        <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>{filtrados.length} casos</div>
      </div>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {[["todos","Todos"],["Java","Java"],["IA","IA"]].map(([v,l]) => <FBtn key={v} val={v} cur={filtroTenant} set={setFiltroTenant} label={l} />)}
        <div style={{ width:1, background:C.border }} />
        {[["todas","Todas"],["faixa_1","F1"],["faixa_2","F2"],["faixa_3","F3"],["faixa_4","F4"]].map(([v,l]) => <FBtn key={v} val={v} cur={filtroFaixa} set={setFiltroFaixa} label={l} />)}
        <div style={{ width:1, background:C.border }} />
        {[["todos","Todos"],["em_aberto","Aberto"],["em_contato","Contato"],["em_negociacao","Negoc."],["pago","Pago"]].map(([v,l]) => <FBtn key={v} val={v} cur={filtroStatus} set={setFiltroStatus} label={l} />)}
      </div>

      {loading ? <Spinner /> : (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:C.bg }}>
                {["Aluno","Contrato","Faixa","Parcelas","Valor em aberto","Último contato","Status",""].map((h,i) => (
                  <th key={i} style={{ padding:"12px 16px", textAlign:i>=2?"center":"left", fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:700, borderBottom:`1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.caso_id} style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:"14px 16px" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.blue, cursor:"pointer" }} onClick={() => onAbrirFicha(c)}>{c.nome}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{c.tenant_nome} · {c.email}</div>
                  </td>
                  <td style={{ padding:"14px 16px" }}>
                    <div style={{ fontSize:12, color:C.muted, fontFamily:"monospace" }}>{c.voomp_contrato_id}</div>
                  </td>
                  <td style={{ padding:"14px 16px", textAlign:"center" }}>
                    <Badge text={FAIXA_META[c.faixa_aging].label} cor={FAIXA_META[c.faixa_aging].cor} />
                  </td>
                  <td style={{ padding:"14px 16px", textAlign:"center", fontSize:14, fontWeight:800, color:C.text }}>{c.parcelas_vencidas}</td>
                  <td style={{ padding:"14px 16px", textAlign:"center", fontSize:14, fontWeight:800, color:C.text }}>{fmt(c.valor_total_aberto)}</td>
                  <td style={{ padding:"14px 16px", textAlign:"center", fontSize:12, color:c.data_ultimo_contato?C.muted:C.red }}>
                    {c.data_ultimo_contato ? fmtDate(c.data_ultimo_contato) : "Sem contato"}
                  </td>
                  <td style={{ padding:"14px 16px", textAlign:"center" }}>
                    <Badge text={STATUS_META[c.status].label} cor={STATUS_META[c.status].cor} bg={STATUS_META[c.status].bg} />
                  </td>
                  <td style={{ padding:"14px 16px", textAlign:"center" }}>
                    <button onClick={() => setModalCaso(c)}
                      style={{ padding:"7px 14px", background:C.blueBg, border:`1px solid ${C.blue}33`, borderRadius:8, color:C.blue, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      + Contato
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ─── TELA 3: FICHA DO ALUNO ───────────────────────────────────
function FichaAluno({ caso, onVoltar, onRefresh }: { caso:Caso, onVoltar:()=>void, onRefresh:()=>void }) {
  const { interacoes, loading } = useInteracoes(caso.caso_id)
  const { parcelas, loading: loadingParcelas } = useParcelas(caso.contract_id ?? null)
  const [showNeg,   setShowNeg]   = useState(false)
  const [showPago,  setShowPago]  = useState(false)
  const [valorRev,  setValorRev]  = useState("")
  const [negForm,   setNegForm]   = useState<Record<NegFormKey, string>>({ valor:"", entrada:"", parcelas:"" })
  const [saving,    setSaving]    = useState(false)

  const fecharPago = async () => {
    if (!valorRev) return
    setSaving(true)
    await supabase.schema("cobranca").from("cobranca_casos").update({
      status:                  "pago",
      valor_revertido:         parseFloat(valorRev.replace(/[^0-9,.]/g,"").replace(",",".")),
      data_pagamento_revertido: new Date().toISOString().split("T")[0],
    }).eq("caso_id", caso.caso_id)
    setSaving(false)
    onRefresh()
    onVoltar()
  }

  const salvarNegociacao = async () => {
    if (!negForm.valor) return
    setSaving(true)
    const valorTotal = parseFloat(negForm.valor.replace(/[^0-9,.]/g,"").replace(",","."))
    const entrada    = negForm.entrada ? parseFloat(negForm.entrada.replace(/[^0-9,.]/g,"").replace(",",".")) : null
    const parcelas   = negForm.parcelas ? parseInt(negForm.parcelas) : null
    await supabase.schema("cobranca").from("cobranca_negociacoes").insert({
      caso_id: caso.caso_id, valor_total_acordado: valorTotal,
      valor_entrada: entrada, parcelas_acordadas: parcelas,
      valor_parcela_acordo: parcelas && entrada ? (valorTotal - entrada) / parcelas : null,
    })
    await supabase.schema("cobranca").from("cobranca_casos")
      .update({ status:"acordo_ativo" }).eq("caso_id", caso.caso_id)
    setSaving(false)
    setShowNeg(false)
    onRefresh()
  }

  const enviarEscritorio = async () => {
    await supabase.schema("cobranca").from("cobranca_casos")
      .update({ status:"extrajudicial" }).eq("caso_id", caso.caso_id)
    onRefresh()
    onVoltar()
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div>
        <button onClick={onVoltar} style={{ background:"none", border:"none", color:C.blue, fontSize:13, cursor:"pointer", padding:0, marginBottom:14, fontWeight:600 }}>
          ← Voltar para lista
        </button>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16 }}>
          <div>
            <div style={{ fontSize:22, fontWeight:800, color:C.text }}>{caso.nome}</div>
            <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>
              Curso: {caso.nome_produto ? `${caso.nome_produto} (${caso.classe})` : "—"}
            </div>
            <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>{caso.cpf_cnpj} · {caso.telefone} · {caso.email}</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Badge text={FAIXA_META[caso.faixa_aging].label} cor={FAIXA_META[caso.faixa_aging].cor} />
            <Badge text={STATUS_META[caso.status].label} cor={STATUS_META[caso.status].cor} bg={STATUS_META[caso.status].bg} />
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
        {[
          { label:"Contrato",          val:caso.voomp_contrato_id,       cor:C.text, bg:C.bg     },
          { label:"Tenant",            val:caso.tenant_nome,             cor:C.text, bg:C.bg     },
          { label:"Parcelas vencidas", val:String(caso.parcelas_vencidas), cor:C.red, bg:C.redBg },
          { label:"Valor em aberto",   val:fmt(caso.valor_total_aberto), cor:C.red,  bg:C.redBg  },
        ].map((b,i) => (
          <div key={i} style={{ background:b.bg, borderRadius:14, padding:"16px 18px", boxShadow:shadow }}>
            <div style={{ fontSize:11, color:b.cor+"99", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>{b.label}</div>
            <div style={{ fontSize:16, fontWeight:800, color:b.cor }}>{b.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={() => { setShowNeg(!showNeg); setShowPago(false) }}
          style={{ padding:"10px 18px", background:C.orangeBg, border:`1px solid ${C.orange}44`, borderRadius:10, color:C.orange, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          Registrar negociação
        </button>
        <button onClick={() => { setShowPago(!showPago); setShowNeg(false) }}
          style={{ padding:"10px 18px", background:C.greenBg, border:`1px solid ${C.green}44`, borderRadius:10, color:C.green, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          Fechar como pago
        </button>
        <button onClick={enviarEscritorio}
          style={{ padding:"10px 18px", background:C.redBg, border:`1px solid ${C.red}44`, borderRadius:10, color:C.red, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          Enviar ao escritório
        </button>
      </div>

      {showNeg && (
        <Card style={{ border:`1.5px solid ${C.orange}44` }}>
          <div style={{ fontSize:14, fontWeight:800, color:C.orange, marginBottom:16 }}>Nova negociação</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
            {([
              { l:"Valor total acordado", k:"valor"    as NegFormKey, ph:"R$ 0,00" },
              { l:"Valor de entrada",     k:"entrada"  as NegFormKey, ph:"R$ 0,00" },
              { l:"Nº de parcelas",       k:"parcelas" as NegFormKey, ph:"Ex: 4"   },
            ] as const).map(f => (
              <div key={f.k}>
                <label style={{ fontSize:11, color:C.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:8 }}>{f.l}</label>
                <input placeholder={f.ph} value={negForm[f.k]} onChange={e => setNegForm(p => ({...p,[f.k]:e.target.value}))}
                  style={{ width:"100%", padding:"10px 14px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, color:C.text, fontSize:13, boxSizing:"border-box" }} />
              </div>
            ))}
          </div>
          <button onClick={salvarNegociacao} disabled={saving}
            style={{ marginTop:16, padding:"10px 22px", background:saving?C.muted:C.orange, border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            {saving ? "Salvando..." : "Salvar acordo"}
          </button>
        </Card>
      )}

      {showPago && (
        <Card style={{ border:`1.5px solid ${C.green}44` }}>
          <div style={{ fontSize:14, fontWeight:800, color:C.green, marginBottom:14 }}>Registrar pagamento</div>
          <div style={{ display:"flex", gap:14, alignItems:"flex-end" }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, color:C.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:8 }}>Valor efetivamente pago</label>
              <input value={valorRev} onChange={e => setValorRev(e.target.value)} placeholder="R$ 0,00"
                style={{ width:"100%", padding:"10px 14px", background:C.bg, border:`1.5px solid ${C.green}`, borderRadius:10, color:C.text, fontSize:13, boxSizing:"border-box" }} />
            </div>
            <button onClick={fecharPago} disabled={saving}
              style={{ padding:"10px 22px", background:saving?C.muted:C.green, border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
              {saving ? "Salvando..." : "Fechar como pago"}
            </button>
          </div>
        </Card>
      )}

      {/* Títulos em aberto */}
      <Card style={{ padding:0, overflow:"hidden" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>Títulos em aberto</div>
          <span style={{ fontSize:12, color:C.muted }}>{caso.parcelas_vencidas} parcela(s) · {fmt(caso.valor_total_aberto)}</span>
        </div>
        {loadingParcelas ? <Spinner /> : parcelas.length === 0 ? (
          <div style={{ padding:24, fontSize:13, color:C.muted, textAlign:"center" }}>Nenhuma parcela vencida encontrada.</div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:C.bg }}>
                {["Parcela","Vencimento original","Dias em atraso","Valor"].map((h,i) => (
                  <th key={i} style={{ padding:"10px 16px", textAlign:i>=2?"center":"left", fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:700, borderBottom:`1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p) => {
                const dias = Math.floor((new Date().getTime() - new Date(p.data_prevista).getTime()) / 86400000)
                const corDias = dias > 90 ? C.red : dias > 60 ? C.pink : dias > 30 ? C.orange : C.green
                return (
                  <tr key={p.previsao_id} style={{ borderBottom:`1px solid ${C.border}` }}>
                    <td style={{ padding:"12px 16px" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Parcela {p.numero_parcela} de {p.total_parcelas}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{p.previsao_ref}</div>
                    </td>
                    <td style={{ padding:"12px 16px", fontSize:13, color:C.text }}>{fmtDate(p.data_prevista)}</td>
                    <td style={{ padding:"12px 16px", textAlign:"center" }}>
                      <span style={{ background:corDias+"22", color:corDias, padding:"3px 10px", borderRadius:20, fontSize:12, fontWeight:700 }}>{dias} dias</span>
                    </td>
                    <td style={{ padding:"12px 16px", textAlign:"center", fontSize:14, fontWeight:800, color:C.text }}>{fmt(p.valor_previsto)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card style={{ padding:0, overflow:"hidden" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>Histórico de contatos</div>
          <span style={{ fontSize:12, color:C.muted }}>{interacoes.length} registro(s)</span>
        </div>
        {loading ? <Spinner /> : interacoes.length === 0 ? (
          <div style={{ padding:24, fontSize:13, color:C.muted, textAlign:"center" }}>Nenhum contato registrado ainda.</div>
        ) : interacoes.map((it,idx) => (
          <div key={it.interacao_id} style={{ padding:"16px 20px", borderBottom:idx<interacoes.length-1?`1px solid ${C.border}`:"none", display:"flex", gap:16, alignItems:"flex-start" }}>
            <div style={{ fontSize:12, color:C.muted, whiteSpace:"nowrap", paddingTop:2, minWidth:80 }}>{fmtDate(it.data_contato)}</div>
            <div style={{ display:"flex", gap:6, flexShrink:0, flexWrap:"wrap" }}>
              <Badge text={it.canal==="whatsapp"?"WhatsApp":"Telefone"} cor={C.blue} bg={C.blueBg} />
              {it.mensagem_enviada && <Badge text={`Msg ${it.mensagem_enviada}`} cor={C.purple} bg={C.purpleBg} />}
              <Badge text={it.houve_retorno?"Retornou":"Sem retorno"} cor={it.houve_retorno?C.green:C.muted} bg={it.houve_retorno?C.greenBg:"#f0f4f8"} />
            </div>
            <div style={{ flex:1, fontSize:13, color:C.text }}>{it.observacao}</div>
            <div style={{ fontSize:12, color:C.muted, whiteSpace:"nowrap" }}>{it.operador}</div>
          </div>
        ))}
      </Card>
    </div>
  )
}

// ─── TELA 4: NEGOCIAÇÕES ──────────────────────────────────────
function Negociacoes() {
  const { negociacoes, loading } = useNegociacoes()
  const hoje = new Date()

  const marcarPago = async (neg: Negociacao) => {
    await supabase.schema("cobranca").from("cobranca_negociacoes")
      .update({ status:"cumprido" }).eq("negociacao_id", neg.negociacao_id)
    await supabase.schema("cobranca").from("cobranca_casos")
      .update({ status:"pago", valor_revertido: neg.valor_total_acordado, data_pagamento_revertido: new Date().toISOString().split("T")[0] })
      .eq("caso_id", neg.caso_id)
    window.location.reload()
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div>
        <div style={{ fontSize:24, fontWeight:800, color:C.text }}>Negociações Ativas</div>
        <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>{negociacoes.length} acordos em andamento</div>
      </div>

      {loading ? <Spinner /> : (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:C.bg }}>
                {["Aluno","Contrato","Valor acordado","Entrada","Parcelas","Próx. vencimento",""].map((h,i) => (
                  <th key={i} style={{ padding:"12px 16px", textAlign:i>=2?"center":"left", fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:700, borderBottom:`1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {negociacoes.map(n => {
                const venc = n.data_primeiro_vencimento ? new Date(n.data_primeiro_vencimento) : null
                const dias = venc ? Math.ceil((venc.getTime()-hoje.getTime())/86400000) : null
                const urgente = dias !== null && dias <= 5
                return (
                  <tr key={n.negociacao_id} style={{ borderBottom:`1px solid ${C.border}` }}>
                    <td style={{ padding:"14px 16px" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{n.nome ?? "—"}</div>
                    </td>
                    <td style={{ padding:"14px 16px" }}>
                      <div style={{ fontSize:12, color:C.muted, fontFamily:"monospace" }}>{n.voomp_contrato_id ?? "—"}</div>
                    </td>
                    <td style={{ padding:"14px 16px", textAlign:"center", fontSize:14, fontWeight:800, color:C.text }}>{fmt(n.valor_total_acordado)}</td>
                    <td style={{ padding:"14px 16px", textAlign:"center", fontSize:13, color:C.muted }}>{fmt(n.valor_entrada)}</td>
                    <td style={{ padding:"14px 16px", textAlign:"center", fontSize:13, fontWeight:700, color:C.text }}>
                      {n.parcelas_acordadas}x {fmt(n.valor_parcela_acordo)}
                    </td>
                    <td style={{ padding:"14px 16px", textAlign:"center" }}>
                      <div style={{ fontSize:13, fontWeight:urgente?800:500, color:urgente?C.red:C.text }}>{fmtDate(n.data_primeiro_vencimento)}</div>
                      {dias !== null && <div style={{ fontSize:11, color:urgente?C.red:C.muted, marginTop:2 }}>{dias>0?`em ${dias} dias`:"vencido"}</div>}
                    </td>
                    <td style={{ padding:"14px 16px", textAlign:"center" }}>
                      <button onClick={() => marcarPago(n)}
                        style={{ padding:"7px 14px", background:C.greenBg, border:`1px solid ${C.green}44`, borderRadius:8, color:C.green, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        Marcar pago
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ─── APP PRINCIPAL ────────────────────────────────────────────
const NAV_ICONS: Record<string,string> = { dashboard:"◉", casos:"☰", negociacoes:"◈" }

export default function CobrancaApp() {
  const [tela,  setTela]  = useState("dashboard")
  const [ficha, setFicha] = useState<Caso|null>(null)
  const { refresh } = useCasos()

  const abrirFicha = (caso: Caso) => { setFicha(caso); setTela("ficha") }
  const telaAtiva  = tela === "ficha" ? "casos" : tela

  const navItems = [
    { id:"dashboard",   label:"Dashboard"   },
    { id:"casos",       label:"Casos"       },
    { id:"negociacoes", label:"Negociações" },
  ]

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Nunito','Segoe UI',sans-serif", display:"flex" }}>
      {/* Sidebar */}
      <div style={{ width:220, background:C.sidebar, boxShadow:"2px 0 12px rgba(0,0,0,0.06)", display:"flex", flexDirection:"column", flexShrink:0 }}>
        <div style={{ padding:"24px 20px 20px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:4 }}>Unipds</div>
          <div style={{ fontSize:18, fontWeight:900, color:C.text }}>Cobrança</div>
        </div>
        <nav style={{ padding:"16px 12px", flex:1 }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => setTela(n.id)}
              style={{ width:"100%", padding:"10px 14px", borderRadius:12, border:"none", textAlign:"left", fontSize:13,
                fontWeight:telaAtiva===n.id?800:600, background:telaAtiva===n.id?C.blueBg:"transparent",
                color:telaAtiva===n.id?C.blue:C.muted, cursor:"pointer", marginBottom:4, display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:16 }}>{NAV_ICONS[n.id]}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding:"16px 20px", borderTop:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:10, background:C.blueBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:C.blue }}>A</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Operador</div>
              <div style={{ fontSize:11, color:C.muted }}>Cobrança</div>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex:1, padding:"28px 32px", overflowY:"auto", maxHeight:"100vh" }}>
        {tela==="dashboard"   && <Dashboard />}
        {tela==="casos"       && <ListaCasos onAbrirFicha={abrirFicha} />}
        {tela==="ficha"       && ficha && <FichaAluno caso={ficha} onVoltar={() => setTela("casos")} onRefresh={refresh} />}
        {tela==="negociacoes" && <Negociacoes />}
      </div>
    </div>
  )
}
