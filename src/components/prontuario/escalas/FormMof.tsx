'use client'
import { AVALIACOES_MOF, MOF_ESCOLHAS, MOF_GRUPOS, contarMof, type AvaliacaoMof, type MofDados } from '@/lib/escalas/fichaMof'
import { Observacoes, Opcoes } from './controles'
import styles from './escalas.module.css'
import f from './protocolos.module.css'

export function FormMof({ dados, onChange }: { dados: MofDados; onChange: (d: MofDados) => void }) {
  const { avaliados, alterados } = contarMof(dados)

  function marca(id: string, v: AvaliacaoMof) {
    const itens = { ...dados.itens }
    if (itens[id] === v) delete itens[id]
    else itens[id] = v
    onChange({ ...dados, itens })
  }

  return (
    <>
      <div className={styles.progress} aria-live="polite">{avaliados} itens avaliados, {alterados} alterados</div>

      {MOF_GRUPOS.map(g => (
        <div key={g.id} className={styles.card}>
          <div className={styles.cardTitle}>{g.titulo}</div>
          <div>
            {g.itens.map(item => {
              const labelId = `mof-${item.id}`
              const v = dados.itens[item.id]
              return (
                <div key={item.id} className={f.mofItem}>
                  <div className={f.fieldLabel} id={labelId}>{item.rotulo}</div>
                  {item.dica && <div className={f.fieldHint}>{item.dica}</div>}
                  <div className={f.mofBtns} role="group" aria-labelledby={labelId}>
                    {AVALIACOES_MOF.map(a => (
                      <button key={a.id} type="button" className={`${styles.opt} ${a.id === 'alterado' ? f.optAlt : ''}`} aria-pressed={v === a.id} onClick={() => marca(item.id, a.id)}>
                        <span>{a.rotulo}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className={styles.card}>
        <div className={styles.cardTitle}>Padrões observados</div>
        {MOF_ESCOLHAS.map(c => (
          <Opcoes key={c.id} rotulo={c.titulo} valor={dados.escolhas[c.id] ?? null} opcoes={c.opcoes} colunas={3}
            onChange={v => {
              const escolhas = { ...dados.escolhas }
              if (v === null) delete escolhas[c.id]
              else escolhas[c.id] = v
              onChange({ ...dados, escolhas })
            }} />
        ))}
        <Observacoes id="mof-obs" valor={dados.obs} onChange={obs => onChange({ ...dados, obs })} />
      </div>
    </>
  )
}
