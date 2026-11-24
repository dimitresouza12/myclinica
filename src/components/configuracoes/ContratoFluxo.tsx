'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { PhoneInput } from '@/components/ui/PhoneInput'
import btn from '@/components/ui/button.module.css'
import { SIGN_ACCEPT_TEXT } from '@/lib/assinatura/validar'
import { formatBrl, formatDiaBr, isValidCpf, maskCpfCnpj } from '@/lib/cartaoCheckout'
import type { ContractMonths, ContractPaymentMode, ContractPlan } from '@/lib/contratoPrecos'
import styles from './AssinarEscolha.module.css'

const W = 640
const H = 200

interface Agreement {
  id: string
  planLabel: string
  months: number
  paymentMode: ContractPaymentMode
  installments: number
  monthlyValue: number
  totalValue: number
  cardFeeValue: number
  firstDueDate: string | null
  contentText?: string
}
interface Billing { status: 'criada' | 'pendente' | 'em_andamento'; invoiceUrl: string | null; message: string | null }

type Etapa = 'responsavel' | 'leitura' | 'codigo' | 'assinar' | 'pronto'

interface Props {
  plan: ContractPlan
  months: ContractMonths
  paymentMode: ContractPaymentMode
  installments: number
  defaultPhone: string
  onVoltar: () => void
  onConcluido: () => void
}

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & { error?: string } }> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    return { ok: res.ok, data }
  } catch {
    return { ok: false, data: { error: 'Sem conexão. Verifique a internet e tente de novo.' } as T & { error?: string } }
  }
}

export function ContratoFluxo({ plan, months, paymentMode, installments, defaultPhone, onVoltar, onConcluido }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('responsavel')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [ag, setAg] = useState<Agreement | null>(null)
  const [billing, setBilling] = useState<Billing | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [leu, setLeu] = useState(false)
  // O aceite só libera depois que o texto foi rolado até o fim (ou se ele cabe inteiro na caixa).
  const [rolou, setRolou] = useState(false)
  const [phone, setPhone] = useState(defaultPhone)
  const [enviadoPara, setEnviadoPara] = useState('')
  const [reenvioEm, setReenvioEm] = useState(0)
  const [agora, setAgora] = useState(() => Date.now())
  const [codigo, setCodigo] = useState('')
  const [metodo, setMetodo] = useState<'digitado' | 'desenho'>('digitado')
  const [assinNome, setAssinNome] = useState('')
  const [aceito, setAceito] = useState(false)
  const [temTraco, setTemTraco] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const ultimo = useRef<{ x: number; y: number } | null>(null)
  const textoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reenvioEm <= Date.now()) return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [reenvioEm])

  useEffect(() => { if (etapa === 'assinar' && metodo === 'desenho') limpar() }, [etapa, metodo])
  // Texto curto que cabe na caixa não tem o que rolar: libera o aceite.
  useEffect(() => {
    const t = textoRef.current
    if (etapa === 'leitura' && t && t.scrollHeight <= t.clientHeight + 4) setRolou(true)
  }, [etapa, ag])

  function limpar() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    setTemTraco(false)
  }
  function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  function aoTocar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    desenhando.current = true
    ultimo.current = ponto(e)
  }
  function aoMover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return
    const ctx = e.currentTarget.getContext('2d')
    const p = ponto(e)
    if (!ctx || !ultimo.current) return
    ctx.strokeStyle = '#111111'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(ultimo.current.x, ultimo.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    ultimo.current = p
    setTemTraco(true)
  }
  function aoSoltar() { desenhando.current = false; ultimo.current = null }

  async function criarRascunho() {
    setErro('')
    if (nome.trim().split(/\s+/).length < 2) { setErro('Digite o nome completo do responsável.'); return }
    if (!isValidCpf(cpf)) { setErro('Informe um CPF válido.'); return }
    setBusy(true)
    const r = await api<{ agreement: Agreement }>('/api/contrato-clinica', {
      method: 'POST',
      body: JSON.stringify({ plan, months, paymentMode, installments, responsibleName: nome, responsibleCpf: cpf }),
    })
    if (!r.ok) { setBusy(false); setErro(r.data.error ?? 'Não foi possível preparar o contrato.'); return }
    const d = await api<{ agreement: Agreement }>(`/api/contrato-clinica/${r.data.agreement.id}`)
    setBusy(false)
    if (!d.ok) { setErro(d.data.error ?? 'Não foi possível abrir o contrato.'); return }
    setAg(d.data.agreement)
    setAssinNome(nome)
    setEtapa('leitura')
  }

  async function enviarCodigo() {
    if (!ag) return
    setErro(''); setBusy(true)
    const r = await api<{ sentTo: string; resendAvailableAt: string }>(`/api/contrato-clinica/${ag.id}/codigo`, { method: 'POST', body: JSON.stringify({ phone }) })
    setBusy(false)
    if (!r.ok) { setErro(r.data.error ?? 'Não foi possível enviar o código.'); return }
    setEnviadoPara(r.data.sentTo)
    setReenvioEm(new Date(r.data.resendAvailableAt).getTime())
    setAgora(Date.now())
    setEtapa('assinar')
  }

  async function assinar() {
    if (!ag) return
    setErro('')
    if (!/^\d{6}$/.test(codigo)) { setErro('Digite o código de 6 dígitos que chegou no WhatsApp.'); return }
    if (metodo === 'desenho' && !temTraco) { setErro('Faça o desenho da assinatura.'); return }
    setBusy(true)
    const r = await api<{ agreement: Agreement; billing: Billing }>(`/api/contrato-clinica/${ag.id}/assinar`, {
      method: 'POST',
      body: JSON.stringify({
        code: codigo, method: metodo, signerName: assinNome, accepted: aceito,
        drawing: metodo === 'desenho' ? canvasRef.current?.toDataURL('image/png') : undefined,
      }),
    })
    if (!r.ok) { setBusy(false); setErro(r.data.error ?? 'Não foi possível assinar. Tente de novo.'); return }
    setBilling(r.data.billing)
    setAg(r.data.agreement)
    const d = await api<{ pdfUrl: string | null }>(`/api/contrato-clinica/${ag.id}`)
    if (d.ok) setPdfUrl(d.data.pdfUrl)
    setBusy(false)
    setEtapa('pronto')
  }

  async function tentarCobranca() {
    if (!ag) return
    setErro(''); setBusy(true)
    const r = await api<{ billing: Billing }>(`/api/contrato-clinica/${ag.id}/cobranca`, { method: 'POST', body: '{}' })
    setBusy(false)
    if (!r.ok) { setErro(r.data.error ?? 'Não foi possível gerar a cobrança agora.'); return }
    setBilling(r.data.billing)
  }

  const falta = Math.max(0, Math.ceil((reenvioEm - agora) / 1000))
  const pagamento = paymentMode === 'monthly'
    ? `${months} mensalidades de ${formatBrl(ag?.monthlyValue ?? 0)}`
    : installments > 1
      ? `${formatBrl(ag?.totalValue ?? 0)} em ${installments}x no cartão`
      : `${formatBrl(ag?.totalValue ?? 0)} à vista`

  return (
    <div className={styles.fluxo}>
      {etapa === 'responsavel' && (
        <>
          <h3 className={styles.h3}>Quem assina pela clínica</h3>
          <p className={styles.desc}>Informe o responsável legal. O contrato será emitido em nome da clínica e dele.</p>
          <label className={styles.label} htmlFor="cf-nome">Nome completo</label>
          <input id="cf-nome" className={styles.input} value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" maxLength={120} />
          <label className={styles.label} htmlFor="cf-cpf">CPF</label>
          <input id="cf-cpf" className={styles.input} value={cpf} onChange={e => setCpf(maskCpfCnpj(e.target.value))} inputMode="numeric" autoComplete="off" />
          {erro && <p className={styles.erro} role="alert"><Icon name="alert" size={13} /> {erro}</p>}
          <div className={styles.acoes}>
            <button type="button" className={btn.primary} onClick={criarRascunho} disabled={busy}>{busy ? 'Preparando...' : 'Continuar'}</button>
            <button type="button" className={btn.secondary} onClick={onVoltar} disabled={busy}>Voltar</button>
          </div>
        </>
      )}

      {etapa === 'leitura' && ag && (
        <>
          <h3 className={styles.h3}>Leia o contrato</h3>
          <dl className={styles.lista}>
            <div><dt>Plano</dt><dd>{ag.planLabel}, {ag.months} meses</dd></div>
            <div><dt>Pagamento</dt><dd>{pagamento}</dd></div>
            {ag.cardFeeValue > 0 && <div><dt>Taxa do parcelamento</dt><dd>{formatBrl(ag.cardFeeValue)}</dd></div>}
            {ag.firstDueDate && <div><dt>Primeira cobrança</dt><dd>{formatDiaBr(ag.firstDueDate)}</dd></div>}
          </dl>
          <div ref={textoRef} className={styles.texto} tabIndex={0} aria-label="Texto do contrato"
            onScroll={e => { const t = e.currentTarget; if (t.scrollTop + t.clientHeight >= t.scrollHeight - 4) setRolou(true) }}>
            {ag.contentText}
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={leu} disabled={!rolou} onChange={e => setLeu(e.target.checked)} />
            <span>{rolou ? 'Li o contrato inteiro.' : 'Role o contrato até o fim para poder marcar que leu.'}</span>
          </label>
          <p className={styles.desc}>Para assinar, vamos enviar um código por WhatsApp.</p>
          <label className={styles.label} htmlFor="cf-fone">Celular com WhatsApp</label>
          <PhoneInput id="cf-fone" className={styles.input} value={phone} onChange={setPhone} />
          {erro && <p className={styles.erro} role="alert"><Icon name="alert" size={13} /> {erro}</p>}
          <div className={styles.acoes}>
            <button type="button" className={btn.primary} onClick={enviarCodigo} disabled={busy || !leu || phone.replace(/\D/g, '').length < 10}>{busy ? 'Enviando...' : 'Enviar código'}</button>
            <button type="button" className={btn.secondary} onClick={onVoltar} disabled={busy}>Voltar</button>
          </div>
        </>
      )}

      {etapa === 'assinar' && ag && (
        <>
          <h3 className={styles.h3}>Assinar</h3>
          <p className={styles.desc}>Enviamos um código para {enviadoPara || 'o seu WhatsApp'}. Ele vale por poucos minutos.</p>
          <label className={styles.label} htmlFor="cf-cod">Código de 6 dígitos</label>
          <input id="cf-cod" className={styles.input} value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
          <button type="button" className={styles.link} onClick={enviarCodigo} disabled={busy || falta > 0}>
            {falta > 0 ? `Reenviar código em ${falta}s` : 'Reenviar código'}
          </button>

          <div className={styles.seg} role="radiogroup" aria-label="Como assinar">
            <button type="button" role="radio" aria-checked={metodo === 'digitado'} className={metodo === 'digitado' ? styles.segOn : styles.segOff} onClick={() => setMetodo('digitado')}>Digitar o nome</button>
            <button type="button" role="radio" aria-checked={metodo === 'desenho'} className={metodo === 'desenho' ? styles.segOn : styles.segOff} onClick={() => setMetodo('desenho')}>Desenhar na tela</button>
          </div>
          <label className={styles.label} htmlFor="cf-assin">Nome completo</label>
          <input id="cf-assin" className={styles.input} value={assinNome} onChange={e => setAssinNome(e.target.value)} autoComplete="name" maxLength={120} />
          {metodo === 'desenho' && (
            <div className={styles.canvasWrap}>
              <canvas ref={canvasRef} width={W} height={H} className={styles.canvas}
                onPointerDown={aoTocar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}
                aria-label="Área para desenhar a assinatura" />
              <button type="button" className={styles.link} onClick={limpar}>Limpar</button>
            </div>
          )}
          <label className={styles.check}>
            <input type="checkbox" checked={aceito} onChange={e => setAceito(e.target.checked)} />
            <span>{SIGN_ACCEPT_TEXT}</span>
          </label>
          {erro && <p className={styles.erro} role="alert"><Icon name="alert" size={13} /> {erro}</p>}
          <div className={styles.acoes}>
            <button type="button" className={btn.primary} onClick={assinar} disabled={busy || !aceito || assinNome.trim().length < 5}>{busy ? 'Assinando...' : 'Assinar contrato'}</button>
            <button type="button" className={btn.secondary} onClick={() => { setErro(''); setEtapa('leitura') }} disabled={busy}>Voltar</button>
          </div>
        </>
      )}

      {etapa === 'pronto' && ag && (
        <>
          <div className={styles.okHead}>
            <span className={styles.okIcon} aria-hidden="true"><Icon name="checkCircle" size={26} /></span>
            <p className={styles.h3}>Contrato assinado</p>
          </div>
          <dl className={styles.lista}>
            <div><dt>Plano</dt><dd>{ag.planLabel}, {ag.months} meses</dd></div>
            <div><dt>Pagamento</dt><dd>{pagamento}</dd></div>
            {ag.firstDueDate && <div><dt>Primeira cobrança</dt><dd>{formatDiaBr(ag.firstDueDate)}</dd></div>}
          </dl>
          {billing?.status === 'criada' ? (
            <p className={styles.desc}>
              {paymentMode === 'upfront' && billing.invoiceUrl
                ? 'A cobrança foi gerada. Use o botão abaixo para pagar.'
                : 'A cobrança foi agendada. Você receberá o aviso antes do vencimento.'}
            </p>
          ) : (
            <p className={styles.desc}>{billing?.message ?? 'A cobrança ainda está sendo gerada.'}</p>
          )}
          {erro && <p className={styles.erro} role="alert"><Icon name="alert" size={13} /> {erro}</p>}
          <div className={styles.acoes}>
            {billing?.status === 'criada' && billing.invoiceUrl && paymentMode === 'upfront' && (
              <a className={btn.primary} href={billing.invoiceUrl} target="_blank" rel="noopener noreferrer">Pagar agora</a>
            )}
            {billing?.status === 'pendente' && (
              <button type="button" className={btn.primary} onClick={tentarCobranca} disabled={busy}>{busy ? 'Gerando...' : 'Gerar cobrança de novo'}</button>
            )}
            {pdfUrl && <a className={btn.secondary} href={pdfUrl} target="_blank" rel="noopener noreferrer">Baixar contrato em PDF</a>}
            <button type="button" className={btn.secondary} onClick={onConcluido}>Concluir</button>
          </div>
        </>
      )}
    </div>
  )
}
