'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface Props { data: { category: string; value: number }[] }

const COLORS = ['#4DD9C0', '#0EA5E9', '#8B5CF6', '#F59E0B', '#EF4444', '#10B981', '#EC4899', '#64748B']

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div style={{
      background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 12,
      padding: '8px 12px', boxShadow: 'var(--shadow-md)', fontFamily: 'inherit',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>{p.payload.category}: {formatCurrency(p.value)}</span>
    </div>
  )
}

export default function RevenueByCategoryChart({ data }: Props) {
  if (data.length === 0) {
    return <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>Sem receitas com procedimento categorizado este mês.</p>
  }
  const top = data.slice(0, 8)
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, top.length * 38)}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 0" stroke="var(--border-subtle)" horizontal={false} />
        <XAxis type="number" tickFormatter={v => v.toLocaleString('pt-BR')} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 600 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-secondary)' }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
          {top.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
