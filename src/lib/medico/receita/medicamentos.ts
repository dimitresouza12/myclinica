// Banco LOCAL e pequeno de nomes genéricos (Denominação Comum Brasileira) de uso comum, usado SÓ como sugestão de
// digitação no campo "Medicamento" da receita. Não traz bula, indicação, dose, interação nem apresentação: o
// profissional escreve a dose e a posologia. Sem serviço pago e sem consulta externa.
//
// Ficam de fora, de propósito, os medicamentos de controle especial (Portaria SVS/MS 344/98: benzodiazepínicos,
// opioides, antidepressivos, anticonvulsivantes, antipsicóticos, psicoestimulantes, entre outros). O campo continua
// livre: o profissional pode digitar qualquer nome. Para controle especial existe a Receita Especial em Documentos.

export const MEDICAMENTOS_SUGESTAO: string[] = [
  // dor, febre e inflamação
  'Paracetamol', 'Dipirona', 'Ibuprofeno', 'Diclofenaco', 'Naproxeno', 'Cetoprofeno', 'Nimesulida', 'Meloxicam',
  'Ácido acetilsalicílico', 'Butilbrometo de escopolamina', 'Ciclobenzaprina', 'Orfenadrina',
  // antibióticos e anti-infecciosos
  'Amoxicilina', 'Amoxicilina com clavulanato', 'Azitromicina', 'Cefalexina', 'Cefuroxima', 'Ciprofloxacino',
  'Sulfametoxazol com trimetoprima', 'Nitrofurantoína', 'Metronidazol', 'Claritromicina', 'Doxiciclina', 'Penicilina benzatina',
  'Fosfomicina',
  // antifúngicos e antiparasitários
  'Fluconazol', 'Nistatina', 'Cetoconazol', 'Clotrimazol', 'Miconazol', 'Terbinafina', 'Albendazol', 'Mebendazol', 'Ivermectina',
  'Secnidazol', 'Permetrina', 'Benzoato de benzila',
  // antivirais
  'Aciclovir', 'Oseltamivir',
  // alergia, resfriado e vias respiratórias
  'Loratadina', 'Desloratadina', 'Cetirizina', 'Dexclorfeniramina', 'Levocetirizina', 'Salbutamol', 'Budesonida',
  'Beclometasona', 'Brometo de ipratrópio', 'Ambroxol', 'Acetilcisteína', 'Montelucaste', 'Soro fisiológico', 'Mometasona',
  // corticoides
  'Prednisona', 'Prednisolona', 'Dexametasona', 'Betametasona', 'Hidrocortisona', 'Metilprednisolona',
  // estômago e intestino
  'Omeprazol', 'Pantoprazol', 'Esomeprazol', 'Domperidona', 'Ondansetrona', 'Metoclopramida', 'Bromoprida', 'Simeticona',
  'Hioscina', 'Lactulose', 'Loperamida', 'Sais de reidratação oral', 'Bisacodil', 'Racecadotrila',
  // coração, pressão e metabolismo
  'Losartana', 'Enalapril', 'Captopril', 'Anlodipino', 'Hidroclorotiazida', 'Atenolol', 'Propranolol', 'Metoprolol', 'Carvedilol',
  'Furosemida', 'Espironolactona', 'Valsartana', 'Olmesartana', 'Clortalidona', 'Sinvastatina', 'Atorvastatina', 'Rosuvastatina',
  'Metformina', 'Glibenclamida', 'Gliclazida', 'Levotiroxina', 'Clopidogrel', 'Isossorbida',
  // vitaminas, minerais e suplementos
  'Colecalciferol', 'Cianocobalamina', 'Ácido fólico', 'Sulfato ferroso', 'Sulfato de zinco', 'Vitamina C', 'Polivitamínico',
  // pele, olhos, ouvidos e uso tópico
  'Hidrocortisona creme', 'Dexpantenol', 'Mupirocina', 'Neomicina com bacitracina', 'Óxido de zinco', 'Ácido fusídico',
  'Tobramicina colírio', 'Ciprofloxacino colírio', 'Carmelose colírio', 'Cetoconazol xampu', 'Dexametasona com neomicina',
  'Cetoprofeno gel', 'Diclofenaco gel', 'Protetor solar', 'Ureia creme',
  // urinário, ginecológico e outros
  'Fenazopiridina', 'Tansulosina', 'Finasterida', 'Progesterona micronizada', 'Ácido tranexâmico', 'Cabergolina',
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const INDICE = MEDICAMENTOS_SUGESTAO.map(nome => ({ nome, chave: norm(nome) }))

/**
 * Sugestões para o texto digitado: nomes que começam com o texto primeiro, depois os que o contêm (sem acento nem
 * maiúscula). Com menos de 2 letras, nada. O nome exato já digitado não é repetido como sugestão.
 */
export function sugerirMedicamentos(digitado: string, limite = 6): string[] {
  const q = norm(digitado)
  if (q.length < 2) return []
  const comeca: string[] = []
  const contem: string[] = []
  for (const { nome, chave } of INDICE) {
    if (chave === q) continue
    if (chave.startsWith(q)) comeca.push(nome)
    else if (chave.split(/\s+/).some(p => p.startsWith(q)) || chave.includes(q)) contem.push(nome)
  }
  return [...comeca, ...contem].slice(0, limite)
}

// Medicamentos que, no Brasil, em geral exigem receituário de controle especial. SÓ para avisar: a lista não é
// exaustiva e o aviso não impede nada. O profissional é quem sabe a lista vigente (Portaria SVS/MS 344/98 e atualizações).
const CONTROLADOS = [
  'alprazolam', 'bromazepam', 'clonazepam', 'diazepam', 'lorazepam', 'midazolam', 'clobazam', 'zolpidem', 'zopiclona',
  'tramadol', 'codeina', 'morfina', 'metadona', 'oxicodona', 'fentanil', 'buprenorfina',
  'metilfenidato', 'lisdexanfetamina', 'modafinil', 'sibutramina', 'femproporex', 'anfepramona',
  'fluoxetina', 'sertralina', 'paroxetina', 'escitalopram', 'citalopram', 'venlafaxina', 'duloxetina', 'amitriptilina', 'bupropiona', 'mirtazapina',
  'carbamazepina', 'fenobarbital', 'topiramato', 'pregabalina', 'gabapentina', 'lamotrigina', 'valproato', 'acido valproico',
  'haloperidol', 'risperidona', 'quetiapina', 'olanzapina', 'clozapina', 'aripiprazol', 'litio',
  'testosterona', 'oxandrolona', 'talidomida', 'isotretinoina',
]

/** True se o nome digitado parece ser de um medicamento de controle especial (aviso apenas). */
export function pareceControlado(nome: string): boolean {
  const n = norm(nome)
  return n.length >= 4 && CONTROLADOS.some(c => n.includes(c))
}
