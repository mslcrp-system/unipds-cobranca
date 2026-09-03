"use client"

import { useState } from "react"

// Tela de senha do dashboard. Mesma paleta do painel para nao parecer outra aplicacao.
const C = {
  bg:      "#e8f0f7",
  card:    "#ffffff",
  border:  "#e2eaf3",
  text:    "#1a2332",
  muted:   "#8496ae",
  blue:    "#4a90d9",
  red:     "#e85d5d",
  redBg:   "#fce8e8",
}

export default function Login() {
  const [senha, setSenha]     = useState("")
  const [erro, setErro]       = useState<string | null>(null)
  const [enviando, setEnv]    = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    if (!senha || enviando) return
    setEnv(true)
    setErro(null)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      })
      if (res.ok) {
        const de = new URLSearchParams(window.location.search).get("de")
        window.location.href = de && de.startsWith("/") ? de : "/"
        return
      }
      const body = await res.json().catch(() => ({}))
      setErro(res.status === 401 ? "Senha incorreta." : (body?.error ?? "Nao foi possivel entrar."))
    } catch {
      setErro("Falha de rede. Tente de novo.")
    }
    setEnv(false)
  }

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    }}>
      <form onSubmit={entrar} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 32, width: "100%", maxWidth: 380,
        boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
      }}>
        <h1 style={{ margin: 0, fontSize: 20, color: C.text, fontWeight: 600 }}>
          Cobrança UNIPDS
        </h1>
        <p style={{ marginTop: 8, marginBottom: 24, fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
          A fila tem dados pessoais de alunos. Informe a senha de acesso.
        </p>

        <label htmlFor="senha" style={{ display: "block", fontSize: 13, color: C.text, marginBottom: 6 }}>
          Senha
        </label>
        <input
          id="senha"
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          autoFocus
          autoComplete="current-password"
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 15,
            border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, outline: "none",
          }}
        />

        {erro && (
          <div role="alert" style={{
            marginTop: 12, padding: "8px 12px", fontSize: 13,
            background: C.redBg, color: C.red, borderRadius: 8,
          }}>
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={enviando || !senha}
          style={{
            marginTop: 20, width: "100%", padding: "11px 16px", fontSize: 15, fontWeight: 600,
            color: "#fff", background: enviando || !senha ? C.muted : C.blue,
            border: "none", borderRadius: 8,
            cursor: enviando || !senha ? "default" : "pointer",
          }}
        >
          {enviando ? "Entrando..." : "Entrar"}
        </button>

        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12, color: C.muted }}>
          A sessão dura 12 horas.
        </p>
      </form>
    </div>
  )
}
