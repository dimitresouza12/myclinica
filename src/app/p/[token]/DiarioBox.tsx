'use client'
import { useState } from 'react'
import { REFEICOES_DIARIO, rotuloRefeicao, LIMITES_DIARIO, type DiarioPublico, type RefeicaoDiario, type RegistroPublico } from '@/lib/nutri/diario'
import { fmtDateBr } from '@/lib/portal/format'
import { somarDias } from '@/lib/vet/datas'
import styles from './portal.module.css'

type Dia = 'hoje' | 'ontem'

/** Dias do mais recente ao mais antigo, mantendo a ordem de chegada dentro de cada dia (o registro novo entra na frente). */
function agrupar(entries: RegistroPublico[]): { dia: string; itens: RegistroPublico[] }[] {
  const mapa = new Map<string, RegistroPublico[]>()
  for (const e of entries) mapa.set(e.dia, [...(mapa.get(e.dia) ?? []), e])
  return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([dia, itens]) => ({ dia, itens }))
}

/** Diário alimentar na página do paciente: registra refeição (horário, descrição, foto opcional) e lista os últimos dias. */
export function DiarioBox({ token, data }: { token: string; data: DiarioPublico }) {
  const [entries, setEntries] = useState<RegistroPublico[]>(data.entries)
  const [dia, setDia] = useState<Dia>('hoje')
  const [refeicao, setRefeicao] = useState<RefeicaoDiario | ''>('')
  const [horario, setHorario] = useState('')
  const [descricao, setDescricao] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [apagando, setApagando] = useState<string | null>(null)
  const [fotoKey, setFotoKey] = useState(0)

  const ontem = somarDias(data.today, -1) ?? data.today
  const rotuloDia = (d: string) => (d === data.today ? 'Hoje' : d === ontem ? 'Ontem' : fmtDateBr(d))

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    if (busy) return
    setOk('')
    if (!refeicao) { setError('Escolha a refeição.'); return }
    if (!descricao.trim()) { setError('Descreva o que você comeu.'); return }
    setBusy(true); setError('')
    const fd = new FormData()
    fd.append('refeicao', refeicao)
    fd.append('horario', horario)
    fd.append('descricao', descricao.trim())
    fd.append('dia', dia === 'hoje' ? data.today : ontem)
    if (foto) {
      try {
        // carregado só quando há foto: a página do paciente não paga o peso da compressão sem precisar
        const { compressImage } = await import('@/lib/teamChat/compress')
        const c = await compressImage(foto)
        fd.append('foto', c.blob, c.mime === 'image/webp' ? 'foto.webp' : 'foto.jpg')
      } catch (e) {
        setBusy(false)
        setError(e instanceof Error && e.message ? e.message : 'Não foi possível preparar a foto. Tente outra imagem.')
        return
      }
    }
    try {
      const res = await fetch(`/api/p/${token}/diario`, { method: 'POST', body: fd })
      const json = (await res.json().catch(() => ({}))) as { error?: string; entry?: RegistroPublico }
      if (!res.ok || !json.entry) { setError(json.error ?? 'Não foi possível salvar. Tente de novo.'); setBusy(false); return }
      setEntries(cur => [json.entry as RegistroPublico, ...cur])
      setDescricao(''); setHorario(''); setFoto(null); setFotoKey(k => k + 1); setOk('Refeição registrada.')
    } catch {
      setError('Sem conexão. Verifique a internet e tente de novo.')
    }
    setBusy(false)
  }

  async function apagar(id: string) {
    if (busy) return
    setBusy(true); setError(''); setOk('')
    try {
      const res = await fetch(`/api/p/${token}/diario`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setError(json.error ?? 'Não foi possível apagar. Tente de novo.'); setBusy(false); return }
      setEntries(cur => cur.filter(e => e.id !== id)); setApagando(null)
    } catch {
      setError('Sem conexão. Verifique a internet e tente de novo.')
    }
    setBusy(false)
  }

  const grupos = agrupar(entries)

  return (
    <div>
      <form onSubmit={enviar} noValidate>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Dia</legend>
          <div className={styles.seg}>
            <button type="button" className={dia === 'hoje' ? styles.segOn : styles.segOff} aria-pressed={dia === 'hoje'} onClick={() => setDia('hoje')}>Hoje</button>
            <button type="button" className={dia === 'ontem' ? styles.segOn : styles.segOff} aria-pressed={dia === 'ontem'} onClick={() => setDia('ontem')}>Ontem</button>
          </div>
        </fieldset>

        <label className={styles.label} htmlFor="di-refeicao">Refeição</label>
        <select id="di-refeicao" className={styles.input} value={refeicao} onChange={e => setRefeicao(e.target.value as RefeicaoDiario | '')}>
          <option value="">Escolha a refeição</option>
          {REFEICOES_DIARIO.map(r => <option key={r.id} value={r.id}>{r.rotulo}</option>)}
        </select>

        <label className={styles.label} htmlFor="di-horario">Horário <span className={styles.muted}>(opcional)</span></label>
        <input id="di-horario" className={styles.input} type="time" value={horario} onChange={e => setHorario(e.target.value)} />

        <label className={styles.label} htmlFor="di-descricao">O que você comeu e bebeu</label>
        <textarea
          id="di-descricao" className={styles.diText} value={descricao} maxLength={LIMITES_DIARIO.descricao}
          placeholder="Ex.: 2 fatias de pão com ovo mexido e 1 copo de suco de laranja" onChange={e => setDescricao(e.target.value)}
        />

        <div className={styles.diPhoto}>
          <label className={styles.btnGhost}>
            {foto ? 'Trocar foto' : 'Adicionar foto (opcional)'}
            <input key={fotoKey} className={styles.diFile} type="file" accept="image/*" onChange={e => setFoto(e.target.files?.[0] ?? null)} />
          </label>
          {foto && (
            <>
              <span className={styles.diFileName}>{foto.name}</span>
              <button type="button" className={styles.btnGhost} onClick={() => { setFoto(null); setFotoKey(k => k + 1) }}>Remover foto</button>
            </>
          )}
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {ok && <p className={styles.tagOk} role="status">{ok}</p>}
        <button type="submit" className={styles.btn} disabled={busy}>{busy ? 'Enviando...' : 'Registrar refeição'}</button>
      </form>

      <h3 className={styles.h3}>Seus registros</h3>
      {grupos.length === 0 ? (
        <p className={styles.muted}>Nenhuma refeição registrada nos últimos dias.</p>
      ) : (
        grupos.map(g => (
          <section key={g.dia} aria-label={rotuloDia(g.dia)}>
            <p className={styles.diDay}>{rotuloDia(g.dia)}</p>
            <ul className={styles.list}>
              {g.itens.map(e => (
                <li key={e.id} className={styles.diEntry}>
                  <div className={styles.diHead}>
                    <strong>{rotuloRefeicao(e.refeicao)}</strong>
                    {e.horario && <span className={styles.muted}>{e.horario}</span>}
                  </div>
                  <p className={styles.pre}>{e.descricao}</p>
                  {e.fotoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.diImg} src={e.fotoUrl} alt={`Foto de ${rotuloRefeicao(e.refeicao)}`} loading="lazy" />
                  )}
                  {e.podeApagar && (apagando === e.id ? (
                    <div className={styles.diConfirm}>
                      <button type="button" className={styles.diDanger} disabled={busy} onClick={() => apagar(e.id)}>Confirmar exclusão</button>
                      <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => setApagando(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <button type="button" className={styles.btnGhost} onClick={() => setApagando(e.id)}>Apagar registro</button>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <p className={styles.legal}>Só é possível registrar refeições de hoje e de ontem. A clínica acompanha o que você registra.</p>
    </div>
  )
}
