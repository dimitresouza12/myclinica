'use client'
import { useRef, useState, type RefObject } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { VoicePlayer } from '@/components/mensagens/VoicePlayer'
import { expiryNote, isAttachmentExpired, thumbBox } from '@/lib/teamChat/attachments'
import type { TeamAttachment, TeamLocalAttachment, TeamMessageView } from '@/lib/teamChat/types'
import { Lightbox } from './Lightbox'
import { useInView, useObjectUrl, useSignedUrl } from './useAttachmentUrl'
import styles from './ChatEquipe.module.css'

function ExpiredBlock() {
  return (
    <div className={styles.attExpired}>
      <Icon name="clock" size={16} aria-hidden="true" />
      <span>Arquivo expirado</span>
    </div>
  )
}

/** Miniatura com cantos arredondados; a proporção width/height reserva o espaço antes da foto chegar (a lista não pula). */
function ImageBox({ width, height, children }: { width: number | null; height: number | null; children: React.ReactNode }) {
  const box = thumbBox(width, height)
  return (
    <div className={styles.attImgWrap} style={{ width: box.width, aspectRatio: `${box.width} / ${box.height}` }}>
      {children}
    </div>
  )
}

/** Foto que já temos (arquivo local de quem enviou, ou link assinado): abre em tela cheia ao tocar. */
function ThumbButton({ url, onFail, getFresh }: { url: string; onFail?: () => void; getFresh?: (force?: boolean) => Promise<string | null> }) {
  const [open, setOpen] = useState(false)
  // link usado na tela cheia: o link assinado vale 300 s, então, se o da miniatura é velho, abre com um novo
  const [bigUrl, setBigUrl] = useState(url)
  const opening = useRef(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  async function openBig() {
    if (opening.current) return
    opening.current = true
    try {
      setBigUrl((getFresh ? await getFresh() : null) ?? url)
      setOpen(true)
    } finally { opening.current = false }
  }
  return (
    <>
      <button ref={btnRef} type="button" className={styles.attImgBtn} onClick={() => void openBig()} aria-label="Abrir a foto em tamanho grande">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Foto enviada na conversa" className={styles.attImg} onError={onFail} draggable={false} />
      </button>
      {open && <Lightbox url={bigUrl} refresh={getFresh} onClose={() => { setOpen(false); requestAnimationFrame(() => btnRef.current?.focus()) }} />}
    </>
  )
}

function RemoteImage({ att, boxRef, inView }: { att: TeamAttachment; boxRef: RefObject<HTMLDivElement | null>; inView: boolean }) {
  const { state, retry, fail, getFresh } = useSignedUrl(att.storage_path, inView)
  return (
    <div ref={boxRef}>
      {state.status === 'gone' ? <ExpiredBlock /> : (
        <ImageBox width={att.width} height={att.height}>
          {state.status === 'ready' ? <ThumbButton url={state.url} onFail={fail} getFresh={getFresh} /> : state.status === 'error' ? (
            <div className={styles.attError}>
              <span>Não foi possível carregar a foto.</span>
              <button type="button" className={styles.smallBtn} onClick={retry}>Tentar de novo</button>
            </div>
          ) : (
            <span className={styles.attSkeleton} role="status" aria-label="Carregando a foto"><Spinner size={20} decorative /></span>
          )}
        </ImageBox>
      )}
    </div>
  )
}

function RemoteAudio({ att, mine, boxRef, inView }: { att: TeamAttachment; mine: boolean; boxRef: RefObject<HTMLDivElement | null>; inView: boolean }) {
  const { state, retry, fail, getFresh } = useSignedUrl(att.storage_path, inView)
  return (
    <div ref={boxRef} className={styles.attAudio}>
      {state.status === 'ready' ? (
        <VoicePlayer url={state.url} seed={att.id} wave={null} seconds={att.duration_ms != null ? att.duration_ms / 1000 : null} outgoing={mine} onError={fail} beforePlay={getFresh} />
      ) : state.status === 'gone' ? <ExpiredBlock /> : state.status === 'error' ? (
        <div className={styles.attAudioErr}>
          <span>Não foi possível carregar o áudio.</span>
          <button type="button" className={styles.smallBtn} onClick={retry}>Tentar de novo</button>
        </div>
      ) : (
        <div className={styles.attAudioLoad} role="status"><Spinner size={18} decorative />Carregando o áudio</div>
      )}
    </div>
  )
}

function RemoteAttachment({ att, mine }: { att: TeamAttachment; mine: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null)
  // a bolha entrar na tela re-renderiza (inView muda): a expiração é reavaliada ali, antes de pedir o link assinado
  const inView = useInView(boxRef)
  const now = new Date()
  if (isAttachmentExpired(att, now)) return <ExpiredBlock />
  const note = expiryNote(att, now)
  return (
    <>
      {att.kind === 'image' ? <RemoteImage att={att} boxRef={boxRef} inView={inView} /> : <RemoteAudio att={att} mine={mine} boxRef={boxRef} inView={inView} />}
      {note && <span className={styles.attNote}>{note}</span>}
    </>
  )
}

/** Arquivo ainda no aparelho de quem enviou. O link de objeto nasce e morre com esta bolha (useObjectUrl). */
function LocalAttachment({ m, local, mine }: { m: TeamMessageView; local: TeamLocalAttachment; mine: boolean }) {
  const url = useObjectUrl(local.blob)
  if (local.kind === 'image') {
    return (
      <ImageBox width={local.width} height={local.height}>
        {url ? <ThumbButton url={url} /> : <span className={styles.attSkeleton} aria-hidden="true" />}
        {m.sendState === 'sending' && (
          <span className={styles.attSending} role="status"><Spinner size={22} decorative />Enviando</span>
        )}
      </ImageBox>
    )
  }
  return (
    <div className={styles.attAudio}>
      {url && <VoicePlayer url={url} seed={m.id} wave={null} seconds={local.duration_ms != null ? local.duration_ms / 1000 : null} outgoing={mine} />}
    </div>
  )
}

/**
 * Anexo da bolha: foto (miniatura + tela cheia) ou áudio (player), ou o aviso de arquivo expirado.
 * Mensagem minha em envio mostra o arquivo local, sem baixar nada.
 */
export function AttachmentView({ m, mine }: { m: TeamMessageView; mine: boolean }) {
  // mensagem apagada não mostra anexo (o arquivo ainda pode estar no servidor até a limpeza diária)
  if (m.deleted_at) return null
  const local = m.localAttachment
  const att = m.attachment
  if (local) return <LocalAttachment m={m} local={local} mine={mine} />
  if (att) return <RemoteAttachment att={att} mine={mine} />
  // a mensagem tem anexo, mas a consulta ainda não voltou
  if (m.has_attachment && att === undefined && !m.deleted_at) {
    return <div className={styles.attAudioLoad} role="status"><Spinner size={18} decorative />Carregando o anexo</div>
  }
  return null
}
