// Tamanho do tabuleiro do odontograma e a preferência guardada por usuário. Lógica pura (testada em odontogramaView.test.ts).

/** Passos do zoom: largura de cada coluna (dente) em px. O passo escolhido é também o teto: a página larga não estica os dentes. */
export const COL_STEPS = [40, 52, 64, 80, 96] as const

export const DEFAULT_STEP_DESKTOP = 1
export const DEFAULT_STEP_SMALL = 2

/** Dentição de leite ao lado da permanente (mista) é desenhada um pouco menor, como o recorte da sprite pede. */
export const DECIDUOUS_RATIO = 0.8

export function clampStep(n: number): number {
  return Math.max(0, Math.min(COL_STEPS.length - 1, Math.round(n)))
}

/** Passo guardado no navegador, ou null se o valor não é um passo válido. */
export function parseStoredStep(raw: string | null | undefined): number | null {
  if (raw == null || !/^\d$/.test(raw.trim())) return null
  const n = Number(raw)
  return n >= 0 && n < COL_STEPS.length ? n : null
}

export function defaultStep(small: boolean): number {
  return small ? DEFAULT_STEP_SMALL : DEFAULT_STEP_DESKTOP
}

/**
 * Largura das colunas de uma arcada. Mínimo e máximo coincidem: em tela larga o conjunto fica com tamanho fixo e
 * centralizado; em tela estreita rola para os lados dentro do contêiner.
 */
export function columnWidths(step: number, deciduousBesidePermanent = false): { minCol: number; maxCol: number } {
  const base = COL_STEPS[clampStep(step)]
  const w = deciduousBesidePermanent ? Math.round(base * DECIDUOUS_RATIO) : base
  return { minCol: w, maxCol: w }
}

export const sizeStorageKey = (userId: string | null | undefined) => `myclinica:odontoCol:${userId ?? 'anon'}`

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }
function defaultStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function loadStoredStep(userId: string | null | undefined, storage: StorageLike | null = defaultStorage()): number | null {
  if (!storage) return null
  try { return parseStoredStep(storage.getItem(sizeStorageKey(userId))) } catch { return null }
}

export function saveStoredStep(userId: string | null | undefined, step: number, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  try { storage.setItem(sizeStorageKey(userId), String(clampStep(step))) } catch { /* sem armazenamento: vale só nesta tela */ }
}

// ── Vista ampliada (FacePickerModal) ────────────────────────────

/** Ordem e letra de cada face nos botões da vista ampliada. */
export const FACE_BUTTONS = [
  { face: 'v', letter: 'V' },
  { face: 'l', letter: 'L' },
  { face: 'm', letter: 'M' },
  { face: 'd', letter: 'D' },
  { face: 'o', letter: 'O' },
] as const

/**
 * A vista ampliada abre quando o aparelho é de toque (ponteiro principal grosso, inclusive iPad) e a ferramenta
 * age numa face. Ferramentas de dente inteiro, canal, pino e aparelho continuam com um toque direto.
 */
export function shouldOpenFacePicker(opts: { coarse: boolean; toolMode: string; zoneKind: string }): boolean {
  return opts.coarse && opts.zoneKind === 'face' && (opts.toolMode === 'face' || opts.toolMode === 'limpar')
}
