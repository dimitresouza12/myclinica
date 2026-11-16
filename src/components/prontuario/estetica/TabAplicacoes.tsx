'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthClinic, Patient } from '@/types'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import type { ContractItem } from '@/lib/contratos/server'
import { STATUS_LABEL } from '@/lib/contratos/status'
import { formatarDia, textoAlertaValidade } from '@/lib/estoque/lotes'
import {
  aplicacoesValidas, alertasDeLotes, corDoTipo, resumoRegioes, rotuloTipo, textoDose,
  type Aplicacao, type LoteDisponivel,
} from '@/lib/estetica/aplicacoes'
import { listarAplicacoes, listarLotesDisponiveis, estornarAplicacao, MENSAGEM_APLICACOES } from '@/lib/estetica/storage'
import { htmlFichaAplicacao, htmlHistoricoAplicacoes, imprimirEstetica } from '@/lib/estetica/imprimir'
import { listContracts } from '@/components/prontuario/contratos/contratosApi'
import type { Indisponibilidade } from '@/lib/nutri/erros'
import { usePrintActions } from '../print/PrintRegistry'
import { AplicacaoModal } from './AplicacaoModal'
import { TermoModal } from './TermoModal'
import styles from './aplicacoes.module.css'

interface Props {
  patient: Patient
  clinic: AuthClinic
  onOpenDocuments?: () => void
}

/** Quantas fichas individuais entram no menu Imprimir (as mais recentes). */
const FICHAS_NO_MENU = 5

/** Aba "Aplicações" da Estética: produto e lote usados em cada aplicação (baixa o estoque), regiões com unidades e termo. */
export function TabAplicacoes({ patient, clinic, onOpenDocuments }: Props) {
  const { user } = useAuthStore()
  const [lista, setLista] = useState<Aplicacao[]>([])
  const [lotes, setLotes] = useState<LoteDisponivel[]>([])
  const [termos, setTermos] = useState<ContractItem[] | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [motivo, setMotivo] = useState<Indisponibilidade | null>(null)
  const [versao, setVersao] = useState(0)
  const [novo, setNovo] = useState(false)
  const [termoDe, setTermoDe] = useState<Aplicacao | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([
      listarAplicacoes(patient.id),
      listarLotesDisponiveis(),
      listContracts(patient.id).catch(() => null),
    ]).then(([ap, lt, ct]) => {
      if (!vivo) return
      if (ap.ok) { setLista(ap.itens); setMotivo(null) } else setMotivo(ap.motivo)
      setLotes(lt.ok ? lt.itens : [])
      setTermos(ct)
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [patient.id, versao])

  const recarregar = useCallback(() => setVersao(v => v + 1), [])

  const termoPorId = useMemo(() => new Map((termos ?? []).map(t => [t.id, t])), [termos])
  const validas = useMemo(() => aplicacoesValidas(lista), [lista])
  const alertaTexto = useMemo(() => textoAlertaValidade(alertasDeLotes(lotes)), [lotes])

  async function estornar(a: Aplicacao) {
    const ok = await confirmDialog({
      title: 'Estornar esta aplicação?',
      message: `O lote ${a.lote} recebe de volta ${textoDose(a.quantidadeBaixa, '').trim()} no estoque e ${patient.name} deixa de constar entre os pacientes do lote. A ficha continua no histórico, marcada como estornada.`,
      confirmText: 'Estornar aplicação', cancelText: 'Manter', danger: true,
    })
    if (!ok) return
    const r = await estornarAplicacao(a.id, null)
    if (!r.ok) { showToast('error', r.erro); return }
    showToast('ok', 'Aplicação estornada e estoque devolvido.')
    recarregar()
  }

  const cab = { clinica: clinic.name, paciente: patient.name, detalhe: [clinic.address, clinic.phone].filter(Boolean).join(' | ') || undefined }
  const infoTermo = (a: Aplicacao) => {
    const t = a.contractId ? termoPorId.get(a.contractId) : undefined
    return t ? { titulo: t.title, situacao: STATUS_LABEL[t.status] } : null
  }
  usePrintActions('aplicacoes', [
    ...validas.slice(0, FICHAS_NO_MENU).map(a => ({
      id: `apl-${a.id}`,
      label: `Ficha de aplicação de ${formatarDia(a.data)} (${a.produto})`,
      includes: ['Produto, fabricante, lote e validade', 'Dose, regiões aplicadas e mapa', 'Termo de consentimento ligado e assinaturas'],
      run: () => imprimirEstetica(htmlFichaAplicacao(cab, a, infoTermo(a))),
    })),
    {
      id: 'apl-historico',
      label: 'Histórico de aplicações com lote',
      includes: ['Data, produto, lote e validade de cada aplicação', 'Dose e regiões'],
      disabledReason: validas.length === 0 ? 'Nenhuma aplicação registrada' : undefined,
      run: () => imprimirEstetica(htmlHistoricoAplicacoes(cab, lista)),
    },
  ])

  const podeRegistrar = !motivo && !carregando

  return (
    <div className={styles.wrap}>
      {motivo && (
        <div className={styles.notice} role="status">
          <Icon name="alert" size={18} />
          <span>{MENSAGEM_APLICACOES[motivo]}</span>
        </div>
      )}

      {alertaTexto && (
        <div className={`${styles.notice} ${styles.noticeBad}`} role="status">
          <Icon name="alert" size={18} />
          <span>Estoque: {alertaTexto}. Lote vencido não pode ser escolhido na aplicação. Veja Estoque, Lotes e validade.</span>
        </div>
      )}

      <section className={styles.card} aria-label="Aplicações do paciente">
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Aplicações com lote</h3>
          <Button variant="primary" icon="plus" onClick={() => setNovo(true)} disabled={!podeRegistrar}>Registrar aplicação</Button>
        </div>
        <p className={styles.hint}>Cada aplicação guarda o produto, o fabricante e o lote usados, e baixa o estoque. Se houver recall do lote, a lista de pacientes sai do Estoque.</p>
        {carregando && <p className={styles.hint}>Carregando aplicações...</p>}
        {!carregando && !motivo && lista.length === 0 && (
          <p className={styles.empty}>Nenhuma aplicação registrada. Registre a primeira escolhendo o produto e o lote do estoque.</p>
        )}
        {lista.length > 0 && (
          <ul className={styles.list}>
            {lista.map(a => {
              const t = a.contractId ? termoPorId.get(a.contractId) : undefined
              const anulada = !!a.estornadaEm
              const regs = resumoRegioes(a.regioes, a.doseUnidade)
              return (
                <li key={a.id} className={`${styles.item} ${anulada ? styles.itemVoid : ''}`}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemDate}>{formatarDia(a.data)}</span>
                    <div className={styles.itemTags}>
                      <span className={styles.typeTag}><span className={styles.dot} style={{ background: corDoTipo(a.tipo) }} aria-hidden="true" />{rotuloTipo(a.tipo)}</span>
                      {anulada
                        ? <Badge tone="danger">Estornada</Badge>
                        : t
                          ? <Badge tone={t.status === 'assinado' ? 'success' : 'warning'}>{t.status === 'assinado' ? 'Termo assinado' : `Termo ${STATUS_LABEL[t.status].toLowerCase()}`}</Badge>
                          : <Badge tone="warning">{a.contractId ? 'Termo vinculado' : 'Sem termo'}</Badge>}
                    </div>
                  </div>
                  <span className={styles.itemProduct}>{a.produto}</span>
                  <p className={styles.itemLine}>
                    <b>Lote {a.lote}</b> · validade {formatarDia(a.validade)}{a.fabricante ? ` · ${a.fabricante}` : ''}
                  </p>
                  <p className={styles.itemLine}><b>Dose:</b> {textoDose(a.dose, a.doseUnidade)}{regs ? ` · ${regs}` : ''}</p>
                  {a.observacoes && <p className={styles.itemLine}>{a.observacoes}</p>}
                  {a.profissionalNome && <p className={styles.itemLine}>Profissional: {a.profissionalNome}{a.profissionalRegistro ? ` (${a.profissionalRegistro})` : ''}</p>}
                  {anulada && <p className={styles.itemLine}>Estornada em {formatarDia(a.estornadaEm?.slice(0, 10))}{a.estornoMotivo ? `: ${a.estornoMotivo}` : ''}</p>}
                  {!anulada && (
                    <div className={styles.itemActions}>
                      <Button variant="secondary" icon="paperclip" onClick={() => setTermoDe(a)} disabled={termos === null}>{a.contractId ? 'Trocar termo' : 'Ligar termo'}</Button>
                      <Button variant="secondary" icon="swap" onClick={() => estornar(a)}>Estornar</Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {novo && (
        <AplicacaoModal
          patientId={patient.id}
          lotes={lotes}
          termos={termos}
          profissionalNome={user?.displayName ?? ''}
          onClose={() => setNovo(false)}
          onSalvo={recarregar}
          onOpenDocuments={onOpenDocuments}
        />
      )}
      {termoDe && termos && (
        <TermoModal aplicacao={termoDe} termos={termos} onClose={() => setTermoDe(null)} onSalvo={recarregar} />
      )}
    </div>
  )
}
