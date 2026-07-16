# Revisão de Engenharia — MyClinica (2026-07-04)

Revisão geral do SaaS multi-tenant `myclinica` (Next.js 16.2.5 + Supabase + Stripe/Asaas).
Feita com análise estática do código + execução real do app (dev server, smoke-test de rotas).
Achados ordenados por severidade, com evidência (`arquivo:linha`) e correção proposta.

---

## Resumo executivo

O sistema está funcional e com boa base de segurança de plataforma (auth forçada no
servidor, rate limit e checagem de origem centralizados no middleware). Os problemas mais
graves estão em **integridade de cobrança** (webhook Asaas) e **consistência da taxonomia de
planos** — ambos afetam dinheiro e liberação de features. Depois vêm dívidas de arquitetura
(componentes gigantes) e de plataforma (convenção `middleware` deprecada no Next 16).

| # | Severidade | Área | Problema (1 linha) |
|---|-----------|------|--------------------|
| 1 | 🔴 CRÍTICO | Cobrança/Segurança | Webhook Asaas não é público no middleware **e** não valida assinatura |
| 2 | 🟠 ALTO | Correção | Taxonomia de planos inconsistente (`plus` vs `completo_plus`) |
| 3 | 🟠 ALTO | Plataforma | Convenção `middleware` deprecada no Next 16 → migrar para `proxy` |
| 4 | 🟡 MÉDIO | Performance | Query de agendamentos sem filtro de data (lê tudo) |
| 5 | 🟡 MÉDIO | Segurança | Audit log roda no client com fallback pra chave anon |
| 6 | 🟡 MÉDIO | Manutenção | Componentes gigantes (agenda 1291, config 1205, login 1079 linhas) |
| 7 | 🟢 BAIXO | Segurança | Rota `cleanup-orphan` deleta usuário sem autenticação |
| 8 | 🟢 BAIXO | Higiene | `csrf.ts` definido mas não usado; pacote chamado `tmp_next`; emoji como ícone |
| 9 | 🟢 BAIXO | Confiabilidade | Sem testes automatizados; schema do banco não versionado em migrations |

---

## Achados detalhados

### 1. 🔴 Webhook Asaas — quebrado hoje, bypass de pagamento amanhã
**Evidência:**
- `src/middleware.ts:78-82` — `isPublicPath` inclui `/login`, `/api/auth`, `/trial-expirado`,
  `/financial-demo`, mas **não** `/api/asaas`. Confirmado ao vivo: `curl /api/asaas/webhook` → **HTTP 307** (redireciona pra `/login`).
- `src/app/api/asaas/webhook/route.ts` — o handler confia em `event` e
  `payment.externalReference` vindos do corpo cru, **sem validar nenhum header de assinatura**
  (`asaas-access-token`).

**Impacto hoje:** chamadas legítimas do Asaas (server-to-server, sem cookie de sessão) são
redirecionadas pra `/login` e **nunca chegam ao handler** → `billing_paid`, `next_billing_date`
e status de inadimplência **não atualizam em produção**.

**Impacto quando "consertarem" liberando a rota:** sem verificação de assinatura, qualquer um
pode `POST {event:'PAYMENT_CONFIRMED', payment:{externalReference:'<clinicId>'}}` e marcar
qualquer clínica como paga → acesso grátis.

**Correção (as duas juntas, no mesmo commit):**
1. Adicionar `/api/asaas` ao `isPublicPath` do middleware.
2. No handler, validar o header de autenticação do Asaas (token configurado no painel Asaas)
   com comparação de tempo constante, retornando 401 se não bater — **antes** de qualquer update.

---

### 2. 🟠 Taxonomia de planos inconsistente
**Evidência:**
- `src/types/index.ts:7` — `ClinicPlan = 'essencial' | 'avancado' | 'completo' | 'completo_plus' | 'basico' | 'plus'` (6 valores, dois esquemas de nomes misturados).
- `src/lib/planGates.ts:2` — `hasWhatsApp` só aceita `'completo_plus'`.

**Impacto:** qualquer clínica em `'plus'`, `'completo'` etc. perde silenciosamente WhatsApp/CRM/IA
mesmo se for o tier pago pretendido. É a tarefa #8 ("corrigir gate plan === 'plus' em 5 arquivos"),
que trata o sintoma; a raiz é a taxonomia dupla.

**Correção:** definir UM conjunto canônico de planos, mapear os legados, e **centralizar todo o
gating em `planGates.ts`** (`hasWhatsApp`, `hasCRM`, `hasIA`, ...). Nenhuma página deve comparar
`clinic.plan === '...'` na mão.

---

### 3. 🟠 Convenção `middleware` deprecada (Next 16)
**Evidência:** log do dev server ao subir: `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` O `AGENTS.md` do repo manda explicitamente respeitar deprecações e ler `node_modules/next/dist/docs/` antes de escrever.

**Impacto:** toda a camada de segurança (auth, rate limit, origin check) vive em `middleware.ts`.
Numa atualização futura do Next isso pode parar de rodar — falha silenciosa e perigosa.

**Correção:** migrar `middleware.ts` → `proxy` seguindo o guia em `node_modules/next/dist/docs/`.

---

### 4. 🟡 Query de agendamentos sem filtro de data
**Evidência:** tarefa #9 pendente; `src/app/(app)/agenda/page.tsx` carrega `appointments` sem
recorte de intervalo. **Impacto:** cresce linearmente com o histórico da clínica. **Correção:**
filtrar por janela visível (ex.: mês corrente) na query, com paginação/refetch ao navegar.

### 5. 🟡 Audit log no client com fallback pra chave anon
**Evidência:** `src/lib/audit.ts:49` — `key = SUPABASE_SERVICE_ROLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY`;
importado em componentes client (`login`, `ProntuarioModal`, `PatientFormModal`, `TabTimeline`).
No client a service role é `undefined` → cai pra anon → registros sujeitos a RLS / forjáveis /
podem falhar em silêncio. **Correção:** mover a escrita de auditoria pra uma rota/RPC no servidor.

### 6. 🟡 Componentes gigantes
**Evidência:** `agenda/page.tsx` 1291, `configuracoes/page.tsx` 1205, `login/page.tsx` 1079,
`relatorios` 579, `financeiro` 575, `FinancialDashboard` 553 linhas. **Impacto:** difícil de ler,
testar e editar com segurança. **Correção:** extrair sub-componentes + hooks (fetch, formulários).

### 7. 🟢 `cleanup-orphan` deleta usuário sem autenticação
**Evidência:** `src/app/api/auth/cleanup-orphan/route.ts` — caminho não-autenticado aceita `userId`
cru e deleta o auth user, protegido só por (sem clínica + criado < 10min). Raio de dano estreito,
mas é um endpoint de deleção sem auth. **Correção:** exigir o token de sessão recém-emitido.

### 8. 🟢 Higiene
- `src/lib/csrf.ts` definido mas **importado em lugar nenhum** (só o origin-check do middleware
  está ativo) → remover código morto ou ligá-lo.
- `package.json` nome `"tmp_next"` — renomear pra `myclinica`.
- Emoji como ícone (ex.: `campanhas/page.tsx:302` "📲 Enviar") — o projeto já usa
  `@vooi/react-iconsax`; trocar por SVG (regra `no-emoji-icons` do ui-ux-pro-max).

### 9. 🟢 Confiabilidade
- Sem dependências de teste no `package.json` → zero testes automatizados num SaaS de cobrança.
- `supabase/migrations/` tem só 2 arquivos; o schema real mora no dashboard → banco não
  reproduzível. **Correção:** versionar o schema como migrations + adicionar um harness mínimo de
  testes (começando por `planGates`, auth do webhook, e o gate do middleware).

---

## Plano de implementação (priorizado)

### P0 — Dinheiro e integridade de dados (fazer primeiro)
- [ ] **1a.** Adicionar `/api/asaas` ao `isPublicPath` no middleware.
- [ ] **1b.** Validar header de assinatura do Asaas no handler (401 se não bater), no mesmo commit.
- [ ] **2.** Consolidar taxonomia de planos + centralizar todo o gating em `planGates.ts`
  (`hasWhatsApp`/`hasCRM`/`hasIA`); trocar todos os `clinic.plan === '...'` espalhados.

### P1 — Correção e plataforma
- [ ] **3.** Migrar `middleware.ts` → `proxy` (ler `node_modules/next/dist/docs/` antes).
- [ ] **4.** Filtro de data na query de agendamentos + paginação.
- [ ] **5.** Mover escrita de audit log pro servidor (rota/RPC).

### P2 — Manutenibilidade
- [ ] **6.** Quebrar componentes gigantes (agenda → detalhe/lista/form; configuracoes; login).
- [ ] **7.** Harness mínimo de testes: `planGates`, auth do webhook, redirect do middleware.
- [ ] **8.** Versionar schema do banco como migrations.

### P3 — Polimento
- [ ] **9.** Trocar emojis por ícones `iconsax`.
- [ ] **10.** Renomear pacote `tmp_next` → `myclinica`.
- [ ] **11.** Endurecer `cleanup-orphan` (exigir token) e remover `csrf.ts` morto.

---

## O que está bem (não mexer)
- Auth forçada no servidor via middleware (`getSession` + redirect).
- Rate limit centralizado (60/min geral, 5/10min em auth).
- Service role key só server-side (`supabaseAdmin.ts`), sem `NEXT_PUBLIC_`.
- Acesso ao banco n8n só via Edge Function que valida JWT e deriva o slug no servidor.
- React Query já adotado; app compila limpo e sobe em ~350ms.
