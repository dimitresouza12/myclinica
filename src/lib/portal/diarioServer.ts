// Diário alimentar na página pública do paciente (escopo 'diario'). SÓ NO SERVIDOR.
//
// Usa o cliente de serviço porque a página pública não tem sessão. Por isso TODA consulta é escopada à clínica e ao
// paciente da linha do link, e nada confia em id vindo do corpo sem conferir os dois. A foto é conferida pelos
// primeiros bytes (JPEG, PNG ou WebP) e vai para o bucket privado `pacientes`, na pasta diario/<clínica>/<paciente>/.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { motivoDoErro } from '@/lib/nutri/erros'
import { hojeBrasil } from '@/lib/brasilDate'
import { somarDias } from '@/lib/vet/datas'
import {
  BUCKET_DIARIO, LIMITES_DIARIO, caminhoDaFotoDiario, detectarImagem, fotoDoDiarioValida, shapeDiario, validarRegistroDiario,
  type DiarioPublico, type LinhaDiarioPublica, type RegistroPublico,
} from '@/lib/nutri/diario'
import { hasScope } from './scopes'
import type { PortalLinkRow } from './server'

const DIAS_NA_PAGINA = 14
const VALIDADE_FOTO_SEG = 3600
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MSG_LIMITE_DIA = 'Você chegou ao limite de registros deste dia.'
const COLUNAS = 'id, dia, refeicao, horario, descricao, foto_path, created_at'

type ErroBanco = { code?: string; message?: string } | null | undefined

function logar(e: ErroBanco, rota: string) {
  if (motivoDoErro(e) !== 'sem_tabela') console.error(`[portal:${rota}]`, e?.code ?? '', e?.message ?? '')
}

export type DiarioFalha = { ok: false; status: 400 | 404 | 413 | 429 | 500 | 503; error: string }
const ERRO_GENERICO: DiarioFalha = { ok: false, status: 500, error: 'Não foi possível salvar agora. Tente de novo.' }

function falhaDoBanco(e: ErroBanco, rota: string): DiarioFalha {
  logar(e, rota)
  if (motivoDoErro(e) === 'sem_tabela') return { ok: false, status: 503, error: 'O diário alimentar ainda não está ativo. Fale com a clínica.' }
  return ERRO_GENERICO
}

async function assinar(caminhos: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(caminhos)]
  if (unicos.length === 0) return mapa
  const { data, error } = await getAdminClient().storage.from(BUCKET_DIARIO).createSignedUrls(unicos, VALIDADE_FOTO_SEG)
  if (error) console.error('[portal:diario-fotos]', error.message)
  for (const s of data ?? []) if (s.path && s.signedUrl) mapa.set(s.path, s.signedUrl)
  return mapa
}

/** Registros dos últimos dias do paciente do link. Tabela ausente ou erro: lista vazia (a página mostra o formulário). */
export async function loadDiario(link: PortalLinkRow, now: Date): Promise<DiarioPublico> {
  const hoje = hojeBrasil(now)
  const vazio: DiarioPublico = { today: hoje, entries: [] }
  const desde = somarDias(hoje, -(DIAS_NA_PAGINA - 1)) ?? hoje
  const { data, error } = await getAdminClient().from('nutri_diario').select(COLUNAS)
    .eq('clinic_id', link.clinic_id).eq('patient_id', link.patient_id).gte('dia', desde)
    .order('dia', { ascending: false }).order('created_at', { ascending: false }).limit(100)
  if (error) { logar(error, 'page-diario'); return vazio }
  const linhas = (data ?? []) as LinhaDiarioPublica[]
  // só caminhos da pasta da própria clínica e do próprio paciente são assinados
  const caminhos = linhas.map(l => l.foto_path).filter((p): p is string => fotoDoDiarioValida(p, link.clinic_id, link.patient_id))
  return shapeDiario({ linhas, imagens: await assinar(caminhos), hoje })
}

export interface RegistroEnviado { refeicao: unknown; horario: unknown; descricao: unknown; dia: unknown }

export type RegistrarResult = { ok: true; entry: RegistroPublico } | DiarioFalha

/** O paciente registra uma refeição (hoje ou ontem), com foto opcional. */
export async function registrarDiario(link: PortalLinkRow, input: RegistroEnviado, foto: File | null, now = new Date()): Promise<RegistrarResult> {
  if (!hasScope(link.scopes, 'diario')) return { ok: false, status: 404, error: 'Diário não disponível.' }
  const hoje = hojeBrasil(now)
  const v = validarRegistroDiario(input, hoje)
  if (!v.ok) return { ok: false, status: 400, error: v.erro }

  let mime: ReturnType<typeof detectarImagem> = null
  if (foto) {
    if (foto.size <= 0) return { ok: false, status: 400, error: 'A foto está vazia.' }
    if (foto.size > LIMITES_DIARIO.fotoBytes) return { ok: false, status: 413, error: 'A foto é grande demais. Escolha uma menor.' }
    mime = detectarImagem(new Uint8Array(await foto.slice(0, 16).arrayBuffer()))
    if (!mime) return { ok: false, status: 400, error: 'A foto precisa ser JPEG, PNG ou WebP.' }
  }

  const db = getAdminClient()
  const { count, error: cErr } = await db.from('nutri_diario').select('id', { count: 'exact', head: true })
    .eq('clinic_id', link.clinic_id).eq('patient_id', link.patient_id).eq('dia', v.dados.dia)
  if (cErr) return falhaDoBanco(cErr, 'diario-count')
  // checagem rápida (evita subir a foto à toa); quem garante o limite é o gatilho do banco, que não perde corrida
  if ((count ?? 0) >= LIMITES_DIARIO.porDia) return { ok: false, status: 429, error: MSG_LIMITE_DIA }

  let fotoPath: string | null = null
  if (foto && mime) {
    fotoPath = caminhoDaFotoDiario(link.clinic_id, link.patient_id, mime)
    const { error: uErr } = await db.storage.from(BUCKET_DIARIO).upload(fotoPath, Buffer.from(await foto.arrayBuffer()), { contentType: mime, upsert: false })
    if (uErr) { console.error('[portal:diario-upload]', uErr.message); return { ok: false, status: 500, error: 'Não foi possível enviar a foto. Tente de novo.' } }
  }

  const { data: row, error: iErr } = await db.from('nutri_diario').insert({
    clinic_id: link.clinic_id, patient_id: link.patient_id, dia: v.dados.dia, refeicao: v.dados.refeicao,
    horario: v.dados.horario, descricao: v.dados.descricao, foto_path: fotoPath,
  }).select(COLUNAS).single()
  if (iErr || !row) {
    // sem a linha, a foto ficaria sem dono: apaga (melhor esforço)
    if (fotoPath) await db.storage.from(BUCKET_DIARIO).remove([fotoPath]).catch(() => undefined)
    // limite diário atômico: o gatilho nutri_diario_limite_dia (20261137) recusa a linha 21 mesmo com envios simultâneos
    if (iErr && (iErr.message ?? '').includes('limite_diario')) return { ok: false, status: 429, error: MSG_LIMITE_DIA }
    return falhaDoBanco(iErr, 'diario-insert')
  }
  const linha = row as LinhaDiarioPublica
  const out = shapeDiario({ linhas: [linha], imagens: await assinar(fotoPath ? [fotoPath] : []), hoje })
  return { ok: true, entry: out.entries[0] }
}

export type ApagarResult = { ok: true } | DiarioFalha

/** O paciente apaga um registro dele, só de hoje ou de ontem. */
export async function apagarRegistroDiario(link: PortalLinkRow, id: unknown, now = new Date()): Promise<ApagarResult> {
  if (!hasScope(link.scopes, 'diario')) return { ok: false, status: 404, error: 'Diário não disponível.' }
  if (typeof id !== 'string' || !UUID_RE.test(id)) return { ok: false, status: 400, error: 'Envio inválido.' }
  const db = getAdminClient()
  const { data: row, error } = await db.from('nutri_diario').select('id, dia, foto_path')
    .eq('id', id).eq('clinic_id', link.clinic_id).eq('patient_id', link.patient_id).maybeSingle()
  if (error) return falhaDoBanco(error, 'diario-apagar-busca')
  if (!row) return { ok: false, status: 404, error: 'Registro não encontrado.' }
  const hoje = hojeBrasil(now)
  if (row.dia !== hoje && row.dia !== somarDias(hoje, -1)) return { ok: false, status: 400, error: 'Só é possível apagar registros de hoje ou de ontem.' }
  const { error: dErr } = await db.from('nutri_diario').delete().eq('id', id).eq('clinic_id', link.clinic_id).eq('patient_id', link.patient_id)
  if (dErr) return falhaDoBanco(dErr, 'diario-apagar')
  const foto = row.foto_path as string | null
  if (fotoDoDiarioValida(foto, link.clinic_id, link.patient_id)) await db.storage.from(BUCKET_DIARIO).remove([foto]).catch(() => undefined)
  return { ok: true }
}
