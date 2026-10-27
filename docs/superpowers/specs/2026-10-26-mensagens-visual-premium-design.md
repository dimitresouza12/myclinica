# Aba Mensagens: refino visual premium (desenho)

Data: 2026-10-26. Status: aprovado pelo Dimitre em conversa (seções 1 e 2). Sem código escrito.

## Objetivo

Deixar a aba Mensagens com cara de produto premium para os clientes (donos de clínica), sem mudar o que cada tela faz. O Dimitre apontou duas queixas: o estilo do arquivo recebido e telas com "cara de IA".

## Decisões do Dimitre

| Pergunta | Resposta |
|---|---|
| Quem a tela precisa impressionar | Os dois: a recepção no uso diário e o dono na demonstração. Base calma, com um ou dois detalhes de assinatura. |
| Quanto imitar o WhatsApp | Meio-termo: estrutura reconhecível (recebida à esquerda, enviada à direita, tiques), com cor e tipografia do MyClinica. |
| Tamanho do trabalho | Refinar a aba inteira, mantendo as 3 colunas. Em duas etapas. |

Fora de escopo: reestruturar o layout (painel como gaveta, grupos "Aguardando você"), novas funções, redesenho do player de áudio além de ajustar cores.

## Diagnóstico (12 achados)

Medidos em 1440 px, modo claro e escuro, na aba com dados reais da clínica de teste.

Arquivo recebido:
1. Quatro camadas para mostrar um arquivo: bolha, caixa cinza, quadrado do ícone, botões com borda.
2. O mesmo clipe para PDF, Word e planilha.
3. Nome do arquivo em cor secundária, o contrário do que importa.
4. "Abrir" e "Baixar" como botões de formulário, deixando o cartão alto.
5. Estados carregando, removido e falhou com título em negrito, frase em itálico e botão: parece erro de sistema.

Tela como um todo:
6. Excesso de etiquetas coloridas (filtros em pílula, "Lead" e "Paciente" em toda linha, pílulas no painel).
7. Painel da direita como cartão de perfil padrão (avatar centralizado, caixa alta espaçada, botões de largura total).
8. Aviso de desconexão duplicado (faixa vermelha no topo e barra acima do campo).
9. Remetente repetido em cada bolha e status por escrito ("Enviada", "Entregue").
10. Hierarquia tipográfica achatada: quase tudo entre 11 e 14 px, negrito 700 e 800 em todo lugar.
11. Avatares só com iniciais em círculo verde, e "#" para contato sem nome.
12. Modo escuro: a bolha recebida (`#0A0A0A`) é mais escura que o fundo da conversa (`#161616`).

## Desenho

### Base visual

- Tokens da aba definidos em `.root` de `Inbox.module.css` (variáveis CSS com versão clara e escura). O design system global não muda.
- Tipografia: texto da mensagem 15 px (hoje 13,8), nome 14 px peso 600, hora e metadados 12 px. Peso 600 só em nomes de pessoas. Some o 800.
- Bolhas: raio 16 px, canto do lado do remetente 6 px. Recebida sem borda, com sombra leve no claro.
- Enviada: tom teal suave no modo claro (ponto de partida `#E3F4F0`, texto `#0D2421`). No escuro, cinza neutro (ponto de partida `#2A2A2A`), sem verde, como o Dimitre pediu para o modo escuro.
- Escuro: recebida mais clara que o fundo da conversa. Todos os pares de texto e fundo validados com contraste de pelo menos 4,5:1.

### Bolhas

- Autor só no começo de uma sequência da mesma pessoa. Uma nova sequência começa quando muda a direção, o autor, o dia, ou passam 10 minutos.
- Espaço de 2 px dentro da sequência e 10 px entre sequências.
- Status em ícone ao lado da hora: um tique cinza (enviada), dois cinzas (entregue), dois teal (lida). O texto continua como `aria-label` e `title`.

### Arquivo (detalhe de assinatura 1)

- Cartão de uma camada, inteiro clicável, altura mínima 56 px.
- Selo quadrado de 40 px com a extensão escrita. Cores dessaturadas por tipo: PDF vermelho-acinzentado, Word azul, planilha verde, apresentação laranja-acinzentado, demais cinza.
- Nome em 14 px com até duas linhas, truncando o meio para a extensão ficar visível. Abaixo, "PDF · 284 KB".
- Uma ação: ícone de download à direita (área de toque de 44 px). PDF abre ao clicar no cartão e o ícone baixa. Os demais tipos baixam ao clicar.
- Estados: carregando com brilho suave no selo; removido esmaecido com "Removido. Veja no WhatsApp do celular", sem itálico; "Baixar de novo" como link discreto.
- O mesmo componente serve para o arquivo recebido, o enviado e o que está em envio.
- Imagem e vídeo: cantos de 12 px, sem moldura, legenda embaixo.

### Lista de conversas

- Sem as etiquetas "Lead" e "Paciente" na linha. Paciente: avatar com círculo cheio. Lead: avatar só com contorno.
- Filtros sem borda: texto com sublinhado teal na opção ativa; "Não lidas" mostra o número.
- Cor da inicial derivada do nome (6 tons dessaturados, sempre o mesmo para a mesma pessoa). Contato sem nome ganha ícone de pessoa em vez de "#".
- Linha de 72 px: nome 14/600, prévia 13 cinza, hora 12. Não lida: nome em negrito e contador teal pequeno. Selecionada: fundo suave, sem a barra lateral grossa.

### Cabeçalho da conversa (detalhe de assinatura 2)

- Avatar 40 px, nome 16/600, telefone abaixo.
- Linha de contexto à direita, clicável. Paciente: "Próxima consulta: qui, 28/10, 14h" (com o nome do profissional quando a consulta traz), abre a agenda. Lead: etapa do funil (por exemplo "Em conversa"), abre o CRM. Paciente sem consulta: "Sem consulta marcada".

### Painel da direita

- Cabeçalho alinhado à esquerda, sem avatar gigante nem pílulas de tipo.
- Títulos de seção 12 px peso 600, sem caixa alta. Dados em lista com divisores finos.
- Uma ação primária sólida. As demais viram linhas com ícone.
- Texto explicativo curto (uma ou duas linhas).

### Aviso de desconexão e campo de mensagem

- Uma só faixa fina em tom âmbar com ícone e "Reconectar" discreto. A barra duplicada acima do campo some.
- Campo desabilitado mostra o motivo curto no lugar do texto: "Reconecte o WhatsApp para responder" ou "Você não tem permissão para responder".
- Campo de mensagem em um contêiner arredondado único (raio 24 px) com anexo e respostas rápidas dentro, à esquerda. Microfone e enviar à direita. Enviar fica teal só com texto. Texto em 15 px.

### Tela vazia e movimento

- "Selecione uma conversa" com ícone esmaecido e a linha "N conversas aguardando resposta" (conversas com não lidas).
- Transições de 150 ms em hover e seleção. Respeita `prefers-reduced-motion`. Nenhuma animação nova.

## Arquivos envolvidos

- `src/components/mensagens/Inbox.module.css` (tokens e estilos)
- `src/components/mensagens/ChatPane.tsx`, `MediaBubble.tsx`, `ConversationList.tsx`, `ContactPanel.tsx`, `VoicePlayer.tsx` (só cores)
- `src/app/(app)/mensagens/page.tsx` (faixa de aviso, textos curtos de bloqueio, contagem de não lidas)
- `src/components/ui/Avatar.tsx` e `Icon.tsx` (compartilhados com outras telas: mudanças só aditivas)
- Novos: `src/lib/whatsapp/bubble.ts` (funções puras com testes), `FileCard.tsx`, `DeliveryTicks.tsx`, `ContextChip.tsx`, `src/hooks/useContactContext.ts`

## Riscos

- `Avatar` e `Icon` são usados no CRM e em outras telas: só adicionar props e ícones, sem mudar o comportamento atual.
- Trabalho pendente de outra frente nos mesmos arquivos (vídeo em tela cheia, `connection.ts`). Fechar antes de começar.
- Nenhum documento real disponível na clínica de teste: a verificação do cartão usa HTML montado com as classes reais, e um teste real depende do chip conectado.
- Contraste: os valores de cor acima são pontos de partida e precisam ser medidos nos dois temas.

## Critérios de aceite

1. Nenhuma etiqueta "Lead" ou "Paciente" nas linhas da lista nem pílula de tipo no painel.
2. Cartão de arquivo com uma camada, selo por tipo, nome legível e uma ação, nos dois temas.
3. Autor mostrado uma vez por sequência; status em ícone com texto acessível.
4. Uma só faixa de desconexão e motivo curto no campo desabilitado.
5. Todos os alvos de toque com pelo menos 44 px; sem rolagem horizontal em 390 px.
6. `tsc`, `eslint` e `vitest` limpos. Verificação visual em 1440 e 390 px, claro e escuro.
7. Nenhum emoji na interface. Modo escuro sem tom de verde nas superfícies.
