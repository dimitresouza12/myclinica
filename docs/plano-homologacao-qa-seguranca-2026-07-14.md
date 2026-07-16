# Plano de Homologação — QA & Segurança — MyClinica

**Data:** 2026-07-14 · **Projeto Supabase:** `siohvtgbomvcprbzfamr` (myclinica) · **Stack:** Next.js 16 (App Router + middleware + rotas de API) · React · Supabase (Auth + Postgres + Storage) · Asaas.

> Adaptado do gate de homologação usado no "Padaria Ideal". **A arquitetura do MyClinica é diferente** (usa Supabase Auth de verdade, tem camada de servidor via middleware + rotas de API, é multi-tenant com dados de saúde), então nenhum "fato" do Padaria foi reaproveitado — tudo abaixo foi verificado ao vivo no banco/código do MyClinica em 2026-07-14.

---

## Convenções

**Severidade:**
- 🔴 **Crítico** — exposição de dado pessoal/saúde ou risco LGPD; corrigir com urgência.
- 🟠 **Alto** — falha de autorização, perda ou duplicação de dado.
- 🟡 **Médio** — incômodo, risco moderado, hardening.
- 🟢 **Conforme** — verificado e adequado.

**Status de verificação:**
- ✔ **Verificado** ao vivo em 2026-07-14 (inspeção de banco/código/advisors).
- ⏳ **A executar** — teste dinâmico (REST direto / navegador autenticado) ainda não rodado; resultado esperado inferido da inspeção.

**Ambiente:** app em produção (`myclinica.online`) e local (`npm run dev`, http://localhost:3000). REST base: `https://siohvtgbomvcprbzfamr.supabase.co/rest/v1/`. `anon key` é pública por design (embutida no bundle) — a segurança depende de RLS + Auth, não de esconder a chave.

---

## Sumário executivo

O MyClinica tem uma **base de segurança sólida** e muito acima do estágio do Padaria: Supabase Auth real (cookies SSR), middleware com rate-limit + verificação de origem (CSRF), `audit_logs` imutável, e **RLS habilitado e com isolamento por clínica (`get_my_clinic_id()`/`is_superadmin()`) em todas as 17 tabelas** — inclusive `record_entries` sem policy de UPDATE/DELETE (imutabilidade clínica garantida no banco, conforme CFM).

Os achados que importam, em ordem:

| # | Severidade | Achado | Onde |
|---|---|---|---|
| **F1** | 🔴 Crítico | Bucket `pacientes` (fotos clínicas + documentos) é **público** e suas policies de Storage são **cross-tenant** (qualquer autenticado lê/sobe/**apaga** foto de qualquer clínica; e o bucket público permite **listar** todos os arquivos). | Storage |
| **F2** | 🔴 Crítico | `patient-avatars` também **público**; `pacientes`/`patient-avatars`/`document-templates` **sem limite de tamanho/MIME**. | Storage |
| **F3** | 🟠 Alto | `sync_from_automation(p_clinic_id,…)` é `SECURITY DEFINER`, **executável por `anon` sem nenhuma checagem** → injeção de pacientes/agendamentos em qualquer clínica. | RPC |
| **F4** | 🟠 Alto | `/api/asaas/billing-action` usa **service-role** com `clinicId` vindo do corpo, **sem checar se o chamador é dono da clínica** (IDOR: ler URL de fatura / mudar vencimento de outra clínica). | API |
| **F5** | 🟡 Médio | Formulários sem **guarda síncrona** de duplo-clique (`if (saving) return`) → registros duplicados (agendamento, lançamento, paciente). | Frontend |
| **F6** | 🟡 Médio | Sem **CHECK** de positividade em valores/quantidades (`financial_records.amount`, `stock_movements.quantity`, preços). | Banco |
| **F7** | 🟡 Médio | `decrypt_patient_cpf`: **search_path mutável** + **chave PII de fallback hardcoded** se GUC `app.encryption_key` não estiver setado. | RPC |
| **F8** | 🟡 Médio | Revogação de acesso **não tem efeito imediato**: suspender/inativar uma clínica não derruba sessões já abertas (o app não revalida `status` a cada requisição). | Sessão |
| **F9** | 🟡 Médio | Policy `INSERT` aberta em `clinics` (`WITH CHECK true`) + `auth` sem proteção contra senha vazada (HaveIBeenPwned desligado). | Banco/Auth |

Nada disso impede o uso hoje, mas **F1/F2 são exposição de dado de saúde (LGPD)** e devem ser priorizados.

---

## Área 1 — Segurança e Banco (Supabase)

### 1.1 RLS / Isolamento multi-tenant

Verificado ao vivo: **RLS habilitado nas 17 tabelas `public`, todas com ≥1 policy**. Padrão dominante: policy `clinic_isolation` `FOR ALL USING (clinic_id = get_my_clinic_id() OR is_superadmin())` **com `WITH CHECK` equivalente** (leitura e escrita isoladas).

| # | O que testar | Como testar | Resultado |
|---|---|---|---|
| 1.1.1 | Ler pacientes de outra clínica via REST | Logado na Clínica A, `GET /rest/v1/patients?select=*` e conferir se aparecem linhas de outra `clinic_id` | 🟢 ✔ Policy `clinic_isolation` restringe a `get_my_clinic_id()`. (⏳ confirmar com REST direto.) |
| 1.1.2 | Escrever/alterar dado de outra clínica | `POST/PATCH /rest/v1/appointments` com `clinic_id` de outra clínica | 🟢 ✔ `WITH CHECK` idêntico ao `USING` bloqueia. `patients/appointments/financial_records/medical_records/procedures` têm read+write isolados. |
| 1.1.3 | Editar/excluir evolução clínica (`record_entries`) | `PATCH`/`DELETE /rest/v1/record_entries?id=eq.<id>` | 🟢 ✔ **Sem policy de UPDATE/DELETE** → banco bloqueia (imutabilidade CFM). SELECT/INSERT restritos a `clinic_users.is_active`. |
| 1.1.4 | Auto-promoção de papel | `PATCH /rest/v1/clinic_users?id=eq.<meu>` com `{"role":"admin"}` | 🟢 ✔ Só existe UPDATE para superadmin; usuário comum não tem policy de UPDATE em `clinic_users` → não escala. Alterações passam pelas RPCs `*_clinic_member` (que re-checam admin). |
| 1.1.5 | Policy permissiva demais | Advisor `rls_policy_always_true` | 🟡 ✔ 1 achado: `clinics` INSERT `WITH CHECK true` para `authenticated` (F9). `clinic_modules` tem `SELECT USING(true)` (catálogo de módulos, não sensível — aceitável). |

### 1.2 Storage (buckets) — 🔴 principal risco

Verificado ao vivo em `storage.buckets` e `storage.objects`:

| Bucket | `public` | Limite tam./MIME | Policies |
|---|---|---|---|
| `pacientes` (fotos clínicas + docs) | **true** 🔴 | **nenhum** | SELECT/INSERT/DELETE só filtram `bucket_id='pacientes'` — **sem filtro de clínica** |
| `patient-avatars` | **true** 🔴 | nenhum | (sem policy dedicada) |
| `document-templates` | **true** 🟡 | nenhum | (via `clinic_own`) |
| `clinic-logos` | true 🟢 (logo é público) | 2 MB, só imagens | escopo por pasta = `clinic_id`, escrita só admin |

| # | O que testar | Como testar | Resultado |
|---|---|---|---|
| 1.2.1 | Foto clínica acessível sem login | Abrir a URL pública de um objeto de `pacientes` numa aba anônima | 🔴 ✔ **Bucket público → objeto legível sem autenticação** (a signed URL usada no código vira teatro). Advisor `public_bucket_allows_listing` confirma: dá até para **listar** todos os arquivos. |
| 1.2.2 | Ver/baixar foto de paciente de outra clínica | Autenticado na Clínica A, `SELECT` em `pacientes` de path da Clínica B | 🔴 ✔ Policy `"Authenticated can view photos" USING (bucket_id='pacientes')` — **qualquer autenticado lê qualquer foto de qualquer clínica.** |
| 1.2.3 | Apagar foto de outra clínica | `DELETE` de objeto de `pacientes` de outra clínica | 🔴 ✔ Policy `"Authenticated users can delete" USING (bucket_id='pacientes')` — **qualquer autenticado apaga qualquer foto.** Destrutivo cross-tenant. |
| 1.2.4 | Upload fora da pasta da própria clínica | Upload para `pacientes/<clinic_de_outro>/...` | 🟠 ✔ `INSERT WITH CHECK (bucket_id='pacientes')` — sem escopo de pasta. |
| 1.2.5 | Abuso de upload (tipo/tamanho) | Subir arquivo enorme ou não-imagem para `pacientes` | 🟡 ✔ Sem `file_size_limit` nem `allowed_mime_types` → aceita qualquer coisa. |

**Remediação F1/F2 (SQL + config):**
```sql
-- 1. Tornar buckets sensíveis privados (mantém as signed URLs já usadas no código):
update storage.buckets set public = false where id in ('pacientes','patient-avatars');
-- 2. Limitar tamanho/MIME:
update storage.buckets
   set file_size_limit = 5242880,  -- 5 MB (igual ao MAX_IMAGE_BYTES do TabTimeline)
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id in ('pacientes','patient-avatars');
-- 3. Reescrever as policies de storage.objects escopando por pasta = clinic_id
--    (padrão idêntico ao que 'clinic-logos' já usa: (storage.foldername(name))[1] = clinic do usuário),
--    para SELECT / INSERT / DELETE do bucket 'pacientes'. Remover as 3 policies "Authenticated ... photos".
```
O código já grava em `pacientes/{clinicId}/{patientId}/...` (ver `TabTimeline.uploadPhoto`) e já lê via `createSignedUrl` — então tornar o bucket privado **não quebra o app**, só fecha o buraco.

### 1.3 RPCs `SECURITY DEFINER`

O Advisor lista ~18 funções `SECURITY DEFINER` executáveis por `anon`/`authenticated`. A maioria é **esperada** (login e cadastro precisam ser anônimos) ou **se autoprotege** — verificado lendo o corpo de cada uma:

| # | Função | Resultado |
|---|---|---|
| 1.3.1 | `create_clinic_member` / `update_clinic_member` / `delete_clinic_member` / `save_clinic_member_permissions` | 🟢 ✔ **Seguras.** Cada uma checa `caller é admin/superadmin` **e** `alvo é da mesma clínica`; `delete` impede excluir a si mesmo; `update` impede auto-desativação. Aviso do Advisor é falso-positivo. |
| 1.3.2 | `is_superadmin` / `get_my_clinic_id` / `get_my_role` / `get_email_by_cpf` / `get_email_by_username` / `register_clinic_and_admin` | 🟢 ✔ `search_path=public` fixo; lookups de login retornam só o e-mail; cadastro é atômico. Execução por `anon` é necessária (login/cadastro). |
| 1.3.3 | `decrypt_patient_cpf(p_patient_id)` | 🟡 ✔ **Não vaza para anon** (filtra `clinic_id = clínicas do auth.uid()`; anon → NULL). **Mas:** (a) `search_path` **mutável** (Advisor `function_search_path_mutable`) num `SECURITY DEFINER` → risco de shadowing; (b) usa **chave de fallback hardcoded** `'myclinica-pii-key-change-in-vault'` se o GUC `app.encryption_key` não estiver setado. **Verificar se o GUC está setado em produção.** |
| 1.3.4 | `sync_from_automation(p_clinic_id, p_phone, …)` | 🟠 ✔ **Vulnerável.** `SECURITY DEFINER`, **anon-executável, sem nenhuma checagem de chamador** → qualquer um que saiba/adivinhe um `clinic_id` (UUID) injeta paciente + agendamento em qualquer clínica via `/rest/v1/rpc/sync_from_automation`. Presumivelmente feita para a automação n8n, mas **sem token/segredo compartilhado**. |

**Remediação:**
- **F3 (`sync_from_automation`):** exigir um segredo compartilhado (parâmetro `p_token` conferido contra um GUC/Vault) **ou** `REVOKE EXECUTE ... FROM anon, authenticated` e chamá-la só a partir de uma rota de API/Edge Function que valide o token da automação. Considerar rate-limit.
- **F7 (`decrypt_patient_cpf`):** `ALTER FUNCTION ... SET search_path = public, extensions;` e **garantir o GUC `app.encryption_key`** setado no projeto (nunca usar o fallback em produção).

### 1.4 Rotas de API / Autorização

| # | Rota | Como testar | Resultado |
|---|---|---|---|
| 1.4.1 | `POST /api/asaas/billing-action` | Logado na Clínica A, enviar `{clinicId: <ClínicaB>, action:'change_due_day', day: 5}` | 🟠 ✔ **IDOR.** Usa `getAdminClient()` (service-role, ignora RLS) com `clinicId` do corpo, **sem validar sessão/dono**. Permite ler URL de fatura (`anticipate`) e mudar `billing_due_day`/`nextDueDate` de **outra** clínica. (Middleware exige sessão, mas não confere dono.) |
| 1.4.2 | `POST /api/asaas/checkout` | Idem com `clinicId` de outra clínica | 🟡 ✔ Mesmo formato (service-role + `clinicId` do corpo, sem checar dono). Impacto menor (gera/lê link de pagamento **daquela** clínica), mas ainda deveria validar dono. Preço é **server-authoritative** (`PLAN_PRICES`) e cupom validado no servidor 🟢. |
| 1.4.3 | `POST /api/asaas/webhook` | Requisição forjada sem assinatura | 🟢 ✔ Pública por design, autenticada por token/assinatura própria (`isValidAsaasToken`, corrigido no commit `e373f22`). |
| 1.4.4 | `POST /api/auth/cleanup-orphan` | Chamar com `userId` alheio | 🟢 ✔ Só apaga se **sem clínica** E **criado há < 10 min**; caminho autenticado valida o token. Rate-limit 5/10min no middleware. Risco baixo. |

**Remediação F4:** em `billing-action` (e `checkout`), extrair o usuário da sessão (cookie SSR, como o middleware já faz) e confirmar que ele pertence à `clinicId` pedida (`clinic_users` do `auth.uid()`), **antes** de usar o service-role. Sem isso, o service-role fura todo o RLS bom da Área 1.1.

### 1.5 Autenticação e Sessão

| # | O que testar | Como testar | Resultado |
|---|---|---|---|
| 1.5.1 | Sessão real e persistente | Login, refresh completo | 🟢 ✔ Supabase Auth (cookies SSR); middleware exige sessão em rotas não-públicas; app revalida no boot (`getSession`/`onAuthStateChange`). |
| 1.5.2 | Login bloqueia clínica suspensa/inativa | Login com clínica `status='suspended'`/`'inactive'` | 🟢 ✔ `login/page.tsx` faz `signOut` e mostra mensagem específica. `trial` sozinho **não** bloqueia login (por design). |
| 1.5.3 | Revogação de acesso em sessão aberta | Suspender a clínica (ou `is_active=false`) com o usuário logado; ele continua navegando | 🟡 ⏳ **Achado F8.** O layout revalida cobrança a cada 5 min, mas **não revalida `clinics.status`**; suspender uma clínica **não derruba** sessões abertas (só barra no próximo login). Desativar o `clinic_users` (is_active=false), por outro lado, corta o acesso a dados no nível de RLS na requisição seguinte. |
| 1.5.4 | Força-bruta no login | Repetir senha errada | 🟢/🟡 ✔ Rate-limit por IP no middleware (`auth: 5/10min`) + rate-limit client-side. Mensagem genérica ("usuário ou senha incorretos"). Sem lockout por conta. |
| 1.5.5 | Proteção contra senha vazada | Advisor `auth_leaked_password_protection` | 🟡 ✔ **Desligado.** Ativar checagem HaveIBeenPwned no painel Auth (ganho fácil). |

### 1.6 Constraints de integridade

| # | O que testar | Como testar | Resultado |
|---|---|---|---|
| 1.6.1 | Valores negativos/zero por REST | `POST /rest/v1/financial_records` com `amount:-100`; `stock_movements` com `quantity:0` | 🟡 ✔ **Sem CHECK numérico** — só existem CHECKs de enum (`type`, `status`, `severity`). O banco aceitaria negativos/zero (a UI valida, REST direto não). |
| 1.6.2 | FKs / exclusão | Inspeção de catálogo | 🟢 ✔ App usa exclusão lógica (`is_active`) na maioria; conferir `ON DELETE` das FKs de `appointments`/`record_entries` (a executar). |

**Remediação F6:**
```sql
alter table financial_records add constraint fin_amount_nn check (amount >= 0);
alter table stock_movements  add constraint stk_qty_pos  check (quantity > 0);
-- + preços não-negativos em procedures/stock_items conforme o schema real.
```

---

## Área 2 — Regras de Negócio (cobrança, planos, financeiro)

| # | O que testar | Como testar | Resultado |
|---|---|---|---|
| 2.1 | Preço do plano não é adulterável pelo cliente | Alterar `plan`/valor no corpo do checkout | 🟢 ✔ `checkout` usa `PLAN_PRICES` no servidor; cliente não define preço. |
| 2.2 | Cupom promocional | Enviar cupom inválido / `COPA50` | 🟢 ✔ Validado no servidor (`VALID_COUPONS`), desconto calculado no backend. |
| 2.3 | Gating de plano (Plus/WhatsApp/CRM) | Usuário de plano básico tentando acessar módulo Plus | 🟡 ⏳ `planGates`/`hasWhatsApp` filtram no client (sidebar). Confirmar se o dado do módulo Plus também é barrado no banco (RLS de `campaigns` já isola por clínica; o *gating por plano* é de produto, não de segurança). |
| 2.4 | Trial expirado | Logar com `trial_ends_at` no passado e `billing_paid=false` | 🟢 ✔ `PaymentLateBanner` mostra modal bloqueante "assinar"; "Acesso permanente" (`trial_ends_at=null`) desliga o banner (ver histórico da sessão). |
| 2.5 | Recálculo financeiro | Registrar receita/despesa e conferir dashboard/relatórios | 🟡 ⏳ Executar pela UI; conferir consistência de somatórios (sem constraint de consistência hoje). |

---

## Área 3 — UI/UX e Responsividade

Já auditado em detalhe — ver **`docs/auditoria-ux-mobile-desktop-2026-07-06.md`**. Resumo do estado atual:

| # | Item | Resultado |
|---|---|---|
| 3.1 | Modal abrindo fora da viewport (admin) | 🟢 ✔ Corrigido via `<Portal>` (containing-block da animação de página). |
| 3.2 | Alvos de toque das ações de tabela (44px) | 🟢 ✔ Fase 1 aplicada (pacientes/financeiro/estoque/procedimentos/equipe/admin) + separação do "excluir". |
| 3.3 | Tabelas no mobile | 🟡 Sem reflow para cartões — scroll horizontal apertado (backlog Fase 2). |
| 3.4 | `:focus-visible` global | 🟡 Ausente no app — navegação por teclado sem indicação de foco (backlog Fase 3). |
| 3.5 | Sem overflow horizontal | 🟢 ✔ Confirmado (login 0px em 390/1440). |
| 3.6 | Ícones em emoji | 🟡 ~24 arquivos usam emoji como ícone apesar do `<Icon>` SVG. |

---

## Área 4 — Tratamento de Erros e Performance

| # | O que testar | Como testar | Resultado |
|---|---|---|---|
| 4.1 | Duplo-clique em salvar | Dois cliques rápidos em "Adicionar"/"Salvar" (agendamento, lançamento, paciente) | 🟡 ✔ **Achado F5.** Nenhum dos 14 handlers tem guarda síncrona `if (saving) return`; dependem de `disabled={saving}`, que só reflete após re-render → grava duplicado. Ex.: `ClinicEditModal.handleSave`, `TabTimeline.handleAddEntry`, `PatientFormModal`. |
| 4.2 | Falha de rede no submit | Interceptar `fetch`/offline e submeter | 🟡 ⏳ **Misto.** Alguns têm `try/catch/finally` (`TabTimeline` ✔ libera o botão e mostra erro); outros dependem do supabase-js devolver `{error}`. Conferir por formulário se `saving` sempre volta a `false` e há mensagem. |
| 4.3 | Rate-limit / origem (CSRF) | Requisições de outra origem / em rajada nas rotas `/api` | 🟢 ✔ Middleware: `api 60/min`, `auth 5/10min`, e checagem `origin === host` para métodos mutáveis. |
| 4.4 | Injeção SQL em campos de texto | Cadastro com `'; DROP TABLE ...` no nome | 🟢 ✔ supabase-js/PostgREST usa queries parametrizadas — string gravada literalmente. |
| 4.5 | Payload malformado por REST | `POST` com tipo errado (`quantity:"abc"`) | 🟢 ⏳ Esperado `400 invalid input syntax` (a executar). |
| 4.6 | Regressão de segurança | Reexecutar **Advisors (Security)** após qualquer mudança de DDL | 🟢 ✔ Linha de base 2026-07-14 registrada (ver Área 1). |

**Remediação F5 (aplicar em todos os `onSubmit`/`handleSave` async):**
```tsx
const [saving, setSaving] = useState(false)
async function handleSave() {
  if (saving) return            // guarda síncrona — não depende do re-render
  setSaving(true)
  try {
    /* ... await supabase ... */
  } catch (e) {
    setError('Não foi possível salvar. Verifique sua conexão e tente novamente.')
  } finally {
    setSaving(false)            // sempre libera o botão
  }
}
```

---

## Remediação consolidada (ordem sugerida)

1. **🔴 Fechar exposição de dado de saúde (F1/F2) — prioridade máxima (LGPD):** tornar `pacientes` e `patient-avatars` privados, escopar as policies de Storage por pasta = `clinic_id`, e aplicar limite de tamanho/MIME. Não quebra o app (já usa signed URLs + path por clínica).
2. **🟠 Fechar injeção anônima (F3):** proteger `sync_from_automation` com segredo compartilhado ou revogar execução de `anon`/`authenticated` e mover para trás de rota autenticada.
3. **🟠 Fechar IDOR de cobrança (F4):** validar dono da `clinicId` (sessão) antes do service-role em `billing-action` e `checkout`.
4. **🟡 Integridade e robustez:** CHECKs numéricos (F6); guarda de duplo-clique + `try/catch/finally` nos formulários (F5).
5. **🟡 Hygiene de banco/auth:** `search_path` fixo + GUC de chave PII em `decrypt_patient_cpf` (F7); remover INSERT aberto de `clinics` e ativar proteção de senha vazada (F9); revalidar `clinics.status` em sessão ativa (F8); mover extensões `pg_net`/`btree_gist` para fora de `public`.
6. **🟡 UX (backlog já documentado):** reflow de tabelas no mobile, `:focus-visible` global, emoji→SVG.

---

## Verificação (como rodar de ponta a ponta)

1. **`npm run build`** limpo (`tsc --noEmit`) — pré-condição do gate.
2. **Área 1 (REST direto):** com a `anon key` + um JWT de usuário de teste, rodar 1.1.1–1.1.4, 1.2.1–1.2.5, 1.4.1–1.4.2. Registrar cada linha como 🟢 conforme ou achado.
3. **Advisors:** reexecutar **Security Advisors** e a query de `pg_policies`/`storage.buckets` após qualquer DDL (regressão — Área 4.6).
4. **Áreas 2–4 (navegador autenticado):** rodar pela UI alternando perfis (admin/recepção/superadmin) e resoluções (375/768/1440), incluindo duplo-clique e falha de rede simulada.
5. Consolidar numa matriz "Conforme / Achado / A executar" como evidência de homologação. Os 🔴/🟠 são bloqueadores de "pronto para escala"; os 🟡 entram no backlog priorizado.

---

### Anexo — Base de evidências (verificada em 2026-07-14)
- 17 tabelas `public` com RLS on + policy; isolamento por `get_my_clinic_id()`/`is_superadmin()`; `record_entries` sem UPDATE/DELETE.
- 4 buckets, **todos `public=true`**; `pacientes`/`patient-avatars`/`document-templates` sem limite tam./MIME; policies de `pacientes` sem filtro de clínica.
- CHECKs: só de enum (`type`/`status`/`severity`); nenhum numérico.
- Advisors Security: `function_search_path_mutable` (3), `extension_in_public` (2), `rls_policy_always_true` (clinics INSERT), `public_bucket_allows_listing` (`pacientes`, `clinic-logos`), `anon/authenticated_security_definer_function_executable` (~18, maioria esperada/autoprotegida), `auth_leaked_password_protection` (off).
- RPCs de membro (`*_clinic_member`, `save_clinic_member_permissions`): autoprotegidas (admin + mesma clínica). `sync_from_automation`: sem checagem. `decrypt_patient_cpf`: checa clínica, mas search_path mutável + chave fallback.
- Rotas API: `billing-action`/`checkout` = service-role sem checar dono; `webhook` token-authed; `cleanup-orphan` guarda orphan+<10min.
- Frontend: 14 formulários com `setSaving` e **zero** guarda síncrona de duplo-clique.
