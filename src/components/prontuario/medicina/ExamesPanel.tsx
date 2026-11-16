'use client'
import { useEffect, useMemo, useState } from 'react'
import type { AuthClinic, Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { PillTabs } from '@/components/ui/PillTabs'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { formatDateBr } from '@/lib/documentos/campos'
import { montarCabecalho } from '@/lib/medico/cabecalho'
import { abrirJanelaDeImpressao, imprimirMedico, imprimirNaJanela, type ProfissionalImpresso } from '@/lib/medico/impresso'
import { buscarExames, categoriasDoGrupo, GRUPO_ROTULO, type GrupoExame } from '@/lib/medico/exames/catalogo'
import {
  adicionarLivre, alternarExame, htmlPedidoExames, MAX_INDICACAO, MAX_NOME_EXAME, MAX_OBSERVACOES, normalizarPedido, pedidoTemConteudo, pedidoVazio,
  resumoDoPedido, URGENCIA_ROTULO, validarPedido, type PedidoExamesDados, type Urgencia,
} from '@/lib/medico/exames/pedido'
import { excluirMedico, MENSAGEM_INDISPONIVEL, salvarMedico, type Indisponibilidade, type LinhaMedico } from '@/lib/medico/registros'
import { CidSearch } from '../CidSearch'
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

type FiltroGrupo = GrupoExame | 'todos'
const LIMITE_LISTA = 60
const snapshot = (d: PedidoExamesDados) => (pedidoTemConteudo(d) ? JSON.stringify(d) : '')

/** Pedido de exames: escolha no catálogo (ou exame livre), urgência, indicação clínica e CID; salva no prontuário e imprime. */
export function ExamesPanel({ patient, clinic, clinicId, profissional, linhas, carregando, motivo, recarregar, onDirtyChange }: Props) {
  const hoje = hojeBrasil()
  const [rascunho, setRascunho] = useState<PedidoExamesDados>(pedidoVazio)
  const [data, setData] = useState(hoje)
  const [busca, setBusca] = useState('')
  const [grupo, setGrupo] = useState<FiltroGrupo>('todos')
  const [categoria, setCategoria] = useState('')
  const [livre, setLivre] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erros, setErros] = useState<string[]>([])
  const [aviso, setAviso] = useState<Indisponibilidade | null>(null)
  const [guardado, setGuardado] = useState('')

  const dirty = snapshot(rascunho) !== guardado
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const categorias = useMemo(() => categoriasDoGrupo(grupo), [grupo])
  const resultados = useMemo(() => buscarExames(busca, { grupo, categoria: categoria || null }), [busca, grupo, categoria])
  const marcados = useMemo(() => new Set(rascunho.itens.map(i => i.id).filter(Boolean) as string[]), [rascunho.itens])

  const patch = (p: Partial<PedidoExamesDados>) => { setRascunho(r => ({ ...r, ...p })); setErros([]) }

  function mudarGrupo(g: FiltroGrupo) { setGrupo(g); setCategoria('') }

  function adicionarLivreAgora() {
    if (!livre.trim()) return
    patch({ itens: adicionarLivre(rascunho.itens, livre) })
    setLivre('')
  }

  const cabecalho = (iso: string, prof: ProfissionalImpresso) => montarCabecalho({
    clinica: clinic, paciente: patient, data: iso, profissional: prof,
  })

  async function finalizar(imprimir: boolean) {
    // a janela de impressão abre já, dentro do clique: depois do salvamento o navegador a bloquearia
    const janela = imprimir ? abrirJanelaDeImpressao() : null
    if (imprimir && !janela) { setErros(['Não abriu a impressão: o navegador bloqueou o pop-up. Libere pop-ups para este site e tente de novo.']); return }
    const problemas = validarPedido(rascunho)
    if (problemas.length) { janela?.close(); setErros(problemas); return }
    const dados: PedidoExamesDados = { ...rascunho, profissional }
    setErros([])
    setSalvando(true)
    const res = await salvarMedico({ clinicId, patientId: patient.id, tipo: 'pedido_exames', data, dados })
    setSalvando(false)
    const html = janela ? htmlPedidoExames(cabecalho(data, profissional), dados) : ''
    if (res.ok) {
      setAviso(null)
      await recarregar()
      showToast('ok', imprimir ? 'Pedido salvo. Abrindo a impressão.' : 'Pedido salvo no prontuário.')
      novo() // o pedido já está no histórico (dá para imprimir de novo ou repetir de lá)
    } else {
      // sem histórico disponível a impressão continua funcionando (o aviso explica que não foi guardado)
      setAviso(res.motivo)
      if (!janela) { showToast('error', 'Não foi possível salvar no prontuário.'); return }
      setGuardado(snapshot(rascunho))
    }
    if (janela) await imprimirNaJanela(janela, html)
  }

  function novo() {
    setRascunho(pedidoVazio())
    setData(hoje)
    setBusca('')
    setErros([])
    setGuardado('')
  }

  function repetir(l: LinhaMedico) {
    const d = normalizarPedido(l.dados)
    setRascunho({ ...d, profissional: null })
    setData(hoje)
    setErros([])
    showToast('ok', 'Pedido copiado para o formulário. Ajuste e salve como um novo pedido.')
  }

  function imprimirDoHistorico(l: LinhaMedico) {
    const d = normalizarPedido(l.dados)
    imprimirMedico(htmlPedidoExames(cabecalho(l.data, d.profissional ?? profissional), d))
  }

  async function excluir(l: LinhaMedico) {
    const d = normalizarPedido(l.dados)
    const ok = await confirmDialog({
      title: 'Excluir este pedido de exames?',
      message: `O pedido de ${formatDateBr(l.data)} (${resumoDoPedido(d)}) será removido do histórico do prontuário. Não dá para desfazer.`,
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

      <section className={styles.card} aria-label="Escolher exames">
        <div className={styles.cardTitle}>Escolher exames</div>
        <div className={styles.pickBox}>
          <PillTabs<FiltroGrupo>
            label="Tipo de exame"
            value={grupo}
            onChange={mudarGrupo}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'laboratorial', label: GRUPO_ROTULO.laboratorial },
              { value: 'imagem', label: GRUPO_ROTULO.imagem },
              { value: 'funcional', label: GRUPO_ROTULO.funcional },
            ]}
          />
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="mx-busca">Buscar exame</label>
              <input id="mx-busca" className={styles.input} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Ex.: hemograma, glicose, ultrassom tireoide" autoComplete="off" />
            </div>
            <div className={styles.field}>
              <label htmlFor="mx-cat">Categoria</label>
              <SelectMenu
                variant="field" id="mx-cat" value={categoria} onChange={setCategoria}
                options={[{ value: '', label: 'Todas as categorias' }, ...categorias.map(c => ({ value: c, label: c }))]}
              />
            </div>
          </div>
          <div className={styles.results} role="group" aria-label="Exames do catálogo">
            {resultados.length === 0 ? (
              <div className={styles.emptyList}>Nenhum exame encontrado. Use o campo &ldquo;Outro exame&rdquo; abaixo para escrever o nome.</div>
            ) : resultados.slice(0, LIMITE_LISTA).map(e => (
              <label key={e.id} className={styles.option}>
                <input type="checkbox" checked={marcados.has(e.id)} onChange={() => patch({ itens: alternarExame(rascunho.itens, e) })} />
                <span className={styles.optionName}>{e.nome}</span>
                <span className={styles.optionCat}>{e.categoria}</span>
              </label>
            ))}
          </div>
          {resultados.length > LIMITE_LISTA && <p className={styles.hint}>Mostrando os {LIMITE_LISTA} primeiros de {resultados.length}. Busque pelo nome ou escolha uma categoria para refinar.</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor="mx-livre">Outro exame <span className={styles.unit}>(fora do catálogo)</span></label>
          <div className={styles.row}>
            <input
              id="mx-livre" className={styles.input} style={{ flex: '1 1 180px', width: 'auto' }} value={livre} maxLength={MAX_NOME_EXAME}
              onChange={e => setLivre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarLivreAgora() } }}
              placeholder="Nome do exame"
            />
            <Button variant="secondary" icon="plus" onClick={adicionarLivreAgora} disabled={!livre.trim()}>Adicionar</Button>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-label="Pedido">
        <div className={styles.cardHead}>
          <div className={styles.cardTitle}>Pedido{rascunho.itens.length > 0 ? ` (${rascunho.itens.length} ${rascunho.itens.length === 1 ? 'exame' : 'exames'})` : ''}</div>
          {pedidoTemConteudo(rascunho) && <Button variant="ghost" onClick={novo}>Limpar formulário</Button>}
        </div>

        {rascunho.itens.length === 0 ? (
          <p className={styles.hint}>Marque os exames acima. Eles aparecem aqui para conferir antes de salvar.</p>
        ) : (
          <div className={styles.chosen}>
            {rascunho.itens.map(i => (
              <div key={i.id ?? i.nome} className={styles.chosenRow}>
                <div className={styles.chosenName}>
                  <span>{i.nome}</span>
                  <span className={styles.chosenMeta}>{i.categoria}{i.tuss ? ` · TUSS ${i.tuss}` : ''}</span>
                </div>
                <button type="button" className={styles.iconBtn} aria-label={`Remover ${i.nome} do pedido`} onClick={() => patch({ itens: rascunho.itens.filter(x => x !== i) })}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="mx-data">Data do pedido</label>
            <DatePicker id="mx-data" value={data} onChange={v => setData(v || hoje)} ariaLabel="Data do pedido" />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Urgência</span>
            <PillTabs<Urgencia>
              label="Urgência do pedido"
              value={rascunho.urgencia}
              onChange={v => patch({ urgencia: v })}
              options={[{ value: 'rotina', label: URGENCIA_ROTULO.rotina }, { value: 'urgente', label: URGENCIA_ROTULO.urgente }]}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="mx-ind">Indicação clínica</label>
          <textarea
            id="mx-ind" className={styles.textarea} value={rascunho.indicacao} maxLength={MAX_INDICACAO}
            onChange={e => patch({ indicacao: e.target.value })} placeholder="Ex.: investigação de fadiga e queda de cabelo"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="mx-cid">CID-10 <span className={styles.unit}>(opcional se houver indicação clínica)</span></label>
          <input id="mx-cid" className={styles.input} value={rascunho.cid} maxLength={200} onChange={e => patch({ cid: e.target.value })} placeholder="Ex.: D64.9" />
          <CidSearch onPick={t => patch({ cid: t })} />
        </div>

        <div className={styles.field}>
          <label htmlFor="mx-obs">Observações ao paciente <span className={styles.unit}>(jejum, preparo, local de coleta)</span></label>
          <textarea id="mx-obs" className={styles.textarea} value={rascunho.observacoes} maxLength={MAX_OBSERVACOES} onChange={e => patch({ observacoes: e.target.value })} />
        </div>

        {!profissional.nome && <p className={styles.warn}>Escolha o profissional responsável acima: o nome e o registro dele saem na assinatura do pedido.</p>}
        {erros.length > 0 && <ul className={styles.errors} role="alert">{erros.map(e => <li key={e}>{e}</li>)}</ul>}

        <div className={styles.actions}>
          {dirty && <span className={styles.dirtyMsg}>Ainda não salvo no prontuário.</span>}
          <Button variant="secondary" loading={salvando} onClick={() => finalizar(false)}>Salvar</Button>
          <Button variant="primary" icon="file" loading={salvando} onClick={() => finalizar(true)}>Salvar e imprimir</Button>
        </div>
      </section>

      <section className={styles.card} aria-label="Pedidos anteriores">
        <div className={styles.cardTitle}>Pedidos anteriores</div>
        {carregando ? (
          <p className={styles.hint}>Carregando histórico...</p>
        ) : linhas.length === 0 ? (
          <EmptyState icon="file" title="Nenhum pedido guardado" description="Os pedidos salvos ficam aqui, com data, para imprimir de novo ou repetir." compact />
        ) : (
          <div className={styles.list}>
            {linhas.map(l => {
              const d = normalizarPedido(l.dados)
              return (
                <div key={l.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemTitle}>
                      {formatDateBr(l.data)}
                      {d.urgencia === 'urgente' && <span className={styles.badge}>Urgente</span>}
                    </div>
                    <div className={styles.itemMeta}>{resumoDoPedido(d)}</div>
                    {d.indicacao && <div className={styles.itemMeta}>Indicação: {d.indicacao}</div>}
                  </div>
                  <div className={styles.itemActions}>
                    <button type="button" className={styles.iconBtn} aria-label={`Imprimir o pedido de ${formatDateBr(l.data)}`} title="Imprimir" onClick={() => imprimirDoHistorico(l)}><Icon name="file" size={16} /></button>
                    <button type="button" className={styles.iconBtn} aria-label={`Repetir o pedido de ${formatDateBr(l.data)} como novo`} title="Repetir como novo" onClick={() => repetir(l)}><Icon name="copy" size={16} /></button>
                    <button type="button" className={styles.iconBtn} aria-label={`Excluir o pedido de ${formatDateBr(l.data)}`} title="Excluir" onClick={() => excluir(l)}><Icon name="trash" size={16} /></button>
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
