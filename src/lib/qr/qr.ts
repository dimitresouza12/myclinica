// Gerador de QR Code mínimo, sem dependência: modo byte (UTF-8), correção de erro M, versões 1 a 10 (até 213 bytes).
// Serve para o QR verificador dos documentos (uma URL curta). Funções puras: texto -> matriz -> SVG.
// Estrutura e tabelas conforme ISO/IEC 18004; conferido contra um decodificador na suíte de testes.

/** Por versão (1..10), nível M: bytes de correção por bloco e [qtd blocos, bytes de dados por bloco] dos dois grupos. */
const EC_M: { ec: number; groups: [number, number][] }[] = [
  { ec: 10, groups: [[1, 16]] },
  { ec: 16, groups: [[1, 28]] },
  { ec: 26, groups: [[1, 44]] },
  { ec: 18, groups: [[2, 32]] },
  { ec: 24, groups: [[2, 43]] },
  { ec: 16, groups: [[4, 27]] },
  { ec: 18, groups: [[4, 31]] },
  { ec: 22, groups: [[2, 38], [2, 39]] },
  { ec: 22, groups: [[3, 36], [2, 37]] },
  { ec: 26, groups: [[4, 43], [1, 44]] },
]

const ALIGN: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
]

export const QR_MAX_BYTES = 213

function dataCapacity(version: number): number {
  return EC_M[version - 1].groups.reduce((s, [n, len]) => s + n * len, 0)
}

function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root)
      if (j + 1 < degree) result[j] ^= result[j + 1]
    }
    root = gfMul(root, 0x02)
  }
  return result
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor) })
  }
  return result
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

/** Versão mínima que comporta `byteLength` bytes, ou null se passar de 213. */
function pickVersion(byteLength: number): number | null {
  for (let v = 1; v <= 10; v++) {
    const bits = 4 + (v < 10 ? 8 : 16) + 8 * byteLength
    if (bits <= dataCapacity(v) * 8) return v
  }
  return null
}

function buildCodewords(bytes: number[], version: number): number[] {
  const bits: number[] = []
  const push = (value: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1) }
  push(0b0100, 4)
  push(bytes.length, version < 10 ? 8 : 16)
  for (const b of bytes) push(b, 8)
  const capBits = dataCapacity(version) * 8
  push(0, Math.min(4, capBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]
    data.push(v)
  }
  for (let pad = 0xec; data.length < dataCapacity(version); pad ^= 0xec ^ 0x11) data.push(pad)

  const { ec, groups } = EC_M[version - 1]
  const divisor = rsDivisor(ec)
  const blocks: { data: number[]; ecc: number[] }[] = []
  let k = 0
  for (const [count, len] of groups) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(k, k + len)
      k += len
      blocks.push({ data: d, ecc: rsRemainder(d, divisor) })
    }
  }
  const out: number[] = []
  const maxLen = Math.max(...blocks.map(b => b.data.length))
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i])
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ecc[i])
  return out
}

const bit = (value: number, i: number) => ((value >>> i) & 1) === 1

class Grid {
  readonly size: number
  readonly modules: boolean[][]
  readonly fn: boolean[][]
  constructor(readonly version: number) {
    this.size = 17 + 4 * version
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.fn = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
  }
  setFn(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark
    this.fn[y][x] = true
  }
  drawFunctionPatterns() {
    const s = this.size
    for (let i = 0; i < s; i++) { this.setFn(6, i, i % 2 === 0); this.setFn(i, 6, i % 2 === 0) }
    this.finder(3, 3); this.finder(s - 4, 3); this.finder(3, s - 4)
    const pos = ALIGN[this.version - 1]
    for (let a = 0; a < pos.length; a++) {
      for (let b = 0; b < pos.length; b++) {
        if ((a === 0 && b === 0) || (a === 0 && b === pos.length - 1) || (a === pos.length - 1 && b === 0)) continue
        this.alignment(pos[a], pos[b])
      }
    }
    this.drawFormat(0)
    this.drawVersion()
  }
  private finder(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.setFn(xx, yy, dist !== 2 && dist !== 4)
      }
    }
  }
  private alignment(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.setFn(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }
  drawFormat(mask: number) {
    const data = (0 << 3) | mask // nível M = 00
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412
    const s = this.size
    for (let i = 0; i <= 5; i++) this.setFn(8, i, bit(bits, i))
    this.setFn(8, 7, bit(bits, 6)); this.setFn(8, 8, bit(bits, 7)); this.setFn(7, 8, bit(bits, 8))
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, bit(bits, i))
    for (let i = 0; i < 8; i++) this.setFn(s - 1 - i, 8, bit(bits, i))
    for (let i = 8; i < 15; i++) this.setFn(8, s - 15 + i, bit(bits, i))
    this.setFn(8, s - 8, true)
  }
  private drawVersion() {
    if (this.version < 7) return
    let rem = this.version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (this.version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.setFn(a, b, bit(bits, i)); this.setFn(b, a, bit(bits, i))
    }
  }
  placeData(codewords: number[]) {
    let i = 0
    const s = this.size
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < s; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? s - 1 - vert : vert
          if (!this.fn[y][x] && i < codewords.length * 8) {
            this.modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7))
            i++
          }
        }
      }
    }
  }
  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.fn[y][x]) continue
        let invert: boolean
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break
          case 1: invert = y % 2 === 0; break
          case 2: invert = x % 3 === 0; break
          case 3: invert = (x + y) % 3 === 0; break
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
        }
        if (invert) this.modules[y][x] = !this.modules[y][x]
      }
    }
  }
  penalty(): number {
    const s = this.size
    const m = this.modules
    let score = 0
    const lines = (get: (a: number, b: number) => boolean) => {
      for (let a = 0; a < s; a++) {
        let run = 1
        for (let b = 1; b < s; b++) {
          if (get(a, b) === get(a, b - 1)) run++
          else { if (run >= 5) score += 3 + (run - 5); run = 1 }
        }
        if (run >= 5) score += 3 + (run - 5)
        const seq: boolean[] = []
        for (let b = 0; b < s; b++) seq.push(get(a, b))
        const pat = [true, false, true, true, true, false, true]
        for (let b = 0; b + 7 <= s; b++) {
          if (!pat.every((v, k) => seq[b + k] === v)) continue
          const before = b >= 4 && seq.slice(b - 4, b).every(v => !v)
          const after = b + 11 <= s && seq.slice(b + 7, b + 11).every(v => !v)
          if (before || after) score += 40
        }
      }
    }
    lines((a, b) => m[a][b])
    lines((a, b) => m[b][a])
    for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) {
      const c = m[y][x]
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3
    }
    let dark = 0
    for (const row of m) for (const c of row) if (c) dark++
    const pct = (dark * 100) / (s * s)
    score += Math.floor(Math.abs(pct - 50) / 5) * 10
    return score
  }
}

/** Matriz do QR (true = módulo escuro) para o texto. Lança erro se passar de 213 bytes UTF-8. */
export function encodeQr(text: string): boolean[][] {
  const bytes = utf8(text)
  const version = pickVersion(bytes.length)
  if (!version) throw new Error(`Texto longo demais para o QR (${bytes.length} bytes; máximo ${QR_MAX_BYTES}).`)
  const codewords = buildCodewords(bytes, version)

  let best: Grid | null = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const g = new Grid(version)
    g.drawFunctionPatterns()
    g.placeData(codewords)
    g.applyMask(mask)
    g.drawFormat(mask)
    const score = g.penalty()
    if (score < bestScore) { best = g; bestScore = score }
  }
  return (best as Grid).modules
}

/** SVG do QR (um único path, sem emendas), com a zona de silêncio de 4 módulos. */
export function qrToSvg(matrix: boolean[][], opts: { margin?: number; dark?: string; light?: string } = {}): string {
  const margin = opts.margin ?? 4
  const n = matrix.length
  const total = n + margin * 2
  let d = ''
  for (let y = 0; y < n; y++) {
    let x = 0
    while (x < n) {
      if (!matrix[y][x]) { x++; continue }
      let end = x
      while (end < n && matrix[y][end]) end++
      d += `M${x + margin} ${y + margin}h${end - x}v1h-${end - x}z`
      x = end
    }
  }
  const light = opts.light ?? '#ffffff'
  const dark = opts.dark ?? '#000000'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`
}

/** `data:` URI do SVG, pronta para <img src>. */
export function qrDataUri(text: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrToSvg(encodeQr(text)))}`
}
