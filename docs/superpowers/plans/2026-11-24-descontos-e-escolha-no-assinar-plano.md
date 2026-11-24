# Plano de implementação: descontos (opção A) e escolha na hora de assinar

Spec: `docs/superpowers/specs/2026-11-24-descontos-e-escolha-no-assinar-design.md`. Sem commit, push, deploy ou migração sem pedido expresso do Dimitre. Sem emoji na interface. Verificação visual e QA vão para o agy (uma conta de teste reaproveitada, nunca clínica nova).

Divisão em duas entregas independentes, nesta ordem. A Entrega 1 vale sozinha; a 2 depende da 1.

## Entrega 1: tabela de preços (sistema + landing)

Arquivos distintos, sem sobreposição; podem ir em paralelo.

### 1.1 `src/lib/contratoPrecos.ts` e `contratoPrecos.test.ts` (sistema)
- Trocar `MONTHLY_CONTRACT` e `UPFRONT_TOTAL` pelos valores do spec (centavos):
  - Mês a mês: essencial {3: 8990, 6: 8490, 12: 7990}; completo {3: 11690, 6: 10990, 12: 10390}; equipe {3: 15290, 6: 14390, 12: 13590}.
  - À vista: essencial {3: 25390, 6: 47890, 12: 89890}; completo {3: 33090, 6: 62290, 12: 116890}; equipe {3: 43290, 6: 81490, 12: 152890}.
- Reescrever as asserções do teste (hoje fixam a tabela antiga: 94,90, 269,90, 899,90, 1738,80, 29,80, 240 etc.). Novos exemplos: essencial 3 meses mensal = 89,90, total 269,70; essencial 3 à vista = 253,90; essencial 12 à vista = 898,90 e equivalente mensal 74,91; economia essencial 3 à vista = 45,80; completo 12 mensal = 312.
- Casos de cotação que usam 701,40 e 899,90 passam a refletir a tabela nova (recalcular, não copiar).
- Conferência: `npx vitest run src/lib/contratoPrecos.test.ts`.

### 1.2 `myclinica-landing/app/components/Plans.tsx`
- Atualizar `contrato` e `avista` de cada plano para os mesmos valores.
- Revisar o texto da economia (linha ~258): separar claramente o desconto de contrato da promoção de 50% da Black Friday, e mostrar a economia real da tabela nova.
- Rodar o lint/tsc da landing. Deploy é do Dimitre via EasyPanel.

### 1.3 Conferência cruzada
- Script simples (fora do repo, no scratchpad) que lê os dois arquivos e confere célula a célula. Se existir teste fácil de manter, uma asserção no sistema com os números da landing copiados; não criar dependência entre repositórios.

Pronto quando: teste do sistema verde, landing compila, tabelas idênticas.

## Entrega 2: escolha na hora de assinar

Nova tela dentro do app, na aba Plano (`PlanoTab.tsx`), no botão "Assinar agora" e no aviso de fim de teste. Hoje esse botão abre `CheckoutCartaoModal` direto (mensal sem fidelidade). Passa a abrir a tela de escolha, que decide o fluxo.

### 2.1 Lógica pura (testável): `src/lib/assinaturaEscolha.ts`
- `opcoesDePrazo(plan)`: lista Mensal, 3, 6, 12 com valor por mês, rótulo de desconto e economia, usando `monthlyPriceNoContract`, `monthlyContractPrice`, `contractSavings`.
- `resumoDaEscolha({ plan, months, mode, installments })`: valor, total, economia, data da primeira cobrança (`firstDueDateFor`), via `quoteContract` para contrato.
- `fluxoDaEscolha(months)`: `'cartao'` para mensal sem fidelidade, `'contrato'` para 3/6/12.
- Testes em `assinaturaEscolha.test.ts`: padrão mensal; rótulos 10/15/20; economia bate com `contractSavings`; fluxo por prazo; parcelamento mostra taxa e rejeita parcela abaixo de R$ 5.

### 2.2 Tela de escolha: `src/components/configuracoes/AssinarEscolha.tsx` + `.module.css`
- Modal (usar `Modal` existente). Seções: Plano (marcado o do teste, pode trocar), Prazo (4 opções), Forma de pagamento (só para 3/6/12: Mês a mês ou À vista; à vista mostra parcelar no cartão e a taxa), Resumo, botão.
- Botão: "Cadastrar cartão e assinar" abre `CheckoutCartaoModal` (fluxo atual, promoção Black Friday só nessa opção); "Ler e assinar o contrato" abre o fluxo de contrato (2.3).
- Mobile: uma coluna abaixo de 480 px, alvos de 44 px, sem `touch-action: pan-x/pan-y`. Foco gerenciado ao abrir; teclado nas opções (radiogroup).

### 2.3 Fluxo de contrato no app: `src/components/configuracoes/ContratoFluxo.tsx` + `.module.css`
Primeira UI que consome `/api/contrato-clinica`. Passos:
1. Responsável: nome completo e CPF → `POST /api/contrato-clinica` (cria rascunho; plano, prazo, pagamento e parcelas da escolha).
2. Leitura: mostra `contentText` do `GET /api/contrato-clinica/[id]` (rolável), aviso de rascunho enquanto `CONTRATO_EM_REVISAO` estiver ativo.
3. Código: `POST .../codigo` com telefone (preenche o da clínica) → campo do código de 6 dígitos, reenvio respeitando `resendAvailableAt`.
4. Assinatura: desenho na tela (`method: 'desenho'`) ou nome digitado (`method: 'digitado'`), caixa de aceite → `POST .../assinar`.
5. Resultado: contrato assinado, link do PDF, estado da cobrança (`billing.status`); se `pendente`, botão que chama `.../cobranca` (retentar).
- Estados de erro por passo (código errado, expirado, limite de tentativas, falha de rede), sem perder o que foi digitado.
- Atualizar a sessão (`setSession`) e a aba Plano ao concluir.

### 2.4 Ligação em `PlanoTab.tsx` e aviso de fim de teste
- `handleSubscribe` abre `AssinarEscolha` em vez do modal de cartão direto. "Regularizar pagamento" e "Trocar cartão" continuam abrindo o `CheckoutCartaoModal` (não passam pela escolha).
- Rodapé do `TrialCardForm` e pontos que já chamam o checkout para nova assinatura passam pela escolha; atualizar a cópia ("Assinar agora — R$ X/mês" vira "Escolher prazo e assinar").

### 2.5 Cadastro
- Auditar `src/app/experimentar/page.tsx` e o fluxo de cadastro: nada pede nem grava prazo/forma de pagamento. Se algo existir, remover. Teste de regressão apenas se houver código a mudar.

### 2.6 Verificação
- `npx vitest run` nos arquivos novos e nos vizinhos (planoResumo, contratoPrecos, contratoClinica); `npx tsc --noEmit` (erros antigos em `codigo.test.ts` não contam); lint.
- QA no agy: desktop e mobile, uma conta de teste reaproveitada, roteiro enxuto: abrir tela, trocar prazo e pagamento, conferir resumo; seguir até o código sem assinar de verdade e sem cobrança real. Cobrança real no Asaas só com OK do Dimitre.
- Revisão cruzada do diff (Antigravity/contraponto) antes de fechar.

## Ordem e paralelismo
1. Entrega 1 (1.1 e 1.2 em paralelo).
2. 2.1 (lógica) antes de 2.2 e 2.3.
3. 2.2 e 2.3 em paralelo (arquivos distintos), depois 2.4 (toca `PlanoTab.tsx`).
4. 2.5 e 2.6 no fim.

## Fora do plano
Texto do contrato, aba Contratos do Dashboard, taxas reais do Asaas, aplicação de qualquer migração, commit e deploy.

## Perguntas em aberto (não bloqueiam)
- Quem já está com assinatura mensal ativa e quiser migrar para um contrato: não coberto nesta entrega; a tela só aparece para clínica sem assinatura.
- Preço congelado (`customMonthlyPrice`): clínicas com preço combinado seguem o fluxo antigo (cartão), sem contrato com tabela, até decisão do Dimitre.
