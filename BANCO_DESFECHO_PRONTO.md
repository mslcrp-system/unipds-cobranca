# Banco pronto para a Frente A.3 — classificação de desfecho

**De:** Mentor DB (repo `unipds-banco`)
**Para:** front `unipds-cobranca`
**Data:** 2026-08-04
**Status:** A.1 e A.2 **aplicadas em produção**. A.3 liberada para implementação.

Migrations: `20260804150000_desfecho_contato_colunas.sql` e `20260804151000_vw_casos_cobranca_desfecho.sql`.

---

## O que mudou no schema

### `cobranca.cobranca_interacoes` — duas colunas novas

Ambas `text`, **nullable**, **sem DEFAULT**.

```sql
desfecho_contato      -- o que aconteceu no contato
motivo_inadimplencia  -- por que o aluno não pagou
```

**Não é uma coluna com 10 valores, como o plano original propunha — são duas.** O enum único misturava três eixos ortogonais e forçava perder informação: *"teve um imprevisto familiar e queria fazer um acordo"* é `financeiro` **e** `renegociação` ao mesmo tempo, e a coluna única obrigava a escolher uma.

**Valores aceitos — `desfecho_contato`** (6):

| valor | quando usar |
|---|---|
| `sem_resposta` | contatou e não obteve retorno |
| `promessa_pagamento` | aluno se comprometeu com uma data |
| `pediu_renegociacao` | pediu acordo, novo vencimento ou parcelamento |
| `recusa_pagamento` | disse que não vai pagar |
| `dado_invalido` | número errado, e-mail inválido, não localizado |
| `outros` | não se encaixa nos acima |

**Valores aceitos — `motivo_inadimplencia`** (5):

| valor | quando usar |
|---|---|
| `financeiro` | desemprego, imprevisto, fluxo de caixa do aluno |
| `boleto` | não recebeu, veio errado, juros indevidos → **ação Voomp** |
| `corporativo` | quem paga é a empresa / departamento financeiro |
| `desistencia` | não pretende seguir o curso |
| `outro` | não se encaixa nos acima |

### Duas categorias do plano original foram removidas de propósito

**`pagamento_confirmado` não existe** e não deve ser recriada. O banco já sabe quem pagou por `cobranca.vw_reversoes` (`origem_valor = 'pagamento_detectado'`), que cruza `unipds.charges` com a data do contato. Na amostra de 31/07, o texto do operador errava ~12% — pegava *"ainda **não** efetuou o pagamento"* e *"deixou de pagar a 03 mas **pagou** a 04"* como pagamento confirmado.

> **Regra:** desfecho classifica a *intenção*; o `charges` classifica o *fato*. Nenhum card de valor recuperado deve ler texto de operador.

**`desistencia_curso` virou motivo, não desfecho** — rescisão com multa é detectável no raw.

### Três CHECKs ativos

```sql
cobranca_interacoes_desfecho_valido    -- NULL ou um dos 6
cobranca_interacoes_motivo_valido      -- NULL ou um dos 5
cobranca_interacoes_retorno_coerente   -- NOT (houve_retorno AND desfecho = 'sem_resposta')
```

O terceiro é o que exige atenção no front — ver "Cuidados" abaixo.

Testados em produção com transação revertida: valor fora do enum rejeitado nas duas colunas, par contraditório rejeitado, combinação multi-eixo aceita, e interação sem classificação nenhuma continua aceita. As 430 interações existentes seguem intactas.

### `cobranca.vw_casos_cobranca` — duas colunas novas, no fim

```
desfecho_ultimo_contato  text
motivo_ultimo_contato    text
```

Trazem a classificação da **última interação que tiver o campo preenchido** — não simplesmente da última interação. Um contato novo sem classificação **não apaga** a do contato anterior.

Não criei `dias_desde_desfecho`: `data_ultimo_contato` já está exposta e a conta é no front.

**Performance:** medi antes e depois. Baseline 330 ms → 235 ms agora, contra timeout de 8 s. Usei a CTE `contatos` existente em vez do `LEFT JOIN LATERAL` da proposta — o LATERAL somaria um terceiro acesso a `cobranca_interacoes` sem ganho, e a regra da casa é não pôr nada no caminho dessa view sem necessidade (já derrubou o dashboard duas vezes, 13 s e 15 s).

---

## O que o front precisa fazer (A.3)

1. **`interface Interacao`** — adicionar `desfecho_contato` e `motivo_inadimplencia`, ambos `| null`.
2. **`interface Caso`** — adicionar `desfecho_ultimo_contato` e `motivo_ultimo_contato`, ambos `| null`.
3. **Dois types literais** com os valores das tabelas acima.
4. **Dois mapas de label/cor**, um por eixo.
5. **ModalContato** — dois selects: desfecho (obrigatório) e motivo (opcional).
6. **ListaCasos** — filtros em duas linhas, consumindo as colunas novas da view.
7. **Tabela e FichaAluno** — badge de desfecho, com o motivo como badge secundário quando presente.
8. **Card "Desfechos da semana" — adiar.** Com 55 interações históricas classificáveis e coleta nova começando do zero, o card mente nas primeiras semanas. Soltar depois de ~4 semanas de uso do modal.

### Cuidados que evitam erro em produção

- **Enviar `null`, nunca string vazia.** `''` viola os CHECKs e o PostgREST rejeita o update inteiro — foi exatamente assim que o `data_pagamento_revertido` quebrou o `marcarPago` sem ninguém perceber.
- **Quando `houve_retorno` estiver desmarcado**, pré-selecionar `sem_resposta` e travar as outras opções de desfecho exceto `dado_invalido`. Casa com o CHECK de coerência e evita o 400.
- **Checar `error` em toda escrita.** O padrão de ignorar o retorno do supabase já custou dois bugs silenciosos neste arquivo.

---

## Frente B (retroativa): **não rode o bloco de UPDATEs**

Está reprovado e o motivo está no `PLANO_DESFECHO_CONTATO.md` §0 e Apêndice A. Resumo: as regras produziriam ao menos 4 falsos positivos gravando "pago" em caso aberto, deixariam 131 registros sem classificar (o plano estimava 76), e 55% da "cobertura" seria `sem_resposta`, que já é `houve_retorno = false`.

**O que vale fazer:** o universo classificável é de **55 interações** — as que têm `houve_retorno = true`. Mutirão de ~20 minutos do time. Fila pronta:

```sql
SELECT interacao_id, data_contato, operador, observacao
FROM cobranca.cobranca_interacoes
WHERE houve_retorno = true AND desfecho_contato IS NULL
ORDER BY data_contato;
```

As outras 375 ficam `NULL`. Não são "sem resposta classificado", são não classificadas — e `houve_retorno = false` já responde isso.

---

## Estado hoje (04/08)

| | |
|---|---|
| Interações na base | 430 |
| Já classificadas | 0 |
| Fila do mutirão (`houve_retorno = true`) | 55 |
| Casos na view | 351 |
| `vw_casos_cobranca` | 235 ms |

Assim que o modal entrar no ar, o campo passa a nascer limpo. Dúvida sobre valores ou régua, chama.
