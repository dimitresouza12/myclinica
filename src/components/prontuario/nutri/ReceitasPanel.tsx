'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import {
  LIMITES_RECEITA, anexarReceita, filtrarReceitas, formatarTempo, ingredientesParaTexto, validarReceita, type Receita,
} from '@/lib/nutri/receitas'
import { excluirReceita, MENSAGEM_RECEITAS, salvarReceita } from '@/lib/nutri/receitasStorage'
import { htmlReceita, imprimirNutri } from '@/lib/nutri/imprimir'
import type { Indisponibilidade } from '@/lib/nutri/erros'
import styles from './nutri.module.css'

interface FormReceita { titulo: string; porcoes: string; tempo: string; ingredientes: string; preparo: string; observacoes: string }
const VAZIO: FormReceita = { titulo: '', porcoes: '', tempo: '', ingredientes: '', preparo: '', observacoes: '' }
const doRegistro = (r: Receita): FormReceita => ({
  titulo: r.titulo, porcoes: r.porcoes ? String(r.porcoes) : '', tempo: r.tempo_preparo_min ? String(r.tempo_preparo_min) : '',
  ingredientes: ingredientesParaTexto(r.ingredientes), preparo: r.modo_preparo, observacoes: r.observacoes ?? '',
})
const soDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 4)

interface Props {
  patient: Patient
  clinicId: string
  clinica: { name: string; address?: string; phone?: string }
  receitas: Receita[]
  carregando: boolean
  motivo: Indisponibilidade | null
  recarregar: () => Promise<unknown>
  onDirtyChange?: (dirty: boolean) => void
}

/** Banco de receitas da clínica: cadastro com ingredientes e modo de preparo, busca e impressão. Anexar a uma refeição é no Plano alimentar. */
export function ReceitasPanel({ patient, clinicId, clinica, receitas, carregando, motivo, recarregar, onDirtyChange }: Props) {
  // null = lista; 'nova' = formulário em branco; id = editando essa receita
  const [editando, setEditando] = useState<string | null>(null)
  const [f, setF] = useState<FormReceita>(VAZIO)
  const [salvo, setSalvo] = useState(JSON.stringify(VAZIO))
  const [busca, setBusca] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const dirty = editando !== null && JSON.stringify(f) !== salvo
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const lista = useMemo(() => filtrarReceitas(receitas, busca), [receitas, busca])
  const alterar = (patch: Partial<FormReceita>) => { setF(cur => ({ ...cur, ...patch })); setErro('') }

  async function descartarSePreciso() {
    if (!dirty) return true
    return confirmDialog({
      title: 'Descartar alterações?', message: 'Esta receita tem alterações não salvas. Se continuar, elas serão perdidas.',
      confirmText: 'Descartar', cancelText: 'Voltar e salvar', danger: true,
    })
  }
  function abrir(id: string | 'nova', base: FormReceita) {
    setEditando(id); setF(base); setSalvo(JSON.stringify(base)); setErro('')
  }
  async function novaReceita() { if (await descartarSePreciso()) abrir('nova', VAZIO) }
  async function editar(r: Receita) { if (await descartarSePreciso()) abrir(r.id, doRegistro(r)) }
  async function fechar() { if (await descartarSePreciso()) { setEditando(null); setErro('') } }

  async function salvar() {
    const v = validarReceita(f)
    if (!v.ok) { setErro(v.erro); return }
    setSaving(true)
    const r = await salvarReceita({ id: editando === 'nova' ? null : editando, clinicId, dados: v.dados })
    setSaving(false)
    if (!r.ok) { showToast('error', MENSAGEM_RECEITAS[r.motivo]); return }
    showToast('ok', 'Receita salva.')
    setEditando(null); setSalvo(JSON.stringify(f))
    await recarregar()
  }

  async function excluir(r: Receita) {
    const ok = await confirmDialog({
      title: 'Excluir esta receita?',
      message: `A receita "${r.titulo}" sairá do banco de receitas. Planos que já a usam continuam com a cópia deles. Isso não pode ser desfeito.`,
      confirmText: 'Excluir receita', cancelText: 'Manter', danger: true,
    })
    if (!ok) return
    const res = await excluirReceita({ id: r.id, clinicId })
    if (!res.ok) { showToast('error', 'Não foi possível excluir agora. Tente de novo.'); return }
    if (editando === r.id) setEditando(null)
    await recarregar()
  }

  function imprimir(r: Receita) {
    const cab = { clinica: clinica.name, paciente: patient.name, detalhe: [clinica.address, clinica.phone].filter(Boolean).join(' | ') || undefined }
    imprimirNutri(htmlReceita(cab, { ...anexarReceita(r), observacoes: r.observacoes }))
  }

  return (
    <div className={styles.wrap}>
      {motivo && (
        <div className={styles.notice} role="status"><Icon name="alert" size={18} /><span>{MENSAGEM_RECEITAS[motivo]}</span></div>
      )}

      {editando === null ? (
        <section className={styles.card} aria-label="Banco de receitas">
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>Banco de receitas da clínica</h3>
            <Button variant="primary" icon="plus" onClick={novaReceita} disabled={!!motivo}>Nova receita</Button>
          </div>
          <p className={styles.cardSub}>Receitas que a clínica reutiliza. No Plano alimentar, anexe uma receita a uma refeição: o paciente passa a ver os ingredientes e o modo de preparo.</p>
          <div className={styles.field}>
            <label htmlFor="rec-busca">Buscar</label>
            <input id="rec-busca" className={styles.input} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome da receita ou ingrediente" />
          </div>
          {carregando && <p className={styles.hint}>Carregando receitas...</p>}
          {!carregando && receitas.length === 0 && !motivo && <p className={styles.empty}>Nenhuma receita cadastrada ainda. Toque em Nova receita para começar.</p>}
          {!carregando && receitas.length > 0 && lista.length === 0 && <p className={styles.empty}>Nenhuma receita encontrada para esta busca.</p>}
          <ul className={styles.recList}>
            {lista.map(r => {
              const meta = [
                r.porcoes ? `${r.porcoes} ${r.porcoes === 1 ? 'porção' : 'porções'}` : '',
                r.tempo_preparo_min ? `preparo ${formatarTempo(r.tempo_preparo_min)}` : '',
                `${r.ingredientes.length} ${r.ingredientes.length === 1 ? 'ingrediente' : 'ingredientes'}`,
              ].filter(Boolean).join(' | ')
              return (
                <li key={r.id} className={styles.recItem}>
                  <div className={styles.recInfo}>
                    <span className={styles.recName}>{r.titulo}</span>
                    <span className={styles.hint}>{meta}</span>
                  </div>
                  <div className={styles.recActions}>
                    <Button variant="secondary" icon="edit" onClick={() => editar(r)} aria-label={`Editar a receita ${r.titulo}`}>Editar</Button>
                    <Button variant="secondary" icon="download" onClick={() => imprimir(r)} aria-label={`Imprimir a receita ${r.titulo}`}>Imprimir</Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <section className={styles.card} aria-label={editando === 'nova' ? 'Nova receita' : 'Editar receita'}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>{editando === 'nova' ? 'Nova receita' : 'Editar receita'}</h3>
          </div>
          <div className={styles.field}>
            <label htmlFor="rec-titulo">Nome da receita</label>
            <input id="rec-titulo" className={styles.input} value={f.titulo} maxLength={LIMITES_RECEITA.titulo} onChange={e => alterar({ titulo: e.target.value })} placeholder="Ex.: Panqueca de banana com aveia" />
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="rec-porcoes">Porções <span className={styles.unit}>(opcional)</span></label>
              <input id="rec-porcoes" className={styles.input} inputMode="numeric" value={f.porcoes} onChange={e => alterar({ porcoes: soDigitos(e.target.value) })} placeholder="Ex.: 2" />
            </div>
            <div className={styles.field}>
              <label htmlFor="rec-tempo">Preparo <span className={styles.unit}>(minutos, opcional)</span></label>
              <input id="rec-tempo" className={styles.input} inputMode="numeric" value={f.tempo} onChange={e => alterar({ tempo: soDigitos(e.target.value) })} placeholder="Ex.: 20" />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="rec-ing">Ingredientes <span className={styles.unit}>(um por linha, com a quantidade)</span></label>
            <textarea id="rec-ing" className={styles.textarea} value={f.ingredientes} onChange={e => alterar({ ingredientes: e.target.value })} placeholder={'1 banana madura\n2 ovos\n3 colheres de sopa de aveia'} />
          </div>
          <div className={styles.field}>
            <label htmlFor="rec-preparo">Modo de preparo</label>
            <textarea id="rec-preparo" className={styles.textarea} value={f.preparo} maxLength={LIMITES_RECEITA.preparo} onChange={e => alterar({ preparo: e.target.value })} placeholder="Amasse a banana, misture os demais ingredientes e doure em frigideira antiaderente." />
          </div>
          <div className={styles.field}>
            <label htmlFor="rec-obs-receita">Observações <span className={styles.unit}>(opcional)</span></label>
            <textarea id="rec-obs-receita" className={styles.textarea} value={f.observacoes} maxLength={LIMITES_RECEITA.observacoes} onChange={e => alterar({ observacoes: e.target.value })} placeholder="Conservação, variações, substituições possíveis..." />
          </div>
          {erro && <p className={styles.errMsg} role="alert">{erro}</p>}
          <div className={styles.saveRow}>
            {dirty && !saving && <span className={styles.dirtyMsg}>Alterações não salvas</span>}
            {editando !== 'nova' && (
              <Button variant="secondary" onClick={() => { const r = receitas.find(x => x.id === editando); if (r) excluir(r) }} disabled={saving}>Excluir</Button>
            )}
            <Button variant="secondary" onClick={fechar} disabled={saving}>Fechar</Button>
            <Button variant="primary" onClick={salvar} loading={saving}>Salvar receita</Button>
          </div>
        </section>
      )}
    </div>
  )
}
