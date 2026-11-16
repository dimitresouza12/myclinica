'use client'
import styles from './escalas.module.css'
import f from './protocolos.module.css'

/** Uma opção entre várias; tocar de novo na escolhida limpa. */
export function Opcoes<T extends string>({ rotulo, dica, valor, opcoes, onChange, colunas }: {
  rotulo: string
  dica?: string
  valor: T | null
  opcoes: readonly { id: T; rotulo: string }[]
  onChange: (v: T | null) => void
  colunas?: 3
}) {
  const labelId = `ch-${rotulo.replace(/\W+/g, '-')}`
  return (
    <div className={f.field}>
      <div className={f.fieldLabel} id={labelId}>{rotulo}</div>
      {dica && <div className={f.fieldHint}>{dica}</div>}
      <div className={colunas === 3 ? f.choices3 : f.choices} role="group" aria-labelledby={labelId}>
        {opcoes.map(o => (
          <button key={o.id} type="button" className={styles.opt} aria-pressed={valor === o.id} onClick={() => onChange(valor === o.id ? null : o.id)}>
            <span>{o.rotulo}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Várias opções ao mesmo tempo. */
export function MultiOpcoes({ rotulo, dica, valores, opcoes, onChange }: {
  rotulo: string
  dica?: string
  valores: string[]
  opcoes: readonly { id: string; rotulo: string }[]
  onChange: (v: string[]) => void
}) {
  const labelId = `mu-${rotulo.replace(/\W+/g, '-')}`
  return (
    <div className={f.field}>
      <div className={f.fieldLabel} id={labelId}>{rotulo}</div>
      {dica && <div className={f.fieldHint}>{dica}</div>}
      <div className={f.choices} role="group" aria-labelledby={labelId}>
        {opcoes.map(o => {
          const on = valores.includes(o.id)
          return (
            <button key={o.id} type="button" className={styles.opt} aria-pressed={on}
              onClick={() => onChange(on ? valores.filter(v => v !== o.id) : [...valores, o.id])}>
              <span>{o.rotulo}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Nota de 0 a 10 (incômodo com a voz ou com a fala). */
export function Nota0a10({ rotulo, dica, valor, onChange }: {
  rotulo: string
  dica?: string
  valor: number | null
  onChange: (v: number | null) => void
}) {
  const labelId = `nt-${rotulo.replace(/\W+/g, '-')}`
  return (
    <div className={f.field}>
      <div className={f.fieldLabel} id={labelId}>{rotulo}</div>
      {dica && <div className={f.fieldHint}>{dica}</div>}
      <div className={f.nota11} role="group" aria-labelledby={labelId}>
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" className={styles.opt} aria-pressed={valor === n} onClick={() => onChange(valor === n ? null : n)}>
            <span>{n}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Observações livres (até 400 caracteres). */
export function Observacoes({ valor, onChange, id }: { valor: string; onChange: (v: string) => void; id: string }) {
  return (
    <div className={f.field}>
      <label className={f.fieldLabel} htmlFor={id}>Observações</label>
      <textarea id={id} className={f.textarea} value={valor} maxLength={400} onChange={e => onChange(e.target.value)} />
      <span className={f.counter}>{valor.length} de 400</span>
    </div>
  )
}

/** Campo numérico (segundos, hertz, total de palavras). */
export function CampoNumero({ rotulo, dica, valor, onChange, min, max, step, id }: {
  rotulo: string
  dica?: string
  valor: number | null
  onChange: (v: number | null) => void
  min: number
  max: number
  step?: number
  id: string
}) {
  return (
    <div className={f.fieldInline}>
      <label className={f.fieldLabel} htmlFor={id}>{rotulo}</label>
      <input id={id} className={f.input} type="number" inputMode={step && step < 1 ? 'decimal' : 'numeric'} min={min} max={max} step={step ?? 1}
        value={valor ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} />
      {dica && <div className={f.fieldHint}>{dica}</div>}
    </div>
  )
}
