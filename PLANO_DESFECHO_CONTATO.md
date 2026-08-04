# Plano — Classificação de desfecho do contato (Frentes A + B)

**Data:** 2026-07-31
**Autor front:** Claude (via CLI)
**Revisor banco:** Mentor DB — parecer emitido em 31/07/2026
**Status:** Frente A **aprovada com ajustes** · Frente B **reprovada na forma proposta**, substituída pela §B'

**Motivação:** Time registra observações ricas e narrativas em `cobranca_interacoes.observacao` (91% preenchimento, 60 chars médios), mas a informação está presa em texto livre. Isso impede filtrar casos por tipo de situação — ex: "alunos que alegam não receber boleto" (ação Voomp), "alunos com problema financeiro" (oferecer renegociação) e "sem resposta" (escalar).

---

## §0 — Parecer do mentor (leia antes de executar)

### Premissas verificadas contra o banco

| Afirmação do plano original | Verificado | |
|---|---|---|
| 91% preenchimento, 60 chars médios | 379/417 = 90,9%; média 60,0 | ✅ |
| 417 registros existentes | 417 (21/05 a 30/07/2026) | ✅ |
| "amostragem de 50 com `houve_retorno=true`" | existem **55 no total** | ⚠️ amostra = 91% do universo; taxonomia sem holdout |
| "regras cobrem ~80%" | **68,6%** — e 55,4pp disso é `sem_resposta` | ❌ |
| "~76 registros não bateram regex" | **131** | ❌ 72% a mais |

### As cinco correções que motivam esta revisão

1. **Metade da "cobertura" é informação zero.** 231 das 417 linhas caem em `sem_resposta`, cuja regra é literalmente `houve_retorno = false` — coluna `NOT NULL` que já existe. A cobertura real sobre o que tem conteúdo é **33 de 55 retornos = 60%**.

2. **Falsos positivos duros em `pagamento_confirmado`.** Rodando as 8 regras na ordem proposta, a categoria captura 24 linhas, 14 delas com `houve_retorno=false`. Textos reais do banco:
   - *"Verifiquei que o boleto que ele solicitou para o suporte **ainda não efetuou o pagamento**"* → regra `%efetuou o pagamento%` → marcado como PAGO. É a negação literal.
   - *"Aluno deixou de pagar a parcela 03, mas **pagou** a 04"* → PAGO
   - *"**Pagou** duas parcelas, porém 1 parcela de cada contrato"* — caso aberto, escalado ao Nicholas da Voomp → PAGO
   - *"Aluno cancelou a inscrição e já efetuou o pagamento **da multa**"* → PAGO (é rescisão com multa, categoria diferente)

   Cruzando as 24 com `unipds.charges`: 21 têm *algum* pagamento no contrato após a data do contato, 3 não têm nenhum. E essa régua é frouxa — dá "acerto" para quem pagou outra parcela. Numa fila de cobrança, marcar devedor como pago é o erro caro.

   `%a empresa%` tem o mesmo defeito: *"Enviado e-mail para financeiro da empresa informando boleto em atraso"* (`houve_retorno=false`) vira `cobranca_corporativa` — verdade sobre o caso, mas o desfecho do contato foi "sem resposta".

3. **`pagamento_confirmado` não deve ser campo de texto.** O banco já sabe quem pagou: `cobranca.vw_reversoes` expõe `origem_valor='pagamento_detectado'`, `valor_pago_detectado` e `data_ultimo_pagamento_pos_contato`, cruzando `charges.categoria='PAGO'` com `data_pagamento >= data_primeira_interacao`. É a régua de reversão que o dashboard já usa. Pôr a categoria no enum cria uma segunda fonte de verdade, preenchida à mão e ~12% errada, para um número que a Voomp já entrega. Mesmo argumento para `desistencia_curso` (rescisão com multa é detectável no raw). **Ambas saem do enum de desfecho.**

4. **A taxonomia mistura três eixos ortogonais** — desfecho do contato, motivo do não-pagamento e disposição do caso. Efeito no dado real: *"teve um imprevisto familiar e queria fazer um acordo"* é `problema_financeiro` **e** `pediu_renegociacao`; a ordem dos UPDATEs escolhe arbitrariamente (renegociação, 4ª regra) e perde o motivo — justamente o que alimenta o KPI de renegociação. **Solução: duas colunas** (§A.1).

5. **O vocabulário do time é outro.** Dos 22 retornos não classificados, ~16 são promessa de pagamento óbvia. A regex procura "vai pagar / pretende pagar"; o time escreve *"irá efetuar o pagamento no dia 29/05"*, *"só vai conseguir efetuar o pagamento no dia 01/07"*, *"ficou de efetuar o pagamento essa semana"*, *"vai regularizar parcela no final do mês"*, *"vai quitar boleto hoje"*, *"só consegue realizar o pagamento no início do mês"*. E dois casos são ambíguos até para humano: *"Aluno retornou informando o pagamento"* — prometeu ou pagou? Só o `charges` resolve. Reforça o item 3.

---

## Contexto — o que o dado realmente mostra

Universo: **417 interações**, das quais **55 com `houve_retorno=true`** (as únicas com conteúdo classificável) e 362 sem retorno.

| Categoria | Eixo | Sinais no texto | Nota do mentor |
|---|---|---|---|
| Promessa de pagamento | desfecho | "irá efetuar o pagamento dia XX", "vai regularizar", "vai quitar" | categoria dominante nos retornos |
| Pediu renegociação | desfecho | "queria fazer acordo", "parcelar em 2x", "mudar dia de vencimento" | |
| Sem resposta | desfecho | `houve_retorno=false` | já derivável — não classificar à mão |
| ~~Pagamento confirmado~~ | — | "efetuou o pagamento", "comprovante" | **removida** — vem de `vw_reversoes` |
| Problema financeiro | motivo | "perdeu o emprego", "imprevisto familiar", "só recebe fim do mês" | |
| Problema com boleto | motivo | "não está recebendo", "não aceitou juros", "reemitir" | |
| Cobrança corporativa | motivo | "a empresa irá efetuar", "financeiro da empresa" | |
| ~~Desistência do curso~~ | motivo | "não vai conseguir seguir", "cancelou a inscrição" | mantida **como motivo**, não como desfecho |

---

## Frente A — Prospectiva (novo campo estruturado)

### A.1 — Migration de banco (mentor executa) — **REVISADA**

**Objetivo:** capturar de forma estruturada o que aconteceu no contato **e** por que o aluno não pagou, em duas colunas independentes.

```sql
-- 1) O que aconteceu no contato (eixo: desfecho)
ALTER TABLE cobranca.cobranca_interacoes
  ADD COLUMN desfecho_contato text;

ALTER TABLE cobranca.cobranca_interacoes
  ADD CONSTRAINT cobranca_interacoes_desfecho_valido
  CHECK (desfecho_contato IS NULL OR desfecho_contato IN (
    'sem_resposta',        -- contatou, não obteve retorno
    'promessa_pagamento',  -- aluno se comprometeu com data
    'pediu_renegociacao',  -- pediu acordo / novo vencimento / parcelamento
    'recusa_pagamento',    -- disse que não vai pagar
    'dado_invalido',       -- número errado, e-mail inválido, não localizado
    'outros'
  ));

-- 2) Por que não pagou (eixo: motivo) — independente do desfecho
ALTER TABLE cobranca.cobranca_interacoes
  ADD COLUMN motivo_inadimplencia text;

ALTER TABLE cobranca.cobranca_interacoes
  ADD CONSTRAINT cobranca_interacoes_motivo_valido
  CHECK (motivo_inadimplencia IS NULL OR motivo_inadimplencia IN (
    'financeiro',   -- desemprego, imprevisto, fluxo de caixa do aluno
    'boleto',       -- não recebeu, veio errado, juros indevidos → ação Voomp
    'corporativo',  -- quem paga é a empresa / departamento financeiro
    'desistencia',  -- não pretende seguir o curso
    'outro'
  ));

-- 3) Coerência: não pode haver retorno e desfecho "sem resposta"
ALTER TABLE cobranca.cobranca_interacoes
  ADD CONSTRAINT cobranca_interacoes_retorno_coerente
  CHECK (NOT (houve_retorno AND desfecho_contato = 'sem_resposta'));
```

**Decisões (respondem às perguntas 1 e 2 do plano original):**

- **text + CHECK, não `CREATE TYPE`.** Concordo com a preferência do autor. Evoluir sempre por migration (`DROP CONSTRAINT` / `ADD CONSTRAINT`), nunca à mão no editor.
- **Nullable no schema, required no front.** Não bloqueia inserts programáticos nem quebra os 417 registros existentes.
- **Sem `DEFAULT`.** `outros` como default fica indistinguível de "operador não classificou" — o campo perde o valor no primeiro mês.
- **Sem índice.** O `CREATE INDEX ... WHERE desfecho_contato IS NOT NULL` proposto foi descartado: a tabela tem 417 linhas e o filtro real acontece sobre `desfecho_ultimo_contato` da view, que é coluna computada — o índice nunca seria usado. Reavaliar acima de ~50k linhas.

### A.2 — View a atualizar (mentor) — **REVISADA: CTE, não LATERAL**

**Regra da casa** (`unipds-banco/docs/auditoria-convencoes-defesa.md` §128-131): pôr coisa no caminho de `vw_inadimplencia` / `vw_casos_cobranca` **já derrubou o dashboard duas vezes** (13s e 15s contra timeout de 8s).

**Baseline medido em 31/07:** `SELECT * FROM cobranca.vw_casos_cobranca` = **330 ms**, 75.505 buffers, 368 linhas. Há folga, mas o custo está concentrado em `vw_inadimplencia`, que o plano de execução avalia **duas vezes** (uma pela CTE `inad`, outra dentro de `vw_casos_recuperacao`). Nenhum passe adicional entra ali sem necessidade.

O `LEFT JOIN LATERAL` proposto adicionaria um **terceiro** acesso a `cobranca_interacoes` (368 loops). Desnecessário: a CTE `contatos` já varre a tabela inteira em 0,08 ms. Basta estendê-la:

```sql
), contatos AS (
  SELECT ci.caso_id,
     count(*) AS total_contatos,
     count(*) FILTER (WHERE ci.houve_retorno) AS total_retornos,
     max(ci.data_contato) AS data_ultimo_contato,
     (array_agg(ci.desfecho_contato ORDER BY ci.data_contato DESC, ci.created_at DESC)
        FILTER (WHERE ci.desfecho_contato IS NOT NULL))[1] AS desfecho_ultimo_contato,
     (array_agg(ci.motivo_inadimplencia ORDER BY ci.data_contato DESC, ci.created_at DESC)
        FILTER (WHERE ci.motivo_inadimplencia IS NOT NULL))[1] AS motivo_ultimo_contato
    FROM cobranca.cobranca_interacoes ci
   GROUP BY ci.caso_id
)
```

Custo adicional ≈ zero (mesmo seq scan já existente).

**O `FILTER (... IS NOT NULL)` é essencial:** sem ele, um contato novo sem desfecho preenchido apagaria o desfecho do contato anterior — o caso "perderia" a classificação a cada nova tentativa de contato.

**`dias_desde_desfecho` não vira coluna.** `data_ultimo_contato` já está exposta na view e o front faz a subtração. Se o time preferir no banco, é `CURRENT_DATE - ct.data_ultimo_contato` — também de graça, mas é redundância.

**Colunas novas expostas:** `desfecho_ultimo_contato text`, `motivo_ultimo_contato text`.

### A.3 — Ajustes no front (Claude executa após A.1 e A.2)

**Arquivo:** `app/page.tsx`

1. **Interface `Interacao`** — adicionar:
   ```ts
   desfecho_contato: DesfechoContato | null
   motivo_inadimplencia: MotivoInadimplencia | null
   ```

2. **Types** — dois enums literais:
   ```ts
   type DesfechoContato =
     | "sem_resposta" | "promessa_pagamento" | "pediu_renegociacao"
     | "recusa_pagamento" | "dado_invalido" | "outros"

   type MotivoInadimplencia =
     | "financeiro" | "boleto" | "corporativo" | "desistencia" | "outro"
   ```

3. **Mapas de labels:**
   ```ts
   const DESFECHO_META: Record<DesfechoContato, {label, cor, bg}> = {
     promessa_pagamento: { label: "Promessa de pagamento", cor: C.orange, bg: C.orangeBg },
     pediu_renegociacao: { label: "Pediu renegociação",    cor: C.purple, bg: C.purpleBg },
     recusa_pagamento:   { label: "Recusou pagamento",     cor: C.red,    bg: C.redBg },
     dado_invalido:      { label: "Dado inválido",         cor: C.red,    bg: C.redBg },
     sem_resposta:       { label: "Sem resposta",          cor: C.muted,  bg: C.bg },
     outros:             { label: "Outros",                cor: C.muted,  bg: C.bg },
   }

   const MOTIVO_META: Record<MotivoInadimplencia, {label, cor, bg}> = {
     boleto:      { label: "Problema com boleto", cor: C.blue,  bg: C.blueBg },
     financeiro:  { label: "Financeiro",          cor: C.red,   bg: C.redBg },
     corporativo: { label: "Corporativo",         cor: C.pink,  bg: C.pinkBg },
     desistencia: { label: "Desistência",         cor: C.muted, bg: C.bg },
     outro:       { label: "Outro",               cor: C.muted, bg: C.bg },
   }
   ```

4. **ModalContato** — dois selects abaixo do checkbox "houve retorno":
   ```
   Desfecho do contato: [obrigatório — 6 opções]
   Motivo (se souber):  [opcional — 5 opções + "não informado"]
   ```
   - Quando `houve_retorno = false`, pré-selecionar `sem_resposta` e desabilitar as demais opções de desfecho, exceto `dado_invalido` — casa com o CHECK de coerência do banco.
   - No `salvar()`, incluir ambos os campos no INSERT (enviar `null`, não string vazia, quando não preenchido — string vazia viola o CHECK).

5. **ListaCasos** — filtro em duas linhas:
   ```
   Desfecho: [Todos] [Promessa] [Renegociação] [Sem resposta] [Dado inválido]
   Motivo:   [Todos] [Boleto] [Financeiro] [Corporativo]
   ```
   Consomem `c.desfecho_ultimo_contato` e `c.motivo_ultimo_contato`.

6. **Coluna nova na tabela** — "Último desfecho" com badge; motivo como badge secundário menor quando presente.

7. **FichaAluno — Histórico de interações** — cada interação exibe os dois badges.

8. **Dashboard — card "Desfechos da semana"** — **adiar.** Com 55 linhas históricas classificáveis e coleta nova começando do zero, o card mente nas primeiras semanas. Soltar após **≥ 4 semanas** de coleta pelo modal.

---

## ~~Frente B — Retroativa (backfill dos 379 existentes)~~ — **REPROVADA**

O backfill em massa por regex está descartado pelos motivos do §0 (itens 1, 2 e 5): 131 registros não classificados, ao menos 4 falsos positivos duros gravando "pago" em caso aberto, e ordem de UPDATE que descarta o motivo em observações multi-rótulo.

O bloco de UPDATEs original **não deve ser executado contra `desfecho_contato`**. Fica preservado no Apêndice A — serve como ponto de partida para a coluna-sugestão do §B', desde que corrigido (ver notas lá).

---

## §B' — Contraproposta retroativa

O universo informativo é de **55 linhas**. Isso é meia hora de trabalho humano — não justifica regex arriscada nem LLM.

**Passo 1 — sugestão, nunca verdade.** Se o autor quiser aproveitar as regras, que gravem em coluna separada e descartável:

```sql
ALTER TABLE cobranca.cobranca_interacoes ADD COLUMN desfecho_sugerido text;
-- rodar as regras contra desfecho_sugerido, sem CHECK, sem consumo pelo front
```

**Passo 2 — mutirão de 20 min.** O time revisa as 55 interações com `houve_retorno=true` e preenche `desfecho_contato` / `motivo_inadimplencia` de fato. Query da fila de revisão:

```sql
SELECT interacao_id, data_contato, operador, observacao
FROM cobranca.cobranca_interacoes
WHERE houve_retorno = true AND desfecho_contato IS NULL
ORDER BY data_contato;
```

**Passo 3 — os 362 sem retorno ficam `NULL`.** Não são "sem_resposta classificado", são não classificados. `houve_retorno = false` já responde a pergunta, e preencher em massa só criaria a ilusão de 90% de cobertura.

**Se ainda assim quiserem LLM:** rodar apenas sobre as 55, com o resultado de `vw_reversoes` no prompt como âncora (para não confundir promessa com pagamento), gravando em `desfecho_sugerido` para revisão humana. Custo real: centavos.

### B'.2 — Validação

```sql
SELECT desfecho_contato, motivo_inadimplencia, count(*)
FROM cobranca.cobranca_interacoes
WHERE houve_retorno = true
GROUP BY 1,2 ORDER BY 3 DESC;
```

Meta: **as 55 com retorno classificadas**, resto `NULL`. Não perseguir "% do total".

---

## Ordem de execução

1. **Mentor:** A.1 (migration — 2 colunas + 3 CHECKs)
2. **Mentor:** A.2 (view — estender CTE `contatos`), com `EXPLAIN ANALYZE` antes/depois confirmando que o tempo segue < 500 ms
3. **Claude:** A.3 itens 1–7 (PR única)
4. **Time:** B' passo 2 (mutirão das 55)
5. **Depois de ~4 semanas de coleta:** A.3 item 8 (card de desfechos)

Frente A desbloqueia coleta futura e é aditiva. A retroativa passa a ser trabalho humano curto em vez de automação arriscada.

---

## Perguntas do autor — respondidas

1. **Enum vs text + check?** → **text + CHECK**, como o autor preferiu. Evolução sempre por migration.
2. **NOT NULL?** → **NULL no schema, required no front**, como o autor propôs. Acrescento: **sem DEFAULT**.
3. **Revisar regex antes de rodar?** → Revisei e **medi**: não rodar. Ver §0 item 2 e §B'.
4. **Entra na view?** → **Sim**, mas pela CTE `contatos` existente, não por LATERAL. Ver §A.2.

---

## KPIs que isso desbloqueia (atualizados para o modelo de 2 colunas)

- **Fila "Ação Voomp":** `motivo_ultimo_contato = 'boleto'` → lote de chamados para a Voomp
- **Fila "Aguardando corporativo":** `motivo_ultimo_contato = 'corporativo'` → contato com o CNPJ
- **Fila "Promessa vencida":** `desfecho_ultimo_contato = 'promessa_pagamento'` e `data_ultimo_contato + N dias < hoje` **e** `vw_reversoes.houve_reversao = false` → recontato prioritário
- **Fila "Oferecer renegociação":** `motivo_ultimo_contato = 'financeiro'` e `desfecho ≠ 'pediu_renegociacao'` → oferta proativa
- **Rescisões:** `motivo_ultimo_contato = 'desistencia'` → pipeline separado
- **Cohort de conversão por desfecho** — *o melhor da lista, e o que justifica o campo inteiro*: cruzar `desfecho_contato` com `cobranca.vw_reversoes` (`origem_valor = 'pagamento_detectado'`). Dos que prometeram, quantos % pagaram? Dos que pediram renegociação, quantos fecharam? Mede eficácia real de cada tipo de contato — e usa a régua financeira do banco, não o texto do operador.

> **Nota transversal:** nenhum KPI acima deve usar texto de observação como prova de pagamento. Reversão e valor recuperado vêm sempre de `cobranca.vw_reversoes`, que cruza `unipds.charges` com a data do contato. O desfecho classifica a *intenção*; o `charges` classifica o *fato*.

---

## Apêndice A — bloco de regex da proposta original (não executar como está)

Preservado para referência. Se for usado no §B' passo 1, precisa de três correções: (a) alvo `desfecho_sugerido`, nunca `desfecho_contato`; (b) remover as regras de `pagamento_confirmado` e `desistencia_curso` — não são desfecho; (c) restringir tudo a `houve_retorno = true`, senão repete o erro de classificar quem nunca respondeu.

```sql
-- ⚠️ PROPOSTA ORIGINAL — REPROVADA. Ver §0 item 2 para os falsos positivos medidos.
UPDATE cobranca.cobranca_interacoes SET desfecho_contato = 'problema_boleto'
WHERE desfecho_contato IS NULL
  AND (observacao ILIKE '%não%receb%boleto%'
    OR observacao ILIKE '%não%estou%receb%'
    OR observacao ILIKE '%reemit%boleto%'
    OR observacao ILIKE '%boleto%novo%');

-- ❌ 4 falsos positivos confirmados: pega "ainda NÃO efetuou o pagamento",
--    "deixou de pagar a 03 mas PAGOU a 04", "pagamento da MULTA".
UPDATE cobranca.cobranca_interacoes SET desfecho_contato = 'pagamento_confirmado'
WHERE desfecho_contato IS NULL
  AND (observacao ILIKE '%comprovante%'
    OR observacao ILIKE '%efetuou o pagamento%'
    OR observacao ILIKE '%pagou%');

UPDATE cobranca.cobranca_interacoes SET desfecho_contato = 'desistencia_curso'
WHERE desfecho_contato IS NULL
  AND (observacao ILIKE '%não vai%seguir%curso%'
    OR observacao ILIKE '%desistiu%'
    OR observacao ILIKE '%cancelar%curso%');

UPDATE cobranca.cobranca_interacoes SET desfecho_contato = 'pediu_renegociacao'
WHERE desfecho_contato IS NULL
  AND (observacao ILIKE '%parcelar%'
    OR observacao ILIKE '%acordo%'
    OR observacao ILIKE '%mudar%vencimento%'
    OR observacao ILIKE '%alterar%dia%');

UPDATE cobranca.cobranca_interacoes SET desfecho_contato = 'problema_financeiro'
WHERE desfecho_contato IS NULL
  AND (observacao ILIKE '%perdeu%emprego%'
    OR observacao ILIKE '%problema familiar%'
    OR observacao ILIKE '%sem emprego%'
    OR observacao ILIKE '%dificuldade financeira%');

-- ❌ '%a empresa%' pega "e-mail para financeiro da empresa" em contato sem retorno.
UPDATE cobranca.cobranca_interacoes SET desfecho_contato = 'cobranca_corporativa'
WHERE desfecho_contato IS NULL
  AND (observacao ILIKE '%a empresa%'
    OR observacao ILIKE '%o financeiro%efetuar%'
    OR observacao ILIKE '%dpto%');

-- ⚠️ perde ~16 dos 22 retornos não classificados: o time escreve
--    "irá efetuar o pagamento", "vai regularizar", "vai quitar",
--    "ficou de efetuar", "só consegue realizar o pagamento".
UPDATE cobranca.cobranca_interacoes SET desfecho_contato = 'promessa_pagamento'
WHERE desfecho_contato IS NULL
  AND (observacao ILIKE '%vai pagar%'
    OR observacao ILIKE '%vai efetuar%pagamento%'
    OR observacao ILIKE '%pretende pagar%'
    OR observacao ILIKE '%realizar%pagamento%dia%');

-- ⚠️ 231 linhas (55,4% do total): informação zero, é houve_retorno = false.
UPDATE cobranca.cobranca_interacoes SET desfecho_contato = 'sem_resposta'
WHERE desfecho_contato IS NULL
  AND houve_retorno = false
  AND (observacao IS NULL OR observacao ILIKE '%primeiro contato%' OR observacao ILIKE '%sem retorno%');
```
