'use client'
import {
  ATAQUE, COORDENACAO, GRBAS_GRAUS, GRBAS_ITENS, LIMITE_SZ, LOUDNESS, PITCH, RESSONANCIA, TMF_SONS, VOZ_HABITOS, VOZ_SINTOMAS,
  normalizarVoz, relacaoSZ, type GrbasId, type TmfId, type VozDados,
} from '@/lib/escalas/fichaVoz'
import { CampoNumero, MultiOpcoes, Nota0a10, Observacoes, Opcoes } from './controles'
import styles from './escalas.module.css'
import f from './protocolos.module.css'

export function FormVoz({ dados, onChange }: { dados: VozDados; onChange: (d: VozDados) => void }) {
  const sz = relacaoSZ(normalizarVoz(dados))

  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Avaliação perceptivo-auditiva (GRBAS)</div>
        <div className={f.fieldHint}>Grau de 0 a 3: 0 sem alteração, 1 leve, 2 moderada, 3 intensa (Hirano, 1981).</div>
        <div>
          {GRBAS_ITENS.map(item => {
            const labelId = `grbas-${item.id}`
            const v = dados.grbas[item.id as GrbasId]
            return (
              <div key={item.id} className={f.field}>
                <div className={f.fieldLabel} id={labelId}>{item.sigla}: {item.nome}</div>
                <div className={f.fieldHint}>{item.dica}</div>
                <div className={f.grade4} role="group" aria-labelledby={labelId}>
                  {GRBAS_GRAUS.map((grau, n) => (
                    <button key={n} type="button" className={styles.opt} aria-pressed={v === n} aria-label={`${item.nome}: ${n}, ${grau.toLowerCase()}`}
                      onClick={() => onChange({ ...dados, grbas: { ...dados.grbas, [item.id]: v === n ? null : n } })}>
                      <span>{n}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Tempos máximos de fonação</div>
        <div className={f.fieldHint}>Em segundos, com uma casa decimal. Use a melhor de três tentativas. Os valores variam com idade, sexo e esforço: aqui servem para acompanhar.</div>
        <div className={f.twoCols}>
          {TMF_SONS.map(som => (
            <CampoNumero key={som.id} id={`tmf-${som.id}`} rotulo={`Som ${som.rotulo} (s)`} valor={dados.tmf[som.id as TmfId]} min={0.1} max={99.9} step={0.1}
              onChange={v => onChange({ ...dados, tmf: { ...dados.tmf, [som.id]: v } })} />
          ))}
          <CampoNumero id="voz-f0" rotulo="Frequência fundamental (Hz)" valor={dados.f0} min={40} max={1500}
            onChange={v => onChange({ ...dados, f0: v })} />
        </div>
        <div className={f.metrics} aria-live="polite">
          <div className={f.metric}>
            <span className={f.metricVal}>{sz === null ? '-' : String(sz).replace('.', ',')}</span>
            <span className={f.metricLbl}>Relação s/z{sz !== null && sz > LIMITE_SZ ? ': acima de 1,4, avaliar a função laríngea' : ''}</span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Parâmetros vocais</div>
        <Opcoes rotulo="Pitch (tom)" valor={dados.pitch} opcoes={PITCH} onChange={pitch => onChange({ ...dados, pitch })} colunas={3} />
        <Opcoes rotulo="Loudness (intensidade)" valor={dados.loudness} opcoes={LOUDNESS} onChange={loudness => onChange({ ...dados, loudness })} colunas={3} />
        <Opcoes rotulo="Ressonância" valor={dados.ressonancia} opcoes={RESSONANCIA} onChange={ressonancia => onChange({ ...dados, ressonancia })} />
        <Opcoes rotulo="Ataque vocal" valor={dados.ataque} opcoes={ATAQUE} onChange={ataque => onChange({ ...dados, ataque })} colunas={3} />
        <Opcoes rotulo="Coordenação pneumofonoarticulatória" valor={dados.coordenacao} opcoes={COORDENACAO} onChange={coordenacao => onChange({ ...dados, coordenacao })} />
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Queixas e hábitos</div>
        <MultiOpcoes rotulo="Queixas atuais" valores={dados.sintomas} opcoes={VOZ_SINTOMAS} onChange={sintomas => onChange({ ...dados, sintomas })} />
        <MultiOpcoes rotulo="Hábitos e fatores" valores={dados.habitos} opcoes={VOZ_HABITOS} onChange={habitos => onChange({ ...dados, habitos })} />
        <Nota0a10 rotulo="Quanto a voz incomoda hoje, segundo o paciente" dica="0 nada, 10 muitíssimo" valor={dados.autoavaliacao}
          onChange={autoavaliacao => onChange({ ...dados, autoavaliacao })} />
        <Observacoes id="voz-obs" valor={dados.obs} onChange={obs => onChange({ ...dados, obs })} />
      </div>
    </>
  )
}
