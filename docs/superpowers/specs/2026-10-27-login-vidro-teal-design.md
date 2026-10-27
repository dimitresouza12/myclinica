# Tela de login: vidro sobre branco com teal desfocado

Aprovado por Dimitre em 2026-10-27. Maquete: https://claude.ai/artifact/EiZvdtwBDX9QmcV8GFgVYU (escolhida: opção 1, "Aurora de teal", intensidade 50%).

## Problema

A tela de login (`src/app/login/page.tsx`, `login.module.css`) é genérica: painel de apresentação à esquerda com lista de recursos e card de indicação, formulário branco à direita. Dimitre quer algo mais marcante e moderno, com área de login translúcida e um fundo com teal desfocado.

## Escopo

Duas peças, na ordem:

1. **Tela de login** (`src/app/login/`): só Entrar, recuperar senha e um botão "Teste grátis". Uma única aparência, igual no tema claro e no escuro (branco com teal desfocado). Só o visual muda; a lógica de entrar e recuperar senha não muda.
2. **Teste grátis dentro de uma demonstração** (rota pública nova, `/experimentar`): o botão "Teste grátis" leva a uma demonstração do sistema, sem login, com o quiz de plano num modal por cima do fundo desfocado. Detalhes na seção "Teste grátis" abaixo. Enquanto essa rota não existir, o botão continua abrindo o quiz que já existe na página de login; só depois o quiz e o cadastro saem de lá.

## Desenho

**Fundo.** Branco (`#FFFFFF`) com três manchas grandes e muito desfocadas, como luz difusa: duas no teal do logo (`#4DD9C0`, canto superior esquerdo e canto inferior direito) e uma de aqua suave (`#8CF0E6`, atrás do cartão), todas a 50% de opacidade, com desfoque de 90 px. O teal não toma a tela: o branco manda e o teal é a luz que faz o vidro aparecer. O traço de batimento do logo atravessa o fundo, bem discreto (`#0FA891` a 35%), e se desenha uma vez ao abrir; é o único movimento e fica parado com `prefers-reduced-motion`.

**Cartão.** Vidro: branco a 55% de opacidade, desfoque de 24 px, borda branca de 1 px (90%) mais um fio externo `rgba(6,74,66,.07)` e sombra suave em verde escuro. Texto verde escuro `#06312B` (contraste alto sobre o cartão); rótulos e links secundários `#4D6B69` e `#077A69`. Campos em branco a 75% com borda `#C9D9D7`, altura mínima de 44 px. Botão Entrar no teal da marca `#4DD9C0` com texto `#06312B` (igual aos botões primários do app), o único ponto de cor forte da tela. Sem suporte a `backdrop-filter`, o cartão vira branco sólido a 92% (`@supports not`). Opacidades e desfoques ficam em variáveis CSS para ajuste fino.

**Conteúdo.** Logo no canto superior esquerdo (desktop) ou no topo do cartão (celular), mais a frase "O cuidado é seu. A burocracia é nossa." Saem a lista de recursos e o card de indicação; a indicação vira um link pequeno no rodapé do cartão. O convite "Ainda não tem conta? Teste 7 dias grátis" fica abaixo do botão.

**Controles.** Campos e botão como descritos no cartão. Foco visível em todos os controles (anel verde escuro `#06312B` de 2 px, com 2 px de distância) e botões de opção do quiz com a mesma altura mínima de 44 px.

**Celular (até 600 px).** O fundo ocupa a tela; o cartão ocupa a largura toda menos 16 px de cada lado e fica centralizado na vertical quando cabe, ou rola dentro dele quando não cabe. A marca fica acima do cartão.

## Teste grátis: quiz dentro de uma demonstração

**Ideia (Dimitre):** em vez de o quiz viver na tela de login, quem aperta "Teste grátis" cai no sistema, na tela de dashboard, com um modal de quiz por cima e o fundo desfocado. A pessoa vê o produto antes de responder e fica no fluxo até concluir.

**Fundo.** Uma página de demonstração própria, pública, sem login, montada com os mesmos componentes do app (barra lateral, cartões de indicador, gráficos) e **dados fictícios fixos**, nunca dados reais. Desfocada por trás do modal. Uma etiqueta discreta "Exemplo" deixa claro que os números não são de ninguém. Carrega leve: sem chamadas ao banco e sem o estado de autenticação.

**Modal.** O mesmo cartão de vidro da tela de login, sobre o fundo desfocado. Não fecha com Esc nem clicando fora (`dismissible={false}` do `Modal`), mas tem sempre um link visível "Já tenho conta" que leva ao login, para ninguém ficar preso. Passos: as perguntas do quiz que existem hoje, o plano sugerido e, como **último passo no mesmo modal**, nome, e-mail e senha para criar a conta. Concluída a conta, a pessoa entra no dashboard de verdade, já no plano escolhido.

**Reaproveitar.** A lógica do quiz, a regra do plano sugerido e a criação de clínica e usuário já existem em `src/app/login/page.tsx`; mover para componentes reutilizáveis em vez de reescrever. A criação de conta continua pelas mesmas rotas e regras de hoje (nenhuma mudança de banco, nenhum endpoint novo).

**Fora desta peça:** qualquer mudança em planos, preços ou regras de cobrança.

## Fora do escopo

Lógica de autenticação, textos de erro, regras de plano e cobrança, e a página de marketing (`myclinica.online`).

## Verificação

`tsc` e `vitest` limpos. Conferido no painel do navegador (a cota do Antigravity acabou): `/login` e `/experimentar` em 1280 e 390 px, tema claro forçado, cartão com 16 px de gutter no celular, sem rolagem lateral, botões de no mínimo 44 px, foco entrando no diálogo da demonstração, quiz avançando e "Já tenho conta" levando ao login. Texto sem contraste insuficiente medido na página de login (corrigido o crédito "feito por Otimiza AÍ"). **Falta:** passar o cadastro e a entrada automática de ponta a ponta com uma conta de verdade, e a reverificação pelo Antigravity quando a cota voltar.

## Decisões

- Um só visual para os dois temas: pedido de Dimitre.
- Fundo branco com teal desfocado (opção "Aurora de teal"), intensidade do teal em 50%: escolhido por Dimitre depois de descartar o teal cheio (achou pesado) e o branco quase liso (pouco marcante).
- Cartão claro e translúcido, botão no teal da marca: seguem do fundo branco; o cartão escuro foi descartado.
- Conteúdo, botão, campos e traço da tela de login: sem pedido de mudança, valem os padrões acima.
- O quiz sai da tela de login e passa a viver num modal sobre uma demonstração do sistema desfocada, com dados fictícios fixos e o cadastro como último passo do mesmo modal: pedido de Dimitre; as duas escolhas de implementação foram as recomendadas.
