'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './WhatsAppTab.module.css'
import { whatsappApi } from './whatsappApi'
import { WhatsAppSettingsForm } from './WhatsAppSettingsForm'
import { WhatsAppHistory } from './WhatsAppHistory'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { formatBrPhone, isCompleteBrPhone } from '@/lib/phoneFormat'

type Status = 'desconectado' | 'aguardando_qr' | 'conectado'

interface Connection {
  status: Status
  phone: string | null
  connectedAt: string | null
  qr?: string | null
}

const POLL_MS = 3000
const QR_REFRESH_MS = 20000

const api = whatsappApi

export function WhatsAppTab() {
  const [conn, setConn] = useState<Connection | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  const [testNumber, setTestNumber] = useState('')
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const lastQrAt = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const c = await api<Connection>('/api/whatsapp/status')
      setConn(c)
      if (c.status !== 'aguardando_qr') setQr(null)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao consultar o WhatsApp')
    }
  }, [])

  // primeira consulta ao abrir a aba
  useEffect(() => {
    let alive = true
    api<Connection>('/api/whatsapp/status')
      .then(c => { if (alive) setConn(c) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Erro ao consultar o WhatsApp') })
    return () => { alive = false }
  }, [])

  // enquanto espera a leitura do QR: confere o estado a cada 3s e renova o QR a cada 20s
  useEffect(() => {
    if (conn?.status !== 'aguardando_qr') return
    const poll = setInterval(async () => {
      await refresh()
      if (Date.now() - lastQrAt.current >= QR_REFRESH_MS) {
        lastQrAt.current = Date.now()
        try {
          const c = await api<Connection>('/api/whatsapp/connect', { method: 'POST' })
          if (c.qr) setQr(c.qr)
        } catch { /* próxima volta tenta de novo */ }
      }
    }, POLL_MS)
    return () => clearInterval(poll)
  }, [conn?.status, refresh])

  async function handleConnect() {
    setBusy(true); setError('')
    try {
      const c = await api<Connection>('/api/whatsapp/connect', { method: 'POST' })
      lastQrAt.current = Date.now()
      setConn(c)
      setQr(c.qr ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar a conexão')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true); setError('')
    try {
      const c = await api<Connection>('/api/whatsapp/disconnect', { method: 'POST' })
      setConn(c); setQr(null); setConfirmingDisconnect(false); setTestMsg(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível desconectar')
    } finally {
      setBusy(false)
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault()
    setTesting(true); setTestMsg(null)
    try {
      await api('/api/whatsapp/test', { method: 'POST', body: { number: testNumber } })
      setTestMsg({ ok: true, text: 'Mensagem enviada. Confira no WhatsApp desse número.' })
    } catch (err) {
      setTestMsg({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível enviar o teste' })
    } finally {
      setTesting(false)
    }
  }

  const status = conn?.status

  return (
    <div className={styles.stack}>
    <div className={styles.card}>
      <h2 className={styles.title}>WhatsApp da clínica</h2>
      <p className={styles.desc}>
        Conecte o número que a clínica já usa com os pacientes para enviar confirmações de consulta
        automaticamente. A recepção continua usando o WhatsApp no celular normalmente.
      </p>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {!conn && !error && <p className={styles.muted}>Carregando…</p>}

      {status === 'conectado' && (
        <>
          <div className={styles.connected}>
            <span className={styles.dot} />
            <div className={styles.connectedText}>
              <strong>Conectado</strong>
              <span>{conn?.phone ? formatBrPhone(conn.phone) : 'Número da clínica'}</span>
            </div>
            {!confirmingDisconnect && (
              <button className={styles.btnGhost} onClick={() => setConfirmingDisconnect(true)}>Desconectar</button>
            )}
          </div>

          {confirmingDisconnect && (
            <div className={styles.confirmBox}>
              <p>Desconectar agora? As confirmações automáticas param até a clínica conectar de novo.</p>
              <div className={styles.row}>
                <button className={styles.btnDanger} onClick={handleDisconnect} disabled={busy}>
                  {busy ? 'Desconectando…' : 'Sim, desconectar'}
                </button>
                <button className={styles.btnGhost} onClick={() => setConfirmingDisconnect(false)} disabled={busy}>Cancelar</button>
              </div>
            </div>
          )}

          <form className={styles.testBox} onSubmit={handleTest}>
            <label htmlFor="wa-test-number" className={styles.label}>Enviar uma mensagem de teste</label>
            <p className={styles.hint}>Digite o seu próprio número para conferir se a mensagem chega.</p>
            <div className={styles.row}>
              <PhoneInput
                id="wa-test-number"
                className={styles.input}
                value={testNumber}
                onChange={setTestNumber}
              />
              <button className={styles.btnPrimary} type="submit" disabled={testing || !isCompleteBrPhone(testNumber)}>
                {testing ? 'Enviando…' : 'Enviar teste'}
              </button>
            </div>
            {testMsg && (
              <p className={testMsg.ok ? styles.ok : styles.error} role="status">{testMsg.text}</p>
            )}
          </form>
        </>
      )}

      {status === 'aguardando_qr' && (
        <div className={styles.qrWrap}>
          <div className={styles.qrBox}>
            {qr
              ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={qr} alt="QR code para conectar o WhatsApp da clínica" className={styles.qrImg} />
              : <span className={styles.muted}>Gerando o QR code…</span>}
          </div>
          <div className={styles.steps}>
            <h3 className={styles.stepsTitle}>Como conectar</h3>
            <ol>
              <li>Abra o WhatsApp no celular da clínica.</li>
              <li>Toque em <strong>Configurações</strong> e depois em <strong>Aparelhos conectados</strong>.</li>
              <li>Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para este QR code.</li>
            </ol>
            <p className={styles.hint}>O QR code se renova sozinho. Esta tela atualiza quando a conexão for feita.</p>
            <button className={styles.btnGhost} onClick={handleDisconnect} disabled={busy}>Cancelar</button>
          </div>
        </div>
      )}

      {status === 'desconectado' && (
        <div className={styles.disconnected}>
          <div className={styles.statusLine}>
            <span className={`${styles.dot} ${styles.dotOff}`} />
            <strong>Não conectado</strong>
          </div>
          <button className={styles.btnPrimary} onClick={handleConnect} disabled={busy}>
            {busy ? 'Preparando…' : 'Conectar WhatsApp'}
          </button>
        </div>
      )}

      <div className={styles.notice}>
        <strong>Antes de conectar</strong>
        <ul>
          <li>Esta conexão usa o WhatsApp Web, uma integração não oficial. Use o número que a clínica já usa com os pacientes.</li>
          <li>Mantenha o celular com internet. Se ele ficar muito tempo desligado, a conexão cai e é preciso ler o QR code de novo.</li>
          <li>Você pode desconectar quando quiser, aqui mesmo.</li>
        </ul>
      </div>
    </div>

    {conn && <WhatsAppSettingsForm connected={status === 'conectado'} />}
    {conn && <WhatsAppHistory />}
    </div>
  )
}
