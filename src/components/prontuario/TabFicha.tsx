'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient, MedicalRecord, RecordEntry } from '@/types'
import type { AuthClinic } from '@/types'
import { printProntuario, printContrato } from '@/lib/print'
import styles from './TabFicha.module.css'

interface Props {
  patient: Patient
  record: MedicalRecord | null
  entries: RecordEntry[]
  clinic: AuthClinic
  clinicId: string
  clinicName: string
  onSaved: () => void
}

const CONTRACT_TEMPLATE = (clinic: string, patient: string, clinicType?: string) => {
  const serviceLabel: Record<string, string> = {
    odonto: 'odontológicos',
    medico: 'médicos',
    estetica: 'estéticos',
    vet: 'veterinários',
    fisio: 'de fisioterapia',
    psico: 'de psicologia',
    nutri: 'de nutrição',
  }
  const label = serviceLabel[clinicType ?? ''] ?? 'de saúde'
  return `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATADA: ${clinic}
CONTRATANTE: ${patient}

CLÁUSULA 1ª: O presente contrato tem por objeto a prestação de serviços ${label} conforme plano de tratamento anexo.
CLÁUSULA 2ª: O CONTRATANTE compromete-se a comparecer nas datas e horários agendados.
CLÁUSULA 3ª: Em caso de desistência, o CONTRATANTE deverá comunicar com antecedência mínima de 24 horas.

Assinatura: __________________________________
Data: ${new Date().toLocaleDateString('pt-BR')}`
}

export function TabFicha({ patient, record, entries, clinic, clinicId, clinicName, onSaved }: Props) {
  const [anamnesis, setAnamnesis] = useState<Record<string, string>>({})
  const [clinicalExam, setClinicalExam] = useState<Record<string, string>>({})
  const [treatmentPlan, setTreatmentPlan] = useState('')
  const [contractText, setContractText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const patientDefaults: Record<string, string> = {
      'p-cpf':       patient.cpf ?? '',
      'p-rg':        patient.rg ?? '',
      'p-nasc':      patient.birth_date ?? '',
      'p-genero':    patient.gender ?? '',
      'p-ocupacao':  patient.occupation ?? '',
      'p-endereco':  patient.address ?? '',
      'p-indicado':  patient.referred_by ?? '',
      'p-emergencia': patient.emergency_contact ?? '',
    }
    if (record) {
      const merged: Record<string, string> = { ...patientDefaults, ...(record.anamnesis ?? {}) }
      setAnamnesis(merged)
      setClinicalExam(record.clinical_exam ?? {})
      setTreatmentPlan(record.treatment_plan ?? '')
      setContractText(record.contract_text ?? CONTRACT_TEMPLATE(clinicName, patient.name, clinic.type))
    } else {
      setAnamnesis(patientDefaults)
      setContractText(CONTRACT_TEMPLATE(clinicName, patient.name, clinic.type))
    }
  }, [record, clinicName, patient.name])

  function setA(k: string, v: string) { setAnamnesis((p) => ({ ...p, [k]: v })) }
  function setE(k: string, v: string) { setClinicalExam((p) => ({ ...p, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        clinic_id: clinicId,
        patient_id: patient.id,
        anamnesis,
        clinical_exam: clinicalExam,
        treatment_plan: treatmentPlan,
        contract_text: contractText,
        updated_at: new Date().toISOString(),
      }
      if (record?.id) {
        await supabase.from('medical_records').update(payload).eq('id', record.id)
      } else {
        await supabase.from('medical_records').insert([payload])
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const clinicInfo = {
    name: clinic.name,
    logo: clinic.logo || undefined,
    address: clinic.address || undefined,
    phone: clinic.phone || undefined,
  }

  const recordForPrint: MedicalRecord = {
    ...(record ?? {} as MedicalRecord),
    anamnesis,
    clinical_exam: clinicalExam,
    treatment_plan: treatmentPlan,
    contract_text: contractText,
  }

  const aField = (k: string, label: string) => (
    <div className={styles.field} key={k}>
      <label>{label}</label>
      <textarea rows={2} value={anamnesis[k] ?? ''} onChange={(e) => setA(k, e.target.value)} />
    </div>
  )
  const eField = (k: string, label: string) => (
    <div className={styles.field} key={k}>
      <label>{label}</label>
      <textarea rows={2} value={clinicalExam[k] ?? ''} onChange={(e) => setE(k, e.target.value)} />
    </div>
  )

  const anamnesisFields: Record<string, [string, string][]> = {
    odonto: [
      ['a-queixa', 'Queixa principal / Motivo da consulta'],
      ['a-saude', 'Estado geral de saúde'],
      ['a-tratamento', 'Em tratamento médico? Qual?'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias (medicamentos, látex, anestésicos)'],
      ['a-pressao', 'Pressão arterial / Cardiopatias'],
      ['a-fumante', 'Fumante / Álcool'],
      ['a-gengiva', 'Sangramento gengival / Dor dentária'],
      ['a-hist_odonto', 'Histórico odontológico (última consulta, prótese, implante)'],
      ['a-bruxismo', 'Bruxismo / Ranger de dentes'],
      ['a-habitos', 'Hábitos bucais (chupar dedo, morder objetos)'],
    ],
    medico: [
      ['a-motivo', 'Queixa principal / Motivo da consulta'],
      ['a-hist_doenca', 'História da doença atual (início, evolução, intensidade)'],
      ['a-comorbidades', 'Comorbidades (Diabetes, HAS, Cardiopatia, etc.)'],
      ['a-hist_familiar', 'Histórico familiar de doenças relevantes'],
      ['a-cirurgias', 'Cirurgias / Internações anteriores'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias (medicamentos, alimentos, outros)'],
      ['a-habitos', 'Hábitos de vida (Fumo / Álcool / Atividade física)'],
      ['a-sono', 'Qualidade do sono'],
      ['a-sintomas', 'Sintomas associados (febre, dor, náusea, etc.)'],
    ],
    estetica: [
      ['a-queixa', 'Queixa principal / Região de interesse'],
      ['a-expectativa', 'Expectativas com o tratamento'],
      ['a-trat_anteriores', 'Tratamentos estéticos anteriores'],
      ['a-cosmeticos', 'Uso de cosméticos / Ácidos / Retinol'],
      ['a-isotretinoina', 'Uso de isotretinoína (últimos 6 meses?)'],
      ['a-anticoagulantes', 'Uso de anticoagulantes / AAS'],
      ['a-exposicao_solar', 'Exposição solar (usa protetor solar?)'],
      ['a-alergia', 'Alergias (cosméticos, anestésicos, látex)'],
      ['a-queloides', 'Histórico de queloides / Cicatrização ruim'],
      ['a-gestante', 'Gestante / Lactante?'],
      ['a-doencas', 'Doenças de pele (rosácea, psoríase, dermatite)'],
    ],
    vet: [
      ['a-queixa', 'Motivo da consulta / Queixa principal'],
      ['a-alimentacao', 'Alimentação / Dieta (tipo, frequência, marca)'],
      ['a-ambiente', 'Ambiente onde vive (interno / externo)'],
      ['a-hist_doencas', 'Histórico de doenças / Cirurgias anteriores'],
      ['a-vacinas', 'Vacinação e vermifugação em dia?'],
      ['a-reproducao', 'Histórico reprodutivo (fêmeas: gestações, cio)'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias conhecidas'],
      ['a-contato', 'Contato com outros animais'],
    ],
    fisio: [
      ['a-queixa', 'Queixa principal'],
      ['a-diagnostico', 'Diagnóstico médico / Encaminhamento'],
      ['a-regiao', 'Região acometida'],
      ['a-inicio', 'Início e causa (trauma, postura, esforço, cirurgia)'],
      ['a-dor', 'Intensidade da dor (0–10) e tipo (queimação, pontada, etc.)'],
      ['a-fatores', 'Fatores que pioram / melhoram'],
      ['a-cirurgias', 'Cirurgias ou fraturas anteriores'],
      ['a-comorbidades', 'Comorbidades (Diabetes, HAS, Osteoporose, etc.)'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-exames', 'Exames de imagem disponíveis (RX, RM, USG)'],
      ['a-sessoes', 'Número de sessões previstas / Frequência'],
      ['a-alergia', 'Alergias'],
    ],
    psico: [
      ['a-queixa', 'Queixa principal / Motivo da busca'],
      ['a-hist_pessoal', 'Histórico pessoal relevante (infância, traumas, perdas)'],
      ['a-dinamica_familiar', 'Dinâmica familiar atual'],
      ['a-trat_anteriores', 'Tratamentos psicológicos ou psiquiátricos anteriores'],
      ['a-medicamentos', 'Medicamentos em uso (psiquiátricos ou outros)'],
      ['a-substancias', 'Uso de álcool, tabaco ou outras substâncias'],
      ['a-sono', 'Qualidade do sono (insônia, hipersonia, pesadelos)'],
      ['a-relacionamentos', 'Relacionamentos (familiar, social, afetivo)'],
      ['a-trabalho', 'Situação profissional / escolar'],
      ['a-objetivos', 'Objetivos com a terapia'],
      ['a-risco', 'Triagem de risco (ideação suicida / autolesão)'],
    ],
    nutri: [
      ['a-queixa', 'Objetivo principal / Queixa'],
      ['a-hist_clinico', 'Histórico clínico (Diabetes, HAS, dislipidemia, tireóide)'],
      ['a-cirurgias', 'Cirurgias / Internações anteriores'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias ou intolerâncias alimentares'],
      ['a-habitos', 'Hábitos alimentares (refeições/dia, horários, local)'],
      ['a-recordatorio', 'Recordatório alimentar 24h (o que comeu ontem)'],
      ['a-restricoes', 'Restrições alimentares (religiosas, preferências, aversões)'],
      ['a-hidratacao', 'Ingestão hídrica diária'],
      ['a-atividade', 'Prática de atividade física (tipo, frequência, duração)'],
      ['a-intestino', 'Funcionamento intestinal (frequência, consistência)'],
      ['a-hist_peso', 'Histórico de peso (máximo, mínimo, variações recentes)'],
    ]
  }

  const clinicalExamFields: Record<string, [string, string][]> = {
    odonto: [
      ['e-higiene', 'Higiene bucal (placa, tártaro)'],
      ['e-halitose', 'Halitose'],
      ['e-mucosa', 'Mucosa oral (cor, lesões, úlceras)'],
      ['e-palato', 'Palato / Língua / Assoalho bucal'],
      ['e-oclusao', 'Oclusão / Articulação temporomandibular (ATM)'],
      ['e-mobilidade', 'Mobilidade dentária'],
      ['e-sondagem', 'Profundidade de sondagem / Sangramento à sondagem'],
      ['e-dor', 'Dor à percussão / Sensibilidade ao frio/calor'],
      ['e-hipotese', 'Hipótese diagnóstica / Plano radiográfico'],
      ['e-obs', 'Observações gerais'],
    ],
    medico: [
      ['e-pressao', 'Pressão Arterial (mmHg)'],
      ['e-fc', 'Frequência Cardíaca (bpm)'],
      ['e-fr', 'Frequência Respiratória (irpm)'],
      ['e-temp', 'Temperatura (°C)'],
      ['e-spo2', 'Saturação O₂ (%)'],
      ['e-glicemia', 'Glicemia capilar (mg/dL)'],
      ['e-antropometria', 'Peso / Altura / IMC'],
      ['e-ausculta', 'Ausculta Cardíaca / Pulmonar'],
      ['e-exame_fisico', 'Exame físico específico (região de queixa)'],
      ['e-hipotese', 'Hipótese diagnóstica (CID)'],
      ['e-conduta', 'Conduta / Solicitação de exames'],
      ['e-obs', 'Observações gerais'],
    ],
    estetica: [
      ['e-tipo_pele', 'Tipo de pele (Normal, Seca, Oleosa, Mista)'],
      ['e-fototipo', 'Fototipo (Fitzpatrick I–VI)'],
      ['e-hidratacao', 'Grau de hidratação'],
      ['e-regiao', 'Região de interesse / Área a tratar'],
      ['e-manchas', 'Manchas / Melasma / Hiperpigmentação'],
      ['e-flacidez', 'Grau de flacidez / Celulite'],
      ['e-lesoes', 'Lesões visíveis (acne, rosácea, cicatrizes)'],
      ['e-procedimento', 'Procedimento proposto / Protocolo'],
      ['e-contraindicacoes', 'Contraindicações identificadas'],
      ['e-obs', 'Observações gerais'],
    ],
    vet: [
      ['e-temperatura', 'Temperatura retal (°C)'],
      ['e-mucosas', 'Mucosas (cor, TPC)'],
      ['e-hidratacao', 'Grau de desidratação'],
      ['e-fc', 'Frequência Cardíaca (bpm)'],
      ['e-fr', 'Frequência Respiratória (mpm)'],
      ['e-linfonodos', 'Linfonodos (tamanho, consistência)'],
      ['e-peso', 'Peso (kg) / Escore corporal'],
      ['e-ausculta', 'Ausculta cardíaca / Pulmonar'],
      ['e-abd', 'Palpação abdominal'],
      ['e-hipotese', 'Hipótese diagnóstica / Exames solicitados'],
      ['e-obs', 'Observações gerais'],
    ],
    fisio: [
      ['e-postura', 'Avaliação postural (anteriorização, escoliose, etc.)'],
      ['e-adm', 'ADM — Amplitude de Movimento (graus)'],
      ['e-forca', 'Força muscular (escala 0–5)'],
      ['e-sensibilidade', 'Sensibilidade / Parestesia / Dormência'],
      ['e-testes', 'Testes especiais (Lasègue, Phalen, Ortolani, etc.)'],
      ['e-palpacao', 'Dor à palpação / Pontos-gatilho'],
      ['e-edema', 'Edema / Inflamação / Temperatura local'],
      ['e-marcha', 'Avaliação de marcha / Equilíbrio'],
      ['e-hipotese', 'Diagnóstico fisioterapêutico'],
      ['e-obs', 'Observações gerais'],
    ],
    psico: [
      ['e-apresentacao', 'Apresentação geral (aparência, higiene, postura, contato visual)'],
      ['e-humor', 'Humor e afeto (eutímico, deprimido, eufórico, ansioso)'],
      ['e-pensamento', 'Curso e conteúdo do pensamento (acelerado, lento, ruminações)'],
      ['e-percepcao', 'Percepção (alucinações auditivas/visuais, ilusões)'],
      ['e-cognicao', 'Memória, atenção, concentração e orientação'],
      ['e-critica', 'Crítica e julgamento (insight sobre a condição)'],
      ['e-escala_phq', 'Escala PHQ-9 / GAD-7 (pontuação se aplicada)'],
      ['e-hipotese', 'Hipótese diagnóstica (CID-10 / DSM-5)'],
      ['e-plano', 'Plano terapêutico / Abordagem utilizada'],
      ['e-obs', 'Observações da sessão'],
    ],
    nutri: [
      ['e-peso', 'Peso atual (kg)'],
      ['e-altura', 'Altura (cm)'],
      ['e-imc', 'IMC (kg/m²)'],
      ['e-cc', 'Circunferência abdominal (cm)'],
      ['e-cq', 'Relação cintura/quadril'],
      ['e-gordura', 'Percentual de gordura corporal (%)'],
      ['e-massa_magra', 'Massa magra (kg)'],
      ['e-pressao', 'Pressão arterial'],
      ['e-exames_lab', 'Exames laboratoriais (glicose, HbA1c, colesterol, TG, TSH)'],
      ['e-meta_calorica', 'Meta calórica / VET prescrito (kcal/dia)'],
      ['e-plano', 'Plano alimentar / Orientações prescritas'],
      ['e-obs', 'Observações gerais'],
    ]
  }

  const currentAnamnesisFields = anamnesisFields[clinic.type] || anamnesisFields.odonto
  const currentClinicalExamFields = clinicalExamFields[clinic.type] || clinicalExamFields.odonto

  return (
    <div className={styles.wrap}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Identificação</h3>
        <div className={styles.grid2}>
          {[
            ['p-cpf','CPF'], ['p-rg','RG'], ['p-nasc','Data de Nascimento'],
            ['p-genero','Gênero'], ['p-ocupacao','Ocupação'], ['p-endereco','Endereço'],
            ['p-indicado','Como nos conheceu'], ['p-emergencia','Contato de Emergência'],
            ...(clinic.type === 'vet' ? [
              ['p-pet_especie', 'Espécie do Pet'],
              ['p-pet_raca', 'Raça'],
              ['p-pet_idade', 'Idade do Pet'],
              ['p-pet_peso', 'Peso do Pet (kg)'],
              ['p-pet_castrado', 'Castrado?'],
            ] : [])
          ].map(([k,l]) => (
            <div className={styles.field} key={k}>
              <label>{l as string}</label>
              <input value={anamnesis[k as string] ?? ''} onChange={(e) => setA(k as string, e.target.value)} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Anamnese</h3>
        <div className={styles.grid2}>
          {currentAnamnesisFields.map(([k, label]) => aField(k, label))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Exame Clínico</h3>
        <div className={styles.grid2}>
          {currentClinicalExamFields.map(([k, label]) => eField(k, label))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Plano de Tratamento</h3>
        <textarea
          className={styles.bigArea}
          rows={5}
          value={treatmentPlan}
          onChange={(e) => setTreatmentPlan(e.target.value)}
          placeholder="Descreva o plano de tratamento..."
        />
      </section>

      <section className={styles.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className={styles.sectionTitle} style={{ border: 'none', marginBottom: 0 }}>Contrato</h3>
          <button
            className={styles.btnPrint}
            onClick={() => printContrato(clinicInfo, patient, contractText)}
            type="button"
          >
            🖨️ Imprimir Contrato
          </button>
        </div>
        <textarea
          className={styles.bigArea}
          rows={10}
          value={contractText}
          onChange={(e) => setContractText(e.target.value)}
        />
      </section>

      <div className={styles.saveRow}>
        {saved && <span className={styles.savedMsg}>✓ Salvo com sucesso!</span>}
        <button
          className={styles.btnPrint}
          onClick={() => printProntuario(clinicInfo, patient, recordForPrint, entries)}
          type="button"
        >
          🖨️ Imprimir Prontuário
        </button>
        <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Ficha'}
        </button>
      </div>
    </div>
  )
}
