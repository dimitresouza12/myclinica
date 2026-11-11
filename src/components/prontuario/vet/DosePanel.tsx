'use client'
import { useId, useMemo, useState } from 'react'
import { DecimalInput } from '@/components/ui/NumericInput'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'
import {
  AVISO_CONFERIR, LIMITES_DOSE, TIPOS_CONCENTRACAO, calcularDose, fracaoDeComprimido, type TipoConcentracao,
} from '@/lib/vet/dose'
import { fmt } from '@/lib/vet/numeros'
import styles from './vet.module.css'

interface Props {
  /** peso mais recente do histórico (kg), ou null */
  pesoAtualKg: number | null
  /** peso do cadastro do pet, usado quando não há histórico */
  pesoCadastroKg: number | null
}

/** Calculadora de dose por peso: mg/kg × peso ÷ concentração do produto. Não tem banco de medicamentos. */
export function DosePanel({ pesoAtualKg, pesoCadastroKg }: Props) {
  const inicial = pesoAtualKg ?? pesoCadastroKg
  const origem = pesoAtualKg !== null ? 'última pesagem' : pesoCadastroKg !== null ? 'cadastro do pet' : null
  const [peso, setPeso] = useState(inicial !== null ? String(inicial) : '')
  const [dose, setDose] = useState('')
  const [tipo, setTipo] = useState<TipoConcentracao>('mg_ml')
  const [conc, setConc] = useState('')
  const idPeso = useId(), idDose = useId(), idConc = useId()

  const info = TIPOS_CONCENTRACAO.find(t => t.value === tipo)!
  const limConc = tipo === 'mg_ml' ? LIMITES_DOSE.mgPorMl : tipo === 'mg_comprimido' ? LIMITES_DOSE.mgPorComprimido : LIMITES_DOSE.percentual
  const preenchido = peso !== '' && dose !== '' && conc !== ''
  const calculo = useMemo(() => (preenchido ? calcularDose({ doseMgKg: dose, pesoKg: peso, tipo, concentracao: conc }) : null), [preenchido, dose, peso, tipo, conc])

  return (
    <div className={styles.wrap}>
      <div className={styles.warnStrong} role="note">
        <strong>Conferir a dose antes de prescrever.</strong> {AVISO_CONFERIR}
      </div>

      <section className={styles.card} aria-label="Dados da conta">
        <div className={styles.cardTitle}>Calculadora de dose por peso</div>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor={idPeso}>Peso do pet <span className={styles.unit}>(kg)</span></label>
            <DecimalInput id={idPeso} className={styles.input} value={peso} onChange={setPeso} max={LIMITES_DOSE.pesoKg.max} decimals={3} placeholder="0" />
            {origem && <span className={styles.hint}>Preenchido com a {origem}. Pode editar.</span>}
          </div>
          <div className={styles.field}>
            <label htmlFor={idDose}>Dose <span className={styles.unit}>(mg por kg, por vez)</span></label>
            <DecimalInput id={idDose} className={styles.input} value={dose} onChange={setDose} max={LIMITES_DOSE.doseMgKg.max} decimals={4} placeholder="0" />
          </div>
          <div className={styles.field}>
            <label htmlFor="vet-dose-tipo">Apresentação do medicamento</label>
            <SelectMenu id="vet-dose-tipo" variant="field" value={tipo} onChange={v => { setTipo(v as TipoConcentracao); setConc('') }} ariaLabel="Apresentação do medicamento"
              options={TIPOS_CONCENTRACAO.map(t => ({ value: t.value, label: t.label }))} />
          </div>
          <div className={styles.field}>
            <label htmlFor={idConc}>Concentração <span className={styles.unit}>({info.unidade})</span></label>
            <DecimalInput id={idConc} className={styles.input} value={conc} onChange={setConc} max={limConc.max} decimals={4} placeholder="0" />
            <span className={styles.hint}>Está no rótulo ou na bula do produto.</span>
          </div>
        </div>
      </section>

      {calculo === null && <p className={styles.hint}>Preencha peso, dose e concentração para ver o resultado.</p>}

      {calculo && !calculo.ok && (
        <div className={styles.avisos} role="alert">
          {calculo.erros.map(m => <span key={m} className={styles.errMsg}>{m}</span>)}
        </div>
      )}

      {calculo && calculo.ok && (
        <section className={styles.result} aria-live="polite" aria-label="Resultado">
          {calculo.volumeArredondadoMl !== null ? (
            <>
              <span className={styles.resultLabel}>Volume a administrar</span>
              <span className={styles.resultValue}>{fmt(calculo.volumeArredondadoMl, 2)}<small>mL</small></span>
            </>
          ) : (
            <>
              <span className={styles.resultLabel}>Comprimidos</span>
              <span className={styles.resultValue}>
                {calculo.comprimidosArredondados === 0 ? 'Menos de 1/4' : fracaoDeComprimido(calculo.comprimidosArredondados ?? 0)}
                <small>{calculo.comprimidosArredondados === 1 ? 'comprimido' : 'comprimidos'}</small>
              </span>
              <span className={styles.resultSub}>Cálculo exato: {fmt(calculo.comprimidos, 3)} comprimido(s)</span>
            </>
          )}
          <span className={styles.resultSub}>
            Dose pedida: {fmt(calculo.doseMg, 3)} mg. Dose entregue com o arredondamento: {fmt(calculo.doseEntregueMg, 3)} mg ({fmt(calculo.doseEntregueMgKg, 3)} mg/kg).
          </span>
        </section>
      )}

      {calculo && calculo.ok && calculo.avisos.length > 0 && (
        <div className={styles.avisos}>
          {calculo.avisos.map(a => (
            <div key={a} className={styles.warn}><Icon name="alert" size={14} aria-hidden="true" /> {a}</div>
          ))}
        </div>
      )}
    </div>
  )
}
