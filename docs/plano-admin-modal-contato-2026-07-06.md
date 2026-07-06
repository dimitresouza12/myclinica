# Plano de Implementação — Bug de modal no admin + Contato do cliente
**Data:** 2026-07-06 · **Skill usada:** `/webapp-testing` (Playwright)

## Contexto
Dois pedidos:
1. **Bug visual:** ao abrir "Editar clínica" no painel admin, o modal aparecia lá embaixo, exigindo scroll para ver a janela inteira. Garantir que **nenhum modal** volte a fazer isso.
2. **Feature:** sempre que um cliente cria uma clínica e informa o telefone, o admin precisa **ver esse número para entrar em contato**.

---

## Bug 1 — Modal renderizando fora da viewport

### Causa raiz (confirmada com Playwright)
`.adminPage` (e **outros 10 wrappers de página**) usam:
```css
@keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1 } }
.adminPage { animation: fadeUp 0.35s ... both; }
```
Um elemento que anima `transform` com `fill-mode: both` **cria um "containing block"** no Chromium. Com isso, qualquer `position:fixed` descendente (o `.overlay` do modal) passa a se ancorar **nesse wrapper alto e rolável**, não na viewport.

**Prova (repro isolado `/tmp/modal_repro.html` + Playwright):**
| Cenário | overlay top | overlay height | modal centralizado na tela? |
|---|---|---|---|
| Com a animação (código atual) | **-382** | **2500** (= altura da página) | ❌ (center_y=868, fora da tela) |
| Sem a animação | 0 | 800 (= viewport) | ✅ (center_y=400) |

Isso reproduz exatamente o print enviado (modal empurrado para baixo).

### Correção aplicada — `<Portal>`
O projeto **já tem** `src/components/ui/Portal.tsx` (renderiza via `createPortal` em `document.body`), padrão já usado em agenda, crm, pacientes, etc. Um modal em `document.body` **escapa** do containing block do `.adminPage`.

**Verificação Playwright (repro do fix):** modal movido para `body` → overlay `top=0 height=800`, modal `center_y=400`. ✅

Arquivos alterados:
- `src/components/admin/ClinicEditModal.tsx` — modal envolvido em `<Portal>`.
- `src/components/admin/AdminClinicas.tsx` — modais **Excluir** e **Nova Clínica** envolvidos em `<Portal>`.

### Garantia "nenhuma janela faz isso"
Auditoria de todos os `styles.overlay` do app:
- **Portalizados (OK):** agenda, configuracoes, crm, equipe, estoque, pacientes, procedimentos, admin (×2), PatientFormModal, ProntuarioModal (via `<Portal>`); financeiro (via `createPortal` direto).
- **PaymentLateBanner** (modal de trial encerrado): não usa Portal, **mas renderiza em `.content`, fora de `.main`/wrapper animado** → já ancora na viewport. Sem risco. (Portalizar mesmo assim = melhoria opcional, defesa em profundidade.)

**Conclusão:** após esta correção, todos os modais de página estão protegidos.

### Hardening opcional (backlog)
- Trocar os 10 `@keyframes fadeUp/slideUp` de página para **só `opacity`** (sem `transform`), eliminando a causa na origem — mas muda a entrada visual (perde o leve slide). Não feito para não alterar a estética sem pedido.
- `useScrollLock` trava `document.body`, mas o scroll do app é no `.main` → o lock não impede rolar o fundo. Corrigir para travar `.main` (ou usar `overflow:hidden` no elemento certo).

---

## Feature 2 — Ver o telefone do cliente para contato

### Diagnóstico (confirmado no banco de produção)
- O cadastro (`login/page.tsx` → RPC `register_clinic_and_admin`) grava o telefone em **`clinics.phone`** (`NULLIF(p_phone,'')`).
- **Dados reais:** 11 clínicas, **11 com `phone`**, só 1 com `billing_phone`.
- Problema: a UI do admin **nunca mostrava `clinics.phone`**. A tabela não tinha coluna de contato; o modal de edição só lida com `billing_phone` (outra coluna, preenchida à mão pelo admin).
- **Ou seja: o dado sempre existiu, só estava invisível.** Nenhuma mudança de schema é necessária.

### Correção aplicada
- `src/components/admin/AdminClinicas.tsx`:
  - Nova coluna **"Contato"** na tabela mostrando `c.phone` + botão **📲 WhatsApp** (link `wa.me` com mensagem pré-preenchida). Sem telefone → "—".
  - Helper `waLink(phone, clinicName)` (normaliza DDI 55).
- `src/components/admin/ClinicEditModal.tsx`:
  - Campo "WhatsApp do responsável" agora usa `billing_phone ?? phone` como valor inicial → o botão "Cobrar via WhatsApp" já funciona com o telefone do cadastro, sem digitação.
- `admin.module.css`: estilos `.contactCell / .contactPhone / .contactWa / .contactEmpty`.

O painel admin já faz polling de 30s da tabela `clinics`, então novos cadastros (e seus telefones) aparecem sozinhos.

---

## Verificação
- `npx tsc --noEmit` — limpo, sem erros.
- Playwright (repro isolado) — causa raiz e correção (Portal) confirmadas numericamente.
- Preview ao vivo do painel real não executado: o painel exige login de superadmin e o `preview_start` do sandbox falha com EPERM em `node_modules/next`. A verificação foi por reprodução isolada do CSS + type-check.

## Arquivos alterados
- `src/components/admin/ClinicEditModal.tsx`
- `src/components/admin/AdminClinicas.tsx`
- `src/components/admin/admin.module.css`
