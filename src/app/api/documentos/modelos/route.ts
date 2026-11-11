import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { recordEscribaUsage } from '@/lib/ia/escribaServer'
import { chaveDoModelo, isDocKindImportavel, normalizeFinalidade, validarModeloFinal, validarNomeModelo } from '@/lib/documentos/importar'
import { listarModelos, MENSAGEM_MODELO_FALHA, removerModelo, salvarModelo, type ModeloFalha } from '@/lib/documentos/modelosServer'

// Modelos de texto da clínica para atestado, declaração e laudo (o formulário estruturado usa o da clínica no lugar
// do padrão do sistema). A clínica vem SEMPRE da sessão. Só grava o que a pessoa revisou e confirmou na tela; o
// servidor valida de novo: campos só do catálogo permitido ao tipo, sem HTML, sem marcador solto, tamanho limitado.

function falhaResponse(r: ModeloFalha): NextResponse {
  return NextResponse.json({ error: MENSAGEM_MODELO_FALHA[r.motivo], motivo: r.motivo }, { status: r.motivo === 'sem_tabela' ? 503 : 500 })
}

export async function GET(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', false)
  if (ctx instanceof NextResponse) return ctx
  const r = await listarModelos(ctx.clinicId)
  if (!r.ok) return falhaResponse(r)
  return NextResponse.json({ modelos: r.modelos })
}

export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })

  if (!isDocKindImportavel(body.tipo)) return NextResponse.json({ error: 'Escolha o tipo do documento.' }, { status: 400 })
  const kind = body.tipo
  const finalidade = normalizeFinalidade(kind, body.finalidade)
  if (finalidade === undefined) return NextResponse.json({ error: 'Escolha a finalidade do documento.' }, { status: 400 })
  const nome = validarNomeModelo(body.nome)
  if (!nome.ok) return NextResponse.json({ error: nome.erro }, { status: 400 })
  // o revisor humano confirmou: sem isso nada é gravado
  if (body.confirmadoPelaPessoa !== true) {
    return NextResponse.json({ error: 'Confirme que você revisou o texto e os campos.' }, { status: 400 })
  }
  const texto = typeof body.texto === 'string' ? body.texto.replace(/\r\n?/g, '\n').trim() : ''
  const v = validarModeloFinal(texto, { kind, finalidade })
  if (!v.ok) return NextResponse.json({ error: v.erros[0], erros: v.erros }, { status: 400 })

  const key = chaveDoModelo(kind, finalidade)
  const r = await salvarModelo(ctx.clinicId, ctx.userId, { key, name: nome.nome, body: texto, source: body.origem === 'manual' ? 'manual' : 'foto_ia' })
  if (!r.ok) return falhaResponse(r)
  await recordEscribaUsage({
    action: 'documentos.modelo_salvo', clinicId: ctx.clinicId, userId: ctx.userId, req,
    details: { chave: key, origem: r.modelo.source, chars: texto.length },
  })
  return NextResponse.json({ modelo: r.modelo })
}

/** Volta ao modelo padrão do sistema para o tipo/finalidade (?tipo=atestado&finalidade=afastamento). */
export async function DELETE(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx
  const sp = new URL(req.url).searchParams
  const tipo = sp.get('tipo')
  if (!isDocKindImportavel(tipo)) return NextResponse.json({ error: 'Escolha o tipo do documento.' }, { status: 400 })
  const finalidade = normalizeFinalidade(tipo, sp.get('finalidade'))
  if (finalidade === undefined) return NextResponse.json({ error: 'Escolha a finalidade do documento.' }, { status: 400 })
  const key = chaveDoModelo(tipo, finalidade)
  const r = await removerModelo(ctx.clinicId, key)
  if (!r.ok) return falhaResponse(r)
  await recordEscribaUsage({ action: 'documentos.modelo_removido', clinicId: ctx.clinicId, userId: ctx.userId, req, details: { chave: key } })
  return NextResponse.json({ ok: true })
}
