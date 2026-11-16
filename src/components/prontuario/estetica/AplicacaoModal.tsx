'use client'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { DatePicker } from '@/components/ui/DatePicker'
import { DecimalInput } from '@/components/ui/NumericInput'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Badge } from '@/components/ui/Badge'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import { hojeBrasil } from '@/lib/brasilDate'
import { FACE_REGION_NAMES, faceRegion } from '@/lib/faceograma'
import { formatarDia } from '@/lib/estoque/lotes'
import { STATUS_LABEL } from '@/lib/contratos/status'
import type { ContractItem } from '@/lib/contratos/server'
import {
  DOSE_UNIDADES, MAX_REGIOES, TIPOS_APLICACAO, agruparPorProduto, corDoTipo, doseTotal, estadoDoLote, formatarNumero, somaRegioes,
  rotuloTermo, sugerirBaixa, termosUteis, validarAplicacao, type LoteDisponivel, type RegiaoAplicada,
} from '@/lib/estetica/aplicacoes'
import { registrarAplicacao } from '@/lib/estetica/storage'
import { MapaAplicacao } from './MapaAplicacao'
import styles from './aplicacoes.module.css'

interface Props {
  patientId: string
  lotes: LoteDisponivel[]
  /** termos do paciente (módulo de contratos); null = não foi possível consultar */
  termos: ContractItem[] | null
  profissionalNome: string
  onClose: () => void
  /** chamado depois de gravar, para a tela recarregar a lista e os saldos */
  onSalvo: () => void
  onOpenDocuments?: () => void
}

const num = (s: string): number => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Ficha de uma aplicação: produto e lote do estoque, mapa e regiões com unidades, termo e baixa de estoque na mesma gravação. */
export function AplicacaoModal({ patientId, lotes, termos, profissionalNome, onClose, onSalvo, onOpenDocuments }: Props) {
  const hoje = hojeBrasil()
  // o mesmo envio repetido (clique duplo, nova tentativa depois de erro de rede) nunca baixa o estoque duas vezes
  const [requestId] = useState(() => crypto.randomUUID())
  const [data, setData] = useState(hoje)
  const [tipo, setTipo] = useState('toxina')
  const [itemId, setItemId] = useState('')
  const [lotId, setLotId] = useState('')
  const [regioes, setRegioes] = useState<RegiaoAplicada[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [doseManual, setDoseManual] = useState('')
  const [doseUnidade, setDoseUnidade] = useState<string>('U')
  const [baixaTxt, setBaixaTxt] = useState('')
  const [baixaEditada, setBaixaEditada] = useState(false)
  const [obs, setObs] = useState('')
  const [registro, setRegistro] = useState('')
  const [contractId, setContractId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const produtos = useMemo(() => agruparPorProduto(lotes, hoje), [lotes, hoje])
  const produto = produtos.find(p => p.itemId === itemId) ?? null
  const lote: LoteDisponivel | null = produto?.lotes.find(l => l.lotId === lotId) ?? null
  const dose = doseTotal(regioes, num(doseManual))
  const soma = somaRegioes(regioes)
  const sugestao = sugerirBaixa(dose, doseUnidade, produto?.unidade)
  const baixa = baixaEditada ? num(baixaTxt) : sugestao
  const util = useMemo(() => termosUteis(termos ?? []), [termos])
  const termo = util.find(t => t.id === contractId) ?? null
  const rascunho = { data, lote, dose, doseUnidade, baixa, regioes, observacoes: obs }
  const problema = validarAplicacao(rascunho, hoje)

  function escolherProduto(id: string) {
    setItemId(id)
    const p = produtos.find(x => x.itemId === id)
    // já deixa marcado o lote que vence primeiro dentro da validade; a pessoa confere e troca se precisar
    const sugerido = p?.lotes.find(l => !estadoDoLote(l.validade, hoje).bloqueado)
    setLotId(sugerido?.lotId ?? '')
    setBaixaEditada(false)
  }

  function adicionarNoMapa(x: number, y: number) {
    if (regioes.length >= MAX_REGIOES) { showToast('error', `No máximo ${MAX_REGIOES} regiões por aplicação.`); return }
    const nova: RegiaoAplicada = { id: crypto.randomUUID(), regiao: faceRegion(x, y), unidades: null, x, y }
    setRegioes(r => [...r, nova])
    setSelecionada(nova.id)
  }
  function adicionarSemPonto() {
    if (regioes.length >= MAX_REGIOES) { showToast('error', `No máximo ${MAX_REGIOES} regiões por aplicação.`); return }
    const nova: RegiaoAplicada = { id: crypto.randomUUID(), regiao: '', unidades: null, x: null, y: null }
    setRegioes(r => [...r, nova])
    setSelecionada(nova.id)
  }
  const alterar = (id: string, patch: Partial<RegiaoAplicada>) => setRegioes(r => r.map(g => (g.id === id ? { ...g, ...patch } : g)))
  const remover = (id: string) => { setRegioes(r => r.filter(g => g.id !== id)); setSelecionada(s => (s === id ? null : s)) }

  async function salvar() {
    if (problema || !lote) { setError(problema ?? 'Escolha o produto e o lote usado.'); return }
    setSaving(true)
    setError('')
    const r = await registrarAplicacao({
      requestId, patientId, data, tipo, lote, dose, doseUnidade, baixa, regioes, observacoes: obs,
      contractId: contractId || null,
      profissionalNome: profissionalNome.trim() || null,
      profissionalRegistro: registro.trim() || null,
    })
    setSaving(false)
    if (!r.ok) { setError(r.erro); return }
    showToast('ok', 'Aplicação registrada e lote baixado do estoque.')
    onSalvo()
    onClose()
  }

  const semSaldo = produtos.length === 0
  const estado = lote ? estadoDoLote(lote.validade, hoje) : null

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      size="lg"
      title="Registrar aplicação"
      subtitle="Produto e lote do estoque, regiões com unidades e termo de consentimento"
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className={btn.primary} onClick={salvar} disabled={saving || !!problema}>{saving ? 'Salvando...' : 'Registrar aplicação'}</button>
        </>
      }
    >
      <div className={styles.form}>
        {error && <p className={styles.error} role="alert">{error}</p>}

        <section className={styles.section} aria-label="Produto e lote">
          <h3 className={styles.sectionTitle}>Produto e lote</h3>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>Data da aplicação</label>
              <DatePicker value={data} onChange={setData} ariaLabel="Data da aplicação" max={hoje} />
            </div>
            <div className={styles.field}>
              <label htmlFor="apl-tipo">Tipo</label>
              <SelectMenu id="apl-tipo" variant="field" ariaLabel="Tipo de aplicação" value={tipo} onChange={setTipo} options={TIPOS_APLICACAO.map(t => ({ value: t.key, label: t.label }))} />
            </div>
          </div>
          {semSaldo ? (
            <p className={styles.warn}>Não há lote com saldo no estoque. Registre a entrada do produto com o número do lote em Estoque e volte aqui.</p>
          ) : (
            <>
              <div className={styles.field}>
                <label htmlFor="apl-produto">Produto</label>
                <SelectMenu id="apl-produto" variant="field" ariaLabel="Produto do estoque" placeholder="Escolha o produto" value={itemId} onChange={escolherProduto}
                  options={produtos.map(p => ({ value: p.itemId, label: p.produto }))} />
              </div>
              {produto && (
                <div className={styles.field}>
                  <span className={styles.label} id="apl-lote-rotulo">Lote</span>
                  <div className={styles.lots} role="radiogroup" aria-labelledby="apl-lote-rotulo">
                    {produto.lotes.map(l => {
                      const e = estadoDoLote(l.validade, hoje)
                      const on = l.lotId === lotId
                      return (
                        <button
                          key={l.lotId}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-disabled={e.bloqueado || undefined}
                          className={[styles.lot, on ? styles.lotOn : '', e.bloqueado ? `${styles.lotOff} ${styles.lotBad}` : '', e.tom === 'aviso' ? styles.lotAviso : ''].filter(Boolean).join(' ')}
                          onClick={() => { if (!e.bloqueado) setLotId(l.lotId) }}
                        >
                          <span className={styles.lotName}>Lote {l.lote}</span>
                          <span className={styles.lotMeta}>
                            {l.validade ? `Validade ${formatarDia(l.validade)}` : 'Sem validade'} · {formatarNumero(l.saldo)}{l.unidade ? ` ${l.unidade}` : ''} em estoque{l.fabricante ? ` · ${l.fabricante}` : ''}
                          </span>
                          {(e.tom === 'aviso' || e.tom === 'bloqueio') && <span className={styles.lotMeta}>{e.texto}</span>}
                        </button>
                      )
                    })}
                  </div>
                  {estado?.tom === 'aviso' && <p className={styles.warn}>Este lote está perto do vencimento: confira antes de aplicar.</p>}
                </div>
              )}
            </>
          )}
        </section>

        <section className={styles.section} aria-label="Regiões aplicadas">
          <h3 className={styles.sectionTitle}>Regiões e unidades</h3>
          <div className={styles.mapWrap}>
            <MapaAplicacao regioes={regioes} cor={corDoTipo(tipo)} selecionada={selecionada} onAdicionar={adicionarNoMapa} onSelecionar={setSelecionada} />
            <p className={styles.hint}>Toque no rosto para marcar cada região. Para outra região (corpo, mãos), use Adicionar região e digite o nome.</p>
          </div>
          {regioes.length > 0 && (
            <div className={styles.regions}>
              {regioes.map((g, i) => (
                <div key={g.id} className={`${styles.region} ${g.id === selecionada ? styles.regionOn : ''}`}>
                  <span className={styles.regionNum} style={g.x !== null ? { background: corDoTipo(tipo) } : undefined} aria-hidden="true">{g.x !== null ? i + 1 : '-'}</span>
                  <input
                    className={`${styles.input} ${styles.regionName}`}
                    list="apl-regioes-sugestao"
                    value={g.regiao}
                    maxLength={80}
                    aria-label={`Nome da região ${i + 1}`}
                    placeholder="Ex.: Glabela"
                    onFocus={() => setSelecionada(g.id)}
                    onChange={e => alterar(g.id, { regiao: e.target.value })}
                  />
                  <div className={styles.regionDose}>
                    <DecimalInput
                      className={styles.input}
                      aria-label={`Dose da região ${i + 1} em ${doseUnidade}`}
                      placeholder={doseUnidade}
                      value={g.unidades === null ? '' : String(g.unidades)}
                      max={10000}
                      decimals={2}
                      onFocus={() => setSelecionada(g.id)}
                      onChange={v => alterar(g.id, { unidades: v === '' ? null : parseFloat(v) })}
                    />
                  </div>
                  <button type="button" className={`${styles.iconBtn} ${styles.regionDel}`} aria-label={`Remover a região ${i + 1}`} onClick={() => remover(g.id)}><Icon name="trash" size={16} /></button>
                </div>
              ))}
              <datalist id="apl-regioes-sugestao">{FACE_REGION_NAMES.map(n => <option key={n} value={n} />)}</datalist>
            </div>
          )}
          <div>
            <button type="button" className={btn.secondary} onClick={adicionarSemPonto}><Icon name="plus" size={15} /> Adicionar região</button>
          </div>
        </section>

        <section className={styles.section} aria-label="Dose e baixa do estoque">
          <h3 className={styles.sectionTitle}>Dose e baixa do estoque</h3>
          <div className={styles.grid2}>
            {soma > 0 ? (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Dose total (soma das regiões)</span>
                <span className={styles.statValue}>{formatarNumero(dose)} {doseUnidade}</span>
              </div>
            ) : (
              <div className={styles.field}>
                <label htmlFor="apl-dose">Dose total</label>
                <DecimalInput id="apl-dose" className={styles.input} value={doseManual} max={10000} decimals={2} placeholder="Ex.: 20" onChange={setDoseManual} />
              </div>
            )}
            <div className={styles.field}>
              <label htmlFor="apl-unidade">Unidade da dose</label>
              <SelectMenu id="apl-unidade" variant="field" ariaLabel="Unidade da dose" value={doseUnidade} onChange={setDoseUnidade} options={DOSE_UNIDADES.map(u => ({ value: u, label: u }))} />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="apl-baixa">Baixar do estoque{produto?.unidade ? ` (em ${produto.unidade})` : ''}</label>
            <DecimalInput
              id="apl-baixa"
              className={styles.input}
              value={baixaEditada ? baixaTxt : sugestao > 0 ? String(sugestao) : ''}
              max={100000}
              decimals={2}
              placeholder="0"
              onChange={v => { setBaixaTxt(v); setBaixaEditada(true) }}
            />
            <span className={styles.hint}>
              {produto && sugestao === 1 && dose > 0 && doseUnidade !== produto.unidade
                ? `O produto é controlado em ${produto.unidade || 'outra unidade'}, não em ${doseUnidade}. Ajuste quanto sai do estoque (ex.: 1 frasco).`
                : 'Sai do lote escolhido e do saldo do produto, e o paciente fica registrado no lote.'}
            </span>
          </div>
        </section>

        <section className={styles.section} aria-label="Observações">
          <div className={styles.field}>
            <label htmlFor="apl-obs">Observações e técnica</label>
            <textarea id="apl-obs" className={styles.textarea} value={obs} maxLength={4000} onChange={e => setObs(e.target.value)} placeholder="Diluição, agulha ou cânula, intercorrências, orientações dadas" />
          </div>
          <div className={styles.field}>
            <label htmlFor="apl-registro">Registro do profissional <span className={styles.hint}>(opcional, sai na ficha impressa)</span></label>
            <input id="apl-registro" className={styles.input} value={registro} maxLength={60} onChange={e => setRegistro(e.target.value)} placeholder="Ex.: CRBM 12345" />
          </div>
        </section>

        <section className={styles.section} aria-label="Termo de consentimento">
          <h3 className={styles.sectionTitle}>Termo de consentimento</h3>
          {termos === null ? (
            <p className={styles.hint}>Não foi possível consultar os termos agora. Dá para registrar a aplicação e ligar o termo depois.</p>
          ) : (
            <>
              <div className={styles.field}>
                <label htmlFor="apl-termo">Termo do paciente</label>
                <SelectMenu id="apl-termo" variant="field" ariaLabel="Termo de consentimento" value={contractId} onChange={setContractId}
                  options={[{ value: '', label: 'Sem termo vinculado' }, ...util.map(t => ({ value: t.id, label: rotuloTermo(t) }))]} />
              </div>
              {termo ? (
                <Badge tone={termo.status === 'assinado' ? 'success' : 'warning'}>{termo.status === 'assinado' ? 'Termo assinado' : `Termo ${STATUS_LABEL[termo.status].toLowerCase()}, ainda sem assinatura`}</Badge>
              ) : (
                <p className={styles.warn}>
                  Sem termo ligado a esta aplicação. {util.length === 0 ? 'Este paciente ainda não tem termo nem contrato: crie e envie para assinatura em Documentos e contratos.' : 'Escolha um dos termos acima, ou ligue depois.'}
                </p>
              )}
              {onOpenDocuments && (
                <div><button type="button" className={btn.secondary} onClick={() => { onClose(); onOpenDocuments() }}>Abrir Documentos e contratos</button></div>
              )}
            </>
          )}
        </section>

        {problema && !error && <p className={styles.hint}>{problema}</p>}
      </div>
    </Modal>
  )
}
