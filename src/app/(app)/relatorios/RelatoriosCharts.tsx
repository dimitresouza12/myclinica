'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface MonthlyFin { month: string; receita: number; despesa: number; lucro: number }
interface NewByMonth { month: string; count: number }

/* ─── Gradiente + animação ─────────────────────────────────────── */
const KEYFRAMES = `
  @keyframes relBarGrow {
    from { transform: scaleY(0); opacity: 0; }
    to   { transform: scaleY(1); opacity: 1; }
  }
`

/* ─── Tooltip custom ───────────────────────────────────────────── */
function FinTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
      borderRadius: 12, padding: '10px 14px', boxShadow: 'var(--shadow-md)', fontFamily: 'inherit',
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, margin: '0 0 6px' }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? '#4DD9C0' : '#F87171', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{p.name}:</span>
          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 800 }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function PatTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
      borderRadius: 12, padding: '10px 14px', boxShadow: 'var(--shadow-md)', fontFamily: 'inherit',
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, margin: '0 0 6px' }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4DD9C0', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{p.name}:</span>
          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 800 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ─── Custom bar shapes ────────────────────────────────────────── */
const mkBar = (gradId: string, delay = 0) => (props: any) => {
  const { x, y, width, height, index } = props
  if (!height || height <= 0) return null
  const r = Math.min(5, width / 3)
  return (
    <path
      d={`M${x},${y+height} L${x},${y+r} Q${x},${y} ${x+r},${y} L${x+width-r},${y} Q${x+width},${y} ${x+width},${y+r} L${x+width},${y+height}Z`}
      fill={`url(#${gradId})`}
      style={{
        transformBox: 'fill-box',
        transformOrigin: '50% 100%',
        animation: `relBarGrow 0.6s cubic-bezier(0.22,1,0.36,1) ${delay + (index ?? 0) * 0.06}s both`,
      } as React.CSSProperties}
    />
  )
}

const BarReceita = mkBar('relRecGrad', 0)
const BarDespesa = mkBar('relDesGrad', 0.03)
const BarPac     = mkBar('relPacGrad', 0)

/* ─── Gráfico Financeiro ───────────────────────────────────────── */
export function FinanceiroBarChart({ data }: { data: MonthlyFin[] }) {
  return (
    <>
      <style>{KEYFRAMES}</style>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barCategoryGap="35%" barGap={4}>
          <defs>
            <linearGradient id="relRecGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#4DD9C0" />
              <stop offset="100%" stopColor="#0B9B85" stopOpacity={0.9} />
            </linearGradient>
            <linearGradient id="relDesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#F87171" />
              <stop offset="100%" stopColor="#DC2626" stopOpacity={0.9} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 0" stroke="var(--border-subtle)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 600 }} axisLine={false} tickLine={false} dy={4} />
          <YAxis tickFormatter={v => v === 0 ? '0' : `${v / 1000}k`} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={36} />
          <Tooltip content={<FinTooltip />} cursor={{ fill: 'var(--bg-secondary)', radius: [8, 8, 0, 0] } as any} />
          <Bar dataKey="receita" name="Receita" shape={<BarReceita />} isAnimationActive={false} />
          <Bar dataKey="despesa" name="Despesa" shape={<BarDespesa />} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        {[['#4DD9C0','Receita'],['#EF4444','Despesa']].map(([c,l]) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:10, height:10, borderRadius:3, background:c }} />
            <span style={{ fontSize:11, color:'var(--text-secondary)', fontWeight:600 }}>{l}</span>
          </div>
        ))}
      </div>
    </>
  )
}

/* ─── Gráfico Pacientes ────────────────────────────────────────── */
export function PacientesBarChart({ data }: { data: NewByMonth[] }) {
  return (
    <>
      <style>{KEYFRAMES}</style>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barCategoryGap="45%">
          <defs>
            <linearGradient id="relPacGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#4DD9C0" />
              <stop offset="100%" stopColor="#0B9B85" stopOpacity={0.9} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 0" stroke="var(--border-subtle)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 600 }} axisLine={false} tickLine={false} dy={4} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={28} />
          <Tooltip content={<PatTooltip />} cursor={{ fill: 'var(--bg-secondary)', radius: [8, 8, 0, 0] } as any} />
          <Bar dataKey="count" name="Novos pacientes" shape={<BarPac />} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:10, height:10, borderRadius:3, background:'#4DD9C0' }} />
          <span style={{ fontSize:11, color:'var(--text-secondary)', fontWeight:600 }}>Novos pacientes</span>
        </div>
      </div>
    </>
  )
}
