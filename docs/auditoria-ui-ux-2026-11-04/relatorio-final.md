# Auditoria UI/UX do MyClinica - relatório final

Data: 2026-11-04. Base: `fase0-inventario.md` (código) e `fase1-captura.md` (medidas ao vivo, conta de teste, 1440 e 390 px, claro e escuro). Nada no código foi alterado.

Limites desta auditoria: as notas vêm de medidas e do inventário de CSS, não de uma revisão visual quadro a quadro. Admin só foi lido pelo código (a conta de teste não é superadmin). Rotas públicas só foram medidas com sessão ativa. Mobile foi capturado em Dashboard, Agenda e Pacientes; nas demais, só o inventário de CSS. A Fase 2 desta auditoria avaliou o estado "padrão premium" contra "legado".

## Veredito

O núcleo está bom. Quase todas as telas já têm título 28/600, botão primário de 40 px com canto totalmente arredondado em teal, inputs de 44 px e modais com 22 px de raio. Não há estouro lateral em nenhuma tela e nenhum erro de JavaScript.

A desarmonia está nas bordas: Agenda, Mensagens, CRM, Configurações, Campanhas, Admin, Prontuário, Login e Trial-expirado. Elas usam outro vocabulário de superfícies, raios e botões. A causa de fundo é que o design system só define cor, raio e sombra. Não existem tokens de tamanho de texto, espaçamento ou camada (z-index), e não existem componentes de estado vazio, carregando, erro, badge e campo de formulário.

## Notas por aba (1 a 5)

| Aba | Harmônico | Intuitivo | Proporcional | Principal motivo |
|---|---|---|---|---|
| Dashboard | 4 | 4 | 4 | Título dentro do card hero (formato próprio); sem ação principal |
| Agenda | 3 | 4 | 4 | Vocabulário legado de superfícies; alvos de toque pequenos no mobile (18) |
| Pacientes | 4 | 4 | 3 | 126 a 141 alvos pequenos no mobile (nome 90x23, busca 18 px); ficha com margem mínima |
| Financeiro | 4 | 4 | 4 | Busca sem estilo (21 px, raio 0); sem feedback de erro |
| Mensagens | 2 | 3 | 3 | Sem título no desktop e duplicado no mobile; largura total; abas com estilo próprio |
| CRM | 2 | 4 | 3 | Botão 44 px raio 12; drawer com padrão próprio (título 800); abas sublinhadas; tokens `--st-*` redefinidos |
| Procedimentos | 5 | 4 | 4 | Referência do padrão |
| Estoque | 4 | 4 | 4 | Título de modal capitalizado diferente ("Novo Produto"); busca de 40 px |
| Equipe | 4 | 4 | 4 | Capitalização do modal; calendário de escala ainda em tabela sem versão mobile |
| Configurações | 3 | 3 | 2 | Usa ~60% da largura; `alert()` nativo; texto técnico exposto (variável de ambiente, EasyPanel) |
| Relatórios | 4 | 4 | 4 | Sem ação principal (aceitável); pills de 38 px no mobile |
| Comissões | 4 | 4 | 4 | Ok |
| Metas | 4 | 4 | 4 | Botão Salvar dentro do card (posição diferente das outras abas) |
| Campanhas | 2 | 3 | 3 | Botão 35 px raio 10 e cabeçalho 34 px mais alto; verde do WhatsApp; painel de criação próprio; fora da sidebar |
| Admin | 2 | n/d | n/d | Gradiente no botão, caixa branca nas abas, raio "99px" (erro de digitação), sem título |
| Login | 2 | 4 | 4 | Paleta própria (238 cores literais), botão 48 px raio 12 |
| Experimentar | 2 | 4 | 4 | Herda o login; força tema claro |
| Trial-expirado | 1 | 3 | 2 | Emoji, sempre escuro, CTA em Arial, links com contraste muito baixo, marca sem acento |

## Problemas que valem em todas as abas

Corrigir uma vez, no sistema, resolve várias telas.

1. **Cabeçalho de página**: 4 formatos hoje. Padronizar em `PageHeader` (título, ação principal à direita, filtros abaixo) e usar em Dashboard, Mensagens, CRM, Campanhas e Admin.
2. **Botão primário**: recriado cerca de 16 vezes. Criar um único componente de botão (primário, secundário, perigoso) a partir de `button.module.css` e trocar as cópias. Remove o gradiente do Admin, o verde do Documentos > Imprimir e o verde do WhatsApp em Campanhas.
3. **Escala de tipografia**: hoje 75 tamanhos de fonte, 26 deles entre 0.58rem e 0.88rem. Definir tokens (por exemplo 11, 12, 13, 14, 16, 20, 28) e substituir.
4. **Raios e superfícies**: unificar os vocabulários legado e premium em um só. Extinguir os raios soltos de 10 e 12 px.
5. **Estados**: criar `EmptyState`, `Skeleton`/`Spinner`, `Badge` e um aviso de erro. Substituir os 14 `.loading` e 11 `.empty` próprios, e trocar o `alert()` de Configurações por Toast.
6. **Abas internas**: um só `PillTabs` (ou variante sublinhada oficial) no lugar dos 5 estilos.
7. **Largura do conteúdo**: um token de largura máxima, com exceção explícita para Mensagens e Agenda.
8. **Alvos de toque no mobile**: pills de filtro (38 px), "Mais ações" (32 px), nomes clicáveis em tabela e busca (18 a 26 px). Subir para 44 px.
9. **Foco, z-index e animações**: bloco global de `:focus-visible`, escala de z-index (19 valores hoje) e uma única animação `fadeUp`.
10. **Texto**: capitalização de títulos de modal, placeholder da busca global (fixo em "Buscar pacientes" em 7 telas), texto de infraestrutura exposto ao usuário.

## Lista priorizada

**P0 (atrapalha o uso)**: nenhum achado bloqueante nas telas medidas. O que mais se aproxima:
- Alvos de toque abaixo de 44 px em todas as telas mobile medidas, com destaque para Pacientes (126 a 141), que aumenta o risco de toque errado perto de ações destrutivas.
- Mensagens sem título no desktop e duplicado no mobile.

**P1 (confunde ou destoa)**
1. Trial-expirado fora do sistema: emoji (viola a regra de não usar emoji na interface), sempre escuro, CTA em Arial, contraste dos links, marca "myclinica" sem acento.
2. Padrão único de botão primário (CRM, Campanhas, Admin, Documentos, Login).
3. Cabeçalho de página padronizado (Dashboard, Mensagens, CRM, Campanhas, Admin).
4. Três padrões de modal (central 22 px, drawer do CRM, painel de Campanhas).
5. Configurações: sem `alert()`, sem texto técnico, aproveitar a largura.
6. Componentes de estado (vazio, carregando, erro). Pacientes, Financeiro, Relatórios e Comissões hoje não mostram erro visível.
7. Tema claro: card branco sobre página branca, quase sem separação.
8. Login e Experimentar: trazer para os tokens do app.

**P2 (acabamento)**
- Busca do Financeiro sem estilo; padronizar campo de busca.
- KPIs em coluna única no mobile consomem muita rolagem (usar 2 colunas).
- Campanhas fora da sidebar.
- Ficha do paciente com margem mínima.
- Chat IA: caixa preta durante o carregamento.
- Vermelho de perigo duplicado (#DC2626 e #EF4444), keyframes duplicados, CSS morto em Campanhas.

## Ruído técnico a investigar (fora do escopo visual)

Em toda carga de página interna há 3 requisições ao Supabase respondendo 404 (`professional_week_pattern`, `professional_day_schedule`, `clinic_schedule_settings`). É o esperado enquanto a migration `20261104_agenda_escala.sql` não foi aplicada, mas some quando você a aplicar. A migration `20260805_agenda_block.sql` também segue pendente.

## Ordem de execução sugerida

| Lote | O que | Alcance | Risco |
|---|---|---|---|
| 1 | Tokens de texto, espaçamento, z-index e foco global; componentes EmptyState, Skeleton, Badge, botão único | Base de tudo | Baixo (aditivo) |
| 2 | Trial-expirado, Login e Experimentar nos tokens; tirar emoji | 3 telas públicas | Baixo |
| 3 | Cabeçalho padrão nas 5 abas divergentes; Mensagens com título | Dashboard, Mensagens, CRM, Campanhas, Admin | Médio |
| 4 | Botões e raios nas telas divergentes; abas internas únicas | CRM, Campanhas, Admin, Configurações | Médio |
| 5 | Alvos de toque no mobile | Pacientes primeiro, depois as outras | Médio (muda layout) |
| 6 | Configurações (largura, sem `alert()`, sem texto técnico); modais padronizados | Configurações, CRM, Campanhas | Médio |
| 7 | P2 | Pontual | Baixo |

Cada lote: implementação (Frontend), revisão cruzada, QA em 1440 e 390 px nos dois temas. Sem commit nem deploy até você pedir.
