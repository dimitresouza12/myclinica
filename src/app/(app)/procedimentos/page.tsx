'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { formatCurrency } from '@/lib/utils'
import type { Procedure } from '@/types'
import { getSpecialtyConfig } from '@/lib/specialtyConfig'
import styles from './procedimentos.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { Modal } from '@/components/ui/Modal'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'
import { MoneyInput } from '@/components/ui/NumericInput'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusDot } from '@/components/ui/StatusDot'
import { MoreMenu } from '@/components/ui/MoreMenu'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import t from '@/components/ui/table.module.css'

interface FormData { name: string; price: string; is_free: boolean; category: string; is_active: boolean }
const BLANK: FormData = { name: '', price: '', is_free: false, category: '', is_active: true }

function ProcedimentosContent() {
  const { clinic } = useAuthStore()
  // "Editar" = criar, alterar e excluir; sem ele a tela é só de consulta
  const { canEdit } = usePermissions('procedimentos')
  // Clínica multi-área soma as sugestões de todas as áreas que ela já tem
  // (clinic.specialties), não só a área principal do cadastro.
  const clinicSpecialties = clinic?.specialties?.length ? clinic.specialties : (clinic ? [clinic.type] : [])
  const nameSuggestions = clinicSpecialties.flatMap(t => getSpecialtyConfig(t).procedureSuggestions)
  const [procedures, setProcedures] = useState<Procedure[]>([])
  // Categorias sugeridas da especialidade + as que a clínica já usa de fato
  // (podem ter sido cadastradas fora da lista padrão) — sem isso, editar um
  // procedimento com categoria "avulsa" mostrava o campo em branco e podia
  // apagar a categoria real ao salvar sem querer.
  const categorias = clinic
    ? Array.from(new Set([
        ...clinicSpecialties.flatMap(t => getSpecialtyConfig(t).procedureCategories),
        ...procedures.map(p => p.category).filter((c): c is string => !!c),
      ]))
    : []
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(BLANK)
  const [saving, setSaving] = useState(false)
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false)


  useEffect(() => {
    if (!clinic?.id) return
    setProcedures([])
    setLoading(true)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  async function loadData() {
    if (!clinic) return
    const { data } = await supabase
      .from('procedures')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('name')
    setProcedures((data ?? []) as Procedure[])
    setLoading(false)
  }

  function openNew() {
    if (!canEdit) return
    setEditingId(null)
    setForm(BLANK)
    setShowModal(true)
    setShowNameSuggestions(false)
    setShowCategorySuggestions(false)
  }

  function openEdit(p: Procedure) {
    if (!canEdit) return
    setEditingId(p.id)
    setForm({ name: p.name, price: String(p.price), is_free: p.is_free, category: p.category ?? '', is_active: p.is_active })
    setShowModal(true)
    setShowNameSuggestions(false)
    setShowCategorySuggestions(false)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(BLANK)
  }

  async function handleSave() {
    if (!clinic || !form.name) return
    setSaving(true)
    const payload = {
      clinic_id: clinic.id,
      name: form.name.trim(),
      // Gratuito força o preço a zero — evita um valor "esquecido" no campo
      // caso a pessoa marque o checkbox depois de já ter digitado algo.
      price: form.is_free ? 0 : (parseFloat(form.price) || 0),
      is_free: form.is_free,
      category: form.category || null,
      is_active: form.is_active,
    }
    if (editingId) {
      await supabase.from('procedures').update(payload).eq('id', editingId)
    } else {
      await supabase.from('procedures').insert([payload])
    }
    setSaving(false)
    closeModal()
    loadData()
  }

  async function handleDelete(p: Procedure) {
    if (!(await confirmDialog({ message: `Excluir o procedimento "${p.name}"? Esta ação não pode ser desfeita.`, confirmText: 'Excluir', danger: true }))) return
    await supabase.from('procedures').delete().eq('id', p.id).eq('clinic_id', clinic!.id)
    loadData()
  }

  const active = procedures.filter(p => p.is_active).length
  const pendingPrice = procedures.filter(p => p.is_active && p.price === 0 && !p.is_free).length
  const priced = procedures.filter(p => p.is_active && p.price > 0)
  const avgPrice = priced.length > 0 ? priced.reduce((sum, p) => sum + p.price, 0) / priced.length : 0

  const filteredNameSuggestions = nameSuggestions.filter(s =>
    s.name.toLowerCase().includes(form.name.trim().toLowerCase())
  )
  const filteredCategorySuggestions = categorias.filter(c =>
    c.toLowerCase().includes(form.category.trim().toLowerCase())
  )

  function selectNameSuggestion(s: { name: string; category: string }) {
    setForm(p => ({ ...p, name: s.name, category: p.category || s.category }))
    setShowNameSuggestions(false)
  }

  function selectCategorySuggestion(c: string) {
    setForm(p => ({ ...p, category: c }))
    setShowCategorySuggestions(false)
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Procedimentos"
        subtitle={`${procedures.length} ${procedures.length === 1 ? 'procedimento' : 'procedimentos'}, ${active} ${active === 1 ? 'ativo' : 'ativos'}`}
        actions={<button type="button" className={btn.primary} onClick={openNew} disabled={!canEdit} title={canEdit ? undefined : 'Seu perfil só pode visualizar'}><Icon name="plus" size={15} /> Novo procedimento</button>}
      />

      <div className={styles.stats}>
        <StatCard title="Procedimentos" value={procedures.length} hint={`${procedures.length - active} inativos`} />
        <StatCard title="Ativos" value={active} hint="aparecem na agenda" />
        <StatCard title="Sem preço definido" value={pendingPrice} hint={pendingPrice > 0 ? 'receita sai sem valor sugerido' : 'todos com valor ou gratuitos'} delta={pendingPrice > 0 ? { label: 'atenção', bad: true } : undefined} />
        <StatCard title="Valor médio" value={formatCurrency(avgPrice)} compact hint="entre os ativos com preço" />
      </div>

      <Card flush title="Lista de procedimentos">
        {loading ? (
          <p className={styles.loading}>Carregando...</p>
        ) : (
          <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
            <table className={`${t.table} resp-table`}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th className={t.num}>Valor</th>
                  <th>Status</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {procedures.length === 0 ? (
                  <tr><td colSpan={5} className={t.empty}>{canEdit ? 'Nenhum procedimento cadastrado. Clique em "Novo procedimento" para começar.' : 'Nenhum procedimento cadastrado.'}</td></tr>
                ) : procedures.map(p => (
                  <tr key={p.id} className={`${canEdit ? t.clickable : ''} ${styles.row}`} onClick={() => openEdit(p)}>
                    <td className={t.strong}>{p.name}</td>
                    <td data-label="Categoria" className={t.muted}>{p.category ?? '-'}</td>
                    <td data-label="Valor" className={t.num}>
                      {p.price > 0
                        ? formatCurrency(p.price)
                        : p.is_free
                          ? <span className={t.muted}>Gratuito</span>
                          : <StatusDot tone="warn">A definir</StatusDot>}
                    </td>
                    <td data-label="Status">
                      <StatusDot tone={p.is_active ? 'ok' : 'idle'}>{p.is_active ? 'Ativo' : 'Inativo'}</StatusDot>
                    </td>
                    <td className={styles.actionsCell}>
                      <div className={t.rowActions} onClick={e => e.stopPropagation()}>
                        {canEdit && (
                          <MoreMenu
                            label={`Mais ações de ${p.name}`}
                            items={[
                              { label: 'Editar', icon: 'edit', onClick: () => openEdit(p) },
                              { label: 'Excluir', icon: 'trash', danger: true, onClick: () => handleDelete(p) },
                            ]}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingId ? 'Editar procedimento' : 'Novo procedimento'}
        subtitle={editingId && form.name.trim() ? form.name.trim() : undefined}
        size="sm"
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={closeModal}>Cancelar</button>
            <button type="button" className={btn.primary} onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className={f.field}>
          <label htmlFor="proc-name">Nome</label>
          <input
            id="proc-name"
            value={form.name}
            onChange={(e) => { setForm(p => ({ ...p, name: e.target.value })); setShowNameSuggestions(true) }}
            onClick={() => setShowNameSuggestions(true)}
            onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
            placeholder="Ex: Limpeza, Extração, Clareamento..."
            autoComplete="off"
            autoFocus
          />
          {showNameSuggestions && filteredNameSuggestions.length > 0 && (
            <div className={styles.suggestionsDropdown}>
              {filteredNameSuggestions.map(s => (
                <button
                  key={s.name}
                  type="button"
                  className={styles.suggestionItem}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectNameSuggestion(s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={f.row2}>
          <div className={f.field}>
            <label>Valor (R$)</label>
            <MoneyInput
              value={form.is_free ? 0 : form.price}
              onChange={(v) => setForm(p => ({ ...p, price: v }))}
              disabled={form.is_free}
            />
          </div>
          <div className={f.field}>
            <label htmlFor="proc-cat">Categoria</label>
            <input
              id="proc-cat"
              value={form.category}
              onChange={(e) => { setForm(p => ({ ...p, category: e.target.value })); setShowCategorySuggestions(true) }}
              onClick={() => setShowCategorySuggestions(true)}
              onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 150)}
              placeholder="Sem categoria"
              autoComplete="off"
            />
            {showCategorySuggestions && filteredCategorySuggestions.length > 0 && (
              <div className={styles.suggestionsDropdown}>
                {filteredCategorySuggestions.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={styles.suggestionItem}
                  tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectCategorySuggestion(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={f.switches}>
          <label className={f.switchRow}>
            <span className={f.switchText}>
              <b>Procedimento gratuito</b>
              <small>Ex.: avaliação. O valor fica em zero.</small>
            </span>
            <span className={f.toggle}>
              <input
                type="checkbox"
                checked={form.is_free}
                onChange={(e) => setForm(p => ({ ...p, is_free: e.target.checked }))}
              />
              <span />
            </span>
          </label>
          <label className={f.switchRow}>
            <span className={f.switchText}>
              <b>Procedimento ativo</b>
              <small>Desativado, deixa de aparecer ao agendar.</small>
            </span>
            <span className={f.toggle}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm(p => ({ ...p, is_active: e.target.checked }))}
              />
              <span />
            </span>
          </label>
        </div>
      </Modal>
    </div>
  )
}

export default function ProcedimentosPage() {
  return <PermissionGuard module="procedimentos"><ProcedimentosContent /></PermissionGuard>
}
