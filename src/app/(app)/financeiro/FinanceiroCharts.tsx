'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import styles from './financeiro.module.css'

interface MonthlyData { month: string; receita: number; despesa: number }
interface CategoryData { name: string; value: number }

const TEAL_PALETTE = ['#4DD9C0', '#0B9B85', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6']

const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

/* ─── Custom bar shapes with CSS grow animation ─── */
const RoundedBarReceita = (props: any) => {
  const { x, y, width, height, index } = props
  if (!height || height <= 0) return null
  const r = Math.min(5, width / 3)
  return (
    <path
      d={`M${x},${y+height} L${x},${y+r} Q${x},${y} ${x+r},${y} L${x+width-r},${y} Q${x+width},${y} ${x+width},${y+r} L${x+width},${y+height}Z`}
      fill="url(#recGrad)"
      style={{
        transformBox: 'fill-box',
        transformOrigin: '50% 100%',
        animation: `barGrow 0.6s cubic-bezier(0.22,1,0.36,1) ${(index ?? 0) * 0.06}s both`,
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
      fill="url(#desGrad)"
      style={{
        transformBox: 'fill-box',
        transformOrigin: '50% 100%',
        animation: `barGrow 0.6s cubic-bezier(0.22,1,0.36,1) ${0.03 + (index ?? 0) * 0.06}s both`,
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

export default function FinanceiroCharts({
  monthlyData,
  categoryData,
}: {
  monthlyData: MonthlyData[]
  categoryData: CategoryData[]
}) {
  return (
    <div className={styles.charts}>
      <style>{`
        @keyframes barGrow {
          from { transform: scaleY(0); opacity: 0; }
          to   { transform: scaleY(1); opacity: 1; }
        }
      `}</style>

      {/* ── Monthly Bar Chart ── */}
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>Receitas vs Despesas — últimos 6 meses</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={monthlyData}
            margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
            barCategoryGap="35%"
            barGap={4}
          >
            <defs>
              <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#4DD9C0" />
                <stop offset="100%" stopColor="#0B9B85" stopOpacity={0.9} />
              </linearGradient>
              <linearGradient id="desGrad" x1="0" y1="0" x2="0" y2="1">
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
              tickFormatter={v => v === 0 ? '0' : `${v / 1000}k`}
              tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'var(--bg-secondary)', radius: [8, 8, 0, 0] } as any}
            />
            <Bar dataKey="receita" name="Receita" shape={<RoundedBarReceita />} isAnimationActive={false} />
            <Bar dataKey="despesa" name="Despesa" shape={<RoundedBarDespesa />} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: '#4DD9C0' }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Receita</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: '#EF4444' }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Despesa</span>
          </div>
        </div>
      </div>

      {/* ── Category Donut ── */}
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>Receitas por categoria</h3>
        {categoryData.length === 0 ? (
          <div className={styles.chartEmpty}>Sem dados para o período</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <defs>
                  {TEAL_PALETTE.map((c, i) => (
                    <linearGradient key={i} id={`catGrad${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%"   stopColor={c} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.72} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={categoryData}
                  cx="50%" cy="50%"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={3}
                  dataKey="value"
                  animationBegin={100}
                  animationDuration={900}
                  animationEasing="ease-out"
                >
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={`url(#catGrad${i % TEAL_PALETTE.length})`} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any) => [fmt(Number(v) || 0), '']}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 12,
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    boxShadow: 'var(--shadow-md)',
                    fontFamily: 'inherit',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
              {categoryData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: TEAL_PALETTE[i % TEAL_PALETTE.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
