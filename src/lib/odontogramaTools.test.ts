import { describe, expect, it } from 'vitest'
import {
  cleanRoots, emptyTooth, hasExtra, isEmptyTooth, plannedMarks, readOdontogram, serializeOdontogram, toothMarks, budgetDescription,
  withPlanned, ALL_TEETH, type ToothData,
} from './odontograma'
import {
  TOOL_BY_KEY, applyTool, clearToothConditions, parseZoneToken, toggleWhole, pendingHistoryEntries, statusNoun, toothAlterations, toothChanged, zoneLabel, zoneToken, type Zone,
} from './odontogramaTools'

const face = (f: 'v' | 'l' | 'm' | 'd' | 'o'): Zone => ({ kind: 'face', face: f })
const crown: Zone = { kind: 'crown' }
const root = (r: number): Zone => ({ kind: 'root', root: r })
const t = (k: keyof typeof TOOL_BY_KEY) => TOOL_BY_KEY[k]

describe('cárie e restauração', () => {
  it('pinta a face clicada na vista oclusal e desmarca ao clicar de novo', () => {
    const a = applyTool(emptyTooth(), t('carie'), face('m'), 36, false)
    expect(a.surfaces.m).toBe('cariado')
    expect(a.status).toBe('higido')
    expect(applyTool(a, t('carie'), face('m'), 36, false).surfaces.m).toBe('higido')
  })
  it('a coroa da vista frontal é a face vestibular', () => {
    expect(applyTool(emptyTooth(), t('restauracao'), crown, 11, false).surfaces.v).toBe('restaurado')
  })
  it('clicar na raiz marca o dente inteiro', () => {
    expect(applyTool(emptyTooth(), t('carie'), root(0), 11, false).status).toBe('cariado')
  })
  it('trocar a condição da face substitui a anterior', () => {
    const a = applyTool(emptyTooth(), t('carie'), face('o'), 16, false)
    expect(applyTool(a, t('restauracao'), face('o'), 16, false).surfaces.o).toBe('restaurado')
  })
  it('"a realizar" marca só o que foi criado e some quando a marca sai', () => {
    const a = applyTool(emptyTooth(), t('restauracao'), face('d'), 16, true)
    expect(a.planned).toEqual({ d: true })
    const b = applyTool(a, t('restauracao'), face('d'), 16, true)
    expect(b.planned).toBeUndefined()
  })
  it('não altera o dente recebido', () => {
    const d = emptyTooth()
    applyTool(d, t('carie'), face('o'), 16, true)
    expect(d).toEqual(emptyTooth())
  })
})

describe('canal e pino', () => {
  it('clicar na coroa trata todas as raízes (molar superior: 3) e de novo desfaz', () => {
    const a = applyTool(emptyTooth(), t('canal'), crown, 16, false)
    expect(a.endo).toEqual([0, 1, 2])
    expect(applyTool(a, t('canal'), crown, 16, false).endo).toBeUndefined()
  })
  it('molar inferior tem 2 raízes e dente de uma raiz, 1', () => {
    expect(applyTool(emptyTooth(), t('canal'), crown, 36, false).endo).toEqual([0, 1])
    expect(applyTool(emptyTooth(), t('canal'), crown, 11, false).endo).toEqual([0])
  })
  it('clicar numa raiz trata só ela', () => {
    let d = applyTool(emptyTooth(), t('canal'), root(2), 26, false)
    expect(d.endo).toEqual([2])
    d = applyTool(d, t('canal'), root(0), 26, false)
    expect(d.endo).toEqual([0, 2])
    d = applyTool(d, t('canal'), root(2), 26, false)
    expect(d.endo).toEqual([0])
  })
  it('pino pela coroa vai na raiz principal (palatina no molar superior)', () => {
    expect(applyTool(emptyTooth(), t('pino'), crown, 16, false).pin).toEqual([1])
    expect(applyTool(emptyTooth(), t('pino'), crown, 36, false).pin).toEqual([0])
    expect(applyTool(emptyTooth(), t('pino'), root(2), 16, false).pin).toEqual([2])
  })
  it('canal e pino convivem com a condição do dente e com as faces', () => {
    let d = applyTool(emptyTooth(), t('coroa'), crown, 16, false)
    d = applyTool(d, t('canal'), crown, 16, false)
    d = applyTool(d, t('pino'), crown, 16, false)
    d = applyTool(d, t('carie'), face('o'), 16, false)
    expect(d.status).toBe('coroa')
    expect(d.endo).toEqual([0, 1, 2])
    expect(d.pin).toEqual([1])
    expect(d.surfaces.o).toBe('cariado')
    expect(toothAlterations(d)).toEqual(['coroa', 'cariado', 'endodontia', 'pino'])
  })
  it('dente ausente não recebe canal, pino nem aparelho', () => {
    const a = applyTool(emptyTooth(), t('ausente'), crown, 16, false)
    expect(applyTool(a, t('canal'), crown, 16, false)).toBe(a)
    expect(applyTool(a, t('pino'), crown, 16, false)).toBe(a)
    expect(applyTool(a, t('aparelho'), crown, 16, false)).toBe(a)
  })
  it('canal a realizar entra no plano', () => {
    const d = applyTool(emptyTooth(), t('canal'), crown, 46, true)
    expect(d.planned).toEqual({ endo: true })
    const marks = plannedMarks({ 46: d })
    expect(marks).toEqual([{ tooth: 46, key: 'endo', status: 'endodontia', planned: true }])
    expect(budgetDescription(marks[0])).toBe('Tratamento de canal no dente 46')
  })
})

describe('aparelho, coroa e ausente', () => {
  it('liga e desliga o braquete', () => {
    const a = applyTool(emptyTooth(), t('aparelho'), crown, 11, false)
    expect(a.bracket).toBe(true)
    expect(hasExtra(a, 'bracket')).toBe(true)
    expect('bracket' in applyTool(a, t('aparelho'), face('o'), 11, false)).toBe(false)
  })
  it('coroa e ausente valem para o dente inteiro, onde quer que se clique', () => {
    expect(applyTool(emptyTooth(), t('coroa'), face('d'), 14, false).status).toBe('coroa')
    expect(applyTool(emptyTooth(), t('ausente'), root(1), 16, false).status).toBe('ausente')
    expect(applyTool(applyTool(emptyTooth(), t('ausente'), crown, 16, false), t('ausente'), crown, 16, false).status).toBe('higido')
  })
  it('marcar ausente leva embora canal, pino, aparelho e o "a realizar" deles', () => {
    let d = applyTool(emptyTooth(), t('canal'), crown, 16, true)
    d = applyTool(d, t('pino'), root(0), 16, true)
    d = applyTool(d, t('aparelho'), crown, 16, true)
    d = applyTool(d, t('restauracao'), face('o'), 16, true)
    expect(hasExtra(d, 'endo') && hasExtra(d, 'pin') && hasExtra(d, 'bracket')).toBe(true)
    const viaTool = applyTool(d, t('ausente'), crown, 16, false)
    const viaModal = toggleWhole(d, 'ausente', false)
    for (const a of [viaTool, viaModal]) {
      expect(a.status).toBe('ausente')
      expect(['endo', 'pin', 'bracket'].some(k => k in a)).toBe(false)
      expect(a.planned).toEqual({ o: true })
      expect(toothMarks(16, a).map(m => m.key)).toEqual(['all', 'o'])
    }
    expect(viaTool.surfaces.o).toBe('restaurado')
  })
  it('outras condições do dente inteiro mantêm os extras', () => {
    const d = applyTool(emptyTooth(), t('canal'), crown, 16, false)
    expect(applyTool(d, t('coroa'), crown, 16, false).endo).toEqual([0, 1, 2])
  })
  it('Hígido no modal limpa condição e faces, mas guarda os extras e o plano deles', () => {
    let d = applyTool(emptyTooth(), t('canal'), crown, 16, true)
    d = applyTool(d, t('aparelho'), crown, 16, false)
    d = applyTool(d, t('carie'), face('m'), 16, true)
    d = applyTool(d, t('coroa'), crown, 16, true)
    const h = clearToothConditions(d)
    expect(h.status).toBe('higido')
    expect(Object.values(h.surfaces).every(s => s === 'higido')).toBe(true)
    expect(h.endo).toEqual([0, 1, 2])
    expect(h.bracket).toBe(true)
    expect(h.planned).toEqual({ endo: true })
    expect(clearToothConditions(emptyTooth()).planned).toBeUndefined()
  })
  it('selecionar não muda nada', () => {
    const d = emptyTooth()
    expect(applyTool(d, t('select'), crown, 16, false)).toBe(d)
  })
})

describe('limpar', () => {
  const full = (): ToothData => ({
    status: 'coroa', surfaces: { v: 'cariado', l: 'higido', m: 'restaurado', d: 'higido', o: 'cariado' },
    endo: [0, 1, 2], pin: [1], bracket: true, planned: { o: true, endo: true, pin: true },
  })
  it('na face apaga só a face', () => {
    const d = applyTool(full(), t('limpar'), face('o'), 16, false)
    expect(d.surfaces.o).toBe('higido')
    expect(d.planned).toEqual({ endo: true, pin: true })
    expect(d.surfaces.m).toBe('restaurado')
    expect(d.endo).toEqual([0, 1, 2])
  })
  it('na raiz apaga canal e pino dela', () => {
    const d = applyTool(full(), t('limpar'), root(1), 16, false)
    expect(d.endo).toEqual([0, 2])
    expect(d.pin).toBeUndefined()
    expect(d.planned).toEqual({ o: true, endo: true })
  })
  it('na coroa apaga a condição do dente, a face vestibular e o braquete', () => {
    const d = applyTool(full(), t('limpar'), crown, 16, false)
    expect(d.status).toBe('higido')
    expect(d.surfaces.v).toBe('higido')
    expect(d.bracket).toBeUndefined()
    expect(d.surfaces.m).toBe('restaurado')
    expect(d.endo).toEqual([0, 1, 2])
  })
})

describe('dados salvos, retrocompatibilidade', () => {
  const old = {
    16: { status: 'cariado', surfaces: { o: 'cariado' }, note: 'sensível', planned: { all: true } },
    26: 'ausente',
    _history: [],
  }
  it('dado antigo (sem canal, pino ou braquete) volta idêntico ao ser gravado', () => {
    const out = serializeOdontogram(readOdontogram(old), [])
    expect(JSON.parse(JSON.stringify(out[16]))).toEqual({ status: 'cariado', surfaces: { v: 'higido', l: 'higido', m: 'higido', d: 'higido', o: 'cariado' }, note: 'sensível', planned: { all: true } })
    expect(Object.keys(out).sort()).toEqual([...ALL_TEETH.map(String), '_history'].sort())
  })
  it('grava e lê de volta canal, pino e braquete, também nos decíduos', () => {
    const t0 = readOdontogram({})
    t0[16] = { ...emptyTooth(), endo: [0, 2], pin: [1] }
    t0[52] = { ...emptyTooth(), bracket: true }
    const out = serializeOdontogram(t0, [])
    expect(out[52]).toBeDefined()
    const back = readOdontogram(JSON.parse(JSON.stringify(out)))
    expect(back[16].endo).toEqual([0, 2])
    expect(back[16].pin).toEqual([1])
    expect(back[52].bracket).toBe(true)
    expect(back[55]).toEqual(emptyTooth())
  })
  it('dente decíduo só com braquete não é tratado como vazio', () => {
    expect(isEmptyTooth({ ...emptyTooth(), bracket: true })).toBe(false)
    expect(isEmptyTooth({ ...emptyTooth(), endo: [0] })).toBe(false)
    expect(isEmptyTooth({ ...emptyTooth(), endo: [], bracket: false })).toBe(true)
  })
  it('descarta lixo nas raízes e extras vazios ao ler', () => {
    expect(cleanRoots([2, 0, 0, 5, -1, 'x', 1.5])).toEqual([0, 2])
    expect(cleanRoots([])).toBeUndefined()
    expect(cleanRoots('0')).toBeUndefined()
    const back = readOdontogram({ 11: { status: 'higido', surfaces: {}, endo: [], pin: 'x', bracket: false } })
    expect('endo' in back[11]).toBe(false)
    expect('pin' in back[11]).toBe(false)
    expect('bracket' in back[11]).toBe(false)
  })
  it('lista as marcações dos extras junto com as das faces', () => {
    const d = withPlanned({ ...emptyTooth(), status: 'coroa', surfaces: { ...emptyTooth().surfaces, o: 'cariado' }, endo: [0], bracket: true }, 'bracket', true)
    expect(toothMarks(16, d).map(m => `${m.key}:${m.status}:${m.planned}`)).toEqual(['all:coroa:false', 'o:cariado:false', 'endo:endodontia:false', 'bracket:aparelho:true'])
  })
})

describe('alterações não salvas e histórico', () => {
  it('detecta mudança em canal, pino, braquete e plano', () => {
    const a = emptyTooth()
    expect(toothChanged(a, emptyTooth())).toBe(false)
    expect(toothChanged({ ...a, endo: [0] }, a)).toBe(true)
    expect(toothChanged({ ...a, pin: [1] }, a)).toBe(true)
    expect(toothChanged({ ...a, bracket: true }, a)).toBe(true)
    expect(toothChanged({ ...a, planned: { endo: true } }, a)).toBe(true)
    expect(toothChanged({ ...a, endo: [0] }, { ...a, endo: [0] })).toBe(false)
  })
  it('vira linhas de histórico: dente inteiro, faces e tratamentos extras', () => {
    const before = readOdontogram({})
    const now = readOdontogram({})
    now[16] = { ...emptyTooth(), status: 'coroa', surfaces: { ...emptyTooth().surfaces, o: 'cariado' }, endo: [0, 1, 2] }
    now[11] = { ...emptyTooth(), bracket: true, planned: { bracket: true } }
    const rows = pendingHistoryEntries([11, 16, 21], now, before, 'Ana', '2026-11-10T10:00:00Z')
    expect(rows.map(r => [r.tooth, r.face ?? 'all', r.status, !!r.planned])).toEqual([
      [11, 'bracket', 'aparelho', true],
      [16, 'all', 'coroa', false],
      [16, 'o', 'cariado', false],
      [16, 'endo', 'endodontia', false],
    ])
    expect(rows.every(r => r.by === 'Ana')).toBe(true)
  })
  it('tirar um extra registra a remoção', () => {
    const before = readOdontogram({}); before[16] = { ...emptyTooth(), pin: [1] }
    const now = readOdontogram({})
    expect(pendingHistoryEntries([16], now, before, 'Ana', 'x').map(r => [r.face, r.status])).toEqual([['pin', 'higido']])
  })
  it('sem mudança, sem linhas', () => {
    const a = readOdontogram({ 16: { status: 'cariado', surfaces: {} } })
    expect(pendingHistoryEntries(ALL_TEETH, a, a, 'Ana', 'x')).toEqual([])
  })
})

describe('texto para leitor de tela e zonas', () => {
  it('descreve a zona como "Dente 36, face mesial, cárie"', () => {
    const d = applyTool(emptyTooth(), t('carie'), face('m'), 36, false)
    expect(zoneLabel(36, face('m'), d)).toBe('Dente 36, face mesial, cárie')
    expect(zoneLabel(36, face('d'), d)).toBe('Dente 36, face distal, sem alteração')
    expect(zoneLabel(11, face('o'), emptyTooth())).toBe('Dente 11, face incisal, sem alteração')
  })
  it('descreve coroa e raiz com os tratamentos', () => {
    const d: ToothData = { ...emptyTooth(), status: 'coroa', endo: [1], pin: [1], bracket: true }
    expect(zoneLabel(16, crown, d)).toBe('Dente 16, coroa, coroa protética, com braquete')
    expect(zoneLabel(16, root(1), d)).toBe('Dente 16, raiz palatina, canal tratado, pino intrarradicular')
    expect(zoneLabel(16, root(0), d)).toBe('Dente 16, raiz distovestibular')
  })
  it('traduz a condição', () => {
    expect(statusNoun('cariado')).toBe('cárie')
    expect(statusNoun('extracao')).toBe('extração indicada')
  })
  it('ida e volta do texto da zona', () => {
    for (const z of [face('v'), face('o'), crown, root(0), root(2)]) expect(parseZoneToken(zoneToken(z))).toEqual(z)
    expect(parseZoneToken('face:x')).toBeNull()
    expect(parseZoneToken('root:7')).toBeNull()
    expect(parseZoneToken(null)).toBeNull()
  })
})
