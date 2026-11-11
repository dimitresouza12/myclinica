'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { ownProfessionalLookup } from '@/lib/professionalScope'
import type { Patient, MedicalRecord, ClinicType, TreatmentPlanItem } from '@/types'
import type { AuthClinic } from '@/types'
import styles from './TabFicha.module.css'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import { CpfInput, DateInput, DecimalInput, IntegerInput, MoneyInput } from '@/components/ui/NumericInput'
import { cpfInputError, cpfToInputValue, dateBRToISO, dateInputError, isoToDateBR, previousCpfNote } from '@/lib/numericFormat'
import { PET_SPECIES, PET_BREEDS, VET_ANAMNESIS_EXTRA_BY_SPECIES, VET_EXAM_EXTRA_BY_SPECIES } from '@/lib/vetSpecies'
import { MEDICO_ANAMNESIS_EXTRA_BY_SPECIALTY, MEDICO_EXAM_EXTRA_BY_SPECIALTY, MEDICO_AREA_OPTIONS } from '@/lib/medicoSpecialties'
import { genderSelectOptions } from '@/lib/pacientes/gender'
import { PET_SEX_OPTIONS, buildPetColumns, microchipError, petAgeFromBirth, parseNeutered } from '@/lib/pacientes/pet'
import { usePetExtraColumns } from '@/lib/pacientes/petColumns'
import { medicoExtrasKey, medicoSelectValue } from '@/lib/medico/subspecialty'
import { calcBmi, bmiSummary, calcGestation, gestationSummary } from '@/lib/medico/clinicalCalc'
import { hojeBrasil } from '@/lib/brasilDate'
import { registrarPesoDaFicha } from '@/lib/vet/storage'
import { getSpecialtyConfig, CLINIC_TYPE_LABELS } from '@/lib/specialtyConfig'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { CidSearch } from './CidSearch'
import { rehydrateMap, rehydrateValue } from './fichaRehydrate'
import { SIGILO_ATIVO } from '@/lib/sigilo'

interface Props {
  patient: Patient
  record: MedicalRecord | null
  clinic: AuthClinic
  clinicId: string
  onSaved: () => void
  /** Avisa o prontuário do que está em edição (inclusive o não salvo) e da área exibida: é o que o menu Imprimir usa. */
  onDraftChange?: (record: MedicalRecord, area: ClinicType) => void
  /** Avisa o prontuário quando a Ficha tem alterações ainda não salvas (para o aviso de sair sem salvar). */
  onDirtyChange?: (dirty: boolean) => void
  /** Atalho para a aba Documentos (onde o contrato mora agora). */
  onOpenDocuments?: () => void
}

/** Campos de identificação exibidos na Ficha, a partir do cadastro do paciente. */
function buildPatientInfo(patient: Patient): Record<string, string> {
  return {
    'p-cpf':        cpfToInputValue(patient.cpf),
    'p-rg':         patient.rg ?? '',
    'p-nasc':       isoToDateBR(patient.birth_date),
    'p-genero':     patient.gender ?? '',
    'p-ocupacao':   patient.occupation ?? '',
    'p-endereco':   patient.address ?? '',
    'p-indicado':   patient.referred_by ?? '',
    'p-emergencia': patient.emergency_contact ?? '',
    'p-notes':      patient.notes ?? '',
    // campos veterinários
    'p-pet_nome':     patient.pet_name ?? '',
    'p-pet_especie':  patient.pet_species ?? '',
    'p-pet_raca':     patient.pet_breed ?? '',
    'p-pet_idade':    patient.pet_age ?? '',
    'p-pet_peso':     patient.pet_weight != null ? String(patient.pet_weight) : '',
    'p-pet_castrado': patient.pet_neutered != null ? (patient.pet_neutered ? 'Sim' : 'Não') : '',
    'p-pet_pelagem':  patient.pet_coat ?? '',
    'p-pet_sexo':     patient.pet_sex ?? '',
    'p-pet_nasc':     isoToDateBR(patient.pet_birth_date),
    'p-pet_chip':     patient.pet_microchip ?? '',
  }
}

export function TabFicha({ patient, record, clinic, clinicId, onSaved, onDraftChange, onDirtyChange, onOpenDocuments }: Props) {
  const { user } = useAuthStore()
  const clinicSpecialties = clinic.specialties?.length ? clinic.specialties : [clinic.type]
  // Qual ficha exibir: a área do profissional logado (specialty_type),
  // ou — pra admin/recepção, que não têm área própria — um seletor.
  // Clínica de uma área só nunca mostra o seletor: cai direto na única
  // área, comportamento idêntico ao de antes do Bloco B.
  const [viewArea, setViewArea] = useState<ClinicType>(user?.specialtyType ?? clinicSpecialties[0])
  const canPickArea = !user?.specialtyType && clinicSpecialties.length > 1

  // Sub-área do profissional logado (Bloco F) — só usada quando
  // viewArea === 'medico', pra somar campos extras de anamnese/exame por
  // cima da ficha base (ex: cardiologista vê ausculta detalhada, pediatra
  // vê marcos do desenvolvimento). Vem de professionals.specialty (texto
  // livre), resolvido pelo clinic_user_id do login atual.
  const [myMedicoSpecialty, setMyMedicoSpecialty] = useState<string | null>(null)
  // Sub-especialidade exibida na ficha médica (seletor no topo). Padrão: a do profissional logado, casada por
  // aproximação ("Cardiologista" vira Cardiologia); a escolha manual fica guardada neste navegador.
  const medicoSubStorageKey = `myclinica:medicoSub:${clinicId}:${user?.id ?? ''}`
  const [medicoSubChoice, setMedicoSubChoice] = useState<string | null>(() => {
    try { return typeof window === 'undefined' ? null : window.localStorage.getItem(medicoSubStorageKey) } catch { return null }
  })
  const medicoSub = medicoSubChoice ?? medicoSelectValue(myMedicoSpecialty)
  function chooseMedicoSub(v: string) {
    setMedicoSubChoice(v)
    try { window.localStorage.setItem(medicoSubStorageKey, v) } catch { /* sem armazenamento: vale só nesta tela */ }
  }
  // Resolvido por user.professionalId quando existe (na conta de demonstração é o profissional da
  // área escolhida; numa clínica real é o mesmo vínculo clinic_user_id de antes) e, sem ele, pelo
  // clinic_user_id do login.
  const ownLookup = ownProfessionalLookup(user)
  const ownLookupColumn = ownLookup?.column
  const ownLookupValue = ownLookup?.value
  useEffect(() => {
    if (!ownLookupColumn || !ownLookupValue || viewArea !== 'medico') { setMyMedicoSpecialty(null); return }
    supabase.from('professionals').select('specialty')
      .eq('clinic_id', clinicId).eq(ownLookupColumn, ownLookupValue)
      .maybeSingle()
      .then(({ data }) => setMyMedicoSpecialty(data?.specialty ?? null))
  }, [clinicId, ownLookupColumn, ownLookupValue, viewArea])

  // Bloco G: campos personalizados por área — se o profissional sente
  // falta de uma pergunta específica da prática dele, ele mesmo adiciona.
  // Isolado por clínica + área (specialty_type), igual o resto da ficha.
  const { canEdit: canEditProntuario } = usePermissions('prontuario')
  interface CustomField { id: string; section: 'anamnesis' | 'clinical_exam'; field_key: string; label: string }
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [addingField, setAddingField] = useState<'anamnesis' | 'clinical_exam' | null>(null)
  const [newFieldLabel, setNewFieldLabel] = useState('')

  const loadCustomFields = useCallback(() => {
    supabase.from('clinic_custom_record_fields')
      .select('id, section, field_key, label')
      .eq('clinic_id', clinicId).eq('specialty_type', viewArea)
      .order('sort_order')
      .then(({ data }) => setCustomFields((data as CustomField[]) ?? []))
  }, [clinicId, viewArea])

  useEffect(() => { loadCustomFields() }, [loadCustomFields])

  async function handleAddCustomField(section: 'anamnesis' | 'clinical_exam') {
    const label = newFieldLabel.trim()
    if (!label) return
    const fieldKey = `custom-${Date.now().toString(36)}`
    await supabase.from('clinic_custom_record_fields').insert([{
      clinic_id: clinicId, specialty_type: viewArea, section,
      field_key: fieldKey, label,
      sort_order: customFields.filter(f => f.section === section).length,
      created_by: user?.clinicUserId ?? null,
    }])
    setNewFieldLabel('')
    setAddingField(null)
    loadCustomFields()
  }

  async function handleRemoveCustomField(id: string) {
    await supabase.from('clinic_custom_record_fields').delete().eq('id', id)
    loadCustomFields()
  }

  // Identificação do paciente (CPF, RG, pet...) não é por área — é do
  // paciente. Vem sempre de `patients`, não do jsonb namespaced (Bloco B):
  // antes ficava duplicada dentro de `anamnesis`, o que não faz sentido
  // quando `anamnesis` passa a ser por área.
  const petExtras = usePetExtraColumns()
  const [breedOther, setBreedOther] = useState(false)
  const [patientInfo, setPatientInfo] = useState<Record<string, string>>({})
  const [anamnesis, setAnamnesis] = useState<Record<string, string>>({})
  const [clinicalExam, setClinicalExam] = useState<Record<string, string>>({})
  const [treatmentPlan, setTreatmentPlan] = useState('')
  const [treatmentPlanItems, setTreatmentPlanItems] = useState<TreatmentPlanItem[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Último valor carregado de cada parte. Recarregar (outra aba salvou) só troca o que a pessoa não editou.
  const patientBaseRef = useRef<{ id: string; info: Record<string, string> } | null>(null)
  const recordBaseRef = useRef<{ area: ClinicType; anamnesis: Record<string, string>; clinicalExam: Record<string, string>; treatmentPlan: string; items: TreatmentPlanItem[] } | null>(null)

  useEffect(() => {
    const next = buildPatientInfo(patient)
    const base = patientBaseRef.current
    patientBaseRef.current = { id: patient.id, info: next }
    if (!base || base.id !== patient.id) {
      setPatientInfo(next)
      setBreedOther(false)
    } else {
      setPatientInfo((cur) => rehydrateMap(base.info, next, cur))
    }
  }, [patient])

  useEffect(() => {
    const next = {
      area: viewArea,
      anamnesis: record?.anamnesis?.[viewArea] ?? {},
      clinicalExam: record?.clinical_exam?.[viewArea] ?? {},
      treatmentPlan: record?.treatment_plan ?? '',
      items: record?.treatment_plan_items ?? [],
    }
    const base = recordBaseRef.current
    recordBaseRef.current = next
    if (!base || base.area !== viewArea) {
      setAnamnesis(next.anamnesis)
      setClinicalExam(next.clinicalExam)
      setTreatmentPlan(next.treatmentPlan)
      setTreatmentPlanItems(next.items)
    } else {
      setAnamnesis((cur) => rehydrateMap(base.anamnesis, next.anamnesis, cur))
      setClinicalExam((cur) => rehydrateMap(base.clinicalExam, next.clinicalExam, cur))
      setTreatmentPlan((cur) => rehydrateValue(base.treatmentPlan, next.treatmentPlan, cur))
      setTreatmentPlanItems((cur) => rehydrateValue(base.items, next.items, cur))
    }
  }, [record, viewArea])

  // Alterações não salvas: compara o que está na tela com o que veio do cadastro/prontuário (ou com o último salvo).
  // Enquanto a Ficha ainda não carregou os campos (primeira renderização), não conta como alteração.
  const snapshot = JSON.stringify([patientInfo, anamnesis, clinicalExam, treatmentPlan, treatmentPlanItems])
  const loadedSnapshot = JSON.stringify([
    buildPatientInfo(patient),
    record?.anamnesis?.[viewArea] ?? {},
    record?.clinical_exam?.[viewArea] ?? {},
    record?.treatment_plan ?? '',
    record?.treatment_plan_items ?? [],
  ])
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const dirty = Object.keys(patientInfo).length > 0 && snapshot !== loadedSnapshot && snapshot !== savedSnapshot
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  function setP(k: string, v: string) { setPatientInfo((p) => ({ ...p, [k]: v })) }
  function setA(k: string, v: string) { setAnamnesis((p) => ({ ...p, [k]: v })) }
  function setE(k: string, v: string) { setClinicalExam((p) => ({ ...p, [k]: v })) }

  function addTreatmentItem() {
    setTreatmentPlanItems((items) => [...items, { id: crypto.randomUUID(), description: '', value: null }])
  }
  function updateTreatmentItem(id: string, patch: Partial<TreatmentPlanItem>) {
    setTreatmentPlanItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }
  function removeTreatmentItem(id: string) {
    setTreatmentPlanItems((items) => items.filter((it) => it.id !== id))
  }
  const treatmentPlanTotal = treatmentPlanItems.reduce((sum, it) => sum + (it.value ?? 0), 0)

  async function handleSave() {
    // CPF com os 11 números e nascimento como data real: se estiver errado, avisa antes de gravar
    const cpfError = cpfInputError(patientInfo['p-cpf'])
    if (cpfError) { showToast('error', cpfError); return }
    const birthError = dateInputError(patientInfo['p-nasc'])
    if (birthError) { showToast('error', birthError); return }
    if (viewArea === 'vet' && petExtras) {
      const chipError = microchipError(patientInfo['p-pet_chip'] ?? '')
      if (chipError) { showToast('error', chipError); return }
      const petBirthError = dateInputError(patientInfo['p-pet_nasc'])
      if (petBirthError) { showToast('error', `Nascimento do pet: ${petBirthError.charAt(0).toLowerCase()}${petBirthError.slice(1)}`); return }
    }
    // CPF antigo que o campo não mostra (incompleto) e que não foi digitado de novo: mantém, não apaga
    const keepOldCpf = !patientInfo['p-cpf'] && !!patient.cpf?.trim() && cpfToInputValue(patient.cpf) === ''
    setSaving(true)
    try {
      const payload = {
        clinic_id: clinicId,
        patient_id: patient.id,
        anamnesis: { ...(record?.anamnesis ?? {}), [viewArea]: anamnesis },
        clinical_exam: { ...(record?.clinical_exam ?? {}), [viewArea]: clinicalExam },
        treatment_plan: treatmentPlan,
        treatment_plan_items: treatmentPlanItems,
        // contract_text não é enviado: o contrato saiu da Ficha e o texto já salvo fica intacto (leitura na aba Documentos)
        updated_at: new Date().toISOString(),
      }
      if (record?.id) {
        await supabase.from('medical_records').update(payload).eq('id', record.id)
      } else {
        await supabase.from('medical_records').insert([payload])
      }

      // Colunas do pet. Peso: só grava se mudou na Ficha; sem isso uma Ficha aberta há tempo apagaria o peso
      // mais recente registrado na aba Vacinas e peso. Quando muda, também entra no histórico de pesagens.
      const petCols = buildPetColumns({
        nome: patientInfo['p-pet_nome'] ?? '',
        especie: patientInfo['p-pet_especie'] ?? '',
        raca: patientInfo['p-pet_raca'] ?? '',
        sexo: patientInfo['p-pet_sexo'] ?? '',
        nascimentoISO: petExtras ? (dateBRToISO(patientInfo['p-pet_nasc']) ?? '') : '',
        castrado: patientInfo['p-pet_castrado'] ?? '',
        peso: patientInfo['p-pet_peso'] ?? '',
        pelagem: patientInfo['p-pet_pelagem'] ?? '',
        microchip: patientInfo['p-pet_chip'] ?? '',
        idadeTexto: patientInfo['p-pet_idade'] ?? '',
      }, { extras: petExtras })
      if (viewArea === 'vet') {
        const novoPeso = (petCols.pet_weight as number | null) ?? null
        if (novoPeso === (patient.pet_weight ?? null)) delete petCols.pet_weight
        else if (novoPeso !== null) await registrarPesoDaFicha({ clinicId, patientId: patient.id, kg: novoPeso, hoje: hojeBrasil() })
      }

      // Sincroniza campos de identificação de volta para a tabela patients
      await supabase.from('patients').update({
        cpf:               keepOldCpf ? patient.cpf : (patientInfo['p-cpf'] || null),
        rg:                patientInfo['p-rg'] || null,
        birth_date:        dateBRToISO(patientInfo['p-nasc']),
        gender:            patientInfo['p-genero'] || null,
        occupation:        patientInfo['p-ocupacao'] || null,
        address:           patientInfo['p-endereco'] || null,
        referred_by:       patientInfo['p-indicado'] || null,
        emergency_contact: patientInfo['p-emergencia'] || null,
        notes:             patientInfo['p-notes'] || null,
        ...petCols,
      }).eq('id', patient.id)

      setSavedSnapshot(snapshot)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  // o que a Ficha tem em edição, para o menu Imprimir do prontuário
  useEffect(() => {
    if (!onDraftChange) return
    onDraftChange({
      ...(record ?? {} as MedicalRecord),
      anamnesis: { ...(record?.anamnesis ?? {}), [viewArea]: anamnesis },
      clinical_exam: { ...(record?.clinical_exam ?? {}), [viewArea]: clinicalExam },
      treatment_plan: treatmentPlan,
      treatment_plan_items: treatmentPlanItems,
    }, viewArea)
  }, [onDraftChange, record, viewArea, anamnesis, clinicalExam, treatmentPlan, treatmentPlanItems])

  const pField = (k: string, label: string) => (
    <div className={styles.field} key={k}>
      <label>{label}</label>
      <input value={patientInfo[k] ?? ''} onChange={(e) => setP(k, e.target.value)} />
    </div>
  )
  // Medicina: DUM como data (calcula IG e DPP). Texto antigo que não é data continua no campo livre.
  function setDum(v: string) {
    setA('a-dum', v)
    const iso = dateBRToISO(v)
    const summary = iso ? gestationSummary(iso, hojeBrasil()) : ''
    if (summary && medicoExtrasKey(medicoSub) === 'Ginecologia') setA('a-semanas_gestacao', summary)
  }
  // Medicina: peso e altura calculam o IMC e preenchem o campo "Peso / Altura / IMC"
  function setAnthropometry(k: 'e-peso_kg' | 'e-altura_cm', v: string) {
    setClinicalExam(prev => {
      const next = { ...prev, [k]: v }
      const summary = bmiSummary(next['e-peso_kg'] ?? '', next['e-altura_cm'] ?? '')
      if (summary) next['e-antropometria'] = summary
      return next
    })
  }
  const aField = (k: string, label: string, customId?: string) => viewArea === 'medico' && k === 'a-dum' && /^[\d/]*$/.test(anamnesis[k] ?? '') ? (
    <div className={styles.field} key={k}>
      <label>{label}</label>
      <DateInput value={anamnesis[k] ?? ''} onChange={setDum} />
      {(() => {
        const iso = dateBRToISO(anamnesis[k])
        const g = iso ? calcGestation(iso, hojeBrasil()) : null
        return g ? <span className={styles.fieldHelp}>IG {g.label} · DPP {g.dpp.slice(8, 10)}/{g.dpp.slice(5, 7)}/{g.dpp.slice(0, 4)}</span> : null
      })()}
    </div>
  ) : (
    <div className={styles.field} key={k}>
      <label>
        {label}
        {customId && canEditProntuario && (
          <button type="button" className={styles.btnRemoveCustomField} title="Remover campo" onClick={() => handleRemoveCustomField(customId)}>
            <Icon name="close" size={11} />
          </button>
        )}
      </label>
      <textarea rows={2} value={anamnesis[k] ?? ''} onChange={(e) => setA(k, e.target.value)} />
    </div>
  )
  const eField = (k: string, label: string, customId?: string) => (
    <div className={styles.field} key={k}>
      <label>
        {label}
        {customId && canEditProntuario && (
          <button type="button" className={styles.btnRemoveCustomField} title="Remover campo" onClick={() => handleRemoveCustomField(customId)}>
            <Icon name="close" size={11} />
          </button>
        )}
      </label>
      <textarea rows={2} value={clinicalExam[k] ?? ''} onChange={(e) => setE(k, e.target.value)} />
      {viewArea === 'medico' && k === 'e-hipotese' && (
        <CidSearch onPick={text => setE(k, clinicalExam[k]?.trim() ? `${clinicalExam[k]!.trimEnd()}\n${text}` : text)} />
      )}
    </div>
  )

  const specialty = getSpecialtyConfig(viewArea)

  const petSpecies = patientInfo['p-pet_especie'] ?? ''
  const baseAnamnesisFields = viewArea === 'vet'
    ? [...specialty.anamnesisFields, ...(VET_ANAMNESIS_EXTRA_BY_SPECIES[petSpecies] ?? [])]
    : viewArea === 'medico'
    ? [...specialty.anamnesisFields, ...(MEDICO_ANAMNESIS_EXTRA_BY_SPECIALTY[medicoExtrasKey(medicoSub) ?? ''] ?? [])]
    : specialty.anamnesisFields
  const baseClinicalExamFields = viewArea === 'vet'
    ? [...specialty.clinicalExamFields, ...(VET_EXAM_EXTRA_BY_SPECIES[petSpecies] ?? [])]
    : viewArea === 'medico'
    ? [...specialty.clinicalExamFields, ...(MEDICO_EXAM_EXTRA_BY_SPECIALTY[medicoExtrasKey(medicoSub) ?? ''] ?? [])]
    : specialty.clinicalExamFields

  // Bloco G: campos personalizados da clínica pra essa área, concatenados
  // no final de cada seção.
  const customAnamnesisFields = customFields.filter(f => f.section === 'anamnesis')
  const customClinicalExamFields = customFields.filter(f => f.section === 'clinical_exam')
  const currentAnamnesisFields: [string, string][] = [...baseAnamnesisFields, ...customAnamnesisFields.map(f => [f.field_key, f.label] as [string, string])]
  const currentClinicalExamFields: [string, string][] = [...baseClinicalExamFields, ...customClinicalExamFields.map(f => [f.field_key, f.label] as [string, string])]

  return (
    <div className={styles.wrap}>
      {viewArea === 'psico' && (
        <p className={styles.psicoNotice} role="note">
          A Ficha Clínica é compartilhada com a equipe autorizada da clínica.{' '}
          {SIGILO_ATIVO
            ? 'Registros privativos do psicólogo (Res. CFP 001/2009) devem ser feitos na aba Evolução, como anotação pessoal sigilosa.'
            : 'Esta ficha não tem sigilo individual: evite registrar aqui anotações privativas do psicólogo (Res. CFP 001/2009).'}
        </p>
      )}
      {canPickArea && (
        <section className={styles.section}>
          <div className={styles.field}>
            <label>Ver ficha da área</label>
            <SelectMenu variant="field" ariaLabel="Ver ficha da área" value={viewArea}
              onChange={v => setViewArea(v as ClinicType)}
              options={clinicSpecialties.map(t => ({ value: t, label: CLINIC_TYPE_LABELS[t] }))} />
          </div>
        </section>
      )}

      {viewArea === 'medico' && (
        <section className={styles.section}>
          <div className={styles.field}>
            <label>Sub-especialidade médica</label>
            <SelectMenu variant="field" ariaLabel="Sub-especialidade médica" value={medicoSub}
              onChange={chooseMedicoSub}
              options={MEDICO_AREA_OPTIONS.map(o => ({ value: o, label: o }))} />
            <span className={styles.fieldHelp}>Muda os campos extras de anamnese e exame clínico desta ficha.</span>
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Identificação</h3>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label>CPF</label>
            <CpfInput value={patientInfo['p-cpf'] ?? ''} onChange={v => setP('p-cpf', v)} />
            {previousCpfNote(patient.cpf) && <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Valor anterior no cadastro: {previousCpfNote(patient.cpf)}. Confira e digite os 11 números.</small>}
          </div>
          {pField('p-rg', 'RG')}

          <div className={styles.field}>
            <label>Data de Nascimento</label>
            <DateInput value={patientInfo['p-nasc'] ?? ''} onChange={v => setP('p-nasc', v)} />
          </div>

          <div className={styles.field}>
            <label>Gênero</label>
            <SelectMenu variant="field" ariaLabel="Gênero" value={patientInfo['p-genero'] ?? ''}
              onChange={v => setP('p-genero', v)}
              options={genderSelectOptions(patientInfo['p-genero'])} />
          </div>

          {pField('p-ocupacao', 'Ocupação')}
          {pField('p-endereco', 'Endereço')}
          {pField('p-indicado', 'Como nos conheceu')}
          {pField('p-emergencia', 'Contato de Emergência')}

          {viewArea === 'vet' && (
            <>
              <div className={styles.field}>
                <label>Nome do Pet</label>
                <input value={patientInfo['p-pet_nome'] ?? ''} onChange={e => setP('p-pet_nome', e.target.value)} />
              </div>

              <div className={styles.field}>
                <label>Espécie</label>
                <SelectMenu
                  variant="field"
                  ariaLabel="Espécie"
                  value={petSpecies}
                  onChange={newSpecies => {
                    setP('p-pet_especie', newSpecies)
                    const breedList = PET_BREEDS[newSpecies] ?? []
                    const currentRaca = patientInfo['p-pet_raca'] ?? ''
                    if (currentRaca && !breedList.includes(currentRaca)) setP('p-pet_raca', '')
                  }}
                  options={[{ value: '', label: 'Selecionar' }, ...PET_SPECIES.map(s => ({ value: s, label: s }))]}
                />
              </div>

              {(() => {
                const breedList = PET_BREEDS[petSpecies] ?? []
                const racaValue = patientInfo['p-pet_raca'] ?? ''
                if (breedList.length === 0) {
                  return (
                    <div className={styles.field}>
                      <label>Raça</label>
                      <input
                        value={racaValue}
                        onChange={e => setP('p-pet_raca', e.target.value)}
                        placeholder={petSpecies ? 'Digite a raça' : 'Selecione a espécie primeiro'}
                      />
                    </div>
                  )
                }
                // "Outra": raça fora da lista (já gravada ou escolhida agora) libera o campo de texto
                const isOther = breedOther || (racaValue !== '' && !breedList.includes(racaValue))
                return (
                  <>
                    <div className={styles.field}>
                      <label>Raça</label>
                      <SelectMenu
                        variant="field"
                        ariaLabel="Raça"
                        value={isOther ? 'Outra' : racaValue}
                        onChange={v => {
                          if (v === 'Outra') { setBreedOther(true); if (breedList.includes(racaValue)) setP('p-pet_raca', '') }
                          else { setBreedOther(false); setP('p-pet_raca', v) }
                        }}
                        options={[{ value: '', label: 'Selecionar' }, ...breedList.map(b => ({ value: b, label: b }))]}
                      />
                    </div>
                    {isOther && (
                      <div className={styles.field}>
                        <label>Qual raça?</label>
                        <input
                          value={racaValue}
                          onChange={e => setP('p-pet_raca', e.target.value)}
                          placeholder="Digite a raça"
                        />
                      </div>
                    )}
                  </>
                )
              })()}

              {petExtras && (
                <div className={styles.field}>
                  <label>Sexo</label>
                  <SelectMenu variant="field" ariaLabel="Sexo do pet" value={patientInfo['p-pet_sexo'] ?? ''}
                    onChange={v => setP('p-pet_sexo', v)}
                    options={[{ value: '', label: 'Selecionar' }, ...PET_SEX_OPTIONS]} />
                </div>
              )}

              {petExtras ? (
                <div className={styles.field}>
                  <label>Nascimento do pet (ou data estimada)</label>
                  <DateInput value={patientInfo['p-pet_nasc'] ?? ''} onChange={v => setP('p-pet_nasc', v)} />
                  {petAgeFromBirth(dateBRToISO(patientInfo['p-pet_nasc'])) && (
                    <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Idade: {petAgeFromBirth(dateBRToISO(patientInfo['p-pet_nasc']))}</small>
                  )}
                  {!patientInfo['p-pet_nasc'] && patientInfo['p-pet_idade'] && (
                    <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Idade anotada antes: {patientInfo['p-pet_idade']}. Informe o nascimento para a idade se atualizar sozinha.</small>
                  )}
                </div>
              ) : (
                <div className={styles.field}>
                  <label>Idade do Pet</label>
                  <input value={patientInfo['p-pet_idade'] ?? ''} onChange={e => setP('p-pet_idade', e.target.value)} />
                </div>
              )}

              <div className={styles.field}>
                <label>Peso do Pet (kg)</label>
                <DecimalInput value={patientInfo['p-pet_peso'] ?? ''} onChange={v => setP('p-pet_peso', v)} max={500} decimals={2} placeholder="0" />
              </div>

              <div className={styles.field}>
                <label>Castrado?</label>
                <SelectMenu variant="field" ariaLabel="Castrado" value={parseNeutered(patientInfo['p-pet_castrado']) == null ? '' : parseNeutered(patientInfo['p-pet_castrado']) ? 'Sim' : 'Não'}
                  onChange={v => setP('p-pet_castrado', v)}
                  options={[{ value: '', label: 'Selecionar' }, { value: 'Sim', label: 'Sim' }, { value: 'Não', label: 'Não' }]} />
              </div>

              <div className={styles.field}>
                <label>Pelagem</label>
                <input value={patientInfo['p-pet_pelagem'] ?? ''} onChange={e => setP('p-pet_pelagem', e.target.value)} placeholder="Ex: caramelo" />
              </div>

              {petExtras && (
                <div className={styles.field}>
                  <label>Microchip</label>
                  <input value={patientInfo['p-pet_chip'] ?? ''} inputMode="numeric" autoComplete="off"
                    onChange={e => setP('p-pet_chip', e.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="15 números, se houver" />
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.field} style={{ marginTop: '0.75rem' }}>
          <label>Observações sobre o paciente</label>
          <textarea rows={2} value={patientInfo['p-notes'] ?? ''} onChange={e => setP('p-notes', e.target.value)} />
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Anamnese</h3>
        <div className={styles.grid2}>
          {currentAnamnesisFields.map(([k, label]) => aField(k, label, customAnamnesisFields.find(f => f.field_key === k)?.id))}
        </div>
        {canEditProntuario && (
          addingField === 'anamnesis' ? (
            <div className={styles.field} style={{ marginTop: '0.5rem' }}>
              <input
                autoFocus
                placeholder="Nome do novo campo"
                value={newFieldLabel}
                onChange={e => setNewFieldLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddCustomField('anamnesis'); if (e.key === 'Escape') { setAddingField(null); setNewFieldLabel('') } }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                <button type="button" className={styles.btnSave} onClick={() => handleAddCustomField('anamnesis')}>Adicionar</button>
                <button type="button" className={styles.btnPrint} onClick={() => { setAddingField(null); setNewFieldLabel('') }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button type="button" className={styles.btnAddCustomField} onClick={() => setAddingField('anamnesis')}>+ Adicionar campo</button>
          )
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Exame Clínico</h3>
        {viewArea === 'medico' && (
          <div className={styles.calcBox}>
            <h4 className={styles.calcTitle}>Calculadora de IMC</h4>
            <div className={styles.calcRow}>
              <div className={styles.field}>
                <label>Peso (kg)</label>
                <DecimalInput value={clinicalExam['e-peso_kg'] ?? ''} onChange={v => setAnthropometry('e-peso_kg', v)} max={500} decimals={1} placeholder="0" />
              </div>
              <div className={styles.field}>
                <label>Altura (cm)</label>
                <IntegerInput value={clinicalExam['e-altura_cm'] ?? ''} onChange={v => setAnthropometry('e-altura_cm', v)} max={250} placeholder="0" />
              </div>
            </div>
            {(() => {
              const bmi = calcBmi(clinicalExam['e-peso_kg'] ?? '', clinicalExam['e-altura_cm'] ?? '')
              return bmi
                ? <p className={styles.calcResult}>IMC {bmi.text} kg/m² ({bmi.category})</p>
                : <p className={styles.calcHint}>Informe peso e altura para calcular. O resultado preenche o campo Peso / Altura / IMC.</p>
            })()}
          </div>
        )}
        <div className={styles.grid2}>
          {currentClinicalExamFields.map(([k, label]) => eField(k, label, customClinicalExamFields.find(f => f.field_key === k)?.id))}
        </div>
        {canEditProntuario && (
          addingField === 'clinical_exam' ? (
            <div className={styles.field} style={{ marginTop: '0.5rem' }}>
              <input
                autoFocus
                placeholder="Nome do novo campo"
                value={newFieldLabel}
                onChange={e => setNewFieldLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddCustomField('clinical_exam'); if (e.key === 'Escape') { setAddingField(null); setNewFieldLabel('') } }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                <button type="button" className={styles.btnSave} onClick={() => handleAddCustomField('clinical_exam')}>Adicionar</button>
                <button type="button" className={styles.btnPrint} onClick={() => { setAddingField(null); setNewFieldLabel('') }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button type="button" className={styles.btnAddCustomField} onClick={() => setAddingField('clinical_exam')}>+ Adicionar campo</button>
          )
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Plano de Tratamento / Orçamento</h3>

        <div className={styles.treatmentItems}>
          {treatmentPlanItems.map((item) => (
            <div className={styles.treatmentItemRow} key={item.id}>
              <input
                type="text"
                className={styles.treatmentItemDesc}
                value={item.description}
                placeholder="Ex: Exo 15 + dente, Faceta 11..."
                onChange={(e) => updateTreatmentItem(item.id, { description: e.target.value })}
              />
              <MoneyInput
                className={styles.treatmentItemValue}
                value={item.value}
                placeholder="R$"
                onChange={(v) => updateTreatmentItem(item.id, { value: v === '' ? null : Number(v) })}
              />
              <button type="button" className={styles.treatmentItemRemove} onClick={() => removeTreatmentItem(item.id)} aria-label="Remover item">
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className={styles.treatmentItemsFooter}>
          <button type="button" className={styles.btnAddCustomField} onClick={addTreatmentItem}>+ Adicionar item</button>
          {treatmentPlanItems.length > 0 && (
            <span className={styles.treatmentTotal}>
              Total: {treatmentPlanTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          )}
        </div>

        <label className={styles.treatmentNoteLabel}>Observação geral</label>
        <textarea
          className={styles.bigArea}
          rows={3}
          value={treatmentPlan}
          onChange={(e) => setTreatmentPlan(e.target.value)}
          placeholder="Observações gerais sobre o plano de tratamento..."
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Contrato</h3>
        <p className={styles.contractNote}>
          O contrato não é mais editado na Ficha. O texto que já estava salvo continua guardado e pode ser consultado na aba Documentos.
          {onOpenDocuments && <> <button type="button" className={styles.contractLink} onClick={onOpenDocuments}>Abrir Documentos</button></>}
        </p>
      </section>

      <div className={styles.saveRow}>
        {saved && <span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo com sucesso!</span>}
        <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Ficha'}
        </button>
      </div>
    </div>
  )
}
