// Lógica pura do desenho do odontograma: tipo anatômico de cada dente, espelhamento dos quadrantes,
// raízes, rótulos de face e a linha do fio ortodôntico. Os contornos (da foto) ficam em
// components/prontuario/odontograma/shapes.ts; aqui só o que dá para testar sem tela.

import { isDeciduous, isUpperTooth, quadrantOf, type SurfaceKey } from './odontograma'

/** Grupo anatômico. Os decíduos têm grupos próprios (sem pré-molares). */
export type ToothKind = 'ci' | 'li' | 'ca' | 'pm1' | 'pm2' | 'mo1' | 'mo2' | 'mo3' | 'dci' | 'dli' | 'dca' | 'dmo1' | 'dmo2'
export const TOOTH_KINDS: ToothKind[] = ['ci', 'li', 'ca', 'pm1', 'pm2', 'mo1', 'mo2', 'mo3', 'dci', 'dli', 'dca', 'dmo1', 'dmo2']

export function toothKind(n: number): ToothKind {
  const p = n % 10
  if (isDeciduous(n)) return (['dci', 'dli', 'dca', 'dmo1', 'dmo2'] as const)[p - 1] ?? 'dci'
  return (['ci', 'li', 'ca', 'pm1', 'pm2', 'mo1', 'mo2', 'mo3'] as const)[p - 1] ?? 'ci'
}

/** Incisivo ou canino (dente anterior): a face oclusal é chamada de incisal. */
export const isAnterior = (n: number) => ['ci', 'li', 'ca', 'dci', 'dli', 'dca'].includes(toothKind(n))

/**
 * Número de raízes. Superiores: molares com 3 (pré-molar 1 com 2: vestibular e palatina);
 * inferiores: molares com 2. Os demais têm 1.
 */
export function rootCount(kind: ToothKind, upper: boolean): number {
  switch (kind) {
    case 'mo1': case 'mo2': case 'mo3': case 'dmo1': case 'dmo2': return upper ? 3 : 2
    case 'pm1': return upper ? 2 : 1
    default: return 1
  }
}

/** Raiz onde o pino entra: a mais reta e calibrosa (palatina nos superiores, distal nos inferiores). */
export function mainRoot(kind: ToothKind, upper: boolean): number {
  const n = rootCount(kind, upper)
  if (n === 3) return 1
  if (n === 2) return upper ? 1 : 0
  return 0
}

export function rootName(kind: ToothKind, upper: boolean, i: number): string {
  const n = rootCount(kind, upper)
  const names = n === 3 ? ['Distovestibular', 'Palatina', 'Mesiovestibular'] : n === 2 ? (upper ? ['Vestibular', 'Palatina'] : ['Distal', 'Mesial']) : ['Única']
  return names[i] ?? `Raiz ${i + 1}`
}

// ── Espelhamento ────────────────────────────────────────────────
// Cada grupo é desenhado uma vez (a foto da sprite), no quadrante da esquerda da tela (1 e 4, 5 e 8), com o mesial para
// a direita (rumo à linha média) e o vestibular para cima. Os outros quadrantes são o mesmo desenho com scale(-1, 1)
// e, na arcada de baixo, com scale(1, -1).

/** Quadrantes da direita da tela (2, 3, 6, 7): o desenho é espelhado na horizontal. */
export const isMirroredX = (n: number) => [2, 3, 6, 7].includes(quadrantOf(n))
/** Arcada inferior: espelho vertical do desenho da superior. */
export const isFlippedY = (n: number) => !isUpperTooth(n)
/** Lado da tela para onde o mesial aponta (sempre rumo à linha média). */
export const mesialSide = (n: number): 'left' | 'right' => (isMirroredX(n) ? 'left' : 'right')

/**
 * Proporção do desenho de cada grupo na arcada, uniforme (kx = ky) para não deformar a foto. 1 é o tamanho do incisivo
 * central superior na sprite. Incisivos laterais valem 0,88 do central; dentes de baixo e de leite são menores.
 * Os decíduos reaproveitam o recorte do permanente do mesmo tipo em escala menor (aproximação).
 */
export function kindScale(n: number): { kx: number; ky: number } {
  const k = toothKind(n)
  const lower = !isUpperTooth(n)
  const s = (v: number) => ({ kx: v, ky: v })
  switch (k) {
    case 'ci': return s(lower ? 0.78 : 1)
    case 'li': return s(lower ? 0.69 : 0.88)
    case 'ca': return s(lower ? 0.9 : 1)
    case 'pm1': case 'pm2': return s(lower ? 0.94 : 1)
    case 'mo1': return s(lower ? 0.97 : 1)
    case 'mo2': return s(lower ? 0.9 : 0.92)
    case 'mo3': return s(lower ? 0.8 : 0.82)
    case 'dci': return s(0.74)
    case 'dli': return s(0.66)
    case 'dca': return s(0.76)
    case 'dmo1': return s(0.82)
    case 'dmo2': return s(0.88)
  }
}

/** Matriz do SVG `scale(sx, sy)` de um dente: sx -1 nos quadrantes da direita, sy -1 na arcada de cima (raízes para cima na vista frontal). */
export function frontScale(n: number): { sx: number; sy: number } {
  const { kx, ky } = kindScale(n)
  return { sx: isMirroredX(n) ? -kx : kx, sy: isUpperTooth(n) ? -ky : ky }
}
/** Na vista oclusal o vestibular fica para fora da boca: para cima na arcada superior, para baixo na inferior. */
export function occlusalScale(n: number): { sx: number; sy: number } {
  // o canino usa a fatia oclusal do pré-molar (ver occTileOf em shapes.ts), um pouco menor para não passar da célula
  const kx = kindScale(n).kx * (['ca', 'dca'].includes(toothKind(n)) ? 0.9 : 1)
  return { sx: isMirroredX(n) ? -kx : kx, sy: isFlippedY(n) ? -kx : kx }
}

/** Aplica sx/sy a um ponto local (x em torno do eixo central cx) e devolve o ponto na tela, para testar o espelhamento. */
export function mapPoint(x: number, y: number, s: { sx: number; sy: number }, origin: { x: number; y: number }, axis = 28): { x: number; y: number } {
  return { x: origin.x + (x - axis) * s.sx, y: origin.y + y * s.sy }
}

/** Rótulo da face (incisal nos dentes da frente, oclusal nos demais). */
export function faceLabel(n: number, face: SurfaceKey): string {
  const base: Record<SurfaceKey, string> = { v: 'Vestibular', l: isUpperTooth(n) ? 'Palatina' : 'Lingual', m: 'Mesial', d: 'Distal', o: isAnterior(n) ? 'Incisal' : 'Oclusal' }
  return base[face]
}

// ── Fio ortodôntico ─────────────────────────────────────────────

/**
 * Pares de dentes vizinhos, na ordem da arcada, que têm braquete e portanto são ligados por um fio contínuo.
 * Dentes ausentes não contam como vizinhos (o fio passa por cima do vão); um dente presente sem braquete
 * interrompe o fio.
 */
export function bracketWires(row: number[], hasBracket: (n: number) => boolean, isAbsent: (n: number) => boolean = () => false): Array<[number, number]> {
  const present = row.filter(n => !isAbsent(n))
  const out: Array<[number, number]> = []
  for (let i = 0; i + 1 < present.length; i++) {
    if (hasBracket(present[i]) && hasBracket(present[i + 1])) out.push([present[i], present[i + 1]])
  }
  return out
}

// ── Caminhos SVG: escala em torno de um ponto ───────────────────
// Só para caminhos com comandos absolutos M, L, C, Q e Z (os de shapes.ts), que é o que o desenho usa.

/** Escala um caminho em torno de (cx, cy). Serve para derivar a zona central da face oclusal do contorno do dente. */
export function scalePath(d: string, cx: number, cy: number, s: number): string {
  const f = (v: number) => +v.toFixed(2)
  return d.replace(/([MLCQZ])([^MLCQZ]*)/g, (_, cmd: string, args: string) => {
    if (cmd === 'Z') return 'Z'
    const nums = args.match(/-?\d*\.?\d+/g)?.map(Number) ?? []
    const out: number[] = []
    for (let i = 0; i + 1 < nums.length; i += 2) out.push(f(cx + (nums[i] - cx) * s), f(cy + (nums[i + 1] - cy) * s))
    return `${cmd} ${out.join(' ')} `
  }).trim()
}
