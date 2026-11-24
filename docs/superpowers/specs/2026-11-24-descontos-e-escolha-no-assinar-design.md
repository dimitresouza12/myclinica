# Descontos dos contratos e escolha do prazo na hora de assinar

Data: 2026-11-24. Status: design aprovado em conversa (política de descontos = opção A), aguardando revisão deste documento. Nada implementado.

## Objetivo

1. Descontos maiores, que realmente convençam a assinar um contrato de 3, 6 ou 12 meses.
2. Começar o teste de 14 dias o mais fácil possível: o cadastro escolhe só o **plano**. Prazo e forma de pagamento são escolhidos **na hora de assinar**, quando o teste acaba (ou antes, se o cliente quiser).

## 1. Nova tabela de preços (opção A)

Preço sem contrato não muda: Essencial 99,90, Completo 129,90, Equipe 169,90.

Mês a mês (valor por mês), desconto de 10% / 15% / 20% para 3 / 6 / 12 meses:

| Plano | 3 meses | 6 meses | 12 meses |
|---|---|---|---|
| Essencial | 89,90 | 84,90 | 79,90 |
| Completo | 116,90 | 109,90 | 103,90 |
| Equipe | 152,90 | 143,90 | 135,90 |

À vista (total do contrato), desconto de 15% / 20% / 25%:

| Plano | 3 meses | 6 meses | 12 meses |
|---|---|---|---|
| Essencial | 253,90 | 478,90 | 898,90 |
| Completo | 330,90 | 622,90 | 1.168,90 |
| Equipe | 432,90 | 814,90 | 1.528,90 |

Todos os preços terminam em ,90 e arredondam para o lado do cliente; o desconto efetivo fica a menos de 0,4 ponto da meta (por exemplo, Essencial 3 meses à vista dá 15,3%). Economia em reais frente ao plano sem contrato:

| Plano | Mês a mês 3 / 6 / 12 | À vista 3 / 6 / 12 |
|---|---|---|
| Essencial | 30 / 90 / 240 | 45,80 / 120,50 / 299,90 |
| Completo | 39 / 120 / 312 | 58,80 / 156,50 / 389,90 |
| Equipe | 51 / 156 / 408 | 76,80 / 204,50 / 509,90 |

Onde mudar (fonte única):
- `src/lib/contratoPrecos.ts`: constantes `MONTHLY_CONTRACT` e `UPFRONT_TOTAL`. O resto (cotação, economia, taxa de cartão) deriva delas. A taxa de parcelamento continua repassada ao cliente; as faixas seguem provisórias até a tabela real do Asaas ser confirmada.
- `src/lib/contratoPrecos.test.ts`: reescrever os valores esperados (hoje fixa os da tabela antiga).
- `myclinica-landing/app/components/Plans.tsx`: objetos `contrato` e `avista` de cada plano, no mesmo valor. O texto "Total de ... a menos" (linha ~258) precisa ser revisto junto, porque hoje mistura desconto de contrato com a promoção de 50% da Black Friday.
- Contratos já assinados não mudam: o valor fica gravado em `clinic_agreements`.

## 2. Cadastro: só o plano

- O link da landing já leva só `?plan=`; o app não pergunta prazo no cadastro. O trabalho aqui é garantir que nada do fluxo de teste peça nem guarde prazo ou forma de pagamento, e que o seletor de prazo da landing (`Plans.tsx`) continue só como **vitrine de preço** (o botão leva ao cadastro apenas com o plano).
- Teste de 14 dias não tem contrato, termo de prazo nem cartão obrigatório.

## 3. Escolha na hora de assinar (tela nova no app)

Entrada: aviso de fim de teste e o item de plano/assinatura dentro do sistema (uma só tela, dentro do app, no mesmo padrão visual do modal de cartão e do `Termos`).

Passos, na mesma tela:
1. **Plano**: já vem marcado com o do teste; pode trocar entre os três.
2. **Prazo**: quatro opções lado a lado: Mensal sem fidelidade (padrão, preço de tabela), 3 meses, 6 meses, 12 meses. Cada opção mostra o valor por mês e a etiqueta de desconto ("10% menos", "15% menos", "20% menos").
3. **Forma de pagamento** (só aparece se escolheu 3, 6 ou 12): Mês a mês ou À vista. À vista mostra o total, o desconto maior e a economia em reais; permite parcelar no cartão, com a taxa de parcelamento mostrada antes de confirmar.
4. **Resumo** fixo no fim: plano, prazo, valor, data da primeira cobrança (a partir do fim do teste, `firstDueDateFor`) e, se houver, economia.
5. **Botão** muda conforme a escolha:
   - Mensal sem fidelidade: "Cadastrar cartão e assinar" (checkout em cartão no modal existente + aceite dos Termos; sem contrato).
   - 3, 6 ou 12 meses: "Ler e assinar o contrato" (abre o fluxo `/api/contrato-clinica` já pronto: texto gerado no servidor, aceite com código, PDF, hash).

Regras:
- O servidor recalcula tudo em `quoteContract`; o navegador só manda plano, prazo e forma de pagamento.
- Sem emoji; ícones pelo componente existente.
- Mobile primeiro: opções empilham em uma coluna abaixo de 480 px, alvo de toque de 44 px, sem `touch-action: pan-x/pan-y`.
- A promoção da Black Friday (50% na primeira mensalidade) continua só para mensal sem contrato; a tela mostra a promoção apenas nessa opção, e o contrato não a menciona.
- Esta é a primeira tela que chama `/api/contrato-clinica`; hoje nenhuma UI o chama.

## 4. Fora do escopo

- Mudar o texto do contrato (ele já puxa os valores da tabela dinamicamente; o advogado revisa o texto, não os preços).
- Migração de banco: nenhuma. Tabela de preços fica em código.
- Contra-assinatura e aba Contratos do Dashboard (spec próprio, no repo `myclinica-dashboard`).
- Taxas reais de parcelamento do Asaas (pendente de confirmação).

## Testes

- `contratoPrecos.test.ts`: cada célula das duas tabelas, economia, equivalente mensal, cotação com e sem parcelamento (valores novos).
- Tela de assinatura: padrão é mensal sem fidelidade; escolher prazo mostra a forma de pagamento; botão e rótulo mudam; resumo bate com `quoteContract`; plano do teste vem marcado.
- Regressão: nenhum teste do cadastro pede prazo; `Plans.tsx` mostra os mesmos números da tabela.
- Verificação visual (QA no agy, uma conta de teste reaproveitada): desktop e mobile.

## Riscos

- Landing e sistema têm tabelas duplicadas: se uma divergir, o preço da vitrine diferente do cobrado. Mitigação: teste que compara as duas tabelas ou, no mínimo, conferência manual na entrega. A landing só vai ao ar quando o Dimitre fizer o deploy no EasyPanel.
- Descontos maiores reduzem a margem: o desconto máximo (25% à vista, 12 meses) já foi aceito pelo Dimitre.
- Sem commit, push, deploy ou mudança de banco sem pedido expresso.
