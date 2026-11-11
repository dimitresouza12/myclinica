'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import btn from '@/components/ui/button.module.css'
import styles from './odontogramaPanel.module.css'

/** O JSON do odontograma como está agora (inclui o que ainda não foi salvo), para copiar ou baixar. */
export function JsonModal({ json, filename, onClose }: { json: string; filename: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(json)
    } catch {
      // sem permissão de área de transferência: seleciona o texto para copiar à mão
      const sel = window.getSelection(), pre = document.getElementById('odo-json')
      if (sel && pre) { const r = document.createRange(); r.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(r) }
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  function download() {
    const blob = new Blob([json], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  return (
    <Modal
      open onClose={onClose} size="lg"
      title="JSON do odontograma" subtitle="Estado atual, com o que ainda não foi salvo"
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button type="button" className={btn.primary} onClick={download}><Icon name="download" size={14} /> Baixar .json</button>
        </>
      }
    >
      <p className={styles.jsonNote}>O JSON contém o nome do profissional no histórico. Confira antes de compartilhar.</p>
      <pre id="odo-json" className={styles.json} tabIndex={0} aria-label="Conteúdo JSON do odontograma">{json}</pre>
    </Modal>
  )
}
