'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import { sanitizeString, sanitizeEmail } from '@/lib/sanitize'
import { phoneInputError, previousPhoneNote, toInputValue } from '@/lib/phoneFormat'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { CpfInput, DateInput, DecimalInput } from '@/components/ui/NumericInput'
import { cpfInputError, cpfToInputValue, previousCpfNote, dateBRToISO, dateInputError, isoToDateBR } from '@/lib/numericFormat'
import { COMMON_CONVENIOS } from '@/lib/convenios'
import { useConveniosSchema } from '@/lib/convenios/schema'
import { usePlans } from '@/lib/convenios/api'
import { findPlan } from '@/lib/convenios/plans'
import { genderSelectOptions } from '@/lib/pacientes/gender'
import { PET_SPECIES, PET_BREEDS } from '@/lib/vetSpecies'
import { usePetExtraColumns } from '@/lib/pacientes/petColumns'
import {
  PET_SEX_OPTIONS, EMPTY_PET_FORM, buildPetColumns, microchipError, normalizePetSex, petAgeFromBirth, sameTutor, hasPetData, petVisibility,
  type PetFormValues, type TutorCandidate,
} from '@/lib/pacientes/pet'
import { useGuardianColumns, markGuardianColumnsMissing } from '@/lib/pacientes/guardianColumns'
import {
  EMPTY_GUARDIAN_FORM, buildGuardianColumns, guardianIsFocus, guardianLabels, isGuardianColumnError, isMinor,
  stripGuardianColumns, GUARDIAN_RELATIONSHIPS, type GuardianFormValues,
} from '@/lib/pacientes/responsavel'
import type { Patient } from '@/types'
import { Modal } from '@/components/ui/Modal'
import f from '@/components/ui/modalForm.module.css'
import btn from '@/components/ui/button.module.css'
import styles from './PatientFormModal.module.css'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { formatBrPhone } from '@/lib/phoneFormat'
import { usePossibleDuplicates } from '@/lib/pacientes/usePossibleDuplicates'
import { CPF_DUPLICATE_MESSAGE, DUPLICATE_SAVE_MESSAGE, duplicateMatchesKey, uniqueViolationMessage, type DuplicateMatch } from '@/lib/pacientes/duplicados'
import { patientHref } from '@/lib/prontuario/navigation'
import { DuplicateWarning } from './DuplicateWarning'

/** Linha de `patients` achada na busca de tutor, com os nomes dos pets dele. */
type TutorHit = TutorCandidate & {
  email: string | null; rg: string | null; address: string | null; emergency_contact: string | null; pets?: string[]
}

interface Props {
  patient: Patient | null
  clinicId: string
  onClose: () => void
  onSaved: () => void
  /** cadastro novo já com nome e telefone preenchidos (ex.: vindo de uma conversa do WhatsApp) */
  initial?: { name?: string; phone?: string }
  /** cadastro novo: a pessoa escolheu um cadastro parecido que já existe. Sem isso, fecha o modal e abre o prontuário dele. */
  onUseExisting?: (id: string) => void
}

export function PatientFormModal({ patient, clinicId, onClose, onSaved, initial, onUseExisting }: Props) {
  const isNew = !patient
  const router = useRouter()
  const { user, clinic } = useAuthStore()
  // Campos do pet: só clínica com veterinária. Em clínica com várias áreas, o admin/recepção (sem área) marca se o cadastro é de um animal.
  const clinicAreas = clinic?.specialties?.length ? clinic.specialties : clinic ? [clinic.type] : []
  const [markedAsPet, setMarkedAsPet] = useState(false)
  const { showPet, vetOnly, askIsPet } = petVisibility({
    clinicAreas, specialtyType: user?.specialtyType, isNew, markedAsPet, patientHasPetData: hasPetData(patient),
  })
  // cadastro de animal: a pessoa do formulário é o tutor
  const tutorMode = vetOnly || (askIsPet && markedAsPet)
  const petExtras = usePetExtraColumns()
  // Responsável legal (migration 20261120_patients_responsavel_legal.sql): só aparece e só é enviado se o banco tem as colunas
  const guardianCols = useGuardianColumns()
  const ownAreas = user?.specialtyType ? clinicAreas.filter(a => a === user.specialtyType) : clinicAreas
  // Com a caixa "é um animal" (clínica com várias áreas e veterinária): marcada = bloco do tutor; desmarcada = cadastro de pessoa,
  // onde a veterinária não conta. Assim o bloco depende só da caixa e desmarcar volta exatamente ao estado inicial.
  const guardianAreas = askIsPet ? (markedAsPet ? ownAreas.filter(a => a === 'vet') : ownAreas.filter(a => a !== 'vet')) : ownAreas
  const guardianFocus = guardianIsFocus(guardianAreas)
  const guardianText = guardianLabels(guardianAreas)
  const [form, setForm] = useState({
    name: initial?.name ?? '', phone: initial?.phone ?? '', email: '', cpf: '', rg: '',
    birth_date: '', gender: '', address: '', occupation: '',
    emergency_contact: '', referred_by: '', notes: '',
    convenio: '', convenio_carteirinha: '',
  })
  // Convênio detalhado (migration 20261116_convenios.sql): validade, titular, pagador. Só aparece e só é enviado se o banco tem as colunas.
  const convSchema = useConveniosSchema()
  const { data: plansData } = usePlans(clinicId)
  const clinicPlans = plansData?.plans ?? []
  const [conv, setConv] = useState({ validade: '', titular: '', payerName: '', payerCpf: '' })
  const [pet, setPet] = useState<PetFormValues>(EMPTY_PET_FORM)
  const [guardian, setGuardian] = useState<GuardianFormValues>(EMPTY_GUARDIAN_FORM)
  const [petBirthBR, setPetBirthBR] = useState('')
  // "Outra" raça escolhida na lista: libera o campo de texto
  const [breedOther, setBreedOther] = useState(false)
  // tutor escolhido numa busca: o cadastro novo é mais um pet dele (dados do tutor copiados, sem digitar de novo)
  const [tutor, setTutor] = useState<TutorHit | null>(null)
  const [tutorQuery, setTutorQuery] = useState('')
  const [tutorHits, setTutorHits] = useState<TutorHit[]>([])
  const [showConvenioSuggestions, setShowConvenioSuggestions] = useState(false)
  const [lgpdConsent, setLgpdConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const duplicateRef = useRef<HTMLDivElement>(null)
  // "Cadastrar mesmo assim": vale para o conjunto de cadastros parecidos que a pessoa viu
  const [ackKey, setAckKey] = useState('')

  // convênios cadastrados na clínica vêm primeiro; depois a lista comum (sem repetir)
  const convenioNames = [...clinicPlans.filter(p => p.is_active).map(p => p.name), ...COMMON_CONVENIOS]
    .filter((n, i, all) => all.findIndex(x => x.toLowerCase() === n.toLowerCase()) === i)
  const filteredConvenioSuggestions = convenioNames.filter(c =>
    c.toLowerCase().includes(form.convenio.trim().toLowerCase())
  )

  useEffect(() => {
    if (patient) {
      setForm({
        name: patient.name ?? '',
        phone: toInputValue(patient.phone),
        email: patient.email ?? '',
        cpf: cpfToInputValue(patient.cpf),
        rg: patient.rg ?? '',
        birth_date: isoToDateBR(patient.birth_date),
        gender: patient.gender ?? '',
        address: patient.address ?? '',
        occupation: patient.occupation ?? '',
        emergency_contact: patient.emergency_contact ?? '',
        referred_by: patient.referred_by ?? '',
        notes: patient.notes ?? '',
        convenio: patient.convenio ?? '',
        convenio_carteirinha: patient.convenio_carteirinha ?? '',
      })
      setConv({
        validade: isoToDateBR(patient.convenio_validade),
        titular: patient.convenio_titular ?? '',
        payerName: patient.payer_name ?? '',
        payerCpf: cpfToInputValue(patient.payer_cpf),
      })
      setPet({
        nome: patient.pet_name ?? '', especie: patient.pet_species ?? '', raca: patient.pet_breed ?? '',
        sexo: normalizePetSex(patient.pet_sex), nascimentoISO: patient.pet_birth_date ?? '',
        castrado: patient.pet_neutered == null ? '' : patient.pet_neutered ? 'Sim' : 'Não',
        peso: patient.pet_weight != null ? String(patient.pet_weight) : '',
        pelagem: patient.pet_coat ?? '', microchip: patient.pet_microchip ?? '', idadeTexto: patient.pet_age ?? '',
      })
      setPetBirthBR(isoToDateBR(patient.pet_birth_date))
      setGuardian({
        nome: patient.guardian_name ?? '',
        cpf: cpfToInputValue(patient.guardian_cpf),
        parentesco: patient.guardian_relationship ?? '',
        telefone: toInputValue(patient.guardian_phone),
      })
      // quem já tem dados na seção recolhida a vê aberta
      setMoreOpen(!!(patient.occupation || patient.referred_by || patient.convenio || patient.notes || patient.payer_name || patient.payer_cpf || patient.guardian_name))
    }
  }, [patient])

  // Cadastro parecido (RPC find_possible_duplicate_patients): só no cadastro novo; se o RPC não existe, não aparece nada.
  // Clínica com veterinária: um tutor com vários pets divide CPF e telefone, então o CPF repetido só avisa e não bloqueia;
  // com o tutor já escolhido na busca, nem consulta.
  const dup = usePossibleDuplicates({
    enabled: isNew && !(showPet && tutor),
    name: form.name,
    birthISO: dateBRToISO(form.birth_date),
    phone: form.phone,
    cpf: form.cpf,
  })
  const cpfBlocks = dup.cpfConflict && !showPet
  const dupKey = duplicateMatchesKey(dup.matches)
  const dupAcknowledged = !cpfBlocks && dupKey !== '' && ackKey === dupKey
  const showDuplicates = dup.matches.length > 0 && !dupAcknowledged

  // o CPF repetido trava o Salvar: leva a vista até o aviso para a pessoa ver o porquê
  useEffect(() => {
    if (cpfBlocks) duplicateRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [cpfBlocks])

  function useExisting(m: DuplicateMatch) {
    if (onUseExisting) { onUseExisting(m.id); return }
    onClose()
    router.push(patientHref(m.id))
  }

  // o erro aparece no fim do formulário: leva a vista até ele
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  // busca de tutor já cadastrado (nome, telefone ou nome do pet): só no cadastro novo de clínica com veterinária
  useEffect(() => {
    const q = tutorQuery.trim()
    if (!isNew || !showPet || tutor || q.length < 2) return
    let cancelled = false
    const timer = setTimeout(async () => {
      // vírgula, parênteses e % têm função na sintaxe do filtro: viram espaço
      const safe = q.replace(/[%,()*\\]/g, ' ').trim()
      const digits = q.replace(/\D/g, '')
      const filters = [`name.ilike.%${safe}%`, `pet_name.ilike.%${safe}%`, ...(digits.length >= 4 ? [`phone.ilike.%${digits}%`] : [])]
      const cols = 'id, name, phone, email, cpf, rg, address, emergency_contact, pet_name'
      const { data, error: err } = await supabase.from('patients').select(cols)
        .eq('clinic_id', clinicId).eq('is_active', true).or(filters.join(',')).order('name').limit(20)
      if (cancelled || err) return
      const rows = (data ?? []) as unknown as TutorHit[]
      // um resultado por tutor, com os pets dele juntos
      const seen: TutorHit[] = []
      for (const r of rows) if (!seen.some(x => sameTutor(x, r))) seen.push(r)
      setTutorHits(seen.map(r => ({ ...r, pets: rows.filter(x => sameTutor(r, x) && x.pet_name).map(x => x.pet_name as string) })))
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [tutorQuery, tutor, isNew, showPet, clinicId])

  // resultados só valem enquanto a busca está ativa (sem tutor escolhido e com texto)
  const visibleTutorHits = isNew && showPet && !tutor && tutorQuery.trim().length >= 2 ? tutorHits : []

  function pickTutor(t: TutorHit) {
    setTutor(t)
    setTutorQuery('')
    setTutorHits([])
    setForm(prev => ({
      ...prev,
      name: t.name ?? '',
      phone: toInputValue(t.phone),
      email: t.email ?? '',
      cpf: cpfToInputValue(t.cpf),
      rg: t.rg ?? '',
      address: t.address ?? '',
      emergency_contact: t.emergency_contact ?? '',
    }))
  }

  function clearTutor() {
    setTutor(null)
    setForm(prev => ({ ...prev, name: '', phone: '', email: '', cpf: '', rg: '', address: '', emergency_contact: '' }))
  }

  function toggleIsPet(checked: boolean) {
    setMarkedAsPet(checked)
    // desmarcar volta ao cadastro de pessoa: descarta o tutor escolhido e o que foi digitado do pet
    if (!checked) {
      if (tutor) clearTutor()
      setPet(EMPTY_PET_FORM)
      setPetBirthBR('')
      setBreedOther(false)
      setGuardian(EMPTY_GUARDIAN_FORM)
    }
  }

  function setPetField<K extends keyof PetFormValues>(k: K, v: PetFormValues[K]) { setPet(prev => ({ ...prev, [k]: v })) }

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validação server-side com sanitização
    const name = sanitizeString(form.name)
    const email = form.email ? sanitizeEmail(form.email) : ''

    if (!name || name.length < 2) return setError('Nome deve ter pelo menos 2 caracteres.')
    if (name.length > 120) return setError('Nome muito longo (máx. 120 caracteres).')
    if (form.email && !email) return setError('E-mail inválido.')
    const phoneError = phoneInputError(form.phone)
    if (phoneError) return setError(phoneError)
    const cpfError = cpfInputError(form.cpf)
    if (cpfError) return setError(cpfError)
    const birthError = dateInputError(form.birth_date)
    if (birthError) return setError(birthError)
    if (convSchema.patientColumns) {
      const validadeError = dateInputError(conv.validade, { allowFuture: true })
      if (validadeError) return setError(`Validade da carteirinha: ${validadeError.charAt(0).toLowerCase()}${validadeError.slice(1)}`)
      const payerCpfError = cpfInputError(conv.payerCpf)
      if (payerCpfError) return setError(`CPF do pagador: ${payerCpfError.charAt(0).toLowerCase()}${payerCpfError.slice(1)}`)
    }
    if (guardianCols) {
      const gCpfError = cpfInputError(guardian.cpf)
      if (gCpfError) return setError(`${guardianText.cpf}: ${gCpfError.charAt(0).toLowerCase()}${gCpfError.slice(1)}`)
      const gPhoneError = phoneInputError(guardian.telefone)
      if (gPhoneError) return setError(`${guardianText.phone}: ${gPhoneError.charAt(0).toLowerCase()}${gPhoneError.slice(1)}`)
    }
    if (showPet) {
      if (tutorMode && isNew && !pet.nome.trim()) return setError('Informe o nome do pet.')
      const chipError = petExtras ? microchipError(pet.microchip) : null
      if (chipError) return setError(chipError)
      const petBirthError = petExtras ? dateInputError(petBirthBR) : null
      if (petBirthError) return setError(`Nascimento do pet: ${petBirthError.charAt(0).toLowerCase()}${petBirthError.slice(1)}`)
    }
    if (isNew && !lgpdConsent) return setError('O consentimento LGPD é obrigatório para cadastrar o paciente.')
    if (isNew && cpfBlocks) {
      duplicateRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      return setError(CPF_DUPLICATE_MESSAGE)
    }
    if (isNew && dup.matches.length > 0 && !dupAcknowledged) {
      duplicateRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      return setError(DUPLICATE_SAVE_MESSAGE)
    }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const clean = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])
      )
      // telefone antigo que o campo não consegue mostrar (ex.: sem DDD) e que a pessoa não preencheu de novo: mantém, não apaga
      const keepOldPhone = !form.phone && !!patient?.phone?.trim() && toInputValue(patient.phone) === ''
      // idem para um CPF antigo que o campo não mostra (incompleto): mantém, não apaga
      const keepOldCpf = !form.cpf && !!patient?.cpf?.trim() && cpfToInputValue(patient.cpf) === ''
      const payload = {
        ...clean,
        ...(keepOldPhone && { phone: patient!.phone }),
        ...(keepOldCpf && { cpf: patient!.cpf }),
        // data de nascimento: digitada como DD/MM/AAAA; sem mexer, mantém o valor guardado (mesmo fora de 1900–2099)
        birth_date: form.birth_date === isoToDateBR(patient?.birth_date) ? (patient?.birth_date ?? null) : dateBRToISO(form.birth_date),
        clinic_id: clinicId,
        ...(convSchema.patientColumns && (() => {
          const hasConvenio = !!form.convenio.trim()
          return {
            insurance_plan_id: hasConvenio ? (findPlan(clinicPlans, { convenio: form.convenio })?.id ?? null) : null,
            convenio_validade: hasConvenio ? dateBRToISO(conv.validade, { allowFuture: true }) : null,
            convenio_titular: hasConvenio ? (conv.titular.trim() || null) : null,
            payer_name: conv.payerName.trim() || null,
            payer_cpf: conv.payerCpf || null,
          }
        })()),
        ...buildGuardianColumns(guardian, { enabled: guardianCols }),
        ...(showPet && buildPetColumns(
          { ...pet, nascimentoISO: petExtras ? (dateBRToISO(petBirthBR) ?? '') : '' },
          { extras: petExtras },
        )),
        ...(isNew && {
          lgpd_consent: true,
          lgpd_consent_at: now,
        }),
      }

      // Se o banco recusar as colunas do responsável (SQL ainda não colado e o teste de colunas não pegou), grava de novo sem elas (o probe só erra nesse caso raro).
      async function write(body: typeof payload) {
        const res = isNew
          ? await supabase.from('patients').insert([body])
          : await supabase.from('patients').update(body).eq('id', patient!.id)
        if (res.error && guardianCols && isGuardianColumnError(res.error)) {
          markGuardianColumnsMissing()
          return isNew
            ? await supabase.from('patients').insert([stripGuardianColumns(body)])
            : await supabase.from('patients').update(stripGuardianColumns(body)).eq('id', patient!.id)
        }
        return res
      }

      if (isNew) {
        const { error: err } = await write(payload)
        if (err) throw err
        if (user?.id) {
          await audit({ action: 'patient.create', user_id: user.id, clinic_id: clinicId, module: 'pacientes' })
        }
      } else {
        const { error: err } = await write(payload)
        if (err) throw err
        if (user?.id) {
          await audit({ action: 'patient.update', user_id: user.id, clinic_id: clinicId, module: 'pacientes', resource_id: patient!.id })
        }
      }
      onSaved()
    } catch (err: unknown) {
      setError(uniqueViolationMessage(err as { code?: string; message?: string; details?: string }) ?? (err instanceof Error ? err.message : 'Erro ao salvar.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!patient) return
    setError('')
    setDeleting(true)
    try {
      const { error: err } = await supabase.from('patients').update({ is_active: false }).eq('id', patient.id)
      if (err) throw err
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir.')
    } finally {
      setDeleting(false)
    }
  }

  const hasGuardianName = guardian.nome.trim() !== ''
  const vetGuardian = guardianAreas.length > 0 && guardianAreas.every(a => a === 'vet')
  const suggestGuardian = !vetGuardian && !hasGuardianName && isMinor(dateBRToISO(form.birth_date))
  const relationshipOptions = [
    { value: '', label: 'Selecionar' },
    ...[...GUARDIAN_RELATIONSHIPS as readonly string[], ...(guardian.parentesco && !(GUARDIAN_RELATIONSHIPS as readonly string[]).includes(guardian.parentesco) ? [guardian.parentesco] : [])]
      .map(r => ({ value: r, label: r })),
  ]
  const guardianFields = (
    <>
      {suggestGuardian && (
        <p className={styles.guardianSuggest} role="note">
          Paciente menor de 18 anos: informe o responsável legal.
        </p>
      )}
      <Field label={guardianText.name} value={guardian.nome} onChange={(v) => setGuardian(prev => ({ ...prev, nome: v }))} />
      <div className={f.row2}>
        <Field label={guardianText.cpf} cpf value={guardian.cpf} onChange={(v) => setGuardian(prev => ({ ...prev, cpf: v }))} />
        <Field label={guardianText.phone} phone value={guardian.telefone} onChange={(v) => setGuardian(prev => ({ ...prev, telefone: v }))} />
      </div>
      {!vetGuardian && (
        <div className={f.field}>
          <label>Parentesco</label>
          <SelectMenu variant="field" ariaLabel="Parentesco do responsável" value={guardian.parentesco}
            onChange={v => setGuardian(prev => ({ ...prev, parentesco: v }))}
            options={relationshipOptions} />
        </div>
      )}
    </>
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Novo paciente' : 'Editar paciente'}
      subtitle={!isNew && form.name.trim() ? form.name.trim() : undefined}
      footer={
        <>
          {!isNew && !confirmDelete && (
            <button type="button" className={styles.btnDelete} onClick={() => setConfirmDelete(true)} disabled={saving}>
              Excluir
            </button>
          )}
          <button type="button" className={btn.secondary} onClick={onClose}>Cancelar</button>
          <button type="submit" form="patient-form" className={btn.primary} disabled={saving || (isNew && cpfBlocks)}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="patient-form" onSubmit={handleSubmit} className={styles.form}>
        <p className={styles.requiredNote}><span className={styles.requiredStar}>*</span> Campo obrigatório</p>

        {isNew && askIsPet && (
          <label className={styles.lgpdConsent}>
            <input type="checkbox" checked={markedAsPet} onChange={(e) => toggleIsPet(e.target.checked)} />
            <span>Este cadastro é de um animal (pet)</span>
          </label>
        )}

        {isNew && showPet && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Tutor</h3>
            {tutor ? (
              <div className={styles.tutorChip}>
                <span className={styles.tutorChipText}>
                  <b>{tutor.name}</b>
                  <small>
                    Novo pet deste tutor{tutor.pets?.length ? ` (já cadastrados: ${tutor.pets.join(', ')})` : ''}. Os dados de contato foram copiados.
                  </small>
                </span>
                <button type="button" className={styles.tutorChipClear} onClick={clearTutor} aria-label="Trocar tutor">
                  <Icon name="close" size={14} />
                </button>
              </div>
            ) : (
              <div className={f.field}>
                <label htmlFor="pf-tutor-search">O tutor já tem outro pet cadastrado?</label>
                <input
                  id="pf-tutor-search"
                  value={tutorQuery}
                  onChange={(e) => setTutorQuery(e.target.value)}
                  placeholder="Buscar pelo nome, telefone ou nome do pet"
                  autoComplete="off"
                />
                {visibleTutorHits.length > 0 && (
                  <div className={styles.suggestionsDropdown}>
                    {visibleTutorHits.map(h => (
                      <button key={h.id} type="button" className={styles.suggestionItem} onMouseDown={(e) => e.preventDefault()} onClick={() => pickTutor(h)}>
                        <b>{h.name}</b>
                        <span className={styles.tutorHitMeta}>
                          {formatBrPhone(h.phone) || 'Sem telefone'}{h.pets?.length ? ` · ${h.pets.join(', ')}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <small className={f.hint}>Ao escolher, o nome, o telefone e o CPF do tutor são copiados e este cadastro vira mais um pet dele.</small>
              </div>
            )}
          </section>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{tutorMode ? 'Dados do tutor' : 'Dados pessoais'}</h3>
          <Field label={tutorMode ? 'Nome do tutor' : 'Nome'} required value={form.name} onChange={(v) => set('name', v)} />
          <div className={f.row2}>
            <div className={f.field}>
              <label htmlFor="pf-birth">Data de nascimento</label>
              <DateInput id="pf-birth" value={form.birth_date} onChange={(v) => set('birth_date', v)} autoComplete="off" />
              {suggestGuardian && guardianCols && !guardianFocus && (
                <small className={f.hint}>Menor de 18 anos: informe o responsável legal em Mais informações.</small>
              )}
            </div>
            <div className={f.field}>
              <label>Gênero</label>
              <SelectMenu variant="field" ariaLabel="Gênero" value={form.gender}
                onChange={v => set('gender', v)}
                options={genderSelectOptions(form.gender)} />
            </div>
          </div>
          <div className={f.row2}>
            <Field label="CPF" cpf previous={previousCpfNote(patient?.cpf)} value={form.cpf} onChange={(v) => set('cpf', v)} />
            <Field label="RG" value={form.rg} onChange={(v) => set('rg', v)} />
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Contato</h3>
          <div className={f.row2}>
            <Field label="Telefone" phone previous={previousPhoneNote(patient?.phone)} value={form.phone} onChange={(v) => set('phone', v)} />
            <Field label="E-mail" type="email" value={form.email} onChange={(v) => set('email', v)} />
          </div>
          <Field label="Endereço" value={form.address} onChange={(v) => set('address', v)} />
          <Field label="Contato de emergência" value={form.emergency_contact} onChange={(v) => set('emergency_contact', v)} />
        </section>

        {isNew && showDuplicates && (
          <div ref={duplicateRef}>
            <DuplicateWarning
              matches={dup.matches}
              cpfConflict={cpfBlocks}
              onUse={useExisting}
              onProceed={() => setAckKey(dupKey)}
            />
          </div>
        )}

        {guardianCols && guardianFocus && (
          <section className={`${styles.section} ${styles.guardianSection}`} aria-label={guardianText.title}>
            <h3 className={styles.sectionTitle}>{guardianText.title}</h3>
            <small className={f.hint}>{guardianText.hint}</small>
            {guardianFields}
          </section>
        )}

        {showPet && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Dados do pet</h3>
            <div className={f.row2}>
              <div className={f.field}>
                <label htmlFor="pf-pet-nome">Nome do pet{tutorMode && isNew && <span className={styles.requiredStar}> *</span>}</label>
                <input id="pf-pet-nome" value={pet.nome} onChange={(e) => setPetField('nome', e.target.value)} />
              </div>
              <div className={f.field}>
                <label>Espécie</label>
                <SelectMenu variant="field" ariaLabel="Espécie" value={pet.especie}
                  onChange={v => {
                    setPet(prev => ({ ...prev, especie: v, raca: prev.raca && !(PET_BREEDS[v] ?? []).includes(prev.raca) ? '' : prev.raca }))
                    setBreedOther(false)
                  }}
                  options={[{ value: '', label: 'Selecionar' }, ...PET_SPECIES.map(sp => ({ value: sp, label: sp }))]} />
              </div>
            </div>
            <div className={f.row2}>
              {(() => {
                const breeds = PET_BREEDS[pet.especie] ?? []
                if (breeds.length === 0) {
                  return (
                    <div className={f.field}>
                      <label htmlFor="pf-pet-raca">Raça</label>
                      <input id="pf-pet-raca" value={pet.raca} onChange={(e) => setPetField('raca', e.target.value)}
                        placeholder={pet.especie ? 'Digite a raça' : 'Escolha a espécie primeiro'} />
                    </div>
                  )
                }
                const other = breedOther || (pet.raca !== '' && !breeds.includes(pet.raca))
                return (
                  <>
                    <div className={f.field}>
                      <label>Raça</label>
                      <SelectMenu variant="field" ariaLabel="Raça" value={other ? 'Outra' : pet.raca}
                        onChange={v => {
                          if (v === 'Outra') { setBreedOther(true); if (breeds.includes(pet.raca)) setPetField('raca', '') }
                          else { setBreedOther(false); setPetField('raca', v) }
                        }}
                        options={[{ value: '', label: 'Selecionar' }, ...breeds.map(b => ({ value: b, label: b }))]} />
                    </div>
                    {other && (
                      <div className={f.field}>
                        <label htmlFor="pf-pet-raca-outra">Qual raça?</label>
                        <input id="pf-pet-raca-outra" value={pet.raca} onChange={(e) => setPetField('raca', e.target.value)} placeholder="Digite a raça" />
                      </div>
                    )}
                  </>
                )
              })()}
              {petExtras && (
                <div className={f.field}>
                  <label>Sexo</label>
                  <SelectMenu variant="field" ariaLabel="Sexo do pet" value={pet.sexo}
                    onChange={v => setPetField('sexo', v)}
                    options={[{ value: '', label: 'Selecionar' }, ...PET_SEX_OPTIONS]} />
                </div>
              )}
            </div>
            <div className={f.row2}>
              {petExtras ? (
                <div className={f.field}>
                  <label htmlFor="pf-pet-nasc">Nascimento (ou data estimada)</label>
                  <DateInput id="pf-pet-nasc" value={petBirthBR} onChange={setPetBirthBR} autoComplete="off" />
                  {petAgeFromBirth(dateBRToISO(petBirthBR)) && <small className={f.hint}>Idade: {petAgeFromBirth(dateBRToISO(petBirthBR))}</small>}
                </div>
              ) : (
                <div className={f.field}>
                  <label htmlFor="pf-pet-idade">Idade</label>
                  <input id="pf-pet-idade" value={pet.idadeTexto} onChange={(e) => setPetField('idadeTexto', e.target.value)} placeholder="Ex: 3 anos" />
                </div>
              )}
              <div className={f.field}>
                <label htmlFor="pf-pet-peso">Peso (kg)</label>
                <DecimalInput id="pf-pet-peso" value={pet.peso} onChange={(v) => setPetField('peso', v)} max={500} decimals={2} placeholder="0" />
              </div>
            </div>
            <div className={f.row2}>
              <div className={f.field}>
                <label>Castrado?</label>
                <SelectMenu variant="field" ariaLabel="Castrado" value={pet.castrado}
                  onChange={v => setPetField('castrado', v)}
                  options={[{ value: '', label: 'Selecionar' }, { value: 'Sim', label: 'Sim' }, { value: 'Não', label: 'Não' }]} />
              </div>
              <div className={f.field}>
                <label htmlFor="pf-pet-pelagem">Pelagem</label>
                <input id="pf-pet-pelagem" value={pet.pelagem} onChange={(e) => setPetField('pelagem', e.target.value)} placeholder="Ex: caramelo" />
              </div>
            </div>
            {petExtras && (
              <div className={f.field}>
                <label htmlFor="pf-pet-chip">Microchip</label>
                <input id="pf-pet-chip" value={pet.microchip} inputMode="numeric" autoComplete="off"
                  onChange={(e) => setPetField('microchip', e.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="15 números, se houver" />
              </div>
            )}
          </section>
        )}

        <details className={styles.more} open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
          <summary className={styles.moreSummary}>
            <span className={styles.moreText}>
              <b>Mais informações</b>
              <small>Ocupação, indicação, convênio e observações</small>
            </span>
            <Icon name="chevronRight" size={16} />
          </summary>
          <div className={styles.moreBody}>
            <div className={f.row2}>
              <Field label="Ocupação" value={form.occupation} onChange={(v) => set('occupation', v)} />
              <Field label="Indicado por" value={form.referred_by} onChange={(v) => set('referred_by', v)} />
            </div>
            <div className={f.row2}>
              <div className={f.field} style={!form.convenio.trim() ? { gridColumn: '1 / -1' } : undefined}>
                <label>Convênio</label>
                <input
                  value={form.convenio}
                  onChange={(e) => { set('convenio', e.target.value); setShowConvenioSuggestions(true) }}
                  onClick={() => setShowConvenioSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowConvenioSuggestions(false), 150)}
                  placeholder="Ex: Unimed, Particular..."
                  autoComplete="off"
                />
                {showConvenioSuggestions && filteredConvenioSuggestions.length > 0 && (
                  <div className={styles.suggestionsDropdown}>
                    {filteredConvenioSuggestions.map(c => (
                      <button
                        key={c}
                        type="button"
                        tabIndex={-1}
                        className={styles.suggestionItem}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { set('convenio', c); setShowConvenioSuggestions(false) }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {form.convenio.trim() && (
                <Field label="Nº da carteirinha" value={form.convenio_carteirinha} onChange={(v) => set('convenio_carteirinha', v)} />
              )}
            </div>
            {convSchema.patientColumns && form.convenio.trim() && (
              <div className={f.row2}>
                <div className={f.field}>
                  <label htmlFor="pf-conv-validade">Validade da carteirinha</label>
                  <DateInput id="pf-conv-validade" value={conv.validade} onChange={(v) => setConv(prev => ({ ...prev, validade: v }))} />
                </div>
                <Field label="Titular do plano" value={conv.titular} onChange={(v) => setConv(prev => ({ ...prev, titular: v }))} placeholder="Se não for o próprio paciente" />
              </div>
            )}
            {convSchema.patientColumns && (
              <div className={f.row2}>
                <Field label="Pagador (se não for o paciente)" value={conv.payerName} onChange={(v) => setConv(prev => ({ ...prev, payerName: v }))} placeholder="Nome do responsável financeiro" />
                <div className={f.field}>
                  <label htmlFor="pf-payer-cpf">CPF do pagador</label>
                  <CpfInput id="pf-payer-cpf" value={conv.payerCpf} onChange={(v) => setConv(prev => ({ ...prev, payerCpf: v }))} />
                </div>
              </div>
            )}
            {guardianCols && !guardianFocus && (
              <div className={styles.moreGroup}>
                <h3 className={styles.sectionTitle}>{guardianText.title} (opcional)</h3>
                {guardianFields}
              </div>
            )}
            <div className={f.field}>
              <label>Observações</label>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
            </div>
          </div>
        </details>

        {isNew && (
          <label className={styles.lgpdConsent}>
            <input
              type="checkbox"
              checked={lgpdConsent}
              onChange={(e) => setLgpdConsent(e.target.checked)}
              required
            />
            <span>
              O paciente autoriza o tratamento dos seus dados pessoais e de saúde conforme a{' '}
              <strong>LGPD (Lei 13.709/2018)</strong>, art. 7 e 11, para fins de atendimento clínico.
            </span>
          </label>
        )}

        {error && <p ref={errorRef} className={f.error} role="alert">{error}</p>}

        {!isNew && confirmDelete && (
          <div className={styles.confirmDelete}>
            <p>Excluir <strong>{form.name}</strong>? O paciente sairá das listas mas o histórico (prontuário e agendamentos) será preservado.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={btn.secondary} onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancelar
              </button>
              <button type="button" className={btn.danger} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder = '', required = false, phone = false, cpf = false, previous = null,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean
  /** campo de telefone: só aceita (85) 99999-8888 */
  phone?: boolean
  /** campo de CPF: só os 11 números */
  cpf?: boolean
  /** valor antigo guardado que o campo não mostra por inteiro */
  previous?: string | null
}) {
  return (
    <div className={f.field}>
      <label>
        {label}
        {required && <span className={styles.requiredStar}> *</span>}
      </label>
      {phone || cpf ? (
        <>
          {phone ? <PhoneInput value={value} onChange={onChange} /> : <CpfInput value={value} onChange={onChange} />}
          {previous && <small className={f.hint}>Valor anterior no cadastro: {previous}. Confira e digite {phone ? 'o número completo com DDD' : 'os 11 números'}.</small>}
        </>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
        />
      )}
    </div>
  )
}
