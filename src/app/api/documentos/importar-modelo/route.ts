import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { rateLimit } from '@/lib/rateLimit'
import { getIaConfig } from '@/lib/ia/config'
import { resolveProvider } from '@/lib/ia/provider'
import '@/lib/ia/gestorProvider' // importar registra a fábrica 'gestor'
import { recordIaUsage } from '@/lib/ia/usage'
import { recordEscribaUsage } from '@/lib/ia/escribaServer'
import { respostaDeErroDoProvedor, respostaIaIndisponivel, respostaLimiteMensal } from '@/lib/ia/erros'
import {
  AVISO_IA, buildImportSystemPrompt, buildImportUserMessage, IMPORTAR_LIMITES, isDocKindImportavel, normalizeFinalidade,
  parseModeloResposta,
} from '@/lib/documentos/importar'
import { validarImagens } from '@/lib/documentos/importarImagem'

export const maxDuration = 60

// Importar modelo de documento por foto. A IA lê a imagem do modelo EM BRANCO da clínica e devolve o texto com
// marcadores de campo. A saída é SEMPRE um rascunho para revisão: esta rota não grava nada (quem grava, depois da
// confirmação humana, é /api/documentos/modelos).
//
// Barreiras, em ordem: sessão e permissão de EDITAR o prontuário -> provedor configurado e orçamento -> limite de taxa
// -> tamanho do corpo -> corpo válido (tipo, finalidade, confirmação "em branco", imagens por magic bytes) -> IA.
// A clínica e o usuário vêm da sessão, nunca do corpo.
//
// Privacidade: a imagem existe só na memória desta requisição e não é guardada. Nada de imagem, texto reconhecido
// nem resposta do provedor vai para log; a auditoria (audit_logs) leva só metadados (tipo, contagens, tokens).
// Limite de taxa: em memória, por instância (src/lib/rateLimit.ts), como na IA escriba.

// 3 imagens de 4 MB em base64 (~5,4 MB cada) + folga do JSON; next.config.ts tem proxyClientMaxBodySize de 22 MB
const MAX_CORPO_BYTES = 18 * 1024 * 1024

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status })
}

export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx

  const iaConfig = await getIaConfig(ctx.clinicId)
  const provider = resolveProvider(iaConfig, { clinicId: ctx.clinicId })
  if (!provider.configured) return respostaIaIndisponivel()
  if (typeof iaConfig?.budgetRemaining === 'number' && iaConfig.budgetRemaining <= 0) return respostaLimiteMensal()

  const byUser = rateLimit(`ia-importar-modelo:u:${ctx.userId}`, { limit: IMPORTAR_LIMITES.porUsuarioPorMinuto, windowMs: 60_000 })
  const byClinic = rateLimit(`ia-importar-modelo:c:${ctx.clinicId}`, { limit: IMPORTAR_LIMITES.porClinicaPorHora, windowMs: 60 * 60_000 })
  if (!byUser.success || !byClinic.success) {
    return json({ error: 'limite_de_uso', message: 'Muitos pedidos em pouco tempo. Aguarde um momento e tente de novo.' }, 429)
  }

  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_CORPO_BYTES) {
    return json({ error: 'imagem_grande', message: 'As imagens são grandes demais. Use fotos menores.' }, 413)
  }
  let text: string
  try { text = await req.text() } catch {
    return json({ error: 'corpo_invalido', message: 'Corpo da requisição inválido.' }, 400)
  }
  if (text.length > MAX_CORPO_BYTES) {
    return json({ error: 'imagem_grande', message: 'As imagens são grandes demais. Use fotos menores.' }, 413)
  }
  let raw: unknown
  try { raw = JSON.parse(text) } catch {
    return json({ error: 'corpo_invalido', message: 'Corpo da requisição inválido.' }, 400)
  }
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  // a confirmação "o modelo está em branco" é exigida AQUI também, não só na tela
  if (body.confirmaEmBranco !== true) {
    return json({ error: 'confirmacao_ausente', message: 'Confirme que o modelo está em branco, sem dados de paciente.' }, 400)
  }
  if (!isDocKindImportavel(body.tipo)) return json({ error: 'tipo_invalido', message: 'Escolha o tipo do documento.' }, 400)
  const kind = body.tipo
  const finalidade = normalizeFinalidade(kind, body.finalidade)
  if (finalidade === undefined) return json({ error: 'finalidade_invalida', message: 'Escolha a finalidade do documento.' }, 400)

  const imgs = validarImagens(body.imagens)
  if (!imgs.ok) return json({ error: imgs.error, message: imgs.message }, imgs.status)

  let completion
  try {
    completion = await provider.complete({
      feature: 'importar_modelo',
      system: buildImportSystemPrompt(kind, finalidade),
      user: buildImportUserMessage(imgs.images.length),
      maxTokens: IMPORTAR_LIMITES.maxTokensSaida,
      images: imgs.images,
    })
  } catch (e) {
    return respostaDeErroDoProvedor(e, 'Não foi possível ler o modelo agora. Tente de novo.')
  }

  // provedores que registram o próprio consumo (Gestor) não passam pelo sink: evita contar em dobro
  if (!provider.recordsOwnUsage) {
    await recordIaUsage({
      clinicId: ctx.clinicId, feature: 'importar_modelo', model: completion.usage.model,
      inputTokens: completion.usage.inputTokens, outputTokens: completion.usage.outputTokens,
    })
  }

  const parsed = parseModeloResposta(completion.text, { kind, finalidade })
  const auditBase = {
    tipo: kind,
    finalidade: finalidade ?? '',
    imagens: imgs.images.length,
    bytes_imagens: imgs.totalBytes,
    modelo: completion.usage.model,
    tokens_entrada: completion.usage.inputTokens,
    tokens_saida: completion.usage.outputTokens,
  }

  if (!parsed.ok) {
    await recordEscribaUsage({ action: 'ia.importar_modelo', clinicId: ctx.clinicId, userId: ctx.userId, req, details: { ...auditBase, resultado: parsed.motivo } })
    if (parsed.motivo === 'vazio') {
      return json({
        error: 'modelo_ilegivel',
        message: 'Não foi possível reconhecer um modelo de documento nesta imagem. Tente uma foto mais nítida, de frente e bem iluminada.',
        avisos: parsed.avisos,
      }, 422)
    }
    return json({ error: 'ia_falhou', message: 'Não foi possível ler o modelo agora. Tente de novo.' }, 502)
  }

  const { modelo } = parsed
  await recordEscribaUsage({
    action: 'ia.importar_modelo', clinicId: ctx.clinicId, userId: ctx.userId, req,
    details: {
      ...auditBase,
      resultado: 'ok',
      saida_chars: modelo.texto.length,
      marcadores: modelo.campos.length,
      sem_campo: modelo.campos.filter(c => c.campo === null).length,
      avisos: modelo.avisos.length,
    },
  })

  return NextResponse.json({ texto: modelo.texto, campos: modelo.campos, avisos: modelo.avisos, aviso: AVISO_IA })
}
