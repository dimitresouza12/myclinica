# Auditoria UI/UX MyClinica - Fase 1 (captura) - 2026-11-04

Ambiente: dev webpack localhost:3004, login video123. Chrome do pane Claude. Desktop 1440x900 e mobile 390x844; tema escuro (padrao do sistema) e claro (toggle "Tema claro", chave localStorage myclinica-theme). Nenhum dado criado, editado ou apagado; modais fechados com Escape. Ficha do paciente aberta apenas para leitura (o app registra "Prontuario visualizado" na auditoria).

Limitacoes: (1) capturas visuais saem com a pagina ainda em fade-in (pacientes_fadeUp ficou em opacity 0.45 apos 5s), possivelmente por throttling do pane oculto; nao tratado como defeito sem confirmacao. (2) Screenshots dos modais desktop pegaram a animacao; medidas dos modais vem de getComputedStyle. (3) /admin: usuario nao e superadmin. (4) /login, /experimentar e /trial-expirado foram medidas com sessao ativa (abriram normalmente; /login so no mobile claro e desktop escuro).

## Medidas globais (todas as rotas internas)

| Item | Desktop escuro | Desktop claro | Mobile |
|---|---|---|---|
| Fundo pagina | rgb(10,10,10) | rgb(255,255,255) | igual ao tema |
| Fundo card | rgb(17,17,17), borda 1px rgb(28,28,28), raio 22px, sem sombra | rgb(255,255,255), borda transparente, sombra 0 1px rgba(13,36,33,.04), raio 22px | raio 18px |
| Texto | rgb(242,242,242) | rgb(13,36,33) | idem |
| Corpo | Inter 15px/400 | idem | idem |
| h1 (padrao) | Plus Jakarta Sans 28px/600 | idem | 20px/600 |
| h1 Dashboard | 26px/600 | idem | 22px/600 |
| th | Inter 12.48px/500 cor rgb(163,163,163) | rgb(82,113,111) | n/d (cards) |
| Padding lateral main | 36px (8px 36px 32px), largura 1208, sem max-width | idem | 16px (8px 16px 24px) |
| Sidebar | 232px | idem | drawer (botao Menu 38x38) |
| Botao primario padrao | 40px, raio 999px, fundo rgb(77,217,192), 14px | idem | 44px |
| Input padrao (modais, Metas, Config) | 44px, raio 10px, 14.4px (16px em Config e CRM) | idem | 44px, 16px |
| Botao de acao principal | canto direito do cabecalho, y=98 | y=108 | abaixo do titulo, x=16 (Agenda: FAB inferior direito) |
| Filtros (pills) | abaixo do titulo / na barra do card, altura 30px | idem | 38px |

## Medidas por rota

| Rota | h1 | Botao principal (h / raio / fonte) | Estouro horizontal | Alvos <44px mobile | Emoji |
|---|---|---|---|---|---|
| /dashboard | 26/600 "Boa tarde, Joao" | sem botao principal; pills Semana/Mes/6 meses 30px (38 mobile) | nenhum | 7 (Editar 35x15, pills 38, logout 40, sino 40, menu 38) | nenhum |
| /agenda | 28/600 | Novo agendamento 40 / 999 / 14, x=1205 | nenhum | 18 (dateStrip 42x48, Hoje 58x32, Bloquear horario 36x36, pills 38) | nenhum |
| /pacientes | 28/600 | Novo paciente 40 / 999 / 14, x=1240 | nenhum | 126-141 (nome 90x23, "Mais acoes" 32x32, pills 38, busca 18px) | nenhum |
| /financeiro | 28/600 | Receita 40 / 999 / 14 | nenhum | 11 (pills 38, busca 26px) | nenhum |
| /mensagens | sem h1 no desktop; h1 20/600 no mobile (duplicado com o titulo da topbar) | n/d | nenhum | 6 (tabs 42x44, busca 26px) | nenhum |
| /crm | 28/600 | Novo lead 44 / 12px / 13.6 (destoa) | nenhum | 12 (colAdd 32x32, cardName 18px de altura, busca 26px) | nenhum |
| /procedimentos | 28/600 | Novo procedimento 40 / 999 / 14 | nenhum | 11 (card_more 32x32) | nenhum |
| /estoque | 28/600 | Novo produto 40 / 999 / 14 | nenhum | 15 (pills 38, statCard_delta 91x28, busca 40, card_more 32) | nenhum |
| /equipe | 28/600 | Novo profissional 40 / 999 / 14 | nenhum | 6 (card_more 32) | nenhum |
| /relatorios | 28/600 | sem primario; "Exportar planilha" secundario | nenhum | 12 (pills 38) | nenhum |
| /comissoes | 28/600 | Novo beneficiario 40 / 999 / 14 | nenhum | 7 | nenhum |
| /metas | 28/600 | Salvar meta 40 / 999 / 14 (dentro do card) | nenhum | 3 | nenhum |
| /campanhas | 28/600 | + Nova campanha 35 / 10px / 14, y=64 (destoa) | nenhum | 4 (botao novo 159x35) | nenhum na UI (emoji nos templates de mensagem, ver achados) |
| /configuracoes | 28/600 | Salvar Configuracoes 44 / 999 / 14.4; + Novo Usuario 40 / 999 / 13.44 | nenhum | 3 | nenhum |
| /admin | sem h1; "Acesso restrito a superadmins." | n/d | nenhum | n/d | nenhum |
| /login | 52/700 (hero), mobile 33.6/700 | Entrar 48 / 12px / 15.2 | nenhum | 1 (link "Otimiza AI" 55x15) | nenhum |
| /experimentar | 28/600 (h1 "Dashboard" no fundo borrado; sem h1 no mobile) | Continuar 48 / 12px / 15.2 | nenhum | 0 | nenhum |
| /trial-expirado | 22.4/700 branco | Assinar agora 63 / 10px / Arial 16 | nenhum | 2 (links 20px) | relogio de alarme (ver achados) |
| / | redireciona para /dashboard logado | | | | |

Estouro horizontal: zero em todas as rotas e viewports medidos (scrollWidth == innerWidth).

## Modais e estados (sem salvar)

| Tela | Modal | Largura | Raio | Observacao |
|---|---|---|---|---|
| Agenda | Novo agendamento | 512 | 22 | fundo rgb(17,17,17), borda 1px rgb(28,28,28), titulo 18/600, inputs 44h r10, rodape Cancelar/Salvar (39h, r999), Salvar desabilitado cinza rgb(38,38,38) |
| Pacientes | Novo paciente | 670 | 22 | 12 campos, botao Salvar teal habilitado, 39h |
| Financeiro | Nova Receita | 520 | 22 | 760 de altura com rolagem interna, Salvar desabilitado |
| CRM | Novo lead | drawer lateral 460, altura total, raio 0 | 0 | titulo 18.4/**800**, inputs 16px, botoes 44h **r12**, fundo rgb(10,10,10); padrao proprio, diferente dos demais modais |
| Procedimentos | Novo procedimento | 433 | 22 | padrao |
| Estoque | Novo Produto | 512 | 22 | titulo com "Produto" capitalizado (outros: "Novo agendamento", "Novo paciente") |
| Equipe | Novo Profissional | 512 | 22 | capitalizacao diferente de "Novo paciente" |
| Comissoes | Novo Beneficiario | 512 | 22 | idem |
| Campanhas | Nova campanha | painel proprio com preview a direita, escurece tela inteira | | formulario longo, nao usa o padrao modal 22px |
| Pacientes | Ficha (modal quase tela cheia) | 100% | | abas: Ficha Clinica, Odontograma, Faceograma, Corpograma, Evolucao, Documentos, Chat IA |

Abas da ficha:
- Ficha Clinica: formulario longo, campos em duas colunas, secoes com rotulo teal em caixa alta.
- Odontograma: dentes 3D realistas, painel "Analise dos dentes" a direita; bom, mas bloco de recomendacoes cortado no fim do viewport.
- Faceograma / Corpograma: imagem anatomica pequena, legenda de marcacao com bolinhas coloridas; botao "Salvar" teal.
- Evolucao: textarea larga + botao Adicionar desabilitado; aviso de CFM; lista de anotacoes.
- Documentos: sub-abas Receita, Receita Especial, Declaracao, Atestado, Laudo; botao "Imprimir" em verde esmeralda gradiente rgb(5,150,105)->rgb(16,185,129), 44h, raio 12 (fora da paleta teal rgb(77,217,192) e do raio 999). Editor com folha branca em tela escura.
- Chat IA: estado de carregamento "Carregando historico..." em caixa vazia preta, sem skeleton.

Configuracoes (secoes): Geral, Equipe, Agenda, Documentos, Plano, Integracoes, WhatsApp, Conta, Auditoria. Navegacao lateral de 9 itens com icone + subtitulo, cards ocupam ~60% da largura (resto vazio a direita).

Estados vazios vistos: Agenda ("Nenhum agendamento para este dia", icone calendario no mobile), Financeiro ("Nenhum lancamento encontrado."), Campanhas ("Nenhuma campanha enviada ainda. Crie sua primeira campanha acima!"), Estoque ("Nenhuma movimentacao nos ultimos 6 meses."), Relatorios ("Sem dados no periodo"), Mensagens ("Selecione uma conversa"), Config > Agenda ("A escala dos profissionais ainda nao foi ativada para esta clinica."). Loading: Chat IA "Carregando historico..." e WhatsApp "Carregando...". Estilo dos estados vazios varia: texto centralizado solto (Campanhas, Financeiro), icone + texto (Mensagens, Agenda mobile).

## Console e rede

- 182 mensagens de console `Failed to load resource: the server responded with a status of 404` na sessao. Origem, via performance.getEntriesByType('resource'): tres GET no Supabase retornam 404 em toda carga de pagina interna:
  - /rest/v1/professional_week_pattern?select=professional_id,weekday,windows&clinic_id=eq.3916d37d-...
  - /rest/v1/professional_day_schedule?select=professional_id,date,works,windows&clinic_id=eq.3916d37d-...&date=gte.2026-10-21&date=lte.2027-05-03
  - /rest/v1/clinic_schedule_settings?select=*&clinic_id=eq.3916d37d-...
  Coerente com o aviso "escala dos profissionais ainda nao foi ativada" em Configuracoes > Agenda: tabelas ausentes neste banco.
- Sem erros de JS. Demais requisicoes 200/304.

## Achados por gravidade

### P0 (atrapalha o uso)
Nenhum achado P0 de UI. Sem estouro horizontal, pagina rola em todas as rotas mobile.

### P1 (confunde ou destoa)
1. Emoji na UI: /trial-expirado renderiza o relogio de alarme (src/app/trial-expirado/page.tsx:42, `<div className={styles.icon}>`). Viola a regra "sem emoji na interface". Trocar por icone SVG do conjunto do app.
2. Templates de campanha com emoji (src/app/(app)/campanhas/page.tsx:36-40) aparecem pre-preenchidos no textarea da campanha; tambem lib/actionAlerts.ts:33-35 e components/admin/AdminClinicas.tsx:24. E texto enviado ao paciente, nao chrome de UI; decidir se a regra se estende a mensagens (o usuario ve o emoji no editor).
3. Texto tecnico exposto ao usuario em Configuracoes > Integracoes: "NEXT_PUBLIC_GOOGLE_CLIENT_ID nao configurado. Adicione o Client ID OAuth2 do Google na variavel de ambiente do EasyPanel...". Mensagem de infra para dono de clinica; esconder o card ou mostrar "Integracao indisponivel".
4. 404 do Supabase em todas as paginas (tres tabelas de escala, ver Console e rede). Erro de rede constante; aplicar migracao ou tratar a ausencia sem request.
5. Botoes primarios fora do padrao: CRM "Novo lead" 44h/raio 12/13.6px (padrao 40h/999/14); Campanhas "+ Nova campanha" 35h/raio 10 com "+" em texto (padrao: icone + 40h/999), e cabecalho 34px mais alto na tela (y=64 vs y=98) por falta do padding superior; Documentos > Imprimir em verde esmeralda gradiente, 44h, raio 12.
6. Dois padroes de modal: CRM usa drawer lateral com titulo 800, inputs 16px, botoes raio 12 e fundo rgb(10,10,10); os demais usam modal central 22px com titulo 600, inputs 14.4px e botoes 999. Campanhas usa um terceiro layout.
7. /trial-expirado destoa do resto: pagina sempre escura mesmo em tema claro, botao CTA em Arial 16px (nao herda Inter) com gradiente rgb(13,148,136)->rgb(94,234,...) e raio 10, links "Precisa de ajuda?" e "Voltar ao login" a rgba(255,255,255,.3) (contraste muito baixo) e 20px de altura, marca escrita "myclinica" minusculo e sem acento no texto ("assine o plano mensal" e "Para continuar com acesso completo ao myclinica").
8. /experimentar forca tema claro (fundo branco e dashboard desfocado) mesmo com sistema escuro, enquanto /login e /trial-expirado seguem esquemas diferentes: tres telas publicas, tres comportamentos de tema.
9. Tema claro: cards brancos sobre pagina branca (borda transparente, sombra 0 1px a 4%), separacao quase inexistente entre card e fundo; no escuro o card tem borda visivel. Hierarquia some no claro.
10. Alvos de toque no mobile abaixo de 44px: pills de filtro 38px (todas as telas), "Mais acoes" 32x32 (Pacientes, Procedimentos, Equipe, Estoque, Comissoes), nome do paciente na lista 90x23, nome do lead 203x18, colAdd do CRM 32x32, itens do dateStrip da Agenda 42x48, Hoje 58x32, Bloquear horario 36x36, link Editar da meta 35x15, botoes de topbar 38-40.
11. Mensagens: sem h1 no desktop (cabecalho "Mensagens" existe como texto), no mobile aparece duplicado (titulo da topbar + h1 da pagina). Admin tambem sem h1.

### P2 (acabamento)
12. Placeholder da busca global da topbar fixo em "Buscar pacientes" em Financeiro, Equipe, Relatorios, Comissoes, Metas, Campanhas, Configuracoes (muda so em Agenda, Estoque, Procedimentos, CRM, Mensagens).
13. Capitalizacao inconsistente de titulos de modal: "Novo agendamento", "Novo paciente", "Novo lead" vs "Novo Produto", "Novo Profissional", "Novo Beneficiario", "Nova Receita", "Novo Usuario".
14. Padding/largura: conteudo sem max-width (1208px em 1440; vira linha longa em telas largas). Configuracoes usa so ~60% da largura (coluna vazia a direita). Headers de pagina com alturas diferentes (Campanhas y=64, demais y=98).
15. Inputs: raio 10px (modais, Metas, Config) vs 12px (login, experimentar, CRM botoes) vs 999px (busca de Estoque); fonte 14.4px vs 16px vs 13px. Input de busca do Financeiro tem 21px de altura e raio 0 (nativo, sem estilo).
16. Inputs dos modais com fundo igual ao do card (rgb(17,17,17)); so a borda os diferencia.
17. Mobile: KPIs em coluna unica (Pacientes, Financeiro, Relatorios) consomem ~4 telas de rolagem; considerar grade 2x2. CRM: KPIs cortados na horizontal ("Comp...") por rolagem lateral sem indicador forte.
18. Estados vazios sem padrao unico (ver lista acima); Chat IA mostra caixa preta vazia durante o carregamento sem skeleton.
19. Ficha do paciente: modal ocupa quase toda a tela com margem minima no desktop; abas pequenas e densas; bloco de recomendacoes do Odontograma cortado no rodape.
20. Rotulos em caixa alta pequena (12.48px th, labels de secao da ficha) com contraste #a3a3a3 sobre #111 no escuro: aceitavel (aprox. 7.6:1), mas no claro rgb(82,113,111) sobre branco (aprox. 5.4:1) fica no limite para texto de 12px.
21. Campanhas nao aparece na sidebar (acessivel so por URL/outro caminho).
