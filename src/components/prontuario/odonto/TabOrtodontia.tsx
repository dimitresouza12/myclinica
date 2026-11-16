'use client'
import { useEffect, useMemo, useState } from 'react'
import type { AuthClinic, Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { Icon } from '@/components/ui/Icon'
import { IntegerInput } from '@/components/ui/NumericInput'
import { PillTabs } from '@/components/ui/PillTabs'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import {
  APARELHOS, ARCADAS, SITUACOES, aparelhoUsaFio, comConsulta, consultaVazia, consultasOrdenadas, fotosDaFicha, linhaDoTempo, normalizarOrto,
  caminhoFotoOrto, ortoVazio, prazoManutencao, previsaoDeTermino, progressoPrevisto, proximaManutencao, resumoConsulta, rotuloSituacao, rotuloTratamento,
  semConsulta, somarDias, tempoDeTratamento, textoPrazo, textoTempo, type Arcadas, type OrtoConsulta, type OrtoDados, type SituacaoOrto, type AparelhoId,
} from '@/lib/odonto/ortodontia'
import { htmlOrtodontia, imprimirOdonto, dataBr } from '@/lib/odonto/imprimir'
import {
  excluirOdonto, MENSAGEM_ORTODONTIA, removerFotosOrto, salvarOdonto, subirFotoOrto, urlsDasFotos,
} from '@/lib/odonto/storage'
import { usePrintActions } from '../print/PrintRegistry'
import { ConsultaModal, type FotoNova } from './ConsultaModal'
import { useOdontoLista } from './useOdontoLista'
import common from './odontoCommon.module.css'
import styles from './ortodontia.module.css'

const fmtData = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
const snapshot = (d: OrtoDados) => JSON.stringify(d)

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  onDirtyChange?: (dirty: boolean) => void
}

interface ModalConsulta { consulta: OrtoConsulta; nova: boolean }

/** Aba "Ortodontia": ficha do aparelho, manutenções com ativação, fio, elásticos e fotos, próxima manutenção e linha do tempo. */
export function TabOrtodontia({ patient, clinic, clinicId, onDirtyChange }: Props) {
  const { linhas, carregando, motivo, recarregar } = useOdontoLista('odonto_ortodontia', patient.id)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<OrtoDados>(() => ortoVazio(''))
  const [savedSnap, setSavedSnap] = useState(() => snapshot(ortoVazio('')))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [iniciou, setIniciou] = useState(false)
  const [modal, setModal] = useState<ModalConsulta | null>(null)
  const [urlsEstado, setUrlsEstado] = useState<Record<string, string>>({})
  const urls = urlsEstado
  const hoje = hojeBrasil()

  const registros = useMemo(() => linhas.map(l => ({ id: l.id, data: l.data, dados: normalizarOrto(l.dados) })), [linhas])

  function abrirNovo() {
    const r = ortoVazio('')
    setActiveId(null); setDraft(r); setSavedSnap(snapshot(r)); setSaved(false)
  }
  function abrir(r: { id: string; dados: OrtoDados }) {
    setActiveId(r.id); setDraft(r.dados); setSavedSnap(snapshot(r.dados)); setSaved(false)
  }

  // abre o tratamento mais recente quando o histórico termina de carregar; sem histórico, uma ficha em branco
  if (!carregando && !iniciou) {
    setIniciou(true)
    if (registros[0]) abrir(registros[0]); else abrirNovo()
  }

  const dirty = snapshot(draft) !== savedSnap
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // endereços temporários das fotos (o bucket é privado); só busca quando a lista de caminhos muda
  const caminhos = useMemo(() => fotosDaFicha(draft), [draft])
  const chaveCaminhos = caminhos.join('|')
  useEffect(() => {
    if (!chaveCaminhos) return
    let vivo = true
    urlsDasFotos(chaveCaminhos.split('|')).then(u => { if (vivo) setUrlsEstado(u) })
    return () => { vivo = false }
  }, [chaveCaminhos])

  async function escolher(r: { id: string; dados: OrtoDados } | null) {
    if (r && r.id === activeId) return
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Descartar alterações?',
        message: 'Esta ficha tem alterações não salvas. Se continuar, elas serão perdidas.',
        confirmText: 'Descartar', cancelText: 'Voltar e salvar', danger: true,
      })
      if (!ok) return
    }
    if (r) abrir(r); else abrirNovo()
  }

  const set = <K extends keyof OrtoDados>(k: K, v: OrtoDados[K]) => { setDraft(d => ({ ...d, [k]: v })); setSaved(false) }

  function mudarSituacao(s: SituacaoOrto) {
    setDraft(d => ({
      ...d, situacao: s,
      // concluído e contenção encerram a fase ativa (data de conclusão); voltar ao tratamento ativo limpa a data
      conclusao: s === 'concluido' || s === 'contencao' ? (d.conclusao || hoje) : '',
    }))
    setSaved(false)
  }

  /** Grava a ficha inteira (nova ou existente). Devolve o id, ou null se falhou (a mensagem já foi mostrada). */
  async function gravar(next: OrtoDados): Promise<string | null> {
    const dataRef = next.instalacao || registros.find(r => r.id === activeId)?.data || hoje
    const r = await salvarOdonto({ tabela: 'odonto_ortodontia', id: activeId, clinicId, patientId: patient.id, data: dataRef, dados: next })
    if (!r.ok) { showToast('error', MENSAGEM_ORTODONTIA[r.motivo]); return null }
    setActiveId(r.id); setDraft(next); setSavedSnap(snapshot(next)); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    await recarregar()
    return r.id
  }

  async function salvarFicha() {
    setSaving(true)
    await gravar(draft)
    setSaving(false)
  }

  /** Salva a manutenção: sobe as fotos novas, grava a ficha e só então apaga do armazenamento as fotos removidas. */
  async function salvarConsulta(c: OrtoConsulta, novas: FotoNova[], removidas: string[]): Promise<boolean> {
    const enviadas: string[] = []
    try {
      for (const f of novas) {
        enviadas.push(await subirFotoOrto(caminhoFotoOrto({ clinicId, patientId: patient.id, ext: f.ext }), f.file, f.mime))
      }
    } catch (e) {
      await removerFotosOrto(enviadas)
      showToast('error', e instanceof Error ? e.message : 'Não consegui enviar as fotos. Tente de novo.')
      return false
    }
    const next = comConsulta(draft, { ...c, fotos: [...c.fotos, ...enviadas] })
    const id = await gravar(next)
    if (!id) { await removerFotosOrto(enviadas); return false }
    await removerFotosOrto(removidas)
    showToast('ok', 'Manutenção salva.')
    return true
  }

  async function excluirConsulta(c: OrtoConsulta) {
    const ok = await confirmDialog({
      title: 'Excluir esta manutenção?',
      message: `A manutenção de ${fmtData(c.data)}${c.fotos.length ? ` e as ${c.fotos.length} foto(s) dela` : ''} será removida do tratamento. Isso não pode ser desfeito.`,
      confirmText: 'Excluir manutenção', cancelText: 'Manter', danger: true,
    })
    if (!ok) return
    const id = await gravar(semConsulta(draft, c.id))
    if (id) await removerFotosOrto(c.fotos)
  }

  async function excluirTratamento() {
    if (!activeId) return
    const ok = await confirmDialog({
      title: 'Excluir este tratamento?',
      message: `A ficha de ${rotuloTratamento(draft)} será removida, com todas as manutenções e fotos. Isso não pode ser desfeito.`,
      confirmText: 'Excluir tratamento', cancelText: 'Manter', danger: true,
    })
    if (!ok) return
    const r = await excluirOdonto('odonto_ortodontia', activeId)
    if (!r.ok) { showToast('error', 'Não foi possível excluir agora. Tente de novo.'); return }
    await removerFotosOrto(fotosDaFicha(draft))
    const restantes = registros.filter(x => x.id !== activeId)
    await recarregar()
    if (restantes[0]) abrir(restantes[0]); else abrirNovo()
  }

  function novaManutencao() {
    // a próxima manutenção já vem sugerida pelo intervalo do tratamento; dá para trocar ou limpar
    const c = consultaVazia(crypto.randomUUID(), hoje)
    const intervalo = Number(draft.intervaloDias)
    setModal({ consulta: { ...c, proxima: intervalo > 0 ? somarDias(hoje, intervalo) : '' }, nova: true })
  }

  // ── derivados ──
  const consultas = consultasOrdenadas(draft)
  const prox = proximaManutencao(draft)
  const prazo = prox ? prazoManutencao(prox.data, hoje) : null
  const tempo = tempoDeTratamento(draft, hoje)
  const fim = previsaoDeTermino(draft)
  const pct = progressoPrevisto(draft, hoje)
  const linha = linhaDoTempo(draft, hoje)
  const usaFio = aparelhoUsaFio(draft.aparelho)

  const cab = { clinica: clinic.name, paciente: patient.name, detalhe: [clinic.address, clinic.phone].filter(Boolean).join(' | ') || undefined }
  usePrintActions('ortodontia', [{
    id: 'orto-ficha', label: 'Ficha de ortodontia',
    includes: ['Aparelho, arcadas, instalação e próxima manutenção', 'Histórico de manutenções (ativação, fio, elásticos) e linha do tempo'],
    disabledReason: !draft.instalacao && consultas.length === 0 ? 'Informe a instalação ou registre uma manutenção para imprimir' : undefined,
    run: () => imprimirOdonto(htmlOrtodontia(cab, draft, hoje)),
  }])

  return (
    <div className={common.wrap}>
      {motivo && (
        <div className={common.notice} role="status">
          <Icon name="alert" size={18} />
          <span>{MENSAGEM_ORTODONTIA[motivo]}</span>
        </div>
      )}

      {/* ── Tratamentos do paciente ── */}
      <div className={common.histBar}>
        <div className={common.histChips} role="group" aria-label="Tratamentos ortodônticos">
          {registros.map(r => (
            <button key={r.id} type="button" aria-pressed={r.id === activeId} className={`${common.chip} ${r.id === activeId ? common.chipActive : ''}`} onClick={() => escolher(r)}>
              {rotuloTratamento(r.dados)}
            </button>
          ))}
          {activeId === null && <span className={`${common.chip} ${common.chipActive} ${common.chipStatic}`} aria-current="true">Novo tratamento</span>}
        </div>
        {activeId !== null && <button type="button" className={`${common.chip} ${common.chipNew}`} onClick={() => escolher(null)}>+ Novo tratamento</button>}
      </div>
      {carregando && <p className={common.hint}>Carregando tratamentos...</p>}

      {/* ── Aparelho e plano ── */}
      <section className={common.card} aria-label="Aparelho e plano de tratamento">
        <div className={common.cardHead}>
          <h3 className={common.cardTitle}>Aparelho e plano</h3>
          <span className={common.tag}>{rotuloSituacao(draft.situacao)}</span>
        </div>
        <div className={styles.pickRow}>
          <div className={common.field}>
            <label htmlFor="orto-aparelho">Tipo de aparelho</label>
            <SelectMenu id="orto-aparelho" variant="field" ariaLabel="Tipo de aparelho" value={draft.aparelho} onChange={v => set('aparelho', v as AparelhoId)}
              options={APARELHOS.map(a => ({ value: a.id, label: a.rotulo }))} />
          </div>
          {draft.aparelho === 'outro' && (
            <div className={common.field}>
              <label htmlFor="orto-outro">Qual aparelho</label>
              <input id="orto-outro" className={common.input} value={draft.aparelhoOutro} maxLength={80} onChange={e => set('aparelhoOutro', e.target.value)} placeholder="Ex.: placa de Hawley" />
            </div>
          )}
          <div className={common.field}>
            <label>Arcadas</label>
            <PillTabs<Arcadas> label="Arcadas com aparelho" value={draft.arcadas} onChange={v => set('arcadas', v)} options={ARCADAS.map(a => ({ value: a.id, label: a.rotulo }))} />
          </div>
          <div className={common.field}>
            <label htmlFor="orto-situacao">Situação</label>
            <SelectMenu id="orto-situacao" variant="field" ariaLabel="Situação do tratamento" value={draft.situacao} onChange={v => mudarSituacao(v as SituacaoOrto)}
              options={SITUACOES.map(s => ({ value: s.id, label: s.rotulo }))} />
          </div>
        </div>
        <div className={common.grid}>
          <div className={common.field}>
            <label>Data de instalação</label>
            <DatePicker value={draft.instalacao} onChange={v => set('instalacao', v)} ariaLabel="Data de instalação do aparelho" placeholder="Ainda não instalado" />
          </div>
          <div className={common.field}>
            <label htmlFor="orto-previsao">Duração prevista <span className={common.unit}>(meses)</span></label>
            <IntegerInput id="orto-previsao" className={common.input} value={draft.previsaoMeses} onChange={v => set('previsaoMeses', v)} max={120} placeholder="Ex.: 18" />
          </div>
          <div className={common.field}>
            <label htmlFor="orto-intervalo">Intervalo entre manutenções <span className={common.unit}>(dias)</span></label>
            <IntegerInput id="orto-intervalo" className={common.input} value={draft.intervaloDias} onChange={v => set('intervaloDias', v)} max={365} placeholder="Ex.: 30" />
          </div>
          {(draft.situacao === 'concluido' || draft.situacao === 'contencao') && (
            <div className={common.field}>
              <label>{draft.situacao === 'contencao' ? 'Fim da fase ativa' : 'Data de conclusão'}</label>
              <DatePicker value={draft.conclusao} onChange={v => set('conclusao', v)} ariaLabel="Data de conclusão do tratamento" max={hoje} />
            </div>
          )}
        </div>
        <div className={common.field}>
          <label htmlFor="orto-objetivo">Objetivo do tratamento</label>
          <textarea id="orto-objetivo" className={common.textarea} value={draft.objetivo} onChange={e => set('objetivo', e.target.value)} placeholder="Queixa principal, plano ortodôntico, metas (ex.: corrigir mordida cruzada, fechar diastema)" />
        </div>
        <div className={common.saveRow}>
          {dirty && !saving && <span className={common.dirtyMsg}>Alterações não salvas</span>}
          {saved && <span className={common.savedMsg}><Icon name="check" size={16} /> Salvo</span>}
          {activeId && <Button variant="secondary" onClick={excluirTratamento} disabled={saving}>Excluir tratamento</Button>}
          <Button variant="primary" onClick={salvarFicha} loading={saving} disabled={!dirty}>{activeId ? 'Salvar alterações' : 'Salvar tratamento'}</Button>
        </div>
      </section>

      {/* ── Próxima manutenção e andamento ── */}
      <section className={common.card} aria-label="Próxima manutenção e andamento">
        <h3 className={common.cardTitle}>Próxima manutenção</h3>
        {prox && prazo ? (
          <div className={styles.nextBox}>
            <span className={styles.nextDate}>{dataBr(prox.data)}</span>
            <div className={styles.nextInfo}>
              <span className={`${common.tag} ${prazo.estado === 'atrasada' ? common.tagBad : prazo.estado === 'hoje' ? common.tagWarn : common.tagOk}`}>{textoPrazo(prazo)}</span>
              <span className={common.hint}>{prox.origem === 'agendada' ? 'Data marcada na última manutenção.' : 'Sugerida pelo intervalo padrão; marque a data real ao registrar a manutenção.'}</span>
            </div>
          </div>
        ) : (
          <p className={common.hint}>
            {draft.situacao === 'concluido' || draft.situacao === 'pausado'
              ? 'Tratamento concluído ou pausado: não há manutenção a marcar.'
              : 'Informe a data de instalação e o intervalo entre manutenções, ou marque a data ao registrar uma manutenção.'}
          </p>
        )}
        {(tempo || fim) && (
          <div className={common.stats}>
            {tempo && <div className={common.stat}><span className={common.statLabel}>Tempo de tratamento</span><span className={common.statValue} style={{ fontSize: '1.05rem' }}>{textoTempo(tempo)}</span></div>}
            {fim && <div className={common.stat}><span className={common.statLabel}>Previsão de término</span><span className={common.statValue} style={{ fontSize: '1.05rem' }}>{dataBr(fim)}</span><span className={common.statSub}>{draft.previsaoMeses} meses de tratamento</span></div>}
            <div className={common.stat}><span className={common.statLabel}>Manutenções</span><span className={common.statValue}>{consultas.length}</span></div>
          </div>
        )}
        {pct !== null && (
          <div className={styles.progressRow}>
            <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Andamento em relação ao prazo previsto">
              <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            </div>
            <span className={common.hint}>{pct}% do prazo previsto</span>
          </div>
        )}
      </section>

      {/* ── Manutenções ── */}
      <section className={common.card} aria-label="Manutenções">
        <div className={common.cardHead}>
          <h3 className={common.cardTitle}>Manutenções</h3>
          <Button variant="primary" icon="plus" onClick={novaManutencao}>Registrar manutenção</Button>
        </div>
        {consultas.length === 0 ? (
          <p className={common.empty}>Nenhuma manutenção registrada. Registre a primeira consulta de manutenção com a ativação, o fio e os elásticos usados.</p>
        ) : (
          <ul className={styles.list}>
            {consultas.map(c => (
              <li key={c.id} className={styles.visit}>
                <div className={styles.visitHead}>
                  <span className={styles.visitDate}>{fmtData(c.data)}</span>
                  <div className={styles.visitActions}>
                    <button type="button" className={common.iconBtn} aria-label={`Editar a manutenção de ${fmtData(c.data)}`} onClick={() => setModal({ consulta: c, nova: false })}><Icon name="edit" size={16} /></button>
                    <button type="button" className={common.iconBtn} aria-label={`Excluir a manutenção de ${fmtData(c.data)}`} onClick={() => excluirConsulta(c)}><Icon name="trash" size={16} /></button>
                  </div>
                </div>
                {c.ativacao && <p className={styles.visitLine}><b>Ativação:</b> {c.ativacao}</p>}
                {usaFio && (c.fioSup || c.fioInf) && (
                  <p className={styles.visitLine}><b>Fio:</b> {[c.fioSup && `superior ${c.fioSup}`, c.fioInf && `inferior ${c.fioInf}`].filter(Boolean).join(', ')}</p>
                )}
                {c.elasticos && <p className={styles.visitLine}><b>Elásticos:</b> {c.elasticos}</p>}
                {c.obs && <p className={styles.visitLine}>{c.obs}</p>}
                {!resumoConsulta(c, usaFio) && !c.obs && <p className={common.hint}>Sem detalhes registrados.</p>}
                {c.fotos.length > 0 && (
                  <div className={styles.photos}>
                    {c.fotos.map(p => (
                      urls[p]
                        ? (
                          <a key={p} href={urls[p]} target="_blank" rel="noopener noreferrer" className={styles.photo} aria-label={`Abrir foto da manutenção de ${fmtData(c.data)}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={urls[p]} alt="" loading="lazy" />
                          </a>
                        )
                        : <span key={p} className={styles.photo}><span className={styles.photoMissing}>Carregando</span></span>
                    ))}
                  </div>
                )}
                {c.proxima && <span className={styles.visitNext}>Próxima marcada para {dataBr(c.proxima)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Linha do tempo ── */}
      <section className={common.card} aria-label="Linha do tempo do tratamento">
        <h3 className={common.cardTitle}>Linha do tempo</h3>
        {linha.length === 0 ? (
          <p className={common.empty}>A linha do tempo aparece quando houver a data de instalação ou uma manutenção.</p>
        ) : (
          <ol className={styles.timeline}>
            {linha.map((e, i) => {
              const estado = e.estado === 'feito' ? styles.done : e.estado === 'atrasado' ? styles.late : styles.future
              const consulta = e.consultaId ? draft.consultas.find(c => c.id === e.consultaId) : undefined
              const corpo = (
                <>
                  <span className={styles.eventDate}>{fmtData(e.data)}</span>
                  <span className={styles.eventTitle}>{e.titulo}</span>
                  {e.detalhe && <span className={styles.eventDetail}>{e.detalhe}</span>}
                  {e.fotos > 0 && <span className={styles.eventDetail}>{e.fotos} {e.fotos === 1 ? 'foto' : 'fotos'}</span>}
                  {e.estado === 'futuro' && <span className={styles.eventTag}>Previsto</span>}
                  {e.estado === 'atrasado' && <span className={styles.eventTag}>Vencido</span>}
                </>
              )
              return (
                <li key={`${e.tipo}-${e.data}-${i}`} className={`${styles.event} ${estado}`}>
                  <span className={styles.dot} aria-hidden="true" />
                  {consulta
                    ? <button type="button" className={`${styles.eventBody} ${styles.eventBtn}`} onClick={() => setModal({ consulta, nova: false })} aria-label={`Abrir a manutenção de ${fmtData(e.data)}`}>{corpo}</button>
                    : <div className={styles.eventBody}>{corpo}</div>}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {modal && (
        <ConsultaModal
          key={modal.consulta.id}
          consulta={modal.consulta}
          nova={modal.nova}
          aparelho={draft.aparelho}
          arcadas={draft.arcadas}
          urls={urls}
          onClose={() => setModal(null)}
          onSalvar={salvarConsulta}
        />
      )}
    </div>
  )
}
