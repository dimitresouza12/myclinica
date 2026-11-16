'use client'
import { Fragment } from 'react'
import {
  FREQ_VA, FREQ_VO, LADOS, LIMIAR_MAX, LIMIAR_MIN, ROTULO_TIPO, classificarMedia, mediaTonal, tipoDaPerda,
  type AudiogramaDados, type LadoAudiograma,
} from '@/lib/escalas/audiograma'
import { AudiogramaChart } from './AudiogramaChart'
import { CampoNumero, Observacoes } from './controles'
import styles from './escalas.module.css'
import f from './protocolos.module.css'

const TOM_CLASS = { ok: styles.tomOk, info: styles.tomInfo, wait: styles.tomWait, warn: styles.tomWarn, bad: styles.tomBad }

const OPCOES_DB: number[] = []
for (let db = LIMIAR_MIN; db <= LIMIAR_MAX; db += 5) OPCOES_DB.push(db)

function SeletorDb({ rotulo, valor, onChange }: { rotulo: string; valor: number | null; onChange: (v: number | null) => void }) {
  return (
    <select className={f.select} aria-label={rotulo} value={valor ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">-</option>
      {OPCOES_DB.map(db => <option key={db} value={db}>{db}</option>)}
    </select>
  )
}

export function FormAudiograma({ dados, onChange }: { dados: AudiogramaDados; onChange: (d: AudiogramaDados) => void }) {
  function mudaLimiar(lado: LadoAudiograma, via: 'va' | 'vo', i: number, v: number | null) {
    const lista = dados[lado][via].slice()
    lista[i] = v
    onChange({ ...dados, [lado]: { ...dados[lado], [via]: lista } })
  }
  function mudaOrelha(lado: LadoAudiograma, parte: { lrf?: number | null; iprf?: number | null }) {
    onChange({ ...dados, [lado]: { ...dados[lado], ...parte } })
  }

  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Gráfico</div>
        <AudiogramaChart dados={dados} />
        <div className={f.resRows} aria-live="polite">
          {LADOS.map(l => {
            const media = mediaTonal(dados[l.id])
            const grau = media === null ? null : classificarMedia(media)
            const tipo = tipoDaPerda(dados[l.id])
            return (
              <div key={l.id} className={f.resRow}>
                <span className={f.resSigla}>{l.sigla}</span>
                {media === null ? <span>Média tonal: preencha a via aérea de 500, 1000 e 2000 Hz.</span> : (
                  <>
                    <span>Média tonal {media} dB NA</span>
                    {grau && <span className={`${styles.chip} ${TOM_CLASS[grau.tom]}`}>{grau.rotulo}</span>}
                    {tipo && <span className={styles.chip}>{ROTULO_TIPO[tipo]} (sugerido pelo gap)</span>}
                  </>
                )}
              </div>
            )
          })}
        </div>
        <div className={f.fieldHint}>Grau pela média de 500, 1000 e 2000 Hz (Lloyd e Kaplan, 1978). Informe no laudo o critério adotado.</div>
      </div>

      {LADOS.map(l => (
        <div key={l.id} className={styles.card}>
          <div className={f.earTitle}><span className={`${f.earDot} ${l.id === 'od' ? f.earOd : f.earOe}`} aria-hidden="true" />{l.nome}</div>
          <div className={f.audGrid}>
            <span className={f.audHead}>Hz</span>
            <span className={f.audHead}>Via aérea (dB NA)</span>
            <span className={f.audHead}>Via óssea (dB NA)</span>
            {FREQ_VA.map((freq, i) => {
              const iVo = FREQ_VO.indexOf(freq as (typeof FREQ_VO)[number])
              return (
                <Fragment key={freq}>
                  <span className={f.audFreq}>{freq}</span>
                  <SeletorDb rotulo={`${l.nome}, via aérea, ${freq} Hz`} valor={dados[l.id].va[i]} onChange={v => mudaLimiar(l.id, 'va', i, v)} />
                  {iVo >= 0
                    ? <SeletorDb rotulo={`${l.nome}, via óssea, ${freq} Hz`} valor={dados[l.id].vo[iVo]} onChange={v => mudaLimiar(l.id, 'vo', iVo, v)} />
                    : <span className={f.audNa} aria-hidden="true">-</span>}
                </Fragment>
              )
            })}
          </div>
          <div className={f.twoCols}>
            <div className={f.fieldInline}>
              <label className={f.fieldLabel} htmlFor={`lrf-${l.id}`}>LRF (dB NA)</label>
              <select id={`lrf-${l.id}`} className={f.select} value={dados[l.id].lrf ?? ''}
                onChange={e => mudaOrelha(l.id, { lrf: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">-</option>
                {OPCOES_DB.map(db => <option key={db} value={db}>{db}</option>)}
              </select>
            </div>
            <CampoNumero id={`iprf-${l.id}`} rotulo="IPRF (%)" valor={dados[l.id].iprf} min={0} max={100}
              onChange={v => mudaOrelha(l.id, { iprf: v })} />
          </div>
          <div className={f.fieldHint}>LRF: limiar de recepção de fala. IPRF: índice percentual de reconhecimento de fala. Opcionais.</div>
        </div>
      ))}

      <div className={styles.card}>
        <Observacoes id="aud-obs" valor={dados.obs} onChange={obs => onChange({ ...dados, obs })} />
        <div className={f.fieldHint}>Anote aqui mascaramento, ausência de resposta, equipamento e condições do exame.</div>
      </div>
    </>
  )
}
