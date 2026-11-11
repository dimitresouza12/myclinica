'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PillTabs } from '@/components/ui/PillTabs'
import { Icon } from '@/components/ui/Icon'
import { printAntesDepois } from '@/lib/print'
import { usePrintActions } from '../print/PrintRegistry'
import {
  collectPhotos, daysBetween, formatInterval, formatPhotoDate, photoOptionLabel, pickPhoto, reconcilePair,
  type ComparadorPhoto,
} from '@/lib/antesDepois'
import type { AuthClinic, Patient, RecordEntry } from '@/types'
import { ComparadorSlider } from './ComparadorSlider'
import styles from './comparador.module.css'

interface Props {
  patient: Patient
  clinic: AuthClinic
  entries: RecordEntry[]
  entriesLoading: boolean
}

type Vista = 'slider' | 'lado'
const SIGNED_URL_EXPIRES = 3600

/**
 * Aba "Antes e depois" (estética e odontologia). Não tem upload próprio: usa as fotos que a
 * Evolução já guarda em record_entries.photo_urls (bucket privado `pacientes`, links assinados).
 */
export function TabComparador({ patient, clinic, entries, entriesLoading }: Props) {
  const photos = useMemo(() => collectPhotos(entries), [entries])
  const [picked, setPicked] = useState<{ before: string; after: string } | null>(null)
  const pair = useMemo(() => reconcilePair(picked, photos), [picked, photos])
  const [vista, setVista] = useState<Vista>('slider')
  // path no bucket → link assinado (só pedimos o das duas fotos em uso)
  const [signed, setSigned] = useState<Record<string, string>>({})
  const [signFailed, setSignFailed] = useState(false)

  const byKey = useMemo(() => new Map(photos.map(p => [p.key, p])), [photos])
  const beforePhoto = pair ? byKey.get(pair.before) ?? null : null
  const afterPhoto = pair ? byKey.get(pair.after) ?? null : null

  const beforePath = beforePhoto?.path ?? null
  const afterPath = afterPhoto?.path ?? null
  useEffect(() => {
    const missing = [beforePath, afterPath].filter((p): p is string => !!p && !signed[p])
    if (missing.length === 0) return
    let cancelled = false
    supabase.storage.from('pacientes').createSignedUrls(missing, SIGNED_URL_EXPIRES).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) { setSignFailed(true); return }
      const next: Record<string, string> = {}
      for (const row of data) if (row.path && row.signedUrl) next[row.path] = row.signedUrl
      setSigned(prev => ({ ...prev, ...next }))
      setSignFailed(missing.some(p => !next[p]))
    })
    return () => { cancelled = true }
  }, [beforePath, afterPath, signed])

  function urlOf(p: ComparadorPhoto | null): string {
    if (!p) return ''
    if (p.path) return signed[p.path] ?? ''
    return /^https?:\/\//i.test(p.raw) ? p.raw : ''
  }
  const beforeUrl = urlOf(beforePhoto)
  const afterUrl = urlOf(afterPhoto)
  const ready = !!beforePhoto && !!afterPhoto && !!beforeUrl && !!afterUrl

  const interval = beforePhoto && afterPhoto ? formatInterval(daysBetween(beforePhoto.takenAt, afterPhoto.takenAt)) : ''
  const hasTermoDocs = (clinic.specialties?.length ? clinic.specialties : [clinic.type]).includes('estetica')

  function swap() {
    if (pair) setPicked({ before: pair.after, after: pair.before })
  }

  async function handlePrint() {
    if (!ready || !beforePhoto || !afterPhoto) return
    const ok = await confirmDialog({
      title: 'Autorização de uso de imagem',
      message: `Esta comparação mostra imagens de ${patient.name}. Confirme que o paciente assinou o Termo de uso de imagem antes de imprimir ou compartilhar. O sistema não registra essa assinatura.`,
      confirmText: 'Termo assinado, imprimir',
      cancelText: 'Cancelar',
    })
    if (!ok) return
    printAntesDepois(
      { name: clinic.name, logo: clinic.logo, address: clinic.address, phone: clinic.phone },
      patient.name,
      { url: beforeUrl, date: formatPhotoDate(beforePhoto.takenAt), procedure: beforePhoto.procedure },
      { url: afterUrl, date: formatPhotoDate(afterPhoto.takenAt), procedure: afterPhoto.procedure },
      interval,
    )
  }

  // a impressão vai para o menu "Imprimir" do prontuário (sem botão próprio aqui)
  usePrintActions('comparador', [{
    id: 'antes-depois',
    label: 'Comparativo antes e depois',
    includes: [
      'As duas fotos escolhidas lado a lado, com data e procedimento',
      'O intervalo entre elas',
      'Antes de imprimir, pedimos a confirmação do Termo de uso de imagem',
    ],
    disabledReason: ready ? undefined : 'Escolha duas fotos para comparar',
    run: handlePrint,
  }])

  if (entriesLoading) return <p className={styles.loading}>Carregando fotos do prontuário...</p>

  if (photos.length < 2) {
    return (
      <div className={styles.wrap}>
        <EmptyState
          icon="camera"
          title={photos.length === 0 ? 'Nenhuma foto no prontuário ainda' : 'Falta mais uma foto para comparar'}
          description={
            photos.length === 0
              ? 'Na aba Evolução, anexe fotos do paciente (antes do procedimento e, depois, o resultado). Com duas fotos ou mais, a comparação aparece aqui.'
              : 'Há uma foto no prontuário. Na aba Evolução, anexe outra foto do paciente (por exemplo, o resultado após o procedimento) para comparar.'
          }
        />
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.notice}>
        <Icon name="info" size={18} />
        <span>
          Antes de imprimir ou compartilhar, confirme que o paciente assinou o Termo de uso de imagem
          {hasTermoDocs ? ' (modelo na aba Documentos)' : ''}. O sistema não registra essa assinatura.
        </span>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Fotos da comparação</span>
          <button type="button" className={styles.swapBtn} onClick={swap}>
            <Icon name="swap" size={16} /> Trocar
          </button>
        </div>
        <div className={styles.pickers}>
          <label className={styles.field}>
            <span className={styles.label}>Antes</span>
            <select className={styles.select} value={pair?.before ?? ''} onChange={e => pair && setPicked(pickPhoto(pair, 'before', e.target.value))}>
              {photos.map(p => <option key={p.key} value={p.key}>{photoOptionLabel(p)}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Depois</span>
            <select className={styles.select} value={pair?.after ?? ''} onChange={e => pair && setPicked(pickPhoto(pair, 'after', e.target.value))}>
              {photos.map(p => <option key={p.key} value={p.key}>{photoOptionLabel(p)}</option>)}
            </select>
          </label>
        </div>
        {interval && <p className={styles.interval}>Depois: {interval}</p>}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <PillTabs<Vista>
            label="Modo de comparação"
            value={vista}
            onChange={setVista}
            options={[{ value: 'slider', label: 'Deslizar' }, { value: 'lado', label: 'Lado a lado' }]}
          />
        </div>

        {signFailed && !ready && <p className={styles.warn}>Não foi possível carregar uma das fotos. Feche e abra o prontuário para tentar de novo.</p>}
        {!ready && !signFailed && <p className={styles.loading}>Carregando fotos...</p>}

        {ready && beforePhoto && afterPhoto && (vista === 'slider' ? (
          <ComparadorSlider
            key={`${beforeUrl}|${afterUrl}`}
            before={{ url: beforeUrl, date: formatPhotoDate(beforePhoto.takenAt), procedure: beforePhoto.procedure }}
            after={{ url: afterUrl, date: formatPhotoDate(afterPhoto.takenAt), procedure: afterPhoto.procedure }}
          />
        ) : (
          <div className={styles.side}>
            {([['Antes', beforePhoto, beforeUrl], ['Depois', afterPhoto, afterUrl]] as const).map(([label, p, url]) => (
              <figure key={label} className={styles.sideItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.sideImg} src={url} alt={`Foto ${label}, ${formatPhotoDate(p.takenAt)}`} />
                <figcaption className={styles.sideCap}>
                  <strong>{label}</strong>
                  <span>{formatPhotoDate(p.takenAt)}</span>
                  {p.procedure && <span className={styles.sideProc}>{p.procedure}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
