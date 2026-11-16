'use client'
import { useEffect, useState } from 'react'
import type { AuthClinic, Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { formatDateBr } from '@/lib/documentos/campos'
import { montarCabecalho } from '@/lib/medico/cabecalho'
import { abrirJanelaDeImpressao, imprimirMedico, imprimirNaJanela, type ProfissionalImpresso } from '@/lib/medico/impresso'
import { pareceControlado, sugerirMedicamentos } from '@/lib/medico/receita/medicamentos'
import {
  htmlReceita, itemVazio, itensPreenchidos, MAX_ITENS_RECEITA, MAX_ORIENTACOES, medicamentosRepetidos, normalizarReceita, POSOLOGIAS_COMUNS,
  receitaTemConteudo, receitaVazia, resumoDaReceita, validarReceita, VIA_ROTULO, VIAS, type ItemReceita, type ReceitaDados, type Via,
} from '@/lib/medico/receita/receita'
import { excluirMedico, MENSAGEM_INDISPONIVEL, salvarMedico, type Indisponibilidade, type LinhaMedico } from '@/lib/medico/registros'
import styles from './medicina.module.css'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  profissional: ProfissionalImpresso
  linhas: LinhaMedico[]
  carregando: boolean
  motivo: Indisponibilidade | null
  recarregar: () => Promise<unknown>
  onDirtyChange: (dirty: boolean) => void
}

const snapshot = (d: ReceitaDados) => (receitaTemConteudo(d) ? JSON.stringify(d) : '')
const OPCOES_VIA = [{ value: '', label: 'Não informar' }, ...VIAS.map(v => ({ value: v as string, label: VIA_ROTULO[v] }))]

/**
 * Receita estruturada: medicamento, dose, via, posologia, duração e observação, escritos pelo profissional. Os nomes
 * genéricos são só sugestão de digitação (lista local, sem dose nem bula). Salva no prontuário e imprime.
 */
export function ReceitaPanel({ patient, clinic, clinicId, profissional, linhas, carregando, motivo, recarregar, onDirtyChange }: Props) {
  const hoje = hojeBrasil()
  const [rascunho, setRascunho] = useState<ReceitaDados>(receitaVazia)
  const [data, setData] = useState(hoje)
  const [foco, setFoco] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erros, setErros] = useState<string[]>([])
  const [aviso, setAviso] = useState<Indisponibilidade | null>(null)
  const [guardado, setGuardado] = useState('')

  const dirty = snapshot(rascunho) !== guardado
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const repetidos = medicamentosRepetidos(rascunho)
  const controlados = itensPreenchidos(rascunho).filter(i => pareceControlado(i.medicamento)).map(i => i.medicamento)

  const mudarItem = (idx: number, p: Partial<ItemReceita>) => {
    setRascunho(r => ({ ...r, itens: r.itens.map((it, i) => (i === idx ? { ...it, ...p } : it)) }))
    setErros([])
  }
  const adicionarItem = () => setRascunho(r => (r.itens.length >= MAX_ITENS_RECEITA ? r : { ...r, itens: [...r.itens, itemVazio()] }))
  const removerItem = (idx: number) => setRascunho(r => ({ ...r, itens: r.itens.length === 1 ? [itemVazio()] : r.itens.filter((_, i) => i !== idx) }))

  const cabecalho = (iso: string, prof: ProfissionalImpresso) => montarCabecalho({ clinica: clinic, paciente: patient, data: iso, profissional: prof })

  function novo() {
    setRascunho(receitaVazia())
    setData(hoje)
    setFoco(null)
    setErros([])
    setGuardado('')
  }

  async function finalizar(imprimir: boolean) {
    // a janela de impressão abre já, dentro do clique: depois do salvamento o navegador a bloquearia
    const janela = imprimir ? abrirJanelaDeImpressao() : null
    if (imprimir && !janela) { setErros(['Não abriu a impressão: o navegador bloqueou o pop-up. Libere pop-ups para este site e tente de novo.']); return }
    const problemas = validarReceita(rascunho)
    if (problemas.length) { janela?.close(); setErros(problemas); return }
    const dados: ReceitaDados = { ...rascunho, itens: itensPreenchidos(rascunho), profissional }
    setErros([])
    setSalvando(true)
    const res = await salvarMedico({ clinicId, patientId: patient.id, tipo: 'receita', data, dados })
    setSalvando(false)
    const html = janela ? htmlReceita(cabecalho(data, profissional), dados) : ''
    if (res.ok) {
      setAviso(null)
      await recarregar()
      showToast('ok', imprimir ? 'Receita salva. Abrindo a impressão.' : 'Receita salva no prontuário.')
      novo() // a receita já está no histórico (dá para imprimir de novo ou repetir de lá)
    } else {
      // sem histórico disponível a impressão continua funcionando (o aviso explica que não foi guardado)
      setAviso(res.motivo)
      if (!janela) { showToast('error', 'Não foi possível salvar no prontuário.'); return }
      setGuardado(snapshot(rascunho))
    }
    if (janela) await imprimirNaJanela(janela, html)
  }

  function repetir(l: LinhaMedico) {
    setRascunho({ ...normalizarReceita(l.dados), profissional: null })
    setData(hoje)
    setErros([])
    showToast('ok', 'Receita copiada para o formulário. Confira e salve como uma nova receita.')
  }

  function imprimirDoHistorico(l: LinhaMedico) {
    const d = normalizarReceita(l.dados)
    imprimirMedico(htmlReceita(cabecalho(l.data, d.profissional ?? profissional), d))
  }

  async function excluir(l: LinhaMedico) {
    const d = normalizarReceita(l.dados)
    const ok = await confirmDialog({
      title: 'Excluir esta receita?',
      message: `A receita de ${formatDateBr(l.data)} (${resumoDaReceita(d)}) será removida do histórico do prontuário. Não dá para desfazer.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    const r = await excluirMedico(l.id)
    if (!r.ok) { showToast('error', 'Não foi possível excluir agora.'); return }
    await recarregar()
  }

  return (
    <div className={styles.wrap}>
      {(motivo || aviso) && (
        <div className={styles.notice} role="status">
          <Icon name="info" size={18} />
          <div>{MENSAGEM_INDISPONIVEL[(motivo ?? aviso) as Indisponibilidade]}</div>
        </div>
      )}

      <p className={styles.hint}>
        Receita comum. O sistema não sugere doses nem confere interações: a prescrição é do profissional. Medicamentos de controle especial
        precisam do receituário próprio (aba Documentos e contratos, Receita Especial).
      </p>

      {rascunho.itens.map((it, idx) => {
        const sugestoes = foco === idx ? sugerirMedicamentos(it.medicamento) : []
        return (
          <section key={idx} className={styles.med} aria-label={`Medicamento ${idx + 1}`}>
            <div className={styles.medHead}>
              <span className={styles.medNum}>Medicamento {idx + 1}</span>
              <button type="button" className={styles.iconBtn} aria-label={`Remover o medicamento ${idx + 1}`} onClick={() => removerItem(idx)}><Icon name="trash" size={16} /></button>
            </div>

            <div className={styles.field}>
              <label htmlFor={`rx-med-${idx}`}>Medicamento</label>
              <input
                id={`rx-med-${idx}`} className={styles.input} value={it.medicamento} maxLength={200} autoComplete="off"
                onChange={e => mudarItem(idx, { medicamento: e.target.value })}
                onFocus={() => setFoco(idx)} onBlur={() => setTimeout(() => setFoco(f => (f === idx ? null : f)), 150)}
                placeholder="Nome genérico. Ex.: amoxicilina"
              />
              {sugestoes.length > 0 && (
                <div className={styles.suggest} role="listbox" aria-label="Sugestões de nome">
                  {sugestoes.map(n => (
                    <button
                      key={n} type="button" role="option" aria-selected={false} className={styles.chip}
                      onMouseDown={e => e.preventDefault()} onClick={() => { mudarItem(idx, { medicamento: n }); setFoco(null) }}
                    >{n}</button>
                  ))}
                </div>
              )}
              {it.medicamento.trim() !== '' && pareceControlado(it.medicamento) && (
                <p className={styles.warn}>Este medicamento costuma exigir receituário de controle especial. Esta receita comum não o substitui: use a Receita Especial em Documentos e contratos.</p>
              )}
            </div>

            <div className={styles.grid2}>
              <div className={styles.field}>
                <label htmlFor={`rx-dose-${idx}`}>Dose</label>
                <input id={`rx-dose-${idx}`} className={styles.input} value={it.dose} maxLength={200} onChange={e => mudarItem(idx, { dose: e.target.value })} placeholder="Ex.: 500 mg, 1 comprimido" />
              </div>
              <div className={styles.field}>
                <label htmlFor={`rx-via-${idx}`}>Via de administração</label>
                <SelectMenu variant="field" id={`rx-via-${idx}`} value={it.via ?? ''} onChange={v => mudarItem(idx, { via: v ? (v as Via) : null })} options={OPCOES_VIA} />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor={`rx-pos-${idx}`}>Posologia</label>
              <input id={`rx-pos-${idx}`} className={styles.input} value={it.posologia} maxLength={200} onChange={e => mudarItem(idx, { posologia: e.target.value })} placeholder="Ex.: de 8 em 8 horas" />
              <div className={styles.suggest} role="group" aria-label="Atalhos de posologia">
                {POSOLOGIAS_COMUNS.map(p => (
                  <button key={p} type="button" className={styles.chip} onClick={() => mudarItem(idx, { posologia: p })}>{p}</button>
                ))}
              </div>
            </div>

            <div className={styles.grid2}>
              <div className={styles.field}>
                <label htmlFor={`rx-dur-${idx}`}>Duração <span className={styles.unit}>(opcional)</span></label>
                <input id={`rx-dur-${idx}`} className={styles.input} value={it.duracao} maxLength={200} onChange={e => mudarItem(idx, { duracao: e.target.value })} placeholder="Ex.: 7 dias, uso contínuo" />
              </div>
              <div className={styles.field}>
                <label htmlFor={`rx-obs-${idx}`}>Observação <span className={styles.unit}>(opcional)</span></label>
                <input id={`rx-obs-${idx}`} className={styles.input} value={it.observacao} maxLength={300} onChange={e => mudarItem(idx, { observacao: e.target.value })} placeholder="Ex.: tomar após as refeições" />
              </div>
            </div>
          </section>
        )
      })}

      <div className={styles.row}>
        <Button variant="secondary" icon="plus" onClick={adicionarItem} disabled={rascunho.itens.length >= MAX_ITENS_RECEITA}>Adicionar medicamento</Button>
        {receitaTemConteudo(rascunho) && <Button variant="ghost" onClick={novo}>Limpar formulário</Button>}
      </div>

      <section className={styles.card} aria-label="Fechar a receita">
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="rx-data">Data da receita</label>
            <DatePicker id="rx-data" value={data} onChange={v => setData(v || hoje)} ariaLabel="Data da receita" />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="rx-orient">Orientações ao paciente <span className={styles.unit}>(opcional)</span></label>
          <textarea
            id="rx-orient" className={styles.textarea} value={rascunho.orientacoes} maxLength={MAX_ORIENTACOES}
            onChange={e => { setRascunho(r => ({ ...r, orientacoes: e.target.value })); setErros([]) }} placeholder="Ex.: retorno em 7 dias se não melhorar"
          />
        </div>

        {repetidos.length > 0 && <p className={styles.warn}>Medicamento repetido na receita: {repetidos.join(', ')}. Confira se não é duplicidade.</p>}
        {controlados.length > 0 && <p className={styles.warn}>Há medicamento de controle especial nesta receita comum. Ela não vale como receituário de controle especial.</p>}
        {!profissional.nome && <p className={styles.warn}>Escolha o profissional responsável acima: o nome e o registro dele saem na assinatura da receita.</p>}
        {erros.length > 0 && <ul className={styles.errors} role="alert">{erros.map(e => <li key={e}>{e}</li>)}</ul>}

        <div className={styles.actions}>
          {dirty && <span className={styles.dirtyMsg}>Ainda não salva no prontuário.</span>}
          <Button variant="secondary" loading={salvando} onClick={() => finalizar(false)}>Salvar</Button>
          <Button variant="primary" icon="file" loading={salvando} onClick={() => finalizar(true)}>Salvar e imprimir</Button>
        </div>
      </section>

      <section className={styles.card} aria-label="Receitas anteriores">
        <div className={styles.cardTitle}>Receitas anteriores</div>
        {carregando ? (
          <p className={styles.hint}>Carregando histórico...</p>
        ) : linhas.length === 0 ? (
          <EmptyState icon="file" title="Nenhuma receita guardada" description="As receitas salvas ficam aqui, com data, para imprimir de novo ou repetir." compact />
        ) : (
          <div className={styles.list}>
            {linhas.map(l => {
              const d = normalizarReceita(l.dados)
              return (
                <div key={l.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemTitle}>{formatDateBr(l.data)}</div>
                    <div className={styles.itemMeta}>{resumoDaReceita(d)}</div>
                  </div>
                  <div className={styles.itemActions}>
                    <button type="button" className={styles.iconBtn} aria-label={`Imprimir a receita de ${formatDateBr(l.data)}`} title="Imprimir" onClick={() => imprimirDoHistorico(l)}><Icon name="file" size={16} /></button>
                    <button type="button" className={styles.iconBtn} aria-label={`Repetir a receita de ${formatDateBr(l.data)} como nova`} title="Repetir como nova" onClick={() => repetir(l)}><Icon name="copy" size={16} /></button>
                    <button type="button" className={styles.iconBtn} aria-label={`Excluir a receita de ${formatDateBr(l.data)}`} title="Excluir" onClick={() => excluir(l)}><Icon name="trash" size={16} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
