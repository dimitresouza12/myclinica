// Corpo-modelo (HTML) de alguns documentos do prontuário. São roteiros
// GENÉRICOS e editáveis — só a estrutura de seções e frases neutras, com
// [campos entre colchetes] pra preencher. Não são texto jurídico oficial:
// cada um vem com um aviso na tela (REVIEW_NOTE) pedindo revisão com o
// conselho da profissão antes do uso.

export const REVIEW_NOTE =
  'Modelo genérico e editável. Revise o texto com o seu conselho profissional antes de usar e ajuste ao seu caso.'

const P = 'font-family:Georgia,\'Times New Roman\',serif;font-size:13px;line-height:1.7;color:#2B3430;margin:0 0 10px'
const H = 'font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1D2421;margin:14px 0 4px'

const p = (text: string) => `<p style="${P}">${text}</p>`
const section = (title: string, hint: string) => `<p style="${H}">${title}</p>${p(hint)}`

// ── Psicologia (estrutura de documentos escritos da Res. CFP 06/2019) ────────

export const PSICO_DECLARACAO_BODY =
  p('Declaro, para os devidos fins, que [nome do paciente] compareceu a atendimento psicológico em [data], no horário de [hora inicial] às [hora final].') +
  p('Esta declaração não contém informações sobre diagnóstico, sintomas ou conteúdo das sessões.')

export const PSICO_RELATORIO_BODY =
  section('1. Identificação', 'Autor/a: [nome do psicólogo]. Solicitante: [quem solicitou]. Finalidade: [para que se destina]. Beneficiário: [nome do paciente].') +
  section('2. Descrição da demanda', '[Descreva a demanda que motivou o atendimento e o que foi solicitado.]') +
  section('3. Procedimento', '[Recursos, instrumentos e técnicas utilizados, número de encontros e período do acompanhamento.]') +
  section('4. Análise', '[Análise fundamentada nos procedimentos descritos, restrita ao que é pertinente à finalidade do documento.]') +
  section('5. Conclusão', '[Conclusões e encaminhamentos, se houver.]') +
  p('Entrevista devolutiva realizada em [data]: [sim / não].')

// ── Fisioterapia, Fonoaudiologia e Terapia Ocupacional ───────────────────────

export const FISIO_LAUDO_BODY =
  section('Identificação', 'Paciente: [nome]. Encaminhado por: [profissional/serviço]. Finalidade do documento: [para que se destina].') +
  section('Avaliação cinético-funcional', '[Queixa principal, achados da avaliação, testes e medidas utilizadas.]') +
  section('Diagnóstico cinético-funcional', '[Diagnóstico fisioterapêutico.]') +
  section('Objetivos e conduta', '[Objetivos do tratamento e condutas adotadas.]') +
  section('Prognóstico', '[Prognóstico fisioterapêutico.]') +
  section('Quantitativo provável de atendimentos', '[Número estimado de sessões e frequência semanal.]')

export const FONO_LAUDO_BODY =
  section('Identificação', 'Paciente: [nome]. Encaminhado por: [profissional/serviço]. Finalidade do documento: [para que se destina].') +
  section('Avaliação fonoaudiológica', '[Queixa, histórico, instrumentos e procedimentos aplicados, achados.]') +
  section('Diagnóstico fonoaudiológico', '[Diagnóstico e hipóteses.]') +
  section('Objetivos e conduta terapêutica', '[Objetivos e condutas adotadas.]') +
  section('Prognóstico e frequência', '[Prognóstico e número estimado de sessões por semana.]')

export const TO_LAUDO_BODY =
  section('Identificação', 'Paciente: [nome]. Encaminhado por: [profissional/serviço]. Finalidade do documento: [para que se destina].') +
  section('Avaliação terapêutica ocupacional', '[Queixa, histórico, desempenho ocupacional, instrumentos e procedimentos aplicados, achados.]') +
  section('Diagnóstico terapêutico ocupacional', '[Diagnóstico e hipóteses.]') +
  section('Objetivos e conduta terapêutica', '[Objetivos e condutas adotadas.]') +
  section('Prognóstico e frequência', '[Prognóstico e número estimado de sessões por semana.]')

// ── Nutrição ─────────────────────────────────────────────────────────────────

export const NUTRI_EXAMES_SUPLEMENTOS_BODY =
  section('Exames solicitados', '1. [exame]<br>2. [exame]<br>3. [exame]') +
  section('Suplementação', '[Suplemento] — [dose] — [horário/forma de uso] — [duração].<br>[Suplemento] — [dose] — [horário/forma de uso] — [duração].') +
  section('Orientações', '[Orientações gerais e data de retorno.]')

export const NUTRI_LAUDO_BODY =
  section('Identificação', 'Paciente: [nome]. Encaminhado por: [profissional/serviço]. Finalidade do documento: [para que se destina].') +
  section('Avaliação nutricional', '[Queixa e histórico alimentar. Antropometria: peso [kg], altura [cm], IMC [kg/m²], circunferência da cintura [cm], % de gordura [%] e método usado. Exames bioquímicos relevantes.]') +
  section('Diagnóstico nutricional', '[Diagnóstico nutricional com base nos achados acima.]') +
  section('Conduta dietoterápica', '[Plano alimentar prescrito, meta calórica e de macronutrientes, suplementação e orientações entregues.]') +
  section('Metas e reavaliação', '[Metas do acompanhamento e data prevista de reavaliação.]')

// ── Veterinária (termo de consentimento do tutor) ────────────────────────────

export const VET_TERMO_BODY =
  p('Eu, [nome do tutor], portador(a) do documento [identificação], tutor(a) do animal [nome do animal], espécie [espécie], raça [raça], idade [idade], declaro que fui informado(a) pelo(a) médico(a) veterinário(a) sobre o procedimento abaixo, seus objetivos, riscos e alternativas, e autorizo sua realização.') +
  p('Procedimento (marque e descreva):<br>( ) Anestesia / sedação — [descrição]<br>( ) Cirurgia — [descrição]<br>( ) Internação — [descrição e período previsto]<br>( ) Eutanásia — [descrição]<br>( ) Outro — [descrição]') +
  p('Riscos e intercorrências informados: [descreva].') +
  p('Estou ciente dos custos envolvidos: [valor / condições].') +
  p('Local e data: [cidade], [data]. Assinatura do tutor: ______________________________')

// ── Estética (TCLE e termo de uso de imagem) ─────────────────────────────────

export const ESTETICA_TCLE_BODY =
  p('Eu, [nome do paciente], portador(a) do documento [identificação], declaro que fui informado(a) pelo(a) profissional responsável, de forma clara e em linguagem acessível, sobre o procedimento descrito abaixo e concordo com a sua realização.') +
  section('Procedimento', '[Nome do procedimento, região a ser tratada, produtos e técnica utilizados, número de sessões previstas.]') +
  section('Objetivo e resultado esperado', '[Finalidade do procedimento. O resultado varia de pessoa para pessoa e não há garantia de resultado específico.]') +
  section('Riscos, efeitos esperados e possíveis intercorrências', '[Ex.: vermelhidão, inchaço, hematoma, dor local, assimetria, reação alérgica, necessidade de retoque. Descreva os riscos próprios do procedimento.]') +
  section('Alternativas', '[Outras opções de tratamento, inclusive a de não realizar o procedimento.]') +
  section('Cuidados antes e depois', '[Orientações pré e pós-procedimento entregues ao paciente, restrições e retorno.]') +
  section('Declarações do paciente', 'Informei ao profissional meu histórico de saúde, alergias, medicamentos em uso, gestação ou amamentação e tratamentos estéticos anteriores: [sim / não]. Tive oportunidade de tirar minhas dúvidas e sei que posso retirar este consentimento a qualquer momento antes do procedimento.') +
  p('Local e data: [cidade], [data]. Assinatura do paciente: ______________________________') +
  p('Profissional responsável: ______________________________')

export const ESTETICA_TERMO_IMAGEM_BODY =
  p('Eu, [nome do paciente], portador(a) do documento [identificação], autorizo [nome da clínica] e seus profissionais a registrar fotografias e/ou vídeos da região tratada, antes, durante e depois do procedimento, para fins de acompanhamento clínico e documentação do prontuário.') +
  p('Uso das imagens (marque o que autoriza):<br>( ) Somente prontuário e acompanhamento do meu tratamento<br>( ) Material educativo e de estudo, sem identificar meu rosto ou nome<br>( ) Divulgação em redes sociais e site da clínica, com identificação do meu rosto<br>( ) Divulgação em redes sociais e site da clínica, sem identificar meu rosto') +
  p('Estou ciente de que esta autorização é gratuita, vale pelo prazo de [prazo] e pode ser revogada por mim a qualquer momento, por escrito, sem prejuízo do meu atendimento. A revogação não alcança o material já publicado antes do pedido, mas a clínica se compromete a não o utilizar em novas publicações.') +
  p('As imagens serão tratadas conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), com acesso restrito e finalidade limitada ao que foi marcado acima.') +
  p('Local e data: [cidade], [data]. Assinatura do paciente: ______________________________')
