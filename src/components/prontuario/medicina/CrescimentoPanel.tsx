'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { DecimalInput } from '@/components/ui/NumericInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { PillTabs } from '@/components/ui/PillTabs'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { formatDateBr } from '@/lib/documentos/campos'
import {
  avaliarMedidas, DIAS_MAX, diasDeVida, escoreTexto, idadeTexto, INDICADOR_INFO, INDICADORES, lerNumero, percentilTexto, sexoDoCadastro,
  type Gravidade, type Indicador, type ResultadoIndicador, type Sexo,
} from '@/lib/medico/crescimento/oms'
import {
  avaliarRegistro, MAX_OBSERVACAO_MEDIDA, medidaDoForm, medidasDeLinhas, pontosDoIndicador, validarFormMedida, type FormMedida, type MedidaRegistro,
} from '@/lib/medico/crescimento/medidas'
import { excluirMedico, MENSAGEM_INDISPONIVEL, salvarMedico, type Indisponibilidade, type LinhaMedico } from '@/lib/medico/registros'
import { GraficoCrescimento, type FaixaIdade } from './GraficoCrescimento'
import styles from './medicina.module.css'

interface Props {
  patient: Patient
  clinicId: string
  linhas: LinhaMedico[]
  carregando: boolean
  motivo: Indisponibilidade | null
  recarregar: () => Promise<unknown>
  onDirtyChange: (dirty: boolean) => void
}

const fmt = (n: number, casas: number) => n.toFixed(casas).replace('.', ',')
const tagClasse = (g: Gravidade) => (g === 'ok' ? styles.tagOk : g === 'atencao' ? styles.tagWarn : styles.tagBad)
const formVazio = (data: string): FormMedida => ({ data, peso: '', estatura: '', pc: '', observacao: '' })

const OPCOES_SEXO = [
  { value: '', label: 'Selecionar' },
  { value: 'meninos', label: 'Meninos' },
  { value: 'meninas', label: 'Meninas' },
]

/** Curvas de crescimento da OMS de 0 a 5 anos: registrar peso, comprimento/estatura e perímetro cefálico a cada consulta e ver sobre as curvas. */
export function CrescimentoPanel({ patient, clinicId, linhas, carregando, motivo, recarregar, onDirtyChange }: Props) {
  const hoje = hojeBrasil()
  const nascimento = patient.birth_date ? patient.birth_date.slice(0, 10) : null
  const diasHoje = diasDeVida(nascimento, hoje)

  const [sexoManual, setSexoManual] = useState<Sexo | ''>('')
  const sexo: Sexo | null = sexoDoCadastro(patient.gender) ?? (sexoManual || null)
  const [form, setForm] = useState<FormMedida>(() => formVazio(hoje))
  const [indicador, setIndicador] = useState<Indicador>('peso')
  const [faixa, setFaixa] = useState<FaixaIdade>(() => (diasHoje !== null && diasHoje > 730 ? '5anos' : '2anos'))
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  const dirty = form.peso !== '' || form.estatura !== '' || form.pc !== '' || form.observacao.trim() !== ''
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const medidas = useMemo(() => medidasDeLinhas(linhas), [linhas])
  const ultima: MedidaRegistro | undefined = medidas[medidas.length - 1]
  const pontos = useMemo(() => (sexo ? pontosDoIndicador(sexo, nascimento, medidas, indicador) : []), [sexo, nascimento, medidas, indicador])
  const resultadosUltima = useMemo(() => (sexo && ultima ? avaliarRegistro(sexo, nascimento, ultima) : []), [sexo, nascimento, ultima])

  // onde a medida digitada cai nas curvas, antes de salvar
  const previa: ResultadoIndicador[] = useMemo(() => {
    if (!sexo || !nascimento) return []
    const n = (t: string) => { const v = lerNumero(t); return Number.isFinite(v) && v > 0 ? v : null }
    return avaliarMedidas(sexo, nascimento, form.data, { pesoKg: n(form.peso), estaturaCm: n(form.estatura), pcCm: n(form.pc) })
  }, [sexo, nascimento, form.data, form.peso, form.estatura, form.pc])

  const set = (p: Partial<FormMedida>) => { setForm(f => ({ ...f, ...p })); setErros([]) }

  async function registrar() {
    const problemas = validarFormMedida(form, nascimento, hoje)
    if (problemas.length) { setErros(problemas); return }
    setSalvando(true)
    const res = await salvarMedico({ clinicId, patientId: patient.id, tipo: 'crescimento', data: form.data, dados: medidaDoForm(form) })
    setSalvando(false)
    if (!res.ok) { setErros([MENSAGEM_INDISPONIVEL[res.motivo]]); return }
    await recarregar()
    setForm(formVazio(hoje))
    showToast('ok', 'Medida registrada.')
  }

  async function excluir(m: MedidaRegistro) {
    const ok = await confirmDialog({
      title: 'Excluir esta medida?',
      message: `A medida de ${formatDateBr(m.data)} será removida da curva. Não dá para desfazer.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    const r = await excluirMedico(m.id)
    if (!r.ok) { showToast('error', 'Não foi possível excluir agora.'); return }
    await recarregar()
  }

  if (carregando) return <p className={styles.hint}>Carregando medidas...</p>

  const semNascimento = nascimento === null
  const passouDaFaixa = diasHoje !== null && diasHoje > DIAS_MAX
  const listaInvertida = [...medidas].reverse()

  return (
    <div className={styles.wrap}>
      {motivo && (
        <div className={styles.notice} role="status">
          <Icon name="info" size={18} />
          <div>{MENSAGEM_INDISPONIVEL[motivo]}</div>
        </div>
      )}

      <p className={styles.hint}>
        Padrões de crescimento da OMS (2006) para 0 a 5 anos: peso, comprimento/estatura, perímetro cefálico e IMC por idade, com escore Z e percentil.
        Apoio à avaliação clínica: a interpretação é do profissional. Até 2 anos meça o comprimento deitado; depois, a estatura em pé.
      </p>

      {semNascimento && (
        <div className={styles.notice} role="status">
          <Icon name="alert" size={18} />
          <div>O cadastro do paciente está sem data de nascimento. Preencha-a na Ficha para calcular a idade e o escore Z de cada medida.</div>
        </div>
      )}
      {passouDaFaixa && (
        <div className={styles.notice} role="status">
          <Icon name="info" size={18} />
          <div>O paciente tem mais de 5 anos. As curvas desta tela cobrem de 0 a 5 anos: só as medidas feitas nessa idade aparecem no gráfico.</div>
        </div>
      )}

      {!semNascimento && sexoDoCadastro(patient.gender) === null && (
        <div className={styles.card}>
          <div className={styles.field}>
            <label htmlFor="cr-sexo">Sexo para as curvas</label>
            <SelectMenu variant="field" id="cr-sexo" value={sexoManual} onChange={v => setSexoManual(v === 'meninos' || v === 'meninas' ? v : '')} options={OPCOES_SEXO} />
            <span className={styles.hint}>O gênero do cadastro não é masculino nem feminino. As curvas da OMS são separadas por sexo: escolha a que vale para a avaliação.</span>
          </div>
        </div>
      )}

      {!semNascimento && sexo && !passouDaFaixa && (
        <section className={styles.card} aria-label="Registrar medida">
          <div className={styles.cardTitle}>Registrar medida</div>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="cr-data">Data</label>
              <DatePicker id="cr-data" value={form.data} onChange={v => set({ data: v || hoje })} min={nascimento ?? undefined} max={hoje} ariaLabel="Data da medida" />
            </div>
            <div className={styles.field}>
              <label htmlFor="cr-peso">Peso <span className={styles.unit}>(kg)</span></label>
              <DecimalInput id="cr-peso" className={styles.input} value={form.peso} onChange={v => set({ peso: v })} max={60} decimals={3} placeholder="0" />
            </div>
            <div className={styles.field}>
              <label htmlFor="cr-est">Comprimento / estatura <span className={styles.unit}>(cm)</span></label>
              <DecimalInput id="cr-est" className={styles.input} value={form.estatura} onChange={v => set({ estatura: v })} max={140} decimals={1} placeholder="0" />
            </div>
            <div className={styles.field}>
              <label htmlFor="cr-pc">Perímetro cefálico <span className={styles.unit}>(cm)</span></label>
              <DecimalInput id="cr-pc" className={styles.input} value={form.pc} onChange={v => set({ pc: v })} max={65} decimals={1} placeholder="0" />
            </div>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="cr-obs">Observação <span className={styles.unit}>(opcional)</span></label>
              <input id="cr-obs" className={styles.input} value={form.observacao} maxLength={MAX_OBSERVACAO_MEDIDA} onChange={e => set({ observacao: e.target.value })} placeholder="Ex.: consulta de puericultura" />
            </div>
          </div>

          {previa.length > 0 && (
            <div className={styles.stats} aria-label="Pré-visualização nas curvas">
              {previa.map(r => <ResultadoCard key={r.indicador} r={r} />)}
            </div>
          )}
          {previa.some(r => r.implausivel) && <p className={styles.warn}>Algum valor está fora do que a OMS considera plausível para a idade. Confira a medida e a digitação antes de registrar.</p>}
          {erros.length > 0 && <ul className={styles.errors} role="alert">{erros.map(e => <li key={e}>{e}</li>)}</ul>}

          <div className={styles.actions}>
            {dirty && <span className={styles.dirtyMsg}>Medida ainda não registrada.</span>}
            <Button variant="primary" icon="plus" loading={salvando} onClick={registrar}>Registrar medida</Button>
          </div>
        </section>
      )}

      {medidas.length === 0 ? (
        <EmptyState icon="reports" title="Sem medidas ainda" description="Registre peso, estatura e perímetro cefálico a cada consulta. Cada medida vira um ponto sobre as curvas da OMS." compact />
      ) : (
        <>
          {sexo && nascimento && ultima && resultadosUltima.length > 0 && (
            <section className={styles.card} aria-label="Última medida">
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>Última medida</div>
                <span className={styles.cardSub}>{formatDateBr(ultima.data)} · {idadeTexto(nascimento, ultima.data)}</span>
              </div>
              <div className={styles.stats}>
                {resultadosUltima.map(r => <ResultadoCard key={r.indicador} r={r} />)}
              </div>
              {resultadosUltima.some(r => r.implausivel) && <p className={styles.warn}>Há valor fora do que a OMS considera plausível para a idade. Confira a medida.</p>}
            </section>
          )}

          {sexo && nascimento && (
            <section className={styles.card} aria-label="Curvas de crescimento">
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>Curva de crescimento</div>
                <PillTabs<FaixaIdade>
                  label="Faixa de idade do gráfico"
                  value={faixa}
                  onChange={setFaixa}
                  options={[{ value: '2anos', label: '0 a 2 anos' }, { value: '5anos', label: '0 a 5 anos' }]}
                />
              </div>
              <PillTabs<Indicador>
                label="Indicador do gráfico"
                value={indicador}
                onChange={setIndicador}
                options={INDICADORES.map(i => ({ value: i, label: INDICADOR_INFO[i].curto }))}
              />
              <div className={styles.cardSub}>{INDICADOR_INFO[indicador].titulo} · {sexo === 'meninos' ? 'meninos' : 'meninas'}</div>
              <GraficoCrescimento sexo={sexo} indicador={indicador} faixa={faixa} pontos={pontos} />
            </section>
          )}

          <section className={styles.card} aria-label="Medidas registradas">
            <div className={styles.cardTitle}>Medidas registradas</div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Peso</th>
                    <th scope="col">Estatura</th>
                    <th scope="col">P. cefálico</th>
                    <th scope="col">IMC</th>
                    <th scope="col"><span className={styles.srOnly}>Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {listaInvertida.map(m => {
                    const res = sexo && nascimento ? avaliarRegistro(sexo, nascimento, m) : []
                    const cel = (ind: Indicador, valor: number | null) => {
                      if (valor === null) return '—'
                      const r = res.find(x => x.indicador === ind)
                      return (
                        <>
                          {fmt(valor, INDICADOR_INFO[ind].casas)} {INDICADOR_INFO[ind].unidade === 'kg/m²' ? '' : INDICADOR_INFO[ind].unidade}
                          {r && <span className={styles.cellSub}>Z {escoreTexto(r.z)} · {percentilTexto(r.z)}</span>}
                        </>
                      )
                    }
                    const imc = res.find(x => x.indicador === 'imc')
                    return (
                      <tr key={m.id}>
                        <td className={styles.num}>
                          {formatDateBr(m.data)}
                          {nascimento && <span className={styles.cellSub}>{idadeTexto(nascimento, m.data)}</span>}
                          {m.observacao && <span className={styles.cellSub}>{m.observacao}</span>}
                        </td>
                        <td className={styles.num}>{cel('peso', m.pesoKg)}</td>
                        <td className={styles.num}>{cel('estatura', m.estaturaCm)}</td>
                        <td className={styles.num}>{cel('pc', m.pcCm)}</td>
                        <td className={styles.num}>
                          {imc ? <>{fmt(imc.valor, 1)}<span className={styles.cellSub}>Z {escoreTexto(imc.z)} · {percentilTexto(imc.z)}</span></> : '—'}
                        </td>
                        <td>
                          <button type="button" className={styles.iconBtn} aria-label={`Excluir a medida de ${formatDateBr(m.data)}`} onClick={() => excluir(m)}><Icon name="trash" size={16} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function ResultadoCard({ r }: { r: ResultadoIndicador }) {
  const info = INDICADOR_INFO[r.indicador]
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{info.rotulo}</span>
      <span className={styles.statValue}>{fmt(r.valor, info.casas)}<small>{info.unidade}</small></span>
      <span className={styles.statSub}>Escore Z {escoreTexto(r.z)} · {percentilTexto(r.z)}</span>
      <span className={`${styles.tag} ${tagClasse(r.classificacao.gravidade)}`}>{r.classificacao.rotulo}</span>
    </div>
  )
}
