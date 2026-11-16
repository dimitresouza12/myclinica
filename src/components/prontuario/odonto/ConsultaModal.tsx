'use client'
// As fotos vêm de endereços temporários do armazenamento privado; o otimizador de imagem do Next não se aplica.
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { DatePicker } from '@/components/ui/DatePicker'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import { ATTACHMENT_MAX_BYTES, formatBytes, validateAttachment } from '@/lib/prontuarioAttachments'
import { aparelhoUsaFio, MAX_FOTOS_POR_CONSULTA, dataValida, somarDias, type AparelhoId, type Arcadas, type OrtoConsulta } from '@/lib/odonto/ortodontia'
import common from './odontoCommon.module.css'
import styles from './ortodontia.module.css'

export interface FotoNova { key: string; file: File; mime: string; ext: string; preview: string }

interface Props {
  consulta: OrtoConsulta
  nova: boolean
  aparelho: AparelhoId
  arcadas: Arcadas
  /** endereços temporários das fotos já salvas */
  urls: Record<string, string>
  onClose: () => void
  /** devolve true quando gravou; o modal só fecha nesse caso */
  onSalvar: (consulta: OrtoConsulta, novas: FotoNova[], removidas: string[]) => Promise<boolean>
}

const ATRASOS = [15, 30, 45, 60]

/** Formulário de uma manutenção: data, ativação, fio, elásticos, observações, próxima manutenção e fotos opcionais. */
export function ConsultaModal({ consulta, nova, aparelho, arcadas, urls, onClose, onSalvar }: Props) {
  const [c, setC] = useState<OrtoConsulta>(consulta)
  const [novas, setNovas] = useState<FotoNova[]>([])
  const [removidas, setRemovidas] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  // as pré-visualizações locais precisam ser liberadas ao fechar
  const previews = useRef<string[]>([])
  useEffect(() => () => { previews.current.forEach(u => URL.revokeObjectURL(u)) }, [])

  const set = <K extends keyof OrtoConsulta>(k: K, v: OrtoConsulta[K]) => setC(x => ({ ...x, [k]: v }))
  const usaFio = aparelhoUsaFio(aparelho)
  const mostraSup = arcadas !== 'inferior'
  const mostraInf = arcadas !== 'superior'
  const fotosSalvas = c.fotos.filter(p => !removidas.includes(p))
  const totalFotos = fotosSalvas.length + novas.length

  function escolherFotos(files: FileList | null) {
    if (!files) return
    const aceitas: FotoNova[] = []
    let vagas = MAX_FOTOS_POR_CONSULTA - totalFotos
    for (const file of Array.from(files)) {
      if (vagas <= 0) { showToast('error', `No máximo ${MAX_FOTOS_POR_CONSULTA} fotos por manutenção.`); break }
      const v = validateAttachment(file)
      if (!v.ok) { showToast('error', `${file.name}: ${v.reason}`); continue }
      if (v.kind !== 'image') { showToast('error', `${file.name}: só imagens (até ${formatBytes(ATTACHMENT_MAX_BYTES.image)}).`); continue }
      const preview = URL.createObjectURL(file)
      previews.current.push(preview)
      aceitas.push({ key: crypto.randomUUID(), file, mime: v.mime, ext: v.ext, preview })
      vagas--
    }
    if (aceitas.length) setNovas(n => [...n, ...aceitas])
    if (arquivo.current) arquivo.current.value = ''
  }

  async function confirmar() {
    if (!dataValida(c.data)) { showToast('error', 'Informe a data da manutenção.'); return }
    setSaving(true)
    const ok = await onSalvar({ ...c, fotos: fotosSalvas }, novas, removidas)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      size="lg"
      title={nova ? 'Registrar manutenção' : 'Editar manutenção'}
      subtitle="Ativação, fio, elásticos, próxima manutenção e fotos (opcionais)"
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className={btn.primary} onClick={confirmar} disabled={saving}>{saving ? 'Salvando...' : nova ? 'Salvar manutenção' : 'Salvar alterações'}</button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={common.grid}>
          <div className={common.field}>
            <label>Data da manutenção</label>
            <DatePicker value={c.data} onChange={v => set('data', v)} ariaLabel="Data da manutenção" />
          </div>
        </div>

        <div className={common.field}>
          <label htmlFor="orto-ativacao">Ativação {aparelho === 'alinhador' ? <span className={common.unit}>(etapa, troca de alinhador, attachments)</span> : <span className={common.unit}>(o que foi ativado ou ajustado)</span>}</label>
          <textarea id="orto-ativacao" className={common.textarea} value={c.ativacao} onChange={e => set('ativacao', e.target.value)} placeholder="Ex.: troca de fio, dobra de ajuste, volta do parafuso, alinhador 7 de 24" />
        </div>

        {usaFio && (
          <div className={common.grid2}>
            {mostraSup && (
              <div className={common.field}>
                <label htmlFor="orto-fio-sup">Fio superior</label>
                <input id="orto-fio-sup" className={common.input} value={c.fioSup} maxLength={120} onChange={e => set('fioSup', e.target.value)} placeholder="Ex.: NiTi 0,014" />
              </div>
            )}
            {mostraInf && (
              <div className={common.field}>
                <label htmlFor="orto-fio-inf">Fio inferior</label>
                <input id="orto-fio-inf" className={common.input} value={c.fioInf} maxLength={120} onChange={e => set('fioInf', e.target.value)} placeholder="Ex.: aço 0,019 x 0,025" />
              </div>
            )}
          </div>
        )}

        <div className={common.field}>
          <label htmlFor="orto-elasticos">Elásticos</label>
          <input id="orto-elasticos" className={common.input} value={c.elasticos} maxLength={500} onChange={e => set('elasticos', e.target.value)} placeholder="Ex.: classe II, 3/16, uso 24 h" />
        </div>

        <div className={common.field}>
          <label htmlFor="orto-obs">Observações</label>
          <textarea id="orto-obs" className={common.textarea} value={c.obs} onChange={e => set('obs', e.target.value)} placeholder="Higiene, colagens soltas, queixas, colaboração do paciente..." />
        </div>

        <div className={common.field}>
          <label>Próxima manutenção</label>
          <div className={common.row}>
            <DatePicker value={c.proxima} onChange={v => set('proxima', v)} ariaLabel="Data da próxima manutenção" placeholder="Sem data marcada" />
            <div className={styles.quick} role="group" aria-label="Marcar a partir da data da manutenção">
              {ATRASOS.map(n => (
                <button key={n} type="button" className={styles.quickBtn} disabled={!dataValida(c.data)} onClick={() => set('proxima', somarDias(c.data, n))}>+{n} dias</button>
              ))}
              {c.proxima && <button type="button" className={styles.quickBtn} onClick={() => set('proxima', '')}>Limpar</button>}
            </div>
          </div>
          <span className={common.hint}>Sem data marcada, o app sugere a próxima pelo intervalo padrão do tratamento.</span>
        </div>

        <div className={common.field}>
          <label>Fotos <span className={common.unit}>(opcional, até {MAX_FOTOS_POR_CONSULTA})</span></label>
          <div className={styles.photos}>
            {fotosSalvas.map(p => (
              <span key={p} className={styles.photo}>
                {urls[p] ? <img src={urls[p]} alt="Foto salva desta manutenção" /> : <span className={styles.photoMissing}>Sem prévia</span>}
                <button type="button" className={styles.photoRemove} aria-label="Remover esta foto" onClick={() => setRemovidas(r => [...r, p])}><Icon name="close" size={14} /></button>
              </span>
            ))}
            {novas.map(f => (
              <span key={f.key} className={styles.photo}>
                <img src={f.preview} alt="Foto nova, ainda não salva" />
                <button type="button" className={styles.photoRemove} aria-label="Remover esta foto" onClick={() => setNovas(n => n.filter(x => x.key !== f.key))}><Icon name="close" size={14} /></button>
              </span>
            ))}
          </div>
          <div className={common.row}>
            <button type="button" className={styles.addPhoto} disabled={totalFotos >= MAX_FOTOS_POR_CONSULTA || saving} onClick={() => arquivo.current?.click()}>
              <Icon name="camera" size={16} aria-hidden="true" /> Adicionar foto
            </button>
            <input ref={arquivo} className={styles.fileInput} type="file" accept="image/*" multiple tabIndex={-1} aria-label="Escolher fotos" onChange={e => escolherFotos(e.target.files)} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
