# Plano — Dashboard estratégico para clínicas odontológicas
**Data:** 2026-07-14 · Nenhum código foi alterado — este é o plano de implementação.

## Contexto

O dashboard atual (`src/app/(app)/dashboard/page.tsx`) é **passivo**: mostra 6 números genéricos (pacientes ativos, consultas hoje, novos no mês, agendamentos abertos, receita/despesa do mês), uma tabela de próximos agendamentos e um gráfico de receita×despesa dos últimos 6 meses. Ele informa "o que aconteceu", mas não diz **"o que fazer agora"** — não há priorização, não há contexto odontológico, não há ação sugerida. É o feedback real dos dentistas que motivou este plano.

Antes de propor qualquer mudança, verifiquei o código e o banco de dados reais (projeto `siohvtgbomvcprbzfamr`) para garantir que cada sugestão abaixo é **implementável com o que já existe** ou **exige exatamente qual mudança mínima de schema** — nada de sugestão genérica de UX que não bate com os dados disponíveis.

### Achados que corrigem a premissa do pedido
1. **Dark mode já existe e está completo** (`src/styles/design-system.css`, bloco `[data-theme="dark"]`, com toggle funcional na sidebar). Não é preciso "criar" tema escuro — é só usar as variáveis CSS já definidas (`--bg-primary`, `--text-primary`, `--brand-primary` etc.), que os cards atuais já usam.
2. **Os cards não têm "excesso de bordas/sombras" hoje** — são `1px solid var(--border-subtle)` + `border-top: 3px solid` de cor por métrica, sem sombra pesada. O problema real não é visual-pesado, é **informacional-raso**: número grande, rótulo pequeno, nada mais. A refatoração visual proposta abaixo foca em adicionar densidade de informação (tendência, contexto), não em "limpar" algo que já é limpo.
3. **Achado extra:** o array `cards` em `dashboard/page.tsx` já computa um `icon` por card (`patients`, `calendar`, `team`, `finance`) e o CSS já tem `.cardIconWrap` pronto — mas **o ícone nunca é renderizado no JSX**. É uma sobra de uma versão anterior. Ativar isso é praticamente grátis e already contemplated no design.

---

## 1. Refatoração visual dos cards de KPI

**Mudança de estrutura**, não de tema (dark mode já correto):
- **Hierarquia**: número em destaque maior (`font-size` atual ~1.75rem → propor ~2.1rem no card "hero"), rótulo secundário reduzido, e um **indicador de tendência** (`↑ 12% vs. mês anterior`) abaixo do número — pequeno, cor semântica (verde/vermelho), sem novo componente pesado.
- **Ativar o ícone já computado** (`cardIconWrap` + `Icon name={c.icon}`) — dá âncora visual sem aumentar a "carga" da tela, já que a estrutura CSS já existe.
- **Separar hero cards de cards secundários**: hoje os 6 cards têm o mesmo peso visual. Proposta: 2–3 cards "hero" (maiores, ex: Receita do mês, Ocupação da agenda, Ação necessária hoje) + os demais em uma faixa compacta abaixo — dá direção visual ("olhe aqui primeiro") sem remover nenhuma métrica.
- Nada disso quebra o `valueDesktop`/`valueMobile` já implementado para telas pequenas nem o `hideValues` (ocultar valores) já existente.

---

## 2. KPIs contextuais de odontologia — viabilidade verificada por métrica

| KPI pedido | Viável hoje? | Fonte de dado real | Observação |
|---|---|---|---|
| **Tratamentos concluídos vs. em aberto** | ✅ Sim, sem mudança de schema | `appointments.status` (valores reais em produção: `agendado` 166, `confirmado` 61, `concluido` 31, `faltou` 12, `cancelado` 9, `em_atendimento` 3) | Contagem simples agrupada por status no período. |
| **LTV por paciente** (ou ranking de pacientes por receita) | ✅ Sim | `financial_records.total_amount` (`type='receita'`) agrupado por `patient_id`, join com `patients.name` | Pode virar um card único ("Ticket médio por paciente") ou uma lista "Top 5 pacientes" — recomendo o card único no dashboard (a lista detalhada já cabe melhor em Relatórios). |
| **Receita por procedimento/categoria** | ✅ Sim | `procedures.category` (texto livre definido pela própria clínica) + `financial_records.procedure_id` | Relatórios já tem "Faturamento por procedimento" por **nome**; no dashboard proponho agrupar por **categoria** (visão mais alta, menos itens) para não duplicar o gráfico existente. |
| **Aniversariantes do dia** | ✅ Sim | `patients.birth_date` (coluna já existe) | Filtro `extract(month/day from birth_date) = hoje AND is_active=true`. |
| **Faltas sem reagendamento** | ✅ Sim | `appointments` onde `status='faltou'` **e** não existe outro agendamento futuro do mesmo `patient_id` | Dado real e não-trivial hoje (12 faltas em produção). |
| **Taxa de Ocupação da Agenda** | ⚠️ Parcial | — | **Não existe hoje nenhum conceito de capacidade da agenda** (horário de funcionamento, nº de cadeiras/profissionais, duração padrão de slot) em `clinics` nem em nenhuma outra tabela. Sem isso, "% ocupado" não tem denominador. Ver proposta na seção 5. |
| **Gargalos de agendamento (janelas vazias)** | ⚠️ Parcial | — | Mesma limitação acima — "janela vazia" pressupõe uma grade de horários que não existe no modelo atual. Proposta de versão-proxy viável hoje na seção 3. |
| **Tratamentos complexos interrompidos** (implante/ortodontia sem próxima consulta) | ⚠️ Parcial | — | Não há entidade de "plano de tratamento" nem flag de "procedimento multi-sessão" — `procedures.category` é texto livre por clínica, não dá para saber programaticamente o que é "complexo". Proposta de heurística viável + melhoria futura na seção 3. |
| **Meta de Faturamento** (linha de referência no gráfico) | ❌ Não | — | Nenhuma tabela guarda meta/objetivo de faturamento. Precisa de 1 coluna nova (`clinics.monthly_revenue_goal numeric`), configurável pelo admin em Configurações. Pequeno e direto — ver seção 5. |

---

## 3. Widget de Atenção Prioritária ("Ação necessária")

Card de destaque no topo do dashboard (cor de alerta — âmbar para atenção, vermelho só para itens vencidos/críticos), listando até ~5 itens, cada um com botão de ação direta. Três fontes de dado, todas **viáveis com o schema atual**:

1. **Faltas recentes sem reagendamento** — `appointments.status='faltou'` nos últimos N dias sem agendamento futuro do paciente. Ação: botão **WhatsApp** reaproveitando o padrão já usado no app (`wa.me/<telefone>?text=...`, mesmo helper de `AdminClinicas.tsx`/`agenda`).
2. **Aniversariantes de hoje** — `patients.birth_date`. Ação: botão WhatsApp com mensagem pré-preenchida de parabéns.
3. **Sem retorno agendado após conclusão** (proxy para "tratamento interrompido", já que não há flag de complexidade — ver limitação acima): pacientes cujo último `appointment` com `status='concluido'` foi há mais de X dias (configurável, ex. 45) **e** não têm nenhum agendamento futuro. Não identifica especificamente "implante/ortodontia", mas cobre o caso geral de "paciente sumiu depois de um atendimento" sem exigir mudança de schema — e já entrega valor real.

Cada linha do widget: nome do paciente, motivo (badge colorido: "Faltou", "Aniversário", "Sem retorno"), última data relevante, e botões **Ligar** (`tel:`) e **WhatsApp** (`wa.me`) lado a lado — mesmo padrão visual de botão de ação já usado em `AgendaDetailPanel`/`AdminClinicas`.

**Melhoria futura (fora do escopo imediato):** se a clínica puder marcar um procedimento como "multi-sessão" (`procedures.requires_followup boolean`, 1 coluna nova opcional), o item 3 vira de fato "tratamento complexo interrompido" em vez do proxy genérico. Não é bloqueante — o proxy já é útil sozinho.

---

## 4. Visualização de dados para decisão

- **Receita por categoria de procedimento** — gráfico de barras horizontais (ou pizza, mas barras leem melhor com texto de categoria) usando os mesmos componentes `recharts` já usados em `DashboardChart.tsx`. Complementa (não substitui) o gráfico de Receita×Despesa.
- **Linha de Meta de Faturamento** sobreposta ao gráfico de Receita×Despesa já existente — no `recharts`, isso é um `<ReferenceLine y={meta} />` dentro do `<BarChart>` atual, mudança pequena no `DashboardChart.tsx`. **Depende da coluna nova `clinics.monthly_revenue_goal`** (seção 5) — sem meta configurada, a linha simplesmente não aparece (não quebra o gráfico atual).

---

## 5. Mudanças de schema necessárias (mínimas, justificadas)

| Mudança | Necessária para | Tamanho |
|---|---|---|
| `clinics.monthly_revenue_goal numeric null` | Linha de meta no gráfico Receita×Despesa | 1 coluna, campo opcional em Configurações |
| **Nenhuma** para: tratamentos concluídos/abertos, LTV, receita por categoria, aniversariantes, faltas sem reagendamento | — | — |
| *(Opcional, fase futura)* `procedures.requires_followup boolean default false` | Tornar o item 3 do widget de atenção específico para tratamentos multi-sessão em vez do proxy por tempo | 1 coluna opcional |
| *(Não recomendado agora)* conceito de capacidade/horário de agenda para Taxa de Ocupação real | Ocupação real da agenda, janelas vazias reais | Mudança maior — nova tabela/config de horário de funcionamento por profissional; escopo de outra fase, não deste redesign |

---

## 6. Plano faseado

**Fase 1 — Base (sem mudança de schema, maior retorno imediato):**
- Ativar ícone nos cards + indicador de tendência.
- Adicionar cards: Tratamentos concluídos vs. em aberto, Ticket médio por paciente (LTV simplificado).
- Widget de Atenção Prioritária com as 3 fontes viáveis hoje (faltas sem reagendamento, aniversariantes, sem retorno após X dias).
- Gráfico de Receita por Categoria de Procedimento.

**Fase 2 — Meta de faturamento:**
- Coluna `monthly_revenue_goal` + campo em Configurações + linha de referência no gráfico existente.

**Fase 3 — Opcional/futuro:**
- Flag de procedimento multi-sessão para refinar o item "tratamento interrompido".
- Conceito de capacidade de agenda (horário de funcionamento) para Taxa de Ocupação real — escopo maior, avaliar separadamente se vale o investimento vs. o proxy da Fase 1.

---

## Verificação (quando for implementar)
1. `npx tsc --noEmit` limpo a cada fase.
2. Testar os 3 novos cards/widget com dados reais de uma clínica com faltas e aniversariantes no período (já confirmei que há dado real: 12 faltas em produção).
3. Conferir dark mode nos elementos novos (usar só variáveis CSS existentes, nunca cor fixa).
4. Testar o widget de ação em mobile (botões Ligar/WhatsApp com alvo de toque ≥44px, seguindo o padrão já aplicado nas outras telas nesta sessão).
5. Gráfico de meta: testar com e sem `monthly_revenue_goal` configurado (null não deve quebrar o `ReferenceLine`).
