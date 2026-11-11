# Link do paciente, assinatura eletrônica e QR verificador (Onda 3)

Três recursos no mesmo desenho: tokens aleatórios guardados só como hash, páginas públicas sem sessão e sem dado além do
necessário, escrita só pelo servidor.

## 1. Link mágico `/p/[token]`

- A clínica abre o prontuário e clica em **Link do paciente**. Escolhe o escopo, a validade (7, 15 ou 30 dias) e, se quiser,
  escreve orientações. O botão **Abrir no WhatsApp** abre o `wa.me` com o texto pronto; **nada é enviado sozinho**.
- Escopos: `plano_alimentar` (só clínicas de nutrição), `vacinas_peso` (só veterinária), `proximas_consultas`, `orientacoes`,
  `assinatura`. O servidor só consulta o banco para os escopos marcados (`loadPortalPage`).
- Token: 32 bytes aleatórios (base64url, 43 caracteres). O banco guarda o SHA-256 (`token_hash`). O token em claro existe
  apenas na resposta que cria o link; depois não há como recuperá-lo, só revogar e gerar outro.
- Revogação: botão **Revogar** na mesma tela. A página deixa de abrir na hora e os documentos pendentes do link deixam de
  poder ser assinados.
- Link inexistente, mal formado, expirado ou revogado: **a mesma tela 404** ("Link indisponível"), sem revelar qual caso é.
- Dados mostrados: primeiro nome, nome da clínica, e por escopo: consultas futuras (data, procedimento, profissional),
  refeições do plano mais recente (alimento e quantidade, sem macros nem metas), vacinas e pesos do pet (sem observações nem
  registro do veterinário), a mensagem digitada pela clínica, documentos a assinar. Nunca CPF, telefone, e-mail, valores,
  prontuário ou observações internas (`lib/portal/publicView.ts`, testado).

## 2. Assinatura eletrônica simples

**É assinatura eletrônica simples (Lei 14.063/2020, art. 4º, I). Não é assinatura com certificado ICP-Brasil.** A tela da
clínica, a página do paciente e o documento impresso dizem isso. Para receita de controle especial ou documento que exija
certificado, continua valendo ICP-Brasil (fora do escopo desta entrega).

- Documentos: TCLE, termo de uso de imagem e contrato. O texto inicial vem dos modelos genéricos (`documentBodyTemplates.ts`)
  ou do contrato salvo na ficha do paciente; a clínica edita. O texto é **texto puro** (nunca HTML) e **não pode ter
  campos `[entre colchetes]`** pendentes. Até 3 documentos por link.
- O paciente lê e assina no celular: **nome digitado** ou **desenho na tela + nome**, mais a caixa de aceite.
- O que fica registrado em `signed_documents`: texto assinado, hash SHA-256 do conteúdo, nome, método, desenho (PNG até
  200 mil caracteres), data e hora (UTC, exibida em Brasília), **hash HMAC-SHA256 do IP** (segredo `PORTAL_HASH_SALT`, ou
  derivado da chave de serviço), user-agent (até 300 caracteres) e o **hash do ato**
  (`SHA-256(requestId, clínica, paciente, hash do conteúdo, nome, método, hash do desenho, instante)`).
- Imutável: uma assinatura por pedido (`UNIQUE request_id`) e gatilho no banco que recusa UPDATE/DELETE
  (arquivo de policies). O servidor também confere que o hash do texto continua batendo antes de gravar.
- A clínica vê o histórico no mesmo modal e usa **Ver e imprimir** para o documento com carimbo (data/hora, hashes, IP em
  hash, dispositivo, aviso de assinatura simples).

## 3. QR verificador `/verificar/[codigo]`

- Na aba **Documentos**, atestado, declaração de comparecimento, laudo e receita comum têm a opção **QR de verificação**
  (ligada por padrão). Ao imprimir ou baixar, o sistema registra o documento em `issued_documents` e põe no rodapé o QR,
  o endereço, o código (`XXXX-XXXX-XXXX-XXXX`, 80 bits) e o hash curto (12 caracteres) do texto.
- O banco guarda só o **hash do código** e o **hash do conteúdo**: nenhum texto clínico. Cada impressão gera um registro
  novo. Se o registro falhar (tabela ausente, sem permissão), a impressão **não sai em silêncio sem QR**: aparece o erro e
  a opção de desmarcar o QR.
- A página pública mostra clínica, tipo do documento, data de emissão, profissional (nome e registro) e hash curto; nunca o
  paciente nem o conteúdo. Código inexistente ou mal formado: mesma tela 404. Documento revogado
  (`UPDATE issued_documents SET revoked_at = now() ...`, pelo SQL Editor) aparece como "revogado".
- QR gerado localmente (`lib/qr/qr.ts`, sem dependência, modo byte, correção M, versões 1 a 10), conferido com um
  decodificador real durante o desenvolvimento.
- Não é receita digital válida em farmácia (isso exige ICP-Brasil/Memed). É só prova de emissão pela clínica.

## Segurança

| Item | Como |
|---|---|
| Token | 32 bytes aleatórios, só SHA-256 no banco, expira (máx. 30 dias), revogável |
| Enumeração | 404 idêntico para os quatro casos; balde de falhas por IP (10 em 10 min) |
| Rate limit | página 40/min/IP, 60/min/token e teto global 1200/min; assinar 10/10 min/IP, 20/h/token e teto global 300/10 min; verificar 20/min/IP e teto global 600/min (em memória, instância única, como o resto do app) |
| IP do cliente | Só o N-ésimo valor de `X-Forwarded-For` contado do fim (N = `PORTAL_TRUSTED_PROXY_HOPS`, padrão 1 = Traefik/EasyPanel), nunca o primeiro (forjável); reserva `x-real-ip`. `0` ignora cabeçalhos de cliente. Mesma regra no middleware (`src/lib/portal/clientIp.ts`) |
| Sessão | `/p`, `/verificar` e `/api/p` saem do middleware antes de criar o cliente Supabase: sem cookie |
| Cabeçalhos | `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`, metadata `robots` e `referrer` |
| CSRF | POST de `/api/p/*` passa pela checagem de origem do middleware |
| XSS | texto do documento e dos campos renderizado pelo React; HTML de impressão com `escapeHtml`; desenho só como data URL PNG validada |
| Multi-tenant | rotas da clínica: clínica vem do usuário logado (`requireModulePerm('prontuario')`), nunca do corpo; páginas públicas: toda consulta filtra por `clinic_id` e `patient_id` do link |
| Escrita | só pelo servidor (cliente de serviço, que é a única forma de a página pública funcionar sem sessão); tabelas com RLS sem policy de escrita |

## Banco

1. Aplicar `supabase/migrations/20261117_portal_assinatura.sql` (4 tabelas, RLS ligado).
2. **Obrigatório em produção:** colar no SQL Editor `supabase/pendente-colar-sql-editor/20261117_portal_assinatura_policies.sql`
   (imutabilidade de `signed_documents`, congelamento do texto de `signature_requests`, checagem clínica/paciente e
   policies de leitura). O app roda sem ele, mas sem o script o banco NÃO bloqueia UPDATE/DELETE em assinaturas
   nem a troca de texto de documento já criado: a defesa em profundidade só existe depois de colar.
3. Opcional: `PORTAL_TRUSTED_PROXY_HOPS` (padrão 1; some 1 se houver Cloudflare na frente do Traefik); `PORTAL_HASH_SALT` (16+ caracteres) no ambiente; `NEXT_PUBLIC_APP_URL` já define o endereço dos links.

Sem as tabelas, a tela da clínica mostra "ainda não estão ativos nesta conta", as páginas públicas respondem 404 e o QR
não sai (com aviso). Nada mais do app muda.

## Arquivos

- Lógica pura: `src/lib/portal/{scopes,link,token,publicView,format,http,server}.ts`,
  `src/lib/assinatura/{texto,hash,validar,tipos,verificacao,carimbo,modelos}.ts`, `src/lib/qr/qr.ts` (+ testes).
- Rotas da clínica: `src/app/api/portal/links`, `src/app/api/portal/links/[id]`, `src/app/api/portal/assinaturas/[id]`,
  `src/app/api/documentos/emitir`.
- Público: `src/app/p/[token]/*`, `src/app/api/p/[token]/assinar`, `src/app/verificar/[codigo]/*`.
- Clínica (UI): `src/components/prontuario/portal/*`, botão em `ProntuarioModal.tsx`, QR em `TabDocumentos.tsx`.

## Limites conhecidos

- Sem OTP por WhatsApp para dados sensíveis (o plano previa; exigiria envio de mensagem, fora desta entrega).
- Sem pré-anamnese, diário alimentar nem exercícios no link (outras frentes da Onda 3).
- O IP vem de `x-forwarded-for`; atrás de proxy que não normaliza o cabeçalho ele pode ser forjado (afeta o rate limit e o
  hash de IP gravado, não a autorização).
- Rate limit em memória não é compartilhado entre instâncias.
- Revogar documento emitido (QR) é por SQL; não há botão.
