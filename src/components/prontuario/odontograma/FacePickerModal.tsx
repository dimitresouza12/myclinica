'use client'
import { Modal } from '@/components/ui/Modal'
import btn from '@/components/ui/button.module.css'
import { DEFAULT_STATUS, statusColor, toothPositionName, type SurfaceKey, type ToothData } from '@/lib/odontograma'
import type { ToolDef } from '@/lib/odontogramaTools'
import { faceLabel } from '@/lib/odontogramaGeometry'
import { FACE_BUTTONS } from '@/lib/odontogramaView'
import { OcclusalFigure } from './OdontogramaBoard'
import board from './odontogramaBoard.module.css'
import styles from './odontogramaPanel.module.css'

/**
 * Ampliação da vista oclusal para escolher a face com o dedo, em qualquer aparelho de toque: no tabuleiro geral cada
 * face fica menor que a área de toque confortável (44px). Cada toque aplica a ferramenta (e toca de novo desmarca);
 * a vista fica aberta para marcar várias faces e só fecha em "Concluir". Os botões V, L, M, D e O repetem as faces
 * da figura com alvos de 44px ou mais.
 */
export function FacePickerModal({ n, data, tool, onFace, onClose }: {
  n: number; data: ToothData; tool: ToolDef; onFace(face: SurfaceKey): void; onClose(): void
}) {
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Dente ${n}`}
      subtitle={`${toothPositionName(n)} · ${tool.label}`}
      footer={<button type="button" className={btn.primary} onClick={onClose} autoFocus>Concluir</button>}
    >
      <div className={`${board.theme} ${styles.facePick}`} style={{ '--odo-tool': tool.color } as React.CSSProperties}>
        <OcclusalFigure n={n} data={data} activeFace={null} onFace={onFace} className={board.figOccLg} />
        <div className={styles.faceBtns} role="group" aria-label={`Faces do dente ${n}`}>
          {FACE_BUTTONS.map(({ face, letter }) => {
            const status = data.surfaces?.[face] ?? DEFAULT_STATUS
            const marked = status !== DEFAULT_STATUS
            return (
              <button
                key={face} type="button" className={styles.faceBtn} aria-pressed={marked} aria-label={`${faceLabel(n, face)}${marked ? ', marcada' : ''}`}
                style={marked ? { '--face-color': statusColor(status) } as React.CSSProperties : undefined}
                onClick={() => onFace(face)}
              >
                <span className={styles.faceLetter}>{letter}</span>
                <span className={styles.faceName}>{faceLabel(n, face)}</span>
              </button>
            )
          })}
        </div>
        <p className={styles.facePickHint}>Toque nas faces para marcar; toque de novo para desmarcar. Quando terminar, toque em Concluir.</p>
      </div>
    </Modal>
  )
}
