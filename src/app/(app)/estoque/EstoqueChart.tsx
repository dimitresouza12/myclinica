'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface MonthlyMovement { month: string; entrada: number; saida: number }

const RoundedBarEntrada = (props: any) => {
  const { x, y, width, height, index } = props
  if (!height || height <= 0) return null
  const r = Math.min(5, width / 3)
  return (
    <path
      d={`M${x},${y+height} L${x},${y+r} Q${x},${y} ${x+r},${y} L${x+width-r},${y} Q${x+width},${y} ${x+width},${y+r} L${x+width},${y+height}Z`}
      fill="url(#estEntGrad)"
      style={{
        transformBox: 'fill-box',
        transformOrigin: '50% 100%',
        animation: `estBarGrow 0.6s cubic-bezier(0.22,1,0.36,1) ${(index ?? 0) * 0.06}s both`,
      } as React.CSSProperties}
    />
  )
}

const RoundedBarSaida = (props: any) => {
  const { x, y, width, height, index } = props
  if (!height || height <= 0) return null
  const r = Math.min(5, width / 3)
  return (
    <path
      d={`M${x},${y+height} L${x},${y+r} Q${x},${y} ${x+r},${y} L${x+width-r},${y} Q${x+width},${y} ${x+width},${y+r} L${x+width},${y+height}Z`}
      fill="url(#estSaiGrad)"
      style={{
        transformBox: 'fill-box',
        transformOrigin: '50% 100%',
        animation: `estBarGrow 0.6s cubic-bezier(0.22,1,0.36,1) ${0.03 + (index ?? 0) * 0.06}s both`,
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
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? '#4DD9C0' : '#F87171', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{p.name}:</span>
          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 800 }}>{p.value} un.</span>
        </div>
      ))}
    </div>
  )
}

export default function EstoqueChart({ data }: { data: MonthlyMovement[] }) {
  const hasData = data.some(d => d.entrada > 0 || d.saida > 0)
  if (!hasData) return null

  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 16,
      padding: '1.5rem',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <style>{`
        @keyframes estBarGrow {
          from { transform: scaleY(0); opacity: 0; }
          to   { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
      <p style={{ fontSize: '0.85rem', fontWeight: 650, color: 'var(--text-primary)', margin: '0 0 1rem' }}>
        Movimentações — últimos 6 meses
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
          barCategoryGap="35%"
          barGap={4}
        >
          <defs>
            <linearGradient id="estEntGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#4DD9C0" />
              <stop offset="100%" stopColor="#0B9B85" stopOpacity={0.9} />
            </linearGradient>
            <linearGradient id="estSaiGrad" x1="0" y1="0" x2="0" y2="1">
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
            allowDecimals={false}
            tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'var(--bg-secondary)', radius: [8, 8, 0, 0] } as any}
          />
          <Bar dataKey="entrada" name="Entrada" shape={<RoundedBarEntrada />} isAnimationActive={false} />
          <Bar dataKey="saida"   name="Saída"   shape={<RoundedBarSaida />}   isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>

      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: '#4DD9C0' }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Entradas</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: '#EF4444' }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Saídas</span>
        </div>
      </div>
    </div>
  )
}
