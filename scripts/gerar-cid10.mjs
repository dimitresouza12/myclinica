// Gera src/lib/medico/cid10-datasus.json a partir do CSV oficial do DATASUS (CID-10 v2008, 12.451 códigos).
//
// Uso:
//   curl -o CID10CSV.zip http://www2.datasus.gov.br/cid10/V2008/downloads/CID10CSV.zip
//   unzip CID10CSV.zip -d cid10csv
//   node scripts/gerar-cid10.mjs cid10csv/CID-10-SUBCATEGORIAS.CSV
//
// O CSV vem em ISO-8859-1, separado por ";", com CRLF. O arquivo de subcategorias já traz também as
// categorias de 3 caracteres que não têm subdivisão (ex.: I10, A09), ou seja, é o conjunto completo de
// códigos usáveis. O código vira o formato com ponto (A000 -> A00.0).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const input = process.argv[2]
if (!input) {
  console.error('Informe o caminho do CID-10-SUBCATEGORIAS.CSV')
  process.exit(1)
}

const text = new TextDecoder('latin1').decode(readFileSync(input))
const lines = text.split(/\r?\n/).filter(Boolean)
const header = lines.shift().split(';')
const iCode = header.indexOf('SUBCAT')
const iDesc = header.indexOf('DESCRICAO')
if (iCode < 0 || iDesc < 0) throw new Error('Cabeçalho inesperado: ' + header.join(';'))

const seen = new Set()
const out = []
for (const line of lines) {
  const cols = line.split(';')
  const raw = cols[iCode].trim().toUpperCase()
  const desc = cols[iDesc].replace(/\s+/g, ' ').trim()
  if (!/^[A-Z]\d{2}[\dX]?$/.test(raw)) throw new Error('Código fora do padrão: ' + raw)
  if (!desc) throw new Error('Descrição vazia: ' + raw)
  const code = raw.length === 4 ? `${raw.slice(0, 3)}.${raw[3]}` : raw
  if (seen.has(code)) throw new Error('Código repetido: ' + code)
  seen.add(code)
  out.push([code, desc])
}
out.sort((a, b) => a[0].localeCompare(b[0]))

const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'medico', 'cid10-datasus.json')
writeFileSync(dest, JSON.stringify(out))
console.log(`${out.length} códigos gravados em ${dest}`)
