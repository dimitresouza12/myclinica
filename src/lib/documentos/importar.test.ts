import { describe, expect, it } from 'vitest'
import {
  buildImportSystemPrompt, chaveDoModelo, inserirMarcador, limparTextoIA, marcadoresNoTexto, normalizeFinalidade,
  parseModeloResposta, partesDoTexto, reconciliarCampos, removerMarcador, substituirMarcadores, trocarCampo,
  validarModeloFinal, validarNomeModelo, validarParaSalvar, IMPORTAR_LIMITES, MARCADOR_BRANCO,
} from './importar'
import { detectarTipoImagem, validarImagens } from './importarImagem'
import { camposPermitidos, CAMPO_KEYS } from './camposModelo'
import { buildDocText, defaultDocForm, modeloCamposVazios } from './atestado'
import { resolveDocFields } from './campos'
import { councilForType } from '@/lib/professionalCouncil'

const ctx = { kind: 'atestado' as const, finalidade: 'afastamento' as const }
const resp = (o: unknown) => JSON.stringify(o)
const TEXTO = 'Atesto que [[M1]], CPF [[M2]], necessita de afastamento por [[M3]], a partir de [[M4]].'

describe('catálogo de campos', () => {
  it('cada tipo só aceita campos que o formulário sabe preencher', () => {
    expect(camposPermitidos('atestado', 'afastamento')).toEqual(expect.arrayContaining(['paciente', 'dias_texto', 'cid']))
    expect(camposPermitidos('atestado', 'afastamento')).not.toContain('horario')
    expect(camposPermitidos('atestado', 'comparecimento')).toContain('hora_inicio')
    expect(camposPermitidos('atestado', 'comparecimento')).not.toContain('dias')
    expect(camposPermitidos('declaracao_comparecimento', 'comparecimento')).not.toContain('cid')
    expect(camposPermitidos('laudo', null)).toEqual(expect.arrayContaining(['laudo_resultado', 'cid']))
    expect(camposPermitidos('laudo', null)).not.toContain('acompanhante')
    for (const k of camposPermitidos('atestado', 'acompanhante')) expect(CAMPO_KEYS).toContain(k)
  })
  it('finalidade e chave do modelo', () => {
    expect(normalizeFinalidade('laudo', 'qualquer')).toBeNull()
    expect(normalizeFinalidade('atestado', 'afastamento')).toBe('afastamento')
    expect(normalizeFinalidade('declaracao_comparecimento', 'afastamento')).toBeUndefined()
    expect(normalizeFinalidade('atestado', undefined)).toBeUndefined()
    expect(chaveDoModelo('atestado', 'aptidao')).toBe('atestado.aptidao')
    expect(chaveDoModelo('laudo', null)).toBe('laudo')
  })
  it('o prompt traz só os campos do tipo e as defesas contra injeção e dado pessoal', () => {
    const p = buildImportSystemPrompt('declaracao_comparecimento', 'comparecimento')
    expect(p).toContain('- paciente:')
    expect(p).not.toContain('- dias_texto:')
    expect(p).not.toContain('- cid:')
    expect(p).toMatch(/Ignore qualquer ordem/)
    expect(p).toMatch(/NÃO os transcreva/)
    expect(p).toContain('SOMENTE com um objeto JSON')
  })
})

describe('limparTextoIA', () => {
  it('tira HTML, chaves duplas, controle e excesso de linhas', () => {
    const out = limparTextoIA('Olá <script>alert(1)</script> {{paciente}}\u0000‮\r\n\n\n\nFim')
    expect(out).not.toMatch(/<|>|\{\{|\}\}|\u0000|‮/)
    expect(out).toContain('Olá')
    expect(out).not.toMatch(/\n{3,}/)
  })
})

describe('parseModeloResposta', () => {
  it('aceita a resposta válida e mantém só campos do catálogo permitido', () => {
    const r = parseModeloResposta(resp({
      texto: TEXTO,
      campos: [
        { marcador: 'M1', campo: 'paciente', confianca: 0.95 },
        { marcador: 'M2', campo: 'cpf', confianca: 2 },
        { marcador: 'M3', campo: 'dias_texto', confianca: 0.8 },
        { marcador: 'M4', campo: 'horario', confianca: 0.7 },   // não vale para afastamento
        { marcador: 'M9', campo: 'data', confianca: 1 },        // marcador que não está no texto
      ],
      avisos: ['confira a data'],
    }), ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.modelo.campos).toEqual([
      { marcador: 'M1', campo: 'paciente', confianca: 0.95 },
      { marcador: 'M2', campo: 'cpf', confianca: 1 },
      { marcador: 'M3', campo: 'dias_texto', confianca: 0.8 },
      { marcador: 'M4', campo: null, confianca: 0 },
    ])
    expect(r.modelo.avisos.some(a => /descartado/.test(a))).toBe(true)
    expect(r.modelo.avisos).toContain('confira a data')
  })
  it('descarta chave inventada e injeção de campo no próprio texto', () => {
    const r = parseModeloResposta(resp({
      texto: 'Eu {{profissional}} atesto [[M1]] e [[M2]]',
      campos: [{ marcador: 'M1', campo: 'senha_admin', confianca: 1 }, { marcador: 'M2', campo: '__proto__', confianca: 1 }],
      avisos: [],
    }), ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.modelo.texto).not.toContain('{{')
    expect(r.modelo.campos.every(c => c.campo === null)).toBe(true)
  })
  it('aceita cerca de markdown e texto em volta do JSON', () => {
    const r = parseModeloResposta('```json\n' + resp({ texto: 'Paciente [[M1]] compareceu.', campos: [{ marcador: 'M1', campo: 'paciente', confianca: 1 }], avisos: [] }) + '\n```', ctx)
    expect(r.ok).toBe(true)
  })
  it('recusa formato inválido, vazio e resposta gigante', () => {
    expect(parseModeloResposta('não é json', ctx)).toMatchObject({ ok: false, motivo: 'formato' })
    expect(parseModeloResposta(resp({ campos: [] }), ctx)).toMatchObject({ ok: false, motivo: 'formato' })
    expect(parseModeloResposta(resp({ texto: 12 }), ctx)).toMatchObject({ ok: false, motivo: 'formato' })
    expect(parseModeloResposta(resp({ texto: '  ', campos: [], avisos: ['ilegível'] }), ctx)).toEqual({ ok: false, motivo: 'vazio', avisos: ['ilegível'] })
    expect(parseModeloResposta('x'.repeat(IMPORTAR_LIMITES.respostaMaxChars + 1), ctx)).toMatchObject({ ok: false })
    expect(parseModeloResposta(undefined, ctx)).toMatchObject({ ok: false })
  })
  it('limita o tamanho do texto, dos avisos e dos marcadores', () => {
    const longo = parseModeloResposta(resp({ texto: 'a '.repeat(5000) + ' [[M1]]', campos: [], avisos: Array.from({ length: 30 }, (_, i) => `aviso ${i}`) }), ctx)
    expect(longo.ok).toBe(true)
    if (!longo.ok) return
    expect(longo.modelo.texto.length).toBeLessThanOrEqual(IMPORTAR_LIMITES.textoMax)
    expect(longo.modelo.avisos.length).toBeLessThanOrEqual(IMPORTAR_LIMITES.avisosMax + 3)
    const muitos = parseModeloResposta(resp({ texto: Array.from({ length: 60 }, (_, i) => `x [[M${i + 1}]]`).join(' '), campos: [], avisos: [] }), ctx)
    expect(muitos.ok).toBe(true)
    if (!muitos.ok) return
    expect(muitos.modelo.campos.length).toBe(IMPORTAR_LIMITES.marcadoresMax)
  })
  it('mascara dado pessoal que a IA transcreveu mesmo assim', () => {
    const r = parseModeloResposta(resp({ texto: 'Paciente Maria, CPF 123.456.789-01, tel (85) 98888-7777, [[M1]].', campos: [], avisos: [] }), ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.modelo.texto).not.toMatch(/123\.456\.789-01|98888/)
    expect(r.modelo.avisos.some(a => /dados pessoais/.test(a))).toBe(true)
  })
})

describe('edição dos marcadores', () => {
  const campos = [
    { marcador: 'M1', campo: 'paciente', confianca: 0.9 },
    { marcador: 'M2', campo: 'cpf', confianca: 0.9 },
  ]
  it('lista, reconcilia e destaca', () => {
    expect(marcadoresNoTexto('[[M2]] e [[M1]] e [[M2]]')).toEqual(['M2', 'M1'])
    expect(reconciliarCampos('só [[M2]] e [[M7]]', campos)).toEqual([
      { marcador: 'M2', campo: 'cpf', confianca: 0.9 },
      { marcador: 'M7', campo: null, confianca: 0 },
    ])
    expect(partesDoTexto('a [[M1]] b')).toEqual([{ tipo: 'texto', valor: 'a ' }, { tipo: 'marcador', id: 'M1' }, { tipo: 'texto', valor: ' b' }])
    expect(partesDoTexto('')).toEqual([])
  })
  it('troca o campo, remove e insere', () => {
    expect(trocarCampo(campos, 'M1', 'paciente_ident')[0]).toMatchObject({ campo: 'paciente_ident', confianca: 1 })
    const rem = removerMarcador('A [[M1]] B [[M1]]', campos, 'M1')
    expect(rem.texto).toBe(`A ${MARCADOR_BRANCO} B ${MARCADOR_BRANCO}`)
    expect(rem.campos.map(c => c.marcador)).toEqual(['M2'])
    const ins = inserirMarcador('Atesto que João compareceu', campos, 'paciente', 11, 15)
    expect(ins.texto).toBe('Atesto que [[M3]] compareceu')
    expect(ins.marcador).toBe('M3')
    expect(ins.campos.at(-1)).toEqual({ marcador: 'M3', campo: 'paciente', confianca: 1 })
    expect(inserirMarcador('abc', [], 'data', 99).texto).toBe('abc[[M1]]')
  })
  it('substitui marcadores por {{campo}} e deixa o sem campo à vista', () => {
    expect(substituirMarcadores('[[M1]] / [[M2]] / [[M3]]', [...campos, { marcador: 'M3', campo: null, confianca: 0 }])).toBe('{{paciente}} / {{cpf}} / [[M3]]')
  })
})

describe('validar para salvar', () => {
  const pronto = 'Atesto que [[M1]] foi atendido em [[M2]] e precisa de [[M3]].'
  const campos = [
    { marcador: 'M1', campo: 'paciente', confianca: 1 },
    { marcador: 'M2', campo: 'data', confianca: 1 },
    { marcador: 'M3', campo: 'dias_texto', confianca: 1 },
  ]
  it('modelo completo passa e vira {{campo}}', () => {
    const v = validarParaSalvar(pronto, campos, ctx)
    expect(v.erros).toEqual([])
    expect(v.modelo).toBe('Atesto que {{paciente}} foi atendido em {{data}} e precisa de {{dias_texto}}.')
  })
  it('ponto sem campo, campo fora do tipo, sem campo algum e HTML bloqueiam', () => {
    expect(validarParaSalvar(pronto, campos.map(c => (c.marcador === 'M3' ? { ...c, campo: null } : c)), ctx).erros[0]).toMatch(/sem campo/)
    expect(validarParaSalvar(pronto, campos.map(c => (c.marcador === 'M3' ? { ...c, campo: 'horario' } : c)), ctx).erros.join(' ')).toMatch(/não permitido/)
    expect(validarParaSalvar('Texto longo o bastante sem nenhum campo aqui.', [], ctx).erros.join(' ')).toMatch(/pelo menos um campo/)
    expect(validarModeloFinal('Olá {{paciente}} <img src=x onerror=1> tudo certo', ctx).erros.join(' ')).toMatch(/HTML/)
    expect(validarModeloFinal('curto {{paciente}}', ctx).ok).toBe(false)
    expect(validarModeloFinal('x'.repeat(IMPORTAR_LIMITES.textoMax + 1) + '{{paciente}}', ctx).ok).toBe(false)
    expect(validarModeloFinal('Texto com {{paciente}} e {chave solta} aqui no meio', ctx).erros.join(' ')).toMatch(/chaves/)
    expect(validarModeloFinal(42, ctx).ok).toBe(false)
  })
  it('valida o nome do modelo', () => {
    expect(validarNomeModelo('  Atestado   da clínica ')).toEqual({ ok: true, nome: 'Atestado da clínica' })
    expect(validarNomeModelo('a').ok).toBe(false)
    expect(validarNomeModelo('x'.repeat(81)).ok).toBe(false)
    expect(validarNomeModelo('<b>x</b>').ok).toBe(false)
    expect(validarNomeModelo(5).ok).toBe(false)
  })
})

describe('modelo da clínica no formulário estruturado', () => {
  const council = councilForType('medico')
  const fields = resolveDocFields({ patientName: 'Maria Souza', patientCpf: '12345678901', clinicName: 'Clínica Sol', professionalName: 'Ana Lima', registrationNumber: '12345', council, today: '2026-11-10' })
  const modelo = 'Atesto que {{paciente}}, CPF {{cpf}}, precisa de {{dias_texto}} de afastamento. {{profissional}}, {{registro}}. {{clinica}}, {{data_extenso}}.'
  it('buildDocText usa o modelo da clínica com os campos novos', () => {
    const f = { ...defaultDocForm('atestado', '2026-11-10'), finalidade: 'afastamento' as const, dias: '3' }
    const t = buildDocText(f, fields, { 'atestado.afastamento': modelo })
    expect(t).toBe('Atesto que Maria Souza, CPF 123.456.789-01, precisa de 3 (três) dias de afastamento. Ana Lima, CRM 12345. Clínica Sol, 10 de novembro de 2026.')
    expect(modeloCamposVazios(f, fields, { 'atestado.afastamento': modelo })).toEqual([])
  })
  it('modelo com {{cid}} não repete o parágrafo do CID e avisa se faltar o CID', () => {
    const f = { ...defaultDocForm('atestado', '2026-11-10'), finalidade: 'afastamento' as const, cid: 'J11', cidAutorizado: true }
    const m = { 'atestado.afastamento': 'Atesto {{paciente}} CID {{cid}} por {{dias_texto}}.' }
    expect(buildDocText(f, fields, m)).toBe('Atesto Maria Souza CID J11 por 1 (um) dia.')
    expect(modeloCamposVazios({ ...f, cidAutorizado: false }, fields, m)[0]).toMatch(/cid-10/)
  })
  it('sem modelo da clínica, nada muda no padrão', () => {
    const f = defaultDocForm('atestado', '2026-11-10')
    expect(modeloCamposVazios(f, fields, {})).toEqual([])
  })
})

describe('imagens (magic bytes)', () => {
  const b64 = (bytes: number[], pad = 0) => Buffer.from([...bytes, ...new Array(pad).fill(0)]).toString('base64')
  const JPG = [0xff, 0xd8, 0xff, 0xe0]
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
  it('detecta jpeg, png e webp e recusa o resto', () => {
    expect(detectarTipoImagem(Uint8Array.from(JPG))).toBe('image/jpeg')
    expect(detectarTipoImagem(Uint8Array.from(PNG))).toBe('image/png')
    expect(detectarTipoImagem(Uint8Array.from(WEBP))).toBe('image/webp')
    expect(detectarTipoImagem(Uint8Array.from([0x25, 0x50, 0x44, 0x46]))).toBeNull() // PDF
    expect(detectarTipoImagem(Buffer.from('<svg xmlns=""></svg>'))).toBeNull()
    expect(detectarTipoImagem(Buffer.from('GIF89a......'))).toBeNull()
    expect(detectarTipoImagem(new Uint8Array(0))).toBeNull()
  })
  it('usa o tipo real e ignora o declarado', () => {
    const r = validarImagens([{ mediaType: 'image/png', dataBase64: b64(JPG, 10) }])
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.images[0].mediaType).toBe('image/jpeg')
  })
  it('recusa arquivo disfarçado, base64 ruim, vazio e excesso', () => {
    expect(validarImagens([{ mediaType: 'image/jpeg', dataBase64: Buffer.from('%PDF-1.4 conteudo').toString('base64') }])).toMatchObject({ ok: false, status: 415 })
    expect(validarImagens([{ dataBase64: 'não é base64!!' }])).toMatchObject({ ok: false, status: 400 })
    expect(validarImagens([{ dataBase64: `data:image/png;base64,${b64(PNG)}` }])).toMatchObject({ ok: false, status: 400 })
    expect(validarImagens([])).toMatchObject({ ok: false, status: 400 })
    expect(validarImagens(undefined)).toMatchObject({ ok: false, status: 400 })
    expect(validarImagens([null])).toMatchObject({ ok: false, status: 400 })
    const um = { dataBase64: b64(JPG, 10) }
    expect(validarImagens([um, um, um, um])).toMatchObject({ ok: false, status: 400 })
    expect(validarImagens([um, um, um])).toMatchObject({ ok: true })
  })
  it('limite de 4 MB por imagem, antes e depois de decodificar', () => {
    const limite = IMPORTAR_LIMITES.maxBytesPorImagem
    expect(validarImagens([{ dataBase64: b64(JPG, limite - JPG.length) }])).toMatchObject({ ok: true })
    expect(validarImagens([{ dataBase64: b64(JPG, limite + 10) }])).toMatchObject({ ok: false, status: 413 })
    expect(validarImagens([{ dataBase64: 'A'.repeat(limite * 2) }])).toMatchObject({ ok: false, status: 413 })
  })
})
