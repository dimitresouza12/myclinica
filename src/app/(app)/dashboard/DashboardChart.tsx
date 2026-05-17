'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface MonthlyData { month: string; receita: number; despesa: number }

const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function DashboardChart({ data }: { data: MonthlyData[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={80} />
        <Tooltip formatter={(v) => typeof v === 'number' ? fmt(v) : String(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }} />
        <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Bar dataKey="receita" name="Receita" fill="#10B981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="despesa" name="Despesa" fill="#EF4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
