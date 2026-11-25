'use client'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import styles from './admin.module.css'

const PLAN_COLORS: Record<string, string> = {
  basico:  'var(--brand-primary)',
  pro:     'var(--st-info)',
  premium: 'var(--st-wait)',
  trial:   'var(--st-idle)',
}

interface PlanData { name: string; value: number }
interface MonthData { month: string; clinicas: number }

interface Props {
  planData: PlanData[]
  monthData: MonthData[]
}

export default function AdminCharts({ planData, monthData }: Props) {
  return (
    <div className={styles.chartsGrid}>
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>Distribuição de planos</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={planData} dataKey="value" nameKey="name" cx="50%" cy="50%"
              outerRadius={80} label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
              labelLine={false}
            >
              {planData.map((entry) => (
                <Cell key={entry.name} fill={PLAN_COLORS[entry.name] ?? 'var(--st-idle)'} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)' }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>Novas clínicas (6 meses)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)' }}
            />
            <Bar dataKey="clinicas" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
