'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface MonthlyData { month: string; receita: number; despesa: number }
interface Props { data: MonthlyData[]; goal?: number | null }

const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const CustomTooltip = ({ active, payload, label, goal }: any) => {
  if (!active || !payload?.length) return null
  const value = payload[0].value as number
  const hit = !!goal && goal > 0 && value >= goal
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: hit ? '#10B981' : '#0B9B85', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Receita:</span>
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 800 }}>{fmt(value)}</span>
      </div>
      {hit && <p style={{ fontSize: 10.5, color: '#0B9B85', fontWeight: 700, margin: '4px 0 0' }}>Meta batida ✓</p>}
    </div>
  )
}

// Ponto final (mês atual) em destaque — os demais ficam discretos
const EndpointDot = (props: any) => {
  const { cx, cy, index, dataLength } = props
  const isLast = index === dataLength - 1
  if (isLast) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={8} fill="#4DD9C0" fillOpacity={0.18} />
        <circle cx={cx} cy={cy} r={4.5} fill="#0B9B85" stroke="var(--bg-primary)" strokeWidth={2} />
      </g>
    )
  }
  return <circle cx={cx} cy={cy} r={3} fill="#4DD9C0" stroke="var(--bg-primary)" strokeWidth={1.5} />
}

export default function MetasHistoryChart({ data, goal }: Props) {
  const dataLength = data.length
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="metasLineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4DD9C0" />
            <stop offset="100%" stopColor="#0B9B85" />
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
          tickFormatter={v => v === 0 ? '0' : `${v / 1000}k`}
          tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip content={<CustomTooltip goal={goal} />} cursor={{ stroke: 'var(--border-color)', strokeDasharray: '3 3' }} />
        {!!goal && goal > 0 && (
          <ReferenceLine
            y={goal}
            stroke="#F59E0B"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            label={{ value: `Meta ${fmt(goal)}`, position: 'insideTopRight', fill: '#F59E0B', fontSize: 11, fontWeight: 700 }}
          />
        )}
        <Line
          type="monotone"
          dataKey="receita"
          name="Receita"
          stroke="url(#metasLineGrad)"
          strokeWidth={2.5}
          dot={(props: any) => <EndpointDot key={props.index} {...props} dataLength={dataLength} />}
          activeDot={{ r: 6, fill: '#0B9B85', stroke: 'var(--bg-primary)', strokeWidth: 2 }}
          isAnimationActive
          animationDuration={700}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
