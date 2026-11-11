# IA do MyClinica via Gestor (gateway)

O MyClinica não guarda chave de provedor de LLM, modelo, preço nem limite. A chave OpenAI, os modelos, os
preços e os limites por cliente ficam no painel do Gestor. O MyClinica chama o Gestor de servidor para
servidor, e o Gestor registra o consumo por clínica.

## Variáveis (somente servidor, sem prefixo `NEXT_PUBLIC_`)

| Variável | O que é |
|---|---|
| `GESTOR_API_URL` | Endereço base do Gestor, sem barra no fim (ex.: `https://gestor.exemplo.com`). Aceita http/https. |
| `GESTOR_IA_KEY` | Chave de integração do MyClinica no Gestor, enviada no cabeçalho `x-sistema-chave`. O Gestor precisa reconhecê-la. |

Sem uma das duas (ou com URL inválida), a IA fica desligada: `getIaConfig()` devolve `null`, o `GET` da rota
responde `configurada: false` e o `POST` responde 503 `ia_indisponivel`. Não existe valor padrão. Não é a
mesma variável de `GESTOR_INTEGRATION_KEY` (que autentica o Gestor chamando o MyClinica).

## Endpoints do Gestor consumidos

Todos com o cabeçalho `x-sistema-chave: <GESTOR_IA_KEY>`. `ref` é o id da clínica (vem da sessão, nunca do
corpo da requisição do usuário).

### `GET {GESTOR_API_URL}/api/publico/ia/status?ref=<clinicId>`

Resposta 200:

```json
{ "enabled": true, "model": "nome-do-modelo", "budgetRemaining": 12.5 }
```

- `enabled` (obrigatório, só `true` liga a IA), `model` (opcional), `budgetRemaining` (opcional, número ou
  `null`; `<= 0` faz a rota responder 429 sem chamar o `complete`), `maxOutputTokens` (opcional).
- Qualquer outro status, timeout (5 s), JSON inválido ou variáveis ausentes = IA desligada (falha fechada).
- Cache em memória por clínica: 60 s (sucesso) e 10 s (falha). O cache é descartado após cada consumo.

### `POST {GESTOR_API_URL}/api/publico/ia/complete`

Corpo: `{ "ref": "<clinicId>", "feature": "escriba_evolucao" | "escriba_relatorio" | "importar_modelo", "system": "...", "user": "...", "maxTokens": 700 }`

Corpo opcional `images`: `[{ "mediaType": "image/jpeg" | "image/png" | "image/webp", "dataBase64": "..." }]` (até 3, ~4 MB cada), usado
só pela feature `importar_modelo` (foto do modelo de documento). A chave `images` só vai no corpo quando há imagem. O MyClinica
valida o tipo por magic bytes antes de enviar e nunca guarda nem loga a imagem.

| Resposta do Gestor | Erro no MyClinica | Resposta da rota ao usuário |
|---|---|---|
| 400 `{ error: "modelo_sem_visao" }` | `erro` (code `modelo_sem_visao`) | 503 `modelo_sem_visao` |
| 200 `{ text, usage: { inputTokens, outputTokens, model, costUsd } }` | (sucesso) | 200 rascunho |
| 401 | `autenticacao` | 503 `ia_indisponivel` (chave errada: configuração) |
| 403 `{ error: "cliente_bloqueado" }` | `indisponivel` | 403 `ia_bloqueada` |
| 403 `{ error: "ia_desativada" }` | `indisponivel` | 403 `ia_desativada` |
| 429 `{ error: "limite_mensal" }` | `limite` | 429 `limite_mensal` ("Limite mensal de IA atingido. Fale com o suporte.") |
| 429 outro | `limite` | 503 `ia_ocupada` |
| 503 `{ error: "ia_nao_configurada" }` | `indisponivel` | 503 `ia_indisponivel` |
| 502 / 5xx / falha de rede | `sobrecarga` | 503 `ia_ocupada` |
| 504 / 408 / timeout de 45 s | `timeout` | 504 `ia_demorou` |

## Regras

- O prompt, o texto clínico e a chave nunca são logados; só status HTTP e códigos curtos.
- O Gestor contabiliza o consumo. O adaptador declara `recordsOwnUsage`, então a rota não chama
  `recordIaUsage()` (nada conta em dobro). A auditoria de metadados continua em `audit_logs` (`ia.escriba`).
- O saldo em cache pode ficar até 60 s defasado; o Gestor continua sendo a barreira final (429).

## Código

- `src/lib/ia/gestorProvider.ts`: adaptador `gestor` (registra a fábrica ao ser importado pela rota).
- `src/lib/ia/config.ts`: `getIaConfig()` (status + cache).
- `src/app/api/ia/escriba/route.ts`: rota; resolve o provedor com o `clinicId` da sessão.
