import { describe, expect, it } from 'vitest'
import { camposEmBranco, guiaParaHtml, montarGuia, valorDaGuia, type GuiaContexto, type GuiaDados } from './tiss'

const ctx = (over: Partial<GuiaContexto> = {}): GuiaContexto => ({
  clinic: { name: 'Clínica Vida', address: 'Rua A, 10', phone: '85999998888' },
  clinicType: 'fisio',
  patient: {
    id: 'p', name: 'Ana Souza', cpf: '52998224725', birth_date: '1990-04-02', convenio: 'Unimed', convenio_carteirinha: '00012345',
    convenio_validade: '2027-03-31', convenio_titular: 'Carlos Souza',
  },
  plans: [{ id: 'pl', clinic_id: 'c', name: 'Unimed', ans_registry: '393321', procedure_prices: { sessao: 95 }, notes: null, is_active: true }],
  appointment: { id: 'a', patient_id: 'p', professional_id: 'm', procedure_id: 'sessao', procedure_name: 'Sessão de fisioterapia', procedure_price: 120, status: 'concluido', scheduled_at: '2026-11-05T17:00:00Z' },
  professional: { id: 'm', name: 'Dr. Rui', specialty: null, specialty_type: 'fisio', registration_number: '12345-F' },
  procedures: [],
  ...over,
})

const valor = (g: GuiaDados, rotulo: string) => g.secoes.flatMap(s => s.campos).find(c => c.rotulo === rotulo)?.valor

describe('guia de consulta', () => {
  const g = montarGuia('consulta', ctx())
  it('preenche o que o sistema sabe', () => {
    expect(valor(g, 'Registro ANS')).toBe('393321')
    expect(valor(g, 'Número da carteira')).toBe('00012345')
    expect(valor(g, 'Validade da carteira')).toBe('31/03/2027')
    expect(valor(g, 'Nome do beneficiário')).toBe('Ana Souza')
    expect(valor(g, 'CPF')).toBe('529.982.247-25')
    expect(valor(g, 'Titular do plano')).toBe('Carlos Souza')
    expect(valor(g, 'Nome do contratado')).toBe('Clínica Vida')
    expect(valor(g, 'Nome do profissional executante')).toBe('Dr. Rui')
    expect(valor(g, 'Conselho profissional')).toBe('CREFITO')
    expect(valor(g, 'Número no conselho')).toBe('12345-F')
    expect(valor(g, 'Data do atendimento')).toBe('05/11/2026')
    expect(valor(g, 'Descrição')).toBe('Sessão de fisioterapia')
  })
  it('valor sai da tabela do convênio e não do agendamento', () => {
    expect(valor(g, 'Valor do procedimento')).toContain('95,00')
  })
  it('o que não existe no cadastro fica em branco, sem inventar', () => {
    for (const r of ['Código CNES', 'Código na operadora', 'UF', 'CBO', 'Código do procedimento', 'Tabela', 'Tipo de consulta', 'Nº da guia no prestador']) expect(valor(g, r)).toBe('')
    expect(camposEmBranco(g)).toBeGreaterThan(8)
  })
})

describe('guia SP/SADT', () => {
  const g = montarGuia('sadt', ctx())
  it('traz o procedimento realizado com quantidade 1 e total', () => {
    expect(g.procedimentos).toHaveLength(1)
    expect(g.procedimentos![0]).toMatchObject({ descricao: 'Sessão de fisioterapia', quantidade: '1', codigo: '', tabela: '' })
    expect(g.procedimentos![0].valorUnitario).toContain('95,00')
    expect(g.totalGeral).toContain('95,00')
  })
  it('solicitante, senha e autorização ficam em branco', () => {
    for (const r of ['Nome do profissional solicitante', 'Senha', 'Data da autorização', 'Caráter do atendimento (E/U)']) expect(valor(g, r)).toBe('')
  })
  it('data de realização e executante vêm do atendimento', () => {
    expect(valor(g, 'Data de realização')).toBe('05/11/2026')
    expect(valor(g, 'Nome do profissional executante')).toBe('Dr. Rui')
  })
})

describe('valorDaGuia', () => {
  it('tabela do convênio > agendamento > preço do procedimento > nada', () => {
    expect(valorDaGuia(ctx())).toBe(95)
    expect(valorDaGuia(ctx({ plans: [] }))).toBe(120)
    const sem = ctx({ plans: [] })
    sem.appointment.procedure_price = null
    expect(valorDaGuia({ ...sem, procedures: [{ id: 'sessao', name: 'S', price: 80 }] })).toBe(80)
    expect(valorDaGuia(sem)).toBeNull()
  })
  it('sem profissional nem convênio cadastrado, a guia ainda sai', () => {
    const g = montarGuia('consulta', ctx({ professional: null, plans: [], patient: { id: 'p', name: 'Ana', cpf: null, convenio: null, convenio_carteirinha: null } }))
    expect(valor(g, 'Nome do beneficiário')).toBe('Ana')
    expect(valor(g, 'Registro ANS')).toBe('')
  })
})

describe('guiaParaHtml', () => {
  it('escapa o que vem do cadastro', () => {
    const g = montarGuia('consulta', ctx({ patient: { ...ctx().patient, name: 'Ana <script>x</script>' } }))
    const html = guiaParaHtml(g, 'Clínica "Vida"', '10/11/2026')
    expect(html).toContain('Ana &lt;script&gt;')
    expect(html).not.toContain('<script>x')
    expect(html).toContain('Guia de Consulta')
    expect(html).toContain('Assinatura do beneficiário')
  })
})
