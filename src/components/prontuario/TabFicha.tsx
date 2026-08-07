'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/usePermissions'
import type { Patient, MedicalRecord, RecordEntry, ClinicType } from '@/types'
import type { AuthClinic } from '@/types'
import { printProntuario, printContrato } from '@/lib/print'
import styles from './TabFicha.module.css'
import { Icon } from '@/components/ui/Icon'
import { PET_SPECIES, PET_BREEDS, VET_ANAMNESIS_EXTRA_BY_SPECIES, VET_EXAM_EXTRA_BY_SPECIES } from '@/lib/vetSpecies'
import { MEDICO_ANAMNESIS_EXTRA_BY_SPECIALTY, MEDICO_EXAM_EXTRA_BY_SPECIALTY } from '@/lib/medicoSpecialties'
import { getSpecialtyConfig, CLINIC_TYPE_LABELS } from '@/lib/specialtyConfig'

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
  useEffect(() => {
    if (!user?.clinicUserId || viewArea !== 'medico') { setMyMedicoSpecialty(null); return }
    supabase.from('professionals').select('specialty')
      .eq('clinic_id', clinicId).eq('clinic_user_id', user.clinicUserId)
      .maybeSingle()
      .then(({ data }) => setMyMedicoSpecialty(data?.specialty ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, user?.clinicUserId, viewArea])

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
  const [patientInfo, setPatientInfo] = useState<Record<string, string>>({})
  const [anamnesis, setAnamnesis] = useState<Record<string, string>>({})
  const [clinicalExam, setClinicalExam] = useState<Record<string, string>>({})
  const [treatmentPlan, setTreatmentPlan] = useState('')
  const [contractText, setContractText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function formatDateBR(iso: string | null) {
    if (!iso) return ''
    const d = iso.slice(0, 10).split('-')
    if (d.length !== 3) return iso
    return `${d[2]}/${d[1]}/${d[0]}`
  }

  useEffect(() => {
    setPatientInfo({
      'p-cpf':        patient.cpf ?? '',
      'p-rg':         patient.rg ?? '',
      'p-nasc':       formatDateBR(patient.birth_date),
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
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient])

  useEffect(() => {
    setAnamnesis(record?.anamnesis?.[viewArea] ?? {})
    setClinicalExam(record?.clinical_exam?.[viewArea] ?? {})
    setTreatmentPlan(record?.treatment_plan ?? '')
    setContractText(record?.contract_text ?? CONTRACT_TEMPLATE(clinicName, patient.name, viewArea))
  }, [record, viewArea, clinicName, patient.name])

  function setP(k: string, v: string) { setPatientInfo((p) => ({ ...p, [k]: v })) }
  function setA(k: string, v: string) { setAnamnesis((p) => ({ ...p, [k]: v })) }
  function setE(k: string, v: string) { setClinicalExam((p) => ({ ...p, [k]: v })) }

  function parseDateISO(br: string): string | null {
    if (!br) return null
    const parts = br.split('/')
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
    if (/^\d{4}-\d{2}-\d{2}$/.test(br)) return br
    return null
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        clinic_id: clinicId,
        patient_id: patient.id,
        anamnesis: { ...(record?.anamnesis ?? {}), [viewArea]: anamnesis },
        clinical_exam: { ...(record?.clinical_exam ?? {}), [viewArea]: clinicalExam },
        treatment_plan: treatmentPlan,
        contract_text: contractText,
        updated_at: new Date().toISOString(),
      }
      if (record?.id) {
        await supabase.from('medical_records').update(payload).eq('id', record.id)
      } else {
        await supabase.from('medical_records').insert([payload])
      }

      // Sincroniza campos de identificação de volta para a tabela patients
      await supabase.from('patients').update({
        cpf:               patientInfo['p-cpf'] || null,
        rg:                patientInfo['p-rg'] || null,
        birth_date:        parseDateISO(patientInfo['p-nasc'] ?? ''),
        gender:            patientInfo['p-genero'] || null,
        occupation:        patientInfo['p-ocupacao'] || null,
        address:           patientInfo['p-endereco'] || null,
        referred_by:       patientInfo['p-indicado'] || null,
        emergency_contact: patientInfo['p-emergencia'] || null,
        notes:             patientInfo['p-notes'] || null,
        pet_name:          patientInfo['p-pet_nome'] || null,
        pet_species:       patientInfo['p-pet_especie'] || null,
        pet_breed:         patientInfo['p-pet_raca'] || null,
        pet_age:           patientInfo['p-pet_idade'] || null,
        pet_weight:        patientInfo['p-pet_peso'] ? Number(patientInfo['p-pet_peso']) : null,
        pet_neutered:      patientInfo['p-pet_castrado'] ? patientInfo['p-pet_castrado'] === 'Sim' : null,
      }).eq('id', patient.id)

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
    anamnesis: { ...(record?.anamnesis ?? {}), [viewArea]: anamnesis },
    clinical_exam: { ...(record?.clinical_exam ?? {}), [viewArea]: clinicalExam },
    treatment_plan: treatmentPlan,
    contract_text: contractText,
  }

  const pField = (k: string, label: string) => (
    <div className={styles.field} key={k}>
      <label>{label}</label>
      <input value={patientInfo[k] ?? ''} onChange={(e) => setP(k, e.target.value)} />
    </div>
  )
  const aField = (k: string, label: string, customId?: string) => (
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
    </div>
  )

  const specialty = getSpecialtyConfig(viewArea)

  const petSpecies = patientInfo['p-pet_especie'] ?? ''
  const baseAnamnesisFields = viewArea === 'vet'
    ? [...specialty.anamnesisFields, ...(VET_ANAMNESIS_EXTRA_BY_SPECIES[petSpecies] ?? [])]
    : viewArea === 'medico'
    ? [...specialty.anamnesisFields, ...(MEDICO_ANAMNESIS_EXTRA_BY_SPECIALTY[myMedicoSpecialty ?? ''] ?? [])]
    : specialty.anamnesisFields
  const baseClinicalExamFields = viewArea === 'vet'
    ? [...specialty.clinicalExamFields, ...(VET_EXAM_EXTRA_BY_SPECIES[petSpecies] ?? [])]
    : viewArea === 'medico'
    ? [...specialty.clinicalExamFields, ...(MEDICO_EXAM_EXTRA_BY_SPECIALTY[myMedicoSpecialty ?? ''] ?? [])]
    : specialty.clinicalExamFields

  // Bloco G: campos personalizados da clínica pra essa área, concatenados
  // no final de cada seção.
  const customAnamnesisFields = customFields.filter(f => f.section === 'anamnesis')
  const customClinicalExamFields = customFields.filter(f => f.section === 'clinical_exam')
  const currentAnamnesisFields: [string, string][] = [...baseAnamnesisFields, ...customAnamnesisFields.map(f => [f.field_key, f.label] as [string, string])]
  const currentClinicalExamFields: [string, string][] = [...baseClinicalExamFields, ...customClinicalExamFields.map(f => [f.field_key, f.label] as [string, string])]

  return (
    <div className={styles.wrap}>
      {canPickArea && (
        <section className={styles.section}>
          <div className={styles.field}>
            <label>Ver ficha da área</label>
            <select value={viewArea} onChange={(e) => setViewArea(e.target.value as ClinicType)}>
              {clinicSpecialties.map((t) => (
                <option key={t} value={t}>{CLINIC_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Identificação</h3>
        <div className={styles.grid2}>
          {pField('p-cpf', 'CPF')}
          {pField('p-rg', 'RG')}

          <div className={styles.field}>
            <label>Data de Nascimento</label>
            <input
              placeholder="DD/MM/AAAA"
              value={patientInfo['p-nasc'] ?? ''}
              onChange={e => setP('p-nasc', e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label>Gênero</label>
            <select value={patientInfo['p-genero'] ?? ''} onChange={e => setP('p-genero', e.target.value)}>
              <option value="">Selecionar</option>
              <option value="Masculino">Masculino</option>
              <option value="Feminino">Feminino</option>
              <option value="Não binário">Não binário</option>
              <option value="Prefiro não informar">Prefiro não informar</option>
            </select>
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
                <select
                  value={petSpecies}
                  onChange={e => {
                    const newSpecies = e.target.value
                    setP('p-pet_especie', newSpecies)
                    const breedList = PET_BREEDS[newSpecies] ?? []
                    const currentRaca = patientInfo['p-pet_raca'] ?? ''
                    if (currentRaca && !breedList.includes(currentRaca)) setP('p-pet_raca', '')
                  }}
                >
                  <option value="">Selecionar</option>
                  {PET_SPECIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
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
                const isCustomBreed = racaValue !== '' && !breedList.includes(racaValue)
                const selectValue = isCustomBreed ? 'Outra' : racaValue
                return (
                  <>
                    <div className={styles.field}>
                      <label>Raça</label>
                      <select
                        value={selectValue}
                        onChange={e => setP('p-pet_raca', e.target.value === 'Outra' ? '' : e.target.value)}
                      >
                        <option value="">Selecionar</option>
                        {breedList.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    {selectValue === 'Outra' && (
                      <div className={styles.field}>
                        <label>Qual raça?</label>
                        <input
                          value={isCustomBreed ? racaValue : ''}
                          onChange={e => setP('p-pet_raca', e.target.value)}
                          placeholder="Digite a raça"
                        />
                      </div>
                    )}
                  </>
                )
              })()}

              {[
                ['p-pet_idade','Idade do Pet'],
                ['p-pet_peso','Peso do Pet (kg)'],
                ['p-pet_castrado','Castrado?'],
              ].map(([k,l]) => (
                <div className={styles.field} key={k}>
                  <label>{l}</label>
                  <input value={patientInfo[k] ?? ''} onChange={e => setP(k, e.target.value)} />
                </div>
              ))}
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
            Imprimir Contrato
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
        {saved && <span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo com sucesso!</span>}
        <button
          className={styles.btnPrint}
          onClick={() => printProntuario(clinicInfo, patient, recordForPrint, entries, viewArea)}
          type="button"
        >
          Imprimir Prontuário
        </button>
        <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Ficha'}
        </button>
      </div>
    </div>
  )
}
