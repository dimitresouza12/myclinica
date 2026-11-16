'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useProfessionals } from '@/hooks/useClinicData'
import type { AuthClinic, Patient } from '@/types'
import { PillTabs } from '@/components/ui/PillTabs'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { hojeBrasil } from '@/lib/brasilDate'
import { internacaoAberta } from '@/lib/vet/internacao'
import { pesoAtual } from '@/lib/vet/peso'
import { situacaoDaCarteira } from '@/lib/vet/vacinas'
import { CarteiraPanel } from './CarteiraPanel'
import { DosePanel } from './DosePanel'
import { ExamesPetPanel } from './ExamesPetPanel'
import { InternacaoPanel } from './InternacaoPanel'
import { PesoPanel } from './PesoPanel'
import { useProfissionalVet } from './useProfissionalVet'
import { useVetClinico } from './useVetClinico'
import { useVetDados } from './useVetDados'
import styles from './vet.module.css'

type Vista = 'carteira' | 'peso' | 'dose' | 'internacao' | 'exames'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Aba "Saúde do pet" do prontuário veterinário: carteira de vacinas e antiparasitários, curva de peso, calculadora de
 * dose, internação (entrada, prescrições, evolução por turno e alta) e exames com resultado e anexo.
 */
export function TabVet({ patient, clinic, clinicId, onDirtyChange }: Props) {
  const user = useAuthStore(s => s.user)
  const { data: profissionais = [] } = useProfessionals(clinic.id)
  const [vista, setVista] = useState<Vista>('carteira')
  // internação e exames montam na primeira visita e ficam montados (o que foi digitado não se perde ao trocar de seção)
  const [visitadas, setVisitadas] = useState<Set<Vista>>(new Set())
  const [internDirty, setInternDirty] = useState(false)
  const [examesDirty, setExamesDirty] = useState(false)
  const dados = useVetDados(patient.id)
  const clinico = useVetClinico(patient.id)
  const resp = useProfissionalVet(clinic.id)

  const dirty = internDirty || examesDirty
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const atual = pesoAtual(dados.pesos)
  const pesoKg = atual?.weight_kg ?? patient.pet_weight ?? null
  const pendentes = useMemo(() => {
    const s = situacaoDaCarteira(dados.registros, hojeBrasil())
    return s.vencidas.length + s.aVencer.length
  }, [dados.registros])
  const internado = useMemo(() => internacaoAberta(clinico.internacoes) !== null, [clinico.internacoes])
  const aguardando = useMemo(() => clinico.exames.filter(e => e.status === 'solicitado').length, [clinico.exames])

  function mudarVista(v: Vista) {
    setVista(v)
    setVisitadas(prev => (prev.has(v) ? prev : new Set(prev).add(v)))
  }

  const mostraResponsavel = (vista === 'internacao' || vista === 'exames') && resp.precisaEscolher

  return (
    <div className={styles.wrap}>
      <PillTabs<Vista>
        label="Seções de Saúde do pet"
        value={vista}
        onChange={mudarVista}
        options={[
          { value: 'carteira', label: 'Carteira de vacinas', count: pendentes || undefined },
          { value: 'peso', label: 'Peso' },
          { value: 'dose', label: 'Dose por peso' },
          { value: 'internacao', label: 'Internação', count: internado ? 1 : undefined },
          { value: 'exames', label: 'Exames', count: aguardando || undefined },
        ]}
      />
      {vista === 'carteira' && (
        <CarteiraPanel
          patient={patient} clinic={clinic} clinicId={clinicId}
          registros={dados.registros} carregando={dados.carregandoRegistros} motivo={dados.motivoRegistros} recarregar={dados.recarregarRegistros}
          profissionais={profissionais} profissionalAtualId={user?.professionalId ?? null} pesoKg={pesoKg}
        />
      )}
      {vista === 'peso' && (
        <PesoPanel patient={patient} clinicId={clinicId} pesos={dados.pesos} carregando={dados.carregandoPesos} motivo={dados.motivoPesos} recarregar={dados.recarregarPesos} />
      )}
      {vista === 'dose' && <DosePanel key={atual?.id ?? 'sem-pesagem'} pesoAtualKg={atual?.weight_kg ?? null} pesoCadastroKg={patient.pet_weight ?? null} />}

      {mostraResponsavel && (
        <div className={styles.card}>
          <div className={styles.field}>
            <label htmlFor="vet-resp">Profissional responsável</label>
            <SelectMenu
              variant="field" id="vet-resp" value={resp.manualId} onChange={resp.setManualId} placeholder="Escolha quem assina"
              options={[{ value: '', label: 'Escolha quem assina' }, ...resp.candidatos.map(p => ({ value: p.id, label: p.name }))]}
            />
            <span className={styles.hint}>O nome e o registro (CRMV) dele saem na assinatura do resumo de alta e dos exames.</span>
          </div>
        </div>
      )}

      {(vista === 'internacao' || visitadas.has('internacao')) && (
        <div style={{ display: vista === 'internacao' ? undefined : 'none' }}>
          <InternacaoPanel
            patient={patient} clinic={clinic} clinicId={clinicId} profissional={resp.profissional}
            internacoes={clinico.internacoes} itens={clinico.itens} carregando={clinico.carregandoInternacao} motivo={clinico.motivoInternacao}
            recarregar={clinico.recarregarInternacao} pesoKg={pesoKg} ativo={vista === 'internacao'} onDirtyChange={setInternDirty}
          />
        </div>
      )}
      {(vista === 'exames' || visitadas.has('exames')) && (
        <div style={{ display: vista === 'exames' ? undefined : 'none' }}>
          <ExamesPetPanel
            patient={patient} clinic={clinic} clinicId={clinicId} profissional={resp.profissional}
            exames={clinico.exames} carregando={clinico.carregandoExames} motivo={clinico.motivoExames}
            recarregar={clinico.recarregarExames} pesoKg={pesoKg} ativo={vista === 'exames'} onDirtyChange={setExamesDirty}
          />
        </div>
      )}
    </div>
  )
}
