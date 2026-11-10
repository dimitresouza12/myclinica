# Plano: painel para ligar a automação de atendimento em clínicas novas

Data: 2026-11-09. Base: leitura completa dos 6 workflows da Clínica Unificada no n8n Otimiza Aí (`automacao-dc.com.br`). Nada foi alterado no n8n.

**Objetivo:** cliente novo de automação de clínica entra preenchendo um painel (dados da clínica, profissionais, procedimentos, regras do prompt, token do WhatsApp, agenda). Nenhum workflow é duplicado. A meta é sair das 2 semanas de hoje para **1 a 2 dias**, a maior parte esperando o cliente mandar as informações.

## Como é hoje

| Workflow | Nós | Papel |
|---|---|---|
| ENTRADA E SAIDA | 81 | Webhook da uazapi, junta mensagens picadas, transcreve áudio, lê imagem e documento, pausa a IA quando um humano responde, envia a resposta |
| CONSOLE | 27 | Roteador e 3 subagentes: atende e qualifica ("Ana"), especialista em procedimentos, FAQ |
| AGENDAMENTO | 9 | Agente com Google Calendar (ver, criar, remarcar, cancelar) |
| ENCAMINHAMENTO HUMANO | 8 | Avisa paciente e equipe, pausa a IA |
| LEMBRETES | 34 | Lembrete na véspera (12h) e no dia (7h) |
| CONFIG | 2 | Dados da clínica |

### O que obriga a duplicar
1. **Os dados da clínica estão espalhados em 4 lugares:** CONFIG, prompt do atendente (nome da IA, nome da clínica, tabela de procedimentos, tabela procedimento → profissional), prompt do FAQ (endereço, horário, telefone, convênio, estacionamento) e prompt do agendador (horário por dia, quem atende em que dia, **IDs das agendas do Google**). Já há divergência entre eles (horário de quinta e sexta).
2. **A ENTRADA E SAIDA não lê a CONFIG.** Endereço da uazapi e telefone de teste estão fixos nos nós, e ela usa uma credencial própria da uazapi.
3. **Credenciais por clínica:** uazapi, Google Calendar e OpenAI viram credenciais do n8n, e cada cópia precisa ter as suas trocadas à mão.
4. **Modelos de IA fixos nos nós**, e os campos de modelo da CONFIG não são usados.
5. **As tabelas não separam clínica.** O contexto em `chats` e a memória são buscados só pelo telefone, então um workflow servindo duas clínicas misturaria conversas. Hoje isso obriga a ter um banco ou uma cópia por clínica.

### Riscos encontrados agora
- **O token da uazapi está em texto aberto no nó da CONFIG**, e aparece nos dados de toda execução que a chama.
- **O CONSOLE tem nós soltos com `delete from chats`, `delete from chat_messages` e `delete from n8n_chat_histories` sem `where`.** Executar um deles por engano apaga todas as conversas.
- O prompt manda a IA negar que é IA. Decisão de produto sua, mas vale saber o risco de reclamação.

## A solução

### Um workflow só para todas as clínicas
Os 6 workflows viram um conjunto único. Cada mensagem chega com a identificação da clínica (pela instância da uazapi ou por um código no endereço do webhook), e o primeiro passo carrega a configuração dela, com cache de alguns minutos no Redis. Daí em diante tudo vem da configuração:
- **Prompts:** o texto base fica no modelo, com variáveis (`{ia_nome}`, `{clinica_nome}`, `{catalogo}`, `{profissionais}`, `{horarios}`, `{faq}`, `{regras}`, `{instrucoes_extras}`). O painel monta o texto final.
- **WhatsApp:** URL e token da uazapi da clínica, usados no cabeçalho das chamadas de envio. Não viram credencial do n8n.
- **Agenda:** os IDs das agendas de cada profissional vêm do painel (ver "Google Calendar" abaixo).
- **Tabelas e memória:** `clinica_id` em todas as linhas e em toda chave do Redis.
- **Modelos de IA:** escolhidos no painel, com padrão.

Clínica nova = cadastrar no painel. Melhorou o prompt ou corrigiu um nó: vale para todas na hora.

Para uma mudança não derrubar todas as clínicas de uma vez, ficam **duas versões no ar: estável e beta**. A mudança vai para a beta com uma clínica, e depois para a estável.

### Credenciais que ficam no n8n (as mesmas para todas as clínicas)
- **OpenAI:** uma chave sua. O custo de cada clínica é registrado pelo uso de tokens de cada resposta, para você cobrar ou acompanhar.
- **Google Calendar:** uma conta Google da operação. Cada clínica **compartilha as agendas dos profissionais com essa conta** (com permissão de editar), e o painel guarda só os IDs. Acaba o OAuth por clínica. A confirmar: usar conta de serviço do Google em vez de conta comum.
- **Postgres, Redis e banco das conversas:** um acesso, com `clinica_id` em tudo.
- O token da uazapi de cada clínica fica cifrado no banco do painel e chega ao n8n só pela rota de configuração, com chave. Ativar a ocultação de dados de execução do n8n nesses nós para o token não aparecer no histórico.

### O painel
Lista de clínicas com status (rascunho, em teste, no ar, pausada, com erro) e, para cada uma, um passo a passo:

1. **Clínica:** nome, endereço, telefone, horário de funcionamento, fuso.
2. **Profissionais:** nome, especialidade, dias e horários de atendimento, ID da agenda do Google, botão "testar acesso à agenda".
3. **Procedimentos:** nome, duração, faixa de preço (opcional), quem faz, palavras que o paciente usa ("dente amarelo" → Clareamento), foto ou vídeo de resultado.
4. **Atendente:** nome e tom da IA, regras ligar/desligar (pode falar preço, avaliação gratuita, pergunta preferência de profissional, aceita convênio), perguntas frequentes, instruções extras, prévia do prompt final.
5. **Equipe:** número que recebe o aviso de atendimento humano, horário em que há humano.
6. **WhatsApp:** URL e token da uazapi, botão "testar conexão". Se a API da uazapi permitir, criar a instância e mostrar o QR no próprio painel.
7. **Lembretes:** ligar ou desligar véspera e dia, horários.
8. **Teste:** simulador de conversa no painel (como a página "Teste Costa Cunha" que você já tem), modo de teste com números liberados.
9. **Ir ao ar:** botão que só você aciona.

**Formulário para a clínica preencher:** um link enviado ao cliente com os passos 1, 2, 3, 5 e 7. Você só revisa, ajusta o atendente, conecta o WhatsApp e testa. É isso que corta a maior parte das 2 semanas.

## Fases

| Fase | Entrega | Observação |
|---|---|---|
| 0. Segurança | Token da uazapi sai do nó da CONFIG; nós `delete` sem `where` removidos | Mexe em workflow ativo: só com o seu ok, e você publica |
| 1. Banco e rota de configuração | Tabelas das clínicas, profissionais, procedimentos, regras e segredos cifrados; rota que devolve a configuração montada para o n8n | |
| 2. Workflow multiclínica (beta) | Cópia dos 6 refeita: carrega configuração, sem nada fixo, `clinica_id` em tudo, prompts por variável, uma credencial de cada tipo | Criada desativada; os atuais não são tocados |
| 3. Painel | Lista de clínicas, passo a passo, prévia do prompt, testes de agenda e WhatsApp | |
| 4. Simulador e modo de teste | Conversa de teste no painel sem WhatsApp real | |
| 5. Migrar a Clínica Unificada | Cadastrá-la no painel, rodar a beta em modo de teste, comparar com o fluxo atual, trocar o webhook da uazapi, manter o conjunto antigo desativado para voltar se precisar | Prova que nada se perdeu; cada troca no ar só com o seu ok |
| 6. Formulário do cliente | Link de cadastro para a clínica preencher | |
| 7. Estável e beta | Escolher a versão por clínica, painel de falhas e custo | |
| 8. Ferramentas da clínica | Despachante, cadastro de ferramentas com versão e permissão por clínica, workflow modelo de ferramenta | Pode entrar junto com a Fase 2, se já houver um cliente com exceção |
| 9. Esteira de teste | Conversas de teste por clínica, rodar todas antes de mudar o núcleo, comparador de diferenças | Depende da Fase 4 |

## Ferramenta nova só para um cliente, sem arriscar os outros

### Separar núcleo e ferramentas
- **Núcleo:** entrada e saída, roteador, memória, envio. Muda raramente e só pela esteira da beta.
- **Ferramentas:** cada uma é um **sub-workflow próprio**, com um contrato fixo:
  - entrada: `clinica_id`, `argumentos`, `config_da_clinica`;
  - saída: `{ ok, mensagem_para_ia, dados }`.

  Existe um "workflow modelo de ferramenta" para copiar.

### Como a IA chega à ferramenta
| Tipo | Como funciona | Quando usar |
|---|---|---|
| **Ferramenta de catálogo** (nativa) | Nó de ferramenta ligado ao agente no núcleo | Ferramentas que todas ou quase todas as clínicas usam: agendar, encaminhar, mídia |
| **Ferramenta da clínica** (pelo despachante) | O agente tem **uma** ferramenta genérica, `executar_ferramenta_da_clinica(nome, argumentos)`. O prompt de cada clínica lista só as ferramentas dela (nome, descrição, campos). O despachante procura no cadastro qual sub-workflow corresponde, confere se a clínica tem permissão, valida os argumentos e chama o sub-workflow pelo ID | Exceções de um cliente, ferramentas em teste |

Adicionar uma ferramenta de clínica **não altera o núcleo**. Ela é um sub-workflow novo mais um cadastro no painel. A troca é que, pelo despachante, a IA recebe os argumentos como JSON genérico, menos guiado que numa ferramenta nativa. O despachante valida e devolve o erro para a IA tentar de novo. Quando uma ferramenta de clínica passa a ser usada por várias, ela é promovida a ferramenta de catálogo, pela beta.

### Riscos e o que impede cada um
| Risco | Proteção |
|---|---|
| A IA de outra clínica chamar a ferramenta | A ferramenta não aparece no prompt das outras, e o despachante recusa se a clínica não a tiver ligada |
| A descrição da ferramenta nova mudar o raciocínio da IA de outras clínicas | O trecho de ferramentas é montado por clínica. O painel compara o prompt final das outras clínicas antes e depois e mostra "0 clínicas afetadas" |
| Erro ou exceção na ferramenta derrubar o atendimento | O despachante tem tempo limite e captura o erro. A IA recebe "não consegui agora" e segue, ou passa para um humano. Você recebe um alerta |
| Ferramenta lenta travar o n8n para todas | Tempo limite por ferramenta. O que é demorado roda em segundo plano e avisa o paciente depois |
| A ferramenta ler dados de outra clínica | O `clinica_id` vem da execução, nunca do que a IA escreve. Consultas sempre filtradas por clínica |
| Credencial nova do cliente (ex.: API de Pix dele) | Fica cifrada na configuração da clínica e entra só na ferramenta dela. Nunca no núcleo |
| Corrigir uma ferramenta já em uso quebrar quem a usa | Versões: cada versão é um sub-workflow próprio, e o cadastro diz qual versão cada clínica usa. Troca por clínica, com volta em um clique |
| Mudança no núcleo (quando o despachante não basta) | Beta com uma clínica, conversas de teste de **todas** as clínicas antes de ir para a estável, e volta em um clique |

### Esteira de segurança
1. **Conversas de teste por clínica.** Cada clínica e cada exceção têm 2 ou 3 conversas salvas. Elas rodam no simulador, sem WhatsApp real.
2. **Rodar todas antes de qualquer mudança no núcleo.** Comparar, para cada clínica, quais ferramentas foram chamadas e se a resposta mudou. O painel mostra só as diferenças.
3. **Liberar aos poucos.** Uma clínica na beta, depois todas.
4. **Acompanhar depois de ir ao ar.** Falhas por clínica e por ferramenta nas primeiras horas.
5. **Desligar rápido.** Botão para desligar uma ferramenta, para voltar uma clínica à versão anterior e para voltar o núcleo à estável.

### Passo a passo: ferramenta nova para o cliente X
1. Copiar o "workflow modelo de ferramenta" e escrever a lógica. Credenciais do cliente vêm da configuração dele.
2. Cadastrar no painel: nome, descrição para a IA, campos, ID do sub-workflow, tempo limite. Clínicas com acesso: só X.
3. Escrever 2 ou 3 conversas de teste para X.
4. Testar no simulador com o rascunho da configuração de X.
5. Publicar para X. O painel confirma que o prompt das outras clínicas não mudou.
6. Se outro cliente pedir, ligar para ele também. Se muitos usarem, promover a ferramenta de catálogo pela beta.

## Regras
- Nenhum workflow é ativado ou publicado sem você dizer "publica", a cada vez.
- Os 6 workflows atuais seguem funcionando até a Fase 5.
- Nenhum teste envia WhatsApp real sem pedido.
- Sem commit, push ou deploy sem pedido.

## Decisões suas
1. **Onde fica o painel:** dentro do painel superadmin da MyClinica, ou num sistema separado só para a automação? Depende de os clientes da automação usarem ou não o app da MyClinica.
2. **Agenda:** as clínicas usam o Google Calendar (como a Unificada), ou algumas vão usar a Agenda da MyClinica? O painel pode aceitar as duas, mas começar por uma é mais rápido.
3. **OpenAI:** a chave é sua para todas (e a IA entra na mensalidade), ou cada clínica traz a própria chave?
4. **Identidade da IA:** continua negando que é IA, ou se apresenta como atendente virtual?
