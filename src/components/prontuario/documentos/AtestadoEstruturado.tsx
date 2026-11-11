'use client'
import { useMemo, useState } from 'react'
import { DatePicker } from '@/components/ui/DatePicker'
import { SelectMenu } from '@/components/ui/SelectMenu'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { CidSearch } from '../CidSearch'
import {
  acceptsCid, APTIDAO_LABEL, buildDocText, defaultDocForm, FINALIDADE_LABEL, FINALIDADES_POR_TIPO, LAUDO_FINALIDADE_LABEL, LAUDO_RESULTADO_LABEL,
  MAX_OBSERVACAO, modeloCamposVazios, usesAcompanhante, usesAptidao, usesDias, usesHorario, validateDocForm,
  type AptidaoPara, type DocForm, type DocKind, type Finalidade, type LaudoFinalidade, type LaudoResultado, type ModeloTextos,
} from '@/lib/documentos/atestado'
import type { ResolvedDocFields } from '@/lib/documentos/campos'
import { hojeBrasil } from '@/lib/brasilDate'
import styles from './atestadoEstruturado.module.css'

interface Props {
  kind: DocKind
  /** Campos do cadastro já resolvidos (nome, CPF, data, profissional, registro/RQE). */
  fields: ResolvedDocFields
  /** Profissional e papel timbrado ainda carregando. */
  loading: boolean
  /** Modelos de texto próprios da clínica (chave `<tipo>.<finalidade>`); o que faltar usa o padrão do sistema. */
  modelos?: ModeloTextos
  /** Recebe o texto da prévia (já editado, se for o caso) para compor o documento. */
  onApply: (text: string) => void
}

const TITLE: Record<DocKind, string> = {
  atestado: 'Atestado',
  declaracao_comparecimento: 'Declaração de comparecimento',
  laudo: 'Laudo simples',
}

const SEM_MODELOS: ModeloTextos = {}
const opts = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map(value => ({ value, label: labels[value] }))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Formulário curto que monta o texto do documento sem o profissional escrever nada: finalidade, dias ou horário, CID
 * opcional com a autorização do paciente. A prévia pode ser ajustada antes de gerar. Não usa IA.
 * O pai monta com `key={kind}` para cada tipo ter o seu formulário.
 */
export function AtestadoEstruturado({ kind, fields, loading, modelos = SEM_MODELOS, onApply }: Props) {
  const [form, setForm] = useState<DocForm>(() => defaultDocForm(kind, hojeBrasil()))
  const [previewText, setPreviewText] = useState('')
  const [previewDirty, setPreviewDirty] = useState(false)
  const patch = (p: Partial<DocForm>) => { setForm(prev => ({ ...prev, ...p })); setPreviewDirty(false) }

  // modelo próprio da clínica que usa um campo sem valor: avisa em vez de deixar "[campo]" no documento
  const errors = useMemo(() => [...validateDocForm(form, fields), ...modeloCamposVazios(form, fields, modelos)], [form, fields, modelos])
  const generated = useMemo(() => (errors.length === 0 ? buildDocText(form, fields, modelos) : ''), [errors, form, fields, modelos])
  const shown = previewDirty ? previewText : generated
  const finalidades = FINALIDADES_POR_TIPO[kind]

  return (
    <div className={styles.box}>
      <h3 className={styles.title}>{TITLE[kind]}</h3>
      <p className={styles.lead}>Escolha as opções: o texto é montado com os dados do cadastro (paciente, CPF, profissional e registro). Você confere a prévia e pode ajustá-la antes de gerar o documento.</p>

      {finalidades.length > 0 && (
        <div role="group" aria-label="Finalidade" className={styles.choices}>
          {finalidades.map(fin => (
            <button key={fin} type="button" className={styles.choice} aria-pressed={form.finalidade === fin} onClick={() => patch({ finalidade: fin as Finalidade })}>{FINALIDADE_LABEL[fin]}</button>
          ))}
        </div>
      )}

      {kind === 'laudo' && (
        <div className={f.row2}>
          <div className={f.field}>
            <label htmlFor="ae-lfin">Finalidade do laudo</label>
            <SelectMenu variant="field" id="ae-lfin" value={form.laudoFinalidade} onChange={v => patch({ laudoFinalidade: v as LaudoFinalidade })} options={opts(LAUDO_FINALIDADE_LABEL).map(o => ({ ...o, label: cap(o.label) }))} />
          </div>
          <div className={f.field}>
            <label htmlFor="ae-lres">Resultado</label>
            <SelectMenu variant="field" id="ae-lres" value={form.laudoResultado} onChange={v => patch({ laudoResultado: v as LaudoResultado })} options={opts(LAUDO_RESULTADO_LABEL).map(o => ({ ...o, label: cap(o.label) }))} />
          </div>
        </div>
      )}

      <div className={f.row2}>
        <div className={f.field}>
          <label htmlFor="ae-data">{usesDias(form) ? 'Data de início' : 'Data do atendimento'}</label>
          <DatePicker id="ae-data" value={form.data} onChange={v => patch({ data: v })} />
        </div>
        {usesDias(form) && (
          <div className={f.field}>
            <label htmlFor="ae-dias">Dias de afastamento</label>
            <input id="ae-dias" type="number" inputMode="numeric" min={1} max={365} value={form.dias} onChange={e => patch({ dias: e.target.value })} />
          </div>
        )}
        {usesAptidao(form) && (
          <div className={f.field}>
            <label htmlFor="ae-apt">Apto para</label>
            <SelectMenu variant="field" id="ae-apt" value={form.aptidaoPara} onChange={v => patch({ aptidaoPara: v as AptidaoPara })} options={opts(APTIDAO_LABEL).map(o => ({ ...o, label: cap(o.label) }))} />
          </div>
        )}
        {usesAcompanhante(form) && (
          <div className={f.field}>
            <label htmlFor="ae-acomp">Nome do acompanhante</label>
            <input id="ae-acomp" value={form.acompanhante} maxLength={120} onChange={e => patch({ acompanhante: e.target.value })} />
          </div>
        )}
      </div>

      {usesHorario(form) && (
        <div className={f.row2}>
          <div className={f.field}>
            <label htmlFor="ae-ini">Horário de início</label>
            <input id="ae-ini" type="time" value={form.inicio} onChange={e => patch({ inicio: e.target.value })} />
          </div>
          <div className={f.field}>
            <label htmlFor="ae-fim">Horário de fim</label>
            <input id="ae-fim" type="time" value={form.fim} onChange={e => patch({ fim: e.target.value })} />
          </div>
        </div>
      )}

      {acceptsCid(kind) && (
        <div className={styles.cidRow}>
          <div className={f.field}>
            <label htmlFor="ae-cid">CID-10 (opcional)</label>
            <input id="ae-cid" value={form.cid} maxLength={20} placeholder="Ex.: J11" onChange={e => patch({ cid: e.target.value })} />
          </div>
          <CidSearch onPick={t => patch({ cid: t.split(' - ')[0].trim() })} />
          <label className={styles.check}>
            <input type="checkbox" checked={form.cidAutorizado} onChange={e => patch({ cidAutorizado: e.target.checked })} />
            <span>O paciente autorizou expressamente a inclusão do CID neste documento (Código de Ética Médica e Resolução CFM 1.658/2002). Sem a autorização, o CID não sai.</span>
          </label>
        </div>
      )}

      <div className={f.field}>
        <label htmlFor="ae-obs">Observação (opcional)</label>
        <textarea id="ae-obs" value={form.observacao} maxLength={MAX_OBSERVACAO} onChange={e => patch({ observacao: e.target.value })} />
      </div>

      {errors.length > 0
        ? <ul className={styles.errors} role="status">{errors.map(e => <li key={e}>{e}</li>)}</ul>
        : (
          <div className={f.field}>
            <label htmlFor="ae-prev">Prévia do texto (pode editar)</label>
            <textarea id="ae-prev" className={styles.preview} value={shown} onChange={e => { setPreviewText(e.target.value); setPreviewDirty(true) }} />
          </div>
        )}

      <div className={styles.actions}>
        <button type="button" className={btn.primary} disabled={errors.length > 0 || loading || shown.trim() === ''} onClick={() => onApply(shown)}>
          {loading ? 'Carregando...' : 'Gerar documento'}
        </button>
        {previewDirty && <button type="button" className={btn.ghost} onClick={() => setPreviewDirty(false)}>Desfazer minhas edições da prévia</button>}
      </div>
    </div>
  )
}
