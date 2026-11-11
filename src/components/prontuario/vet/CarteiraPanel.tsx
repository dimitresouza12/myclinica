'use client'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AuthClinic, Patient, Professional } from '@/types'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { IntegerInput } from '@/components/ui/NumericInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { councilForProfessional, formatRegistration } from '@/lib/professionalCouncil'
import { petSexLabel } from '@/lib/pacientes/pet'
import { dataBr } from '@/lib/vet/datas'
import { htmlCarteira, imprimirCarteira } from '@/lib/vet/imprimir'
import {
  AVISO_CATALOGO, TIPOS_REGISTRO, catalogoDaEspecie, ordenarRecentesPrimeiro, proximaDose, rotuloTipo, situacaoDaCarteira,
  situacaoDoPrazo, textoDoPrazo, validarRegistro, vigentes, type ItemCatalogo, type RegistroCarteira, type SituacaoPrazo, type TipoRegistro,
} from '@/lib/vet/vacinas'
import { excluirRegistro, MENSAGEM_INDISPONIVEL, salvarRegistro, type Indisponibilidade } from '@/lib/vet/storage'
import { usePrintActions } from '../print/PrintRegistry'
import styles from './vet.module.css'

const TOM: Record<Exclude<SituacaoPrazo, 'sem_prazo'>, BadgeTone> = { vencida: 'danger', a_vencer: 'warning', em_dia: 'success' }
const OUTRO = '__outro'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  registros: RegistroCarteira[]
  carregando: boolean
  motivo: Indisponibilidade | null
  recarregar: () => Promise<unknown>
  profissionais: Professional[]
  /** profissional ligado ao usuário logado (ou null) */
  profissionalAtualId: string | null
  /** peso mais recente conhecido, para o impresso */
  pesoKg: number | null
}

interface Form {
  id: string | null
  tipo: TipoRegistro
  nome: string
  sugestaoId: string | null
  lote: string
  fabricante: string
  aplicadaEm: string
  intervalo: string
  /** null = segue aplicação + intervalo; string = data escolhida à mão ('' = sem próxima dose) */
  proximaManual: string | null
  vetId: string
  vetNome: string
  vetRegistro: string
  obs: string
}

const formVazio = (hoje: string, vetId: string): Form => ({
  id: null, tipo: 'vacina', nome: '', sugestaoId: null, lote: '', fabricante: '', aplicadaEm: hoje, intervalo: '', proximaManual: null,
  vetId, vetNome: '', vetRegistro: '', obs: '',
})

/** Carteira de vacinas e antiparasitários: situação (vencidas e a vencer), registrar, lista cronológica e impressão. */
export function CarteiraPanel({ patient, clinic, clinicId, registros, carregando, motivo, recarregar, profissionais, profissionalAtualId, pesoKg }: Props) {
  const queryClient = useQueryClient()
  const hoje = hojeBrasil()
  const ativos = profissionais
  const vetPadrao = profissionalAtualId && ativos.some(p => p.id === profissionalAtualId) ? profissionalAtualId : ''
  const [form, setForm] = useState<Form | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  const situacao = useMemo(() => situacaoDaCarteira(registros, hoje), [registros, hoje])
  const vigenteIds = useMemo(() => new Set(vigentes(registros).map(r => r.id)), [registros])
  const lista = useMemo(() => ordenarRecentesPrimeiro(registros), [registros])
  const sugestoes = useMemo(() => (form ? catalogoDaEspecie(patient.pet_species, form.tipo) : []), [patient.pet_species, form])

  const profissionalPorId = (id: string) => ativos.find(p => p.id === id) ?? null
  function registroDe(p: Professional): string {
    const council = councilForProfessional({ specialtyType: p.specialty_type ?? 'vet', specialty: p.specialty, clinicType: clinic.type })
    return formatRegistration(council, p.registration_number)
  }

  function abrirNovo() { setErros([]); setForm(formVazio(hoje, vetPadrao)) }
  function editar(r: RegistroCarteira) {
    setErros([])
    const conhecido = r.professional_id && profissionalPorId(r.professional_id)
    setForm({
      id: r.id, tipo: r.kind, nome: r.name, sugestaoId: null, lote: r.batch ?? '', fabricante: r.manufacturer ?? '', aplicadaEm: r.applied_on,
      intervalo: '', proximaManual: r.next_due_on ?? '',
      vetId: conhecido ? (r.professional_id as string) : (r.professional_name || r.professional_registration ? OUTRO : ''),
      vetNome: conhecido ? '' : (r.professional_name ?? ''), vetRegistro: conhecido ? '' : (r.professional_registration ?? ''), obs: r.notes ?? '',
    })
  }

  const set = (patch: Partial<Form>) => { setForm(f => (f ? { ...f, ...patch } : f)); setErros([]) }

  const intervaloNum = form && form.intervalo ? Number(form.intervalo) : null
  const proximaEm = form ? (form.proximaManual !== null ? form.proximaManual : (proximaDose(form.aplicadaEm, intervaloNum) ?? '')) : ''

  function escolherSugestao(item: ItemCatalogo) {
    set({ sugestaoId: item.id, nome: item.nome, intervalo: item.intervaloDias ? String(item.intervaloDias) : '', proximaManual: null })
  }

  async function salvar() {
    if (!form) return
    const msgs = validarRegistro({ nome: form.nome, aplicadaEm: form.aplicadaEm, proximaEm }, hoje)
    if (msgs.length) { setErros(msgs); return }
    const prof = form.vetId && form.vetId !== OUTRO ? profissionalPorId(form.vetId) : null
    setSalvando(true)
    const res = await salvarRegistro({
      id: form.id, clinicId, patientId: patient.id,
      dados: {
        kind: form.tipo, name: form.nome, batch: form.lote, manufacturer: form.fabricante,
        applied_on: form.aplicadaEm, next_due_on: proximaEm, notes: form.obs,
        professional_id: prof ? prof.id : null,
        professional_name: prof ? prof.name : form.vetNome,
        professional_registration: prof ? registroDe(prof) : form.vetRegistro,
      },
    })
    setSalvando(false)
    if (!res.ok) { setErros([MENSAGEM_INDISPONIVEL[res.motivo]]); return }
    await recarregar()
    queryClient.invalidateQueries({ queryKey: ['pet-vacina-alertas'] })
    setForm(null)
    showToast('ok', 'Registro salvo na carteira.')
  }

  async function excluir(r: RegistroCarteira) {
    const ok = await confirmDialog({
      title: 'Excluir este registro?',
      message: `${r.name}, aplicado em ${dataBr(r.applied_on)}, será removido da carteira.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    const res = await excluirRegistro(r.id)
    if (!res.ok) { showToast('error', 'Não foi possível excluir agora.'); return }
    await recarregar()
    queryClient.invalidateQueries({ queryKey: ['pet-vacina-alertas'] })
  }

  function imprimir() {
    const prof = profissionalAtualId ? profissionalPorId(profissionalAtualId) : null
    imprimirCarteira(htmlCarteira(
      {
        clinica: clinic.name,
        detalhe: [clinic.address, clinic.phone].filter(Boolean).join(' | ') || undefined,
        pet: patient.pet_name || patient.name,
        tutor: patient.name,
        especie: patient.pet_species, raca: patient.pet_breed, sexo: petSexLabel(patient.pet_sex),
        nascimento: patient.pet_birth_date, microchip: patient.pet_microchip, pesoKg, emitidoEm: hoje,
      },
      registros,
      prof ? { nome: prof.name, registro: registroDe(prof) } : null,
    ))
  }

  // a impressão vai para o menu "Imprimir" do prontuário
  usePrintActions('vet', [{
    id: 'vet-carteira',
    label: 'Carteira de vacinação do pet',
    includes: ['Dados do pet e do tutor', 'Registros de vacinas e antiparasitários com datas e próximos prazos'],
    disabledReason: carregando ? 'Carregando a carteira' : undefined,
    run: imprimir,
  }])

  if (carregando) return <p className={styles.hint}>Carregando carteira...</p>

  const alertas = [...situacao.vencidas, ...situacao.aVencer]

  return (
    <div className={styles.wrap}>
      {motivo && (
        <div className={styles.notice} role="status">
          <Icon name="info" size={18} />
          <div>{MENSAGEM_INDISPONIVEL[motivo]}</div>
        </div>
      )}

      {alertas.length > 0 && (
        <section className={styles.card} aria-label="Vacinas e antiparasitários com prazo">
          <div className={styles.cardTitle}>Prazos em atenção</div>
          <div className={styles.alertList}>
            {alertas.map(r => {
              const s = situacaoDoPrazo(r.next_due_on, hoje) as Exclude<SituacaoPrazo, 'sem_prazo'>
              return (
                <div key={r.id} className={styles.alertRow}>
                  <span className={styles.alertName}>{r.name}</span>
                  <span className={styles.alertWhen}>
                    {dataBr(r.next_due_on)}
                    <Badge tone={TOM[s]}>{textoDoPrazo(r.next_due_on, hoje)}</Badge>
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className={styles.cardHead}>
        <p className={styles.cardSub}>
          {registros.length === 0 ? 'Nenhum registro na carteira.' : `${registros.length} ${registros.length === 1 ? 'registro' : 'registros'}. O prazo vale para a aplicação mais recente de cada produto.`}
        </p>
        <div className={styles.row}>
          {!form && <Button variant="primary" icon="plus" onClick={abrirNovo} disabled={motivo === 'sem_tabela'}>Registrar aplicação</Button>}
        </div>
      </div>

      {form && (
        <section className={styles.card} aria-label={form.id ? 'Editar registro' : 'Novo registro'}>
          <div className={styles.cardTitle}>{form.id ? 'Editar registro' : 'Registrar aplicação'}</div>

          <div className={styles.field}>
            <span className={styles.label}>Tipo</span>
            <div className={styles.chips} role="group" aria-label="Tipo de registro">
              {TIPOS_REGISTRO.map(t => (
                <button key={t.value} type="button" aria-pressed={form.tipo === t.value} className={`${styles.chip} ${form.tipo === t.value ? styles.chipOn : ''}`}
                  onClick={() => set({ tipo: t.value, sugestaoId: null })}>{t.label}</button>
              ))}
            </div>
          </div>

          {sugestoes.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>Sugestões para {patient.pet_species?.toLowerCase() || 'a espécie'}</span>
              <div className={styles.chips} role="group" aria-label="Sugestões do catálogo">
                {sugestoes.map(i => (
                  <button key={i.id} type="button" aria-pressed={form.sugestaoId === i.id} className={`${styles.chip} ${form.sugestaoId === i.id ? styles.chipOn : ''}`}
                    onClick={() => escolherSugestao(i)}>{i.nome}</button>
                ))}
              </div>
              <p className={styles.hint}>{AVISO_CATALOGO}</p>
            </div>
          )}

          <div className={styles.grid}>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="vet-vac-nome">Produto</label>
              <input id="vet-vac-nome" className={styles.input} value={form.nome} onChange={e => set({ nome: e.target.value, sugestaoId: null })} maxLength={120} placeholder="Nome da vacina ou do produto" />
            </div>
            <div className={styles.field}>
              <label htmlFor="vet-vac-lote">Lote <span className={styles.unit}>(opcional)</span></label>
              <input id="vet-vac-lote" className={styles.input} value={form.lote} onChange={e => set({ lote: e.target.value })} maxLength={60} />
            </div>
            <div className={styles.field}>
              <label htmlFor="vet-vac-fab">Fabricante <span className={styles.unit}>(opcional)</span></label>
              <input id="vet-vac-fab" className={styles.input} value={form.fabricante} onChange={e => set({ fabricante: e.target.value })} maxLength={80} />
            </div>
            <div className={styles.field}>
              <label htmlFor="vet-vac-data">Data de aplicação</label>
              <DatePicker id="vet-vac-data" value={form.aplicadaEm} onChange={v => set({ aplicadaEm: v || hoje })} max={hoje} ariaLabel="Data de aplicação" />
            </div>
            <div className={styles.field}>
              <label htmlFor="vet-vac-int">Intervalo <span className={styles.unit}>(dias até o reforço)</span></label>
              <IntegerInput id="vet-vac-int" className={styles.input} value={form.intervalo} onChange={v => set({ intervalo: v, proximaManual: null })} min={1} max={1825} placeholder="Ex.: 365" />
            </div>
            <div className={styles.field}>
              <label htmlFor="vet-vac-prox">Próxima dose</label>
              <DatePicker id="vet-vac-prox" value={proximaEm} onChange={v => set({ proximaManual: v })} min={form.aplicadaEm} ariaLabel="Data da próxima dose" />
              {proximaEm && <button type="button" className={styles.chip} onClick={() => set({ proximaManual: '' })}>Sem próxima dose</button>}
            </div>
            <div className={styles.field}>
              <label htmlFor="vet-vac-vet">Veterinário</label>
              <SelectMenu id="vet-vac-vet" variant="field" value={form.vetId} onChange={v => set({ vetId: v })} ariaLabel="Veterinário que aplicou" placeholder="Não informar"
                options={[{ value: '', label: 'Não informar' }, ...ativos.map(p => ({ value: p.id, label: p.name })), { value: OUTRO, label: 'Outro (digitar)' }]} />
            </div>
            {form.vetId === OUTRO && (
              <>
                <div className={styles.field}>
                  <label htmlFor="vet-vac-vnome">Nome do veterinário</label>
                  <input id="vet-vac-vnome" className={styles.input} value={form.vetNome} onChange={e => set({ vetNome: e.target.value })} maxLength={120} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="vet-vac-vreg">CRMV <span className={styles.unit}>(com a sigla do estado)</span></label>
                  <input id="vet-vac-vreg" className={styles.input} value={form.vetRegistro} onChange={e => set({ vetRegistro: e.target.value })} maxLength={40} placeholder="Ex.: CRMV-CE 1234" />
                </div>
              </>
            )}
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="vet-vac-obs">Observações <span className={styles.unit}>(opcional)</span></label>
              <textarea id="vet-vac-obs" className={styles.textarea} value={form.obs} onChange={e => set({ obs: e.target.value })} maxLength={500} rows={2} />
            </div>
          </div>

          {erros.length > 0 && (
            <div className={styles.avisos} role="alert">
              {erros.map(m => <span key={m} className={styles.errMsg}>{m}</span>)}
            </div>
          )}
          <div className={styles.saveRow}>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={salvando}>Cancelar</Button>
            <Button variant="primary" icon="check" loading={salvando} onClick={salvar}>Salvar registro</Button>
          </div>
        </section>
      )}

      {lista.length === 0 && !form ? (
        <EmptyState icon="procedures" title="Carteira vazia" description="Registre a primeira vacina, vermífugo ou antipulgas. A data do reforço entra sozinha pelo intervalo e pode ser editada." compact />
      ) : lista.length > 0 && (
        <section className={styles.card} aria-label="Histórico da carteira">
          <div className={styles.cardTitle}>Histórico</div>
          <div className={styles.list}>
            {lista.map(r => {
              const vigente = vigenteIds.has(r.id)
              const s = situacaoDoPrazo(r.next_due_on, hoje)
              const vet = [r.professional_name, r.professional_registration].filter(Boolean).join(' - ')
              return (
                <div key={r.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemTitle}>
                      {r.name}
                      <Badge tone="neutral" dot={false}>{rotuloTipo(r.kind)}</Badge>
                      {vigente && s !== 'sem_prazo' && <Badge tone={TOM[s]}>{textoDoPrazo(r.next_due_on, hoje)}</Badge>}
                    </div>
                    <div className={styles.itemMeta}>
                      Aplicada em {dataBr(r.applied_on)}
                      {r.next_due_on ? ` · próxima dose em ${dataBr(r.next_due_on)}` : ''}
                      {r.batch ? ` · lote ${r.batch}` : ''}
                      {r.manufacturer ? ` · ${r.manufacturer}` : ''}
                      {vet ? ` · ${vet}` : ''}
                      {r.notes ? ` · ${r.notes}` : ''}
                    </div>
                  </div>
                  <div className={styles.itemActions}>
                    <button type="button" className={styles.iconBtn} aria-label={`Editar ${r.name} de ${dataBr(r.applied_on)}`} onClick={() => editar(r)}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button type="button" className={styles.iconBtn} aria-label={`Excluir ${r.name} de ${dataBr(r.applied_on)}`} onClick={() => excluir(r)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
