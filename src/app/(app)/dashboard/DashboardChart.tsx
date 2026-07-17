'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface MonthlyData { month: string; receita: number; despesa: number }
interface Props { data: MonthlyData[]; goal?: number | null }

const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const RoundedBarReceita = (props: any) => {
  const { x, y, width, height, index } = props
  if (!height || height <= 0) return null
  const r = Math.min(5, width / 3)
  return (
    <path
      d={`M${x},${y+height} L${x},${y+r} Q${x},${y} ${x+r},${y} L${x+width-r},${y} Q${x+width},${y} ${x+width},${y+r} L${x+width},${y+height}Z`}
      fill="url(#dashRecGrad)"
      style={{
        transformBox: 'fill-box',
        transformOrigin: '50% 100%',
        animation: `dashBarGrow 0.6s cubic-bezier(0.22,1,0.36,1) ${(index ?? 0) * 0.06}s both`,
      } as React.CSSProperties}
    />
  )
}

const RoundedBarDespesa = (props: any) => {
  const { x, y, width, height, index } = props
  if (!height || height <= 0) return null
  const r = Math.min(5, width / 3)
  return (
    <path
      d={`M${x},${y+height} L${x},${y+r} Q${x},${y} ${x+r},${y} L${x+width-r},${y} Q${x+width},${y} ${x+width},${y+r} L${x+width},${y+height}Z`}
      fill="url(#dashDesGrad)"
      style={{
        transformBox: 'fill-box',
        transformOrigin: '50% 100%',
        animation: `dashBarGrow 0.6s cubic-bezier(0.22,1,0.36,1) ${0.03 + (index ?? 0) * 0.06}s both`,
      } as React.CSSProperties}
    />
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: 'var(--shadow-md)',
      fontFamily: 'inherit',
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, margin: '0 0 6px' }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? '#4DD9C0' : '#EF4444', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{p.name}:</span>
          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 800 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardChart({ data, goal }: Props) {
  return (
    <>
      <style>{`
        @keyframes dashBarGrow {
          from { transform: scaleY(0); opacity: 0; }
          to   { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
          barCategoryGap="35%"
          barGap={4}
        >
          <defs>
            <linearGradient id="dashRecGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#4DD9C0" />
              <stop offset="100%" stopColor="#0B9B85" stopOpacity={0.9} />
            </linearGradient>
            <linearGradient id="dashDesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#F87171" />
              <stop offset="100%" stopColor="#DC2626" stopOpacity={0.9} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 0" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            dy={4}
          />
          <YAxis
            tickFormatter={v => v.toLocaleString('pt-BR')}
            tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'var(--bg-secondary)', radius: [8, 8, 0, 0] } as any}
          />
          <Bar dataKey="receita" name="Receita" shape={<RoundedBarReceita />} isAnimationActive={false} />
          <Bar dataKey="despesa" name="Despesa" shape={<RoundedBarDespesa />} isAnimationActive={false} />
          {!!goal && goal > 0 && (
            <ReferenceLine
              y={goal}
              stroke="#F59E0B"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              label={{ value: `Meta ${fmt(goal)}`, position: 'insideTopRight', fill: '#F59E0B', fontSize: 11, fontWeight: 700 }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>

      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: '#4DD9C0' }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Receita</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: '#EF4444' }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Despesa</span>
        </div>
        {!!goal && goal > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#F59E0B' }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Meta de faturamento</span>
          </div>
        )}
      </div>
    </>
  )
}
